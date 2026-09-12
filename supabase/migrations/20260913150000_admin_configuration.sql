-- Tuning the economy from the console.
--
-- Two tables decide what everything is worth: achievement_definitions prices each milestone, and
-- building_level_milestones sets the ladder those prices climb. Both have been edit-by-migration
-- until now, which is fine for a schema and wrong for a number you want to try, watch, and change
-- again on a Sunday.
--
-- They behave differently and the console has to say so. Re-pricing a rung is NOT retroactive: the
-- XP ledger is append-only, so past awards keep the amount they were written with and the new price
-- applies to claims approved afterwards. Moving a threshold IS retroactive, because a founder's
-- level is derived from the table on every read -- so every founder is re-levelled in the same
-- transaction, and buildings change height.

-- --------------------------------------------------------------------------------------------
-- What changed, and who changed it.
-- --------------------------------------------------------------------------------------------

create table public.admin_config_changes (
  id bigint generated always as identity primary key,
  entity text not null,
  entity_id text not null,
  field text not null,
  previous_value text,
  new_value text not null,
  -- How many founders the change re-levelled. Zero for a re-pricing, which touches nobody.
  founders_affected integer not null default 0,
  actor_id uuid references auth.users (id) on delete set null,
  actor_label text not null,
  created_at timestamptz not null default now(),

  constraint admin_config_changes_entity_known check (
    entity in ('achievement_definition', 'building_level_milestone')
  ),
  constraint admin_config_changes_field_length check (char_length(trim(field)) between 1 and 60),
  constraint admin_config_changes_actor_length check (
    char_length(trim(actor_label)) between 1 and 200
  )
);

create index admin_config_changes_recent_idx on public.admin_config_changes (created_at desc);

alter table public.admin_config_changes enable row level security;
revoke all on public.admin_config_changes from anon, authenticated;

comment on table public.admin_config_changes is
  'Every console edit to the reward catalog or the level ladder. Names the staff who made it, so a '
  'founder asking why their building shrank has an answer.';

-- --------------------------------------------------------------------------------------------
-- Re-pricing a rung.
-- --------------------------------------------------------------------------------------------

create function public.update_achievement_definition(
  target_achievement_type text,
  new_xp_reward integer default null,
  new_label text default null,
  new_description text default null,
  new_evidence_prompt text default null,
  new_evidence_hint text default null,
  actor_user_id uuid default null
)
returns setof public.achievement_definitions
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.achievement_definitions%rowtype;
  actor text;
begin
  actor := public.assert_reviewer();
  if actor_user_id is not null then
    actor := coalesce(
      (select users.email from auth.users as users where users.id = actor_user_id), actor
    );
  end if;

  select definitions.*
    into existing
    from public.achievement_definitions as definitions
   where definitions.achievement_type = target_achievement_type
   for update;

  if not found then
    raise exception using message = 'invalid_achievement';
  end if;

  -- A null argument means "leave this one alone", so a console form can send one field or all six.
  update public.achievement_definitions as definitions
     set xp_reward = coalesce(new_xp_reward, definitions.xp_reward),
         label = coalesce(nullif(trim(coalesce(new_label, '')), ''), definitions.label),
         description = coalesce(
           nullif(trim(coalesce(new_description, '')), ''), definitions.description
         ),
         evidence_prompt = coalesce(
           nullif(trim(coalesce(new_evidence_prompt, '')), ''), definitions.evidence_prompt
         ),
         evidence_hint = coalesce(
           nullif(trim(coalesce(new_evidence_hint, '')), ''), definitions.evidence_hint
         )
   where definitions.achievement_type = target_achievement_type;

  if new_xp_reward is not null and new_xp_reward <> existing.xp_reward then
    insert into public.admin_config_changes (
      entity, entity_id, field, previous_value, new_value, actor_id, actor_label
    ) values (
      'achievement_definition', target_achievement_type, 'xp_reward',
      existing.xp_reward::text, new_xp_reward::text, actor_user_id, actor
    );
  end if;

  return query
    select definitions.*
      from public.achievement_definitions as definitions
     where definitions.achievement_type = target_achievement_type;
end;
$$;

revoke execute on function public.update_achievement_definition(
  text, integer, text, text, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.update_achievement_definition(
  text, integer, text, text, text, text, uuid
) to service_role;

comment on function public.update_achievement_definition(text, integer, text, text, text, text, uuid) is
  'Re-prices or re-words one rung. Not retroactive: the XP ledger is append-only, so past awards '
  'keep what they were worth and a new price applies to claims approved after the edit.';

-- --------------------------------------------------------------------------------------------
-- Moving a threshold.
-- --------------------------------------------------------------------------------------------

create function public.set_level_milestone(
  target_level smallint,
  new_required_xp integer,
  actor_user_id uuid default null
)
returns table (
  level smallint,
  required_xp integer,
  founders_relevelled integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.building_level_milestones%rowtype;
  actor text;
  moved integer;
begin
  actor := public.assert_reviewer();
  if actor_user_id is not null then
    actor := coalesce(
      (select users.email from auth.users as users where users.id = actor_user_id), actor
    );
  end if;

  if new_required_xp is null or new_required_xp < 0 then
    raise exception using message = 'invalid_xp_total';
  end if;

  select milestones.*
    into existing
    from public.building_level_milestones as milestones
   where milestones.level = target_level
   for update;

  if not found then
    raise exception using message = 'milestone_not_found';
  end if;

  -- Level one is the floor every founder starts on. building_level_for_xp finds the highest
  -- milestone at or below a total, so a non-zero floor would leave a new founder with no level at
  -- all and raise xp_milestones_not_configured.
  if target_level = 1 and new_required_xp <> 0 then
    raise exception using message = 'invalid_milestone_order';
  end if;

  -- The ladder has to keep climbing. Out-of-order thresholds would make the derived level jump
  -- backwards as a founder gains XP.
  if exists (
    select 1 from public.building_level_milestones as others
     where (others.level < target_level and others.required_xp >= new_required_xp)
        or (others.level > target_level and others.required_xp <= new_required_xp)
  ) then
    raise exception using message = 'invalid_milestone_order';
  end if;

  update public.building_level_milestones as milestones
     set required_xp = new_required_xp
   where milestones.level = target_level;

  -- The retroactive part. Levels are derived, so the stored copy on every claim has to be brought
  -- back in line in the same transaction -- otherwise the city renders heights the ladder disagrees
  -- with until each founder next earns something.
  with relevelled as (
    update public.plot_claims as claims
       set building_level = public.building_level_for_xp(claims.xp_total)
     where claims.building_level <> public.building_level_for_xp(claims.xp_total)
    returning 1
  )
  select count(*)::integer into moved from relevelled;

  insert into public.admin_config_changes (
    entity, entity_id, field, previous_value, new_value, founders_affected, actor_id, actor_label
  ) values (
    'building_level_milestone', target_level::text, 'required_xp',
    existing.required_xp::text, new_required_xp::text, moved, actor_user_id, actor
  );

  return query select target_level, new_required_xp, moved;
end;
$$;

revoke execute on function public.set_level_milestone(smallint, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.set_level_milestone(smallint, integer, uuid) to service_role;

comment on function public.set_level_milestone(smallint, integer, uuid) is
  'Moves one rung of the level ladder and re-levels every founder in the same transaction. '
  'Retroactive by nature: levels are derived from this table, so buildings change height.';
