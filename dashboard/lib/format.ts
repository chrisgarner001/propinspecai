// Shared by the gallery lightbox and the line-item hover preview
// (docs/designs/propinspec-inspection-type-gallery.md) -- always rendered
// against GPM's own fixed timezone, never the viewer's browser timezone,
// since every property in this repo is Michigan-based and the point is
// "what time was this, at the property" not "what time is it for whoever's
// reading this now."
export function formatCapturedAt(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  const formatted = date.toLocaleString('en-US', {
    timeZone: 'America/Detroit',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  const tzAbbrev =
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Detroit', timeZoneName: 'short' })
      .formatToParts(date)
      .find((p) => p.type === 'timeZoneName')?.value ?? ''
  return tzAbbrev ? `${formatted} ${tzAbbrev}` : formatted
}
