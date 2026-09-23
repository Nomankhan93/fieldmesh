import type { SupabaseClient } from '@supabase/supabase-js'
import { createTextMessage, DEFAULT_TEXT_MESSAGE_TTL_MS } from '../../core/message/model'
import {
  db,
  type CloudMessageRecord,
  type CloudMessageState,
  type CloudReceiptRecord,
  type CloudReceiptType,
} from '../../offline/db'

const MAX_CLOUD_MESSAGE_CHARS = 4000

export type InternetConversation = {
  id: string
  kind: 'direct' | 'group'
  title: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export type ConversationParticipant = {
  user_id: string
  fieldmesh_user_id: string
  display_name: string
  role: 'owner' | 'member'
}

type CloudMessageRow = {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  client_created_at: string
  created_at: string
  expires_at: string
}

type ReceiptRow = {
  message_id: string
  user_id: string
  receipt_type: CloudReceiptType
  created_at: string
}

function localMessageKey(localUserId: string, messageId: string) {
  return `${localUserId}:${messageId}`
}

function localReceiptKey(
  localUserId: string,
  messageId: string,
  userId: string,
  receiptType: CloudReceiptType,
) {
  return `${localUserId}:${messageId}:${userId}:${receiptType}`
}

function isDuplicateError(error: { code?: string } | null) {
  return error?.code === '23505'
}

export class InternetMessagingService {
  private readonly client: SupabaseClient

  constructor(client: SupabaseClient) {
    this.client = client
  }

  async listConversations(): Promise<InternetConversation[]> {
    const { data, error } = await this.client
      .from('conversations')
      .select('id, kind, title, created_by, created_at, updated_at')
      .order('updated_at', { ascending: false })

    if (error) throw error
    return (data ?? []) as InternetConversation[]
  }

  async getParticipants(conversationId: string): Promise<ConversationParticipant[]> {
    const { data, error } = await this.client.rpc('fieldmesh_conversation_participants', {
      p_conversation_id: conversationId,
    })
    if (error) throw error
    return (data ?? []) as ConversationParticipant[]
  }

  async createDirectConversation(recipientFieldMeshUserId: string): Promise<string> {
    const value = recipientFieldMeshUserId.trim()
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
      throw new Error('Enter a valid FieldMesh User ID.')
    }

    const { data, error } = await this.client.rpc('fieldmesh_create_direct_conversation', {
      p_recipient_fieldmesh_user_id: value,
    })
    if (error) throw error
    if (!data || typeof data !== 'string') throw new Error('Conversation was not created.')
    return data
  }

  async sendText(args: {
    localUserId: string
    conversationId: string
    text: string
  }): Promise<{ messageId: string; state: CloudMessageState }> {
    const text = args.text.trim()
    if (!text) throw new Error('Message cannot be empty.')
    if (text.length > MAX_CLOUD_MESSAGE_CHARS) {
      throw new Error(`Internet messages are limited to ${MAX_CLOUD_MESSAGE_CHARS} characters in 0.5.`)
    }

    const logicalMessage = createTextMessage({
      conversationId: args.conversationId,
      senderUserId: args.localUserId,
      text,
      ttlMs: DEFAULT_TEXT_MESSAGE_TTL_MS,
    })
    const now = logicalMessage.createdAt
    const id = logicalMessage.id
    const localKey = localMessageKey(args.localUserId, id)
    const message: CloudMessageRecord = {
      localKey,
      localUserId: args.localUserId,
      id,
      conversationId: logicalMessage.conversationId,
      senderId: logicalMessage.senderUserId,
      body: logicalMessage.payload.text ?? text,
      state: 'queued',
      createdAt: logicalMessage.createdAt,
      expiresAt: logicalMessage.expiresAt,
      updatedAt: now,
    }

    await db.transaction('rw', db.cloudMessages, db.cloudOutbox, async () => {
      await db.cloudMessages.put(message)
      await db.cloudOutbox.put({
        localKey,
        localUserId: args.localUserId,
        messageId: id,
        nextAttemptAt: now,
        expiresAt: message.expiresAt,
        retryCount: 0,
      })
    })

    await this.attemptOutboxItem(args.localUserId, id)
    const latest = await db.cloudMessages.get(localKey)
    return { messageId: id, state: latest?.state ?? 'queued' }
  }

  async retryOutbox(localUserId: string): Promise<void> {
    const now = Date.now()
    const pending = await db.cloudOutbox
      .where('localUserId')
      .equals(localUserId)
      .filter((item) => item.nextAttemptAt <= now)
      .toArray()

    for (const item of pending) {
      await this.attemptOutboxItem(localUserId, item.messageId)
    }
  }

  async syncConversation(conversationId: string, localUserId: string): Promise<void> {
    const nowIso = new Date().toISOString()
    const { data, error } = await this.client
      .from('messages')
      .select('id, conversation_id, sender_id, body, client_created_at, created_at, expires_at')
      .eq('conversation_id', conversationId)
      .gt('expires_at', nowIso)
      .order('created_at', { ascending: true })

    if (error) throw error
    const rows = (data ?? []) as CloudMessageRow[]

    for (const row of rows) {
      const existing = await db.cloudMessages.get(localMessageKey(localUserId, row.id))
      await db.cloudMessages.put({
        localKey: localMessageKey(localUserId, row.id),
        localUserId,
        id: row.id,
        conversationId: row.conversation_id,
        senderId: row.sender_id,
        body: row.body,
        state: existing?.state ?? (row.sender_id === localUserId ? 'submitted' : 'delivered'),
        createdAt: Date.parse(row.client_created_at),
        serverCreatedAt: Date.parse(row.created_at),
        expiresAt: Date.parse(row.expires_at),
        updatedAt: Date.now(),
      })

      if (row.sender_id !== localUserId) {
        await this.ensureReceipt(row.id, localUserId, 'delivered')
      }
    }

    if (rows.length > 0) {
      const messageIds = rows.map((row) => row.id)
      const { data: receiptData, error: receiptError } = await this.client
        .from('message_receipts')
        .select('message_id, user_id, receipt_type, created_at')
        .in('message_id', messageIds)

      if (receiptError) throw receiptError
      const receipts = (receiptData ?? []) as ReceiptRow[]
      await db.cloudReceipts.bulkPut(
        receipts.map((receipt) => ({
          localKey: localReceiptKey(
            localUserId,
            receipt.message_id,
            receipt.user_id,
            receipt.receipt_type,
          ),
          localUserId,
          receiptKey: `${receipt.message_id}:${receipt.user_id}:${receipt.receipt_type}`,
          messageId: receipt.message_id,
          userId: receipt.user_id,
          receiptType: receipt.receipt_type,
          createdAt: Date.parse(receipt.created_at),
        } satisfies CloudReceiptRecord)),
      )

      await this.refreshDerivedStates(localUserId, rows.map((row) => row.id))
    }
  }

  async syncAll(conversationIds: string[], localUserId: string): Promise<void> {
    await this.retryOutbox(localUserId)
    for (const conversationId of conversationIds) {
      await this.syncConversation(conversationId, localUserId)
    }
  }

  async markConversationRead(conversationId: string, localUserId: string): Promise<void> {
    await this.syncConversation(conversationId, localUserId)
    const messages = await db.cloudMessages
      .where('[localUserId+conversationId]')
      .equals([localUserId, conversationId])
      .filter((message) => message.senderId !== localUserId)
      .toArray()

    for (const message of messages) {
      await this.ensureReceipt(message.id, localUserId, 'read')
    }

    await this.syncConversation(conversationId, localUserId)
  }

  private async ensureReceipt(
    messageId: string,
    localUserId: string,
    receiptType: CloudReceiptType,
  ): Promise<void> {
    const { error } = await this.client.from('message_receipts').insert({
      message_id: messageId,
      user_id: localUserId,
      receipt_type: receiptType,
    })

    if (error && !isDuplicateError(error)) throw error
  }

  private async refreshDerivedStates(localUserId: string, messageIds: string[]): Promise<void> {
    for (const messageId of messageIds) {
      const localKey = localMessageKey(localUserId, messageId)
      const message = await db.cloudMessages.get(localKey)
      if (!message) continue

      const receipts = await db.cloudReceipts
        .where('messageId')
        .equals(messageId)
        .filter((receipt) => receipt.localUserId === localUserId)
        .toArray()

      let state: CloudMessageState
      if (message.senderId === localUserId) {
        const otherReceipts = receipts.filter((receipt) => receipt.userId !== localUserId)
        state = otherReceipts.some((receipt) => receipt.receiptType === 'read')
          ? 'read'
          : otherReceipts.some((receipt) => receipt.receiptType === 'delivered')
            ? 'delivered'
            : 'submitted'
      } else {
        state = receipts.some(
          (receipt) => receipt.userId === localUserId && receipt.receiptType === 'read',
        )
          ? 'read'
          : 'delivered'
      }

      await db.cloudMessages.update(localKey, { state, updatedAt: Date.now() })
    }
  }

  private async attemptOutboxItem(localUserId: string, messageId: string): Promise<void> {
    const localKey = localMessageKey(localUserId, messageId)
    const [message, queueItem] = await Promise.all([
      db.cloudMessages.get(localKey),
      db.cloudOutbox.get(localKey),
    ])
    if (!message || !queueItem) return

    const now = Date.now()
    if (queueItem.expiresAt <= now) {
      await db.transaction('rw', db.cloudMessages, db.cloudOutbox, async () => {
        await db.cloudMessages.update(localKey, { state: 'expired', updatedAt: now })
        await db.cloudOutbox.delete(localKey)
      })
      return
    }

    const attemptId = crypto.randomUUID()
    await db.cloudDeliveryAttempts.put({
      id: attemptId,
      localUserId,
      messageId,
      status: 'started',
      startedAt: now,
    })

    let serverCreatedAt: number | undefined
    let failureReason: string | null = null

    try {
      const result = await this.client
        .from('messages')
        .insert({
          id: message.id,
          conversation_id: message.conversationId,
          sender_id: localUserId,
          body: message.body,
          client_created_at: new Date(message.createdAt).toISOString(),
          expires_at: new Date(message.expiresAt).toISOString(),
        })
        .select('created_at')
        .single()

      if (!result.error || isDuplicateError(result.error)) {
        serverCreatedAt = result.data?.created_at
          ? Date.parse(result.data.created_at as string)
          : message.serverCreatedAt
      } else {
        failureReason = result.error.message || 'Internet message submission failed.'
      }
    } catch (error) {
      failureReason = error instanceof Error ? error.message : 'Internet message submission failed.'
    }

    if (failureReason === null) {
      await db.transaction(
        'rw',
        db.cloudMessages,
        db.cloudOutbox,
        db.cloudDeliveryAttempts,
        async () => {
          await db.cloudMessages.update(localKey, {
            state: 'submitted',
            serverCreatedAt,
            updatedAt: Date.now(),
          })
          await db.cloudOutbox.delete(localKey)
          await db.cloudDeliveryAttempts.update(attemptId, {
            status: 'accepted',
            finishedAt: Date.now(),
          })
        },
      )
      return
    }

    const retryCount = queueItem.retryCount + 1
    const backoffMs = Math.min(60_000, 1_000 * 2 ** Math.min(retryCount, 6))
    const reason = failureReason

    await db.transaction(
      'rw',
      db.cloudMessages,
      db.cloudOutbox,
      db.cloudDeliveryAttempts,
      async () => {
        await db.cloudMessages.update(localKey, { state: 'queued', updatedAt: Date.now() })
        await db.cloudOutbox.put({
          ...queueItem,
          retryCount,
          nextAttemptAt: Date.now() + backoffMs,
          lastFailureReason: reason,
        })
        await db.cloudDeliveryAttempts.update(attemptId, {
          status: 'failed',
          finishedAt: Date.now(),
          failureReason: reason,
        })
      },
    )
  }
}
