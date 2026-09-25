begin;

-- 0.7: groups + permission boundaries + crypto metadata/key-discovery foundation.
-- Private key material and conversation symmetric keys are NEVER stored here.

alter table public.conversation_members
  add column if not exists is_admin boolean not null default false;

update public.conversation_members
set is_admin = true
where role = 'owner' and is_admin = false;

create or replace function public.fieldmesh_handle_new_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.conversation_members (conversation_id, user_id, role, is_admin)
  values (new.id, new.created_by, 'owner', true)
  on conflict (conversation_id, user_id)
  do update set role = 'owner', is_admin = true;
  return new;
end;
$$;

create or replace function public.fieldmesh_resolve_contact_user_id(p_contact text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_input text := trim(coalesce(p_contact, ''));
  v_normalized text;
  v_matches uuid[];
  v_user_id uuid;
begin
  if v_input = '' then
    raise exception 'contact code is required' using errcode = '22023';
  end if;

  if v_input ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    select p.id into v_user_id
    from public.profiles p
    where p.fieldmesh_user_id = v_input::uuid;
  else
    v_normalized := upper(v_input);
    if v_normalized ~ '^FM[0-9A-F]{12}$' then
      v_normalized := 'FM-' || substr(v_normalized, 3);
    end if;

    if v_normalized !~ '^FM-[0-9A-F]{12}$' then
      raise exception 'invalid FieldMesh contact code' using errcode = '22023';
    end if;

    select array_agg(p.id order by p.id::text)
    into v_matches
    from public.profiles p
    where upper('FM-' || right(replace(p.fieldmesh_user_id::text, '-', ''), 12)) = v_normalized;

    if coalesce(cardinality(v_matches), 0) = 0 then
      raise exception 'recipient not found' using errcode = 'P0002';
    end if;
    if cardinality(v_matches) > 1 then
      raise exception 'contact code is ambiguous; use the technical FieldMesh ID' using errcode = 'P0003';
    end if;

    v_user_id := v_matches[1];
  end if;

  if v_user_id is null then
    raise exception 'recipient not found' using errcode = 'P0002';
  end if;

  return v_user_id;
end;
$$;

-- Keep the 0.6.2 direct-chat discovery API, but share the resolver with groups.
create or replace function public.fieldmesh_create_direct_conversation_by_contact(p_contact text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := (select auth.uid());
  v_recipient_user_id uuid;
  v_recipient_fieldmesh_user_id uuid;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  v_recipient_user_id := public.fieldmesh_resolve_contact_user_id(p_contact);

  select p.fieldmesh_user_id into v_recipient_fieldmesh_user_id
  from public.profiles p
  where p.id = v_recipient_user_id;

  return public.fieldmesh_create_direct_conversation(v_recipient_fieldmesh_user_id);
end;
$$;

create or replace function public.fieldmesh_is_group_owner(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversations c
    join public.conversation_members cm on cm.conversation_id = c.id
    where c.id = p_conversation_id
      and c.kind = 'group'
      and cm.user_id = (select auth.uid())
      and cm.role = 'owner'
  );
$$;

create or replace function public.fieldmesh_is_group_admin(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversations c
    join public.conversation_members cm on cm.conversation_id = c.id
    where c.id = p_conversation_id
      and c.kind = 'group'
      and cm.user_id = (select auth.uid())
      and (cm.role = 'owner' or cm.is_admin)
  );
$$;

create or replace function public.fieldmesh_enforce_group_member_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind public.fieldmesh_conversation_kind;
  v_count integer;
begin
  select c.kind into v_kind
  from public.conversations c
  where c.id = new.conversation_id;

  if v_kind = 'group' then
    select count(*) into v_count
    from public.conversation_members cm
    where cm.conversation_id = new.conversation_id
      and cm.user_id <> new.user_id;

    if v_count >= 100 then
      raise exception 'groups may contain at most 100 members' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists fieldmesh_group_member_limit on public.conversation_members;
create trigger fieldmesh_group_member_limit
before insert on public.conversation_members
for each row execute function public.fieldmesh_enforce_group_member_limit();

create table if not exists public.conversation_crypto_epochs (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  epoch integer not null check (epoch > 0),
  suite text not null default 'AES-GCM-256' check (suite in ('AES-GCM-256')),
  created_by uuid not null references auth.users(id) on delete cascade,
  reason text not null default 'initial' check (char_length(reason) between 1 and 120),
  created_at timestamptz not null default now(),
  primary key (conversation_id, epoch)
);

create index if not exists conversation_crypto_epochs_created_idx
  on public.conversation_crypto_epochs(conversation_id, created_at desc);

create table if not exists public.device_public_keys (
  device_id uuid primary key references public.devices(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  algorithm text not null check (algorithm in ('ECDH-P256')),
  public_key text not null check (char_length(public_key) between 32 and 4096),
  fingerprint text not null check (char_length(fingerprint) between 16 and 128),
  key_version integer not null default 1 check (key_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists device_public_keys_owner_idx
  on public.device_public_keys(owner_id, device_id);

create or replace function public.fieldmesh_set_device_public_key_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists fieldmesh_device_public_keys_updated_at on public.device_public_keys;
create trigger fieldmesh_device_public_keys_updated_at
before update on public.device_public_keys
for each row execute function public.fieldmesh_set_device_public_key_updated_at();

create or replace function public.fieldmesh_advance_crypto_epoch(
  p_conversation_id uuid,
  p_actor uuid,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
  v_reason text := left(trim(coalesce(p_reason, 'membership changed')), 120);
begin
  perform pg_advisory_xact_lock(hashtextextended('fieldmesh-crypto:' || p_conversation_id::text, 0));
  select coalesce(max(e.epoch), 0) + 1 into v_next
  from public.conversation_crypto_epochs e
  where e.conversation_id = p_conversation_id;

  insert into public.conversation_crypto_epochs (conversation_id, epoch, created_by, reason)
  values (p_conversation_id, v_next, p_actor, coalesce(nullif(v_reason, ''), 'membership changed'));
  return v_next;
end;
$$;

create or replace function public.fieldmesh_create_group(
  p_title text,
  p_member_contacts text[] default array[]::text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := (select auth.uid());
  v_title text := trim(coalesce(p_title, ''));
  v_conversation uuid := gen_random_uuid();
  v_contact text;
  v_member uuid;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if char_length(v_title) < 1 or char_length(v_title) > 120 then
    raise exception 'group title must be between 1 and 120 characters' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_member_contacts), 0) > 99 then
    raise exception 'groups may contain at most 100 members including the owner' using errcode = '23514';
  end if;

  insert into public.conversations (id, kind, title, created_by)
  values (v_conversation, 'group', v_title, v_caller);

  foreach v_contact in array coalesce(p_member_contacts, array[]::text[]) loop
    if trim(coalesce(v_contact, '')) = '' then
      continue;
    end if;
    v_member := public.fieldmesh_resolve_contact_user_id(v_contact);
    if v_member <> v_caller then
      insert into public.conversation_members (conversation_id, user_id, role, is_admin)
      values (v_conversation, v_member, 'member', false)
      on conflict (conversation_id, user_id) do nothing;
    end if;
  end loop;

  perform public.fieldmesh_advance_crypto_epoch(v_conversation, v_caller, 'initial group epoch');

  return v_conversation;
end;
$$;

create or replace function public.fieldmesh_group_add_member(
  p_conversation_id uuid,
  p_contact text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member uuid;
begin
  if not public.fieldmesh_is_group_admin(p_conversation_id) then
    raise exception 'group admin permission required' using errcode = '42501';
  end if;

  v_member := public.fieldmesh_resolve_contact_user_id(p_contact);
  insert into public.conversation_members (conversation_id, user_id, role, is_admin)
  values (p_conversation_id, v_member, 'member', false)
  on conflict (conversation_id, user_id) do nothing;
  if found then
    perform public.fieldmesh_advance_crypto_epoch(p_conversation_id, (select auth.uid()), 'member added');
  end if;
  return v_member;
end;
$$;

create or replace function public.fieldmesh_group_remove_member(
  p_conversation_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := (select auth.uid());
  v_caller_owner boolean;
  v_target_role public.fieldmesh_conversation_role;
  v_target_admin boolean;
begin
  if not public.fieldmesh_is_group_admin(p_conversation_id) then
    raise exception 'group admin permission required' using errcode = '42501';
  end if;

  v_caller_owner := public.fieldmesh_is_group_owner(p_conversation_id);

  select cm.role, cm.is_admin
  into v_target_role, v_target_admin
  from public.conversation_members cm
  where cm.conversation_id = p_conversation_id
    and cm.user_id = p_user_id;

  if v_target_role is null then
    raise exception 'group member not found' using errcode = 'P0002';
  end if;
  if v_target_role = 'owner' then
    raise exception 'group owner cannot be removed' using errcode = '42501';
  end if;
  if not v_caller_owner and v_target_admin then
    raise exception 'only the owner can remove another admin' using errcode = '42501';
  end if;
  if p_user_id = v_caller then
    raise exception 'use leave group to remove yourself' using errcode = '22023';
  end if;

  delete from public.conversation_members
  where conversation_id = p_conversation_id and user_id = p_user_id;
  if found then
    perform public.fieldmesh_advance_crypto_epoch(p_conversation_id, v_caller, 'member removed');
  end if;
end;
$$;

create or replace function public.fieldmesh_group_set_admin(
  p_conversation_id uuid,
  p_user_id uuid,
  p_is_admin boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_role public.fieldmesh_conversation_role;
begin
  if not public.fieldmesh_is_group_owner(p_conversation_id) then
    raise exception 'group owner permission required' using errcode = '42501';
  end if;

  select cm.role into v_target_role
  from public.conversation_members cm
  where cm.conversation_id = p_conversation_id
    and cm.user_id = p_user_id;

  if v_target_role is null then
    raise exception 'group member not found' using errcode = 'P0002';
  end if;
  if v_target_role = 'owner' then
    raise exception 'owner role cannot be changed' using errcode = '22023';
  end if;

  update public.conversation_members
  set is_admin = p_is_admin
  where conversation_id = p_conversation_id
    and user_id = p_user_id
    and is_admin is distinct from p_is_admin;
  if found then
    perform public.fieldmesh_advance_crypto_epoch(p_conversation_id, (select auth.uid()), case when p_is_admin then 'admin promoted' else 'admin demoted' end);
  end if;
end;
$$;

create or replace function public.fieldmesh_group_rename(
  p_conversation_id uuid,
  p_title text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text := trim(coalesce(p_title, ''));
begin
  if not public.fieldmesh_is_group_admin(p_conversation_id) then
    raise exception 'group admin permission required' using errcode = '42501';
  end if;
  if char_length(v_title) < 1 or char_length(v_title) > 120 then
    raise exception 'group title must be between 1 and 120 characters' using errcode = '22023';
  end if;

  update public.conversations
  set title = v_title
  where id = p_conversation_id and kind = 'group';

  if not found then
    raise exception 'group not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.fieldmesh_leave_group(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := (select auth.uid());
  v_role public.fieldmesh_conversation_role;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select cm.role into v_role
  from public.conversation_members cm
  join public.conversations c on c.id = cm.conversation_id
  where cm.conversation_id = p_conversation_id
    and cm.user_id = v_caller
    and c.kind = 'group';

  if v_role is null then
    raise exception 'group membership not found' using errcode = 'P0002';
  end if;
  if v_role = 'owner' then
    raise exception 'group owner must transfer ownership before leaving' using errcode = '42501';
  end if;

  delete from public.conversation_members
  where conversation_id = p_conversation_id and user_id = v_caller;
  if found then
    perform public.fieldmesh_advance_crypto_epoch(p_conversation_id, v_caller, 'member left');
  end if;
end;
$$;

create or replace function public.fieldmesh_conversation_participants_v2(p_conversation_id uuid)
returns table (
  user_id uuid,
  fieldmesh_user_id uuid,
  display_name text,
  role text,
  joined_at timestamptz
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
  select
    p.id,
    p.fieldmesh_user_id,
    p.display_name,
    case when cm.role = 'owner' then 'owner' when cm.is_admin then 'admin' else 'member' end::text,
    cm.joined_at
  from public.conversation_members cm
  join public.profiles p on p.id = cm.user_id
  where cm.conversation_id = p_conversation_id
  order by case when cm.role = 'owner' then 0 when cm.is_admin then 1 else 2 end, cm.joined_at, p.id;
end;
$$;

create or replace function public.fieldmesh_register_device_public_key(
  p_device_id uuid,
  p_algorithm text,
  p_public_key text,
  p_fingerprint text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := (select auth.uid());
  v_version integer;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_algorithm <> 'ECDH-P256' then
    raise exception 'unsupported device key algorithm' using errcode = '22023';
  end if;
  if char_length(p_public_key) < 32 or char_length(p_public_key) > 4096 then
    raise exception 'invalid public key length' using errcode = '22023';
  end if;
  if char_length(p_fingerprint) < 16 or char_length(p_fingerprint) > 128 then
    raise exception 'invalid key fingerprint length' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.devices d
    where d.id = p_device_id and d.owner_id = v_caller and d.status = 'active'
  ) then
    raise exception 'active owned device not found' using errcode = '42501';
  end if;

  insert into public.device_public_keys (
    device_id, owner_id, algorithm, public_key, fingerprint, key_version
  ) values (
    p_device_id, v_caller, p_algorithm, p_public_key, p_fingerprint, 1
  )
  on conflict (device_id) do update
  set algorithm = excluded.algorithm,
      public_key = excluded.public_key,
      fingerprint = excluded.fingerprint,
      key_version = public.device_public_keys.key_version + 1
  returning key_version into v_version;

  return v_version;
end;
$$;

create or replace function public.fieldmesh_conversation_device_keys(p_conversation_id uuid)
returns table (
  user_id uuid,
  fieldmesh_user_id uuid,
  device_id uuid,
  fieldmesh_device_id uuid,
  label text,
  algorithm text,
  public_key text,
  fingerprint text,
  key_version integer
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
  select
    cm.user_id,
    p.fieldmesh_user_id,
    d.id,
    d.fieldmesh_device_id,
    d.label,
    k.algorithm,
    k.public_key,
    k.fingerprint,
    k.key_version
  from public.conversation_members cm
  join public.profiles p on p.id = cm.user_id
  join public.devices d on d.owner_id = cm.user_id and d.status = 'active'
  join public.device_public_keys k on k.device_id = d.id
  where cm.conversation_id = p_conversation_id
  order by cm.joined_at, d.created_at, d.id;
end;
$$;

create or replace function public.fieldmesh_rotate_conversation_crypto_epoch(
  p_conversation_id uuid,
  p_reason text default 'manual rotation'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := (select auth.uid());
  v_kind public.fieldmesh_conversation_kind;
  v_next integer;
  v_reason text := left(trim(coalesce(p_reason, 'manual rotation')), 120);
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not public.fieldmesh_is_conversation_member(p_conversation_id) then
    raise exception 'conversation access denied' using errcode = '42501';
  end if;

  select c.kind into v_kind from public.conversations c where c.id = p_conversation_id;
  if v_kind = 'group' and not public.fieldmesh_is_group_admin(p_conversation_id) then
    raise exception 'group admin permission required for key rotation' using errcode = '42501';
  end if;

  v_next := public.fieldmesh_advance_crypto_epoch(
    p_conversation_id,
    v_caller,
    coalesce(nullif(v_reason, ''), 'manual rotation')
  );
  return v_next;
end;
$$;

create or replace function public.fieldmesh_current_conversation_crypto_epoch(p_conversation_id uuid)
returns table (
  epoch integer,
  suite text,
  created_by uuid,
  reason text,
  created_at timestamptz
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
  select e.epoch, e.suite, e.created_by, e.reason, e.created_at
  from public.conversation_crypto_epochs e
  where e.conversation_id = p_conversation_id
  order by e.epoch desc
  limit 1;
end;
$$;

alter table public.device_public_keys enable row level security;
alter table public.conversation_crypto_epochs enable row level security;

drop policy if exists "device_public_keys_select_own" on public.device_public_keys;
create policy "device_public_keys_select_own"
on public.device_public_keys for select
to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists "conversation_crypto_epochs_select_members" on public.conversation_crypto_epochs;
create policy "conversation_crypto_epochs_select_members"
on public.conversation_crypto_epochs for select
to authenticated
using (public.fieldmesh_is_conversation_member(conversation_id));

revoke all on public.device_public_keys, public.conversation_crypto_epochs from anon;
revoke all on public.device_public_keys, public.conversation_crypto_epochs from authenticated;
grant select on public.device_public_keys, public.conversation_crypto_epochs to authenticated;

revoke execute on function public.fieldmesh_resolve_contact_user_id(text) from public;
revoke execute on function public.fieldmesh_is_group_owner(uuid) from public;
revoke execute on function public.fieldmesh_is_group_admin(uuid) from public;
revoke execute on function public.fieldmesh_advance_crypto_epoch(uuid, uuid, text) from public;
revoke execute on function public.fieldmesh_create_group(text, text[]) from public;
revoke execute on function public.fieldmesh_group_add_member(uuid, text) from public;
revoke execute on function public.fieldmesh_group_remove_member(uuid, uuid) from public;
revoke execute on function public.fieldmesh_group_set_admin(uuid, uuid, boolean) from public;
revoke execute on function public.fieldmesh_group_rename(uuid, text) from public;
revoke execute on function public.fieldmesh_leave_group(uuid) from public;
revoke execute on function public.fieldmesh_conversation_participants_v2(uuid) from public;
revoke execute on function public.fieldmesh_register_device_public_key(uuid, text, text, text) from public;
revoke execute on function public.fieldmesh_conversation_device_keys(uuid) from public;
revoke execute on function public.fieldmesh_rotate_conversation_crypto_epoch(uuid, text) from public;
revoke execute on function public.fieldmesh_current_conversation_crypto_epoch(uuid) from public;

-- Internal resolver intentionally has no authenticated grant.
grant execute on function public.fieldmesh_is_group_owner(uuid) to authenticated;
grant execute on function public.fieldmesh_is_group_admin(uuid) to authenticated;
grant execute on function public.fieldmesh_create_group(text, text[]) to authenticated;
grant execute on function public.fieldmesh_group_add_member(uuid, text) to authenticated;
grant execute on function public.fieldmesh_group_remove_member(uuid, uuid) to authenticated;
grant execute on function public.fieldmesh_group_set_admin(uuid, uuid, boolean) to authenticated;
grant execute on function public.fieldmesh_group_rename(uuid, text) to authenticated;
grant execute on function public.fieldmesh_leave_group(uuid) to authenticated;
grant execute on function public.fieldmesh_conversation_participants_v2(uuid) to authenticated;
grant execute on function public.fieldmesh_register_device_public_key(uuid, text, text, text) to authenticated;
grant execute on function public.fieldmesh_conversation_device_keys(uuid) to authenticated;
grant execute on function public.fieldmesh_rotate_conversation_crypto_epoch(uuid, text) to authenticated;
grant execute on function public.fieldmesh_current_conversation_crypto_epoch(uuid) to authenticated;

-- Keep direct contact discovery callable after replacement.
revoke execute on function public.fieldmesh_create_direct_conversation_by_contact(text) from public;
grant execute on function public.fieldmesh_create_direct_conversation_by_contact(text) to authenticated;

commit;
