import { useEffect, useRef, useState } from 'react'
import { APP_BRAND } from '../../config/brand'
import { usePwa } from './PwaProvider'

const INSTALL_DISMISS_KEY = 'connectx:pwa-install-dismissed-at'
const OFFLINE_READY_ACK_KEY = 'connectx:pwa-offline-ready-ack'
const INSTALL_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000

function installSuggestionDismissed() {
  if (typeof window === 'undefined') return true
  const raw = window.localStorage.getItem(INSTALL_DISMISS_KEY)
  if (!raw) return false
  const value = Number(raw)
  if (!Number.isFinite(value)) return false
  return Date.now() - value < INSTALL_SNOOZE_MS
}

export function PwaStatusCenter() {
  const pwa = usePwa()
  const previousOnline = useRef(pwa.online)
  const [restored, setRestored] = useState(false)
  const [installDismissed, setInstallDismissed] = useState(installSuggestionDismissed)
  const [offlineReadyAcknowledged, setOfflineReadyAcknowledged] = useState(() => {
    if (typeof window === 'undefined') return true
    return window.localStorage.getItem(OFFLINE_READY_ACK_KEY) === '1'
  })

  useEffect(() => {
    if (!previousOnline.current && pwa.online) {
      setRestored(true)
      const timer = window.setTimeout(() => setRestored(false), 4500)
      previousOnline.current = pwa.online
      return () => window.clearTimeout(timer)
    }
    previousOnline.current = pwa.online
  }, [pwa.online])

  function dismissInstall() {
    window.localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now()))
    setInstallDismissed(true)
  }

  function acknowledgeOfflineReady() {
    window.localStorage.setItem(OFFLINE_READY_ACK_KEY, '1')
    setOfflineReadyAcknowledged(true)
  }

  const showIosInstall = pwa.installPlatform === 'ios' && !pwa.standalone
  const showInstall = !installDismissed && !pwa.standalone && (pwa.canInstall || showIosInstall)

  if (pwa.updateAvailable) {
    return (
      <StatusCard title="ConnectX update available" tone="blue" description="A newer app version is ready. Update when convenient; queued data remains in local storage." action="Update now" onAction={() => void pwa.applyUpdate()} />
    )
  }

  if (!pwa.online) {
    return (
      <StatusCard title="You're offline" tone="amber" description="ConnectX remains available. Existing chats and queued messages stay on this device until a route returns." />
    )
  }

  if (restored) {
    return <StatusCard title="Connection restored" tone="green" description="ConnectX can synchronize and retry queued work again." />
  }

  if (pwa.offlineReady && !offlineReadyAcknowledged) {
    return (
      <StatusCard title="Ready for offline use" tone="green" description="The ConnectX app shell is cached on this device." action="Got it" onAction={acknowledgeOfflineReady} />
    )
  }

  if (showInstall) {
    return (
      <StatusCard
        title={`Install ${APP_BRAND.name}`}
        tone="blue"
        description={showIosInstall ? 'In Safari, use Share → Add to Home Screen for a standalone app experience.' : 'Install the app for faster launch, standalone display and reliable access to cached conversations.'}
        action={pwa.canInstall ? 'Install' : undefined}
        onAction={pwa.canInstall ? () => void pwa.install() : undefined}
        secondaryAction="Later"
        onSecondaryAction={dismissInstall}
      />
    )
  }

  return null
}

function StatusCard({
  title,
  description,
  tone,
  action,
  secondaryAction,
  onAction,
  onSecondaryAction,
}: {
  title: string
  description: string
  tone: 'blue' | 'amber' | 'green'
  action?: string
  secondaryAction?: string
  onAction?: () => void
  onSecondaryAction?: () => void
}) {
  const toneClass = tone === 'amber'
    ? 'border-amber-200 bg-amber-50 text-amber-950'
    : tone === 'green'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
      : 'border-blue-200 bg-white text-slate-950'

  return (
    <aside className={`fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] right-3 z-[80] w-[calc(100%-1.5rem)] max-w-sm rounded-2xl border p-4 shadow-xl shadow-slate-950/10 lg:bottom-4 lg:right-4 ${toneClass}`} role="status" aria-live="polite">
      <p className="text-sm font-bold">{title}</p>
      <p className="mt-1 text-xs leading-5 opacity-75">{description}</p>
      {action || secondaryAction ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {action ? <button type="button" onClick={onAction} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white">{action}</button> : null}
          {secondaryAction ? <button type="button" onClick={onSecondaryAction} className="rounded-lg border border-current/15 bg-white/70 px-3 py-2 text-xs font-bold">{secondaryAction}</button> : null}
        </div>
      ) : null}
    </aside>
  )
}
