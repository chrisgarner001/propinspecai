'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addLineItemSku } from '@/app/actions'

const miniField =
  'text-[12px] border border-border rounded-[var(--radius-sm)] px-1.5 py-1 w-full bg-surface truncate'

// Was a plain <form>/formAction button like the rest of this page's
// immediate-action controls (Duplicate, Remove SKU) -- switched to a client
// component after a user report that "Add Item does nothing." The write
// itself DID succeed (confirmed directly against the database both times),
// but with uncontrolled inputs, a full-page server-action round trip doesn't
// clear the text the reviewer just typed -- React only applies `defaultValue`
// on mount, not on the re-render that follows revalidatePath, so the same
// text sits in the box afterward with no visible change except a new chip
// elsewhere in a long flex-wrap row, easy to miss. Controlled state here lets
// the fields actually clear and the button show "Adding…", so success is
// visible instead of indistinguishable from nothing happening.
export default function AddLineItemSku({ lineItemId, inspectionId }: { lineItemId: string; inspectionId: string }) {
  const [supplier, setSupplier] = useState('')
  const [sku, setSku] = useState('')
  const [quantity, setQuantity] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleAdd() {
    if (!supplier.trim() && !sku.trim()) return
    const formData = new FormData()
    formData.set(`new_sku_supplier__${lineItemId}`, supplier)
    formData.set(`new_sku__${lineItemId}`, sku)
    formData.set(`new_sku_quantity__${lineItemId}`, quantity)
    startTransition(async () => {
      await addLineItemSku(lineItemId, inspectionId, formData)
      setSupplier('')
      setSku('')
      setQuantity('')
      router.refresh()
    })
  }

  return (
    <div className="flex items-end gap-1.5 pl-2 ml-1 border-l border-border">
      <input
        value={supplier}
        onChange={(e) => setSupplier(e.target.value)}
        placeholder="+ Supplier"
        className={`${miniField} text-[11px] w-28`}
      />
      <input
        value={sku}
        onChange={(e) => setSku(e.target.value)}
        placeholder="SKU"
        className={`${miniField} data-mono text-[11px] w-24`}
      />
      <input
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        placeholder="Qty"
        title="Quantity"
        className={`${miniField} text-[11px] w-12`}
      />
      <button
        type="button"
        onClick={handleAdd}
        disabled={isPending}
        className="text-[10px] font-semibold text-text-muted hover:text-accent border border-border hover:border-accent rounded-[var(--radius-sm)] px-1.5 py-1 bg-surface whitespace-nowrap disabled:opacity-50"
      >
        {isPending ? 'Adding…' : 'Add Item'}
      </button>
    </div>
  )
}
