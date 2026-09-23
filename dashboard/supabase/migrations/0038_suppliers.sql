-- Cost Book dashboard rework (docs/designs/propinspec-cost-book-dashboard.md):
-- a real, admin-managed Suppliers catalog backing the new per-supplier
-- sub-book pages -- cost_book_materials.source stays plain text (no FK,
-- no migration of the 8,150 live rows), matched case-insensitively against
-- this table so "Home Depot" and "home depot" never fragment into two tiles.

create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notes text,
  created_at timestamptz not null default now()
);

-- Case-insensitive uniqueness (functional index, same technique as
-- stock_items' (lower(category), lower(material_name)) index) -- a plain
-- `unique` column would let "Home Depot" and "home depot" both exist as
-- distinct rows, silently fragmenting one supplier's materials.
create unique index if not exists suppliers_name_lower_idx on suppliers (lower(name));

-- One-time backfill: populate the catalog from whatever `source` values
-- already exist in cost_book_materials (in practice, just 'Home Depot'
-- today) -- not a migration of the materials rows themselves.
insert into suppliers (name)
  select distinct source from cost_book_materials where source is not null and source <> ''
  on conflict (lower(name)) do nothing;
