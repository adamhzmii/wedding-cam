-- ============================================================
-- WEDDING CAM: run this whole file in Supabase SQL Editor
-- ============================================================

-- 1. Tables
create table if not exists events (
  slug text primary key,
  couple_names text not null,
  host_key text not null,
  event_date date,
  uploads_paused boolean not null default false,
  created_at timestamptz default now()
);

create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  event_slug text not null references events(slug) on delete cascade,
  guest_name text not null check (char_length(guest_name) between 1 and 40),
  storage_path text not null,
  guest_token uuid,
  created_at timestamptz default now()
);

-- 2. Row Level Security
alter table events enable row level security;
alter table photos enable row level security;

-- events: NO select policy on purpose. host_key must never leak to browsers.
-- Event info is read through the get_event() function below instead.

-- photos: anyone can view and add, nobody can edit/delete directly
create policy "photos are public to read"
  on photos for select using (true);

-- Inserts are blocked while the host has paused uploads. The check runs
-- through a security definer function because events has no select policy.
create or replace function uploads_allowed(p_slug text)
returns boolean
language sql security definer set search_path = public
as $$
  select not uploads_paused from events where slug = p_slug;
$$;

create policy "anyone can add a photo"
  on photos for insert with check (uploads_allowed(event_slug));

-- 3. Functions (these run with elevated rights, so they can
--    see host_key without exposing it)

-- Public event info (no host_key in the return!)
create or replace function get_event(p_slug text)
returns table (slug text, couple_names text, event_date date, uploads_paused boolean)
language sql security definer set search_path = public
as $$
  select slug, couple_names, event_date, uploads_paused
  from events where slug = p_slug;
$$;

-- Host-only pause/resume for guest uploads
create or replace function set_uploads_paused(p_slug text, p_key text, p_paused boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from events where slug = p_slug and host_key = p_key
  ) then
    raise exception 'invalid host key';
  end if;
  update events set uploads_paused = p_paused where slug = p_slug;
end;
$$;

-- Check a host key
create or replace function verify_host(p_slug text, p_key text)
returns boolean
language sql security definer set search_path = public
as $$
  select exists (
    select 1 from events where slug = p_slug and host_key = p_key
  );
$$;

-- Host-only delete (checks the key, removes the DB row).
-- Note: the storage file is left behind on purpose. Supabase blocks SQL
-- from deleting storage.objects directly; an orphaned file is invisible
-- to the app (gallery, host page and zip all read from the photos table).
create or replace function delete_photo(p_photo_id uuid, p_key text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_slug text;
begin
  select event_slug into v_slug from photos where id = p_photo_id;

  if v_slug is null then
    raise exception 'photo not found';
  end if;

  if not exists (
    select 1 from events where slug = v_slug and host_key = p_key
  ) then
    raise exception 'invalid host key';
  end if;

  delete from photos where id = p_photo_id;
end;
$$;

-- Guest self-delete (token must match the one saved on the guest's phone)
create or replace function delete_own_photo(p_photo_id uuid, p_token uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_token uuid;
begin
  select guest_token into v_token from photos where id = p_photo_id;

  if v_token is null or p_token is null or v_token <> p_token then
    raise exception 'not your photo';
  end if;

  delete from photos where id = p_photo_id;
end;
$$;

-- 4. Realtime (so the gallery updates live)
alter publication supabase_realtime add table photos;

-- 5. Storage bucket + policies
insert into storage.buckets (id, name, public)
values ('wedding-photos', 'wedding-photos', true)
on conflict (id) do nothing;

create policy "public read wedding photos"
  on storage.objects for select
  using (bucket_id = 'wedding-photos');

create policy "anyone can upload wedding photos"
  on storage.objects for insert
  with check (bucket_id = 'wedding-photos');

-- 6. YOUR EVENT — edit this line, then run!
-- slug becomes the URL: yourapp.vercel.app/aina-danish
insert into events (slug, couple_names, host_key, event_date)
values ('aqilah-farid', 'Aqilah & Farid', 'wmw4566whu', '2026-07-04');
