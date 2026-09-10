'use client'

import { useState } from 'react'

export default function LaborHoursInput({
  name,
  defaultValue,
  rate,
  disabled,
}: {
  name: string
  defaultValue: string | null
  rate: number
  disabled: boolean
}) {
  const [hours, setHours] = useState(defaultValue ?? '')
  const cost = hours === '' ? null : Number(hours) * rate

  return (
    <div>
      <input
        name={name}
        type="number"
        step="0.25"
        value={hours}
        onChange={(e) => setHours(e.target.value)}
        disabled={disabled}
        placeholder="—"
        className="data-mono border border-border rounded-[var(--radius-sm)] px-2 py-1 w-full min-w-0 bg-surface disabled:bg-surface-alt disabled:text-text-muted"
      />
      <div className="data-mono text-[10px] text-text-muted mt-0.5">
        {cost !== null ? `= $${cost.toFixed(2)}` : `@ $${rate.toFixed(2)}/hr`}
      </div>
    </div>
  )
}
