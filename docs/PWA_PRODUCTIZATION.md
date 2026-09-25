# ConnectX PWA Productization

This patch turns the existing technical PWA foundation into an explicit product lifecycle while preserving the offline-first messaging architecture.

## Responsibilities

The service worker owns the application shell and static build assets. IndexedDB/Dexie remains the source of truth for cached conversations, canonical messages, delivery queues, workspace metadata and other durable application data.

The PWA layer must not cache or impersonate Supabase authorization/data responses as an application data store.

## Install behavior

- Chromium-family browsers: ConnectX captures `beforeinstallprompt` and only calls `prompt()` after the user chooses **Install**.
- iOS/iPadOS: Safari does not expose the same programmatic install prompt, so ConnectX displays **Share → Add to Home Screen** guidance.
- Installed/standalone mode is detected with `display-mode: standalone` plus the iOS `navigator.standalone` compatibility signal.
- Production installation requires a secure HTTPS context. Localhost remains valid for development.

## Update behavior

`vite-plugin-pwa` uses `registerType: 'prompt'`.

A newly downloaded service worker waits rather than silently replacing the currently running version. ConnectX shows **Update available** and invokes the generated `updateSW(true)` path only after explicit user action.

The registration also checks for updates after the browser returns online and periodically while the application remains open.

## Offline behavior

ConnectX reports two independent states:

1. **Offline shell ready** — the service worker controls the page/static application assets are available.
2. **Offline conversation workspace** — Dexie contains synchronized conversations/messages that can be reopened and queued locally.

The first state does not imply that a user has already synchronized any conversations.

## Storage persistence

ConnectX asks the browser for persistent storage when supported and reports whether the browser granted it. A refusal is not treated as an application failure; the browser may continue managing storage under its normal eviction policy.

## Mobile layout

- `viewport-fit=cover` remains enabled.
- mobile headers reserve `env(safe-area-inset-top)`.
- bottom navigation reserves `env(safe-area-inset-bottom)`.
- standalone mode uses dynamic viewport height while preserving normal text selection and accessibility behavior.

## Acceptance checklist

1. Production build emits a web manifest and service worker.
2. Manifest name/short name are ConnectX and icons include 192, 512 and maskable 512 variants.
3. Chromium install prompt appears only after browser eligibility and user action.
4. iOS shows manual Add to Home Screen guidance.
5. Installed mode does not keep showing install controls.
6. Offline transition shows a non-blocking status message.
7. Existing cached conversations still open offline.
8. An available service-worker update shows **Update now** rather than forcing an immediate reload.
9. Profile → ConnectX PWA reports install, offline-shell, storage and service-worker states.
10. No Supabase migration is required by this patch.
