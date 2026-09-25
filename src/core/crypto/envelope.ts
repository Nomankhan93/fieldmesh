export const FIELDMESH_CRYPTO_ENVELOPE_VERSION = 1 as const
export const FIELDMESH_CRYPTO_SUITE = 'AES-GCM-256' as const

export interface FieldMeshCryptoEnvelope {
  version: typeof FIELDMESH_CRYPTO_ENVELOPE_VERSION
  suite: typeof FIELDMESH_CRYPTO_SUITE
  keyEpoch: number
  nonce: string
  ciphertext: string
}

export interface FieldMeshCryptoAad {
  conversationId: string
  messageId: string
  senderUserId: string
  messageType: string
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

function toWebCryptoBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength))
  copy.set(bytes)
  return copy
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)

  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

export function cryptoAadBytes(
  aad: FieldMeshCryptoAad,
): Uint8Array<ArrayBuffer> {
  return toWebCryptoBytes(
    encoder.encode([
      'fieldmesh-crypto-v1',
      aad.conversationId,
      aad.messageId,
      aad.senderUserId,
      aad.messageType,
    ].join('\u001f')),
  )
}

export async function generateConversationKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  )
}

export async function exportConversationKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key)
  return bytesToBase64Url(new Uint8Array(raw))
}

export async function importConversationKey(encoded: string): Promise<CryptoKey> {
  const raw = base64UrlToBytes(encoded)
  if (raw.byteLength !== 32) throw new Error('FieldMesh conversation keys must be 256 bits.')
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt'])
}

export async function fingerprintConversationKey(key: CryptoKey): Promise<string> {
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key))
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', raw))
  return bytesToBase64Url(digest)
}

export async function encryptUtf8(args: {
  key: CryptoKey
  plaintext: string
  keyEpoch: number
  aad: FieldMeshCryptoAad
}): Promise<FieldMeshCryptoEnvelope> {
  if (!Number.isInteger(args.keyEpoch) || args.keyEpoch < 1) {
    throw new Error('Crypto key epoch must be a positive integer.')
  }

  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: nonce,
      additionalData: cryptoAadBytes(args.aad),
      tagLength: 128,
    },
    args.key,
    encoder.encode(args.plaintext),
  )

  return {
    version: FIELDMESH_CRYPTO_ENVELOPE_VERSION,
    suite: FIELDMESH_CRYPTO_SUITE,
    keyEpoch: args.keyEpoch,
    nonce: bytesToBase64Url(nonce),
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
  }
}

export async function decryptUtf8(args: {
  key: CryptoKey
  envelope: FieldMeshCryptoEnvelope
  aad: FieldMeshCryptoAad
}): Promise<string> {
  if (args.envelope.version !== FIELDMESH_CRYPTO_ENVELOPE_VERSION) {
    throw new Error('Unsupported FieldMesh crypto envelope version.')
  }
  if (args.envelope.suite !== FIELDMESH_CRYPTO_SUITE) {
    throw new Error('Unsupported FieldMesh crypto suite.')
  }

  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: base64UrlToBytes(args.envelope.nonce),
      additionalData: cryptoAadBytes(args.aad),
      tagLength: 128,
    },
    args.key,
    base64UrlToBytes(args.envelope.ciphertext),
  )

  return decoder.decode(plaintext)
}
