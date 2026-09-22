-- Needed for the cost-history import's upsert-by-sku (on conflict (sku) do
-- update ...). NULL sku values (manually-added, non-Home-Depot materials)
-- stay unaffected -- Postgres treats every NULL as distinct from every
-- other NULL under a UNIQUE constraint, so this only enforces uniqueness
-- among rows that actually have a sku value.
alter table cost_book_materials add constraint cost_book_materials_sku_key unique (sku);
