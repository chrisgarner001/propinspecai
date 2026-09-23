'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { renameSupplier } from '@/app/cost-book/actions'

// Dashboard tile for one supplier (docs/designs/propinspec-cost-book-dashboard.md).
// Rename lives here rather than a separate admin page -- renameSupplier
// throws on a case-insensitive name collision, caught and shown inline,
// same error-display pattern as SaveAsStockItem.
export default function SupplierTile({
  id,
  name,
  materialCount,
}: {
  id: string
  name: string
  materialCount: number
}) {
  const [renaming, setRenaming] = useState(false)
  const [value, setValue] = useState(name)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  if (renaming) {
    return (
      <div className="border border-accent rounded-[var(--radius-md)] p-4">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="border border-border rounded-[var(--radius-sm)] px-2 py-1 text-[13px] w-full bg-surface"
          autoFocus
        />
        {error && <div className="text-[11px] text-error mt-1">{error}</div>}
        <div className="flex items-center gap-2 mt-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                setError(null)
                try {
                  await renameSupplier(id, value)
                  setRenaming(false)
                  router.refresh()
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Failed to rename.')
                }
              })
            }
            className="bg-accent hover:bg-accent-hover text-white rounded-[var(--radius-sm)] px-2.5 py-1 text-[11px] font-semibold disabled:opacity-50"
          >
            {isPending ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => {
              setValue(name)
              setError(null)
              setRenaming(false)
            }}
            disabled={isPending}
            className="text-[11px] text-text-muted hover:underline"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="border border-border rounded-[var(--radius-md)] p-4 hover:border-accent hover:bg-surface-alt group relative">
      <a href={`/cost-book/suppliers/${encodeURIComponent(name)}`} className="block">
        <div className="font-display font-bold text-[14px]">{name}</div>
        <div className="text-[12px] text-text-muted mt-1">
          {materialCount} material{materialCount === 1 ? '' : 's'}
        </div>
      </a>
      <button
        type="button"
        onClick={() => setRenaming(true)}
        className="absolute top-3 right-3 text-[10px] font-semibold text-text-muted hover:text-accent opacity-0 group-hover:opacity-100"
      >
        Rename
      </button>
    </div>
  )
}
