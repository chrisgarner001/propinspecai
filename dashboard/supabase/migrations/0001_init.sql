-- PropInspecAI initial schema
-- Inspections: one row per move-out inspection job.
-- Line items: one row per inspected item/finding, editable by the reviewer (Jessica).

create table if not exists inspections (
  id uuid primary key default gen_random_uuid(),
  job_number text not null,
  property_address text not null,
  inspection_date date not null,
  inspector_name text not null,
  status text not null default 'pending_review'
    check (status in ('pending_review', 'reviewed', 'exported')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists line_items (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references inspections(id) on delete cascade,
  room_area text not null,
  item text not null,
  condition text not null
    check (condition in ('Good', 'Fair', 'Damaged', 'Not Rated')),
  observed_evidence text,
  assigned_to text
    check (assigned_to in ('GPM Staff', 'Outside Vendor')),
  trade_category text,
  recommended_action text,
  priority text
    check (priority in ('Urgent/Safety', 'Before next occupancy', 'Routine turnover', 'Monitor', 'No action')),
  -- GPM Staff replacement/install items only; blank until Jessica fills them in (pending price book)
  materials_cost numeric(10, 2),
  labor_cost numeric(10, 2),
  -- Outside Vendor items only; Jessica's editable estimate
  vendor_estimated_cost numeric(10, 2),
  -- Jessica's per-line review decision -- null until she reviews it
  tenant_status text
    check (tenant_status in ('tenant_charge', 'approved')),
  -- true if Jessica added this row herself (not from the AI extraction pass)
  is_manual_addition boolean not null default false,
  source_timestamp text,
  source_video_file text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists line_items_inspection_id_idx on line_items(inspection_id);

-- updated_at auto-touch on both tables
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger inspections_set_updated_at
  before update on inspections
  for each row execute function set_updated_at();

create trigger line_items_set_updated_at
  before update on line_items
  for each row execute function set_updated_at();
