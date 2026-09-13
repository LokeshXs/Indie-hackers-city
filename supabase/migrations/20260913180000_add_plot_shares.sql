-- Frozen share images are prepared privately, then published once the PNG exists.
create table public.plot_shares (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  plot_id text not null references public.plots(id),
  founder_name text not null,
  avatar_url text,
  xp integer not null check (xp >= 0),
  phase text not null check (phase in ('morning', 'night')),
  development_revision timestamptz not null,
  image_path text not null unique,
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  constraint share_image_path_owned check (image_path = owner_id::text || '/' || id::text || '.png')
);
alter table public.plot_shares enable row level security;
grant select on public.plot_shares to anon, authenticated;
revoke insert, update, delete on public.plot_shares from anon, authenticated;
create policy "Published shares are public; founders can read their drafts"
  on public.plot_shares for select to anon, authenticated
  using (ready_at is not null or owner_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('plot-shares', 'plot-shares', true, 5242880, array['image/png']);
create policy "Founders upload their reserved share images"
  on storage.objects for insert to authenticated with check (
    bucket_id = 'plot-shares' and exists (
      select 1 from public.plot_shares s where s.owner_id = (select auth.uid())
      and s.image_path = name and s.ready_at is null
    )
  );
create policy "Founders can read their unfinished images"
  on storage.objects for select to authenticated using (
    bucket_id = 'plot-shares' and exists (
      select 1 from public.plot_shares s where s.owner_id = (select auth.uid()) and s.image_path = name
    )
  );
create policy "Founders clean up failed share uploads"
  on storage.objects for delete to authenticated using (
    bucket_id = 'plot-shares' and exists (
      select 1 from public.plot_shares s where s.owner_id = (select auth.uid())
      and s.image_path = name and s.ready_at is null
    )
  );

create function public.prepare_plot_share(request_id uuid, requested_phase text, expected_revision timestamptz)
returns setof public.plot_shares language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  existing public.plot_shares;
  development public.city_developments;
begin
  if caller is null then raise exception using message = 'not_authenticated'; end if;
  if request_id is null or requested_phase not in ('morning', 'night') or requested_phase is null or expected_revision is null then
    raise exception using message = 'invalid_share';
  end if;
  -- Serializes retries for one request without preventing independent snapshots.
  perform pg_advisory_xact_lock(hashtextextended(request_id::text, 0));
  select * into existing from public.plot_shares where id = request_id;
  if found then
    if existing.owner_id <> caller or existing.phase <> requested_phase or existing.development_revision <> expected_revision then
      raise exception using message = 'share_conflict';
    end if;
    return next existing;
    return;
  end if;
  select * into development from public.city_developments where owner_id = caller;
  if not found then raise exception using message = 'claim_not_found'; end if;
  if development.updated_at <> expected_revision then raise exception using message = 'stale_share'; end if;
  return query insert into public.plot_shares (
    id, owner_id, plot_id, founder_name, avatar_url, xp, phase, development_revision, image_path
  ) values (
    request_id, caller, development.plot_id, development.founder_name, development.avatar_url,
    development.xp_total, requested_phase, expected_revision, caller::text || '/' || request_id::text || '.png'
  ) returning *;
end;
$$;

create function public.publish_plot_share(request_id uuid)
returns setof public.plot_shares language plpgsql security definer set search_path = '' as $$
declare
  snapshot public.plot_shares;
begin
  if auth.uid() is null then raise exception using message = 'not_authenticated'; end if;
  select * into snapshot from public.plot_shares where id = request_id and owner_id = auth.uid() for update;
  if not found then raise exception using message = 'share_not_found'; end if;
  if snapshot.ready_at is null then
    if not exists (select 1 from storage.objects where bucket_id = 'plot-shares' and name = snapshot.image_path) then
      raise exception using message = 'share_image_missing';
    end if;
    update public.plot_shares set ready_at = now() where id = request_id;
  end if;
  return query select * from public.plot_shares where id = request_id;
end;
$$;
revoke execute on function public.prepare_plot_share(uuid, text, timestamptz) from public, anon;
revoke execute on function public.publish_plot_share(uuid) from public, anon;
grant execute on function public.prepare_plot_share(uuid, text, timestamptz) to authenticated;
grant execute on function public.publish_plot_share(uuid) to authenticated;
