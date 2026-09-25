import { describe, expect, it } from 'vitest'
import {
  removedConversationIds,
  sortWorkspaceConversations,
  toWorkspaceConversationRecord,
  toWorkspaceParticipantRecord,
  workspaceAvailability,
  workspaceConversationKey,
  workspaceCursorKey,
  workspaceParticipantKey,
} from './model'

describe('offline conversation workspace model', () => {
  it('scopes every local workspace identity to the signed-in user', () => {
    expect(workspaceConversationKey('user-a', 'conversation-1')).toBe('user-a:conversation-1')
    expect(workspaceCursorKey('user-a', 'conversation-1')).toBe('user-a:conversation-1')
    expect(workspaceParticipantKey('user-a', 'conversation-1', 'user-b')).toBe(
      'user-a:conversation-1:user-b',
    )
    expect(workspaceParticipantKey('user-c', 'conversation-1', 'user-b')).not.toBe(
      workspaceParticipantKey('user-a', 'conversation-1', 'user-b'),
    )
  })

  it('materializes remote conversation and participant metadata for offline use', () => {
    const syncedAt = Date.parse('2026-09-24T20:00:00.000Z')
    const conversation = toWorkspaceConversationRecord({
      localUserId: 'user-a',
      syncedAt,
      conversation: {
        id: 'conversation-1',
        kind: 'group',
        title: 'Field Team',
        created_by: 'user-a',
        created_at: '2026-09-24T19:00:00.000Z',
        updated_at: '2026-09-24T19:30:00.000Z',
      },
    })
    const participant = toWorkspaceParticipantRecord({
      localUserId: 'user-a',
      conversationId: conversation.id,
      syncedAt,
      participant: {
        user_id: 'user-b',
        fieldmesh_user_id: '00000000-0000-4000-8000-000000000002',
        display_name: 'User B',
        role: 'member',
      },
    })

    expect(conversation.localKey).toBe('user-a:conversation-1')
    expect(conversation.updatedAtMs).toBe(Date.parse('2026-09-24T19:30:00.000Z'))
    expect(participant.localKey).toBe('user-a:conversation-1:user-b')
    expect(participant.role).toBe('member')
  })

  it('identifies conversations removed from an authoritative server snapshot', () => {
    expect(
      removedConversationIds(
        ['conversation-a', 'conversation-b', 'conversation-c'],
        ['conversation-a', 'conversation-c', 'conversation-d'],
      ),
    ).toEqual(['conversation-b'])
  })

  it('keeps the most recently updated cached conversations first', () => {
    expect(
      sortWorkspaceConversations([
        { id: 'older', updatedAtMs: 10 },
        { id: 'newer-b', updatedAtMs: 20 },
        { id: 'newer-a', updatedAtMs: 20 },
      ]).map((item) => item.id),
    ).toEqual(['newer-a', 'newer-b', 'older'])
  })

  it('distinguishes a usable cached workspace from a never-synced offline device', () => {
    expect(workspaceAvailability({ browserOnline: true, cachedConversationCount: 0 })).toBe('online')
    expect(workspaceAvailability({ browserOnline: false, cachedConversationCount: 2 })).toBe(
      'offline-cached',
    )
    expect(
      workspaceAvailability({
        browserOnline: false,
        cachedConversationCount: 0,
        lastSuccessfulSyncAt: 123,
      }),
    ).toBe('offline-cached')
    expect(workspaceAvailability({ browserOnline: false, cachedConversationCount: 0 })).toBe(
      'offline-empty',
    )
  })
})
