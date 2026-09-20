'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addLineItemSku, addLineItemSkuFromBulkMaterial } from '@/app/actions'

const miniField =
  'text-[12px] border border-border rounded-[var(--radius-sm)] px-1.5 py-1 w-full bg-surface truncate'

type BulkMaterial = { id: string; supplier: string | null; sku: string | null }

// "Add Item" used to sit next to a permanently-visible blank Supplier/SKU/Qty
// mini-form -- which made every section look like it already had a 2nd item
// by default, and that mini-form's boxes were smaller than the line item's
// real (primary) Supplier/SKU/Qty boxes, adding to the "two different
// things" look. Now: nothing extra shows until "Add Item" is clicked, and
// what it reveals is full-size, matching the primary box exactly -- a real
// duplicate of it, either typed freehand or filled from a picked Bulk
// Material, then saved and collapsed back to just the button again. Click
// it again for a third item, and so on.
export default function AddLineItemSku({
  lineItemId,
  inspectionId,
  bulkMaterials,
}: {
  lineItemId: string
  inspectionId: string
  bulkMaterials: BulkMaterial[]
}) {
  const [open, setOpen] = useState(false)
  const [supplier, setSupplier] = useState('')
  const [sku, setSku] = useState('')
  const [quantity, setQuantity] = useState('')
  const [bulkMaterialId, setBulkMaterialId] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function reset() {
    setSupplier('')
    setSku('')
    setQuantity('')
    setBulkMaterialId('')
    setOpen(false)
  }

  function handleSaveFreehand() {
    if (!supplier.trim() && !sku.trim()) return
    setError(null)
    const formData = new FormData()
    formData.set(`new_sku_supplier__${lineItemId}`, supplier)
    formData.set(`new_sku__${lineItemId}`, sku)
    formData.set(`new_sku_quantity__${lineItemId}`, quantity)
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

  function handleUseBulkItem() {
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
    <div className="w-full flex flex-wrap items-end gap-2 pt-2 mt-1 border-t border-border">
      <div className="w-36">
        <input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Supplier" className={miniField} />
      </div>
      <div className="w-28">
        <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU" className={`${miniField} data-mono`} />
      </div>
      <div className="w-16">
        <input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Qty" title="Quantity" className={miniField} />
      </div>
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
          <select
            value={bulkMaterialId}
            onChange={(e) => setBulkMaterialId(e.target.value)}
            className={`${miniField} w-40`}
          >
            <option value="">Choose bulk item…</option>
            {bulkMaterials.map((bm) => (
              <option key={bm.id} value={bm.id}>
                {bm.supplier ?? '—'} {bm.sku ?? ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleUseBulkItem}
            disabled={isPending || !bulkMaterialId}
            className="bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap disabled:opacity-50"
          >
            Use Bulk Item
          </button>
        </>
      )}

      <button
        type="button"
        onClick={reset}
        className="text-[11px] font-semibold text-text-muted hover:text-text"
      >
        Cancel
      </button>

      {error && <div className="basis-full text-[11px] text-error">{error} — try reloading the page.</div>}
    </div>
  )
}
