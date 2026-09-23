# FieldMesh 0.4 — Advanced Mesh Failure Simulator

FieldMesh 0.4 adds a deterministic, virtual-time mesh laboratory before real LoRa hardware is introduced.

## Goals

The simulator must aggressively test the assumptions that later gateway and hardware transports will depend on:

- multi-hop routing through users, relays and gateways;
- node offline/restarting/partitioned states;
- directional link availability;
- latency and jitter;
- packet loss;
- delivery-ACK loss;
- duplicate RF frames;
- retry and recovery;
- application-level deduplication;
- message TTL expiration;
- hop limits;
- deterministic replay from the same scenario + seed.

## Architecture

```text
Scenario
  │
  ├── Nodes
  ├── Directional Links
  ├── Scheduled Faults
  └── Logical Message
        │
        ▼
Seeded Virtual-Time Simulator
        │
        ├── route selection
        ├── transport frame attempt
        ├── per-link failure injection
        ├── relay forwarding
        ├── recipient persistence
        ├── delivery ACK
        └── retry / expiry
        │
        ▼
Trace + Metrics
```

The simulator uses the 0.3.1 protocol rule that a logical `messageId` is stable while each transmission attempt gets its own deterministic `frameId`.

## Important semantics

- **Radio/transport ACK is not application delivery.** The message is delivered only when the destination application persists the logical message.
- If the application delivery ACK is lost, the sender may retry.
- The destination must suppress a repeated logical message but may still ACK the retry.
- Nodes and links may fail between route selection and frame arrival.
- Routes never invent connectivity through offline or partitioned nodes.
- Expired messages are not resurrected after a late network recovery.
- The same scenario and seed must produce the same trace and metrics.

## Built-in scenarios

1. Healthy multi-hop mesh
2. Broken relay with alternate route
3. Broken mesh cut
4. Partition then recovery
5. Severe packet loss
6. ACK loss + deduplication
7. Duplicate RF packet
8. Relay restart and retry
9. Message expiration

## Validation

Run:

```bash
npm run test:mesh
```

The suite proves healthy delivery, alternate routing, hard failure, recovery, packet loss, ACK-loss retry/deduplication, duplicate suppression, relay restart, expiration and deterministic replay.

The UI is available at `/simulator` and always states that it is simulated radio with no physical transmission.

---

# FieldMesh 0.4.1 — Visualization & UX hardening

0.4.1 preserves the 0.4 deterministic simulation engine and adds a network-engineering presentation layer.

## Scenario expectations

Every built-in `MeshScenario` declares an expected terminal `status` and explanatory summary. `npm run test:mesh` validates that each baseline scenario still produces its declared result.

This distinction is important:

- a healthy scenario is expected to finish `acknowledged`;
- a hard cut or severe packet-loss scenario may be expected to finish `failed`;
- expiration is expected to finish `expired`.

A failed delivery is therefore not automatically a failed simulator test.

The UI only labels a run `Scenario PASS` or `Scenario FAIL` when the built-in scenario is using its baseline seed and baseline override values. Runs with a custom seed or additional failure pressure are labelled `Custom run`, because the built-in expected result is then reference information rather than an enforced verdict.

## Interactive topology

The simulator renders bidirectional link pairs as one visual edge while preserving directional link IDs internally. The graph shows:

- user nodes as circles;
- relay nodes as diamonds;
- gateway nodes as rounded squares;
- final node state using a state marker;
- online, degraded and broken links;
- the final delivered route when one exists.

Selecting a node shows frame/ACK activity, drops, state changes and related event count. Selecting a link shows latency, jitter, packet loss, ACK loss, duplicate rate and trace-derived frame/ACK counters.

## Delivery vs sender confirmation

0.4.1 exposes two separate latency measurements:

```text
Application delivery latency
  = destination persistence time - message creation time

Sender confirmation latency
  = delivery ACK received at source - message creation time
```

This preserves the permanent FieldMesh rule that recipient application delivery and sender acknowledgement are separate events.

## Timeline UX

The timeline no longer uses an inner vertical scrollbar for normal traces. Events can be filtered by:

- Messages
- Frames
- ACKs
- Failures
- Network

Search covers event type, summary, node ID, link ID, frame ID and route text. Very large filtered traces initially render the first 80 events and can be explicitly expanded.

## Validation additions

`npm run test:mesh` now includes both the simulator engine suite and pure visualization-helper tests. It verifies:

- application delivery and sender acknowledgement latency are distinct;
- every built-in scenario matches its declared expected status;
- directional links group correctly for graph display;
- delivered routes are identified for highlighting;
- timeline filtering/search behaves predictably;
- node activity summaries are derived from the trace and topology.
