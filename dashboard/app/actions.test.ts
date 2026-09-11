import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getSql } from '@/lib/db'
import { duplicateLineItem, updateLineItemSchedule } from './actions'

// revalidatePath relies on Next's request-scoped static-generation store,
// which doesn't exist when actions are called directly from a test runner
// (only from a real request). Irrelevant to what these tests verify (DB
// state), so it's mocked out rather than worked around in production code.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

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
