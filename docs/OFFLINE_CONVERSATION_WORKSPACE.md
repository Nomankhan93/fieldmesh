# FieldMesh 0.8.1 — True Offline Conversation Workspace

0.8.1 makes the conversation workspace itself local-first. Earlier releases cached messages and queued outgoing traffic, but the conversation list and participant metadata still depended on a successful Supabase fetch after opening Chats.

## Local workspace registry

IndexedDB schema version 6 adds:

- `workspaceConversations` — direct/group metadata scoped to the signed-in local user
- `workspaceParticipants` — cached participant names and group roles
- `workspaceSyncState` — last attempt, last successful sync and failure state
- `workspaceSyncCursors` — per-conversation message synchronization checkpoints

Existing `cloudMessages`, `canonicalMessages` and `deliveryQueue` continue storing cached message bodies, canonical logical messages and outgoing delivery work.

## Startup behavior

```text
Open Chats
   ↓
Read IndexedDB immediately
   ↓
Show cached conversations + participants + messages
   ↓
Internet available?
   ├─ no  → stay in offline workspace; compose queues locally
   └─ yes → fetch authoritative workspace → reconcile → sync messages
```

The browser does not need a successful conversation-list request before showing an already synchronized workspace.

## Authoritative reconciliation

A successful remote workspace sync is authoritative. FieldMesh fetches the complete visible conversation list and the participants for each conversation before committing the new snapshot locally.

If a previously cached conversation is no longer visible after a complete successful sync, the local workspace entry, participant cache, sync cursor and locally queued/cached records for that conversation are purged. This prevents a removed/left group from remaining available through the normal offline UI after the device has learned the authoritative membership change.

A failed/partial remote fetch does **not** replace the last successful local snapshot. `workspaceSyncState` records the error while the cached workspace stays usable.

## Offline capabilities in 0.8.1

Supported without Internet after at least one successful sync:

- reopen the conversation list
- resolve cached direct-chat names
- reopen cached groups and participant/role metadata
- read cached messages
- compose text into an existing conversation
- persist that message locally in the canonical delivery queue
- reload the browser while messages remain queued
- reconnect and synchronize the workspace/messages

Still requires Internet:

- create a brand-new direct conversation
- create a group
- add/remove members
- promote/demote admins
- rename a group
- leave a group

Those operations remain server-authoritative because they depend on identity, RLS and group permission RPCs.

## Message sync cursors

`workspaceSyncCursors` record the latest server message observed and the last successful per-conversation message sync. 0.8.1 keeps full message fetch semantics for reliability; the cursor is established now so later alpha patches can move to incremental synchronization without changing the local workspace contract.

## Developer diagnostics

Enable Developer Mode and open `/developer/workspace` to inspect:

- conversation/participant cache counts
- cached/queued message counts
- sync state and last successful synchronization
- per-conversation sync cursor status

## Security boundary

The local workspace is scoped by the current authenticated user ID. Remote membership remains authoritative. 0.8.1 does not weaken 0.7.1 database authorization and does not create offline membership or identity mutation paths.
