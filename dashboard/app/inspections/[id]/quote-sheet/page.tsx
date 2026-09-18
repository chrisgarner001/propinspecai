import { getSql } from '@/lib/db'
import { notFound } from 'next/navigation'
import { updateQuoteSheetItems, createBatches, duplicateLineItem, addLineItemSku, removeLineItemSku } from '@/app/actions'
import AppShell from '@/app/components/AppShell'
import LineItemAssignment from '@/app/components/LineItemAssignment'
import RemoveSectionControl from '@/app/components/RemoveSectionControl'
import SaveChangesButton from '@/app/components/SaveChangesButton'
import StatusSelect from '@/app/components/StatusSelect'

// Options for this page's status pill -- a strict subset of the full
// inspections.status enum (see StatusBadge.tsx's STATUS_ORDER). "Under
// Review" is left out: by the time a Quote Sheet exists, an inspection
// going back to that stage doesn't make sense. Both this pill and the
// inspection detail page's pill write the same inspections.status column,
// so changing it here or there stays in sync everywhere.
const QUOTE_SHEET_STATUS_OPTIONS = ['quote_sent', 'approved', 'scheduled', 'in_process', 'completed']

// The Dispatch Board isn't useful until a quote is actually approved --
// nothing has a Stage assigned yet before then. Any status at or past
// "approved" counts.
const TIMELINE_VISIBLE_STATUSES = ['approved', 'scheduled', 'in_process', 'completed']

// In-app replacement for the old Google-Sheets-based "Turn Scope" export --
// same column set (Area/Details/Comments/Vendor-GPM/Hours/Materials/Vendor
// Quote/Stage), editable in place instead of round-tripping through Drive.
// "Removed from Quote Sheet" items (line_items.tenant_approved) are excluded
// here too, and by the Quote PDF generator, so this editor always reflects
// exactly what the owner will see.

const miniField =
  'text-[12px] border border-border rounded-[var(--radius-sm)] px-1.5 py-1 w-full bg-surface truncate'

function stageAnchor(key: string) {
  return `stage-${key}`
}

// See ROW_COLS comment on the main inspection page: minmax(0, Nfr), not bare
// Nfr, so a long unbroken cell can't force its track wider than its share
// and desync this row's columns from the header row's.
const ROW_COLS =
  'grid-cols-[minmax(0,0.8fr)_minmax(0,1.3fr)_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,0.8fr)]'

type LineItem = {
  id: string
  room_area: string
  item: string
  observed_evidence: string | null
  recommended_action: string | null
  assigned_to: string | null
  vendor_id: string | null
  labor_hours: string | null
  materials_cost: string | null
  vendor_estimated_cost: string | null
  stage_id: string | null
  supplier: string | null
  sku: string | null
  batch_number: number | null
}

type Vendor = { id: string; name: string }
type Stage = { id: string; name: string; sort_order: number }
type AdditionalSku = { id: string; line_item_id: string; supplier: string | null; sku: string | null }

export default async function QuoteSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sql = getSql()

  const [inspection] = await sql`select * from inspections where id = ${id}`
  if (!inspection) notFound()

  const lineItems = (await sql`
    select id, room_area, item, observed_evidence, recommended_action, assigned_to, vendor_id,
      labor_hours, materials_cost, vendor_estimated_cost, stage_id, supplier, sku, batch_number
    from line_items
    where inspection_id = ${id} and tenant_approved = false
    order by room_area, created_at
  `) as unknown as LineItem[]

  const vendors = (await sql`select id, name from vendors order by name`) as unknown as Vendor[]
  const stages = (await sql`select id, name, sort_order from stages order by sort_order`) as unknown as Stage[]
  const stageById = new Map(stages.map((s) => [s.id, s]))

  const additionalSkus = (await sql`
    select id, line_item_id, supplier, sku from line_item_additional_skus
    where line_item_id in ${sql(lineItems.length > 0 ? lineItems.map((li) => li.id) : [''])}
    order by created_at
  `) as unknown as AdditionalSku[]
  const additionalSkusByItem = new Map<string, AdditionalSku[]>()
  for (const row of additionalSkus) {
    if (!additionalSkusByItem.has(row.line_item_id)) additionalSkusByItem.set(row.line_item_id, [])
    additionalSkusByItem.get(row.line_item_id)!.push(row)
  }

  const stageSummary = [
    ...lineItems.reduce((map, li) => {
      const key = li.stage_id ?? 'unassigned'
      if (!map.has(key)) map.set(key, 0)
      map.set(key, map.get(key)! + 1)
      return map
    }, new Map<string, number>()),
  ].sort(([a], [b]) => {
    if (a === 'unassigned') return 1
    if (b === 'unassigned') return -1
    return (stageById.get(a)?.sort_order ?? 0) - (stageById.get(b)?.sort_order ?? 0)
  })

  // The table itself isn't grouped by Stage (still ordered by room_area,
  // same as every other row-editing page in the app) -- jumping to "a
  // stage's section" means jumping to the first row in that order carrying
  // this stage, same anchor technique as the main inspection page's
  // room-area quick-jump links.
  const firstRowIdByStage = new Map<string, string>()
  for (const li of lineItems) {
    const key = li.stage_id ?? 'unassigned'
    if (!firstRowIdByStage.has(key)) firstRowIdByStage.set(key, li.id)
  }

  const [settings] = await sql`select gpm_labor_charge from settings where id = true`
  const laborRate = Number(settings?.gpm_labor_charge ?? 0)

  const totalHours = lineItems.reduce((sum, li) => sum + (li.labor_hours !== null ? Number(li.labor_hours) : 0), 0)

  return (
    <AppShell active="/" reviewerName="Jessica Zilka" title={`Quote Sheet — ${inspection.property_address}`} wide>
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-surface-alt">
        <div className="flex items-center gap-3">
          <div className="text-[13px] text-text-muted">
            {inspection.property_address} · Job <span className="data-mono">{inspection.job_number}</span> ·{' '}
            <span className="data-mono">{totalHours.toFixed(2)}</span> labor hrs total
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Status</span>
            <StatusSelect inspectionId={id} status={inspection.status} options={QUOTE_SHEET_STATUS_OPTIONS} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {TIMELINE_VISIBLE_STATUSES.includes(inspection.status) && (
            <a
              href={`/dispatch-board?job=${id}`}
              className="bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold"
            >
              Dispatch Board
            </a>
          )}
          <form action={createBatches.bind(null, id)}>
            <button
              type="submit"
              className="bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold"
            >
              Create Batches
            </button>
          </form>
          <a
            href={`/inspections/${id}/quote-sheet/stages`}
            className="bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold"
          >
            Stage View
          </a>
          <a
            href={`/inspections/${id}/quote-sheet/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-accent hover:bg-accent-hover text-white rounded-[var(--radius-sm)] px-3.5 py-2 text-[13px] font-semibold"
          >
            Create Quote
          </a>
        </div>
      </div>

      {stageSummary.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 px-6 py-2 border-b border-border bg-surface-alt text-[12px]">
          <span className="font-semibold text-text-muted uppercase tracking-wide text-[11px]">Stages</span>
          {stageSummary.map(([key, count]) => (
            <a key={key} href={`#${stageAnchor(key)}`} className="text-text-muted hover:text-accent hover:underline">
              {key === 'unassigned' ? 'Unassigned' : (stageById.get(key)?.name ?? 'Unknown stage')} ({count})
            </a>
          ))}
        </div>
      )}

      <form action={updateQuoteSheetItems}>
        <input type="hidden" name="inspection_id" value={id} />
        <div role="table">
          <div role="row" className={`grid ${ROW_COLS} gap-2 px-3 py-2.5 border-b border-border`}>
            {['Area', 'Details', 'Comments', 'Vendor/GPM', 'Materials', 'Labor (hrs)', 'Vendor Quote', 'Stage', 'Supplier/SKU'].map((h) => (
              <div key={h} role="columnheader" className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                {h}
              </div>
            ))}
          </div>

          {lineItems.length === 0 && (
            <div className="px-6 py-6 text-[13px] text-text-muted">
              No line items to quote (everything has been removed from the Quote Sheet, or none exist yet).
            </div>
          )}

          {lineItems.map((li) => {
            const stageKey = li.stage_id ?? 'unassigned'
            return (
            <div
              key={li.id}
              id={firstRowIdByStage.get(stageKey) === li.id ? stageAnchor(stageKey) : undefined}
              role="row"
              className={`relative grid ${ROW_COLS} gap-2 items-start px-3 pt-2.5 pb-7 border-b border-border scroll-mt-4`}
            >
              <input type="hidden" name="ids" value={li.id} />
              <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1.5">
                <RemoveSectionControl id={li.id} />
                <button
                  type="submit"
                  formAction={duplicateLineItem.bind(null, li.id, id)}
                  className="text-[10px] font-semibold text-text-muted hover:text-accent border border-border hover:border-accent rounded-[var(--radius-sm)] px-1.5 py-0.5 bg-surface"
                >
                  Duplicate
                </button>
              </div>
              <div role="cell" className="min-w-0">
                <input name={`room_area__${li.id}`} defaultValue={li.room_area} className={miniField} />
              </div>
              <div role="cell" className="min-w-0">
                <input name={`item__${li.id}`} defaultValue={li.item} className={`${miniField} font-semibold`} />
              </div>
              <div role="cell" className="min-w-0 space-y-1">
                <textarea
                  name={`observed_evidence__${li.id}`}
                  defaultValue={li.observed_evidence ?? ''}
                  placeholder="Observed evidence"
                  rows={2}
                  className={`${miniField} data-mono text-text-muted resize-y`}
                />
                <textarea
                  name={`recommended_action__${li.id}`}
                  defaultValue={li.recommended_action ?? ''}
                  placeholder="Recommended action"
                  rows={2}
                  className={`${miniField} text-text-muted resize-y`}
                />
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
              <div role="cell" className="min-w-0">
                <select name={`stage_id__${li.id}`} defaultValue={li.stage_id ?? ''} className={miniField}>
                  <option value="">—</option>
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div role="cell" className="min-w-0 space-y-1">
                <input
                  name={`supplier__${li.id}`}
                  defaultValue={li.supplier ?? ''}
                  placeholder="Supplier"
                  className={miniField}
                />
                <input
                  name={`sku__${li.id}`}
                  defaultValue={li.sku ?? ''}
                  placeholder="SKU"
                  className={`${miniField} data-mono`}
                />
                {(additionalSkusByItem.get(li.id) ?? []).map((row) => (
                  <div key={row.id} className="flex items-center gap-1">
                    <span className="text-[11px] text-text-muted truncate flex-1" title={`${row.supplier ?? '—'} ${row.sku ?? ''}`}>
                      {row.supplier ?? '—'} <span className="data-mono">{row.sku ?? ''}</span>
                    </span>
                    <button
                      type="submit"
                      formAction={removeLineItemSku.bind(null, row.id, id)}
                      title="Remove this SKU"
                      className="text-[11px] text-text-muted hover:text-error leading-none"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <div className="pt-1 border-t border-border space-y-1">
                  <input
                    name={`new_sku_supplier__${li.id}`}
                    placeholder="+ Supplier"
                    className={`${miniField} text-[11px]`}
                  />
                  <div className="flex items-center gap-1">
                    <input
                      name={`new_sku__${li.id}`}
                      placeholder="SKU"
                      className={`${miniField} data-mono text-[11px] flex-1`}
                    />
                    <button
                      type="submit"
                      formAction={addLineItemSku.bind(null, li.id, id)}
                      className="text-[10px] font-semibold text-text-muted hover:text-accent border border-border hover:border-accent rounded-[var(--radius-sm)] px-1.5 py-1 bg-surface whitespace-nowrap"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            </div>
            )
          })}
        </div>
        <div className="px-6 py-4 flex justify-end">
          <SaveChangesButton />
        </div>
      </form>
    </AppShell>
  )
}
