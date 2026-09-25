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
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
}

const statusOutput = execFileSync('npx', ['supabase', 'status', '-o', 'env'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
})
const env = parseShellEnv(statusOutput)
const url = requireValue(env.API_URL ?? env.SUPABASE_URL, 'API URL')
const publishableKey = requireValue(
  env.PUBLISHABLE_KEY ?? env.SUPABASE_PUBLISHABLE_KEY ?? defaultDictionaryValue(env.PUBLISHABLE_KEYS) ??
    defaultDictionaryValue(env.SUPABASE_PUBLISHABLE_KEYS) ?? env.ANON_KEY ?? env.SUPABASE_ANON_KEY,
  'publishable/anon key',
)
const secretKey = requireValue(
  env.SECRET_KEY ?? env.SUPABASE_SECRET_KEY ?? defaultDictionaryValue(env.SECRET_KEYS) ??
    defaultDictionaryValue(env.SUPABASE_SECRET_KEYS) ?? env.SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY,
  'secret/service-role key',
)

const admin = makeClient(url, secretKey)
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
const password = 'FieldMesh-test-2026!'
const specs = [
  { key: 'a', email: `fieldmesh-a-${suffix}@example.test`, displayName: 'FieldMesh A' },
  { key: 'b', email: `fieldmesh-b-${suffix}@example.test`, displayName: 'FieldMesh B' },
  { key: 'c', email: `fieldmesh-c-${suffix}@example.test`, displayName: 'FieldMesh C' },
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

async function ownProfile(client, userId) {
  const result = await client.from('profiles').select('*').eq('id', userId).single()
  if (result.error) throw result.error
  return result.data
}

async function main() {
  const users = {}
  const clients = {}
  for (const spec of specs) {
    users[spec.key] = await createUser(spec)
    clients[spec.key] = await signIn(spec)
  }

  const profileA = await ownProfile(clients.a, users.a.id)
  assert.ok(profileA.fieldmesh_user_id)
  console.log('PASS user can read own profile with a stable FieldMesh user ID')

  const otherProfile = await clients.a.from('profiles').select('*').eq('id', users.b.id)
  assert.equal(otherProfile.error, null)
  assert.equal(otherProfile.data.length, 0)
  console.log('PASS profile RLS hides other users')

  const profileUpdate = await clients.a.rpc('fieldmesh_update_display_name', { p_display_name: 'FieldMesh A Updated' })
  if (profileUpdate.error) throw profileUpdate.error
  const updatedProfile = await ownProfile(clients.a, users.a.id)
  assert.equal(updatedProfile.display_name, 'FieldMesh A Updated')
  assert.equal(updatedProfile.fieldmesh_user_id, profileA.fieldmesh_user_id)
  console.log('PASS display name updates through the narrow profile RPC without changing canonical identity')

  const rawOwnProfileUpdate = await clients.a.from('profiles').update({ display_name: 'Raw write forbidden' }).eq('id', users.a.id)
  assert.ok(rawOwnProfileUpdate.error, 'authenticated raw profile updates must be denied')
  console.log('PASS authenticated clients cannot update profile rows directly')

  const createdDevice = await clients.a.rpc('fieldmesh_create_device', { p_label: 'A test radio' })
  if (createdDevice.error) throw createdDevice.error
  assert.equal(typeof createdDevice.data, 'string')
  const ownDevice = await clients.a.from('devices').select('*').eq('id', createdDevice.data).single()
  if (ownDevice.error) throw ownDevice.error
  assert.equal(ownDevice.data.owner_id, users.a.id)
  assert.ok(ownDevice.data.fieldmesh_device_id)
  console.log('PASS device identity is created through the owned-device RPC')

  const rawDeviceInsert = await clients.a.from('devices').insert({ owner_id: users.a.id, label: 'Forbidden raw device' })
  assert.ok(rawDeviceInsert.error, 'authenticated raw device inserts must be denied')
  console.log('PASS authenticated clients cannot create devices by raw table insert')

  const bReadsADevice = await clients.b.from('devices').select('*').eq('id', ownDevice.data.id)
  assert.equal(bReadsADevice.error, null)
  assert.equal(bReadsADevice.data.length, 0)
  console.log('PASS device RLS hides another user devices')

  const profileB = await ownProfile(clients.b, users.b.id)
  const direct = await clients.a.rpc('fieldmesh_create_direct_conversation', {
    p_recipient_fieldmesh_user_id: profileB.fieldmesh_user_id,
  })
  if (direct.error) throw direct.error
  const conversationId = direct.data
  assert.equal(typeof conversationId, 'string')
  console.log('PASS direct conversation creation is RPC-only')

  const ownerMembership = await clients.a
    .from('conversation_members')
    .select('role')
    .eq('conversation_id', conversationId)
    .eq('user_id', users.a.id)
    .single()
  if (ownerMembership.error) throw ownerMembership.error
  assert.equal(ownerMembership.data.role, 'owner')

  const bConversation = await clients.b.from('conversations').select('id').eq('id', conversationId)
  assert.equal(bConversation.error, null)
  assert.equal(bConversation.data.length, 1)
  const cConversation = await clients.c.from('conversations').select('id').eq('id', conversationId)
  assert.equal(cConversation.error, null)
  assert.equal(cConversation.data.length, 0)
  console.log('PASS direct conversation visibility remains membership-scoped')

  const rawConversation = await clients.a.from('conversations').insert({
    id: crypto.randomUUID(), kind: 'group', title: 'Forbidden raw group', created_by: users.a.id,
  })
  assert.ok(rawConversation.error, 'raw conversation creation must be denied')
  console.log('PASS authenticated clients cannot create conversations by raw table insert')

  const rawMembership = await clients.a.from('conversation_members').insert({
    conversation_id: conversationId,
    user_id: users.c.id,
    role: 'member',
  })
  assert.ok(rawMembership.error, 'raw membership insertion must be denied')
  console.log('PASS conversation membership cannot be mutated directly by the creator')

  const rawDeleteRecipient = await clients.a
    .from('conversation_members')
    .delete()
    .eq('conversation_id', conversationId)
    .eq('user_id', users.b.id)
  assert.ok(rawDeleteRecipient.error, 'direct recipient removal must be denied')
  console.log('PASS direct-conversation membership cannot be reassigned through raw writes')

  console.log('\nFieldMesh 0.7.1 identity/authorization scenarios passed.')
}

try {
  await main()
} finally {
  for (const userId of createdUsers.reverse()) {
    await admin.auth.admin.deleteUser(userId)
  }
}
