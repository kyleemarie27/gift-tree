-- Gift Tree schema. Paste this whole file into Supabase → SQL Editor → Run.
-- Safe to run once on a fresh project.

-- ───────────── Profiles ─────────────
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null default '',
  partner_id  uuid references public.profiles(id) on delete set null,
  tops        text default '',
  bottoms     text default '',
  shoes       text default '',
  notes       text default '',
  created_at  timestamptz not null default now()
);

-- Auto-create a profile row whenever someone signs in for the first time.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────── Wishlist items ─────────────
create table public.items (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title       text not null,
  url         text default '',
  image_url   text default '',
  price       text default '',
  details     text default '',   -- size / color / model
  notes       text default '',
  favorite    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ───────────── Claims ─────────────
-- recipient_id is stored on every claim so the "don't show me my own claims"
-- rule is a simple, airtight row filter. item_id is null for off-list gifts.
create table public.claims (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid references public.items(id) on delete cascade,
  recipient_id  uuid not null references public.profiles(id) on delete cascade,
  claimer_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind          text not null default 'full' check (kind in ('full', 'split')),
  note          text default '',
  created_at    timestamptz not null default now()
);
create unique index claims_one_per_person_per_item
  on public.claims (item_id, claimer_id) where item_id is not null;

-- ───────────── Secret Santa ─────────────
create table public.santa_events (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Secret Santa',
  budget      text default '',
  created_by  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  drawn_at    timestamptz,
  created_at  timestamptz not null default now()
);

create table public.santa_members (
  event_id    uuid not null references public.santa_events(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  primary key (event_id, profile_id)
);

create table public.santa_matches (
  event_id     uuid not null references public.santa_events(id) on delete cascade,
  giver_id     uuid not null references public.profiles(id) on delete cascade,
  receiver_id  uuid not null references public.profiles(id) on delete cascade,
  primary key (event_id, giver_id)
);

-- ───────────── Row-level security ─────────────
alter table public.profiles      enable row level security;
alter table public.items         enable row level security;
alter table public.claims        enable row level security;
alter table public.santa_events  enable row level security;
alter table public.santa_members enable row level security;
alter table public.santa_matches enable row level security;

-- Profiles: everyone in the family can see everyone; you edit only yourself.
create policy "profiles read"   on public.profiles for select to authenticated using (true);
create policy "profiles update" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Items: everyone sees every list; you manage only your own.
create policy "items read"   on public.items for select to authenticated using (true);
create policy "items insert" on public.items for insert to authenticated with check (owner_id = auth.uid());
create policy "items update" on public.items for update to authenticated using (owner_id = auth.uid());
create policy "items delete" on public.items for delete to authenticated using (owner_id = auth.uid());

-- Claims: THE SURPRISE RULE. You can never read claims on gifts for you.
create policy "claims read" on public.claims for select to authenticated
  using (recipient_id <> auth.uid());
create policy "claims insert" on public.claims for insert to authenticated
  with check (
    claimer_id = auth.uid()
    and recipient_id <> auth.uid()
    and (item_id is null or exists (
      select 1 from public.items i where i.id = item_id and i.owner_id = recipient_id))
  );
create policy "claims update" on public.claims for update to authenticated using (claimer_id = auth.uid());
create policy "claims delete" on public.claims for delete to authenticated using (claimer_id = auth.uid());

-- Secret Santa: events + members visible to all; matches only to the giver.
create policy "santa events read"   on public.santa_events for select to authenticated using (true);
create policy "santa events insert" on public.santa_events for insert to authenticated with check (created_by = auth.uid());
create policy "santa events update" on public.santa_events for update to authenticated using (true);
create policy "santa events delete" on public.santa_events for delete to authenticated using (created_by = auth.uid());

create policy "santa members read"  on public.santa_members for select to authenticated using (true);
create policy "santa members write" on public.santa_members for insert to authenticated
  with check (exists (select 1 from public.santa_events e where e.id = event_id and e.drawn_at is null));
create policy "santa members remove" on public.santa_members for delete to authenticated
  using (exists (select 1 from public.santa_events e where e.id = event_id and e.drawn_at is null));

create policy "santa matches read" on public.santa_matches for select to authenticated
  using (giver_id = auth.uid());
-- (no insert/update policies: matches are only written by draw_santa below)

-- ───────────── Functions ─────────────

-- Link two people as partners (both directions). Pass null to unlink.
create function public.set_partner(p uuid) returns void
language plpgsql security definer set search_path = public as $$
declare old uuid;
begin
  select partner_id into old from profiles where id = auth.uid();
  if old is not null then update profiles set partner_id = null where id = old and partner_id = auth.uid(); end if;
  if p is not null then
    update profiles set partner_id = null where partner_id = p and id <> auth.uid();
    update profiles set partner_id = auth.uid() where id = p;
  end if;
  update profiles set partner_id = p where id = auth.uid();
end $$;

-- How many presents are under MY tree (no details revealed).
create function public.my_gift_count() returns integer
language sql security definer set search_path = public stable as $$
  select count(distinct coalesce(item_id, id))::int from claims where recipient_id = auth.uid();
$$;

-- "Peek" — the spoiler button. Shows which of my items are claimed (not by whom).
create function public.peek_my_claims() returns table (item_id uuid, kind text)
language sql security definer set search_path = public stable as $$
  select distinct item_id, kind from claims where recipient_id = auth.uid() and item_id is not null;
$$;

-- Draw names out of the hat. One big loop (A→B→C→…→A), nobody draws
-- themselves or their partner. Re-running it reshuffles.
create function public.draw_santa(ev uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  ids uuid[];
  n int;
  tries int := 0;
  ok boolean;
  i int;
  a uuid; b uuid;
begin
  if not exists (select 1 from santa_members where event_id = ev and profile_id = auth.uid())
     and not exists (select 1 from santa_events where id = ev and created_by = auth.uid()) then
    raise exception 'Only participants or the organizer can draw names';
  end if;

  select count(*) into n from santa_members where event_id = ev;
  if n < 3 then raise exception 'Need at least 3 people to draw names'; end if;

  loop
    tries := tries + 1;
    select array_agg(profile_id order by random()) into ids from santa_members where event_id = ev;
    ok := true;
    for i in 1..n loop
      a := ids[i];
      b := ids[(i % n) + 1];
      if exists (select 1 from profiles where id = a and partner_id = b)
         or exists (select 1 from profiles where id = b and partner_id = a) then
        ok := false; exit;
      end if;
    end loop;
    exit when ok;
    if tries > 2000 then raise exception 'Could not find a valid draw (too many couples?)'; end if;
  end loop;

  delete from santa_matches where event_id = ev;
  for i in 1..n loop
    insert into santa_matches (event_id, giver_id, receiver_id) values (ev, ids[i], ids[(i % n) + 1]);
  end loop;
  update santa_events set drawn_at = now() where id = ev;
end $$;

-- Re-open an event so people can be added/removed (clears the draw).
create function public.reset_santa(ev uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from santa_events where id = ev and created_by = auth.uid()) then
    raise exception 'Only the organizer can reset';
  end if;
  delete from santa_matches where event_id = ev;
  update santa_events set drawn_at = null where id = ev;
end $$;

-- Who has been matched (so the page can say "drawn ✓" without revealing pairs).
create function public.santa_drawn_count(ev uuid) returns integer
language sql security definer set search_path = public stable as $$
  select count(*)::int from santa_matches where event_id = ev;
$$;

grant execute on function public.set_partner(uuid), public.my_gift_count(), public.peek_my_claims(),
  public.draw_santa(uuid), public.reset_santa(uuid), public.santa_drawn_count(uuid) to authenticated;
