-- Department/Class/Subclass categorization for the Cost Book Materials list
-- (docs/designs/propinspec-cost-history.md follow-up: category quick-links +
-- universal search, replacing the flat 200-row list). These already exist
-- per-row on home_depot_purchase_history; this carries them onto the
-- per-SKU aggregate in cost_book_materials so the Materials page can filter
-- without joining the raw table on every request.

alter table cost_book_materials
  add column if not exists department_name text,
  add column if not exists class_name text,
  add column if not exists subclass_name text;

create index if not exists cost_book_materials_department_idx on cost_book_materials (department_name);
create index if not exists cost_book_materials_class_idx on cost_book_materials (department_name, class_name);

-- Backfill from the raw purchase history already imported: same
-- "most recent purchase wins" rule the import script uses for
-- material_name/unit_price (a small number of SKUs -- 37 of 8153 at
-- backfill time -- were reclassified by Home Depot between purchases; the
-- latest purchase's classification is treated as current).
update cost_book_materials m
set
  department_name = agg.department_name,
  class_name = agg.class_name,
  subclass_name = agg.subclass_name
from (
  select
    sku_number,
    (array_agg(department_name order by purchase_date desc))[1] as department_name,
    (array_agg(class_name order by purchase_date desc))[1] as class_name,
    (array_agg(subclass_name order by purchase_date desc))[1] as subclass_name
  from home_depot_purchase_history
  group by sku_number
) agg
where m.sku = agg.sku_number;
