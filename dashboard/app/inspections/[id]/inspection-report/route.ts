import { getSql } from '@/lib/db'
import { verifySession } from '@/lib/dal'
import { NextResponse } from 'next/server'
import PDFDocument from 'pdfkit'
import path from 'node:path'
import { formatCapturedAt } from '@/lib/format'

// A distinct report from the Move-Out Report (that one is the tenant-facing
// legal checklist -- statutory notice, condition table, itemized charges,
// signature block). This one is internal documentation: every field already
// visible on the inspection detail page (docs/designs the report mirrors),
// grouped by room/area the same way that page and the stills gallery
// already are, with each item's own still image embedded inline -- the
// Move-Out Report has never shown photos at all (confirmed while building
// Dashboard's Quick View, see DESIGN.md 2026-09-22), and the tenant
// Move-Out Report was never the right target for that popup in the first
// place (2026-09-22 user correction). Available for every inspection type,
// not just Move-Out -- unlike the Move-Out Report, nothing here is
// move-out-specific.

type LineItem = {
  room_area: string
  item: string
  condition: string
  observed_evidence: string | null
  recommended_action: string | null
  still_image_file: string | null
  captured_at: string | null
}

const CONDITION_COLOR: Record<string, string> = {
  Good: '#2F7D5C',
  Fair: '#B45309',
  Damaged: '#B3261E',
  'Not Rated': '#8A8F98',
}

const PAGE_MARGIN = 50
const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const CONTENT_BOTTOM = PAGE_HEIGHT - PAGE_MARGIN
const IMAGE_WIDTH = 160
// Real phone video frames are 1920x1080 (16:9, confirmed against actual
// GPM inspection footage -- see the getVideoCreationTime investigation,
// docs/designs/propinspec-inspection-type-gallery.md) -- fixed height
// budget per item block instead of measuring each image's real decoded
// height before laying it out, same "good enough for an internal working
// document" bar as this codebase's other generated PDFs.
const IMAGE_HEIGHT = Math.round((IMAGE_WIDTH * 9) / 16)
const ITEM_BLOCK_HEIGHT = IMAGE_HEIGHT + 12

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession()
  if (!session) return new NextResponse(null, { status: 401 })
  const { id } = await params
  const sql = getSql()

  const [inspection] = await sql`select * from inspections where id = ${id}`
  if (!inspection) {
    return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })
  }

  const lineItems = (await sql`
    select room_area, item, condition, observed_evidence, recommended_action, still_image_file, captured_at
    from line_items
    where inspection_id = ${id}
    order by room_area, created_at
  `) as unknown as LineItem[]

  // Fetch every still up front, in parallel -- Supabase Storage URLs are
  // public (no auth header needed, see DESIGN.md 2026-09-10), and a
  // per-image failure (network blip, deleted file) just means that one
  // item renders without a photo rather than failing the whole report.
  const imageBuffers = new Map<string, Buffer>()
  await Promise.all(
    lineItems
      .filter((li) => li.still_image_file)
      .map(async (li) => {
        try {
          const res = await fetch(li.still_image_file!)
          if (!res.ok) return
          const buf = Buffer.from(await res.arrayBuffer())
          imageBuffers.set(li.still_image_file!, buf)
        } catch (err) {
          console.error(`inspection-report: failed to fetch still ${li.still_image_file}:`, (err as Error).message)
        }
      })
  )

  const roomGroups = new Map<string, LineItem[]>()
  for (const li of lineItems) {
    if (!roomGroups.has(li.room_area)) roomGroups.set(li.room_area, [])
    roomGroups.get(li.room_area)!.push(li)
  }

  const doc = new PDFDocument({ size: 'LETTER', margin: PAGE_MARGIN, bufferPages: true })
  const chunks: Buffer[] = []
  doc.on('data', (chunk) => chunks.push(chunk))
  const done = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
  })

  const logoPath = path.join(process.cwd(), 'public', 'gpm-logo.png')

  function drawLetterhead() {
    doc.image(logoPath, PAGE_MARGIN, 45, { width: 130 })
    doc.font('Helvetica-Bold').fontSize(10).text('GPM Property Management LLC', PAGE_MARGIN + 145, 45)
    doc
      .font('Helvetica')
      .fontSize(10)
      .text('23944 Eureka Rd. Suite 105', PAGE_MARGIN + 145, 59)
      .text('Taylor, MI 48180', PAGE_MARGIN + 145, 73)
      .text('(734) 287-6619', PAGE_MARGIN + 145, 87)
    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .text('Inspection Report', PAGE_MARGIN, 60, { width: PAGE_WIDTH - PAGE_MARGIN * 2, align: 'right' })
    doc.y = 110
  }

  drawLetterhead()

  doc.moveTo(PAGE_MARGIN, doc.y).lineTo(PAGE_WIDTH - PAGE_MARGIN, doc.y).stroke()
  doc.moveDown(0.8)

  const fieldsTop = doc.y
  doc.font('Helvetica-Bold').fontSize(10)
  doc.text('Property Address:', PAGE_MARGIN, fieldsTop)
  doc.font('Helvetica').text(inspection.property_address, PAGE_MARGIN + 105, fieldsTop, { width: 200 })
  doc.font('Helvetica-Bold').text('Work Order:', 330, fieldsTop)
  doc.font('Helvetica').text(inspection.job_number, 330 + 80, fieldsTop)

  const row2 = fieldsTop + 20
  doc.font('Helvetica-Bold').text('Inspector:', PAGE_MARGIN, row2)
  doc.font('Helvetica').text(inspection.inspector_name, PAGE_MARGIN + 105, row2)
  doc.font('Helvetica-Bold').text('Inspection Date:', 330, row2)
  doc
    .font('Helvetica')
    .text(new Date(inspection.inspection_date).toLocaleDateString('en-US', { timeZone: 'UTC' }), 330 + 100, row2)

  const row3 = row2 + 20
  doc.font('Helvetica-Bold').text('Inspection Type:', PAGE_MARGIN, row3)
  doc.font('Helvetica').text(inspection.inspection_type, PAGE_MARGIN + 105, row3)

  doc.y = row3 + 24

  function ensureSpace(needed: number) {
    if (doc.y + needed > CONTENT_BOTTOM) {
      doc.addPage()
      doc.y = PAGE_MARGIN
    }
  }

  function drawRoomHeader(room: string) {
    ensureSpace(30)
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#000000').text(room, PAGE_MARGIN, doc.y)
    doc.y += 6
    doc.moveTo(PAGE_MARGIN, doc.y).lineTo(PAGE_WIDTH - PAGE_MARGIN, doc.y).lineWidth(1.2).stroke()
    doc.y += 8
  }

  const textColX = PAGE_MARGIN + IMAGE_WIDTH + 16
  const textColWidth = PAGE_WIDTH - PAGE_MARGIN - textColX

  function drawItem(li: LineItem) {
    ensureSpace(ITEM_BLOCK_HEIGHT + 14)
    const blockTop = doc.y
    const imageBuf = li.still_image_file ? imageBuffers.get(li.still_image_file) : undefined

    if (imageBuf) {
      try {
        doc.image(imageBuf, PAGE_MARGIN, blockTop, { fit: [IMAGE_WIDTH, IMAGE_HEIGHT] })
      } catch (err) {
        console.error(`inspection-report: failed to embed image for ${li.item}:`, (err as Error).message)
      }
    } else {
      doc
        .rect(PAGE_MARGIN, blockTop, IMAGE_WIDTH, IMAGE_HEIGHT)
        .lineWidth(0.5)
        .strokeColor('#cccccc')
        .stroke()
        .strokeColor('#000000')
      doc
        .font('Helvetica-Oblique')
        .fontSize(8)
        .fillColor('#8A8F98')
        .text('No image', PAGE_MARGIN, blockTop + IMAGE_HEIGHT / 2 - 4, { width: IMAGE_WIDTH, align: 'center' })
    }

    let textY = blockTop
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000').text(li.item, textColX, textY, { width: textColWidth })
    textY = doc.y + 2

    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(CONDITION_COLOR[li.condition] ?? '#000000')
      .text(li.condition, textColX, textY, { width: textColWidth })
    doc.fillColor('#000000')
    textY = doc.y + 4

    if (li.observed_evidence) {
      doc.font('Helvetica-Bold').fontSize(8).text('Observed:', textColX, textY, { width: textColWidth })
      doc.font('Helvetica').fontSize(8).text(li.observed_evidence, textColX, doc.y, { width: textColWidth })
      textY = doc.y + 3
    }
    if (li.recommended_action) {
      doc.font('Helvetica-Bold').fontSize(8).text('Recommended:', textColX, textY, { width: textColWidth })
      doc.font('Helvetica').fontSize(8).text(li.recommended_action, textColX, doc.y, { width: textColWidth })
      textY = doc.y + 3
    }
    if (li.captured_at) {
      doc.font('Helvetica-Oblique').fontSize(7).fillColor('#8A8F98').text(formatCapturedAt(li.captured_at), textColX, textY, {
        width: textColWidth,
      })
      doc.fillColor('#000000')
    }

    doc.y = Math.max(blockTop + ITEM_BLOCK_HEIGHT, doc.y) + 10
    doc
      .moveTo(PAGE_MARGIN, doc.y - 5)
      .lineTo(PAGE_WIDTH - PAGE_MARGIN, doc.y - 5)
      .lineWidth(0.5)
      .strokeColor('#eeeeee')
      .stroke()
      .strokeColor('#000000')
  }

  if (roomGroups.size === 0) {
    doc.font('Helvetica-Oblique').fontSize(10).text('No line items recorded for this inspection.', PAGE_MARGIN, doc.y)
  }

  for (const [room, items] of roomGroups) {
    drawRoomHeader(room)
    for (const li of items) drawItem(li)
    doc.y += 6
  }

  doc.end()
  const buffer = await done

  const filename = `${inspection.job_number}-inspection-report.pdf`
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      // inline, not attachment -- renders directly in Dashboard's Quick
      // View <iframe> popup instead of forcing a download (same reasoning
      // as move-out-report/route.ts).
      'Content-Disposition': `inline; filename="${filename}"`,
    },
  })
}
