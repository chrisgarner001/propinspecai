// Guided Inspection photo in DESIGN.md's evidence-frame form: border only,
// `lg` radius, a mono caption bar baked into the frame -- never a bare
// unlabeled <img>. `url` is a short-lived signed URL (lib/fieldPhotos.ts).
export default function FieldPhotoFrame({
  url,
  caption,
  className = 'w-full max-w-[280px]',
}: {
  url: string | null | undefined
  caption: string
  className?: string
}) {
  if (!url) {
    return <div className="data-mono text-[11px] text-neutral">No photo yet</div>
  }
  return (
    <figure className={`border border-border rounded-[var(--radius-lg)] overflow-hidden bg-surface ${className}`}>
      <a href={url} target="_blank" rel="noopener noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed, expiring Storage URL, not a static asset */}
        <img src={url} alt={caption} className="w-full h-auto block" />
      </a>
      <figcaption className="data-mono text-[11px] text-text-muted px-2 py-1 border-t border-border truncate">{caption}</figcaption>
    </figure>
  )
}
