# FieldMesh 0.3.1 — Protocol & Transport Architecture Stabilization

FieldMesh 0.3.1 keeps the validated 0.3 messaging behavior while establishing the protocol boundaries required by the 0.4 mesh simulator, 0.5 gateway and later real-radio adapters.

## Scope

- Shared logical `FieldMeshMessage` model for stable message identity and expiry.
- Explicit separation between authenticated user, device, radio-node and simulator identities.
- `TransportFrame` model with a unique frame ID per transmission while preserving the logical message ID.
- Transport capabilities contract and `TransportRouter` foundation.
- Existing mock-radio simulator migrated to transport frames without changing the `/simulator` workflow.
- Existing internet messaging migrated to the shared logical-message identity/expiry creator while preserving its Supabase mailbox behavior.
- One seven-day default logical text-message TTL across current cloud and simulator-created logical messages.
- Direct-conversation creation serialized by canonical user pair to prevent concurrent duplicate threads.
- Unit coverage for logical messages, frame identity/retry semantics and router selection.
- Local Supabase scenario now tests concurrent direct-conversation creation.
- Architecture contract documented in `docs/PROTOCOL_TRANSPORT.md`.

## Important semantics

- `FieldMeshUserId != RadioNodeId`.
- One logical message keeps the same `MessageId` across retries/transports.
- Every transport transmission gets its own `TransportFrameId`.
- Transport/radio acceptance is not recipient application delivery.
- Duplicate frames must still result in one logical chat message.
- A transport frame inherits the logical message expiry.
- The router selects one transport per attempt; uncontrolled automatic multi-transport fan-out is intentionally not introduced.

## Validation

```bash
npm run check
npx supabase db reset
npm run test:local
```

Only after local validation passes:

```bash
npx supabase db push
```

## Next release

FieldMesh 0.4 can now build the Advanced Mesh Failure Simulator around `TransportFrame` events, deterministic simulation time, seeded randomness, relays, per-link failures, ACK loss, retries, partitions and trace replay without redefining message identity.
