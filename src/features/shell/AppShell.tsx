import { useEffect, useState } from 'react'
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { APP_BRAND } from '../../config/brand'
import { useAuth } from '../auth/AuthProvider'
import { NavIcon } from './NavIcon'
import { PwaStatusCenter } from '../pwa/PwaStatusCenter'
import { usePwa } from '../pwa/PwaProvider'
import {
  DEVELOPER_NAV_ITEMS,
  MOBILE_NAV_ITEMS,
  USER_NAV_ITEMS,
  isDeveloperPath,
  isNavItemActive,
  type FieldMeshNavItem,
} from './navigation'
import { readDeveloperMode, subscribeDeveloperMode, writeDeveloperMode } from './developerMode'

const SIDEBAR_KEY = 'fieldmesh:sidebar-collapsed'

function readSidebarCollapsed() {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(SIDEBAR_KEY) === '1'
}

function NavLink({
  item,
  pathname,
  compact = false,
  collapsed = false,
}: {
  item: FieldMeshNavItem
  pathname: string
  compact?: boolean
  collapsed?: boolean
}) {
  const active = isNavItemActive(pathname, item.to)
  const danger = item.to === '/sos'

  if (compact) {
    return (
      <Link
        to={item.to}
        aria-label={item.label}
        className={`relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-2xl px-1 py-1.5 text-[10px] font-semibold transition ${active ? (danger ? 'text-rose-700' : 'text-blue-700') : danger ? 'text-rose-600' : 'text-slate-500'}`}
      >
        <span className={`relative flex h-8 w-12 items-center justify-center rounded-full transition ${active ? (danger ? 'bg-rose-100' : 'bg-blue-100') : ''}`}>
          <NavIcon name={item.icon} className="h-5 w-5" />
          {active ? <span className={`absolute -bottom-1 h-1 w-1 rounded-full ${danger ? 'bg-rose-600' : 'bg-blue-600'}`} /> : null}
        </span>
        <span className="mt-1 max-w-full truncate">{item.label}</span>
      </Link>
    )
  }

  return (
    <Link
      to={item.to}
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={`flex items-center rounded-xl ${collapsed ? 'justify-center px-2 py-3' : 'gap-3 px-3 py-2.5'} ${active ? (danger ? 'bg-rose-700 text-white' : 'bg-gradient-to-r from-cyan-500 via-blue-600 to-violet-700 text-white shadow-sm') : danger ? 'text-rose-700 hover:bg-rose-50' : 'text-slate-700 hover:bg-blue-50'}`}
    >
      <NavIcon name={item.icon} className="h-5 w-5 shrink-0" />
      {!collapsed ? (
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{item.label}</span>
          <span className={`mt-0.5 block truncate text-[11px] ${active ? 'text-blue-50/85' : danger ? 'text-rose-400' : 'text-slate-400'}`}>{item.description}</span>
        </span>
      ) : null}
    </Link>
  )
}

function BrandIdentity({ compact = false, inverted = false }: { compact?: boolean; inverted?: boolean }) {
  if (compact) {
    return <img src={APP_BRAND.icon} alt={APP_BRAND.name} className="h-11 w-11 rounded-xl shadow-sm" />
  }

  return (
    <span className="flex min-w-0 items-center gap-3">
      <img src={APP_BRAND.icon} alt="" className="h-11 w-11 shrink-0 rounded-xl shadow-sm" />
      <span className="min-w-0">
        <span className={`block text-xl font-bold tracking-tight ${inverted ? 'text-white' : 'text-slate-950'}`}>{APP_BRAND.name}</span>
        <span className={`mt-0.5 block truncate text-[11px] font-semibold tracking-[0.08em] ${inverted ? 'text-blue-200' : 'text-slate-400'}`}>{APP_BRAND.tagline}</span>
      </span>
    </span>
  )
}

export function AppShell() {
  const { session, loading } = useAuth()
  const pwa = usePwa()
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const developer = isDeveloperPath(pathname)
  const [developerMode, setDeveloperMode] = useState(readDeveloperMode)
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed)

  useEffect(() => subscribeDeveloperMode(setDeveloperMode), [])

  useEffect(() => {
    if (!loading && !session && pathname !== '/') {
      void navigate({ to: '/', replace: true })
    }
  }, [loading, navigate, pathname, session])

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current
      window.localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0')
      return next
    })
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f9ff]">
        <div className="rounded-2xl border border-blue-100 bg-white px-6 py-5 text-sm font-medium text-slate-500 shadow-sm">
          Checking session…
        </div>
      </div>
    )
  }

  if (!session && pathname !== '/') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f9ff]">
        <div className="text-sm font-medium text-slate-500">Returning to sign in…</div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-[#f7f9ff]">
        <PwaStatusCenter />
        <header className="border-b border-blue-100 bg-white/95 backdrop-blur" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
            <Link to="/" aria-label="ConnectX home"><BrandIdentity /></Link>
            <span className="hidden rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 sm:inline-flex">v{APP_BRAND.version}</span>
          </div>
        </header>
        <Outlet />
      </div>
    )
  }

  const navItems = developer && developerMode ? DEVELOPER_NAV_ITEMS : USER_NAV_ITEMS
  const canRenderDeveloper = !developer || developerMode
  const mobileScreen = navItems.find((item) => isNavItemActive(pathname, item.to))
  const mobileTitle = pathname === '/' && !developer ? APP_BRAND.name : mobileScreen?.label ?? (developer ? 'Developer tools' : APP_BRAND.name)

  return (
    <div className="min-h-screen bg-[#f7f9ff] text-slate-950">
      <PwaStatusCenter />
      <header className="sticky top-0 z-40 border-b border-blue-100/80 bg-white/92 backdrop-blur-xl lg:hidden" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-2">
          <Link to={developer && developerMode ? '/developer' : '/'} aria-label="ConnectX home" className="flex min-w-0 items-center gap-2.5">
            <img src={APP_BRAND.icon} alt="" className="h-9 w-9 shrink-0 rounded-xl shadow-sm" />
            <span className="block truncate text-[15px] font-bold text-slate-950">{mobileTitle}</span>
          </Link>
          {developer && developerMode ? (
            <Link to="/" className="connectx-touch flex items-center rounded-full bg-amber-100 px-3 text-xs font-bold text-amber-900">Exit tools</Link>
          ) : (
            <span className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-bold ${pwa.online ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
              <span className={`h-2 w-2 rounded-full ${pwa.online ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {pwa.online ? 'Online' : 'Offline'}
            </span>
          )}
        </div>
      </header>

      <div
        className="lg:grid lg:min-h-screen"
        style={{ gridTemplateColumns: collapsed ? '84px minmax(0,1fr)' : '264px minmax(0,1fr)' }}
      >
        <aside className={`hidden border-r lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col ${developer && developerMode ? 'border-slate-800 bg-slate-950 text-white' : 'border-blue-100 bg-white'}`}>
          <div className={`flex items-center border-b border-inherit ${collapsed ? 'justify-center p-4' : 'justify-between p-4'}`}>
            <Link to={developer && developerMode ? '/developer' : '/'} className="min-w-0" aria-label="ConnectX home">
              <BrandIdentity compact={collapsed} inverted={developer && developerMode} />
            </Link>
          </div>

          <nav className="flex-1 space-y-1 p-3">
            {navItems.map((item) => <NavLink key={item.to} item={item} pathname={pathname} collapsed={collapsed} />)}
          </nav>

          <div className="border-t border-inherit p-3">
            {developer && developerMode ? (
              <Link to="/" title={collapsed ? 'Back to user app' : undefined} className={`flex items-center rounded-xl bg-white font-bold text-slate-950 ${collapsed ? 'justify-center p-3' : 'gap-2 px-3 py-2.5 text-sm'}`}>
                <NavIcon name="home" className="h-5 w-5" />
                {!collapsed ? 'Back to user app' : null}
              </Link>
            ) : developerMode ? (
              <Link to="/developer" title={collapsed ? 'Developer tools' : undefined} className={`flex items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 ${collapsed ? 'justify-center p-3' : 'gap-2 px-3 py-2 text-xs font-semibold'}`}>
                <NavIcon name="developer" className="h-5 w-5" />
                {!collapsed ? 'Developer tools' : null}
              </Link>
            ) : null}

            <button type="button" onClick={toggleSidebar} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className={`mt-2 flex w-full items-center rounded-xl text-slate-400 hover:bg-blue-50 hover:text-blue-700 ${collapsed ? 'justify-center p-3' : 'gap-2 px-3 py-2 text-xs font-semibold'}`}>
              <span aria-hidden="true" className="text-lg leading-none">{collapsed ? '›' : '‹'}</span>
              {!collapsed ? 'Collapse sidebar' : null}
            </button>
            {!collapsed ? <p className={`mt-3 text-center text-[11px] ${developer && developerMode ? 'text-slate-500' : 'text-slate-400'}`}>{APP_BRAND.name} {APP_BRAND.version}</p> : null}
          </div>
        </aside>

        <div className="min-w-0 pb-24 lg:pb-0">
          {developer && developerMode ? (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-semibold text-amber-900 lg:hidden">
              Simulation and diagnostics — not normal user controls
            </div>
          ) : null}
          {canRenderDeveloper ? <Outlet /> : <DeveloperModeGate onEnable={() => writeDeveloperMode(true)} />}
        </div>
      </div>

      {!developer ? (
        <nav
          className="fixed inset-x-0 bottom-0 z-50 border-t border-blue-100/80 bg-white/92 px-1.5 pt-1 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:hidden"
          style={{ paddingBottom: 'max(0.35rem, env(safe-area-inset-bottom))' }}
          aria-label="Primary navigation"
        >
          <div className="mx-auto flex min-h-[4.15rem] max-w-lg gap-0.5">
            {MOBILE_NAV_ITEMS.map((item) => <NavLink key={item.to} item={item} pathname={pathname} compact />)}
          </div>
        </nav>
      ) : null}
    </div>
  )
}

function DeveloperModeGate({ onEnable }: { onEnable: () => void }) {
  return (
    <main className="mx-auto max-w-xl p-6 sm:p-10">
      <section className="rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-800"><NavIcon name="developer" /></div>
        <h1 className="mt-4 text-2xl font-bold">Developer tools are disabled</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Mesh simulation, gateway queues and protocol diagnostics are intentionally hidden from the normal user app. Enable developer mode only when testing ConnectX internals.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={onEnable} className="rounded-xl bg-gradient-to-r from-cyan-500 via-blue-600 to-violet-700 px-4 py-2.5 text-sm font-bold text-white">Enable developer mode</button>
          <Link to="/profile" className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700">Back to profile</Link>
        </div>
      </section>
    </main>
  )
}
