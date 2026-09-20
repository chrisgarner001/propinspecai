import { getSql } from '@/lib/db'
import { notFound } from 'next/navigation'
import AppShell from '@/app/components/AppShell'

// "View Image Folder" -- every still frame extracted from this inspection's
// video, in one gallery, since reviewing them one hover-preview at a time
// from the line-item table (EvidenceStill) doesn't give a sense of the
// whole set. Bordered frame + a mono caption bar per photo, not a plain
// <img> lightbox, matching DESIGN.md's evidence-frame convention -- no GPS
// data exists in this schema to put in the caption, so it carries Room/Item
// instead, the identifying info that does exist.

type StillRow = { id: string; room_area: string; item: string; still_image_file: string }

export default async function InspectionStillsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sql = getSql()

  const [inspection] = await sql`select * from inspections where id = ${id}`
  if (!inspection) notFound()

  const stills = (await sql`
    select id, room_area, item, still_image_file
    from line_items
    where inspection_id = ${id} and still_image_file is not null
    order by room_area, created_at
  `) as unknown as StillRow[]

  const roomGroups = new Map<string, StillRow[]>()
  for (const s of stills) {
    if (!roomGroups.has(s.room_area)) roomGroups.set(s.room_area, [])
    roomGroups.get(s.room_area)!.push(s)
  }

  return (
    <AppShell active="/" reviewerName="Jessica Zilka" title={`Image Folder — ${inspection.property_address}`} wide>
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-surface-alt">
        <div className="text-[13px] text-text-muted">
          {inspection.property_address} · Job <span className="data-mono">{inspection.job_number}</span> ·{' '}
          <span className="data-mono">{stills.length}</span> still(s)
        </div>
        <a
          href={`/inspections/${id}`}
          className="bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold"
        >
          Back to Inspection
        </a>
      </div>

      {stills.length === 0 ? (
        <div className="px-6 py-6 text-[13px] text-text-muted">
          No still images extracted yet for this inspection.
        </div>
      ) : (
        [...roomGroups.entries()].map(([room, items]) => (
          <div key={room} className="px-6 py-4 border-b border-border">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-2">{room}</div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
              {items.map((s) => (
                <a
                  key={s.id}
                  href={s.still_image_file}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block border border-border rounded-[var(--radius-md)] overflow-hidden bg-surface hover:border-accent"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- source is an arbitrary Supabase Storage URL, not a static/public import */}
                  <img src={s.still_image_file} alt={`${room} — ${s.item}`} className="w-full h-36 object-cover" />
                  <div className="data-mono text-[10px] text-text-muted px-2 py-1.5 truncate border-t border-border" title={s.item}>
                    {s.item}
                  </div>
                </a>
              ))}
            </div>
          </div>
        ))
      )}
    </AppShell>
  )
}
