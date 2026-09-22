import { getSql } from '@/lib/db'
import { verifySession } from '@/lib/dal'
import { NextResponse } from 'next/server'
import PDFDocument from 'pdfkit'
import path from 'node:path'

// A shopping list for the job -- every SKU a reviewer has recorded (a line
// item's primary Supplier/SKU, any Additional SKUs on it, and every Bulk
// Materials entry) in one place, grouped by Supplier so whoever is doing the
// buying knows what to grab at each store. Distinct from the Quote Sheet PDF
// (owner-facing, carries $ amounts) and the Take-Off Sheet (per-batch scope
// of work, no SKUs at all) -- this one exists purely to support purchasing.

type Entry = { supplier: string | null; sku: string | null; quantity: string | null; source: string }

const PAGE_MARGIN = 50
const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const CONTENT_BOTTOM = PAGE_HEIGHT - PAGE_MARGIN
const UNSPECIFIED_SUPPLIER = 'Unspecified Supplier'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession()
  if (!session) return new NextResponse(null, { status: 401 })
  const { id } = await params
  const sql = getSql()

  const [inspection] = await sql`select * from inspections where id = ${id}`
  if (!inspection) {
    return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })
  }

  const primarySkus = (await sql`
    select room_area, item, supplier, sku, sku_quantity
    from line_items
    where inspection_id = ${id} and tenant_approved = false and (supplier is not null or sku is not null)
    order by room_area, created_at
  `) as unknown as { room_area: string; item: string; supplier: string | null; sku: string | null; sku_quantity: string | null }[]

  const additionalSkus = (await sql`
    select li.room_area, li.item, las.supplier, las.sku, las.quantity
    from line_item_additional_skus las
    join line_items li on li.id = las.line_item_id
    where li.inspection_id = ${id} and li.tenant_approved = false
    order by li.room_area, li.created_at, las.created_at
  `) as unknown as { room_area: string; item: string; supplier: string | null; sku: string | null; quantity: string | null }[]

  const bulkMaterials = (await sql`
    select supplier, sku, quantity, notes from inspection_bulk_materials where inspection_id = ${id} order by created_at
  `) as unknown as { supplier: string | null; sku: string | null; quantity: string | null; notes: string | null }[]

  const entries: Entry[] = [
    ...primarySkus.map((r) => ({ supplier: r.supplier, sku: r.sku, quantity: r.sku_quantity, source: `${r.room_area} — ${r.item}` })),
    ...additionalSkus.map((r) => ({ supplier: r.supplier, sku: r.sku, quantity: r.quantity, source: `${r.room_area} — ${r.item}` })),
    ...bulkMaterials.map((r) => ({
      supplier: r.supplier,
      sku: r.sku,
      quantity: r.quantity,
      source: `Bulk — used across multiple items${r.notes ? `: ${r.notes}` : ''}`,
    })),
  ]

  const bySupplier = new Map<string, Entry[]>()
  for (const e of entries) {
    const key = e.supplier?.trim() || UNSPECIFIED_SUPPLIER
    if (!bySupplier.has(key)) bySupplier.set(key, [])
    bySupplier.get(key)!.push(e)
  }
  const suppliers = [...bySupplier.keys()].sort((a, b) => {
    if (a === UNSPECIFIED_SUPPLIER) return 1
    if (b === UNSPECIFIED_SUPPLIER) return -1
    return a.localeCompare(b)
  })

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
      .text('Materials Order List', PAGE_MARGIN, 60, { width: PAGE_WIDTH - PAGE_MARGIN * 2, align: 'right' })
    doc.y = 110
  }

  drawLetterhead()

  doc.moveTo(PAGE_MARGIN, doc.y).lineTo(PAGE_WIDTH - PAGE_MARGIN, doc.y).stroke()
  doc.moveDown(0.8)

  doc.font('Helvetica-Bold').fontSize(16).text(`Materials Order List — ${inspection.property_address}`, PAGE_MARGIN, doc.y)
  doc.moveDown(0.3)
  doc.font('Helvetica').fontSize(10).text(`WO ${inspection.job_number}`, PAGE_MARGIN, doc.y)
  doc.y += 16

  const colSku = PAGE_MARGIN
  const colQty = PAGE_MARGIN + 260
  const colFor = PAGE_MARGIN + 320
  const colWidth = colQty - colSku - 10
  const forWidth = PAGE_WIDTH - PAGE_MARGIN - colFor

  function ensureSpace(needed: number) {
    if (doc.y + needed > CONTENT_BOTTOM) {
      doc.addPage()
      doc.y = PAGE_MARGIN
    }
  }

  function drawSupplierHeader(supplier: string) {
    ensureSpace(40)
    doc.font('Helvetica-Bold').fontSize(12).text(supplier, colSku, doc.y)
    doc.y += 4
    const headerY = doc.y
    doc.font('Helvetica-Bold').fontSize(8)
    doc.text('SKU', colSku, headerY)
    doc.text('Qty', colQty, headerY)
    doc.text('For', colFor, headerY)
    doc.y = headerY + 12
    doc.moveTo(PAGE_MARGIN, doc.y).lineTo(PAGE_WIDTH - PAGE_MARGIN, doc.y).lineWidth(1).stroke()
    doc.y += 4
  }

  function drawEntryRow(entry: Entry) {
    doc.font('Helvetica').fontSize(9)
    const skuHeight = doc.heightOfString(entry.sku || '—', { width: colWidth })
    const forHeight = doc.heightOfString(entry.source, { width: forWidth })
    const rowHeight = Math.max(16, skuHeight, forHeight)
    ensureSpace(rowHeight + 6)

    const rowY = doc.y
    doc.font('Helvetica').fontSize(9)
    doc.text(entry.sku || '—', colSku, rowY, { width: colWidth })
    doc.text(entry.quantity || '—', colQty, rowY, { width: colFor - colQty - 6 })
    doc.fillColor('#555555').text(entry.source, colFor, rowY, { width: forWidth })
    doc.fillColor('#000000')

    doc.y = rowY + rowHeight + 6
    doc
      .moveTo(PAGE_MARGIN, doc.y - 3)
      .lineTo(PAGE_WIDTH - PAGE_MARGIN, doc.y - 3)
      .lineWidth(0.5)
      .strokeColor('#cccccc')
      .stroke()
      .strokeColor('#000000')
  }

  if (entries.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(10).text('No SKUs or Bulk Materials recorded for this inspection.', colSku, doc.y)
  }

  for (const supplier of suppliers) {
    drawSupplierHeader(supplier)
    for (const entry of bySupplier.get(supplier)!) drawEntryRow(entry)
    doc.y += 8
  }

  doc.end()
  const buffer = await done

  const filename = `${inspection.job_number}-materials-order.pdf`
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
    },
  })
}
