# FieldMesh 0.6 — Location + SOS

FieldMesh 0.6 builds field-safety workflows on top of the 0.5 Hybrid Gateway while preserving the 0.4 deterministic mesh simulator and 0.3.1 protocol/transport architecture.

## Current capabilities

- Installable React/TypeScript PWA with IndexedDB durability.
- Supabase identity, devices, conversations and RLS.
- Durable Internet direct messaging with receipts and local outbox recovery.
- Stable logical message IDs separated from transport-frame IDs.
- Deterministic advanced mesh failure simulator at `/simulator`.
- Hybrid Gateway lab at `/gateway` with durable uplink/downlink queues.
- Browser location capture and durable location history.
- Manual location updates with `location` priority.
- Optional 1/5/15-minute foreground periodic location sharing (no background reliability claim).
- Emergency SOS categories, optional coordinates, optional battery context and durable lifecycle records.
- SOS transmission without GPS.
- Emergency-priority retry ordering.
- Direct Internet SOS delivery simulation.
- Radio → Gateway → Cloud SOS fallback using the 0.5 `GatewayAgent`.
- Gateway outage/recovery reconciliation.
- Simulated responder acknowledgement and resolution lifecycle.
- Dedicated Location + SOS lab at `/sos`.

## Safety architecture

```text
                 Field user
                    │
           ┌────────┴─────────┐
           │                  │
     Direct Internet      Simulated radio
           │                  │
           ▼                  ▼
   Simulated endpoint     Gateway Agent
                              │
                       durable uplink queue
                              │
                              ▼
                      Simulated cloud endpoint
```

When neither path is available, the SOS remains in durable local IndexedDB state and is retried later. Emergency traffic is retried before location traffic.

## SOS lifecycle

```text
Created
  ↓
Queued
  ↓
Transmitted
  ↓
Received
  ↓
Responder acknowledged
  ↓
Resolved
```

GPS is optional. A missing/denied location fix never blocks SOS creation or transmission.

## Permanent rules preserved

- `FieldMeshUserId != RadioNodeId`.
- Message is durable before relying on transport recovery.
- Same logical `messageId` is preserved across transport changes.
- New RF attempts may use new `frameId` values.
- Gateway acceptance is not application/cloud receipt.
- SOS priority is higher than control, location and normal chat.
- Stale safety traffic expires instead of being resurrected after recovery.
- Simulator and gateway radio paths are software-only; no physical LoRa is claimed.
- PWA foreground/background limitations remain explicit until native Android support.

## 0.6 local persistence

Dexie schema version 4 adds:

- `locationFixes`
- `locationShares`
- `sosRecords`
- `sosEvents`

No new Supabase migration is added in 0.6. Cloud responder authorization is intentionally deferred until the 0.7 group/permission security model exists.

## Validation

```bash
npm run check
npm run test:sos
npm run test:gateway
npm run test:mesh
npx supabase db reset
npm run test:local
```

## Architecture documentation

- `docs/PROTOCOL_TRANSPORT.md` — logical-message and transport-frame boundaries.
- `docs/MESH_SIMULATOR.md` — deterministic mesh simulator semantics.
- `docs/HYBRID_GATEWAY.md` — gateway durability, routing and recovery semantics.
- `docs/LOCATION_SOS.md` — 0.6 location, emergency priority, lifecycle and hybrid delivery semantics.

## Next release

FieldMesh 0.7 can build Groups + Permissions + Crypto Foundation: group/broadcast/emergency conversations, responder authorization, device/key revocation foundations, replay protection and an end-to-end encryption design that keeps gateway/cloud infrastructure outside plaintext message content.
