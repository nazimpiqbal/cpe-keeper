-- CPE Keeper — update 005
-- Sponsor IDs for audits: a state sponsor number (TX, NY) and a flag for sponsors that aren't on the
-- NASBA National Registry (the NASBA ID itself is the existing sponsor_id column).
-- Paste into Supabase: SQL Editor → New query → Run.

alter table public.cpe_records add column if not exists state_sponsor_id text;
alter table public.cpe_records add column if not exists not_on_registry boolean not null default false;
