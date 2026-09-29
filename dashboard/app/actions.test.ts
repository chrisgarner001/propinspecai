import { afterAll, beforeAll, describe, expect, it, vi, afterEach } from 'vitest'
import { getSql } from '@/lib/db'
import { access, writeFile } from 'node:fs/promises'
import { duplicateLineItem, updateLineItemSchedule, syncInspectionVideos, processNextInspectionVideo, retryInspectionVideo, createUser } from './actions'

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

// lib/embeddings.ts imports 'server-only', which fails to resolve under
// Vitest (it's a webpack-alias marker package, not a real module) -- mocked
// out like @/lib/dal above. No test here
// exercises suggestHistoricalCost/applyHistoricalCostSuggestion (the only
// callers), this just lets app/actions.ts's module-level import resolve.
vi.mock('@/lib/embeddings', () => ({
  embedText: vi.fn(async () => null),
  toVectorLiteral: vi.fn((v) => `[${v.join(',')}]`),
}))

// lib/mail.ts also imports 'server-only' (same reason as @/lib/dal and
// @/lib/embeddings above) and would otherwise send a real email via Resend.
// createUser's own tests control this mock's resolved/rejected value directly.
const mockSendTempPasswordEmail = vi.fn(async (_email: string, _tempPassword: string) => {})
vi.mock('@/lib/mail', () => ({
  sendTempPasswordEmail: (...args: [string, string]) => mockSendTempPasswordEmail(...args),
}))

// Drive/Gemini calls are mocked -- these tests verify the DB state machine
// (pending -> processing -> done/failed, line items inserted or not), not
// real network calls to Google's APIs. parseFolderIdFromUrl is real (pure
// regex, no reason to fake it).
//
// mockDownloadDriveFileToPath actually writes a real file to the given path
// by default (large-video plan-eng-review, 2026-09-24, D5's regression
// contract) -- proves processNextInspectionVideo passes a real, existing
// file path to extractLineItemsFromVideo/getVideoCreationTime/extractFrame,
// not a Buffer, not a path to nothing.
const mockDownloadDriveFileToPath = vi.fn(async (_fileId: string, destPath: string) => {
  await writeFile(destPath, 'fake video bytes, streamed not buffered')
})
const mockListVideosInFolder = vi.fn()
const mockExtractLineItemsFromVideo = vi.fn()
vi.mock('@/lib/google', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/google')>()
  return {
    ...actual,
    downloadDriveFileToPath: (...args: [string, string]) => mockDownloadDriveFileToPath(...args),
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
  getVideoCreationTime: vi.fn(async () => null),
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
    mockDownloadDriveFileToPath.mockClear()
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
      { id: 'file-1', name: 'clip1.mp4', mimeType: 'video/mp4', size: '1000000' },
      { id: 'file-2', name: 'clip2.mp4', mimeType: 'video/mp4', size: '2000000' },
    ])

    const result = await syncInspectionVideos(withFolderId)
    expect(result.error).toBeUndefined()
    expect(result.videos).toHaveLength(2)
    expect(result.videos?.every((v) => v.status === 'pending')).toBe(true)

    // size_bytes (plan-eng-review, 2026-09-24) is captured at sync time from
    // Drive's own reported size, so the pre-flight check has real data.
    const [synced] = await sql`select size_bytes from inspection_videos where drive_file_id = 'file-1'`
    expect(Number(synced.size_bytes)).toBe(1000000)

    // Calling again shouldn't duplicate rows (on conflict do nothing).
    const second = await syncInspectionVideos(withFolderId)
    expect(second.videos).toHaveLength(2)

    await sql`delete from inspections where id = ${withFolderId}`
  })

  it('syncInspectionVideos gate check: marks an oversized video failed immediately, not lazily', async () => {
    const [row] = await sql`
      insert into inspections (job_number, property_address, inspection_date, inspector_name, source_video_drive_folder_url)
      values ('VITEST', 'Vitest Gate Check', '2026-01-01', 'Vitest', 'https://drive.google.com/drive/folders/abc123')
      returning id
    `
    mockListVideosInFolder.mockResolvedValue([
      { id: 'file-small', name: 'small.mp4', mimeType: 'video/mp4', size: '1000000' },
      { id: 'file-big', name: 'big.mp4', mimeType: 'video/mp4', size: String(600 * 1024 * 1024) },
    ])

    const result = await syncInspectionVideos(row.id as string)
    const big = result.videos?.find((v) => v.filename === 'big.mp4')
    const small = result.videos?.find((v) => v.filename === 'small.mp4')

    // Failed immediately, in this same call -- not left 'pending' for
    // processNextInspectionVideo's loop to discover later.
    expect(big?.status).toBe('failed')
    expect(big?.error_message).toMatch(/too large/i)
    expect(big?.error_message).toContain('~480MB')
    expect(mockDownloadDriveFileToPath).not.toHaveBeenCalled()

    // The properly-sized video is untouched by the gate check.
    expect(small?.status).toBe('pending')

    await sql`delete from inspections where id = ${row.id}`
  })

  it('syncInspectionVideos gate check: leaves a null-size row pending, not failed', async () => {
    const [row] = await sql`
      insert into inspections (job_number, property_address, inspection_date, inspector_name, source_video_drive_folder_url)
      values ('VITEST', 'Vitest Gate Check Null Size', '2026-01-01', 'Vitest', 'https://drive.google.com/drive/folders/abc123')
      returning id
    `
    // Drive's own `size` field can be absent -- size_bytes then stays SQL
    // NULL, and NULL > threshold is never true, so the gate check must not
    // treat a null-size row as "fine" OR reject it; it stays pending for the
    // existing lazy per-video null-size guard to handle on its own turn.
    mockListVideosInFolder.mockResolvedValue([{ id: 'file-unknown', name: 'unknown.mp4', mimeType: 'video/mp4' }])

    const result = await syncInspectionVideos(row.id as string)
    const video = result.videos?.find((v) => v.filename === 'unknown.mp4')
    expect(video?.status).toBe('pending')
    expect(video?.error_message).toBeNull()

    await sql`delete from inspections where id = ${row.id}`
  })

  it('syncInspectionVideos gate check: never touches a different inspection\'s rows', async () => {
    const [inspectionA] = await sql`
      insert into inspections (job_number, property_address, inspection_date, inspector_name, source_video_drive_folder_url)
      values ('VITEST', 'Vitest Gate Check A', '2026-01-01', 'Vitest', 'https://drive.google.com/drive/folders/abc123')
      returning id
    `
    const [inspectionB] = await sql`
      insert into inspections (job_number, property_address, inspection_date, inspector_name)
      values ('VITEST', 'Vitest Gate Check B', '2026-01-01', 'Vitest')
      returning id
    `
    // Inspection B already has an oversized pending row from some earlier
    // sync -- created directly, not via syncInspectionVideos, so this test
    // doesn't depend on B having its own linked folder.
    const [rowB] = await sql`
      insert into inspection_videos (inspection_id, drive_file_id, filename, size_bytes)
      values (${inspectionB.id}, 'file-b-big', 'b-big.mp4', ${600 * 1024 * 1024})
      returning id
    `

    mockListVideosInFolder.mockResolvedValue([{ id: 'file-a-small', name: 'a-small.mp4', mimeType: 'video/mp4', size: '1000000' }])
    await syncInspectionVideos(inspectionA.id as string)

    const [stillPendingB] = await sql`select status, error_message from inspection_videos where id = ${rowB.id}`
    expect(stillPendingB.status).toBe('pending')
    expect(stillPendingB.error_message).toBeNull()

    await sql`delete from inspection_videos where inspection_id = ${inspectionB.id}`
    await sql`delete from inspections where id = ${inspectionA.id}`
    await sql`delete from inspections where id = ${inspectionB.id}`
  })

  it('processNextInspectionVideo inserts extracted line items and marks the video done', async () => {
    const [video] = await sql`
      insert into inspection_videos (inspection_id, drive_file_id, filename, size_bytes)
      values (${inspectionId}, 'file-happy', 'happy.mp4', 387322733)
      returning id
    `
    // D5's regression contract: prove extractLineItemsFromVideo received a
    // real, existing file path (the new streaming-to-path plumbing), not a
    // Buffer and not a path to nothing -- fs.access throws if it's wrong.
    let extractLineItemsCalledWithPath: string | undefined
    mockExtractLineItemsFromVideo.mockImplementation(async (videoPath: string) => {
      extractLineItemsCalledWithPath = videoPath
      await access(videoPath)
      return [
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
      ]
    })

    const result = await processNextInspectionVideo(inspectionId)
    expect(result.done).toBe(true)
    const row = result.videos.find((v) => v.id === video.id)
    expect(row?.status).toBe('done')
    expect(row?.line_items_created).toBe(1)

    expect(typeof extractLineItemsCalledWithPath).toBe('string')
    expect(mockDownloadDriveFileToPath).toHaveBeenCalledWith('file-happy', extractLineItemsCalledWithPath)

    const [inserted] = await sql`select * from line_items where inspection_id = ${inspectionId} and source_video_file = 'happy.mp4'`
    expect(inserted.room_area).toBe('Kitchen')
    expect(inserted.assigned_to).toBe('GPM Staff')
    expect(inserted.is_manual_addition).toBe(false)
  })

  it('rejects a video over the ~480MB threshold immediately, without attempting a download', async () => {
    const [video] = await sql`
      insert into inspection_videos (inspection_id, drive_file_id, filename, size_bytes)
      values (${inspectionId}, 'file-toobig', 'toobig.mov', 2087247388)
      returning id
    `

    const result = await processNextInspectionVideo(inspectionId)
    const row = result.videos.find((v) => v.id === video.id)
    expect(row?.status).toBe('failed')
    expect(row?.error_message).toMatch(/too large/i)
    expect(row?.error_message).toContain('1991MB') // 2087247388 bytes, the real IMG_0014.MOV size
    expect(row?.error_message).toContain('~480MB')
    expect(mockDownloadDriveFileToPath).not.toHaveBeenCalled()
    expect(mockExtractLineItemsFromVideo).not.toHaveBeenCalled()
  })

  it('accepts a video just under the new ~480MB threshold that would have been rejected at the old ~400MB one', async () => {
    // 450MB -- real regression coverage for the actual boundary move
    // (plan-eng-review, 2026-09-28): over the old 400MB limit, under the new
    // 480MB one.
    mockExtractLineItemsFromVideo.mockResolvedValue([])
    const [video] = await sql`
      insert into inspection_videos (inspection_id, drive_file_id, filename, size_bytes)
      values (${inspectionId}, 'file-450mb', '450mb.mp4', 471859200)
      returning id
    `

    const result = await processNextInspectionVideo(inspectionId)
    const row = result.videos.find((v) => v.id === video.id)
    expect(row?.status).toBe('done')
    expect(mockDownloadDriveFileToPath).toHaveBeenCalledWith('file-450mb', expect.any(String))
  })

  it('fails closed with an actionable message when size_bytes is unknown (not yet backfilled)', async () => {
    const [video] = await sql`
      insert into inspection_videos (inspection_id, drive_file_id, filename)
      values (${inspectionId}, 'file-unknown-size', 'unknown.mp4')
      returning id
    `

    const result = await processNextInspectionVideo(inspectionId)
    const row = result.videos.find((v) => v.id === video.id)
    expect(row?.status).toBe('failed')
    expect(row?.error_message).toMatch(/size is unknown/i)
    expect(mockDownloadDriveFileToPath).not.toHaveBeenCalled()
    expect(mockExtractLineItemsFromVideo).not.toHaveBeenCalled()
  })

  it('marks the video failed with the real error message on extraction failure, and retry lets it run again', async () => {
    const [video] = await sql`
      insert into inspection_videos (inspection_id, drive_file_id, filename, size_bytes)
      values (${inspectionId}, 'file-sad', 'sad.mp4', 387322733)
      returning id
    `
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

  // Regression test for the 11436 Syracuse investigation (2026-09-23): a
  // Vercel function killed on timeout for a large video dies mid-request,
  // so processNextInspectionVideo's own catch block never runs -- the row
  // is left stuck at 'processing' forever, same as if it were simulated by
  // inserting a row directly at that status without ever calling process.
  it('retry also recovers a video stuck at processing (e.g. a killed serverless function)', async () => {
    const [stuck] = await sql`
      insert into inspection_videos (inspection_id, drive_file_id, filename, status, size_bytes)
      values (${inspectionId}, 'file-stuck', 'stuck.mp4', 'processing', 387322733)
      returning id
    `

    mockExtractLineItemsFromVideo.mockResolvedValue([])
    const retried = await retryInspectionVideo(stuck.id as string, inspectionId)
    expect(retried.videos.find((v) => v.id === stuck.id)?.status).toBe('pending')

    const reprocessed = await processNextInspectionVideo(inspectionId)
    expect(reprocessed.videos.find((v) => v.id === stuck.id)?.status).toBe('done')
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

describe('createUser', () => {
  afterEach(async () => {
    mockSendTempPasswordEmail.mockReset()
    mockSendTempPasswordEmail.mockImplementation(async () => {})
    await sql`delete from users where email like 'vitest-createuser-%'`
  })

  it('sends the temp password email and creates the account with must_change_password set', async () => {
    const email = 'vitest-createuser-1@example.com'
    const result = await createUser(email, 'General User')

    expect(result.error).toBeUndefined()
    expect(mockSendTempPasswordEmail).toHaveBeenCalledTimes(1)
    expect(mockSendTempPasswordEmail).toHaveBeenCalledWith(email, expect.any(String))

    const [row] = await sql`select role, must_change_password, password_hash from users where email = ${email}`
    expect(row).toBeDefined()
    expect(row.role).toBe('General User')
    expect(row.must_change_password).toBe(true)
    // The stored hash must not just be the plaintext email/role -- confirms
    // a real bcrypt hash of the generated temp password was stored, not the
    // email itself or some placeholder.
    expect(row.password_hash).toMatch(/^\$2[aby]\$/)
  })

  it('does not create an account when the email fails to send (D2: fail-hard, no orphaned account)', async () => {
    const email = 'vitest-createuser-2@example.com'
    mockSendTempPasswordEmail.mockImplementation(async () => {
      throw new Error('Resend outage')
    })

    const result = await createUser(email, 'General User')

    expect(result.error).toMatch(/could not send/i)
    const [row] = await sql`select id from users where email = ${email}`
    expect(row).toBeUndefined()
  })

  it('rejects an invalid email before ever sending an email', async () => {
    const result = await createUser('not-an-email', 'General User')
    expect(result.error).toMatch(/valid email/i)
    expect(mockSendTempPasswordEmail).not.toHaveBeenCalled()
  })

  it('rejects an invalid access level before ever sending an email', async () => {
    const result = await createUser('vitest-createuser-3@example.com', 'Superadmin')
    expect(result.error).toMatch(/invalid access level/i)
    expect(mockSendTempPasswordEmail).not.toHaveBeenCalled()
  })

  it('returns a clear error for a duplicate email and does not resend/duplicate the row', async () => {
    const email = 'vitest-createuser-4@example.com'
    const first = await createUser(email, 'General User')
    expect(first.error).toBeUndefined()

    const second = await createUser(email, 'General User')
    expect(second.error).toMatch(/already exists/i)

    const rows = await sql`select id from users where email = ${email}`
    expect(rows).toHaveLength(1)
  })
})
