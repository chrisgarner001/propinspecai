import { getSql } from '@/lib/db'
import { verifySession } from '@/lib/dal'
import { NextResponse } from 'next/server'
import PDFDocument from 'pdfkit'
import path from 'node:path'

// Worker/vendor take-off sheet for one Stage-assignment batch -- the
// scope-of-work list a crew or vendor takes into the field, as opposed to
// the owner-facing Quote Sheet PDF (which carries $ amounts). No costs here
// on purpose: whoever is doing the work gets Room/Item/Comments/Notes only,
// headed by who it's for and when it's scheduled. Notes is a blank ruled
// line, not a data field -- for the crew to jot something down on-site
// (materials picked up, a wrinkle found, anything worth flagging back),
// same paper-form convention as the signature lines on the Move-Out Report.

type LineItem = {
  room_area: string
  item: string
  observed_evidence: string | null
  recommended_action: string | null
}

type Assignment = {
  assigned_to: string | null
  vendor_id: string | null
  stage_id: string | null
}

const PAGE_MARGIN = 50
const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const CONTENT_BOTTOM = PAGE_HEIGHT - PAGE_MARGIN

function formatDate(d: Date | null) {
  return d ? new Date(d).toLocaleDateString('en-US', { timeZone: 'UTC' }) : null
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; batchNumber: string }> }) {
  const session = await verifySession()
  if (!session) return new NextResponse(null, { status: 401 })
  const { id, batchNumber: batchNumberRaw } = await params
  const batchNumber = Number(batchNumberRaw)
  const sql = getSql()

  const [inspection] = await sql`select * from inspections where id = ${id}`
  if (!inspection) {
    return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })
  }

  const lineItems = (await sql`
    select room_area, item, observed_evidence, recommended_action
    from line_items
    where inspection_id = ${id} and tenant_approved = false and batch_number = ${batchNumber}
    order by room_area, created_at
  `) as unknown as LineItem[]

  if (lineItems.length === 0) {
    return NextResponse.json({ error: 'No line items found for this batch' }, { status: 404 })
  }

  // A batch is meant to be (Stage, Assignee) by construction (see
  // createBatches in app/actions.ts), but batch_number is still manually
  // reassignable on the Quote Sheet, so a batch can end up mixed in
  // practice. Fetching every item's assignment (not just one arbitrary row)
  // and deduping mirrors Stage View's own assigneeLabel/stageLabel -- a
  // single unordered `limit 1` row picked essentially at random here before,
  // which could show the wrong vendor/stage for a batch that isn't uniform.
  const assignments = (await sql`
    select assigned_to, vendor_id, stage_id from line_items
    where inspection_id = ${id} and tenant_approved = false and batch_number = ${batchNumber}
  `) as unknown as Assignment[]

  const vendors = (await sql`select id, name from vendors`) as unknown as { id: string; name: string }[]
  const vendorName = (vendorId: string | null) => vendors.find((v) => v.id === vendorId)?.name ?? 'Vendor'

  const distinctAssignees = new Set(
    assignments.map((a) => (a.assigned_to === 'Outside Vendor' ? `vendor:${a.vendor_id}` : a.assigned_to)),
  )
  const forName =
    distinctAssignees.size > 1
      ? 'Mixed assignment'
      : assignments[0].assigned_to === 'Outside Vendor'
        ? vendorName(assignments[0].vendor_id)
        : (assignments[0].assigned_to ?? 'Unassigned')

  const distinctStages = new Set(assignments.map((a) => a.stage_id))
  const singleStageId = distinctStages.size === 1 ? assignments[0].stage_id : null

  let stageName = 'Mixed stages'
  let scheduleText = 'Not yet scheduled'
  if (distinctStages.size <= 1) {
    if (singleStageId === null) {
      stageName = '—'
    } else {
      const [stageRow] = await sql`
        select s.name as stage_name, ist.scheduled_start, ist.scheduled_end
        from stages s
        left join inspection_stages ist on ist.inspection_id = ${id} and ist.stage_id = s.id
        where s.id = ${singleStageId}
      `
      stageName = stageRow?.stage_name ?? '—'
      if (stageRow?.scheduled_start && stageRow?.scheduled_end) {
        scheduleText = `${formatDate(stageRow.scheduled_start)} – ${formatDate(stageRow.scheduled_end)}`
      }
    }
  }

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
      .text('Take-Off Sheet', PAGE_MARGIN, 60, { width: PAGE_WIDTH - PAGE_MARGIN * 2, align: 'right' })
    doc.y = 110
  }

  drawLetterhead()

  doc.moveTo(PAGE_MARGIN, doc.y).lineTo(PAGE_WIDTH - PAGE_MARGIN, doc.y).stroke()
  doc.moveDown(0.8)

  doc.font('Helvetica-Bold').fontSize(16).text(`For: ${forName}`, PAGE_MARGIN, doc.y)
  doc.moveDown(0.3)
  doc.font('Helvetica-Bold').fontSize(12).text(`Stage: ${stageName}`, PAGE_MARGIN, doc.y)
  doc.moveDown(0.2)
  doc.font('Helvetica').fontSize(11).text(`Scheduled: ${scheduleText}`, PAGE_MARGIN, doc.y)
  doc.moveDown(0.3)
  doc
    .font('Helvetica')
    .fontSize(10)
    .text(
      `${inspection.property_address}  ·  Job ${inspection.job_number}  ·  Batch ${batchNumber}`,
      PAGE_MARGIN,
      doc.y,
    )
  doc.y += 16

  const colItem = PAGE_MARGIN
  const colNotes = PAGE_WIDTH - PAGE_MARGIN - 150
  const colWidth = colNotes - colItem - 10

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
    doc.text('Notes', colNotes, headerY)
    doc.y = headerY + 12
    doc.moveTo(PAGE_MARGIN, doc.y).lineTo(PAGE_WIDTH - PAGE_MARGIN, doc.y).lineWidth(1).stroke()
    doc.y += 4
  }

  function drawItemRow(li: LineItem) {
    const comments = [li.observed_evidence, li.recommended_action].filter(Boolean).join(' — ')
    doc.font('Helvetica-Bold').fontSize(9)
    const itemHeight = doc.heightOfString(li.item, { width: colWidth })
    doc.font('Helvetica').fontSize(8)
    const commentsHeight = comments ? doc.heightOfString(comments, { width: colWidth }) : 0
    const rowHeight = Math.max(16, itemHeight + commentsHeight + 4)
    ensureSpace(rowHeight + 6)

    const rowY = doc.y
    doc.font('Helvetica-Bold').fontSize(9).text(li.item, colItem, rowY, { width: colWidth })
    if (comments) {
      doc.font('Helvetica').fontSize(8).fillColor('#555555').text(comments, colItem, rowY + itemHeight + 2, { width: colWidth })
      doc.fillColor('#000000')
    }
    // Blank ruled line for the crew to write on, not a data field -- see
    // comment at the top of this file.
    const notesLineY = rowY + rowHeight - 4
    doc
      .moveTo(colNotes, notesLineY)
      .lineTo(PAGE_WIDTH - PAGE_MARGIN, notesLineY)
      .lineWidth(0.5)
      .strokeColor('#999999')
      .stroke()
      .strokeColor('#000000')

    doc.y = rowY + rowHeight + 6
    doc
      .moveTo(PAGE_MARGIN, doc.y - 3)
      .lineTo(PAGE_WIDTH - PAGE_MARGIN, doc.y - 3)
      .lineWidth(0.5)
      .strokeColor('#cccccc')
      .stroke()
      .strokeColor('#000000')
  }

  for (const [room, items] of roomGroups) {
    drawRoomHeader(room)
    for (const li of items) drawItemRow(li)
    doc.y += 8
  }

  doc.end()
  const buffer = await done

  const filename = `${inspection.job_number}-batch-${batchNumber}-takeoff.pdf`
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
    },
  })
}
