import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { buildContactDeepLink, buildContactShareText, formatFieldMeshCode } from '../contacts/contactCode'
import { readDeveloperMode, subscribeDeveloperMode, writeDeveloperMode } from '../shell/developerMode'
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
  const [notice, setNotice] = useState('Loading profile…')
  const [busy, setBusy] = useState(false)
  const [developerMode, setDeveloperModeState] = useState(readDeveloperMode)

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
    setNotice('Profile ready.')
  }, [session])

  useEffect(() => {
    void load().catch((error) => {
      setNotice(error instanceof Error ? error.message : 'Unable to load profile.')
    })
  }, [load])

  useEffect(() => subscribeDeveloperMode(setDeveloperModeState), [])

  if (!session) {
    return (
      <main className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Sign in before opening your profile.</div>
      </main>
    )
  }

  const authenticatedUserId = session.user.id
  const authenticatedEmail = session.user.email
  const contactCode = profile ? formatFieldMeshCode(profile.fieldmesh_user_id) : 'Loading…'

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !profile) return
    const value = displayName.trim()
    if (!value) return

    setBusy(true)
    try {
      const { error } = await supabase.from('profiles').update({ display_name: value }).eq('id', profile.id)
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
    const label = deviceLabel.trim()
    if (!label) return

    setBusy(true)
    try {
      const { error } = await supabase.from('devices').insert({ owner_id: authenticatedUserId, label })
      if (error) throw error
      setDeviceLabel('')
      await load()
      setNotice('Device added. Radio pairing will become available during hardware integration.')
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

  async function copyContactCode() {
    if (!profile) return
    try {
      await navigator.clipboard.writeText(formatFieldMeshCode(profile.fieldmesh_user_id))
      setNotice('FieldMesh code copied.')
    } catch {
      setNotice('Clipboard access is unavailable in this browser.')
    }
  }

  async function shareContact() {
    if (!profile) return
    const text = buildContactShareText({
      displayName: profile.display_name,
      fieldMeshUserId: profile.fieldmesh_user_id,
    })
    try {
      if (navigator.share) {
        await navigator.share({ title: 'FieldMesh contact', text })
        setNotice('Contact share sheet opened.')
      } else {
        await navigator.clipboard.writeText(text)
        setNotice('Contact details copied for sharing.')
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setNotice('Unable to share contact details from this browser.')
    }
  }

  function setDeveloperMode(enabled: boolean) {
    writeDeveloperMode(enabled)
    setNotice(enabled ? 'Developer tools enabled.' : 'Developer tools hidden from the user app.')
  }

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Profile</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Profile & devices</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Manage your account, share your FieldMesh contact code and prepare compatible radio devices.</p>
      </header>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Signed in</p>
            <h2 className="mt-1 text-2xl font-bold">{profile?.display_name ?? 'FieldMesh user'}</h2>
            <p className="mt-1 text-sm text-slate-500">{authenticatedEmail}</p>
          </div>
          <div className="min-w-[220px] rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Your FieldMesh code</p>
            <p className="mt-1 font-mono text-lg font-bold tracking-wide text-slate-900">{contactCode}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={!profile} onClick={() => void copyContactCode()} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold disabled:opacity-50">Copy code</button>
              <button type="button" disabled={!profile} onClick={() => void shareContact()} className="rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">Share contact</button>
            </div>
          </div>
        </div>

        <form className="mt-5" onSubmit={saveProfile}>
          <label className="text-sm font-semibold text-slate-700">
            Display name
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2.5" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={80} />
              <button className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50" disabled={busy}>Save</button>
            </div>
          </label>
        </form>

        {profile ? (
          <details className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <summary className="cursor-pointer text-sm font-bold text-slate-700">Contact & identity details</summary>
            <div className="mt-3 space-y-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">QR-ready contact payload</p>
                <p className="mt-1 break-all font-mono text-xs text-slate-700">{buildContactDeepLink(profile.fieldmesh_user_id)}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">Camera QR scanning is not enabled yet. This payload contract is ready for the mobile scanner phase.</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Technical FieldMesh User ID</p>
                <p className="mt-1 break-all font-mono text-xs text-slate-700">{profile.fieldmesh_user_id}</p>
              </div>
            </div>
          </details>
        ) : null}
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">My devices</h2>
            <p className="mt-1 text-sm text-slate-500">Add and manage FieldMesh radio devices. Bluetooth/LoRa pairing will be enabled in the hardware-integration phase.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{devices.filter((item) => item.status === 'active').length} active</span>
        </div>

        <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={addDevice}>
          <input className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2.5" placeholder="e.g. Field radio 01" value={deviceLabel} onChange={(event) => setDeviceLabel(event.target.value)} maxLength={80} />
          <button className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold disabled:opacity-50" disabled={busy || !deviceLabel.trim()}>Add device</button>
        </form>

        <div className="mt-4 space-y-3">
          {devices.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">No FieldMesh radio devices added yet.</div>
          ) : devices.map((device) => (
            <article key={device.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold">{device.label}</h3>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${device.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{device.status}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">Radio pairing not connected yet</p>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-500">Technical device ID</summary>
                  <p className="mt-1 break-all font-mono text-[11px] text-slate-500">{device.fieldmesh_device_id}</p>
                </details>
              </div>
              {device.status === 'active' ? <button type="button" disabled={busy} onClick={() => void revokeDevice(device)} className="rounded-xl border border-rose-200 px-3 py-2 text-sm font-bold text-rose-700 disabled:opacity-50">Revoke</button> : null}
            </article>
          ))}
        </div>
      </section>

      <details className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
        <summary className="cursor-pointer font-bold text-slate-800">Advanced app settings</summary>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold">Developer mode</p>
            <p className="mt-1 max-w-xl text-xs leading-5 text-slate-500">Shows Mesh Lab, Gateway Lab and protocol diagnostics. Keep this off for normal FieldMesh use.</p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={developerMode} onChange={(event) => setDeveloperMode(event.target.checked)} className="h-5 w-5" />
            {developerMode ? 'Enabled' : 'Off'}
          </label>
        </div>
      </details>

      <section className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5">
        <p aria-live="polite" className="text-sm text-slate-600">{notice}</p>
        <button type="button" disabled={busy} onClick={() => void signOut()} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold">Sign out</button>
      </section>
    </main>
  )
}
