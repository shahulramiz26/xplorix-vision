'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { seedCostingState, type AppUser } from '../../lib/costing-store'
import { seedInventoryState } from '../../lib/inventory-store'
import { api, loadSession, upload, useSession, HOME } from '../../lib/backend'
import { toRecords } from '../../lib/sync-spec'

/* ==========================================================================
 * FIRST-TIME SET-UP
 *
 * Shown once, when a database has been connected and nobody has an account
 * yet. It makes the Company Admin, loads the demo company into the database,
 * and gives each demo login a password. After that this page only points to
 * the sign-in.
 * ========================================================================== */

const ink = '#0B0F17', mut = '#56606E', line = '#E3D9CF', or = '#F97316'
const input: React.CSSProperties = { width: '100%', padding: '12px 14px', background: 'rgba(11,15,23,0.03)', border: `1px solid ${line}`, borderRadius: 10, color: ink, fontSize: 14, outline: 'none', fontFamily: 'inherit' }
const label: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: mut, marginBottom: 6 }
const ROLE_WORD: Record<string, string> = { supervisor: 'Supervisor', contractor: 'Contractor', client: 'Client' }

interface Cred { name: string; role: string; username: string; password: string }

export default function SetupPage() {
  const session = useSession()
  const [form, setForm] = useState({ name: '', username: 'admin', password: '', again: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<string | null>(null)
  const [creds, setCreds] = useState<Cred[] | null>(null)
  const loading = useRef(false)

  /* Load the demo company: every record, then a password for each demo login. */
  const loadDemo = async () => {
    if (loading.current) return
    loading.current = true
    setError('')
    try {
      const costing = seedCostingState()
      const records = [...toRecords('costing', costing as unknown as Record<string, unknown>), ...toRecords('inventory', seedInventoryState() as unknown as Record<string, unknown>)]
      setProgress(`Loading the demo company: 0 of ${records.length} records`)
      await upload(records, (done, total) => setProgress(`Loading the demo company: ${done} of ${total} records`))
      setProgress('Making the logins')
      const out: Cred[] = []
      for (const u of costing.users as AppUser[]) {
        const r = await api<{ username?: string; password?: string }>('/api/accounts', { method: 'POST', body: { userRef: u.id } })
        if (r.ok && r.data.username && r.data.password) out.push({ name: u.name, role: ROLE_WORD[u.role] ?? u.role, username: r.data.username, password: r.data.password })
      }
      await api('/api/setup', { method: 'PUT' })
      setCreds(out)
      setProgress(null)
    } catch {
      setError('Loading stopped part way. Check the connection and press Continue to carry on from where it stopped.')
      setProgress(null)
    } finally { loading.current = false }
  }

  // Signed in as the admin of a company that has not been loaded yet: carry on from there.
  const unfinished = session.status === 'in' && session.user.role === 'admin' && !session.user.company.seeded && !creds
  useEffect(() => { if (unfinished && !progress && !error) void loadDemo() // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unfinished])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (form.password !== form.again) { setError('The two passwords are not the same.'); return }
    setBusy(true)
    try {
      const r = await api<{ error?: string }>('/api/setup', { method: 'POST', body: { name: form.name, username: form.username, password: form.password } })
      if (!r.ok) { setError(r.data?.error ?? 'Set-up could not be finished.'); setBusy(false); return }
      await loadSession(true)
    } catch { setError('No connection. Check the network and try again.') }
    setBusy(false)
  }

  const copyAll = () => navigator.clipboard?.writeText((creds ?? []).map(c => `${c.role}: ${c.name}\nUsername: ${c.username}\nPassword: ${c.password}`).join('\n\n'))

  let body: React.ReactNode
  if (session.status === 'loading') body = <p style={{ color: mut }}>Checking…</p>
  else if (session.status === 'demo') body = <>
    <h1 style={h1}>No database is connected</h1>
    <p style={p}>This copy of XPLORIX is the browser demo. Everything you enter stays in this browser. There is nothing to set up.</p>
    <Link href="/auth/login" style={btn}>Open the demo</Link>
  </>
  else if (session.status === 'error') body = <>
    <h1 style={h1}>The database could not be reached</h1>
    <p style={p}>{session.message}</p>
    <button onClick={() => void loadSession(true)} style={btn}>Try again</button>
  </>
  else if (creds) body = <>
    <h1 style={h1}>Set-up is done</h1>
    <p style={p}>The demo company is loaded. These are the logins for the other three kinds of user. <b style={{ color: ink }}>Each password is shown only now.</b> Copy them before you leave this page. You can reset any of them later in Users.</p>
    <div style={{ border: `1px solid ${line}`, borderRadius: 12, overflow: 'hidden', margin: '18px 0' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
        <thead><tr style={{ background: 'rgba(11,15,23,0.03)' }}>{['Login', 'Kind', 'Username', 'Password'].map(h => <th key={h} style={{ textAlign: 'left', padding: '9px 12px', fontSize: 12, color: mut }}>{h}</th>)}</tr></thead>
        <tbody>
          {creds.map(c => (
            <tr key={c.username} style={{ borderTop: `1px solid ${line}` }}>
              <td style={td}>{c.name}</td><td style={{ ...td, color: mut }}>{c.role}</td>
              <td style={{ ...td, fontFamily: 'ui-monospace, monospace' }}>{c.username}</td>
              <td style={{ ...td, fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>{c.password}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      <button onClick={copyAll} style={{ ...btn, background: '#fff', color: ink, border: `1px solid ${line}`, boxShadow: 'none' }}>Copy all</button>
      <a href={HOME.admin} style={btn}>Open the Company Admin</a>
    </div>
  </>
  else if (session.status === 'in' && (unfinished || progress || error)) body = <>
    <h1 style={h1}>Loading the demo company</h1>
    <p style={p}>{progress ?? 'Starting…'}</p>
    {error && <><div role="alert" style={alert}>{error}</div><button onClick={() => void loadDemo()} style={btn}>Continue</button></>}
  </>
  else if (session.status === 'in') body = <>
    <h1 style={h1}>Set-up is already done</h1>
    <p style={p}>You are signed in as {session.user.name}.</p>
    <a href={HOME[session.user.role]} style={btn}>Open XPLORIX</a>
  </>
  else if (session.status === 'out') body = <>
    <h1 style={h1}>Set-up is already done</h1>
    <p style={p}>This XPLORIX already has its Company Admin. Sign in with your username and password.</p>
    <Link href="/auth/login" style={btn}>Sign in</Link>
  </>
  else body = <>
    <h1 style={h1}>Set up XPLORIX</h1>
    <p style={p}>A database is connected and nobody has an account yet. Make the Company Admin login. It runs the account and creates every other login.</p>
    <form onSubmit={submit} style={{ display: 'grid', gap: 14, marginTop: 18 }}>
      <div><label style={label} htmlFor="s-name">Your name</label><input id="s-name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={input} autoComplete="name" /></div>
      <div><label style={label} htmlFor="s-user">Username</label><input id="s-user" required value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} style={input} autoCapitalize="none" autoCorrect="off" autoComplete="username" /></div>
      <div><label style={label} htmlFor="s-pass">Password, at least 8 characters</label><input id="s-pass" required type="password" minLength={8} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} style={input} autoComplete="new-password" /></div>
      <div><label style={label} htmlFor="s-again">Password again</label><input id="s-again" required type="password" value={form.again} onChange={e => setForm({ ...form, again: e.target.value })} style={input} autoComplete="new-password" /></div>
      {error && <div role="alert" style={alert}>{error}</div>}
      <button type="submit" disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }}>{busy ? 'Setting up…' : 'Create the Company Admin'}</button>
    </form>
    <p style={{ ...p, fontSize: 12.5, marginTop: 16 }}>The demo company (Apex Drilling Solutions, on demo data dated 31 Oct 2026) is loaded next, so there is something to look at. There is no way to recover this password yet, so keep it somewhere safe.</p>
  </>

  return (
    <div style={{ minHeight: '100vh', background: '#F6EDE5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: "'Inter', sans-serif", color: ink }}>
      <div style={{ width: '100%', maxWidth: creds ? 640 : 460, background: '#fff', border: `1px solid ${line}`, borderRadius: 20, padding: 28, boxShadow: '0 32px 80px rgba(122,60,8,0.16)' }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', color: or, marginBottom: 12 }}>XPLORIX</div>
        {body}
      </div>
    </div>
  )
}

const h1: React.CSSProperties = { fontSize: 24, fontWeight: 800, margin: '0 0 8px', lineHeight: 1.2 }
const p: React.CSSProperties = { fontSize: 14, color: mut, lineHeight: 1.6, margin: 0 }
const td: React.CSSProperties = { padding: '9px 12px' }
const alert: React.CSSProperties = { padding: '10px 12px', borderRadius: 10, background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.25)', color: '#B91C1C', fontSize: 13, margin: '12px 0' }
const btn: React.CSSProperties = { display: 'inline-block', padding: '12px 18px', borderRadius: 11, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg,#F97316,#EA580C)', boxShadow: '0 4px 24px rgba(249,115,22,0.35)', textDecoration: 'none', marginTop: 16 }
