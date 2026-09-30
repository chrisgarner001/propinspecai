import { parseTimestampSeconds } from './timestamps'

// Pure room-continuity/clip helpers for processNextInspectionVideo
// (app/actions.ts). No DB, ffmpeg, or network -- kept separate so the
// seam-handling rules below can be unit-tested directly (lib/rooms.test.ts).

export type RoomSegment = { room_area: string; start_timestamp: string; end_timestamp: string }
export type RoomMeasurement = {
  room_area: string
  what_measured: string
  measurement: string
  source: 'Narrated' | 'Visually read' | 'Both'
  source_timestamp: string
}

// Recording order, not sync order. split-video.mjs names segments
// `<original>-part1.mp4`, `-part2`, ... (and a re-split segment becomes
// `-part1-part1`), and phone recordings are named by start time
// (20260727_154011.mp4) -- so a natural-numeric filename sort IS the order
// the inspector walked the house. Plain lexical sort would put part10
// before part2 once a video is long enough to need 10+ three-minute
// segments; `numeric: true` avoids that.
export function compareVideoFilenames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

// 9355 Sylvia (2026-09-30): Bedroom 3 began at 2:29 at the very end of
// 160735-part1-part1 and continued into 160735-part1-part2, which opens
// mid-room -- Gemini, seeing that segment alone, labelled the rest of it
// just "Bedroom". The prompt now carries the previous segment's last room
// forward (lib/gemini.ts), and this is the deterministic backstop for when
// the model still falls back to a generic name: if THIS segment's first
// room span starts at the very top of the clip and its name is the
// un-numbered form of the room the previous segment ended in ("Bedroom" vs
// "Bedroom 3"), it's the same room continuing across the seam, so every use
// of that generic label in this segment is renamed to match.
const SEAM_START_TOLERANCE_SECONDS = 10

export function continueRoomLabelAcrossSeam<
  T extends { line_items: { room_area: string }[]; room_segments: RoomSegment[]; room_measurements: RoomMeasurement[] },
>(result: T, previousLastRoom: string | null): T {
  if (!previousLastRoom) return result
  const first = [...result.room_segments]
    .map((s) => ({ s, start: parseTimestampSeconds(s.start_timestamp) }))
    .filter((x) => x.start !== null)
    .sort((a, b) => (a.start as number) - (b.start as number))[0]
  if (!first || (first.start as number) > SEAM_START_TOLERANCE_SECONDS) return result

  const generic = first.s.room_area.trim()
  const prev = previousLastRoom.trim()
  const isGenericFormOfPrev =
    generic.toLowerCase() !== prev.toLowerCase() && prev.toLowerCase().startsWith(`${generic.toLowerCase()} `)
  if (!isGenericFormOfPrev) return result

  const rename = <R extends { room_area: string }>(r: R): R =>
    r.room_area.trim().toLowerCase() === generic.toLowerCase() ? { ...r, room_area: prev } : r
  return {
    ...result,
    line_items: result.line_items.map(rename),
    room_segments: result.room_segments.map(rename),
    room_measurements: result.room_measurements.map(rename),
  }
}

export type ClipSpan = { room_area: string; start_seconds: number; end_seconds: number }

// Converts the model's room_segments to numeric spans, dropping any with an
// unparsable or non-positive span rather than failing the video over it.
// Adjacent spans for the same room (the model sometimes splits one visit
// around a brief step into a doorway) are merged so one visit = one clip.
export function toClipSpans(segments: RoomSegment[]): ClipSpan[] {
  const spans = segments
    .map((s) => ({
      room_area: s.room_area.trim(),
      start_seconds: parseTimestampSeconds(s.start_timestamp),
      end_seconds: parseTimestampSeconds(s.end_timestamp),
    }))
    .filter(
      (s): s is ClipSpan =>
        s.room_area.length > 0 && s.start_seconds !== null && s.end_seconds !== null && s.end_seconds > s.start_seconds,
    )
    .sort((a, b) => a.start_seconds - b.start_seconds)

  const merged: ClipSpan[] = []
  for (const span of spans) {
    const last = merged[merged.length - 1]
    if (last && last.room_area.toLowerCase() === span.room_area.toLowerCase()) {
      last.end_seconds = Math.max(last.end_seconds, span.end_seconds)
    } else {
      merged.push({ ...span })
    }
  }
  return merged
}

// The room the inspector was in when a segment ended -- carried into the
// NEXT segment's prompt and into continueRoomLabelAcrossSeam.
export function lastRoomOf(spans: ClipSpan[]): string | null {
  if (spans.length === 0) return null
  return spans.reduce((a, b) => (b.end_seconds >= a.end_seconds ? b : a)).room_area
}

// "Kitchen clip labelled attic" (Sylvia audit): a line item's video link used
// to open the whole source segment at 0:00. Picks the room clip that
// actually contains the line item's moment -- same source video, same room,
// timestamp inside the span -- falling back to any clip in that video
// covering the timestamp, then to any clip of that room in that video.
export function findClipForLineItem<C extends { inspection_video_drive_file_id: string; room_area: string; start_seconds: number; end_seconds: number }>(
  clips: C[],
  lineItem: { source_video_drive_file_id: string | null; room_area: string; source_timestamp: string | null },
): C | null {
  if (!lineItem.source_video_drive_file_id) return null
  const sameVideo = clips.filter((c) => c.inspection_video_drive_file_id === lineItem.source_video_drive_file_id)
  if (sameVideo.length === 0) return null
  const seconds = lineItem.source_timestamp ? parseTimestampSeconds(lineItem.source_timestamp) : null
  const room = lineItem.room_area.trim().toLowerCase()
  const covers = (c: C) => seconds !== null && seconds >= c.start_seconds && seconds <= c.end_seconds
  const sameRoom = (c: C) => c.room_area.trim().toLowerCase() === room
  return sameVideo.find((c) => sameRoom(c) && covers(c)) ?? sameVideo.find(covers) ?? sameVideo.find(sameRoom) ?? null
}

export function formatSeconds(total: number): string {
  const s = Math.max(0, Math.round(total))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
