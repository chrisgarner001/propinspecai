-- A repair sometimes needs more than one part/material -- line_items.supplier
-- and .sku (0016) stay the primary entry; this table holds any additional
-- Supplier/SKU pairs beyond that one, one row per extra item.
create table if not exists line_item_additional_skus (
  id uuid primary key default gen_random_uuid(),
  line_item_id uuid not null references line_items(id) on delete cascade,
  supplier text,
  sku text,
  created_at timestamptz not null default now()
);
