import { useMemo, useState } from 'react'
import { APP_BRAND } from '../../config/brand'
import {
  MOBILE_PREVIEW_PRESETS,
  MOBILE_PREVIEW_ROUTES,
  previewDimensions,
  type MobilePreviewOrientation,
  type MobilePreviewPresetId,
} from './model'

export function MobilePreviewPage() {
  const [presetId, setPresetId] = useState<MobilePreviewPresetId>('iphone')
  const [orientation, setOrientation] = useState<MobilePreviewOrientation>('portrait')
  const [route, setRoute] = useState('/messages')
  const [frameKey, setFrameKey] = useState(0)

  const preset = MOBILE_PREVIEW_PRESETS.find((item) => item.id === presetId) ?? MOBILE_PREVIEW_PRESETS[0]!
  const dimensions = useMemo(() => previewDimensions(preset, orientation), [orientation, preset])

  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-700">Developer tools</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Mobile preview</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Preview the normal {APP_BRAND.name} user app inside realistic phone and tablet viewports. The preview is same-origin and uses the same signed-in session and local workspace.
        </p>
      </header>

      <section className="mt-6 grid gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="order-2 min-w-0 xl:order-1">
          <div className="overflow-auto rounded-2xl bg-slate-950/80 p-4 sm:p-6">
            <div
              className="mx-auto overflow-hidden rounded-[2.25rem] border-[8px] border-slate-800 bg-white shadow-2xl shadow-cyan-950/30"
              style={{ width: dimensions.width, height: dimensions.height, maxWidth: 'none' }}
            >
              <iframe
                key={frameKey}
                title={`ConnectX ${preset.label} preview`}
                src={route}
                className="h-full w-full border-0 bg-white"
              />
            </div>
          </div>
        </div>

        <aside className="order-1 space-y-4 xl:order-2">
          <div className="rounded-2xl border border-slate-700 bg-slate-950 p-4">
            <label className="block text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
              Device
              <select value={presetId} onChange={(event) => setPresetId(event.target.value as MobilePreviewPresetId)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-white">
                {MOBILE_PREVIEW_PRESETS.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.width}×{item.height}</option>)}
              </select>
            </label>

            <div className="mt-4 grid grid-cols-2 rounded-xl bg-slate-900 p-1 text-xs font-bold">
              {(['portrait', 'landscape'] as const).map((value) => (
                <button key={value} type="button" onClick={() => setOrientation(value)} className={`connectx-touch rounded-lg px-3 py-2 capitalize ${orientation === value ? 'bg-cyan-500 text-slate-950' : 'text-slate-400'}`}>{value}</button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-950 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Preview screen</p>
            <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-1">
              {MOBILE_PREVIEW_ROUTES.map((item) => (
                <button key={item.path} type="button" onClick={() => setRoute(item.path)} className={`connectx-touch rounded-xl px-3 py-2.5 text-left text-sm font-bold ${route === item.path ? 'bg-gradient-to-r from-cyan-500 via-blue-600 to-violet-700 text-white' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}`}>{item.label}</button>
              ))}
            </div>
          </div>

          <button type="button" onClick={() => setFrameKey((value) => value + 1)} className="connectx-touch w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-bold text-white">Reload preview</button>
          <p className="text-xs leading-5 text-slate-500">The iframe is a visual development tool, not a separate sandbox. Sending messages or changing settings affects this browser's normal ConnectX session.</p>
        </aside>
      </section>
    </main>
  )
}
