import { describe, expect, it, vi } from 'vitest'
import {
  BACKGROUND_WORKSPACE_SYNC_INTERVAL_MS,
  SingleFlight,
  participantSnapshotIncludesUser,
  reconcileConversationSnapshot,
  rowsAfterCursor,
} from './syncPolicy'

describe('workspace sync reliability policy', () => {
  it('coalesces overlapping work for the same key into one in-flight operation', async () => {
    const singleFlight = new SingleFlight<string, string>()
    let resolveOperation: ((value: string) => void) | undefined
    const operation = vi.fn(() => new Promise<string>((resolve) => {
      resolveOperation = resolve
    }))

    const first = singleFlight.run('user-a', operation)
    const second = singleFlight.run('user-a', operation)

    expect(operation).toHaveBeenCalledTimes(1)
    expect(singleFlight.has('user-a')).toBe(true)
    resolveOperation?.('done')
    await expect(first).resolves.toBe('done')
    await expect(second).resolves.toBe('done')
    expect(singleFlight.has('user-a')).toBe(false)
  })

  it('fetches only rows after a compound created-at/message-id cursor', () => {
    const rows = [
      { id: 'a', created_at: '2026-09-24T20:00:00.000Z' },
      { id: 'b', created_at: '2026-09-24T20:00:00.000Z' },
      { id: 'c', created_at: '2026-09-24T20:00:01.000Z' },
    ]

    expect(rowsAfterCursor(rows, {
      lastServerCreatedAt: '2026-09-24T20:00:00.000Z',
      lastMessageId: 'a',
    }).map((row) => row.id)).toEqual(['b', 'c'])
  })

  it('retains a cached conversation when a list snapshot omits it but an RLS point read still sees it', async () => {
    const lookup = vi.fn(async (conversationId: string) => ({ id: conversationId, title: 'Recovered' }))
    const result = await reconcileConversationSnapshot({
      existingConversationIds: ['conversation-a'],
      listedConversations: [],
      lookupMissingConversation: lookup,
    })

    expect(lookup).toHaveBeenCalledWith('conversation-a')
    expect(result.conversations.map((conversation) => conversation.id)).toEqual(['conversation-a'])
    expect(result.confirmedRemovedIds).toEqual([])
  })

  it('purges only after a missing conversation is also absent from the RLS point read', async () => {
    const result = await reconcileConversationSnapshot({
      existingConversationIds: ['conversation-a'],
      listedConversations: [],
      lookupMissingConversation: async () => null,
    })

    expect(result.conversations).toEqual([])
    expect(result.confirmedRemovedIds).toEqual(['conversation-a'])
  })

  it('rejects participant snapshots that do not include the signed-in user', () => {
    expect(participantSnapshotIncludesUser([{ user_id: 'user-b' }], 'user-a')).toBe(false)
    expect(participantSnapshotIncludesUser([{ user_id: 'user-a' }], 'user-a')).toBe(true)
  })

  it('uses a conservative background polling interval instead of three-second full syncs', () => {
    expect(BACKGROUND_WORKSPACE_SYNC_INTERVAL_MS).toBeGreaterThanOrEqual(10_000)
  })
})
