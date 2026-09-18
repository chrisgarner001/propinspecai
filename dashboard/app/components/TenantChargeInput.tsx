'use client'

import { useState } from 'react'

// For the standalone Tenant Chargeback Review screen -- deliberately
// simpler than TenantChargeCheckboxes (no "Remove from Quote Sheet"
// checkbox, since that's a Quote Sheet concept not relevant here) and
// deliberately starts the amount field BLANK, not pre-filled with a
// materials+labor total: at the 30-day disposition deadline that cost data
// often doesn't exist yet, so the amount here is the reviewer's own
// judgment call, not a number to second-guess against a quote that may not
// exist. This number and the eventual rehab quote are allowed to diverge --
// no reconciliation is attempted.
export default function TenantChargeInput({
  id,
  tenantCharge: initialTenantCharge,
  tenantChargeAmount,
}: {
  id: string
  tenantCharge: boolean
  tenantChargeAmount: string | null
}) {
  const [checked, setChecked] = useState(initialTenantCharge)

  return (
    <div className="flex items-center gap-3 whitespace-nowrap">
      <label className="flex items-center gap-1.5 text-[12px] cursor-pointer">
        <input
          type="checkbox"
          name={`tenant_charge__${id}`}
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="h-4 w-4 cursor-pointer accent-accent"
        />
        Tenant Charge
      </label>
      {checked && (
        <div className="flex items-center gap-1">
          <span className="text-[12px] text-text-muted">$</span>
          <input
            type="number"
            step="0.01"
            name={`tenant_charge_amount__${id}`}
            defaultValue={tenantChargeAmount ?? ''}
            placeholder="0.00"
            className="text-[12px] data-mono border border-border rounded-[var(--radius-sm)] px-2 py-1 w-24 bg-surface"
          />
        </div>
      )}
    </div>
  )
}
