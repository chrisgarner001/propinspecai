import { getSql } from '@/lib/db'
import { notFound } from 'next/navigation'
import AppShell from '@/app/components/AppShell'
import JobTimelineView, { type StageTimelineRow } from '@/app/components/JobTimelineView'

// Date-only Postgres columns come back as JS Date objects (local-time
// interpreted) from postgres.js -- format with UTC parts so this doesn't hit
// the same "renders one day early" bug already fixed elsewhere in this app
// (see DESIGN.md Decisions Log).
function toDateInputValue(d: Date | null): string | null {
  if (!d) return null
  return d.toISOString().slice(0, 10)
}

export default async function JobTimelinePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const sql = getSql()

  const [inspection] = await sql`select * from inspections where id = ${id}`
  if (!inspection) notFound()

  // Lazily provision an inspection_stages row for every stage actually in
  // use on this inspection's line items -- the Timeline shows one row per
  // Stage, not per line item, so scheduling needs a home at that grain (see
  // 0020_inspection_stages.sql) independent of how items get re-staged later.
  await sql`
    insert into inspection_stages (inspection_id, stage_id)
    select distinct ${id}::uuid, li.stage_id
    from line_items li
    where li.inspection_id = ${id} and li.stage_id is not null
    on conflict (inspection_id, stage_id) do nothing
  `

  const rows = await sql`
    select ist.id, ist.stage_id, s.name as stage_name, s.sort_order,
      ist.status, ist.scheduled_start, ist.scheduled_end, ist.blocks_inspection_stage_id,
      (select count(*) from line_items li where li.inspection_id = ${id} and li.stage_id = ist.stage_id) as item_count
    from inspection_stages ist
    join stages s on s.id = ist.stage_id
    where ist.inspection_id = ${id}
      and exists (select 1 from line_items li where li.inspection_id = ${id} and li.stage_id = ist.stage_id)
    order by s.sort_order
  `

  const assignmentRows = await sql`
    select stage_id, assigned_to, vendor_id from line_items where inspection_id = ${id} and stage_id is not null
  `
  const vendors = (await sql`select id, name from vendors order by name`) as unknown as { id: string; name: string }[]
  const vendorName = (vendorId: string | null) => vendors.find((v) => v.id === vendorId)?.name ?? 'Vendor'

  function assigneeLabel(stageId: string) {
    const items = assignmentRows.filter((r) => r.stage_id === stageId)
    const distinct = new Set(items.map((r) => (r.assigned_to === 'Outside Vendor' ? `vendor:${r.vendor_id}` : r.assigned_to)))
    if (distinct.size > 1) return 'Mixed assignment'
    const r = items[0]
    if (!r) return 'Unassigned'
    return r.assigned_to === 'Outside Vendor' ? vendorName(r.vendor_id) : (r.assigned_to ?? 'Unassigned')
  }

  const stageRows: StageTimelineRow[] = rows.map((r) => ({
    id: r.id,
    stageId: r.stage_id,
    stageName: r.stage_name,
    assigneeLabel: assigneeLabel(r.stage_id),
    itemCount: Number(r.item_count),
    status: r.status,
    scheduled_start: toDateInputValue(r.scheduled_start),
    scheduled_end: toDateInputValue(r.scheduled_end),
    blocks_inspection_stage_id: r.blocks_inspection_stage_id,
  }))

  return (
    <AppShell active="/" reviewerName="Jessica Zilka" title="Job Timeline — Stage View" wide>
      <div className="px-6 py-3 border-b border-border">
        <div className="text-[13px] text-text-muted">
          {inspection.property_address} · Job <span className="data-mono">{inspection.job_number}</span>
        </div>
      </div>
      {stageRows.length === 0 ? (
        <div className="px-6 py-6 text-[13px] text-text-muted">
          No stages assigned yet. Set a Stage on line items in the Quote Sheet to schedule them here.
        </div>
      ) : (
        <JobTimelineView inspectionId={id} stageRows={stageRows} />
      )}
    </AppShell>
  )
}
