'use client'

import { useState, useTransition } from 'react'
import { runAutoBuildQuote, type AutoBuildResult } from '@/app/actions'

// "Run Auto Build" (user request, 2026-09-22): the bulk version of the
// per-item "Suggest from history" button (SuggestCostFromHistory.tsx) --
// runs that same historical-cost lookup for every blank line item on the
// inspection in one pass instead of one click per item. Shows what
// actually happened afterward, same "never silently succeed/fail"
// discipline as CreateBatchesButton.
export default function RunAutoBuildButton({ inspectionId }: { inspectionId: string }) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<AutoBuildResult | null>(null)

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(async () => setResult(await runAutoBuildQuote(inspectionId)))}
        className="bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
      >
        {isPending ? 'Running Auto Build…' : 'Run Auto Build'}
      </button>
      {result && (
        <div className="text-[11px] text-text-muted max-w-xs">
          {result.total === 0
            ? 'Nothing to auto-fill — every item already has a supplier/SKU/cost or none are blank.'
            : `Auto-filled ${result.applied} of ${result.total} blank item${result.total === 1 ? '' : 's'}.${
                result.skipped > 0 ? ` ${result.skipped} had no confident match.` : ''
              }`}
        </div>
      )}
    </div>
  )
}
