import postgres from 'postgres'

declare global {
  // eslint-disable-next-line no-var
  var __propinspec_sql: ReturnType<typeof postgres> | undefined
}

function createClient() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL is not set')
  }
  return postgres(url, { ssl: 'require' })
}

// Reuse the connection across hot reloads in dev and across invocations
// on the same serverless instance in production.
export const sql = globalThis.__propinspec_sql ?? createClient()

if (process.env.NODE_ENV !== 'production') {
  globalThis.__propinspec_sql = sql
}
