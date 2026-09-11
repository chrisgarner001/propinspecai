'use server'

import { getSql } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { parseFolderIdFromUrl, listVideosInFolder, downloadDriveFile } from '@/lib/google'
import { extractLineItemsFromVideo } from '@/lib/gemini'
import { parseTimestampSeconds, extractFrame, uploadStill } from '@/lib/stills'
import { writeFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

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
    if (formData.get(`remove__${id}`) === '1') {
      await sql`delete from line_items where id = ${id}`
      continue
    }

    const roomArea = String(formData.get(`room_area__${id}`) ?? '')
    const item = String(formData.get(`item__${id}`) ?? '')
    const condition = String(formData.get(`condition__${id}`) ?? '')
    const assignedToRaw = formData.get(`assigned_to__${id}`)
    const assignedTo = assignedToRaw ? String(assignedToRaw) : null
    const recommendedAction = String(formData.get(`recommended_action__${id}`) ?? '')
    const observedEvidenceRaw = formData.get(`observed_evidence__${id}`)
    const observedEvidence = observedEvidenceRaw ? String(observedEvidenceRaw) : null
    const materialsCost = toNumberOrNull(formData.get(`materials_cost__${id}`))
    const laborHours = toNumberOrNull(formData.get(`labor_hours__${id}`))
    const laborCost = laborHours !== null ? laborHours * laborRate : null
    const vendorEstimatedCost = toNumberOrNull(formData.get(`vendor_estimated_cost__${id}`))
    const tenantCharge = formData.get(`tenant_charge__${id}`) !== null
    const tenantApproved = formData.get(`tenant_approved__${id}`) !== null
    const vendorIdRaw = formData.get(`vendor_id__${id}`)
    const vendorId = vendorIdRaw ? String(vendorIdRaw) : null

    await sql`
      update line_items
      set
        room_area = ${roomArea},
        item = ${item},
        condition = ${condition},
        assigned_to = ${assignedTo},
        recommended_action = ${recommendedAction},
        observed_evidence = ${observedEvidence},
        materials_cost = ${materialsCost},
        labor_hours = ${laborHours},
        labor_cost = ${laborCost},
        vendor_estimated_cost = ${vendorEstimatedCost},
        tenant_charge = ${tenantCharge},
        tenant_approved = ${tenantApproved},
        vendor_id = ${vendorId}
      where id = ${id}
    `
  }

  revalidatePath(`/inspections/${inspectionId}`)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by the .bind(null, id, inspectionId) call site; formAction always passes the triggering form's FormData last
export async function duplicateLineItem(id: string, inspectionId: string, _formData: FormData) {
  const sql = getSql()

  const [original] = await sql`select * from line_items where id = ${id}`
  if (!original) return

  // created_at nudged forward 1ms so the duplicate sorts immediately after
  // the original in the (room_area, created_at) list ordering, directly
  // below it, rather than at the end of the room group.
  //
  // status/scheduled_start/scheduled_end/blocks_line_item_id are deliberately
  // OMITTED here, not copied from `original` -- a duplicate is a distinct,
  // newly-noticed task and should start not_started/unscheduled, not
  // inherit the original's job-tracking state. New line_items columns need
  // a deliberate decision here, not silent inheritance via SELECT *.
  await sql`
    insert into line_items (
      inspection_id, room_area, item, condition, observed_evidence, assigned_to,
      trade_category, recommended_action, priority, materials_cost, labor_hours,
      labor_cost, vendor_estimated_cost, tenant_charge, tenant_approved, is_manual_addition,
      source_timestamp, source_video_file, still_image_file, vendor_id, created_at
    )
    values (
      ${original.inspection_id}, ${original.room_area}, ${original.item}, ${original.condition},
      ${original.observed_evidence}, ${original.assigned_to}, ${original.trade_category},
      ${original.recommended_action}, ${original.priority}, ${original.materials_cost},
      ${original.labor_hours}, ${original.labor_cost}, ${original.vendor_estimated_cost},
      ${original.tenant_charge}, ${original.tenant_approved}, true,
      ${original.source_timestamp}, ${original.source_video_file}, ${original.still_image_file},
      ${original.vendor_id}, ${original.created_at}::timestamptz + interval '1 millisecond'
    )
  `

  revalidatePath(`/inspections/${inspectionId}`)
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
  const sourceVideoDriveFolderUrl = String(formData.get('source_video_drive_folder_url') || '') || null
  const specialInstructions = String(formData.get('special_instructions') || '') || null
  const moveInReportDriveUrl = String(formData.get('move_in_report_drive_url') || '') || null

  const [row] = await sql`
    insert into inspections (
      job_number, property_address, inspection_date, inspector_name,
      source_video_drive_folder_url, special_instructions, move_in_report_drive_url
    )
    values (
      ${jobNumber}, ${propertyAddress}, ${inspectionDate}, ${inspectorName},
      ${sourceVideoDriveFolderUrl}, ${specialInstructions}, ${moveInReportDriveUrl}
    )
    returning id
  `

  revalidatePath('/')
  redirect(`/inspections/${row.id}`)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by the .bind(null, id) call site; formAction always passes the triggering form's FormData last
export async function deleteInspection(id: string, _formData: FormData) {
  const sql = getSql()
  await sql`delete from inspections where id = ${id}`
  revalidatePath('/')
  redirect('/')
}

export async function updateInspectionStatus(formData: FormData) {
  const sql = getSql()
  const inspectionId = String(formData.get('inspection_id'))
  const status = String(formData.get('status'))

  await sql`update inspections set status = ${status} where id = ${inspectionId}`

  revalidatePath(`/inspections/${inspectionId}`)
  revalidatePath('/')
}

export async function createVendor(formData: FormData) {
  const sql = getSql()
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return

  await sql`insert into vendors (name) values (${name}) on conflict (name) do nothing`

  revalidatePath('/setup')
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
              await sql`update line_items set still_image_file = ${url} where id = ${lineItemId}`
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
  const sql = getSql()
  await sql`update inspection_videos set status = 'pending', error_message = null where id = ${videoRowId} and status = 'failed'`

  const videos = (await sql`
    select id, drive_file_id, filename, status, error_message, line_items_created
    from inspection_videos where inspection_id = ${inspectionId} order by created_at
  `) as unknown as InspectionVideoRow[]

  return { videos }
}
