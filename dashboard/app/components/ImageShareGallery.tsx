'use client'

import { useEffect, useState, useTransition, type ReactNode } from 'react'
import { createImageShareLink } from '@/app/actions'
import { formatCapturedAt } from '@/lib/format'

type StillRow = { id: string; room_area: string; item: string; still_image_file: string; captured_at: string | null }

// "Share Images" (Image Folder page): the header row (summary + Share
// Images + Back to Inspection) and the gallery grid below both need the same
// sharing/selected state -- the button toggles checkbox visibility in a grid
// that lives lower on the page -- so this owns both rather than splitting
// into two component instances that couldn't share state.
//
// Lightbox (2026-09-22 feedback: "there is no photo gallery to page through
// photos") replaces the old `<a target="_blank">` per-thumbnail behavior --
// clicking a photo now opens an in-page overlay with Prev/Next across the
// WHOLE inspection's photos (not scoped to one room), not a new browser tab
// per photo.
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
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const hasStills = roomGroups.some(([, items]) => items.length > 0)

  const flatStills = roomGroups.flatMap(([, items]) => items)

  useEffect(() => {
    if (lightboxIndex === null) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightboxIndex(null)
      else if (e.key === 'ArrowRight') setLightboxIndex((i) => (i === null ? null : Math.min(i + 1, flatStills.length - 1)))
      else if (e.key === 'ArrowLeft') setLightboxIndex((i) => (i === null ? null : Math.max(i - 1, 0)))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [lightboxIndex, flatStills.length])

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

  const lightboxStill = lightboxIndex !== null ? flatStills[lightboxIndex] : null

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
                  <button
                    type="button"
                    onClick={() => (sharing ? toggle(s.id) : setLightboxIndex(flatStills.findIndex((f) => f.id === s.id)))}
                    className="block w-full text-left"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- source is an arbitrary Supabase Storage URL, not a static/public import */}
                    <img src={s.still_image_file} alt={`${room} — ${s.item}`} className="w-full h-36 object-cover" />
                    <div className="data-mono text-[10px] text-text-muted px-2 py-1.5 truncate border-t border-border" title={s.item}>
                      {s.item}
                    </div>
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {lightboxStill && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex flex-col items-center justify-center p-4"
          onClick={() => setLightboxIndex(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxIndex(null)}
            className="absolute top-4 right-4 text-white text-[13px] font-semibold border border-white/40 rounded-[var(--radius-sm)] px-3 py-1.5 hover:bg-white/10"
          >
            Close ✕
          </button>
          <div className="text-white/70 text-[12px] mb-2">
            {(lightboxIndex ?? 0) + 1} of {flatStills.length}
          </div>
          <div className="relative flex items-center max-w-full max-h-[75vh]" onClick={(e) => e.stopPropagation()}>
            {(lightboxIndex ?? 0) > 0 && (
              <button
                type="button"
                onClick={() => setLightboxIndex((i) => (i === null ? null : Math.max(i - 1, 0)))}
                className="absolute left-2 text-white text-2xl bg-black/40 hover:bg-black/60 rounded-full w-10 h-10 flex items-center justify-center"
                aria-label="Previous photo"
              >
                ‹
              </button>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element -- source is an arbitrary Supabase Storage URL, not a static/public import */}
            <img
              src={lightboxStill.still_image_file}
              alt={`${lightboxStill.room_area} — ${lightboxStill.item}`}
              className="max-w-full max-h-[75vh] object-contain border border-border"
            />
            {(lightboxIndex ?? 0) < flatStills.length - 1 && (
              <button
                type="button"
                onClick={() => setLightboxIndex((i) => (i === null ? null : Math.min(i + 1, flatStills.length - 1)))}
                className="absolute right-2 text-white text-2xl bg-black/40 hover:bg-black/60 rounded-full w-10 h-10 flex items-center justify-center"
                aria-label="Next photo"
              >
                ›
              </button>
            )}
          </div>
          <div className="text-white text-[13px] mt-3 text-center">
            <span className="uppercase font-semibold">{lightboxStill.room_area}</span> — {lightboxStill.item}
            {lightboxStill.captured_at && (
              <div className="data-mono text-[11px] text-white/60 mt-1">{formatCapturedAt(lightboxStill.captured_at)}</div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
