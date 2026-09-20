import { getSql } from '@/lib/db'
import { notFound } from 'next/navigation'
import Image from 'next/image'

// Public, unauthenticated view for a link created by "Share Images" on the
// Image Folder page (app/components/ImageShareGallery.tsx). `images` is a
// snapshot taken at link-creation time (migration 0025), not a live query
// against line_items -- an owner/tenant opening an old link should keep
// seeing exactly what was shared, even if those line items are later edited,
// duplicated, or removed from the Quote Sheet.
type ShareImage = { url: string; roomArea: string; item: string }

export default async function SharedImagesPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const sql = getSql()

  const [link] = await sql`
    select isl.images, i.property_address
    from image_share_links isl
    join inspections i on i.id = isl.inspection_id
    where isl.token = ${token}
  `
  if (!link) notFound()

  const images = link.images as ShareImage[]
  const roomGroups = new Map<string, ShareImage[]>()
  for (const img of images) {
    if (!roomGroups.has(img.roomArea)) roomGroups.set(img.roomArea, [])
    roomGroups.get(img.roomArea)!.push(img)
  }

  return (
    <div className="max-w-4xl mx-auto my-10 px-6 pb-16">
      <div className="mb-8">
        <Image src="/gpm-logo.png" alt="GPM Property Management" width={182} height={35} priority />
        <div className="font-mono text-text-muted text-[11px] mt-1">
          Powered by <span className="font-sans font-semibold text-text text-[13px]">PropInspec</span>
        </div>
      </div>

      <h1 className="font-display font-bold text-[18px] mb-1">Shared Photos — {link.property_address}</h1>
      <div className="text-[12px] text-text-muted mb-6">{images.length} photo(s)</div>

      {[...roomGroups.entries()].map(([room, items]) => (
        <div key={room} className="mb-6">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-2">{room}</div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
            {items.map((img, i) => (
              <a
                key={i}
                href={img.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block border border-border rounded-[var(--radius-md)] overflow-hidden bg-surface hover:border-accent"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- source is an arbitrary Supabase Storage URL, not a static/public import */}
                <img src={img.url} alt={`${room} — ${img.item}`} className="w-full h-36 object-cover" />
                <div className="data-mono text-[10px] text-text-muted px-2 py-1.5 truncate border-t border-border" title={img.item}>
                  {img.item}
                </div>
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
