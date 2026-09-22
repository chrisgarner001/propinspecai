'use client'

import { useState, useTransition } from 'react'
import { login } from '@/app/login/actions'

const fieldClass = 'border border-border rounded-[var(--radius-sm)] px-2.5 py-1.5 w-full bg-surface'

export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await login(email, password)
      if (result?.error) {
        setError(result.error)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="text-left space-y-3">
      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-1">Email</label>
        <input
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={fieldClass}
        />
      </div>
      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-1">Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={fieldClass}
        />
      </div>
      {error && <div className="text-[12px] text-error">{error}</div>}
      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-accent hover:bg-accent-hover text-white rounded-[var(--radius-sm)] px-4 py-2.5 text-[13px] font-semibold disabled:opacity-50"
      >
        {isPending ? 'Signing in…' : 'Sign In'}
      </button>
    </form>
  )
}
