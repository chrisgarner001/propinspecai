import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function readEnvLocal(key) {
  const env = readFileSync(join(__dirname, '../../.env.local'), 'utf-8')
  const line = env.split('\n').find((l) => l.startsWith(`${key}=`))
  if (!line) return undefined
  return line.slice(key.length + 1).trim()
}

export const STILLS_BUCKET = 'inspection-stills'

export function getSupabaseAdmin() {
  const url = readEnvLocal('SUPABASE_URL')
  const key = readEnvLocal('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from dashboard/.env.local')
  }
  return createClient(url, key)
}

// Public bucket by design: these are GPM's own inspection evidence photos of
// vacated units, not restricted tenant data (see DESIGN.md Decisions Log,
// 2026-09-10).
export async function ensureStillsBucket(supabase) {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets()
  if (listError) throw listError
  if (buckets?.some((b) => b.name === STILLS_BUCKET)) return

  const { error: createError } = await supabase.storage.createBucket(STILLS_BUCKET, {
    public: true,
  })
  if (createError) throw createError
}
