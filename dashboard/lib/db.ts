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
    // Connection budget (2026-10-01, 35852 Beverly): DATABASE_URL is
    // Supabase's SESSION-mode pooler, which allows only 15 client
    // connections in total, shared by every Vercel instance, local scripts,
    // and the test suite. postgres.js defaults (max 10 per instance, idle
    // connections never closed) let a few warm instances hold every slot, so
    // the next request failed with EMAXCONNSESSION ("max clients reached"),
    // surfacing as "Not authenticated" from verifySession. Small per-instance
    // pools that release idle connections keep slots free.
    //
    // Production's DATABASE_URL moved to the TRANSACTION-mode pooler (port
    // 6543) the same day: it hands the real database connection back after
    // every transaction, so idle serverless instances no longer hold any of
    // the 15. Transaction mode can't keep prepared statements across
    // requests, hence prepare: false (harmless on the session pooler too,
    // which local scripts and tests still use).
    globalThis.__propinspec_sql = postgres(url, {
      ssl: 'require',
      prepare: false,
      max: process.env.VITEST ? 2 : 3,
      idle_timeout: 20,
      max_lifetime: 60 * 30,
    })
  }
  return globalThis.__propinspec_sql
}
