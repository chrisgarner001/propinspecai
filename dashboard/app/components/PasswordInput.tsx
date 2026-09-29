'use client'

import { useState } from 'react'

const fieldClass = 'border border-border rounded-[var(--radius-sm)] px-2.5 py-1.5 w-full bg-surface pr-14'

// Shared by LoginForm and ChangePasswordForm so both get the same show/hide
// toggle (plan-eng-review, 2026-09-29) instead of duplicating the
// type-toggle state and button in each form.
export default function PasswordInput({
  value,
  onChange,
  autoFocus,
  minLength,
  label,
}: {
  value: string
  onChange: (value: string) => void
  autoFocus?: boolean
  minLength?: number
  label: string
}) {
  const [visible, setVisible] = useState(false)

  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-1">
        {label}
      </label>
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          required
          autoFocus={autoFocus}
          minLength={minLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={fieldClass}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          tabIndex={-1}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-accent hover:text-accent-hover"
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  )
}
