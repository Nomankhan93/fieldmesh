# FieldMesh 0.3.1 Protocol & Transport Architecture

FieldMesh 0.3.1 stabilizes boundaries that 0.4 mesh simulation, 0.5 gateway routing and 0.9 hardware integration will build on.

## Identity boundaries

These identifiers are intentionally separate concepts:

- `FieldMeshUserId`: authenticated human/user identity.
- `FieldMeshDeviceId`: an owned application/device identity.
- `RadioNodeId`: a physical RF node identity.
- `SimulatorUserId` / `SimulatorNodeId`: simulator-only identities.
- `MessageId`: one logical message across retries and transports.
- `TransportFrameId`: one transmission frame/attempt identity.

A FieldMesh user ID must never be treated as a LoRa/radio node ID.

## Logical message vs transport frame

```text
FieldMeshMessage
  id = logical MessageId
  conversationId
  senderUserId
  type / priority
  createdAt / expiresAt
  payload
        |
        v
transport adapter / encoding
        |
        v
TransportFrame
  frameId = unique per transmission
  messageId = original logical MessageId
  sourceNodeId / destinationNodeId
  attempt / hopLimit
  createdAt / expiresAt
  payload bytes
```

Retries keep the same `MessageId` and receive a new `TransportFrameId`.

## Delivery semantics

Transport acceptance is not application delivery.

- Radio/transport acceptance means a transport accepted or transmitted a frame.
- `delivered` means the recipient application received and persisted the logical message.
- Duplicate frames must not create duplicate logical messages.

## Expiry

The logical message owns `expiresAt`. Transport frames inherit that expiry instead of silently inventing a different logical TTL. FieldMesh 0.3.1 uses a seven-day default text-message TTL for both current cloud and simulator-created logical text messages.

## Router rule

`TransportRouter` selects one eligible available transport for a send attempt. It does not automatically spray the same frame across multiple transports. Multi-transport failover/deduplication must be explicit at the delivery-attempt layer so a lost ACK cannot create uncontrolled duplicate fan-out.

## 0.4 contract

The Advanced Mesh Failure Simulator should operate on `TransportFrame` events and preserve `MessageId` across relay forwarding/retries. It may add deterministic clocks, seeded randomness, topology, relay state, link state, ACK events, partitions and trace recording without redefining application-message identity.
