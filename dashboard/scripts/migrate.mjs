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
  await sql`
    create table if not exists schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )
  `

  const applied = new Set(
    (await sql`select filename from schema_migrations`).map((r) => r.filename)
  )

  let ranAny = false
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`Skipping ${file} (already applied).`)
      continue
    }
    console.log(`Running ${file}...`)
    const content = readFileSync(join(migrationsDir, file), 'utf-8')
    await sql.unsafe(content)
    await sql`insert into schema_migrations (filename) values (${file})`
    console.log(`  done.`)
    ranAny = true
  }
  console.log(ranAny ? 'All new migrations applied.' : 'Nothing to apply -- up to date.')
} catch (err) {
  console.error('Migration FAILED:', err.message)
  process.exitCode = 1
} finally {
  await sql.end()
}
