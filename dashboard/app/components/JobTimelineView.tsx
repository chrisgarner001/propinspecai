'use client'

import { useMemo, useRef, useState } from 'react'
import { updateLineItemSchedule } from '@/app/actions'

export type TimelineItem = {
  id: string
  room_area: string
  item: string
  assigned_to: string | null
  status: string
  scheduled_start: string | null // 'YYYY-MM-DD'
  scheduled_end: string | null
  blocks_line_item_id: string | null
}

const STATUS_OPTIONS = ['not_started', 'scheduled', 'in_progress', 'blocked', 'done', 'qc_needed']
const STATUS_LABELS: Record<string, string> = {
  not_started: 'Not started',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
  qc_needed: 'QC needed',
}

type RowState = {
  status: string
  scheduled_start: string | null
  scheduled_end: string | null
  blocks_line_item_id: string | null
}

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

// Field labels reuse DESIGN.md tokens only -- job status and assignee type are
// plain text, not color-coded, after /plan-design-review found the first pass
// reusing condition/accent colors for a different taxonomy (a real DESIGN.md
// violation) and inventing a non-palette blue for "Outside Vendor." Blocked
// items get the loudest treatment on the page (a hatch fill in the existing
// `error` token) since that's the signal a reviewer actually needs first --
// the original mockup buried it in a 6px dot while assignee color was loudest.
export default function JobTimelineView({
  inspectionId,
  lineItems,
}: {
  inspectionId: string
  lineItems: TimelineItem[]
}) {
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(
      lineItems.map((li) => [
        li.id,
        {
          status: li.status,
          scheduled_start: li.scheduled_start,
          scheduled_end: li.scheduled_end,
          blocks_line_item_id: li.blocks_line_item_id,
        },
      ]),
    ),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragPreview, setDragPreview] = useState<{ start: string; end: string } | null>(null)
  const dragPreviewRef = useRef<{ start: string; end: string } | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<
    { id: string; startX: number; origStart: string; origEnd: string; status: string; blocksLineItemId: string | null } | null
  >(null)

  const itemsById = useMemo(() => new Map(lineItems.map((li) => [li.id, li])), [lineItems])

  // Visible range: min/max across every scheduled date plus today, padded 2
  // days each side -- so nothing with a real date is ever silently
  // off-screen, and a fresh inspection with nothing scheduled yet still
  // shows a sane default window around today.
  const { rangeStart, totalDays, ticks, todayPct } = useMemo(() => {
    const today = toISO(new Date())
    const dates: string[] = [today]
    for (const r of Object.values(rows)) {
      if (r.scheduled_start) dates.push(r.scheduled_start)
      if (r.scheduled_end) dates.push(r.scheduled_end)
    }
    let min = dates.reduce((a, b) => (a < b ? a : b))
    let max = dates.reduce((a, b) => (a > b ? a : b))
    min = addDays(min, -2)
    max = addDays(max, 2)
    if (dayDiff(min, max) < 13) max = addDays(min, 13) // sane minimum window
    const total = dayDiff(min, max)
    const tickEvery = Math.max(1, Math.ceil(total / 10))
    const tickList: { iso: string; pct: number }[] = []
    for (let d = 0; d <= total; d += tickEvery) {
      const iso = addDays(min, d)
      tickList.push({ iso, pct: (d / total) * 100 })
    }
    return {
      rangeStart: min,
      rangeEnd: max,
      totalDays: total,
      ticks: tickList,
      todayPct: (dayDiff(min, today) / total) * 100,
    }
  }, [rows])

  function pct(iso: string) {
    return (dayDiff(rangeStart, iso) / totalDays) * 100
  }

  async function commit(id: string, next: RowState) {
    const prev = rows[id]
    setRows((r) => ({ ...r, [id]: next }))
    setErrors((e) => ({ ...e, [id]: '' }))
    const result = await updateLineItemSchedule({
      id,
      inspectionId,
      status: next.status,
      scheduledStart: next.scheduled_start,
      scheduledEnd: next.scheduled_end,
      blocksLineItemId: next.blocks_line_item_id,
    })
    if (result.error) {
      setRows((r) => ({ ...r, [id]: prev })) // revert -- no toast, matches DESIGN.md's no-toast status-change convention
      setErrors((e) => ({ ...e, [id]: result.error! }))
    }
  }

  // Move/up listeners are attached imperatively on `window`, not via React
  // props conditioned on drag state -- React re-renders (which is when
  // conditionally-attached JSX event props actually take effect) happen
  // asynchronously relative to native pointer events. A fast drag can fire
  // pointermove/pointerup before that re-render lands, which would silently
  // drop the whole gesture (including the commit on pointerup) if the
  // handlers depended on it. Window-level listeners set up synchronously in
  // pointerdown don't have this gap.
  function onBarPointerDown(e: React.PointerEvent, id: string) {
    const row = rows[id]
    if (!row.scheduled_start || !row.scheduled_end) return
    const startX = e.clientX
    const origStart = row.scheduled_start
    const origEnd = row.scheduled_end
    // status/blocksLineItemId captured now, not read back from `rows` on
    // pointerup -- nothing else can plausibly edit this same row's other
    // fields mid-gesture in a single-user UI, and capturing avoids a stale-
    // closure read of `rows` inside a listener set up once at drag-start.
    dragStateRef.current = { id, startX, origStart, origEnd, status: row.status, blocksLineItemId: row.blocks_line_item_id }
    dragPreviewRef.current = { start: origStart, end: origEnd }
    setDraggingId(id)
    setDragPreview(dragPreviewRef.current)

    function handleMove(ev: PointerEvent) {
      if (!trackRef.current) return
      const trackWidth = trackRef.current.getBoundingClientRect().width
      const pxPerDay = trackWidth / totalDays
      const deltaDays = Math.round((ev.clientX - startX) / pxPerDay)
      dragPreviewRef.current = { start: addDays(origStart, deltaDays), end: addDays(origEnd, deltaDays) }
      setDragPreview(dragPreviewRef.current)
    }

    // Reads dragPreviewRef directly rather than via a setDragPreview updater
    // callback -- calling commit() (which itself calls setRows/setErrors)
    // from inside another component's state-updater function is a real bug,
    // not just an odd pattern: React runs updater functions as part of
    // processing the state queue, so a setState call nested inside one
    // executes in that same synchronous pass and trips React's "Cannot
    // update a component while rendering a different component" check
    // (confirmed via console error during manual drag testing).
    function handleUp() {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      const drag = dragStateRef.current
      const preview = dragPreviewRef.current
      dragStateRef.current = null
      dragPreviewRef.current = null
      setDraggingId(null)
      setDragPreview(null)
      if (drag && preview && (preview.start !== drag.origStart || preview.end !== drag.origEnd)) {
        void commit(drag.id, {
          status: drag.status,
          blocks_line_item_id: drag.blocksLineItemId,
          scheduled_start: preview.start,
          scheduled_end: preview.end,
        })
      }
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
  }

  function highlightRow(id: string) {
    const el = document.getElementById(`timeline-row-${id}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('bg-accent-bg')
    setTimeout(() => el.classList.remove('bg-accent-bg'), 1200)
  }

  const groups = useMemo(() => {
    const map = new Map<string, TimelineItem[]>()
    for (const li of lineItems) {
      if (!map.has(li.room_area)) map.set(li.room_area, [])
      map.get(li.room_area)!.push(li)
    }
    return map
  }, [lineItems])

  return (
    <div className="relative">
      {/* Today marker spans the axis + every row below it. */}
      <div
        className="absolute top-0 bottom-0 w-px bg-accent z-10 pointer-events-none"
        style={{ left: `calc(280px + (100% - 280px) * ${todayPct / 100})` }}
      >
        <span className="absolute -top-0 left-1 text-[9px] font-semibold text-accent whitespace-nowrap">Today</span>
      </div>

      <div className="grid grid-cols-[280px_1fr] border-b border-border bg-surface-alt px-6 py-2">
        <div />
        <div className="relative h-4" ref={trackRef}>
          {ticks.map((t) => (
            <span
              key={t.iso}
              className="absolute top-0 data-mono text-[10px] text-text-muted -translate-x-1/2"
              style={{ left: `${t.pct}%` }}
            >
              {new Date(`${t.iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
            </span>
          ))}
        </div>
      </div>

      {[...groups.entries()].map(([room, items]) => (
        <div key={room}>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted px-6 pt-3 pb-1">
            {room}
          </div>
          {items.map((li) => {
            const row = rows[li.id]
            const isDragging = draggingId === li.id
            const start = isDragging && dragPreview ? dragPreview.start : row.scheduled_start
            const end = isDragging && dragPreview ? dragPreview.end : row.scheduled_end
            const predecessor = row.blocks_line_item_id ? itemsById.get(row.blocks_line_item_id) : null
            const otherItems = lineItems.filter((o) => o.id !== li.id)

            return (
              <div
                id={`timeline-row-${li.id}`}
                key={li.id}
                className="grid grid-cols-[280px_1fr] gap-2 px-6 py-2 border-b border-border items-center transition-colors"
              >
                <div className="min-w-0 pr-2 space-y-1">
                  <div className="font-semibold text-[13px] truncate">{li.item}</div>
                  <div className="text-[11px] text-text-muted">{li.assigned_to ?? '—'}</div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <select
                      value={row.status}
                      onChange={(e) => commit(li.id, { ...row, status: e.target.value })}
                      className={`text-[11px] border border-border rounded-[var(--radius-sm)] px-1 py-0.5 bg-surface ${
                        row.status === 'blocked' ? 'text-error font-semibold' : 'text-text-muted'
                      }`}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="date"
                      value={start ?? ''}
                      onChange={(e) => commit(li.id, { ...row, scheduled_start: e.target.value || null })}
                      className="data-mono text-[10px] border border-border rounded-[var(--radius-sm)] px-1 py-0.5 bg-surface w-[104px]"
                      aria-label={`${li.item} scheduled start`}
                    />
                    <span className="text-[10px] text-text-muted">–</span>
                    <input
                      type="date"
                      value={end ?? ''}
                      onChange={(e) => commit(li.id, { ...row, scheduled_end: e.target.value || null })}
                      className="data-mono text-[10px] border border-border rounded-[var(--radius-sm)] px-1 py-0.5 bg-surface w-[104px]"
                      aria-label={`${li.item} scheduled end`}
                    />
                  </div>
                  <select
                    value={row.blocks_line_item_id ?? ''}
                    onChange={(e) => commit(li.id, { ...row, blocks_line_item_id: e.target.value || null })}
                    className="text-[10px] border border-border rounded-[var(--radius-sm)] px-1 py-0.5 bg-surface w-full max-w-[200px]"
                    aria-label={`${li.item} blocked by`}
                  >
                    <option value="">— not blocked —</option>
                    {otherItems.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.room_area} / {o.item}
                      </option>
                    ))}
                  </select>
                  {predecessor && (
                    <button
                      type="button"
                      onClick={() => highlightRow(predecessor.id)}
                      className="text-[10px] text-text-muted border border-border rounded-[var(--radius-sm)] px-1.5 py-0.5 bg-surface hover:bg-surface-alt hover:border-text-muted w-fit block"
                    >
                      ← blocked by: {predecessor.item}
                    </button>
                  )}
                  {errors[li.id] && <div className="text-[10px] text-error">{errors[li.id]}</div>}
                </div>

                <div className="relative h-8 rounded-[var(--radius-sm)] bg-[repeating-linear-gradient(90deg,transparent,transparent_calc(10%-1px),var(--color-border)_calc(10%-1px),var(--color-border)_10%)]">
                  {start && end ? (
                    <div
                      onPointerDown={(e) => onBarPointerDown(e, li.id)}
                      className={`absolute top-1 h-6 rounded-[var(--radius-sm)] flex items-center gap-1.5 px-2 text-[10px] font-medium text-white cursor-grab active:cursor-grabbing select-none ${
                        row.status === 'blocked'
                          ? 'bg-[repeating-linear-gradient(45deg,var(--color-error),var(--color-error)_4px,#c74a41_4px,#c74a41_8px)]'
                          : 'bg-text-muted'
                      } ${isDragging ? 'outline outline-2 outline-accent outline-offset-1 shadow-md' : ''}`}
                      style={{ left: `${pct(start)}%`, width: `${Math.max(pct(end) - pct(start), 3)}%`, minWidth: '78px' }}
                    >
                      <span className="data-mono whitespace-nowrap overflow-hidden text-ellipsis">
                        {new Date(`${start}T00:00:00Z`).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', timeZone: 'UTC' })}
                        –
                        {new Date(`${end}T00:00:00Z`).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', timeZone: 'UTC' })}
                      </span>
                    </div>
                  ) : (
                    <div className="absolute inset-y-1 left-0 right-0 border border-dashed border-border rounded-[var(--radius-sm)] flex items-center px-2">
                      <span className="text-[11px] italic text-text-muted">Not scheduled</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
