alter table public.profiles add column bio text,
  add constraint profiles_bio_length check (bio is null or char_length(bio) <= 160);

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
  claims.status_text,
  profiles.bio
from public.plot_claims as claims
join public.projects as projects on projects.id = claims.project_id
join public.profiles as profiles on profiles.id = claims.owner_id
join public.building_level_milestones as current_milestone
  on current_milestone.level = claims.building_level
left join public.building_level_milestones as next_milestone
  on next_milestone.level = claims.building_level + 1;

grant select on public.city_developments to anon, authenticated;

