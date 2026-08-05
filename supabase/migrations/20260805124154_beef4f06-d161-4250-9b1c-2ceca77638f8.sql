create extension if not exists postgis;
create extension if not exists pgcrypto;

do $$ begin create type public.gender as enum ('female','male','nonbinary'); exception when duplicate_object then null; end $$;
do $$ begin create type public.looking_for as enum ('female','male','nonbinary','everyone'); exception when duplicate_object then null; end $$;
do $$ begin create type public.swipe_action as enum ('like','pass'); exception when duplicate_object then null; end $$;
do $$ begin create type public.report_status as enum ('open','reviewing','resolved','dismissed'); exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  display_name   text,
  bio            text,
  photos         text[] not null default '{}',
  birthdate      date,
  gender         public.gender,
  looking_for    public.looking_for,
  location       geography(Point, 4326),
  community_tags text[] not null default '{}',
  verified       boolean not null default false,
  banned         boolean not null default false,
  last_active_at timestamptz default now(),
  created_at     timestamptz not null default now(),
  constraint bio_len check (bio is null or char_length(bio) <= 1000),
  constraint name_len check (display_name is null or char_length(display_name) <= 60)
);
create index if not exists profiles_location_gix on public.profiles using gist (location);
create index if not exists profiles_tags_gin on public.profiles using gin (community_tags);
create index if not exists profiles_active_idx on public.profiles (last_active_at desc);

create table if not exists public.swipes (
  id         uuid primary key default gen_random_uuid(),
  swiper_id  uuid not null references auth.users (id) on delete cascade,
  swiped_id  uuid not null references auth.users (id) on delete cascade,
  action     public.swipe_action not null,
  created_at timestamptz not null default now(),
  constraint no_self_swipe check (swiper_id <> swiped_id),
  constraint uniq_swipe unique (swiper_id, swiped_id)
);
create index if not exists swipes_swiped_idx on public.swipes (swiped_id);

create table if not exists public.matches (
  id                   uuid primary key default gen_random_uuid(),
  user_a               uuid not null references auth.users (id) on delete cascade,
  user_b               uuid not null references auth.users (id) on delete cascade,
  created_at           timestamptz not null default now(),
  expires_at           timestamptz,
  conversation_started boolean not null default false,
  constraint ordered_pair check (user_a < user_b),
  constraint uniq_match unique (user_a, user_b)
);
create index if not exists matches_user_a_idx on public.matches (user_a);
create index if not exists matches_user_b_idx on public.matches (user_b);

create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references public.matches (id) on delete cascade,
  sender_id  uuid not null references auth.users (id) on delete cascade,
  content    text not null,
  created_at timestamptz not null default now(),
  read_at    timestamptz,
  constraint content_len check (char_length(content) between 1 and 2000)
);
create index if not exists messages_match_idx on public.messages (match_id, created_at);

create table if not exists public.blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint no_self_block check (blocker_id <> blocked_id)
);
create index if not exists blocks_blocked_idx on public.blocks (blocked_id);

create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reported_id uuid not null references auth.users (id) on delete cascade,
  reason      text not null,
  status      public.report_status not null default 'open',
  created_at  timestamptz not null default now(),
  constraint no_self_report check (reporter_id <> reported_id)
);

create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

create table if not exists public.rate_counters (
  key          text primary key,
  count        integer not null default 0,
  window_start timestamptz not null default now()
);

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert on public.swipes to authenticated;
grant select on public.matches to authenticated;
grant select, insert, update on public.messages to authenticated;
grant select, insert, delete on public.blocks to authenticated;
grant select, insert on public.reports to authenticated;
grant select, insert, delete on public.push_subscriptions to authenticated;
grant all on public.profiles, public.swipes, public.matches, public.messages, public.blocks, public.reports, public.admins, public.push_subscriptions, public.rate_counters to service_role;

alter table public.profiles enable row level security;
alter table public.swipes enable row level security;
alter table public.matches enable row level security;
alter table public.messages enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.admins enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.rate_counters enable row level security;

create or replace function public.are_blocked(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;

create or replace function public.is_matched(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.matches
    where user_a = least(a, b) and user_b = greatest(a, b));
$$;

create or replace function public.array_intersect(a text[], b text[])
returns text[] language sql immutable as $$
  select coalesce(array(select unnest(coalesce(a,'{}')) intersect select unnest(coalesce(b,'{}'))), '{}');
$$;

create or replace function public.is_admin(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a where a.user_id = uid);
$$;

create or replace function public.current_user_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin(auth.uid());
$$;

create or replace function public.handle_swipe()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set last_active_at = now() where user_id = new.swiper_id;
  if new.action = 'like' and exists (
    select 1 from public.swipes s
    where s.swiper_id = new.swiped_id and s.swiped_id = new.swiper_id and s.action = 'like'
  ) and not public.are_blocked(new.swiper_id, new.swiped_id) then
    insert into public.matches (user_a, user_b, expires_at)
    values (least(new.swiper_id, new.swiped_id), greatest(new.swiper_id, new.swiped_id), now() + interval '24 hours')
    on conflict (user_a, user_b) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_swipe_match on public.swipes;
create trigger trg_swipe_match after insert on public.swipes
  for each row execute function public.handle_swipe();

create or replace function public.handle_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set last_active_at = now() where user_id = new.sender_id;
  update public.matches set conversation_started = true, expires_at = null
   where id = new.match_id and conversation_started = false;
  return new;
end;
$$;
drop trigger if exists trg_message_open on public.messages;
create trigger trg_message_open after insert on public.messages
  for each row execute function public.handle_message();

create or replace function public.can_send_message(p_match_id uuid, p_sender uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  m public.matches%rowtype;
  other_id uuid;
  sender_gender public.gender;
  other_gender public.gender;
  msg_count integer;
begin
  select * into m from public.matches where id = p_match_id;
  if m.id is null then return false; end if;
  if p_sender <> m.user_a and p_sender <> m.user_b then return false; end if;
  other_id := case when m.user_a = p_sender then m.user_b else m.user_a end;
  if public.are_blocked(p_sender, other_id) then return false; end if;
  if exists (select 1 from public.profiles p where p.user_id in (p_sender, other_id) and p.banned) then
    return false;
  end if;
  select count(*) into msg_count from public.messages where match_id = p_match_id;
  if msg_count = 0 and m.expires_at is not null and m.expires_at < now() then
    return false;
  end if;
  if msg_count = 0 then
    select gender into sender_gender from public.profiles where user_id = p_sender;
    select gender into other_gender from public.profiles where user_id = other_id;
    if sender_gender = 'male' and other_gender = 'female' then return false; end if;
  end if;
  return true;
end;
$$;

create or replace function public.get_match_profile(p_target uuid)
returns table (
  user_id uuid, display_name text, bio text, age integer,
  gender public.gender, community_tags text[], verified boolean
) language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or not public.is_matched(me, p_target) then return; end if;
  return query
    select p.user_id, p.display_name, p.bio,
           case when p.birthdate is not null then date_part('year', age(p.birthdate))::int end,
           p.gender, coalesce(p.community_tags,'{}'), p.verified
    from public.profiles p where p.user_id = p_target;
end;
$$;

create or replace function public.get_candidates_adaptive(
  p_target integer default 10,
  p_min_age integer default 18,
  p_max_age integer default 99,
  p_limit integer default 20,
  p_max_distance_km integer default null,
  p_center_lng double precision default null,
  p_center_lat double precision default null
)
returns table (
  user_id uuid, display_name text, bio text, photos text[], age integer,
  gender public.gender, community_tags text[], shared_tags text[], distance_m double precision
) language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  my_loc geography;
  my_tags text[];
  my_gender public.gender;
  my_lf public.looking_for;
  radius double precision := 50000;
  max_radius double precision := 2000000;
  reachable integer := 0;
  cap double precision := case when p_max_distance_km is not null
                               then greatest(p_max_distance_km, 1) * 1000.0 end;
begin
  if me is null then return; end if;

  select coalesce(pr.community_tags,'{}'), pr.gender, pr.looking_for
    into my_tags, my_gender, my_lf
    from public.profiles pr where pr.user_id = me;

  if p_center_lng is not null and p_center_lat is not null then
    my_loc := st_setsrid(st_makepoint(p_center_lng, p_center_lat), 4326)::geography;
  else
    select pr.location into my_loc from public.profiles pr where pr.user_id = me;
  end if;

  if cap is not null then
    max_radius := cap;
    radius := least(radius, cap);
  end if;

  if my_loc is not null then
    loop
      select count(*) into reachable
      from public.profiles p
      where p.user_id <> me
        and not p.banned
        and p.location is not null
        and st_dwithin(p.location, my_loc, radius)
        and not exists (select 1 from public.swipes s where s.swiper_id = me and s.swiped_id = p.user_id)
        and not public.are_blocked(me, p.user_id)
        and (my_lf is null or my_lf = 'everyone' or p.gender::text = my_lf::text)
        and (p.looking_for is null or p.looking_for = 'everyone'
             or my_gender is null or p.looking_for::text = my_gender::text)
        and (p.birthdate is null
             or date_part('year', age(p.birthdate))::int between p_min_age and p_max_age);
      exit when reachable >= p_target or radius >= max_radius;
      radius := radius * 2;
    end loop;
    if cap is not null then radius := least(radius, cap); end if;
  end if;

  return query
    select p.user_id, p.display_name, p.bio, p.photos,
           case when p.birthdate is not null then date_part('year', age(p.birthdate))::int end as age,
           p.gender,
           coalesce(p.community_tags,'{}') as community_tags,
           public.array_intersect(p.community_tags, my_tags) as shared_tags,
           case when my_loc is not null and p.location is not null
                then st_distance(p.location, my_loc) end as distance_m
    from public.profiles p
    where p.user_id <> me
      and not p.banned
      and not exists (select 1 from public.swipes s where s.swiper_id = me and s.swiped_id = p.user_id)
      and not public.are_blocked(me, p.user_id)
      and (my_lf is null or my_lf = 'everyone' or p.gender::text = my_lf::text)
      and (p.looking_for is null or p.looking_for = 'everyone'
           or my_gender is null or p.looking_for::text = my_gender::text)
      and (p.birthdate is null
           or date_part('year', age(p.birthdate))::int between p_min_age and p_max_age)
      and (
        my_loc is null
        or (cap is not null and p.location is not null and st_dwithin(p.location, my_loc, radius))
        or (cap is null and (p.location is null or st_dwithin(p.location, my_loc, radius)))
      )
    order by
      cardinality(public.array_intersect(p.community_tags, my_tags)) desc,
      (case when my_loc is not null and p.location is not null
            then st_distance(p.location, my_loc) end) asc nulls last,
      p.last_active_at desc nulls last
    limit p_limit;
end;
$$;

create or replace function public.admin_list_reports(p_only_open boolean default true)
returns table (
  report_id uuid, reporter_id uuid, reported_id uuid, reported_name text,
  reported_banned boolean, reason text, status public.report_status, created_at timestamptz
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then return; end if;
  return query
    select r.id, r.reporter_id, r.reported_id, p.display_name, coalesce(p.banned,false),
           r.reason, r.status, r.created_at
    from public.reports r
    left join public.profiles p on p.user_id = r.reported_id
    where (not p_only_open) or r.status = 'open'
    order by r.created_at desc;
end;
$$;

create or replace function public.admin_set_ban(p_user uuid, p_banned boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'forbidden'; end if;
  update public.profiles set banned = p_banned where user_id = p_user;
end;
$$;

create or replace function public.admin_set_report_status(p_report uuid, p_status public.report_status)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'forbidden'; end if;
  update public.reports set status = p_status where id = p_report;
end;
$$;

create or replace function public.admin_remove_photo(p_user uuid, p_index integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'forbidden'; end if;
  update public.profiles
     set photos = coalesce((
       select array_agg(elem order by ord)
       from unnest(photos) with ordinality as u(elem, ord)
       where ord <> p_index + 1
     ), '{}')
   where user_id = p_user;
end;
$$;

create or replace function public.unmatch(p_match_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m public.matches%rowtype;
begin
  select * into m from public.matches where id = p_match_id;
  if m.id is null then return; end if;
  if auth.uid() <> m.user_a and auth.uid() <> m.user_b then raise exception 'forbidden'; end if;
  delete from public.matches where id = p_match_id;
end;
$$;

create or replace function public.rl_take(p_key text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare c public.rate_counters%rowtype;
begin
  insert into public.rate_counters (key, count, window_start)
  values (p_key, 1, now())
  on conflict (key) do update
    set count = case when public.rate_counters.window_start < now() - make_interval(secs => p_window_seconds)
                     then 1 else public.rate_counters.count + 1 end,
        window_start = case when public.rate_counters.window_start < now() - make_interval(secs => p_window_seconds)
                     then now() else public.rate_counters.window_start end
  returning * into c;
  return c.count <= p_limit;
end;
$$;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (user_id = auth.uid());
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists swipes_select_own on public.swipes;
create policy swipes_select_own on public.swipes
  for select to authenticated using (swiper_id = auth.uid());
drop policy if exists swipes_insert_own on public.swipes;
create policy swipes_insert_own on public.swipes
  for insert to authenticated
  with check (swiper_id = auth.uid() and not public.are_blocked(swiper_id, swiped_id));

drop policy if exists matches_select_member on public.matches;
create policy matches_select_member on public.matches
  for select to authenticated using (user_a = auth.uid() or user_b = auth.uid());

drop policy if exists messages_select_member on public.messages;
create policy messages_select_member on public.messages
  for select to authenticated
  using (exists (select 1 from public.matches m where m.id = match_id
                 and (m.user_a = auth.uid() or m.user_b = auth.uid())));
drop policy if exists messages_insert_sender on public.messages;
create policy messages_insert_sender on public.messages
  for insert to authenticated
  with check (sender_id = auth.uid() and public.can_send_message(match_id, auth.uid()));
drop policy if exists messages_update_recipient on public.messages;
create policy messages_update_recipient on public.messages
  for update to authenticated
  using (sender_id <> auth.uid()
         and exists (select 1 from public.matches m where m.id = match_id
                     and (m.user_a = auth.uid() or m.user_b = auth.uid())))
  with check (sender_id <> auth.uid());

drop policy if exists blocks_select_own on public.blocks;
create policy blocks_select_own on public.blocks
  for select to authenticated using (blocker_id = auth.uid());
drop policy if exists blocks_insert_own on public.blocks;
create policy blocks_insert_own on public.blocks
  for insert to authenticated with check (blocker_id = auth.uid());
drop policy if exists blocks_delete_own on public.blocks;
create policy blocks_delete_own on public.blocks
  for delete to authenticated using (blocker_id = auth.uid());

drop policy if exists reports_select_own on public.reports;
create policy reports_select_own on public.reports
  for select to authenticated using (reporter_id = auth.uid());
drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own on public.reports
  for insert to authenticated with check (reporter_id = auth.uid());

drop policy if exists push_select_own on public.push_subscriptions;
create policy push_select_own on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
drop policy if exists push_insert_own on public.push_subscriptions;
create policy push_insert_own on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists push_delete_own on public.push_subscriptions;
create policy push_delete_own on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

grant execute on function public.get_candidates_adaptive(integer, integer, integer, integer, integer, double precision, double precision) to authenticated;
grant execute on function public.get_match_profile(uuid) to authenticated;
grant execute on function public.current_user_is_admin() to authenticated;
grant execute on function public.admin_list_reports(boolean) to authenticated;
grant execute on function public.admin_set_ban(uuid, boolean) to authenticated;
grant execute on function public.admin_set_report_status(uuid, public.report_status) to authenticated;
grant execute on function public.admin_remove_photo(uuid, integer) to authenticated;
grant execute on function public.unmatch(uuid) to authenticated;

do $$ begin alter publication supabase_realtime add table public.messages; exception when duplicate_object then null; end $$;

drop policy if exists photos_select_own on storage.objects;
create policy photos_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists photos_insert_own on storage.objects;
create policy photos_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists photos_update_own on storage.objects;
create policy photos_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists photos_delete_own on storage.objects;
create policy photos_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);

notify pgrst, 'reload schema';