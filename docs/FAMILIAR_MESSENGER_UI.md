# ConnectX 0.8.1.4 — Familiar Messenger UI & Mobile Chat Experience

This patch adopts familiar mobile messenger interaction patterns without copying another product's visual identity.

## User experience

- Searchable chat list with generated avatars, last-message preview, timestamp and unread badge.
- Full-screen conversation flow on phones; desktop keeps the two-pane workspace.
- ConnectX-specific navy/cyan/blue/violet visual language.
- Message bubbles with day separators and durable delivery states represented as familiar ticks.
- Sticky mobile composer with a circular send/queue action.
- Floating new-conversation action on phones.
- Group identity and member counts remain visible without exposing transport internals.

## Delivery-state mapping

- queued → clock marker
- submitted → one tick
- delivered → two ticks
- read → two ConnectX cyan ticks
- failed/expired → warning marker

These are presentation-only mappings. Durable delivery, receipts, offline queues, RLS, and transport logic remain unchanged.

## Deliberate boundaries

This patch does not add presence, typing indicators, calls, attachments, reactions, forwarding, or message deletion because those require backend/protocol behavior rather than visual placeholders.
