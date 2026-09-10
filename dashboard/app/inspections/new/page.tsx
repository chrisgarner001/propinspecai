import { createInspection } from '@/app/actions'
import AppShell from '@/app/components/AppShell'

const inputClass = 'border border-border rounded-[var(--radius-sm)] px-2.5 py-1.5 w-full bg-surface'
const labelClass = 'block text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-1'

export default function NewInspectionPage() {
  return (
    <AppShell active="/" reviewerName="Jessica Zilka" title="Add new inspection">
      <form action={createInspection} className="p-6 max-w-lg space-y-4">
        <div>
          <label className={labelClass}>Property address</label>
          <input name="property_address" required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Job number</label>
          <input name="job_number" required className="data-mono w-full border border-border rounded-[var(--radius-sm)] px-2.5 py-1.5 bg-surface" />
        </div>
        <div>
          <label className={labelClass}>Inspector</label>
          <input name="inspector_name" required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Inspection date</label>
          <input name="inspection_date" type="date" required className="data-mono w-full border border-border rounded-[var(--radius-sm)] px-2.5 py-1.5 bg-surface" />
        </div>
        <button
          type="submit"
          className="bg-accent hover:bg-accent-hover text-white rounded-[var(--radius-sm)] px-4 py-2 text-[13px] font-semibold"
        >
          Create inspection
        </button>
      </form>
    </AppShell>
  )
}
