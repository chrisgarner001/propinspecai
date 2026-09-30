// Gemini's source_timestamp is normally a single point ("0:42"), but the
// original hand-test format ("Clip 2, 0:20-0:29") is also accepted so this
// stays compatible with any line item however it was produced. Returns null
// for "Unable to determine" or anything else unparsable -- callers skip the
// still for that line item rather than fail it over a missing timestamp.
export function parseTimestampSeconds(raw: string): number | null {
  const cleaned = raw.replace(/^Clip\s*\d+,\s*/i, '').trim()
  const [startStr, endStr] = cleaned.split('-').map((s) => s.trim())

  const toSeconds = (t: string): number | null => {
    const segs = t.split(':').map(Number)
    if (segs.length < 2 || segs.length > 3 || segs.some((n) => Number.isNaN(n))) return null
    return segs.length === 3 ? segs[0] * 3600 + segs[1] * 60 + segs[2] : segs[0] * 60 + segs[1]
  }

  const start = toSeconds(startStr)
  if (start === null) return null
  if (!endStr) return start
  const end = toSeconds(endStr)
  return end === null ? start : (start + end) / 2
}
