// Vitest runs standalone (unlike `next dev`/`next build`, which load
// .env.local automatically) -- load it here so tests see DATABASE_URL etc.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
// Registers jest-dom's matchers (toBeInTheDocument, etc.) globally -- safe
// to import even for node-environment tests, it only extends `expect`
// (plan-eng-review, 2026-09-28, added for VideoProcessingPanel.test.tsx).
import '@testing-library/jest-dom/vitest'

const envPath = join(__dirname, '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (match && !(match[1] in process.env)) {
      process.env[match[1]] = match[2]
    }
  }
}
