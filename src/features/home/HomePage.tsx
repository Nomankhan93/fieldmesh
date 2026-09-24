import { AuthPanel } from '../auth/AuthPanel'
import { useAuth } from '../auth/AuthProvider'
import { IdentityDashboard } from '../identity/IdentityDashboard'

export function HomePage() {
  const { configured, loading, session } = useAuth()

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">FieldMesh 0.6</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Location + SOS Safety Prototype</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          FieldMesh now combines durable messaging, deterministic mesh simulation and hybrid gateway recovery with location capture and emergency-priority SOS workflows that continue without GPS or direct Internet.
        </p>
      </header>

      {!configured ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-semibold text-amber-950">Supabase environment is not configured</h2>
          <p className="mt-2 text-sm leading-6 text-amber-900">
            Start the local Supabase stack, run <code className="rounded bg-white px-1.5 py-0.5">npm run env:local</code>, then restart the Vite dev server.
          </p>
        </section>
      ) : loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Checking session…</div>
      ) : session ? (
        <IdentityDashboard />
      ) : (
        <AuthPanel />
      )}
    </main>
  )
}
