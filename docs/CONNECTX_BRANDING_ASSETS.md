# ConnectX — Branding & PWA Assets

## Product identity

- **Name:** ConnectX
- **Tagline:** Stay Connected. Anywhere.
- **Primary visual:** neon orbital ConnectX logo supplied by the project owner
- **App icon:** neon orbital rounded-square icon supplied by the project owner

## Brand palette

- Deep navy: `#07113f`
- Canvas navy: `#030a30`
- Cyan: `#08d9ff`
- Blue: `#1769ff`
- Violet: `#7c2cff`
- SOS remains semantic red; connectivity success remains semantic green.

The normal application uses the new brand identity while preserving established emergency and connectivity semantics.

## PWA assets

The app now ships dedicated PNG assets for browser/PWA installation:

- `/icons/connectx-192.png`
- `/icons/connectx-512.png`
- `/icons/connectx-maskable-512.png`
- `/icons/connectx-apple-touch-180.png`
- `/icons/connectx-favicon-64.png`
- `/brand/connectx-logo.webp`

The manifest name, short name, description, theme/background colors, icons, and Chats/SOS shortcuts use ConnectX branding.

## Compatibility boundary

This is a **product rebrand, not a protocol/database rename**. Existing internal names such as `FieldMeshMessage`, `fieldmesh_user_id`, `fieldmesh://` compatibility links, database RPC names, migrations, and IndexedDB identifiers remain unchanged so the validated 0.8.1 security and offline contracts are not broken.

The UI calls the human-facing FM compatibility identifier a **ConnectX code**. A later explicit identity/protocol migration may introduce a new public code prefix or URI scheme only if backward compatibility is designed and tested.
