-- The $ cost of the whole bulk purchase (a 6-pack of bulbs, a roll of screen
-- material) -- separate from any single line item's own materials_cost,
-- since a bulk item's cost is job-level, not per-item. Numeric, matching
-- materials_cost/vendor_estimated_cost (0001_init.sql), unlike this table's
-- own `quantity` column which is deliberately text.
alter table inspection_bulk_materials add column if not exists cost numeric(10, 2);
