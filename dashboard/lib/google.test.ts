import { describe, expect, it, vi, afterEach } from 'vitest'

// Regression test for the "No video files found" investigation
// (11436 Syracuse, 2026-09-23): a Drive folder never shared with the
// service account made drive.files.list silently return [] instead of
// throwing, which the app then reported as an empty folder rather than an
// inaccessible one. Mocks googleapis directly since listVideosInFolder
// (lib/google.ts) is the smallest unit that owns this behavior --
// app/actions.test.ts mocks listVideosInFolder wholesale and can't exercise
// its internals.
const mockFilesGet = vi.fn()
const mockFilesList = vi.fn()
vi.mock('googleapis', () => ({
  google: {
    auth: { GoogleAuth: vi.fn().mockImplementation(() => ({})) },
    drive: vi.fn().mockImplementation(() => ({
      files: { get: mockFilesGet, list: mockFilesList },
    })),
  },
}))

describe('listVideosInFolder', () => {
  afterEach(() => {
    mockFilesGet.mockReset()
    mockFilesList.mockReset()
  })

  it('throws an actionable sharing error when the folder is inaccessible to the service account', async () => {
    mockFilesGet.mockRejectedValue(new Error('File not found: some-folder-id.'))
    const { listVideosInFolder } = await import('./google')

    await expect(listVideosInFolder('some-folder-id')).rejects.toThrow(/shared with/i)
    expect(mockFilesList).not.toHaveBeenCalled()
  })

  it('returns the real video files when the folder is accessible', async () => {
    mockFilesGet.mockResolvedValue({ data: { id: 'some-folder-id' } })
    mockFilesList.mockResolvedValue({
      data: {
        files: [
          { id: 'file-1', name: 'clip1.mov', mimeType: 'video/quicktime' },
          { id: 'file-2', name: 'clip2.mp4', mimeType: 'video/mp4' },
        ],
      },
    })
    const { listVideosInFolder } = await import('./google')

    const files = await listVideosInFolder('some-folder-id')
    expect(files).toHaveLength(2)
    expect(files[0].name).toBe('clip1.mov')
  })
})
