-- ---------------------------------------------------------------------------
-- ZEWJOUNA — generic rate limiter (beta P1, anti-scraping)
--
-- A fixed-window counter keyed by an arbitrary string. rl_take() atomically
-- increments the counter for the current window and returns whether the call
-- is still within the limit. Used by the signed-photo-urls edge function to
-- cap how fast a user can mint signed URLs for other people's photos.
-- ---------------------------------------------------------------------------

create table if not exists public.rate_counters (
  key          text primary key,
  count        integer not null default 0,
  window_start timestamptz not null default now()
);
alter table public.rate_counters enable row level security;
-- No client policies: only SECURITY DEFINER functions (server-side) touch it.

create or replace function public.rl_take(
  p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  c public.rate_counters%rowtype;
begin
  insert into public.rate_counters (key, count, window_start)
  values (p_key, 1, now())
  on conflict (key) do update
    set count = case
          when public.rate_counters.window_start
               < now() - make_interval(secs => p_window_seconds)
          then 1 else public.rate_counters.count + 1 end,
        window_start = case
          when public.rate_counters.window_start
               < now() - make_interval(secs => p_window_seconds)
          then now() else public.rate_counters.window_start end
  returning * into c;
  return c.count <= p_limit;
end;
$$;

notify pgrst, 'reload schema';
