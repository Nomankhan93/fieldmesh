# FieldMesh 0.4.1 — Mesh Visualization & Simulator UX Hardening

FieldMesh 0.4.1 hardens the 0.4 Advanced Mesh Failure Simulator without changing its deterministic virtual-time architecture. The release turns the simulator into a more usable network-engineering workspace before the 0.5 Hybrid Gateway phase.

## Current capabilities

- PWA foundation and IndexedDB durability.
- Supabase identity, devices, conversations and RLS.
- Durable internet messaging with local outbox, cloud mailbox and delivered/read receipts.
- Stable logical message IDs separated from transport frame IDs.
- Transport router foundation for future internet/radio/gateway adapters.
- Deterministic advanced mesh failure simulator at `/simulator`.
- Interactive network topology with node/link diagnostics.
- Built-in scenario expectation contracts with expected-vs-actual verdicts.
- Separate application-delivery and sender-acknowledgement latency metrics.
- Timeline categories, search and large-trace expansion without nested scrolling.

## FieldMesh 0.4.1 simulator workspace

The simulator models:

- users, relays and gateway nodes;
- multi-hop route selection;
- online/offline/restarting/partitioned node states;
- directional link state;
- latency and jitter;
- packet loss;
- delivery-ACK loss;
- duplicate RF frames;
- retry and recovery;
- message deduplication;
- hop limits;
- TTL expiration;
- deterministic replay using a seeded pseudo-random generator;
- packet timeline and metrics.

The 0.4.1 UX layer adds:

- SVG topology graph with user, relay and gateway shapes;
- final node/link state visualization;
- delivered-route highlighting;
- clickable node inspector;
- clickable link inspector;
- built-in baseline PASS/FAIL verdicts;
- custom-run distinction when seed/failure overrides change;
- Run Simulation, Replay Same Seed and reproducible-seed controls;
- event filtering for Messages, Frames, ACKs, Failures and Network events;
- event search by node, link, frame or event text;
- responsive wide-screen utilization;
- removal of the packet timeline's nested vertical scrollbar.

## Important architecture rules

- `FieldMeshUserId != RadioNodeId`.
- One logical message keeps the same `MessageId` across retries/transports.
- Every transport attempt gets its own `TransportFrameId`.
- Radio/transport acceptance is not recipient application delivery.
- Delivered means the destination application persisted the logical message.
- ACK loss may cause retry, but duplicate logical delivery is suppressed.
- Expired messages are not resurrected after late network recovery.
- Same scenario + same seed + same overrides must produce the same trace and metrics.
- A failed message can still be a successful simulator scenario when failure was the declared expected outcome.
- The simulator is always software-only: **no physical transmission**.

## Validation

```bash
npm run check
npm run test:mesh
npx supabase db reset
npm run test:local
```

0.4.1 adds no new Supabase migration. If the 0.3.1 migration has not yet been pushed, only push it after local validation passes:

```bash
npx supabase db push
```

## Architecture documentation

- `docs/PROTOCOL_TRANSPORT.md` — 0.3.1 protocol/transport boundaries.
- `docs/MESH_SIMULATOR.md` — simulator semantics, scenario contracts and 0.4.1 visualization layer.

## Next release

FieldMesh 0.5 can build the Hybrid Gateway Prototype on top of the deterministic simulator, stable protocol/transport boundary, interactive topology diagnostics and scenario acceptance contracts.
