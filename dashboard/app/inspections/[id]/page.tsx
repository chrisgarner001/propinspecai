import { getSql } from '@/lib/db'
import { requireSession } from '@/lib/dal'
import { bulkUpdateLineItems, addLineItem, duplicateLineItem, deleteInspection, updateInspectionBilling } from '@/app/actions'
import { notFound } from 'next/navigation'
import AppShell from '@/app/components/AppShell'
import StatusSelect from '@/app/components/StatusSelect'
import EvidenceStill from '@/app/components/EvidenceStill'
import NewLineItemAssignedTo from '@/app/components/NewLineItemAssignedTo'
import VideoPopupLink from '@/app/components/VideoPopupLink'
import DeleteInspectionButton from '@/app/components/DeleteInspectionButton'
import RemoveSectionControl from '@/app/components/RemoveSectionControl'
import SaveChangesButton from '@/app/components/SaveChangesButton'
import VideoProcessingPanel from '@/app/components/VideoProcessingPanel'
import CreateBatchesButton from '@/app/components/CreateBatchesButton'
import type { InspectionVideoRow } from '@/app/actions'

// Raised from the platform default for processNextInspectionVideo (called
// from this page via VideoProcessingPanel) -- downloading a multi-minute
// clip from Drive and waiting on Gemini's analysis can take well over a
// minute per video. Confirmed on Vercel Pro, which allows up to 300s.
export const maxDuration = 300

const CONDITIONS = ['Good', 'Fair', 'Damaged', 'Not Rated']

// Once a quote is approved, the rehab/turn side of the job (Dispatch Board,
// batching, Stage View, purchasing) becomes relevant -- same gate the Quote
// Sheet page itself already uses for its own copy of these buttons, so a
// reviewer doesn't have to leave this page to reach them once they're live.
const QUOTE_ACTIONS_VISIBLE_STATUSES = ['approved', 'scheduled', 'in_process', 'completed']

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
  trade_category: string | null
  recommended_action: string | null
  priority: string | null
  tenant_charge: boolean
  is_manual_addition: boolean
  source_video_file: string | null
  source_video_drive_file_id: string | null
  still_image_file: string | null
}

type Vendor = { id: string; name: string }

// minmax(0, Nfr), not bare Nfr: without the 0 floor, a track's min-content
// (e.g. a long unbroken Supabase Storage URL in the Item cell) can force
// that track wider than its fr share, which -- since each row is its own
// independent grid container -- desyncs that row's column edges from the
// header row's. minmax(0, ...) caps growth to the fr share so overflowing
// content wraps/truncates inside the cell instead of pushing columns right.
const ROW_COLS = 'grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,0.8fr)_minmax(0,0.9fr)]'

export default async function InspectionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireSession()
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

  const quoteActionsVisible = QUOTE_ACTIONS_VISIBLE_STATUSES.includes(inspection.status)

  const linkClass =
    'bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap'

  return (
    <AppShell
      active="/"
      title={inspection.property_address}
      wide
      headerContent={
        <>
          <div className="flex items-center gap-4 flex-wrap min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted whitespace-nowrap">
              Inspection Report
            </span>
            <h1 className="font-display font-bold text-[17px] truncate">
              Property: {inspection.property_address}
            </h1>
            <div className="text-[13px] text-text-muted whitespace-nowrap">
              Job <span className="data-mono">{inspection.job_number}</span>
            </div>
            <div className="text-[13px] text-text-muted whitespace-nowrap">Inspector: {inspection.inspector_name}</div>
            <div className="text-[13px] text-text-muted data-mono whitespace-nowrap">
              {new Date(inspection.inspection_date).toLocaleDateString('en-US', { timeZone: 'UTC' })}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Status</span>
            <StatusSelect inspectionId={id} status={inspection.status} />
          </div>
        </>
      }
    >
      <div className="flex items-center justify-between gap-2 px-4 md:px-6 py-3 border-b border-border bg-surface-alt flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <a href={`/inspections/${id}/chargeback-review`} className={linkClass}>
            Tenant Chargeback Review
          </a>
          <a href={`/inspections/${id}/quote-sheet`} className={linkClass}>
            Quote and Schedule
          </a>
          {quoteActionsVisible && (
            <>
              <a href={`/dispatch-board?job=${id}`} className={linkClass}>
                Dispatch Board
              </a>
              <CreateBatchesButton inspectionId={id} label="Create Batches" className={linkClass} />
              <a href={`/inspections/${id}/quote-sheet/stages`} className={linkClass}>
                Stage View
              </a>
              <a href={`/inspections/${id}/quote-sheet/materials-order/pdf`} target="_blank" rel="noopener noreferrer" className={linkClass}>
                Materials Order List
              </a>
              <a
                href={`/inspections/${id}/quote-sheet/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-accent hover:bg-accent-hover text-white rounded-[var(--radius-sm)] px-3.5 py-2 text-[13px] font-semibold whitespace-nowrap"
              >
                Create Quote
              </a>
            </>
          )}
        </div>
        <DeleteInspectionButton action={deleteInspection.bind(null, id)} label="Delete inspection" />
      </div>

      {(inspection.source_video_drive_folder_url ||
        inspection.move_in_report_drive_url ||
        inspection.special_instructions) && (
        <div className="px-4 md:px-6 py-3 border-b border-border bg-surface-alt space-y-2">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {inspection.source_video_drive_folder_url && (
              <>
                <a
                  href={inspection.source_video_drive_folder_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px] font-semibold text-accent underline decoration-accent/40 hover:text-accent-hover"
                >
                  Source videos (Drive) ↗
                </a>
                <a
                  href={`/inspections/${id}/stills`}
                  className="text-[12px] font-semibold text-accent underline decoration-accent/40 hover:text-accent-hover"
                >
                  View Image Folder
                </a>
                <VideoProcessingPanel inspectionId={id} initialVideos={inspectionVideos} />
              </>
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

      {/* Manually entered -- no PMS integration exists to pull these from
          (2026-09-22 feedback: wanted as a merged exhibit on the Move-Out
          Report, same as zinspector does). Editable any time, since these
          are often unknown at initial inspection time. */}
      <form
        action={updateInspectionBilling.bind(null, id)}
        className="flex flex-wrap items-end gap-3 px-4 md:px-6 py-3 border-b border-border"
      >
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-1">
            Lease Name
          </label>
          <input
            name="lease_name"
            defaultValue={inspection.lease_name ?? ''}
            placeholder="For the Move-Out Report exhibit"
            className="border border-border rounded-[var(--radius-sm)] px-2.5 py-1.5 w-56 bg-surface text-[13px]"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-1">
            Security Deposit
          </label>
          <input
            name="security_deposit_amount"
            type="number"
            step="0.01"
            defaultValue={inspection.security_deposit_amount ?? ''}
            placeholder="0.00"
            className="data-mono border border-border rounded-[var(--radius-sm)] px-2.5 py-1.5 w-32 bg-surface text-[13px]"
          />
        </div>
        <button
          type="submit"
          className="bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold"
        >
          Save
        </button>
      </form>

      {areas.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 md:px-6 py-3 border-b border-border bg-surface-alt">
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
            className={`hidden md:grid ${ROW_COLS} gap-2 px-3 py-2.5 border-b border-border`}
          >
            {['Item', 'Condition', 'Tenant Chargeback'].map(
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
                <input type="hidden" name={`room_area__${li.id}`} value={li.room_area} />
                <input type="hidden" name={`item__${li.id}`} value={li.item} />
                <div className="flex items-center gap-1.5 min-w-0">
                  <div
                    className="min-w-0 flex-1 truncate text-[12px] font-semibold"
                    title={`${li.room_area} - ${li.item}`}
                  >
                    <span className="uppercase text-accent font-bold">{li.room_area}</span> - {li.item}
                  </div>
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
                  <div className="group relative">
                    <input
                      name={`observed_evidence__${li.id}`}
                      defaultValue={li.observed_evidence ?? ''}
                      placeholder="Observed evidence"
                      className={`${miniField} data-mono text-text-muted`}
                    />
                    {li.observed_evidence && (
                      <div className="hidden group-hover:block absolute z-10 left-0 top-full mt-1 w-72 border border-border rounded-[var(--radius-md)] bg-surface shadow-lg p-2 text-[12px] text-text whitespace-pre-wrap break-words">
                        {li.observed_evidence}
                      </div>
                    )}
                  </div>
                  <EvidenceStill stillImageFile={li.still_image_file} />
                  {li.source_video_file && (
                    <VideoPopupLink filename={li.source_video_file} driveFileId={li.source_video_drive_file_id} />
                  )}
                </div>
              </div>
              <div role="cell" className="min-w-0">
                <div className="md:hidden text-[10px] font-semibold uppercase tracking-wide text-text-muted mb-0.5">Condition</div>
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
              <div role="cell" className="min-w-0 flex items-center gap-2 md:justify-center">
                <input
                  type="checkbox"
                  name={`tenant_charge__${li.id}`}
                  defaultChecked={li.tenant_charge}
                  className="h-4 w-4 cursor-pointer accent-accent"
                />
                <span className="md:hidden text-[11px] text-text-muted">Tenant Chargeback</span>
              </div>
            </div>
          ))}
        </div>
        <div className="px-4 md:px-6 py-4 border-b border-border flex justify-end">
          <SaveChangesButton />
        </div>
      </form>

      <div className="px-4 md:px-6 py-5">
        <h2 className="font-display font-bold text-[15px] mb-3">Add a line item</h2>
        <form action={addLineItem} className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
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
            <NewLineItemAssignedTo vendors={vendors} />
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
            className="bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-2 text-[12px] font-semibold col-span-2 md:col-span-6 w-fit"
          >
            Add Item
          </button>
        </form>
      </div>
    </AppShell>
  )
}
