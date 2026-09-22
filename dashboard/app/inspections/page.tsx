import { getSql } from '@/lib/db'
import { requireSession } from '@/lib/dal'
import Link from 'next/link'
import AppShell from '@/app/components/AppShell'
import { STATUS_STYLES, STATUS_ORDER } from '@/app/components/StatusBadge'
import InspectionTable, { type InspectionRow } from '@/app/components/InspectionTable'

// This lists live database state for an internal review tool — never serve a
// stale build-time snapshot.
export const dynamic = 'force-dynamic'

// Grouped in STATUS_ORDER (the same canonical order every status pill uses),
// not a separately-maintained list here.
const STATUS_GROUPS = STATUS_ORDER.map((status) => ({ status, label: STATUS_STYLES[status].label }))

export default async function InspectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; status?: string }>
}) {
  await requireSession()
  const { q: qRaw, type: typeRaw, status: statusRaw } = await searchParams
  const q = qRaw?.trim() || undefined
  // Empty/missing/"All" all mean "no type filter" -- defaults to showing
  // every type, not Move-Out-only (docs/designs/propinspec-inspection-type-gallery.md).
  const type = typeRaw && typeRaw !== 'All' ? typeRaw : undefined
  // ?status= lets the Dashboard's per-stage counts link straight to just
  // that stage here, instead of always showing every group.
  const status = statusRaw && STATUS_ORDER.includes(statusRaw) ? statusRaw : undefined
  const sql = getSql()
  // Free-text address (and work order number, for the times a reviewer
  // knows the WO # rather than the address) search -- the landing page had zero
  // search/filter at all until this (2026-09-22 feedback), which was fine
  // with a handful of inspections but not once every property GPM has ever
  // turned goes through here, including multiple inspections per property
  // over time.
  let where = sql``
  if (q) where = sql`${where} and (property_address ilike ${'%' + q + '%'} or job_number ilike ${'%' + q + '%'})`
  if (type) where = sql`${where} and inspection_type = ${type}`
  if (status) where = sql`${where} and status = ${status}`
  const inspections = (await sql`
    select id, job_number, property_address, inspection_date, inspector_name, status, inspection_type
    from inspections
    where true ${where}
    order by created_at desc
  `) as unknown as InspectionRow[]

  const visibleGroups = status ? STATUS_GROUPS.filter((g) => g.status === status) : STATUS_GROUPS

  return (
    <AppShell active="/inspections" title="Move-out inspections">
      <div className="flex items-center justify-between gap-2 px-4 md:px-6 py-4 border-b border-border flex-wrap">
        <form method="get" className="flex items-center gap-2 flex-1 min-w-[200px] max-w-lg flex-wrap">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ''}
            placeholder="Search by property address or work order #…"
            className="border border-border rounded-[var(--radius-sm)] px-2.5 py-1.5 flex-1 min-w-[160px] bg-surface text-[13px]"
          />
          <select
            name="type"
            defaultValue={type ?? 'All'}
            className="border border-border rounded-[var(--radius-sm)] px-2.5 py-1.5 bg-surface text-[13px]"
          >
            <option value="All">All Types</option>
            <option value="Move-Out">Move-Out</option>
            <option value="Move-In">Move-In</option>
          </select>
          {status && <input type="hidden" name="status" value={status} />}
          <button
            type="submit"
            className="bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap"
          >
            Search
          </button>
          {(q || type || status) && (
            <Link href="/inspections" className="text-[12px] text-accent underline decoration-accent/40 whitespace-nowrap">
              Clear
            </Link>
          )}
        </form>
        <Link
          href="/inspections/new"
          className="bg-accent hover:bg-accent-hover text-white rounded-[var(--radius-sm)] px-3.5 py-2 text-[13px] font-semibold whitespace-nowrap"
        >
          + Add New Inspection
        </Link>
      </div>

      {(q || type || status) && (
        <div className="px-4 md:px-6 py-2 border-b border-border bg-surface-alt text-[12px] text-text-muted">
          {inspections.length} result{inspections.length === 1 ? '' : 's'}
          {q && <> for &quot;{q}&quot;</>}
          {type && <> · type: {type}</>}
          {status && <> · stage: {STATUS_STYLES[status].label}</>}
        </div>
      )}

      {visibleGroups.map((group) => {
        const rows = inspections.filter((i) => i.status === group.status)
        return (
          <section key={group.status} className="border-b border-border last:border-b-0">
            <div className="px-4 md:px-6 pt-4 pb-1 flex items-center gap-2">
              <h2 className="font-display font-bold text-[14px]">{group.label}</h2>
              <span className="data-mono text-[11px] text-text-muted">{rows.length}</span>
            </div>
            <InspectionTable inspections={rows} />
          </section>
        )
      })}
    </AppShell>
  )
}
