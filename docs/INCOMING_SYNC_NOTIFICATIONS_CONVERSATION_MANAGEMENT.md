# ConnectX 0.8.1.6 — Incoming Sync, Notifications & Conversation Management

This patch closes the gap where incoming conversations/messages were only discovered while the Chats route was mounted. A signed-in app-wide sync agent now maintains the local workspace from any normal user screen, with polling plus Supabase Realtime wake-ups for new cloud messages.

## Incoming sync

- signed-in sync runs outside the Chats page
- app start, reconnect, foreground/focus and periodic checks trigger reconciliation
- a Realtime message INSERT acts as a wake-up signal when available
- incoming rows still pass through the same RLS-protected workspace/message sync
- delivered receipts are written when an incoming message reaches the local workspace
- Chats unread badges are available in bottom/desktop navigation

## Direct-chat opening reliability

Starting a direct conversation no longer waits for a full workspace refresh. After the canonical direct-conversation RPC returns, ConnectX restores the current user's view, hydrates only that conversation/participant snapshot, opens it, and lets the full workspace refresh continue in the background. Mobile composer errors now render inside the sheet.

## Conversation state

`conversation_user_state` stores per-user state without changing membership or deleting data for the other participant:

- `cleared_before` — old history is not downloaded again after Clear chat
- `hidden_at` — Delete chat for me hides the conversation for the current user
- `muted` — incoming alerts are suppressed for that conversation

A new incoming message automatically clears `hidden_at`, so a deleted-for-me conversation can reappear with only messages newer than the clear/delete watermark. Re-opening a direct conversation by ConnectX ID also restores it.

## Notifications

ConnectX exposes browser/PWA notification permission in Profile → App status.

When permission is granted:

- visible app on another screen → in-app notification toast
- backgrounded running PWA → service-worker system notification (best effort)
- notification click → existing app window is focused or `/messages?conversation=...` is opened
- muted chats do not surface notification alerts

This patch does **not** claim fully-closed push delivery. When the browser/PWA process is fully terminated, a server-originated Web Push sender/subscription pipeline is still required.

## Validation

```bash
npm run check
npm run test:notifications
npm run test:incoming-sync
npm run test:sync-reliability
npm run test:messenger-ui
npm run test:mobile-ux
npx supabase db reset
npm run test:local
npx supabase db lint
```
