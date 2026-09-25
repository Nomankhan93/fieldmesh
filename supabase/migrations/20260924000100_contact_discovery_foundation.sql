begin;

-- Resolve a human-facing FM-XXXXXXXXXXXX contact code without granting callers
-- direct SELECT access to other users' profile rows. The short code is a
-- discovery handle only; the stable FieldMesh UUID remains the canonical ID.
create or replace function public.fieldmesh_create_direct_conversation_by_contact(
  p_contact text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := (select auth.uid());
  v_input text := trim(coalesce(p_contact, ''));
  v_normalized text;
  v_matches uuid[];
  v_recipient_fieldmesh_user_id uuid;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if v_input = '' then
    raise exception 'contact code is required' using errcode = '22023';
  end if;

  if v_input ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_recipient_fieldmesh_user_id := v_input::uuid;
  else
    v_normalized := upper(v_input);
    if v_normalized ~ '^FM[0-9A-F]{12}$' then
      v_normalized := 'FM-' || substr(v_normalized, 3);
    end if;

    if v_normalized !~ '^FM-[0-9A-F]{12}$' then
      raise exception 'invalid FieldMesh contact code' using errcode = '22023';
    end if;

    select array_agg(p.fieldmesh_user_id order by p.fieldmesh_user_id::text)
    into v_matches
    from public.profiles p
    where upper('FM-' || right(replace(p.fieldmesh_user_id::text, '-', ''), 12)) = v_normalized;

    if coalesce(cardinality(v_matches), 0) = 0 then
      raise exception 'recipient not found' using errcode = 'P0002';
    end if;
    if cardinality(v_matches) > 1 then
      raise exception 'contact code is ambiguous; use the technical FieldMesh ID' using errcode = 'P0003';
    end if;

    v_recipient_fieldmesh_user_id := v_matches[1];
  end if;

  return public.fieldmesh_create_direct_conversation(v_recipient_fieldmesh_user_id);
end;
$$;

revoke execute on function public.fieldmesh_create_direct_conversation_by_contact(text) from public;
grant execute on function public.fieldmesh_create_direct_conversation_by_contact(text) to authenticated;

commit;
