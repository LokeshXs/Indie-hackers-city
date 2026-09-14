-- The reward overlay shows building progress, not the smaller cosmetic-unlock ladder. Returning
-- the two milestone boundaries here keeps that bar in step with admin-configured level prices.

drop function public.reward_announcement();

create function public.reward_announcement()
returns table (
  xp_gained integer,
  previous_xp_total integer,
  xp_total integer,
  previous_building_level smallint,
  building_level smallint,
  current_level_xp integer,
  next_level_xp integer,
  level_changed boolean,
  achievements jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  current_claim public.plot_claims%rowtype;
  gained integer;
  previous integer;
  previous_level smallint;
  current_milestone_xp integer;
  next_milestone_xp integer;
begin
  if caller_id is null then
    raise exception using message = 'not_authenticated';
  end if;

  select claims.*
    into current_claim
    from public.plot_claims as claims
   where claims.owner_id = caller_id;

  if not found then
    return;
  end if;

  select coalesce(sum(events.xp_delta), 0)::integer
    into gained
    from public.plot_xp_events as events
   where events.owner_id = caller_id
     and events.created_at > current_claim.rewards_seen_at
     and events.event_type <> 'plot_claimed';

  if gained <= 0 then
    return;
  end if;

  previous := greatest(current_claim.xp_total - gained, 0);
  previous_level := public.building_level_for_xp(previous);

  select current_milestone.required_xp, next_milestone.required_xp
    into current_milestone_xp, next_milestone_xp
    from public.building_level_milestones as current_milestone
    left join public.building_level_milestones as next_milestone
      on next_milestone.level = current_claim.building_level + 1
   where current_milestone.level = current_claim.building_level;

  return query select
    gained,
    previous,
    current_claim.xp_total,
    previous_level,
    current_claim.building_level,
    current_milestone_xp,
    next_milestone_xp,
    previous_level <> current_claim.building_level,
    coalesce(
      (
        select jsonb_agg(
                 jsonb_build_object(
                   'type', reviews.achievement_type,
                   'label', definitions.label,
                   'xp', reviews.xp_delta
                 )
                 order by definitions.sort_order
               )
          from public.achievement_reviews as reviews
          join public.achievement_definitions as definitions
            on definitions.achievement_type = reviews.achievement_type
         where reviews.owner_id = caller_id
           and reviews.decision = 'approved'
           and reviews.created_at > current_claim.rewards_seen_at
      ),
      '[]'::jsonb
    );
end;
$$;

revoke execute on function public.reward_announcement() from public, anon;
grant execute on function public.reward_announcement() to authenticated;

comment on function public.reward_announcement() is
  'What the caller has gained since they last acknowledged their rewards, including the final '
  'building-level range for the progress display. Returns no rows when there is nothing to announce.';
