import { getSql } from '@/lib/db'
import { requireSession } from '@/lib/dal'
import Link from 'next/link'
import AppShell from './components/AppShell'
import StatusBadge, { STATUS_STYLES, STATUS_ORDER } from './components/StatusBadge'
import DeleteInspectionButton from './components/DeleteInspectionButton'
import { deleteInspection } from './actions'

// This lists live database state for an internal review tool — never serve a
// stale build-time snapshot.
export const dynamic = 'force-dynamic'

type InspectionRow = {
  id: string
  job_number: string
  property_address: string
  inspection_date: string
  inspector_name: string
  status: string
  inspection_type: string
}

// Grouped in STATUS_ORDER (the same canonical order every status pill uses),
// not a separately-maintained list here.
const STATUS_GROUPS = STATUS_ORDER.map((status) => ({ status, label: STATUS_STYLES[status].label }))

function InspectionTable({ inspections }: { inspections: InspectionRow[] }) {
  if (inspections.length === 0) {
    return <p className="px-4 md:px-6 py-4 text-[13px] text-text-muted">None.</p>
  }
  return (
    <>
      {/* A real 5-column table has no honest way to fit 375px -- below md,
          each row becomes a stacked block instead (same data, same fields,
          just reflowed) rather than a table that truncates or scrolls
          sideways. This is a functional reflow, not decorative card-ification:
          every field a desktop row shows, a mobile block shows too. */}
      <table className="hidden md:table w-full text-[13px] border-collapse">
        <tbody>
          {inspections.map((i) => (
            <tr key={i.id} className="border-b border-border hover:bg-surface-alt">
              <td className="px-6 py-3 w-[45%]">
                <Link href={`/inspections/${i.id}`} className="font-semibold hover:underline">
                  {i.property_address}
                </Link>
                {i.inspection_type !== 'Move-Out' && (
                  <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-accent border border-accent/40 rounded-[var(--radius-sm)] px-1.5 py-0.5">
                    {i.inspection_type}
                  </span>
                )}
                <div className="data-mono text-[11px] text-text-muted">Job {i.job_number}</div>
              </td>
              <td className="px-6 py-3 whitespace-nowrap">{i.inspector_name}</td>
              <td className="px-6 py-3 data-mono text-text-muted">
                {new Date(i.inspection_date).toLocaleDateString('en-US', { timeZone: 'UTC' })}
              </td>
              <td className="px-6 py-3">
                <StatusBadge status={i.status} />
              </td>
              <td className="px-6 py-3 text-right">
                <DeleteInspectionButton action={deleteInspection.bind(null, i.id)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="md:hidden">
        {inspections.map((i) => (
          <div key={i.id} className="px-4 py-3 border-b border-border">
            <div className="flex items-start justify-between gap-2">
              <div>
                <Link href={`/inspections/${i.id}`} className="font-semibold hover:underline text-[13px]">
                  {i.property_address}
                </Link>
                {i.inspection_type !== 'Move-Out' && (
                  <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-accent border border-accent/40 rounded-[var(--radius-sm)] px-1.5 py-0.5">
                    {i.inspection_type}
                  </span>
                )}
              </div>
              <StatusBadge status={i.status} />
            </div>
            <div className="data-mono text-[11px] text-text-muted mt-0.5">Job {i.job_number}</div>
            <div className="flex items-center justify-between mt-1.5">
              <div className="text-[12px] text-text-muted">
                {i.inspector_name} ·{' '}
                <span className="data-mono">
                  {new Date(i.inspection_date).toLocaleDateString('en-US', { timeZone: 'UTC' })}
                </span>
              </div>
              <DeleteInspectionButton action={deleteInspection.bind(null, i.id)} />
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>
}) {
  await requireSession()
  const { q: qRaw, type: typeRaw } = await searchParams
  const q = qRaw?.trim() || undefined
  // Empty/missing/"All" all mean "no type filter" -- defaults to showing
  // every type, not Move-Out-only (docs/designs/propinspec-inspection-type-gallery.md).
  const type = typeRaw && typeRaw !== 'All' ? typeRaw : undefined
  const sql = getSql()
  // Free-text address (and job number, for the times a reviewer knows the
  // job # rather than the address) search -- the landing page had zero
  // search/filter at all until this (2026-09-22 feedback), which was fine
  // with a handful of inspections but not once every property GPM has ever
  // turned goes through here, including multiple inspections per property
  // over time.
  let where = sql``
  if (q) where = sql`${where} and (property_address ilike ${'%' + q + '%'} or job_number ilike ${'%' + q + '%'})`
  if (type) where = sql`${where} and inspection_type = ${type}`
  const inspections = (await sql`
    select id, job_number, property_address, inspection_date, inspector_name, status, inspection_type
    from inspections
    where true ${where}
    order by created_at desc
  `) as unknown as InspectionRow[]

  return (
    <AppShell active="/" title="Move-out inspections">
      <div className="flex items-center justify-between gap-2 px-4 md:px-6 py-4 border-b border-border flex-wrap">
        <form method="get" className="flex items-center gap-2 flex-1 min-w-[200px] max-w-lg flex-wrap">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ''}
            placeholder="Search by address or job #…"
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
          <button
            type="submit"
            className="bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap"
          >
            Search
          </button>
          {(q || type) && (
            <Link href="/" className="text-[12px] text-accent underline decoration-accent/40 whitespace-nowrap">
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

      {(q || type) && (
        <div className="px-4 md:px-6 py-2 border-b border-border bg-surface-alt text-[12px] text-text-muted">
          {inspections.length} result{inspections.length === 1 ? '' : 's'}
          {q && <> for &quot;{q}&quot;</>}
          {type && <> · type: {type}</>}
        </div>
      )}

      {STATUS_GROUPS.map((group) => {
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
