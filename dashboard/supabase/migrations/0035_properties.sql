-- Properties nav item (user request, 2026-09-22): "fed by the PW API link of
-- active properties" -- no real PropertyWare API access/docs exist anywhere
-- in this project yet (same situation as sendBatchToPW/work_order_batches),
-- so this ships manual-entry now, same stand-in-now-swap-in-real-API-later
-- pattern already used elsewhere in this codebase. pw_property_id is a
-- placeholder column for that future real link -- left null until then.
--
-- Deliberately NOT linked to inspections.property_address via a foreign
-- key: that's a separate, bigger decision (fuzzy-matching/backfilling
-- existing free-text addresses) that wasn't asked for here -- this is its
-- own standalone reference list for now.
create table if not exists properties (
  id uuid primary key default gen_random_uuid(),
  address text not null,
  pw_property_id text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists properties_address_idx on properties (address);
