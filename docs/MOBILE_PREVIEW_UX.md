# ConnectX Mobile Preview & Mobile UX

This patch productizes the ConnectX phone experience without changing the messaging, database, authorization, or transport engines.

## Mobile shell

- Compact branded top bar with current screen title and online/offline state.
- Five-item bottom navigation: Home, Chats, SOS, Network, Profile.
- iOS/Android safe-area handling remains compatible with standalone PWA mode.
- Minimum 44 px touch targets for new mobile controls.
- Mobile text inputs use 16 px sizing to avoid accidental iOS zoom.

## Chats

Phone-sized layouts now use an intentional single-pane flow:

1. Conversation list.
2. Tap a conversation.
3. Full conversation view.
4. Sticky message composer above the bottom navigation.

New chat and new group creation move into a bottom sheet on mobile. Desktop keeps the existing two-column workspace.

Offline behavior is unchanged: cached conversations reopen locally and messages can enter the durable queue when no supported path is available.

## SOS

The emergency confirmation becomes a bottom sheet on phone layouts. Desktop retains the inline confirmation panel. The confirmation still requires a second explicit action and the prototype safety disclaimer remains visible.

## Mobile preview lab

Enable Developer Mode and open `/developer/mobile-preview`.

The lab can preview the normal user routes at these viewports:

- 360 × 800 compact phone
- 390 × 844 iPhone preview
- 412 × 915 Android preview
- 768 × 1024 tablet preview

Portrait and landscape orientations are available. The preview iframe is same-origin and therefore uses the same authenticated session and local IndexedDB workspace. It is a visual development tool, not an isolated test account.

## Boundaries

This patch does not add automatic radio/gateway routing, camera QR scanning, native background services, or native mobile packaging. Those remain separate roadmap stages.
