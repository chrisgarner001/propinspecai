export const STATUS_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  under_review: { label: 'Under Review', bg: 'bg-neutral-bg', text: 'text-neutral' },
  quote_sent: { label: 'Quote Sent', bg: 'bg-accent-bg', text: 'text-accent-ink' },
  approved: { label: 'Approved', bg: 'bg-success-bg', text: 'text-success' },
  scheduled: { label: 'Scheduled', bg: 'bg-accent-bg', text: 'text-accent-ink' },
  in_process: { label: 'Work In Process', bg: 'bg-fair-bg', text: 'text-fair' },
  completed: { label: 'Completed', bg: 'bg-neutral-bg', text: 'text-neutral' },
}

// Insertion order above doubles as the canonical display order for every
// status dropdown/grouping in the app.
export const STATUS_ORDER = Object.keys(STATUS_STYLES)

export default function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? { label: status, bg: 'bg-neutral-bg', text: 'text-neutral' }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${style.bg} ${style.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.text.replace('text-', 'bg-')}`} />
      {style.label}
    </span>
  )
}
