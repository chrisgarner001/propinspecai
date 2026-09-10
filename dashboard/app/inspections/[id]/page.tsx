import { getSql } from '@/lib/db'
import { bulkUpdateLineItems, addLineItem, markExported, markUnderReview } from '@/app/actions'
import { notFound } from 'next/navigation'
import AppShell from '@/app/components/AppShell'
import StatusBadge from '@/app/components/StatusBadge'
import ConditionBadge from '@/app/components/ConditionBadge'
import VendorSelect from '@/app/components/VendorSelect'
import EvidenceStill from '@/app/components/EvidenceStill'
import LaborHoursInput from '@/app/components/LaborHoursInput'

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
  tenant_status: string | null
  is_manual_addition: boolean
  source_timestamp: string | null
  source_video_file: string | null
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

  const [settings] = await sql`select gpm_labor_charge from settings where id = true`
  const laborRate = Number(settings?.gpm_labor_charge ?? 0)

  return (
    <AppShell active="/" reviewerName="Jessica Zilka" title={inspection.property_address} wide>
      <div className="flex items-center justify-end gap-2 px-6 py-3 border-b border-border bg-surface-alt">
        <a
          href={`/inspections/${id}/export`}
          className="bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold"
        >
          Download Excel
        </a>
        <a
          href={`/inspections/${id}/move-out-report`}
          className="bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold"
        >
          Create Move Out Report
        </a>
        {inspection.status === 'exported' ? (
          <form action={markUnderReview}>
            <input type="hidden" name="inspection_id" value={id} />
            <button
              type="submit"
              className="bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold"
            >
              Under Review
            </button>
          </form>
        ) : (
          <form action={markExported}>
            <input type="hidden" name="inspection_id" value={id} />
            <button
              type="submit"
              className="bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold"
            >
              Mark Exported
            </button>
          </form>
        )}
      </div>

      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="text-[13px] text-text-muted">
          Job <span className="data-mono">{inspection.job_number}</span> · {inspection.inspector_name} ·{' '}
          <span className="data-mono">
            {new Date(inspection.inspection_date).toLocaleDateString('en-US', { timeZone: 'UTC' })}
          </span>
        </div>
        <StatusBadge status={inspection.status} />
      </div>

      <form action={bulkUpdateLineItems}>
        <input type="hidden" name="inspection_id" value={id} />
        <div role="table">
          <div
            role="row"
            className={`grid ${ROW_COLS} gap-2 px-3 py-2.5 border-b border-border`}
          >
            {['Item', 'Condition', 'Assigned To', 'Materials', 'Labor (hrs)', 'Vendor Est.', 'Tenant Status', 'Approve'].map(
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
              role="row"
              className={`grid ${ROW_COLS} gap-2 items-center px-3 py-3 border-b border-border`}
            >
              <input type="hidden" name="ids" value={li.id} />
              <div role="cell" className="min-w-0">
                <div className="text-[10px] uppercase tracking-wide text-text-muted">{li.room_area}</div>
                <div className="font-semibold">
                  {li.item}
                  {li.is_manual_addition && (
                    <span className="ml-1.5 text-[11px] font-normal text-accent">(added)</span>
                  )}
                </div>
                {li.recommended_action && (
                  <div className="text-[12px] text-text-muted">{li.recommended_action}</div>
                )}
                {(li.observed_evidence || li.source_timestamp || li.source_video_file || li.still_image_file) && (
                  <div className="mt-1 border-l-2 border-border pl-2 space-y-0.5">
                    {li.observed_evidence && (
                      <div className="data-mono text-[11px] text-text-muted">{li.observed_evidence}</div>
                    )}
                    <EvidenceStill stillImageFile={li.still_image_file} />
                    {(li.source_video_file || li.source_timestamp) && (
                      <div className="data-mono text-[11px] text-text-muted">
                        {li.source_video_file}
                        {li.source_video_file && li.source_timestamp ? ' — ' : ''}
                        {li.source_timestamp}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div role="cell" className="min-w-0">
                <ConditionBadge condition={li.condition} />
              </div>
              <div role="cell" className="min-w-0">
                {li.assigned_to === 'Outside Vendor' ? (
                  <VendorSelect name={`vendor_id__${li.id}`} vendors={vendors} defaultValue={li.vendor_id} />
                ) : (
                  <span className="text-text-muted">{li.assigned_to ?? '—'}</span>
                )}
              </div>
              <input
                role="cell"
                name={`materials_cost__${li.id}`}
                type="number"
                step="5"
                defaultValue={li.materials_cost ?? ''}
                disabled={li.assigned_to !== 'GPM Staff'}
                placeholder="—"
                className="data-mono border border-border rounded-[var(--radius-sm)] px-2 py-1 w-full min-w-0 bg-surface disabled:bg-surface-alt disabled:text-text-muted"
              />
              <div role="cell" className="min-w-0">
                <LaborHoursInput
                  name={`labor_hours__${li.id}`}
                  defaultValue={li.labor_hours}
                  rate={laborRate}
                  disabled={li.assigned_to !== 'GPM Staff'}
                />
              </div>
              <input
                role="cell"
                name={`vendor_estimated_cost__${li.id}`}
                type="number"
                step="5"
                defaultValue={li.vendor_estimated_cost ?? ''}
                disabled={li.assigned_to !== 'Outside Vendor'}
                placeholder="—"
                className="data-mono border border-border rounded-[var(--radius-sm)] px-2 py-1 w-full min-w-0 bg-surface disabled:bg-surface-alt disabled:text-text-muted"
              />
              <div role="cell">
                <label className="flex items-center gap-1.5 text-[12px] text-text-muted whitespace-nowrap">
                  <input
                    type="radio"
                    name={`tenant_status__${li.id}`}
                    value="tenant_charge"
                    defaultChecked={li.tenant_status === 'tenant_charge'}
                  />
                  Charge
                </label>
              </div>
              <div role="cell">
                <label className="flex items-center gap-1.5 text-[12px] text-text-muted whitespace-nowrap">
                  <input
                    type="radio"
                    name={`tenant_status__${li.id}`}
                    value="approved"
                    defaultChecked={li.tenant_status === 'approved'}
                  />
                  Approved
                </label>
              </div>
            </div>
          ))}
        </div>
        <div className="px-6 py-4 border-b border-border flex justify-end">
          <button
            type="submit"
            className="bg-accent hover:bg-accent-hover text-white rounded-[var(--radius-sm)] px-4 py-2 text-[13px] font-semibold"
          >
            Save all changes
          </button>
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
              <option value="GPM Staff">GPM Staff</option>
              <option value="Outside Vendor">Outside Vendor</option>
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
