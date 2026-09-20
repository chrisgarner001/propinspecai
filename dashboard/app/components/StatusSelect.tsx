'use client'

import { useState, useTransition } from 'react'
import { updateInspectionStatus } from '@/app/actions'
import { STATUS_STYLES, STATUS_ORDER } from './StatusBadge'

// `options` restricts which values are selectable from this particular pill
// (e.g. the Quote Sheet page's pill omits "Under Review" -- doesn't make
// sense to un-create a quote) while still writing the same
// inspections.status column as every other pill, via the same options set
// as the labels/colors in STATUS_STYLES.
//
// Controlled, not defaultValue-on-a-form: the pill's color comes from local
// state updated the instant the reviewer picks a value, then confirmed by
// the server action in the background. Before this, the color was computed
// from the `status` PROP alone -- which only changes when the parent Server
// Component re-fetches on a real navigation, so submitting the form changed
// the value in the database immediately but the pill kept showing the OLD
// color until the page was left and revisited.
export default function StatusSelect({
  inspectionId,
  status: initialStatus,
  options = STATUS_ORDER,
}: {
  inspectionId: string
  status: string
  options?: string[]
}) {
  const [status, setStatus] = useState(initialStatus)
  const [isPending, startTransition] = useTransition()
  const style = STATUS_STYLES[status] ?? { label: status, bg: 'bg-neutral-bg', text: 'text-neutral' }

  // The current status is always included even if it's outside `options` --
  // a restricted pill (e.g. the Quote Sheet's, which omits "Under Review")
  // must never silently misrepresent the real value as whatever its first
  // listed option happens to be just because the true status isn't in that
  // shorter list.
  const displayOptions = options.includes(status) ? options : [status, ...options]

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value
    const prev = status
    setStatus(next)
    startTransition(async () => {
      const formData = new FormData()
      formData.set('inspection_id', inspectionId)
      formData.set('status', next)
      try {
        await updateInspectionStatus(formData)
      } catch {
        setStatus(prev) // revert -- no toast, matches this app's existing no-toast status-change convention
      }
    })
  }

  return (
    <select
      value={status}
      onChange={handleChange}
      disabled={isPending}
      className={`appearance-none rounded-full pl-4 pr-2.5 py-0.5 text-[12px] font-semibold border-none cursor-pointer disabled:opacity-70 ${style.bg} ${style.text}`}
    >
      {displayOptions.map((value) => (
        <option key={value} value={value}>
          {STATUS_STYLES[value]?.label ?? value}
        </option>
      ))}
    </select>
  )
}
