import { APP_BRAND } from '../../config/brand'
import { compactPwaStatus } from '../mobile/informationHierarchy'
import { usePwa } from './PwaProvider'

export function PwaSettingsCard({ showTechnical = false }: { showTechnical?: boolean }) {
  const pwa = usePwa()
  const iosGuidance = pwa.installPlatform === 'ios' && !pwa.standalone && !pwa.canInstall
  const status = compactPwaStatus({ standalone: pwa.standalone, offlineReady: pwa.offlineReady, updateAvailable: pwa.updateAvailable })

  return (
    <section className="mt-4 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue-600">App status</p>
          <h2 className="mt-1 text-lg font-bold text-slate-950">{APP_BRAND.name}</h2>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${pwa.standalone ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{status.installed}</span>
      </div>

      <div className="mt-3 divide-y divide-slate-100 rounded-xl bg-slate-50 px-3">
        <div className="flex items-center justify-between gap-3 py-3 text-sm"><span className="text-slate-600">Offline access</span><span className="font-bold text-slate-900">{status.offline}</span></div>
        <div className="flex items-center justify-between gap-3 py-3 text-sm"><span className="text-slate-600">Updates</span><span className={`font-bold ${pwa.updateAvailable ? 'text-blue-700' : 'text-slate-900'}`}>{status.updates}</span></div>
        <div className="flex items-center justify-between gap-3 py-3 text-sm"><span className="text-slate-600">Notifications</span><span className={`font-bold ${pwa.notificationPermission === 'granted' ? 'text-emerald-700' : 'text-slate-900'}`}>{pwa.notificationPermission === 'granted' ? 'On' : pwa.notificationPermission === 'denied' ? 'Blocked' : pwa.notificationPermission === 'unsupported' ? 'Unavailable' : 'Off'}</span></div>
      </div>

      {!pwa.secureContext ? <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">App installation requires HTTPS in production.</p> : null}
      {iosGuidance ? <p className="mt-3 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-900">{pwa.installInstructions}</p> : null}
      {pwa.registrationError ? <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-800">Offline app setup needs attention.</p> : null}
      {pwa.notificationPermission === 'denied' ? <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">Notifications are blocked in browser settings. Allow notifications for ConnectX to receive incoming-message alerts while the app is running or backgrounded.</p> : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {pwa.canInstall ? <button type="button" onClick={() => void pwa.install()} className="connectx-touch rounded-xl bg-gradient-to-r from-cyan-500 via-blue-600 to-violet-700 px-4 text-sm font-bold text-white">Install ConnectX</button> : null}
        {pwa.updateAvailable ? <button type="button" onClick={() => void pwa.applyUpdate()} className="connectx-touch rounded-xl bg-slate-950 px-4 text-sm font-bold text-white">Update now</button> : null}
        {pwa.notificationSupported && pwa.notificationPermission === 'default' ? <button type="button" onClick={() => void pwa.requestNotifications()} className="connectx-touch rounded-xl bg-gradient-to-r from-cyan-500 via-blue-600 to-violet-700 px-4 text-sm font-bold text-white">Enable notifications</button> : null}
        <button type="button" disabled={!pwa.online || !pwa.serviceWorkerSupported} onClick={() => void pwa.checkForUpdate()} className="connectx-touch rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 disabled:opacity-50">Check updates</button>
      </div>

      {showTechnical ? (
        <details className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <summary className="cursor-pointer text-xs font-bold text-amber-900">Developer PWA details</summary>
          <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
            <div><dt className="text-amber-700">Network</dt><dd className="font-bold text-amber-950">{pwa.online ? 'Online' : 'Offline'}</dd></div>
            <div><dt className="text-amber-700">Storage</dt><dd className="font-bold text-amber-950">{pwa.storagePersisted === true ? 'Persistent' : pwa.storagePersisted === false ? 'Browser managed' : 'Checking'}</dd></div>
            <div><dt className="text-amber-700">Service worker</dt><dd className="font-bold text-amber-950">{pwa.serviceWorkerSupported ? 'Supported' : 'Unavailable'}</dd></div>
            <div><dt className="text-amber-700">Standalone</dt><dd className="font-bold text-amber-950">{pwa.standalone ? 'Yes' : 'No'}</dd></div>
          </dl>
        </details>
      ) : null}
    </section>
  )
}
