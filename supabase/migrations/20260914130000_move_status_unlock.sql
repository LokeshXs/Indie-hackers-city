-- The reward ladder was reordered: the status bubble moves from the 390 XP rung to the 110 XP one,
-- so it is the first thing a founder earns after their first launch rather than the third.
--
-- Only the gate moves. The RPC is otherwise identical to the one in
-- 20260913160000_add_plot_status_text.sql, and `create or replace` keeps the existing grants.
--
-- Nothing needs backfilling. The client derives unlocks from xp_total and stores nothing, and
-- status_text survives an XP threshold moving in either direction -- a founder who had already
-- written one keeps it, and everyone between 110 and 389 XP can now write theirs.
create or replace function public.update_plot_status(requested_status_text text)
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
  -- Match the status reward in LADDER (110 XP), and lock before checking eligibility.
  if current_xp < 110 then
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
