'use client'

import { useRef, useState } from 'react'

// Staged, not immediate: marking a row doesn't call the server or touch the
// DB. It flips a hidden `remove__<id>` field and dims the row so the whole
// form -- every other row's unsaved edits included -- only ever commits (or
// discards a removal) when "Save all changes" is submitted, same as every
// other field here.
export default function RemoveSectionControl({ id }: { id: string }) {
  const [marked, setMarked] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  function toggle() {
    const next = !marked
    setMarked(next)
    const row = buttonRef.current?.closest('[role="row"]')
    row?.classList.toggle('opacity-40', next)
  }

  return (
    <>
      <input type="hidden" name={`remove__${id}`} value={marked ? '1' : ''} />
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        className={
          marked
            ? 'text-[10px] font-semibold text-white bg-red-600 hover:bg-red-700 border border-red-600 rounded-[var(--radius-sm)] px-1.5 py-0.5'
            : 'text-[10px] font-semibold text-text-muted hover:text-red-600 border border-border hover:border-red-600 rounded-[var(--radius-sm)] px-1.5 py-0.5 bg-surface'
        }
      >
        {marked ? 'Undo remove' : 'Remove Section'}
      </button>
    </>
  )
}
