import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'

type Mode = 'signin' | 'register'

export function AuthPanel() {
  const [mode, setMode] = useState<Mode>('signin')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return

    setBusy(true)
    setNotice('')
    try {
      if (mode === 'register') {
        if (!displayName.trim()) throw new Error('Display name is required.')
        if (password.length < 6) throw new Error('Password must be at least 6 characters.')

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: displayName.trim() } },
        })
        if (error) throw error
        setNotice(
          data.session
            ? 'Account created and signed in.'
            : 'Account created. Confirm the email before signing in if confirmations are enabled.',
        )
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (error) throw error
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Authentication failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex rounded-xl bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setMode('signin')}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${mode === 'signin' ? 'bg-white shadow-sm' : 'text-slate-600'}`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => setMode('register')}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${mode === 'register' ? 'bg-white shadow-sm' : 'text-slate-600'}`}
        >
          Register
        </button>
      </div>

      <form className="mt-5 space-y-4" onSubmit={submit}>
        {mode === 'register' && (
          <label className="block text-sm font-medium">
            Display name
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-700"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              autoComplete="name"
              maxLength={80}
              required
            />
          </label>
        )}

        <label className="block text-sm font-medium">
          Email
          <input
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-700"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </label>

        <label className="block text-sm font-medium">
          Password
          <input
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-700"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            minLength={6}
            required
          />
        </label>

        <button
          className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          type="submit"
          disabled={busy}
        >
          {busy ? 'Working…' : mode === 'register' ? 'Create account' : 'Sign in'}
        </button>
      </form>

      {notice && <p aria-live="polite" className="mt-4 rounded-xl bg-slate-100 p-3 text-sm text-slate-700">{notice}</p>}
    </section>
  )
}
