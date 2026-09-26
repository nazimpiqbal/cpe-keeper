-- CPE Keeper — update 002
-- Adds license issue date and Regulatory Review due date to licenses.
-- Paste into Supabase: SQL Editor → New query → Run.

alter table public.licenses add column if not exists license_issued date;
alter table public.licenses add column if not exists regulatory_review_due date;
