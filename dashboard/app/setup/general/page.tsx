import { getSql } from '@/lib/db'
import { requireAdmin } from '@/lib/dal'
import { updateSettings } from '@/app/actions'
import AppShell from '@/app/components/AppShell'

export const dynamic = 'force-dynamic'

type Settings = {
  gpm_labor_charge: string
  material_markup_pct: string
  vendor_markup_pct: string
}

const fieldClass = 'data-mono border border-border rounded-[var(--radius-sm)] px-2.5 py-1.5 w-40 bg-surface'
const labelClass = 'font-medium'
const helpClass = 'text-[12px] text-text-muted mt-1'

export default async function GeneralSettingsPage() {
  await requireAdmin()
  const sql = getSql()
  const [settings] = (await sql`select * from settings where id = true`) as unknown as Settings[]

  return (
    <AppShell active="/setup" title="System Config — General Settings">
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
    </AppShell>
  )
}
