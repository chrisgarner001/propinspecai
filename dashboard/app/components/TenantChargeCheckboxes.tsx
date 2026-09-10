'use client'

import { useState } from 'react'

// Two independently-styled checkboxes (no text labels) over one underlying
// value -- line_items.tenant_status is a single column ('tenant_charge' |
// 'approved' | null), so checking one clears the other. Renders as a
// Fragment so its two divs land as direct grid items in the parent row's
// CSS grid, matching the two "Tenant Charge" / "Approve" columns.
export default function TenantChargeCheckboxes({
  name,
  defaultValue,
}: {
  name: string
  defaultValue: string | null
}) {
  const [value, setValue] = useState(defaultValue ?? '')

  return (
    <>
      <div role="cell" className="min-w-0 flex justify-center">
        <input
          type="checkbox"
          checked={value === 'tenant_charge'}
          onChange={(e) => setValue(e.target.checked ? 'tenant_charge' : '')}
          className="h-4 w-4 cursor-pointer accent-accent"
        />
      </div>
      <div role="cell" className="min-w-0 flex justify-center">
        <input
          type="checkbox"
          checked={value === 'approved'}
          onChange={(e) => setValue(e.target.checked ? 'approved' : '')}
          className="h-4 w-4 cursor-pointer accent-success"
        />
      </div>
      <input type="hidden" name={name} value={value} />
    </>
  )
}
