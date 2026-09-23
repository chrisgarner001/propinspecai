import { getSql } from '@/lib/db'
import { requireAdmin } from '@/lib/dal'
import { notFound } from 'next/navigation'
import { addMaterial, updateMaterial } from '@/app/cost-book/actions'
import AppShell from '@/app/components/AppShell'

export const dynamic = 'force-dynamic'

type Material = {
  id: string
  material_name: string
  unit_price: string
  unit: string
  source: string
  sku: string | null
  notes: string | null
  purchase_count: number | null
  price_min: string | null
  price_max: string | null
}

type CategoryCount = { label: string; value: string; count: number }

const UNCATEGORIZED = 'none'

function categoryLink(base: string, params: { department?: string; cls?: string; subcls?: string; q?: string }) {
  const sp = new URLSearchParams()
  if (params.q) sp.set('q', params.q)
  if (params.department) sp.set('department', params.department)
  if (params.cls) sp.set('class', params.cls)
  if (params.subcls) sp.set('subclass', params.subcls)
  const qs = sp.toString()
  return qs ? `${base}?${qs}` : base
}

const inputClass = 'border border-border rounded-[var(--radius-sm)] px-2 py-1.5 w-full min-w-0 bg-surface'
const dataInputClass = `data-mono ${inputClass}`
const saveButtonClass =
  'bg-accent hover:bg-accent-hover text-white rounded-[var(--radius-sm)] px-3 py-1 text-[12px] font-semibold w-fit'
const addButtonClass =
  'bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-2 text-[12px] font-semibold w-fit'
const emptyRowClass = 'px-3 py-3 text-[13px] text-text-muted italic'
const mobileLabelClass = 'md:hidden text-[10px] font-semibold uppercase tracking-wide text-text-muted'
const materialCols = 'grid-cols-1 md:grid-cols-[1.6fr_0.7fr_0.7fr_0.9fr_1.6fr_0.6fr]'

// Per-supplier sub-book (docs/designs/propinspec-cost-book-dashboard.md):
// the Materials section from the old single /cost-book page, scoped to one
// supplier via a case-insensitive `source` match instead of showing every
// supplier's rows on one page. Search/Department/Class/Subclass drill-down
// logic is unchanged -- it's supplier-agnostic text filtering, not
// Home-Depot-specific, even though those columns happen to be populated
// from Home Depot's own taxonomy today.
export default async function SupplierMaterialsPage({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>
  searchParams: Promise<{ q?: string; department?: string; class?: string; subclass?: string }>
}) {
  await requireAdmin()
  const { name: rawName } = await params
  const supplierName = decodeURIComponent(rawName)
  const sp = await searchParams
  const q = sp.q?.trim() || undefined
  const department = sp.department || undefined
  const cls = sp.class || undefined
  const subcls = sp.subclass || undefined
  const sql = getSql()

  const [supplier] = await sql`select name from suppliers where lower(name) = lower(${supplierName})`
  if (!supplier) notFound()
  const canonicalName: string = supplier.name

  let where = sql`and lower(source) = lower(${canonicalName})`
  if (q) {
    const like = `%${q}%`
    where = sql`${where} and (material_name ilike ${like} or sku ilike ${like} or department_name ilike ${like} or class_name ilike ${like} or subclass_name ilike ${like})`
  }
  if (department) {
    where = department === UNCATEGORIZED ? sql`${where} and department_name is null` : sql`${where} and department_name = ${department}`
  }
  if (cls) {
    where = cls === UNCATEGORIZED ? sql`${where} and class_name is null` : sql`${where} and class_name = ${cls}`
  }
  if (subcls) {
    where = subcls === UNCATEGORIZED ? sql`${where} and subclass_name is null` : sql`${where} and subclass_name = ${subcls}`
  }

  const materials = (await sql`
    select * from cost_book_materials
    where true ${where}
    order by last_purchased_date desc nulls last, material_name
    limit 200
  `) as unknown as Material[]

  const departments = (await sql`
    select coalesce(department_name, ${UNCATEGORIZED}) as value, coalesce(department_name, 'Uncategorized') as label, count(*)::int as count
    from cost_book_materials
    where lower(source) = lower(${canonicalName})
    group by department_name
    order by count desc
  `) as unknown as CategoryCount[]

  const classes = department
    ? ((await sql`
        select coalesce(class_name, ${UNCATEGORIZED}) as value, coalesce(class_name, 'Uncategorized') as label, count(*)::int as count
        from cost_book_materials
        where lower(source) = lower(${canonicalName})
          and ${department === UNCATEGORIZED ? sql`department_name is null` : sql`department_name = ${department}`}
        group by class_name
        order by count desc
      `) as unknown as CategoryCount[])
    : []

  const subclasses = department && cls
    ? ((await sql`
        select coalesce(subclass_name, ${UNCATEGORIZED}) as value, coalesce(subclass_name, 'Uncategorized') as label, count(*)::int as count
        from cost_book_materials
        where lower(source) = lower(${canonicalName})
          and ${department === UNCATEGORIZED ? sql`department_name is null` : sql`department_name = ${department}`}
          and ${cls === UNCATEGORIZED ? sql`class_name is null` : sql`class_name = ${cls}`}
        group by subclass_name
        order by count desc
      `) as unknown as CategoryCount[])
    : []

  const selectedDepartmentLabel = department ? departments.find((d) => d.value === department)?.label ?? department : null
  const selectedClassLabel = cls ? classes.find((c) => c.value === cls)?.label ?? cls : null
  const basePath = `/cost-book/suppliers/${encodeURIComponent(canonicalName)}`

  return (
    <AppShell active="/cost-book" title={`Cost Book — ${canonicalName}`}>
      <p className="px-4 md:px-6 pt-5 text-[13px] text-text-muted max-w-2xl">
        Materials sourced from {canonicalName}. Browse by Department/Class/Subclass on the left, or search across all
        of it.
      </p>
      <section className="border-t border-border mt-5">
        <form method="get" className="px-4 md:px-6 py-3 flex items-center gap-2 flex-wrap">
          {department && <input type="hidden" name="department" value={department} />}
          {cls && <input type="hidden" name="class" value={cls} />}
          {subcls && <input type="hidden" name="subclass" value={subcls} />}
          <input
            type="search"
            name="q"
            defaultValue={q ?? ''}
            placeholder="Search by name, SKU, or category…"
            className={`${inputClass} max-w-md`}
          />
          <button type="submit" className={addButtonClass}>Search</button>
          {(q || department) && (
            <a href={basePath} className="text-[12px] text-accent underline decoration-accent/40">
              Clear all filters
            </a>
          )}
        </form>

        {department && (
          <div className="px-4 md:px-6 pb-3 text-[12px] text-text-muted flex flex-wrap items-center gap-1.5">
            <a href={categoryLink(basePath, { q })} className="text-accent underline decoration-accent/40">
              All Departments
            </a>
            <span>/</span>
            <a
              href={categoryLink(basePath, { q, department })}
              className={cls ? 'text-accent underline decoration-accent/40' : 'font-semibold text-text'}
            >
              {selectedDepartmentLabel}
            </a>
            {cls && (
              <>
                <span>/</span>
                <a
                  href={categoryLink(basePath, { q, department, cls })}
                  className={subcls ? 'text-accent underline decoration-accent/40' : 'font-semibold text-text'}
                >
                  {selectedClassLabel}
                </a>
              </>
            )}
            {subcls && (
              <>
                <span>/</span>
                <span className="font-semibold text-text">
                  {subclasses.find((s) => s.value === subcls)?.label ?? subcls}
                </span>
              </>
            )}
          </div>
        )}

        <div className="md:flex md:items-start">
          <nav className="shrink-0 md:w-[220px] px-4 md:px-6 pb-4 md:pb-6 md:border-r border-border" aria-label="Material categories">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-2">Departments</div>
            {departments.length === 0 && <div className="text-[12px] text-text-muted italic">No materials yet.</div>}
            <ul className="space-y-0.5">
              {departments.map((d) => {
                const deptActive = department === d.value
                return (
                  <li key={d.value}>
                    <a
                      href={categoryLink(basePath, { q, department: d.value })}
                      className={`flex items-center justify-between gap-2 px-2 py-1 rounded-[var(--radius-sm)] text-[13px] ${
                        deptActive ? 'bg-accent/10 text-accent font-semibold' : 'hover:bg-surface-alt'
                      }`}
                    >
                      <span className="truncate">{d.label}</span>
                      <span className="text-[11px] text-text-muted font-normal shrink-0">{d.count}</span>
                    </a>
                    {deptActive && classes.length > 0 && (
                      <ul className="ml-3 mt-0.5 mb-1 space-y-0.5 border-l border-border pl-2">
                        {classes.map((c) => {
                          const classActive = cls === c.value
                          return (
                            <li key={c.value}>
                              <a
                                href={categoryLink(basePath, { q, department: d.value, cls: c.value })}
                                className={`flex items-center justify-between gap-2 px-2 py-1 rounded-[var(--radius-sm)] text-[12px] ${
                                  classActive ? 'bg-accent/10 text-accent font-semibold' : 'hover:bg-surface-alt text-text-muted'
                                }`}
                              >
                                <span className="truncate">{c.label}</span>
                                <span className="text-[11px] text-text-muted font-normal shrink-0">{c.count}</span>
                              </a>
                              {classActive && subclasses.length > 0 && (
                                <ul className="ml-3 mt-0.5 mb-1 space-y-0.5 border-l border-border pl-2">
                                  {subclasses.map((s) => (
                                    <li key={s.value}>
                                      <a
                                        href={categoryLink(basePath, { q, department: d.value, cls: c.value, subcls: s.value })}
                                        className={`flex items-center justify-between gap-2 px-2 py-1 rounded-[var(--radius-sm)] text-[11px] ${
                                          subcls === s.value
                                            ? 'bg-accent/10 text-accent font-semibold'
                                            : 'hover:bg-surface-alt text-text-muted'
                                        }`}
                                      >
                                        <span className="truncate">{s.label}</span>
                                        <span className="text-[11px] text-text-muted font-normal shrink-0">{s.count}</span>
                                      </a>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          </nav>

          <div className="flex-1 min-w-0">
            <div role="table">
              <div role="row" className={`hidden md:grid ${materialCols} gap-2 px-4 md:px-6 py-2 border-y border-border`}>
                {['Material', 'Price', 'Unit', 'SKU', 'Notes', ''].map((h) => (
                  <div key={h} role="columnheader" className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                    {h}
                  </div>
                ))}
              </div>
              {materials.length === 0 && (
                <div className={emptyRowClass}>
                  {q || department
                    ? 'No materials match these filters.'
                    : `No materials yet — add one below, or promote one from the Quote Sheet.`}
                </div>
              )}
              {materials.map((m) => (
                <form
                  key={m.id}
                  action={updateMaterial}
                  role="row"
                  className={`grid ${materialCols} gap-2 md:items-center px-4 md:px-6 py-3 md:py-2.5 border-b-2 md:border-b border-border`}
                >
                  <input type="hidden" name="id" value={m.id} />
                  <input type="hidden" name="source" value={m.source} />
                  <div role="cell" className="font-medium">
                    {m.material_name}
                    {m.purchase_count !== null && (
                      <div className="text-[11px] text-text-muted font-normal">
                        Purchased {m.purchase_count}×
                        {m.price_min !== null && m.price_max !== null && m.price_min !== m.price_max
                          ? ` · $${m.price_min}–$${m.price_max}`
                          : ''}
                      </div>
                    )}
                  </div>
                  <div role="cell" className="space-y-1">
                    <div className={mobileLabelClass}>Price</div>
                    <input name="unit_price" type="number" step="0.01" defaultValue={m.unit_price} className={dataInputClass} />
                  </div>
                  <div role="cell" className="space-y-1">
                    <div className={mobileLabelClass}>Unit</div>
                    <input name="unit" defaultValue={m.unit} className={inputClass} />
                  </div>
                  <div role="cell" className="space-y-1">
                    <div className={mobileLabelClass}>SKU</div>
                    <input name="sku" defaultValue={m.sku ?? ''} className={`data-mono ${inputClass}`} />
                  </div>
                  <div role="cell" className="space-y-1">
                    <div className={mobileLabelClass}>Notes</div>
                    <input name="notes" defaultValue={m.notes ?? ''} className={inputClass} />
                  </div>
                  <div role="cell">
                    <button type="submit" className={saveButtonClass}>Save</button>
                  </div>
                </form>
              ))}
            </div>
            <form action={addMaterial} className="grid grid-cols-1 md:grid-cols-[1.6fr_0.7fr_0.7fr_0.9fr_0.6fr] gap-2 items-end px-4 md:px-6 py-4">
              <input type="hidden" name="source" value={canonicalName} />
              <input name="material_name" required placeholder="Material name" className={inputClass} />
              <input name="unit_price" type="number" step="0.01" required placeholder="Price" className={dataInputClass} />
              <input name="unit" defaultValue="each" placeholder="Unit" className={inputClass} />
              <input name="sku" placeholder="SKU (optional)" className={`data-mono ${inputClass}`} />
              <button type="submit" className={addButtonClass}>Add</button>
            </form>
          </div>
        </div>
      </section>
    </AppShell>
  )
}
