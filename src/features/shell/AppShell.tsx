import { useEffect, useState } from 'react'
import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { useAuth } from '../auth/AuthProvider'
import { NavIcon } from './NavIcon'
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
        className={`relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-xl px-1 py-1.5 text-[10px] font-semibold ${active ? (danger ? 'bg-rose-700 text-white' : 'bg-slate-950 text-white') : danger ? 'text-rose-700' : 'text-slate-600'}`}
      >
        <NavIcon name={item.icon} className="h-5 w-5" />
        <span className="mt-1 truncate">{item.label}</span>
      </Link>
    )
  }

  return (
    <Link
      to={item.to}
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={`flex items-center rounded-xl ${collapsed ? 'justify-center px-2 py-3' : 'gap-3 px-3 py-2.5'} ${active ? (danger ? 'bg-rose-700 text-white' : 'bg-slate-950 text-white') : danger ? 'text-rose-700 hover:bg-rose-50' : 'text-slate-700 hover:bg-slate-100'}`}
    >
      <NavIcon name={item.icon} className="h-5 w-5 shrink-0" />
      {!collapsed ? (
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{item.label}</span>
          <span className={`mt-0.5 block truncate text-[11px] ${active ? 'text-slate-300' : danger ? 'text-rose-400' : 'text-slate-400'}`}>{item.description}</span>
        </span>
      ) : null}
    </Link>
  )
}

export function AppShell() {
  const { session } = useAuth()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const developer = isDeveloperPath(pathname)
  const [developerMode, setDeveloperMode] = useState(readDeveloperMode)
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed)

  useEffect(() => subscribeDeveloperMode(setDeveloperMode), [])

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current
      window.localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0')
      return next
    })
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
            <Link to="/" className="font-bold tracking-tight text-slate-950">FieldMesh</Link>
            <span className="text-xs font-semibold text-slate-500">0.7.0</span>
          </div>
        </header>
        <Outlet />
      </div>
    )
  }

  const navItems = developer && developerMode ? DEVELOPER_NAV_ITEMS : USER_NAV_ITEMS
  const canRenderDeveloper = !developer || developerMode

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Link to="/" className="font-bold tracking-tight">FieldMesh</Link>
          {developer && developerMode ? (
            <Link to="/" className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">Exit developer tools</Link>
          ) : (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">Connected</span>
          )}
        </div>
      </header>

      <div
        className="lg:grid lg:min-h-screen"
        style={{ gridTemplateColumns: collapsed ? '84px minmax(0,1fr)' : '248px minmax(0,1fr)' }}
      >
        <aside className={`hidden border-r lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col ${developer && developerMode ? 'border-slate-800 bg-slate-950 text-white' : 'border-slate-200 bg-white'}`}>
          <div className={`flex items-center border-b border-inherit ${collapsed ? 'justify-center p-4' : 'justify-between p-5'}`}>
            <Link to={developer && developerMode ? '/developer' : '/'} className="min-w-0">
              {collapsed ? (
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-sm font-black text-white">FM</span>
              ) : (
                <>
                  <span className="block text-xl font-bold tracking-tight">FieldMesh</span>
                  <span className={`mt-1 block text-[11px] font-semibold uppercase tracking-[0.16em] ${developer && developerMode ? 'text-amber-300' : 'text-slate-400'}`}>
                    {developer && developerMode ? 'Developer tools' : 'Resilient messaging'}
                  </span>
                </>
              )}
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

            <button type="button" onClick={toggleSidebar} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className={`mt-2 flex w-full items-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 ${collapsed ? 'justify-center p-3' : 'gap-2 px-3 py-2 text-xs font-semibold'}`}>
              <span aria-hidden="true" className="text-lg leading-none">{collapsed ? '›' : '‹'}</span>
              {!collapsed ? 'Collapse sidebar' : null}
            </button>
            {!collapsed ? <p className={`mt-3 text-center text-[11px] ${developer && developerMode ? 'text-slate-500' : 'text-slate-400'}`}>FieldMesh 0.7.0</p> : null}
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
          className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-1.5 pt-1.5 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur lg:hidden"
          style={{ paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto flex max-w-lg gap-1">
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
        <p className="mt-2 text-sm leading-6 text-slate-600">Mesh simulation, gateway queues and protocol diagnostics are intentionally hidden from the normal user app. Enable developer mode only when testing FieldMesh internals.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={onEnable} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white">Enable developer mode</button>
          <Link to="/profile" className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700">Back to profile</Link>
        </div>
      </section>
    </main>
  )
}
