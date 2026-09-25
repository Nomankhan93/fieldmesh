export type MobilePreviewPresetId = 'compact' | 'iphone' | 'android' | 'tablet'
export type MobilePreviewOrientation = 'portrait' | 'landscape'

export type MobilePreviewPreset = {
  id: MobilePreviewPresetId
  label: string
  width: number
  height: number
  category: 'phone' | 'tablet'
}

export const MOBILE_PREVIEW_PRESETS: readonly MobilePreviewPreset[] = [
  { id: 'compact', label: 'Compact phone', width: 360, height: 800, category: 'phone' },
  { id: 'iphone', label: 'iPhone preview', width: 390, height: 844, category: 'phone' },
  { id: 'android', label: 'Android preview', width: 412, height: 915, category: 'phone' },
  { id: 'tablet', label: 'Tablet preview', width: 768, height: 1024, category: 'tablet' },
] as const

export const MOBILE_PREVIEW_ROUTES = [
  { label: 'Home', path: '/' },
  { label: 'Chats', path: '/messages' },
  { label: 'SOS', path: '/sos' },
  { label: 'Network', path: '/network' },
  { label: 'Profile', path: '/profile' },
] as const

export function previewDimensions(
  preset: MobilePreviewPreset,
  orientation: MobilePreviewOrientation,
): { width: number; height: number } {
  return orientation === 'portrait'
    ? { width: preset.width, height: preset.height }
    : { width: preset.height, height: preset.width }
}

export function isSafePreviewPath(path: string): boolean {
  return MOBILE_PREVIEW_ROUTES.some((route) => route.path === path)
}
