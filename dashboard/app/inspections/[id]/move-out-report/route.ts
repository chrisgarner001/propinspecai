import { getSql } from '@/lib/db'
import { verifySession } from '@/lib/dal'
import { NextResponse } from 'next/server'
import PDFDocument from 'pdfkit'
import path from 'node:path'

// Structure mirrors GPM's actual "Blank Move In Checklist.pdf" (repo root) --
// same letterhead, Property/Tenant/Date/Type block, per-room Item/Status/
// Comments table, signature block. Two things this does NOT invent, per
// DESIGN.md Decisions Log 2026-09-10:
//   1. The statutory notice paragraph -- the move-in form's notice text is
//      specific to MCL 554.608 move-in requirements; the move-out notice
//      text is different and GPM's actual wording was not supplied. Left as
//      a clearly marked placeholder for counsel review, not guessed.
//   2. Tenant name -- inspections has no tenant_name column. Left blank,
//      same as a fresh paper form, rather than fabricated.
// Condition scale: the checklist uses Good/Fair/Poor; line_items.condition
// is Good/Fair/Damaged/Not Rated. Damaged -> "Poor" for display; Not Rated
// -> blank (no status has been recorded to map).

type LineItem = {
  room_area: string
  item: string
  condition: string
  observed_evidence: string | null
  recommended_action: string | null
  tenant_charge: boolean
  tenant_charge_amount: string | null
}

const CONDITION_DISPLAY: Record<string, string> = {
  Good: 'Good',
  Fair: 'Fair',
  Damaged: 'Poor',
  'Not Rated': '',
}

const PAGE_MARGIN = 50
const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const CONTENT_BOTTOM = PAGE_HEIGHT - PAGE_MARGIN

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
    select room_area, item, condition, observed_evidence, recommended_action,
      tenant_charge, tenant_charge_amount
    from line_items
    where inspection_id = ${id}
    order by room_area, created_at
  `) as unknown as LineItem[]

  const chargedItems = lineItems.filter((li) => li.tenant_charge)

  const roomGroups = new Map<string, LineItem[]>()
  for (const li of lineItems) {
    const key = li.room_area
    if (!roomGroups.has(key)) roomGroups.set(key, [])
    roomGroups.get(key)!.push(li)
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
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('GPM Property Management LLC', PAGE_MARGIN + 145, 45)
    doc
      .font('Helvetica')
      .fontSize(10)
      .text('23944 Eureka Rd. Suite 105', PAGE_MARGIN + 145, 59)
      .text('Taylor, MI 48180', PAGE_MARGIN + 145, 73)
      .text('(734) 287-6619', PAGE_MARGIN + 145, 87)
    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .text('Move-Out Checklist', PAGE_MARGIN, 60, { width: PAGE_WIDTH - PAGE_MARGIN * 2, align: 'right' })
    doc.y = 110
  }

  drawLetterhead()

  doc.moveTo(PAGE_MARGIN, doc.y).lineTo(PAGE_WIDTH - PAGE_MARGIN, doc.y).stroke()
  doc.moveDown(0.8)

  const fieldsTop = doc.y
  doc.font('Helvetica-Bold').fontSize(10)
  doc.text('Property Address:', PAGE_MARGIN, fieldsTop)
  doc.font('Helvetica').text(inspection.property_address, PAGE_MARGIN + 105, fieldsTop, { width: 200 })
  doc.font('Helvetica-Bold').text('Tenant Names:', 330, fieldsTop)
  doc.moveTo(330 + 80, fieldsTop + 10).lineTo(PAGE_WIDTH - PAGE_MARGIN, fieldsTop + 10).stroke()

  const row2 = fieldsTop + 26
  doc.font('Helvetica-Bold').text('Inspection Date:', PAGE_MARGIN, row2)
  doc
    .font('Helvetica')
    .text(
      new Date(inspection.inspection_date).toLocaleDateString('en-US', { timeZone: 'UTC' }),
      PAGE_MARGIN + 105,
      row2,
    )
  doc.font('Helvetica-Bold').text('Inspection Type:', 330, row2)
  doc.font('Helvetica-Bold').fontSize(12).text('Move-Out', 330 + 100, row2 - 1)

  doc.y = row2 + 30
  doc.font('Helvetica-BoldOblique').fontSize(9)
  doc
    .rect(PAGE_MARGIN, doc.y, PAGE_WIDTH - PAGE_MARGIN * 2, 40)
    .stroke()
  doc.text(
    '[MOVE-OUT STATUTORY NOTICE — placeholder. GPM\'s move-in form carries MCL 554.608 move-in notice ' +
      'language; the move-out notice text differs and was not supplied. Confirm exact required wording ' +
      'with counsel before this report is sent to a tenant.]',
    PAGE_MARGIN + 6,
    doc.y + 5,
    { width: PAGE_WIDTH - PAGE_MARGIN * 2 - 12 },
  )
  doc.y += 48

  const colItem = PAGE_MARGIN
  const colStatus = PAGE_MARGIN + 220
  const colComments = PAGE_MARGIN + 300
  const colWidth = PAGE_WIDTH - PAGE_MARGIN - colComments

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
    doc.font('Helvetica-Bold').fontSize(9)
    doc.text('Item', colItem, headerY)
    doc.text('Status', colStatus, headerY)
    doc.text('Comments', colComments, headerY)
    doc.y = headerY + 14
    doc.moveTo(PAGE_MARGIN, doc.y).lineTo(PAGE_WIDTH - PAGE_MARGIN, doc.y).lineWidth(1.2).stroke()
    doc.y += 4
  }

  // Diagonal, semi-transparent stamp over any row the reviewer marked
  // "Tenant Charge" -- makes charged items visually obvious when skimming
  // the full checklist, not just in the separate itemized-charges section.
  function drawTenantChargeWatermark(rowY: number, rowHeight: number) {
    const centerX = (colItem + PAGE_WIDTH - PAGE_MARGIN) / 2
    const centerY = rowY + rowHeight / 2
    doc.save()
    doc.opacity(0.25)
    doc.rotate(-12, { origin: [centerX, centerY] })
    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor('#c0392b')
      .text('TENANT CHARGE', centerX - 90, centerY - 7, { width: 180, align: 'center' })
    doc.restore()
  }

  function drawItemRow(li: LineItem) {
    const comments = [li.observed_evidence, li.recommended_action].filter(Boolean).join(' — ')
    const commentsHeight = doc.heightOfString(comments || '', { width: colWidth })
    const rowHeight = Math.max(14, commentsHeight)
    ensureSpace(rowHeight + 6)

    const rowY = doc.y
    doc.font('Helvetica').fontSize(9)
    doc.text(li.item, colItem, rowY, { width: colStatus - colItem - 6 })
    doc.text(CONDITION_DISPLAY[li.condition] ?? li.condition, colStatus, rowY)
    doc.text(comments, colComments, rowY, { width: colWidth })
    if (li.tenant_charge) drawTenantChargeWatermark(rowY, rowHeight)
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
    doc.font('Helvetica-Oblique').fontSize(10).text('No line items recorded for this inspection.', colItem, doc.y)
  }

  for (const [room, items] of roomGroups) {
    drawRoomHeader(room)
    for (const li of items) {
      drawItemRow(li)
    }
    doc.y += 8
  }

  // --- Itemized Charges to Tenant ---
  // Only rows the reviewer marked "Charge" (tenant_charge = true), at the
  // dollar amount entered on the Tenant Chargeback Review screen
  // (tenant_charge_amount) -- that screen is the sole source of this
  // number now (see app/inspections/[id]/chargeback-review), independent
  // of the Quote Sheet's materials_cost/labor_cost, which frequently isn't
  // filled in yet within the 30-day disposition deadline this report exists
  // to meet. This section previously fell back to materials+labor when no
  // override was entered; that coupling is gone by design.
  doc.y += 10
  ensureSpace(30)
  doc.font('Helvetica-Bold').fontSize(12).text('Itemized Charges to Tenant', colItem, doc.y)
  doc.y += 18

  if (chargedItems.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(9).text('No items charged to tenant.', colItem, doc.y)
    doc.y += 16
  } else {
    const chargeColItem = PAGE_MARGIN
    const chargeColRoom = PAGE_MARGIN + 280
    const chargeColTotal = PAGE_MARGIN + 420

    function drawChargeHeader() {
      ensureSpace(20)
      const headerY = doc.y
      doc.font('Helvetica-Bold').fontSize(9)
      doc.text('Item', chargeColItem, headerY)
      doc.text('Room/Area', chargeColRoom, headerY)
      doc.text('Amount Charged', chargeColTotal, headerY)
      doc.y = headerY + 14
      doc.moveTo(PAGE_MARGIN, doc.y).lineTo(PAGE_WIDTH - PAGE_MARGIN, doc.y).lineWidth(1.2).stroke()
      doc.y += 4
    }

    drawChargeHeader()

    let grandTotal = 0
    let hasPendingAmount = false
    for (const li of chargedItems) {
      const total = li.tenant_charge_amount !== null ? Number(li.tenant_charge_amount) : null
      if (total !== null) grandTotal += total
      else hasPendingAmount = true

      const rowHeight = 16
      ensureSpace(rowHeight)
      if (doc.y === PAGE_MARGIN) drawChargeHeader()
      const rowY = doc.y
      doc.font('Helvetica').fontSize(9)
      doc.text(li.item, chargeColItem, rowY, { width: chargeColRoom - chargeColItem - 6 })
      doc.text(li.room_area, chargeColRoom, rowY, { width: chargeColTotal - chargeColRoom - 6 })
      doc.text(total !== null ? `$${total.toFixed(2)}` : 'Not yet entered', chargeColTotal, rowY)
      doc.y = rowY + rowHeight
      doc
        .moveTo(PAGE_MARGIN, doc.y - 3)
        .lineTo(PAGE_WIDTH - PAGE_MARGIN, doc.y - 3)
        .lineWidth(0.5)
        .strokeColor('#cccccc')
        .stroke()
        .strokeColor('#000000')
    }

    ensureSpace(20)
    doc.font('Helvetica-Bold').fontSize(10)
    doc.text('Total Charged to Tenant:', chargeColRoom, doc.y)
    doc.text(`$${grandTotal.toFixed(2)}`, chargeColTotal, doc.y)
    doc.y += 20

    if (hasPendingAmount) {
      const note =
        'One or more charged items don’t have an amount entered yet in Tenant Chargeback Review -- shown above as "Not yet entered" and excluded from the total until it is.'
      doc.font('Helvetica-Oblique').fontSize(8)
      const noteHeight = doc.heightOfString(note, { width: PAGE_WIDTH - PAGE_MARGIN * 2 })
      ensureSpace(noteHeight + 4)
      doc.text(note, PAGE_MARGIN, doc.y, { width: PAGE_WIDTH - PAGE_MARGIN * 2 })
      doc.y += noteHeight + 8
    }
  }

  ensureSpace(160)
  doc.y += 10
  for (let i = 0; i < 4; i++) {
    ensureSpace(38)
    const y = doc.y
    doc.font('Helvetica').fontSize(9)
    doc.text('Date:', PAGE_MARGIN, y)
    doc.moveTo(PAGE_MARGIN + 30, y + 10).lineTo(PAGE_MARGIN + 220, y + 10).stroke()
    doc.moveTo(280, y + 10).lineTo(PAGE_WIDTH - PAGE_MARGIN, y + 10).stroke()
    doc.text('Print Name:', 280, y + 14)
    doc.text('Signature', PAGE_WIDTH - PAGE_MARGIN - 60, y + 14)
    doc.y = y + 34
  }

  doc.end()
  const buffer = await done

  const filename = `${inspection.job_number}-move-out-checklist.pdf`
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
