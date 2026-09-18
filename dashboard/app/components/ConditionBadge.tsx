// Condition is one of the four reserved semantic colors in DESIGN.md
// (Good/Fair/Damaged/Not Rated -> success/fair/error/neutral) -- this is the
// first read-only display of it as a badge; everywhere else it's an
// editable <select>.
const CONDITION_STYLES: Record<string, { bg: string; text: string }> = {
  Good: { bg: 'bg-success-bg', text: 'text-success' },
  Fair: { bg: 'bg-fair-bg', text: 'text-fair' },
  Damaged: { bg: 'bg-error-bg', text: 'text-error' },
  'Not Rated': { bg: 'bg-neutral-bg', text: 'text-neutral' },
}

export default function ConditionBadge({ condition }: { condition: string }) {
  const style = CONDITION_STYLES[condition] ?? CONDITION_STYLES['Not Rated']
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${style.bg} ${style.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.text.replace('text-', 'bg-')}`} />
      {condition}
    </span>
  )
}
