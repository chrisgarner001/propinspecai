import { getSql } from '@/lib/db'
import { requireAdmin } from '@/lib/dal'
import { createInspectionType, deleteInspectionType } from '@/app/actions'
import AppShell from '@/app/components/AppShell'
import DeleteInspectionButton from '@/app/components/DeleteInspectionButton'

export const dynamic = 'force-dynamic'

type InspectionType = { id: string; name: string; in_use: boolean }

const labelClass = 'font-medium'
const helpClass = 'text-[12px] text-text-muted mt-1'

export default async function InspectionTypesPage() {
  await requireAdmin()
  const sql = getSql()
  const inspectionTypes = (await sql`
    select
      t.id,
      t.name,
      exists(select 1 from inspections i where i.inspection_type = t.name) as in_use
    from inspection_types t
    order by (t.name = 'Move-Out') desc, t.name
  `) as unknown as InspectionType[]

  return (
    <AppShell active="/setup" title="System Config — Inspection Types">
      <div className="p-4 md:p-6 max-w-xl">
        <div className={labelClass}>Inspection Types</div>
        <div className={`${helpClass} mb-3`}>
          Available on Add New Inspection. &quot;Move-Out&quot; can&apos;t be deleted — the Quote Sheet, Tenant
          Chargeback Review, and Move-Out Report only ever show for that exact type.
        </div>
        {inspectionTypes.length > 0 && (
          <ul className="mb-4 space-y-1">
            {inspectionTypes.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 text-[13px]">
                <span className="text-text-muted">{t.name}</span>
                {t.name === 'Move-Out' ? (
                  <span className="text-[11px] text-text-muted italic">Required</span>
                ) : t.in_use ? (
                  <span className="text-[11px] text-text-muted italic" title="Used by at least one inspection">
                    In use
                  </span>
                ) : (
                  <DeleteInspectionButton
                    action={deleteInspectionType.bind(null, t.id)}
                    confirmMessage={`Delete inspection type "${t.name}"? This cannot be undone.`}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        <form action={createInspectionType} className="flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-1">
              Type Name
            </label>
            <input
              name="name"
              required
              placeholder="e.g. Condition Check"
              className="border border-border rounded-[var(--radius-sm)] px-2.5 py-1.5 w-full bg-surface"
            />
          </div>
          <button
            type="submit"
            className="bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-2 text-[12px] font-semibold"
          >
            Add Type
          </button>
        </form>
      </div>
    </AppShell>
  )
}
