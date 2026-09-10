'use server'

import { getSql } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

function toNumberOrNull(value: FormDataEntryValue | null): number | null {
  if (value === null || value === '') return null
  const n = Number(value)
  return Number.isNaN(n) ? null : n
}

export async function bulkUpdateLineItems(formData: FormData) {
  const sql = getSql()
  const inspectionId = String(formData.get('inspection_id'))
  const ids = formData.getAll('ids').map(String)

  const [settings] = await sql`select gpm_labor_charge from settings where id = true`
  const laborRate = Number(settings?.gpm_labor_charge ?? 0)

  for (const id of ids) {
    const materialsCost = toNumberOrNull(formData.get(`materials_cost__${id}`))
    const laborHours = toNumberOrNull(formData.get(`labor_hours__${id}`))
    const laborCost = laborHours !== null ? laborHours * laborRate : null
    const vendorEstimatedCost = toNumberOrNull(formData.get(`vendor_estimated_cost__${id}`))
    const tenantStatusRaw = formData.get(`tenant_status__${id}`)
    const tenantStatus = tenantStatusRaw ? String(tenantStatusRaw) : null
    const vendorIdRaw = formData.get(`vendor_id__${id}`)
    const vendorId = vendorIdRaw ? String(vendorIdRaw) : null

    await sql`
      update line_items
      set
        materials_cost = ${materialsCost},
        labor_hours = ${laborHours},
        labor_cost = ${laborCost},
        vendor_estimated_cost = ${vendorEstimatedCost},
        tenant_status = ${tenantStatus},
        vendor_id = ${vendorId}
      where id = ${id}
    `
  }

  revalidatePath(`/inspections/${inspectionId}`)
}

export async function addLineItem(formData: FormData) {
  const sql = getSql()
  const inspectionId = String(formData.get('inspection_id'))
  const roomArea = String(formData.get('room_area'))
  const item = String(formData.get('item'))
  const condition = String(formData.get('condition'))
  const assignedToRaw = formData.get('assigned_to')
  const assignedTo = assignedToRaw ? String(assignedToRaw) : null
  const recommendedAction = String(formData.get('recommended_action') || '')

  await sql`
    insert into line_items (inspection_id, room_area, item, condition, assigned_to, recommended_action, is_manual_addition)
    values (${inspectionId}, ${roomArea}, ${item}, ${condition}, ${assignedTo}, ${recommendedAction}, true)
  `

  revalidatePath(`/inspections/${inspectionId}`)
}

export async function createInspection(formData: FormData) {
  const sql = getSql()
  const jobNumber = String(formData.get('job_number'))
  const propertyAddress = String(formData.get('property_address'))
  const inspectionDate = String(formData.get('inspection_date'))
  const inspectorName = String(formData.get('inspector_name'))

  const [row] = await sql`
    insert into inspections (job_number, property_address, inspection_date, inspector_name)
    values (${jobNumber}, ${propertyAddress}, ${inspectionDate}, ${inspectorName})
    returning id
  `

  revalidatePath('/')
  redirect(`/inspections/${row.id}`)
}

export async function markExported(formData: FormData) {
  const sql = getSql()
  const inspectionId = String(formData.get('inspection_id'))

  await sql`update inspections set status = 'exported' where id = ${inspectionId}`

  revalidatePath(`/inspections/${inspectionId}`)
  revalidatePath('/')
}

export async function markUnderReview(formData: FormData) {
  const sql = getSql()
  const inspectionId = String(formData.get('inspection_id'))

  await sql`update inspections set status = 'pending_review' where id = ${inspectionId}`

  revalidatePath(`/inspections/${inspectionId}`)
  revalidatePath('/')
}

export async function updateSettings(formData: FormData) {
  const sql = getSql()
  const gpmLaborCharge = toNumberOrNull(formData.get('gpm_labor_charge')) ?? 0
  const materialMarkupPct = toNumberOrNull(formData.get('material_markup_pct')) ?? 0
  const vendorMarkupPct = toNumberOrNull(formData.get('vendor_markup_pct')) ?? 0

  await sql`
    update settings
    set
      gpm_labor_charge = ${gpmLaborCharge},
      material_markup_pct = ${materialMarkupPct},
      vendor_markup_pct = ${vendorMarkupPct}
    where id = true
  `

  revalidatePath('/setup')
}
