import { describe, expect, it } from 'vitest'
import {
  canChangeGroupAdmins,
  canLeaveGroup,
  canManageGroupMembers,
  canRemoveGroupMember,
  canRenameGroup,
} from './permissions'

describe('group permission policy', () => {
  it('lets owners and admins manage normal membership', () => {
    expect(canManageGroupMembers('owner')).toBe(true)
    expect(canManageGroupMembers('admin')).toBe(true)
    expect(canManageGroupMembers('member')).toBe(false)
    expect(canRenameGroup('admin')).toBe(true)
  })

  it('reserves admin promotion/demotion for the owner', () => {
    expect(canChangeGroupAdmins('owner')).toBe(true)
    expect(canChangeGroupAdmins('admin')).toBe(false)
  })

  it('protects the owner and prevents admins removing other admins', () => {
    expect(canRemoveGroupMember('owner', 'admin')).toBe(true)
    expect(canRemoveGroupMember('admin', 'member')).toBe(true)
    expect(canRemoveGroupMember('admin', 'admin')).toBe(false)
    expect(canRemoveGroupMember('owner', 'owner')).toBe(false)
  })

  it('requires ownership transfer before the owner can leave', () => {
    expect(canLeaveGroup('owner')).toBe(false)
    expect(canLeaveGroup('admin')).toBe(true)
    expect(canLeaveGroup('member')).toBe(true)
  })
})
