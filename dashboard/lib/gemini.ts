import { GoogleGenAI, createPartFromUri, createUserContent, Type, type Schema } from '@google/genai'
import type { RoomMeasurement, RoomSegment } from './rooms'

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
    // 9355 Sylvia audit (2026-09-30): there was no field for a measurement,
    // so narrated room dimensions only survived when the model happened to
    // fold them into observed_evidence -- every bedroom's were lost.
    room_measurements: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          room_area: { type: Type.STRING, description: 'Exactly the same room_area name used for this room in line_items' },
          what_measured: { type: Type.STRING, description: 'e.g. "Room", "Closet", "Window", "Wall register", "Furnace filter"' },
          measurement: { type: Type.STRING, description: 'Exactly as spoken or read, units preserved, e.g. "10 x 14", "14 x 11 1/2", "32 in"' },
          source: { type: Type.STRING, enum: ['Narrated', 'Visually read', 'Both'] },
          source_timestamp: { type: Type.STRING, description: 'e.g. "1:05"' },
        },
        required: ['room_area', 'what_measured', 'measurement', 'source', 'source_timestamp'],
      },
    },
    // Same audit: drives per-room video clips (processNextInspectionVideo
    // cuts each span out with ffmpeg) and the room-continuity carry-over
    // into the next split segment.
    room_segments: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          room_area: { type: Type.STRING, description: 'Exactly the same room_area name used for this room in line_items' },
          start_timestamp: { type: Type.STRING, description: 'When the camera enters/begins showing this room, e.g. "2:49"' },
          end_timestamp: { type: Type.STRING, description: 'When the camera leaves this room, e.g. "4:10"' },
        },
        required: ['room_area', 'start_timestamp', 'end_timestamp'],
      },
    },
  },
  required: ['line_items', 'room_measurements', 'room_segments'],
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

## Room names

Use one consistent name per room for the whole inspection, in every field (line_items, room_measurements, room_segments). When a house has more than one of a room type, number them in the order the inspector names or visits them -- "Bedroom 1", "Bedroom 2", "Bedroom 3", "Bathroom 1", "Bathroom 2" -- and never fall back to a generic "Bedroom" or "Bathroom" for one of them. Use the inspector's own narrated name for a room whenever one is given. A closet belongs to the room it opens off (e.g. "Bedroom 3", item "Closet"), not a room of its own, unless it is a hallway/linen closet.

## Measurements

Record every measurement that is spoken or clearly readable (e.g. a tape measure in frame) in room_measurements -- room dimensions especially ("bedroom one, 10 by 14"), plus closets, windows, doors, registers, filters, and any other quantity or size given. Preserve the measurement exactly as stated, units and fractions included; do not convert or round it. Never estimate a dimension the inspector did not state or show. You may also mention a measurement in a line item's observed_evidence where it's relevant, but it must always appear in room_measurements.

## Room segments

In room_segments, list every contiguous span of the video spent in each room or area, in order, from the first frame to the last, with start and end timestamps. Every moment of the video should fall inside exactly one span. If the video begins partway through a room, the first span starts at "0:00".

## Output

Return one entry per distinct inspected item/finding via the structured schema. Use "Unable to determine" for source_timestamp only when genuinely not clear from the video.`

// The video is one of several split segments of a single walkthrough (see
// scripts/split-video.mjs -- phone videos are cut into ~3min pieces), each
// sent to Gemini on its own. Without this, a segment that opens mid-room has
// no way to know which room it is (9355 Sylvia: the second half of Bedroom 3
// came back as just "Bedroom").
export type SegmentContext = {
  // Guided Inspection: the room list the inspector set on the iPad before
  // recording (docs/designs/propinspec-guided-inspection.md). When present,
  // it's the required naming, not just a hint.
  plannedRooms?: string[]
  roomsSoFar: string[]
  previousLastRoom: string | null
}

function contextBlock(ctx: SegmentContext | undefined): string {
  const planned = ctx?.plannedRooms ?? []
  if (!ctx || (planned.length === 0 && ctx.roomsSoFar.length === 0 && !ctx.previousLastRoom)) return ''
  const lines: string[] = []
  if (planned.length > 0) {
    lines.push(
      '',
      "## This property's rooms (set by the inspector before recording)",
      '',
      `The inspector listed these rooms on site: ${planned.join(', ')}.`,
      'For every room_area in line_items, room_measurements, and room_segments, use exactly one of these names, spelled exactly as listed. The inspector names each room aloud as they enter it -- match what they say to this list. Only use a different name for an area that is genuinely not on the list.',
    )
  }
  if (ctx.roomsSoFar.length === 0 && !ctx.previousLastRoom) return lines.join('\n')
  lines.push('', '## Earlier in this same inspection', '', 'This video is a continuation of the same walkthrough as earlier videos of this property.')
  if (ctx.roomsSoFar.length > 0 && planned.length === 0) {
    lines.push(`Rooms already identified in earlier videos (reuse these exact names for the same rooms): ${ctx.roomsSoFar.join(', ')}.`)
  }
  if (ctx.previousLastRoom) {
    lines.push(
      `The previous video ended in "${ctx.previousLastRoom}". If this video opens in that same room, keep calling it "${ctx.previousLastRoom}" until the inspector moves to a different room.`,
    )
  }
  return lines.join('\n')
}

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

export type ExtractedInspection = {
  line_items: ExtractedLineItem[]
  room_measurements: RoomMeasurement[]
  room_segments: RoomSegment[]
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
export async function extractInspectionFromVideo(videoPath: string, context?: SegmentContext): Promise<ExtractedInspection> {
  const client = getClient()
  const uploaded = await client.files.upload({ file: videoPath, config: { mimeType: 'video/mp4' } })
  if (!uploaded.name) throw new Error('Gemini did not return a file name for the uploaded video.')

  try {
    const file = await waitForFileActive(client, uploaded.name)
    if (!file.uri || !file.mimeType) throw new Error('Gemini file is active but missing a uri/mimeType.')

    const response = await generateContentWithRetry(client, {
      model: MODEL,
      contents: createUserContent([createPartFromUri(file.uri, file.mimeType), PROMPT + contextBlock(context)]),
      config: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    })

    const text = response.text
    if (!text) throw new Error('Gemini returned an empty response.')

    let parsed: Partial<ExtractedInspection>
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new Error('Gemini returned a response that was not valid JSON.')
    }
    if (!Array.isArray(parsed.line_items)) {
      throw new Error('Gemini response was missing the expected line_items array.')
    }
    // room_measurements/room_segments are schema-required, but a missing one
    // is degraded output, not a reason to throw away the line items.
    return {
      line_items: parsed.line_items,
      room_measurements: Array.isArray(parsed.room_measurements) ? parsed.room_measurements : [],
      room_segments: Array.isArray(parsed.room_segments) ? parsed.room_segments : [],
    }
  } finally {
    await client.files.delete({ name: uploaded.name }).catch(() => {}) // best-effort cleanup, not worth failing the whole job over
  }
}
