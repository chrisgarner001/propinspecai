import { getSql } from '@/lib/db'
import { notFound } from 'next/navigation'
import AppShell from '@/app/components/AppShell'
import JobTimelineView, { type TimelineItem } from '@/app/components/JobTimelineView'

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

  const rows = await sql`
    select id, room_area, item, assigned_to, status, scheduled_start, scheduled_end, blocks_line_item_id
    from line_items
    where inspection_id = ${id}
    order by room_area, created_at
  `

  const lineItems: TimelineItem[] = rows.map((r) => ({
    id: r.id,
    room_area: r.room_area,
    item: r.item,
    assigned_to: r.assigned_to,
    status: r.status,
    scheduled_start: toDateInputValue(r.scheduled_start),
    scheduled_end: toDateInputValue(r.scheduled_end),
    blocks_line_item_id: r.blocks_line_item_id,
  }))

  return (
    <AppShell active="/" reviewerName="Jessica Zilka" title="Job Timeline" wide>
      <div className="px-6 py-3 border-b border-border">
        <div className="text-[13px] text-text-muted">
          {inspection.property_address} · Job <span className="data-mono">{inspection.job_number}</span>
        </div>
      </div>
      <JobTimelineView inspectionId={id} lineItems={lineItems} />
    </AppShell>
  )
}
