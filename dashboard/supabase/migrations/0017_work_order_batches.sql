-- Groups Quote Sheet line items into Work Order batches: one per vendor
-- (all items assigned to that vendor) and one shared batch for all GPM
-- Staff items (no per-technician split yet -- see DESIGN.md Decisions Log,
-- 2026-09-11: skipped a full Technician concept for v1, one GPM batch per
-- inspection covers the current need).
create table if not exists work_orders (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references inspections(id) on delete cascade,
  type text not null check (type in ('gpm', 'vendor')),
  vendor_id uuid references vendors(id),
  created_at timestamptz not null default now(),
  -- A vendor batch is unique per vendor per inspection; the single GPM batch
  -- is enforced by the partial unique index below (vendor_id is null for it).
  constraint work_orders_vendor_requires_vendor_id check (type = 'gpm' or vendor_id is not null)
);

create unique index if not exists work_orders_one_gpm_per_inspection
  on work_orders(inspection_id) where type = 'gpm';
create unique index if not exists work_orders_one_per_vendor_per_inspection
  on work_orders(inspection_id, vendor_id) where type = 'vendor';

alter table line_items add column if not exists work_order_id uuid references work_orders(id) on delete set null;
