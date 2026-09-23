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

async function main() {
  const users = {}
  const clients = {}

  for (const spec of specs) {
    users[spec.key] = await createUser(spec)
    clients[spec.key] = await signIn(spec)
  }

  const ownProfile = await clients.a.from('profiles').select('*').eq('id', users.a.id)
  assert.equal(ownProfile.error, null)
  assert.equal(ownProfile.data.length, 1, 'A should read own profile')
  assert.ok(ownProfile.data[0].fieldmesh_user_id, 'stable FieldMesh user ID should exist')
  console.log('PASS user can read own profile')

  const otherProfile = await clients.a.from('profiles').select('*').eq('id', users.b.id)
  assert.equal(otherProfile.error, null)
  assert.equal(otherProfile.data.length, 0, 'A must not read B profile')
  console.log('PASS profile RLS hides other users')

  const blockedProfileUpdate = await clients.a
    .from('profiles')
    .update({ display_name: 'Should not change' })
    .eq('id', users.b.id)
    .select('id')
  assert.equal(blockedProfileUpdate.error, null)
  assert.equal(blockedProfileUpdate.data.length, 0, 'A must not update B profile')
  console.log('PASS profile RLS blocks cross-user updates')

  const ownDevice = await clients.a
    .from('devices')
    .insert({ owner_id: users.a.id, label: 'A test radio' })
    .select('*')
    .single()
  if (ownDevice.error) throw ownDevice.error
  assert.equal(ownDevice.data.owner_id, users.a.id)
  console.log('PASS user can create own device identity')

  const foreignDeviceInsert = await clients.a
    .from('devices')
    .insert({ owner_id: users.b.id, label: 'Forbidden device' })
  assert.ok(foreignDeviceInsert.error, 'A inserting a B-owned device must be rejected')
  console.log('PASS device RLS rejects foreign ownership')

  const bReadsADevice = await clients.b.from('devices').select('*').eq('id', ownDevice.data.id)
  assert.equal(bReadsADevice.error, null)
  assert.equal(bReadsADevice.data.length, 0, 'B must not read A device')
  console.log('PASS device RLS hides another user devices')

  const conversationId = crypto.randomUUID()
  const createdConversation = await clients.a
    .from('conversations')
    .insert({ id: conversationId, kind: 'direct', created_by: users.a.id })
    .select('id, created_by')
    .single()
  if (createdConversation.error) throw createdConversation.error
  assert.equal(createdConversation.data.created_by, users.a.id)
  console.log('PASS creator can create and read own conversation')

  const ownerMembership = await clients.a
    .from('conversation_members')
    .select('role')
    .eq('conversation_id', conversationId)
    .eq('user_id', users.a.id)
    .single()

  if (ownerMembership.error) throw ownerMembership.error
  assert.equal(ownerMembership.data.role, 'owner')
  console.log('PASS creator automatically becomes conversation owner/member')

  const bBeforeMembership = await clients.b.from('conversations').select('id').eq('id', conversationId)
  assert.equal(bBeforeMembership.error, null)
  assert.equal(bBeforeMembership.data.length, 0)
  console.log('PASS non-member cannot read conversation')

  const addB = await clients.a.from('conversation_members').insert({
    conversation_id: conversationId,
    user_id: users.b.id,
    role: 'member',
  })
  if (addB.error) throw addB.error

  const bAfterMembership = await clients.b.from('conversations').select('id').eq('id', conversationId)
  assert.equal(bAfterMembership.error, null)
  assert.equal(bAfterMembership.data.length, 1)
  console.log('PASS authorized member can read conversation')

  const cStillBlocked = await clients.c.from('conversations').select('id').eq('id', conversationId)
  assert.equal(cStillBlocked.error, null)
  assert.equal(cStillBlocked.data.length, 0)
  console.log('PASS unrelated user remains isolated')

  const bConversationId = crypto.randomUUID()
  const bConversation = await clients.b
    .from('conversations')
    .insert({ id: bConversationId, kind: 'group', title: 'B private group', created_by: users.b.id })
  if (bConversation.error) throw bConversation.error

  const unauthorizedMembership = await clients.a.from('conversation_members').insert({
    conversation_id: bConversationId,
    user_id: users.c.id,
    role: 'member',
  })
  assert.ok(unauthorizedMembership.error, 'non-creator must not manage another conversation membership')
  console.log('PASS only conversation creator can add members')

  console.log('\nFieldMesh 0.2 local Auth/RLS scenarios passed.')
}

try {
  await main()
} finally {
  for (const userId of createdUsers.reverse()) {
    await admin.auth.admin.deleteUser(userId)
  }
}
