'use client'

import { useRef } from 'react'
import { updateInspectionStatus } from '@/app/actions'
import { STATUS_STYLES, STATUS_ORDER } from './StatusBadge'

// `options` restricts which values are selectable from this particular pill
// (e.g. the Quote Sheet page's pill omits "Under Review" -- doesn't make
// sense to un-create a quote) while still writing the same
// inspections.status column as every other pill, via the same options set
// as the labels/colors in STATUS_STYLES.
export default function StatusSelect({
  inspectionId,
  status,
  options = STATUS_ORDER,
}: {
  inspectionId: string
  status: string
  options?: string[]
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const style = STATUS_STYLES[status] ?? { label: status, bg: 'bg-neutral-bg', text: 'text-neutral' }

  // The current status is always included even if it's outside `options` --
  // a restricted pill (e.g. the Quote Sheet's, which omits "Under Review")
  // must never silently misrepresent the real value as whatever its first
  // listed option happens to be just because the true status isn't in that
  // shorter list.
  const displayOptions = options.includes(status) ? options : [status, ...options]

  return (
    <form ref={formRef} action={updateInspectionStatus}>
      <input type="hidden" name="inspection_id" value={inspectionId} />
      <select
        name="status"
        defaultValue={status}
        onChange={() => formRef.current?.requestSubmit()}
        className={`appearance-none rounded-full pl-4 pr-2.5 py-0.5 text-[12px] font-semibold border-none cursor-pointer ${style.bg} ${style.text}`}
      >
        {displayOptions.map((value) => (
          <option key={value} value={value}>
            {STATUS_STYLES[value]?.label ?? value}
          </option>
        ))}
      </select>
    </form>
  )
}
