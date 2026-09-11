'use client'

import { useState } from 'react'
import VendorSelect from './VendorSelect'

type Vendor = { id: string; name: string }

const ASSIGNED_TO_OPTIONS = ['GPM Staff', 'Outside Vendor', 'Other']

// Mirrors LineItemAssignment's assigned_to/vendor pairing for the "Add a
// line item" form -- a plain <select> can't conditionally reveal the vendor
// picker without client state.
export default function NewLineItemAssignedTo({ vendors }: { vendors: Vendor[] }) {
  const [assignedTo, setAssignedTo] = useState('')

  return (
    <div className="space-y-1">
      <select
        name="assigned_to"
        value={assignedTo}
        onChange={(e) => setAssignedTo(e.target.value)}
        className="border border-border rounded-[var(--radius-sm)] px-2 py-1.5 w-full bg-surface"
      >
        <option value="">—</option>
        {ASSIGNED_TO_OPTIONS.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      {assignedTo === 'Outside Vendor' && <VendorSelect name="vendor_id" vendors={vendors} defaultValue={null} />}
    </div>
  )
}
