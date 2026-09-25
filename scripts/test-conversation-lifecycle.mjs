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
      try { value = JSON.parse(value) } catch { value = value.slice(1, -1) }
    }
    env[key] = value
  }
  return env
}
function dictionaryDefault(value) {
  if (!value) return undefined
  try { const parsed = JSON.parse(value); return parsed.default ?? Object.values(parsed)[0] } catch { return undefined }
}
function required(value, label) { if (!value) throw new Error(`Missing ${label}`); return value }
function makeClient(url, key) {
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } })
}

const env = parseShellEnv(execFileSync('npx', ['supabase', 'status', '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }))
const url = required(env.API_URL ?? env.SUPABASE_URL, 'API URL')
const publishableKey = required(env.PUBLISHABLE_KEY ?? env.SUPABASE_PUBLISHABLE_KEY ?? dictionaryDefault(env.PUBLISHABLE_KEYS) ?? env.ANON_KEY ?? env.SUPABASE_ANON_KEY, 'publishable key')
const secretKey = required(env.SECRET_KEY ?? env.SUPABASE_SECRET_KEY ?? dictionaryDefault(env.SECRET_KEYS) ?? env.SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY, 'secret key')
const admin = makeClient(url, secretKey)
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
const password = 'ConnectX-lifecycle-test-2026!'
const created = []

async function createUser(label) {
  const email = `connectx-life-${label}-${suffix}@example.test`
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: `Lifecycle ${label}` } })
  if (error) throw error
  created.push(data.user.id)
  const client = makeClient(url, publishableKey)
  const signed = await client.auth.signInWithPassword({ email, password })
  if (signed.error) throw signed.error
  return { user: data.user, client }
}
async function fieldMeshId(client, userId) {
  const result = await client.from('profiles').select('fieldmesh_user_id').eq('id', userId).single()
  if (result.error) throw result.error
  return result.data.fieldmesh_user_id
}
async function insertMessage(client, userId, conversationId, body) {
  const now = Date.now()
  const id = crypto.randomUUID()
  const result = await client.from('messages').insert({
    id,
    conversation_id: conversationId,
    sender_id: userId,
    body,
    client_created_at: new Date(now).toISOString(),
    expires_at: new Date(now + 60_000).toISOString(),
  }).select('id').single()
  if (result.error) throw result.error
  return id
}

async function main() {
  const a = await createUser('a')
  const b = await createUser('b')
  const bId = await fieldMeshId(b.client, b.user.id)
  const bCode = `FM-${bId.replaceAll('-', '').slice(-12).toUpperCase()}`

  const createdByA = await a.client.rpc('fieldmesh_create_direct_conversation_by_contact', { p_contact: bCode })
  if (createdByA.error) throw createdByA.error
  const conversationId = createdByA.data
  assert.ok(conversationId)
  await insertMessage(a.client, a.user.id, conversationId, 'hello from A')

  const bConversations = await b.client.from('conversations').select('id').eq('id', conversationId)
  if (bConversations.error) throw bConversations.error
  assert.equal(bConversations.data.length, 1)
  const bMessages = await b.client.from('messages').select('body').eq('conversation_id', conversationId)
  if (bMessages.error) throw bMessages.error
  assert.equal(bMessages.data.some((row) => row.body === 'hello from A'), true)
  console.log('PASS recipient can discover the canonical conversation and incoming message without creating the chat first')

  const mute = await b.client.rpc('fieldmesh_set_conversation_muted', { p_conversation_id: conversationId, p_muted: true })
  if (mute.error) throw mute.error
  let state = await b.client.from('conversation_user_state').select('muted, hidden_at, cleared_before').eq('conversation_id', conversationId).single()
  if (state.error) throw state.error
  assert.equal(state.data.muted, true)
  console.log('PASS notification mute preference is persisted per user and conversation')

  const clear = await b.client.rpc('fieldmesh_clear_conversation_for_me', { p_conversation_id: conversationId })
  if (clear.error) throw clear.error
  state = await b.client.from('conversation_user_state').select('muted, hidden_at, cleared_before').eq('conversation_id', conversationId).single()
  if (state.error) throw state.error
  assert.ok(state.data.cleared_before)
  assert.equal(state.data.hidden_at, null)
  console.log('PASS clear-chat watermark is private to the current user')

  const del = await b.client.rpc('fieldmesh_delete_conversation_for_me', { p_conversation_id: conversationId })
  if (del.error) throw del.error
  state = await b.client.from('conversation_user_state').select('muted, hidden_at, cleared_before').eq('conversation_id', conversationId).single()
  if (state.error) throw state.error
  assert.ok(state.data.hidden_at)
  assert.ok(state.data.cleared_before)
  console.log('PASS delete-chat-for-me hides and clears only the current user view')

  const aState = await a.client.from('conversation_user_state').select('conversation_id').eq('conversation_id', conversationId)
  if (aState.error) throw aState.error
  assert.equal(aState.data.length, 0)
  console.log('PASS deleting for one user does not modify the other participant state')

  await insertMessage(a.client, a.user.id, conversationId, 'message after delete')
  state = await b.client.from('conversation_user_state').select('hidden_at, cleared_before, muted').eq('conversation_id', conversationId).single()
  if (state.error) throw state.error
  assert.equal(state.data.hidden_at, null)
  assert.ok(state.data.cleared_before)
  assert.equal(state.data.muted, true)
  console.log('PASS a new incoming message automatically restores a deleted-for-me conversation without restoring old history')

  const restore = await b.client.rpc('fieldmesh_restore_conversation_for_me', { p_conversation_id: conversationId })
  if (restore.error) throw restore.error
  const unmute = await b.client.rpc('fieldmesh_set_conversation_muted', { p_conversation_id: conversationId, p_muted: false })
  if (unmute.error) throw unmute.error
  console.log('PASS restore and unmute RPCs remain available to conversation members')

  const outsider = await createUser('outsider')
  const forbidden = await outsider.client.rpc('fieldmesh_delete_conversation_for_me', { p_conversation_id: conversationId })
  assert.ok(forbidden.error)
  console.log('PASS unrelated users cannot mutate another conversation state')

  console.log('\nConnectX 0.8.1.6 conversation lifecycle scenarios passed.')
}

try {
  await main()
} finally {
  for (const userId of created.reverse()) {
    await admin.auth.admin.deleteUser(userId).catch(() => undefined)
  }
}
