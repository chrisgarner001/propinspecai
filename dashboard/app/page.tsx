import { getSql } from '@/lib/db'
import { requireSession } from '@/lib/dal'
import Link from 'next/link'
import AppShell from './components/AppShell'
import StatusBadge, { STATUS_STYLES, STATUS_ORDER } from './components/StatusBadge'
import InspectionQuickView from './components/InspectionQuickView'

// The control-center landing page after login (2026-09-22 user request,
// replacing the Inspections list as `/` -- that list now lives at
// /inspections, see docs/designs/... for the routing decision). Pieces: a
// stage-by-stage count (each clickable straight through to that filtered
// slice of /inspections), a compact list of the most recently active
// inspections (with a Quick View popup per row), a quick search box into
// the full Inspections list, and a 10-day calendar of inspection_date.
export const dynamic = 'force-dynamic'

type UpcomingRow = {
  id: string
  job_number: string
  property_address: string
  inspection_date: string
  status: string
  inspection_type: string
}

type CalendarRow = {
  id: string
  job_number: string
  property_address: string
  inspection_date: string
  inspection_type: string
}

const DAY_MS = 24 * 60 * 60 * 1000

// inspection_date is a plain `date` column (no time/timezone component) --
// compare/format it in UTC throughout, same convention this app already
// uses everywhere else it renders that column (see e.g. the Inspections
// list), so a date stored as "2026-09-25" never shifts a calendar day
// depending on the reviewer's own browser timezone.
function utcDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// Wrapped in its own plain helper, not called inline in the component body --
// eslint's react-hooks/purity rule flags Date.now()/new Date() reachable
// directly inside a component-shaped function, even a Server Component that
// (unlike a Client Component) genuinely does run once per request and has
// no re-render purity concern here.
function tenDayWindow(): Date[] {
  const now = new Date()
  return Array.from({ length: 10 }, (_, i) => new Date(now.getTime() + i * DAY_MS))
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

  // 10-day calendar strip (2026-09-22 user request): today through the
  // next 9 days, bucketed by inspection_date. This is the only per-
  // inspection date that exists (no separate "scheduled" concept at the
  // inspection level) -- see the Upcoming Inspections comment above.
  const windowDates = tenDayWindow()
  const todayUtc = utcDateOnly(windowDates[0])
  const tenDaysOut = utcDateOnly(windowDates[9])
  const scheduled = (await sql`
    select id, job_number, property_address, inspection_date, inspection_type
    from inspections
    where inspection_date >= ${todayUtc} and inspection_date <= ${tenDaysOut}
    order by inspection_date, created_at
  `) as unknown as CalendarRow[]
  const scheduledByDay = new Map<string, CalendarRow[]>()
  for (const row of scheduled) {
    const key = utcDateOnly(new Date(row.inspection_date))
    if (!scheduledByDay.has(key)) scheduledByDay.set(key, [])
    scheduledByDay.get(key)!.push(row)
  }
  const calendarDays = windowDates.map((date) => {
    const key = utcDateOnly(date)
    return { key, date, items: scheduledByDay.get(key) ?? [] }
  })

  return (
    <AppShell active="/" title="Dashboard">
      <div className="flex items-center justify-between gap-2 px-4 md:px-6 py-4 border-b border-border flex-wrap">
        <form method="get" action="/inspections" className="flex items-center gap-2 flex-1 min-w-[200px] max-w-sm">
          <input
            type="search"
            name="q"
            placeholder="Search by property address or work order #…"
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
              <div
                key={i.id}
                className="flex items-center justify-between gap-3 px-4 md:px-6 py-2.5 border-b border-border hover:bg-surface-alt flex-wrap"
              >
                <Link href={`/inspections/${i.id}`} className="min-w-0 flex-1">
                  <span className="font-semibold text-[13px]">{i.property_address}</span>
                  <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-accent border border-accent/40 rounded-[var(--radius-sm)] px-1.5 py-0.5">
                    {i.inspection_type}
                  </span>
                  <div className="data-mono text-[11px] text-text-muted">
                    WO {i.job_number} ·{' '}
                    {new Date(i.inspection_date).toLocaleDateString('en-US', { timeZone: 'UTC' })}
                  </div>
                </Link>
                <InspectionQuickView inspectionId={i.id} propertyAddress={i.property_address} />
                <StatusBadge status={i.status} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="border-t border-border">
        <div className="px-4 md:px-6 pt-4 pb-2">
          <h2 className="font-display font-bold text-[14px]">Upcoming Inspection Schedule</h2>
          <p className="text-[12px] text-text-muted mt-0.5">Next 10 days, by inspection date.</p>
        </div>
        <div className="px-4 md:px-6 pb-4 grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2">
          {calendarDays.map(({ key, date, items }) => (
            <div key={key} className="border border-border rounded-[var(--radius-md)] overflow-hidden">
              <div className="bg-surface-alt px-2 py-1.5 text-center border-b border-border">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                  {date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}
                </div>
                <div className="data-mono text-[13px] font-bold">
                  {date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', timeZone: 'UTC' })}
                </div>
              </div>
              <div className="p-1.5 space-y-1 min-h-[3rem]">
                {items.length === 0 ? (
                  <div className="text-[11px] text-text-muted text-center">—</div>
                ) : (
                  items.map((it) => (
                    <Link
                      key={it.id}
                      href={`/inspections/${it.id}`}
                      title={`${it.property_address} — ${it.inspection_type}, WO ${it.job_number}`}
                      className="block text-[10px] leading-tight text-accent hover:text-accent-hover truncate"
                    >
                      {it.property_address}
                    </Link>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  )
}
