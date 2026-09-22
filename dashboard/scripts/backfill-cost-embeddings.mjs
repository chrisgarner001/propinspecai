// Re-run after import-cost-history.mjs if any rows landed with
// embedding = null (a transient Gemini failure during the main import,
// see docs/designs/propinspec-cost-history.md's "Embedding failure
// handling"). Idempotent -- only ever touches rows missing an embedding.
//
// Usage: node scripts/backfill-cost-embeddings.mjs
import postgres from 'postgres'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { GoogleGenAI } from '@google/genai'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envContent = readFileSync(join(__dirname, '../.env.local'), 'utf-8')
const envVar = (name) => envContent.split('\n').find((l) => l.startsWith(`${name}=`))?.slice(name.length + 1).trim()
const DATABASE_URL = envVar('DATABASE_URL')
const GEMINI_API_KEY = envVar('GEMINI_API_KEY')
const EMBEDDING_MODEL = envVar('GEMINI_EMBEDDING_MODEL') || 'gemini-embedding-001'
const OUTPUT_DIMENSIONALITY = 768

if (!GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY is not set')
  process.exit(1)
}

const sql = postgres(DATABASE_URL, { ssl: 'require' })
const genai = new GoogleGenAI({ apiKey: GEMINI_API_KEY })

try {
  const rows = await sql`select id, material_name from cost_book_materials where sku is not null and embedding is null`
  console.log(`${rows.length} rows missing an embedding.`)

  let done = 0
  let failed = 0
  for (const row of rows) {
    try {
      const result = await genai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: row.material_name,
        config: { outputDimensionality: OUTPUT_DIMENSIONALITY, taskType: 'RETRIEVAL_DOCUMENT' },
      })
      const values = result.embeddings?.[0]?.values
      if (!values || values.length !== OUTPUT_DIMENSIONALITY) throw new Error('unexpected embedding shape')
      const literal = `[${values.join(',')}]`
      await sql`update cost_book_materials set embedding = ${literal} where id = ${row.id}`
      done++
    } catch (err) {
      console.error(`  ${row.material_name}: ${err.message}`)
      failed++
    }
  }
  console.log(`Backfilled ${done}, still failing ${failed}.`)
} finally {
  await sql.end()
}
