import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createTextMessage } from '../message/model'
import { InternetDeliveryAdapter } from './internetAdapter'

type FakeResult = {
  data: { created_at: string } | null
  error: { code?: string; message: string } | null
}

function fakeClient(result: FakeResult, capture: (row: Record<string, unknown>) => void): SupabaseClient {
  return {
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        capture(row)
        return {
          select: () => ({
            single: async () => result,
          }),
        }
      },
    }),
  } as unknown as SupabaseClient
}

describe('Internet delivery adapter', () => {
  it('submits the canonical logical message ID unchanged', async () => {
    let inserted: Record<string, unknown> | undefined
    const client = fakeClient(
      { data: { created_at: '2026-09-24T12:00:01.000Z' }, error: null },
      (row) => { inserted = row },
    )
    const adapter = new InternetDeliveryAdapter(client, () => true)
    const message = createTextMessage({
      id: 'stable-message-id',
      conversationId: 'conversation-1',
      senderUserId: 'user-1',
      text: 'hello coordinator',
      now: Date.parse('2026-09-24T12:00:00.000Z'),
      ttlMs: 60_000,
    })

    const result = await adapter.submit(message, { localUserId: 'user-1' })

    expect(inserted).toMatchObject({
      id: 'stable-message-id',
      conversation_id: 'conversation-1',
      sender_id: 'user-1',
      body: 'hello coordinator',
    })
    expect(result.transportMessageId).toBe('stable-message-id')
    expect(result.serverCreatedAt).toBe(Date.parse('2026-09-24T12:00:01.000Z'))
  })

  it('treats duplicate cloud insertion as idempotent success', async () => {
    const adapter = new InternetDeliveryAdapter(
      fakeClient({ data: null, error: { code: '23505', message: 'duplicate key' } }, () => undefined),
      () => true,
    )
    const message = createTextMessage({
      id: 'duplicate-message-id',
      conversationId: 'conversation-1',
      senderUserId: 'user-1',
      text: 'same message',
      now: 1_000,
      ttlMs: 10_000,
    })

    await expect(adapter.submit(message, { localUserId: 'user-1' })).resolves.toMatchObject({
      transportMessageId: 'duplicate-message-id',
    })
  })
})
