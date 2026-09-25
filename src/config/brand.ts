export const APP_BRAND = {
  name: 'ConnectX',
  tagline: 'Stay Connected. Anywhere.',
  version: '0.8.1.6',
  icon: '/icons/connectx-192.png',
  logo: '/brand/connectx-logo.webp',
  themeColor: '#07113f',
} as const

// The product is now branded ConnectX. Existing database/RPC/protocol identifiers
// intentionally retain the FieldMesh name for backward compatibility.
export const LEGACY_PROTOCOL_NAME = 'FieldMesh'
