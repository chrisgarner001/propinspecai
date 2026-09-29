// TEMPORARY diagnostic route -- re-investigating still-frame extraction
// after the 2026-09-24 fix (allowScripts + serverExternalPackages +
// outputFileTracingIncludes for ffmpeg-static). All 88 line items for the
// "9355 Sylvia" inspection have still_image_file=null despite that fix
// being confirmed intact in git history and working locally against a real
// production video. Checking whether the CURRENT deployed function still
// has a working ffmpeg binary. Delete once the investigation concludes.
import { existsSync, statSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import ffmpegPath from 'ffmpeg-static'

const execFileAsync = promisify(execFile)

export async function GET() {
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

  return Response.json(result)
}
