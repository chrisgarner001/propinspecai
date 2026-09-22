// One-off backfill for line_items extracted before captured_at existed
// (docs/designs/propinspec-inspection-type-gallery.md). Idempotent -- only
// ever touches rows with a still but no captured_at yet. Re-downloads each
// row's own source video from Drive (never stored locally after extraction,
// see the design doc's Backfill section), reads its creation_time via
// ffmpeg, and combines it with the row's own already-stored
// source_timestamp offset -- no re-derivation, no Gemini re-call.
//
// A row whose Drive file has since been deleted/moved is skipped and
// logged, not treated as a hard failure -- same shape as
// backfill-cost-embeddings.mjs's own "still failing" count.
//
// Usage: node scripts/backfill-still-timestamps.mjs
import postgres from 'postgres'
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { google } from 'googleapis'
import ffmpegPath from 'ffmpeg-static'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envContent = readFileSync(join(__dirname, '../.env.local'), 'utf-8')
const envVar = (name) => envContent.split('\n').find((l) => l.startsWith(`${name}=`))?.slice(name.length + 1).trim()
const DATABASE_URL = envVar('DATABASE_URL')
const GOOGLE_SERVICE_ACCOUNT_JSON = envVar('GOOGLE_SERVICE_ACCOUNT_JSON')

if (!GOOGLE_SERVICE_ACCOUNT_JSON) {
  console.error('GOOGLE_SERVICE_ACCOUNT_JSON is not set')
  process.exit(1)
}

// Same regex as lib/stills.ts's parseTimestampSeconds -- duplicated, not
// imported, matching this repo's existing scripts/*.mjs convention of
// staying self-contained rather than importing app TypeScript modules
// (see import-cost-history.mjs, which reimplements its own embedding call
// rather than importing lib/embeddings.ts).
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

function getVideoCreationTime(videoPath) {
  let stderr = ''
  try {
    execFileSync(ffmpegPath, ['-i', videoPath], { stdio: ['ignore', 'ignore', 'pipe'] })
  } catch (err) {
    stderr = err.stderr?.toString() ?? ''
  }
  const match = stderr.match(/creation_time\s*:\s*(\S+)/)
  if (!match) return null
  const date = new Date(match[1])
  return Number.isNaN(date.getTime()) ? null : date
}

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON),
  scopes: ['https://www.googleapis.com/auth/drive'],
})
const drive = google.drive({ version: 'v3', auth })

async function downloadDriveFile(fileId) {
  const res = await drive.files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' })
  return Buffer.from(res.data)
}

const sql = postgres(DATABASE_URL, { ssl: 'require' })

try {
  const rows = await sql`
    select id, source_timestamp, source_video_drive_file_id
    from line_items
    where still_image_file is not null and captured_at is null and source_video_drive_file_id is not null
  `
  console.log(`${rows.length} rows missing captured_at.`)

  // Cache one creation_time lookup per video, since several line items
  // typically share the same source clip -- no reason to re-download and
  // re-probe the same file once per row.
  const creationTimeCache = new Map()

  let done = 0
  let skipped = 0
  for (const row of rows) {
    try {
      const seconds = parseTimestampSeconds(row.source_timestamp)
      if (seconds === null) throw new Error('unparsable source_timestamp')

      let creationTime = creationTimeCache.get(row.source_video_drive_file_id)
      if (creationTime === undefined) {
        const buffer = await downloadDriveFile(row.source_video_drive_file_id)
        const videoTempPath = join(tmpdir(), `propinspec-backfill-${randomUUID()}.mp4`)
        writeFileSync(videoTempPath, buffer)
        try {
          creationTime = getVideoCreationTime(videoTempPath)
        } finally {
          unlinkSync(videoTempPath)
        }
        creationTimeCache.set(row.source_video_drive_file_id, creationTime)
      }

      if (!creationTime) throw new Error('video has no creation_time metadata')

      const capturedAt = new Date(creationTime.getTime() + seconds * 1000)
      await sql`update line_items set captured_at = ${capturedAt} where id = ${row.id}`
      done++
    } catch (err) {
      console.error(`  ${row.id}: ${err.message}`)
      skipped++
    }
  }
  console.log(`Backfilled ${done}, skipped ${skipped}.`)
} finally {
  await sql.end()
}
