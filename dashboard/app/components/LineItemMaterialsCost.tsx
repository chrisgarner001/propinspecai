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
}: {
  id: string
  assignedTo: string | null
  materialsCost: string | null
  laborHours: string | null
}) {
  const [assignedTo] = useState(initialAssignedTo ?? '')
  const selfPerformed = assignedTo === 'GPM Staff' || assignedTo === 'Other'

  return (
    <>
      {/* w-20, not w-16 like Qty: a real 2-decimal value ("0.15") in JetBrains
          Mono needs ~69px and was clipping in a 64px box -- measured on a
          live page during /design-review, not a style guess. */}
      <div className="w-20">
        <input
          name={`materials_cost__${id}`}
          type="number"
          step="5"
          defaultValue={materialsCost ?? ''}
          disabled={!selfPerformed}
          placeholder="$"
          title="Materials $"
          className={costField}
        />
      </div>
      <div className="w-20">
        <LaborHoursInput
          name={`labor_hours__${id}`}
          defaultValue={laborHours}
          disabled={!selfPerformed}
          placeholder="hrs"
        />
      </div>
    </>
  )
}
