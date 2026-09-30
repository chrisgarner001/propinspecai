import { describe, expect, it } from 'vitest'
import { compareVideoFilenames, continueRoomLabelAcrossSeam, toClipSpans, lastRoomOf, findClipForLineItem } from './rooms'

describe('compareVideoFilenames', () => {
  it('sorts split segments in recording order, including part10 after part2', () => {
    const names = [
      '20260727_162556.mp4',
      '20260727_160735-part2.mp4',
      '20260727_154011-part2.mp4',
      '20260727_154011-part1-part2.mp4',
      '20260727_154011-part10.mp4',
      '20260727_154011-part1-part1.mp4',
    ]
    expect([...names].sort(compareVideoFilenames)).toEqual([
      '20260727_154011-part1-part1.mp4',
      '20260727_154011-part1-part2.mp4',
      '20260727_154011-part2.mp4',
      '20260727_154011-part10.mp4',
      '20260727_160735-part2.mp4',
      '20260727_162556.mp4',
    ])
  })
})

describe('continueRoomLabelAcrossSeam', () => {
  const result = (rooms: [string, string, string][]) => ({
    line_items: rooms.map(([room_area]) => ({ room_area })),
    room_measurements: [],
    room_segments: rooms.map(([room_area, start_timestamp, end_timestamp]) => ({ room_area, start_timestamp, end_timestamp })),
  })

  it('renames a generic opening room to the numbered room the previous segment ended in', () => {
    const out = continueRoomLabelAcrossSeam(result([['Bedroom', '0:00', '1:45'], ['Bathroom', '1:46', '3:00']]), 'Bedroom 3')
    expect(out.line_items.map((l) => l.room_area)).toEqual(['Bedroom 3', 'Bathroom'])
    expect(out.room_segments.map((s) => s.room_area)).toEqual(['Bedroom 3', 'Bathroom'])
  })

  it('leaves a generic room alone when it does not open the segment', () => {
    const input = result([['Hallway', '0:00', '0:40'], ['Bedroom', '0:41', '2:00']])
    expect(continueRoomLabelAcrossSeam(input, 'Bedroom 3')).toEqual(input)
  })

  it('leaves an unrelated opening room alone', () => {
    const input = result([['Kitchen', '0:00', '1:00']])
    expect(continueRoomLabelAcrossSeam(input, 'Bedroom 3')).toEqual(input)
  })

  it('is a no-op with no previous segment', () => {
    const input = result([['Bedroom', '0:00', '1:00']])
    expect(continueRoomLabelAcrossSeam(input, null)).toEqual(input)
  })
})

describe('toClipSpans / lastRoomOf', () => {
  it('drops unparsable spans and merges adjacent spans of the same room', () => {
    const spans = toClipSpans([
      { room_area: 'Kitchen', start_timestamp: '0:00', end_timestamp: '1:00' },
      { room_area: 'Kitchen', start_timestamp: '1:01', end_timestamp: '2:48' },
      { room_area: 'Garage', start_timestamp: 'Unable to determine', end_timestamp: '3:00' },
      { room_area: 'Attic', start_timestamp: '2:49', end_timestamp: '4:10' },
    ])
    expect(spans).toEqual([
      { room_area: 'Kitchen', start_seconds: 0, end_seconds: 168 },
      { room_area: 'Attic', start_seconds: 169, end_seconds: 250 },
    ])
    expect(lastRoomOf(spans)).toBe('Attic')
    expect(lastRoomOf([])).toBeNull()
  })
})

describe('findClipForLineItem', () => {
  const clips = [
    { inspection_video_drive_file_id: 'v1', room_area: 'Kitchen', start_seconds: 0, end_seconds: 168 },
    { inspection_video_drive_file_id: 'v1', room_area: 'Attic', start_seconds: 169, end_seconds: 250 },
    { inspection_video_drive_file_id: 'v2', room_area: 'Attic', start_seconds: 0, end_seconds: 60 },
  ]

  it('picks the clip in the same video whose span contains the timestamp', () => {
    expect(findClipForLineItem(clips, { source_video_drive_file_id: 'v1', room_area: 'Attic', source_timestamp: '2:52' })).toBe(clips[1])
    expect(findClipForLineItem(clips, { source_video_drive_file_id: 'v1', room_area: 'Kitchen', source_timestamp: '0:07' })).toBe(clips[0])
  })

  it('falls back to the same-room clip when the timestamp is unusable', () => {
    expect(findClipForLineItem(clips, { source_video_drive_file_id: 'v1', room_area: 'Attic', source_timestamp: 'Unable to determine' })).toBe(clips[1])
  })

  it('returns null when the line item has no source video or no clips exist for it', () => {
    expect(findClipForLineItem(clips, { source_video_drive_file_id: null, room_area: 'Attic', source_timestamp: '0:10' })).toBeNull()
    expect(findClipForLineItem(clips, { source_video_drive_file_id: 'v9', room_area: 'Attic', source_timestamp: '0:10' })).toBeNull()
  })
})
