'use client'

// Confirms only when at least one row is staged for removal (via
// RemoveSectionControl's hidden remove__<id> inputs) -- saving plain edits
// stays a single click, same as before.
export default function SaveChangesButton() {
  return (
    <button
      type="submit"
      onClick={(e) => {
        const form = e.currentTarget.closest('form')
        const removeInputs = form ? Array.from(form.querySelectorAll<HTMLInputElement>('input[name^="remove__"]')) : []
        const markedCount = removeInputs.filter((input) => input.value === '1').length
        if (markedCount > 0 && !confirm(`Save changes and permanently remove ${markedCount} item(s) marked for removal?`)) {
          e.preventDefault()
        }
      }}
      className="bg-accent hover:bg-accent-hover text-white rounded-[var(--radius-sm)] px-4 py-2 text-[13px] font-semibold"
    >
      Save all changes
    </button>
  )
}
