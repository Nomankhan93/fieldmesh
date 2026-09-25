import type { SupabaseClient } from '@supabase/supabase-js'
import type { FieldMeshMessage } from '../message/model'
import type {
  DeliveryAdapterResult,
  DeliveryPathAdapter,
  DeliveryRoutingContext,
} from './types'

export const MAX_CLOUD_MESSAGE_CHARS = 4000

function isDuplicateError(error: { code?: string } | null): boolean {
  return error?.code === '23505'
}

export class InternetDeliveryAdapter implements DeliveryPathAdapter {
  readonly path = 'internet' as const
  private readonly client: SupabaseClient
  private readonly availability: () => boolean

  constructor(client: SupabaseClient, availability?: () => boolean) {
    this.client = client
    this.availability = availability ?? (() => typeof navigator === 'undefined' || navigator.onLine)
  }

  isAvailable(): boolean {
    return this.availability()
  }

  async submit(
    message: FieldMeshMessage,
    context: DeliveryRoutingContext,
  ): Promise<DeliveryAdapterResult> {
    if (message.type !== 'text') {
      throw new Error(`Internet mailbox adapter does not yet support ${message.type} messages.`)
    }
    const body = message.payload.text?.trim() ?? ''
    if (!body) throw new Error('Message cannot be empty.')
    if (body.length > MAX_CLOUD_MESSAGE_CHARS) {
      throw new Error(`Internet messages are limited to ${MAX_CLOUD_MESSAGE_CHARS} characters.`)
    }

    const result = await this.client
      .from('messages')
      .insert({
        id: message.id,
        conversation_id: message.conversationId,
        sender_id: context.localUserId,
        body,
        client_created_at: new Date(message.createdAt).toISOString(),
        expires_at: new Date(message.expiresAt).toISOString(),
      })
      .select('created_at')
      .single()

    if (result.error && !isDuplicateError(result.error)) {
      throw new Error(result.error.message || 'Internet message submission failed.')
    }

    return {
      acceptedAt: Date.now(),
      transportMessageId: message.id,
      ...(result.data?.created_at
        ? { serverCreatedAt: Date.parse(result.data.created_at as string) }
        : {}),
    }
  }
}
