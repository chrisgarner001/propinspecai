// TEMPORARY diagnostic route -- investigating why still-frame extraction
// stopped producing output in production starting 2026-09-23 (all 21 items
// from that run's video, and all 133 today, have still_image_file=null),
// while the exact same code reproduces successfully against real production
// data when run locally. Checking whether ffmpeg-static's binary actually
// exists and is executable in the deployed Vercel function -- a known,
// documented failure mode for that package on serverless platforms.
// Delete this route once the investigation is done (see 2026-09-24 chat
// with Chris / gstack learnings log).
import { existsSync, statSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import ffmpegPath from 'ffmpeg-static'

const execFileAsync = promisify(execFile)

export async function GET() {
  const result: Record<string, unknown> = {
    ffmpegPath,
    cwd: process.cwd(),
    platform: process.platform,
    arch: process.arch,
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
