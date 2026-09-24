// Splits an oversized video (rejected by processNextInspectionVideo's ~400MB
// pre-flight check, app/actions.ts) into fixed-length segments and re-uploads
// them to the same Drive folder, so the app's existing per-video pipeline
// processes each segment normally via its next "Check for new videos" sync.
//
// Manual, operator-run -- not an in-app feature. See the plan-eng-review
// report (main-eng-review-20260924-091853.md) for why this runs locally
// rather than as a Vercel route: Vercel's /tmp (~512MB, measured) can't hold
// the file this is meant to fix, and piping a live Drive download straight
// into ffmpeg is an unproven risk for phone-recorded MOV/MP4 (the moov atom
// commonly sits at the end of the file, which needs a seek ffmpeg can't do
// on a non-seekable pipe).
//
// Usage: node scripts/split-video.mjs <inspection_videos row id>
import postgres from 'postgres'
import { google } from 'googleapis'
import { readFileSync, createReadStream, createWriteStream, readdirSync, unlinkSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, basename } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { pipeline } from 'node:stream/promises'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import ffmpegPath from 'ffmpeg-static'

const execFileAsync = promisify(execFile)
const __dirname = dirname(fileURLToPath(import.meta.url))

// ~5min segments via ffmpeg's own segment muxer -- fixed time-based split,
// not silence-aware (plan-eng-review D3). Revisit only if real split output
// shows a real line-item-quality problem at seams.
const SEGMENT_SECONDS = 300

// The one function with real data-loss consequences if wrong -- it gates
// deleting the only copy of the original video. Kept pure and exported so it
// can be unit-tested in isolation (plan-eng-review D4).
export function allUploadsConfirmed(results) {
  return results.length > 0 && results.every((r) => typeof r?.fileId === 'string' && r.fileId.length > 0)
}

function loadEnv() {
  const envContent = readFileSync(join(__dirname, '../.env.local'), 'utf-8')
  const envVar = (name) => envContent.split('\n').find((l) => l.startsWith(`${name}=`))?.slice(name.length + 1).trim()
  const DATABASE_URL = envVar('DATABASE_URL')
  const GOOGLE_SERVICE_ACCOUNT_JSON = envVar('GOOGLE_SERVICE_ACCOUNT_JSON')
  if (!DATABASE_URL) throw new Error('DATABASE_URL is not set')
  if (!GOOGLE_SERVICE_ACCOUNT_JSON) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set')
  return { DATABASE_URL, GOOGLE_SERVICE_ACCOUNT_JSON }
}

async function main() {
  const rowId = process.argv[2]
  if (!rowId) {
    throw new Error('Usage: node scripts/split-video.mjs <inspection_videos row id>')
  }

  const { DATABASE_URL, GOOGLE_SERVICE_ACCOUNT_JSON } = loadEnv()
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON),
    scopes: ['https://www.googleapis.com/auth/drive'],
  })
  const drive = google.drive({ version: 'v3', auth })
  const sql = postgres(DATABASE_URL, { ssl: 'require' })

  try {
    const [row] = await sql`
      select id, inspection_id, drive_file_id, filename, status, error_message
      from inspection_videos where id = ${rowId}
    `
    if (!row) throw new Error(`No inspection_videos row found for id ${rowId}`)

    // Guard: only run against a row that actually failed the size pre-flight
    // check (app/actions.ts:1288-1293's exact message pattern) -- never a
    // Drive-permissions failure or any other unrelated error, where
    // splitting would be pointless or the file id might not be safe to trust.
    if (row.status !== 'failed' || !row.error_message?.includes('too large')) {
      throw new Error(
        `Row ${rowId} (${row.filename}) status=${row.status} error_message=${JSON.stringify(row.error_message)} ` +
        `does not match the "too large" rejection -- refusing to run. This tool only handles oversized-video rejections.`
      )
    }

    console.log(`Splitting ${row.filename} (row ${rowId})...`)

    const { data: fileMeta } = await drive.files.get({
      fileId: row.drive_file_id,
      supportsAllDrives: true,
      fields: 'parents',
    })
    const parentId = fileMeta.parents?.[0]
    if (!parentId) throw new Error(`Could not resolve a parent Drive folder for ${row.drive_file_id}`)

    const localPath = join(tmpdir(), `propinspec-split-${randomUUID()}.mp4`)
    console.log('Downloading original from Drive...')
    try {
      const res = await drive.files.get(
        { fileId: row.drive_file_id, alt: 'media', supportsAllDrives: true },
        { responseType: 'stream' },
      )
      await pipeline(res.data, createWriteStream(localPath))
    } catch (err) {
      try { unlinkSync(localPath) } catch {}
      throw new Error(`Download failed: ${err.message}`)
    }

    console.log('Splitting with ffmpeg...')
    if (!ffmpegPath) throw new Error('ffmpeg-static did not resolve a binary path')

    const baseName = row.filename.replace(/\.[^.]+$/, '')
    const segmentToken = randomUUID()
    const segmentPrefix = `propinspec-split-${segmentToken}-`
    const segmentPattern = join(tmpdir(), `${segmentPrefix}%03d.mp4`)
    try {
      await execFileAsync(ffmpegPath, [
        '-i', localPath,
        '-f', 'segment',
        '-segment_time', String(SEGMENT_SECONDS),
        '-reset_timestamps', '1',
        '-c', 'copy',
        segmentPattern,
      ])
    } catch (err) {
      unlinkSync(localPath)
      throw new Error(`ffmpeg split failed: ${err.message}`)
    }

    const segmentDir = dirname(segmentPattern)
    const segmentFiles = readdirSync(segmentDir)
      .filter((f) => f.startsWith(segmentPrefix))
      .sort()
      .map((f) => join(segmentDir, f))

    // Guard: a corrupt/truncated download can make ffmpeg exit 0 with zero
    // real output. Without this check, allUploadsConfirmed() below would
    // vacuously pass on an empty array.
    if (segmentFiles.length === 0) {
      unlinkSync(localPath)
      throw new Error('ffmpeg produced zero segments -- aborting before any Drive write.')
    }
    console.log(`Produced ${segmentFiles.length} segment(s).`)

    console.log('Uploading segments to Drive...')
    const uploadResults = []
    for (const [i, segPath] of segmentFiles.entries()) {
      const segmentName = `${baseName}-part${i + 1}.mp4`
      try {
        const upload = await drive.files.create({
          requestBody: { name: segmentName, parents: [parentId] },
          media: { mimeType: 'video/mp4', body: createReadStream(segPath) },
          fields: 'id',
          supportsAllDrives: true,
        })
        uploadResults.push({ fileId: upload.data.id, name: segmentName })
        console.log(`  uploaded ${segmentName} -> ${upload.data.id}`)
      } catch (err) {
        uploadResults.push({ fileId: null, name: segmentName, error: err.message })
        console.error(`  FAILED ${segmentName}: ${err.message}`)
      }
    }

    for (const segPath of segmentFiles) {
      try { unlinkSync(segPath) } catch {}
    }
    try { unlinkSync(localPath) } catch {}

    // Only delete the original once every segment is confirmed uploaded -- a
    // partial failure here leaves the original Drive file and the failed DB
    // row untouched, safe to re-run.
    if (!allUploadsConfirmed(uploadResults)) {
      throw new Error(
        'Not all segments uploaded successfully -- leaving the original file and DB row untouched. ' +
        'Fix the error above and re-run this script.'
      )
    }

    console.log('All segments confirmed. Deleting original...')
    await drive.files.delete({ fileId: row.drive_file_id, supportsAllDrives: true })
    await sql`delete from inspection_videos where id = ${rowId}`

    console.log(
      `Done. ${uploadResults.length} segment(s) uploaded, original deleted. ` +
      `Run "Check for new videos" on the inspection to pick them up.`
    )
  } finally {
    await sql.end()
  }
}

if (basename(process.argv[1] ?? '') === 'split-video.mjs') {
  main().catch((err) => {
    console.error(err.message)
    process.exitCode = 1
  })
}
