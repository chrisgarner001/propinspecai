import Link from 'next/link'
import StatusBadge from './StatusBadge'
import DeleteInspectionButton from './DeleteInspectionButton'
import { deleteInspection } from '@/app/actions'

// Shared between the Inspections list and the Quotes list (both list
// inspections the same way, just filtered differently) -- extracted rather
// than duplicated, 2026-09-22.
export type InspectionRow = {
  id: string
  job_number: string
  property_address: string
  inspection_date: string
  inspector_name: string
  status: string
  inspection_type: string
}

export default function InspectionTable({ inspections }: { inspections: InspectionRow[] }) {
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
                <div className="data-mono text-[11px] text-text-muted">WO {i.job_number}</div>
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
            <div className="data-mono text-[11px] text-text-muted mt-0.5">WO {i.job_number}</div>
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
