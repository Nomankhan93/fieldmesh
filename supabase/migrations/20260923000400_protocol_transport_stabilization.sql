begin;

-- Serialize direct-conversation creation by canonical user pair. This closes the
-- race where both participants can observe "no existing conversation" and each
-- create a separate direct thread at the same time.
create or replace function public.fieldmesh_create_direct_conversation(
  p_recipient_fieldmesh_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := (select auth.uid());
  v_recipient uuid;
  v_existing uuid;
  v_conversation uuid := gen_random_uuid();
  v_pair_key text;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select p.id
  into v_recipient
  from public.profiles p
  where p.fieldmesh_user_id = p_recipient_fieldmesh_user_id;

  if v_recipient is null then
    raise exception 'recipient not found' using errcode = 'P0002';
  end if;

  if v_recipient = v_caller then
    raise exception 'cannot create a direct conversation with yourself' using errcode = '22023';
  end if;

  v_pair_key := 'fieldmesh-direct:'
    || least(v_caller::text, v_recipient::text)
    || ':'
    || greatest(v_caller::text, v_recipient::text);

  perform pg_advisory_xact_lock(hashtextextended(v_pair_key, 0));

  select c.id
  into v_existing
  from public.conversations c
  where c.kind = 'direct'
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = c.id and cm.user_id = v_caller
    )
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = c.id and cm.user_id = v_recipient
    )
    and 2 = (
      select count(*) from public.conversation_members cm
      where cm.conversation_id = c.id
    )
  order by c.created_at asc
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  insert into public.conversations (id, kind, created_by)
  values (v_conversation, 'direct', v_caller);

  insert into public.conversation_members (conversation_id, user_id, role)
  values (v_conversation, v_recipient, 'member');

  return v_conversation;
end;
$$;

revoke execute on function public.fieldmesh_create_direct_conversation(uuid) from public;
grant execute on function public.fieldmesh_create_direct_conversation(uuid) to authenticated;

commit;
