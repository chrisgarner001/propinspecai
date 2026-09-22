import { getSql } from '@/lib/db'
import { requireSession } from '@/lib/dal'
import Link from 'next/link'
import AppShell from './components/AppShell'
import StatusBadge, { STATUS_STYLES, STATUS_ORDER } from './components/StatusBadge'

// The control-center landing page after login (2026-09-22 user request,
// replacing the Inspections list as `/` -- that list now lives at
// /inspections, see docs/designs/... for the routing decision). Three
// pieces: a stage-by-stage count (each clickable straight through to that
// filtered slice of /inspections), a compact list of the most recently
// active inspections, and a quick search box into the full Inspections
// list -- not a duplicate search UI, just an entry point into the one that
// already exists there.
export const dynamic = 'force-dynamic'

type UpcomingRow = {
  id: string
  job_number: string
  property_address: string
  inspection_date: string
  status: string
  inspection_type: string
}

export default async function Dashboard() {
  await requireSession()
  const sql = getSql()

  const counts = (await sql`
    select status, count(*)::int as count from inspections group by status
  `) as unknown as { status: string; count: number }[]
  const countByStatus = new Map(counts.map((c) => [c.status, c.count]))

  // "Upcoming" here means the most recently active inspections still in
  // motion -- there's no scheduled-future-date concept at the inspection
  // level (only individual line items/stages have one), so this is
  // "what needs attention soon," not a calendar of future dates.
  const upcoming = (await sql`
    select id, job_number, property_address, inspection_date, status, inspection_type
    from inspections
    where status != 'completed'
    order by created_at desc
    limit 8
  `) as unknown as UpcomingRow[]

  return (
    <AppShell active="/" title="Dashboard">
      <div className="flex items-center justify-between gap-2 px-4 md:px-6 py-4 border-b border-border flex-wrap">
        <form method="get" action="/inspections" className="flex items-center gap-2 flex-1 min-w-[200px] max-w-sm">
          <input
            type="search"
            name="q"
            placeholder="Search previous inspections…"
            className="border border-border rounded-[var(--radius-sm)] px-2.5 py-1.5 w-full bg-surface text-[13px]"
          />
          <button
            type="submit"
            className="bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap"
          >
            Search
          </button>
        </form>
        <Link
          href="/inspections/new"
          className="bg-accent hover:bg-accent-hover text-white rounded-[var(--radius-sm)] px-3.5 py-2 text-[13px] font-semibold whitespace-nowrap"
        >
          + Add New Inspection
        </Link>
      </div>

      <section className="border-b border-border">
        <div className="px-4 md:px-6 pt-4 pb-2">
          <h2 className="font-display font-bold text-[14px]">Inspections by Stage</h2>
        </div>
        <div className="px-4 md:px-6 pb-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {STATUS_ORDER.map((status) => (
            <Link
              key={status}
              href={`/inspections?status=${status}`}
              className="border border-border rounded-[var(--radius-md)] px-3 py-3 hover:border-accent hover:bg-surface-alt"
            >
              <div className="data-mono text-[22px] font-bold">{countByStatus.get(status) ?? 0}</div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted mt-0.5">
                {STATUS_STYLES[status].label}
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="px-4 md:px-6 pt-4 pb-2 flex items-center justify-between">
          <h2 className="font-display font-bold text-[14px]">Upcoming Inspections</h2>
          <Link href="/inspections" className="text-[12px] text-accent underline decoration-accent/40 hover:text-accent-hover">
            View all inspections →
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="px-4 md:px-6 pb-6 text-[13px] text-text-muted">Nothing in progress right now.</p>
        ) : (
          <div className="pb-2">
            {upcoming.map((i) => (
              <Link
                key={i.id}
                href={`/inspections/${i.id}`}
                className="flex items-center justify-between gap-3 px-4 md:px-6 py-2.5 border-b border-border hover:bg-surface-alt flex-wrap"
              >
                <div className="min-w-0">
                  <span className="font-semibold text-[13px]">{i.property_address}</span>
                  {i.inspection_type !== 'Move-Out' && (
                    <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-accent border border-accent/40 rounded-[var(--radius-sm)] px-1.5 py-0.5">
                      {i.inspection_type}
                    </span>
                  )}
                  <div className="data-mono text-[11px] text-text-muted">
                    Job {i.job_number} ·{' '}
                    {new Date(i.inspection_date).toLocaleDateString('en-US', { timeZone: 'UTC' })}
                  </div>
                </div>
                <StatusBadge status={i.status} />
              </Link>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  )
}
