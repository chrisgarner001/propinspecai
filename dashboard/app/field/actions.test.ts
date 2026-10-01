import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSql } from '@/lib/db'

// Unlike app/actions.test.ts, lib/dal.ts is NOT mocked here -- these tests
// exist to prove the real Inspector access check (requireFieldAccessOrThrow
// -> the users.inspector_id -> inspectors.name -> inspections.inspector_name
// join) against the real dev Postgres. Only the cookie/session decoding is
// faked, so a test can "sign in" as a specific real user row.
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`) }) }))
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ get: () => ({ value: 'test-token' }) })) }))
let currentUserId = ''
vi.mock('@/lib/session', () => ({
  decrypt: vi.fn(async () => ({ userId: currentUserId, role: 'unused' })),
  SESSION_COOKIE_NAME: 'session',
}))
// Storage calls are faked; isJpeg stays real (it's what rejects a non-photo).
const mockUpload = vi.fn(async (..._args: unknown[]) => {})
const mockRemove = vi.fn(async (..._args: unknown[]) => {})
vi.mock('@/lib/fieldPhotos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/fieldPhotos')>()
  return {
    ...actual,
    uploadFieldPhoto: (...args: unknown[]) => mockUpload(...args),
    removeFieldPhoto: (...args: unknown[]) => mockRemove(...args),
  }
})

const { addPlannedRoom, removePlannedRoom, movePlannedRoom, saveChecklistText, uploadChecklistPhoto, setFieldInspectionComplete } =
  await import('./actions')

const sql = getSql()
const tag = `vitest-${Date.now()}`
let inspectorUserId: string
let adminUserId: string
let unlinkedInspectorUserId: string
let inspectorId: string
let mineId: string
let theirsId: string
let checklistItemId: string

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
const photoForm = (bytes: Buffer) => {
  const fd = new FormData()
  fd.append('photo', new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }), 'photo.jpg')
  return fd
}

beforeAll(async () => {
  ;[{ id: inspectorId }] = await sql`insert into inspectors (name) values (${`${tag} Chuck`}) returning id`
  ;[{ id: inspectorUserId }] = await sql`
    insert into users (email, password_hash, role, must_change_password, inspector_id)
    values (${`${tag}-inspector@example.com`}, 'x', 'Inspector', false, ${inspectorId}) returning id
  `
  ;[{ id: unlinkedInspectorUserId }] = await sql`
    insert into users (email, password_hash, role, must_change_password)
    values (${`${tag}-unlinked@example.com`}, 'x', 'Inspector', false) returning id
  `
  ;[{ id: adminUserId }] = await sql`
    insert into users (email, password_hash, role, must_change_password)
    values (${`${tag}-admin@example.com`}, 'x', 'Admin', false) returning id
  `
  ;[{ id: mineId }] = await sql`
    insert into inspections (job_number, property_address, inspection_date, inspector_name)
    values ('VITEST', 'Vitest Field Mine', '2026-01-01', ${`${tag} Chuck`}) returning id
  `
  ;[{ id: theirsId }] = await sql`
    insert into inspections (job_number, property_address, inspection_date, inspector_name)
    values ('VITEST', 'Vitest Field Theirs', '2026-01-01', 'Someone Else') returning id
  `
  ;[{ id: checklistItemId }] = await sql`
    insert into checklist_items (label, kind, sort_order, active) values (${`${tag} Water meter`}, 'text_photo', 9999, false) returning id
  `
})

afterAll(async () => {
  await sql`delete from inspections where id in (${mineId}, ${theirsId})`
  await sql`delete from checklist_items where id = ${checklistItemId}`
  await sql`delete from users where id in (${inspectorUserId}, ${unlinkedInspectorUserId}, ${adminUserId})`
  await sql`delete from inspectors where id = ${inspectorId}`
  await sql.end()
})

beforeEach(() => {
  currentUserId = inspectorUserId
  mockUpload.mockClear()
  mockRemove.mockClear()
})

const roomNames = async (inspectionId: string) =>
  (await sql`select room_name from inspection_room_plan where inspection_id = ${inspectionId} order by sort_order, created_at`).map(
    (r) => r.room_name,
  )

describe('field access', () => {
  it('an Inspector can work on an inspection assigned to them', async () => {
    expect(await addPlannedRoom(mineId, { preset: 'Bedroom' })).toEqual({})
    expect(await addPlannedRoom(mineId, { preset: 'Bedroom' })).toEqual({})
    expect(await addPlannedRoom(mineId, { preset: 'Kitchen' })).toEqual({})
    expect(await roomNames(mineId)).toEqual(['Bedroom 1', 'Bedroom 2', 'Kitchen'])
  })

  it("an Inspector cannot touch another inspector's inspection", async () => {
    await expect(addPlannedRoom(theirsId, { preset: 'Bedroom' })).rejects.toThrow('Not authorized')
    await expect(saveChecklistText(theirsId, checklistItemId, 'x')).rejects.toThrow('Not authorized')
    await expect(setFieldInspectionComplete(theirsId, true)).rejects.toThrow('Not authorized')
    expect(await roomNames(theirsId)).toEqual([])
  })

  it('an Inspector login not linked to any inspector sees nothing', async () => {
    currentUserId = unlinkedInspectorUserId
    await expect(addPlannedRoom(mineId, { preset: 'Attic' })).rejects.toThrow('Not authorized')
  })

  it('an office user can open any inspection in the field view', async () => {
    currentUserId = adminUserId
    expect(await addPlannedRoom(theirsId, { custom: 'Bonus Room' })).toEqual({})
    expect(await roomNames(theirsId)).toEqual(['Bonus Room'])
  })

  it('rejects a malformed inspection id without querying it', async () => {
    await expect(addPlannedRoom('not-a-uuid', { preset: 'Bedroom' })).rejects.toThrow('Not authorized')
  })
})

describe('room plan', () => {
  it('rejects a duplicate custom room and reorders rooms', async () => {
    expect(await addPlannedRoom(mineId, { custom: 'kitchen' })).toEqual({ error: 'That room is already on the list.' })
    const [kitchen] = await sql`select id from inspection_room_plan where inspection_id = ${mineId} and room_name = 'Kitchen'`
    await movePlannedRoom(mineId, kitchen.id, 'up')
    expect(await roomNames(mineId)).toEqual(['Bedroom 1', 'Kitchen', 'Bedroom 2'])
  })

  it("can't remove a room through a different inspection's id", async () => {
    const [kitchen] = await sql`select id from inspection_room_plan where inspection_id = ${mineId} and room_name = 'Kitchen'`
    currentUserId = adminUserId
    await removePlannedRoom(theirsId, kitchen.id) // admin has access to theirsId, but the room belongs to mineId
    expect(await roomNames(mineId)).toContain('Kitchen')
  })
})

describe('checklist', () => {
  it('saves a text answer, then a photo, keeping both', async () => {
    expect(await saveChecklistText(mineId, checklistItemId, '  Basement, north wall  ')).toEqual({})
    expect(await uploadChecklistPhoto(mineId, checklistItemId, photoForm(JPEG))).toEqual({})
    const [row] = await sql`
      select text_value, photo_path, label from inspection_checklist_responses
      where inspection_id = ${mineId} and checklist_item_id = ${checklistItemId}
    `
    expect(row.text_value).toBe('Basement, north wall')
    expect(row.photo_path).toMatch(new RegExp(`^${mineId}/checklist/${checklistItemId}-.+\\.jpg$`))
    expect(row.label).toBe(`${tag} Water meter`)
    expect(mockUpload).toHaveBeenCalledTimes(1)
  })

  it('a retake replaces the photo and removes the old one from storage', async () => {
    const [before] = await sql`select photo_path from inspection_checklist_responses where inspection_id = ${mineId} and checklist_item_id = ${checklistItemId}`
    await uploadChecklistPhoto(mineId, checklistItemId, photoForm(JPEG))
    expect(mockRemove).toHaveBeenCalledWith(before.photo_path)
  })

  it('rejects a file that is not a JPEG without storing it', async () => {
    const result = await uploadChecklistPhoto(mineId, checklistItemId, photoForm(Buffer.from('<svg/>')))
    expect(result.error).toMatch(/not a photo/i)
    expect(mockUpload).not.toHaveBeenCalled()
  })
})

describe('marking complete', () => {
  it('needs at least one room, then stamps field_completed_at, and can be reopened', async () => {
    currentUserId = adminUserId
    await sql`delete from inspection_room_plan where inspection_id = ${theirsId}`
    expect((await setFieldInspectionComplete(theirsId, true)).error).toMatch(/add the rooms/i)

    currentUserId = inspectorUserId
    expect(await setFieldInspectionComplete(mineId, true)).toEqual({})
    const [done] = await sql`select field_completed_at from inspections where id = ${mineId}`
    expect(done.field_completed_at).not.toBeNull()

    await setFieldInspectionComplete(mineId, false)
    const [reopened] = await sql`select field_completed_at from inspections where id = ${mineId}`
    expect(reopened.field_completed_at).toBeNull()
  })
})
