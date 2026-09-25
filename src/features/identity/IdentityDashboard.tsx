import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { buildContactDeepLink, buildContactShareText, formatFieldMeshCode } from '../contacts/contactCode'
import { readDeveloperMode, subscribeDeveloperMode, writeDeveloperMode } from '../shell/developerMode'
import { supabase } from '../../lib/supabase'
import { PwaSettingsCard } from '../pwa/PwaSettingsCard'
import { APP_BRAND } from '../../config/brand'
import { SectionHeader } from '../mobile/CompactUi'

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

  const authenticatedEmail = session.user.email
  const contactCode = profile ? formatFieldMeshCode(profile.fieldmesh_user_id) : 'Loading…'

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !profile) return
    const value = displayName.trim()
    if (!value) return

    setBusy(true)
    try {
      const { error } = await supabase.rpc('fieldmesh_update_display_name', { p_display_name: value })
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
      const { error } = await supabase.rpc('fieldmesh_create_device', { p_label: label })
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
      const { error } = await supabase.rpc('fieldmesh_revoke_device', { p_device_id: device.id })
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
      setNotice('ConnectX code copied.')
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
        await navigator.share({ title: 'ConnectX contact', text })
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

  const initials = (profile?.display_name || authenticatedEmail || 'CX')
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'CX'

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
      <SectionHeader eyebrow="Profile" title="Profile & devices" detail="Manage your account, ConnectX ID, devices and app settings." compact />

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:mt-6 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 via-blue-600 to-violet-700 text-sm font-black tracking-wide text-white shadow-sm">{initials}</span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-bold text-slate-950">{profile?.display_name ?? 'ConnectX user'}</h2>
            <p className="mt-0.5 truncate text-sm text-slate-500">{authenticatedEmail}</p>
          </div>
        </div>

        <form className="mt-4" onSubmit={saveProfile}>
          <label className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Display name</label>
          <div className="mt-2 flex gap-2">
            <input className="connectx-input min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2.5" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={80} />
            <button className="connectx-touch rounded-xl bg-slate-950 px-4 text-sm font-bold text-white disabled:opacity-50" disabled={busy || !displayName.trim()}>Save</button>
          </div>
        </form>
      </section>

      <section className="mt-4 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue-600">Your ConnectX ID</p>
            <p className="mt-1 break-all font-mono text-lg font-bold tracking-wide text-slate-950">{contactCode}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Share this ID so another ConnectX user can start a conversation with you.</p>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <button type="button" disabled={!profile} onClick={() => void copyContactCode()} className="connectx-touch flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold disabled:opacity-50 sm:flex-none">Copy</button>
            <button type="button" disabled={!profile} onClick={() => void shareContact()} className="connectx-touch flex-1 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-600 to-violet-700 px-3 text-sm font-bold text-white disabled:opacity-50 sm:flex-none">Share</button>
          </div>
        </div>

        {developerMode && profile ? (
          <details className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <summary className="cursor-pointer text-xs font-bold text-amber-900">Developer identity details</summary>
            <div className="mt-3 space-y-3 text-xs">
              <div><p className="font-bold uppercase tracking-wide text-amber-800">Contact payload</p><p className="mt-1 break-all font-mono text-amber-950">{buildContactDeepLink(profile.fieldmesh_user_id)}</p></div>
              <div><p className="font-bold uppercase tracking-wide text-amber-800">Technical identity ID</p><p className="mt-1 break-all font-mono text-amber-950">{profile.fieldmesh_user_id}</p></div>
            </div>
          </details>
        ) : null}
      </section>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-950">My devices</h2>
            <p className="mt-0.5 text-xs leading-5 text-slate-500">Compatible ConnectX radio devices will appear here.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700">{devices.filter((item) => item.status === 'active').length} active</span>
        </div>

        <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={addDevice}>
          <input className="connectx-input min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Device name" value={deviceLabel} onChange={(event) => setDeviceLabel(event.target.value)} maxLength={80} />
          <button className="connectx-touch rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold disabled:opacity-50" disabled={busy || !deviceLabel.trim()}>Add device</button>
        </form>

        <div className="mt-3 space-y-2">
          {devices.length === 0 ? (
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No radio devices added yet.</div>
          ) : devices.map((device) => (
            <article key={device.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-sm font-black text-blue-700">R</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-bold">{device.label}</h3><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${device.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{device.status}</span></div>
                <p className="mt-0.5 text-xs text-slate-500">Radio pairing not connected yet</p>
                {developerMode ? <p className="mt-1 break-all font-mono text-[10px] text-slate-400">{device.fieldmesh_device_id}</p> : null}
              </div>
              {device.status === 'active' ? <button type="button" disabled={busy} onClick={() => void revokeDevice(device)} className="connectx-touch rounded-xl px-3 text-xs font-bold text-rose-700 disabled:opacity-50">Revoke</button> : null}
            </article>
          ))}
        </div>
      </section>

      <PwaSettingsCard showTechnical={developerMode} />

      <details className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
        <summary className="cursor-pointer text-sm font-bold text-slate-800">About & advanced</summary>
        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-sm font-bold">ConnectX version</p><p className="mt-0.5 text-xs text-slate-500">User-facing build</p></div>
            <span className="text-xs font-bold text-slate-500">v{APP_BRAND.version}</span>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <div><p className="text-sm font-bold">Developer mode</p><p className="mt-0.5 text-xs leading-5 text-slate-500">Shows engineering diagnostics and protocol tools.</p></div>
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={developerMode} onChange={(event) => setDeveloperMode(event.target.checked)} className="h-5 w-5" />{developerMode ? 'On' : 'Off'}</label>
          </div>
        </div>
      </details>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        {notice && notice !== 'Profile ready.' ? <p aria-live="polite" className="mb-3 text-xs leading-5 text-slate-500">{notice}</p> : null}
        <button type="button" disabled={busy} onClick={() => void signOut()} className="connectx-touch w-full rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-bold text-rose-700 disabled:opacity-50">Sign out</button>
      </section>
    </main>
  )
}
