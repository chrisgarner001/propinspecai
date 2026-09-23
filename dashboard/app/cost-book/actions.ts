'use server'

import { getSql } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireAdminOrThrow } from '@/lib/dal'
import { embedText, toVectorLiteral } from '@/lib/embeddings'

function toNumberOrNull(value: FormDataEntryValue | null): number | null {
  if (value === null || value === '') return null
  const n = Number(value)
  return Number.isNaN(n) ? null : n
}

// --- GPM Labor ---

export async function addGpmLaborRate(formData: FormData) {
  await requireAdminOrThrow()
  const sql = getSql()
  const taskName = String(formData.get('task_name'))
  const laborRate = toNumberOrNull(formData.get('labor_rate'))
  const unit = String(formData.get('unit') || 'per item')
  const notes = String(formData.get('notes') || '')

  await sql`
    insert into cost_book_gpm_labor (task_name, labor_rate, unit, notes)
    values (${taskName}, ${laborRate ?? 0}, ${unit}, ${notes})
  `
  revalidatePath('/cost-book')
  revalidatePath('/cost-book/labor')
}

export async function updateGpmLaborRate(formData: FormData) {
  await requireAdminOrThrow()
  const sql = getSql()
  const id = String(formData.get('id'))
  const laborRate = toNumberOrNull(formData.get('labor_rate'))
  const unit = String(formData.get('unit') || 'per item')
  const notes = String(formData.get('notes') || '')

  await sql`
    update cost_book_gpm_labor
    set labor_rate = ${laborRate ?? 0}, unit = ${unit}, notes = ${notes}
    where id = ${id}
  `
  revalidatePath('/cost-book')
  revalidatePath('/cost-book/labor')
}

// --- Materials ---

// Auto-creates a `suppliers` row (case-insensitive) for a `source` value
// that doesn't yet match one -- docs/designs/propinspec-cost-book-dashboard.md's
// "orphaned/unmatched source values, explicitly resolved" rule. Every
// material is always reachable from some dashboard tile; there's no
// unmatched state to design around.
async function ensureSupplierExists(source: string) {
  if (!source) return
  const sql = getSql()
  await sql`insert into suppliers (name) values (${source}) on conflict (lower(name)) do nothing`
}

export async function addMaterial(formData: FormData) {
  await requireAdminOrThrow()
  const sql = getSql()
  const materialName = String(formData.get('material_name'))
  const unitPrice = toNumberOrNull(formData.get('unit_price'))
  const unit = String(formData.get('unit') || 'each')
  const source = String(formData.get('source') || 'Home Depot')
  const sku = String(formData.get('sku') || '')
  const notes = String(formData.get('notes') || '')

  await ensureSupplierExists(source)
  await sql`
    insert into cost_book_materials (material_name, unit_price, unit, source, sku, notes)
    values (${materialName}, ${unitPrice ?? 0}, ${unit}, ${source}, ${sku || null}, ${notes})
  `
  revalidatePath('/cost-book')
  revalidatePath(`/cost-book/suppliers/${encodeURIComponent(source)}`)
}

export async function updateMaterial(formData: FormData) {
  await requireAdminOrThrow()
  const sql = getSql()
  const id = String(formData.get('id'))
  const unitPrice = toNumberOrNull(formData.get('unit_price'))
  const unit = String(formData.get('unit') || 'each')
  const source = String(formData.get('source') || 'Home Depot')
  const sku = String(formData.get('sku') || '')
  const notes = String(formData.get('notes') || '')

  await ensureSupplierExists(source)
  await sql`
    update cost_book_materials
    set unit_price = ${unitPrice ?? 0}, unit = ${unit}, source = ${source}, sku = ${sku || null}, notes = ${notes}
    where id = ${id}
  `
  revalidatePath('/cost-book')
  revalidatePath(`/cost-book/suppliers/${encodeURIComponent(source)}`)
}

// --- Suppliers (docs/designs/propinspec-cost-book-dashboard.md) ---

export async function addSupplier(formData: FormData) {
  await requireAdminOrThrow()
  const sql = getSql()
  const name = String(formData.get('name') || '').trim()
  if (!name) throw new Error('Supplier name is required.')

  const [existing] = await sql`select name from suppliers where lower(name) = lower(${name})`
  if (existing) throw new Error(`A supplier named "${existing.name}" already exists.`)

  await sql`insert into suppliers (name) values (${name})`
  revalidatePath('/cost-book')
}

// Renames a supplier and cascades to every row that referenced it by name --
// cost_book_materials.source and stock_items.supplier are both plain text,
// not FKs (Data Model), so both would silently go stale otherwise,
// reintroducing the exact fragmentation problem the case-insensitive unique
// index exists to prevent. All three writes happen in one transaction.
export async function renameSupplier(id: string, newName: string) {
  await requireAdminOrThrow()
  const sql = getSql()
  const trimmed = newName.trim()
  if (!trimmed) throw new Error('Supplier name is required.')

  const [current] = await sql`select name from suppliers where id = ${id}`
  if (!current) throw new Error('Supplier not found.')
  if (current.name === trimmed) return

  const [collision] = await sql`select name from suppliers where lower(name) = lower(${trimmed}) and id <> ${id}`
  if (collision) throw new Error(`A supplier named "${collision.name}" already exists.`)

  await sql.begin(async (tx) => {
    await tx`update cost_book_materials set source = ${trimmed} where lower(source) = lower(${current.name})`
    await tx`update stock_items set supplier = ${trimmed} where lower(supplier) = lower(${current.name})`
    await tx`update suppliers set name = ${trimmed} where id = ${id}`
  })

  revalidatePath('/cost-book')
  revalidatePath('/cost-book/stock-items')
  revalidatePath(`/cost-book/suppliers/${encodeURIComponent(current.name)}`)
  revalidatePath(`/cost-book/suppliers/${encodeURIComponent(trimmed)}`)
}

// --- Vendor Estimates ---

export async function addVendorEstimate(formData: FormData) {
  await requireAdminOrThrow()
  const sql = getSql()
  const tradeCategory = String(formData.get('trade_category'))
  const taskName = String(formData.get('task_name'))
  const estimatedCost = toNumberOrNull(formData.get('estimated_cost'))
  const notes = String(formData.get('notes') || '')

  await sql`
    insert into cost_book_vendor_estimates (trade_category, task_name, estimated_cost, notes)
    values (${tradeCategory}, ${taskName}, ${estimatedCost ?? 0}, ${notes})
  `
  revalidatePath('/cost-book')
  revalidatePath('/cost-book/labor')
}

export async function updateVendorEstimate(formData: FormData) {
  await requireAdminOrThrow()
  const sql = getSql()
  const id = String(formData.get('id'))
  const estimatedCost = toNumberOrNull(formData.get('estimated_cost'))
  const isPlaceholder = formData.get('is_placeholder') === 'on'
  const notes = String(formData.get('notes') || '')

  await sql`
    update cost_book_vendor_estimates
    set estimated_cost = ${estimatedCost ?? 0}, is_placeholder = ${isPlaceholder}, notes = ${notes}
    where id = ${id}
  `
  revalidatePath('/cost-book')
  revalidatePath('/cost-book/labor')
}

// --- Stock Items (docs/designs/propinspec-stock-items.md) ---
// Admin-gated, unlike promoteToStockItem in app/actions.ts (session-gated,
// reachable from the Quote Sheet) -- this is direct catalog curation
// (pre-seeding, fixing a bad promotion, merging a duplicate), same
// admin-only pattern as every other catalog page (Inspectors, Vendors, etc).

export async function createStockItem(formData: FormData) {
  await requireAdminOrThrow()
  const sql = getSql()
  const category = String(formData.get('category') || '').trim()
  const materialName = String(formData.get('material_name') || '').trim()
  const unitPrice = toNumberOrNull(formData.get('unit_price'))
  if (!category || !materialName || unitPrice === null) return
  const supplier = String(formData.get('supplier') || 'Home Depot')
  const sku = String(formData.get('sku') || '')
  const unit = String(formData.get('unit') || '')
  const notes = String(formData.get('notes') || '')

  const embedding = await embedText(materialName, 'RETRIEVAL_DOCUMENT')
  const literal = embedding ? toVectorLiteral(embedding) : null

  await sql`
    insert into stock_items (category, material_name, supplier, sku, unit_price, unit, notes, embedding)
    values (
      ${category}, ${materialName}, ${supplier}, ${sku || null}, ${unitPrice}, ${unit || null}, ${notes || null},
      ${literal}::vector
    )
    on conflict (lower(category), lower(material_name)) do update
    set supplier = excluded.supplier, sku = excluded.sku, unit_price = excluded.unit_price,
        unit = excluded.unit, notes = excluded.notes, embedding = excluded.embedding, updated_at = now()
  `
  revalidatePath('/cost-book/stock-items')
}

// Re-embeds only when material_name actually changed -- editing just the
// price/notes on an existing, already-matched Stock Item shouldn't cost an
// API call or risk a transient failure clearing a working embedding.
export async function updateStockItem(formData: FormData) {
  await requireAdminOrThrow()
  const sql = getSql()
  const id = String(formData.get('id'))
  const category = String(formData.get('category') || '').trim()
  const materialName = String(formData.get('material_name') || '').trim()
  const unitPrice = toNumberOrNull(formData.get('unit_price'))
  if (!category || !materialName || unitPrice === null) return
  const supplier = String(formData.get('supplier') || 'Home Depot')
  const sku = String(formData.get('sku') || '')
  const unit = String(formData.get('unit') || '')
  const notes = String(formData.get('notes') || '')

  const [existing] = await sql`select material_name from stock_items where id = ${id}`
  const nameChanged = existing && existing.material_name !== materialName

  if (nameChanged) {
    const embedding = await embedText(materialName, 'RETRIEVAL_DOCUMENT')
    const literal = embedding ? toVectorLiteral(embedding) : null
    await sql`
      update stock_items
      set category = ${category}, material_name = ${materialName}, supplier = ${supplier},
          sku = ${sku || null}, unit_price = ${unitPrice}, unit = ${unit || null}, notes = ${notes || null},
          embedding = ${literal}::vector, updated_at = now()
      where id = ${id}
    `
  } else {
    await sql`
      update stock_items
      set category = ${category}, supplier = ${supplier}, sku = ${sku || null}, unit_price = ${unitPrice},
          unit = ${unit || null}, notes = ${notes || null}, updated_at = now()
      where id = ${id}
    `
  }
  revalidatePath('/cost-book/stock-items')
}

export async function deleteStockItem(id: string) {
  await requireAdminOrThrow()
  const sql = getSql()
  await sql`delete from stock_items where id = ${id}`
  revalidatePath('/cost-book/stock-items')
}
