import { useState } from 'react'
import {
  decryptUtf8,
  encryptUtf8,
  fingerprintConversationKey,
  generateConversationKey,
} from '../../core/crypto/envelope'

export function SecurityFoundationPage() {
  const [result, setResult] = useState('Not run yet.')
  const [busy, setBusy] = useState(false)

  async function runSelfCheck() {
    setBusy(true)
    try {
      const key = await generateConversationKey()
      const aad = {
        conversationId: 'developer-self-check',
        messageId: crypto.randomUUID(),
        senderUserId: 'local-browser',
        messageType: 'text',
      }
      const envelope = await encryptUtf8({ key, plaintext: 'FieldMesh crypto self-check', keyEpoch: 1, aad })
      const plaintext = await decryptUtf8({ key, envelope, aad })
      const fingerprint = await fingerprintConversationKey(key)
      if (plaintext !== 'FieldMesh crypto self-check') throw new Error('Decryption mismatch.')
      setResult(`PASS · AES-GCM-256 · fingerprint ${fingerprint.slice(0, 16)}…`)
    } catch (error) {
      setResult(error instanceof Error ? `FAIL · ${error.message}` : 'FAIL')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-700">Developer tools</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight">Crypto foundation</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">ConnectX security foundation provides versioned encryption envelopes, key-epoch metadata, device public-key discovery and replay-protection hooks. Production end-to-end encryption is not enabled yet.</p>
      </header>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Browser primitive</p>
          <h2 className="mt-1 text-xl font-black">AES-GCM-256 envelope</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Authenticated encryption binds ciphertext to conversation ID, message ID, sender identity and message type through AAD.</p>
          <button type="button" disabled={busy} onClick={() => void runSelfCheck()} className="mt-4 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Running…' : 'Run self-check'}</button>
          <p className="mt-3 rounded-xl bg-slate-50 p-3 font-mono text-xs text-slate-700">{result}</p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Key architecture</p>
          <h2 className="mt-1 text-xl font-black">Server stores metadata, not secrets</h2>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
            <li>• Device registry accepts public ECDH-P256 keys only.</li>
            <li>• Conversation key epochs are metadata; symmetric keys are not stored in Supabase.</li>
            <li>• Only conversation members can resolve participating device public keys.</li>
            <li>• Group admins can rotate epoch metadata after membership changes.</li>
          </ul>
        </article>
      </section>

      <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
        <strong>Security boundary:</strong> current cloud chat bodies remain plaintext in the 0.7 prototype. Do not treat this release as production E2E encryption. A later security milestone must provision device private keys, distribute/wrap group keys, migrate message payloads to ciphertext-only storage, and complete revocation/rekey behavior.
      </section>
    </main>
  )
}
