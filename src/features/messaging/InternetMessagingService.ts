import type { SupabaseClient } from '@supabase/supabase-js'
import { createTextMessage, DEFAULT_TEXT_MESSAGE_TTL_MS } from '../../core/message/model'
import { DeliveryCoordinator } from '../../core/delivery/coordinator'
import { DexieDeliveryStore } from '../../core/delivery/dexieStore'
import { InternetDeliveryAdapter, MAX_CLOUD_MESSAGE_CHARS } from '../../core/delivery/internetAdapter'
import {
  removedConversationIds,
  toWorkspaceConversationRecord,
  toWorkspaceParticipantRecord,
  workspaceCursorKey,
} from '../../core/workspace/model'
import {
  db,
  type CloudMessageRecord,
  type CloudMessageState,
  type CloudReceiptRecord,
  type CloudReceiptType,
} from '../../offline/db'

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
  role: 'owner' | 'admin' | 'member'
  joined_at?: string
}

export type ConversationCryptoEpoch = {
  epoch: number
  suite: 'AES-GCM-256'
  created_by: string
  reason: string
  created_at: string
}

export type ConversationDeviceKey = {
  user_id: string
  fieldmesh_user_id: string
  device_id: string
  fieldmesh_device_id: string
  label: string
  algorithm: 'ECDH-P256'
  public_key: string
  fingerprint: string
  key_version: number
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
  private readonly deliveryCoordinator: DeliveryCoordinator

  constructor(client: SupabaseClient) {
    this.client = client
    this.deliveryCoordinator = new DeliveryCoordinator({
      store: new DexieDeliveryStore(),
      adapters: [new InternetDeliveryAdapter(client)],
    })
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
    const { data, error } = await this.client.rpc('fieldmesh_conversation_participants_v2', {
      p_conversation_id: conversationId,
    })
    if (error) throw error
    return (data ?? []) as ConversationParticipant[]
  }

  async syncWorkspace(localUserId: string): Promise<InternetConversation[]> {
    const attemptAt = Date.now()
    const previousState = await db.workspaceSyncState.get(localUserId)
    await db.workspaceSyncState.put({
      localUserId,
      status: 'syncing',
      lastAttemptAt: attemptAt,
      ...(previousState?.lastSuccessfulSyncAt
        ? { lastSuccessfulSyncAt: previousState.lastSuccessfulSyncAt }
        : {}),
    })

    try {
      const conversations = await this.listConversations()
      const participantsByConversation = new Map<string, ConversationParticipant[]>()
      for (const conversation of conversations) {
        participantsByConversation.set(
          conversation.id,
          await this.getParticipants(conversation.id),
        )
      }

      const syncedAt = Date.now()
      const existingConversations = await db.workspaceConversations
        .where('localUserId')
        .equals(localUserId)
        .toArray()
      const removedIds = removedConversationIds(
        existingConversations.map((conversation) => conversation.id),
        conversations.map((conversation) => conversation.id),
      )
      const conversationRecords = conversations.map((conversation) =>
        toWorkspaceConversationRecord({ localUserId, conversation, syncedAt }),
      )
      const participantRecords = conversations.flatMap((conversation) =>
        (participantsByConversation.get(conversation.id) ?? []).map((participant) =>
          toWorkspaceParticipantRecord({
            localUserId,
            conversationId: conversation.id,
            participant,
            syncedAt,
          }),
        ),
      )

      await db.transaction(
        'rw',
        [
          db.workspaceConversations,
          db.workspaceParticipants,
          db.workspaceSyncState,
          db.workspaceSyncCursors,
          db.cloudMessages,
          db.cloudReceipts,
          db.canonicalMessages,
          db.deliveryQueue,
          db.deliveryPathAttempts,
        ],
        async () => {
          if (conversationRecords.length > 0) {
            await db.workspaceConversations.bulkPut(conversationRecords)
          }

          for (const conversation of conversations) {
            await db.workspaceParticipants
              .where('[localUserId+conversationId]')
              .equals([localUserId, conversation.id])
              .delete()
            const records = participantRecords.filter(
              (participant) => participant.conversationId === conversation.id,
            )
            if (records.length > 0) await db.workspaceParticipants.bulkPut(records)
          }

          for (const conversationId of removedIds) {
            await this.purgeLocalConversation(localUserId, conversationId)
          }

          await db.workspaceSyncState.put({
            localUserId,
            status: 'ready',
            lastAttemptAt: attemptAt,
            lastSuccessfulSyncAt: syncedAt,
          })
        },
      )

      return conversations
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Workspace synchronization failed.'
      await db.workspaceSyncState.put({
        localUserId,
        status: 'error',
        lastAttemptAt: attemptAt,
        ...(previousState?.lastSuccessfulSyncAt
          ? { lastSuccessfulSyncAt: previousState.lastSuccessfulSyncAt }
          : {}),
        lastError: message,
      })
      throw error
    }
  }

  async createDirectConversation(recipientContact: string): Promise<string> {
    const value = recipientContact.trim()
    if (!value) throw new Error('Enter a FieldMesh code or ID.')

    const { data, error } = await this.client.rpc('fieldmesh_create_direct_conversation_by_contact', {
      p_contact: value,
    })
    if (error) throw error
    if (!data || typeof data !== 'string') throw new Error('Conversation was not created.')
    return data
  }

  async createGroup(title: string, memberContacts: string[]): Promise<string> {
    const cleanTitle = title.trim()
    if (!cleanTitle) throw new Error('Enter a group name.')
    const contacts = memberContacts.map((value) => value.trim()).filter(Boolean)
    const { data, error } = await this.client.rpc('fieldmesh_create_group', {
      p_title: cleanTitle,
      p_member_contacts: contacts,
    })
    if (error) throw error
    if (!data || typeof data !== 'string') throw new Error('Group was not created.')
    return data
  }

  async addGroupMember(conversationId: string, contact: string): Promise<string> {
    const { data, error } = await this.client.rpc('fieldmesh_group_add_member', {
      p_conversation_id: conversationId,
      p_contact: contact.trim(),
    })
    if (error) throw error
    if (!data || typeof data !== 'string') throw new Error('Group member was not added.')
    return data
  }

  async removeGroupMember(conversationId: string, userId: string): Promise<void> {
    const { error } = await this.client.rpc('fieldmesh_group_remove_member', {
      p_conversation_id: conversationId,
      p_user_id: userId,
    })
    if (error) throw error
  }

  async setGroupAdmin(conversationId: string, userId: string, isAdmin: boolean): Promise<void> {
    const { error } = await this.client.rpc('fieldmesh_group_set_admin', {
      p_conversation_id: conversationId,
      p_user_id: userId,
      p_is_admin: isAdmin,
    })
    if (error) throw error
  }

  async renameGroup(conversationId: string, title: string): Promise<void> {
    const { error } = await this.client.rpc('fieldmesh_group_rename', {
      p_conversation_id: conversationId,
      p_title: title.trim(),
    })
    if (error) throw error
  }

  async leaveGroup(conversationId: string, localUserId?: string): Promise<void> {
    const { error } = await this.client.rpc('fieldmesh_leave_group', {
      p_conversation_id: conversationId,
    })
    if (error) throw error
    if (localUserId) await this.purgeLocalConversation(localUserId, conversationId)
  }

  async currentCryptoEpoch(conversationId: string): Promise<ConversationCryptoEpoch | null> {
    const { data, error } = await this.client.rpc('fieldmesh_current_conversation_crypto_epoch', {
      p_conversation_id: conversationId,
    })
    if (error) throw error
    return ((data ?? [])[0] as ConversationCryptoEpoch | undefined) ?? null
  }

  async rotateCryptoEpoch(conversationId: string, reason = 'manual rotation'): Promise<number> {
    const { data, error } = await this.client.rpc('fieldmesh_rotate_conversation_crypto_epoch', {
      p_conversation_id: conversationId,
      p_reason: reason,
    })
    if (error) throw error
    if (typeof data !== 'number') throw new Error('Crypto epoch was not rotated.')
    return data
  }

  async conversationDeviceKeys(conversationId: string): Promise<ConversationDeviceKey[]> {
    const { data, error } = await this.client.rpc('fieldmesh_conversation_device_keys', {
      p_conversation_id: conversationId,
    })
    if (error) throw error
    return (data ?? []) as ConversationDeviceKey[]
  }

  async sendText(args: {
    localUserId: string
    conversationId: string
    text: string
  }): Promise<{ messageId: string; state: CloudMessageState }> {
    const text = args.text.trim()
    if (!text) throw new Error('Message cannot be empty.')
    if (text.length > MAX_CLOUD_MESSAGE_CHARS) {
      throw new Error(`Internet messages are limited to ${MAX_CLOUD_MESSAGE_CHARS} characters.`)
    }

    const logicalMessage = createTextMessage({
      conversationId: args.conversationId,
      senderUserId: args.localUserId,
      text,
      ttlMs: DEFAULT_TEXT_MESSAGE_TTL_MS,
    })
    const localKey = localMessageKey(args.localUserId, logicalMessage.id)
    const message: CloudMessageRecord = {
      localKey,
      localUserId: args.localUserId,
      id: logicalMessage.id,
      conversationId: logicalMessage.conversationId,
      senderId: logicalMessage.senderUserId,
      body: logicalMessage.payload.text ?? text,
      state: 'queued',
      createdAt: logicalMessage.createdAt,
      expiresAt: logicalMessage.expiresAt,
      updatedAt: logicalMessage.createdAt,
    }

    await db.cloudMessages.put(message)
    const result = await this.deliveryCoordinator.enqueue({
      localUserId: args.localUserId,
      message: logicalMessage,
      candidatePaths: ['internet'],
    })

    await db.cloudMessages.update(localKey, {
      state: result.state,
      ...(result.serverCreatedAt ? { serverCreatedAt: result.serverCreatedAt } : {}),
      updatedAt: Date.now(),
    })
    return { messageId: logicalMessage.id, state: result.state }
  }

  async retryOutbox(localUserId: string): Promise<void> {
    const results = await this.deliveryCoordinator.retryDue(localUserId)
    for (const result of results) {
      const localKey = localMessageKey(localUserId, result.messageId)
      const existing = await db.cloudMessages.get(localKey)
      if (!existing) continue
      await db.cloudMessages.update(localKey, {
        state: result.state,
        ...(result.serverCreatedAt ? { serverCreatedAt: result.serverCreatedAt } : {}),
        updatedAt: Date.now(),
      })
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
      const createdAt = Date.parse(row.client_created_at)
      const expiresAt = Date.parse(row.expires_at)
      const state: CloudMessageState = existing?.state ?? (row.sender_id === localUserId ? 'submitted' : 'delivered')
      await db.cloudMessages.put({
        localKey: localMessageKey(localUserId, row.id),
        localUserId,
        id: row.id,
        conversationId: row.conversation_id,
        senderId: row.sender_id,
        body: row.body,
        state,
        createdAt,
        serverCreatedAt: Date.parse(row.created_at),
        expiresAt,
        updatedAt: Date.now(),
      })
      await this.deliveryCoordinator.observe({
        localUserId,
        message: createTextMessage({
          id: row.id,
          conversationId: row.conversation_id,
          senderUserId: row.sender_id,
          text: row.body,
          now: createdAt,
          ttlMs: Math.max(1, expiresAt - createdAt),
        }),
        state,
        path: 'internet',
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

    const previousCursor = await db.workspaceSyncCursors.get(
      workspaceCursorKey(localUserId, conversationId),
    )
    const latestRow = rows.length > 0 ? rows[rows.length - 1] : undefined
    await db.workspaceSyncCursors.put({
      localKey: workspaceCursorKey(localUserId, conversationId),
      localUserId,
      conversationId,
      ...(latestRow?.created_at
        ? { lastServerCreatedAt: latestRow.created_at, lastMessageId: latestRow.id }
        : previousCursor?.lastServerCreatedAt
          ? {
              lastServerCreatedAt: previousCursor.lastServerCreatedAt,
              ...(previousCursor.lastMessageId ? { lastMessageId: previousCursor.lastMessageId } : {}),
            }
          : {}),
      lastSyncedAt: Date.now(),
    })
  }

  async syncAll(conversationIds: string[], localUserId: string): Promise<void> {
    await this.retryOutbox(localUserId)
    for (const conversationId of conversationIds) {
      await this.syncConversation(conversationId, localUserId)
    }
  }

  async markConversationRead(conversationId: string, localUserId: string): Promise<void> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
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

  private async purgeLocalConversation(localUserId: string, conversationId: string): Promise<void> {
    const workspaceKey = `${localUserId}:${conversationId}`
    const [cloudMessages, canonicalMessages] = await Promise.all([
      db.cloudMessages
        .where('[localUserId+conversationId]')
        .equals([localUserId, conversationId])
        .toArray(),
      db.canonicalMessages
        .where('[localUserId+conversationId]')
        .equals([localUserId, conversationId])
        .toArray(),
    ])
    const messageIds = new Set([
      ...cloudMessages.map((message) => message.id),
      ...canonicalMessages.map((message) => message.messageId),
    ])

    await db.workspaceConversations.delete(workspaceKey)
    await db.workspaceParticipants
      .where('[localUserId+conversationId]')
      .equals([localUserId, conversationId])
      .delete()
    await db.workspaceSyncCursors.delete(workspaceKey)

    if (cloudMessages.length > 0) {
      await db.cloudMessages.bulkDelete(cloudMessages.map((message) => message.localKey))
    }
    if (canonicalMessages.length > 0) {
      const localKeys = canonicalMessages.map((message) => message.localKey)
      await db.canonicalMessages.bulkDelete(localKeys)
      await db.deliveryQueue.bulkDelete(localKeys)
    }
    if (messageIds.size > 0) {
      const receipts = await db.cloudReceipts
        .where('localUserId')
        .equals(localUserId)
        .filter((receipt) => messageIds.has(receipt.messageId))
        .toArray()
      if (receipts.length > 0) {
        await db.cloudReceipts.bulkDelete(receipts.map((receipt) => receipt.localKey))
      }
      const attempts = await db.deliveryPathAttempts
        .where('localUserId')
        .equals(localUserId)
        .filter((attempt) => messageIds.has(attempt.messageId))
        .toArray()
      if (attempts.length > 0) {
        await db.deliveryPathAttempts.bulkDelete(attempts.map((attempt) => attempt.id))
      }
    }
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
      await this.deliveryCoordinator.setState(localUserId, messageId, state, 'internet')
    }
  }


}
