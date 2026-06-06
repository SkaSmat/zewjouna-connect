-- ---------------------------------------------------------------------------
-- ZEWJOUNA — Moderation & ban (beta P0 #3)
--
-- Adds:
--   * profiles.banned flag (banned users disappear from discovery and cannot
--     send messages),
--   * an `admins` allow-list + helpers,
--   * admin-only RPCs to triage reports, ban/unban, update report status and
--     remove an abusive photo.
--
-- All admin RPCs are SECURITY DEFINER and self-gate via public.is_admin(), so
-- they are safe to GRANT to `authenticated` (a non-admin call returns nothing
-- / raises).
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists banned boolean not null default false;

-- Admin allow-list. Membership is managed out-of-band (SQL editor / dashboard).
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
-- No client policies: the table is only ever read via SECURITY DEFINER helpers.

create or replace function public.is_admin(uid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a where a.user_id = uid);
$$;

-- Lightweight check the client uses to decide whether to show the /admin area.
create or replace function public.current_user_is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin(auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Banned users cannot send messages (in addition to the Bumble rules).
-- ---------------------------------------------------------------------------
create or replace function public.can_send_message(p_match_id uuid, p_sender uuid)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  m              public.matches%rowtype;
  other_id       uuid;
  sender_gender  public.gender;
  other_gender   public.gender;
  msg_count      integer;
begin
  select * into m from public.matches where id = p_match_id;
  if m.id is null then return false; end if;
  if p_sender <> m.user_a and p_sender <> m.user_b then return false; end if;

  other_id := case when m.user_a = p_sender then m.user_b else m.user_a end;
  if public.are_blocked(p_sender, other_id) then return false; end if;

  -- A banned sender (or talking to a banned user) cannot message.
  if exists (select 1 from public.profiles p
             where p.user_id in (p_sender, other_id) and p.banned) then
    return false;
  end if;

  select count(*) into msg_count from public.messages where match_id = p_match_id;

  if msg_count = 0 and m.expires_at is not null and m.expires_at < now() then
    return false;
  end if;

  if msg_count = 0 then
    select gender into sender_gender from public.profiles where user_id = p_sender;
    select gender into other_gender  from public.profiles where user_id = other_id;
    if sender_gender = 'male' and other_gender = 'female' then
      return false;
    end if;
  end if;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Discovery excludes banned profiles. Recreate the (7-arg) function adding the
-- `and not p.banned` filter in both the reachability count and the final query.
-- ---------------------------------------------------------------------------
drop function if exists public.get_candidates_adaptive(
  integer, integer, integer, integer, integer, double precision, double precision);

create or replace function public.get_candidates_adaptive(
  p_target          integer default 10,
  p_min_age         integer default 18,
  p_max_age         integer default 99,
  p_limit           integer default 20,
  p_max_distance_km integer default null,
  p_center_lng      double precision default null,
  p_center_lat      double precision default null
)
returns table (
  user_id        uuid,
  display_name   text,
  bio            text,
  photos         text[],
  age            integer,
  gender         public.gender,
  community_tags text[],
  shared_tags    text[],
  distance_m     double precision
)
language plpgsql stable security definer set search_path = public as $$
declare
  me         uuid := auth.uid();
  my_loc     geography;
  my_tags    text[];
  my_gender  public.gender;
  my_lf      public.looking_for;
  radius     double precision := 50000;
  max_radius double precision := 2000000;
  reachable  integer := 0;
  cap        double precision := case when p_max_distance_km is not null
                                       then greatest(p_max_distance_km, 1) * 1000.0 end;
begin
  if me is null then return; end if;

  select coalesce(pr.community_tags, '{}'), pr.gender, pr.looking_for
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
        and not exists (select 1 from public.swipes s
                          where s.swiper_id = me and s.swiped_id = p.user_id)
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
    select p.user_id,
           p.display_name,
           p.bio,
           p.photos,
           case when p.birthdate is not null
                then date_part('year', age(p.birthdate))::int end as age,
           p.gender,
           coalesce(p.community_tags, '{}') as community_tags,
           public.array_intersect(p.community_tags, my_tags) as shared_tags,
           case when my_loc is not null and p.location is not null
                then st_distance(p.location, my_loc) end as distance_m
    from public.profiles p
    where p.user_id <> me
      and not p.banned
      and not exists (select 1 from public.swipes s
                        where s.swiper_id = me and s.swiped_id = p.user_id)
      and not public.are_blocked(me, p.user_id)
      and (my_lf is null or my_lf = 'everyone' or p.gender::text = my_lf::text)
      and (p.looking_for is null or p.looking_for = 'everyone'
           or my_gender is null or p.looking_for::text = my_gender::text)
      and (p.birthdate is null
           or date_part('year', age(p.birthdate))::int between p_min_age and p_max_age)
      and (
        my_loc is null
        or (cap is not null
            and p.location is not null and st_dwithin(p.location, my_loc, radius))
        or (cap is null
            and (p.location is null or st_dwithin(p.location, my_loc, radius)))
      )
    order by
      cardinality(public.array_intersect(p.community_tags, my_tags)) desc,
      (case when my_loc is not null and p.location is not null
            then st_distance(p.location, my_loc) end) asc nulls last,
      p.last_active_at desc nulls last
    limit p_limit;
end;
$$;

grant execute on function
  public.get_candidates_adaptive(
    integer, integer, integer, integer, integer, double precision, double precision)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Admin RPCs (self-gated by is_admin)
-- ---------------------------------------------------------------------------

-- Triage queue: every report with the reported user's name + ban state.
create or replace function public.admin_list_reports(p_only_open boolean default true)
returns table (
  report_id       uuid,
  reporter_id     uuid,
  reported_id     uuid,
  reported_name   text,
  reported_banned boolean,
  reason          text,
  status          public.report_status,
  created_at      timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then return; end if;
  return query
    select r.id, r.reporter_id, r.reported_id,
           p.display_name, coalesce(p.banned, false),
           r.reason, r.status, r.created_at
    from public.reports r
    left join public.profiles p on p.user_id = r.reported_id
    where (not p_only_open) or r.status = 'open'
    order by r.created_at desc;
end;
$$;

create or replace function public.admin_set_ban(p_user uuid, p_banned boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;
  update public.profiles set banned = p_banned where user_id = p_user;
end;
$$;

create or replace function public.admin_set_report_status(
  p_report uuid, p_status public.report_status)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;
  update public.reports set status = p_status where id = p_report;
end;
$$;

-- Remove the photo at p_index (0-based) from a user's photos array. Hides it
-- everywhere immediately; storage object cleanup can be done separately.
create or replace function public.admin_remove_photo(p_user uuid, p_index integer)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;
  update public.profiles
     set photos = coalesce((
       select array_agg(elem order by ord)
       from unnest(photos) with ordinality as u(elem, ord)
       where ord <> p_index + 1
     ), '{}')
   where user_id = p_user;
end;
$$;

grant execute on function public.current_user_is_admin() to authenticated;
grant execute on function public.admin_list_reports(boolean) to authenticated;
grant execute on function public.admin_set_ban(uuid, boolean) to authenticated;
grant execute on function public.admin_set_report_status(uuid, public.report_status) to authenticated;
grant execute on function public.admin_remove_photo(uuid, integer) to authenticated;

notify pgrst, 'reload schema';
