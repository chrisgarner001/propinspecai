'use client'

import { useState, useTransition } from 'react'
import { postMoveOutReport } from '@/app/actions'

// "Generate and Post Report" is a real, externally-visible action (posts to
// PropertyWare and attaches the PDF to the tenant's file) -- confirmed via
// browser confirm(), same pattern as DeleteInspectionButton. It also opens
// the generated PDF once the post is recorded, since "Generate" is half of
// what this button says it does. The PW side is currently a STAND-IN (see
// postMoveOutReport in app/actions.ts): the reviewer posts the PDF in PW
// themselves and pastes the resulting reference back here, which is what
// actually gets recorded. Calling the server action directly from onSubmit
// (rather than a plain form `action`) is what makes opening the PDF
// afterward possible -- a form action has no completion hook to hang that on.
export default function PostMoveOutReportButton({
  inspectionId,
  postedAt,
  pwReference,
}: {
  inspectionId: string
  postedAt: string | null
  pwReference: string | null
}) {
  const [open, setOpen] = useState(!postedAt)
  const [isPending, startTransition] = useTransition()

  if (postedAt && !open) {
    return (
      <div className="flex items-center gap-2 text-[12px]">
        <span className="font-semibold text-success">
          Posted to PW · <span className="data-mono">{pwReference}</span> ·{' '}
          {new Date(postedAt).toLocaleDateString('en-US', { timeZone: 'UTC' })}
        </span>
        <button type="button" onClick={() => setOpen(true)} className="text-text-muted underline">
          Post again
        </button>
      </div>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!confirm('Post the Move-Out Report to PropertyWare and attach it to the tenant file?')) return
        const formData = new FormData(e.currentTarget)
        // Opened synchronously, before the `await` below, and redirected once
        // the post completes -- most browsers only allow window.open() to
        // bypass their popup blocker when it's called directly inside a user
        // gesture's handler; calling it after an await (even a fast one)
        // frequently gets silently blocked instead.
        const pdfWindow = window.open('about:blank', '_blank')
        startTransition(async () => {
          await postMoveOutReport(inspectionId, formData)
          if (pdfWindow) pdfWindow.location.href = `/inspections/${inspectionId}/move-out-report`
        })
      }}
      className="flex items-center gap-2"
    >
      <input
        name="pw_reference"
        required
        placeholder="PW document reference #"
        className="text-[12px] border border-border rounded-[var(--radius-sm)] px-2 py-1.5 bg-surface w-44"
      />
      <button
        type="submit"
        disabled={isPending}
        className="bg-accent hover:bg-accent-hover text-white rounded-[var(--radius-sm)] px-3.5 py-2 text-[13px] font-semibold whitespace-nowrap disabled:opacity-60"
      >
        {isPending ? 'Posting…' : 'Generate and Post Report'}
      </button>
      {postedAt && (
        <button type="button" onClick={() => setOpen(false)} className="text-[12px] text-text-muted">
          Cancel
        </button>
      )}
    </form>
  )
}
