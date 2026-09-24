import { GoogleGenAI, createPartFromUri, createUserContent, Type, type Schema } from '@google/genai'

// Model is configurable via env var, not hardcoded -- Gemini model ids change
// frequently (2.5 Pro/Flash/Flash-Lite are already scheduled to shut down
// 2026-10-16) and picking a slightly-wrong current id shouldn't require a
// code change, just an env var fix.
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.7-flash'

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set')
  return new GoogleGenAI({ apiKey })
}

// Condition/priority option lists match the existing line_items CHECK
// constraints exactly (supabase/migrations/0001_init.sql) -- the model's
// output is constrained to these via responseSchema enums, not just asked
// for in the prompt text, so a malformed value can't reach the DB insert.
const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    line_items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          room_area: { type: Type.STRING, description: 'Room or area name, e.g. "Living Room", "Kitchen", "Exterior"' },
          item: { type: Type.STRING, description: 'The specific item/component/fixture inspected' },
          condition: { type: Type.STRING, enum: ['Good', 'Fair', 'Damaged', 'Not Rated'] },
          observed_evidence: { type: Type.STRING, description: 'What was actually seen or heard -- concrete, not an interpretation' },
          recommended_action: { type: Type.STRING, description: 'e.g. clean, patch, repair, replace component, further inspection required' },
          trade_category: { type: Type.STRING, description: 'e.g. painting/drywall, flooring, plumbing, electrical, carpentry, HVAC, cleaning, general maintenance' },
          assigned_to: { type: Type.STRING, enum: ['GPM Staff', 'Outside Vendor', 'Other'], description: 'Per the vendor-assignment SOP below' },
          priority: { type: Type.STRING, enum: ['Urgent/Safety', 'Before next occupancy', 'Routine turnover', 'Monitor', 'No action'] },
          source_timestamp: { type: Type.STRING, description: 'Timestamp in the video where this was observed, e.g. "0:42", or "Unable to determine" if not clear' },
        },
        required: ['room_area', 'item', 'condition', 'observed_evidence', 'recommended_action', 'trade_category', 'assigned_to', 'priority', 'source_timestamp'],
      },
    },
  },
  required: ['line_items'],
}

// Adapted from prompts/inspection-report-prompt-v1.md (validated 2026-09-09
// against real footage -- near-perfect match to the official Zinspector
// report for the same property). v1 produced a human-readable multi-section
// markdown report; this keeps its inspection standards, condition
// definitions, and evidence-vs-interpretation discipline verbatim but
// changes the output contract to the JSON schema above, one row per line
// item, so it can be inserted directly. Also folds in rules/vendor-assignment-sop.md
// so assigned_to is derived from the SOP, not guessed -- per that file's own
// instruction, the SOP should never be re-hardcoded elsewhere, so it's fed
// into the classification step itself instead of a separate lookup table.
const PROMPT = `You are an experienced single-family rental property move-out inspector working for a professional property management company. Review this move-out inspection video.

Your findings will support property-condition documentation, repair scoping, and a preliminary rehab estimate. Be detailed, objective, and evidence-based. Do not exaggerate damage, infer facts that are not visible or audible, or make unsupported claims about tenant responsibility.

## Inspection standards

1. Review the complete video, including the inspector's narration.
2. Identify every room, exterior area, closet, hallway, utility area, appliance, fixture, and building component that is meaningfully shown.
3. Keep observations separate from interpretations: observed_evidence is what can actually be seen or heard; recommended_action is what the evidence most likely calls for.
4. Never invent a measurement, material, cause, quantity, room identity, repair method, or condition.
5. If something is unclear, partially obstructed, poorly lit, or not adequately shown, say so in observed_evidence rather than guessing.
6. Do not assume an item is in good condition merely because no problem is mentioned. If it was not adequately inspected, use condition "Not Rated".
7. Do not treat dirt, removable belongings, shadows, reflections, compression artifacts, or poor lighting as physical damage unless the evidence supports that conclusion.
8. Group repeated views of the same issue into one finding rather than counting it multiple times.

## Condition ratings

- Good: Clean and functional, no meaningful damage; minor ordinary signs of use may be present.
- Fair: Noticeable wear, cosmetic deterioration, cleaning needs, or minor maintenance is present, but the item remains generally functional.
- Damaged: Broken, missing, materially stained, heavily deteriorated, unsafe, or nonfunctional, or requires repair or replacement beyond routine turnover work.
- Not Rated: The item or area was not shown clearly enough to assess.

## Vendor assignment SOP (GPM's current policy -- apply exactly, do not improvise)

Outside Vendor, always on rent-ups: painting, flooring repair/replacement, tub tile work or surround replacement, sewer backups, carpet, large drywall work (over one full sheet per area), electrical repairs requiring rewiring or breaker box work, all HVAC work, fence replacement, roofing, structural work, foundation repair, tree removal, landscaping.

GPM Maintenance Staff (default), everything else: minor carpentry and hardware (door/window/blind adjustment or replacement, latches, hinges), small drywall patches (under one full sheet, no full repaint required), minor electrical (outlets, switches, cover plates, fixtures -- not rewiring or breaker box), minor plumbing (not sewer backups), caulking, cleaning, general punch-list items.

Classification notes: painting is vendor-scope as a whole category, not just "large jobs" -- if recommended_action includes repainting a surface, route the whole task to the vendor even if part of it is a GPM-scope patch. Drywall is size-gated: under one sheet with no repaint stays GPM; over one sheet, or any repaint requirement, goes to the vendor. Electrical is scope-gated: securing/cleaning outlets/switches/cover plates is GPM; rewiring or breaker box work is vendor. If a finding is ambiguous or spans both, default to Outside Vendor if any part of the combined job touches a vendor-scope category. Use "Other" only when the item genuinely doesn't fit GPM staff or a normal outside trade vendor (e.g. a specialist evaluation).

## Output

Return one entry per distinct inspected item/finding via the structured schema. Use "Unable to determine" for source_timestamp only when genuinely not clear from the video.`

async function waitForFileActive(client: GoogleGenAI, name: string) {
  let file = await client.files.get({ name })
  const deadline = Date.now() + 4 * 60_000 // Gemini Files typically go ACTIVE in seconds to low minutes for clips this length
  while (file.state === 'PROCESSING') {
    if (Date.now() > deadline) throw new Error('Timed out waiting for the uploaded video to finish processing on Gemini\'s side.')
    await new Promise((r) => setTimeout(r, 3000))
    file = await client.files.get({ name })
  }
  if (file.state === 'FAILED') {
    throw new Error('Gemini failed to process the uploaded video file.')
  }
  return file
}

export type ExtractedLineItem = {
  room_area: string
  item: string
  condition: 'Good' | 'Fair' | 'Damaged' | 'Not Rated'
  observed_evidence: string
  recommended_action: string
  trade_category: string
  assigned_to: 'GPM Staff' | 'Outside Vendor' | 'Other'
  priority: string
  source_timestamp: string
}

// Confirmed live during manual testing (2026-09-11): Gemini returns a real,
// transient 503 "model currently experiencing high demand" under normal
// load, not just a theoretical edge case. Retried with backoff rather than
// failing the whole video on the first overload response.
async function generateContentWithRetry(
  client: GoogleGenAI,
  params: Parameters<GoogleGenAI['models']['generateContent']>[0],
) {
  const maxAttempts = 3
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await client.models.generateContent(params)
    } catch (err) {
      const status = (err as { status?: number })?.status
      const retryable = status === 503 || status === 429
      if (!retryable || attempt === maxAttempts) throw err
      await new Promise((r) => setTimeout(r, 2000 * attempt))
    }
  }
  throw new Error('unreachable') // satisfies TS control-flow analysis; loop always returns or throws
}

// Downloads happen by the caller (Drive access lives in lib/google.ts) --
// takes a path to an already-downloaded file on disk, not a Buffer
// (plan-eng-review, 2026-09-24): the caller streams the video to one shared
// temp file, reused here and for ffmpeg, instead of this function writing
// its own second copy. `client.files.upload` reads the path directly.
export async function extractLineItemsFromVideo(videoPath: string): Promise<ExtractedLineItem[]> {
  const client = getClient()
  const uploaded = await client.files.upload({ file: videoPath, config: { mimeType: 'video/mp4' } })
  if (!uploaded.name) throw new Error('Gemini did not return a file name for the uploaded video.')

  try {
    const file = await waitForFileActive(client, uploaded.name)
    if (!file.uri || !file.mimeType) throw new Error('Gemini file is active but missing a uri/mimeType.')

    const response = await generateContentWithRetry(client, {
      model: MODEL,
      contents: createUserContent([createPartFromUri(file.uri, file.mimeType), PROMPT]),
      config: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    })

    const text = response.text
    if (!text) throw new Error('Gemini returned an empty response.')

    let parsed: { line_items: ExtractedLineItem[] }
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new Error('Gemini returned a response that was not valid JSON.')
    }
    if (!Array.isArray(parsed.line_items)) {
      throw new Error('Gemini response was missing the expected line_items array.')
    }
    return parsed.line_items
  } finally {
    await client.files.delete({ name: uploaded.name }).catch(() => {}) // best-effort cleanup, not worth failing the whole job over
  }
}
