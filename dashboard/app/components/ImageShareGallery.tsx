'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { createImageShareLink } from '@/app/actions'

type StillRow = { id: string; room_area: string; item: string; still_image_file: string }

// "Share Images" (Image Folder page): the header row (summary + Share
// Images + Back to Inspection) and the gallery grid below both need the same
// sharing/selected state -- the button toggles checkbox visibility in a grid
// that lives lower on the page -- so this owns both rather than splitting
// into two component instances that couldn't share state.
export default function ImageShareGallery({
  inspectionId,
  backHref,
  summary,
  roomGroups,
}: {
  inspectionId: string
  backHref: string
  summary: ReactNode
  roomGroups: [string, StillRow[]][]
}) {
  const [sharing, setSharing] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasStills = roomGroups.some(([, items]) => items.length > 0)

  function toggle(id: string) {
    setResultUrl(null)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleCreateLink() {
    setError(null)
    const images = roomGroups
      .flatMap(([, items]) => items)
      .filter((s) => selected.has(s.id))
      .map((s) => ({ url: s.still_image_file, roomArea: s.room_area, item: s.item }))

    if (images.length === 0) {
      setError('Select at least one image first.')
      return
    }

    startTransition(async () => {
      const result = await createImageShareLink(inspectionId, images)
      if (result.error || !result.url) {
        setError(result.error ?? 'Something went wrong creating the link.')
        return
      }
      const fullUrl = `${window.location.origin}${result.url}`
      setResultUrl(fullUrl)
      try {
        await navigator.clipboard.writeText(fullUrl)
        setCopied(true)
      } catch {
        setCopied(false)
      }
    })
  }

  return (
    <>
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-surface-alt">
        <div className="text-[13px] text-text-muted">{summary}</div>
        <div className="flex items-center gap-2">
          {hasStills && (
            <button
              type="button"
              onClick={() => {
                setSharing((s) => !s)
                setSelected(new Set())
                setResultUrl(null)
                setError(null)
              }}
              className="bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold"
            >
              {sharing ? 'Cancel Share' : 'Share Images'}
            </button>
          )}
          <a
            href={backHref}
            className="bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold"
          >
            Back to Inspection
          </a>
        </div>
      </div>

      {sharing && (
        <div className="px-6 py-3 border-b border-border bg-accent/5 space-y-2">
          <div className="text-[12px]">
            Check the images you want to share via a link, then click Create Image Library Link.
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCreateLink}
              disabled={isPending}
              className="bg-accent hover:bg-accent-hover text-white rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
            >
              {isPending ? 'Creating…' : 'Create Image Library Link'}
            </button>
            <span className="text-[12px] text-text-muted">{selected.size} selected</span>
          </div>
          {error && <div className="text-[12px] text-error">{error}</div>}
          {resultUrl && (
            <div className="text-[12px]">
              {copied ? 'Link copied to clipboard: ' : 'Link created (copy it manually below): '}
              <span className="data-mono break-all">{resultUrl}</span>
            </div>
          )}
        </div>
      )}

      {!hasStills ? (
        <div className="px-6 py-6 text-[13px] text-text-muted">
          No still images extracted yet for this inspection.
        </div>
      ) : (
        roomGroups.map(([room, items]) => (
          <div key={room} className="px-6 py-4 border-b border-border">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-2">{room}</div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
              {items.map((s) => (
                <div
                  key={s.id}
                  className="relative block border border-border rounded-[var(--radius-md)] overflow-hidden bg-surface hover:border-accent"
                >
                  {sharing && (
                    <label className="absolute top-1.5 left-1.5 z-10 bg-surface border border-border rounded p-1 flex items-center">
                      <input
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={() => toggle(s.id)}
                        aria-label={`Select ${room} — ${s.item}`}
                      />
                    </label>
                  )}
                  <a href={s.still_image_file} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element -- source is an arbitrary Supabase Storage URL, not a static/public import */}
                    <img src={s.still_image_file} alt={`${room} — ${s.item}`} className="w-full h-36 object-cover" />
                    <div className="data-mono text-[10px] text-text-muted px-2 py-1.5 truncate border-t border-border" title={s.item}>
                      {s.item}
                    </div>
                  </a>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </>
  )
}
