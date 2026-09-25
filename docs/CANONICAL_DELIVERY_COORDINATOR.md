# FieldMesh 0.8.0 — Canonical Message & Delivery Coordinator

## Purpose

0.8.0 starts the software-alpha integration phase by making one logical `FieldMeshMessage` the unit that enters delivery. The user-facing chat composer no longer owns a separate Internet-only outbox implementation.

The coordinator is intentionally above concrete transports:

```text
FieldMeshMessage
      │
      ▼
DeliveryCoordinator
      │
      ├── Internet adapter   ← active for normal Chats in 0.8.0
      ├── Gateway adapter    ← contract reserved for 0.8.2/0.8.3
      └── Radio adapter      ← contract reserved for 0.8.2/0.9
```

The same logical message ID is preserved across retries and across candidate delivery paths.

## Canonical local records

Dexie schema version 5 adds:

- `canonicalMessages` — one local logical-message record per signed-in user's view
- `deliveryQueue` — durable coordinator retry state
- `deliveryPathAttempts` — path-specific attempt diagnostics

Existing 0.7.x `cloudMessages` remains the current chat-rendering cache. `cloudOutbox` is retained only for schema compatibility and is migrated into the new coordinator queue when IndexedDB upgrades from version 4 to 5.

## Delivery state

Canonical states are:

```text
queued
submitted
delivered
read
expired
failed
```

`submitted` means a delivery adapter accepted the logical message. It does not mean the recipient read it. Existing cloud delivery/read receipts continue to advance the canonical state.

## Priority

Retry order uses the existing application priority model:

```text
Emergency
Control
Location
Normal
```

This does not yet route SOS or Location through the coordinator; it establishes the scheduler needed when those message types are integrated in later 0.8 stages.

## Path selection boundary

0.8.0 supports ordered candidate paths and fallback in the coordinator contract. The production Chat flow supplies only `internet` today because this browser has no real radio connection and the software Gateway Lab is not yet wired into normal chats.

Future integration can supply candidates such as:

```text
internet → gateway → radio
```

without creating a new logical message or changing its ID.

## Internet adapter

`InternetDeliveryAdapter` preserves:

- logical message ID
- conversation ID
- sender identity used by the authenticated mailbox
- client creation time
- expiry time
- message body

A duplicate cloud insert remains idempotent success because the cloud mailbox enforces the stable message ID.

## Developer diagnostics

With Developer Mode enabled:

```text
/developer/delivery
```

shows canonical message totals, durable queue depth and recent per-path attempts.

## Explicit non-goals of 0.8.0

0.8.0 does **not** claim:

- automatic live Internet/Radio/Gateway routing from the normal chat screen
- offline conversation metadata availability
- normal-chat delivery through the simulated mesh lab
- normal-chat delivery through the Gateway Lab
- unified SOS/Location delivery
- production E2E encryption
- physical LoRa/Bluetooth integration

Those remain staged work after the coordinator foundation is validated.
