'use client'

import { useRef } from 'react'
import { updateInspectionStatus } from '@/app/actions'
import { STATUS_STYLES } from './StatusBadge'

export default function StatusSelect({ inspectionId, status }: { inspectionId: string; status: string }) {
  const formRef = useRef<HTMLFormElement>(null)
  const style = STATUS_STYLES[status] ?? { label: status, bg: 'bg-neutral-bg', text: 'text-neutral' }

  return (
    <form ref={formRef} action={updateInspectionStatus}>
      <input type="hidden" name="inspection_id" value={inspectionId} />
      <select
        name="status"
        defaultValue={status}
        onChange={() => formRef.current?.requestSubmit()}
        className={`appearance-none rounded-full pl-4 pr-2.5 py-0.5 text-[12px] font-semibold border-none cursor-pointer ${style.bg} ${style.text}`}
      >
        <option value="under_review">Under Review</option>
        <option value="quote_sent">Quote Sent</option>
        <option value="approved">Approved</option>
        <option value="in_process">In Process</option>
        <option value="completed">Completed</option>
      </select>
    </form>
  )
}
