// One-off backfill for inspection_videos rows synced before size_bytes
// existed (docs/designs/propinspec plan-eng-review, 2026-09-24). Re-syncing
// via "Check for new videos" does NOT populate this column for already-
// tracked rows (syncInspectionVideos's insert uses on conflict do nothing),
// so this script closes that gap by re-fetching each row's real size
// directly from Drive. Idempotent -- only touches rows with size_bytes
// still null. A row whose Drive file has since been deleted/moved is
// skipped and logged, not a hard failure, same shape as
// backfill-still-timestamps.mjs.
//
// Usage: node scripts/backfill-video-sizes.mjs
import postgres from 'postgres'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { google } from 'googleapis'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envContent = readFileSync(join(__dirname, '../.env.local'), 'utf-8')
const envVar = (name) => envContent.split('\n').find((l) => l.startsWith(`${name}=`))?.slice(name.length + 1).trim()
const DATABASE_URL = envVar('DATABASE_URL')
const GOOGLE_SERVICE_ACCOUNT_JSON = envVar('GOOGLE_SERVICE_ACCOUNT_JSON')

if (!GOOGLE_SERVICE_ACCOUNT_JSON) {
  console.error('GOOGLE_SERVICE_ACCOUNT_JSON is not set')
  process.exit(1)
}

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON),
  scopes: ['https://www.googleapis.com/auth/drive'],
})
const drive = google.drive({ version: 'v3', auth })

const sql = postgres(DATABASE_URL, { ssl: 'require' })

try {
  const rows = await sql`select id, drive_file_id, filename from inspection_videos where size_bytes is null`
  console.log(`${rows.length} rows missing size_bytes.`)

  let done = 0
  let skipped = 0
  for (const row of rows) {
    try {
      const res = await drive.files.get({ fileId: row.drive_file_id, supportsAllDrives: true, fields: 'size' })
      if (!res.data.size) throw new Error('Drive returned no size for this file')
      await sql`update inspection_videos set size_bytes = ${Number(res.data.size)} where id = ${row.id}`
      done++
    } catch (err) {
      console.error(`  ${row.filename} (${row.id}): ${err.message}`)
      skipped++
    }
  }
  console.log(`Backfilled ${done}, skipped ${skipped}.`)
} finally {
  await sql.end()
}
