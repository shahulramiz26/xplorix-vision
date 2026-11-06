'use client'

import { useCallback, useEffect, useState } from 'react'
import { api, useSession } from '../../../lib/backend'
import { codeFrom } from '../../../lib/company'
import { day } from '../../../lib/projects'
import {
  Page, Head, Card, Btn, Table, Status, Modal, Field, Note, Empty, Grid, Tile, inputStyle, th, thR, td, tdR, tdStrong, rowLine, T, mono,
} from '../../components/kit'

/* ==========================================================================
 * COMPANIES — who uses this XPLORIX
 *
 * For the account that set XPLORIX up, and nobody else. Each company here has
 * its own projects, logs, money and logins, and cannot see another's.
 *
 * A new company starts empty and on today's date, with one login: its
 * Company Admin. That admin then adds the projects, rigs, people and the
 * other logins, exactly as on the demo.
 * ========================================================================== */

interface Company {
  id: string; name: string; code: string | null; demo: boolean; createdAt: string
  adminUsername: string | null; adminName: string | null; logins: number; projects: number; logs: number; lastChange: string | null
}
interface Secret { title: string; company: string; username: string; password: string }

export default function CompaniesPage() {
  const session = useSession()
  const [list, setList] = useState<Company[] | null>(null)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', code: '', adminName: '', adminUsername: '' })
  const [codeTouched, setCodeTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [secret, setSecret] = useState<Secret | null>(null)
  const [resetting, setResetting] = useState<Company | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await api<{ companies?: Company[]; error?: string }>('/api/companies')
      if (r.ok && r.data.companies) { setList(r.data.companies); setError('') }
      else setError(r.data?.error ?? 'The list could not be loaded.')
    } catch { setError('No connection. Check the network and try again.') }
  }, [])
  useEffect(() => { if (session.status === 'in') void load() }, [session.status, load])

  if (session.status !== 'in') {
    return <Page><Head title="Companies" /><Card><Empty>Companies are kept on the server. This is the browser demo, which has one company and no database.</Empty></Card></Page>
  }

  const code = codeTouched ? form.code : codeFrom(form.name)
  const username = form.adminUsername
  const ready = form.name.trim().length >= 2 && /^[A-Za-z0-9]{2,5}$/.test(code) && !!form.adminName.trim() && /^[A-Za-z0-9_.-]{3,30}$/.test(username)

  const create = async () => {
    setBusy(true); setFormError('')
    try {
      const r = await api<{ adminUsername?: string; password?: string; name?: string; error?: string }>('/api/companies', {
        method: 'POST', body: { name: form.name.trim(), code: code.toUpperCase(), adminName: form.adminName.trim(), adminUsername: username.trim() },
      })
      if (r.ok && r.data.password && r.data.adminUsername) {
        setSecret({ title: 'Company created', company: r.data.name ?? form.name, username: r.data.adminUsername, password: r.data.password })
        setCreating(false); setForm({ name: '', code: '', adminName: '', adminUsername: '' }); setCodeTouched(false)
        void load()
      } else setFormError(r.data?.error ?? 'The company could not be created.')
    } catch { setFormError('No connection. Check the network and try again.') }
    setBusy(false)
  }
  const reset = async (c: Company) => {
    setResetting(null)
    try {
      const r = await api<{ adminUsername?: string; password?: string; error?: string }>('/api/companies', { method: 'PUT', body: { id: c.id } })
      if (r.ok && r.data.password && r.data.adminUsername) setSecret({ title: 'New admin password', company: c.name, username: r.data.adminUsername, password: r.data.password })
      else setError(r.data?.error ?? 'The password could not be reset.')
    } catch { setError('No connection. Check the network and try again.') }
  }

  const real = (list ?? []).filter(c => !c.demo)

  return (
    <Page>
      <Head title="Companies" sub="Every company using this XPLORIX. Each has its own records and its own logins, and cannot see another’s."
        right={<Btn kind="primary" onClick={() => { setFormError(''); setCreating(true) }}>Add a company</Btn>} />

      {error && <Note tone="bad">{error}</Note>}

      <Grid>
        <Tile label="Companies" value={list ? list.length : '…'} note={list ? `${real.length} real · ${list.length - real.length} demo` : ''} />
        <Tile label="Logins, all companies" value={list ? list.reduce((s, c) => s + c.logins, 0) : '…'} />
        <Tile label="Drill logs, real companies" value={list ? real.reduce((s, c) => s + c.logs, 0) : '…'} note="Shifts saved so far" />
      </Grid>

      <Card pad={false}>
        {!list ? <Empty>Loading…</Empty> : (
          <Table>
            <thead><tr>
              <th style={th}>Company</th><th style={th}>Code</th><th style={th}>Kind</th><th style={th}>Company Admin</th>
              <th style={thR}>Logins</th><th style={thR}>Projects</th><th style={thR}>Drill logs</th><th style={th}>Last change</th><th style={th}>Created</th><th style={th} />
            </tr></thead>
            <tbody>
              {list.map(c => (
                <tr key={c.id} style={{ borderBottom: rowLine }}>
                  <td style={tdStrong}>{c.name}{c.id === session.user.company.id && <span style={{ color: T.faint, fontWeight: 400 }}> · you are here</span>}</td>
                  <td style={{ ...td, fontFamily: mono }}>{c.code ?? '—'}</td>
                  <td style={td}><Status tone={c.demo ? 'neutral' : 'good'}>{c.demo ? 'Demo data' : 'Real'}</Status></td>
                  <td style={td}>{c.adminName ?? '—'}<div style={{ fontSize: 12, color: T.faint, fontFamily: mono }}>{c.adminUsername}</div></td>
                  <td style={tdR}>{c.logins}</td><td style={tdR}>{c.projects}</td><td style={tdR}>{c.logs}</td>
                  <td style={td}>{c.lastChange ? day(c.lastChange) : 'Nothing saved yet'}</td>
                  <td style={td}>{day(c.createdAt)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{c.id !== session.user.company.id && <Btn size="sm" onClick={() => setResetting(c)}>Reset admin password</Btn>}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Note>
        <b style={{ color: T.text }}>How a new company starts.</b> You add it here and get one username and password, for its Company Admin. They sign in at the same address as you,
        change the password under Settings, then add their projects, rigs, people and logins. You cannot open their records from here, and they cannot open yours.
      </Note>

      {creating && (
        <Modal title="Add a company" subtitle="It starts empty, on today’s date." width={520} onClose={() => setCreating(false)}
          footer={<><Btn onClick={() => setCreating(false)}>Cancel</Btn><Btn kind="primary" disabled={!ready || busy} onClick={() => void create()}>{busy ? 'Creating…' : 'Create company'}</Btn></>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Company name"><input autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Northfield Drilling" style={inputStyle} /></Field>
            <Field label="Code" hint={`2 to 5 letters. It starts every username in this company: ${(code || 'ABC').toUpperCase()}_SUP01.`}>
              <input value={code} onChange={e => { setCodeTouched(true); setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5) }) }} style={{ ...inputStyle, fontFamily: mono, textTransform: 'uppercase' }} />
            </Field>
            <Field label="Their Company Admin’s name"><input value={form.adminName} onChange={e => setForm({ ...form, adminName: e.target.value })} style={inputStyle} /></Field>
            <Field label="Their username" hint="What they type to sign in. Letters, numbers, dots, dashes or underscores.">
              <input value={form.adminUsername} onChange={e => setForm({ ...form, adminUsername: e.target.value.replace(/\s/g, '') })} placeholder={`${(code || 'abc').toLowerCase()}_admin`} autoCapitalize="none" style={{ ...inputStyle, fontFamily: mono }} />
            </Field>
            {formError && <Note tone="bad">{formError}</Note>}
            <div style={{ fontSize: 12.5, color: T.faint, lineHeight: 1.55 }}>The password is made for you and shown once, on the next screen.</div>
          </div>
        </Modal>
      )}

      {resetting && (
        <Modal title={`Reset the admin password for ${resetting.name}?`} subtitle={`${resetting.adminUsername} will need the new password to sign in. The old one stops working at once.`} width={480} onClose={() => setResetting(null)}
          footer={<><Btn onClick={() => setResetting(null)}>Cancel</Btn><Btn kind="primary" onClick={() => void reset(resetting)}>Reset password</Btn></>}>
          <div style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.6 }}>Do this only when their admin has asked you to.</div>
        </Modal>
      )}

      {secret && (
        <Modal title={secret.title} subtitle="Write these down or copy them now. The password is shown only once." width={480} onClose={() => setSecret(null)}
          footer={<>
            <Btn onClick={() => navigator.clipboard?.writeText(`${secret.company}\nSign in at: ${window.location.origin}/auth/login\nUsername: ${secret.username}\nPassword: ${secret.password}`)}>Copy all</Btn>
            <Btn kind="primary" onClick={() => setSecret(null)}>Done</Btn>
          </>}>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '12px 18px', fontSize: 14 }}>
            <span style={{ color: T.faint }}>Company</span><span style={{ color: T.text, fontWeight: 600 }}>{secret.company}</span>
            <span style={{ color: T.faint }}>Username</span><span style={{ color: T.text, fontWeight: 600, fontFamily: mono }}>{secret.username}</span>
            <span style={{ color: T.faint }}>Password</span><span style={{ color: T.text, fontWeight: 600, letterSpacing: '0.04em', fontFamily: mono }}>{secret.password}</span>
            <span style={{ color: T.faint }}>Signs in as</span><span style={{ color: T.text }}>Company Admin</span>
          </div>
          <div style={{ fontSize: 12.5, color: T.faint, marginTop: 16, lineHeight: 1.55 }}>Ask them to change it under Settings the first time they sign in.</div>
        </Modal>
      )}
    </Page>
  )
}
