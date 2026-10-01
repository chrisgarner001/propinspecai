// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import VideoProcessingPanel from './VideoProcessingPanel'
import type { InspectionVideoRow } from '@/app/actions'

// Regression coverage for the "Copy split command" button (plan-eng-review,
// 2026-09-28): the first component test in this codebase, added specifically
// because this button's three failure modes (wrong rows, wrong command,
// silent clipboard failure) had zero test coverage otherwise.
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

// jsdom defines navigator.clipboard as non-writable (getter-only, when
// defined at all) -- Object.assign silently fails to override it, so the
// property needs to be redefined outright.
function stubClipboard(writeText: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
    writable: true,
  })
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('VideoProcessingPanel "Copy split command" button', () => {
  it('renders only on a row whose error_message matches the size-rejection marker', async () => {
    const user = userEvent.setup()
    render(<VideoProcessingPanel inspectionId="insp-1" initialVideos={[sizeRejectedVideo, otherFailureVideo]} />)
    await user.click(screen.getByText('Video Processing'))

    const copyButtons = screen.getAllByText('Copy split command')
    expect(copyButtons).toHaveLength(1)
  })

  it('does not render for a video failed for a different reason', async () => {
    const user = userEvent.setup()
    render(<VideoProcessingPanel inspectionId="insp-1" initialVideos={[otherFailureVideo]} />)
    await user.click(screen.getByText('Video Processing'))

    expect(screen.queryByText('Copy split command')).not.toBeInTheDocument()
  })

  it('copies the exact command with the real row id, and shows "Copied!" feedback', async () => {
    // userEvent.setup() installs its own navigator.clipboard stub -- stub
    // AFTER setup() so this test's spy wins, not the other way around.
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)

    render(<VideoProcessingPanel inspectionId="insp-1" initialVideos={[sizeRejectedVideo]} />)
    await user.click(screen.getByText('Video Processing'))
    await user.click(screen.getByText('Copy split command'))

    expect(writeText).toHaveBeenCalledWith('node scripts/split-video.mjs row-1')
    expect(await screen.findByText('Copied!')).toBeInTheDocument()
  })

  it('shows a visible fallback text field when the clipboard write is rejected', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    stubClipboard(writeText)

    render(<VideoProcessingPanel inspectionId="insp-1" initialVideos={[sizeRejectedVideo]} />)
    await user.click(screen.getByText('Video Processing'))
    await user.click(screen.getByText('Copy split command'))

    const fallbackInput = await screen.findByDisplayValue('node scripts/split-video.mjs row-1')
    expect(fallbackInput).toBeInTheDocument()
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
