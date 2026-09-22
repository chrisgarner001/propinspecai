'use client'

import { useEffect, useState } from 'react'

// Dashboard's "View Report" button (2026-09-22 user request; originally a
// small eye icon embedding the tenant-facing Move-Out Report -- corrected
// the same day: too small to notice, and the wrong report entirely. This
// embeds the real generated Inspection Report instead -- full line-item
// detail plus each item's still image, grouped by room/area, same as the
// inspection detail page -- available for every inspection type, not just
// Move-Out, since nothing in it is move-out-specific. Requires the report
// route's Content-Disposition to be `inline`, not `attachment` (see
// inspection-report/route.ts) -- otherwise the browser would just try to
// download it inside the iframe.
export default function InspectionQuickView({
  inspectionId,
  propertyAddress,
  label = 'View Report',
  className,
}: {
  inspectionId: string
  propertyAddress: string
  label?: string
  className?: string
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
        aria-label={`View report for ${propertyAddress}`}
        className={
          className ??
          'flex items-center gap-1.5 text-[13px] font-semibold text-accent hover:text-accent-hover border border-accent/40 hover:border-accent rounded-[var(--radius-sm)] px-3 py-1.5 shrink-0'
        }
      >
        {!className && <span className="text-[18px] leading-none">👁</span>}
        {label}
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
            className="bg-surface border border-border rounded-[var(--radius-lg)] w-full max-w-6xl h-[94vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <span className="text-[13px] font-semibold truncate">{propertyAddress} — Inspection Report</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[12px] font-semibold text-text-muted hover:text-text border border-border rounded-[var(--radius-sm)] px-2.5 py-1"
              >
                Close ✕
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <iframe
                src={`/inspections/${inspectionId}/inspection-report`}
                title={`Inspection Report — ${propertyAddress}`}
                className="w-full h-full border-0"
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
