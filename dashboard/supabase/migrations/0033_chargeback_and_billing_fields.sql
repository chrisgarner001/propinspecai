-- Supports two pieces of user feedback (2026-09-22):
--
-- 1. Tenant Chargeback Review needs its own free-text description,
--    independent of the Quote Sheet's item/observed_evidence/recommended_action
--    text -- e.g. Quote Sheet says "paint bedroom", but the chargeback
--    language needs to say "paint bedroom -- tenant painted without
--    permission, coverage poor, requires wall prep/primer/two coats over
--    lime green". Null means "use the standard text", never auto-synced.
--
-- 2. The Move-Out Report should be able to merge in a validated lease name
--    and security deposit amount as an exhibit, same as zinspector. Manually
--    entered (no PMS integration exists) -- null means "not entered yet",
--    rendered as a blank line to fill in by hand, same pattern already used
--    for tenant_name (see move-out-report/route.ts).

alter table line_items
  add column if not exists tenant_charge_description text;

alter table inspections
  add column if not exists lease_name text,
  add column if not exists security_deposit_amount numeric;
