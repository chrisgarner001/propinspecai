import postgres from 'postgres'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envLine = readFileSync(join(__dirname, '../.env.local'), 'utf-8')
  .split('\n')
  .find((l) => l.startsWith('DATABASE_URL='))
const url = envLine.slice('DATABASE_URL='.length).trim()

const sql = postgres(url, { ssl: 'require' })

const migrationsDir = join(__dirname, '../supabase/migrations')
const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()

try {
  for (const file of files) {
    console.log(`Running ${file}...`)
    const content = readFileSync(join(migrationsDir, file), 'utf-8')
    await sql.unsafe(content)
    console.log(`  done.`)
  }
  console.log('All migrations applied.')
} catch (err) {
  console.error('Migration FAILED:', err.message)
  process.exitCode = 1
} finally {
  await sql.end()
}
