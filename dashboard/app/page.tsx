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
              <Link href={`/inspections/${i.id}`} className="font-semibold hover:underline text-[13px]">
                {i.property_address}
              </Link>
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

export default async function Home() {
  await requireSession()
  const sql = getSql()
  const inspections = (await sql`
    select id, job_number, property_address, inspection_date, inspector_name, status
    from inspections
    order by created_at desc
  `) as unknown as InspectionRow[]

  return (
    <AppShell active="/" title="Move-out inspections">
      <div className="flex justify-end px-4 md:px-6 py-4 border-b border-border">
        <Link
          href="/inspections/new"
          className="bg-accent hover:bg-accent-hover text-white rounded-[var(--radius-sm)] px-3.5 py-2 text-[13px] font-semibold"
        >
          + Add New Inspection
        </Link>
      </div>

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
