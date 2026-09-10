// Uploads each unique source_video_file referenced by line_items (that don't
// already have a source_video_drive_file_id) to a dedicated "Inspection
// Videos" subfolder inside the matching property's Shared Drive folder, then
// sets source_video_drive_file_id on every row sharing that filename.
//
// Videos go via the Drive API directly (large-file uploads, no comparable
// project-wide size cap to Supabase Storage's default 50MB limit -- a real
// 162MB clip 413'd there during testing, see DESIGN.md Decisions Log). A
// dedicated subfolder keeps raw clips out of the property folder's existing
// long-lived document archive (work orders, bills, tax records).
import postgres from 'postgres'
import { google } from 'googleapis'
import { readFileSync, existsSync, createReadStream, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '../..')
const dashboardRoot = join(__dirname, '..')

const envContent = readFileSync(join(dashboardRoot, '.env.local'), 'utf-8')
function envVar(key) {
  const line = envContent.split('\n').find((l) => l.startsWith(`${key}=`))
  if (!line) throw new Error(`${key} missing from .env.local`)
  return line.slice(key.length + 1).trim()
}

const sql = postgres(envVar('DATABASE_URL'), { ssl: 'require' })
const serviceAccountKey = JSON.parse(envVar('GOOGLE_SERVICE_ACCOUNT_JSON'))

const auth = new google.auth.GoogleAuth({
  credentials: serviceAccountKey,
  scopes: ['https://www.googleapis.com/auth/drive'],
})
const drive = google.drive({ version: 'v3', auth })

function findJobFolder(jobNumber) {
  const entries = readdirSync(repoRoot, { withFileTypes: true })
  const match = entries.find((e) => e.isDirectory() && e.name.startsWith(jobNumber))
  return match ? join(repoRoot, match.name) : null
}

function parseStreetAddress(propertyAddress) {
  const streetPart = propertyAddress.split(',')[0].trim()
  const match = streetPart.match(/^(\d+)\s+(.+)$/)
  if (!match) return null
  return { number: match[1], streetName: match[2].trim() }
}

async function findPropertyFolder(streetName, streetNumber) {
  const { data } = await drive.drives.list({ pageSize: 20 })
  const propertyDrives = (data.drives ?? []).filter((d) => d.name?.startsWith('Property Files'))
  for (const propDrive of propertyDrives) {
    const res = await drive.files.list({
      q: `mimeType = 'application/vnd.google-apps.folder' and name contains '${streetName.replace(/'/g, "\\'")}'`,
      corpora: 'drive',
      driveId: propDrive.id,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      fields: 'files(id, name)',
    })
    const match = (res.data.files ?? []).find((f) => f.name?.includes(streetNumber))
    if (match) return { folderId: match.id, driveId: propDrive.id }
  }
  return null
}

async function findOrCreateVideosSubfolder(propertyFolderId, driveId) {
  const res = await drive.files.list({
    q: `'${propertyFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = 'Inspection Videos'`,
    corpora: 'drive',
    driveId,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    fields: 'files(id)',
  })
  if (res.data.files?.length) return res.data.files[0].id

  const created = await drive.files.create({
    requestBody: {
      name: 'Inspection Videos',
      mimeType: 'application/vnd.google-apps.folder',
      parents: [propertyFolderId],
    },
    fields: 'id',
    supportsAllDrives: true,
  })
  return created.data.id
}

// One row per (inspection, source_video_file) so each unique clip uploads once.
const rows = await sql`
  select distinct on (li.inspection_id, li.source_video_file)
    li.inspection_id, li.source_video_file, i.job_number, i.property_address
  from line_items li
  join inspections i on i.id = li.inspection_id
  where li.source_video_file is not null
    and li.source_video_drive_file_id is null
`

console.log(`${rows.length} unique video file(s) to upload.`)

let uploaded = 0
let skipped = 0

for (const row of rows) {
  const jobFolder = findJobFolder(row.job_number)
  if (!jobFolder) {
    console.log(`  skip ${row.source_video_file}: no local folder for job ${row.job_number}`)
    skipped++
    continue
  }
  const videoPath = join(jobFolder, row.source_video_file)
  if (!existsSync(videoPath)) {
    console.log(`  skip ${row.source_video_file}: not found at ${videoPath}`)
    skipped++
    continue
  }

  const parsed = parseStreetAddress(row.property_address)
  if (!parsed) {
    console.log(`  skip ${row.source_video_file}: could not parse address "${row.property_address}"`)
    skipped++
    continue
  }

  const folder = await findPropertyFolder(parsed.streetName, parsed.number)
  if (!folder) {
    console.log(`  skip ${row.source_video_file}: no property folder for "${parsed.streetName} ${parsed.number}"`)
    skipped++
    continue
  }

  try {
    const videosFolderId = await findOrCreateVideosSubfolder(folder.folderId, folder.driveId)
    const upload = await drive.files.create({
      requestBody: { name: row.source_video_file, parents: [videosFolderId] },
      media: { mimeType: 'video/mp4', body: createReadStream(videoPath) },
      fields: 'id',
      supportsAllDrives: true,
    })
    const fileId = upload.data.id
    await sql`
      update line_items
      set source_video_drive_file_id = ${fileId}
      where inspection_id = ${row.inspection_id} and source_video_file = ${row.source_video_file}
    `
    console.log(`  uploaded ${row.source_video_file} -> ${fileId}`)
    uploaded++
  } catch (err) {
    console.log(`  failed ${row.source_video_file}: ${err.message}`)
    skipped++
  }
}

console.log(`Done. Uploaded ${uploaded}, skipped ${skipped}.`)
await sql.end()
