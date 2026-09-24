# FieldMesh 0.6 — Location + SOS

FieldMesh 0.6 adds durable local location capture and emergency-priority SOS workflows on top of the 0.5 Hybrid Gateway.

## Safety boundary

This release is a software prototype. It does not contact police, ambulance, rescue services or any real emergency responder. The Internet endpoint and responder controls in `/sos` are simulated. The Radio → Gateway → Cloud path reuses the real 0.5 `GatewayAgent` software bridge, but the radio adapter remains simulated until the hardware phase.

## Location model

A captured fix stores:

- latitude;
- longitude;
- browser-reported accuracy in metres;
- capture timestamp;
- source (`browser` or explicitly `simulated`).

Location fixes are stored in IndexedDB. Manual location shares are logical FieldMesh messages with `type = location` and `priority = location`.

Location can be captured manually or shared on an optional 1/5/15-minute foreground interval while the `/sos` page remains active. FieldMesh explicitly does not claim reliable browser-background tracking; that belongs to the later native Android path. Significant-movement tracking is still deferred.

## SOS model

SOS categories:

- Medical
- Security
- Accident
- Lost
- Vehicle issue
- Other

An SOS logical message contains:

- SOS ID;
- stable logical message ID;
- sender FieldMesh user identity;
- category;
- optional short message;
- optional location snapshot;
- optional battery percentage when the browser exposes the Battery Status API;
- creation and expiry timestamps;
- emergency priority.

GPS is optional. Failure or denial of location permission never blocks SOS creation or transmission.

## Priority

Dispatch ordering is:

```text
Emergency / SOS
      ↓
Control / ACK
      ↓
Location
      ↓
Normal chat
```

0.6 enforces SOS-before-location ordering when queued safety traffic is retried.

## Delivery paths

The safety service attempts:

```text
1. Direct Internet
2. Simulated phone radio → 0.5 GatewayAgent → Cloud
3. Durable local queue when neither path is available
```

If the phone has no Internet but simulated radio is available, the same logical `messageId` is placed in a transport frame and passed into the 0.5 gateway. If gateway Internet is also down, the gateway's durable uplink queue accepts the message. The SOS remains `transmitted` until gateway recovery allows cloud forwarding.

## Lifecycle

```text
Created
   ↓
Queued          (when no path is available)
   ↓
Transmitted     (direct Internet attempt or accepted by gateway)
   ↓
Received        (simulated cloud endpoint received it)
   ↓
Acknowledged    (simulated responder action)
   ↓
Resolved        (simulated responder action)
```

Expired is terminal. Acknowledgement requires `received`; resolution requires `acknowledged`.

## Durability

Dexie schema version 4 adds:

- `locationFixes`
- `locationShares`
- `sosRecords`
- `sosEvents`

Existing phone, cloud and gateway queues remain unchanged.

## Why there is no Supabase SOS table yet

0.6 intentionally does not add public cloud SOS tables. FieldMesh does not yet have the responder/team/group authorization model required to decide who may read or act on an emergency alert. That permission boundary belongs with 0.7 Groups + Permissions + Crypto Foundation. Adding broad SOS visibility before that would create an avoidable RLS/security ambiguity.

## Validation

```bash
npm run check
npm run test:sos
npm run test:gateway
npm run test:mesh
npx supabase db reset
npm run test:local
```

`test:sos` proves:

- direct Internet delivery;
- SOS without GPS;
- Radio → Gateway → Cloud fallback;
- gateway Internet outage and recovery;
- local queue and retry;
- expiry;
- received → acknowledged → resolved lifecycle;
- manual location sharing;
- emergency-before-location retry priority;
- SOS audit-event history.
