import { getSql } from '@/lib/db'
import { requireFieldAccess } from '@/lib/dal'
import { signFieldPhotoUrls } from '@/lib/fieldPhotos'
import { uploadChecklistPhoto, uploadRoomPhoto } from '@/app/field/actions'
import FieldShell from '../FieldShell'
import RoomPlanEditor from '../components/RoomPlanEditor'
import PhotoCapture from '../components/PhotoCapture'
import ChecklistTextField from '../components/ChecklistTextField'
import CompleteFieldButton from '../components/CompleteFieldButton'
import FieldPhotoFrame from '@/app/components/FieldPhotoFrame'

export const dynamic = 'force-dynamic'

type ChecklistRow = {
  id: string
  label: string
  help_text: string | null
  kind: 'text' | 'photo' | 'text_photo'
  text_value: string | null
  photo_path: string | null
}
type RoomRow = { id: string; room_name: string; photo_path: string | null }

function Step({ n, title, children, done }: { n: number; title: string; children: React.ReactNode; done?: boolean }) {
  return (
    <section className="mb-8">
      <h2 className="flex items-center gap-2 font-display font-bold text-[20px] mb-3">
        <span className="data-mono text-[14px] border border-border rounded-[var(--radius-sm)] w-7 h-7 inline-flex items-center justify-center">
          {n}
        </span>
        {title}
        {done && <span className="text-[13px] font-sans font-semibold text-text-muted">· done</span>}
      </h2>
      {children}
    </section>
  )
}

// One page, top to bottom, in the order the inspector works on site:
// rooms -> checklist -> one wide photo per room -> record the video.
// Design: docs/designs/propinspec-guided-inspection.md
export default async function FieldInspectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { inspection } = await requireFieldAccess(id)
  const sql = getSql()

  const rooms = (await sql`
    select id, room_name, photo_path from inspection_room_plan where inspection_id = ${id} order by sort_order, created_at
  `) as unknown as RoomRow[]

  // Active items, plus any inactive item this inspection already answered
  // (so removing an item in Setup never hides an answer already captured).
  const checklist = (await sql`
    select c.id, c.label, c.help_text, c.kind, r.text_value, r.photo_path
    from checklist_items c
    left join inspection_checklist_responses r on r.checklist_item_id = c.id and r.inspection_id = ${id}
    where c.active or r.id is not null
    order by c.sort_order, c.created_at
  `) as unknown as ChecklistRow[]

  const photoUrls = await signFieldPhotoUrls([...rooms.map((r) => r.photo_path), ...checklist.map((c) => c.photo_path)])

  // Done once anything is captured -- a note alone counts, so "None" (no AC
  // unit, no garage) completes an answer+photo item without a photo.
  const checklistDone = checklist.filter((c) => !!c.text_value || !!c.photo_path).length
  const roomPhotosDone = rooms.filter((r) => r.photo_path).length

  return (
    <FieldShell back={{ href: '/field', label: 'All inspections' }}>
      <h1 className="font-display font-bold text-[24px] leading-tight">{inspection.property_address}</h1>
      <div className="text-[14px] text-text-muted mb-6">
        {inspection.inspection_type} · WO <span className="data-mono">{inspection.job_number}</span> ·{' '}
        <span className="data-mono">{new Date(inspection.inspection_date).toLocaleDateString('en-US', { timeZone: 'UTC' })}</span>
        {inspection.field_completed_at && <span className="font-semibold text-text"> · Field inspection complete</span>}
      </div>

      <Step n={1} title="Rooms" done={rooms.length > 0}>
        <p className="text-[15px] text-text-muted mb-3">
          List every room before you start. In the video, say each room&apos;s name exactly as it appears here — the
          report will use these names.
        </p>
        <RoomPlanEditor inspectionId={id} rooms={rooms} />
      </Step>

      <Step n={2} title={`Checklist (${checklistDone}/${checklist.length})`} done={checklist.length > 0 && checklistDone === checklist.length}>
        {checklist.length === 0 ? (
          <div className="text-[15px] text-text-muted italic">No checklist items are set up.</div>
        ) : (
          <ul className="space-y-3">
            {checklist.map((c) => (
              <li key={c.id} className="border border-border rounded-[var(--radius-lg)] bg-surface p-4">
                <div className="text-[17px] font-semibold">{c.label}</div>
                {c.help_text && <div className="text-[14px] text-text-muted mb-2">{c.help_text}</div>}
                {c.kind !== 'photo' && (
                  <ChecklistTextField inspectionId={id} itemId={c.id} initialValue={c.text_value ?? ''} placeholder="Type here" />
                )}
                {c.kind !== 'text' && (
                  <div className="flex flex-wrap items-start gap-3 mt-1">
                    {c.photo_path && <FieldPhotoFrame url={photoUrls.get(c.photo_path)} caption={c.label} className="w-40" />}
                    <PhotoCapture upload={uploadChecklistPhoto.bind(null, id, c.id)} hasPhoto={!!c.photo_path} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Step>

      <Step n={3} title={`Room photos (${roomPhotosDone}/${rooms.length})`} done={rooms.length > 0 && roomPhotosDone === rooms.length}>
        {rooms.length === 0 ? (
          <div className="text-[15px] text-text-muted italic">Add rooms in step 1 first.</div>
        ) : (
          <>
            <p className="text-[15px] text-text-muted mb-3">One wide shot per room, from the doorway or a corner.</p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {rooms.map((r) => (
                <li key={r.id} className="border border-border rounded-[var(--radius-lg)] bg-surface p-3 space-y-2">
                  <div className="text-[16px] font-semibold">{r.room_name}</div>
                  {r.photo_path && <FieldPhotoFrame url={photoUrls.get(r.photo_path)} caption={r.room_name} className="w-full" />}
                  <PhotoCapture upload={uploadRoomPhoto.bind(null, id, r.id)} hasPhoto={!!r.photo_path} />
                </li>
              ))}
            </ul>
          </>
        )}
      </Step>

      <Step n={4} title="Record the walkthrough" done={!!inspection.field_completed_at}>
        <ol className="list-decimal pl-5 space-y-1 text-[15px] mb-4">
          <li>Record the video with the camera app, the same as today.</li>
          <li>Say each room&apos;s name as you enter it, exactly as listed in step 1.</li>
          <li>Say the dimensions of each room out loud (&quot;Bedroom 2, 10 by 14&quot;).</li>
          <li>Upload the video to this inspection&apos;s Google Drive folder.</li>
        </ol>
        {inspection.source_video_drive_folder_url ? (
          <a
            href={inspection.source_video_drive_folder_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center min-h-11 text-[15px] font-semibold text-accent underline decoration-accent/40 mb-4"
          >
            Open the Drive folder ↗
          </a>
        ) : (
          <div className="text-[14px] text-text-muted mb-4">No Drive folder is linked to this inspection yet — the office will add it.</div>
        )}
        <CompleteFieldButton inspectionId={id} completed={!!inspection.field_completed_at} />
      </Step>
    </FieldShell>
  )
}
