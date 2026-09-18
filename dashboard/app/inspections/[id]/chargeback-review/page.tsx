import { getSql } from '@/lib/db'
import { notFound } from 'next/navigation'
import { updateChargebackReview } from '@/app/actions'
import AppShell from '@/app/components/AppShell'
import ConditionBadge from '@/app/components/ConditionBadge'
import TenantChargeInput from '@/app/components/TenantChargeInput'

// A standalone, fast pass at the tenant-charge decision -- decoupled from the
// Quote Sheet's materials/labor/vendor/stage/batch fields, which often
// aren't filled in yet within the 30-day security-deposit disposition
// deadline (MCL 554.608). A senior PM or maintenance supervisor works
// through this list, decides what's a chargeback, and assigns a dollar
// amount per item; "Generate Move-Out Report" (same PDF as before, unchanged)
// is the next step right here, not buried back on the main inspection page.

type LineItem = {
  id: string
  room_area: string
  item: string
  condition: string
  observed_evidence: string | null
  recommended_action: string | null
  tenant_charge: boolean
  tenant_charge_amount: string | null
}

export default async function ChargebackReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sql = getSql()

  const [inspection] = await sql`select * from inspections where id = ${id}`
  if (!inspection) notFound()

  const lineItems = (await sql`
    select id, room_area, item, condition, observed_evidence, recommended_action, tenant_charge, tenant_charge_amount
    from line_items
    where inspection_id = ${id}
    order by room_area, created_at
  `) as unknown as LineItem[]

  const roomGroups = new Map<string, LineItem[]>()
  for (const li of lineItems) {
    if (!roomGroups.has(li.room_area)) roomGroups.set(li.room_area, [])
    roomGroups.get(li.room_area)!.push(li)
  }

  const chargedItems = lineItems.filter((li) => li.tenant_charge)
  const chargedTotal = chargedItems.reduce((sum, li) => sum + Number(li.tenant_charge_amount ?? 0), 0)

  return (
    <AppShell active="/" reviewerName="Jessica Zilka" title="Tenant Chargeback Review" wide>
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-surface-alt">
        <div className="text-[13px] text-text-muted">
          {inspection.property_address} · Job <span className="data-mono">{inspection.job_number}</span>
        </div>
        <a
          href={`/inspections/${id}/move-out-report`}
          className="bg-accent hover:bg-accent-hover text-white rounded-[var(--radius-sm)] px-3.5 py-2 text-[13px] font-semibold"
        >
          Generate Move-Out Report
        </a>
      </div>

      <div className="flex items-center gap-4 px-6 py-2 border-b border-border text-[12px]">
        <span className="font-semibold text-text-muted uppercase tracking-wide text-[11px]">Chargebacks</span>
        <span className="data-mono text-text-muted">{chargedItems.length} item(s)</span>
        <span className="data-mono font-semibold">${chargedTotal.toFixed(2)}</span>
        <span className="text-text-muted">as of last save</span>
      </div>

      <form action={updateChargebackReview}>
        <input type="hidden" name="inspection_id" value={id} />

        {lineItems.length === 0 && (
          <div className="px-6 py-6 text-[13px] text-text-muted">No line items recorded for this inspection.</div>
        )}

        {[...roomGroups.entries()].map(([room, items]) => (
          <div key={room}>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted px-6 pt-3 pb-1">{room}</div>
            {items.map((li) => (
              <div
                key={li.id}
                className="grid grid-cols-[1fr_auto] gap-4 px-6 py-2.5 border-b border-border items-start"
              >
                <input type="hidden" name="ids" value={li.id} />
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-[13px]">{li.item}</span>
                    <ConditionBadge condition={li.condition} />
                  </div>
                  {(li.observed_evidence || li.recommended_action) && (
                    <div className="text-[12px] text-text-muted">
                      {[li.observed_evidence, li.recommended_action].filter(Boolean).join(' — ')}
                    </div>
                  )}
                </div>
                <TenantChargeInput id={li.id} tenantCharge={li.tenant_charge} tenantChargeAmount={li.tenant_charge_amount} />
              </div>
            ))}
          </div>
        ))}

        <div className="px-6 py-4 flex justify-end">
          <button
            type="submit"
            className="bg-accent hover:bg-accent-hover text-white rounded-[var(--radius-sm)] px-4 py-2 text-[13px] font-semibold"
          >
            Save Changes
          </button>
        </div>
      </form>
    </AppShell>
  )
}
