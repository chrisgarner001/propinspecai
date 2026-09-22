import { getSql } from '@/lib/db'
import { requireSession } from '@/lib/dal'
import { notFound } from 'next/navigation'
import AppShell from '@/app/components/AppShell'
import ImageShareGallery from '@/app/components/ImageShareGallery'

// "View Image Folder" -- every still frame extracted from this inspection's
// video, in one gallery, since reviewing them one hover-preview at a time
// from the line-item table (EvidenceStill) doesn't give a sense of the
// whole set. Bordered frame + a mono caption bar per photo, not a plain
// <img> lightbox, matching DESIGN.md's evidence-frame convention -- no GPS
// data exists in this schema to put in the caption, so it carries Room/Item
// instead, the identifying info that does exist.

type StillRow = { id: string; room_area: string; item: string; still_image_file: string }

export default async function InspectionStillsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession()
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
    <AppShell active="/" title={`Image Folder — ${inspection.property_address}`} wide>
      <ImageShareGallery
        inspectionId={id}
        backHref={`/inspections/${id}`}
        summary={
          <>
            {inspection.property_address} · Job <span className="data-mono">{inspection.job_number}</span> ·{' '}
            <span className="data-mono">{stills.length}</span> still(s)
          </>
        }
        roomGroups={[...roomGroups.entries()]}
      />
    </AppShell>
  )
}
