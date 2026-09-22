import { getSql } from '@/lib/db'
import { requireAdmin } from '@/lib/dal'
import { createInspector, deleteInspector } from '@/app/actions'
import AppShell from '@/app/components/AppShell'
import DeleteInspectionButton from '@/app/components/DeleteInspectionButton'

export const dynamic = 'force-dynamic'

type Inspector = { id: string; name: string; in_use: boolean }

const labelClass = 'font-medium'
const helpClass = 'text-[12px] text-text-muted mt-1'

export default async function InspectorsPage() {
  await requireAdmin()
  const sql = getSql()
  const inspectors = (await sql`
    select
      i.id,
      i.name,
      exists(select 1 from inspections ins where ins.inspector_name = i.name) as in_use
    from inspectors i
    order by i.name
  `) as unknown as Inspector[]

  return (
    <AppShell active="/setup" title="System Config — Inspectors">
      <div className="p-4 md:p-6 max-w-xl">
        <div className={labelClass}>Inspectors</div>
        <div className={`${helpClass} mb-3`}>
          Available in the Inspector dropdown on Add New Inspection — typing a new name there still works too.
        </div>
        {inspectors.length > 0 && (
          <ul className="mb-4 space-y-1">
            {inspectors.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 text-[13px]">
                <span className="text-text-muted">{i.name}</span>
                {i.in_use ? (
                  <span className="text-[11px] text-text-muted italic" title="Used by at least one inspection">
                    In use
                  </span>
                ) : (
                  <DeleteInspectionButton
                    action={deleteInspector.bind(null, i.id)}
                    confirmMessage={`Delete inspector "${i.name}"? This cannot be undone.`}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        <form action={createInspector} className="flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-1">
              Inspector Name
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
            Add Inspector
          </button>
        </form>
      </div>
    </AppShell>
  )
}
