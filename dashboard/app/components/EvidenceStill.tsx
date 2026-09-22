import { formatCapturedAt } from '@/lib/format'

// Pure CSS hover preview (group/group-hover) — no client JS needed. Renders a
// muted placeholder when no still has been extracted yet (see DESIGN.md
// Decisions Log, 2026-09-10: still_image_file is wired up ahead of the
// video-still-extraction pipeline that will populate it).
export default function EvidenceStill({
  stillImageFile,
  capturedAt,
}: {
  stillImageFile: string | null
  capturedAt?: string | null
}) {
  if (!stillImageFile) {
    return <div className="data-mono text-[11px] text-neutral">No still extracted yet</div>
  }

  // Show a short label, not the raw Storage URL -- a ~95-char unbroken URL
  // is unreadable in a narrow cell and (without word-break) can force a
  // grid track wider than its share, desyncing this row's columns from the
  // header row's (see ROW_COLS comment in the parent page).
  const filename = stillImageFile.split('/').pop() ?? stillImageFile

  return (
    <span className="group relative inline-block data-mono text-[11px] text-accent underline decoration-accent/40 cursor-default break-all">
      {filename}
      <span className="hidden group-hover:block absolute z-10 left-0 top-full mt-1 border border-border rounded-[var(--radius-md)] bg-surface shadow-lg p-1">
        {/* eslint-disable-next-line @next/next/no-img-element -- source is an arbitrary future asset path, not a static/public import */}
        <img src={stillImageFile} alt="Extracted still frame" className="w-56 h-auto rounded-[var(--radius-sm)]" />
        {capturedAt && (
          <div className="data-mono text-[10px] text-text-muted text-center pt-1">{formatCapturedAt(capturedAt)}</div>
        )}
      </span>
    </span>
  )
}
