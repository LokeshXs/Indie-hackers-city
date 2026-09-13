-- Jobs Avenue's shore side gains a corner store, so its plot leaves circulation.
--
-- The same arrangement as the Coffee House (20260907150000): the store is scenery, a district
-- entity with no plot id and no row in this table, and this migration's only job is to stop the
-- ground beneath it being claimed. is_active is the lever the schema already provides -- claim_plot
-- raises inactive_plot when no active row matches.
--
-- Both guards are load-bearing rather than ceremony. plot_claims.plot_id carries a foreign key to
-- plots(id), so deactivating a claimed plot would leave a founder's building standing on ground
-- nobody can hold; and a typo'd id would make the update a silent no-op that ships a claimable plot
-- underneath a shop. The second is the likelier of the two here: this id names the -outer row,
-- which on the northern blocks is the row FURTHEST from the map centre, not the nearest.

do $$
declare
  target constant text := 'pioneer:jobs:north-outer:04';
  touched integer;
begin
  if exists (select 1 from public.plot_claims where plot_id = target) then
    raise exception 'refusing to reserve %: it already carries a claim', target;
  end if;

  update public.plots set is_active = false where id = target;

  get diagnostics touched = row_count;
  if touched <> 1 then
    raise exception 'expected to reserve exactly one plot, matched % for %', touched, target;
  end if;
end;
$$;
