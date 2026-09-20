'use client'

import { useState } from 'react'
import LaborHoursInput from './LaborHoursInput'

const costField =
  'data-mono border border-border rounded-[var(--radius-sm)] px-2 py-1 w-full min-w-0 bg-surface disabled:bg-surface-alt disabled:text-text-muted'

// Materials $ and Labor (hrs) for the "Materials for this Item" row -- split
// out of LineItemAssignment (see that file's comment) so they sit next to
// Supplier/SKU instead of the main row. Keeps its own independent copy of
// the self-performed check from the same initial assigned_to value.
export default function LineItemMaterialsCost({
  id,
  assignedTo: initialAssignedTo,
  materialsCost,
  laborHours,
  laborRate,
}: {
  id: string
  assignedTo: string | null
  materialsCost: string | null
  laborHours: string | null
  laborRate: number
}) {
  const [assignedTo] = useState(initialAssignedTo ?? '')
  const selfPerformed = assignedTo === 'GPM Staff' || assignedTo === 'Other'

  return (
    <>
      <div className="w-24">
        <label className="block text-[10px] font-semibold uppercase tracking-wide text-text-muted mb-1">
          Materials $
        </label>
        <input
          name={`materials_cost__${id}`}
          type="number"
          step="5"
          defaultValue={materialsCost ?? ''}
          disabled={!selfPerformed}
          placeholder="—"
          className={costField}
        />
      </div>
      <div className="w-28">
        <label className="block text-[10px] font-semibold uppercase tracking-wide text-text-muted mb-1">
          Labor (hrs)
        </label>
        <LaborHoursInput name={`labor_hours__${id}`} defaultValue={laborHours} rate={laborRate} disabled={!selfPerformed} />
      </div>
    </>
  )
}
