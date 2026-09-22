'use server'

import { getSql } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireAdminOrThrow } from '@/lib/dal'

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
}

// --- Materials ---

export async function addMaterial(formData: FormData) {
  await requireAdminOrThrow()
  const sql = getSql()
  const materialName = String(formData.get('material_name'))
  const unitPrice = toNumberOrNull(formData.get('unit_price'))
  const unit = String(formData.get('unit') || 'each')
  const source = String(formData.get('source') || 'Home Depot')
  const sku = String(formData.get('sku') || '')
  const notes = String(formData.get('notes') || '')

  await sql`
    insert into cost_book_materials (material_name, unit_price, unit, source, sku, notes)
    values (${materialName}, ${unitPrice ?? 0}, ${unit}, ${source}, ${sku || null}, ${notes})
  `
  revalidatePath('/cost-book')
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

  await sql`
    update cost_book_materials
    set unit_price = ${unitPrice ?? 0}, unit = ${unit}, source = ${source}, sku = ${sku || null}, notes = ${notes}
    where id = ${id}
  `
  revalidatePath('/cost-book')
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
}
