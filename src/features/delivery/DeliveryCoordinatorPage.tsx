import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../offline/db'
import type { CanonicalMessageRecord, DeliveryPathAttemptRecord, DeliveryQueueRecord } from '../../core/delivery/types'
import { useAuth } from '../auth/AuthProvider'

function formatTime(value: number | undefined): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
}

export function DeliveryCoordinatorPage() {
  const { session } = useAuth()
  const localUserId = session?.user.id ?? ''
  const messages = useLiveQuery<CanonicalMessageRecord[], CanonicalMessageRecord[]>(
    () => localUserId
      ? db.canonicalMessages.where('localUserId').equals(localUserId).toArray()
      : Promise.resolve([]),
    [localUserId],
    [],
  )
  const queue = useLiveQuery<DeliveryQueueRecord[], DeliveryQueueRecord[]>(
    () => localUserId
      ? db.deliveryQueue.where('localUserId').equals(localUserId).toArray()
      : Promise.resolve([]),
    [localUserId],
    [],
  )
  const attempts = useLiveQuery<DeliveryPathAttemptRecord[], DeliveryPathAttemptRecord[]>(
    () => localUserId
      ? db.deliveryPathAttempts.where('localUserId').equals(localUserId).toArray()
      : Promise.resolve([]),
    [localUserId],
    [],
  )

  const recentAttempts = [...attempts].sort((a, b) => b.startedAt - a.startedAt).slice(0, 12)
  const submitted = messages.filter((message) => message.state === 'submitted' || message.state === 'delivered' || message.state === 'read').length

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-700">Developer tools</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight">Delivery coordinator</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Inspect the canonical logical-message queue and path attempts introduced in FieldMesh 0.8.0. Normal users do not select transports manually.
        </p>
      </header>

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <Metric label="Canonical messages" value={messages.length} detail="One logical record per local message view." />
        <Metric label="Queued" value={queue.length} detail="Waiting for an eligible delivery path or retry." />
        <Metric label="Progressed" value={submitted} detail="Submitted, delivered or read logical messages." />
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-bold">0.8.0 routing boundary</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Normal chat traffic now enters the coordinator before the Internet mailbox. Radio and gateway adapters share the same coordinator contract, but the user chat screen does not claim live RF routing yet. That integration belongs to the following software-alpha routing stages.
        </p>
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-4">
          <h2 className="font-bold">Recent path attempts</h2>
        </div>
        {recentAttempts.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">No delivery attempts recorded for this signed-in user yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Message</th>
                  <th className="px-4 py-3">Path</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Started</th>
                  <th className="px-4 py-3">Failure</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentAttempts.map((attempt) => (
                  <tr key={attempt.id}>
                    <td className="max-w-56 truncate px-4 py-3 font-mono text-xs text-slate-600">{attempt.messageId}</td>
                    <td className="px-4 py-3 font-semibold">{attempt.path}</td>
                    <td className="px-4 py-3">{attempt.status}</td>
                    <td className="px-4 py-3 text-slate-500">{formatTime(attempt.startedAt)}</td>
                    <td className="max-w-80 truncate px-4 py-3 text-xs text-rose-700">{attempt.failureReason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}

function Metric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-black tracking-tight">{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
    </article>
  )
}
