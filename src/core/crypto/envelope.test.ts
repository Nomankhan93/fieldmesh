import { describe, expect, it } from 'vitest'
import {
  decryptUtf8,
  encryptUtf8,
  exportConversationKey,
  fingerprintConversationKey,
  generateConversationKey,
  importConversationKey,
} from './envelope'
import { ReplayWindow, cryptoReplayToken } from './replay'

const aad = {
  conversationId: 'conversation-1',
  messageId: 'message-1',
  senderUserId: 'user-1',
  messageType: 'text',
}

describe('FieldMesh crypto foundation', () => {
  it('round-trips an AES-GCM envelope with conversation/message binding', async () => {
    const key = await generateConversationKey()
    const envelope = await encryptUtf8({ key, plaintext: 'hello mesh', keyEpoch: 3, aad })
    expect(envelope.keyEpoch).toBe(3)
    await expect(decryptUtf8({ key, envelope, aad })).resolves.toBe('hello mesh')
  })

  it('rejects an envelope when AAD is changed', async () => {
    const key = await generateConversationKey()
    const envelope = await encryptUtf8({ key, plaintext: 'bound payload', keyEpoch: 1, aad })
    await expect(decryptUtf8({
      key,
      envelope,
      aad: { ...aad, messageId: 'different-message' },
    })).rejects.toBeTruthy()
  })

  it('exports/imports a 256-bit key and keeps a stable fingerprint', async () => {
    const key = await generateConversationKey()
    const exported = await exportConversationKey(key)
    const imported = await importConversationKey(exported)
    expect(await fingerprintConversationKey(imported)).toBe(await fingerprintConversationKey(key))
  })

  it('suppresses a replay until the original token expires', () => {
    const guard = new ReplayWindow()
    const token = cryptoReplayToken('conversation-1', 'message-1')
    expect(guard.accept(token, 2_000, 1_000)).toBe(true)
    expect(guard.accept(token, 2_000, 1_500)).toBe(false)
    expect(guard.accept(token, 3_000, 2_100)).toBe(true)
  })
})
