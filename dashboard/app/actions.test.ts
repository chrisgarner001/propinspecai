import { afterAll, beforeAll, describe, expect, it, vi, afterEach } from 'vitest'
import { getSql } from '@/lib/db'
import { duplicateLineItem, updateLineItemSchedule, syncInspectionVideos, processNextInspectionVideo, retryInspectionVideo } from './actions'

// revalidatePath relies on Next's request-scoped static-generation store,
// which doesn't exist when actions are called directly from a test runner
// (only from a real request). Irrelevant to what these tests verify (DB
// state), so it's mocked out rather than worked around in production code.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// Every action under test now calls requireSessionOrThrow()/requireAdminOrThrow()
// (docs/designs/propinspec-authentication.md) -- both read next/headers'
// cookies(), which needs a real request context these direct calls don't
// have, same reasoning as the next/cache mock above. Mocked to a fixed
// Admin session so these tests verify the DB state machine they're actually
// about, not the auth layer (auth has its own tests).
vi.mock('@/lib/dal', () => {
  const fakeSession = { userId: 'vitest-admin', email: 'vitest@example.com', role: 'Admin' }
  return {
    verifySession: vi.fn(async () => fakeSession),
    requireSession: vi.fn(async () => fakeSession),
    requireAdmin: vi.fn(async () => fakeSession),
    requireSessionOrThrow: vi.fn(async () => fakeSession),
    requireAdminOrThrow: vi.fn(async () => fakeSession),
  }
})

// Drive/Gemini calls are mocked -- these tests verify the DB state machine
// (pending -> processing -> done/failed, line items inserted or not), not
// real network calls to Google's APIs. parseFolderIdFromUrl is real (pure
// regex, no reason to fake it).
const mockDownloadDriveFile = vi.fn()
const mockListVideosInFolder = vi.fn()
const mockExtractLineItemsFromVideo = vi.fn()
vi.mock('@/lib/google', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/google')>()
  return {
    ...actual,
    downloadDriveFile: (...args: unknown[]) => mockDownloadDriveFile(...args),
    listVideosInFolder: (...args: unknown[]) => mockListVideosInFolder(...args),
  }
})
vi.mock('@/lib/gemini', () => ({
  extractLineItemsFromVideo: (...args: unknown[]) => mockExtractLineItemsFromVideo(...args),
}))

// Still extraction shells out to a real ffmpeg binary against the video on
// disk -- irrelevant to the DB state-machine behavior under test, and the
// fake buffers these tests write aren't valid video, so it's mocked out
// rather than left to fail (loudly, to stderr) on every run.
vi.mock('@/lib/stills', () => ({
  parseTimestampSeconds: () => null,
  extractFrame: vi.fn(),
  uploadStill: vi.fn(),
}))

// Integration tests against the real dev Postgres (DATABASE_URL from
// .env.local, loaded by vitest.setup.ts) -- matches this project's existing
// practice of verifying against real data rather than mocking the DB.
// Creates its own throwaway inspection + line items, cleans up afterward.

const sql = getSql()

let inspectionId: string

async function makeLineItem(overrides: Partial<{ room_area: string; item: string }> = {}) {
  const [row] = await sql`
    insert into line_items (inspection_id, room_area, item, condition, is_manual_addition)
    values (
      ${inspectionId}, ${overrides.room_area ?? 'Test Room'}, ${overrides.item ?? 'Test Item'},
      'Good', true
    )
    returning id
  `
  return row.id as string
}

beforeAll(async () => {
  const [row] = await sql`
    insert into inspections (job_number, property_address, inspection_date, inspector_name)
    values ('VITEST', 'Vitest Test Property', '2026-01-01', 'Vitest')
    returning id
  `
  inspectionId = row.id as string
})

afterAll(async () => {
  await sql`delete from inspections where id = ${inspectionId}`
  await sql.end()
})

describe('updateLineItemSchedule', () => {
  it('updates status, dates, and dependency on the happy path', async () => {
    const a = await makeLineItem({ item: 'A' })
    const b = await makeLineItem({ item: 'B' })

    const result = await updateLineItemSchedule({
      id: b,
      inspectionId,
      status: 'scheduled',
      scheduledStart: '2026-02-01',
      scheduledEnd: '2026-02-03',
      blocksLineItemId: a,
    })

    expect(result.error).toBeUndefined()
    const [row] = await sql`select * from line_items where id = ${b}`
    expect(row.status).toBe('scheduled')
    // postgres.js returns `date` columns as JS Dates in local time; compare
    // via UTC parts so this doesn't depend on the machine's timezone.
    expect((row.scheduled_start as Date).toISOString().slice(0, 10)).toBe('2026-02-01')
    expect((row.scheduled_end as Date).toISOString().slice(0, 10)).toBe('2026-02-03')
    expect(row.blocks_line_item_id).toBe(a)
  })

  it('rejects a line item blocking itself, with a clear message, before hitting the DB', async () => {
    const a = await makeLineItem({ item: 'Self-ref' })

    const result = await updateLineItemSchedule({
      id: a,
      inspectionId,
      status: 'not_started',
      scheduledStart: null,
      scheduledEnd: null,
      blocksLineItemId: a,
    })

    expect(result.error).toMatch(/cannot block itself/i)
    const [row] = await sql`select blocks_line_item_id from line_items where id = ${a}`
    expect(row.blocks_line_item_id).toBeNull()
  })

  it('rejects a dependency that would create a cycle', async () => {
    const a = await makeLineItem({ item: 'Cycle A' })
    const b = await makeLineItem({ item: 'Cycle B' })

    // A is blocked by B (A must wait for B).
    await updateLineItemSchedule({
      id: a,
      inspectionId,
      status: 'not_started',
      scheduledStart: null,
      scheduledEnd: null,
      blocksLineItemId: b,
    })

    // Now try to make B blocked by A -- would create A -> B -> A.
    const result = await updateLineItemSchedule({
      id: b,
      inspectionId,
      status: 'not_started',
      scheduledStart: null,
      scheduledEnd: null,
      blocksLineItemId: a,
    })

    expect(result.error).toMatch(/cycle/i)
    const [row] = await sql`select blocks_line_item_id from line_items where id = ${b}`
    expect(row.blocks_line_item_id).toBeNull()
  })
})

describe('video processing pipeline', () => {
  afterEach(() => {
    mockDownloadDriveFile.mockReset()
    mockListVideosInFolder.mockReset()
    mockExtractLineItemsFromVideo.mockReset()
  })

  it('syncInspectionVideos errors clearly when no Drive folder is linked', async () => {
    const [row] = await sql`
      insert into inspections (job_number, property_address, inspection_date, inspector_name)
      values ('VITEST', 'Vitest No Folder', '2026-01-01', 'Vitest')
      returning id
    `
    const result = await syncInspectionVideos(row.id as string)
    expect(result.error).toMatch(/no google drive video folder/i)
    await sql`delete from inspections where id = ${row.id}`
  })

  it('syncInspectionVideos populates inspection_videos from the Drive folder listing', async () => {
    const [row] = await sql`
      insert into inspections (job_number, property_address, inspection_date, inspector_name, source_video_drive_folder_url)
      values ('VITEST', 'Vitest Sync Test', '2026-01-01', 'Vitest', 'https://drive.google.com/drive/folders/abc123')
      returning id
    `
    const withFolderId = row.id as string
    mockListVideosInFolder.mockResolvedValue([
      { id: 'file-1', name: 'clip1.mp4', mimeType: 'video/mp4' },
      { id: 'file-2', name: 'clip2.mp4', mimeType: 'video/mp4' },
    ])

    const result = await syncInspectionVideos(withFolderId)
    expect(result.error).toBeUndefined()
    expect(result.videos).toHaveLength(2)
    expect(result.videos?.every((v) => v.status === 'pending')).toBe(true)

    // Calling again shouldn't duplicate rows (on conflict do nothing).
    const second = await syncInspectionVideos(withFolderId)
    expect(second.videos).toHaveLength(2)

    await sql`delete from inspections where id = ${withFolderId}`
  })

  it('processNextInspectionVideo inserts extracted line items and marks the video done', async () => {
    const [video] = await sql`
      insert into inspection_videos (inspection_id, drive_file_id, filename)
      values (${inspectionId}, 'file-happy', 'happy.mp4')
      returning id
    `
    mockDownloadDriveFile.mockResolvedValue(Buffer.from('fake video bytes'))
    mockExtractLineItemsFromVideo.mockResolvedValue([
      {
        room_area: 'Kitchen',
        item: 'Cabinet hardware',
        condition: 'Fair',
        observed_evidence: 'Loose handle on lower cabinet',
        recommended_action: 'Tighten hardware',
        trade_category: 'general maintenance',
        assigned_to: 'GPM Staff',
        priority: 'Routine turnover',
        source_timestamp: '0:42',
      },
    ])

    const result = await processNextInspectionVideo(inspectionId)
    expect(result.done).toBe(true)
    const row = result.videos.find((v) => v.id === video.id)
    expect(row?.status).toBe('done')
    expect(row?.line_items_created).toBe(1)

    const [inserted] = await sql`select * from line_items where inspection_id = ${inspectionId} and source_video_file = 'happy.mp4'`
    expect(inserted.room_area).toBe('Kitchen')
    expect(inserted.assigned_to).toBe('GPM Staff')
    expect(inserted.is_manual_addition).toBe(false)
  })

  it('marks the video failed with the real error message on extraction failure, and retry lets it run again', async () => {
    const [video] = await sql`
      insert into inspection_videos (inspection_id, drive_file_id, filename)
      values (${inspectionId}, 'file-sad', 'sad.mp4')
      returning id
    `
    mockDownloadDriveFile.mockResolvedValue(Buffer.from('fake video bytes'))
    mockExtractLineItemsFromVideo.mockRejectedValue(new Error('Gemini returned an empty response.'))

    const result = await processNextInspectionVideo(inspectionId)
    const row = result.videos.find((v) => v.id === video.id)
    expect(row?.status).toBe('failed')
    expect(row?.error_message).toMatch(/empty response/i)

    const noItems = await sql`select count(*) from line_items where source_video_file = 'sad.mp4'`
    expect(Number(noItems[0].count)).toBe(0)

    // Retry resets it to pending; next process call picks it up again.
    mockExtractLineItemsFromVideo.mockResolvedValue([])
    const retried = await retryInspectionVideo(video.id as string, inspectionId)
    expect(retried.videos.find((v) => v.id === video.id)?.status).toBe('pending')

    const reprocessed = await processNextInspectionVideo(inspectionId)
    expect(reprocessed.videos.find((v) => v.id === video.id)?.status).toBe('done')
  })
})

describe('duplicateLineItem schedule reset', () => {
  it('does not carry the original schedule/status/dependency forward', async () => {
    const predecessor = await makeLineItem({ item: 'Predecessor' })
    const original = await makeLineItem({ item: 'Has a schedule' })

    await updateLineItemSchedule({
      id: original,
      inspectionId,
      status: 'in_progress',
      scheduledStart: '2026-03-01',
      scheduledEnd: '2026-03-05',
      blocksLineItemId: predecessor,
    })

    await duplicateLineItem(original, inspectionId, new FormData())

    const [dup] = await sql`
      select * from line_items
      where inspection_id = ${inspectionId} and item = 'Has a schedule' and id != ${original}
    `
    expect(dup).toBeDefined()
    expect(dup.status).toBe('not_started')
    expect(dup.scheduled_start).toBeNull()
    expect(dup.scheduled_end).toBeNull()
    expect(dup.blocks_line_item_id).toBeNull()
  })
})
