# FieldMesh 0.7 — Groups, Permissions & Crypto Foundation

## Group model

Groups reuse the existing durable `conversations`, `conversation_members`, `messages` and receipt infrastructure. `conversation_members.is_admin` adds an admin permission without changing the original owner/member enum used by older migrations.

### Roles

| Action | Owner | Admin | Member |
| --- | --- | --- | --- |
| Read/send group messages | Yes | Yes | Yes |
| Add ordinary members | Yes | Yes | No |
| Remove ordinary members | Yes | Yes | No |
| Remove another admin | Yes | No | No |
| Promote/demote admins | Yes | No | No |
| Rename group | Yes | Yes | No |
| Rotate crypto epoch metadata | Yes | Yes | No |
| Leave group | Not yet | Yes | Yes |

Owner transfer is intentionally deferred. Until that exists, owners cannot leave or be removed.

## Contact privacy

Group invitations use the same `FM-XXXXXXXXXXXX` contact-code resolver as direct chat. The resolver remains an internal security-definer function; users do not receive broad SELECT access to other profile rows.

## Device public keys

`device_public_keys` stores only public cryptographic material for an active device owned by the authenticated user.

Supported foundation algorithm:

```text
ECDH-P256
```

Conversation members can resolve active device public keys only through `fieldmesh_conversation_device_keys(conversation_id)`. Raw RLS still exposes only the caller's own key rows.

Private keys are not accepted by the schema or RPC.

## Conversation key epochs

`conversation_crypto_epochs` stores metadata such as:

```text
conversation_id
epoch
suite = AES-GCM-256
created_by
reason
created_at
```

It does **not** store the symmetric conversation key. A group starts with epoch 1. Owner/admin can rotate the epoch metadata after a membership or device-security event.

## Browser crypto envelope

The TypeScript crypto helper provides a versioned envelope:

```text
version
suite
keyEpoch
nonce
ciphertext
```

AES-GCM additional authenticated data binds ciphertext to:

```text
conversationId
messageId
senderUserId
messageType
```

Changing any bound value causes authentication/decryption failure.

## Replay hook

`ReplayWindow` rejects a duplicate `(conversationId, messageId)` token until its expiry. This complements the existing stable message-ID uniqueness in the cloud mailbox. Persistent transport/device replay state is a later hardening step.

## Security boundary

FieldMesh 0.7 is a **crypto foundation**, not production E2E encryption.

Still required before that claim is valid:

1. durable device private-key provisioning/storage
2. authenticated device-to-device key agreement
3. per-device wrapped conversation/group-key distribution
4. ciphertext-only cloud message storage
5. complete member/device revocation and rekey flow
6. recovery/key-loss policy
7. protocol audit and cryptographic review
8. real radio/hardware integration
