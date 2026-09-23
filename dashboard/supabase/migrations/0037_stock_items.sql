-- Stock Items (docs/designs/propinspec-stock-items.md): a small, curated
-- catalog for GPM's own deliberately-stocked rehab items (outlets, switches,
-- smoke detectors, etc.), separate from the noisy 8,150-row General purchase
-- history in cost_book_materials -- checked first at suggestion time, built
-- up by promoting corrections reviewers are already typing on the Quote
-- Sheet today. `vector` extension already enabled by migration 0030.

create table if not exists stock_items (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  material_name text not null,
  supplier text not null default 'Home Depot',
  sku text,
  unit_price numeric(10, 2) not null,
  unit text,
  notes text,
  embedding vector(768),
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Upsert key for promotion (app/actions.ts promoteToStockItem): re-promoting
-- the same corrected item updates the existing row instead of duplicating
-- it -- the exact recurring-correction scenario this table exists to fix.
-- Case-insensitive so "Outlet Cover" and "outlet cover" collide as intended.
create unique index if not exists stock_items_category_material_idx
  on stock_items (lower(category), lower(material_name));

create index if not exists stock_items_embedding_idx
  on stock_items using hnsw (embedding vector_cosine_ops);
