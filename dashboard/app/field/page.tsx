import Link from 'next/link'
import { getSql } from '@/lib/db'
import { requireSession } from '@/lib/dal'
import FieldShell from './FieldShell'

export const dynamic = 'force-dynamic'

type Row = {
  id: string
  property_address: string
  job_number: string
  inspection_date: string
  inspection_type: string
  field_completed_at: string | null
  rooms: number
}

// Field home: an Inspector sees only inspections assigned to the inspector
// their account is linked to; office users (who can also open the field
// view, e.g. to test it or help on site) see every not-yet-completed one.
export default async function FieldHomePage() {
  const session = await requireSession({ allowInspector: true })
  const sql = getSql()
  const isInspector = session.role === 'Inspector'

  const [link] = isInspector
    ? await sql`select n.name from users u join inspectors n on n.id = u.inspector_id where u.id = ${session.userId}`
    : [null]
  const inspectorName: string | null = link?.name ?? null

  const rows = (
    isInspector && !inspectorName
      ? []
      : await sql`
          select i.id, i.property_address, i.job_number, i.inspection_date, i.inspection_type, i.field_completed_at,
                 (select count(*)::int from inspection_room_plan r where r.inspection_id = i.id) as rooms
          from inspections i
          where ${isInspector ? sql`i.inspector_name = ${inspectorName}` : sql`true`}
          order by (i.field_completed_at is not null), i.inspection_date desc
          limit 100
        `
  ) as unknown as Row[]

  return (
    <FieldShell>
      <h1 className="font-display font-bold text-[24px] mb-1">Inspections</h1>
      <p className="text-[15px] text-text-muted mb-4">
        {isInspector ? `Assigned to ${inspectorName ?? 'you'}.` : 'All inspections (office view of the field app).'} Open one to set up its rooms
        and checklist before recording the walkthrough.
      </p>

      {isInspector && !inspectorName && (
        <div className="border border-border rounded-[var(--radius-lg)] bg-surface p-4 text-[15px]">
          Your account isn&apos;t linked to an inspector yet. Ask an Admin to link it in System Config → Manage Users.
        </div>
      )}

      {rows.length === 0 && (!isInspector || inspectorName) && (
        <div className="text-[15px] text-text-muted italic">No inspections assigned.</div>
      )}

      <ul className="border border-border rounded-[var(--radius-lg)] divide-y divide-border bg-surface">
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={`/field/${r.id}`} className="flex items-center justify-between gap-3 px-4 py-3 min-h-16 hover:bg-surface-alt">
              <div className="min-w-0">
                <div className="text-[17px] font-semibold truncate">{r.property_address}</div>
                <div className="text-[13px] text-text-muted">
                  {r.inspection_type} · WO <span className="data-mono">{r.job_number}</span> ·{' '}
                  <span className="data-mono">{new Date(r.inspection_date).toLocaleDateString('en-US', { timeZone: 'UTC' })}</span>
                </div>
              </div>
              <span className="text-[13px] font-semibold whitespace-nowrap text-text-muted">
                {r.field_completed_at ? 'Complete' : r.rooms > 0 ? 'In progress' : 'Not started'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </FieldShell>
  )
}
