import { describe, expect, it } from 'vitest'
import { allUploadsConfirmed, parseFolderIdFromUrl } from './split-video.mjs'

// Regression coverage for the one step in split-video.mjs with real data-loss
// consequences if wrong: this guard gates deleting the only copy of the
// original oversized video (plan-eng-review D4, 2026-09-24). Sibling
// operator scripts (upload-videos.mjs, backfill-video-sizes.mjs) have no
// automated tests -- this function is the deliberate, narrow exception.
describe('allUploadsConfirmed', () => {
  it('returns false for an empty result set (no segments to confirm)', () => {
    expect(allUploadsConfirmed([])).toBe(false)
  })

  it('returns false when any upload is missing a fileId', () => {
    const results = [
      { fileId: 'abc123', name: 'clip-part1.mp4' },
      { fileId: null, name: 'clip-part2.mp4', error: 'quota exceeded' },
    ]
    expect(allUploadsConfirmed(results)).toBe(false)
  })

  it('returns false when a fileId is an empty string', () => {
    const results = [{ fileId: '', name: 'clip-part1.mp4' }]
    expect(allUploadsConfirmed(results)).toBe(false)
  })

  it('returns true when every upload has a non-empty fileId', () => {
    const results = [
      { fileId: 'abc123', name: 'clip-part1.mp4' },
      { fileId: 'def456', name: 'clip-part2.mp4' },
      { fileId: 'ghi789', name: 'clip-part3.mp4' },
    ]
    expect(allUploadsConfirmed(results)).toBe(true)
  })
})

// Regression coverage for the "9355 Sylvia" incident (investigated
// 2026-09-28): a Drive file the service account can only see via a direct
// share -- not real Shared Drive membership -- silently omits `parents`
// from files.get, even though the file has a real parent. Fixed by using
// the inspection's own linked folder URL as the re-upload target instead
// of asking Drive to derive it from the file.
describe('parseFolderIdFromUrl', () => {
  it("accepts Drive for desktop's open?id= link format (35852 Beverly)", () => {
    expect(parseFolderIdFromUrl('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUvWxYz012345&usp=drive_fs')).toBe(
      '1AbCdEfGhIjKlMnOpQrStUvWxYz012345',
    )
  })

  it('extracts the folder id from a real Drive folder URL', () => {
    expect(parseFolderIdFromUrl('https://drive.google.com/drive/folders/1cU49X0csidHMzRPaUPO9NPMVeKp4D-df?usp=sharing')).toBe(
      '1cU49X0csidHMzRPaUPO9NPMVeKp4D-df'
    )
  })

  it('returns null for a URL with no folder id', () => {
    expect(parseFolderIdFromUrl('https://drive.google.com/drive/my-drive')).toBeNull()
  })
})
