const CONDITION_STYLES: Record<string, { bg: string; text: string }> = {
  Good: { bg: 'bg-success-bg', text: 'text-success' },
  Fair: { bg: 'bg-fair-bg', text: 'text-fair' },
  Damaged: { bg: 'bg-error-bg', text: 'text-error' },
  'Not Rated': { bg: 'bg-neutral-bg', text: 'text-neutral' },
}

export default function ConditionBadge({ condition }: { condition: string }) {
  const style = CONDITION_STYLES[condition] ?? { bg: 'bg-neutral-bg', text: 'text-neutral' }
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-[12px] font-semibold ${style.bg} ${style.text}`}>
      {condition}
    </span>
  )
}
