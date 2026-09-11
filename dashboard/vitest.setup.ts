// Vitest runs standalone (unlike `next dev`/`next build`, which load
// .env.local automatically) -- load it here so tests see DATABASE_URL etc.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const envPath = join(__dirname, '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (match && !(match[1] in process.env)) {
      process.env[match[1]] = match[2]
    }
  }
}
