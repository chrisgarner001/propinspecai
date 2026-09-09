import { sql } from '@/lib/db'
import { updateLineItem, addLineItem } from '@/app/actions'
import { notFound } from 'next/navigation'

type LineItem = {
  id: string
  room_area: string
  item: string
  condition: string
  observed_evidence: string | null
  assigned_to: string | null
  trade_category: string | null
  recommended_action: string | null
  priority: string | null
  materials_cost: string | null
  labor_cost: string | null
  vendor_estimated_cost: string | null
  tenant_status: string | null
  is_manual_addition: boolean
}

export default async function InspectionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [inspection] = await sql`select * from inspections where id = ${id}`
  if (!inspection) notFound()

  const lineItems = (await sql`
    select * from line_items where inspection_id = ${id} order by room_area, created_at
  `) as unknown as LineItem[]

  return (
    <main className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-1">PropInspecAI — Review Dashboard</h1>
      <p className="text-gray-600 mb-6">
        {inspection.property_address} · Job {inspection.job_number} · Inspected by{' '}
        {inspection.inspector_name} on{' '}
        {new Date(inspection.inspection_date).toLocaleDateString('en-US', { timeZone: 'UTC' })}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm min-w-[900px]">
          <thead>
            <tr className="border-b-2 border-gray-800 text-left">
              <th className="p-2">Item</th>
              <th className="p-2">Condition</th>
              <th className="p-2">Assigned To</th>
              <th className="p-2">Materials</th>
              <th className="p-2">Labor</th>
              <th className="p-2">Vendor Est.</th>
              <th className="p-2">Tenant Status</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((li) => (
              <tr key={li.id} className="border-b border-gray-200 align-top">
                <td colSpan={8} className="p-0">
                  <form
                    action={updateLineItem}
                    className="grid grid-cols-8 gap-2 items-center p-2"
                  >
                    <input type="hidden" name="id" value={li.id} />
                    <input type="hidden" name="inspection_id" value={id} />
                    <div>
                      <div className="font-medium">
                        {li.item}
                        {li.is_manual_addition && (
                          <span className="ml-1 text-xs text-blue-600">(added)</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">{li.recommended_action}</div>
                    </div>
                    <div>{li.condition}</div>
                    <div>{li.assigned_to ?? '—'}</div>
                    <input
                      name="materials_cost"
                      type="number"
                      step="0.01"
                      defaultValue={li.materials_cost ?? ''}
                      disabled={li.assigned_to !== 'GPM Staff'}
                      placeholder="—"
                      className="border rounded px-2 py-1 w-24 disabled:bg-gray-100"
                    />
                    <input
                      name="labor_cost"
                      type="number"
                      step="0.01"
                      defaultValue={li.labor_cost ?? ''}
                      disabled={li.assigned_to !== 'GPM Staff'}
                      placeholder="—"
                      className="border rounded px-2 py-1 w-24 disabled:bg-gray-100"
                    />
                    <input
                      name="vendor_estimated_cost"
                      type="number"
                      step="0.01"
                      defaultValue={li.vendor_estimated_cost ?? ''}
                      disabled={li.assigned_to !== 'Outside Vendor'}
                      placeholder="—"
                      className="border rounded px-2 py-1 w-24 disabled:bg-gray-100"
                    />
                    <div className="flex gap-3">
                      <label className="flex items-center gap-1 text-xs">
                        <input
                          type="radio"
                          name="tenant_status"
                          value="tenant_charge"
                          defaultChecked={li.tenant_status === 'tenant_charge'}
                        />
                        Charge
                      </label>
                      <label className="flex items-center gap-1 text-xs">
                        <input
                          type="radio"
                          name="tenant_status"
                          value="approved"
                          defaultChecked={li.tenant_status === 'approved'}
                        />
                        Approved
                      </label>
                    </div>
                    <button
                      type="submit"
                      className="bg-black text-white rounded px-3 py-1 text-xs w-fit"
                    >
                      Save
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="text-lg font-semibold mt-8 mb-2">Add a line item</h2>
      <form action={addLineItem} className="grid grid-cols-6 gap-2 items-end">
        <input type="hidden" name="inspection_id" value={id} />
        <div>
          <label className="block text-xs text-gray-500">Room/Area</label>
          <input name="room_area" required className="border rounded px-2 py-1 w-full" />
        </div>
        <div>
          <label className="block text-xs text-gray-500">Item</label>
          <input name="item" required className="border rounded px-2 py-1 w-full" />
        </div>
        <div>
          <label className="block text-xs text-gray-500">Condition</label>
          <select name="condition" required className="border rounded px-2 py-1 w-full">
            <option value="Good">Good</option>
            <option value="Fair">Fair</option>
            <option value="Damaged">Damaged</option>
            <option value="Not Rated">Not Rated</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500">Assigned To</label>
          <select name="assigned_to" className="border rounded px-2 py-1 w-full">
            <option value="">—</option>
            <option value="GPM Staff">GPM Staff</option>
            <option value="Outside Vendor">Outside Vendor</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-gray-500">Recommended Action</label>
          <input name="recommended_action" className="border rounded px-2 py-1 w-full" />
        </div>
        <button
          type="submit"
          className="bg-black text-white rounded px-3 py-2 text-xs col-span-6 w-fit"
        >
          Add Item
        </button>
      </form>
    </main>
  )
}
