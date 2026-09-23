import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { RADIO_ENVELOPE_BUDGET_BYTES, utf8ByteLength } from '../../core/message/codec'
import { MessageEngine } from '../../core/message/engine'
import type { FieldMeshUserId } from '../../core/message/types'
import { db } from '../../offline/db'
import { MockRadioTransport } from '../../transports/mockRadio'

const radio = new MockRadioTransport()
const engine = new MessageEngine(radio)

const userLabel: Record<FieldMeshUserId, string> = {
  'user-a': 'User A',
  'user-b': 'User B',
}

export function SimulatorPage() {
  const [activeUser, setActiveUser] = useState<FieldMeshUserId>('user-a')
  const [text, setText] = useState('')
  const [linkUp, setLinkUp] = useState(true)
  const [latencyMs, setLatencyMs] = useState(300)
  const [packetLossPercent, setPacketLossPercent] = useState(0)
  const [notice, setNotice] = useState('Simulator ready.')

  const recipientId: FieldMeshUserId = activeUser === 'user-a' ? 'user-b' : 'user-a'

  const messages = useLiveQuery(
    () => db.messages.orderBy('createdAt').toArray(),
    [],
    [],
  )

  const outboxCount = useLiveQuery(() => db.outbox.count(), [], 0)

  useEffect(() => {
    radio.configure({ linkUp, latencyMs, packetLossPercent })
    if (linkUp) {
      void engine.retryOutbox().then(() => setNotice('Radio restored; queued messages retried.'))
    }
  }, [linkUp, latencyMs, packetLossPercent])

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (linkUp) void engine.retryOutbox()
    }, 2_000)
    return () => window.clearInterval(timer)
  }, [linkUp])

  const roughTextBytes = useMemo(() => utf8ByteLength(text), [text])

  async function sendMessage() {
    try {
      const result = await engine.sendText({
        senderId: activeUser,
        recipientId,
        text,
      })
      setText('')
      setNotice(`Message submitted (${result.encodedBytes} encoded bytes).`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to send message.')
    }
  }

  async function replayLastPacket() {
    const last = messages.at(-1)
    if (!last) {
      setNotice('Send a message before testing duplicate replay.')
      return
    }
    const result = await engine.replayPacket(last.id)
    setNotice(result === 'duplicate' ? 'Duplicate packet suppressed successfully.' : 'Packet accepted.')
  }

  async function resetSimulator() {
    await db.transaction(
      'rw',
      db.messages,
      db.outbox,
      db.seenPackets,
      db.deliveryAttempts,
      async () => {
        await Promise.all([
          db.messages.clear(),
          db.outbox.clear(),
          db.seenPackets.clear(),
          db.deliveryAttempts.clear(),
        ])
      },
    )
    setNotice('Simulator data cleared.')
  }

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <header className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">FieldMesh 0.3</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">Offline Messaging Simulator</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Simulated radio — no physical transmission. Messages, queues and deduplication are persisted in IndexedDB.
            </p>
          </div>
          <span className={`rounded-full px-3 py-1.5 text-sm font-semibold ${linkUp ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
            {linkUp ? 'Mock radio online' : 'Mock radio offline'}
          </span>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Conversation</h2>
                <p className="text-sm text-slate-500">{userLabel[activeUser]} → {userLabel[recipientId]}</p>
              </div>
              <select
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                value={activeUser}
                onChange={(event) => setActiveUser(event.target.value as FieldMeshUserId)}
              >
                <option value="user-a">Act as User A</option>
                <option value="user-b">Act as User B</option>
              </select>
            </div>
          </div>

          <div className="min-h-80 space-y-3 bg-slate-50 p-4">
            {messages.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                No messages yet. Turn the radio off to test the durable outbox.
              </div>
            ) : (
              messages.map((message) => {
                const mine = message.senderId === activeUser
                return (
                  <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${mine ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-900'}`}>
                      <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
                      <div className={`mt-2 flex flex-wrap gap-2 text-[11px] ${mine ? 'text-slate-300' : 'text-slate-500'}`}>
                        <span>{userLabel[message.senderId]} → {userLabel[message.recipientId]}</span>
                        <span>•</span>
                        <span>{message.state}</span>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <div className="border-t border-slate-200 p-4">
            <textarea
              className="min-h-24 w-full resize-y rounded-xl border border-slate-300 p-3 text-base outline-none focus:border-slate-600"
              placeholder="Type a short radio message..."
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-500">
                Text UTF-8 bytes: {roughTextBytes}. Full encoded packet must remain within {RADIO_ENVELOPE_BUDGET_BYTES} bytes.
              </div>
              <button
                type="button"
                onClick={() => void sendMessage()}
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!text.trim()}
              >
                Send as {userLabel[activeUser]}
              </button>
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="font-semibold">Network controls</h2>
            <label className="mt-4 flex items-center justify-between gap-3 text-sm">
              <span>Radio link</span>
              <input type="checkbox" checked={linkUp} onChange={(event) => setLinkUp(event.target.checked)} className="h-5 w-5" />
            </label>

            <label className="mt-4 block text-sm">
              <span className="flex justify-between"><span>Latency</span><span>{latencyMs} ms</span></span>
              <input className="mt-2 w-full" type="range" min="0" max="3000" step="100" value={latencyMs} onChange={(event) => setLatencyMs(Number(event.target.value))} />
            </label>

            <label className="mt-4 block text-sm">
              <span className="flex justify-between"><span>Packet loss</span><span>{packetLossPercent}%</span></span>
              <input className="mt-2 w-full" type="range" min="0" max="100" step="5" value={packetLossPercent} onChange={(event) => setPacketLossPercent(Number(event.target.value))} />
            </label>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">Queued messages</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-sm font-bold">{outboxCount}</span>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">Turn radio OFF, send a message, then restore the link. The queue survives page refresh.</p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="font-semibold">Validation tools</h2>
            <div className="mt-3 grid gap-2">
              <button type="button" onClick={() => void replayLastPacket()} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium">Replay last packet</button>
              <button type="button" onClick={() => void resetSimulator()} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium">Reset local simulator</button>
            </div>
          </section>

          <p aria-live="polite" className="rounded-2xl bg-slate-900 p-4 text-sm text-white">{notice}</p>
        </aside>
      </div>
    </main>
  )
}
