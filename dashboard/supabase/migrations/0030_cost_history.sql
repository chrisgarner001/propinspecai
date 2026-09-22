-- Cost Book learning engine (docs/designs/propinspec-cost-history.md): a
-- real Home Depot purchase-history import replaces the near-empty
-- cost_book_materials as the actual data source, and Quote Sheet line
-- items get similarity-matched suggestions against it via pgvector.
create extension if not exists vector;

alter table cost_book_materials add column if not exists purchase_count integer;
alter table cost_book_materials add column if not exists price_min numeric(10, 2);
alter table cost_book_materials add column if not exists price_max numeric(10, 2);
alter table cost_book_materials add column if not exists embedding vector(768);

-- HNSW over ivfflat: no `lists` tuning needed at this data scale (a few
-- thousand unique SKUs), and it's what pgvector 0.8+ (confirmed available)
-- recommends by default for cosine similarity search.
create index if not exists cost_book_materials_embedding_idx
  on cost_book_materials using hnsw (embedding vector_cosine_ops);

-- Raw audit/provenance table -- one row per CSV transaction line, so
-- aggregates (cost_book_materials.purchase_count/price_min/price_max) can
-- be recomputed later without re-parsing the original export. Company Name
-- (single-tenant, adds nothing) and Program Discount Indicator (blank in
-- every real row) are the only CSV columns not carried over.
create table if not exists home_depot_purchase_history (
  id uuid primary key default gen_random_uuid(),
  purchase_date date not null,
  store_number text,
  transaction_id text not null,
  -- not null: part of the dedup unique constraint below, and Postgres
  -- treats NULL as distinct from every other NULL, which would silently
  -- defeat dedup if this were nullable and ever came through blank.
  register_number text not null,
  job_name text,
  sku_number text not null,
  sku_description text not null,
  quantity integer,
  original_unit_price numeric(10, 2),
  department_name text,
  class_name text,
  subclass_name text,
  program_discount_amount numeric(10, 2),
  other_discount_amount numeric(10, 2),
  extended_retail numeric(10, 2),
  net_unit_price numeric(10, 2),
  imported_at timestamptz not null default now(),
  -- Makes re-running the import script on the same or an overlapping CSV
  -- export safe: a re-imported row is silently skipped, not duplicated.
  unique (transaction_id, sku_number, register_number)
);

create index if not exists home_depot_purchase_history_sku_idx
  on home_depot_purchase_history (sku_number);
