# ConnectX 0.8.1 — True Offline Conversation Workspace

ConnectX is the user-facing brand for the resilient messaging platform. The validated internal protocol and database identifiers continue to use the FieldMesh name for backward compatibility. The platform is designed around three eventual communication paths:

1. Internet → Internet
2. LoRa mesh → LoRa mesh
3. LoRa → Gateway → Internet (and reverse)

0.8.0 introduced the canonical `FieldMeshMessage` and durable `DeliveryCoordinator`. 0.8.1 makes the **conversation workspace itself local-first** so a previously synchronized user can reopen Chats without Internet instead of depending on a fresh cloud conversation-list request.

## Offline workspace pipeline

```text
App / Chats opens
       ↓
IndexedDB v6 workspace registry
       ↓
Cached conversations + participants + messages render immediately
       ↓
Internet available?
       ├── no  → read cached history + queue new messages locally
       └── yes → authoritative workspace sync + message sync + retry queue
```

## What changed in 0.8.1

- IndexedDB schema version 6
- durable `workspaceConversations`
- durable `workspaceParticipants`
- durable `workspaceSyncState`
- per-conversation `workspaceSyncCursors`
- Chats render from IndexedDB instead of remote React state
- direct-chat labels and group member/role metadata survive offline reopen
- existing cached messages remain readable while offline
- outgoing text to an existing cached conversation still enters the 0.8.0 canonical delivery queue
- remote workspace replacement is committed only after a complete successful metadata fetch
- conversations removed by an authoritative successful sync are purged from the local workspace/queued data
- remote-only creation and group-permission controls are disabled while offline
- developer diagnostics at `/developer/workspace`

See `docs/OFFLINE_CONVERSATION_WORKSPACE.md`.

## Important boundaries

0.8.1 does **not** create new conversations or mutate group membership offline. Those operations continue to require authoritative Supabase RPCs and 0.7.1 authorization rules.

Normal Chats still register the Internet delivery adapter only. Radio/Gateway routing remains scheduled for the next software-alpha routing/integration stages.

0.7 crypto remains a foundation, not production E2E encryption. Cloud chat bodies are still plaintext.

## Validation

```bash
npm run check
npm run test:workspace
npm run test:delivery
npm run test:architecture
npm run test:crypto
npm run test:authz
npm run test:ui
npm run test:sos
npm run test:gateway
npm run test:mesh
npx supabase db reset
npm run test:local
npx supabase db lint
```

0.8.1 adds **no Supabase migration**. It adds IndexedDB schema version 6 locally.
