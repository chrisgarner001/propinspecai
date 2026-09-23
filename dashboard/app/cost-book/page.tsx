import { getSql } from '@/lib/db'
import { requireAdmin } from '@/lib/dal'
import AppShell from '@/app/components/AppShell'
import SupplierTile from '@/app/components/SupplierTile'
import AddSupplierForm from '@/app/components/AddSupplierForm'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

type Supplier = { id: string; name: string; material_count: number }

// Cost Book dashboard (docs/designs/propinspec-cost-book-dashboard.md):
// replaces the old single long page (GPM Labor + Materials + Vendor
// Estimates all stacked in sequence) -- Jessica's team said directly it was
// getting hard to find things. Same data, reorganized into a landing page +
// sub-book pages (Labor, Stock Items, one per supplier).
export default async function CostBookPage() {
  await requireAdmin()
  const sql = getSql()

  const [laborCount] = await sql`select count(*)::int as n from cost_book_gpm_labor`
  const [vendorEstimateCount] = await sql`select count(*)::int as n from cost_book_vendor_estimates`
  const [stockItemCount] = await sql`select count(*)::int as n from stock_items`

  const suppliers = (await sql`
    select s.id, s.name, count(m.id)::int as material_count
    from suppliers s
    left join cost_book_materials m on lower(m.source) = lower(s.name)
    group by s.id, s.name
    order by s.name
  `) as unknown as Supplier[]

  return (
    <AppShell active="/cost-book" title="Cost Book">
      <p className="px-4 md:px-6 pt-5 text-[13px] text-text-muted max-w-2xl">
        GPM&apos;s reference pricing, organized into sub-books. <strong>Labor</strong> covers GPM&apos;s own labor
        rates and placeholder vendor estimates. <strong>Stock Items</strong> is the curated list of GPM&apos;s
        deliberately-stocked rehab items, checked first when building a quote. Everything else is grouped by
        supplier — each one tracks its own materials pricing, built up from purchase history, manual entry, or items
        promoted from the Quote Sheet.
      </p>

      <div className="px-4 md:px-6 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Link
          href="/cost-book/labor"
          className="border border-border rounded-[var(--radius-md)] p-4 hover:border-accent hover:bg-surface-alt"
        >
          <div className="font-display font-bold text-[14px]">Labor</div>
          <div className="text-[12px] text-text-muted mt-1">
            {laborCount.n} rate{laborCount.n === 1 ? '' : 's'} · {vendorEstimateCount.n} vendor estimate
            {vendorEstimateCount.n === 1 ? '' : 's'}
          </div>
        </Link>

        <Link
          href="/cost-book/stock-items"
          className="border border-border rounded-[var(--radius-md)] p-4 hover:border-accent hover:bg-surface-alt"
        >
          <div className="font-display font-bold text-[14px]">Stock Items</div>
          <div className="text-[12px] text-text-muted mt-1">
            {stockItemCount.n} item{stockItemCount.n === 1 ? '' : 's'}
          </div>
        </Link>

        {suppliers.map((s) => (
          <SupplierTile key={s.id} id={s.id} name={s.name} materialCount={s.material_count} />
        ))}

        <AddSupplierForm />
      </div>
    </AppShell>
  )
}
