# FieldMesh 0.6.1 — User Experience & Product Shell

## Goal

The FieldMesh product has two audiences with different needs:

1. **Normal users** need communication, safety, connection status and device/account controls.
2. **Developers/network operators** need packet traces, deterministic failure injection, gateway queues, routing registries and transport diagnostics.

0.6.1 makes that boundary explicit.

## User navigation

```text
FieldMesh
├── Home
├── Chats
├── SOS
├── Network
└── Profile
```

Normal users should not need to understand packet loss, ACK loss, route registries, frame IDs or queue internals to send a message.

## Developer navigation

```text
Developer tools
├── Diagnostics home
├── Mesh lab
└── Gateway lab
```

The engineering tools keep all 0.4/0.5 capabilities. They are reorganized rather than removed.

## Network-status truthfulness

Until real radio hardware is integrated, the user-facing app must not imply that a physical LoRa path exists. The Network page therefore distinguishes:

- actual `navigator.onLine` Internet state,
- radio-device state as not paired,
- Hybrid Gateway as a validated software prototype.

## Compatibility

Old `/simulator` and `/gateway` URLs remain usable as developer-mode aliases so bookmarks and testing scripts are not broken.

## SOS simplification

The primary SOS workflow contains only:

- category,
- optional note,
- location availability,
- send action,
- latest status.

Simulation-only connectivity toggles, test locations, responder simulation, counters and lifecycle logs are collapsed under Developer simulation controls.

## No backend changes

0.6.1 adds no Supabase migration and changes no established transport/message semantics. It is a product-shell and usability hardening release.
