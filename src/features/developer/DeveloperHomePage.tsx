import { Link } from '@tanstack/react-router'

export function DeveloperHomePage() {
  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-700">Developer tools</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight">Network diagnostics</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">These tools exist for ConnectX engineering, simulation and failure testing. They are intentionally separated from the normal user experience.</p>
      </header>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <ToolCard title="Mesh lab" description="Run deterministic multi-hop routing, packet-loss, ACK-loss, partition and relay-recovery scenarios." to="/developer/mesh" />
        <ToolCard title="Gateway lab" description="Inspect Radio ↔ Gateway ↔ Cloud queues, route learning, retry recovery and duplicate suppression." to="/developer/gateway" />
        <ToolCard title="Security foundation" description="Inspect the 0.7 crypto envelope, key-epoch and device-public-key foundation without claiming production E2E encryption." to="/developer/security" />
        <ToolCard title="Delivery coordinator" description="Inspect canonical logical messages, durable delivery queue state and per-path attempts introduced in 0.8.0." to="/developer/delivery" />
        <ToolCard title="Offline workspace" description="Inspect cached conversations, participants, queued messages and per-conversation sync cursors introduced in 0.8.1." to="/developer/workspace" />
        <ToolCard title="Mobile preview" description="Preview the normal ConnectX app at realistic phone and tablet viewport sizes without exposing diagnostics to users." to="/developer/mobile-preview" />
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-bold">What is not a user feature</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Seeds, packet timelines, node inspectors, queue depth, routing registry and adapter toggles are diagnostic controls. Normal ConnectX users should only see chats, SOS, network status, devices and profile settings.</p>
      </section>
    </main>
  )
}

function ToolCard({ title, description, to }: { title: string; description: string; to: '/developer/mesh' | '/developer/gateway' | '/developer/security' | '/developer/delivery' | '/developer/workspace' | '/developer/mobile-preview' }) {
  return (
    <Link to={to} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <h2 className="text-xl font-black">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      <span className="mt-4 inline-block text-sm font-bold text-slate-900">Open tool →</span>
    </Link>
  )
}
