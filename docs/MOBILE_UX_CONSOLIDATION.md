# ConnectX 0.8.1.5 — Mobile UX Consolidation & Information Hierarchy

This patch reduces mobile density and removes repeated or developer-oriented information from normal user screens while preserving the validated 0.8.1.3 sync reliability and 0.8.1.4 messenger behavior.

## Product rules

- Internal mobile pages use one compact header; the tagline is not repeated on every page.
- Sign-in/register stays above the fold on phones. The large branding hero remains a desktop presentation element.
- Home shows one communication-status banner, compact quick actions, and recent locally cached chats. The duplicate signed-in card is removed.
- Network presents Internet, Radio, and Gateway as compact status rows. Developer/software-lab explanations are not part of the normal page.
- Profile separates account identity, the shareable ConnectX ID, devices, app status, and advanced settings. Technical IDs and PWA internals are visible only when Developer Mode is enabled.
- SOS puts the emergency action first, keeps the prototype warning compact, uses quick category choices, and shortens location/live-sharing language.
- Bottom navigation remains the primary mobile navigation surface, so pages do not repeat large cross-navigation buttons.

## Compatibility boundary

No Supabase migration, RLS policy, RPC, IndexedDB schema, message format, delivery coordinator, sync policy, crypto primitive, mesh simulator, or gateway behavior changes in 0.8.1.5.
