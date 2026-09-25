export type PwaInstallPlatform = 'ios' | 'android' | 'desktop' | 'unknown'

export function detectPwaInstallPlatform(args: {
  userAgent: string
  platform?: string
  maxTouchPoints?: number
}): PwaInstallPlatform {
  const userAgent = args.userAgent.toLowerCase()
  const platform = (args.platform ?? '').toLowerCase()
  const maxTouchPoints = args.maxTouchPoints ?? 0

  const iPadDesktopMode = platform === 'macintel' && maxTouchPoints > 1
  if (/iphone|ipad|ipod/.test(userAgent) || iPadDesktopMode) return 'ios'
  if (/android/.test(userAgent)) return 'android'
  if (/windows|macintosh|linux|cros/.test(userAgent)) return 'desktop'
  return 'unknown'
}

export function isStandaloneDisplay(args: {
  displayModeStandalone: boolean
  navigatorStandalone?: boolean
}) {
  return args.displayModeStandalone || args.navigatorStandalone === true
}

export function installGuidance(platform: PwaInstallPlatform) {
  if (platform === 'ios') {
    return 'In Safari, open Share and choose Add to Home Screen, then confirm Add.'
  }
  if (platform === 'android') {
    return 'Use Install ConnectX when offered, or open the browser menu and choose Install app.'
  }
  if (platform === 'desktop') {
    return 'Use Install ConnectX when offered, or use the install icon in your browser address bar.'
  }
  return 'Install availability depends on browser support and a secure HTTPS connection.'
}
