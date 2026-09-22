import { getSql } from '@/lib/db'
import { requireSession } from '@/lib/dal'
import { notFound } from 'next/navigation'
import AppShell from '@/app/components/AppShell'
import ImageShareGallery from '@/app/components/ImageShareGallery'

// "View Image Folder" -- every still frame extracted from this inspection's
// video, in one gallery, since reviewing them one hover-preview at a time
// from the line-item table (EvidenceStill) doesn't give a sense of the
// whole set. Clicking a thumbnail opens ImageShareGallery's own in-page
// lightbox (Prev/Next across the whole set) -- GPS is confirmed unrecoverable
// from source video (docs/designs/propinspec-inspection-type-gallery.md),
// but captured_at (the video's own creation_time + frame offset) is real and
// renders in the lightbox caption.

type StillRow = { id: string; room_area: string; item: string; still_image_file: string; captured_at: string | null }

export default async function InspectionStillsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession()
  const { id } = await params
  const sql = getSql()

  const [inspection] = await sql`select * from inspections where id = ${id}`
  if (!inspection) notFound()

  const stills = (await sql`
    select id, room_area, item, still_image_file, captured_at
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
    <AppShell active="/inspections" title={`Image Folder — ${inspection.property_address}`} wide>
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
