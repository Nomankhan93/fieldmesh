import { APP_BRAND } from '../../config/brand'
import { usePwa } from './PwaProvider'

function StatusPill({ ok, children }: { ok: boolean; children: string }) {
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${ok ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{children}</span>
}

export function PwaSettingsCard() {
  const pwa = usePwa()
  const iosGuidance = pwa.installPlatform === 'ios' && !pwa.standalone && !pwa.canInstall

  return (
    <section className="mt-5 rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue-600">Installed app & offline access</p>
          <h2 className="mt-1 text-xl font-bold">{APP_BRAND.name} PWA</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Install ConnectX as a standalone app, keep the app shell available offline, and control service-worker updates.</p>
        </div>
        <StatusPill ok={pwa.standalone}>{pwa.standalone ? 'Installed' : 'Browser mode'}</StatusPill>
      </div>

      <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-slate-50 p-3"><dt className="text-slate-500">Network</dt><dd className="mt-1 font-bold">{pwa.online ? 'Online' : 'Offline'}</dd></div>
        <div className="rounded-xl bg-slate-50 p-3"><dt className="text-slate-500">Offline shell</dt><dd className="mt-1 font-bold">{pwa.offlineReady ? 'Ready' : 'Preparing'}</dd></div>
        <div className="rounded-xl bg-slate-50 p-3"><dt className="text-slate-500">Local storage</dt><dd className="mt-1 font-bold">{pwa.storagePersisted === true ? 'Persistent' : pwa.storagePersisted === false ? 'Browser managed' : 'Checking…'}</dd></div>
        <div className="rounded-xl bg-slate-50 p-3"><dt className="text-slate-500">Service worker</dt><dd className="mt-1 font-bold">{pwa.serviceWorkerSupported ? 'Supported' : 'Unavailable'}</dd></div>
      </dl>

      {!pwa.secureContext ? <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">PWA installation requires HTTPS in production (localhost is allowed for development).</p> : null}
      {pwa.registrationError ? <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-800">Service worker: {pwa.registrationError}</p> : null}
      {iosGuidance ? <p className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-900">{pwa.installInstructions}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {pwa.canInstall ? <button type="button" onClick={() => void pwa.install()} className="rounded-xl bg-gradient-to-r from-cyan-500 via-blue-600 to-violet-700 px-4 py-2.5 text-sm font-bold text-white">Install ConnectX</button> : null}
        {pwa.updateAvailable ? <button type="button" onClick={() => void pwa.applyUpdate()} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white">Update now</button> : null}
        <button type="button" disabled={!pwa.online || !pwa.serviceWorkerSupported} onClick={() => void pwa.checkForUpdate()} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-50">Check for updates</button>
      </div>

      {!pwa.standalone && !pwa.canInstall && !iosGuidance ? <p className="mt-3 text-xs leading-5 text-slate-500">If your browser supports installation, its install control may appear after ConnectX meets the browser's eligibility checks.</p> : null}
    </section>
  )
}
