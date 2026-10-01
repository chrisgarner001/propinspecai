'use server'

// Guided Inspection field view actions (docs/designs/propinspec-guided-inspection.md).
// Every action goes through requireFieldAccessOrThrow, which is the only
// path an Inspector account can mutate anything -- and only on an
// inspection assigned to it. Each one returns { error } rather than
// throwing on bad input, so the iPad UI can show the problem inline.

import { revalidatePath } from 'next/cache'
import { randomUUID } from 'node:crypto'
import { getSql } from '@/lib/db'
import { requireFieldAccessOrThrow } from '@/lib/dal'
import { uploadFieldPhoto, removeFieldPhoto, isJpeg, MAX_FIELD_PHOTO_BYTES } from '@/lib/fieldPhotos'
import { ROOM_PRESETS, nextRoomName, customRoomName } from '@/lib/roomPlan'

type Result = { error?: string }

function revalidate(inspectionId: string) {
  revalidatePath(`/field/${inspectionId}`)
  revalidatePath(`/inspections/${inspectionId}`)
}

async function readPhoto(formData: FormData): Promise<Buffer | string> {
  const file = formData.get('photo')
  if (!(file instanceof Blob) || file.size === 0) return 'No photo was attached.'
  if (file.size > MAX_FIELD_PHOTO_BYTES) return 'That photo is too large. Try taking it again.'
  const bytes = Buffer.from(await file.arrayBuffer())
  if (!isJpeg(bytes)) return 'That file is not a photo PropInspec can store.'
  return bytes
}

export async function addPlannedRoom(inspectionId: string, input: { preset?: string; custom?: string }): Promise<Result> {
  await requireFieldAccessOrThrow(inspectionId)
  const sql = getSql()
  const existing = (await sql`select room_name from inspection_room_plan where inspection_id = ${inspectionId}`).map(
    (r) => String(r.room_name),
  )

  let name: string | null
  if (input.preset) {
    const preset = ROOM_PRESETS.find((p) => p.name === input.preset)
    if (!preset) return { error: 'Unknown room type.' }
    name = nextRoomName(existing, preset)
  } else {
    name = customRoomName(existing, input.custom ?? '')
    if (!name) return { error: input.custom?.trim() ? 'That room is already on the list.' : 'Type a room name first.' }
  }

  await sql`
    insert into inspection_room_plan (inspection_id, room_name, sort_order)
    values (${inspectionId}, ${name}, ${existing.length})
    on conflict (inspection_id, room_name) do nothing
  `
  revalidate(inspectionId)
  return {}
}

export async function removePlannedRoom(inspectionId: string, roomId: string): Promise<Result> {
  await requireFieldAccessOrThrow(inspectionId)
  const sql = getSql()
  const [room] = await sql`
    delete from inspection_room_plan where id = ${roomId} and inspection_id = ${inspectionId} returning photo_path
  `
  if (room?.photo_path) await removeFieldPhoto(room.photo_path).catch(() => {})
  revalidate(inspectionId)
  return {}
}

export async function movePlannedRoom(inspectionId: string, roomId: string, direction: 'up' | 'down'): Promise<Result> {
  await requireFieldAccessOrThrow(inspectionId)
  const sql = getSql()
  const rooms = await sql`select id from inspection_room_plan where inspection_id = ${inspectionId} order by sort_order, created_at`
  const ids = rooms.map((r) => String(r.id))
  const i = ids.indexOf(roomId)
  const j = direction === 'up' ? i - 1 : i + 1
  if (i < 0 || j < 0 || j >= ids.length) return {}
  ;[ids[i], ids[j]] = [ids[j], ids[i]]
  for (const [order, id] of ids.entries()) {
    await sql`update inspection_room_plan set sort_order = ${order} where id = ${id}`
  }
  revalidate(inspectionId)
  return {}
}

export async function uploadRoomPhoto(inspectionId: string, roomId: string, formData: FormData): Promise<Result> {
  await requireFieldAccessOrThrow(inspectionId)
  const photo = await readPhoto(formData)
  if (typeof photo === 'string') return { error: photo }
  const sql = getSql()
  const [room] = await sql`select photo_path from inspection_room_plan where id = ${roomId} and inspection_id = ${inspectionId}`
  if (!room) return { error: 'That room is no longer on the list.' }

  // New path per upload (not an overwrite) so a re-take never shows a stale
  // cached image; the old object is removed after the row points at the new one.
  const path = `${inspectionId}/rooms/${roomId}-${randomUUID()}.jpg`
  await uploadFieldPhoto(path, photo)
  await sql`update inspection_room_plan set photo_path = ${path} where id = ${roomId}`
  if (room.photo_path) await removeFieldPhoto(room.photo_path).catch(() => {})
  revalidate(inspectionId)
  return {}
}

async function upsertResponse(
  inspectionId: string,
  itemId: string,
  fields: { text_value?: string | null; photo_path?: string },
): Promise<{ previousPhoto: string | null } | { error: string }> {
  const sql = getSql()
  const [item] = await sql`select label from checklist_items where id = ${itemId}`
  if (!item) return { error: 'That checklist item no longer exists.' }
  const [prev] = await sql`
    select photo_path from inspection_checklist_responses where inspection_id = ${inspectionId} and checklist_item_id = ${itemId}
  `
  await sql`
    insert into inspection_checklist_responses (inspection_id, checklist_item_id, label, text_value, photo_path)
    values (${inspectionId}, ${itemId}, ${item.label}, ${fields.text_value ?? null}, ${fields.photo_path ?? null})
    on conflict (inspection_id, checklist_item_id) do update set
      label = excluded.label,
      text_value = ${'text_value' in fields ? sql`excluded.text_value` : sql`inspection_checklist_responses.text_value`},
      photo_path = ${'photo_path' in fields ? sql`excluded.photo_path` : sql`inspection_checklist_responses.photo_path`},
      updated_at = now()
  `
  return { previousPhoto: prev?.photo_path ?? null }
}

export async function saveChecklistText(inspectionId: string, itemId: string, text: string): Promise<Result> {
  await requireFieldAccessOrThrow(inspectionId)
  const value = text.trim().slice(0, 2000) || null
  const result = await upsertResponse(inspectionId, itemId, { text_value: value })
  if ('error' in result) return result
  revalidate(inspectionId)
  return {}
}

export async function uploadChecklistPhoto(inspectionId: string, itemId: string, formData: FormData): Promise<Result> {
  await requireFieldAccessOrThrow(inspectionId)
  const photo = await readPhoto(formData)
  if (typeof photo === 'string') return { error: photo }
  const path = `${inspectionId}/checklist/${itemId}-${randomUUID()}.jpg`
  await uploadFieldPhoto(path, photo)
  const result = await upsertResponse(inspectionId, itemId, { photo_path: path })
  if ('error' in result) {
    await removeFieldPhoto(path).catch(() => {})
    return result
  }
  if (result.previousPhoto) await removeFieldPhoto(result.previousPhoto).catch(() => {})
  revalidate(inspectionId)
  return {}
}

export async function setFieldInspectionComplete(inspectionId: string, complete: boolean): Promise<Result> {
  await requireFieldAccessOrThrow(inspectionId)
  const sql = getSql()
  if (complete) {
    const [{ count }] = await sql`select count(*) from inspection_room_plan where inspection_id = ${inspectionId}`
    if (Number(count) === 0) return { error: 'Add the rooms before marking the inspection complete.' }
  }
  await sql`update inspections set field_completed_at = ${complete ? sql`now()` : null} where id = ${inspectionId}`
  revalidate(inspectionId)
  revalidatePath('/field')
  return {}
}
