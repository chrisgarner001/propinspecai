import { getSql } from '@/lib/db'
import { notFound } from 'next/navigation'
import { sendBatchToPW } from '@/app/actions'
import AppShell from '@/app/components/AppShell'

// Read-only grouped view of the Quote Sheet's batches -- reassigning which
// batch an item belongs to happens back on the Regular View (via its Stage
// picker + "Create Batches"), not here. This view exists to (a) see each
// batch as a unit before sending it out, and (b) send it to PropertyWare.
//
// A batch is still keyed by batch_number under the hood (see
// 0018_manual_batch_numbering.sql / 0019_stages.sql) -- one work order per
// (Stage, Assignee) pair, since the same vendor can need separate batches
// across different stages. This page just labels/orders each batch by its
// Stage instead of the raw number, matching the Quote Sheet and Job
// Timeline.
//
// "Send to PW" is a STAND-IN for the real PropertyWare API integration --
// no PW API credentials/endpoint docs were available when this was built.
// It records a manually-typed PW work order number instead of actually
// calling PropertyWare. Swap in the real call in app/actions.ts's
// sendBatchToPW later; this page's form shape (submit a pw_work_order_number)
// can stay the same, or become a real "Send" button once the API assigns
// the number automatically.

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
type BatchMeta = { batch_number: number; pw_work_order_number: string | null }

export default async function QuoteSheetStagesPage({ params }: { params: Promise<{ id: string }> }) {
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

  const batchMeta = (await sql`
    select batch_number, pw_work_order_number from work_order_batches where inspection_id = ${id}
  `) as unknown as BatchMeta[]

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
    <AppShell active="/" title={`Stage View — ${inspection.property_address}`} wide>
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-surface-alt">
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
        <div className="px-6 py-6 text-[13px] text-text-muted">
          No batches yet. Go to Regular View, set a Stage on each item, then click &quot;Create Batches&quot;.
        </div>
      )}

      {orderedBatches.map(([batchNumber, items]) => {
        const meta = batchMeta.find((m) => m.batch_number === batchNumber)
        const total = items.reduce((sum, li) => sum + lineTotal(li), 0)
        return (
          <div key={batchNumber} className="border-b border-border">
            <div className="flex items-center justify-between gap-4 px-6 py-3 bg-surface-alt">
              <div className="flex items-center gap-3">
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
                {meta?.pw_work_order_number ? (
                  <div className="text-[12px] font-semibold text-success">PW WO# {meta.pw_work_order_number}</div>
                ) : (
                  <form action={sendBatchToPW.bind(null, id, batchNumber)} className="flex items-center gap-2">
                    <input
                      name="pw_work_order_number"
                      required
                      placeholder="PW work order #"
                      className="text-[12px] border border-border rounded-[var(--radius-sm)] px-2 py-1 bg-surface w-36"
                    />
                    <button
                      type="submit"
                      className="bg-accent hover:bg-accent-hover text-white rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap"
                    >
                      Send to PW
                    </button>
                  </form>
                )}
              </div>
            </div>
            <table className="w-full text-[13px] border-collapse">
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
                <tr>
                  <td className="px-6 py-2" colSpan={2}>
                    <span className="font-semibold text-[12px]">Batch Total</span>
                  </td>
                  <td className="px-3 py-2 text-right data-mono font-semibold">${total.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )
      })}

      {unbatched.length > 0 && (
        <div className="border-b border-border">
          <div className="px-6 py-3 bg-surface-alt">
            <span className="font-display font-bold text-[14px]">Unbatched</span>
            <span className="data-mono text-[11px] text-text-muted ml-2">{unbatched.length} item(s)</span>
          </div>
          <table className="w-full text-[13px] border-collapse">
            <tbody>
              {unbatched.map((li) => (
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
        </div>
      )}
    </AppShell>
  )
}
