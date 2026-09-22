import { getSql } from '@/lib/db'
import { requireSession } from '@/lib/dal'
import AppShell from '@/app/components/AppShell'
import DeleteInspectionButton from '@/app/components/DeleteInspectionButton'
import { createProperty, updateProperty, deleteProperty } from '@/app/actions'

// Manual entry for now -- no real PropertyWare API access/docs exist
// anywhere in this project yet (2026-09-22 user request: "fed by the PW API
// link of active properties"), same stand-in-now-swap-in-real-API-later
// pattern already used for sendBatchToPW. Viewable by every session (like
// the Inspections list) since it's reference data, not admin config; Add/
// Edit/Delete are Admin-only, matching how Vendors/Cost Book work elsewhere.
export const dynamic = 'force-dynamic'

type Property = {
  id: string
  address: string
  pw_property_id: string | null
  notes: string | null
}

const inputClass = 'border border-border rounded-[var(--radius-sm)] px-2.5 py-1.5 w-full bg-surface text-[13px]'

export default async function PropertiesPage() {
  const session = await requireSession()
  const isAdmin = session.role === 'Admin'
  const sql = getSql()

  const properties = (await sql`
    select id, address, pw_property_id, notes from properties order by address
  `) as unknown as Property[]

  return (
    <AppShell active="/properties" title="Properties">
      <p className="px-4 md:px-6 pt-5 text-[13px] text-text-muted max-w-2xl">
        Active properties. Entered by hand for now — PropertyWare has no real API access or
        documentation available yet, so this isn&apos;t synced automatically. The PW Property ID
        field is a placeholder for when that connection is real.
      </p>

      <div role="table" className="mt-4">
        <div
          role="row"
          className="hidden md:grid grid-cols-[1.6fr_1fr_1.6fr_0.6fr] gap-2 px-4 md:px-6 py-2 border-y border-border"
        >
          {['Address', 'PW Property ID', 'Notes', ''].map((h) => (
            <div key={h} role="columnheader" className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              {h}
            </div>
          ))}
        </div>
        {properties.length === 0 && (
          <div className="px-4 md:px-6 py-4 text-[13px] text-text-muted italic">No properties yet.</div>
        )}
        {properties.map((p) => (
          <form
            key={p.id}
            action={updateProperty.bind(null, p.id)}
            role="row"
            className="grid grid-cols-1 md:grid-cols-[1.6fr_1fr_1.6fr_0.6fr] gap-2 md:items-center px-4 md:px-6 py-3 md:py-2.5 border-b border-border"
          >
            <div role="cell" className="space-y-1">
              <div className="md:hidden text-[10px] font-semibold uppercase tracking-wide text-text-muted">Address</div>
              {isAdmin ? (
                <input name="address" defaultValue={p.address} required className={inputClass} />
              ) : (
                <span className="text-[13px]">{p.address}</span>
              )}
            </div>
            <div role="cell" className="space-y-1">
              <div className="md:hidden text-[10px] font-semibold uppercase tracking-wide text-text-muted">PW Property ID</div>
              {isAdmin ? (
                <input name="pw_property_id" defaultValue={p.pw_property_id ?? ''} className={`data-mono ${inputClass}`} />
              ) : (
                <span className="data-mono text-[13px] text-text-muted">{p.pw_property_id ?? '—'}</span>
              )}
            </div>
            <div role="cell" className="space-y-1">
              <div className="md:hidden text-[10px] font-semibold uppercase tracking-wide text-text-muted">Notes</div>
              {isAdmin ? (
                <input name="notes" defaultValue={p.notes ?? ''} className={inputClass} />
              ) : (
                <span className="text-[13px] text-text-muted">{p.notes ?? '—'}</span>
              )}
            </div>
            {isAdmin && (
              <div role="cell" className="flex items-center gap-2">
                <button
                  type="submit"
                  className="bg-accent hover:bg-accent-hover text-white rounded-[var(--radius-sm)] px-3 py-1 text-[12px] font-semibold w-fit"
                >
                  Save
                </button>
                <DeleteInspectionButton
                  action={deleteProperty.bind(null, p.id)}
                  confirmMessage={`Delete "${p.address}"? This cannot be undone.`}
                />
              </div>
            )}
          </form>
        ))}
      </div>

      {isAdmin && (
        <form
          action={createProperty}
          className="grid grid-cols-1 md:grid-cols-[1.6fr_1fr_1.6fr_0.6fr] gap-2 items-end px-4 md:px-6 py-4"
        >
          <input name="address" required placeholder="Property address" className={inputClass} />
          <input name="pw_property_id" placeholder="PW Property ID (optional)" className={`data-mono ${inputClass}`} />
          <input name="notes" placeholder="Notes (optional)" className={inputClass} />
          <button
            type="submit"
            className="bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-2 text-[12px] font-semibold w-fit"
          >
            Add Property
          </button>
        </form>
      )}
    </AppShell>
  )
}
