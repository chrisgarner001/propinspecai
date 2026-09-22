import 'server-only'
import { GoogleGenAI } from '@google/genai'

// Separate from lib/gemini.ts's generative MODEL/getClient() -- this is a
// distinct API surface (embedContent, not generateContent) with its own
// model id and no reason to share a client instance across request shapes.
const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001'
const OUTPUT_DIMENSIONALITY = 768

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set')
  return new GoogleGenAI({ apiKey })
}

// RETRIEVAL_DOCUMENT for text being stored/indexed (cost_book_materials
// rows); RETRIEVAL_QUERY for text being searched with (a Quote Sheet item
// name at suggest-time) -- Google's documented asymmetric embedding pattern
// for retrieval. Returns null on any failure rather than throwing: callers
// (the import script, the Quote Sheet suggestion lookup) both treat "no
// embedding" as a normal, handled case -- see docs/designs/propinspec-cost-history.md.
export async function embedText(
  text: string,
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'
): Promise<number[] | null> {
  try {
    const client = getClient()
    const result = await client.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text,
      config: { outputDimensionality: OUTPUT_DIMENSIONALITY, taskType },
    })
    const values = result.embeddings?.[0]?.values
    if (!values || values.length !== OUTPUT_DIMENSIONALITY) return null
    return values
  } catch (err) {
    console.error('embedText failed:', err)
    return null
  }
}

// pgvector's `vector` type takes a literal like '[0.1,0.2,...]' -- the
// `postgres` package doesn't have a native vector type, so query sites pass
// this string via sql.unsafe/a raw cast rather than binding a JS array.
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`
}
