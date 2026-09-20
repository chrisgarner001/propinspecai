// Bulk-item auto-fill matching (docs/designs/quote-sheet-bulk-item-auto-fill.md,
// v1 wedge of "Auto Process Quote"). Plain sync helpers, kept out of
// app/actions.ts because a 'use server' file requires every export to be an
// async function -- these are shared as-is between the Quote Sheet page's
// render-time computation and applyBulkMaterialMatches' server-side re-check,
// so both agree on the same rule.
//
// Words come from the SKU field only, not supplier or notes: real usage
// (11020 Brookwood) shows supplier is a generic store name ("Home Depot")
// that never appears in an item name, and notes is freeform explanatory text
// ("light bulbs for replacement") whose filler words would never match either
// -- both would only ever make matching stricter, never better, and drag in
// an ever-growing stopword list to compensate. SKU is the short "what this
// actually is" descriptor ("Light Bulbs", "Caulk - White") and is what an
// item name actually echoes.
//
// Trailing "s" is stripped before comparing (crude but sufficient stemming)
// so "Light Bulbs" matches "Attic Light Bulb". ALL stemmed words must appear
// in the item name: safe-by-default (a specific SKU like "Caulk - White"
// requiring "white" to appear in the item name will under-match rather than
// guess), never a silent wrong write -- the missed case still requires the
// same manual entry the reviewer does today.
function stem(word: string): string {
  return word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word
}

export function significantWords(text: string): string[] {
  return [...new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2)
      .map(stem)
  )]
}

export function matchBulkMaterialCandidates(
  bulkMaterial: { sku: string | null },
  lineItems: { id: string; item: string; supplier: string | null; sku: string | null }[]
) {
  const words = significantWords(bulkMaterial.sku ?? '')
  if (words.length === 0) return []
  return lineItems.filter(
    (li) =>
      !li.supplier &&
      !li.sku &&
      words.every((w) => li.item.toLowerCase().includes(w))
  )
}
