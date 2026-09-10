// Extracts one still frame per line item from its source video, at the
// midpoint of source_timestamp, using ffmpeg, then uploads it to the public
// "inspection-stills" Supabase Storage bucket and sets
// line_items.still_image_file to its public URL -- works identically in
// local dev and on Vercel since it's a real external URL either way.
//
// Video files live in a per-job folder at the repo root named "<job_number>
// <inspector> <date>" (matches the existing "121939 Chuck 9-8-26" convention
// from the design doc). Only line items with a source_video_file, a parsable
// source_timestamp, and no still_image_file yet are processed -- safe to
// re-run.
import postgres from 'postgres'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { getSupabaseAdmin, ensureStillsBucket, STILLS_BUCKET } from './lib/supabase-admin.mjs'

const execFileAsync = promisify(execFile)

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '../..')
const dashboardRoot = join(__dirname, '..')
// Local copy kept for convenience (offline viewing, debugging) -- gitignored,
// not the source of truth for the app. The DB stores the Storage public URL.
const stillsDir = join(dashboardRoot, 'public', 'stills')
mkdirSync(stillsDir, { recursive: true })

const envLine = readFileSync(join(dashboardRoot, '.env.local'), 'utf-8')
  .split('\n')
  .find((l) => l.startsWith('DATABASE_URL='))
const url = envLine.slice('DATABASE_URL='.length).trim()
const sql = postgres(url, { ssl: 'require' })

const supabase = getSupabaseAdmin()
await ensureStillsBucket(supabase)

function parseTimestamp(raw) {
  // "0:01-0:40" -> midpoint seconds. "Clip 2, 0:20-0:29" -> strip the "Clip N," prefix first.
  const cleaned = raw.replace(/^Clip\s*\d+,\s*/i, '')
  const [startStr, endStr] = cleaned.split('-').map((s) => s.trim())
  const toSeconds = (t) => {
    const parts = t.split(':').map(Number)
    return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1]
  }
  const start = toSeconds(startStr)
  const end = endStr ? toSeconds(endStr) : start
  return (start + end) / 2
}

function findJobFolder(jobNumber) {
  const entries = readdirSync(repoRoot, { withFileTypes: true })
  const match = entries.find((e) => e.isDirectory() && e.name.startsWith(jobNumber))
  return match ? join(repoRoot, match.name) : null
}

const rows = await sql`
  select li.id, li.source_video_file, li.source_timestamp, i.job_number
  from line_items li
  join inspections i on i.id = li.inspection_id
  where li.source_video_file is not null
    and li.source_timestamp is not null
    and li.still_image_file is null
`

console.log(`${rows.length} line item(s) to process.`)

let extracted = 0
let skipped = 0

for (const row of rows) {
  const folder = findJobFolder(row.job_number)
  if (!folder) {
    console.log(`  skip ${row.id}: no folder found for job ${row.job_number}`)
    skipped++
    continue
  }
  const videoPath = join(folder, row.source_video_file)
  if (!existsSync(videoPath)) {
    console.log(`  skip ${row.id}: video not found at ${videoPath}`)
    skipped++
    continue
  }

  let seconds
  try {
    seconds = parseTimestamp(row.source_timestamp)
  } catch {
    console.log(`  skip ${row.id}: unparsable timestamp "${row.source_timestamp}"`)
    skipped++
    continue
  }

  const outFile = join(stillsDir, `${row.id}.jpg`)
  try {
    await execFileAsync('ffmpeg', [
      '-y',
      '-ss', String(seconds),
      '-i', videoPath,
      '-frames:v', '1',
      '-q:v', '3',
      outFile,
    ])

    const storagePath = `${row.id}.jpg`
    const fileBuffer = readFileSync(outFile)
    const { error: uploadError } = await supabase.storage
      .from(STILLS_BUCKET)
      .upload(storagePath, fileBuffer, { contentType: 'image/jpeg', upsert: true })
    if (uploadError) throw uploadError

    const { data: publicUrlData } = supabase.storage.from(STILLS_BUCKET).getPublicUrl(storagePath)
    await sql`update line_items set still_image_file = ${publicUrlData.publicUrl} where id = ${row.id}`
    console.log(`  extracted ${row.id} from ${row.source_video_file} @ ${seconds.toFixed(1)}s -> ${publicUrlData.publicUrl}`)
    extracted++
  } catch (err) {
    console.log(`  failed for ${row.id}: ${err.message}`)
    skipped++
  }
}

console.log(`Done. Extracted ${extracted}, skipped ${skipped}.`)
await sql.end()
