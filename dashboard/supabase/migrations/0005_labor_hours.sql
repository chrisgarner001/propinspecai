-- Labor is entered as hours (0.25 increments) on a line item; the dollar
-- amount (labor_cost) is computed as labor_hours * settings.gpm_labor_charge
-- at save time and stored, so past reports don't silently change if the
-- global rate is edited later.
alter table line_items add column if not exists labor_hours numeric(6, 2);
