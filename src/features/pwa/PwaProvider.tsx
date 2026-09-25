import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react'
import { registerSW } from 'virtual:pwa-register'
import { detectPwaInstallPlatform, installGuidance, isStandaloneDisplay, type PwaInstallPlatform } from './model'

type InstallOutcome = 'accepted' | 'dismissed' | null

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type PwaContextValue = {
  online: boolean
  standalone: boolean
  serviceWorkerSupported: boolean
  secureContext: boolean
  offlineReady: boolean
  updateAvailable: boolean
  canInstall: boolean
  installPlatform: PwaInstallPlatform
  installInstructions: string
  installOutcome: InstallOutcome
  storagePersisted: boolean | null
  registrationError: string | null
  install: () => Promise<InstallOutcome>
  applyUpdate: () => Promise<void>
  checkForUpdate: () => Promise<void>
}

const PwaContext = createContext<PwaContextValue | null>(null)

function readStandalone() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  const navigatorStandalone = (navigator as Navigator & { standalone?: boolean }).standalone
  return isStandaloneDisplay({
    displayModeStandalone: window.matchMedia?.('(display-mode: standalone)').matches ?? false,
    navigatorStandalone,
  })
}

function detectPlatform() {
  if (typeof navigator === 'undefined') return 'unknown' as const
  return detectPwaInstallPlatform({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
  })
}

export function PwaProvider({ children }: PropsWithChildren) {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine)
  const [standalone, setStandalone] = useState(readStandalone)
  const [offlineReady, setOfflineReady] = useState(() => typeof navigator !== 'undefined' && Boolean(navigator.serviceWorker?.controller))
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installOutcome, setInstallOutcome] = useState<InstallOutcome>(null)
  const [storagePersisted, setStoragePersisted] = useState<boolean | null>(null)
  const [registrationError, setRegistrationError] = useState<string | null>(null)
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)
  const updateRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null)
  const registrationStartedRef = useRef(false)

  const serviceWorkerSupported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator
  const secureContext = typeof window === 'undefined' ? true : window.isSecureContext
  const installPlatform = useMemo(detectPlatform, [])

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true)
      void registrationRef.current?.update().catch(() => undefined)
    }
    const handleOffline = () => setOnline(false)
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
      setInstallOutcome(null)
    }
    const handleAppInstalled = () => {
      setInstallPrompt(null)
      setStandalone(true)
      setInstallOutcome('accepted')
    }

    const displayMode = window.matchMedia?.('(display-mode: standalone)')
    const handleDisplayMode = () => setStandalone(readStandalone())

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)
    displayMode?.addEventListener?.('change', handleDisplayMode)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
      displayMode?.removeEventListener?.('change', handleDisplayMode)
    }
  }, [])

  useEffect(() => {
    if (!serviceWorkerSupported || registrationStartedRef.current) return
    registrationStartedRef.current = true

    try {
      updateRef.current = registerSW({
        immediate: true,
        onNeedRefresh() {
          setUpdateAvailable(true)
        },
        onOfflineReady() {
          setOfflineReady(true)
        },
        onRegisteredSW(_swUrl, registration) {
          registrationRef.current = registration ?? null
          if (navigator.serviceWorker.controller) setOfflineReady(true)
        },
        onRegisterError(error) {
          setRegistrationError(error instanceof Error ? error.message : String(error))
        },
      })
    } catch (error) {
      setRegistrationError(error instanceof Error ? error.message : String(error))
    }
  }, [serviceWorkerSupported])

  useEffect(() => {
    let cancelled = false

    async function requestPersistentStorage() {
      if (!navigator.storage?.persisted) return
      try {
        const alreadyPersisted = await navigator.storage.persisted()
        if (cancelled) return
        if (alreadyPersisted) {
          setStoragePersisted(true)
          return
        }
        if (!navigator.storage.persist) {
          setStoragePersisted(false)
          return
        }
        const persisted = await navigator.storage.persist()
        if (!cancelled) setStoragePersisted(persisted)
      } catch {
        if (!cancelled) setStoragePersisted(false)
      }
    }

    void requestPersistentStorage()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!serviceWorkerSupported) return
    const interval = window.setInterval(() => {
      if (navigator.onLine) void registrationRef.current?.update().catch(() => undefined)
    }, 60 * 60 * 1000)
    return () => window.clearInterval(interval)
  }, [serviceWorkerSupported])

  const install = useCallback(async (): Promise<InstallOutcome> => {
    if (!installPrompt) return null
    try {
      await installPrompt.prompt()
      const choice = await installPrompt.userChoice
      setInstallOutcome(choice.outcome)
      setInstallPrompt(null)
      if (choice.outcome === 'accepted') setStandalone(readStandalone())
      return choice.outcome
    } catch {
      return null
    }
  }, [installPrompt])

  const applyUpdate = useCallback(async () => {
    const update = updateRef.current
    if (!update) return
    await update(true)
  }, [])

  const checkForUpdate = useCallback(async () => {
    if (!serviceWorkerSupported || !navigator.onLine) return
    try {
      const registration = registrationRef.current ?? await navigator.serviceWorker.ready
      registrationRef.current = registration
      await registration.update()
    } catch (error) {
      setRegistrationError(error instanceof Error ? error.message : String(error))
    }
  }, [serviceWorkerSupported])

  const value = useMemo<PwaContextValue>(() => ({
    online,
    standalone,
    serviceWorkerSupported,
    secureContext,
    offlineReady,
    updateAvailable,
    canInstall: Boolean(installPrompt) && !standalone,
    installPlatform,
    installInstructions: installGuidance(installPlatform),
    installOutcome,
    storagePersisted,
    registrationError,
    install,
    applyUpdate,
    checkForUpdate,
  }), [
    online,
    standalone,
    serviceWorkerSupported,
    secureContext,
    offlineReady,
    updateAvailable,
    installPrompt,
    installPlatform,
    installOutcome,
    storagePersisted,
    registrationError,
    install,
    applyUpdate,
    checkForUpdate,
  ])

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>
}

export function usePwa() {
  const value = useContext(PwaContext)
  if (!value) throw new Error('usePwa must be used inside PwaProvider')
  return value
}
