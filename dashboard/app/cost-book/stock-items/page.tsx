import { getSql } from '@/lib/db'
import { requireAdmin } from '@/lib/dal'
import { createStockItem, updateStockItem } from '@/app/cost-book/actions'
import AppShell from '@/app/components/AppShell'
import DeleteStockItemButton from '@/app/components/DeleteStockItemButton'

export const dynamic = 'force-dynamic'

type StockItem = {
  id: string
  category: string
  material_name: string
  supplier: string
  sku: string | null
  unit_price: string
  unit: string | null
  notes: string | null
}

const inputClass = 'border border-border rounded-[var(--radius-sm)] px-2 py-1.5 w-full min-w-0 bg-surface'
const dataInputClass = `data-mono ${inputClass}`
const saveButtonClass =
  'bg-accent hover:bg-accent-hover text-white rounded-[var(--radius-sm)] px-3 py-1 text-[12px] font-semibold w-fit'
const addButtonClass =
  'bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-2 text-[12px] font-semibold w-fit'
const emptyRowClass = 'px-3 py-3 text-[13px] text-text-muted italic'
const mobileLabelClass = 'md:hidden text-[10px] font-semibold uppercase tracking-wide text-text-muted'
const cols = 'grid-cols-1 md:grid-cols-[1fr_1.6fr_1fr_0.9fr_0.7fr_0.7fr_1.2fr_0.6fr]'

export default async function StockItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>
}) {
  await requireAdmin()
  const sp = await searchParams
  const q = sp.q?.trim() || undefined
  const category = sp.category || undefined
  const sql = getSql()

  let where = sql``
  if (q) {
    const like = `%${q}%`
    where = sql`${where} and (material_name ilike ${like} or sku ilike ${like} or category ilike ${like})`
  }
  if (category) {
    where = sql`${where} and category = ${category}`
  }

  const items = (await sql`
    select id, category, material_name, supplier, sku, unit_price, unit, notes
    from stock_items
    where true ${where}
    order by category, material_name
  `) as unknown as StockItem[]

  const categoryRows = await sql`
    select category, count(*)::int as count from stock_items group by category order by category
  `

  return (
    <AppShell active="/cost-book" title="Cost Book — Stock Items">
      <p className="px-4 md:px-6 pt-5 text-[13px] text-text-muted max-w-2xl">
        GPM&apos;s deliberately-stocked rehab items — outlets, switches, smoke detectors, and the like — checked
        first on the Quote Sheet before the general purchase-history search (
        <a href="/cost-book" className="text-accent underline decoration-accent/40">
          docs/designs/propinspec-stock-items.md
        </a>
        ). Built up mainly by promoting corrections from the Quote Sheet (&quot;Save as Stock Item&quot;) — add or
        edit entries by hand below to pre-seed or fix the list directly.
      </p>

      <section className="border-t border-border mt-5">
        <form method="get" className="px-4 md:px-6 py-3 flex items-center gap-2 flex-wrap">
          {category && <input type="hidden" name="category" value={category} />}
          <input
            type="search"
            name="q"
            defaultValue={q ?? ''}
            placeholder="Search by name, SKU, or category…"
            className={`${inputClass} max-w-md`}
          />
          <button type="submit" className={addButtonClass}>Search</button>
          {(q || category) && (
            <a href="/cost-book/stock-items" className="text-[12px] text-accent underline decoration-accent/40">
              Clear all filters
            </a>
          )}
        </form>

        {categoryRows.length > 0 && (
          <div className="px-4 md:px-6 pb-3 flex flex-wrap gap-1.5">
            {categoryRows.map((c) => (
              <a
                key={c.category}
                href={`/cost-book/stock-items?category=${encodeURIComponent(c.category)}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                className={`px-2 py-0.5 rounded-[var(--radius-sm)] text-[11px] ${
                  category === c.category ? 'bg-accent/10 text-accent font-semibold' : 'bg-surface-alt text-text-muted hover:text-text'
                }`}
              >
                {c.category} <span className="text-[10px]">({c.count})</span>
              </a>
            ))}
          </div>
        )}

        <div role="table">
          <div role="row" className={`hidden md:grid ${cols} gap-2 px-4 md:px-6 py-2 border-y border-border`}>
            {['Category', 'Material', 'Supplier', 'SKU', 'Price', 'Unit', 'Notes', ''].map((h) => (
              <div key={h} role="columnheader" className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                {h}
              </div>
            ))}
          </div>
          {items.length === 0 && (
            <div className={emptyRowClass}>
              {q || category ? 'No Stock Items match these filters.' : 'No Stock Items yet — promote one from a Quote Sheet, or add one below.'}
            </div>
          )}
          {items.map((item) => (
            <form
              key={item.id}
              action={updateStockItem}
              role="row"
              className={`grid ${cols} gap-2 md:items-center px-4 md:px-6 py-3 md:py-2.5 border-b-2 md:border-b border-border`}
            >
              <input type="hidden" name="id" value={item.id} />
              <div role="cell" className="space-y-1">
                <div className={mobileLabelClass}>Category</div>
                <input name="category" defaultValue={item.category} className={inputClass} />
              </div>
              <div role="cell" className="space-y-1">
                <div className={mobileLabelClass}>Material</div>
                <input name="material_name" defaultValue={item.material_name} className={inputClass} />
              </div>
              <div role="cell" className="space-y-1">
                <div className={mobileLabelClass}>Supplier</div>
                <input name="supplier" defaultValue={item.supplier} className={inputClass} />
              </div>
              <div role="cell" className="space-y-1">
                <div className={mobileLabelClass}>SKU</div>
                <input name="sku" defaultValue={item.sku ?? ''} className={dataInputClass} />
              </div>
              <div role="cell" className="space-y-1">
                <div className={mobileLabelClass}>Price</div>
                <input name="unit_price" type="number" step="0.01" defaultValue={item.unit_price} className={dataInputClass} />
              </div>
              <div role="cell" className="space-y-1">
                <div className={mobileLabelClass}>Unit</div>
                <input name="unit" defaultValue={item.unit ?? ''} className={inputClass} />
              </div>
              <div role="cell" className="space-y-1">
                <div className={mobileLabelClass}>Notes</div>
                <input name="notes" defaultValue={item.notes ?? ''} className={inputClass} />
              </div>
              <div role="cell" className="flex items-center gap-2">
                <button type="submit" className={saveButtonClass}>Save</button>
                <DeleteStockItemButton id={item.id} materialName={item.material_name} />
              </div>
            </form>
          ))}
        </div>

        <form
          action={createStockItem}
          className="grid grid-cols-1 md:grid-cols-[1fr_1.6fr_1fr_0.9fr_0.7fr_0.7fr_1.2fr_0.6fr] gap-2 items-end px-4 md:px-6 py-4"
        >
          <input name="category" required placeholder="Category" className={inputClass} />
          <input name="material_name" required placeholder="Material name" className={inputClass} />
          <input name="supplier" defaultValue="Home Depot" placeholder="Supplier" className={inputClass} />
          <input name="sku" placeholder="SKU (optional)" className={dataInputClass} />
          <input name="unit_price" type="number" step="0.01" required placeholder="Price" className={dataInputClass} />
          <input name="unit" placeholder="Unit" className={inputClass} />
          <input name="notes" placeholder="Notes" className={inputClass} />
          <button type="submit" className={addButtonClass}>Add</button>
        </form>
      </section>
    </AppShell>
  )
}
