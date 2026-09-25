# ConnectX 0.8.1.6 — Incoming Sync, Notifications & Conversation Management

0.8.1.6 makes incoming messaging app-wide instead of Chats-page-only. Signed-in users can discover new direct conversations and messages while on Home/Network/Profile, delivered receipts are created during incoming sync, unread badges update globally, notification permission/system alerts are available, direct chats open immediately after contact-code resolution, and per-user Clear/Delete/Mute chat state is persisted without affecting the other participant.

See `docs/INCOMING_SYNC_NOTIFICATIONS_CONVERSATION_MANAGEMENT.md`.

## ConnectX 0.8.1.5 — Mobile UX Consolidation & Information Hierarchy

0.8.1.5 consolidates the mobile product experience without changing messaging, delivery, offline workspace, Supabase authorization, crypto, mesh or gateway logic. Internal screens use a compact app header, Home becomes a connection-first dashboard with compact quick actions and recent chats, Auth moves the form above the fold on phones, Network becomes a condensed status list, Profile separates account/ConnectX ID/devices/app status, and SOS prioritizes the emergency action with a compact prototype warning and simplified location controls.

## ConnectX 0.8.1.4 — Familiar Messenger UI & Mobile Chat Experience

ConnectX is the user-facing brand for the resilient messaging platform. The validated internal protocol and database identifiers continue to use the FieldMesh name for backward compatibility. The platform is designed around three eventual communication paths:


## 0.8.1.4 familiar messenger UI

The normal Chats experience now uses familiar messenger interaction patterns while retaining ConnectX branding and the 0.8.1.3 reliability fixes. The chat list includes generated avatars, search, last-message/time metadata and unread badges. Mobile conversations use a full-screen flow with date separators, delivery-state ticks and a sticky circular send action. Desktop retains a two-pane layout with a compact compose panel.

See `docs/FAMILIAR_MESSENGER_UI.md`.

## 0.8.1.3 reliability hotfix

Mobile/PWA testing exposed a workspace reconciliation race after several messages. 0.8.1.3 coalesces overlapping workspace/conversation syncs, verifies missing conversations with an RLS-protected point read before any local purge, rejects incomplete participant snapshots, consumes the existing message cursor for incremental synchronization, and separates receipt refresh from message-body download. The background full-workspace interval is now 12 seconds instead of 3 seconds.

See `docs/MESSAGING_SYNC_RELIABILITY.md`.


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
- conversations missing from a list snapshot are retained until an RLS point read confirms access loss; only then are local workspace/queued records purged
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


## ConnectX PWA productization

ConnectX now owns its PWA lifecycle in the React application rather than silently auto-updating in the background. The app exposes install eligibility, standalone-mode detection, offline readiness, persistent-storage status, online/offline transitions, and service-worker update availability through a single PWA provider.

User-facing behavior:

- Chromium/Android/desktop install prompts are surfaced explicitly when the browser emits `beforeinstallprompt`.
- iPhone/iPad users receive Safari **Share → Add to Home Screen** guidance.
- new service-worker versions wait for explicit **Update now** confirmation instead of forcing an active session to refresh.
- loss/restoration of network connectivity is shown in plain language while the existing offline workspace remains available.
- the Profile page contains a PWA status card for install state, offline shell, persistent storage and update checks.
- ConnectX retains its offline-first IndexedDB queues; the service worker only provides the application shell/static asset layer.

See `docs/PWA_PRODUCTIZATION.md` for lifecycle and acceptance details.

## Mobile preview & responsive UX

ConnectX includes a phone-first user experience on small screens: compact branded navigation, a single-pane chat list → conversation flow, mobile bottom sheets, safe-area-aware controls, and touch-friendly interaction targets. Developer Mode also exposes `/developer/mobile-preview` for realistic phone/tablet viewport review without adding mobile-only behavior to the normal navigation.
