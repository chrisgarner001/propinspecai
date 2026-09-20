'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { linkLineItemToBulkMaterial } from '@/app/actions'

const miniField =
  'text-[12px] border border-border rounded-[var(--radius-sm)] px-1.5 py-1 w-full bg-surface truncate'

type BulkMaterial = { id: string; supplier: string | null; sku: string | null }

// Picking a value submits immediately -- a separate "Use Bulk Item" button
// next to a dropdown that only has one real choice to confirm was redundant
// once the dropdown itself can just act on selection.
export default function LinkBulkMaterialSelect({
  lineItemId,
  inspectionId,
  bulkMaterials,
}: {
  lineItemId: string
  inspectionId: string
  bulkMaterials: BulkMaterial[]
}) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const bulkMaterialId = e.target.value
    if (!bulkMaterialId) return
    startTransition(async () => {
      await linkLineItemToBulkMaterial(lineItemId, inspectionId, bulkMaterialId)
      router.refresh()
    })
    e.target.value = ''
  }

  return (
    <select onChange={handleChange} disabled={isPending} defaultValue="" className={`${miniField} w-40`}>
      <option value="" disabled>
        {isPending ? 'Applying…' : 'Choose bulk item…'}
      </option>
      {bulkMaterials.map((bm) => (
        <option key={bm.id} value={bm.id}>
          {bm.supplier ?? '—'} {bm.sku ?? ''}
        </option>
      ))}
    </select>
  )
}
