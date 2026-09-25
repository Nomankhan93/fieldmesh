export type GroupRole = 'owner' | 'admin' | 'member'

export function canManageGroupMembers(role: GroupRole): boolean {
  return role === 'owner' || role === 'admin'
}

export function canRenameGroup(role: GroupRole): boolean {
  return role === 'owner' || role === 'admin'
}

export function canChangeGroupAdmins(role: GroupRole): boolean {
  return role === 'owner'
}

export function canRemoveGroupMember(actor: GroupRole, target: GroupRole): boolean {
  if (target === 'owner') return false
  if (actor === 'owner') return true
  return actor === 'admin' && target === 'member'
}

export function canLeaveGroup(role: GroupRole): boolean {
  return role !== 'owner'
}
