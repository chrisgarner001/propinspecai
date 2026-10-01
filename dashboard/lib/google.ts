import { google } from 'googleapis'
import { createReadStream, createWriteStream } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import type { Readable } from 'node:stream'

// Service account credentials come from an env var (GOOGLE_SERVICE_ACCOUNT_JSON),
// same pattern as DATABASE_URL -- works identically in local dev and on Vercel.
// Never read from the local google-service-account.json file directly: that
// file isn't deployed (gitignored, same as other secrets).
function getCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set')
  }
  return JSON.parse(raw)
}

export function getGoogleAuth() {
  return new google.auth.GoogleAuth({
    credentials: getCredentials(),
    scopes: ['https://www.googleapis.com/auth/drive'],
  })
}

// "https://drive.google.com/drive/folders/10nhel1iO..." -> "10nhel1iO..."
// Also accepts Drive for desktop's "Copy link" format
// (https://drive.google.com/open?id=<id>&usp=drive_fs) -- 35852 Beverly's
// link was that shape (2026-10-01) and couldn't be processed at all.
export function parseFolderIdFromUrl(url: string): string | null {
  const match = url.match(/folders\/([a-zA-Z0-9_-]+)/) ?? url.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  return match ? match[1] : null
}

export async function listVideosInFolder(folderId: string) {
  const auth = getGoogleAuth()
  const drive = google.drive({ version: 'v3', auth })

  // Drive's files.list silently returns an empty result when the caller
  // (the service account) can't see the parent folder at all -- it does not
  // throw. Confirmed with a real call: a folder never shared with the
  // service account returned files.list => [] while files.get on that same
  // folder id threw a real 404 "File not found." Without this explicit
  // check, an unshared folder is indistinguishable from a genuinely empty
  // one, and the caller (syncInspectionVideos) surfaces the misleading
  // "No video files found" instead of the real, actionable problem.
  try {
    await drive.files.get({ fileId: folderId, supportsAllDrives: true, fields: 'id' })
  } catch {
    const { client_email } = getCredentials()
    throw new Error(
      `Can't access this Drive folder -- make sure it's shared with ${client_email} (Viewer access is enough).`
    )
  }

  // `size` (docs/designs plan-eng-review, 2026-09-24): lets callers pre-flight
  // reject an oversized video before ever attempting a download -- see
  // downloadDriveFileToPath below for why the download itself must never
  // buffer the whole file.
  const res = await drive.files.list({
    q: `'${folderId}' in parents and mimeType contains 'video/' and trashed = false`,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    fields: 'files(id, name, mimeType, size)',
  })
  return (res.data.files ?? []) as { id: string; name: string; mimeType: string; size?: string }[]
}

// Streams the Drive file directly to destPath rather than buffering it in
// memory (the prior downloadDriveFile did `responseType: 'arraybuffer'`,
// holding the entire video as a Buffer -- a real risk against Vercel's
// 2GB(Hobby)/4GB(Pro) function memory ceiling for anything multi-hundred-MB).
// Confirmed live against this deployment's real /tmp capacity (2026-09-24,
// plan-eng-review): ~513MB available, ENOSPC past 512MB -- callers must
// pre-flight check size against that ceiling before calling this, since a
// mid-write ENOSPC here is a real, expected failure mode, not a bug.
export async function downloadDriveFileToPath(fileId: string, destPath: string): Promise<void> {
  const auth = getGoogleAuth()
  const drive = google.drive({ version: 'v3', auth })
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' },
  )
  try {
    await pipeline(res.data as NodeJS.ReadableStream, createWriteStream(destPath))
  } catch (err) {
    // A partial file from an interrupted stream (network blip, ENOSPC mid-
    // write) must not linger -- a leftover partial file contributes to
    // exhausting the same ~512MB /tmp ceiling for the NEXT video processed
    // in this same warm serverless instance (plan-eng-review Failure modes).
    await unlink(destPath).catch(() => {})
    throw err
  }
}

// Room clips (9355 Sylvia audit, 2026-09-30) go in a "Room Clips" subfolder
// of the inspection's own video folder, not the folder itself --
// listVideosInFolder only lists that folder's direct children, so clips in a
// subfolder are never picked up by "Check for new videos" as new source
// videos to process. Same Shared Drive, so the same viewer permissions
// VideoPopupLink already relies on apply to the clips too. Needs write
// access (the service account's 'fileOrganizer' role on GPM's Shared Drive,
// same as scripts/split-video.mjs) -- callers treat a failure here as
// best-effort, not fatal to processing.
export const ROOM_CLIPS_FOLDER_NAME = 'Room Clips'

export async function ensureSubfolder(parentFolderId: string, name: string): Promise<string> {
  const drive = google.drive({ version: 'v3', auth: getGoogleAuth() })
  const escaped = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  const existing = await drive.files.list({
    q: `'${parentFolderId}' in parents and name = '${escaped}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    fields: 'files(id)',
  })
  const found = existing.data.files?.[0]?.id
  if (found) return found

  const created = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentFolderId] },
    supportsAllDrives: true,
    fields: 'id',
  })
  if (!created.data.id) throw new Error(`Drive did not return an id for the new "${name}" folder.`)
  return created.data.id
}

// Takes a local path or an already-open stream (a clip piped straight out of
// ffmpeg -- see lib/stills.ts's cutClipToStream).
export async function uploadVideoToFolder(source: string | Readable, name: string, folderId: string): Promise<string> {
  const drive = google.drive({ version: 'v3', auth: getGoogleAuth() })
  const res = await drive.files.create({
    requestBody: { name, parents: [folderId] },
    media: { mimeType: 'video/mp4', body: typeof source === 'string' ? createReadStream(source) : source },
    supportsAllDrives: true,
    fields: 'id',
  })
  if (!res.data.id) throw new Error(`Drive did not return an id for uploaded clip ${name}.`)
  return res.data.id
}

// Best-effort cleanup when a video is reprocessed, so a retry doesn't leave
// the previous run's clips behind as orphans. Trash, not delete -- the
// service account's 'fileOrganizer' role can trash but not permanently
// delete (same constraint as scripts/split-video.mjs).
export async function trashDriveFile(fileId: string): Promise<void> {
  const drive = google.drive({ version: 'v3', auth: getGoogleAuth() })
  await drive.files.update({ fileId, requestBody: { trashed: true }, supportsAllDrives: true })
}
