# FieldMesh 0.7 — Groups, Permissions & Crypto Foundation

FieldMesh is a resilient messaging prototype designed around three eventual communication paths:

1. Internet → Internet
2. LoRa mesh → LoRa mesh
3. LoRa → Gateway → Internet (and reverse)

0.7 keeps the validated durable messaging, mesh simulator, hybrid gateway, Location/SOS and simplified user shell while adding private group conversations, role-based group management and a deliberately staged cryptographic foundation.

## Groups

Users can create private groups from FieldMesh contact codes. Group roles are:

- **Owner** — rename group, add/remove members, promote/demote admins, rotate crypto epoch metadata
- **Admin** — rename group, add/remove ordinary members, rotate crypto epoch metadata
- **Member** — read/send group messages and leave the group

The owner is protected from removal and cannot leave until an ownership-transfer flow is implemented.

## Permission boundary

Group-management actions are enforced in Supabase security-definer RPCs rather than trusted only to the frontend. Unrelated users cannot enumerate group members or read/send group messages through RLS.

## Crypto foundation

0.7 adds:

- versioned **AES-GCM-256** browser envelope helpers
- conversation/message/sender/type binding through authenticated additional data (AAD)
- replay-window hooks keyed by conversation + logical message ID
- conversation crypto epoch metadata
- conversation-scoped active device public-key discovery
- **ECDH-P256 public-key registry** for owned active devices
- group-admin permission for epoch rotation after membership changes

Important boundary: **0.7 does not claim production end-to-end encryption.** Existing cloud chat bodies are still plaintext. Supabase stores public keys and key-epoch metadata only; conversation symmetric keys and device private keys are not stored by this foundation.

## Developer security diagnostics

Enable Developer Mode from **Profile → Advanced app settings**, then open:

```text
/developer/security
```

The page can run a local AES-GCM authenticated-encryption self-check and explains the current security boundary.

## Validation

```bash
npm run check
npm run test:crypto
npm run test:ui
npm run test:sos
npm run test:gateway
npm run test:mesh
npx supabase db reset
npm run test:local
```

0.7 adds this Supabase migration:

```text
20260924000200_groups_permissions_crypto_foundation.sql
```

After all local validation passes:

```bash
npx supabase db push
```
