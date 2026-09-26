-- CPE Keeper — database setup
-- Paste all of this into Supabase: SQL Editor → New query → Run.
-- Safe to run once. Every table is locked so users can only see their own data.

-- 1. Licenses: one row per state license a user holds
create table public.licenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  state text not null,                          -- e.g. 'CA'
  license_number text,
  expiration_date date not null,                -- e.g. 2028-01-31
  practice text[] not null default '{}',        -- e.g. {'attest'}; empty = none
  last_regulatory_review date,                  -- CA-specific, nullable
  created_at timestamptz not null default now()
);

-- 2. CPE records: one row per course completed
create table public.cpe_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  provider text,
  sponsor_id text,                              -- NASBA registry number, e.g. 107294
  completed_on date not null,
  hours numeric(5,2) not null check (hours > 0),
  field_of_study text,                          -- NASBA field, e.g. 'Accounting'
  delivery_method text,                         -- e.g. 'QAS Self Study'
  certificate_path text,                        -- file in the 'certificates' bucket
  source text not null default 'manual',        -- 'manual' | 'certificate' | 'import'
  needs_review boolean not null default false,  -- AI unsure about a field
  created_at timestamptz not null default now()
);

create index on public.licenses (user_id);
create index on public.cpe_records (user_id, completed_on);

-- 3. Row-level security: each user sees only their own rows
alter table public.licenses enable row level security;
alter table public.cpe_records enable row level security;

create policy "own licenses" on public.licenses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own records" on public.cpe_records
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4. Private storage bucket for certificate PDFs/photos
insert into storage.buckets (id, name, public) values ('certificates', 'certificates', false);

-- Files are stored under a folder named after the user's id: <user_id>/<file>
create policy "own certificates" on storage.objects
  for all using (bucket_id = 'certificates' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'certificates' and (storage.foldername(name))[1] = auth.uid()::text);
