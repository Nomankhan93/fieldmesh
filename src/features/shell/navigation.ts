export type FieldMeshNavIcon = 'home' | 'chats' | 'sos' | 'network' | 'profile' | 'developer' | 'mesh' | 'gateway' | 'security' | 'delivery' | 'workspace'

export type FieldMeshNavItem = {
  label: string
  to: '/' | '/messages' | '/sos' | '/network' | '/profile' | '/developer' | '/developer/mesh' | '/developer/gateway' | '/developer/security' | '/developer/delivery' | '/developer/workspace'
  description: string
  icon: FieldMeshNavIcon
}

export const USER_NAV_ITEMS: FieldMeshNavItem[] = [
  { label: 'Home', to: '/', description: 'Simple FieldMesh overview', icon: 'home' },
  { label: 'Chats', to: '/messages', description: 'Messages and conversations', icon: 'chats' },
  { label: 'SOS', to: '/sos', description: 'Emergency and location tools', icon: 'sos' },
  { label: 'Network', to: '/network', description: 'Connection status in plain language', icon: 'network' },
  { label: 'Profile', to: '/profile', description: 'Account and devices', icon: 'profile' },
]

export const MOBILE_NAV_ITEMS = USER_NAV_ITEMS

export const DEVELOPER_NAV_ITEMS: FieldMeshNavItem[] = [
  { label: 'Developer home', to: '/developer', description: 'Diagnostics overview', icon: 'developer' },
  { label: 'Mesh lab', to: '/developer/mesh', description: 'Deterministic mesh simulator', icon: 'mesh' },
  { label: 'Gateway lab', to: '/developer/gateway', description: 'Hybrid gateway diagnostics', icon: 'gateway' },
  { label: 'Security', to: '/developer/security', description: 'Crypto foundation diagnostics', icon: 'security' },
  { label: 'Delivery', to: '/developer/delivery', description: 'Canonical delivery diagnostics', icon: 'delivery' },
  { label: 'Workspace', to: '/developer/workspace', description: 'Offline workspace diagnostics', icon: 'workspace' },
]

export function isDeveloperPath(pathname: string): boolean {
  return pathname === '/simulator' || pathname === '/gateway' || pathname.startsWith('/developer')
}

export function isNavItemActive(pathname: string, to: FieldMeshNavItem['to']): boolean {
  if (to === '/') return pathname === '/'
  return pathname === to || pathname.startsWith(`${to}/`)
}
