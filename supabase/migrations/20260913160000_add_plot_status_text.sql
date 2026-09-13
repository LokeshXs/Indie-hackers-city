-- Appending the view column preserves dependent RPCs returning city_developments.
alter table public.plot_claims
  add column status_text text,
  add constraint plot_claims_status_text_valid check (
    status_text is null or (
      char_length(status_text) between 1 and 40
      and status_text !~ E'[\\r\\n]' and position(chr(8232) in status_text) = 0
      and position(chr(8233) in status_text) = 0
    )
  );

create or replace view public.city_developments
with (security_invoker = true)
as
select
  claims.plot_id,
  claims.owner_id,
  projects.id as project_id,
  projects.name as project_name,
  projects.website_url,
  projects.project_type,
  profiles.full_name as founder_name,
  profiles.x_handle,
  profiles.avatar_url,
  claims.building_level,
  claims.building_asset_id,
  claims.claimed_at,
  greatest(claims.updated_at, projects.updated_at, profiles.updated_at) as updated_at,
  claims.xp_total,
  current_milestone.required_xp as current_level_xp,
  next_milestone.required_xp as next_level_xp,
  claims.billboard_text_color,
  claims.billboard_background_color,
  claims.status_text
from public.plot_claims as claims
join public.projects as projects on projects.id = claims.project_id
join public.profiles as profiles on profiles.id = claims.owner_id
join public.building_level_milestones as current_milestone
  on current_milestone.level = claims.building_level
left join public.building_level_milestones as next_milestone
  on next_milestone.level = claims.building_level + 1;

grant select on public.city_developments to anon, authenticated;

-- Match the status reward in LADDER (390 XP), and lock before checking eligibility.
create function public.update_plot_status(requested_status_text text)
returns setof public.city_developments
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  current_xp integer;
  normalized_text text;
begin
  if caller_id is null then
    raise exception using message = 'not_authenticated';
  end if;

  select claims.xp_total into current_xp
    from public.plot_claims as claims
   where claims.owner_id = caller_id
     for update;
  if not found then
    raise exception using message = 'claim_not_found';
  end if;
  if current_xp < 390 then
    raise exception using message = 'reward_locked';
  end if;

  -- ECMAScript trim whitespace, so API and direct RPC callers store the same text.
  normalized_text := nullif(btrim(requested_status_text,
    U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), '');
  if char_length(normalized_text) > 40
    or normalized_text ~ E'[\\r\\n]'
    or position(chr(8232) in normalized_text) > 0
    or position(chr(8233) in normalized_text) > 0 then
    raise exception using message = 'invalid_status';
  end if;

  update public.plot_claims as claims set status_text = normalized_text
   where claims.owner_id = caller_id;
  return query select developments.* from public.city_developments as developments
   where developments.owner_id = caller_id;
end;
$$;

revoke execute on function public.update_plot_status(text) from public, anon;
grant execute on function public.update_plot_status(text) to authenticated;
