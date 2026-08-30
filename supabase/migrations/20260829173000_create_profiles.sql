-- Public game identity. Private auth data such as email and provider tokens
-- remains in Supabase Auth and is intentionally not duplicated here.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  x_handle text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_full_name_length check (char_length(full_name) <= 60),
  constraint profiles_x_handle_format check (
    x_handle is null or x_handle ~ '^[A-Za-z0-9_]{1,15}$'
  ),
  constraint profiles_avatar_url_length check (
    avatar_url is null or char_length(avatar_url) <= 2048
  )
);

-- X handles are case-insensitive identifiers. Store them without a leading @.
create unique index profiles_x_handle_unique
  on public.profiles (lower(x_handle))
  where x_handle is not null;

alter table public.profiles enable row level security;

create policy "Public profiles are viewable by everyone"
  on public.profiles
  for select
  to anon, authenticated
  using (true);

create policy "Users can insert their own profile"
  on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;

create function public.set_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profile_updated_at
  before update on public.profiles
  for each row execute procedure public.set_profile_updated_at();

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    left(
      coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
        nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
        nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
        ''
      ),
      60
    ),
    left(
      coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'avatar_url'), ''),
        nullif(trim(new.raw_user_meta_data ->> 'picture'), '')
      ),
      2048
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Create profiles for accounts that authenticated before this migration existed.
insert into public.profiles (id, full_name, avatar_url)
select
  users.id,
  left(
    coalesce(
      nullif(trim(users.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(users.raw_user_meta_data ->> 'name'), ''),
      nullif(trim(users.raw_user_meta_data ->> 'display_name'), ''),
      ''
    ),
    60
  ),
  left(
    coalesce(
      nullif(trim(users.raw_user_meta_data ->> 'avatar_url'), ''),
      nullif(trim(users.raw_user_meta_data ->> 'picture'), '')
    ),
    2048
  )
from auth.users as users
on conflict (id) do nothing;
