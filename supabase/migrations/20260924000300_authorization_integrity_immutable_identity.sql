begin;

-- FieldMesh 0.7.1: close raw-table mutation paths and make canonical
-- user/device/conversation identities immutable. Normal authenticated clients
-- may read rows allowed by RLS, but structural changes must use narrow RPCs.

create or replace function public.fieldmesh_guard_profile_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id is distinct from old.id
     or new.fieldmesh_user_id is distinct from old.fieldmesh_user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'profile identity fields are immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists fieldmesh_profile_identity_immutable on public.profiles;
create trigger fieldmesh_profile_identity_immutable
before update on public.profiles
for each row execute function public.fieldmesh_guard_profile_identity();

create or replace function public.fieldmesh_guard_device_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id is distinct from old.id
     or new.owner_id is distinct from old.owner_id
     or new.fieldmesh_device_id is distinct from old.fieldmesh_device_id
     or new.created_at is distinct from old.created_at then
    raise exception 'device identity fields are immutable' using errcode = '42501';
  end if;

  if old.status = 'revoked' and (
    new.status is distinct from old.status
    or new.revoked_at is distinct from old.revoked_at
  ) then
    raise exception 'revoked device state is terminal' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists fieldmesh_device_identity_immutable on public.devices;
create trigger fieldmesh_device_identity_immutable
before update on public.devices
for each row execute function public.fieldmesh_guard_device_identity();

create or replace function public.fieldmesh_guard_conversation_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id is distinct from old.id
     or new.kind is distinct from old.kind
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'conversation identity fields are immutable' using errcode = '42501';
  end if;

  if old.kind = 'direct' and new.title is distinct from old.title then
    raise exception 'direct conversation metadata is immutable' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists fieldmesh_conversation_identity_immutable on public.conversations;
create trigger fieldmesh_conversation_identity_immutable
before update on public.conversations
for each row execute function public.fieldmesh_guard_conversation_identity();

create or replace function public.fieldmesh_guard_conversation_member_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.conversation_id is distinct from old.conversation_id
     or new.user_id is distinct from old.user_id
     or new.role is distinct from old.role
     or new.joined_at is distinct from old.joined_at then
    raise exception 'conversation membership identity fields are immutable' using errcode = '42501';
  end if;

  if new.role = 'owner' and not new.is_admin then
    raise exception 'conversation owner must remain an admin' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists fieldmesh_conversation_member_identity_immutable on public.conversation_members;
create trigger fieldmesh_conversation_member_identity_immutable
before update on public.conversation_members
for each row execute function public.fieldmesh_guard_conversation_member_identity();

-- Display-name mutation is deliberately narrow: the canonical FieldMesh UUID,
-- auth user ID and profile creation timestamp are never client-editable.
create or replace function public.fieldmesh_update_display_name(p_display_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := (select auth.uid());
  v_display_name text := trim(coalesce(p_display_name, ''));
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if char_length(v_display_name) < 1 or char_length(v_display_name) > 80 then
    raise exception 'display name must be between 1 and 80 characters' using errcode = '22023';
  end if;

  update public.profiles
  set display_name = v_display_name
  where id = v_caller;

  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Device creation and revocation are RPC-only so owner_id and the canonical
-- FieldMesh device UUID cannot be replaced by a custom client.
create or replace function public.fieldmesh_create_device(p_label text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := (select auth.uid());
  v_label text := trim(coalesce(p_label, ''));
  v_device_id uuid;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if char_length(v_label) < 1 or char_length(v_label) > 80 then
    raise exception 'device label must be between 1 and 80 characters' using errcode = '22023';
  end if;

  insert into public.devices (owner_id, label)
  values (v_caller, v_label)
  returning id into v_device_id;

  return v_device_id;
end;
$$;

create or replace function public.fieldmesh_revoke_device(p_device_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := (select auth.uid());
  v_status public.fieldmesh_device_status;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select d.status into v_status
  from public.devices d
  where d.id = p_device_id
    and d.owner_id = v_caller;

  if v_status is null then
    raise exception 'owned device not found' using errcode = 'P0002';
  end if;

  if v_status = 'revoked' then
    return false;
  end if;

  update public.devices
  set status = 'revoked', revoked_at = now()
  where id = p_device_id
    and owner_id = v_caller
    and status = 'active';

  return found;
end;
$$;

-- Retire legacy mutation policies. SELECT policies remain in place, but table
-- privileges below are the first authorization boundary for raw clients.
drop policy if exists "profiles_update_own" on public.profiles;

drop policy if exists "devices_insert_own" on public.devices;
drop policy if exists "devices_update_own" on public.devices;
drop policy if exists "devices_delete_own" on public.devices;

drop policy if exists "conversations_insert_creator" on public.conversations;
drop policy if exists "conversations_update_creator" on public.conversations;
drop policy if exists "conversations_delete_creator" on public.conversations;

drop policy if exists "conversation_members_insert_creator" on public.conversation_members;
drop policy if exists "conversation_members_update_creator" on public.conversation_members;
drop policy if exists "conversation_members_delete_creator_or_self" on public.conversation_members;

-- Read access is still scoped by RLS. All client-side structural writes are
-- revoked and must go through the approved SECURITY DEFINER functions.
revoke insert, update, delete on public.profiles from authenticated;
revoke insert, update, delete on public.devices from authenticated;
revoke insert, update, delete on public.conversations from authenticated;
revoke insert, update, delete on public.conversation_members from authenticated;

grant select on public.profiles to authenticated;
grant select on public.devices to authenticated;
grant select on public.conversations to authenticated;
grant select on public.conversation_members to authenticated;

-- The legacy creator helper only existed to support raw mutation policies.
revoke execute on function public.fieldmesh_is_conversation_creator(uuid) from authenticated;

revoke execute on function public.fieldmesh_update_display_name(text) from public;
revoke execute on function public.fieldmesh_create_device(text) from public;
revoke execute on function public.fieldmesh_revoke_device(uuid) from public;
grant execute on function public.fieldmesh_update_display_name(text) to authenticated;
grant execute on function public.fieldmesh_create_device(text) to authenticated;
grant execute on function public.fieldmesh_revoke_device(uuid) to authenticated;

commit;
