import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

function parseShellEnv(raw) {
  const env = {}
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!match) continue
    const [, key, rawValue] = match
    let value = rawValue.trim()
    if (value.startsWith('"') && value.endsWith('"')) {
      try {
        value = JSON.parse(value)
      } catch {
        value = value.slice(1, -1)
      }
    }
    env[key] = value
  }
  return env
}

function defaultDictionaryValue(value) {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value)
    return parsed.default ?? Object.values(parsed)[0]
  } catch {
    return undefined
  }
}

function requireValue(value, label) {
  if (!value) throw new Error(`Missing ${label} from local Supabase status output.`)
  return value
}

function makeClient(url, key) {
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

const statusOutput = execFileSync('npx', ['supabase', 'status', '-o', 'env'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
})
const env = parseShellEnv(statusOutput)

const url = requireValue(env.API_URL ?? env.SUPABASE_URL, 'API URL')
const publishableKey = requireValue(
  env.PUBLISHABLE_KEY ??
    env.SUPABASE_PUBLISHABLE_KEY ??
    defaultDictionaryValue(env.PUBLISHABLE_KEYS) ??
    defaultDictionaryValue(env.SUPABASE_PUBLISHABLE_KEYS) ??
    env.ANON_KEY ??
    env.SUPABASE_ANON_KEY,
  'publishable/anon key',
)
const secretKey = requireValue(
  env.SECRET_KEY ??
    env.SUPABASE_SECRET_KEY ??
    defaultDictionaryValue(env.SECRET_KEYS) ??
    defaultDictionaryValue(env.SUPABASE_SECRET_KEYS) ??
    env.SERVICE_ROLE_KEY ??
    env.SUPABASE_SERVICE_ROLE_KEY,
  'secret/service-role key',
)

const admin = makeClient(url, secretKey)
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
const password = 'FieldMesh-message-test-2026!'
const specs = [
  { key: 'a', email: `fieldmesh-msg-a-${suffix}@example.test`, displayName: 'Message A' },
  { key: 'b', email: `fieldmesh-msg-b-${suffix}@example.test`, displayName: 'Message B' },
  { key: 'c', email: `fieldmesh-msg-c-${suffix}@example.test`, displayName: 'Message C' },
]
const createdUsers = []

async function createUser(spec) {
  const { data, error } = await admin.auth.admin.createUser({
    email: spec.email,
    password,
    email_confirm: true,
    user_metadata: { display_name: spec.displayName },
  })
  if (error) throw error
  createdUsers.push(data.user.id)
  return data.user
}

async function signIn(spec) {
  const client = makeClient(url, publishableKey)
  const { data, error } = await client.auth.signInWithPassword({ email: spec.email, password })
  if (error) throw error
  assert.ok(data.session, `expected session for ${spec.key}`)
  return client
}

async function ownFieldMeshId(client, userId) {
  const result = await client.from('profiles').select('fieldmesh_user_id').eq('id', userId).single()
  if (result.error) throw result.error
  return result.data.fieldmesh_user_id
}

async function main() {
  const users = {}
  const clients = {}
  for (const spec of specs) {
    users[spec.key] = await createUser(spec)
    clients[spec.key] = await signIn(spec)
  }

  const bFieldMeshId = await ownFieldMeshId(clients.b, users.b.id)
  const created = await clients.a.rpc('fieldmesh_create_direct_conversation', {
    p_recipient_fieldmesh_user_id: bFieldMeshId,
  })
  if (created.error) throw created.error
  const conversationId = created.data
  assert.ok(conversationId)
  console.log('PASS direct conversation created from stable FieldMesh recipient ID')

  const aFieldMeshId = await ownFieldMeshId(clients.a, users.a.id)
  const duplicateDirect = await clients.b.rpc('fieldmesh_create_direct_conversation', {
    p_recipient_fieldmesh_user_id: aFieldMeshId,
  })
  if (duplicateDirect.error) throw duplicateDirect.error
  assert.equal(duplicateDirect.data, conversationId)
  console.log('PASS direct conversation creation is idempotent for the same two users')

  const participants = await clients.a.rpc('fieldmesh_conversation_participants', {
    p_conversation_id: conversationId,
  })
  if (participants.error) throw participants.error
  assert.equal(participants.data.length, 2)
  assert.deepEqual(new Set(participants.data.map((row) => row.user_id)), new Set([users.a.id, users.b.id]))
  console.log('PASS conversation members can resolve participant summaries')

  const cParticipants = await clients.c.rpc('fieldmesh_conversation_participants', {
    p_conversation_id: conversationId,
  })
  assert.ok(cParticipants.error)
  console.log('PASS participant summaries reject unrelated users')

  const messageId = crypto.randomUUID()
  const now = Date.now()
  const inserted = await clients.a
    .from('messages')
    .insert({
      id: messageId,
      conversation_id: conversationId,
      sender_id: users.a.id,
      body: 'Durable mailbox test',
      client_created_at: new Date(now).toISOString(),
      expires_at: new Date(now + 60_000).toISOString(),
    })
    .select('id, body')
    .single()
  if (inserted.error) throw inserted.error
  assert.equal(inserted.data.id, messageId)
  console.log('PASS conversation member can submit an immutable cloud message')

  const bMailbox = await clients.b.from('messages').select('id, body').eq('id', messageId).single()
  if (bMailbox.error) throw bMailbox.error
  assert.equal(bMailbox.data.body, 'Durable mailbox test')
  console.log('PASS recipient can retrieve a message submitted before mailbox read')

  const cMailbox = await clients.c.from('messages').select('id').eq('id', messageId)
  assert.equal(cMailbox.error, null)
  assert.equal(cMailbox.data.length, 0)
  console.log('PASS unrelated user cannot read conversation messages')

  const cInsert = await clients.c.from('messages').insert({
    id: crypto.randomUUID(),
    conversation_id: conversationId,
    sender_id: users.c.id,
    body: 'Forbidden',
    client_created_at: new Date(now).toISOString(),
    expires_at: new Date(now + 60_000).toISOString(),
  })
  assert.ok(cInsert.error)
  console.log('PASS unrelated user cannot submit to the conversation')

  const forgedReceipt = await clients.a.from('message_receipts').insert({
    message_id: messageId,
    user_id: users.b.id,
    receipt_type: 'delivered',
  })
  assert.ok(forgedReceipt.error)
  console.log('PASS sender cannot forge another user delivery receipt')

  const delivered = await clients.b.from('message_receipts').insert({
    message_id: messageId,
    user_id: users.b.id,
    receipt_type: 'delivered',
  })
  if (delivered.error) throw delivered.error
  console.log('PASS recipient can record explicit delivered receipt')

  const read = await clients.b.from('message_receipts').insert({
    message_id: messageId,
    user_id: users.b.id,
    receipt_type: 'read',
  })
  if (read.error) throw read.error
  console.log('PASS recipient can record explicit read receipt')

  const senderReceipts = await clients.a
    .from('message_receipts')
    .select('receipt_type, user_id')
    .eq('message_id', messageId)
  if (senderReceipts.error) throw senderReceipts.error
  assert.deepEqual(
    new Set(senderReceipts.data.map((row) => row.receipt_type)),
    new Set(['delivered', 'read']),
  )
  console.log('PASS sender can observe recipient delivered/read evidence')

  const duplicateMessage = await clients.a.from('messages').insert({
    id: messageId,
    conversation_id: conversationId,
    sender_id: users.a.id,
    body: 'Duplicate payload',
    client_created_at: new Date(now).toISOString(),
    expires_at: new Date(now + 60_000).toISOString(),
  })
  assert.equal(duplicateMessage.error?.code, '23505')
  console.log('PASS stable message ID prevents duplicate cloud rows')

  const thirdMember = await clients.a.from('conversation_members').insert({
    conversation_id: conversationId,
    user_id: users.c.id,
    role: 'member',
  })
  assert.ok(thirdMember.error)
  console.log('PASS direct conversation enforces the two-member boundary')

  console.log('\nFieldMesh 0.3 durable internet messaging scenarios passed.')
}

try {
  await main()
} finally {
  for (const userId of createdUsers.reverse()) {
    await admin.auth.admin.deleteUser(userId)
  }
}
