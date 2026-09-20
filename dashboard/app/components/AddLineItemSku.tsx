'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addLineItemSku, addLineItemSkuFromBulkMaterial } from '@/app/actions'
import LaborHoursInput from './LaborHoursInput'

const miniField =
  'text-[12px] border border-border rounded-[var(--radius-sm)] px-1.5 py-1 w-full bg-surface truncate'

const costField =
  'data-mono border border-border rounded-[var(--radius-sm)] px-2 py-1 w-full min-w-0 bg-surface disabled:bg-surface-alt disabled:text-text-muted'

type BulkMaterial = { id: string; supplier: string | null; sku: string | null }

// "Add Item" used to sit next to a permanently-visible blank Supplier/SKU/Qty
// mini-form -- which made every section look like it already had a 2nd item
// by default, and that mini-form's boxes were smaller than the line item's
// real (primary) Supplier/SKU/Qty boxes, adding to the "two different
// things" look. Now: nothing extra shows until "Add Item" is clicked, and
// what it reveals is full-size, matching the primary box exactly -- a real
// duplicate of it, including its own Materials $/Labor (hrs) fields, either
// typed freehand or filled from a picked Bulk Material, then saved and
// collapsed back to just the button again. Click it again for a third item.
export default function AddLineItemSku({
  lineItemId,
  inspectionId,
  assignedTo,
  bulkMaterials,
}: {
  lineItemId: string
  inspectionId: string
  assignedTo: string | null
  bulkMaterials: BulkMaterial[]
}) {
  const [open, setOpen] = useState(false)
  const [supplier, setSupplier] = useState('')
  const [sku, setSku] = useState('')
  const [quantity, setQuantity] = useState('')
  const [materialsCost, setMaterialsCost] = useState('')
  const [laborHours, setLaborHours] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const selfPerformed = assignedTo === 'GPM Staff' || assignedTo === 'Other'

  function reset() {
    setSupplier('')
    setSku('')
    setQuantity('')
    setMaterialsCost('')
    setLaborHours('')
    setOpen(false)
  }

  function handleSaveFreehand() {
    if (!supplier.trim() && !sku.trim()) return
    setError(null)
    const formData = new FormData()
    formData.set(`new_sku_supplier__${lineItemId}`, supplier)
    formData.set(`new_sku__${lineItemId}`, sku)
    formData.set(`new_sku_quantity__${lineItemId}`, quantity)
    formData.set(`new_sku_materials_cost__${lineItemId}`, materialsCost)
    formData.set(`new_sku_labor_hours__${lineItemId}`, laborHours)
    startTransition(async () => {
      try {
        await addLineItemSku(lineItemId, inspectionId, formData)
        reset()
        router.refresh()
      } catch (err) {
        // Surfaced instead of swallowed: a stale page open across a
        // redeploy (Next.js Server Actions are keyed per build) fails
        // exactly like this -- silently, with the click otherwise looking
        // like it did nothing.
        setError((err as Error).message || 'Something went wrong. Try reloading the page.')
      }
    })
  }

  function handleUseBulkItem(e: React.ChangeEvent<HTMLSelectElement>) {
    const bulkMaterialId = e.target.value
    if (!bulkMaterialId) return
    setError(null)
    startTransition(async () => {
      try {
        await addLineItemSkuFromBulkMaterial(lineItemId, inspectionId, bulkMaterialId)
        reset()
        router.refresh()
      } catch (err) {
        setError((err as Error).message || 'Something went wrong. Try reloading the page.')
      }
    })
    e.target.value = ''
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[10px] font-semibold text-text-muted hover:text-accent border border-border hover:border-accent rounded-[var(--radius-sm)] px-1.5 py-1 bg-surface whitespace-nowrap"
      >
        Add Item
      </button>
    )
  }

  return (
    <div className="w-full pt-2 mt-1 border-t border-border space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex items-end gap-2">
          <div className="w-36">
            <input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Supplier" className={miniField} />
          </div>
          <div className="w-28">
            <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU" className={`${miniField} data-mono`} />
          </div>
          <div className="w-16">
            <input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Qty" title="Quantity" className={miniField} />
          </div>
        </div>
        <div className="flex items-end gap-2">
          <div className="w-24">
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-text-muted mb-1">Materials $</label>
            <input
              value={materialsCost}
              onChange={(e) => setMaterialsCost(e.target.value)}
              type="number"
              step="5"
              disabled={!selfPerformed}
              placeholder="—"
              className={costField}
            />
          </div>
          <div className="w-28">
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-text-muted mb-1">Labor (hrs)</label>
            <LaborHoursInput defaultValue={laborHours} disabled={!selfPerformed} onValueChange={setLaborHours} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <button
          type="button"
          onClick={handleSaveFreehand}
          disabled={isPending}
          className="bg-accent hover:bg-accent-hover text-white rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Save Item'}
        </button>
        {bulkMaterials.length > 0 && (
          <>
            <span className="text-[11px] text-text-muted">or</span>
            <select onChange={handleUseBulkItem} disabled={isPending} defaultValue="" className={`${miniField} w-40`}>
              <option value="" disabled>
                Choose bulk item…
              </option>
              {bulkMaterials.map((bm) => (
                <option key={bm.id} value={bm.id}>
                  {bm.supplier ?? '—'} {bm.sku ?? ''}
                </option>
              ))}
            </select>
          </>
        )}
        <button type="button" onClick={reset} className="text-[11px] font-semibold text-text-muted hover:text-text">
          Cancel
        </button>
      </div>

      {error && <div className="text-[11px] text-error">{error} — try reloading the page.</div>}
    </div>
  )
}
