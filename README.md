# FieldMesh 0.3 — Durable Internet Messaging

This patch builds the first real cloud messaging path on top of the validated 0.2.1 identity and RLS foundation.

## Scope

- Durable `messages` mailbox in Supabase.
- Explicit `delivered` and `read` receipts; cloud submission is not treated as recipient delivery.
- Stable client-generated message IDs for duplicate suppression.
- Local IndexedDB cloud outbox with retry/backoff and expiry.
- Per-auth-user local storage scoping.
- Separate local cloud delivery-attempt records.
- Direct conversation creation by stable FieldMesh User ID without exposing a global profile directory.
- Direct conversations limited to two members.
- Conversation participant summaries only for members.
- Conversation list, latest message, unread count and message status UI at `/messages`.
- Existing `/simulator` preserved.
- Automated local RLS and mailbox scenarios.

## Validation

```bash
npm run check
npx supabase db reset
npm run test:local
```

Only after local validation passes:

```bash
npx supabase db push
```

## Acceptance flow

1. Register two accounts in separate browser profiles/incognito windows.
2. Copy User B's stable FieldMesh User ID.
3. User A opens `/messages`, creates a direct conversation, and sends a message.
4. User B can sign in later and retrieve the already-submitted message.
5. A sees `delivered` after B synchronizes and `read` after B opens the conversation.
6. With network unavailable, sending remains queued locally and retries after connectivity returns.
7. Reloading preserves local queue/message state.
8. `/simulator` still passes the 0.1 queue/retry/dedup tests.

0.3 is cloud/internet messaging only. Hybrid LoRa ↔ gateway ↔ internet routing remains a later phase.
