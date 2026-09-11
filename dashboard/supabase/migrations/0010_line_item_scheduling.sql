-- Job Timeline (docs/designs/propinspec-job-tracking-scope.md): tracks the
-- rehab/turn job itself, not just the quote. Scoped per-inspection (no
-- properties table exists -- property_address is free text on inspections).
alter table line_items
  add column status text not null default 'not_started'
    check (status in ('not_started', 'scheduled', 'in_progress', 'blocked', 'done', 'qc_needed')),
  add column scheduled_start date,
  add column scheduled_end date,
  add column blocks_line_item_id uuid references line_items(id) on delete set null
    check (blocks_line_item_id is null or blocks_line_item_id != id);
