-- Global pricing settings, editable from the new Set Up page. Singleton row
-- (id is always true) rather than a key/value table -- there are exactly
-- three values today and a fixed shape is simpler to read and edit.
create table if not exists settings (
  id boolean primary key default true check (id),
  gpm_labor_charge numeric(10, 2) not null default 0,
  material_markup_pct numeric(5, 2) not null default 0,
  vendor_markup_pct numeric(5, 2) not null default 0,
  updated_at timestamptz not null default now()
);

insert into settings (id) values (true) on conflict (id) do nothing;

create trigger settings_set_updated_at
  before update on settings
  for each row execute function set_updated_at();
