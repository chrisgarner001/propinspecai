'use client'

import { useState } from 'react'

export default function LaborHoursInput({
  name,
  defaultValue,
  disabled,
}: {
  name: string
  defaultValue: string | null
  disabled: boolean
}) {
  const [hours, setHours] = useState(defaultValue ?? '')

  return (
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
  )
}
