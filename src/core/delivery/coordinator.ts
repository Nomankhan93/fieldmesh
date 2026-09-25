import { MESSAGE_PRIORITY_RANK, type FieldMeshMessage } from '../message/model'
import type {
  CanonicalDeliveryState,
  CanonicalMessageRecord,
  DeliveryDispatchResult,
  DeliveryPath,
  DeliveryPathAdapter,
  DeliveryPathAttemptRecord,
  DeliveryQueueRecord,
  DeliveryRoutingContext,
  DeliveryStore,
} from './types'

const DEFAULT_RETRY_BASE_MS = 1_000
const MAX_RETRY_BACKOFF_MS = 60_000

export function canonicalMessageLocalKey(localUserId: string, messageId: string): string {
  return `${localUserId}:${messageId}`
}

export interface EnqueueDeliveryArgs {
  localUserId: string
  message: FieldMeshMessage
  candidatePaths: DeliveryPath[]
  conversationKind?: 'direct' | 'group'
  recipientUserIds?: string[]
}

export interface ObserveDeliveryArgs {
  localUserId: string
  message: FieldMeshMessage
  state: CanonicalDeliveryState
  path?: DeliveryPath
}

export class DeliveryCoordinator {
  private readonly store: DeliveryStore
  private readonly adapters = new Map<DeliveryPath, DeliveryPathAdapter>()
  private readonly now: () => number

  constructor(args: {
    store: DeliveryStore
    adapters?: DeliveryPathAdapter[]
    now?: () => number
  }) {
    this.store = args.store
    this.now = args.now ?? Date.now
    for (const adapter of args.adapters ?? []) this.register(adapter)
  }

  register(adapter: DeliveryPathAdapter): void {
    if (this.adapters.has(adapter.path)) {
      throw new Error(`Delivery adapter already registered for path: ${adapter.path}`)
    }
    this.adapters.set(adapter.path, adapter)
  }

  async enqueue(args: EnqueueDeliveryArgs): Promise<DeliveryDispatchResult> {
    if (args.candidatePaths.length === 0) {
      throw new Error('At least one delivery path must be supplied.')
    }

    const [existing, existingQueue] = await Promise.all([
      this.store.getMessage(args.localUserId, args.message.id),
      this.store.getQueue(args.localUserId, args.message.id),
    ])
    if (existing && existing.state !== 'queued' && existing.state !== 'failed') {
      return {
        messageId: existing.messageId,
        state: existing.state,
        path: existing.lastPath,
      }
    }
    if (existing && existingQueue) {
      return this.attempt(args.localUserId, args.message.id)
    }

    const now = this.now()
    const localKey = canonicalMessageLocalKey(args.localUserId, args.message.id)
    const context: DeliveryRoutingContext = {
      localUserId: args.localUserId,
      ...(args.conversationKind ? { conversationKind: args.conversationKind } : {}),
      ...(args.recipientUserIds ? { recipientUserIds: [...args.recipientUserIds] } : {}),
    }
    const record: CanonicalMessageRecord = existing ?? {
      localKey,
      localUserId: args.localUserId,
      messageId: args.message.id,
      conversationId: args.message.conversationId,
      senderUserId: args.message.senderUserId,
      type: args.message.type,
      priority: args.message.priority,
      message: args.message,
      state: 'queued',
      createdAt: args.message.createdAt,
      expiresAt: args.message.expiresAt,
      updatedAt: now,
    }
    const queue: DeliveryQueueRecord = {
      localKey,
      localUserId: args.localUserId,
      messageId: args.message.id,
      priorityRank: MESSAGE_PRIORITY_RANK[args.message.priority],
      candidatePaths: [...new Set(args.candidatePaths)],
      context,
      nextAttemptAt: now,
      expiresAt: args.message.expiresAt,
      retryCount: 0,
    }

    await this.store.enqueue({ ...record, state: 'queued', updatedAt: now }, queue)
    return this.attempt(args.localUserId, args.message.id)
  }

  async retryDue(localUserId: string): Promise<DeliveryDispatchResult[]> {
    const now = this.now()
    const due = await this.store.listDue(localUserId, now)
    due.sort((a, b) => a.priorityRank - b.priorityRank || a.nextAttemptAt - b.nextAttemptAt)

    const results: DeliveryDispatchResult[] = []
    for (const item of due) {
      results.push(await this.attempt(localUserId, item.messageId))
    }
    return results
  }

  async observe(args: ObserveDeliveryArgs): Promise<void> {
    const now = this.now()
    const existing = await this.store.getMessage(args.localUserId, args.message.id)
    const record: CanonicalMessageRecord = {
      localKey: canonicalMessageLocalKey(args.localUserId, args.message.id),
      localUserId: args.localUserId,
      messageId: args.message.id,
      conversationId: args.message.conversationId,
      senderUserId: args.message.senderUserId,
      type: args.message.type,
      priority: args.message.priority,
      message: args.message,
      state: args.state,
      ...(args.path ? { lastPath: args.path } : existing?.lastPath ? { lastPath: existing.lastPath } : {}),
      createdAt: args.message.createdAt,
      expiresAt: args.message.expiresAt,
      updatedAt: now,
    }
    await this.store.putMessage(record)
    if (args.state !== 'queued' && args.state !== 'failed') {
      await this.store.deleteQueue(args.localUserId, args.message.id)
    }
  }

  async setState(
    localUserId: string,
    messageId: string,
    state: CanonicalDeliveryState,
    path?: DeliveryPath,
  ): Promise<void> {
    const existing = await this.store.getMessage(localUserId, messageId)
    if (!existing) return
    await this.store.updateMessage(localUserId, messageId, {
      state,
      ...(path ? { lastPath: path } : {}),
      updatedAt: this.now(),
    })
    if (state !== 'queued' && state !== 'failed') {
      await this.store.deleteQueue(localUserId, messageId)
    }
  }

  private async attempt(localUserId: string, messageId: string): Promise<DeliveryDispatchResult> {
    const [record, queue] = await Promise.all([
      this.store.getMessage(localUserId, messageId),
      this.store.getQueue(localUserId, messageId),
    ])
    if (!record || !queue) {
      return { messageId, state: record?.state ?? 'failed', path: record?.lastPath }
    }

    const now = this.now()
    if (queue.expiresAt <= now || record.expiresAt <= now) {
      await this.store.updateMessage(localUserId, messageId, { state: 'expired', updatedAt: now })
      await this.store.deleteQueue(localUserId, messageId)
      return { messageId, state: 'expired' }
    }

    let lastFailureReason: string | undefined
    let attemptedAnyPath = false

    for (const path of queue.candidatePaths) {
      const adapter = this.adapters.get(path)
      if (!adapter) continue

      let available = false
      try {
        available = await adapter.isAvailable()
      } catch (error) {
        lastFailureReason = error instanceof Error ? error.message : `${path} availability check failed.`
      }
      if (!available) continue
      attemptedAnyPath = true

      const attempt: DeliveryPathAttemptRecord = {
        id: crypto.randomUUID(),
        localKey: record.localKey,
        localUserId,
        messageId,
        path,
        status: 'started',
        startedAt: this.now(),
      }
      await this.store.putAttempt(attempt)

      try {
        const result = await adapter.submit(record.message, queue.context)
        const finishedAt = this.now()
        await this.store.updateAttempt(attempt.id, {
          status: 'accepted',
          finishedAt,
        })
        await this.store.updateMessage(localUserId, messageId, {
          state: 'submitted',
          lastPath: path,
          updatedAt: finishedAt,
        })
        await this.store.deleteQueue(localUserId, messageId)
        return {
          messageId,
          state: 'submitted',
          path,
          serverCreatedAt: result.serverCreatedAt,
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : `Delivery through ${path} failed.`
        lastFailureReason = reason
        await this.store.updateAttempt(attempt.id, {
          status: 'failed',
          finishedAt: this.now(),
          failureReason: reason,
        })
      }
    }

    const retryCount = queue.retryCount + (attemptedAnyPath ? 1 : 0)
    const backoffMs = attemptedAnyPath
      ? Math.min(MAX_RETRY_BACKOFF_MS, DEFAULT_RETRY_BASE_MS * 2 ** Math.min(retryCount, 6))
      : DEFAULT_RETRY_BASE_MS
    const nextAttemptAt = Math.min(this.now() + backoffMs, queue.expiresAt)
    const failureReason = lastFailureReason ?? 'No configured delivery path is currently available.'

    await this.store.updateMessage(localUserId, messageId, {
      state: 'queued',
      updatedAt: this.now(),
    })
    await this.store.putQueue({
      ...queue,
      retryCount,
      nextAttemptAt,
      lastFailureReason: failureReason,
    })

    return { messageId, state: 'queued' }
  }
}
