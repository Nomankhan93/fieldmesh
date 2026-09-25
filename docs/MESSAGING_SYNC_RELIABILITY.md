# ConnectX 0.8.1.3 — Messaging Sync Reliability & Conversation Retention

This hotfix hardens the 0.8.1 offline workspace after mobile/PWA testing exposed a race where repeated full workspace syncs could overlap and a temporarily incomplete remote conversation list could be interpreted as authoritative removal.

## Reliability rules

1. **Workspace sync is single-flight per signed-in user.** Overlapping refresh triggers share the same in-flight synchronization instead of starting independent destructive reconciliation passes.
2. **Conversation message sync is single-flight per user + conversation.** Send, read, visibility and background refreshes cannot race separate syncs for the same thread.
3. **A missing conversation in one list snapshot is not enough to purge it.** ConnectX performs an RLS-protected point read for every previously cached conversation missing from the list. If the conversation is still visible, it is recovered into the snapshot. Local data is purged only after the point read confirms that the current user can no longer access it.
4. **Participant snapshots must contain the signed-in user.** An incomplete participant response aborts the workspace commit and preserves the previous local snapshot.
5. **Message synchronization is incremental.** The existing per-conversation server timestamp + message ID cursor is now used on the next query. Rows sharing a timestamp are disambiguated by message ID so they are not skipped.
6. **Receipt refresh is separate from message-body download.** Delivered/read state can still advance without re-downloading the entire message history.
7. **Background workspace polling is conservative.** The previous 3-second full refresh loop is replaced with a 12-second interval, while online/visibility/send events still trigger targeted synchronization.

## Retention behavior

A transient empty/stale list response must never delete cached conversations, cached messages, queued canonical messages or delivery attempts. Explicit group leave still purges immediately, and confirmed RLS loss during workspace reconciliation still removes the inaccessible conversation from the local workspace.

## Validation

```bash
npm run check
npm run test:sync-reliability
npm run test:workspace
npm run test:delivery
npm run test:local
```

The package stays at semver `0.8.1`; the user-facing ConnectX build label is `0.8.1.3` because four-component versions are not valid npm semver.
