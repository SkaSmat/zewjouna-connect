-- ---------------------------------------------------------------------------
-- ZEWJOUNA — restore the Bumble first-message rule
--
-- Re-instates: in a hetero pair with no messages yet, only the woman may send
-- the first message. Keeps the block/ban checks and the 24h un-opened-match
-- expiry. (Reverts the short-lived "open messaging" change.)
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

  -- An un-opened match past its 24h window is dead.
  if msg_count = 0 and m.expires_at is not null and m.expires_at < now() then
    return false;
  end if;

  -- First message of a hetero pair: only the woman may send it.
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

notify pgrst, 'reload schema';
