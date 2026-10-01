'use client'

import { useState, useTransition } from 'react'
import { addPlannedRoom, removePlannedRoom, movePlannedRoom } from '@/app/field/actions'
import { ROOM_PRESETS } from '@/lib/roomPlan'

const tapButton =
  'min-h-11 bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 text-[15px] font-semibold disabled:opacity-50'
const iconButton =
  'min-h-11 min-w-11 bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] text-[15px] font-semibold disabled:opacity-30'

export default function RoomPlanEditor({
  inspectionId,
  rooms,
}: {
  inspectionId: string
  rooms: { id: string; room_name: string }[]
}) {
  const [custom, setCustom] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function run(action: () => Promise<{ error?: string }>, after?: () => void) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result.error) setError(result.error)
      else after?.()
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[13px] text-text-muted mb-2">Tap to add. Bedrooms and bathrooms number themselves.</div>
        <div className="flex flex-wrap gap-2">
          {ROOM_PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              disabled={isPending}
              onClick={() => run(() => addPlannedRoom(inspectionId, { preset: p.name }))}
              className={tapButton}
            >
              + {p.name}
            </button>
          ))}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          run(() => addPlannedRoom(inspectionId, { custom }), () => setCustom(''))
        }}
        className="flex gap-2"
      >
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Other room, e.g. Bonus Room"
          className="min-h-11 flex-1 border border-border rounded-[var(--radius-sm)] px-3 bg-surface text-[16px]"
        />
        <button type="submit" disabled={isPending || !custom.trim()} className={tapButton}>
          Add
        </button>
      </form>

      {error && <div className="text-[13px] text-error">{error}</div>}

      {rooms.length === 0 ? (
        <div className="text-[14px] text-text-muted italic">No rooms yet.</div>
      ) : (
        <ol className="border border-border rounded-[var(--radius-lg)] divide-y divide-border bg-surface">
          {rooms.map((r, i) => (
            <li key={r.id} className="flex items-center gap-2 px-3 py-1.5">
              <span className="data-mono text-[13px] text-text-muted w-6">{i + 1}</span>
              <span className="flex-1 text-[16px] font-medium">{r.room_name}</span>
              <button
                type="button"
                aria-label={`Move ${r.room_name} up`}
                disabled={isPending || i === 0}
                onClick={() => run(() => movePlannedRoom(inspectionId, r.id, 'up'))}
                className={iconButton}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Move ${r.room_name} down`}
                disabled={isPending || i === rooms.length - 1}
                onClick={() => run(() => movePlannedRoom(inspectionId, r.id, 'down'))}
                className={iconButton}
              >
                ↓
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  if (confirm(`Remove ${r.room_name}? Its photo is removed too.`)) run(() => removePlannedRoom(inspectionId, r.id))
                }}
                className="min-h-11 px-3 text-[14px] font-semibold text-text-muted hover:text-error"
              >
                Remove
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
