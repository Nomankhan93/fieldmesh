import type { ReactNode } from 'react'

export function SectionHeader({ eyebrow, title, detail, compact = false }: { eyebrow?: string; title: string; detail?: string; compact?: boolean }) {
  return (
    <header className={compact ? 'hidden lg:block' : ''}>
      {eyebrow ? <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{eyebrow}</p> : null}
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
      {detail ? <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{detail}</p> : null}
    </header>
  )
}

export function StatusRow({ label, value, detail, tone = 'neutral', icon }: { label: string; value: string; detail?: string; tone?: 'good' | 'warn' | 'neutral'; icon?: ReactNode }) {
  const badge = tone === 'good' ? 'bg-emerald-100 text-emerald-800' : tone === 'warn' ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-700'
  const dot = tone === 'good' ? 'bg-emerald-500' : tone === 'warn' ? 'bg-amber-500' : 'bg-slate-300'
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${tone === 'good' ? 'bg-emerald-50 text-emerald-700' : tone === 'warn' ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-500'}`}>{icon ?? <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-900">{label}</p>
        {detail ? <p className="mt-0.5 text-xs leading-5 text-slate-500">{detail}</p> : null}
      </div>
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${badge}`}>{value}</span>
    </div>
  )
}

export function SettingsRow({ title, detail, value, onClick, danger = false }: { title: string; detail?: string; value?: string; onClick?: () => void; danger?: boolean }) {
  const content = (
    <>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-bold ${danger ? 'text-rose-700' : 'text-slate-900'}`}>{title}</p>
        {detail ? <p className="mt-0.5 text-xs leading-5 text-slate-500">{detail}</p> : null}
      </div>
      {value ? <span className="text-xs font-semibold text-slate-500">{value}</span> : null}
      {onClick ? <span className="text-lg leading-none text-slate-300">›</span> : null}
    </>
  )
  if (onClick) return <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50">{content}</button>
  return <div className="flex w-full items-center gap-3 px-4 py-3.5 text-left">{content}</div>
}
