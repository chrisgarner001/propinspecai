import { createClient } from '@supabase/supabase-js'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, unlink, statfs } from 'node:fs/promises'
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

// Moved to lib/timestamps.ts (no ffmpeg/Supabase imports) so lib/rooms.ts
// can share it; re-exported here so existing importers are unchanged.
export { parseTimestampSeconds } from './timestamps'

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

// Cuts one room's span out of an already-downloaded video into its own MP4
// (9355 Sylvia audit, 2026-09-30). `-c copy` -- no re-encode, so it takes
// seconds, not minutes, and adds no quality loss; the trade-off is the cut
// snaps to the nearest keyframe, so a clip can start up to a couple of
// seconds early, which is fine for "show me this room". `+faststart` moves
// the moov atom to the front so Drive's preview player can start playback
// before the whole clip has loaded. Returns the temp path; the caller
// uploads it and MUST unlink it (disk is the governing constraint -- see
// hasTmpSpaceFor below).
export async function cutClip(videoPath: string, startSeconds: number, endSeconds: number): Promise<string> {
  if (!ffmpegPath) throw new Error('ffmpeg-static did not resolve a binary path')
  const outPath = join(tmpdir(), `propinspec-clip-${randomUUID()}.mp4`)
  try {
    await execFileAsync(ffmpegPath, [
      '-y',
      '-ss', String(startSeconds),
      '-i', videoPath,
      '-t', String(Math.max(1, endSeconds - startSeconds)),
      '-c', 'copy',
      '-avoid_negative_ts', 'make_zero',
      '-movflags', '+faststart',
      outPath,
    ])
    return outPath
  } catch (err) {
    await unlink(outPath).catch(() => {})
    throw err
  }
}

// Same cut as cutClip, but written to ffmpeg's stdout instead of /tmp, for a
// clip that won't fit on disk next to its source (see hasTmpSpaceFor). A
// pipe can't be seeked back into to write a moov atom, so this emits
// fragmented MP4 (`frag_keyframe+empty_moov`) -- only the OUTPUT is a pipe;
// the input is still the seekable file on disk, so the phone-video
// moov-at-the-end problem split-video.mjs avoids doesn't apply. `done`
// rejects if ffmpeg exits non-zero, so the caller can discard a truncated
// upload instead of keeping it.
export function cutClipToStream(videoPath: string, startSeconds: number, endSeconds: number) {
  if (!ffmpegPath) throw new Error('ffmpeg-static did not resolve a binary path')
  const child = spawn(ffmpegPath, [
    '-ss', String(startSeconds),
    '-i', videoPath,
    '-t', String(Math.max(1, endSeconds - startSeconds)),
    '-c', 'copy',
    '-avoid_negative_ts', 'make_zero',
    '-movflags', 'frag_keyframe+empty_moov',
    '-f', 'mp4',
    'pipe:1',
  ], { stdio: ['ignore', 'pipe', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', (d) => { stderr = (stderr + d).slice(-2000) })
  const done = new Promise<void>((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.trim().split('\n').pop()}`))))
  })
  return { stream: child.stdout, done }
}

// Vercel's /tmp is ~512MB (measured, see TODOS.md) and the source video
// itself can be up to ~480MB, so a room clip often can't be written next to
// it (measured on 9355 Sylvia: a 447MB segment's 2:22 utility-room clip is
// 246MB). Checked per clip against a size estimate proportional to the
// clip's share of the source's duration, plus 20% headroom; a clip that
// won't fit goes through cutClipToStream instead of risking a mid-write
// ENOSPC.
export async function hasTmpSpaceFor(estimatedBytes: number): Promise<boolean> {
  try {
    const stats = await statfs(tmpdir())
    return stats.bavail * stats.bsize > estimatedBytes * 1.2
  } catch {
    return false
  }
}
