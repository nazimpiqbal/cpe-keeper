-- CPE Keeper — update 006: App Store subscriptions (RevenueCat)
-- Paste into Supabase: SQL Editor → New query → Run.
--
-- The revenuecat-webhook function keeps these columns in step with the App Store.
-- is_premium / premium_until (from 003) stay the switch the storage rules check.

alter table public.profiles add column if not exists plan text not null default 'none'
  check (plan in ('none', 'base', 'premium'));
alter table public.profiles add column if not exists plan_until timestamptz;       -- end of the paid or trial period
alter table public.profiles add column if not exists plan_trial boolean not null default false;
alter table public.profiles add column if not exists plan_updated_at timestamptz;
-- Premium you grant by hand (free accounts for testers, reviewers, friends). The webhook never touches it,
-- so a grant survives App Store events. Set is_premium = true AND comp_premium = true to grant.
alter table public.profiles add column if not exists comp_premium boolean not null default false;

-- Webhook writes use the service key, which bypasses row level security; users still can only read their row.
