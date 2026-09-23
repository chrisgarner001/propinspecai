'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { suggestHistoricalCost, applyHistoricalCostSuggestion, type CostSuggestion } from '@/app/actions'

// Only ever rendered when Supplier/SKU/materials cost are all blank (see
// the Quote Sheet page) -- suggest-and-confirm, same rule as bulk-item
// auto-fill: nothing here writes anything until the reviewer clicks a
// specific suggestion's Apply button.
export default function SuggestCostFromHistory({
  lineItemId,
  inspectionId,
  itemName,
}: {
  lineItemId: string
  inspectionId: string
  itemName: string
}) {
  const [suggestions, setSuggestions] = useState<CostSuggestion[] | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSuggest() {
    startTransition(async () => {
      const result = await suggestHistoricalCost(itemName)
      setSuggestions(result.suggestions)
    })
  }

  function handleApply(s: CostSuggestion) {
    startTransition(async () => {
      await applyHistoricalCostSuggestion(lineItemId, inspectionId, s.sku, s.unitPrice, s.supplier)
      setSuggestions(null)
      router.refresh()
    })
  }

  if (suggestions === null) {
    return (
      <button
        type="button"
        onClick={handleSuggest}
        disabled={isPending}
        className="text-[11px] text-accent hover:underline disabled:opacity-50"
      >
        {isPending ? 'Searching…' : 'Suggest from history'}
      </button>
    )
  }

  if (suggestions.length === 0) {
    return <div className="text-[11px] text-text-muted">No confident match found in Stock Items or purchase history.</div>
  }

  // Stock Item matches (docs/designs/propinspec-stock-items.md) are GPM's
  // own standardized answer, not a guess from noisy history -- labeled and
  // styled distinctly so a reviewer can tell the difference at a glance.
  const isStock = suggestions[0].source === 'stock'

  return (
    <div className={`space-y-1 rounded-[var(--radius-sm)] p-2 ${isStock ? 'bg-success-bg' : 'bg-accent/5'}`}>
      <div className="text-[11px] font-semibold text-text-muted">
        {isStock ? 'Stock Item match:' : 'Suggested from purchase history:'}
      </div>
      {suggestions.map((s) => (
        <div key={`${s.source}-${s.sku ?? s.materialName}`} className="flex items-center justify-between gap-2 text-[11px]">
          <span className="truncate" title={s.materialName}>
            {s.materialName} <span className="data-mono text-text-muted">${s.unitPrice}</span>
          </span>
          <button
            type="button"
            onClick={() => handleApply(s)}
            disabled={isPending}
            className="shrink-0 bg-accent hover:bg-accent-hover text-white rounded-[var(--radius-sm)] px-2 py-0.5 font-semibold disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      ))}
    </div>
  )
}
