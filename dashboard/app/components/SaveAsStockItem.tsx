'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { promoteToStockItem } from '@/app/actions'

// "Save as Stock Item" (docs/designs/propinspec-stock-items.md) -- only
// rendered once Supplier/SKU/materials cost are already saved on this line
// item (see the Quote Sheet render), so promoteToStockItem always has real
// values to read. `categories` is the distinct list already in stock_items,
// offered via datalist so a reviewer reuses an existing bucket (outlets,
// switches, etc.) instead of accidentally forking a near-duplicate one --
// still free text underneath, not a locked enum.
export default function SaveAsStockItem({
  lineItemId,
  categories,
}: {
  lineItemId: string
  categories: string[]
}) {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  if (done) {
    return <div className="text-[11px] text-success">Saved as a Stock Item.</div>
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] text-accent hover:underline"
      >
        Save as Stock Item
      </button>
    )
  }

  function handleSave() {
    setError(null)
    startTransition(async () => {
      try {
        await promoteToStockItem(lineItemId, category)
        setDone(true)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save.')
      }
    })
  }

  return (
    <div className="flex flex-wrap items-end gap-2 bg-success-bg rounded-[var(--radius-sm)] p-2">
      <div>
        <label className="block text-[10px] font-semibold uppercase tracking-wide text-text-muted mb-1">
          Category
        </label>
        <input
          list={`stock-categories-${lineItemId}`}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="e.g. Outlets"
          className="border border-border rounded-[var(--radius-sm)] px-2 py-1 text-[11px] bg-surface w-36"
        />
        <datalist id={`stock-categories-${lineItemId}`}>
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
      <button
        type="button"
        onClick={handleSave}
        disabled={isPending || !category.trim()}
        className="bg-accent hover:bg-accent-hover text-white rounded-[var(--radius-sm)] px-2.5 py-1 text-[11px] font-semibold disabled:opacity-50"
      >
        {isPending ? 'Saving…' : 'Save'}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        disabled={isPending}
        className="text-[11px] text-text-muted hover:underline"
      >
        Cancel
      </button>
      {error && <div className="w-full text-[11px] text-error">{error}</div>}
    </div>
  )
}
