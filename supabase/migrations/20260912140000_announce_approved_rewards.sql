-- Telling a founder what happened while they were away.
--
-- Approval is asynchronous now: XP arrives when an admin decides, not when the founder acts. So the
-- city has to be able to say "this landed since you last looked" on the next page load, and say it
-- exactly once.
--
-- The marker is a column on the claim rather than something in the browser. A founder who files a
-- claim on their laptop and opens the city on their phone should still be told, and localStorage
-- would announce the same reward once per device and never again after a cache clear.

alter table public.plot_claims
  add column rewards_seen_at timestamptz not null default now();

comment on column public.plot_claims.rewards_seen_at is
  'Everything in the XP ledger after this instant is unannounced. Existing claims were stamped at '
  'migration time on purpose: nobody should open the city to a celebration of every reward they '
  'have ever earned.';

-- --------------------------------------------------------------------------------------------
-- What is waiting to be announced.
-- --------------------------------------------------------------------------------------------

-- Reads, and deliberately does not mark anything as seen. Acknowledging is a separate call the
-- client makes when the founder dismisses the overlay, so a refresh mid-animation shows it again
-- rather than swallowing it.
create function public.reward_announcement()
returns table (
  xp_gained integer,
  previous_xp_total integer,
  xp_total integer,
  previous_building_level smallint,
  building_level smallint,
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
begin
  if caller_id is null then
    raise exception using message = 'not_authenticated';
  end if;

  select claims.*
    into current_claim
    from public.plot_claims as claims
   where claims.owner_id = caller_id;

  -- No plot is not an error here; it is simply a visitor with nothing to announce.
  if not found then
    return;
  end if;

  -- Summed from the ledger rather than from the approvals, so a revocation that followed an
  -- approval nets out and a manual correction is included. `plot_claimed` is excluded because the
  -- signup bonus has its own celebration -- the deed of claim -- and would otherwise fire a second
  -- one the moment a founder finished claiming.
  select coalesce(sum(events.xp_delta), 0)::integer
    into gained
    from public.plot_xp_events as events
   where events.owner_id = caller_id
     and events.created_at > current_claim.rewards_seen_at
     and events.event_type <> 'plot_claimed';

  -- Nothing new, or a net loss. A founder should not be congratulated on a revocation.
  if gained <= 0 then
    return;
  end if;

  previous := greatest(current_claim.xp_total - gained, 0);
  previous_level := public.building_level_for_xp(previous);

  return query select
    gained,
    previous,
    current_claim.xp_total,
    previous_level,
    current_claim.building_level,
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
  'What the caller has gained since they last acknowledged their rewards. Returns no rows when '
  'there is nothing to announce. Reading does not mark anything as seen.';

-- --------------------------------------------------------------------------------------------
-- Marking it seen.
-- --------------------------------------------------------------------------------------------

create function public.acknowledge_rewards()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  seen_at timestamptz;
begin
  if caller_id is null then
    raise exception using message = 'not_authenticated';
  end if;

  update public.plot_claims as claims
     set rewards_seen_at = now()
   where claims.owner_id = caller_id
   returning claims.rewards_seen_at into seen_at;

  if not found then
    raise exception using message = 'claim_not_found';
  end if;

  return seen_at;
end;
$$;

revoke execute on function public.acknowledge_rewards() from public, anon;
grant execute on function public.acknowledge_rewards() to authenticated;

-- The founder does not have to be told twice that this column moved, so it stays off the
-- city_developments projection; it is a per-viewer bookkeeping detail, not part of the city.
