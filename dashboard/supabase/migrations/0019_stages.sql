-- Fixed, orderable catalog of rehab "Stages" (Clean Out, Paint, Plumbing,
-- etc.), configurable from Set Up > Stages. Replaces the old free-text
-- quote_stage column (see 0014_quote_stage.sql -- "the blank Stage column
-- carried over from the old Google Sheet template, never populated by
-- anything") with the real thing.
--
-- This is a separate concept from batch_number (0018): stage_id is the
-- reviewer's per-item designation (which phase of the turn this item
-- belongs to); batch_number remains the internal PW-work-order grouping key,
-- since one vendor can still need multiple batches split across stages
-- (e.g. the same painter doing both Paint and General work = two batches).
create table if not exists stages (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null unique,
  created_at timestamptz not null default now()
);

insert into stages (name, sort_order) values
  ('Clean Out', 1),
  ('Pest Control', 2),
  ('Wall/Paint Prep', 3),
  ('Paint', 4),
  ('General', 5),
  ('Plumbing', 6),
  ('Electrical', 7),
  ('HVAC', 8),
  ('Exterior', 9),
  ('Landscaping', 10),
  ('Final Cleaning', 11)
on conflict (name) do nothing;

alter table line_items add column if not exists stage_id uuid references stages(id);
alter table line_items drop column if exists quote_stage;
