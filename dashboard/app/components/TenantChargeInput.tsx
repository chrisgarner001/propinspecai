'use client'

import { useState } from 'react'

// For the standalone Tenant Chargeback Review screen -- deliberately
// simpler than the inspection detail page's own checkbox (no "Remove from
// Quote Sheet" concept here, that lives on the Quote Sheet now) and
// deliberately starts the amount field BLANK, not pre-filled with a
// materials+labor total: at the 30-day disposition deadline that cost data
// often doesn't exist yet, so the amount here is the reviewer's own
// judgment call, not a number to second-guess against a quote that may not
// exist. This number and the eventual rehab quote are allowed to diverge --
// no reconciliation is attempted.
//
// tenant_charge_description (2026-09-22 feedback) is a genuinely separate
// piece of text from the Quote Sheet's item/observed_evidence/
// recommended_action -- e.g. Quote Sheet says "paint bedroom", the
// chargeback needs "paint bedroom -- tenant painted without permission,
// coverage poor, requires wall prep/primer/two coats." defaultDescription
// (the standard text) is only the textarea's placeholder, shown as a
// starting point -- typing something else and saving stores it
// independently; leaving it blank keeps using the standard text on the
// report. Unchecking "Tenant Charge" hides (and on save, clears) both the
// amount and this description -- neither has a legitimate use once an item
// isn't being charged.
export default function TenantChargeInput({
  id,
  tenantCharge: initialTenantCharge,
  tenantChargeAmount,
  tenantChargeDescription,
  defaultDescription,
}: {
  id: string
  tenantCharge: boolean
  tenantChargeAmount: string | null
  tenantChargeDescription: string | null
  defaultDescription: string
}) {
  const [checked, setChecked] = useState(initialTenantCharge)

  return (
    <div className="flex flex-col gap-2 w-full md:w-72">
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
        <div className="space-y-1.5">
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
          <textarea
            name={`tenant_charge_description__${id}`}
            defaultValue={tenantChargeDescription ?? ''}
            placeholder={defaultDescription}
            rows={2}
            className="text-[12px] border border-border rounded-[var(--radius-sm)] px-2 py-1 w-full bg-surface resize-y"
          />
          <div className="text-[10px] text-text-muted leading-tight">
            Optional — overrides the report&apos;s default description for this item. Leave blank to use the standard text.
          </div>
        </div>
      )}
    </div>
  )
}
