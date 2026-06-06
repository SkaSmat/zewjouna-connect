-- ---------------------------------------------------------------------------
-- ZEWJOUNA — Unmatch (beta P1)
--
-- Lets either member of a match end it. Deleting the match row cascades to its
-- messages (messages.match_id ... on delete cascade). Exposed as a SECURITY
-- DEFINER RPC because clients have no DELETE policy on matches.
-- ---------------------------------------------------------------------------

create or replace function public.unmatch(p_match_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  m public.matches%rowtype;
begin
  select * into m from public.matches where id = p_match_id;
  if m.id is null then return; end if;
  if auth.uid() <> m.user_a and auth.uid() <> m.user_b then
    raise exception 'forbidden';
  end if;
  delete from public.matches where id = p_match_id;  -- messages cascade away
end;
$$;

grant execute on function public.unmatch(uuid) to authenticated;

notify pgrst, 'reload schema';
