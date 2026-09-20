'use client'

import { useState } from 'react'

export default function LaborHoursInput({
  name,
  defaultValue,
  disabled,
  onValueChange,
  placeholder = '—',
}: {
  // Optional: AddLineItemSku.tsx doesn't submit this input by name at all
  // (it reads the value via onValueChange and sets it into a FormData entry
  // itself), unlike every other caller, which relies on `name` for a plain
  // form submission.
  name?: string
  defaultValue: string | null
  disabled: boolean
  onValueChange?: (value: string) => void
  placeholder?: string
}) {
  const [hours, setHours] = useState(defaultValue ?? '')

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setHours(e.target.value)
    onValueChange?.(e.target.value)
  }

  return (
    <input
      name={name}
      type="number"
      step="0.25"
      value={hours}
      onChange={handleChange}
      disabled={disabled}
      placeholder={placeholder}
      title={placeholder}
      className="data-mono border border-border rounded-[var(--radius-sm)] px-2 py-1 w-full min-w-0 bg-surface disabled:bg-surface-alt disabled:text-text-muted"
    />
  )
}
