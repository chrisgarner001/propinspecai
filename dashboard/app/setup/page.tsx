import { getSql } from '@/lib/db'
import { updateSettings, createVendor } from '@/app/actions'
import AppShell from '@/app/components/AppShell'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

type Settings = {
  gpm_labor_charge: string
  material_markup_pct: string
  vendor_markup_pct: string
}

type Vendor = { id: string; name: string }

const fieldClass = 'data-mono border border-border rounded-[var(--radius-sm)] px-2.5 py-1.5 w-40 bg-surface'
const labelClass = 'font-medium'
const helpClass = 'text-[12px] text-text-muted mt-1'

export default async function SetupPage() {
  const sql = getSql()
  const [settings] = (await sql`select * from settings where id = true`) as unknown as Settings[]
  const vendors = (await sql`select id, name from vendors order by name`) as unknown as Vendor[]

  return (
    <AppShell active="/setup" title="Set Up">
      <form action={updateSettings} className="p-4 md:p-6 max-w-xl space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3 md:gap-6 pb-4 border-b border-border">
          <div>
            <div className={labelClass}>GPM Labor Charge</div>
            <div className={helpClass}>Default per-hour labor charge for GPM staff-performed work.</div>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-text-muted">$</span>
            <input
              name="gpm_labor_charge"
              type="number"
              step="0.25"
              defaultValue={settings.gpm_labor_charge}
              className={fieldClass}
            />
          </div>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-3 md:gap-6 pb-4 border-b border-border">
          <div>
            <div className={labelClass}>General Material Markup</div>
            <div className={helpClass}>Percentage added on top of material cost when charged out.</div>
          </div>
          <div className="flex items-center gap-1">
            <input
              name="material_markup_pct"
              type="number"
              step="1"
              defaultValue={settings.material_markup_pct}
              className={fieldClass}
            />
            <span className="text-text-muted">%</span>
          </div>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-3 md:gap-6 pb-4 border-b border-border">
          <div>
            <div className={labelClass}>Vendor Markup</div>
            <div className={helpClass}>Percentage added on top of outside vendor estimates when charged out.</div>
          </div>
          <div className="flex items-center gap-1">
            <input
              name="vendor_markup_pct"
              type="number"
              step="1"
              defaultValue={settings.vendor_markup_pct}
              className={fieldClass}
            />
            <span className="text-text-muted">%</span>
          </div>
        </div>

        <button
          type="submit"
          className="bg-accent hover:bg-accent-hover text-white rounded-[var(--radius-sm)] px-4 py-2 text-[13px] font-semibold"
        >
          Save settings
        </button>
      </form>

      <div className="p-4 md:p-6 max-w-xl border-t border-border">
        <div className={labelClass}>Vendors</div>
        <div className={`${helpClass} mb-3`}>Outside vendors available in the Assigned To picker on inspections.</div>
        {vendors.length > 0 && (
          <ul className="mb-4 space-y-1">
            {vendors.map((v) => (
              <li key={v.id} className="text-[13px] text-text-muted">
                {v.name}
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

      <div className="p-4 md:p-6 max-w-xl border-t border-border">
        <div className={labelClass}>Stages</div>
        <div className={`${helpClass} mb-3`}>The rehab/turn stages used on the Quote Sheet and Job Timeline, and their display order.</div>
        <Link
          href="/setup/stages"
          className="inline-block bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-2 text-[13px] font-semibold"
        >
          Manage Stages
        </Link>
      </div>

      <div className="p-4 md:p-6 max-w-xl border-t border-border">
        <div className={labelClass}>Cost Book</div>
        <div className={`${helpClass} mb-3`}>Reference pricing for materials and labor used across inspections.</div>
        <Link
          href="/cost-book"
          className="inline-block bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-2 text-[13px] font-semibold"
        >
          Open Cost Book
        </Link>
      </div>
    </AppShell>
  )
}
