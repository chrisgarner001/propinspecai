'use client'

import { useEffect, useState } from 'react'

// Dashboard's "Quick View" icon (2026-09-22 user request) -- embeds the
// real generated Move-Out Report PDF in a popup instead of navigating away.
// Only Move-Out inspections have a report to show (no report route exists
// for any other type); other types get a graceful fallback instead of a
// blank iframe. Requires the report route's Content-Disposition to be
// `inline`, not `attachment` (see move-out-report/route.ts) -- otherwise
// the browser would just try to download it inside the iframe.
export default function InspectionQuickView({
  inspectionId,
  inspectionType,
  propertyAddress,
}: {
  inspectionId: string
  inspectionType: string
  propertyAddress: string
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen(true)
        }}
        title="Quick View"
        aria-label={`Quick view report for ${propertyAddress}`}
        className="text-text-muted hover:text-accent shrink-0"
      >
        👁
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={(e) => {
            e.stopPropagation()
            setOpen(false)
          }}
        >
          <div
            className="bg-surface border border-border rounded-[var(--radius-lg)] w-full max-w-3xl h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <span className="text-[13px] font-semibold truncate">{propertyAddress} — Move-Out Report</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[12px] font-semibold text-text-muted hover:text-text border border-border rounded-[var(--radius-sm)] px-2.5 py-1"
              >
                Close ✕
              </button>
            </div>
            <div className="flex-1 min-h-0">
              {inspectionType === 'Move-Out' ? (
                <iframe
                  src={`/inspections/${inspectionId}/move-out-report`}
                  title={`Move-Out Report — ${propertyAddress}`}
                  className="w-full h-full border-0"
                />
              ) : (
                <div className="p-6 text-[13px] text-text-muted">
                  No report exists for {inspectionType} inspections yet — only Move-Out inspections generate one.{' '}
                  <a
                    href={`/inspections/${inspectionId}`}
                    className="text-accent underline decoration-accent/40 hover:text-accent-hover"
                  >
                    Open the inspection →
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
