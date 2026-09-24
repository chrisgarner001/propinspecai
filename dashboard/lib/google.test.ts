import { describe, expect, it, vi, afterEach } from 'vitest'
import { Readable } from 'node:stream'
import { readFile, access, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

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
          { id: 'file-1', name: 'clip1.mov', mimeType: 'video/quicktime', size: '2087247388' },
          { id: 'file-2', name: 'clip2.mp4', mimeType: 'video/mp4', size: '387322733' },
        ],
      },
    })
    const { listVideosInFolder } = await import('./google')

    const files = await listVideosInFolder('some-folder-id')
    expect(files).toHaveLength(2)
    expect(files[0].name).toBe('clip1.mov')
    expect(files[0].size).toBe('2087247388')
  })
})

// Regression tests for the large-video plan-eng-review (2026-09-24): the
// prior downloadDriveFile buffered the whole file in memory; this streams
// directly to a caller-provided path instead, which is what makes the
// ~400MB pre-flight threshold (rather than Gemini's 2GB cap) safe against
// Vercel's real, measured ~512MB /tmp ceiling.
describe('downloadDriveFileToPath', () => {
  afterEach(() => {
    mockFilesGet.mockReset()
  })

  it('streams the real bytes to destPath', async () => {
    const bytes = Buffer.from('fake video bytes, streamed not buffered')
    mockFilesGet.mockResolvedValue({ data: Readable.from(bytes) })
    const { downloadDriveFileToPath } = await import('./google')

    const destPath = join(tmpdir(), `google-test-${randomUUID()}.mp4`)
    try {
      await downloadDriveFileToPath('some-file-id', destPath)
      const written = await readFile(destPath)
      expect(written.equals(bytes)).toBe(true)
    } finally {
      await unlink(destPath).catch(() => {})
    }
  })

  it('cleans up a partial file when the stream errors mid-download', async () => {
    const failingStream = new Readable({
      read() {
        this.emit('error', new Error('simulated network blip'))
      },
    })
    mockFilesGet.mockResolvedValue({ data: failingStream })
    const { downloadDriveFileToPath } = await import('./google')

    const destPath = join(tmpdir(), `google-test-${randomUUID()}.mp4`)
    await expect(downloadDriveFileToPath('some-file-id', destPath)).rejects.toThrow(/network blip/)
    await expect(access(destPath)).rejects.toThrow()
  })
})
