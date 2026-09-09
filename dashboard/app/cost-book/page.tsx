import { getSql } from '@/lib/db'
import {
  addGpmLaborRate,
  updateGpmLaborRate,
  addMaterial,
  updateMaterial,
  addVendorEstimate,
  updateVendorEstimate,
} from './actions'
import Link from 'next/link'

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

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-12">
      <div>
        <Link href="/" className="text-blue-600 underline text-sm">
          &larr; Back to inspections
        </Link>
        <h1 className="text-2xl font-bold mt-2">Cost Book</h1>
        <p className="text-gray-600 text-sm">
          GPM&apos;s reference pricing. Vendor estimates are placeholders only, used
          until a real vendor quote comes in for a specific job.
        </p>
      </div>

      {/* --- GPM Labor --- */}
      <section>
        <h2 className="text-lg font-semibold mb-2">GPM Labor</h2>
        <p className="text-sm text-gray-500 mb-3">
          Per-item labor charge for tasks GPM staff perform themselves.
        </p>
        <table className="w-full border-collapse text-sm mb-4">
          <thead>
            <tr className="border-b-2 border-gray-800 text-left">
              <th className="p-2">Task</th>
              <th className="p-2">Rate</th>
              <th className="p-2">Unit</th>
              <th className="p-2">Notes</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {gpmLabor.length === 0 && (
              <tr>
                <td colSpan={5} className="p-2 text-gray-400 italic">
                  No labor rates yet.
                </td>
              </tr>
            )}
            {gpmLabor.map((r) => (
              <tr key={r.id} className="border-b border-gray-200">
                <td colSpan={5} className="p-0">
                  <form action={updateGpmLaborRate} className="grid grid-cols-5 gap-2 items-center p-2">
                    <input type="hidden" name="id" value={r.id} />
                    <div>{r.task_name}</div>
                    <input
                      name="labor_rate"
                      type="number"
                      step="0.01"
                      defaultValue={r.labor_rate}
                      className="border rounded px-2 py-1 w-24"
                    />
                    <input
                      name="unit"
                      defaultValue={r.unit}
                      className="border rounded px-2 py-1 w-28"
                    />
                    <input
                      name="notes"
                      defaultValue={r.notes ?? ''}
                      className="border rounded px-2 py-1 w-full"
                    />
                    <button type="submit" className="bg-black text-white rounded px-3 py-1 text-xs w-fit">
                      Save
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form action={addGpmLaborRate} className="grid grid-cols-5 gap-2 items-end">
          <input name="task_name" required placeholder="Task name" className="border rounded px-2 py-1" />
          <input name="labor_rate" type="number" step="0.01" required placeholder="Rate" className="border rounded px-2 py-1" />
          <input name="unit" defaultValue="per item" placeholder="Unit" className="border rounded px-2 py-1" />
          <input name="notes" placeholder="Notes" className="border rounded px-2 py-1" />
          <button type="submit" className="bg-black text-white rounded px-3 py-2 text-xs w-fit">
            Add
          </button>
        </form>
      </section>

      {/* --- Materials --- */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Materials</h2>
        <p className="text-sm text-gray-500 mb-3">
          Most materials are purchased from Home Depot. Not yet seeded from
          receipts — add the last 6 months of purchases here (or provide the
          receipts and they can be imported in bulk).
        </p>
        <table className="w-full border-collapse text-sm mb-4">
          <thead>
            <tr className="border-b-2 border-gray-800 text-left">
              <th className="p-2">Material</th>
              <th className="p-2">Price</th>
              <th className="p-2">Unit</th>
              <th className="p-2">Source</th>
              <th className="p-2">SKU</th>
              <th className="p-2">Notes</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {materials.length === 0 && (
              <tr>
                <td colSpan={7} className="p-2 text-gray-400 italic">
                  No materials yet — this list starts empty until Home Depot
                  receipts are imported.
                </td>
              </tr>
            )}
            {materials.map((m) => (
              <tr key={m.id} className="border-b border-gray-200">
                <td colSpan={7} className="p-0">
                  <form action={updateMaterial} className="grid grid-cols-7 gap-2 items-center p-2">
                    <input type="hidden" name="id" value={m.id} />
                    <div>{m.material_name}</div>
                    <input
                      name="unit_price"
                      type="number"
                      step="0.01"
                      defaultValue={m.unit_price}
                      className="border rounded px-2 py-1 w-20"
                    />
                    <input name="unit" defaultValue={m.unit} className="border rounded px-2 py-1 w-20" />
                    <input name="source" defaultValue={m.source} className="border rounded px-2 py-1 w-24" />
                    <input name="sku" defaultValue={m.sku ?? ''} className="border rounded px-2 py-1 w-24" />
                    <input name="notes" defaultValue={m.notes ?? ''} className="border rounded px-2 py-1 w-full" />
                    <button type="submit" className="bg-black text-white rounded px-3 py-1 text-xs w-fit">
                      Save
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form action={addMaterial} className="grid grid-cols-6 gap-2 items-end">
          <input name="material_name" required placeholder="Material name" className="border rounded px-2 py-1" />
          <input name="unit_price" type="number" step="0.01" required placeholder="Price" className="border rounded px-2 py-1" />
          <input name="unit" defaultValue="each" placeholder="Unit" className="border rounded px-2 py-1" />
          <input name="source" defaultValue="Home Depot" placeholder="Source" className="border rounded px-2 py-1" />
          <input name="sku" placeholder="SKU (optional)" className="border rounded px-2 py-1" />
          <button type="submit" className="bg-black text-white rounded px-3 py-2 text-xs w-fit">
            Add
          </button>
        </form>
      </section>

      {/* --- Vendor Estimates --- */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Vendor Estimates</h2>
        <p className="text-sm text-gray-500 mb-3">
          Placeholder rates used until a real vendor quote exists for this
          specific job. Uncheck &quot;Placeholder&quot; once a real quote replaces it.
        </p>
        <table className="w-full border-collapse text-sm mb-4">
          <thead>
            <tr className="border-b-2 border-gray-800 text-left">
              <th className="p-2">Trade</th>
              <th className="p-2">Task</th>
              <th className="p-2">Est. Cost</th>
              <th className="p-2">Placeholder?</th>
              <th className="p-2">Notes</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {vendorEstimates.length === 0 && (
              <tr>
                <td colSpan={6} className="p-2 text-gray-400 italic">
                  No vendor estimates yet.
                </td>
              </tr>
            )}
            {vendorEstimates.map((v) => (
              <tr key={v.id} className="border-b border-gray-200">
                <td colSpan={6} className="p-0">
                  <form action={updateVendorEstimate} className="grid grid-cols-6 gap-2 items-center p-2">
                    <input type="hidden" name="id" value={v.id} />
                    <div>{v.trade_category}</div>
                    <div>{v.task_name}</div>
                    <input
                      name="estimated_cost"
                      type="number"
                      step="0.01"
                      defaultValue={v.estimated_cost}
                      className="border rounded px-2 py-1 w-24"
                    />
                    <label className="flex items-center gap-1 text-xs">
                      <input type="checkbox" name="is_placeholder" defaultChecked={v.is_placeholder} />
                      Placeholder
                    </label>
                    <input name="notes" defaultValue={v.notes ?? ''} className="border rounded px-2 py-1 w-full" />
                    <button type="submit" className="bg-black text-white rounded px-3 py-1 text-xs w-fit">
                      Save
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form action={addVendorEstimate} className="grid grid-cols-5 gap-2 items-end">
          <input name="trade_category" required placeholder="Trade category" className="border rounded px-2 py-1" />
          <input name="task_name" required placeholder="Task" className="border rounded px-2 py-1" />
          <input name="estimated_cost" type="number" step="0.01" required placeholder="Est. cost" className="border rounded px-2 py-1" />
          <input name="notes" placeholder="Notes" className="border rounded px-2 py-1" />
          <button type="submit" className="bg-black text-white rounded px-3 py-2 text-xs w-fit">
            Add
          </button>
        </form>
      </section>
    </main>
  )
}
