-- ---------------------------------------------------------------------------
-- ZEWJOUNA — Web Push subscriptions (beta P1)
--
-- One row per device/browser that opted into push. The send-notification edge
-- function reads these (service role) to push match/message alerts, and falls
-- back to e-mail only when a recipient has no active subscription.
-- ---------------------------------------------------------------------------

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- A user manages only their own subscriptions.
drop policy if exists push_select_own on public.push_subscriptions;
create policy push_select_own on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());

drop policy if exists push_insert_own on public.push_subscriptions;
create policy push_insert_own on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists push_delete_own on public.push_subscriptions;
create policy push_delete_own on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, delete on public.push_subscriptions to authenticated;

notify pgrst, 'reload schema';
