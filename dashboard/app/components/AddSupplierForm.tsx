'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addSupplier } from '@/app/cost-book/actions'

// addSupplier throws on a case-insensitive name collision (docs/designs/
// propinspec-cost-book-dashboard.md's R2-2 fix) -- caught and shown inline
// rather than a raw form action, so the admin sees WHY nothing happened.
export default function AddSupplierForm() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border border-dashed border-border rounded-[var(--radius-md)] p-4 text-[13px] text-text-muted hover:border-accent hover:text-accent text-left"
      >
        + Add Supplier
      </button>
    )
  }

  return (
    <div className="border border-accent rounded-[var(--radius-md)] p-4">
      <label className="block text-[10px] font-semibold uppercase tracking-wide text-text-muted mb-1">
        Supplier Name
      </label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Lowe's"
        className="border border-border rounded-[var(--radius-sm)] px-2 py-1.5 text-[13px] w-full bg-surface"
        autoFocus
      />
      {error && <div className="text-[11px] text-error mt-1">{error}</div>}
      <div className="flex items-center gap-2 mt-2">
        <button
          type="button"
          disabled={isPending || !name.trim()}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              try {
                const fd = new FormData()
                fd.set('name', name)
                await addSupplier(fd)
                setOpen(false)
                setName('')
                router.refresh()
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to add supplier.')
              }
            })
          }
          className="bg-accent hover:bg-accent-hover text-white rounded-[var(--radius-sm)] px-2.5 py-1 text-[11px] font-semibold disabled:opacity-50"
        >
          {isPending ? 'Adding…' : 'Add'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setName('')
            setError(null)
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
