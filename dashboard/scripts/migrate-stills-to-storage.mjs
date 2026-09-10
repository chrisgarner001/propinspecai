// One-off: uploads existing local public/stills/*.jpg (from before Supabase
// Storage was wired up) to the "inspection-stills" bucket, and repoints
// line_items.still_image_file from the old local /stills/<id>.jpg path to
// the new public Storage URL. Safe to re-run -- only touches rows still
// pointing at a local path.
import postgres from 'postgres'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { getSupabaseAdmin, ensureStillsBucket, STILLS_BUCKET } from './lib/supabase-admin.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dashboardRoot = join(__dirname, '..')
const stillsDir = join(dashboardRoot, 'public', 'stills')

const envLine = readFileSync(join(dashboardRoot, '.env.local'), 'utf-8')
  .split('\n')
  .find((l) => l.startsWith('DATABASE_URL='))
const url = envLine.slice('DATABASE_URL='.length).trim()
const sql = postgres(url, { ssl: 'require' })

const supabase = getSupabaseAdmin()
await ensureStillsBucket(supabase)

const rows = await sql`
  select id, still_image_file
  from line_items
  where still_image_file like '/stills/%'
`

console.log(`${rows.length} row(s) still pointing at a local path.`)

let migrated = 0
let skipped = 0

for (const row of rows) {
  const localPath = join(stillsDir, `${row.id}.jpg`)
  if (!existsSync(localPath)) {
    console.log(`  skip ${row.id}: local file missing at ${localPath}`)
    skipped++
    continue
  }

  const storagePath = `${row.id}.jpg`
  const fileBuffer = readFileSync(localPath)
  const { error: uploadError } = await supabase.storage
    .from(STILLS_BUCKET)
    .upload(storagePath, fileBuffer, { contentType: 'image/jpeg', upsert: true })
  if (uploadError) {
    console.log(`  upload failed for ${row.id}: ${uploadError.message}`)
    skipped++
    continue
  }

  const { data: publicUrlData } = supabase.storage.from(STILLS_BUCKET).getPublicUrl(storagePath)
  await sql`update line_items set still_image_file = ${publicUrlData.publicUrl} where id = ${row.id}`
  console.log(`  migrated ${row.id} -> ${publicUrlData.publicUrl}`)
  migrated++
}

console.log(`Done. Migrated ${migrated}, skipped ${skipped}.`)
await sql.end()
