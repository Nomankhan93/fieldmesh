# FieldMesh 0.5 — Hybrid Gateway Prototype

## Goal

0.5 proves software-only bidirectional bridging before real LoRa hardware exists:

```text
User A
Internet unavailable
Radio available
      │
      ▼
Gateway G1
      │
Internet available
      │
      ▼
Cloud mailbox
      │
      ▼
User B
```

and the reverse direction:

```text
Cloud → Gateway → Radio user
```

The browser lab uses simulated radio and cloud adapters. The gateway core is adapter-agnostic so later hardware/service adapters can replace them without changing queue and routing semantics.

## Components

`src/core/gateway/agent.ts`
: Orchestrates ingress, durable queueing, forwarding, expiry, retry and dedupe.

`src/core/gateway/adapters.ts`
: Radio/cloud adapter contracts plus simulated adapters for the 0.5 lab and tests.

`src/core/gateway/store.ts`
: Storage contract and deterministic in-memory implementation used by tests.

`src/core/gateway/dexieStore.ts`
: Browser IndexedDB persistence for gateway queues, seen-message ledger and routes.

`src/core/gateway/routing.ts`
: User-to-radio-node reachability registry with explicit route expiry.

`src/features/gateway/GatewayPage.tsx`
: Interactive software-only gateway operations lab.

## Durable queue model

A deterministic key protects every bridge direction:

```text
<gatewayId>:<direction>:<messageId>
```

Directions:

```text
radio-to-cloud
cloud-to-radio
```

A queued record contains the original `messageId`, creation/expiry time, payload, retry state and destination routing information.

### Radio → Cloud

```text
radio frame received
      │
      ▼
queue before forwarding
      │
      ├── internet online → cloud upload → mark seen → delete queue
      │
      └── internet offline → keep queue → retry later
```

### Cloud → Radio

```text
cloud message received
      │
      ▼
queue before forwarding
      │
      ▼
resolve FieldMeshUserId
      │
      ▼
Gateway route registry
      │
      ├── route + radio online → create frame → transmit → mark seen → delete queue
      │
      └── route/radio unavailable → keep queue → retry later
```

## Identity boundary

Routing deliberately keeps application identity separate from RF identity:

```text
FieldMeshUserId
      │
      ▼
routing registry
      │
      ▼
GatewayId + RadioNodeId
```

This keeps the permanent rule:

```text
FieldMeshUserId != RadioNodeId
```

A user can later own multiple devices/radios without changing their account identity.

## Logical message vs transport frame

Gateway forwarding preserves the logical message ID:

```text
messageId = M1
```

A cloud downlink transmitted over radio receives a transport frame such as:

```text
frameId = F9
messageId = M1
attempt = 2
```

Retry can create another frame while still preserving `M1`.

## Duplicate handling

Duplicate suppression is required in two places:

1. Local gateway ingress uses queue/seen keys to avoid re-forwarding the same logical message.
2. Simulated shared cloud mailbox is idempotent by `messageId`, demonstrating that two gateways receiving the same RF message still produce one logical cloud message.

Production cloud storage must retain a database-level uniqueness constraint on logical message identity.

## IndexedDB schema version 3

0.5 adds:

```text
gatewayQueue
gatewaySeen
gatewayRoutes
```

This is local browser persistence only; there is no new Supabase migration in 0.5.

## Restart/recovery contract

The agent itself is disposable. Durable state belongs to the store.

Therefore:

```text
Agent A queues message
      │
process/browser component restarts
      │
Agent B uses same persistent store
      │
connectivity recovers
      │
queued message forwards
```

The automated gateway suite proves this contract with a shared store across agent instances.

## Expiry

The gateway never extends logical message lifetime. If a queued message has expired before recovery, it is deleted and recorded as expired instead of being forwarded.

## 0.5 limitations

- No physical LoRa/BLE adapter yet.
- No production headless gateway daemon yet.
- No gateway credential provisioning yet.
- No real cloud polling/subscription worker yet; cloud ingress is injected by the lab/test adapter.
- Routing registry currently demonstrates one active gateway route per test/lab user.
- End-to-end encryption/key management remains a later security phase.

These limitations are intentional. 0.5 proves bridge semantics and durability before the hardware phase.

## Automated acceptance

Run:

```bash
npm run test:gateway
```

The suite proves:

- healthy Radio → Cloud forwarding;
- uplink queueing while internet is down;
- recovery flush;
- queue survival across agent restart;
- healthy Cloud → Radio forwarding;
- downlink queueing while radio is down;
- routing-registry recovery;
- duplicate suppression while queued and after forwarding;
- shared-cloud idempotency across multiple gateways;
- TTL expiry;
- route expiry.
