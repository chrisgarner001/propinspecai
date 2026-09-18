'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { updateStagePlacement } from '@/app/actions'

export type BoardItem = {
  key: string // `${inspectionId}:${stageId}`
  inspectionStageId: string | null
  inspectionId: string
  stageId: string
  stageName: string
  stageSortOrder: number
  jobNumber: string
  propertyAddress: string
  itemCount: number
  crewKey: string // 'gpm' | vendors.id | 'unassigned'
  crewLabel: string
  assignedTo: string | null
  vendorId: string | null
  scheduledStart: string | null // 'YYYY-MM-DD'
  scheduledEnd: string | null
}

export type PropertyRow = { key: string; label: string; sub: string }
export type CrewRow = { key: string; label: string }

const DAY_RANGE_OPTIONS = [15, 20, 30]
const DEFAULT_SPAN_DAYS = 1 // a freshly-scheduled stage covers 2 calendar days (start + this many more)
const LABEL_COL_PX = 190
const DAY_COL_PX = 64

function toDate(s: string) {
  return new Date(`${s}T00:00:00Z`)
}
function toISO(d: Date) {
  return d.toISOString().slice(0, 10)
}
function addDays(iso: string, days: number) {
  const d = toDate(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return toISO(d)
}
function dayDiff(a: string, b: string) {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86_400_000)
}
function fmtDow(iso: string) {
  return toDate(iso).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
}
function fmtNum(iso: string) {
  return toDate(iso).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', timeZone: 'UTC' })
}
function gridCols(daysOut: number) {
  return `${LABEL_COL_PX}px repeat(${daysOut}, minmax(${DAY_COL_PX}px, 1fr))`
}

type Placed = { item: BoardItem; start: number; end: number; lane: number }

// Greedily packs a row's stages into the fewest sub-lanes so overlapping
// date ranges (two Stages running the same week for the same job/crew)
// stack instead of colliding -- start/end here are day-offsets from today,
// not dates, so this is pure interval scheduling.
function packLanes(rowItems: BoardItem[], todayISO: string): { placed: Placed[]; laneCount: number } {
  const withOffsets = rowItems
    .filter((i) => i.scheduledStart && i.scheduledEnd)
    .map((i) => ({ item: i, start: dayDiff(todayISO, i.scheduledStart!), end: dayDiff(todayISO, i.scheduledEnd!) }))
    .sort((a, b) => a.start - b.start)

  const laneEnds: number[] = []
  const placed: Placed[] = withOffsets.map((w) => {
    let lane = laneEnds.findIndex((end) => end < w.start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(-Infinity)
    }
    laneEnds[lane] = w.end
    return { ...w, lane }
  })
  return { placed, laneCount: Math.max(1, laneEnds.length) }
}

export default function DispatchBoard({
  items: initialItems,
  propertyRows,
  crewRows,
  focusInspectionId,
}: {
  items: BoardItem[]
  propertyRows: PropertyRow[]
  crewRows: CrewRow[]
  focusInspectionId?: string
}) {
  const [items, setItems] = useState(initialItems)
  const [mode, setMode] = useState<'property' | 'crew'>('property')
  const [daysOut, setDaysOut] = useState(15)
  const [dropHoverKey, setDropHoverKey] = useState<string | null>(null)
  const [resizePreview, setResizePreview] = useState<{ key: string; start: string; end: string } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragKeyRef = useRef<string | null>(null)
  const headerRowRef = useRef<HTMLDivElement | null>(null)

  const todayISO = useMemo(() => toISO(new Date()), [])
  const columns = useMemo(() => Array.from({ length: daysOut }, (_, i) => addDays(todayISO, i)), [todayISO, daysOut])

  const visibleItems = focusInspectionId ? items.filter((i) => i.inspectionId === focusInspectionId) : items
  const unscheduled = visibleItems.filter((i) => !i.scheduledStart || !i.scheduledEnd)
  const rows = mode === 'property' ? (focusInspectionId ? propertyRows.filter((p) => p.key === focusInspectionId) : propertyRows) : crewRows

  function itemsForRow(rowKey: string) {
    return visibleItems.filter((i) => (mode === 'property' ? i.inspectionId === rowKey : i.crewKey === rowKey))
  }

  function draggingItem(): BoardItem | null {
    const key = dragKeyRef.current
    return key ? (items.find((i) => i.key === key) ?? null) : null
  }

  // The drag key lives in dragKeyRef, not dataTransfer -- but dataTransfer
  // still needs *something* set via setData() in dragstart, or several
  // browsers (Firefox reliably, some Chrome/Edge configurations too) refuse
  // to treat the gesture as a real drag session at all: dragover/drop then
  // never fire on any target, which looks exactly like "drag and drop isn't
  // working" with no console error to point at.
  function startDrag(e: React.DragEvent, key: string) {
    dragKeyRef.current = key
    setIsDragging(true)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', key)
  }

  function endDrag() {
    dragKeyRef.current = null
    setIsDragging(false)
    setDropHoverKey(null)
  }

  // A Stage belongs to one job's line items -- dropping it on a different
  // property's row in Property view isn't a real action (there's nothing to
  // "move"), unlike Crew view where a different row is a real reassignment.
  // Checked on dragover (not just drop) so the browser shows a "not allowed"
  // cursor over rows a Stage can't actually land on, instead of accepting
  // the drop and silently doing nothing.
  function isValidTarget(rowKey: string): boolean {
    const item = draggingItem()
    if (!item) return false
    if (mode === 'property') return rowKey === item.inspectionId
    return rowKey !== 'unassigned' // not a real crew to assign to
  }

  // `next.crewKey` is only ever passed by handleDrop when a Crew-view drop
  // landed on a DIFFERENT row than the item's current crew -- its presence
  // is exactly the signal that a reassignment (not just a date move)
  // happened, so it's the one thing this function needs to check.
  async function commit(
    key: string,
    next: { scheduledStart: string; scheduledEnd: string; crewKey?: string; crewLabel?: string; assignedTo?: string | null; vendorId?: string | null },
  ) {
    const prev = items
    const item = items.find((i) => i.key === key)
    if (!item) return

    setItems((cur) => cur.map((i) => (i.key === key ? { ...i, ...next } : i)))

    const reassignTo = next.crewKey
      ? next.crewKey === 'gpm'
        ? { assignedTo: 'GPM Staff', vendorId: null }
        : { assignedTo: 'Outside Vendor', vendorId: next.crewKey }
      : undefined

    try {
      await updateStagePlacement({
        inspectionId: item.inspectionId,
        stageId: item.stageId,
        scheduledStart: next.scheduledStart,
        scheduledEnd: next.scheduledEnd,
        reassignTo,
      })
    } catch {
      setItems(prev) // revert -- no toast, matches this app's existing no-toast status-change convention
    }
  }

  function handleDrop(rowKey: string, dayISO: string) {
    setDropHoverKey(null)
    const key = dragKeyRef.current
    dragKeyRef.current = null
    if (!key || !isValidTarget(rowKey)) return
    const item = items.find((i) => i.key === key)
    if (!item) return

    const duration = item.scheduledStart && item.scheduledEnd ? dayDiff(item.scheduledStart, item.scheduledEnd) : DEFAULT_SPAN_DAYS
    const scheduledStart = dayISO
    const scheduledEnd = addDays(dayISO, duration)

    if (mode === 'crew' && rowKey !== item.crewKey) {
      const row = crewRows.find((r) => r.key === rowKey)!
      commit(key, {
        scheduledStart,
        scheduledEnd,
        crewKey: rowKey,
        crewLabel: row.label,
        assignedTo: rowKey === 'gpm' ? 'GPM Staff' : 'Outside Vendor',
        vendorId: rowKey === 'gpm' ? null : rowKey,
      })
    } else {
      commit(key, { scheduledStart, scheduledEnd })
    }
  }

  // Drag-to-resize a bar's edge -- pointer events rather than native HTML5
  // drag/drop, since resize needs continuous pixel tracking (not a discrete
  // cell target). Mirrors the pointermove/pointerup-on-window pattern the
  // original per-job Gantt used, for the same reason: a fast drag can fire
  // those events before a React re-render lands, which would drop the
  // gesture if handlers were attached conditionally via JSX props instead.
  function getPxPerDay() {
    const el = headerRowRef.current
    if (!el) return DAY_COL_PX
    return (el.getBoundingClientRect().width - LABEL_COL_PX) / daysOut
  }

  function onResizeStart(e: React.PointerEvent, item: BoardItem, edge: 'start' | 'end') {
    e.stopPropagation()
    e.preventDefault()
    if (!item.scheduledStart || !item.scheduledEnd) return
    const startX = e.clientX
    const origStart = item.scheduledStart
    const origEnd = item.scheduledEnd
    setResizePreview({ key: item.key, start: origStart, end: origEnd })

    function handleMove(ev: PointerEvent) {
      const pxPerDay = getPxPerDay()
      const deltaDays = Math.round((ev.clientX - startX) / pxPerDay)
      let nextStart = origStart
      let nextEnd = origEnd
      if (edge === 'start') {
        nextStart = addDays(origStart, deltaDays)
        if (nextStart > nextEnd) nextStart = nextEnd // can't push the start past the end
      } else {
        nextEnd = addDays(origEnd, deltaDays)
        if (nextEnd < nextStart) nextEnd = nextStart // can't push the end before the start
      }
      setResizePreview({ key: item.key, start: nextStart, end: nextEnd })
    }

    function handleUp() {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      setResizePreview((preview) => {
        if (preview && (preview.start !== origStart || preview.end !== origEnd)) {
          void commit(item.key, { scheduledStart: preview.start, scheduledEnd: preview.end })
        }
        return null
      })
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
  }

  return (
    <div>
      {focusInspectionId && (
        <div className="flex items-center justify-between px-6 py-2 border-b border-border bg-accent-bg text-[12px]">
          <span className="text-accent-ink font-semibold">Showing one job only</span>
          <Link href="/dispatch-board" className="text-accent-ink underline">
            View full Dispatch Board
          </Link>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-border flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="inline-flex border border-border rounded-[var(--radius-sm)] overflow-hidden">
            <button
              type="button"
              onClick={() => setMode('property')}
              className={`px-3.5 py-1.5 text-[12.5px] font-semibold ${mode === 'property' ? 'bg-accent-bg text-accent-ink' : 'bg-surface text-text-muted'}`}
            >
              By Property
            </button>
            <button
              type="button"
              onClick={() => setMode('crew')}
              className={`px-3.5 py-1.5 text-[12.5px] font-semibold border-l border-border ${mode === 'crew' ? 'bg-accent-bg text-accent-ink' : 'bg-surface text-text-muted'}`}
            >
              By Crew
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <label htmlFor="days-out" className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              Show
            </label>
            <select
              id="days-out"
              value={daysOut}
              onChange={(e) => setDaysOut(Number(e.target.value))}
              className="text-[12.5px] border border-border rounded-[var(--radius-sm)] px-2 py-1 bg-surface"
            >
              {DAY_RANGE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} days
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3 text-[11.5px] text-text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[2px] bg-vendor-bg border border-vendor" /> Outside Vendor
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[2px] bg-surface-alt border border-text-muted" /> GPM Staff
            </span>
          </div>
        </div>
        <div className="text-[12px] text-text-muted">
          Drag a bar to a new date, drag its edge to resize, or drop it onto another crew&apos;s row to reassign
        </div>
      </div>

      <div className="grid grid-cols-[230px_1fr] gap-4 px-6 py-4 items-start">
        <div className="border border-border rounded-[var(--radius-lg)] p-3.5 bg-surface-alt">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-1">Unscheduled Stages</div>
          <div className="text-[11px] text-text-muted mb-3 leading-snug">Drag one onto a date to schedule it.</div>
          <div className="space-y-2">
            {unscheduled.length === 0 && <div className="text-[11px] italic text-text-muted">Nothing waiting — every Stage has a date.</div>}
            {unscheduled.map((i) => (
              <div
                key={i.key}
                draggable
                onDragStart={(e) => startDrag(e, i.key)}
                onDragEnd={endDrag}
                className={`border border-dashed rounded-[var(--radius-sm)] px-2.5 py-2 cursor-grab active:cursor-grabbing ${
                  i.assignedTo === 'Outside Vendor' ? 'border-vendor bg-vendor-bg' : 'border-border bg-surface'
                }`}
              >
                <div className="font-semibold text-[12px]">{i.stageName}</div>
                <div className="text-[10.5px] text-text-muted truncate">
                  {i.propertyAddress} · {i.crewLabel}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border border-border rounded-[var(--radius-lg)] overflow-x-auto bg-surface">
          <div style={{ minWidth: LABEL_COL_PX + daysOut * DAY_COL_PX }}>
            <div
              ref={headerRowRef}
              className="grid border-b border-border bg-surface-alt"
              style={{ gridTemplateColumns: gridCols(daysOut) }}
            >
              <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                {mode === 'property' ? 'Property' : 'Crew'}
              </div>
              {columns.map((c, i) => (
                <div key={c} className={`text-center px-1 py-2 border-l border-border ${i === 0 ? 'bg-accent-bg' : ''}`}>
                  <div className={`text-[10px] uppercase tracking-wide ${i === 0 ? 'text-accent-ink font-semibold' : 'text-text-muted'}`}>
                    {fmtDow(c)}
                  </div>
                  <div className={`data-mono text-[12px] ${i === 0 ? 'text-accent-ink font-semibold' : ''}`}>{fmtNum(c)}</div>
                </div>
              ))}
            </div>

            {rows.map((row) => {
              const rowItems = itemsForRow(row.key)
              const { placed, laneCount } = packLanes(rowItems, todayISO)
              const rowHeight = laneCount * 40 + 8

              return (
                <div key={row.key} className="border-b border-border last:border-b-0">
                  <div
                    className="grid relative"
                    style={{ gridTemplateColumns: gridCols(daysOut), gridTemplateRows: `repeat(${laneCount}, 1fr)`, minHeight: rowHeight }}
                  >
                    <div className="px-3 py-2 border-r border-border flex flex-col justify-center" style={{ gridRow: `1 / span ${laneCount}` }}>
                      <div className="font-semibold text-[12.5px] truncate">{row.label}</div>
                      {'sub' in row && (row as PropertyRow).sub && (
                        <div className="text-[11px] text-text-muted">{(row as PropertyRow).sub}</div>
                      )}
                    </div>

                    {/* Day-cells and bars are siblings, not parent/child, so a
                        dragover event that lands on a bar never reaches the
                        cell underneath it via bubbling -- and bars have no
                        drop handler of their own. Without isDragging's
                        pointer-events-none on bars below, any drop target
                        already covered by an existing bar would silently
                        reject every drop, which is worse the busier a row
                        (crew rows especially) gets. */}
                    {columns.map((c, i) => {
                      const cellKey = `${row.key}:${c}`
                      return (
                        <div
                          key={c}
                          onDragOver={(e) => {
                            if (!isValidTarget(row.key)) return
                            e.preventDefault()
                            setDropHoverKey(cellKey)
                          }}
                          onDragLeave={() => setDropHoverKey((k) => (k === cellKey ? null : k))}
                          onDrop={(e) => {
                            e.preventDefault()
                            handleDrop(row.key, c)
                          }}
                          className={`border-l border-border ${i === 0 ? 'bg-accent-bg/40' : ''} ${dropHoverKey === cellKey ? 'bg-accent-bg' : ''}`}
                          style={{ gridColumn: i + 2, gridRow: `1 / span ${laneCount}` }}
                        />
                      )
                    })}

                    {placed.map(({ item, start, end, lane }) => {
                      const preview = resizePreview?.key === item.key ? resizePreview : null
                      const effStart = preview ? dayDiff(todayISO, preview.start) : start
                      const effEnd = preview ? dayDiff(todayISO, preview.end) : end
                      if (effEnd < 0 || effStart >= daysOut) return null // fully outside the visible window
                      const startCol = Math.max(2, effStart + 2)
                      const endCol = Math.min(daysOut + 2, effEnd + 3)
                      const subtext = mode === 'property' ? item.crewLabel : `${item.propertyAddress} · Job ${item.jobNumber}`
                      const isVendor = item.assignedTo === 'Outside Vendor'
                      return (
                        <div
                          key={item.key}
                          draggable
                          onDragStart={(e) => startDrag(e, item.key)}
                          onDragEnd={endDrag}
                          className={`relative m-1 px-2 py-1 rounded-[var(--radius-sm)] border border-l-[3px] cursor-grab active:cursor-grabbing overflow-hidden ${
                            isVendor ? 'bg-vendor-bg border-border border-l-vendor' : 'bg-surface-alt border-border border-l-text-muted'
                          } ${preview ? 'outline outline-2 outline-accent outline-offset-1' : ''} ${isDragging ? 'pointer-events-none' : ''}`}
                          style={{ gridColumn: `${startCol} / ${endCol}`, gridRow: lane + 1, zIndex: 2 }}
                          title={`${item.stageName} — ${item.itemCount} item(s)`}
                        >
                          <div
                            onPointerDown={(e) => onResizeStart(e, item, 'start')}
                            draggable={false}
                            className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize"
                          />
                          <div className="font-semibold text-[11.5px] truncate">{item.stageName}</div>
                          <div className="text-[10px] text-text-muted truncate">{subtext}</div>
                          <div
                            onPointerDown={(e) => onResizeStart(e, item, 'end')}
                            draggable={false}
                            className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize"
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {rows.length === 0 && (
              <div className="px-6 py-6 text-[13px] text-text-muted">
                No active jobs at Approved status or later — nothing to schedule yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
