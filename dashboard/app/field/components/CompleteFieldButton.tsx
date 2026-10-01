'use client'

import { useState, useTransition } from 'react'
import { setFieldInspectionComplete } from '@/app/field/actions'

export default function CompleteFieldButton({ inspectionId, completed }: { inspectionId: string; completed: boolean }) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function toggle(next: boolean) {
    setError(null)
    startTransition(async () => {
      const result = await setFieldInspectionComplete(inspectionId, next)
      if (result.error) setError(result.error)
    })
  }

  return (
    <div>
      {completed ? (
        <button
          type="button"
          disabled={isPending}
          onClick={() => toggle(false)}
          className="min-h-11 bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-4 text-[15px] font-semibold disabled:opacity-50"
        >
          Reopen field inspection
        </button>
      ) : (
        <button
          type="button"
          disabled={isPending}
          onClick={() => toggle(true)}
          className="min-h-11 bg-accent hover:bg-accent-hover text-white rounded-[var(--radius-sm)] px-5 text-[15px] font-semibold disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Mark field inspection complete'}
        </button>
      )}
      {error && <div className="text-[13px] text-error mt-1">{error}</div>}
    </div>
  )
}
