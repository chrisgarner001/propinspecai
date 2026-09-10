'use client'

import { useState } from 'react'

// Embeds Drive's own preview iframe rather than a direct <video src> --
// Drive doesn't serve raw file bytes for that without making the clip
// public, and these are real tenant-unit walkthroughs. The iframe respects
// the viewer's actual Google sign-in/Shared-Drive permissions instead: only
// someone with real access to "Inspection Videos" can play it.
export default function VideoPopupLink({
  filename,
  driveFileId,
}: {
  filename: string
  driveFileId: string | null
}) {
  const [open, setOpen] = useState(false)

  if (!driveFileId) {
    return <span className="data-mono text-[11px] text-text-muted whitespace-nowrap">{filename}</span>
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="data-mono text-[11px] text-accent underline decoration-accent/40 hover:text-accent-hover whitespace-nowrap"
      >
        {filename}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-8"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-surface rounded-[var(--radius-md)] shadow-lg w-full max-w-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2 border-b border-border">
              <span className="data-mono text-[12px] text-text-muted">{filename}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[12px] font-semibold text-text-muted hover:text-text"
              >
                Close ✕
              </button>
            </div>
            <div className="aspect-video">
              <iframe
                src={`https://drive.google.com/file/d/${driveFileId}/preview`}
                className="w-full h-full rounded-b-[var(--radius-md)]"
                allow="autoplay"
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
