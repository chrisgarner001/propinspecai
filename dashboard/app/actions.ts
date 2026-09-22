'use server'

import { getSql } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { parseFolderIdFromUrl, listVideosInFolder, downloadDriveFile } from '@/lib/google'
import { extractLineItemsFromVideo } from '@/lib/gemini'
import { parseTimestampSeconds, extractFrame, uploadStill, getVideoCreationTime } from '@/lib/stills'
import { askHelpAssistant, type HelpMessage } from '@/lib/helpAssistant'
import { getPageContext } from '@/lib/helpContext'
import { writeFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { requireSessionOrThrow, requireAdminOrThrow } from '@/lib/dal'
import { embedText, toVectorLiteral } from '@/lib/embeddings'

function toNumberOrNull(value: FormDataEntryValue | null): number | null {
  if (value === null || value === '') return null
  const n = Number(value)
  return Number.isNaN(n) ? null : n
}

// Assigned To / Materials / Labor / Vendor Est. used to be editable from this
// page's table too, until the reviewer pointed out cost assignment already
// happens on the Quote Sheet page and asked for these removed here entirely
// (2026-09-20) -- removing the SET clauses below, not just the form inputs,
// matters: this action ran unconditionally on every save, and with the
// inputs gone but the columns still being written, every save from this page
// would have silently wiped assigned_to/materials_cost/labor_hours/
// labor_cost/vendor_estimated_cost/vendor_id to null on every line item.
//
// "Remove from Quote Sheet" (tenant_approved) moved OFF this page and onto
// the Quote Sheet itself (2026-09-22 feedback: it's a Quote Sheet concept,
// doesn't belong at the initial-review stage) -- this action no longer
// touches that column at all, so whatever the Quote Sheet last set stays
// untouched by a save here. "Tenant Chargeback" (tenant_charge) replaces it
// in this page's own table instead, letting the reviewer flag a chargeback
// candidate during the very first pass instead of only in Chargeback Review.
export async function bulkUpdateLineItems(formData: FormData) {
  await requireSessionOrThrow()
  const sql = getSql()
  const inspectionId = String(formData.get('inspection_id'))
  const ids = formData.getAll('ids').map(String)

  for (const id of ids) {
    if (formData.get(`remove__${id}`) === '1') {
      await sql`delete from line_items where id = ${id}`
      continue
    }

    const roomArea = String(formData.get(`room_area__${id}`) ?? '')
    const item = String(formData.get(`item__${id}`) ?? '')
    const condition = String(formData.get(`condition__${id}`) ?? '')
    const recommendedAction = String(formData.get(`recommended_action__${id}`) ?? '')
    const observedEvidenceRaw = formData.get(`observed_evidence__${id}`)
    const observedEvidence = observedEvidenceRaw ? String(observedEvidenceRaw) : null
    const tenantCharge = formData.get(`tenant_charge__${id}`) !== null

    await sql`
      update line_items
      set
        room_area = ${roomArea},
        item = ${item},
        condition = ${condition},
        recommended_action = ${recommendedAction},
        observed_evidence = ${observedEvidence},
        tenant_charge = ${tenantCharge}
      where id = ${id}
    `
  }

  revalidatePath(`/inspections/${inspectionId}`)
}

// Saves the standalone Tenant Chargeback Review screen
// (app/inspections/[id]/chargeback-review) -- touches ONLY tenant_charge,
// tenant_charge_amount, and tenant_charge_description, unlike
// bulkUpdateLineItems above, so a senior PM can make the tenant-charge call
// fast against the 30-day security-deposit disposition deadline without
// wading through (or accidentally clobbering) the AI-extraction/Quote-Sheet
// fields this page doesn't even show.
//
// tenant_charge_description (2026-09-22 feedback) is a genuinely separate
// piece of text from item/observed_evidence/recommended_action -- the
// Quote Sheet needs "paint bedroom", the tenant charge needs "paint
// bedroom -- tenant painted without permission, coverage poor, requires
// wall prep/primer/two coats." Only submitted (and only rendered as an
// input) while its row's own "Tenant Charge" checkbox is checked
// (TenantChargeInput), so unchecking a chargeback also clears its
// description, matching tenant_charge_amount's existing clear-on-uncheck
// behavior -- a stale chargeback description for an item that's no longer
// being charged has no legitimate use.
export async function updateChargebackReview(formData: FormData) {
  await requireSessionOrThrow()
  const sql = getSql()
  const inspectionId = String(formData.get('inspection_id'))
  const ids = formData.getAll('ids').map(String)

  for (const id of ids) {
    const tenantCharge = formData.get(`tenant_charge__${id}`) !== null
    const tenantChargeAmount = toNumberOrNull(formData.get(`tenant_charge_amount__${id}`))
    const tenantChargeDescriptionRaw = formData.get(`tenant_charge_description__${id}`)
    const tenantChargeDescription = tenantChargeDescriptionRaw ? String(tenantChargeDescriptionRaw).trim() || null : null

    await sql`
      update line_items
      set tenant_charge = ${tenantCharge}, tenant_charge_amount = ${tenantChargeAmount}, tenant_charge_description = ${tenantChargeDescription}
      where id = ${id}
    `
  }

  revalidatePath(`/inspections/${inspectionId}/chargeback-review`)
  revalidatePath(`/inspections/${inspectionId}/move-out-report`)
}

// STAND-IN for the real PropertyWare integration -- same situation as
// sendBatchToPW below: there's no PW API access/docs available yet to
// actually attach the generated Move-Out Report PDF to the tenant's file in
// PropertyWare. Records a manually-typed PW reference against the
// inspection instead (the reviewer posts the PDF to PW themselves and
// pastes back its reference here), which still gives a real audit trail of
// who posted what and when. Swap in the real API call here once PW
// credentials/docs exist; the caller (chargeback-review page) can keep the
// same "type a reference, submit" shape, or drop it once posting is fully
// automated.
export async function postMoveOutReport(inspectionId: string, formData: FormData) {
  await requireSessionOrThrow()
  const sql = getSql()
  const pwReference = String(formData.get('pw_reference') ?? '').trim()
  if (!pwReference) return

  await sql`
    update inspections
    set move_out_report_posted_at = now(), move_out_report_pw_reference = ${pwReference}
    where id = ${inspectionId}
  `

  revalidatePath(`/inspections/${inspectionId}/chargeback-review`)
}

// Saves edits made in the Quote Sheet editor (app/inspections/[id]/quote-sheet).
// A distinct action from bulkUpdateLineItems above -- that one deliberately
// keeps room_area/item read-only (edited in-place would desync the video
// timestamp mapping and the room quick-jump anchors on the main inspection
// page); this page's whole purpose is polishing the item text before it goes
// to the owner, so those two fields ARE editable here.
//
// "Remove from Quote Sheet" (tenant_approved) now lives exclusively on this
// page (2026-09-22 feedback) -- it used to be a checkbox on the inspection
// detail page, which doesn't affect anything a reviewer can see from there.
// This page's own line-item query already filters tenant_approved = false,
// so checking the box and saving makes the row disappear from this exact
// list on the next load -- the control and its visible effect are finally
// on the same screen.
export async function updateQuoteSheetItems(formData: FormData) {
  await requireSessionOrThrow()
  const sql = getSql()
  const inspectionId = String(formData.get('inspection_id'))
  const ids = formData.getAll('ids').map(String)

  const [settings] = await sql`select gpm_labor_charge from settings where id = true`
  const laborRate = Number(settings?.gpm_labor_charge ?? 0)

  for (const id of ids) {
    if (formData.get(`remove__${id}`) === '1') {
      await sql`delete from line_items where id = ${id}`
      continue
    }

    const roomArea = String(formData.get(`room_area__${id}`) ?? '')
    const item = String(formData.get(`item__${id}`) ?? '')
    const observedEvidenceRaw = formData.get(`observed_evidence__${id}`)
    const observedEvidence = observedEvidenceRaw ? String(observedEvidenceRaw) : null
    const recommendedAction = String(formData.get(`recommended_action__${id}`) ?? '')
    const assignedToRaw = formData.get(`assigned_to__${id}`)
    const assignedTo = assignedToRaw ? String(assignedToRaw) : null
    const vendorIdRaw = formData.get(`vendor_id__${id}`)
    const vendorId = vendorIdRaw ? String(vendorIdRaw) : null
    const laborHours = toNumberOrNull(formData.get(`labor_hours__${id}`))
    const laborCost = laborHours !== null ? laborHours * laborRate : null
    const materialsCost = toNumberOrNull(formData.get(`materials_cost__${id}`))
    const vendorEstimatedCost = toNumberOrNull(formData.get(`vendor_estimated_cost__${id}`))
    const stageIdRaw = formData.get(`stage_id__${id}`)
    const stageId = stageIdRaw ? String(stageIdRaw) : null
    const supplierRaw = formData.get(`supplier__${id}`)
    const supplier = supplierRaw ? String(supplierRaw) : null
    const skuRaw = formData.get(`sku__${id}`)
    const sku = skuRaw ? String(skuRaw) : null
    const skuQuantityRaw = formData.get(`sku_quantity__${id}`)
    const skuQuantity = skuQuantityRaw ? String(skuQuantityRaw) : null
    const tenantApproved = formData.get(`tenant_approved__${id}`) !== null

    await sql`
      update line_items
      set
        room_area = ${roomArea},
        item = ${item},
        observed_evidence = ${observedEvidence},
        recommended_action = ${recommendedAction},
        assigned_to = ${assignedTo},
        vendor_id = ${vendorId},
        labor_hours = ${laborHours},
        labor_cost = ${laborCost},
        materials_cost = ${materialsCost},
        vendor_estimated_cost = ${vendorEstimatedCost},
        stage_id = ${stageId},
        supplier = ${supplier},
        sku = ${sku},
        sku_quantity = ${skuQuantity},
        tenant_approved = ${tenantApproved}
      where id = ${id}
    `
  }

  revalidatePath(`/inspections/${inspectionId}/quote-sheet`)
}

export type CreateBatchesResult = {
  batchesCreated: number
  skippedNoStage: number
  skippedNoVendor: number
  skippedOtherAssignment: number
  skippedUnassigned: number
}

// Auto-fills batch_number for whichever staged line items don't have one
// yet, grouped by (Stage, Assigned To / Vendor): one new batch number per
// distinct Stage for GPM Staff items, and one new batch number per distinct
// (Stage, Vendor) pair for Outside Vendor items that already have a vendor
// picked. The same vendor doing work across two different Stages gets two
// separate batches, not one -- each batch is a single work order for a
// single stage of the turn. Items with no Stage set yet, assigned to
// "Other", left unassigned, or "Outside Vendor" with no vendor chosen are
// left unbatched -- there's no sensible single batch to put them in.
//
// Deliberately never touches an item that already has a batch_number -- a
// reviewer can still freely reassign/split items on the Quote Sheet by
// clearing batch_number directly in the DB if needed; re-running this
// button must not clobber existing batches.
//
// Returns real counts instead of just revalidating and returning nothing
// (2026-09-22 feedback: a real bug report -- "Create Stages" appeared to do
// nothing on an inspection where every remaining item was missing a Stage
// or a vendor, which is indistinguishable from broken with zero feedback).
// Called directly from a client component (CreateBatchesButton) via
// useTransition, not a plain form action, specifically so that result can
// be shown.
export async function createBatches(inspectionId: string): Promise<CreateBatchesResult> {
  await requireSessionOrThrow()
  const sql = getSql()

  const items = await sql`
    select id, stage_id, assigned_to, vendor_id from line_items
    where inspection_id = ${inspectionId} and tenant_approved = false and batch_number is null
  `

  const gpmGroups = new Map<string, string[]>()
  const vendorGroups = new Map<string, string[]>()
  let skippedNoStage = 0
  let skippedNoVendor = 0
  let skippedOtherAssignment = 0
  let skippedUnassigned = 0

  for (const li of items) {
    if (li.stage_id === null) {
      skippedNoStage++
    } else if (li.assigned_to === 'GPM Staff') {
      if (!gpmGroups.has(li.stage_id)) gpmGroups.set(li.stage_id, [])
      gpmGroups.get(li.stage_id)!.push(li.id)
    } else if (li.assigned_to === 'Outside Vendor') {
      if (li.vendor_id !== null) {
        const key = `${li.stage_id}:${li.vendor_id}`
        if (!vendorGroups.has(key)) vendorGroups.set(key, [])
        vendorGroups.get(key)!.push(li.id)
      } else {
        skippedNoVendor++
      }
    } else if (li.assigned_to === 'Other') {
      skippedOtherAssignment++
    } else {
      skippedUnassigned++
    }
  }

  let batchesCreated = 0
  if (gpmGroups.size > 0 || vendorGroups.size > 0) {
    const [{ max }] = await sql`select max(batch_number) as max from line_items where inspection_id = ${inspectionId}`
    let nextBatch = (max ?? 0) + 1

    for (const ids of gpmGroups.values()) {
      await sql`update line_items set batch_number = ${nextBatch} where id in ${sql(ids)}`
      nextBatch++
      batchesCreated++
    }
    for (const ids of vendorGroups.values()) {
      await sql`update line_items set batch_number = ${nextBatch} where id in ${sql(ids)}`
      nextBatch++
      batchesCreated++
    }
  }

  revalidatePath(`/inspections/${inspectionId}`)
  revalidatePath(`/inspections/${inspectionId}/quote-sheet`)
  revalidatePath(`/inspections/${inspectionId}/quote-sheet/stages`)

  return { batchesCreated, skippedNoStage, skippedNoVendor, skippedOtherAssignment, skippedUnassigned }
}

// STAND-IN for the real PropertyWare integration -- there's no PW API
// access/docs available yet (see quote-sheet/stages/page.tsx). Records a
// manually-typed PW work order number against this batch instead of
// actually calling PropertyWare's API. Swapping in the real call later
// means replacing the body of this function; callers/UI stay the same.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by the .bind(null, inspectionId, batchNumber) call site; formAction always passes the triggering form's FormData last
export async function sendBatchToPW(inspectionId: string, batchNumber: number, formData: FormData) {
  await requireSessionOrThrow()
  const sql = getSql()
  const pwWorkOrderNumber = String(formData.get('pw_work_order_number') ?? '').trim()
  if (!pwWorkOrderNumber) return

  await sql`
    insert into work_order_batches (inspection_id, batch_number, pw_work_order_number, sent_to_pw_at)
    values (${inspectionId}, ${batchNumber}, ${pwWorkOrderNumber}, now())
    on conflict (inspection_id, batch_number)
    do update set pw_work_order_number = excluded.pw_work_order_number, sent_to_pw_at = excluded.sent_to_pw_at
  `

  revalidatePath(`/inspections/${inspectionId}/quote-sheet/stages`)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by the .bind(null, id, inspectionId) call site; formAction always passes the triggering form's FormData last
export async function duplicateLineItem(id: string, inspectionId: string, _formData: FormData) {
  await requireSessionOrThrow()
  const sql = getSql()

  const [original] = await sql`select * from line_items where id = ${id}`
  if (!original) return

  // created_at nudged forward 1ms so the duplicate sorts immediately after
  // the original in the (room_area, created_at) list ordering, directly
  // below it, rather than at the end of the room group.
  //
  // status/scheduled_start/scheduled_end/blocks_line_item_id/batch_number are
  // deliberately OMITTED here, not copied from `original` -- a duplicate is
  // a distinct, newly-noticed task and should start not_started/unscheduled/
  // unbatched, not inherit the original's job-tracking or dispatch state.
  // New line_items columns need a deliberate decision here, not silent
  // inheritance via SELECT *. excluded_from_quote_sheet is likewise omitted
  // (defaults to false) for the same reason -- a duplicate should appear in
  // the Quote Sheet even if the original was excluded from it. stage_id and
  // supplier/sku/sku_quantity ARE copied, unlike those: a duplicate exists
  // because the same repair needs a second instance, which usually means the
  // same Stage and the same materials source (including quantity) as a
  // starting point. sku_quantity was omitted here until 2026-09-20 -- a real
  // gap this exact pattern warns about (added in migration 0023, after this
  // function was last written) -- silently dropping it on every duplicate.
  await sql`
    insert into line_items (
      inspection_id, room_area, item, condition, observed_evidence, assigned_to,
      trade_category, recommended_action, priority, materials_cost, labor_hours,
      labor_cost, vendor_estimated_cost, tenant_charge, tenant_charge_amount, tenant_approved, is_manual_addition,
      source_timestamp, source_video_file, source_video_drive_file_id, still_image_file, captured_at, vendor_id,
      stage_id, supplier, sku, sku_quantity, created_at
    )
    values (
      ${original.inspection_id}, ${original.room_area}, ${original.item}, ${original.condition},
      ${original.observed_evidence}, ${original.assigned_to}, ${original.trade_category},
      ${original.recommended_action}, ${original.priority}, ${original.materials_cost},
      ${original.labor_hours}, ${original.labor_cost}, ${original.vendor_estimated_cost},
      ${original.tenant_charge}, ${original.tenant_charge_amount}, ${original.tenant_approved}, true,
      ${original.source_timestamp}, ${original.source_video_file}, ${original.source_video_drive_file_id}, ${original.still_image_file}, ${original.captured_at},
      ${original.vendor_id}, ${original.stage_id}, ${original.supplier}, ${original.sku}, ${original.sku_quantity},
      ${original.created_at}::timestamptz + interval '1 millisecond'
    )
  `

  revalidatePath(`/inspections/${inspectionId}`)
  revalidatePath(`/inspections/${inspectionId}/quote-sheet`)
}

// Additional Supplier/SKU rows beyond a line item's primary supplier/sku
// (0016) -- for a repair that needs more than one part. An immediate action
// (like duplicateLineItem above), not part of updateQuoteSheetItems' bulk
// save: the number of these rows per item is dynamic, and parsing a
// variable-length list back out of one big form's FormData is real added
// complexity a plain insert-now button avoids entirely.
export async function addLineItemSku(lineItemId: string, inspectionId: string, formData: FormData) {
  await requireSessionOrThrow()
  const sql = getSql()
  const supplier = String(formData.get(`new_sku_supplier__${lineItemId}`) ?? '').trim() || null
  const sku = String(formData.get(`new_sku__${lineItemId}`) ?? '').trim() || null
  const quantity = String(formData.get(`new_sku_quantity__${lineItemId}`) ?? '').trim() || null
  const materialsCost = toNumberOrNull(formData.get(`new_sku_materials_cost__${lineItemId}`))
  const laborHours = toNumberOrNull(formData.get(`new_sku_labor_hours__${lineItemId}`))
  if (!supplier && !sku) return

  await sql`
    insert into line_item_additional_skus (line_item_id, supplier, sku, quantity, materials_cost, labor_hours)
    values (${lineItemId}, ${supplier}, ${sku}, ${quantity}, ${materialsCost}, ${laborHours})
  `

  revalidatePath(`/inspections/${inspectionId}/quote-sheet`)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by the .bind(null, id, inspectionId) call site; formAction always passes the triggering form's FormData last
export async function removeLineItemSku(id: string, inspectionId: string, _formData: FormData) {
  await requireSessionOrThrow()
  const sql = getSql()
  await sql`delete from line_item_additional_skus where id = ${id}`
  revalidatePath(`/inspections/${inspectionId}/quote-sheet`)
}

// The "duplicated blank box" version of Add Item (AddLineItemSku.tsx): fills
// a new additional-SKU row from a picked Bulk Material instead of typed
// text, the same choice linkLineItemToBulkMaterial already gives the
// line item's own primary Supplier/SKU. Called directly from a client
// component, not a form -- a plain object arg like updateLineItemSchedule,
// not FormData, since there's no form to read it from.
export async function addLineItemSkuFromBulkMaterial(lineItemId: string, inspectionId: string, bulkMaterialId: string) {
  await requireSessionOrThrow()
  const sql = getSql()
  const [bm] = await sql`select supplier, sku from inspection_bulk_materials where id = ${bulkMaterialId}`
  if (!bm) return

  await sql`insert into line_item_additional_skus (line_item_id, supplier, sku) values (${lineItemId}, ${bm.supplier}, ${bm.sku})`
  revalidatePath(`/inspections/${inspectionId}/quote-sheet`)
}

// Bulk materials (0023_sku_quantities_and_bulk_materials.sql) -- a purchase
// used across many line items in the same job (a contractor pack of outlets
// covering 8 separate outlet-replacement rows, a roll of window screen
// material), so it's scoped to the inspection as a whole rather than any one
// line item. Same immediate-action shape as addLineItemSku/removeLineItemSku
// above, for the same reason: a plain add-now/remove-now button is simpler
// than folding a dynamic-length list into the bulk save.
export async function addBulkMaterial(inspectionId: string, formData: FormData) {
  await requireSessionOrThrow()
  const sql = getSql()
  const supplier = String(formData.get('bulk_supplier') ?? '').trim() || null
  const sku = String(formData.get('bulk_sku') ?? '').trim() || null
  const quantity = String(formData.get('bulk_quantity') ?? '').trim() || null
  const notes = String(formData.get('bulk_notes') ?? '').trim() || null
  const cost = toNumberOrNull(formData.get('bulk_cost'))
  if (!supplier && !sku && !notes) return

  await sql`
    insert into inspection_bulk_materials (inspection_id, supplier, sku, quantity, notes, cost)
    values (${inspectionId}, ${supplier}, ${sku}, ${quantity}, ${notes}, ${cost})
  `

  revalidatePath(`/inspections/${inspectionId}/quote-sheet`)
}

// Edit an existing bulk material's fields in place. matches_reviewed resets
// to false so the auto-fill banner re-evaluates against the corrected
// supplier/sku -- an edit usually means the reviewer is fixing exactly the
// thing that made it match wrong (or not match at all) the first time.
export async function updateBulkMaterial(id: string, inspectionId: string, formData: FormData) {
  await requireSessionOrThrow()
  const sql = getSql()
  const supplier = String(formData.get('bulk_supplier') ?? '').trim() || null
  const sku = String(formData.get('bulk_sku') ?? '').trim() || null
  const quantity = String(formData.get('bulk_quantity') ?? '').trim() || null
  const notes = String(formData.get('bulk_notes') ?? '').trim() || null
  const cost = toNumberOrNull(formData.get('bulk_cost'))

  await sql`
    update inspection_bulk_materials
    set supplier = ${supplier}, sku = ${sku}, quantity = ${quantity}, notes = ${notes}, cost = ${cost}, matches_reviewed = false
    where id = ${id}
  `

  revalidatePath(`/inspections/${inspectionId}/quote-sheet`)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by the .bind(null, id, inspectionId) call site; formAction always passes the triggering form's FormData last
export async function removeBulkMaterial(id: string, inspectionId: string, _formData: FormData) {
  await requireSessionOrThrow()
  const sql = getSql()
  await sql`delete from inspection_bulk_materials where id = ${id}`
  revalidatePath(`/inspections/${inspectionId}/quote-sheet`)
}

// Bulk-item auto-fill (docs/designs/quote-sheet-bulk-item-auto-fill.md, v1
// wedge of "Auto Process Quote"): the Quote Sheet page computes candidate
// line-item matches for review (matchBulkMaterialCandidates, lib/bulkMatch.ts
// -- shared so the page's render-time computation and this apply step agree
// on the same rule), shows them in a confirm banner, and only THIS action --
// fired by an explicit reviewer click -- ever writes to a line item's
// Supplier/SKU. Never silent, and re-checks the blank-field guard
// server-side even though the banner only offers items that were blank at
// render time, in case the sheet was edited in another tab since.
export async function applyBulkMaterialMatches(bulkMaterialId: string, inspectionId: string, formData: FormData) {
  await requireSessionOrThrow()
  const sql = getSql()
  const lineItemIds = formData.getAll('apply_item_id').map(String)
  const [bm] = await sql`select supplier, sku from inspection_bulk_materials where id = ${bulkMaterialId}`
  if (bm && lineItemIds.length > 0) {
    // sku_quantity is deliberately NOT copied here -- the bulk material's
    // quantity is the size of the whole purchase (a 6-pack of bulbs), not how
    // many this specific line item needs (its own comment might say "replace
    // one bulb"). Copying it produced a real, wrong "Qty 6" on a real quote.
    // Leave it for the reviewer to fill in per item.
    await sql`
      update line_items
      set supplier = ${bm.supplier}, sku = ${bm.sku}
      where id in ${sql(lineItemIds)} and supplier is null and sku is null
    `
  }
  await sql`update inspection_bulk_materials set matches_reviewed = true where id = ${bulkMaterialId}`
  revalidatePath(`/inspections/${inspectionId}/quote-sheet`)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by the .bind(null, id, inspectionId) call site; formAction always passes the triggering form's FormData last
export async function dismissBulkMaterialMatches(bulkMaterialId: string, inspectionId: string, _formData: FormData) {
  await requireSessionOrThrow()
  const sql = getSql()
  await sql`update inspection_bulk_materials set matches_reviewed = true where id = ${bulkMaterialId}`
  revalidatePath(`/inspections/${inspectionId}/quote-sheet`)
}

// "Use Bulk Item" (Quote Sheet, per line item): the reviewer explicitly picks
// a bulk material from a dropdown, rather than waiting on the auto-fill
// banner's guess -- always available, unlike the banner which only fires
// when the SKU text happens to match. Copies supplier/sku same as
// applyBulkMaterialMatches, but is a direct reviewer choice so it overwrites
// whatever was there rather than requiring blank fields first. Clears
// materials_cost: once a line item draws from a shared bulk purchase, its own
// per-item material cost isn't a separate real number -- the bulk item's own
// `cost` (migration 0026) is where that $ amount lives instead. labor_hours
// is untouched -- linking a materials source says nothing about the labor.
// Called directly from a client component's onChange (LinkBulkMaterialSelect)
// now that picking a value submits immediately -- a plain arg, not FormData,
// since there's no form involved anymore.
export async function linkLineItemToBulkMaterial(lineItemId: string, inspectionId: string, bulkMaterialId: string) {
  await requireSessionOrThrow()
  if (!bulkMaterialId) return
  const sql = getSql()
  const [bm] = await sql`select supplier, sku from inspection_bulk_materials where id = ${bulkMaterialId}`
  if (!bm) return

  await sql`
    update line_items
    set supplier = ${bm.supplier}, sku = ${bm.sku}, materials_cost = null
    where id = ${lineItemId}
  `
  revalidatePath(`/inspections/${inspectionId}/quote-sheet`)
}

export type CostSuggestion = { sku: string; materialName: string; unitPrice: string; similarity: number }

// Cost Book learning engine (docs/designs/propinspec-cost-history.md) --
// on-demand, not computed automatically for every blank line item on page
// load: an embedding call per lookup is cheap for one reviewer click, but
// running it unprompted for every blank item on every Quote Sheet render
// would add real, unnecessary latency/cost to a page that's already data-heavy.
// Suggest-and-confirm only, same as bulk-item auto-fill -- this never writes
// anything by itself, see applyHistoricalCostSuggestion below.
export async function suggestHistoricalCost(itemName: string): Promise<{ suggestions: CostSuggestion[] }> {
  await requireSessionOrThrow()
  const trimmed = itemName.trim()
  if (!trimmed) return { suggestions: [] }

  const queryEmbedding = await embedText(trimmed, 'RETRIEVAL_QUERY')
  if (!queryEmbedding) return { suggestions: [] }
  const literal = toVectorLiteral(queryEmbedding)

  const sql = getSql()
  const rows = await sql`
    select
      sku, material_name, unit_price,
      1 - (embedding <=> ${literal}::vector) as similarity
    from cost_book_materials
    where embedding is not null and sku is not null
    order by embedding <=> ${literal}::vector
    limit 3
  `
  return {
    suggestions: rows
      .filter((r) => Number(r.similarity) >= 0.75)
      .map((r) => ({ sku: r.sku, materialName: r.material_name, unitPrice: r.unit_price, similarity: Number(r.similarity) })),
  }
}

// Applies a suggestHistoricalCost() result the reviewer explicitly picked --
// writes source/sku/materials_cost. Same "explicit reviewer choice can
// overwrite" reasoning as linkLineItemToBulkMaterial above, but the UI only
// ever offers this button when the line item's Supplier/SKU/cost are blank
// (see the Quote Sheet render), so in practice it never overwrites real data.
export async function applyHistoricalCostSuggestion(
  lineItemId: string,
  inspectionId: string,
  sku: string,
  unitPrice: string
) {
  await requireSessionOrThrow()
  await getSql()`
    update line_items
    set supplier = 'Home Depot', sku = ${sku}, materials_cost = ${unitPrice}
    where id = ${lineItemId}
  `
  revalidatePath(`/inspections/${inspectionId}/quote-sheet`)
}

// Called directly from the Job Timeline's client component (drag-end commit,
// or the keyboard-accessible plain date inputs) -- not a form action, so it
// takes a plain object rather than FormData. Always sets all 4 fields
// together (the client sends the item's full current schedule state, not a
// partial patch), matching bulkUpdateLineItems' own convention.
export async function updateLineItemSchedule(input: {
  id: string
  inspectionId: string
  status: string
  scheduledStart: string | null
  scheduledEnd: string | null
  blocksLineItemId: string | null
}): Promise<{ error?: string }> {
  await requireSessionOrThrow()
  const sql = getSql()
  const { id, inspectionId, blocksLineItemId } = input

  if (blocksLineItemId !== null) {
    if (blocksLineItemId === id) {
      return { error: 'A line item cannot block itself.' }
    }
    const rows = (await sql`
      select id, blocks_line_item_id from line_items where inspection_id = ${inspectionId}
    `) as { id: string; blocks_line_item_id: string | null }[]
    const nextBlock = new Map(rows.map((r) => [r.id, r.blocks_line_item_id]))
    // Walk the chain starting from the proposed predecessor; if it ever
    // leads back to `id`, setting this link would create a cycle. `seen`
    // guards against looping forever if a cycle already exists elsewhere.
    let cursor: string | null = blocksLineItemId
    const seen = new Set<string>()
    while (cursor) {
      if (cursor === id) {
        return { error: 'That would create a scheduling dependency cycle.' }
      }
      if (seen.has(cursor)) break
      seen.add(cursor)
      cursor = nextBlock.get(cursor) ?? null
    }
  }

  await sql`
    update line_items
    set
      status = ${input.status},
      scheduled_start = ${input.scheduledStart},
      scheduled_end = ${input.scheduledEnd},
      blocks_line_item_id = ${blocksLineItemId}
    where id = ${id}
  `

  revalidatePath(`/inspections/${inspectionId}/timeline`)
  return {}
}

// Backs the Dispatch Board's drag-and-drop (app/dispatch-board) -- placing a
// Stage on a date, whether it already had a scheduled_start/end or is being
// scheduled for the first time from the Unscheduled tray, is the same
// upsert either way (inspection_stages is unique on (inspection_id,
// stage_id) -- see 0020_inspection_stages.sql). `reassignTo` is only sent
// when a Stage is dropped onto a different crew's row in Crew grouping --
// it bulk-rewrites assigned_to/vendor_id on every line item under that
// (inspection, stage) pair, which is a deliberate act (dragging a whole
// Stage onto a vendor's lane means "this vendor now owns this Stage"), not
// an incidental side effect of moving a date.
export async function updateStagePlacement(input: {
  inspectionId: string
  stageId: string
  scheduledStart: string
  scheduledEnd: string
  reassignTo?: { assignedTo: string; vendorId: string | null }
}): Promise<void> {
  await requireSessionOrThrow()
  const sql = getSql()

  await sql.begin(async (tx) => {
    await tx`
      insert into inspection_stages (inspection_id, stage_id, scheduled_start, scheduled_end)
      values (${input.inspectionId}, ${input.stageId}, ${input.scheduledStart}, ${input.scheduledEnd})
      on conflict (inspection_id, stage_id)
      do update set scheduled_start = excluded.scheduled_start, scheduled_end = excluded.scheduled_end
    `

    if (input.reassignTo) {
      await tx`
        update line_items
        set assigned_to = ${input.reassignTo.assignedTo}, vendor_id = ${input.reassignTo.vendorId}
        where inspection_id = ${input.inspectionId} and stage_id = ${input.stageId}
      `
    }
  })

  revalidatePath('/dispatch-board')
}

export async function addLineItem(formData: FormData) {
  await requireSessionOrThrow()
  const sql = getSql()
  const inspectionId = String(formData.get('inspection_id'))
  const roomArea = String(formData.get('room_area'))
  const item = String(formData.get('item'))
  const condition = String(formData.get('condition'))
  const assignedToRaw = formData.get('assigned_to')
  const assignedTo = assignedToRaw ? String(assignedToRaw) : null
  const vendorIdRaw = formData.get('vendor_id')
  const vendorId = vendorIdRaw ? String(vendorIdRaw) : null
  const recommendedAction = String(formData.get('recommended_action') || '')

  await sql`
    insert into line_items (inspection_id, room_area, item, condition, assigned_to, vendor_id, recommended_action, is_manual_addition)
    values (${inspectionId}, ${roomArea}, ${item}, ${condition}, ${assignedTo}, ${vendorId}, ${recommendedAction}, true)
  `

  revalidatePath(`/inspections/${inspectionId}`)
}

export async function createInspection(formData: FormData) {
  await requireSessionOrThrow()
  const sql = getSql()
  const jobNumber = String(formData.get('job_number'))
  const propertyAddress = String(formData.get('property_address'))
  const inspectionDate = String(formData.get('inspection_date'))
  const inspectorName = String(formData.get('inspector_name'))
  const sourceVideoDriveFolderUrl = String(formData.get('source_video_drive_folder_url') || '') || null
  const specialInstructions = String(formData.get('special_instructions') || '') || null
  const moveInReportDriveUrl = String(formData.get('move_in_report_drive_url') || '') || null
  const leaseName = String(formData.get('lease_name') || '') || null
  const securityDepositAmount = toNumberOrNull(formData.get('security_deposit_amount'))
  const inspectionType = String(formData.get('inspection_type') || 'Move-Out')

  const [row] = await sql`
    insert into inspections (
      job_number, property_address, inspection_date, inspector_name,
      source_video_drive_folder_url, special_instructions, move_in_report_drive_url,
      lease_name, security_deposit_amount, inspection_type
    )
    values (
      ${jobNumber}, ${propertyAddress}, ${inspectionDate}, ${inspectorName},
      ${sourceVideoDriveFolderUrl}, ${specialInstructions}, ${moveInReportDriveUrl},
      ${leaseName}, ${securityDepositAmount}, ${inspectionType}
    )
    returning id
  `

  revalidatePath('/')
  revalidatePath('/inspections')
  redirect(`/inspections/${row.id}`)
}

// Both fields are optional and manually entered -- no PMS integration exists
// to pull them from (2026-09-22 feedback: wanted as a merged exhibit on the
// Move-Out Report, same as zinspector does, but GPM has no source system
// connected here yet). Editable after creation too, in case they weren't
// known yet when the inspection was first logged.
export async function updateInspectionBilling(inspectionId: string, formData: FormData) {
  await requireSessionOrThrow()
  const sql = getSql()
  const leaseName = String(formData.get('lease_name') || '') || null
  const securityDepositAmount = toNumberOrNull(formData.get('security_deposit_amount'))

  await sql`
    update inspections
    set lease_name = ${leaseName}, security_deposit_amount = ${securityDepositAmount}
    where id = ${inspectionId}
  `

  revalidatePath(`/inspections/${inspectionId}`)
  revalidatePath(`/inspections/${inspectionId}/move-out-report`)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by the .bind(null, id) call site; formAction always passes the triggering form's FormData last
export async function deleteInspection(id: string, _formData: FormData) {
  await requireSessionOrThrow()
  const sql = getSql()
  await sql`delete from inspections where id = ${id}`
  revalidatePath('/')
  revalidatePath('/inspections')
  redirect('/inspections')
}

export async function updateInspectionStatus(formData: FormData) {
  await requireSessionOrThrow()
  const sql = getSql()
  const inspectionId = String(formData.get('inspection_id'))
  const status = String(formData.get('status'))

  await sql`update inspections set status = ${status} where id = ${inspectionId}`

  revalidatePath(`/inspections/${inspectionId}`)
  revalidatePath('/')
  revalidatePath('/inspections')
}

// Manual entry for now -- no real PropertyWare API access/docs exist
// anywhere in this project yet (same stand-in-now-swap-in-real-API-later
// pattern as sendBatchToPW). pw_property_id is a placeholder for that
// future real link; left null until it exists. Deliberately not linked to
// inspections.property_address -- see migration 0035's own comment.
export async function createProperty(formData: FormData) {
  await requireAdminOrThrow()
  const sql = getSql()
  const address = String(formData.get('address') ?? '').trim()
  if (!address) return
  const pwPropertyId = String(formData.get('pw_property_id') || '').trim() || null
  const notes = String(formData.get('notes') || '').trim() || null

  await sql`insert into properties (address, pw_property_id, notes) values (${address}, ${pwPropertyId}, ${notes})`

  revalidatePath('/properties')
}

export async function updateProperty(propertyId: string, formData: FormData) {
  await requireAdminOrThrow()
  const sql = getSql()
  const address = String(formData.get('address') ?? '').trim()
  if (!address) return
  const pwPropertyId = String(formData.get('pw_property_id') || '').trim() || null
  const notes = String(formData.get('notes') || '').trim() || null

  await sql`
    update properties
    set address = ${address}, pw_property_id = ${pwPropertyId}, notes = ${notes}
    where id = ${propertyId}
  `

  revalidatePath('/properties')
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by the .bind(null, propertyId) call site; formAction always passes the triggering form's FormData last
export async function deleteProperty(propertyId: string, _formData: FormData) {
  await requireAdminOrThrow()
  const sql = getSql()
  await sql`delete from properties where id = ${propertyId}`
  revalidatePath('/properties')
}

export async function createVendor(formData: FormData) {
  await requireAdminOrThrow()
  const sql = getSql()
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return

  await sql`insert into vendors (name) values (${name}) on conflict (name) do nothing`

  revalidatePath('/setup')
}

// Setup page only offers Delete on a vendor with zero references (see the
// in-use count computed there) -- so a live FK violation here means the
// vendor got newly assigned between page load and submit. Swallow it rather
// than 500ing; the page's own count will catch up on revalidate.
export async function deleteVendor(vendorId: string) {
  await requireAdminOrThrow()
  const sql = getSql()
  try {
    await sql`delete from vendors where id = ${vendorId}`
  } catch (err) {
    console.error('deleteVendor failed (likely still in use):', err)
  }
  revalidatePath('/setup')
}

export async function createStage(formData: FormData) {
  await requireAdminOrThrow()
  const sql = getSql()
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return

  const [{ max }] = await sql`select max(sort_order) as max from stages`
  await sql`insert into stages (name, sort_order) values (${name}, ${(max ?? 0) + 1}) on conflict (name) do nothing`

  revalidatePath('/setup/stages')
}

export async function updateStageName(stageId: string, formData: FormData) {
  await requireAdminOrThrow()
  const sql = getSql()
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return

  await sql`update stages set name = ${name} where id = ${stageId}`

  revalidatePath('/setup/stages')
}

// Swaps this stage's sort_order with its immediate neighbor's -- the
// simplest reorder primitive that works as long as sort_order stays a
// dense, gap-free ranking (which every write path here preserves).
//
// sort_order has a UNIQUE constraint, so writing the neighbor's value
// directly into the current row collides with the neighbor's own
// still-current value (the swap hasn't happened yet) and the whole thing
// fails with a unique-violation. Bouncing through -1 (outside the valid
// 1..N range, never otherwise used) avoids that collision at every step.
async function swapStageOrder(stageId: string, direction: 'up' | 'down') {
  const sql = getSql()
  const stages = await sql`select id, sort_order from stages order by sort_order`
  const idx = stages.findIndex((s) => s.id === stageId)
  if (idx === -1) return

  const neighborIdx = direction === 'up' ? idx - 1 : idx + 1
  if (neighborIdx < 0 || neighborIdx >= stages.length) return

  const current = stages[idx]
  const neighbor = stages[neighborIdx]
  await sql.begin(async (tx) => {
    await tx`update stages set sort_order = -1 where id = ${current.id}`
    await tx`update stages set sort_order = ${current.sort_order} where id = ${neighbor.id}`
    await tx`update stages set sort_order = ${neighbor.sort_order} where id = ${current.id}`
  })
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by the .bind(null, stageId) call site; formAction always passes the triggering form's FormData last
export async function moveStageUp(stageId: string, _formData: FormData) {
  await requireAdminOrThrow()
  await swapStageOrder(stageId, 'up')
  revalidatePath('/setup/stages')
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by the .bind(null, stageId) call site; formAction always passes the triggering form's FormData last
export async function moveStageDown(stageId: string, _formData: FormData) {
  await requireAdminOrThrow()
  await swapStageOrder(stageId, 'down')
  revalidatePath('/setup/stages')
}

export async function updateSettings(formData: FormData) {
  await requireAdminOrThrow()
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

export type InspectionVideoRow = {
  id: string
  drive_file_id: string
  filename: string
  status: string
  error_message: string | null
  line_items_created: number
}

// Lists the video files in the inspection's linked Drive folder and adds any
// not already tracked -- safe to call repeatedly (e.g. if more clips get
// added to the folder after the first pass). Does not process anything
// itself; that's processNextInspectionVideo, called in a loop by the client.
export async function syncInspectionVideos(inspectionId: string): Promise<{ error?: string; videos?: InspectionVideoRow[] }> {
  await requireSessionOrThrow()
  const sql = getSql()
  const [inspection] = await sql`select source_video_drive_folder_url from inspections where id = ${inspectionId}`
  if (!inspection?.source_video_drive_folder_url) {
    return { error: 'This inspection has no Google Drive video folder linked.' }
  }

  const folderId = parseFolderIdFromUrl(inspection.source_video_drive_folder_url)
  if (!folderId) {
    return { error: 'Could not parse a Drive folder ID from the linked URL.' }
  }

  let files
  try {
    files = await listVideosInFolder(folderId)
  } catch (err) {
    return { error: `Could not list files in the Drive folder: ${(err as Error).message}` }
  }

  if (files.length === 0) {
    return { error: 'No video files found in the linked Drive folder.' }
  }

  for (const file of files) {
    await sql`
      insert into inspection_videos (inspection_id, drive_file_id, filename)
      values (${inspectionId}, ${file.id}, ${file.name})
      on conflict (inspection_id, drive_file_id) do nothing
    `
  }

  const videos = (await sql`
    select id, drive_file_id, filename, status, error_message, line_items_created
    from inspection_videos where inspection_id = ${inspectionId} order by created_at
  `) as unknown as InspectionVideoRow[]

  return { videos }
}

// Processes exactly one pending video per call -- called in a loop from the
// client so each request stays short (download + Gemini analysis for a
// single clip, not the whole batch) and progress is visible after every
// step, not just at the end. A failure marks that one video 'failed' with a
// specific reason and stops there; it does NOT skip ahead to the next video
// silently (the original design doc's own failure-mode requirement: fail
// loudly, don't drop a bad file quietly).
export async function processNextInspectionVideo(inspectionId: string): Promise<{ done: boolean; videos: InspectionVideoRow[] }> {
  await requireSessionOrThrow()
  const sql = getSql()
  const [next] = await sql`
    select id, drive_file_id, filename from inspection_videos
    where inspection_id = ${inspectionId} and status = 'pending'
    order by created_at
    limit 1
  `

  if (next) {
    await sql`update inspection_videos set status = 'processing' where id = ${next.id}`

    try {
      const buffer = await downloadDriveFile(next.drive_file_id)
      const extracted = await extractLineItemsFromVideo(buffer, next.filename)

      // Video is written to disk once and reused across every still-frame
      // extraction below (rather than re-writing the buffer per line item) --
      // some of these clips are 100s of MB.
      const videoTempPath = join(tmpdir(), `propinspec-video-${randomUUID()}.mp4`)
      await writeFile(videoTempPath, buffer)
      // One creation_time per video, not per frame -- see getVideoCreationTime's
      // own comment for why GPS isn't available but this is. Null on any
      // video lacking the tag; captured_at then just stays null for its stills.
      const creationTime = await getVideoCreationTime(videoTempPath).catch(() => null)

      try {
        for (const li of extracted) {
          const [{ id: lineItemId }] = await sql`
            insert into line_items (
              inspection_id, room_area, item, condition, observed_evidence, recommended_action,
              trade_category, assigned_to, priority, source_timestamp, source_video_file, source_video_drive_file_id, is_manual_addition
            )
            values (
              ${inspectionId}, ${li.room_area}, ${li.item}, ${li.condition}, ${li.observed_evidence}, ${li.recommended_action},
              ${li.trade_category}, ${li.assigned_to}, ${li.priority}, ${li.source_timestamp}, ${next.filename}, ${next.drive_file_id}, false
            )
            returning id
          `

          // Best-effort: a still is a nice-to-have on top of the line item,
          // not a requirement -- EvidenceStill already renders a graceful
          // "No still extracted yet" placeholder, so a failure here should
          // never take down the line item (or the whole video) with it.
          const seconds = parseTimestampSeconds(li.source_timestamp)
          if (seconds !== null) {
            try {
              const frame = await extractFrame(videoTempPath, seconds)
              const url = await uploadStill(frame, `${lineItemId}.jpg`)
              const capturedAt = creationTime ? new Date(creationTime.getTime() + seconds * 1000) : null
              await sql`update line_items set still_image_file = ${url}, captured_at = ${capturedAt} where id = ${lineItemId}`
            } catch (stillErr) {
              console.error(`Still extraction failed for line item ${lineItemId}:`, (stillErr as Error).message)
            }
          }
        }
      } finally {
        await unlink(videoTempPath).catch(() => {})
      }

      await sql`
        update inspection_videos
        set status = 'done', line_items_created = ${extracted.length}, error_message = null
        where id = ${next.id}
      `
    } catch (err) {
      await sql`
        update inspection_videos
        set status = 'failed', error_message = ${(err as Error).message}
        where id = ${next.id}
      `
    }
  }

  revalidatePath(`/inspections/${inspectionId}`)

  const videos = (await sql`
    select id, drive_file_id, filename, status, error_message, line_items_created
    from inspection_videos where inspection_id = ${inspectionId} order by created_at
  `) as unknown as InspectionVideoRow[]

  const done = !videos.some((v) => v.status === 'pending' || v.status === 'processing')
  return { done, videos }
}

// Resets one failed video back to 'pending' so the next processNextInspectionVideo
// call in the loop picks it up again -- e.g. after fixing a Drive-permissions
// issue that caused the original failure.
export async function retryInspectionVideo(videoRowId: string, inspectionId: string): Promise<{ videos: InspectionVideoRow[] }> {
  await requireSessionOrThrow()
  const sql = getSql()
  await sql`update inspection_videos set status = 'pending', error_message = null where id = ${videoRowId} and status = 'failed'`

  const videos = (await sql`
    select id, drive_file_id, filename, status, error_message, line_items_created
    from inspection_videos where inspection_id = ${inspectionId} order by created_at
  `) as unknown as InspectionVideoRow[]

  return { videos }
}

// "Share Images" (Image Folder page): called directly from a client
// component's onClick, not a <form> -- the client needs the resulting URL
// back immediately to copy it to the clipboard, which a form action's void
// return can't do. Takes a plain array, not FormData, same as
// updateLineItemSchedule above. `images` is a snapshot, not a set of
// line_item ids, so the resulting link keeps working even if those line
// items are later edited or removed -- see migration 0025.
export async function createImageShareLink(
  inspectionId: string,
  images: { url: string; roomArea: string; item: string }[]
): Promise<{ url?: string; error?: string }> {
  await requireSessionOrThrow()
  if (images.length === 0) return { error: 'Select at least one image first.' }
  const sql = getSql()
  const token = randomUUID()
  await sql`
    insert into image_share_links (inspection_id, token, images)
    values (${inspectionId}, ${token}, ${sql.json(images)})
  `
  return { url: `/share/${token}` }
}

// AI help widget (docs/designs/ai-help-widget.md) -- called directly from
// HelpWidget.tsx's onClick, not a form, same reasoning as createImageShareLink
// above. `pathname` drives lib/helpContext.ts's route match so the assistant
// can answer "why does this show X" using the real data on the reviewer's
// current screen, not just static workflow help.
export async function askHelp(
  pathname: string,
  question: string,
  history: HelpMessage[]
): Promise<{ answer?: string; error?: string }> {
  try {
    await requireSessionOrThrow()
    const pageData = await getPageContext(pathname)
    const answer = await askHelpAssistant(question, history, pageData)
    return { answer }
  } catch (err) {
    return { error: (err as Error).message || 'Something went wrong asking the assistant.' }
  }
}

// Manage Users (Setup, Admin-only). Called directly from CreateUserForm.tsx
// (useTransition), not a plain form action, so a duplicate-email/
// short-password rejection can be shown inline instead of silently no-oping
// the way createVendor/createStage do.
export async function createUser(
  email: string,
  password: string,
  role: string
): Promise<{ error?: string }> {
  await requireAdminOrThrow()
  const sql = getSql()
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    return { error: 'Enter a valid email address.' }
  }
  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters.' }
  }
  if (role !== 'Admin' && role !== 'General User') {
    return { error: 'Invalid access level.' }
  }

  const passwordHash = await bcrypt.hash(password, 12)

  try {
    await sql`
      insert into users (email, password_hash, role)
      values (${normalizedEmail}, ${passwordHash}, ${role})
    `
  } catch (err) {
    const pgError = err as { code?: string }
    if (pgError.code === '23505') {
      return { error: 'A user with that email already exists.' }
    }
    return { error: 'Something went wrong creating the user.' }
  }

  revalidatePath('/setup/users')
  return {}
}

export async function deleteUser(userId: string) {
  await requireAdminOrThrow()
  const sql = getSql()
  await sql`delete from users where id = ${userId}`
  revalidatePath('/setup/users')
}
