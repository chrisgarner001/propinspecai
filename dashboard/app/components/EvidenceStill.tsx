// Pure CSS hover preview (group/group-hover) — no client JS needed. Renders a
// muted placeholder when no still has been extracted yet (see DESIGN.md
// Decisions Log, 2026-09-10: still_image_file is wired up ahead of the
// video-still-extraction pipeline that will populate it).
export default function EvidenceStill({ stillImageFile }: { stillImageFile: string | null }) {
  if (!stillImageFile) {
    return <div className="data-mono text-[11px] text-neutral">No still extracted yet</div>
  }

  return (
    <span className="group relative inline-block data-mono text-[11px] text-accent underline decoration-accent/40 cursor-default">
      {stillImageFile}
      <span className="hidden group-hover:block absolute z-10 left-0 top-full mt-1 border border-border rounded-[var(--radius-md)] bg-surface shadow-lg p-1">
        {/* eslint-disable-next-line @next/next/no-img-element -- source is an arbitrary future asset path, not a static/public import */}
        <img src={stillImageFile} alt="Extracted still frame" className="w-56 h-auto rounded-[var(--radius-sm)]" />
      </span>
    </span>
  )
}
