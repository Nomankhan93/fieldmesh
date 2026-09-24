import { createLocationFix, type LocationCaptureResult } from './types'

export async function captureBrowserLocation(options?: PositionOptions): Promise<LocationCaptureResult> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return { fix: null, error: 'Browser geolocation is unavailable on this device.' }
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        try {
          resolve({
            fix: createLocationFix({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              capturedAt: position.timestamp || Date.now(),
              source: 'browser',
            }),
            error: null,
          })
        } catch (error) {
          resolve({
            fix: null,
            error: error instanceof Error ? error.message : 'Location capture was invalid.',
          })
        }
      },
      (error) => {
        const message = error.code === error.PERMISSION_DENIED
          ? 'Location permission was denied.'
          : error.code === error.POSITION_UNAVAILABLE
            ? 'Current location is unavailable.'
            : error.code === error.TIMEOUT
              ? 'Location capture timed out.'
              : 'Unable to capture current location.'
        resolve({ fix: null, error: message })
      },
      {
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 30_000,
        ...options,
      },
    )
  })
}

type NavigatorWithBattery = Navigator & {
  getBattery?: () => Promise<{ level: number }>
}

export async function captureBatteryPercent(): Promise<number | undefined> {
  if (typeof navigator === 'undefined') return undefined
  const batteryNavigator = navigator as NavigatorWithBattery
  if (!batteryNavigator.getBattery) return undefined

  try {
    const battery = await batteryNavigator.getBattery()
    if (!Number.isFinite(battery.level)) return undefined
    return Math.max(0, Math.min(100, Math.round(battery.level * 100)))
  } catch {
    return undefined
  }
}
