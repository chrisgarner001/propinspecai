'use client'

type Props = {
  action: (formData: FormData) => void
  label?: string
  className?: string
}

export default function DeleteInspectionButton({ action, label = 'Delete', className }: Props) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm('Delete this inspection and all of its line items? This cannot be undone.')) {
          e.preventDefault()
        }
      }}
    >
      <button
        type="submit"
        className={className ?? 'text-[12px] font-semibold text-text-muted hover:text-red-600'}
      >
        {label}
      </button>
    </form>
  )
}
