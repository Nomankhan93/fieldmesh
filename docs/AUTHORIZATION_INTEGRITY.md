# FieldMesh 0.7.1 — Authorization Integrity & Immutable Identity Hardening

0.7.1 closes the raw-table mutation paths left by the earlier identity/conversation schema. The security model now treats RLS and PostgreSQL table privileges as separate layers: authenticated clients may read rows permitted by RLS, but structural mutations are not granted directly.

## Mutation boundary

Authenticated clients no longer receive raw `INSERT`, `UPDATE` or `DELETE` privileges on:

- `profiles`
- `devices`
- `conversations`
- `conversation_members`

Normal application changes use narrow security-definer RPCs instead:

- `fieldmesh_update_display_name(text)`
- `fieldmesh_create_device(text)`
- `fieldmesh_revoke_device(uuid)`
- the existing direct/group conversation-management RPCs from 0.3–0.7

This means a custom Supabase client cannot bypass group-admin checks, owner protection, membership-driven crypto-epoch rotation or canonical direct-conversation creation by writing those tables directly.

## Immutable canonical identities

Database triggers now reject updates to identity-defining columns even for privileged table writes:

- profile: `id`, `fieldmesh_user_id`, `created_at`
- device: `id`, `owner_id`, `fieldmesh_device_id`, `created_at`
- conversation: `id`, `kind`, `created_by`, `created_at`
- membership: `conversation_id`, `user_id`, `role`, `joined_at`

A direct conversation title is also immutable. Group title changes continue through `fieldmesh_group_rename(...)`.

Device revocation is terminal: once a device reaches `revoked`, the normal lifecycle cannot reactivate it. The revocation RPC is idempotent.

## Direct conversations

Direct conversations must be created by the canonical direct-conversation RPC. Authenticated clients cannot insert/delete/update membership rows, so an existing recipient cannot be replaced with another user to inherit historical message access.

The original two-member database limit remains in place as an additional invariant.

## Groups

Group membership, admin promotion/demotion and renaming continue to use the 0.7 permission RPCs. Raw mutation attempts fail before RLS workflow logic can be bypassed. Membership/role changes that require crypto-epoch advancement therefore stay inside the approved RPC path.

## Validation

`npm run test:authz` specifically exercises adversarial mutation attempts, including:

- rewriting a canonical FieldMesh user ID;
- rewriting a FieldMesh device ID;
- replacing a direct-chat recipient;
- changing conversation kind/creator;
- adding a group member through raw table access;
- bypassing group rename/admin RPCs;
- verifying approved RPCs still work;
- terminal/idempotent device revocation.

The test is also included in `npm run test:local`.
