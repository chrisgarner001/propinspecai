import { createClient } from '@supabase/supabase-js'

// Guided Inspection photos (checklist items + one wide shot per room). A
// PRIVATE bucket, unlike lib/stills.ts's public inspection-stills: these can
// show the lockbox and the house's utility details, so they're only ever
// served through short-lived signed URLs to a signed-in user.
export const FIELD_PHOTOS_BUCKET = 'inspection-field-photos'
const SIGNED_URL_SECONDS = 60 * 60

// The browser resizes before upload (app/field/components/PhotoCapture.tsx),
// so a real photo lands well under this; the cap is a backstop against a
// direct call with an arbitrary payload, kept under Vercel's ~4.5MB
// request-body limit.
export const MAX_FIELD_PHOTO_BYTES = 4 * 1024 * 1024

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY is not set')
  return createClient(url, key)
}

export async function uploadFieldPhoto(path: string, bytes: Buffer): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .storage.from(FIELD_PHOTOS_BUCKET)
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: true })
  if (error) throw error
}

export async function removeFieldPhoto(path: string): Promise<void> {
  await getSupabaseAdmin().storage.from(FIELD_PHOTOS_BUCKET).remove([path])
}

// One batched call for a whole page's photos. Missing/failed entries are
// simply absent from the map -- the UI shows "no photo" rather than erroring.
export async function signFieldPhotoUrls(paths: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => !!p))]
  const urls = new Map<string, string>()
  if (unique.length === 0) return urls
  const { data, error } = await getSupabaseAdmin().storage.from(FIELD_PHOTOS_BUCKET).createSignedUrls(unique, SIGNED_URL_SECONDS)
  if (error || !data) {
    console.error('Could not sign field photo URLs:', error?.message)
    return urls
  }
  for (const entry of data) {
    if (entry.path && entry.signedUrl) urls.set(entry.path, entry.signedUrl)
  }
  return urls
}

// JPEG magic bytes -- the browser always re-encodes to JPEG before upload,
// so anything else is rejected rather than stored under a .jpg name.
export function isJpeg(bytes: Buffer): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}
