import { writeFile, unlink, statfs } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const maxDuration = 60

// Temporary diagnostic (2026-09-24, plan-eng-review large-video architecture):
// Vercel's own docs don't publish an explicit /tmp size number. Writes an
// increasing series of buffers to /tmp until failure, to get a real measured
// ceiling for THIS deployment before committing to a stream-to-disk design.
// Deleted after the real number is captured -- not a permanent route.
export async function GET() {
  const results: string[] = []
  try {
    const fs = await statfs(tmpdir())
    results.push(`statfs: blocks=${fs.blocks} bsize=${fs.bsize} bavail=${fs.bavail} => ~${Math.round((fs.bavail * fs.bsize) / 1024 / 1024)}MB available`)
  } catch (err) {
    results.push(`statfs failed: ${(err as Error).message}`)
  }

  const sizesMB = [100, 300, 500, 512, 700, 900, 1024, 1500, 1900]
  for (const mb of sizesMB) {
    const path = join(tmpdir(), `diag-${mb}mb.bin`)
    try {
      const buf = Buffer.alloc(mb * 1024 * 1024, 1)
      await writeFile(path, buf)
      results.push(`${mb}MB: OK`)
      await unlink(path).catch(() => {})
    } catch (err) {
      results.push(`${mb}MB: FAILED - ${(err as Error).message}`)
      break
    }
  }

  return Response.json({ results })
}
