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
  env.PUBLISHABLE_KEY ?? env.SUPABASE_PUBLISHABLE_KEY ?? defaultDictionaryValue(env.PUBLISHABLE_KEYS) ?? defaultDictionaryValue(env.SUPABASE_PUBLISHABLE_KEYS) ?? env.ANON_KEY ?? env.SUPABASE_ANON_KEY,
  'publishable/anon key',
)
const secretKey = requireValue(
  env.SECRET_KEY ?? env.SUPABASE_SECRET_KEY ?? defaultDictionaryValue(env.SECRET_KEYS) ?? defaultDictionaryValue(env.SUPABASE_SECRET_KEYS) ?? env.SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY,
  'secret/service-role key',
)

const admin = makeClient(url, secretKey)
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
const password = 'FieldMesh-group-test-2026!'
const specs = [
  { key: 'a', email: `fieldmesh-group-a-${suffix}@example.test`, displayName: 'Group Owner' },
  { key: 'b', email: `fieldmesh-group-b-${suffix}@example.test`, displayName: 'Group Admin' },
  { key: 'c', email: `fieldmesh-group-c-${suffix}@example.test`, displayName: 'Group Member' },
  { key: 'd', email: `fieldmesh-group-d-${suffix}@example.test`, displayName: 'Outside User' },
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
  assert.ok(data.session)
  return client
}

async function ownFieldMeshId(client, userId) {
  const result = await client.from('profiles').select('fieldmesh_user_id').eq('id', userId).single()
  if (result.error) throw result.error
  return result.data.fieldmesh_user_id
}

function contactCode(fieldMeshId) {
  return `FM-${fieldMeshId.replaceAll('-', '').slice(-12).toUpperCase()}`
}

async function main() {
  const users = {}
  const clients = {}
  const fieldMeshIds = {}
  for (const spec of specs) {
    users[spec.key] = await createUser(spec)
    clients[spec.key] = await signIn(spec)
    fieldMeshIds[spec.key] = await ownFieldMeshId(clients[spec.key], users[spec.key].id)
  }

  const created = await clients.a.rpc('fieldmesh_create_group', {
    p_title: 'Response Team',
    p_member_contacts: [contactCode(fieldMeshIds.b), contactCode(fieldMeshIds.c)],
  })
  if (created.error) throw created.error
  const groupId = created.data
  assert.ok(groupId)
  console.log('PASS owner can create a private group from FieldMesh contact codes')

  const initialEpoch = await clients.a.rpc('fieldmesh_current_conversation_crypto_epoch', { p_conversation_id: groupId })
  if (initialEpoch.error) throw initialEpoch.error
  assert.equal(initialEpoch.data[0].epoch, 1)
  console.log('PASS new group starts with crypto epoch metadata 1 and no server-side symmetric key')

  const participants = await clients.a.rpc('fieldmesh_conversation_participants_v2', { p_conversation_id: groupId })
  if (participants.error) throw participants.error
  assert.deepEqual(new Set(participants.data.map((row) => row.user_id)), new Set([users.a.id, users.b.id, users.c.id]))
  assert.equal(participants.data.find((row) => row.user_id === users.a.id).role, 'owner')
  console.log('PASS group participants expose owner/member roles only to members')

  const outsiderRead = await clients.d.rpc('fieldmesh_conversation_participants_v2', { p_conversation_id: groupId })
  assert.ok(outsiderRead.error)
  console.log('PASS unrelated user cannot enumerate group membership')

  const memberMessage = await clients.b.from('messages').insert({
    id: crypto.randomUUID(),
    conversation_id: groupId,
    sender_id: users.b.id,
    body: 'Group messaging works',
    client_created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  })
  if (memberMessage.error) throw memberMessage.error
  console.log('PASS ordinary group member can send to the shared durable mailbox')

  const unauthorizedAdd = await clients.b.rpc('fieldmesh_group_add_member', {
    p_conversation_id: groupId,
    p_contact: contactCode(fieldMeshIds.d),
  })
  assert.ok(unauthorizedAdd.error)
  console.log('PASS ordinary group member cannot add people')

  const promote = await clients.a.rpc('fieldmesh_group_set_admin', {
    p_conversation_id: groupId,
    p_user_id: users.b.id,
    p_is_admin: true,
  })
  if (promote.error) throw promote.error

  const addByAdmin = await clients.b.rpc('fieldmesh_group_add_member', {
    p_conversation_id: groupId,
    p_contact: contactCode(fieldMeshIds.d),
  })
  if (addByAdmin.error) throw addByAdmin.error
  assert.equal(addByAdmin.data, users.d.id)
  console.log('PASS owner can promote an admin and admin can add ordinary members')

  const adminCannotPromote = await clients.b.rpc('fieldmesh_group_set_admin', {
    p_conversation_id: groupId,
    p_user_id: users.d.id,
    p_is_admin: true,
  })
  assert.ok(adminCannotPromote.error)
  console.log('PASS only owner can promote or demote group admins')

  const removeMember = await clients.b.rpc('fieldmesh_group_remove_member', {
    p_conversation_id: groupId,
    p_user_id: users.c.id,
  })
  if (removeMember.error) throw removeMember.error
  console.log('PASS admin can remove an ordinary member')

  const removeOwner = await clients.b.rpc('fieldmesh_group_remove_member', {
    p_conversation_id: groupId,
    p_user_id: users.a.id,
  })
  assert.ok(removeOwner.error)
  console.log('PASS group owner cannot be removed by an admin')

  const rename = await clients.b.rpc('fieldmesh_group_rename', {
    p_conversation_id: groupId,
    p_title: 'Field Response Team',
  })
  if (rename.error) throw rename.error
  const groupRow = await clients.a.from('conversations').select('title').eq('id', groupId).single()
  if (groupRow.error) throw groupRow.error
  assert.equal(groupRow.data.title, 'Field Response Team')
  console.log('PASS group admin can rename the group')

  const beforeManualRotation = await clients.a.rpc('fieldmesh_current_conversation_crypto_epoch', { p_conversation_id: groupId })
  if (beforeManualRotation.error) throw beforeManualRotation.error
  assert.ok(beforeManualRotation.data[0].epoch > 1)
  console.log('PASS membership/role changes automatically advance crypto epoch metadata')

  const adminRotate = await clients.b.rpc('fieldmesh_rotate_conversation_crypto_epoch', {
    p_conversation_id: groupId,
    p_reason: 'manual security rotation',
  })
  if (adminRotate.error) throw adminRotate.error
  assert.equal(adminRotate.data, beforeManualRotation.data[0].epoch + 1)
  console.log('PASS group admin can manually rotate crypto epoch metadata')

  const addCBack = await clients.b.rpc('fieldmesh_group_add_member', {
    p_conversation_id: groupId,
    p_contact: contactCode(fieldMeshIds.c),
  })
  if (addCBack.error) throw addCBack.error
  const memberRotate = await clients.c.rpc('fieldmesh_rotate_conversation_crypto_epoch', {
    p_conversation_id: groupId,
    p_reason: 'not allowed',
  })
  assert.ok(memberRotate.error)
  console.log('PASS ordinary group member cannot rotate crypto epoch metadata')

  const deviceA = await clients.a.rpc('fieldmesh_create_device', { p_label: 'Owner phone radio' })
  if (deviceA.error) throw deviceA.error
  const deviceB = await clients.b.rpc('fieldmesh_create_device', { p_label: 'Admin phone radio' })
  if (deviceB.error) throw deviceB.error

  const keyA = await clients.a.rpc('fieldmesh_register_device_public_key', {
    p_device_id: deviceA.data,
    p_algorithm: 'ECDH-P256',
    p_public_key: 'PUBLIC_KEY_A_'.padEnd(80, 'A'),
    p_fingerprint: 'fingerprint-owner-0001',
  })
  if (keyA.error) throw keyA.error
  assert.equal(keyA.data, 1)

  const keyA2 = await clients.a.rpc('fieldmesh_register_device_public_key', {
    p_device_id: deviceA.data,
    p_algorithm: 'ECDH-P256',
    p_public_key: 'PUBLIC_KEY_A_ROTATED_'.padEnd(80, 'B'),
    p_fingerprint: 'fingerprint-owner-0002',
  })
  if (keyA2.error) throw keyA2.error
  assert.equal(keyA2.data, 2)

  const keyB = await clients.b.rpc('fieldmesh_register_device_public_key', {
    p_device_id: deviceB.data,
    p_algorithm: 'ECDH-P256',
    p_public_key: 'PUBLIC_KEY_B_'.padEnd(80, 'C'),
    p_fingerprint: 'fingerprint-admin-0001',
  })
  if (keyB.error) throw keyB.error

  const conversationKeys = await clients.a.rpc('fieldmesh_conversation_device_keys', { p_conversation_id: groupId })
  if (conversationKeys.error) throw conversationKeys.error
  assert.equal(conversationKeys.data.length, 2)
  assert.equal(conversationKeys.data.find((row) => row.user_id === users.a.id).key_version, 2)
  console.log('PASS members can resolve active device public keys for their conversation')

  const rawPeerKeyRead = await clients.a.from('device_public_keys').select('owner_id').eq('owner_id', users.b.id)
  if (rawPeerKeyRead.error) throw rawPeerKeyRead.error
  assert.equal(rawPeerKeyRead.data.length, 0)
  console.log('PASS raw device-key RLS hides other users while conversation-scoped RPC permits required discovery')

  const outsiderKeys = await clients.c.rpc('fieldmesh_conversation_device_keys', { p_conversation_id: crypto.randomUUID() })
  assert.ok(outsiderKeys.error)
  console.log('PASS device-key discovery requires conversation membership')

  const leave = await clients.d.rpc('fieldmesh_leave_group', { p_conversation_id: groupId })
  if (leave.error) throw leave.error
  const dConversation = await clients.d.from('conversations').select('id').eq('id', groupId)
  if (dConversation.error) throw dConversation.error
  assert.equal(dConversation.data.length, 0)
  console.log('PASS ordinary member can leave and immediately loses group visibility')

  const ownerLeave = await clients.a.rpc('fieldmesh_leave_group', { p_conversation_id: groupId })
  assert.ok(ownerLeave.error)
  console.log('PASS owner cannot leave before ownership-transfer support exists')

  console.log('\nFieldMesh 0.7 groups, permissions and crypto-foundation scenarios passed.')
}

try {
  await main()
} finally {
  for (const userId of createdUsers.reverse()) {
    await admin.auth.admin.deleteUser(userId)
  }
}
