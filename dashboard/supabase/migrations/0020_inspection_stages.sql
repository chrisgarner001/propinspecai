-- Job Timeline now tracks Stages, not individual line items -- a stage can
-- span many items across many batches/vendors, so scheduling/status needs
-- its own home at the (inspection, stage) grain rather than living on each
-- line item. Mirrors the per-line-item scheduling columns from
-- 0010_line_item_scheduling.sql.
create table if not exists inspection_stages (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references inspections(id) on delete cascade,
  stage_id uuid not null references stages(id),
  status text not null default 'not_started'
    check (status in ('not_started', 'scheduled', 'in_progress', 'blocked', 'done', 'qc_needed')),
  scheduled_start date,
  scheduled_end date,
  blocks_inspection_stage_id uuid references inspection_stages(id) on delete set null
    check (blocks_inspection_stage_id is null or blocks_inspection_stage_id != id),
  unique (inspection_id, stage_id)
);
