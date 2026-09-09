import postgres from 'postgres'

declare global {
  // eslint-disable-next-line no-var
  var __propinspec_sql: ReturnType<typeof postgres> | undefined
}

// Lazy singleton: getSql() must be called inside a request/action, never at
// module scope. Next.js's build-time "collect page data" phase imports every
// page module (across several parallel workers) just to inspect its exports
// (e.g. `dynamic`) -- it never calls queries. Eagerly opening a real network
// connection at import time caused every worker to hang/retry until the
// build process ran out of memory.
export function getSql(): ReturnType<typeof postgres> {
  if (!globalThis.__propinspec_sql) {
    const url = process.env.DATABASE_URL
    if (!url) {
      throw new Error('DATABASE_URL is not set')
    }
    globalThis.__propinspec_sql = postgres(url, { ssl: 'require' })
  }
  return globalThis.__propinspec_sql
}
