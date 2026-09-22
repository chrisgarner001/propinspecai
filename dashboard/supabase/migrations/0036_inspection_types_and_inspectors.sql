-- User request (2026-09-22): "add Inspection Type to Set up so new types can
-- be added" -- inspection_type was a hardcoded 2-value CHECK constraint
-- (migration 0034), a deliberately narrow wedge at the time (see
-- docs/designs/propinspec-inspection-type-gallery.md's Premise 3). This
-- replaces the CHECK with a real catalog table, same pattern as `vendors`/
-- `stages` -- admin-managed from Set Up, referenced by name via FK.
create table if not exists inspection_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

insert into inspection_types (name) values ('Move-Out'), ('Move-In')
  on conflict (name) do nothing;

alter table inspections drop constraint if exists inspections_inspection_type_check;
alter table inspections
  add constraint inspections_inspection_type_fkey foreign key (inspection_type) references inspection_types (name);

-- "Inspector is a dropdown or fill in" -- inspections.inspector_name stays
-- free text (not a foreign key), this is just a convenience catalog for the
-- dropdown; an ad hoc name typed in Add New Inspection is still allowed.
create table if not exists inspectors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

insert into inspectors (name)
  select distinct inspector_name from inspections where inspector_name is not null
  on conflict (name) do nothing;
