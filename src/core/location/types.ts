export type LocationSource = 'browser' | 'simulated'

export interface LocationFix {
  id: string
  latitude: number
  longitude: number
  accuracy: number
  capturedAt: number
  source: LocationSource
}

export interface LocationCaptureResult {
  fix: LocationFix | null
  error: string | null
}

export function createLocationFix(args: {
  latitude: number
  longitude: number
  accuracy: number
  capturedAt?: number
  source?: LocationSource
  id?: string
}): LocationFix {
  if (!Number.isFinite(args.latitude) || args.latitude < -90 || args.latitude > 90) {
    throw new Error('Latitude must be between -90 and 90.')
  }
  if (!Number.isFinite(args.longitude) || args.longitude < -180 || args.longitude > 180) {
    throw new Error('Longitude must be between -180 and 180.')
  }
  if (!Number.isFinite(args.accuracy) || args.accuracy < 0) {
    throw new Error('Location accuracy must be zero or greater.')
  }

  return {
    id: args.id ?? crypto.randomUUID(),
    latitude: args.latitude,
    longitude: args.longitude,
    accuracy: args.accuracy,
    capturedAt: args.capturedAt ?? Date.now(),
    source: args.source ?? 'browser',
  }
}
