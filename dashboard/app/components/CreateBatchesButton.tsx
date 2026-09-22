'use client'

import { useState, useTransition } from 'react'
import { createBatches, type CreateBatchesResult } from '@/app/actions'

// Used to be a plain <form action={createBatches.bind(...)}> button with
// zero feedback either way -- a reviewer had no way to tell "nothing to
// batch, everything's already done" from "nothing got batched because every
// remaining item is missing a Stage or a vendor," which reads as "the
// button doesn't work" (the real 2026-09-22 report against a live
// inspection). Calls the action directly via useTransition instead, so the
// actual outcome can be shown inline.
export default function CreateBatchesButton({
  inspectionId,
  label,
  className,
}: {
  inspectionId: string
  label: string
  className?: string
}) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<CreateBatchesResult | null>(null)

  const skipReasons = result
    ? [
        result.skippedNoStage > 0 ? `${result.skippedNoStage} missing a Stage` : null,
        result.skippedNoVendor > 0 ? `${result.skippedNoVendor} Outside Vendor with no vendor picked` : null,
        result.skippedOtherAssignment > 0 ? `${result.skippedOtherAssignment} assigned "Other"` : null,
        result.skippedUnassigned > 0 ? `${result.skippedUnassigned} not yet assigned` : null,
      ].filter((r): r is string => r !== null)
    : []

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(async () => setResult(await createBatches(inspectionId)))}
        className={
          className ??
          'bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50'
        }
      >
        {isPending ? 'Working…' : label}
      </button>
      {result && (
        <div className="text-[11px] text-text-muted max-w-xs">
          {result.batchesCreated > 0
            ? `${result.batchesCreated} batch${result.batchesCreated === 1 ? '' : 'es'} created.`
            : 'No batches created.'}
          {skipReasons.length > 0 && <> Skipped: {skipReasons.join(', ')}.</>}
        </div>
      )}
    </div>
  )
}
