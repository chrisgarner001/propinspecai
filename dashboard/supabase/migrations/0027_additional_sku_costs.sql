-- Materials $ and Labor (hrs) now apply per item, not just a line item's
-- primary Supplier/SKU -- each additional SKU (0016/0022) is being turned
-- into a full box matching the primary's, not a condensed chip, and that
-- box carries its own cost fields. Same types as line_items' own columns
-- (0001_init.sql / 0005_labor_hours.sql).
alter table line_item_additional_skus add column if not exists materials_cost numeric(10, 2);
alter table line_item_additional_skus add column if not exists labor_hours numeric(6, 2);
