import { getSql } from '@/lib/db'
import { bulkUpdateLineItems, addLineItem, duplicateLineItem, deleteInspection } from '@/app/actions'
import { notFound } from 'next/navigation'
import AppShell from '@/app/components/AppShell'
import StatusSelect from '@/app/components/StatusSelect'
import EvidenceStill from '@/app/components/EvidenceStill'
import LineItemAssignment from '@/app/components/LineItemAssignment'
import TenantChargeCheckboxes from '@/app/components/TenantChargeCheckboxes'
import VideoPopupLink from '@/app/components/VideoPopupLink'
import DeleteInspectionButton from '@/app/components/DeleteInspectionButton'
import RemoveSectionControl from '@/app/components/RemoveSectionControl'
import SaveChangesButton from '@/app/components/SaveChangesButton'
import VideoProcessingPanel from '@/app/components/VideoProcessingPanel'
import type { InspectionVideoRow } from '@/app/actions'

// Raised from the platform default for processNextInspectionVideo (called
// from this page via VideoProcessingPanel) -- downloading a multi-minute
// clip from Drive and waiting on Gemini's analysis can take well over a
// minute per video. Confirmed on Vercel Pro, which allows up to 300s.
export const maxDuration = 300

const CONDITIONS = ['Good', 'Fair', 'Damaged', 'Not Rated']
const ASSIGNED_TO_OPTIONS = ['GPM Staff', 'Outside Vendor', 'Other']

function areaAnchor(roomArea: string) {
  return `area-${roomArea.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`
}

const miniField =
  'text-[12px] border border-border rounded-[var(--radius-sm)] px-1.5 py-1 w-full bg-surface truncate'

type LineItem = {
  id: string
  room_area: string
  item: string
  condition: string
  observed_evidence: string | null
  assigned_to: string | null
  trade_category: string | null
  recommended_action: string | null
  priority: string | null
  materials_cost: string | null
  labor_hours: string | null
  labor_cost: string | null
  vendor_estimated_cost: string | null
  tenant_charge: boolean
  tenant_approved: boolean
  is_manual_addition: boolean
  source_video_file: string | null
  source_video_drive_file_id: string | null
  still_image_file: string | null
  vendor_id: string | null
}

type Vendor = { id: string; name: string }

// minmax(0, Nfr), not bare Nfr: without the 0 floor, a track's min-content
// (e.g. a long unbroken Supabase Storage URL in the Item cell) can force
// that track wider than its fr share, which -- since each row is its own
// independent grid container -- desyncs that row's column edges from the
// header row's. minmax(0, ...) caps growth to the fr share so overflowing
// content wraps/truncates inside the cell instead of pushing columns right.
const ROW_COLS = 'grid-cols-[minmax(0,2fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]'

export default async function InspectionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const sql = getSql()

  const [inspection] = await sql`select * from inspections where id = ${id}`
  if (!inspection) notFound()

  const lineItems = (await sql`
    select * from line_items where inspection_id = ${id} order by room_area, created_at
  `) as unknown as LineItem[]

  const vendors = (await sql`select id, name from vendors order by name`) as unknown as Vendor[]

  const areas = [...new Set(lineItems.map((li) => li.room_area))]
  const firstRowIdByArea = new Map<string, string>()
  for (const li of lineItems) {
    if (!firstRowIdByArea.has(li.room_area)) firstRowIdByArea.set(li.room_area, li.id)
  }

  const inspectionVideos = (await sql`
    select id, drive_file_id, filename, status, error_message, line_items_created
    from inspection_videos where inspection_id = ${id} order by created_at
  `) as unknown as InspectionVideoRow[]

  const [settings] = await sql`select gpm_labor_charge from settings where id = true`
  const laborRate = Number(settings?.gpm_labor_charge ?? 0)

  return (
    <AppShell active="/" reviewerName="Jessica Zilka" title={inspection.property_address} wide>
      <div className="flex items-center justify-between gap-2 px-6 py-3 border-b border-border bg-surface-alt">
        <DeleteInspectionButton action={deleteInspection.bind(null, id)} label="Delete inspection" />
        <div className="flex items-center gap-2">
          <a
            href={`/inspections/${id}/timeline`}
            className="bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold"
          >
            Job Timeline
          </a>
          <a
            href={`/inspections/${id}/turn-scope`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold"
          >
            Create Quote Sheet
          </a>
          <a
            href={`/inspections/${id}/move-out-report`}
            className="bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold"
          >
            Create Move Out Report
          </a>
        </div>
      </div>

      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="text-[13px] text-text-muted">
          Job <span className="data-mono">{inspection.job_number}</span> · {inspection.inspector_name} ·{' '}
          <span className="data-mono">
            {new Date(inspection.inspection_date).toLocaleDateString('en-US', { timeZone: 'UTC' })}
          </span>
        </div>
        <StatusSelect inspectionId={id} status={inspection.status} />
      </div>

      {(inspection.source_video_drive_folder_url ||
        inspection.move_in_report_drive_url ||
        inspection.special_instructions) && (
        <div className="px-6 py-3 border-b border-border bg-surface-alt space-y-2">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            {inspection.source_video_drive_folder_url && (
              <a
                href={inspection.source_video_drive_folder_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12px] font-semibold text-accent underline decoration-accent/40 hover:text-accent-hover"
              >
                Source videos (Drive) ↗
              </a>
            )}
            {inspection.move_in_report_drive_url && (
              <a
                href={inspection.move_in_report_drive_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12px] font-semibold text-accent underline decoration-accent/40 hover:text-accent-hover"
              >
                Move-in report (Drive) ↗
              </a>
            )}
          </div>
          {inspection.special_instructions && (
            <div className="text-[13px] leading-relaxed">
              <span className="font-semibold">Special instructions: </span>
              {inspection.special_instructions}
            </div>
          )}
        </div>
      )}

      {inspection.source_video_drive_folder_url && (
        <VideoProcessingPanel inspectionId={id} initialVideos={inspectionVideos} />
      )}

      {areas.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 px-6 py-3 border-b border-border bg-surface-alt">
          {areas.map((area) => (
            <a
              key={area}
              href={`#${areaAnchor(area)}`}
              className="text-[12px] font-semibold text-accent underline decoration-accent/40 hover:text-accent-hover"
            >
              {area}
            </a>
          ))}
        </div>
      )}

      <form action={bulkUpdateLineItems}>
        <input type="hidden" name="inspection_id" value={id} />
        <div role="table">
          <div
            role="row"
            className={`grid ${ROW_COLS} gap-2 px-3 py-2.5 border-b border-border`}
          >
            {['Item', 'Condition', 'Assigned To', 'Materials', 'Labor (hrs)', 'Vendor Est.', 'Tenant Charge', 'Approve'].map(
              (h) => (
                <div
                  key={h}
                  role="columnheader"
                  className="text-[11px] font-semibold uppercase tracking-wide text-text-muted"
                >
                  {h}
                </div>
              ),
            )}
          </div>
          {lineItems.map((li) => (
            <div
              key={li.id}
              id={firstRowIdByArea.get(li.room_area) === li.id ? areaAnchor(li.room_area) : undefined}
              role="row"
              className={`relative grid ${ROW_COLS} gap-2 items-center px-3 pt-3 pb-7 border-b border-border scroll-mt-16`}
            >
              <input type="hidden" name="ids" value={li.id} />
              <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1.5">
                <RemoveSectionControl id={li.id} />
                <button
                  type="submit"
                  formAction={duplicateLineItem.bind(null, li.id, id)}
                  className="text-[10px] font-semibold text-text-muted hover:text-accent border border-border hover:border-accent rounded-[var(--radius-sm)] px-1.5 py-0.5 bg-surface"
                >
                  Duplicate Section
                </button>
              </div>
              <div role="cell" className="min-w-0 space-y-1">
                <input
                  name={`room_area__${li.id}`}
                  defaultValue={li.room_area}
                  placeholder="Room/Area"
                  title={li.room_area}
                  className={`${miniField} text-[10px] uppercase tracking-wide text-text-muted`}
                />
                <div className="flex items-center gap-1.5">
                  <input
                    name={`item__${li.id}`}
                    defaultValue={li.item}
                    placeholder="Item"
                    title={li.item}
                    className={`${miniField} font-semibold`}
                  />
                  {li.is_manual_addition && (
                    <span className="text-[11px] font-normal text-accent whitespace-nowrap">(added)</span>
                  )}
                </div>
                <input
                  name={`recommended_action__${li.id}`}
                  defaultValue={li.recommended_action ?? ''}
                  placeholder="Recommended action"
                  title={li.recommended_action ?? ''}
                  className={`${miniField} text-text-muted`}
                />
                <div className="border-l-2 border-border pl-2 space-y-1">
                  <input
                    name={`observed_evidence__${li.id}`}
                    defaultValue={li.observed_evidence ?? ''}
                    placeholder="Observed evidence"
                    title={li.observed_evidence ?? ''}
                    className={`${miniField} data-mono text-text-muted`}
                  />
                  <EvidenceStill stillImageFile={li.still_image_file} />
                  {li.source_video_file && (
                    <VideoPopupLink filename={li.source_video_file} driveFileId={li.source_video_drive_file_id} />
                  )}
                </div>
              </div>
              <div role="cell" className="min-w-0">
                <select
                  name={`condition__${li.id}`}
                  defaultValue={li.condition}
                  className={miniField}
                >
                  {CONDITIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <LineItemAssignment
                id={li.id}
                assignedTo={li.assigned_to}
                vendorId={li.vendor_id}
                vendors={vendors}
                materialsCost={li.materials_cost}
                laborHours={li.labor_hours}
                laborRate={laborRate}
                vendorEstimatedCost={li.vendor_estimated_cost}
              />
              <TenantChargeCheckboxes id={li.id} tenantCharge={li.tenant_charge} tenantApproved={li.tenant_approved} />
            </div>
          ))}
        </div>
        <div className="px-6 py-4 border-b border-border flex justify-end">
          <SaveChangesButton />
        </div>
      </form>

      <div className="px-6 py-5">
        <h2 className="font-display font-bold text-[15px] mb-3">Add a line item</h2>
        <form action={addLineItem} className="grid grid-cols-6 gap-2 items-end">
          <input type="hidden" name="inspection_id" value={id} />
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-1">
              Room/Area
            </label>
            <input
              name="room_area"
              required
              className="border border-border rounded-[var(--radius-sm)] px-2 py-1.5 w-full bg-surface"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-1">
              Item
            </label>
            <input
              name="item"
              required
              className="border border-border rounded-[var(--radius-sm)] px-2 py-1.5 w-full bg-surface"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-1">
              Condition
            </label>
            <select
              name="condition"
              required
              className="border border-border rounded-[var(--radius-sm)] px-2 py-1.5 w-full bg-surface"
            >
              <option value="Good">Good</option>
              <option value="Fair">Fair</option>
              <option value="Damaged">Damaged</option>
              <option value="Not Rated">Not Rated</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-1">
              Assigned To
            </label>
            <select
              name="assigned_to"
              className="border border-border rounded-[var(--radius-sm)] px-2 py-1.5 w-full bg-surface"
            >
              <option value="">—</option>
              {ASSIGNED_TO_OPTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-1">
              Recommended Action
            </label>
            <input
              name="recommended_action"
              className="border border-border rounded-[var(--radius-sm)] px-2 py-1.5 w-full bg-surface"
            />
          </div>
          <button
            type="submit"
            className="bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-2 text-[12px] font-semibold col-span-6 w-fit"
          >
            Add Item
          </button>
        </form>
      </div>
    </AppShell>
  )
}
