import postgres from 'postgres'
import { readFileSync } from 'node:fs'

const envLine = readFileSync(new URL('../.env.local', import.meta.url), 'utf-8')
  .split('\n')
  .find((l) => l.startsWith('DATABASE_URL='))
const url = envLine.slice('DATABASE_URL='.length).trim()

const sql = postgres(url, { ssl: 'require' })

try {
  const result = await sql`select 1 as ok`
  console.log('DB connection OK:', result)
} catch (err) {
  console.error('DB connection FAILED:', err.message)
  process.exitCode = 1
} finally {
  await sql.end()
}
