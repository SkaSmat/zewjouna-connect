-- ---------------------------------------------------------------------------
-- ZEWJOUNA — add an optional user-controlled max-distance filter to the
-- discovery feed (Bumble/Badoo-style distance slider).
--
-- get_candidates_adaptive gains a 5th argument `p_max_distance_km`:
--   * NULL (default) → previous behaviour: radius widens adaptively from
--     50 km up to 2000 km, then includes unlocated profiles (cold-start).
--   * a value (e.g. 100) → HARD cap. The adaptive radius never exceeds it,
--     and only profiles with a location within the cap are returned.
--
-- The old 4-argument overload is dropped so PostgREST resolves the named
-- call (p_target, p_min_age, p_max_age, p_limit) to this single definition,
-- with p_max_distance_km defaulting to NULL.
-- ---------------------------------------------------------------------------

drop function if exists public.get_candidates_adaptive(integer, integer, integer, integer);
drop function if exists public.get_candidates_adaptive(integer, integer, integer, integer, integer);

create or replace function public.get_candidates_adaptive(
  p_target          integer default 10,
  p_min_age         integer default 18,
  p_max_age         integer default 99,
  p_limit           integer default 20,
  p_max_distance_km integer default null
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
  radius     double precision := 50000;     -- start at 50 km
  max_radius double precision := 2000000;   -- cap at 2000 km (then go global)
  reachable  integer := 0;
  -- User-requested hard ceiling (metres), or NULL when unset.
  cap        double precision := case when p_max_distance_km is not null
                                       then greatest(p_max_distance_km, 1) * 1000.0 end;
begin
  if me is null then return; end if;

  select pr.location, coalesce(pr.community_tags, '{}'), pr.gender, pr.looking_for
    into my_loc, my_tags, my_gender, my_lf
    from public.profiles pr where pr.user_id = me;

  -- A hard cap overrides the adaptive ceiling and clamps the starting radius.
  if cap is not null then
    max_radius := cap;
    radius := least(radius, cap);
  end if;

  -- Adaptively widen the radius until enough people are within range.
  if my_loc is not null then
    loop
      select count(*) into reachable
      from public.profiles p
      where p.user_id <> me
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
    -- Never exceed the user-requested cap after doubling.
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
      and not exists (select 1 from public.swipes s
                        where s.swiper_id = me and s.swiped_id = p.user_id)
      and not public.are_blocked(me, p.user_id)
      and (my_lf is null or my_lf = 'everyone' or p.gender::text = my_lf::text)
      and (p.looking_for is null or p.looking_for = 'everyone'
           or my_gender is null or p.looking_for::text = my_gender::text)
      and (p.birthdate is null
           or date_part('year', age(p.birthdate))::int between p_min_age and p_max_age)
      -- Distance handling: a hard cap requires a location within range;
      -- without a cap we keep the cold-start behaviour (unlocated allowed).
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
  public.get_candidates_adaptive(integer, integer, integer, integer, integer)
  to authenticated;
