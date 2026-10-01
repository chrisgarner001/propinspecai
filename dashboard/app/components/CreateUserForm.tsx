'use client'

import { useState, useTransition } from 'react'
import { createUser } from '@/app/actions'

const fieldClass = 'border border-border rounded-[var(--radius-sm)] px-2.5 py-1.5 w-full bg-surface'

// Plain <form action={fn}> can't show a duplicate-email/send-failure
// rejection inline (the page would just re-render with the same empty
// state) -- so this calls createUser directly via useTransition, matching
// the pattern HelpWidget.tsx already uses for the same reason.
export default function CreateUserForm({ inspectors }: { inspectors: { id: string; name: string }[] }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('General User')
  const [inspectorId, setInspectorId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await createUser(email, role, role === 'Inspector' ? inspectorId : null)
      if (result.error) {
        setError(result.error)
        return
      }
      setEmail('')
      setRole('General User')
      setInspectorId('')
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 flex-wrap">
      <div className="flex-1 min-w-[180px]">
        <label className="block text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-1">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={fieldClass}
        />
      </div>
      <div className="w-40">
        <label className="block text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-1">Level</label>
        <select value={role} onChange={(e) => setRole(e.target.value)} className={fieldClass}>
          <option value="General User">General User</option>
          <option value="Admin">Admin</option>
          <option value="Inspector">Inspector (iPad)</option>
        </select>
      </div>
      {role === 'Inspector' && (
        <div className="w-44">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-1">Inspector</label>
          <select required value={inspectorId} onChange={(e) => setInspectorId(e.target.value)} className={fieldClass}>
            <option value="">Pick one…</option>
            {inspectors.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-2 text-[12px] font-semibold whitespace-nowrap disabled:opacity-50"
      >
        {isPending ? 'Adding…' : 'Add User'}
      </button>
      {error && <div className="text-[12px] text-error w-full">{error}</div>}
    </form>
  )
}
