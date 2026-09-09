import postgres from 'postgres'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envLine = readFileSync(join(__dirname, '../.env.local'), 'utf-8')
  .split('\n')
  .find((l) => l.startsWith('DATABASE_URL='))
const url = envLine.slice('DATABASE_URL='.length).trim()

const sql = postgres(url, { ssl: 'require' })

const lineItems = [
  {
    room_area: 'Living Room',
    item: 'Walls',
    condition: 'Damaged',
    observed_evidence: 'Mounting holes and poor prior patching visible throughout',
    assigned_to: 'Outside Vendor',
    trade_category: 'Painting/Drywall',
    recommended_action: 'Repair holes/patches, then paint',
    priority: 'Before next occupancy',
    source_timestamp: '0:01-0:40',
    source_video_file: '20260908_135800.mp4',
  },
  {
    room_area: 'Living Room',
    item: 'Ceiling',
    condition: 'Damaged',
    observed_evidence: 'Visible crack across ceiling',
    assigned_to: 'Outside Vendor',
    trade_category: 'Painting/Drywall',
    recommended_action: 'Repair crack, paint ceiling',
    priority: 'Before next occupancy',
    source_timestamp: '0:20-0:43',
    source_video_file: '20260908_135800.mp4',
  },
  {
    room_area: 'Living Room',
    item: 'Front picture-window blind',
    condition: 'Damaged',
    observed_evidence: 'Blind mechanism broken/crooked',
    assigned_to: 'GPM Staff',
    trade_category: 'Doors/Windows (hardware)',
    recommended_action: 'Install new blind; remove old mounting hardware; repair affected area',
    priority: 'Before next occupancy',
    source_timestamp: '1:05-1:14',
    source_video_file: '20260908_135800.mp4',
  },
  {
    room_area: 'Living Room',
    item: 'Side-window mini-blind',
    condition: 'Damaged',
    observed_evidence: 'Mini-blind broken',
    assigned_to: 'GPM Staff',
    trade_category: 'Doors/Windows (hardware)',
    recommended_action: 'Replace mini-blind; remove old hardware; repair mounting area',
    priority: 'Before next occupancy',
    source_timestamp: 'Clip 2, 0:20-0:29',
    source_video_file: '20260908_140314.mp4',
  },
  {
    room_area: 'Living Room',
    item: 'Windows / glass',
    condition: 'Good',
    observed_evidence: 'No damage to window units observed',
    assigned_to: null,
    trade_category: null,
    recommended_action: 'None',
    priority: 'No action',
    source_timestamp: null,
    source_video_file: null,
  },
  {
    room_area: 'Living Room',
    item: 'Hardwood flooring',
    condition: 'Damaged',
    observed_evidence: 'Multiple dark stains visible on floor',
    assigned_to: 'Outside Vendor',
    trade_category: 'Flooring',
    recommended_action: 'Clean / refinish affected area (method to be confirmed on-site)',
    priority: 'Before next occupancy',
    source_timestamp: 'Clip 2, 0:30-0:44',
    source_video_file: '20260908_140314.mp4',
  },
  {
    room_area: 'Living Room',
    item: 'Flooring at wall vent',
    condition: 'Damaged',
    observed_evidence: 'Aluminum patch needed at vent; base molding needs caulking',
    assigned_to: 'Outside Vendor',
    trade_category: 'Flooring',
    recommended_action: 'Repair patch, caulk base molding',
    priority: 'Before next occupancy',
    source_timestamp: 'Clip 2, 0:40-0:47',
    source_video_file: '20260908_140314.mp4',
  },
  {
    room_area: 'Living Room',
    item: 'Electrical outlets / cover plates',
    condition: 'Fair',
    observed_evidence: 'Outlets functional; devices and cover plates need cleaning',
    assigned_to: 'GPM Staff',
    trade_category: 'Electrical (minor - no rewiring)',
    recommended_action: 'Secure outlets; clean devices and cover plates',
    priority: 'Routine turnover',
    source_timestamp: '0:43-0:56',
    source_video_file: '20260908_135800.mp4',
  },
  {
    room_area: 'Living Room',
    item: 'Closet door',
    condition: 'Damaged',
    observed_evidence: 'Does not latch properly',
    assigned_to: 'GPM Staff',
    trade_category: 'Carpentry',
    recommended_action: 'Adjust strike / door alignment',
    priority: 'Routine turnover',
    source_timestamp: 'Clip 2, 0:45-0:50',
    source_video_file: '20260908_140314.mp4',
  },
]

try {
  const [inspection] = await sql`
    insert into inspections (job_number, property_address, inspection_date, inspector_name)
    values ('121939', '1554 Brest, Lincoln Park, MI', '2026-09-08', 'Chuck Larson')
    returning id
  `
  console.log('Created inspection:', inspection.id)

  for (const li of lineItems) {
    await sql`
      insert into line_items ${sql({ inspection_id: inspection.id, ...li })}
    `
  }
  console.log(`Inserted ${lineItems.length} line items.`)
} catch (err) {
  console.error('Seed FAILED:', err.message)
  process.exitCode = 1
} finally {
  await sql.end()
}
