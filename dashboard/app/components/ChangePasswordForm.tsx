'use client'

import { useState, useTransition } from 'react'
import { changePassword } from '@/app/change-password/actions'
import PasswordInput from '@/app/components/PasswordInput'

export default function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.')
      return
    }
    startTransition(async () => {
      const result = await changePassword(currentPassword, newPassword)
      if (result?.error) {
        setError(result.error)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="text-left space-y-3">
      <PasswordInput
        label="Temporary Password"
        autoFocus
        value={currentPassword}
        onChange={setCurrentPassword}
      />
      <PasswordInput
        label="New Password"
        minLength={8}
        value={newPassword}
        onChange={setNewPassword}
      />
      <PasswordInput
        label="Confirm New Password"
        minLength={8}
        value={confirmPassword}
        onChange={setConfirmPassword}
      />
      {error && <div className="text-[12px] text-error">{error}</div>}
      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-accent hover:bg-accent-hover text-white rounded-[var(--radius-sm)] px-4 py-2.5 text-[13px] font-semibold disabled:opacity-50"
      >
        {isPending ? 'Saving…' : 'Set Password'}
      </button>
    </form>
  )
}
