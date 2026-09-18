-- Quantity for a line item's primary Supplier/SKU (0016) and each Additional
-- SKU (0022) -- text, not a number: quantities here range from simple counts
-- ("2") to units that don't fit a plain integer ("50 ft", "1 roll", "3
-- tubes"), and forcing a numeric field would just push reviewers to fudge it
-- into the wrong shape.
alter table line_items add column if not exists sku_quantity text;
alter table line_item_additional_skus add column if not exists quantity text;

-- A bulk item purchased once and used across many line items in the same
-- job (a contractor pack of outlets covering 8 separate outlet-replacement
-- line items, a roll of window screen material, a tube of caulk) doesn't
-- belong to any one line item -- recording it against a single row would
-- misrepresent one purchase as several, and a many-to-many link to every
-- row it covers is more linking UI than this needs. Scoped to the
-- inspection instead: a plain job-level materials list, separate from
-- per-line-item SKUs entirely.
create table if not exists inspection_bulk_materials (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references inspections(id) on delete cascade,
  supplier text,
  sku text,
  quantity text,
  notes text,
  created_at timestamptz not null default now()
);
