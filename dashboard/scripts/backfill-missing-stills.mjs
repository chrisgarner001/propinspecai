// One-off backfill for line_items created while ffmpeg-static was silently
// broken in production (investigated 2026-09-24 -- see next.config.ts's
// serverExternalPackages/allowScripts/outputFileTracingIncludes comments).
// Every still extraction since this pipeline's first real production run
// (2026-09-23) failed with ENOENT and was swallowed by its own try/catch
// (still extraction is deliberately best-effort), leaving still_image_file
// null for every affected item. Now that the fix is deployed, re-runs the
// same extraction for each already-created line item, grouped by source
// video so each video is downloaded once regardless of how many items came
// from it. Idempotent -- only touches rows with still_image_file still
// null; a row whose video/timestamp can't produce a still is skipped and
// logged, not a hard failure (same shape as scripts/backfill-video-sizes.mjs).
//
// Usage: node scripts/backfill-missing-stills.mjs [inspection_id]
import postgres from 'postgres'
import { google } from 'googleapis'
import { readFileSync, createWriteStream, unlinkSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { pipeline } from 'node:stream/promises'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import ffmpegPath from 'ffmpeg-static'
import { createClient } from '@supabase/supabase-js'

const execFileAsync = promisify(execFile)
const __dirname = dirname(fileURLToPath(import.meta.url))

const envContent = readFileSync(join(__dirname, '../.env.local'), 'utf-8')
const envVar = (name) => envContent.split('\n').find((l) => l.startsWith(`${name}=`))?.slice(name.length + 1).trim()
const DATABASE_URL = envVar('DATABASE_URL')
const GOOGLE_SERVICE_ACCOUNT_JSON = envVar('GOOGLE_SERVICE_ACCOUNT_JSON')
const SUPABASE_URL = envVar('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = envVar('SUPABASE_SERVICE_ROLE_KEY')

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON),
  scopes: ['https://www.googleapis.com/auth/drive'],
})
const drive = google.drive({ version: 'v3', auth })
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
const sql = postgres(DATABASE_URL, { ssl: 'require' })

// Same parsing rules as lib/stills.ts's parseTimestampSeconds -- duplicated
// here per the established .mjs-can't-import-.ts convention (see
// scripts/upload-videos.mjs / backfill-video-sizes.mjs).
function parseTimestampSeconds(raw) {
  const cleaned = raw.replace(/^Clip\s*\d+,\s*/i, '').trim()
  const [startStr, endStr] = cleaned.split('-').map((s) => s.trim())
  const toSeconds = (t) => {
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

async function getVideoCreationTime(videoPath) {
  let stderr = ''
  try {
    await execFileAsync(ffmpegPath, ['-i', videoPath])
  } catch (err) {
    stderr = err.stderr ?? ''
  }
  const match = stderr.match(/creation_time\s*:\s*(\S+)/)
  if (!match) return null
  const date = new Date(match[1])
  return Number.isNaN(date.getTime()) ? null : date
}

async function extractFrame(videoPath, seconds) {
  const outPath = join(tmpdir(), `propinspec-backfill-still-${randomUUID()}.jpg`)
  try {
    await execFileAsync(ffmpegPath, ['-y', '-ss', String(seconds), '-i', videoPath, '-frames:v', '1', '-q:v', '3', outPath])
    return await readFile(outPath)
  } finally {
    try { unlinkSync(outPath) } catch {}
  }
}

async function uploadStill(frame, storageKey) {
  const { error } = await supabase.storage.from('inspection-stills').upload(storageKey, frame, {
    contentType: 'image/jpeg',
    upsert: true,
  })
  if (error) throw error
  const { data } = supabase.storage.from('inspection-stills').getPublicUrl(storageKey)
  return data.publicUrl
}

async function main() {
  const inspectionId = process.argv[2]
  const rows = await sql`
    select li.id, li.source_video_drive_file_id, li.source_timestamp, li.source_video_file
    from line_items li
    where li.still_image_file is null
      and li.source_video_drive_file_id is not null
      and li.is_manual_addition = false
      ${inspectionId ? sql`and li.inspection_id = ${inspectionId}` : sql``}
    order by li.source_video_drive_file_id, li.created_at
  `
  console.log(`${rows.length} line item(s) missing stills.`)

  const byVideo = new Map()
  for (const row of rows) {
    if (!byVideo.has(row.source_video_drive_file_id)) byVideo.set(row.source_video_drive_file_id, [])
    byVideo.get(row.source_video_drive_file_id).push(row)
  }

  let done = 0
  let skipped = 0
  for (const [driveFileId, items] of byVideo) {
    const localPath = join(tmpdir(), `propinspec-backfill-video-${randomUUID()}.mp4`)
    console.log(`\n${items[0].source_video_file} (${items.length} item(s))...`)
    try {
      const res = await drive.files.get(
        { fileId: driveFileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'stream' },
      )
      await pipeline(res.data, createWriteStream(localPath))
    } catch (err) {
      console.error(`  download failed: ${err.message}`)
      skipped += items.length
      continue
    }

    const creationTime = await getVideoCreationTime(localPath).catch(() => null)

    for (const row of items) {
      const seconds = parseTimestampSeconds(row.source_timestamp)
      if (seconds === null) {
        console.log(`  ${row.id}: unparseable timestamp "${row.source_timestamp}", skipping`)
        skipped++
        continue
      }
      try {
        const frame = await extractFrame(localPath, seconds)
        const url = await uploadStill(frame, `${row.id}.jpg`)
        const capturedAt = creationTime ? new Date(creationTime.getTime() + seconds * 1000) : null
        await sql`update line_items set still_image_file = ${url}, captured_at = ${capturedAt} where id = ${row.id}`
        done++
      } catch (err) {
        console.error(`  ${row.id}: ${err.message}`)
        skipped++
      }
    }

    try { unlinkSync(localPath) } catch {}
  }

  console.log(`\nDone. Backfilled ${done}, skipped ${skipped}.`)
  await sql.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
