# FieldMesh 0.5 — Hybrid Gateway Prototype

FieldMesh 0.5 adds the first software-only LoRa ↔ Internet/cloud bridge on top of the 0.4.1 deterministic mesh lab and the 0.3.1 protocol/transport boundary.

## Current capabilities

- PWA foundation and IndexedDB durability.
- Supabase identity, devices, conversations and RLS.
- Durable internet messaging with local outbox, cloud mailbox and delivered/read receipts.
- Stable logical message IDs separated from transport frame IDs.
- Deterministic advanced mesh failure simulator at `/simulator`.
- Hybrid Gateway lab at `/gateway`.
- Durable gateway uplink/downlink queues in IndexedDB.
- Radio → Gateway → Cloud forwarding.
- Cloud → Gateway → Radio forwarding.
- Gateway retry/recovery when either side is unavailable.
- Duplicate-safe forwarding with one logical `messageId` across transports.
- User → gateway → radio-node routing registry.
- Gateway queue, routing, health and event diagnostics.

## Hybrid Gateway architecture

```text
Field user / radio
       │
       ▼
  Radio adapter
       │
       ▼
  Gateway Agent
   ├── durable uplink queue
   ├── durable downlink queue
   ├── duplicate ledger
   └── routing registry
       │
       ▼
 Internet / Cloud
```

Reverse delivery uses the same agent:

```text
Cloud mailbox
     │
     ▼
Gateway Agent
     │
     ├── resolve FieldMeshUserId → RadioNodeId
     ├── queue if radio unavailable
     └── create a new transport frame with the same logical messageId
     │
     ▼
Radio node
```

## Three durable queue layers

FieldMesh now has three independent durability boundaries:

1. Phone/local outbox.
2. Cloud mailbox/outbox.
3. Gateway uplink/downlink queue.

A transport outage at one boundary does not require the sender or recipient to stay online.

## Permanent gateway rules

- `FieldMeshUserId != RadioNodeId`.
- Gateway forwarding never creates a new logical message identity.
- The same `messageId` is preserved across radio, gateway and cloud.
- A new RF transmission may use a new `frameId` and attempt number.
- Gateway acceptance is not recipient application delivery.
- Duplicate radio ingress must not create duplicate cloud messages.
- Duplicate cloud ingress must not create duplicate radio delivery attempts after successful forwarding.
- Queued traffic expires according to its original logical expiry; recovery never resurrects stale traffic.
- Routing registry maps users to radio-node reachability and has explicit TTL.
- Gateway queue state survives browser refresh through IndexedDB.
- 0.5 adapters are simulated; no physical LoRa transmission occurs.

## Gateway lab

Run the app and open `/gateway`.

The lab can:

- toggle simulated radio online/offline;
- toggle simulated internet/cloud online/offline;
- inject Radio → Cloud traffic;
- inject Cloud → Radio traffic;
- inspect persistent uplink/downlink queue depth;
- retry queued traffic immediately after recovery;
- inspect the user-to-radio routing registry;
- inspect gateway metrics and event timeline;
- reset only the gateway-lab IndexedDB records.

## Validation

```bash
npm run check
npm run test:mesh
npm run test:gateway
npx supabase db reset
npm run test:local
```

0.5 adds no Supabase migration. It upgrades only the local Dexie database from schema version 2 to 3 to add gateway queue, dedupe and routing tables.

## Architecture documentation

- `docs/PROTOCOL_TRANSPORT.md` — logical-message and transport-frame boundaries.
- `docs/MESH_SIMULATOR.md` — deterministic mesh simulator semantics.
- `docs/HYBRID_GATEWAY.md` — 0.5 gateway agent, durability, routing and recovery semantics.

## Next release

FieldMesh 0.6 can build Location + SOS on this foundation, including emergency priority, last-known coordinates and gateway-assisted forwarding when internet is unavailable at the field user.
