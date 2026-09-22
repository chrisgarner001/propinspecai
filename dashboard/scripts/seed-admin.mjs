// One-time bootstrap: creates the first Admin account once /setup/users
// itself becomes gated by the auth system it's meant to manage (the
// chicken-and-egg problem docs/designs/propinspec-authentication.md's
// Bootstrap Open Question flags). Reusable for a fresh environment/database.
//
// Usage: node scripts/seed-admin.mjs <email> <password>
import postgres from 'postgres'
import bcrypt from 'bcryptjs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envLine = readFileSync(join(__dirname, '../.env.local'), 'utf-8')
  .split('\n')
  .find((l) => l.startsWith('DATABASE_URL='))
const url = envLine.slice('DATABASE_URL='.length).trim()

const [, , email, password] = process.argv
if (!email || !email.includes('@') || !password || password.length < 8) {
  console.error('Usage: node scripts/seed-admin.mjs <email> <password>')
  console.error('  password must be at least 8 characters')
  process.exit(1)
}

const sql = postgres(url, { ssl: 'require' })

try {
  const normalizedEmail = email.trim().toLowerCase()
  const passwordHash = await bcrypt.hash(password, 12)
  const [existing] = await sql`select id from users where email = ${normalizedEmail}`
  if (existing) {
    console.error(`A user with email ${normalizedEmail} already exists (id ${existing.id}).`)
    console.error('This script only creates new accounts -- use Manage Users to edit an existing one.')
    process.exitCode = 1
  } else {
    const [row] = await sql`
      insert into users (email, password_hash, role)
      values (${normalizedEmail}, ${passwordHash}, 'Admin')
      returning id
    `
    console.log(`Created Admin account ${normalizedEmail} (id ${row.id}).`)
  }
} finally {
  await sql.end()
}
