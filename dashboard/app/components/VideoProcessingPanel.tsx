'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  syncInspectionVideos,
  processNextInspectionVideo,
  retryInspectionVideo,
  type InspectionVideoRow,
} from '@/app/actions'
import { SIZE_REJECTION_MARKER } from '@/lib/videoProcessing'

const STATUS_LABEL: Record<string, string> = {
  pending: 'Queued',
  processing: 'Processing…',
  done: 'Done',
  failed: 'Failed',
}

export default function VideoProcessingPanel({
  inspectionId,
  initialVideos,
}: {
  inspectionId: string
  initialVideos: InspectionVideoRow[]
}) {
  const [videos, setVideos] = useState<InspectionVideoRow[]>(initialVideos)
  const [running, setRunning] = useState(false)
  const [bannerError, setBannerError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [copyFallbackId, setCopyFallbackId] = useState<string | null>(null)
  const [gateCheckBanner, setGateCheckBanner] = useState<string | null>(null)
  const router = useRouter()

  const total = videos.length
  const doneCount = videos.filter((v) => v.status === 'done').length
  const failedCount = videos.filter((v) => v.status === 'failed').length
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0

  async function runLoop() {
    setRunning(true)
    setBannerError(null)
    try {
      while (true) {
        const result = await processNextInspectionVideo(inspectionId)
        setVideos(result.videos)
        router.refresh() // pulls newly-inserted line items into the table below, incrementally
        if (result.done) break
      }
    } catch (err) {
      setBannerError(`Processing stopped: ${(err as Error).message}`)
    } finally {
      setRunning(false)
    }
  }

  async function handleStart() {
    setRunning(true)
    setBannerError(null)
    setGateCheckBanner(null)
    const result = await syncInspectionVideos(inspectionId)
    if (result.error) {
      setBannerError(result.error)
      setRunning(false)
      return
    }
    const syncedVideos = result.videos ?? []
    setVideos(syncedVideos)

    // Gate check (plan-eng-review, 2026-09-28): syncInspectionVideos already
    // marks any oversized video 'failed' immediately -- surface that here,
    // before Start Processing even runs, instead of only discovering it
    // per-row deep in the list as the queue happens to reach it.
    const oversized = syncedVideos.filter((v) => v.status === 'failed' && v.error_message?.includes(SIZE_REJECTION_MARKER))
    if (oversized.length > 0) {
      const noun = oversized.length === 1 ? 'video' : 'videos'
      const verb = oversized.length === 1 ? 'is' : 'are'
      setGateCheckBanner(
        `${oversized.length} of ${syncedVideos.length} ${noun} ${verb} too large to process automatically. ` +
          `Use "Copy split command" below to split ${oversized.length === 1 ? 'it' : 'them'}, then click "Check for new videos" again.`
      )
      setCollapsed(false) // so the banner's Copy split command buttons are visible without an extra click
    }

    await runLoop()
  }

  async function handleRetry(videoRowId: string) {
    const result = await retryInspectionVideo(videoRowId, inspectionId)
    setVideos(result.videos)
    await runLoop()
  }

  // navigator.clipboard.writeText can reject (permissions policy, older
  // browser, non-secure context) -- falls back to a visible, select-to-copy
  // text field rather than failing silently (plan-eng-review, 2026-09-28).
  async function handleCopySplitCommand(videoRowId: string) {
    const command = `node scripts/split-video.mjs ${videoRowId}`
    try {
      await navigator.clipboard.writeText(command)
      setCopiedId(videoRowId)
      setTimeout(() => setCopiedId((id) => (id === videoRowId ? null : id)), 2000)
    } catch {
      setCopyFallbackId(videoRowId)
    }
  }

  const notStarted = total === 0

  // Returns a Fragment, not its own bordered block: the trigger (toggle +
  // action button) is meant to sit inline alongside the other links on the
  // inspection detail page's links row, sharing that row's chrome instead of
  // getting its own. `basis-full` on the expanded panel forces it onto its
  // own line within that same flex-wrap row without needing a separate
  // container -- a plain child would otherwise just wrap in awkwardly beside
  // the links instead of taking the full row.
  return (
    <>
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center gap-1.5 text-[13px] font-semibold"
      >
        <span className="text-text-muted text-[11px]">{collapsed ? '▶' : '▼'}</span>
        Video Processing
        {collapsed && total > 0 && (
          <span className="font-normal text-text-muted text-[12px]">
            ({doneCount} of {total} processed{failedCount > 0 ? ` · ${failedCount} failed` : ''})
          </span>
        )}
      </button>
      {notStarted && (
        <button
          type="button"
          onClick={handleStart}
          disabled={running}
          className="bg-accent hover:bg-accent-hover text-white rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
        >
          {running ? 'Starting…' : 'Start Processing'}
        </button>
      )}
      {!notStarted && (
        <button
          type="button"
          onClick={handleStart}
          disabled={running}
          className="bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
        >
          {running ? 'Checking…' : 'Check for new videos'}
        </button>
      )}

      {bannerError && <div className="basis-full text-[12px] text-error">{bannerError}</div>}
      {gateCheckBanner && (
        <div className="basis-full text-[12px] text-accent-ink bg-accent-bg rounded-[var(--radius-sm)] px-3 py-2">
          {gateCheckBanner}
        </div>
      )}

      {!collapsed && total > 0 && (
        <div className="basis-full space-y-3 pt-2">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-text-muted">
              <span>
                {doneCount} of {total} processed{failedCount > 0 ? ` · ${failedCount} failed` : ''}
              </span>
              <span className="data-mono">{pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-border overflow-hidden">
              <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>

          <ul className="space-y-1">
            {videos.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2 text-[12px]">
                <span className="truncate flex-1" title={v.filename}>
                  {v.filename}
                </span>
                <span
                  className={
                    v.status === 'failed'
                      ? 'text-error font-medium'
                      : v.status === 'done'
                        ? 'text-success font-medium'
                        : 'text-text-muted'
                  }
                >
                  {STATUS_LABEL[v.status] ?? v.status}
                  {v.status === 'done' && v.line_items_created > 0 ? ` (${v.line_items_created} items)` : ''}
                </span>
                {/* 'processing' also gets Retry when no loop is actively running
                    from this tab -- a row a server crash/timeout left stuck
                    (investigated 2026-09-23, 11436 Syracuse: a Vercel timeout
                    on a large video kills the request before the row can be
                    marked 'failed') is otherwise permanently unrecoverable.
                    Gated on !running so an actually in-flight video from this
                    same loop doesn't show a misleading Retry mid-processing. */}
                {(v.status === 'failed' || (v.status === 'processing' && !running)) && (
                  <button
                    type="button"
                    onClick={() => handleRetry(v.id)}
                    disabled={running}
                    className="text-[11px] font-semibold text-accent hover:text-accent-hover disabled:opacity-50"
                  >
                    Retry
                  </button>
                )}
                {/* Only on rows rejected specifically for size (not any other
                    failure reason) -- scripts/split-video.mjs itself only
                    handles this one case, running it against a different
                    kind of failure would be pointless (plan-eng-review,
                    2026-09-28). */}
                {v.status === 'failed' && v.error_message?.includes(SIZE_REJECTION_MARKER) && (
                  <button
                    type="button"
                    onClick={() => handleCopySplitCommand(v.id)}
                    className="text-[11px] font-semibold text-accent hover:text-accent-hover"
                  >
                    {copiedId === v.id ? 'Copied!' : 'Copy split command'}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {videos
            .filter((v) => v.status === 'failed' && v.error_message)
            .map((v) => (
              <div key={`${v.id}-err`} className="text-[11px] text-error">
                {v.filename}: {v.error_message}
                {copyFallbackId === v.id && (
                  <div className="mt-1 flex items-center gap-1.5">
                    <input
                      type="text"
                      readOnly
                      value={`node scripts/split-video.mjs ${v.id}`}
                      onFocus={(e) => e.target.select()}
                      className="flex-1 min-w-0 border border-border rounded-[var(--radius-sm)] px-2 py-1 text-[11px] data-mono bg-surface text-text"
                    />
                    <button
                      type="button"
                      onClick={() => setCopyFallbackId(null)}
                      className="text-[11px] font-semibold text-text-muted hover:text-text"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            ))}
        </div>
      )}
    </>
  )
}
