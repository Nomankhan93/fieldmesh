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
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'],
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
const specs = ['a', 'b', 'c', 'd'].map((key) => ({
  key,
  email: `fieldmesh-authz-${key}-${suffix}@example.test`,
  displayName: `AuthZ ${key.toUpperCase()}`,
}))
const createdUsers = []

async function createUser(spec) {
  const { data, error } = await admin.auth.admin.createUser({
    email: spec.email, password, email_confirm: true, user_metadata: { display_name: spec.displayName },
  })
  if (error) throw error
  createdUsers.push(data.user.id)
  return data.user
}

async function signIn(spec) {
  const client = makeClient(url, publishableKey)
  const { data, error } = await client.auth.signInWithPassword({ email: spec.email, password })
  if (error) throw error
  assert.ok(data.session)
  return client
}

async function profile(client, userId) {
  const result = await client.from('profiles').select('id, fieldmesh_user_id, display_name').eq('id', userId).single()
  if (result.error) throw result.error
  return result.data
}

function contactCode(fieldMeshId) {
  return `FM-${fieldMeshId.replaceAll('-', '').slice(-12).toUpperCase()}`
}

async function epoch(client, conversationId) {
  const result = await client.rpc('fieldmesh_current_conversation_crypto_epoch', { p_conversation_id: conversationId })
  if (result.error) throw result.error
  return result.data[0].epoch
}

async function main() {
  const users = {}
  const clients = {}
  const profiles = {}
  for (const spec of specs) {
    users[spec.key] = await createUser(spec)
    clients[spec.key] = await signIn(spec)
    profiles[spec.key] = await profile(clients[spec.key], users[spec.key].id)
  }

  const rawIdentityChange = await clients.a
    .from('profiles')
    .update({ fieldmesh_user_id: crypto.randomUUID() })
    .eq('id', users.a.id)
  assert.ok(rawIdentityChange.error)
  console.log('PASS authenticated user cannot rewrite their canonical FieldMesh user ID')

  const privilegedIdentityChange = await admin
    .from('profiles')
    .update({ fieldmesh_user_id: crypto.randomUUID() })
    .eq('id', users.a.id)
  assert.ok(privilegedIdentityChange.error, 'database invariant must reject canonical profile identity mutation')
  assert.match(privilegedIdentityChange.error.message, /profile identity fields are immutable/i)
  const profileAfter = await profile(clients.a, users.a.id)
  assert.equal(profileAfter.fieldmesh_user_id, profiles.a.fieldmesh_user_id)
  console.log('PASS database trigger preserves FieldMesh user ID even across privileged table updates')

  const deviceCreate = await clients.a.rpc('fieldmesh_create_device', { p_label: 'Immutable A device' })
  if (deviceCreate.error) throw deviceCreate.error
  const device = await clients.a.from('devices').select('id, fieldmesh_device_id, owner_id, status').eq('id', deviceCreate.data).single()
  if (device.error) throw device.error

  const rawDeviceIdentityChange = await clients.a
    .from('devices')
    .update({ fieldmesh_device_id: crypto.randomUUID() })
    .eq('id', device.data.id)
  assert.ok(rawDeviceIdentityChange.error)
  const privilegedDeviceIdentityChange = await admin
    .from('devices')
    .update({ fieldmesh_device_id: crypto.randomUUID() })
    .eq('id', device.data.id)
  assert.ok(privilegedDeviceIdentityChange.error)
  assert.match(privilegedDeviceIdentityChange.error.message, /device identity fields are immutable/i)
  console.log('PASS FieldMesh device ID and ownership are immutable database identities')

  const directCreate = await clients.a.rpc('fieldmesh_create_direct_conversation_by_contact', {
    p_contact: contactCode(profiles.b.fieldmesh_user_id),
  })
  if (directCreate.error) throw directCreate.error
  const directId = directCreate.data

  const rawRecipientDelete = await clients.a
    .from('conversation_members')
    .delete()
    .eq('conversation_id', directId)
    .eq('user_id', users.b.id)
  assert.ok(rawRecipientDelete.error)

  const rawRecipientReplace = await clients.a
    .from('conversation_members')
    .update({ user_id: users.c.id })
    .eq('conversation_id', directId)
    .eq('user_id', users.b.id)
  assert.ok(rawRecipientReplace.error)

  const directMembers = await clients.a.rpc('fieldmesh_conversation_participants_v2', { p_conversation_id: directId })
  if (directMembers.error) throw directMembers.error
  assert.deepEqual(new Set(directMembers.data.map((row) => row.user_id)), new Set([users.a.id, users.b.id]))
  console.log('PASS direct conversation recipient cannot be removed or replaced by raw client writes')

  const privilegedKindChange = await admin.from('conversations').update({ kind: 'group' }).eq('id', directId)
  assert.ok(privilegedKindChange.error)
  assert.match(privilegedKindChange.error.message, /conversation identity fields are immutable/i)
  const privilegedCreatorChange = await admin.from('conversations').update({ created_by: users.c.id }).eq('id', directId)
  assert.ok(privilegedCreatorChange.error)
  assert.match(privilegedCreatorChange.error.message, /conversation identity fields are immutable/i)
  console.log('PASS conversation kind and creator are immutable database identities')

  const groupCreate = await clients.a.rpc('fieldmesh_create_group', {
    p_title: 'Authorization Team',
    p_member_contacts: [contactCode(profiles.b.fieldmesh_user_id)],
  })
  if (groupCreate.error) throw groupCreate.error
  const groupId = groupCreate.data
  const epochBefore = await epoch(clients.a, groupId)

  const rawAdd = await clients.a.from('conversation_members').insert({
    conversation_id: groupId, user_id: users.c.id, role: 'member', is_admin: false,
  })
  assert.ok(rawAdd.error)
  const rawRename = await clients.a.from('conversations').update({ title: 'Raw rename' }).eq('id', groupId)
  assert.ok(rawRename.error)
  const epochAfterBypassAttempts = await epoch(clients.a, groupId)
  assert.equal(epochAfterBypassAttempts, epochBefore)
  console.log('PASS raw group membership/title bypass attempts are denied and cannot skip crypto-epoch workflow')

  const officialAdd = await clients.a.rpc('fieldmesh_group_add_member', {
    p_conversation_id: groupId,
    p_contact: contactCode(profiles.c.fieldmesh_user_id),
  })
  if (officialAdd.error) throw officialAdd.error
  assert.equal(await epoch(clients.a, groupId), epochBefore + 1)

  const officialAdmin = await clients.a.rpc('fieldmesh_group_set_admin', {
    p_conversation_id: groupId,
    p_user_id: users.b.id,
    p_is_admin: true,
  })
  if (officialAdmin.error) throw officialAdmin.error

  const rawAdmin = await clients.a
    .from('conversation_members')
    .update({ is_admin: true })
    .eq('conversation_id', groupId)
    .eq('user_id', users.c.id)
  assert.ok(rawAdmin.error)
  console.log('PASS group membership and admin-role mutations require approved RPC authorization')

  const officialRename = await clients.b.rpc('fieldmesh_group_rename', {
    p_conversation_id: groupId,
    p_title: 'Authorization Team Renamed',
  })
  if (officialRename.error) throw officialRename.error
  const groupRow = await clients.a.from('conversations').select('title').eq('id', groupId).single()
  if (groupRow.error) throw groupRow.error
  assert.equal(groupRow.data.title, 'Authorization Team Renamed')
  console.log('PASS approved group RPCs retain expected functionality after table-write lockdown')

  const revoke = await clients.a.rpc('fieldmesh_revoke_device', { p_device_id: device.data.id })
  if (revoke.error) throw revoke.error
  assert.equal(revoke.data, true)
  const revokeAgain = await clients.a.rpc('fieldmesh_revoke_device', { p_device_id: device.data.id })
  if (revokeAgain.error) throw revokeAgain.error
  assert.equal(revokeAgain.data, false)
  const revokedDevice = await clients.a.from('devices').select('status, revoked_at').eq('id', device.data.id).single()
  if (revokedDevice.error) throw revokedDevice.error
  assert.equal(revokedDevice.data.status, 'revoked')
  assert.ok(revokedDevice.data.revoked_at)
  console.log('PASS owned-device revocation is RPC-only, terminal and idempotent')

  console.log('\nFieldMesh 0.7.1 authorization-integrity scenarios passed.')
}

try {
  await main()
} finally {
  for (const userId of createdUsers.reverse()) {
    await admin.auth.admin.deleteUser(userId)
  }
}
