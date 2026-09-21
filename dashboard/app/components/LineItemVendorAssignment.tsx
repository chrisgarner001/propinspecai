'use client'

import { useState } from 'react'
import VendorSelect from './VendorSelect'

type Vendor = { id: string; name: string }

const ASSIGNED_TO_OPTIONS = ['GPM Staff', 'Outside Vendor', 'Other']

const miniField =
  'text-[12px] border border-border rounded-[var(--radius-sm)] px-1.5 py-1 w-full bg-surface truncate'

const costField =
  'data-mono border border-border rounded-[var(--radius-sm)] px-2 py-1 w-full min-w-0 bg-surface disabled:bg-surface-alt disabled:text-text-muted'

// Quote Sheet's own variant of LineItemAssignment.tsx: that component's
// Materials $/Labor (hrs) cells moved into LineItemMaterialsCost.tsx (part of
// the "Materials for this Item" row below, next to Supplier/SKU), so this
// keeps only Vendor/GPM + Vendor Quote for the main row. The inspection
// detail page keeps using the original full LineItemAssignment unchanged --
// it has no separate materials row to move things into.
export default function LineItemVendorAssignment({
  id,
  assignedTo: initialAssignedTo,
  vendorId,
  vendors,
  vendorEstimatedCost,
}: {
  id: string
  assignedTo: string | null
  vendorId: string | null
  vendors: Vendor[]
  vendorEstimatedCost: string | null
}) {
  const [assignedTo, setAssignedTo] = useState(initialAssignedTo ?? '')
  const outsideVendor = assignedTo === 'Outside Vendor'

  return (
    <>
      <div role="cell" className="min-w-0 space-y-1">
        <div className="md:hidden text-[10px] font-semibold uppercase tracking-wide text-text-muted">Vendor/GPM</div>
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
      <div role="cell" className="min-w-0">
        <div className="md:hidden text-[10px] font-semibold uppercase tracking-wide text-text-muted">Vendor Quote</div>
        <input
          name={`vendor_estimated_cost__${id}`}
          type="number"
          step="5"
          defaultValue={vendorEstimatedCost ?? ''}
          disabled={!outsideVendor}
          placeholder="—"
          className={costField}
        />
      </div>
    </>
  )
}
