-- ---------------------------------------------------------------------------
-- ZEWJOUNA — open messaging (product change)
--
-- Removes the "only the woman sends the first message" rule. Either member of
-- a match may now initiate. The block/ban checks and the 24h un-opened-match
-- expiry still apply (the first message from EITHER side lifts the expiry via
-- the existing handle_message trigger).
-- ---------------------------------------------------------------------------

create or replace function public.can_send_message(p_match_id uuid, p_sender uuid)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  m         public.matches%rowtype;
  other_id  uuid;
  msg_count integer;
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

  -- An un-opened match past its 24h window is dead.
  if msg_count = 0 and m.expires_at is not null and m.expires_at < now() then
    return false;
  end if;

  -- Either member may send the first message.
  return true;
end;
$$;

notify pgrst, 'reload schema';
