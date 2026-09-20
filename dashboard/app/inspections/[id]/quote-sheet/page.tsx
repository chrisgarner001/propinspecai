import { getSql } from '@/lib/db'
import { notFound } from 'next/navigation'
import {
  updateQuoteSheetItems,
  createBatches,
  duplicateLineItem,
  addLineItemSku,
  removeLineItemSku,
  addBulkMaterial,
  removeBulkMaterial,
  updateBulkMaterial,
  applyBulkMaterialMatches,
  dismissBulkMaterialMatches,
  linkLineItemToBulkMaterial,
} from '@/app/actions'
import { matchBulkMaterialCandidates } from '@/lib/bulkMatch'
import AppShell from '@/app/components/AppShell'
import LineItemVendorAssignment from '@/app/components/LineItemVendorAssignment'
import LineItemMaterialsCost from '@/app/components/LineItemMaterialsCost'
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
  'grid-cols-[minmax(0,0.8fr)_minmax(0,1.3fr)_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)]'

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
  sku_quantity: string | null
  batch_number: number | null
}

type Vendor = { id: string; name: string }
type Stage = { id: string; name: string; sort_order: number }
type AdditionalSku = { id: string; line_item_id: string; supplier: string | null; sku: string | null; quantity: string | null }
type BulkMaterial = {
  id: string
  supplier: string | null
  sku: string | null
  quantity: string | null
  notes: string | null
  cost: string | null
  matches_reviewed: boolean
}

export default async function QuoteSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ editBulk?: string }>
}) {
  const { id } = await params
  const { editBulk } = await searchParams
  const sql = getSql()

  const [inspection] = await sql`select * from inspections where id = ${id}`
  if (!inspection) notFound()

  const lineItems = (await sql`
    select id, room_area, item, observed_evidence, recommended_action, assigned_to, vendor_id,
      labor_hours, materials_cost, vendor_estimated_cost, stage_id, supplier, sku, sku_quantity, batch_number
    from line_items
    where inspection_id = ${id} and tenant_approved = false
    order by room_area, created_at
  `) as unknown as LineItem[]

  const vendors = (await sql`select id, name from vendors order by name`) as unknown as Vendor[]
  const stages = (await sql`select id, name, sort_order from stages order by sort_order`) as unknown as Stage[]
  const stageById = new Map(stages.map((s) => [s.id, s]))

  const additionalSkus = (await sql`
    select id, line_item_id, supplier, sku, quantity from line_item_additional_skus
    where line_item_id in ${sql(lineItems.length > 0 ? lineItems.map((li) => li.id) : [''])}
    order by created_at
  `) as unknown as AdditionalSku[]
  const additionalSkusByItem = new Map<string, AdditionalSku[]>()
  for (const row of additionalSkus) {
    if (!additionalSkusByItem.has(row.line_item_id)) additionalSkusByItem.set(row.line_item_id, [])
    additionalSkusByItem.get(row.line_item_id)!.push(row)
  }

  const bulkMaterials = (await sql`
    select id, supplier, sku, quantity, notes, cost, matches_reviewed from inspection_bulk_materials
    where inspection_id = ${id}
    order by created_at
  `) as unknown as BulkMaterial[]

  // Bulk-item auto-fill (docs/designs/quote-sheet-bulk-item-auto-fill.md): a
  // suggest-and-confirm banner, not a silent write -- computed here from data
  // already on the page (same rule matchBulkMaterialCandidates uses server-side
  // on Apply), so nothing changes on a real quote until the reviewer clicks
  // Apply.
  const bulkMatchCandidates = new Map<string, LineItem[]>()
  for (const bm of bulkMaterials) {
    if (bm.matches_reviewed) continue
    const candidates = matchBulkMaterialCandidates(bm, lineItems)
    if (candidates.length > 0) bulkMatchCandidates.set(bm.id, candidates as LineItem[])
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
    <AppShell active="/" title={`Quote Sheet — ${inspection.property_address}`} wide>
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
              Create Stages
            </button>
          </form>
          <a
            href={`/inspections/${id}/quote-sheet/stages`}
            className="bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold"
          >
            Stage View
          </a>
          <a
            href={`/inspections/${id}/quote-sheet/materials-order/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold"
          >
            Materials Order List
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

      <div className="px-6 py-3 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold text-text-muted uppercase tracking-wide text-[11px]">Bulk Materials</span>
          <span className="text-[11px] text-text-muted">
            One purchase used across multiple line items (a contractor pack, a roll of screen material) — not tied
            to any single item above.
          </span>
        </div>

        {bulkMaterials.length > 0 && (
          <div className="mb-3 space-y-2">
            {bulkMaterials.map((bm, index) => (
              <div key={bm.id} className="border border-border rounded-[var(--radius-sm)] p-2">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                    Material Item {index + 1}
                  </span>
                  {editBulk !== bm.id && (
                    <div className="flex items-center gap-3 leading-none">
                      <a
                        href={`/inspections/${id}/quote-sheet?editBulk=${bm.id}`}
                        className="text-[11px] font-semibold text-text-muted hover:text-accent leading-none"
                      >
                        Edit
                      </a>
                      <form action={removeBulkMaterial.bind(null, bm.id, id)} className="contents">
                        <button
                          type="submit"
                          className="appearance-none bg-transparent border-0 p-0 text-[11px] font-semibold text-error hover:text-error/70 leading-none"
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  )}
                </div>

                {editBulk === bm.id ? (
                  <form action={updateBulkMaterial.bind(null, bm.id, id)} className="flex items-end gap-2 flex-wrap">
                    <div className="flex-1 min-w-[140px]">
                      <label className="block text-[10px] font-semibold uppercase tracking-wide text-text-muted mb-1">
                        Supplier
                      </label>
                      <input name="bulk_supplier" defaultValue={bm.supplier ?? ''} className={miniField} />
                    </div>
                    <div className="flex-1 min-w-[140px]">
                      <label className="block text-[10px] font-semibold uppercase tracking-wide text-text-muted mb-1">
                        SKU
                      </label>
                      <input name="bulk_sku" defaultValue={bm.sku ?? ''} className={`${miniField} data-mono`} />
                    </div>
                    <div className="w-24">
                      <label className="block text-[10px] font-semibold uppercase tracking-wide text-text-muted mb-1">
                        Qty
                      </label>
                      <input name="bulk_quantity" defaultValue={bm.quantity ?? ''} className={miniField} />
                    </div>
                    <div className="w-24">
                      <label className="block text-[10px] font-semibold uppercase tracking-wide text-text-muted mb-1">
                        Cost
                      </label>
                      <input name="bulk_cost" type="number" step="0.01" defaultValue={bm.cost ?? ''} className={miniField} />
                    </div>
                    <div className="flex-[2] min-w-[180px]">
                      <label className="block text-[10px] font-semibold uppercase tracking-wide text-text-muted mb-1">
                        Notes
                      </label>
                      <input name="bulk_notes" defaultValue={bm.notes ?? ''} className={miniField} />
                    </div>
                    <button
                      type="submit"
                      className="bg-accent hover:bg-accent-hover text-white rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap"
                    >
                      Save
                    </button>
                    <a
                      href={`/inspections/${id}/quote-sheet`}
                      className="bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap"
                    >
                      Cancel
                    </a>
                  </form>
                ) : (
                  <div className="text-[12px]">
                    <span className="font-semibold">{bm.supplier ?? '—'}</span>{' '}
                    <span className="data-mono text-text-muted">{bm.sku ?? ''}</span>
                    {bm.quantity && <span className="text-text-muted"> · Qty {bm.quantity}</span>}
                    {bm.cost && <span className="text-text-muted"> · Cost ${Number(bm.cost).toFixed(2)}</span>}
                    {bm.notes && <span className="text-text-muted"> — {bm.notes}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <form action={addBulkMaterial.bind(null, id)} className="flex items-end gap-2 flex-wrap">
          <div className="flex-1 min-w-[140px]">
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-text-muted mb-1">Supplier</label>
            <input name="bulk_supplier" className={miniField} />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-text-muted mb-1">SKU</label>
            <input name="bulk_sku" className={`${miniField} data-mono`} />
          </div>
          <div className="w-24">
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-text-muted mb-1">Qty</label>
            <input name="bulk_quantity" placeholder="e.g. 1 pack" className={miniField} />
          </div>
          <div className="w-24">
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-text-muted mb-1">Cost</label>
            <input name="bulk_cost" type="number" step="0.01" placeholder="e.g. 18.00" className={miniField} />
          </div>
          <div className="flex-[2] min-w-[180px]">
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-text-muted mb-1">Notes</label>
            <input name="bulk_notes" placeholder="e.g. covers all outlet replacements" className={miniField} />
          </div>
          <button
            type="submit"
            className="bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap"
          >
            Add Bulk Item
          </button>
        </form>
      </div>

      {[...bulkMatchCandidates.entries()].map(([bmId, candidates]) => {
        const bm = bulkMaterials.find((b) => b.id === bmId)!
        return (
          <form
            key={bmId}
            action={applyBulkMaterialMatches.bind(null, bmId, id)}
            className="px-6 py-3 border-b border-border bg-accent/5 space-y-2"
          >
            <div className="text-[12px]">
              <span className="font-semibold">
                Matched {candidates.length} item{candidates.length > 1 ? 's' : ''}
              </span>{' '}
              for bulk item <span className="font-semibold">{bm.supplier ?? bm.sku ?? 'this item'}</span> — apply its
              Supplier/SKU to the ones checked below?
            </div>
            <div className="space-y-1">
              {candidates.map((li) => (
                <label key={li.id} className="flex items-center gap-2 text-[12px]">
                  <input type="checkbox" name="apply_item_id" value={li.id} defaultChecked />
                  <span>
                    {li.room_area} — {li.item}
                  </span>
                </label>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="bg-accent hover:bg-accent-hover text-white rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold"
              >
                Apply
              </button>
              <button
                type="submit"
                formAction={dismissBulkMaterialMatches.bind(null, bmId, id)}
                className="bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold"
              >
                Dismiss
              </button>
            </div>
          </form>
        )
      })}

      <form action={updateQuoteSheetItems}>
        <input type="hidden" name="inspection_id" value={id} />
        <div role="table">
          <div role="row" className={`grid ${ROW_COLS} gap-2 px-3 py-2.5 border-b border-border`}>
            {['Area', 'Details', 'Comments', 'Vendor/GPM', 'Vendor Quote', 'Stage'].map((h) => (
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
              className={`grid ${ROW_COLS} gap-2 items-start px-3 pt-2.5 pb-2.5 border-b border-border scroll-mt-4`}
            >
              <input type="hidden" name="ids" value={li.id} />
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
              <LineItemVendorAssignment
                id={li.id}
                assignedTo={li.assigned_to}
                vendorId={li.vendor_id}
                vendors={vendors}
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
              <div role="cell" className="col-span-full flex items-center gap-3 mt-1">
                <span className="text-[11px] font-semibold data-mono">
                  Total: $
                  {(li.assigned_to === 'Outside Vendor'
                    ? Number(li.vendor_estimated_cost ?? 0)
                    : Number(li.materials_cost ?? 0) + Number(li.labor_hours ?? 0) * laborRate
                  ).toFixed(2)}
                </span>
                <RemoveSectionControl id={li.id} />
                <button
                  type="submit"
                  formAction={duplicateLineItem.bind(null, li.id, id)}
                  className="text-[10px] font-semibold text-text-muted hover:text-accent border border-border hover:border-accent rounded-[var(--radius-sm)] px-1.5 py-0.5 bg-surface"
                >
                  Duplicate
                </button>
              </div>
              <div role="cell" className="col-span-full mt-1 pt-2 border-t border-border">
                <div className="text-center text-[10px] font-semibold uppercase tracking-wide text-text-muted mb-1.5">
                  Materials for this Item
                </div>
                <div className="flex flex-wrap items-end gap-2">
                <div className="w-36">
                  <input
                    name={`supplier__${li.id}`}
                    defaultValue={li.supplier ?? ''}
                    placeholder="Supplier"
                    className={miniField}
                  />
                </div>
                <div className="w-28">
                  <input
                    name={`sku__${li.id}`}
                    defaultValue={li.sku ?? ''}
                    placeholder="SKU"
                    className={`${miniField} data-mono`}
                  />
                </div>
                <div className="w-16">
                  <input
                    name={`sku_quantity__${li.id}`}
                    defaultValue={li.sku_quantity ?? ''}
                    placeholder="Qty"
                    title="Quantity"
                    className={miniField}
                  />
                </div>
                <LineItemMaterialsCost
                  id={li.id}
                  assignedTo={li.assigned_to}
                  materialsCost={li.materials_cost}
                  laborHours={li.labor_hours}
                  laborRate={laborRate}
                />

                {(additionalSkusByItem.get(li.id) ?? []).map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center gap-1.5 bg-surface-alt border border-border rounded-[var(--radius-sm)] pl-2 pr-1.5 py-1"
                  >
                    <span className="text-[11px] text-text-muted truncate max-w-[180px]" title={`${row.supplier ?? '—'} ${row.sku ?? ''}`}>
                      {row.supplier ?? '—'} <span className="data-mono">{row.sku ?? ''}</span>
                      {row.quantity && <span> · Qty {row.quantity}</span>}
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

                <div className="flex items-end gap-1.5 pl-2 ml-1 border-l border-border">
                  <input
                    name={`new_sku_supplier__${li.id}`}
                    placeholder="+ Supplier"
                    className={`${miniField} text-[11px] w-28`}
                  />
                  <input
                    name={`new_sku__${li.id}`}
                    placeholder="SKU"
                    className={`${miniField} data-mono text-[11px] w-24`}
                  />
                  <input
                    name={`new_sku_quantity__${li.id}`}
                    placeholder="Qty"
                    title="Quantity"
                    className={`${miniField} text-[11px] w-12`}
                  />
                  <button
                    type="submit"
                    formAction={addLineItemSku.bind(null, li.id, id)}
                    className="text-[10px] font-semibold text-text-muted hover:text-accent border border-border hover:border-accent rounded-[var(--radius-sm)] px-1.5 py-1 bg-surface whitespace-nowrap"
                  >
                    Add Item
                  </button>
                </div>

                {bulkMaterials.length > 0 && (
                  <div className="flex items-end gap-1.5 pl-2 ml-1 border-l border-border">
                    <select
                      name={`bulk_material_id__${li.id}`}
                      defaultValue=""
                      className={`${miniField} text-[11px] w-40`}
                    >
                      <option value="" disabled>
                        Choose bulk item…
                      </option>
                      {bulkMaterials.map((bm) => (
                        <option key={bm.id} value={bm.id}>
                          {bm.supplier ?? '—'} {bm.sku ?? ''}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      formAction={linkLineItemToBulkMaterial.bind(null, li.id, id)}
                      className="text-[10px] font-semibold text-text-muted hover:text-accent border border-border hover:border-accent rounded-[var(--radius-sm)] px-1.5 py-1 bg-surface whitespace-nowrap"
                    >
                      Use Bulk Item
                    </button>
                  </div>
                )}
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
