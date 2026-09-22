// Imports the real Home Depot Pro Xtra purchase-history CSV
// (docs/designs/propinspec-cost-history.md): every row lands in
// home_depot_purchase_history (raw audit table), then SKU-level aggregates
// (most recent price, purchase count, min/max) upsert into
// cost_book_materials, with an embedding generated per SKU whose
// description changed. Safe to re-run on the same or an overlapping CSV --
// the raw table's unique constraint dedupes, and the aggregate upsert just
// recomputes from whatever's in the raw table.
//
// Usage: node scripts/import-cost-history.mjs <path-to-csv>
import postgres from 'postgres'
import { parse } from 'csv-parse/sync'
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

const csvPath = process.argv[2]
if (!csvPath) {
  console.error('Usage: node scripts/import-cost-history.mjs <path-to-csv>')
  process.exit(1)
}

const sql = postgres(DATABASE_URL, { ssl: 'require' })
const genai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null

function toNumberOrNull(value) {
  if (value === undefined || value === null || value === '') return null
  const n = Number(String(value).replace(/[$,]/g, ''))
  return Number.isNaN(n) ? null : n
}

function toIntOrNull(value) {
  const n = toNumberOrNull(value)
  return n === null ? null : Math.round(n)
}

async function embedDocument(text) {
  if (!genai) return null
  try {
    const result = await genai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text,
      config: { outputDimensionality: OUTPUT_DIMENSIONALITY, taskType: 'RETRIEVAL_DOCUMENT' },
    })
    const values = result.embeddings?.[0]?.values
    if (!values || values.length !== OUTPUT_DIMENSIONALITY) return null
    return `[${values.join(',')}]`
  } catch (err) {
    console.error(`  embedding failed: ${err.message}`)
    return null
  }
}

try {
  if (!DATABASE_URL) throw new Error('DATABASE_URL is not set')
  if (!GEMINI_API_KEY) console.error('WARNING: GEMINI_API_KEY not set -- importing without embeddings (run the backfill script later)')

  console.log(`Reading ${csvPath}...`)
  const raw = readFileSync(csvPath, 'utf-8')
  // The real export has a 5-line metadata preamble (Company Name/Phone
  // Number/Source/Date Range/Export Date) plus one blank line before the
  // real header row -- skip_records_with_error would silently drop these
  // as malformed rather than a header, so slice them off explicitly first.
  const lines = raw.split('\n')
  const dataStart = lines.findIndex((l) => l.startsWith('Date,Store Number,Transaction Id'))
  if (dataStart === -1) throw new Error('Could not find the real header row -- CSV format may have changed')
  const csvBody = lines.slice(dataStart).join('\n')

  const records = parse(csvBody, { columns: true, skip_empty_lines: true })
  console.log(`Parsed ${records.length} rows.`)

  const rows = records.map((r) => ({
    purchase_date: r['Date'],
    store_number: r['Store Number'] || null,
    transaction_id: r['Transaction Id'],
    register_number: r['Register Number'],
    job_name: r['Job Name'] || null,
    sku_number: r['SKU Number'],
    sku_description: r['SKU Description'],
    quantity: toIntOrNull(r['Quantity']),
    original_unit_price: toNumberOrNull(r['Original Unit Price']),
    department_name: r['Department Name'] || null,
    class_name: r['Class Name'] || null,
    subclass_name: r['Subclass Name'] || null,
    program_discount_amount: toNumberOrNull(r['Program Discount Amount']),
    other_discount_amount: toNumberOrNull(r['Other Discount Amount']),
    extended_retail: toNumberOrNull(r['Extended Retail (before discount)']),
    net_unit_price: toNumberOrNull(r['Net Unit Price']),
  }))

  console.log('Inserting raw rows (batched, on conflict do nothing)...')
  const BATCH_SIZE = 500
  let inserted = 0
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    await sql`
      insert into home_depot_purchase_history ${sql(
        batch,
        'purchase_date',
        'store_number',
        'transaction_id',
        'register_number',
        'job_name',
        'sku_number',
        'sku_description',
        'quantity',
        'original_unit_price',
        'department_name',
        'class_name',
        'subclass_name',
        'program_discount_amount',
        'other_discount_amount',
        'extended_retail',
        'net_unit_price'
      )}
      on conflict (transaction_id, sku_number, register_number) do nothing
    `
    inserted += batch.length
    process.stdout.write(`\r  ${inserted}/${rows.length}`)
  }
  console.log('')

  console.log('Aggregating per-SKU price data (excluding negative/return rows)...')
  const aggregates = await sql`
    select
      sku_number,
      (array_agg(sku_description order by purchase_date desc))[1] as sku_description,
      count(*) as purchase_count,
      min(net_unit_price) as price_min,
      max(net_unit_price) as price_max,
      (array_agg(net_unit_price order by purchase_date desc))[1] as unit_price,
      max(purchase_date) as last_purchased_date
    from home_depot_purchase_history
    where net_unit_price >= 0
    group by sku_number
  `
  console.log(`${aggregates.length} unique SKUs to upsert.`)

  console.log('Upserting into cost_book_materials + generating embeddings for changed descriptions...')
  let processed = 0
  let embedded = 0
  for (const agg of aggregates) {
    const [existing] = await sql`select material_name, embedding from cost_book_materials where sku = ${agg.sku_number}`
    const descriptionChanged = !existing || existing.material_name !== agg.sku_description
    const needsEmbedding = descriptionChanged || existing?.embedding === null

    let embeddingLiteral = null
    if (needsEmbedding) {
      embeddingLiteral = await embedDocument(agg.sku_description)
      if (embeddingLiteral) embedded++
    }

    if (embeddingLiteral) {
      await sql`
        insert into cost_book_materials (material_name, unit_price, source, sku, last_purchased_date, purchase_count, price_min, price_max, embedding)
        values (${agg.sku_description}, ${agg.unit_price}, 'Home Depot', ${agg.sku_number}, ${agg.last_purchased_date}, ${agg.purchase_count}, ${agg.price_min}, ${agg.price_max}, ${embeddingLiteral})
        on conflict (sku) do update set
          material_name = excluded.material_name,
          unit_price = excluded.unit_price,
          last_purchased_date = excluded.last_purchased_date,
          purchase_count = excluded.purchase_count,
          price_min = excluded.price_min,
          price_max = excluded.price_max,
          embedding = excluded.embedding
      `
    } else {
      await sql`
        insert into cost_book_materials (material_name, unit_price, source, sku, last_purchased_date, purchase_count, price_min, price_max)
        values (${agg.sku_description}, ${agg.unit_price}, 'Home Depot', ${agg.sku_number}, ${agg.last_purchased_date}, ${agg.purchase_count}, ${agg.price_min}, ${agg.price_max})
        on conflict (sku) do update set
          material_name = excluded.material_name,
          unit_price = excluded.unit_price,
          last_purchased_date = excluded.last_purchased_date,
          purchase_count = excluded.purchase_count,
          price_min = excluded.price_min,
          price_max = excluded.price_max
      `
    }
    processed++
    if (processed % 50 === 0) process.stdout.write(`\r  ${processed}/${aggregates.length} (${embedded} embedded)`)
  }
  console.log(`\r  ${processed}/${aggregates.length} (${embedded} embedded)`)
  console.log('Done.')
} catch (err) {
  console.error('Import FAILED:', err)
  process.exitCode = 1
} finally {
  await sql.end()
}
