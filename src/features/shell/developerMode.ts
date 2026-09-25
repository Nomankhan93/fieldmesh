const STORAGE_KEY = 'fieldmesh:developer-mode'
const EVENT_NAME = 'fieldmesh:developer-mode-change'

export function readDeveloperMode(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(STORAGE_KEY) === '1'
}

export function writeDeveloperMode(enabled: boolean): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: enabled }))
}

export function subscribeDeveloperMode(listener: (enabled: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  const handle = (event: Event) => {
    if (event instanceof CustomEvent && typeof event.detail === 'boolean') {
      listener(event.detail)
      return
    }
    listener(readDeveloperMode())
  }
  window.addEventListener(EVENT_NAME, handle)
  window.addEventListener('storage', handle)
  return () => {
    window.removeEventListener(EVENT_NAME, handle)
    window.removeEventListener('storage', handle)
  }
}
