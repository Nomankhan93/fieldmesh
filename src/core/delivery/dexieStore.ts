import { db } from '../../offline/db'
import { canonicalMessageLocalKey } from './coordinator'
import type {
  CanonicalMessageRecord,
  DeliveryPathAttemptRecord,
  DeliveryQueueRecord,
  DeliveryStore,
} from './types'

export class DexieDeliveryStore implements DeliveryStore {
  async enqueue(message: CanonicalMessageRecord, queue: DeliveryQueueRecord): Promise<void> {
    await db.transaction('rw', db.canonicalMessages, db.deliveryQueue, async () => {
      await db.canonicalMessages.put(message)
      await db.deliveryQueue.put(queue)
    })
  }

  getMessage(localUserId: string, messageId: string): Promise<CanonicalMessageRecord | undefined> {
    return db.canonicalMessages.get(canonicalMessageLocalKey(localUserId, messageId))
  }

  getQueue(localUserId: string, messageId: string): Promise<DeliveryQueueRecord | undefined> {
    return db.deliveryQueue.get(canonicalMessageLocalKey(localUserId, messageId))
  }

  async putMessage(message: CanonicalMessageRecord): Promise<void> {
    await db.canonicalMessages.put(message)
  }

  async updateMessage(
    localUserId: string,
    messageId: string,
    changes: Partial<CanonicalMessageRecord>,
  ): Promise<void> {
    await db.canonicalMessages.update(canonicalMessageLocalKey(localUserId, messageId), changes)
  }

  async putQueue(queue: DeliveryQueueRecord): Promise<void> {
    await db.deliveryQueue.put(queue)
  }

  async deleteQueue(localUserId: string, messageId: string): Promise<void> {
    await db.deliveryQueue.delete(canonicalMessageLocalKey(localUserId, messageId))
  }

  async listDue(localUserId: string, now: number): Promise<DeliveryQueueRecord[]> {
    return db.deliveryQueue
      .where('localUserId')
      .equals(localUserId)
      .filter((item) => item.nextAttemptAt <= now)
      .toArray()
  }

  async putAttempt(attempt: DeliveryPathAttemptRecord): Promise<void> {
    await db.deliveryPathAttempts.put(attempt)
  }

  async updateAttempt(id: string, changes: Partial<DeliveryPathAttemptRecord>): Promise<void> {
    await db.deliveryPathAttempts.update(id, changes)
  }
}
