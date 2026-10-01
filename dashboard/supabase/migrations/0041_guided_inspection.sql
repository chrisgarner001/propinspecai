-- Guided Inspection v1 -- design: docs/designs/propinspec-guided-inspection.md

-- Inspector role: a field-only account (the iPad), linked to the inspectors
-- catalog row whose name appears in inspections.inspector_name. Sees only
-- the /field view for its own assigned inspections -- lib/dal.ts rejects
-- this role from every office page, action, and report route by default.
alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check check (role in ('Admin', 'General User', 'Inspector'));
alter table users add column if not exists inspector_id uuid references inspectors(id) on delete set null;

-- System Config > Guided Inspection: a master switch plus a per-type
-- switch. Guided inspection is only enforced (video processing blocked
-- until the field steps are marked complete) when BOTH are on. Both default
-- off, so nothing changes for existing inspections until an Admin opts in.
alter table settings add column if not exists guided_inspection_required boolean not null default false;
alter table inspection_types add column if not exists guided_inspection_required boolean not null default false;

-- The checklist template, managed in Setup. kind: what the inspector
-- captures for the item. Deleting from Setup sets active = false rather
-- than removing the row, so past inspections' answers keep their item.
create table if not exists checklist_items (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  help_text text,
  kind text not null default 'text_photo' check (kind in ('text', 'photo', 'text_photo')),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Seeded with Chris's starter list (2026-10-01), only when the table is
-- empty so re-running never duplicates them. Admins add/edit/reorder/remove
-- items in System Config > Guided Inspection. The "wide photo of every room"
-- item is not here -- it's step 3 of the field view, driven by the room list.
insert into checklist_items (label, help_text, kind, sort_order)
select * from (values
  ('Gas meter', 'Where the gas meter is, with a photo.', 'text_photo', 10),
  ('Water meter', 'Where the water meter is, with a photo.', 'text_photo', 20),
  ('Electrical panel', 'Where the electrical panel is, with a photo of the panel.', 'text_photo', 30),
  ('Lockbox', 'Where the lockbox is mounted, with a photo.', 'text_photo', 40),
  ('Outside AC condenser', 'Photo of the outdoor AC unit. Note "None" if there isn''t one.', 'text_photo', 50),
  ('Furnace', 'Where the furnace is, with a photo.', 'text_photo', 60),
  ('Hot water tank', 'Where the hot water tank is, with a photo.', 'text_photo', 70),
  ('City inspection tags / notices', 'Photo of any city inspection tags or notices posted. Note "None" if there are none.', 'text_photo', 80),
  ('Exterior: front', 'Photo of the front of the house.', 'photo', 90),
  ('Exterior: side', 'Photo of the side of the house.', 'photo', 100),
  ('Exterior: rear', 'Photo of the rear of the house.', 'photo', 110),
  ('Garage or outbuilding', 'Photo of the garage or any outbuilding. Note "None" if there isn''t one.', 'text_photo', 120),
  ('Exterior overgrowth or damage', 'Photo of any overgrowth or exterior damage, with a note on where it is. Note "None" if there is none.', 'text_photo', 130)
) as seed(label, help_text, kind, sort_order)
where not exists (select 1 from checklist_items);

create table if not exists inspection_checklist_responses (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references inspections(id) on delete cascade,
  checklist_item_id uuid not null references checklist_items(id),
  label text not null,
  text_value text,
  photo_path text,
  updated_at timestamptz not null default now(),
  unique (inspection_id, checklist_item_id)
);

-- The inspector's room list, set before the walkthrough. When present,
-- these are the only room names the AI extraction may use (lib/gemini.ts).
create table if not exists inspection_room_plan (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references inspections(id) on delete cascade,
  room_name text not null,
  sort_order integer not null default 0,
  photo_path text,
  created_at timestamptz not null default now(),
  unique (inspection_id, room_name)
);

create index if not exists inspection_room_plan_inspection_id_idx on inspection_room_plan(inspection_id);

alter table inspections add column if not exists field_completed_at timestamptz;

-- Private bucket (unlike the public inspection-stills): these photos can
-- include the lockbox and the house's utility details. Served only through
-- short-lived signed URLs (lib/fieldPhotos.ts).
insert into storage.buckets (id, name, public)
values ('inspection-field-photos', 'inspection-field-photos', false)
on conflict (id) do nothing;
