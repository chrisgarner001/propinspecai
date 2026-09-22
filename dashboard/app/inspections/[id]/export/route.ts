import { getSql } from '@/lib/db'
import { verifySession } from '@/lib/dal'
import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'

// Column set is a reasonable default pending Courtney's actual rehab-quote
// template (still not obtained -- see docs/designs/propinspecai-video-inspection-pipeline.md,
// "Open Questions"). Swap this layout once that template exists.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession()
  if (!session) return new NextResponse(null, { status: 401 })
  const { id } = await params
  const sql = getSql()

  const [inspection] = await sql`select * from inspections where id = ${id}`
  if (!inspection) {
    return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })
  }

  const lineItems = await sql`
    select li.*, v.name as vendor_name
    from line_items li
    left join vendors v on v.id = li.vendor_id
    where li.inspection_id = ${id}
    order by li.room_area, li.created_at
  `

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'PropInspec'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('Rehab Quote')

  sheet.addRow(['Property', inspection.property_address])
  sheet.addRow(['Work Order Number', inspection.job_number])
  sheet.addRow(['Inspector', inspection.inspector_name])
  sheet.addRow([
    'Inspection Date',
    new Date(inspection.inspection_date).toLocaleDateString('en-US', { timeZone: 'UTC' }),
  ])
  sheet.addRow([])

  const headerRow = sheet.addRow([
    'Room/Area',
    'Item',
    'Condition',
    'Assigned To',
    'Materials Cost',
    'Labor Cost',
    'Vendor Est. Cost',
    'Line Total',
    'Tenant Status',
    'Recommended Action',
  ])
  headerRow.font = { bold: true }

  const moneyCols = [5, 6, 7, 8]
  for (const li of lineItems) {
    const materials = Number(li.materials_cost ?? 0)
    const labor = Number(li.labor_cost ?? 0)
    const vendorEst = Number(li.vendor_estimated_cost ?? 0)
    const total = materials + labor + vendorEst

    const assignedTo =
      li.assigned_to === 'Outside Vendor' && li.vendor_name ? li.vendor_name : (li.assigned_to ?? '')

    const row = sheet.addRow([
      li.room_area,
      li.item,
      li.condition,
      assignedTo,
      li.materials_cost !== null ? materials : null,
      li.labor_cost !== null ? labor : null,
      li.vendor_estimated_cost !== null ? vendorEst : null,
      total,
      [li.tenant_charge ? 'Charge' : '', li.tenant_approved ? 'Removed from Quote Sheet' : ''].filter(Boolean).join(', '),
      li.recommended_action ?? '',
    ])
    for (const col of moneyCols) {
      row.getCell(col).numFmt = '$#,##0.00'
    }
  }

  sheet.columns.forEach((col) => {
    col.width = 20
  })

  const buffer = await workbook.xlsx.writeBuffer()

  const filename = `${inspection.job_number}-rehab-quote.xlsx`
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
