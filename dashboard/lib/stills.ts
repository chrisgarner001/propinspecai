import { createClient } from '@supabase/supabase-js'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import ffmpegPath from 'ffmpeg-static'

const execFileAsync = promisify(execFile)

export const STILLS_BUCKET = 'inspection-stills'

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY is not set')
  return createClient(url, key)
}

// Gemini's source_timestamp is normally a single point ("0:42"), but the
// original hand-test format ("Clip 2, 0:20-0:29") is also accepted so this
// stays compatible with any line item however it was produced. Returns null
// for "Unable to determine" or anything else unparsable -- callers skip the
// still for that line item rather than fail it over a missing timestamp.
export function parseTimestampSeconds(raw: string): number | null {
  const cleaned = raw.replace(/^Clip\s*\d+,\s*/i, '').trim()
  const [startStr, endStr] = cleaned.split('-').map((s) => s.trim())

  const toSeconds = (t: string): number | null => {
    const segs = t.split(':').map(Number)
    if (segs.length < 2 || segs.length > 3 || segs.some((n) => Number.isNaN(n))) return null
    return segs.length === 3 ? segs[0] * 3600 + segs[1] * 60 + segs[2] : segs[0] * 60 + segs[1]
  }

  const start = toSeconds(startStr)
  if (start === null) return null
  if (!endStr) return start
  const end = toSeconds(endStr)
  return end === null ? start : (start + end) / 2
}

// Reads the video's own creation_time from its container metadata (the real
// wall-clock moment recording started) via ffmpeg's own metadata dump --
// `ffmpeg -i <file>` with no output always exits non-zero ("At least one
// output file must be specified") and prints its full metadata block to
// stderr, so the error path is the actual data source here, not a failure.
// Verified against two real GPM inspection videos (Samsung Android
// recordings): creation_time is present and GPS/location metadata is not --
// see docs/designs/propinspec-inspection-type-gallery.md's Technical
// Finding. Returns null for any video lacking the tag (untested device,
// corrupt file) rather than throwing -- callers treat a missing timestamp
// the same way they already treat an unparsable source_timestamp.
export async function getVideoCreationTime(videoPath: string): Promise<Date | null> {
  if (!ffmpegPath) throw new Error('ffmpeg-static did not resolve a binary path')
  let stderr = ''
  try {
    await execFileAsync(ffmpegPath, ['-i', videoPath])
  } catch (err) {
    stderr = (err as { stderr?: string }).stderr ?? ''
  }
  const match = stderr.match(/creation_time\s*:\s*(\S+)/)
  if (!match) return null
  const date = new Date(match[1])
  return Number.isNaN(date.getTime()) ? null : date
}

// Grabs one frame at `seconds` from an already-downloaded video file on disk.
// Takes a file path (not the buffer) so the caller can write the video to
// disk once and extract several frames from it, rather than re-writing the
// whole (sometimes 100s of MB) buffer per line item.
export async function extractFrame(videoPath: string, seconds: number): Promise<Buffer> {
  if (!ffmpegPath) throw new Error('ffmpeg-static did not resolve a binary path')
  const outPath = join(tmpdir(), `propinspec-still-${randomUUID()}.jpg`)
  try {
    await execFileAsync(ffmpegPath, ['-y', '-ss', String(seconds), '-i', videoPath, '-frames:v', '1', '-q:v', '3', outPath])
    return await readFile(outPath)
  } finally {
    await unlink(outPath).catch(() => {})
  }
}

// Public bucket by design: GPM's own inspection evidence photos of vacated
// units, not restricted tenant data (see DESIGN.md Decisions Log, 2026-09-10).
export async function uploadStill(frame: Buffer, storageKey: string): Promise<string> {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.storage
    .from(STILLS_BUCKET)
    .upload(storageKey, frame, { contentType: 'image/jpeg', upsert: true })
  if (error) throw error

  const { data } = supabase.storage.from(STILLS_BUCKET).getPublicUrl(storageKey)
  return data.publicUrl
}
