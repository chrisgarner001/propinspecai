import { describe, expect, it } from 'vitest'
import { splitPartCount, splitPartName, SPLIT_SEGMENT_SECONDS } from './videoSplit'

describe('splitPartCount', () => {
  it('rounds up to whole 3-minute parts', () => {
    expect(SPLIT_SEGMENT_SECONDS).toBe(180)
    expect(splitPartCount(293.12)).toBe(2) // 35852 Beverly 20260928_155719.mp4, 4:53
    expect(splitPartCount(180)).toBe(1)
    expect(splitPartCount(181)).toBe(2)
    expect(splitPartCount(0)).toBe(1)
  })
})

describe('splitPartName', () => {
  it("matches scripts/split-video.mjs's naming", () => {
    expect(splitPartName('20260928_153705.mp4', 0)).toBe('20260928_153705-part1.mp4')
    expect(splitPartName('IMG_0014.MOV', 2)).toBe('IMG_0014-part3.mp4')
  })
})
