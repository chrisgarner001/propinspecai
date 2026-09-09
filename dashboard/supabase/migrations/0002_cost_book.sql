-- Cost Book: GPM's own reference pricing, editable from the dashboard.
-- Three independent sections per user spec (2026-09-09):
--   1. GPM Labor  -- per-item labor charge for tasks GPM staff perform themselves
--   2. Materials  -- mostly Home Depot purchases; seeded from receipts (not yet imported)
--   3. Vendor Estimates -- placeholder rates used until a real vendor quote exists for a job

create table if not exists cost_book_gpm_labor (
  id uuid primary key default gen_random_uuid(),
  task_name text not null,
  labor_rate numeric(10, 2) not null,
  unit text not null default 'per item',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists cost_book_materials (
  id uuid primary key default gen_random_uuid(),
  material_name text not null,
  unit_price numeric(10, 2) not null,
  unit text not null default 'each',
  source text not null default 'Home Depot',
  sku text,
  last_purchased_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists cost_book_vendor_estimates (
  id uuid primary key default gen_random_uuid(),
  trade_category text not null,
  task_name text not null,
  estimated_cost numeric(10, 2) not null,
  -- always true until an actual vendor quote replaces it for a specific job --
  -- this table is placeholders only, never a real committed price.
  is_placeholder boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger cost_book_gpm_labor_set_updated_at
  before update on cost_book_gpm_labor
  for each row execute function set_updated_at();

create trigger cost_book_materials_set_updated_at
  before update on cost_book_materials
  for each row execute function set_updated_at();

create trigger cost_book_vendor_estimates_set_updated_at
  before update on cost_book_vendor_estimates
  for each row execute function set_updated_at();
