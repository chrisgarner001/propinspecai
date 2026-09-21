import { getSql } from './db'

// Route pattern -> "what's relevant to this page" query, one function per
// pattern (docs/designs/ai-help-widget.md, Approach C). A pathname that
// doesn't match anything returns null -- the assistant still answers
// workflow questions, it just says so if asked about specific numbers.
// Summarized here, not raw table dumps: keeps the prompt small and avoids
// leaking columns (internal ids, etc.) that don't help answer a question.

const UUID = '[0-9a-f-]{36}'

async function quoteSheetContext(inspectionId: string): Promise<string> {
  const sql = getSql()
  const [inspection] = await sql`select property_address, job_number, status from inspections where id = ${inspectionId}`
  if (!inspection) return 'This inspection no longer exists.'

  const lineItems = await sql`
    select room_area, item, assigned_to, materials_cost, labor_hours, vendor_estimated_cost, supplier, sku
    from line_items where inspection_id = ${inspectionId} and tenant_approved = false
    order by room_area, created_at
  `
  const additionalSkus = await sql`
    select li.room_area, li.item, a.supplier, a.sku, a.materials_cost, a.labor_hours
    from line_item_additional_skus a
    join line_items li on li.id = a.line_item_id
    where li.inspection_id = ${inspectionId}
  `
  const bulkMaterials = await sql`
    select supplier, sku, quantity, cost, notes from inspection_bulk_materials where inspection_id = ${inspectionId}
  `
  const [settings] = await sql`select gpm_labor_charge from settings where id = true`
  const laborRate = Number(settings?.gpm_labor_charge ?? 0)

  const lines: string[] = [
    `Property: ${inspection.property_address}, Job ${inspection.job_number}, Status: ${inspection.status}`,
    `GPM labor rate: $${laborRate.toFixed(2)}/hr`,
    '',
    'Line items (each row\'s Total = its own materials $ + labor hrs x rate, or vendor quote if Outside Vendor):',
  ]
  for (const li of lineItems as Record<string, unknown>[]) {
    const total =
      li.assigned_to === 'Outside Vendor'
        ? Number(li.vendor_estimated_cost ?? 0)
        : Number(li.materials_cost ?? 0) + Number(li.labor_hours ?? 0) * laborRate
    lines.push(
      `- ${li.room_area} / ${li.item}: assigned to ${li.assigned_to ?? 'unassigned'}, supplier=${li.supplier ?? 'none'}, sku=${li.sku ?? 'none'}, materials=$${li.materials_cost ?? 0}, labor=${li.labor_hours ?? 0}hrs, vendor_quote=$${li.vendor_estimated_cost ?? 0}, Total=$${total.toFixed(2)}`
    )
  }
  if (additionalSkus.length > 0) {
    lines.push('', 'Additional items beyond each row\'s primary Supplier/SKU:')
    for (const row of additionalSkus as Record<string, unknown>[]) {
      lines.push(`- ${row.room_area} / ${row.item}: supplier=${row.supplier ?? 'none'}, sku=${row.sku ?? 'none'}, materials=$${row.materials_cost ?? 0}, labor=${row.labor_hours ?? 0}hrs`)
    }
  }
  if (bulkMaterials.length > 0) {
    lines.push('', 'Bulk Materials (job-level, not tied to one line item):')
    for (const bm of bulkMaterials as Record<string, unknown>[]) {
      lines.push(`- ${bm.supplier ?? 'none'} ${bm.sku ?? ''}: qty=${bm.quantity ?? 'n/a'}, cost=$${bm.cost ?? 0}${bm.notes ? `, notes: ${bm.notes}` : ''}`)
    }
  }
  return lines.join('\n')
}

async function inspectionDetailContext(inspectionId: string): Promise<string> {
  const sql = getSql()
  const [inspection] = await sql`select property_address, job_number, inspector_name, status, inspection_date from inspections where id = ${inspectionId}`
  if (!inspection) return 'This inspection no longer exists.'

  const counts = await sql`
    select condition, count(*)::int as n from line_items
    where inspection_id = ${inspectionId} and tenant_approved = false
    group by condition
  `
  const countText = (counts as Record<string, unknown>[]).map((c) => `${c.condition}: ${c.n}`).join(', ')
  return [
    `Property: ${inspection.property_address}, Job ${inspection.job_number}, Inspector: ${inspection.inspector_name}, Status: ${inspection.status}`,
    `Inspection date: ${inspection.inspection_date}`,
    `Line item condition counts: ${countText || 'none yet'}`,
  ].join('\n')
}

async function chargebackReviewContext(inspectionId: string): Promise<string> {
  const sql = getSql()
  const [inspection] = await sql`select property_address, job_number from inspections where id = ${inspectionId}`
  if (!inspection) return 'This inspection no longer exists.'

  const items = await sql`
    select room_area, item, tenant_charge, tenant_charge_amount from line_items
    where inspection_id = ${inspectionId} and tenant_approved = false
    order by room_area, created_at
  `
  const total = (items as Record<string, unknown>[]).reduce((sum, li) => sum + Number(li.tenant_charge_amount ?? 0), 0)
  const lines = [
    `Property: ${inspection.property_address}, Job ${inspection.job_number}`,
    `Total tenant charge so far: $${total.toFixed(2)}`,
    '',
    'Items:',
  ]
  for (const li of items as Record<string, unknown>[]) {
    lines.push(`- ${li.room_area} / ${li.item}: tenant_charge=${li.tenant_charge ?? 'not decided'}, amount=$${li.tenant_charge_amount ?? 0}`)
  }
  return lines.join('\n')
}

async function stillsContext(inspectionId: string): Promise<string> {
  const sql = getSql()
  const [inspection] = await sql`select property_address, job_number from inspections where id = ${inspectionId}`
  if (!inspection) return 'This inspection no longer exists.'

  const [{ count }] = (await sql`
    select count(*)::int as count from line_items where inspection_id = ${inspectionId} and still_image_file is not null
  `) as unknown as { count: number }[]
  return `Property: ${inspection.property_address}, Job ${inspection.job_number}\n${count} still image(s) extracted.`
}

async function costBookContext(): Promise<string> {
  const sql = getSql()
  const [labor] = await sql`select count(*)::int as n from cost_book_gpm_labor`
  const [materials] = await sql`select count(*)::int as n from cost_book_materials`
  const [vendor] = await sql`select count(*)::int as n from cost_book_vendor_estimates`
  return `Cost Book currently has ${labor.n} GPM labor rate(s), ${materials.n} material price(s), ${vendor.n} vendor estimate(s) recorded.`
}

const ROUTES: { pattern: RegExp; fetch: (m: RegExpMatchArray) => Promise<string> }[] = [
  { pattern: new RegExp(`^/inspections/(${UUID})/quote-sheet/?$`), fetch: (m) => quoteSheetContext(m[1]) },
  { pattern: new RegExp(`^/inspections/(${UUID})/chargeback-review/?$`), fetch: (m) => chargebackReviewContext(m[1]) },
  { pattern: new RegExp(`^/inspections/(${UUID})/stills/?$`), fetch: (m) => stillsContext(m[1]) },
  { pattern: new RegExp(`^/inspections/(${UUID})/?$`), fetch: (m) => inspectionDetailContext(m[1]) },
  { pattern: /^\/cost-book\/?$/, fetch: () => costBookContext() },
]

export async function getPageContext(pathname: string): Promise<string | null> {
  for (const route of ROUTES) {
    const match = pathname.match(route.pattern)
    if (match) {
      try {
        return await route.fetch(match)
      } catch {
        return null // a context-lookup failure shouldn't break the whole question -- falls back to workflow-only
      }
    }
  }
  return null
}
