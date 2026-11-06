'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  useCosting, uid, nextUsername, loginOfContractor, loginOfClient, USER_ROLE_LABEL, peoplePool,
  type AppUser, type UserRole,
} from '../../../lib/costing-store'
import { TODAY } from '../../../lib/inventory-store'
import { day } from '../../../lib/projects'
import { useSession, issuePassword, revokeLogin } from '../../../lib/backend'
import {
  Page, Head, Card, Btn, Table, Status, Modal, Field, Note, Empty, Seg, Grid, Tile, inputStyle, th, td, tdStrong, rowLine, T, mono,
} from '../../components/kit'

/* ==========================================================================
 * USERS — every login the company gives out, created in one place
 *
 * Only the company admin can create a login. There are three kinds:
 *
 *   Supervisor   your own site staff. Drill log and maintenance log, for the
 *                projects he is assigned to.
 *   Contractor   a company drilling for you under a work order. His drill
 *                log, his maintenance log, the logs he has sent, and a small
 *                view of his own performance.
 *   Client       the company you drill for. What is happening today, his
 *                projects, operations, holes and invoices.
 *
 * The username is made for you and the password is generated, shown once,
 * and never stored where it can be read back.
 * ========================================================================== */

const SEES: Record<UserRole, string> = {
  supervisor: 'Drill log and maintenance log',
  contractor: 'Drill log, maintenance log, submitted logs, own performance',
  client: 'Today, projects, operations, holes, invoices',
}
const OPEN: Record<UserRole, (u: AppUser) => string> = {
  supervisor: u => `/supervisor/today?as=${u.id}`,
  contractor: u => `/contractor?as=${u.id}`,
  client: u => `/client?as=${u.id}`,
}

function makePassword() {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789']
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)]
  return Array.from({ length: 10 }, (_, i) => pick(sets[i % 3])).join('')
}

function UsersScreen() {
  const { state, saveUser, removeUser, saveContractor } = useCosting()
  const params = useSearchParams()
  const users = state.users
  const [filter, setFilter] = useState<'all' | UserRole>('all')
  const [creating, setCreating] = useState<UserRole | null>(null)
  const [form, setForm] = useState({ name: '', pick: '', email: '' })
  const [secret, setSecret] = useState<{ title: string; username: string; password: string; role: UserRole; error?: string } | null>(null)
  const session = useSession()
  const real = session.status === 'in'
  /* With a database connected the password is made on the server, which
   * keeps only a hash of it. In the browser demo it is made here, for show. */
  const givePassword = async (u: { id: string; username: string; role: UserRole }, title: string) => {
    if (!real) { setSecret({ title, username: u.username, password: makePassword(), role: u.role }); return }
    setSecret({ title, username: u.username, password: '', role: u.role })
    const r = await issuePassword(u.id)
    setSecret(r.ok ? { title, username: r.username, password: r.password, role: u.role } : { title, username: u.username, password: '', role: u.role, error: r.error })
  }
  const [removing, setRemoving] = useState<AppUser | null>(null)

  // A link from a project or a work order opens the right form, filled in.
  useEffect(() => {
    const role = params.get('new') as UserRole | null
    if (role && ['supervisor', 'contractor', 'client'].includes(role)) {
      setCreating(role); setForm({ name: '', pick: params.get('for') ?? '', email: '' })
    }
  }, [params])

  // Who can still be given a login of each kind.
  const supervisorsFree = useMemo(() => peoplePool(state).supervisors
    .filter(n => !users.some(u => u.role === 'supervisor' && u.name === n)), [state, users])
  const contractorsFree = state.contractors.filter(c => !loginOfContractor(users, c.id))
  const clientsFree = Array.from(new Set(state.projects.map(p => p.client).filter(Boolean))).filter(c => !loginOfClient(users, c))

  const projectsOf = (u: AppUser): string => {
    if (u.role === 'supervisor') {
      const ps = state.projects.filter(p => p.supervisors.includes(u.name) && p.status !== 'completed')
      return ps.length ? ps.map(p => p.code).join(', ') : 'Not on a project yet'
    }
    if (u.role === 'contractor') {
      const os = state.workOrders.filter(o => o.contractorId === u.contractorId)
      return os.length ? os.map(o => o.number).join(', ') : 'No work order yet'
    }
    const ps = state.projects.filter(p => p.client === u.client)
    const shown = ps.filter(p => p.shared)
    return ps.length ? `${shown.length} of ${ps.length} ${ps.length === 1 ? 'project' : 'projects'} shown` : 'No project yet'
  }

  const shown = users.filter(u => filter === 'all' || u.role === filter)
  const count = (r: UserRole) => users.filter(u => u.role === r).length
  const NEW = '__new'
  const name = creating === 'supervisor' ? (form.pick && form.pick !== NEW ? form.pick : form.name.trim())
    : creating === 'contractor' ? (form.pick && form.pick !== NEW ? state.contractors.find(c => c.id === form.pick)?.name ?? '' : form.name.trim())
    : creating === 'client' ? (form.pick && form.pick !== NEW ? form.pick : form.name.trim()) : ''
  const clash = creating === 'supervisor' ? users.some(u => u.role === 'supervisor' && u.name.toLowerCase() === name.toLowerCase())
    : creating === 'client' ? !!loginOfClient(users, name)
    : creating === 'contractor' && (!form.pick || form.pick === NEW) ? state.contractors.some(c => c.name.toLowerCase() === name.toLowerCase()) : false
  const emailOk = !form.email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
  const canCreate = name.length > 1 && !clash && emailOk

  const startCreate = (role: UserRole) => { setCreating(role); setForm({ name: '', pick: '', email: '' }) }
  const create = () => {
    if (!creating || !canCreate) return
    const username = nextUsername(users, creating)
    const base: AppUser = { id: uid('u'), name, username, role: creating, active: true, created: TODAY, email: form.email.trim().toLowerCase() || undefined }
    if (creating === 'contractor') {
      let contractorId = form.pick
      if (!contractorId || contractorId === NEW) { contractorId = uid('ctr'); saveContractor({ id: contractorId, name }) }
      saveUser({ ...base, contractorId })
    } else if (creating === 'client') saveUser({ ...base, client: name })
    else saveUser(base)
    void givePassword({ id: base.id, username, role: creating }, `${USER_ROLE_LABEL[creating]} login created`)
    setCreating(null)
  }

  return (
    <Page>
      <Head title="Users"
        sub="Every login is created here, by you. A supervisor logs shifts, a contractor sends his, and a client follows his projects. Each one sees only what is his."
        right={<>
          <Btn onClick={() => startCreate('client')}>Client login</Btn>
          <Btn onClick={() => startCreate('contractor')}>Contractor login</Btn>
          <Btn kind="primary" onClick={() => startCreate('supervisor')}>Supervisor login</Btn>
        </>} />

      <Grid min={200}>
        <Tile label="Supervisor logins" value={count('supervisor')} note={SEES.supervisor} />
        <Tile label="Contractor logins" value={count('contractor')} note={contractorsFree.length ? `${contractorsFree.length} contractor${contractorsFree.length === 1 ? ' has' : 's have'} no login yet` : 'Every contractor has one'} tone={contractorsFree.length ? 'warn' : undefined} />
        <Tile label="Client logins" value={count('client')} note={clientsFree.length ? `${clientsFree.length} client${clientsFree.length === 1 ? ' has' : 's have'} no login yet` : 'Every client has one'} />
        <Tile label="Switched on" value={`${users.filter(u => u.active).length} of ${users.length}`} note="A login that is off cannot sign in" />
      </Grid>

      <Seg<'all' | UserRole> value={filter} onChange={setFilter} options={[
        { value: 'all', label: `All · ${users.length}` }, { value: 'supervisor', label: `Supervisors · ${count('supervisor')}` },
        { value: 'contractor', label: `Contractors · ${count('contractor')}` }, { value: 'client', label: `Clients · ${count('client')}` },
      ]} />

      <Card pad={false}>
        {shown.length === 0 ? <Empty>No logins of this kind yet.</Empty> : (
          <Table>
            <thead><tr><th style={th}>Name</th><th style={th}>Kind</th><th style={th}>Username</th><th style={th}>Works on</th><th style={th}>Sees</th><th style={th}>Status</th><th style={th}>Created</th><th style={th} /></tr></thead>
            <tbody>
              {shown.map(u => (
                <tr key={u.id} className="xpl-row" style={{ borderBottom: rowLine }}>
                  <td style={tdStrong}>{u.name}{u.email && <div style={{ fontSize: 12, color: T.faint, fontWeight: 400 }}>{u.email}</div>}</td>
                  <td style={td}><Status tone={u.role === 'supervisor' ? 'info' : u.role === 'contractor' ? 'warn' : 'good'}>{USER_ROLE_LABEL[u.role]}</Status></td>
                  <td style={{ ...td, fontFamily: mono, fontSize: 12.5 }}>{u.username}</td>
                  <td style={td}>{projectsOf(u)}</td>
                  <td style={{ ...td, whiteSpace: 'normal', minWidth: 190 }}>{SEES[u.role]}</td>
                  <td style={td}><Status tone={!u.active ? 'neutral' : u.opened ? 'good' : 'warn'}>{!u.active ? 'Switched off' : u.opened ? 'In use' : 'Not opened yet'}</Status></td>
                  <td style={td}>{day(u.created)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      {u.active && <Btn size="sm" href={OPEN[u.role](u)}>See what they see</Btn>}
                      <Btn size="sm" onClick={() => void givePassword(u, 'Password reset')}>Reset password</Btn>
                      <Btn size="sm" onClick={() => saveUser({ ...u, active: !u.active })}>{u.active ? 'Switch off' : 'Switch on'}</Btn>
                      <Btn size="sm" kind="danger" onClick={() => setRemoving(u)}>Remove</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Note>
        <b style={{ color: T.text }}>What each login can never see.</b> A supervisor does not see costs, rates or invoices. A contractor does not see your own rigs, what your client pays you, or another contractor.
        A client does not see your costs, your margin, your stock, or what you pay a contractor.
      </Note>

      {creating && (
        <Modal title={`Create a ${USER_ROLE_LABEL[creating].toLowerCase()} login`} width={520} onClose={() => setCreating(null)}
          subtitle={creating === 'supervisor' ? 'For your own site staff, to log shifts and maintenance.'
            : creating === 'contractor' ? 'For a company drilling for you, to send their drill log and maintenance log.'
            : 'For the company you drill for, to follow their projects.'}
          footer={<><Btn onClick={() => setCreating(null)}>Cancel</Btn><Btn kind="primary" disabled={!canCreate} onClick={create}>Create login</Btn></>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Seg<UserRole> value={creating} onChange={r => startCreate(r)} options={[{ value: 'supervisor', label: 'Supervisor' }, { value: 'contractor', label: 'Contractor' }, { value: 'client', label: 'Client' }]} />

            {creating === 'supervisor' && (
              <>
                <Field label="Supervisor">
                  <select value={form.pick} onChange={e => setForm({ ...form, pick: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="">Choose…</option>
                    {supervisorsFree.map(n => <option key={n}>{n}</option>)}
                    <option value={NEW}>Someone not on the list…</option>
                  </select>
                </Field>
                {form.pick === NEW && <Field label="Full name"><input autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Anil Kumar" style={inputStyle} /></Field>}
                <div style={{ fontSize: 12.5, color: T.faint, lineHeight: 1.55 }}>They can log shifts for the projects they are assigned to. Assign them under Projects, on the project&apos;s Team tab.</div>
              </>
            )}
            {creating === 'contractor' && (
              <>
                <Field label="Contractor">
                  <select value={form.pick} onChange={e => setForm({ ...form, pick: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="">Choose…</option>
                    {contractorsFree.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    <option value={NEW}>A contractor not on the list…</option>
                  </select>
                </Field>
                {form.pick === NEW && <Field label="Contractor's name"><input autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inputStyle} /></Field>}
                <div style={{ fontSize: 12.5, color: T.faint, lineHeight: 1.55 }}>They see the rigs on their work orders with you. Create the work order under Contractors.</div>
              </>
            )}
            {creating === 'client' && (
              <>
                <Field label="Client">
                  <select value={form.pick} onChange={e => setForm({ ...form, pick: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="">Choose…</option>
                    {Array.from(new Set([...clientsFree, ...(form.pick && form.pick !== NEW && !clientsFree.includes(form.pick) ? [form.pick] : [])])).map(c => <option key={c}>{c}</option>)}
                    <option value={NEW}>A client not on the list…</option>
                  </select>
                </Field>
                {form.pick === NEW && <Field label="Client's name" hint="Write it the same way as on the project, so the two are matched."><input autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inputStyle} /></Field>}
                <div style={{ fontSize: 12.5, color: T.faint, lineHeight: 1.55 }}>They see only the projects you choose to show them. Switch that on from each project.</div>
              </>
            )}
            {creating !== 'supervisor' && (
              <Field label="Email (optional)" hint={!emailOk ? 'That does not look like an email address.' : 'Where to send the username. The password is shown to you once, on the next screen.'}>
                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="name@company.com" style={inputStyle} />
              </Field>
            )}
            {clash && <Note tone="warn">{name} already has a login.</Note>}
            {name && !clash && <div style={{ fontSize: 12.5, color: T.muted }}>Username will be <span style={{ fontFamily: mono, color: T.text }}>{nextUsername(users, creating)}</span>. The password is generated for you.</div>}
          </div>
        </Modal>
      )}

      {secret && (
        <Modal title={secret.title} subtitle="Write these down or copy them now. The password is shown only once." width={460} onClose={() => setSecret(null)}
          footer={<>
            <Btn onClick={() => navigator.clipboard?.writeText(`Username: ${secret.username}\nPassword: ${secret.password}`)}>Copy both</Btn>
            <Btn kind="primary" onClick={() => setSecret(null)}>Done</Btn>
          </>}>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '12px 18px', fontSize: 14 }}>
            <span style={{ color: T.faint }}>Username</span><span style={{ color: T.text, fontWeight: 600, fontFamily: mono }}>{secret.username}</span>
            <span style={{ color: T.faint }}>Password</span><span style={{ color: secret.error ? T.red : T.text, fontWeight: 600, letterSpacing: secret.password ? '0.04em' : undefined, fontFamily: secret.password ? mono : 'inherit' }}>{secret.password || secret.error || 'Making a password…'}</span>
            <span style={{ color: T.faint }}>Signs in as</span><span style={{ color: T.text }}>{USER_ROLE_LABEL[secret.role]}</span>
          </div>
        </Modal>
      )}

      {removing && (
        <Modal title={`Remove ${removing.name}'s login?`} subtitle={`${removing.username} will no longer be able to sign in. Everything already logged is kept.`} width={460} onClose={() => setRemoving(null)}
          footer={<><Btn onClick={() => setRemoving(null)}>Keep login</Btn>
            <Btn kind="danger" onClick={() => { removeUser(removing.id); if (real) void revokeLogin(removing.id); setRemoving(null) }}>Remove login</Btn></>}>
          <div style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.6 }}>If it is only for a while, switch the login off instead. It can be switched back on.</div>
        </Modal>
      )}
    </Page>
  )
}

export default function UsersPage() {
  return <Suspense fallback={null}><UsersScreen /></Suspense>
}
