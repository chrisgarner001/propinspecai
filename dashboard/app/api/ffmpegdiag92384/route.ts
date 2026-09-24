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

  try {
    const { stdout } = await execFileAsync('which', ['ffmpeg'])
    result.systemFfmpegWhich = stdout.trim()
  } catch (err) {
    result.systemFfmpegWhich = null
    result.systemFfmpegWhichError = (err as Error).message
  }
  for (const p of ['/usr/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg']) {
    if (existsSync(p)) {
      result.systemFfmpegFound = p
      break
    }
  }
  try {
    const { readdirSync } = await import('node:fs')
    result.ffmpegStaticDirContents = readdirSync('/ROOT/dashboard/node_modules/ffmpeg-static')
  } catch (err) {
    result.ffmpegStaticDirError = (err as Error).message
  }

  const { readdirSync, existsSync: exists2 } = await import('node:fs')
  const probe = (p: string) => {
    try {
      return { exists: true, entries: readdirSync(p).slice(0, 50) }
    } catch (err) {
      return { exists: exists2(p), error: (err as Error).message }
    }
  }
  result.varTask = probe('/var/task')
  result.varTaskDashboard = probe('/var/task/dashboard')
  result.varTaskDashboardNodeModules = probe('/var/task/dashboard/node_modules')
  result.rootDashboard = probe('/ROOT/dashboard')
  result.rootDashboardNodeModules = probe('/ROOT/dashboard/node_modules')

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
