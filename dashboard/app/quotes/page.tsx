import { getSql } from '@/lib/db'
import { requireSession } from '@/lib/dal'
import AppShell from '@/app/components/AppShell'
import InspectionTable, { type InspectionRow } from '@/app/components/InspectionTable'
import { STATUS_STYLES, STATUS_ORDER } from '@/app/components/StatusBadge'

// Properties whose quote is being built or has already been built (user
// request, 2026-09-22) -- "under_review" is the one status before that's
// true (an inspection just extracted from video, not yet moved to the
// Quote Sheet at all); every other status means Build Quote has been
// opened at least once. Not a new signal, just a different filter over the
// same inspections the Inspections list already shows.
export const dynamic = 'force-dynamic'

const QUOTE_STATUSES = STATUS_ORDER.filter((s) => s !== 'under_review')

export default async function QuotesPage() {
  await requireSession()
  const sql = getSql()

  const inspections = (await sql`
    select id, job_number, property_address, inspection_date, inspector_name, status, inspection_type
    from inspections
    where status != 'under_review'
    order by created_at desc
  `) as unknown as InspectionRow[]

  return (
    <AppShell active="/quotes" title="Quotes">
      <p className="px-4 md:px-6 pt-5 text-[13px] text-text-muted max-w-2xl">
        Properties with a quote being built or already built — everything past initial review.
      </p>
      {QUOTE_STATUSES.map((status) => {
        const rows = inspections.filter((i) => i.status === status)
        return (
          <section key={status} className="border-b border-border last:border-b-0 mt-2">
            <div className="px-4 md:px-6 pt-4 pb-1 flex items-center gap-2">
              <h2 className="font-display font-bold text-[14px]">{STATUS_STYLES[status].label}</h2>
              <span className="data-mono text-[11px] text-text-muted">{rows.length}</span>
            </div>
            <InspectionTable inspections={rows} />
          </section>
        )
      })}
    </AppShell>
  )
}
