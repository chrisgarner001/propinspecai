import { getSql } from '@/lib/db'
import { requireAdmin } from '@/lib/dal'
import { createVendor, deleteVendor } from '@/app/actions'
import AppShell from '@/app/components/AppShell'
import DeleteInspectionButton from '@/app/components/DeleteInspectionButton'

export const dynamic = 'force-dynamic'

type Vendor = { id: string; name: string; in_use: boolean }

const labelClass = 'font-medium'
const helpClass = 'text-[12px] text-text-muted mt-1'

export default async function VendorsPage() {
  await requireAdmin()
  const sql = getSql()
  const vendors = (await sql`
    select
      v.id,
      v.name,
      exists(select 1 from line_items li where li.vendor_id = v.id) as in_use
    from vendors v
    order by v.name
  `) as unknown as Vendor[]

  return (
    <AppShell active="/setup" title="System Config — Vendors">
      <div className="p-4 md:p-6 max-w-xl">
        <div className={labelClass}>Vendors</div>
        <div className={`${helpClass} mb-3`}>Outside vendors available in the Assigned To picker on inspections.</div>
        {vendors.length > 0 && (
          <ul className="mb-4 space-y-1">
            {vendors.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2 text-[13px]">
                <span className="text-text-muted">{v.name}</span>
                {v.in_use ? (
                  <span className="text-[11px] text-text-muted italic" title="Assigned on at least one line item or batch">
                    In use
                  </span>
                ) : (
                  <DeleteInspectionButton
                    action={deleteVendor.bind(null, v.id)}
                    confirmMessage={`Delete vendor "${v.name}"? This cannot be undone.`}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        <form action={createVendor} className="flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-1">
              Vendor Name
            </label>
            <input
              name="name"
              required
              className="border border-border rounded-[var(--radius-sm)] px-2.5 py-1.5 w-full bg-surface"
            />
          </div>
          <button
            type="submit"
            className="bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-2 text-[12px] font-semibold"
          >
            Create New Vendor
          </button>
        </form>
      </div>
    </AppShell>
  )
}
