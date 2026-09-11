'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { syncInspectionVideos, processNextInspectionVideo, retryInspectionVideo, type InspectionVideoRow } from '@/app/actions'

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
    const result = await syncInspectionVideos(inspectionId)
    if (result.error) {
      setBannerError(result.error)
      setRunning(false)
      return
    }
    setVideos(result.videos ?? [])
    await runLoop()
  }

  async function handleRetry(videoRowId: string) {
    const result = await retryInspectionVideo(videoRowId, inspectionId)
    setVideos(result.videos)
    await runLoop()
  }

  const notStarted = total === 0

  return (
    <div className="px-6 py-4 border-b border-border bg-surface-alt space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-semibold">Video Processing</div>
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
      </div>

      {bannerError && <div className="text-[12px] text-error">{bannerError}</div>}

      {total > 0 && (
        <>
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
                {v.status === 'failed' && (
                  <button
                    type="button"
                    onClick={() => handleRetry(v.id)}
                    disabled={running}
                    className="text-[11px] font-semibold text-accent hover:text-accent-hover disabled:opacity-50"
                  >
                    Retry
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
              </div>
            ))}
        </>
      )}
    </div>
  )
}
