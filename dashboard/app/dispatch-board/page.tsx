import { getSql } from '@/lib/db'
import AppShell from '@/app/components/AppShell'
import DispatchBoard, { type BoardItem, type CrewRow, type PropertyRow } from '@/app/components/DispatchBoard'

export const dynamic = 'force-dynamic'

// Portfolio-wide successor to the old per-inspection Job Timeline
// (`/inspections/[id]/timeline`, removed) -- the Gantt-per-job view didn't
// scale once several jobs are in the rehab/turn pipeline at once (user
// feedback, 2026-09-18). Same underlying data (inspection_stages,
// 0020_inspection_stages.sql) shown across every active job instead of one.
const BOARD_STATUSES = ['approved', 'scheduled', 'in_process']

type InspectionRow = { id: string; job_number: string; property_address: string }
type StageRow = { id: string; name: string; sort_order: number }
type VendorRow = { id: string; name: string }
type LineItemAssignment = { inspection_id: string; stage_id: string; assigned_to: string | null; vendor_id: string | null }
type InspectionStageRow = { id: string; inspection_id: string; stage_id: string; scheduled_start: Date | null; scheduled_end: Date | null }

function toDateInputValue(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null
}

export default async function DispatchBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string }>
}) {
  const { job: focusInspectionId } = await searchParams
  const sql = getSql()

  const statusInspections = (await sql`
    select id, job_number, property_address from inspections
    where status in ${sql(BOARD_STATUSES)}
    order by property_address
  `) as unknown as InspectionRow[]

  // A direct "?job=" link (from a specific Quote Sheet) always works, even
  // for a job whose status wouldn't otherwise put it on the board.
  let inspections = statusInspections
  if (focusInspectionId && !inspections.some((i) => i.id === focusInspectionId)) {
    const extra = (await sql`
      select id, job_number, property_address from inspections where id = ${focusInspectionId}
    `) as unknown as InspectionRow[]
    inspections = [...inspections, ...extra]
  }

  const inspectionIds = inspections.map((i) => i.id)
  const stages = (await sql`select id, name, sort_order from stages order by sort_order`) as unknown as StageRow[]
  const vendors = (await sql`select id, name from vendors order by name`) as unknown as VendorRow[]
  const vendorName = (vendorId: string | null) => vendors.find((v) => v.id === vendorId)?.name ?? 'Vendor'

  let assignments: LineItemAssignment[] = []
  let inspectionStages: InspectionStageRow[] = []
  if (inspectionIds.length > 0) {
    assignments = (await sql`
      select inspection_id, stage_id, assigned_to, vendor_id from line_items
      where inspection_id in ${sql(inspectionIds)} and stage_id is not null
    `) as unknown as LineItemAssignment[]

    inspectionStages = (await sql`
      select id, inspection_id, stage_id, scheduled_start, scheduled_end from inspection_stages
      where inspection_id in ${sql(inspectionIds)}
    `) as unknown as InspectionStageRow[]
  }

  const inspectionById = new Map(inspections.map((i) => [i.id, i]))
  const stageById = new Map(stages.map((s) => [s.id, s]))

  // Every distinct (inspection, stage) pair that actually has line items --
  // this is "every Stage bucket that exists," whether or not it's been
  // scheduled yet (that split happens client-side on scheduledStart/End).
  const pairKey = (inspectionId: string, stageId: string) => `${inspectionId}:${stageId}`
  const grouped = new Map<string, LineItemAssignment[]>()
  for (const a of assignments) {
    const key = pairKey(a.inspection_id, a.stage_id)
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(a)
  }

  const items: BoardItem[] = [...grouped.entries()].map(([key, rows]) => {
    const [inspectionId, stageId] = key.split(':')
    const inspection = inspectionById.get(inspectionId)!
    const stage = stageById.get(stageId)!
    const scheduleRow = inspectionStages.find((s) => s.inspection_id === inspectionId && s.stage_id === stageId)

    const distinct = new Set(rows.map((r) => (r.assigned_to === 'Outside Vendor' ? `vendor:${r.vendor_id}` : r.assigned_to)))
    let crewKey = 'unassigned'
    let crewLabel = 'Unassigned / Mixed'
    let assignedTo: string | null = null
    let vendorId: string | null = null
    if (distinct.size === 1) {
      const only = rows[0]
      if (only.assigned_to === 'GPM Staff') {
        crewKey = 'gpm'
        crewLabel = 'GPM Staff'
        assignedTo = 'GPM Staff'
      } else if (only.assigned_to === 'Outside Vendor' && only.vendor_id) {
        crewKey = only.vendor_id
        crewLabel = vendorName(only.vendor_id)
        assignedTo = 'Outside Vendor'
        vendorId = only.vendor_id
      }
    }

    return {
      key,
      inspectionStageId: scheduleRow?.id ?? null,
      inspectionId,
      stageId,
      stageName: stage.name,
      stageSortOrder: stage.sort_order,
      jobNumber: inspection.job_number,
      propertyAddress: inspection.property_address,
      itemCount: rows.length,
      crewKey,
      crewLabel,
      assignedTo,
      vendorId,
      scheduledStart: toDateInputValue(scheduleRow?.scheduled_start ?? null),
      scheduledEnd: toDateInputValue(scheduleRow?.scheduled_end ?? null),
    }
  })

  const propertyRows: PropertyRow[] = inspections.map((i) => ({
    key: i.id,
    label: i.property_address,
    sub: `Job ${i.job_number}`,
  }))

  const crewRows: CrewRow[] = [
    { key: 'gpm', label: 'GPM Staff' },
    ...vendors.map((v) => ({ key: v.id, label: v.name })),
    { key: 'unassigned', label: 'Unassigned / Mixed' },
  ]

  return (
    <AppShell active="/dispatch-board" reviewerName="Jessica Zilka" title="Dispatch Board" wide>
      <DispatchBoard
        items={items}
        propertyRows={propertyRows}
        crewRows={crewRows}
        focusInspectionId={inspections.some((i) => i.id === focusInspectionId) ? focusInspectionId : undefined}
      />
    </AppShell>
  )
}
