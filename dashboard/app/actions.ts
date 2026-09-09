'use server'

import { sql } from '@/lib/db'
import { revalidatePath } from 'next/cache'

function toNumberOrNull(value: FormDataEntryValue | null): number | null {
  if (value === null || value === '') return null
  const n = Number(value)
  return Number.isNaN(n) ? null : n
}

export async function updateLineItem(formData: FormData) {
  const id = String(formData.get('id'))
  const inspectionId = String(formData.get('inspection_id'))

  const materialsCost = toNumberOrNull(formData.get('materials_cost'))
  const laborCost = toNumberOrNull(formData.get('labor_cost'))
  const vendorEstimatedCost = toNumberOrNull(formData.get('vendor_estimated_cost'))
  const tenantStatusRaw = formData.get('tenant_status')
  const tenantStatus = tenantStatusRaw ? String(tenantStatusRaw) : null

  await sql`
    update line_items
    set
      materials_cost = ${materialsCost},
      labor_cost = ${laborCost},
      vendor_estimated_cost = ${vendorEstimatedCost},
      tenant_status = ${tenantStatus}
    where id = ${id}
  `

  revalidatePath(`/inspections/${inspectionId}`)
}

export async function addLineItem(formData: FormData) {
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
