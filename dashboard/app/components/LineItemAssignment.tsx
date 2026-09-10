'use client'

import { useState } from 'react'
import VendorSelect from './VendorSelect'
import LaborHoursInput from './LaborHoursInput'

type Vendor = { id: string; name: string }

const ASSIGNED_TO_OPTIONS = ['GPM Staff', 'Outside Vendor', 'Other']

const miniField =
  'text-[12px] border border-border rounded-[var(--radius-sm)] px-1.5 py-1 w-full bg-surface truncate'

const costField =
  'data-mono border border-border rounded-[var(--radius-sm)] px-2 py-1 w-full min-w-0 bg-surface disabled:bg-surface-alt disabled:text-text-muted'

// assigned_to drives which cost fields are editable, so it must live in one
// client component with those fields: server-rendered `disabled` props only
// reflect the DB value at page load, and would otherwise stay stuck at the
// old assignment until the row is saved and the page re-renders.
export default function LineItemAssignment({
  id,
  assignedTo: initialAssignedTo,
  vendorId,
  vendors,
  materialsCost,
  laborHours,
  laborRate,
  vendorEstimatedCost,
}: {
  id: string
  assignedTo: string | null
  vendorId: string | null
  vendors: Vendor[]
  materialsCost: string | null
  laborHours: string | null
  laborRate: number
  vendorEstimatedCost: string | null
}) {
  const [assignedTo, setAssignedTo] = useState(initialAssignedTo ?? '')
  const selfPerformed = assignedTo === 'GPM Staff' || assignedTo === 'Other'
  const outsideVendor = assignedTo === 'Outside Vendor'

  return (
    <>
      <div role="cell" className="min-w-0 space-y-1">
        <select
          name={`assigned_to__${id}`}
          value={assignedTo}
          onChange={(e) => setAssignedTo(e.target.value)}
          className={miniField}
        >
          <option value="">—</option>
          {ASSIGNED_TO_OPTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        {outsideVendor && <VendorSelect name={`vendor_id__${id}`} vendors={vendors} defaultValue={vendorId} />}
      </div>
      <input
        role="cell"
        name={`materials_cost__${id}`}
        type="number"
        step="5"
        defaultValue={materialsCost ?? ''}
        disabled={!selfPerformed}
        placeholder="—"
        className={costField}
      />
      <div role="cell" className="min-w-0">
        <LaborHoursInput name={`labor_hours__${id}`} defaultValue={laborHours} rate={laborRate} disabled={!selfPerformed} />
      </div>
      <input
        role="cell"
        name={`vendor_estimated_cost__${id}`}
        type="number"
        step="5"
        defaultValue={vendorEstimatedCost ?? ''}
        disabled={!outsideVendor}
        placeholder="—"
        className={costField}
      />
    </>
  )
}
