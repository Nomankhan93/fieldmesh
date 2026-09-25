# FieldMesh 0.6.2 — Consumer UX Polish & Contact Discovery Foundation

FieldMesh 0.6.2 keeps the validated messaging, mesh, gateway and SOS engines intact while making the normal application feel more like a communication product and less like a prototype console.

## User navigation

The normal app remains focused on:

- Home
- Chats
- SOS
- Network
- Profile

Desktop navigation can collapse to icon-only mode. Mobile uses a compact five-item bottom bar. Mesh and gateway diagnostics are hidden unless Developer Mode is explicitly enabled from Profile → Advanced app settings.

## Contact discovery

Profiles expose a human-facing `FM-XXXXXXXXXXXX` contact code derived from the stable FieldMesh identity. The database keeps profile rows private; a security-definer RPC accepts a FieldMesh contact code or technical UUID and creates/opens the canonical direct conversation without granting general profile lookup access.

Supported contact inputs:

- `FM-12AB34CD56EF`
- `FM12AB34CD`
- `fieldmesh://contact/FM-12AB34CD56EF`
- the full technical FieldMesh UUID

The share payload contract is now stable for later QR/mobile scanning. 0.6.2 does **not** pretend that camera scanning is implemented; the UI clearly labels it as a foundation.

## SOS hardening

SOS now requires an explicit confirmation step before dispatch. Resolved/expired/failed prototype records move into Past SOS activity instead of looking like an active emergency. Transport simulation controls are visible only when Developer Mode is enabled.

## Network status

A pure connection-summary model describes four future-capable states in plain language:

1. Internet
2. Hybrid radio → gateway
3. Local radio mesh
4. Offline/local queue only

The browser currently reports physical radio and gateway as unavailable until real hardware integration.

## Route code splitting

User and developer pages are lazy-loaded at the router boundary so the initial application bundle no longer needs to contain the simulator, gateway lab, SOS implementation, profile tooling and chat workspace all at once.

## Security boundary

The contact discovery RPC does not make `profiles` publicly selectable. It resolves a short code internally and delegates to the already hardened direct-conversation function. If a 48-bit short-code collision were ever detected, the RPC rejects the ambiguous code and requires the full technical FieldMesh ID.
