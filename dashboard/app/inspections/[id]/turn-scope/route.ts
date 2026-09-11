import { getSql } from '@/lib/db'
import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { getGoogleAuth, findPropertyFolder, parseStreetAddress } from '@/lib/google'

// Creates a real Google Sheet (not a downloaded file) matching the column
// structure and styling of GPM's "Turn Scope - 19946 Kinloch ... .xlsx"
// reference file: a bold-bordered Area/Details/Comments/Vendor-GPM/Hours/Stage
// table with a running labor-hours total, plus a VendorsEstimates tab.
//
// Created directly inside the property's Shared Drive folder via
// drive.files.create -- NOT via sheets.spreadsheets.create, which always
// tries to create in the caller's own Drive space. Modern service accounts
// have no personal Drive storage quota, so that call 403s ("The caller does
// not have permission") no matter what scopes/roles are granted; creating
// straight into a Shared Drive folder sidesteps the whole problem because
// Shared Drives have drive-level storage, not per-user. See DESIGN.md
// Decisions Log, 2026-09-10.

type LineItem = {
  room_area: string
  item: string
  observed_evidence: string | null
  recommended_action: string | null
  assigned_to: string | null
  labor_hours: string | null
  materials_cost: string | null
  vendor_estimated_cost: string | null
  vendor_name: string | null
}

const BORDER = { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } }
const TURN_SCOPE_SHEET_ID = 0
const VENDOR_SHEET_ID = 1

function cell(
  value: { stringValue?: string; numberValue?: number; formulaValue?: string },
  bold = false,
  extra: { fontSize?: number; wrap?: boolean } = {},
) {
  return {
    userEnteredValue: value,
    userEnteredFormat: {
      textFormat: { bold, fontSize: extra.fontSize ?? 12 },
      ...(extra.wrap ? { wrapStrategy: 'WRAP' as const } : {}),
    },
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sql = getSql()

  const [inspection] = await sql`select * from inspections where id = ${id}`
  if (!inspection) {
    return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })
  }

  const parsed = parseStreetAddress(inspection.property_address)
  if (!parsed) {
    return NextResponse.json(
      { error: `Could not parse a street number/name from "${inspection.property_address}"` },
      { status: 400 },
    )
  }

  const folder = await findPropertyFolder(parsed.streetName, parsed.number)
  if (!folder) {
    return NextResponse.json(
      {
        error: `No property folder matching "${parsed.streetName} ${parsed.number}" was found in either Shared Drive. Create the folder (named "<street name> <street number>") and try again.`,
      },
      { status: 404 },
    )
  }

  const lineItems = (await sql`
    select li.room_area, li.item, li.observed_evidence, li.recommended_action,
      li.assigned_to, li.labor_hours, li.materials_cost, li.vendor_estimated_cost, v.name as vendor_name
    from line_items li
    left join vendors v on v.id = li.vendor_id
    where li.inspection_id = ${id} and li.tenant_approved = false
    order by li.room_area, li.created_at
  `) as unknown as LineItem[]

  const auth = getGoogleAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const drive = google.drive({ version: 'v3', auth })

  // Create empty, directly inside the property's Shared Drive folder.
  const file = await drive.files.create({
    requestBody: {
      name: `Quote Sheet - ${inspection.property_address} ${inspection.job_number}`,
      mimeType: 'application/vnd.google-apps.spreadsheet',
      parents: [folder.folderId],
    },
    fields: 'id',
    supportsAllDrives: true,
  })
  const spreadsheetId = file.data.id!

  const firstDataRow = 5 // 0-indexed -> displayed row 6
  const totalsRow = firstDataRow + lineItems.length // 0-indexed
  const totalsRowDisplayed = totalsRow + 1

  const dataRows = lineItems.map((li, idx) => {
    const comments = [li.observed_evidence, li.recommended_action].filter(Boolean).join(' — ')
    const vendorGpm = li.assigned_to === 'Outside Vendor' ? (li.vendor_name ?? 'Outside Vendor') : (li.assigned_to ?? '')
    return {
      values: [
        cell({ numberValue: idx + 1 }),
        cell({ stringValue: li.room_area }),
        cell({ stringValue: li.item }),
        cell({ stringValue: comments }, false, { wrap: true }),
        cell({ stringValue: vendorGpm }),
        li.labor_hours !== null ? cell({ numberValue: Number(li.labor_hours) }) : cell({}),
        li.materials_cost !== null ? cell({ numberValue: Number(li.materials_cost) }) : cell({}),
        li.vendor_estimated_cost !== null ? cell({ numberValue: Number(li.vendor_estimated_cost) }) : cell({}),
        cell({}),
      ],
    }
  })

  const vendorRows = lineItems
    .filter((li) => li.assigned_to === 'Outside Vendor')
    .map((li) => ({
      values: [
        cell({ stringValue: li.vendor_name ?? '' }),
        cell({ stringValue: li.item }),
        li.vendor_estimated_cost !== null ? cell({ numberValue: Number(li.vendor_estimated_cost) }) : cell({}),
      ],
    }))

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        // Rename the default first sheet, add the VendorsEstimates tab.
        {
          updateSheetProperties: {
            properties: { sheetId: TURN_SCOPE_SHEET_ID, title: 'Quote Sheet' },
            fields: 'title',
          },
        },
        {
          addSheet: {
            properties: { sheetId: VENDOR_SHEET_ID, title: 'VendorsEstimates' },
          },
        },
        // Row 1: title. Row 2: inspection date.
        {
          updateCells: {
            start: { sheetId: TURN_SCOPE_SHEET_ID, rowIndex: 0, columnIndex: 1 },
            rows: [
              { values: [cell({ stringValue: `Quote Sheet For ${inspection.property_address}` }, true, { fontSize: 16 })] },
              {
                values: [
                  cell(
                    {
                      stringValue: `Inspection Date: ${new Date(inspection.inspection_date).toLocaleDateString('en-US', { timeZone: 'UTC' })}`,
                    },
                    true,
                  ),
                ],
              },
            ],
            fields: 'userEnteredValue,userEnteredFormat',
          },
        },
        // Row 3 (0-indexed row 2): address (2x the base 12pt font), running-hours-total label + formula.
        {
          updateCells: {
            start: { sheetId: TURN_SCOPE_SHEET_ID, rowIndex: 2, columnIndex: 1 },
            rows: [
              {
                values: [
                  cell({ stringValue: inspection.property_address }, true, { fontSize: 24 }),
                  cell({}),
                  cell({}),
                  cell({ stringValue: 'Running Labor Hours Total ' }, true),
                  cell({}),
                  cell({ formulaValue: `=F${totalsRowDisplayed}` }),
                ],
              },
            ],
            fields: 'userEnteredValue,userEnteredFormat',
          },
        },
        // Row 5 (0-indexed row 4): column headers.
        {
          updateCells: {
            start: { sheetId: TURN_SCOPE_SHEET_ID, rowIndex: 4, columnIndex: 1 },
            rows: [
              {
                values: [
                  'Area',
                  'Details',
                  'Comments',
                  'Vendor/GPM',
                  'Hours',
                  'Materials',
                  'Vendor Quote',
                  'Stage ',
                ].map((label) => cell({ stringValue: label }, true)),
              },
            ],
            fields: 'userEnteredValue,userEnteredFormat',
          },
        },
        // Data rows + totals row.
        {
          updateCells: {
            start: { sheetId: TURN_SCOPE_SHEET_ID, rowIndex: firstDataRow, columnIndex: 0 },
            rows: [
              ...dataRows,
              {
                values: [
                  cell({}),
                  cell({}),
                  cell({}),
                  cell({}),
                  cell({}),
                  cell({ formulaValue: `=SUM(F${firstDataRow + 1}:F${totalsRow})` }),
                  cell({}),
                  cell({}),
                  cell({}),
                ],
              },
            ],
            fields: 'userEnteredValue,userEnteredFormat',
          },
        },
        // VendorsEstimates tab.
        {
          updateCells: {
            start: { sheetId: VENDOR_SHEET_ID, rowIndex: 0, columnIndex: 0 },
            rows: [
              { values: ['VENDOR ', 'DESCRIPTION', 'AMOUNT'].map((label) => cell({ stringValue: label }, true)) },
              ...vendorRows,
            ],
            fields: 'userEnteredValue,userEnteredFormat',
          },
        },
        // Merge B3:D3, borders over the table, sane column widths.
        {
          mergeCells: {
            range: { sheetId: TURN_SCOPE_SHEET_ID, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 1, endColumnIndex: 4 },
            mergeType: 'MERGE_ALL',
          },
        },
        {
          updateBorders: {
            range: {
              sheetId: TURN_SCOPE_SHEET_ID,
              startRowIndex: 4,
              endRowIndex: totalsRow,
              startColumnIndex: 1,
              endColumnIndex: 9,
            },
            top: BORDER,
            bottom: BORDER,
            left: BORDER,
            right: BORDER,
            innerHorizontal: BORDER,
            innerVertical: BORDER,
          },
        },
        {
          updateDimensionProperties: {
            range: { sheetId: TURN_SCOPE_SHEET_ID, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 },
            properties: { pixelSize: 140 },
            fields: 'pixelSize',
          },
        },
        {
          updateDimensionProperties: {
            range: { sheetId: TURN_SCOPE_SHEET_ID, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 },
            properties: { pixelSize: 260 },
            fields: 'pixelSize',
          },
        },
        // Comments (D): fixed 540px width with wrapped text (wrap set per-cell
        // above). Row heights are then auto-resized to fit the now-wrapped
        // text -- must run after both the data rows and this width are set,
        // since wrapped height depends on the final column width.
        {
          updateDimensionProperties: {
            range: { sheetId: TURN_SCOPE_SHEET_ID, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 },
            properties: { pixelSize: 540 },
            fields: 'pixelSize',
          },
        },
        {
          autoResizeDimensions: {
            dimensions: { sheetId: TURN_SCOPE_SHEET_ID, dimension: 'ROWS', startIndex: firstDataRow, endIndex: totalsRow },
          },
        },
      ],
    },
  })

  return NextResponse.redirect(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`)
}
