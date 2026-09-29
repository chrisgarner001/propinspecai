-- New accounts get a random temp password emailed to them (Resend) and must
-- set their own on first login. Existing accounts (created via Manage Users
-- before this shipped, with a real chosen password) default to false so
-- nobody already using the app gets forced through the change-password
-- screen unexpectedly.
alter table users add column if not exists must_change_password boolean not null default false;
