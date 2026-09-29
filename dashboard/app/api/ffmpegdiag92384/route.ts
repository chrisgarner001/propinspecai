// TEMPORARY diagnostic route -- re-investigating still-frame extraction
// after the 2026-09-24 fix (allowScripts + serverExternalPackages +
// outputFileTracingIncludes for ffmpeg-static). All 88 line items for the
// "9355 Sylvia" inspection have still_image_file=null despite that fix
// being confirmed intact in git history and working locally against a real
// production video. Checking whether the CURRENT deployed function still
// has a working ffmpeg binary. Delete once the investigation concludes.
import { existsSync, statSync, createWriteStream } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { pipeline } from 'node:stream/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import ffmpegPath from 'ffmpeg-static'
import { google } from 'googleapis'
import { extractFrame, uploadStill, getVideoCreationTime } from '@/lib/stills'

const execFileAsync = promisify(execFile)

export async function GET(req: Request) {
  const result: Record<string, unknown> = {
    ffmpegPath,
    platform: process.platform,
  }

  if (ffmpegPath) {
    result.exists = existsSync(ffmpegPath)
    if (result.exists) {
      try {
        const st = statSync(ffmpegPath)
        result.stat = { size: st.size, mode: st.mode.toString(8) }
      } catch (err) {
        result.statError = (err as Error).message
      }
      try {
        await execFileAsync(ffmpegPath, ['-version'])
        result.execOk = true
      } catch (err) {
        result.execOk = false
        result.execError = {
          message: (err as Error).message,
          code: (err as NodeJS.ErrnoException).code,
          stderr: (err as { stderr?: string }).stderr?.slice(0, 500),
        }
      }
    }
  } else {
    result.ffmpegPathIsFalsy = true
  }

  // Real end-to-end reproduction on the LIVE deployed function -- a small
  // real segment file (198MB, plenty of /tmp margin) from the actual
  // "9355 Sylvia" inspection that produced zero stills.
  const driveFileId = new URL(req.url).searchParams.get('fileId')
  if (driveFileId) {
    const localPath = join(tmpdir(), `diag-e2e-${randomUUID()}.mp4`)
    try {
      const auth = new google.auth.GoogleAuth({
        credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!),
        scopes: ['https://www.googleapis.com/auth/drive'],
      })
      const drive = google.drive({ version: 'v3', auth })
      const res = await drive.files.get({ fileId: driveFileId, alt: 'media', supportsAllDrives: true }, { responseType: 'stream' })
      await pipeline(res.data as NodeJS.ReadableStream, createWriteStream(localPath))
      result.e2eDownloadOk = true

      try {
        const creationTime = await getVideoCreationTime(localPath)
        result.e2eCreationTime = creationTime
      } catch (err) {
        result.e2eCreationTimeError = (err as Error).message
      }

      try {
        const frame = await extractFrame(localPath, 5)
        result.e2eExtractFrameOk = true
        result.e2eFrameBytes = frame.length
        try {
          const url = await uploadStill(frame, `diag-e2e-${randomUUID()}.jpg`)
          result.e2eUploadStillOk = true
          result.e2eUrl = url
        } catch (err) {
          result.e2eUploadStillOk = false
          result.e2eUploadStillError = (err as Error).message
        }
      } catch (err) {
        result.e2eExtractFrameOk = false
        result.e2eExtractFrameError = (err as Error).message
      }
    } catch (err) {
      result.e2eDownloadOk = false
      result.e2eDownloadError = (err as Error).message
    } finally {
      await unlink(localPath).catch(() => {})
    }
  }

  return Response.json(result)
}
