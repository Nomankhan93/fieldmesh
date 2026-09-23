begin;

drop policy if exists "conversations_select_members"
on public.conversations;

create policy "conversations_select_members"
on public.conversations
for select
to authenticated
using (
  created_by = (select auth.uid())
  or public.fieldmesh_is_conversation_member(id)
);

commit;
