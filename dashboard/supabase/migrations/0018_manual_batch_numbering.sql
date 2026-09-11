-- Replaces the previous auto-only work_orders design (one batch per
-- vendor/GPM, no manual reassignment) with a plain per-item batch number the
-- reviewer can freely edit -- needed to split e.g. GPM items across two
-- techs, which the single-GPM-batch design couldn't express. No real data
-- exists in work_orders yet (the feature shipped and was immediately
-- revised the same session), so this is a straight replacement, not a
-- migration of existing rows.
alter table line_items drop column if exists work_order_id;
drop table if exists work_orders;

alter table line_items add column if not exists batch_number integer;

-- Per-(inspection, batch_number) metadata -- currently just the PropertyWare
-- work order number, entered manually for now (Send to PW is a stand-in
-- until real PropertyWare API credentials/docs are available -- see
-- app/inspections/[id]/quote-sheet/batches/page.tsx).
create table if not exists work_order_batches (
  inspection_id uuid not null references inspections(id) on delete cascade,
  batch_number integer not null,
  pw_work_order_number text,
  sent_to_pw_at timestamptz,
  primary key (inspection_id, batch_number)
);
