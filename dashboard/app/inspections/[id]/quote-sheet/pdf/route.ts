import { getSql } from '@/lib/db'
import { NextResponse } from 'next/server'
import PDFDocument from 'pdfkit'
import path from 'node:path'

// Consolidates line items by room/area into a presentable rehab-quote PDF
// for the property owner -- the in-app replacement for the old Google-Sheets
// "Turn Scope" export. Excludes "Removed from Quote Sheet" items
// (tenant_approved = true), same filter as the editor at
// app/inspections/[id]/quote-sheet/page.tsx, so the PDF always matches what
// was last reviewed there.

type LineItem = {
  room_area: string
  item: string
  observed_evidence: string | null
  recommended_action: string | null
  assigned_to: string | null
  vendor_name: string | null
  labor_hours: string | null
  labor_cost: string | null
  materials_cost: string | null
  vendor_estimated_cost: string | null
  quote_stage: string | null
}

const PAGE_MARGIN = 50
const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const CONTENT_BOTTOM = PAGE_HEIGHT - PAGE_MARGIN

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sql = getSql()

  const [inspection] = await sql`select * from inspections where id = ${id}`
  if (!inspection) {
    return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })
  }

  const lineItems = (await sql`
    select li.room_area, li.item, li.observed_evidence, li.recommended_action, li.assigned_to,
      v.name as vendor_name, li.labor_hours, li.labor_cost, li.materials_cost, li.vendor_estimated_cost,
      li.quote_stage
    from line_items li
    left join vendors v on v.id = li.vendor_id
    where li.inspection_id = ${id} and li.tenant_approved = false
    order by li.room_area, li.created_at
  `) as unknown as LineItem[]

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
      .text('Rehab Quote', PAGE_MARGIN, 60, { width: PAGE_WIDTH - PAGE_MARGIN * 2, align: 'right' })
    doc.y = 110
  }

  drawLetterhead()

  doc.moveTo(PAGE_MARGIN, doc.y).lineTo(PAGE_WIDTH - PAGE_MARGIN, doc.y).stroke()
  doc.moveDown(0.8)

  doc.font('Helvetica-Bold').fontSize(16).text(`Quote Sheet For ${inspection.property_address}`, PAGE_MARGIN, doc.y)
  doc.moveDown(0.3)
  doc
    .font('Helvetica')
    .fontSize(10)
    .text(
      `Job ${inspection.job_number}  ·  Inspection Date: ${new Date(inspection.inspection_date).toLocaleDateString('en-US', { timeZone: 'UTC' })}`,
      PAGE_MARGIN,
      doc.y,
    )
  doc.y += 16

  const colItem = PAGE_MARGIN
  const colVendor = PAGE_MARGIN + 200
  const colHours = PAGE_MARGIN + 290
  const colMaterials = PAGE_MARGIN + 335
  const colVendorQuote = PAGE_MARGIN + 400
  const colStage = PAGE_MARGIN + 470
  const colWidth = colVendor - colItem - 6

  function ensureSpace(needed: number) {
    if (doc.y + needed > CONTENT_BOTTOM) {
      doc.addPage()
      doc.y = PAGE_MARGIN
    }
  }

  function drawRoomHeader(room: string) {
    ensureSpace(40)
    doc.font('Helvetica-Bold').fontSize(11).text(room, colItem, doc.y)
    doc.y += 4
    const headerY = doc.y
    doc.font('Helvetica-Bold').fontSize(8)
    doc.text('Item / Comments', colItem, headerY)
    doc.text('Vendor/GPM', colVendor, headerY)
    doc.text('Hours', colHours, headerY)
    doc.text('Materials', colMaterials, headerY)
    doc.text('Vendor Quote', colVendorQuote, headerY)
    doc.text('Stage', colStage, headerY)
    doc.y = headerY + 12
    doc.moveTo(PAGE_MARGIN, doc.y).lineTo(PAGE_WIDTH - PAGE_MARGIN, doc.y).lineWidth(1).stroke()
    doc.y += 4
  }

  let grandMaterials = 0
  let grandLabor = 0
  let grandVendorQuote = 0
  let grandHours = 0

  function drawItemRow(li: LineItem) {
    const comments = [li.observed_evidence, li.recommended_action].filter(Boolean).join(' — ')
    doc.font('Helvetica-Bold').fontSize(9)
    const itemHeight = doc.heightOfString(li.item, { width: colWidth })
    doc.font('Helvetica').fontSize(8)
    const commentsHeight = comments ? doc.heightOfString(comments, { width: colWidth }) : 0
    const rowHeight = Math.max(16, itemHeight + commentsHeight + 4)
    ensureSpace(rowHeight + 6)

    const rowY = doc.y
    const vendorGpm = li.assigned_to === 'Outside Vendor' ? (li.vendor_name ?? 'Outside Vendor') : (li.assigned_to ?? '—')
    const hours = li.labor_hours !== null ? Number(li.labor_hours) : null
    const materials = li.materials_cost !== null ? Number(li.materials_cost) : null
    const vendorQuote = li.vendor_estimated_cost !== null ? Number(li.vendor_estimated_cost) : null

    doc.font('Helvetica-Bold').fontSize(9).text(li.item, colItem, rowY, { width: colWidth })
    if (comments) {
      doc.font('Helvetica').fontSize(8).fillColor('#555555').text(comments, colItem, rowY + itemHeight + 2, { width: colWidth })
      doc.fillColor('#000000')
    }
    doc.font('Helvetica').fontSize(9)
    doc.text(vendorGpm, colVendor, rowY, { width: colHours - colVendor - 4 })
    doc.text(hours !== null ? hours.toFixed(2) : '—', colHours, rowY)
    doc.text(materials !== null ? `$${materials.toFixed(2)}` : '—', colMaterials, rowY)
    doc.text(vendorQuote !== null ? `$${vendorQuote.toFixed(2)}` : '—', colVendorQuote, rowY)
    doc.text(li.quote_stage ?? '—', colStage, rowY, { width: PAGE_WIDTH - PAGE_MARGIN - colStage })

    if (hours !== null) grandHours += hours
    if (materials !== null) grandMaterials += materials
    if (vendorQuote !== null) grandVendorQuote += vendorQuote
    if (li.labor_cost !== null) grandLabor += Number(li.labor_cost)

    doc.y = rowY + rowHeight + 6
    doc
      .moveTo(PAGE_MARGIN, doc.y - 3)
      .lineTo(PAGE_WIDTH - PAGE_MARGIN, doc.y - 3)
      .lineWidth(0.5)
      .strokeColor('#cccccc')
      .stroke()
      .strokeColor('#000000')
  }

  if (roomGroups.size === 0) {
    doc.font('Helvetica-Oblique').fontSize(10).text('No line items in this quote.', colItem, doc.y)
  }

  for (const [room, items] of roomGroups) {
    drawRoomHeader(room)
    for (const li of items) drawItemRow(li)
    doc.y += 8
  }

  ensureSpace(90)
  doc.moveTo(PAGE_MARGIN, doc.y).lineTo(PAGE_WIDTH - PAGE_MARGIN, doc.y).lineWidth(1.2).stroke()
  doc.y += 8

  const grandTotal = grandMaterials + grandLabor + grandVendorQuote
  doc.font('Helvetica-Bold').fontSize(10)
  doc.text(`Total Labor Hours: ${grandHours.toFixed(2)}`, PAGE_MARGIN, doc.y)
  doc.y += 16
  doc.text(`Materials: $${grandMaterials.toFixed(2)}`, PAGE_MARGIN, doc.y)
  doc.y += 16
  doc.text(`GPM Labor: $${grandLabor.toFixed(2)}`, PAGE_MARGIN, doc.y)
  doc.y += 16
  doc.text(`Outside Vendor Quotes: $${grandVendorQuote.toFixed(2)}`, PAGE_MARGIN, doc.y)
  doc.y += 16
  doc.font('Helvetica-Bold').fontSize(13).text(`Grand Total: $${grandTotal.toFixed(2)}`, PAGE_MARGIN, doc.y)

  doc.end()
  const buffer = await done

  const filename = `${inspection.job_number}-quote-sheet.pdf`
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
    },
  })
}
