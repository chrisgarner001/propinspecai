import { getSql } from '@/lib/db'
import {
  addGpmLaborRate,
  updateGpmLaborRate,
  addMaterial,
  updateMaterial,
  addVendorEstimate,
  updateVendorEstimate,
} from './actions'
import AppShell from '@/app/components/AppShell'

export const dynamic = 'force-dynamic'

type GpmLaborRate = {
  id: string
  task_name: string
  labor_rate: string
  unit: string
  notes: string | null
}

type Material = {
  id: string
  material_name: string
  unit_price: string
  unit: string
  source: string
  sku: string | null
  notes: string | null
}

type VendorEstimate = {
  id: string
  trade_category: string
  task_name: string
  estimated_cost: string
  is_placeholder: boolean
  notes: string | null
}

const inputClass =
  'border border-border rounded-[var(--radius-sm)] px-2 py-1.5 w-full min-w-0 bg-surface'
const dataInputClass = `data-mono ${inputClass}`
const saveButtonClass =
  'bg-accent hover:bg-accent-hover text-white rounded-[var(--radius-sm)] px-3 py-1 text-[12px] font-semibold w-fit'
const addButtonClass =
  'bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-2 text-[12px] font-semibold w-fit'
const emptyRowClass = 'px-3 py-3 text-[13px] text-text-muted italic'

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="px-6 pt-6 pb-3">
      <h2 className="font-display font-bold text-[15px]">{title}</h2>
      <p className="text-[13px] text-text-muted mt-0.5">{description}</p>
    </div>
  )
}

export default async function CostBookPage() {
  const sql = getSql()
  const gpmLabor = (await sql`
    select * from cost_book_gpm_labor order by task_name
  `) as unknown as GpmLaborRate[]

  const materials = (await sql`
    select * from cost_book_materials order by material_name
  `) as unknown as Material[]

  const vendorEstimates = (await sql`
    select * from cost_book_vendor_estimates order by trade_category, task_name
  `) as unknown as VendorEstimate[]

  const laborCols = 'grid-cols-[1.6fr_0.7fr_0.9fr_1.8fr_0.6fr]'
  const materialCols = 'grid-cols-[1.6fr_0.7fr_0.7fr_0.9fr_0.9fr_1.6fr_0.6fr]'
  const vendorCols = 'grid-cols-[1.1fr_1.4fr_0.8fr_1fr_1.6fr_0.6fr]'

  return (
    <AppShell active="/setup" reviewerName="Jessica Zilka" title="Cost Book">
      <p className="px-6 pt-5 text-[13px] text-text-muted max-w-2xl">
        GPM&apos;s reference pricing. Vendor estimates are placeholders only, used until a real vendor quote comes
        in for a specific job.
      </p>

      {/* --- GPM Labor --- */}
      <section className="border-t border-border mt-5">
        <SectionHeading
          title="GPM Labor"
          description="Per-item labor charge for tasks GPM staff perform themselves."
        />
        <div role="table" className="overflow-x-auto">
          <div role="row" className={`grid ${laborCols} gap-2 px-6 py-2 border-y border-border min-w-[720px]`}>
            {['Task', 'Rate', 'Unit', 'Notes', ''].map((h) => (
              <div key={h} role="columnheader" className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                {h}
              </div>
            ))}
          </div>
          {gpmLabor.length === 0 && <div className={emptyRowClass}>No labor rates yet.</div>}
          {gpmLabor.map((r) => (
            <form
              key={r.id}
              action={updateGpmLaborRate}
              role="row"
              className={`grid ${laborCols} gap-2 items-center px-6 py-2.5 border-b border-border min-w-[720px]`}
            >
              <input type="hidden" name="id" value={r.id} />
              <div role="cell" className="font-medium">{r.task_name}</div>
              <input role="cell" name="labor_rate" type="number" step="0.01" defaultValue={r.labor_rate} className={dataInputClass} />
              <input role="cell" name="unit" defaultValue={r.unit} className={inputClass} />
              <input role="cell" name="notes" defaultValue={r.notes ?? ''} className={inputClass} />
              <div role="cell">
                <button type="submit" className={saveButtonClass}>Save</button>
              </div>
            </form>
          ))}
        </div>
        <form action={addGpmLaborRate} className={`grid ${laborCols} gap-2 items-end px-6 py-4`}>
          <input name="task_name" required placeholder="Task name" className={inputClass} />
          <input name="labor_rate" type="number" step="0.01" required placeholder="Rate" className={dataInputClass} />
          <input name="unit" defaultValue="per item" placeholder="Unit" className={inputClass} />
          <input name="notes" placeholder="Notes" className={inputClass} />
          <button type="submit" className={addButtonClass}>Add</button>
        </form>
      </section>

      {/* --- Materials --- */}
      <section className="border-t border-border">
        <SectionHeading
          title="Materials"
          description="Most materials are purchased from Home Depot. Not yet seeded from receipts — add the last 6 months of purchases here (or provide the receipts and they can be imported in bulk)."
        />
        <div role="table" className="overflow-x-auto">
          <div role="row" className={`grid ${materialCols} gap-2 px-6 py-2 border-y border-border min-w-[860px]`}>
            {['Material', 'Price', 'Unit', 'Source', 'SKU', 'Notes', ''].map((h) => (
              <div key={h} role="columnheader" className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                {h}
              </div>
            ))}
          </div>
          {materials.length === 0 && (
            <div className={emptyRowClass}>
              No materials yet — this list starts empty until Home Depot receipts are imported.
            </div>
          )}
          {materials.map((m) => (
            <form
              key={m.id}
              action={updateMaterial}
              role="row"
              className={`grid ${materialCols} gap-2 items-center px-6 py-2.5 border-b border-border min-w-[860px]`}
            >
              <input type="hidden" name="id" value={m.id} />
              <div role="cell" className="font-medium">{m.material_name}</div>
              <input role="cell" name="unit_price" type="number" step="0.01" defaultValue={m.unit_price} className={dataInputClass} />
              <input role="cell" name="unit" defaultValue={m.unit} className={inputClass} />
              <input role="cell" name="source" defaultValue={m.source} className={inputClass} />
              <input role="cell" name="sku" defaultValue={m.sku ?? ''} className={`data-mono ${inputClass}`} />
              <input role="cell" name="notes" defaultValue={m.notes ?? ''} className={inputClass} />
              <div role="cell">
                <button type="submit" className={saveButtonClass}>Save</button>
              </div>
            </form>
          ))}
        </div>
        <form action={addMaterial} className="grid grid-cols-[1.6fr_0.7fr_0.7fr_0.9fr_0.9fr_0.6fr] gap-2 items-end px-6 py-4">
          <input name="material_name" required placeholder="Material name" className={inputClass} />
          <input name="unit_price" type="number" step="0.01" required placeholder="Price" className={dataInputClass} />
          <input name="unit" defaultValue="each" placeholder="Unit" className={inputClass} />
          <input name="source" defaultValue="Home Depot" placeholder="Source" className={inputClass} />
          <input name="sku" placeholder="SKU (optional)" className={`data-mono ${inputClass}`} />
          <button type="submit" className={addButtonClass}>Add</button>
        </form>
      </section>

      {/* --- Vendor Estimates --- */}
      <section className="border-t border-border">
        <SectionHeading
          title="Vendor Estimates"
          description={'Placeholder rates used until a real vendor quote exists for this specific job. Uncheck "Placeholder" once a real quote replaces it.'}
        />
        <div role="table" className="overflow-x-auto">
          <div role="row" className={`grid ${vendorCols} gap-2 px-6 py-2 border-y border-border min-w-[820px]`}>
            {['Trade', 'Task', 'Est. Cost', 'Placeholder?', 'Notes', ''].map((h) => (
              <div key={h} role="columnheader" className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                {h}
              </div>
            ))}
          </div>
          {vendorEstimates.length === 0 && <div className={emptyRowClass}>No vendor estimates yet.</div>}
          {vendorEstimates.map((v) => (
            <form
              key={v.id}
              action={updateVendorEstimate}
              role="row"
              className={`grid ${vendorCols} gap-2 items-center px-6 py-2.5 border-b border-border min-w-[820px]`}
            >
              <input type="hidden" name="id" value={v.id} />
              <div role="cell" className="text-text-muted">{v.trade_category}</div>
              <div role="cell" className="font-medium">{v.task_name}</div>
              <input role="cell" name="estimated_cost" type="number" step="0.01" defaultValue={v.estimated_cost} className={dataInputClass} />
              <label role="cell" className="flex items-center gap-1.5 text-[12px] text-text-muted whitespace-nowrap">
                <input type="checkbox" name="is_placeholder" defaultChecked={v.is_placeholder} />
                Placeholder
              </label>
              <input role="cell" name="notes" defaultValue={v.notes ?? ''} className={inputClass} />
              <div role="cell">
                <button type="submit" className={saveButtonClass}>Save</button>
              </div>
            </form>
          ))}
        </div>
        <form action={addVendorEstimate} className="grid grid-cols-[1.1fr_1.4fr_0.8fr_1.6fr_0.6fr] gap-2 items-end px-6 py-4">
          <input name="trade_category" required placeholder="Trade category" className={inputClass} />
          <input name="task_name" required placeholder="Task" className={inputClass} />
          <input name="estimated_cost" type="number" step="0.01" required placeholder="Est. cost" className={dataInputClass} />
          <input name="notes" placeholder="Notes" className={inputClass} />
          <button type="submit" className={addButtonClass}>Add</button>
        </form>
      </section>
    </AppShell>
  )
}
