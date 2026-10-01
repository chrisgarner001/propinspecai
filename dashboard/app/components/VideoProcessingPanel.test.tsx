// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import VideoProcessingPanel from './VideoProcessingPanel'
import type { InspectionVideoRow } from '@/app/actions'

// The first component test in this codebase (plan-eng-review, 2026-09-28),
// originally for the "Copy split command" button; now covers its in-app
// replacement, "Split video", and the stuck-"Checking…" regression.
//
// app/actions.ts is a real 'use server' module that transitively imports
// lib/dal.ts's `server-only` marker, DB and Google clients -- none of which
// can load in this jsdom environment. Mock it fully (no vi.importActual).
// SIZE_REJECTION_MARKER lives in lib/videoProcessing.ts (a plain module, no
// server-only deps) specifically so it doesn't need mocking here -- the
// component imports the real one.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))
vi.mock('@/app/actions', () => ({
  syncInspectionVideos: vi.fn(),
  processNextInspectionVideo: vi.fn(),
  retryInspectionVideo: vi.fn(),
  splitNextVideoPart: vi.fn(),
}))

const sizeRejectedVideo: InspectionVideoRow = {
  id: 'row-1',
  drive_file_id: 'drive-1',
  filename: 'IMG_9999.MOV',
  status: 'failed',
  error_message: 'This video is too large (900MB) to process -- the server can safely handle up to ~480MB.',
  line_items_created: 0,
}
const otherFailureVideo: InspectionVideoRow = {
  id: 'row-2',
  drive_file_id: 'drive-2',
  filename: 'IMG_8888.MOV',
  status: 'failed',
  error_message: "Can't access this Drive folder -- make sure it's shared.",
  line_items_created: 0,
}

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

// In-app "Split video" (2026-10-01) replaced "Copy split command", which only
// copied a terminal command and ran nothing.
describe('VideoProcessingPanel "Split video" button', () => {
  it('renders only on a row rejected for size, not other failures', async () => {
    const user = userEvent.setup()
    render(<VideoProcessingPanel inspectionId="insp-1" initialVideos={[sizeRejectedVideo, otherFailureVideo]} />)
    await user.click(screen.getByText('Video Processing'))
    expect(screen.getAllByRole('button', { name: 'Split video' })).toHaveLength(1)
    expect(screen.queryByText('Copy split command')).not.toBeInTheDocument()
  })

  it('splits part by part with visible progress, then syncs and processes the parts', async () => {
    const actions = await import('@/app/actions')
    let releasePart2: () => void = () => {}
    vi.mocked(actions.splitNextVideoPart)
      .mockResolvedValueOnce({ done: false, partsDone: 1, partsTotal: 3 })
      .mockImplementationOnce(
        () => new Promise((resolve) => (releasePart2 = () => resolve({ done: false, partsDone: 2, partsTotal: 3 }))),
      )
      .mockResolvedValueOnce({ done: true, partsDone: 3, partsTotal: 3 })
    vi.mocked(actions.syncInspectionVideos).mockResolvedValueOnce({ videos: [] })
    vi.mocked(actions.processNextInspectionVideo).mockResolvedValueOnce({ done: true, videos: [] })

    const user = userEvent.setup()
    render(<VideoProcessingPanel inspectionId="insp-1" initialVideos={[sizeRejectedVideo]} />)
    await user.click(screen.getByText('Video Processing'))
    await user.click(screen.getByRole('button', { name: 'Split video' }))

    expect(await screen.findByText('Splitting… part 2 of 3')).toBeInTheDocument()
    releasePart2()

    await vi.waitFor(() => expect(actions.syncInspectionVideos).toHaveBeenCalledWith('insp-1'))
    expect(actions.splitNextVideoPart).toHaveBeenCalledTimes(3)
    expect(actions.splitNextVideoPart).toHaveBeenCalledWith('row-1', 'insp-1')
  })

  it('stops with a resumable message when a part fails, without syncing', async () => {
    const actions = await import('@/app/actions')
    vi.mocked(actions.splitNextVideoPart).mockResolvedValueOnce({
      done: false,
      partsDone: 1,
      partsTotal: 3,
      error: 'Part 2 failed: ffmpeg exited 1',
    })

    const user = userEvent.setup()
    render(<VideoProcessingPanel inspectionId="insp-1" initialVideos={[sizeRejectedVideo]} />)
    await user.click(screen.getByText('Video Processing'))
    await user.click(screen.getByRole('button', { name: 'Split video' }))

    expect(await screen.findByText(/Splitting stopped: Part 2 failed: ffmpeg exited 1.*resume/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Split video' })).toBeEnabled()
    expect(actions.syncInspectionVideos).not.toHaveBeenCalled()
  })
})

// Regression (2026-10-01, 35852 Beverly): a sync call that THREW (rather
// than returning { error }) left the button stuck on "Checking…" forever.
describe('Check for new videos -- failure recovery', () => {
  it('resets the button and shows the reason when the sync call throws', async () => {
    const { syncInspectionVideos } = await import('@/app/actions')
    vi.mocked(syncInspectionVideos).mockRejectedValueOnce(new Error('Not authenticated'))

    render(<VideoProcessingPanel inspectionId="insp-1" initialVideos={[otherFailureVideo]} />)
    await userEvent.click(screen.getByRole('button', { name: 'Check for new videos' }))

    expect(await screen.findByText(/Couldn't check for new videos: Not authenticated/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Check for new videos' })).toBeTruthy()
  })
})
