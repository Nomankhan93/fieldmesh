begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'fieldmesh_receipt_type') then
    create type public.fieldmesh_receipt_type as enum ('delivered', 'read');
  end if;
end $$;

create table if not exists public.messages (
  id uuid primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  client_created_at timestamptz not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint messages_expiry_after_client_time check (expires_at > client_created_at)
);

create index if not exists messages_conversation_created_idx
  on public.messages(conversation_id, created_at, id);
create index if not exists messages_sender_created_idx
  on public.messages(sender_id, created_at);
create index if not exists messages_expires_at_idx
  on public.messages(expires_at);

create or replace function public.fieldmesh_touch_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists fieldmesh_message_touches_conversation on public.messages;
create trigger fieldmesh_message_touches_conversation
after insert on public.messages
for each row execute function public.fieldmesh_touch_conversation_on_message();

create table if not exists public.message_receipts (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  receipt_type public.fieldmesh_receipt_type not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, receipt_type)
);

create index if not exists message_receipts_user_created_idx
  on public.message_receipts(user_id, created_at);

create or replace function public.fieldmesh_can_access_message(p_message_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.messages m
    join public.conversation_members cm
      on cm.conversation_id = m.conversation_id
    where m.id = p_message_id
      and cm.user_id = (select auth.uid())
  );
$$;

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

create or replace function public.fieldmesh_conversation_participants(
  p_conversation_id uuid
)
returns table (
  user_id uuid,
  fieldmesh_user_id uuid,
  display_name text,
  role public.fieldmesh_conversation_role
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.fieldmesh_is_conversation_member(p_conversation_id) then
    raise exception 'conversation access denied' using errcode = '42501';
  end if;

  return query
  select p.id, p.fieldmesh_user_id, p.display_name, cm.role
  from public.conversation_members cm
  join public.profiles p on p.id = cm.user_id
  where cm.conversation_id = p_conversation_id
  order by cm.joined_at asc, p.id asc;
end;
$$;

create or replace function public.fieldmesh_enforce_direct_member_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind public.fieldmesh_conversation_kind;
  v_member_count integer;
begin
  select c.kind into v_kind
  from public.conversations c
  where c.id = new.conversation_id;

  if v_kind = 'direct' then
    select count(*) into v_member_count
    from public.conversation_members cm
    where cm.conversation_id = new.conversation_id
      and cm.user_id <> new.user_id;

    if v_member_count >= 2 then
      raise exception 'direct conversations may contain only two members'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists fieldmesh_direct_member_limit on public.conversation_members;
create trigger fieldmesh_direct_member_limit
before insert on public.conversation_members
for each row execute function public.fieldmesh_enforce_direct_member_limit();

alter table public.messages enable row level security;
alter table public.message_receipts enable row level security;

drop policy if exists "messages_select_members" on public.messages;
create policy "messages_select_members"
on public.messages for select
to authenticated
using (public.fieldmesh_is_conversation_member(conversation_id));

drop policy if exists "messages_insert_members" on public.messages;
create policy "messages_insert_members"
on public.messages for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and public.fieldmesh_is_conversation_member(conversation_id)
);

drop policy if exists "message_receipts_select_members" on public.message_receipts;
create policy "message_receipts_select_members"
on public.message_receipts for select
to authenticated
using (public.fieldmesh_can_access_message(message_id));

drop policy if exists "message_receipts_insert_self" on public.message_receipts;
create policy "message_receipts_insert_self"
on public.message_receipts for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and public.fieldmesh_can_access_message(message_id)
  and exists (
    select 1
    from public.messages m
    where m.id = message_id
      and m.sender_id <> (select auth.uid())
  )
);

revoke all on public.messages, public.message_receipts from anon;
grant select, insert on public.messages to authenticated;
grant select, insert on public.message_receipts to authenticated;

revoke execute on function public.fieldmesh_can_access_message(uuid) from public;
revoke execute on function public.fieldmesh_create_direct_conversation(uuid) from public;
revoke execute on function public.fieldmesh_conversation_participants(uuid) from public;
grant execute on function public.fieldmesh_can_access_message(uuid) to authenticated;
grant execute on function public.fieldmesh_create_direct_conversation(uuid) to authenticated;
grant execute on function public.fieldmesh_conversation_participants(uuid) to authenticated;

commit;
