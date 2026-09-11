import { getSql } from '@/lib/db'
import { notFound } from 'next/navigation'
import { updateQuoteSheetItems } from '@/app/actions'
import AppShell from '@/app/components/AppShell'
import LineItemAssignment from '@/app/components/LineItemAssignment'
import SaveChangesButton from '@/app/components/SaveChangesButton'

// In-app replacement for the old Google-Sheets-based "Turn Scope" export --
// same column set (Area/Details/Comments/Vendor-GPM/Hours/Materials/Vendor
// Quote/Stage), editable in place instead of round-tripping through Drive.
// "Removed from Quote Sheet" items (line_items.tenant_approved) are excluded
// here too, and by the Quote PDF generator, so this editor always reflects
// exactly what the owner will see.

const miniField =
  'text-[12px] border border-border rounded-[var(--radius-sm)] px-1.5 py-1 w-full bg-surface truncate'

// See ROW_COLS comment on the main inspection page: minmax(0, Nfr), not bare
// Nfr, so a long unbroken cell can't force its track wider than its share
// and desync this row's columns from the header row's.
const ROW_COLS =
  'grid-cols-[minmax(0,0.8fr)_minmax(0,1.3fr)_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.8fr)_minmax(0,1fr)]'

type LineItem = {
  id: string
  room_area: string
  item: string
  observed_evidence: string | null
  recommended_action: string | null
  assigned_to: string | null
  vendor_id: string | null
  labor_hours: string | null
  materials_cost: string | null
  vendor_estimated_cost: string | null
  quote_stage: string | null
}

type Vendor = { id: string; name: string }

export default async function QuoteSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sql = getSql()

  const [inspection] = await sql`select * from inspections where id = ${id}`
  if (!inspection) notFound()

  const lineItems = (await sql`
    select id, room_area, item, observed_evidence, recommended_action, assigned_to, vendor_id,
      labor_hours, materials_cost, vendor_estimated_cost, quote_stage
    from line_items
    where inspection_id = ${id} and tenant_approved = false
    order by room_area, created_at
  `) as unknown as LineItem[]

  const vendors = (await sql`select id, name from vendors order by name`) as unknown as Vendor[]

  const [settings] = await sql`select gpm_labor_charge from settings where id = true`
  const laborRate = Number(settings?.gpm_labor_charge ?? 0)

  const totalHours = lineItems.reduce((sum, li) => sum + (li.labor_hours !== null ? Number(li.labor_hours) : 0), 0)

  return (
    <AppShell active="/" reviewerName="Jessica Zilka" title="Quote Sheet" wide>
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-surface-alt">
        <div className="text-[13px] text-text-muted">
          {inspection.property_address} · Job <span className="data-mono">{inspection.job_number}</span> ·{' '}
          <span className="data-mono">{totalHours.toFixed(2)}</span> labor hrs total
        </div>
        <a
          href={`/inspections/${id}/quote-sheet/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-accent hover:bg-accent-hover text-white rounded-[var(--radius-sm)] px-3.5 py-2 text-[13px] font-semibold"
        >
          Create Quote
        </a>
      </div>

      <form action={updateQuoteSheetItems}>
        <input type="hidden" name="inspection_id" value={id} />
        <div role="table">
          <div role="row" className={`grid ${ROW_COLS} gap-2 px-3 py-2.5 border-b border-border`}>
            {['Area', 'Details', 'Comments', 'Vendor/GPM', 'Materials', 'Labor (hrs)', 'Vendor Quote', 'Stage'].map((h) => (
              <div key={h} role="columnheader" className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                {h}
              </div>
            ))}
          </div>

          {lineItems.length === 0 && (
            <div className="px-6 py-6 text-[13px] text-text-muted">
              No line items to quote (everything has been removed from the Quote Sheet, or none exist yet).
            </div>
          )}

          {lineItems.map((li) => (
            <div key={li.id} role="row" className={`grid ${ROW_COLS} gap-2 items-start px-3 py-2.5 border-b border-border`}>
              <input type="hidden" name="ids" value={li.id} />
              <div role="cell" className="min-w-0">
                <input name={`room_area__${li.id}`} defaultValue={li.room_area} className={miniField} />
              </div>
              <div role="cell" className="min-w-0">
                <input name={`item__${li.id}`} defaultValue={li.item} className={`${miniField} font-semibold`} />
              </div>
              <div role="cell" className="min-w-0 space-y-1">
                <textarea
                  name={`observed_evidence__${li.id}`}
                  defaultValue={li.observed_evidence ?? ''}
                  placeholder="Observed evidence"
                  rows={2}
                  className={`${miniField} data-mono text-text-muted resize-y`}
                />
                <textarea
                  name={`recommended_action__${li.id}`}
                  defaultValue={li.recommended_action ?? ''}
                  placeholder="Recommended action"
                  rows={2}
                  className={`${miniField} text-text-muted resize-y`}
                />
              </div>
              <LineItemAssignment
                id={li.id}
                assignedTo={li.assigned_to}
                vendorId={li.vendor_id}
                vendors={vendors}
                materialsCost={li.materials_cost}
                laborHours={li.labor_hours}
                laborRate={laborRate}
                vendorEstimatedCost={li.vendor_estimated_cost}
              />
              <div role="cell" className="min-w-0">
                <input
                  name={`quote_stage__${li.id}`}
                  defaultValue={li.quote_stage ?? ''}
                  placeholder="—"
                  className={miniField}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="px-6 py-4 flex justify-end">
          <SaveChangesButton />
        </div>
      </form>
    </AppShell>
  )
}
