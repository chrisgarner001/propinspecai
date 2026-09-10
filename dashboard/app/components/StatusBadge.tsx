const STATUS_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  pending_review: { label: 'Pending review', bg: 'bg-accent-bg', text: 'text-accent-ink' },
  reviewed: { label: 'Reviewed', bg: 'bg-success-bg', text: 'text-success' },
  exported: { label: 'Exported', bg: 'bg-neutral-bg', text: 'text-neutral' },
}

export default function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? { label: status, bg: 'bg-neutral-bg', text: 'text-neutral' }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${style.bg} ${style.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.text.replace('text-', 'bg-')}`} />
      {style.label}
    </span>
  )
}
