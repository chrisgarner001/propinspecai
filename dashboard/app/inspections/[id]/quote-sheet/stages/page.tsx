import { getSql } from '@/lib/db'
import { requireSession } from '@/lib/dal'
import { notFound } from 'next/navigation'
import AppShell from '@/app/components/AppShell'

// Read-only grouped view of the Quote Sheet's batches -- reassigning which
// batch an item belongs to happens back on the Regular View (via its Stage
// picker + "Create Batches"), not here. This view exists to see each batch
// as a unit before sending it out.
//
// A batch is still keyed by batch_number under the hood (see
// 0018_manual_batch_numbering.sql / 0019_stages.sql) -- one work order per
// (Stage, Assignee) pair, since the same vendor can need separate batches
// across different stages. This page just labels/orders each batch by its
// Stage instead of the raw number, matching the Quote Sheet and Job
// Timeline.
//
// "Send to PW" (the manually-typed work-order-number stand-in for a real
// PropertyWare API integration) was removed from this page's UI on user
// request (2026-09-20, not pursuing that workflow yet) -- app/actions.ts's
// sendBatchToPW and the work_order_batches table are left in place, not
// deleted, since this is a "not now" deferral, not a decision to abandon it.

type LineItem = {
  id: string
  room_area: string
  item: string
  assigned_to: string | null
  vendor_id: string | null
  materials_cost: string | null
  labor_cost: string | null
  vendor_estimated_cost: string | null
  batch_number: number | null
  stage_id: string | null
}

type Vendor = { id: string; name: string }
type Stage = { id: string; name: string; sort_order: number }

function ItemsTable({
  items,
  vendorName,
  lineTotal,
}: {
  items: LineItem[]
  vendorName: (vendorId: string | null) => string
  lineTotal: (li: LineItem) => number
}) {
  return (
    <>
      <table className="hidden md:table w-full text-[13px] border-collapse">
        <tbody>
          {items.map((li) => (
            <tr key={li.id} className="border-b border-border">
              <td className="px-6 py-2 w-[25%]">
                <div className="text-[10px] uppercase tracking-wide text-text-muted">{li.room_area}</div>
                <div className="font-semibold">{li.item}</div>
              </td>
              <td className="px-3 py-2 text-text-muted">
                {li.assigned_to === 'Outside Vendor' ? vendorName(li.vendor_id) : (li.assigned_to ?? '—')}
              </td>
              <td className="px-3 py-2 text-right data-mono">${lineTotal(li).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="md:hidden">
        {items.map((li) => (
          <div key={li.id} className="px-4 py-2.5 border-b border-border flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wide text-text-muted">{li.room_area}</div>
              <div className="font-semibold text-[13px]">{li.item}</div>
              <div className="text-[12px] text-text-muted">
                {li.assigned_to === 'Outside Vendor' ? vendorName(li.vendor_id) : (li.assigned_to ?? '—')}
              </div>
            </div>
            <div className="data-mono text-[13px] whitespace-nowrap">${lineTotal(li).toFixed(2)}</div>
          </div>
        ))}
      </div>
    </>
  )
}

export default async function QuoteSheetStagesPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession()
  const { id } = await params
  const sql = getSql()

  const [inspection] = await sql`select * from inspections where id = ${id}`
  if (!inspection) notFound()

  const lineItems = (await sql`
    select id, room_area, item, assigned_to, vendor_id, materials_cost, labor_cost, vendor_estimated_cost, batch_number, stage_id
    from line_items
    where inspection_id = ${id} and tenant_approved = false
    order by batch_number nulls last, room_area, created_at
  `) as unknown as LineItem[]

  const vendors = (await sql`select id, name from vendors order by name`) as unknown as Vendor[]
  const vendorName = (vendorId: string | null) => vendors.find((v) => v.id === vendorId)?.name ?? 'Vendor'

  const stages = (await sql`select id, name, sort_order from stages order by sort_order`) as unknown as Stage[]
  const stageById = new Map(stages.map((s) => [s.id, s]))

  const batches = new Map<number, LineItem[]>()
  const unbatched: LineItem[] = []
  for (const li of lineItems) {
    if (li.batch_number === null) {
      unbatched.push(li)
      continue
    }
    if (!batches.has(li.batch_number)) batches.set(li.batch_number, [])
    batches.get(li.batch_number)!.push(li)
  }

  function assigneeLabel(items: LineItem[]) {
    const distinct = new Set(items.map((li) => (li.assigned_to === 'Outside Vendor' ? `vendor:${li.vendor_id}` : li.assigned_to)))
    if (distinct.size > 1) return 'Mixed assignment'
    const li = items[0]
    return li.assigned_to === 'Outside Vendor' ? vendorName(li.vendor_id) : (li.assigned_to ?? 'Unassigned')
  }

  function stageLabel(items: LineItem[]) {
    const distinct = new Set(items.map((li) => li.stage_id))
    if (distinct.size > 1) return 'Mixed stages'
    const stageId = items[0].stage_id
    return stageId ? (stageById.get(stageId)?.name ?? 'Unknown stage') : 'No stage'
  }

  function stageSortKey(items: LineItem[]) {
    const distinct = new Set(items.map((li) => li.stage_id))
    if (distinct.size > 1) return Number.MAX_SAFE_INTEGER - 1
    const stageId = items[0].stage_id
    return stageId ? (stageById.get(stageId)?.sort_order ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER
  }

  function lineTotal(li: LineItem) {
    return Number(li.materials_cost ?? 0) + Number(li.labor_cost ?? 0) + Number(li.vendor_estimated_cost ?? 0)
  }

  const orderedBatches = [...batches.entries()].sort(([, itemsA], [, itemsB]) => {
    const stageDiff = stageSortKey(itemsA) - stageSortKey(itemsB)
    if (stageDiff !== 0) return stageDiff
    return assigneeLabel(itemsA).localeCompare(assigneeLabel(itemsB))
  })

  return (
    <AppShell active="/inspections" title={`Stage View — ${inspection.property_address}`} wide>
      <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-border bg-surface-alt flex-wrap gap-2">
        <div className="text-[13px] text-text-muted">
          {inspection.property_address} · Job <span className="data-mono">{inspection.job_number}</span>
        </div>
        <a
          href={`/inspections/${id}/quote-sheet`}
          className="bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold"
        >
          Regular View
        </a>
      </div>

      {batches.size === 0 && (
        <div className="px-4 md:px-6 py-6 text-[13px] text-text-muted">
          No batches yet. Go to Regular View, set a Stage on each item, then click &quot;Create Batches&quot;.
        </div>
      )}

      {orderedBatches.map(([batchNumber, items]) => {
        const total = items.reduce((sum, li) => sum + lineTotal(li), 0)
        return (
          <div key={batchNumber} className="border-b border-border">
            <div className="flex items-center justify-between gap-4 px-4 md:px-6 py-3 bg-surface-alt flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-display font-bold text-[14px]">{stageLabel(items)}</span>
                <span className="text-[13px] text-text-muted">{assigneeLabel(items)}</span>
                <span className="data-mono text-[11px] text-text-muted">{items.length} item(s)</span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`/inspections/${id}/quote-sheet/stages/${batchNumber}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap"
                >
                  Take-Off Sheet
                </a>
              </div>
            </div>
            <ItemsTable items={items} vendorName={vendorName} lineTotal={lineTotal} />
            <div className="flex items-center justify-between px-4 md:px-6 py-2 border-b border-border">
              <span className="font-semibold text-[12px]">Batch Total</span>
              <span className="data-mono font-semibold text-[13px]">${total.toFixed(2)}</span>
            </div>
          </div>
        )
      })}

      {unbatched.length > 0 && (
        <div className="border-b border-border">
          <div className="px-4 md:px-6 py-3 bg-surface-alt">
            <span className="font-display font-bold text-[14px]">Unbatched</span>
            <span className="data-mono text-[11px] text-text-muted ml-2">{unbatched.length} item(s)</span>
          </div>
          <ItemsTable items={unbatched} vendorName={vendorName} lineTotal={lineTotal} />
        </div>
      )}
    </AppShell>
  )
}
