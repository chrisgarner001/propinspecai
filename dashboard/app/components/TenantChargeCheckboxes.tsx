// Tenant Charge and Approve are independent per-item flags (line_items.tenant_charge
// / tenant_approved are separate booleans), so both can be checked at once. Plain
// uncontrolled checkboxes -- no client state needed since nothing here is mutually
// exclusive. Renders as a Fragment so its two divs land as direct grid items in the
// parent row's CSS grid, matching the "Tenant Charge" / "Approve" columns.
export default function TenantChargeCheckboxes({
  id,
  tenantCharge,
  tenantApproved,
}: {
  id: string
  tenantCharge: boolean
  tenantApproved: boolean
}) {
  return (
    <>
      <div role="cell" className="min-w-0 flex justify-center">
        <input
          type="checkbox"
          name={`tenant_charge__${id}`}
          defaultChecked={tenantCharge}
          className="h-4 w-4 cursor-pointer accent-accent"
        />
      </div>
      <div role="cell" className="min-w-0 flex justify-center">
        <input
          type="checkbox"
          name={`tenant_approved__${id}`}
          defaultChecked={tenantApproved}
          className="h-4 w-4 cursor-pointer accent-success"
        />
      </div>
    </>
  )
}
