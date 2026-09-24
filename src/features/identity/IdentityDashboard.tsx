import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../../lib/supabase'

type Profile = {
  id: string
  fieldmesh_user_id: string
  display_name: string
  created_at: string
  updated_at: string
}

type DeviceStatus = 'active' | 'revoked'

type Device = {
  id: string
  owner_id: string
  fieldmesh_device_id: string
  label: string
  hardware_model: string | null
  radio_node_id: string | null
  status: DeviceStatus
  revoked_at: string | null
  created_at: string
}

export function IdentityDashboard() {
  const { session, signOut } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [devices, setDevices] = useState<Device[]>([])
  const [displayName, setDisplayName] = useState('')
  const [deviceLabel, setDeviceLabel] = useState('')
  const [notice, setNotice] = useState('Loading identity…')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!supabase || !session) return

    const [profileResult, deviceResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, fieldmesh_user_id, display_name, created_at, updated_at')
        .eq('id', session.user.id)
        .single(),
      supabase
        .from('devices')
        .select('id, owner_id, fieldmesh_device_id, label, hardware_model, radio_node_id, status, revoked_at, created_at')
        .eq('owner_id', session.user.id)
        .order('created_at', { ascending: true }),
    ])

    if (profileResult.error) throw profileResult.error
    if (deviceResult.error) throw deviceResult.error

    const nextProfile = profileResult.data as Profile
    setProfile(nextProfile)
    setDisplayName(nextProfile.display_name)
    setDevices((deviceResult.data ?? []) as Device[])
    setNotice('Identity loaded through authenticated RLS policies.')
  }, [session])

  useEffect(() => {
    void load().catch((error) => {
      setNotice(error instanceof Error ? error.message : 'Unable to load identity.')
    })
  }, [load])

  if (!session) return null

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !profile) return
    const value = displayName.trim()
    if (!value) return

    setBusy(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: value })
        .eq('id', profile.id)
      if (error) throw error
      await load()
      setNotice('Profile updated.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Profile update failed.')
    } finally {
      setBusy(false)
    }
  }

  async function addDevice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return

    const userId = session?.user.id
    if (!userId) {
      setNotice('Your session is no longer available. Please sign in again.')
      return
    }

    const label = deviceLabel.trim()
    if (!label) return

    setBusy(true)
    try {
      const { error } = await supabase.from('devices').insert({
        owner_id: userId,
        label,
      })
      if (error) throw error
      setDeviceLabel('')
      await load()
      setNotice('Device identity created. Real radio pairing comes in the hardware phase.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Device creation failed.')
    } finally {
      setBusy(false)
    }
  }

  async function revokeDevice(device: Device) {
    if (!supabase || device.status === 'revoked') return
    setBusy(true)
    try {
      const { error } = await supabase
        .from('devices')
        .update({ status: 'revoked', revoked_at: new Date().toISOString() })
        .eq('id', device.id)
      if (error) throw error
      await load()
      setNotice(`${device.label} revoked.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Device revocation failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Authenticated identity</p>
            <h2 className="mt-1 text-2xl font-bold">{profile?.display_name ?? 'FieldMesh user'}</h2>
            <p className="mt-1 text-sm text-slate-500">{session.user.email}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/messages" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
              Open internet messaging
            </Link>
            <Link to="/simulator" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">
              Open mesh failure simulator
            </Link>
            <Link to="/gateway" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">
              Hybrid gateway
            </Link>
            <Link to="/sos" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800">
              Location + SOS
            </Link>
          </div>
        </div>

        <div className="mt-5 rounded-xl bg-slate-50 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Stable FieldMesh User ID</div>
          <div className="mt-1 break-all font-mono text-sm">{profile?.fieldmesh_user_id ?? 'Loading…'}</div>
          <p className="mt-2 text-xs leading-5 text-slate-500">This identity is separate from future LoRa node IDs, so one user can own multiple radio devices.</p>
        </div>

        <form className="mt-5" onSubmit={saveProfile}>
          <label className="text-sm font-medium">
            Display name
            <div className="mt-1 flex flex-col gap-2 sm:flex-row">
              <input
                className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2.5"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                maxLength={80}
              />
              <button className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={busy}>
                Save profile
              </button>
            </div>
          </label>
        </form>

        <div className="mt-7">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">My devices</h3>
              <p className="text-sm text-slate-500">Logical device identities now; real Bluetooth/LoRa binding comes later.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold">{devices.length}</span>
          </div>

          <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={addDevice}>
            <input
              className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2.5"
              placeholder="e.g. Field radio 01"
              value={deviceLabel}
              onChange={(event) => setDeviceLabel(event.target.value)}
              maxLength={80}
            />
            <button className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold disabled:opacity-50" disabled={busy || !deviceLabel.trim()}>
              Add device
            </button>
          </form>

          <div className="mt-4 space-y-3">
            {devices.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">No device identities yet.</div>
            ) : (
              devices.map((device) => (
                <article key={device.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold">{device.label}</div>
                      <div className="mt-1 break-all font-mono text-xs text-slate-500">{device.fieldmesh_device_id}</div>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${device.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>
                      {device.status}
                    </span>
                  </div>
                  {device.status === 'active' && (
                    <button
                      type="button"
                      onClick={() => void revokeDevice(device)}
                      className="mt-3 text-sm font-semibold text-rose-700 disabled:opacity-50"
                      disabled={busy}
                    >
                      Revoke device
                    </button>
                  )}
                </article>
              ))
            )}
          </div>
        </div>
      </section>

      <aside className="space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-semibold">Messaging security boundary</h3>
          <ul className="mt-3 space-y-2 text-sm leading-5 text-slate-600">
            <li>• Profile rows are owner-only through RLS.</li>
            <li>• Device rows are owner-only through RLS.</li>
            <li>• Conversations are visible only to members.</li>
            <li>• Conversation membership can only be managed by the creator.</li>
            <li>• Cloud messages are immutable and visible only to conversation members.</li>
            <li>• Delivered/read receipts must be written by the receiving user.</li>
          </ul>
        </section>

        <p aria-live="polite" className="rounded-2xl bg-slate-900 p-4 text-sm text-white">{notice}</p>

        <button
          type="button"
          onClick={() => void signOut().catch((error) => setNotice(error instanceof Error ? error.message : 'Sign out failed.'))}
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold"
        >
          Sign out
        </button>
      </aside>
    </div>
  )
}
