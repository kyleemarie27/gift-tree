-- 002: product photos, color swatches, clearer Secret Santa.
-- Run after schema.sql.

-- Color swatches on items: [{ "name": "Sage", "hex": "#9caf88" }, ...]
alter table public.items add column if not exists colors jsonb not null default '[]'::jsonb;

-- Secret Santa details + trust signals
alter table public.santa_events add column if not exists exchange_date text default '';
alter table public.santa_events add column if not exists drawn_by uuid references public.profiles(id) on delete set null;
alter table public.santa_matches add column if not exists seen_at timestamptz;

-- Only the organizer manages the group and the draw.
drop policy if exists "santa events update" on public.santa_events;
create policy "santa events update" on public.santa_events for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists "santa members write" on public.santa_members;
drop policy if exists "santa members remove" on public.santa_members;
create policy "santa members write" on public.santa_members for insert to authenticated
  with check (exists (select 1 from public.santa_events e where e.id = event_id and e.drawn_at is null and e.created_by = auth.uid()));
create policy "santa members remove" on public.santa_members for delete to authenticated
  using (exists (select 1 from public.santa_events e where e.id = event_id and e.drawn_at is null and e.created_by = auth.uid()));

create or replace function public.draw_santa(ev uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  ids uuid[]; n int; tries int := 0; ok boolean; i int; a uuid; b uuid;
begin
  if not exists (select 1 from santa_events where id = ev and created_by = auth.uid()) then
    raise exception 'Only the organizer can draw names';
  end if;
  select count(*) into n from santa_members where event_id = ev;
  if n < 3 then raise exception 'Need at least 3 people to draw names'; end if;
  loop
    tries := tries + 1;
    select array_agg(profile_id order by random()) into ids from santa_members where event_id = ev;
    ok := true;
    for i in 1..n loop
      a := ids[i]; b := ids[(i % n) + 1];
      if exists (select 1 from profiles where id = a and partner_id = b)
         or exists (select 1 from profiles where id = b and partner_id = a) then ok := false; exit; end if;
    end loop;
    exit when ok;
    if tries > 2000 then raise exception 'Could not find a valid draw (too many couples?)'; end if;
  end loop;
  delete from santa_matches where event_id = ev;
  for i in 1..n loop
    insert into santa_matches (event_id, giver_id, receiver_id) values (ev, ids[i], ids[(i % n) + 1]);
  end loop;
  update santa_events set drawn_at = now(), drawn_by = auth.uid() where id = ev;
end $$;

create or replace function public.reset_santa(ev uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from santa_events where id = ev and created_by = auth.uid()) then
    raise exception 'Only the organizer can reset';
  end if;
  delete from santa_matches where event_id = ev;
  update santa_events set drawn_at = null, drawn_by = null where id = ev;
end $$;

-- "I opened my match" (only marks your own row).
create or replace function public.mark_santa_seen(ev uuid) returns void
language sql security definer set search_path = public as $$
  update santa_matches set seen_at = coalesce(seen_at, now()) where event_id = ev and giver_id = auth.uid();
$$;

-- Per-person status for a group: assigned? opened? — never who they got.
create or replace function public.santa_status(ev uuid)
returns table (profile_id uuid, assigned boolean, seen boolean)
language sql security definer set search_path = public stable as $$
  select m.profile_id, (x.giver_id is not null), (x.seen_at is not null)
  from santa_members m
  left join santa_matches x on x.event_id = m.event_id and x.giver_id = m.profile_id
  where m.event_id = ev;
$$;

drop function if exists public.santa_drawn_count(uuid);
grant execute on function public.mark_santa_seen(uuid), public.santa_status(uuid) to authenticated;

-- Photo uploads (public read; you can only write into your own folder).
insert into storage.buckets (id, name, public) values ('gift-photos', 'gift-photos', true)
  on conflict (id) do nothing;
drop policy if exists "gift photos read" on storage.objects;
drop policy if exists "gift photos upload" on storage.objects;
drop policy if exists "gift photos delete" on storage.objects;
create policy "gift photos read" on storage.objects for select using (bucket_id = 'gift-photos');
create policy "gift photos upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'gift-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "gift photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'gift-photos' and (storage.foldername(name))[1] = auth.uid()::text);
