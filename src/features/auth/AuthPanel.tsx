import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'

type Mode = 'signin' | 'register'

export function AuthPanel() {
  const [mode, setMode] = useState<Mode>('signin')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
        if (password !== confirmPassword) throw new Error('Passwords do not match.')

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

  function changeMode(next: Mode) {
    setMode(next)
    setNotice('')
    setConfirmPassword('')
  }

  return (
    <section className="mx-auto w-full max-w-md rounded-[1.75rem] border border-blue-100 bg-white p-5 shadow-[0_18px_60px_rgba(30,64,175,0.10)] sm:p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">{mode === 'signin' ? 'Welcome back' : 'Create your account'}</h1>
        <p className="mt-1 text-sm leading-5 text-slate-500">{mode === 'signin' ? 'Sign in to continue to ConnectX.' : 'Create a ConnectX identity for messaging and offline access.'}</p>
      </div>

      <div className="flex rounded-2xl bg-slate-100 p-1">
        <button type="button" onClick={() => changeMode('signin')} className={`connectx-touch flex-1 rounded-xl px-3 text-sm font-semibold ${mode === 'signin' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}>Sign in</button>
        <button type="button" onClick={() => changeMode('register')} className={`connectx-touch flex-1 rounded-xl px-3 text-sm font-semibold ${mode === 'register' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}>Register</button>
      </div>

      <form className="mt-5 space-y-4" onSubmit={submit}>
        {mode === 'register' ? (
          <label className="block text-sm font-semibold text-slate-700">
            Display name
            <input className="connectx-input mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" maxLength={80} required />
          </label>
        ) : null}

        <label className="block text-sm font-semibold text-slate-700">
          Email
          <input className="connectx-input mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
        </label>

        <label className="block text-sm font-semibold text-slate-700">
          Password
          <span className="relative mt-1.5 block">
            <input className="connectx-input w-full rounded-xl border border-slate-300 px-3 py-3 pr-20 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={6} required />
            <button type="button" onClick={() => setShowPassword((current) => !current)} className="absolute inset-y-0 right-2 my-auto h-9 rounded-lg px-2 text-xs font-bold text-blue-700">{showPassword ? 'Hide' : 'Show'}</button>
          </span>
        </label>

        {mode === 'register' ? (
          <label className="block text-sm font-semibold text-slate-700">
            Confirm password
            <input className="connectx-input mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={6} required />
          </label>
        ) : null}

        <button className="connectx-touch w-full rounded-xl bg-gradient-to-r from-cyan-500 via-blue-600 to-violet-700 px-4 text-sm font-bold text-white shadow-sm transition hover:brightness-105 disabled:opacity-50" type="submit" disabled={busy}>
          {busy ? (mode === 'register' ? 'Creating account…' : 'Signing in…') : mode === 'register' ? 'Create account' : 'Sign in'}
        </button>
      </form>

      {notice ? <p aria-live="polite" className="mt-4 rounded-xl bg-slate-100 p-3 text-sm leading-5 text-slate-700">{notice}</p> : null}
    </section>
  )
}
