-- CPE Keeper — update 004
-- Marks a license as being on its first renewal (CA new-licensee rules).
-- Paste into Supabase: SQL Editor → New query → Run.

alter table public.licenses add column if not exists first_renewal boolean not null default false;
