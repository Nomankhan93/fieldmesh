begin;

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'fieldmesh_device_status') then
    create type public.fieldmesh_device_status as enum ('active', 'revoked');
  end if;
  if not exists (select 1 from pg_type where typname = 'fieldmesh_conversation_kind') then
    create type public.fieldmesh_conversation_kind as enum ('direct', 'group');
  end if;
  if not exists (select 1 from pg_type where typname = 'fieldmesh_conversation_role') then
    create type public.fieldmesh_conversation_role as enum ('owner', 'member');
  end if;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  fieldmesh_user_id uuid not null default gen_random_uuid() unique,
  display_name text not null check (char_length(trim(display_name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  fieldmesh_device_id uuid not null default gen_random_uuid() unique,
  label text not null check (char_length(trim(label)) between 1 and 80),
  hardware_model text,
  radio_node_id text,
  status public.fieldmesh_device_status not null default 'active',
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint devices_revocation_consistency check (
    (status = 'active' and revoked_at is null)
    or (status = 'revoked' and revoked_at is not null)
  )
);

create unique index if not exists devices_radio_node_id_unique
  on public.devices (radio_node_id)
  where radio_node_id is not null;
create index if not exists devices_owner_id_idx on public.devices(owner_id);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind public.fieldmesh_conversation_kind not null,
  title text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversation_title_length check (title is null or char_length(trim(title)) between 1 and 120)
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.fieldmesh_conversation_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists conversation_members_user_id_idx
  on public.conversation_members(user_id, conversation_id);

create or replace function public.fieldmesh_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.fieldmesh_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display_name text;
begin
  v_display_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
  if v_display_name is null then
    v_display_name := nullif(split_part(coalesce(new.email, ''), '@', 1), '');
  end if;
  if v_display_name is null then
    v_display_name := 'FieldMesh user';
  end if;

  insert into public.profiles (id, display_name)
  values (new.id, left(v_display_name, 80))
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace function public.fieldmesh_is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id = (select auth.uid())
  );
$$;

create or replace function public.fieldmesh_is_conversation_creator(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and c.created_by = (select auth.uid())
  );
$$;

create or replace function public.fieldmesh_handle_new_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.conversation_members (conversation_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (conversation_id, user_id) do update set role = 'owner';
  return new;
end;
$$;

drop trigger if exists fieldmesh_profiles_updated_at on public.profiles;
create trigger fieldmesh_profiles_updated_at
before update on public.profiles
for each row execute function public.fieldmesh_set_updated_at();

drop trigger if exists fieldmesh_devices_updated_at on public.devices;
create trigger fieldmesh_devices_updated_at
before update on public.devices
for each row execute function public.fieldmesh_set_updated_at();

drop trigger if exists fieldmesh_conversations_updated_at on public.conversations;
create trigger fieldmesh_conversations_updated_at
before update on public.conversations
for each row execute function public.fieldmesh_set_updated_at();

drop trigger if exists on_auth_user_created_fieldmesh on auth.users;
create trigger on_auth_user_created_fieldmesh
after insert on auth.users
for each row execute function public.fieldmesh_handle_new_user();

drop trigger if exists fieldmesh_conversation_created on public.conversations;
create trigger fieldmesh_conversation_created
after insert on public.conversations
for each row execute function public.fieldmesh_handle_new_conversation();

insert into public.profiles (id, display_name)
select
  u.id,
  left(
    coalesce(
      nullif(trim(coalesce(u.raw_user_meta_data ->> 'display_name', '')), ''),
      nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
      'FieldMesh user'
    ),
    80
  )
from auth.users u
on conflict (id) do nothing;

alter table public.profiles enable row level security;
alter table public.devices enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "devices_select_own" on public.devices;
create policy "devices_select_own"
on public.devices for select
to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "devices_insert_own" on public.devices;
create policy "devices_insert_own"
on public.devices for insert
to authenticated
with check ((select auth.uid()) = owner_id);

drop policy if exists "devices_update_own" on public.devices;
create policy "devices_update_own"
on public.devices for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists "devices_delete_own" on public.devices;
create policy "devices_delete_own"
on public.devices for delete
to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "conversations_select_members" on public.conversations;
create policy "conversations_select_members"
on public.conversations for select
to authenticated
using (public.fieldmesh_is_conversation_member(id));

drop policy if exists "conversations_insert_creator" on public.conversations;
create policy "conversations_insert_creator"
on public.conversations for insert
to authenticated
with check ((select auth.uid()) = created_by);

drop policy if exists "conversations_update_creator" on public.conversations;
create policy "conversations_update_creator"
on public.conversations for update
to authenticated
using ((select auth.uid()) = created_by)
with check ((select auth.uid()) = created_by);

drop policy if exists "conversations_delete_creator" on public.conversations;
create policy "conversations_delete_creator"
on public.conversations for delete
to authenticated
using ((select auth.uid()) = created_by);

drop policy if exists "conversation_members_select_members" on public.conversation_members;
create policy "conversation_members_select_members"
on public.conversation_members for select
to authenticated
using (public.fieldmesh_is_conversation_member(conversation_id));

drop policy if exists "conversation_members_insert_creator" on public.conversation_members;
create policy "conversation_members_insert_creator"
on public.conversation_members for insert
to authenticated
with check (public.fieldmesh_is_conversation_creator(conversation_id));

drop policy if exists "conversation_members_update_creator" on public.conversation_members;
create policy "conversation_members_update_creator"
on public.conversation_members for update
to authenticated
using (public.fieldmesh_is_conversation_creator(conversation_id))
with check (public.fieldmesh_is_conversation_creator(conversation_id));

drop policy if exists "conversation_members_delete_creator_or_self" on public.conversation_members;
create policy "conversation_members_delete_creator_or_self"
on public.conversation_members for delete
to authenticated
using (
  public.fieldmesh_is_conversation_creator(conversation_id)
  or ((select auth.uid()) = user_id and role = 'member')
);

revoke all on public.profiles, public.devices, public.conversations, public.conversation_members from anon;
grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.devices to authenticated;
grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, update, delete on public.conversation_members to authenticated;

revoke execute on function public.fieldmesh_is_conversation_member(uuid) from public;
revoke execute on function public.fieldmesh_is_conversation_creator(uuid) from public;
grant execute on function public.fieldmesh_is_conversation_member(uuid) to authenticated;
grant execute on function public.fieldmesh_is_conversation_creator(uuid) to authenticated;

commit;
