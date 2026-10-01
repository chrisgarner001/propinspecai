'use client'

import { useState } from 'react'
import { saveChecklistText } from '@/app/field/actions'

// Saves on blur, not per keystroke -- one request per answer on a weak
// cellular connection, with a visible "Saved" so the inspector knows it took.
export default function ChecklistTextField({
  inspectionId,
  itemId,
  initialValue,
  placeholder,
}: {
  inspectionId: string
  itemId: string
  initialValue: string
  placeholder?: string
}) {
  const [value, setValue] = useState(initialValue)
  const [saved, setSaved] = useState(initialValue)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  async function save() {
    if (value === saved) return
    setStatus('saving')
    try {
      const result = await saveChecklistText(inspectionId, itemId, value)
      if (result.error) {
        setStatus('error')
        return
      }
      setSaved(value)
      setStatus('saved')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          if (status !== 'saving') setStatus('idle')
        }}
        onBlur={save}
        rows={2}
        placeholder={placeholder}
        className="w-full border border-border rounded-[var(--radius-sm)] px-3 py-2 bg-surface text-[16px] data-mono"
      />
      <div className="text-[12px] h-4 text-text-muted">
        {status === 'saving' && 'Saving…'}
        {status === 'saved' && 'Saved'}
        {status === 'error' && <span className="text-error">Not saved. Tap outside the box to try again.</span>}
      </div>
    </div>
  )
}
