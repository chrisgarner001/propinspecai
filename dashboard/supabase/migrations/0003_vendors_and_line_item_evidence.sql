-- Vendors: outside vendors a reviewer can assign a line item to.
-- Seeded with placeholders until GPM's real vendor list is entered.
create table if not exists vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger vendors_set_updated_at
  before update on vendors
  for each row execute function set_updated_at();

insert into vendors (name)
values ('ACME 1'), ('ACME 2'), ('ACME 3')
on conflict (name) do nothing;

-- Which vendor was actually assigned, once picked (assigned_to = 'Outside Vendor').
alter table line_items add column if not exists vendor_id uuid references vendors(id);

-- Path/filename of the still frame extracted from source_video_file at
-- source_timestamp. Null until the video-still-extraction pipeline exists --
-- the review UI is built ahead of that pipeline landing.
alter table line_items add column if not exists still_image_file text;
