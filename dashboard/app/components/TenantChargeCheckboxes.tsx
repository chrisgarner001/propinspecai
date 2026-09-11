'use client'

import { useState } from 'react'

// Tenant Charge and Remove-from-Quote-Sheet are independent per-item flags,
// so both can be checked at once. Renders as a Fragment so its divs land as
// direct grid items in the parent row's CSS grid, matching the "Tenant
// Charge" / "Remove from Quote Sheet" columns.
//
// removedFromQuoteSheet is stored in line_items.tenant_approved -- that
// column originally meant tenant approval, but is unused for that purpose
// (0 rows ever set it) and has been repurposed rather than adding a new
// column. Checked = excluded from the Quote Sheet editor and the generated
// Quote PDF (see quote-sheet/page.tsx and quote-sheet/pdf/route.ts's query
// filters).
//
// Tenant Charge is a client component (not plain uncontrolled checkboxes) so
// the charge-amount field can mount/unmount live as the checkbox toggles --
// it's hidden entirely until Tenant Charge is checked, then starts out
// prefilled with the full materials+labor cost (defaultTotal), which the
// reviewer can lower for partial tenant responsibility.
export default function TenantChargeCheckboxes({
  id,
  tenantCharge: initialTenantCharge,
  tenantChargeAmount,
  defaultTotal,
  removedFromQuoteSheet,
}: {
  id: string
  tenantCharge: boolean
  tenantChargeAmount: string | null
  defaultTotal: number
  removedFromQuoteSheet: boolean
}) {
  const [tenantCharge, setTenantCharge] = useState(initialTenantCharge)

  return (
    <>
      <div role="cell" className="min-w-0 flex flex-col items-center gap-1">
        <input
          type="checkbox"
          name={`tenant_charge__${id}`}
          checked={tenantCharge}
          onChange={(e) => setTenantCharge(e.target.checked)}
          className="h-4 w-4 cursor-pointer accent-accent"
        />
        {tenantCharge && (
          <input
            type="number"
            step="1"
            name={`tenant_charge_amount__${id}`}
            defaultValue={tenantChargeAmount ?? defaultTotal}
            title="Amount actually charged to the tenant, if less than the full materials + labor cost"
            className="text-[11px] data-mono border border-border rounded-[var(--radius-sm)] px-1 py-0.5 w-16 min-w-0 bg-surface text-center"
          />
        )}
      </div>
      <div role="cell" className="min-w-0 flex justify-center">
        <input
          type="checkbox"
          name={`tenant_approved__${id}`}
          defaultChecked={removedFromQuoteSheet}
          className="h-4 w-4 cursor-pointer accent-error"
        />
      </div>
    </>
  )
}
