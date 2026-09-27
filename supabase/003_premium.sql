-- CPE Keeper — update 003: Premium access to certificates
-- Paste into Supabase: SQL Editor → New query → Run.
--
-- Everyone can UPLOAD certificates (they're always saved).
-- Only Premium accounts can OPEN/DOWNLOAD them.

-- 1. Premium flag per account. Users can read their own row but can't change it —
--    it's set by us (Table Editor now, App Store purchase webhook later).
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_premium boolean not null default false,
  premium_until timestamptz,          -- null = no expiry (e.g. manually granted)
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select using (auth.uid() = user_id);

-- Every account gets a profile row automatically (existing accounts too).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
insert into public.profiles (user_id) select id from auth.users on conflict do nothing;

-- Premium check used by the storage rules.
create or replace function public.is_premium(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where user_id = uid and is_premium and (premium_until is null or premium_until > now())
  );
$$;

-- 2. A list of every uploaded file, so free users can see what's stored
--    without being able to download it.
create table if not exists public.uploads (
  path text primary key,                                   -- <user_id>/<file>
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);
create index if not exists uploads_user_idx on public.uploads (user_id, created_at desc);
alter table public.uploads enable row level security;
drop policy if exists "own uploads" on public.uploads;
create policy "own uploads" on public.uploads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id and path like auth.uid()::text || '/%');

-- Backfill: list the files already uploaded.
insert into public.uploads (path, user_id, file_name, mime_type, size_bytes, created_at)
select o.name, o.owner, split_part(o.name, '/', 2), o.metadata->>'mimetype', (o.metadata->>'size')::bigint, o.created_at
from storage.objects o
where o.bucket_id = 'certificates' and o.owner is not null
on conflict (path) do nothing;

-- 3. Storage rules: upload + delete your own files; download only with Premium.
drop policy if exists "own certificates" on storage.objects;
drop policy if exists "upload own certificates" on storage.objects;
drop policy if exists "delete own certificates" on storage.objects;
drop policy if exists "premium can read own certificates" on storage.objects;

create policy "upload own certificates" on storage.objects for insert
  with check (bucket_id = 'certificates' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "delete own certificates" on storage.objects for delete
  using (bucket_id = 'certificates' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "premium can read own certificates" on storage.objects for select
  using (bucket_id = 'certificates' and (storage.foldername(name))[1] = auth.uid()::text and public.is_premium(auth.uid()));
