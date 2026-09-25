import { useMemo, useState, type FormEvent } from 'react'
import {
  canChangeGroupAdmins,
  canLeaveGroup,
  canManageGroupMembers,
  canRemoveGroupMember,
  canRenameGroup,
  type GroupRole,
} from '../../core/groups/permissions'
import type {
  ConversationParticipant,
  InternetConversation,
  InternetMessagingService,
} from './InternetMessagingService'

export function GroupManagementPanel({
  conversation,
  participants,
  localUserId,
  service,
  onChanged,
  onLeft,
  setNotice,
}: {
  conversation: InternetConversation
  participants: ConversationParticipant[]
  localUserId: string
  service: InternetMessagingService
  onChanged: () => Promise<void>
  onLeft: () => void
  setNotice: (value: string) => void
}) {
  const me = participants.find((participant) => participant.user_id === localUserId)
  const role = (me?.role ?? 'member') as GroupRole
  const [memberContact, setMemberContact] = useState('')
  const [title, setTitle] = useState(conversation.title ?? '')
  const [busy, setBusy] = useState(false)
  const canManage = canManageGroupMembers(role)
  const sortedParticipants = useMemo(
    () => [...participants].sort((a, b) => roleRank(a.role) - roleRank(b.role) || a.display_name.localeCompare(b.display_name)),
    [participants],
  )

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true)
    try {
      await action()
      await onChanged()
      setNotice(success)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to update the group.')
    } finally {
      setBusy(false)
    }
  }

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const contact = memberContact.trim()
    if (!contact) return
    await run(async () => {
      await service.addGroupMember(conversation.id, contact)
      setMemberContact('')
    }, 'Group member added.')
  }

  return (
    <section className="border-b border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Group</p>
          <h3 className="mt-1 font-bold">Members & permissions</h3>
          <p className="mt-1 text-xs text-slate-500">Owner controls admins. Admins can manage ordinary members. Everyone in the group can chat.</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold capitalize text-slate-700">{role}</span>
      </div>

      {canRenameGroup(role) ? (
        <div className="mt-4 flex gap-2">
          <input value={title} onChange={(event) => setTitle(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" aria-label="Group name" />
          <button type="button" disabled={busy || !title.trim() || title.trim() === conversation.title} onClick={() => void run(() => service.renameGroup(conversation.id, title), 'Group name updated.')} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">Rename</button>
        </div>
      ) : null}

      {canManage ? (
        <form onSubmit={addMember} className="mt-3 flex gap-2">
          <input value={memberContact} onChange={(event) => setMemberContact(event.target.value)} placeholder="FM-12AB34CD56EF" className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm uppercase placeholder:normal-case" />
          <button disabled={busy || !memberContact.trim()} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-40">Add member</button>
        </form>
      ) : null}

      <div className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {sortedParticipants.map((participant) => {
          const participantRole = participant.role as GroupRole
          const isMe = participant.user_id === localUserId
          return (
            <div key={participant.user_id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{participant.display_name}{isMe ? ' (you)' : ''}</p>
                <p className="mt-0.5 text-xs capitalize text-slate-500">{participantRole}</p>
              </div>
              {!isMe ? (
                <div className="flex flex-wrap gap-2">
                  {canChangeGroupAdmins(role) && participantRole !== 'owner' ? (
                    <button type="button" disabled={busy} onClick={() => void run(() => service.setGroupAdmin(conversation.id, participant.user_id, participantRole !== 'admin'), participantRole === 'admin' ? 'Admin permission removed.' : 'Admin permission granted.')} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-700">
                      {participantRole === 'admin' ? 'Make member' : 'Make admin'}
                    </button>
                  ) : null}
                  {canRemoveGroupMember(role, participantRole) ? (
                    <button type="button" disabled={busy} onClick={() => void run(() => service.removeGroupMember(conversation.id, participant.user_id), 'Group member removed.')} className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-bold text-rose-700">Remove</button>
                  ) : null}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      {canLeaveGroup(role) ? (
        <button type="button" disabled={busy} onClick={() => void run(async () => { await service.leaveGroup(conversation.id); onLeft() }, 'You left the group.')} className="mt-4 text-xs font-bold text-rose-700 underline decoration-rose-200 underline-offset-4">Leave group</button>
      ) : (
        <p className="mt-4 text-xs text-slate-500">The owner cannot leave until ownership transfer is implemented in a later patch.</p>
      )}
    </section>
  )
}

function roleRank(role: ConversationParticipant['role']): number {
  if (role === 'owner') return 0
  if (role === 'admin') return 1
  return 2
}
