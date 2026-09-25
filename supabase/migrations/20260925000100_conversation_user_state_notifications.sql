begin;

create table if not exists public.conversation_user_state (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  hidden_at timestamptz,
  cleared_before timestamptz,
  muted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists conversation_user_state_user_idx
  on public.conversation_user_state(user_id, updated_at desc);

alter table public.conversation_user_state enable row level security;

drop policy if exists "conversation_user_state_select_self" on public.conversation_user_state;
create policy "conversation_user_state_select_self"
on public.conversation_user_state for select
to authenticated
using (user_id = (select auth.uid()));

revoke all on public.conversation_user_state from anon;
revoke insert, update, delete on public.conversation_user_state from authenticated;
grant select on public.conversation_user_state to authenticated;

create or replace function public.fieldmesh_assert_conversation_member(p_conversation_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not public.fieldmesh_is_conversation_member(p_conversation_id) then
    raise exception 'conversation access denied' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.fieldmesh_clear_conversation_for_me(p_conversation_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_user uuid := (select auth.uid());
begin
  perform public.fieldmesh_assert_conversation_member(p_conversation_id);

  insert into public.conversation_user_state (
    conversation_id,
    user_id,
    cleared_before,
    updated_at
  ) values (
    p_conversation_id,
    v_user,
    v_now,
    v_now
  )
  on conflict (conversation_id, user_id) do update
    set cleared_before = excluded.cleared_before,
        updated_at = excluded.updated_at;

  return v_now;
end;
$$;

create or replace function public.fieldmesh_delete_conversation_for_me(p_conversation_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_user uuid := (select auth.uid());
begin
  perform public.fieldmesh_assert_conversation_member(p_conversation_id);

  insert into public.conversation_user_state (
    conversation_id,
    user_id,
    hidden_at,
    cleared_before,
    updated_at
  ) values (
    p_conversation_id,
    v_user,
    v_now,
    v_now,
    v_now
  )
  on conflict (conversation_id, user_id) do update
    set hidden_at = excluded.hidden_at,
        cleared_before = excluded.cleared_before,
        updated_at = excluded.updated_at;

  return v_now;
end;
$$;

create or replace function public.fieldmesh_restore_conversation_for_me(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_user uuid := (select auth.uid());
begin
  perform public.fieldmesh_assert_conversation_member(p_conversation_id);

  insert into public.conversation_user_state (
    conversation_id,
    user_id,
    hidden_at,
    updated_at
  ) values (
    p_conversation_id,
    v_user,
    null,
    v_now
  )
  on conflict (conversation_id, user_id) do update
    set hidden_at = null,
        updated_at = excluded.updated_at;
end;
$$;

create or replace function public.fieldmesh_set_conversation_muted(
  p_conversation_id uuid,
  p_muted boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_user uuid := (select auth.uid());
begin
  perform public.fieldmesh_assert_conversation_member(p_conversation_id);

  insert into public.conversation_user_state (
    conversation_id,
    user_id,
    muted,
    updated_at
  ) values (
    p_conversation_id,
    v_user,
    coalesce(p_muted, false),
    v_now
  )
  on conflict (conversation_id, user_id) do update
    set muted = excluded.muted,
        updated_at = excluded.updated_at;
end;
$$;

create or replace function public.fieldmesh_unhide_conversation_on_incoming_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversation_user_state
  set hidden_at = null,
      updated_at = clock_timestamp()
  where conversation_id = new.conversation_id
    and user_id <> new.sender_id
    and hidden_at is not null;
  return new;
end;
$$;

drop trigger if exists fieldmesh_message_unhides_conversation on public.messages;
create trigger fieldmesh_message_unhides_conversation
after insert on public.messages
for each row execute function public.fieldmesh_unhide_conversation_on_incoming_message();

create or replace function public.fieldmesh_cleanup_conversation_user_state_on_leave()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.conversation_user_state
  where conversation_id = old.conversation_id
    and user_id = old.user_id;
  return old;
end;
$$;

drop trigger if exists fieldmesh_cleanup_conversation_user_state on public.conversation_members;
create trigger fieldmesh_cleanup_conversation_user_state
after delete on public.conversation_members
for each row execute function public.fieldmesh_cleanup_conversation_user_state_on_leave();

-- Postgres Changes is only a wake-up signal for signed-in clients. Row access is
-- still constrained by the existing message RLS policies.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'messages'
     ) then
    execute 'alter publication supabase_realtime add table public.messages';
  end if;
end $$;

revoke execute on function public.fieldmesh_assert_conversation_member(uuid) from public;
revoke execute on function public.fieldmesh_clear_conversation_for_me(uuid) from public;
revoke execute on function public.fieldmesh_delete_conversation_for_me(uuid) from public;
revoke execute on function public.fieldmesh_restore_conversation_for_me(uuid) from public;
revoke execute on function public.fieldmesh_set_conversation_muted(uuid, boolean) from public;

grant execute on function public.fieldmesh_clear_conversation_for_me(uuid) to authenticated;
grant execute on function public.fieldmesh_delete_conversation_for_me(uuid) to authenticated;
grant execute on function public.fieldmesh_restore_conversation_for_me(uuid) to authenticated;
grant execute on function public.fieldmesh_set_conversation_muted(uuid, boolean) to authenticated;

commit;
