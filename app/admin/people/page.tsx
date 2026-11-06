'use client'

import { useMemo, useState } from 'react'
import { Plus, Pencil } from 'lucide-react'
import { useCosting, monthOf } from '../../../lib/costing-store'
import { TODAY } from '../../../lib/inventory-store'
import { CREW_ROLES, type CrewMember, type CrewRole } from '../../../lib/registers'
import { num } from '../../../lib/client-record'
import { Page, Head, Card, Tile, Grid, Btn, Table, Status, Seg, Modal, Field, inputStyle, th, thR, td, tdR, rowLine, T } from '../../components/kit'

/* DRILLERS & CREW — the company's people, each once.
 *
 * What a driller did comes from the drill logs he is named on: shifts and
 * metres this month, and when he last worked. Twelve-hour shifts many days
 * running are what the crew check looks for, so the days in a row are shown
 * beside each driller. */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const day = (d?: string) => d ? `${Number(d.slice(8, 10))} ${MON[Number(d.slice(5, 7)) - 1]}` : '—'

export default function PeoplePage() {
  const { state, saveCrew } = useCosting()
  const crew = state.crew ?? []
  const [role, setRole] = useState<'all' | CrewRole>('all')
  const [edit, setEdit] = useState<CrewMember | null>(null)
  const month = monthOf(TODAY)
  const rigs = (state.rigRegister ?? []).filter(r => r.state !== 'retired').map(r => r.rig)

  const stats = useMemo(() => {
    const m = new Map<string, { shifts: number; metres: number; last?: string; today: boolean; streak: number }>()
    crew.forEach(c => {
      const logs = state.shiftLogs.filter(l => !l.contractor && (l.driller === c.name || l.supervisor === c.name))
      const inMonth = logs.filter(l => monthOf(l.date) === month)
      const days = new Set(logs.map(l => l.date))
      let streak = 0
      for (let d = new Date(TODAY); days.has(d.toISOString().slice(0, 10)); d.setDate(d.getDate() - 1)) streak++
      m.set(c.id, {
        shifts: inMonth.length, metres: inMonth.filter(l => l.driller === c.name).reduce((s, l) => s + l.metresDrilled, 0),
        last: logs.map(l => l.date).sort().pop(), today: days.has(TODAY), streak,
      })
    })
    return m
  }, [crew, state.shiftLogs, month])

  const rows = crew.filter(c => role === 'all' || c.role === role).sort((a, b) => Number(b.active) - Number(a.active) || CREW_ROLES.indexOf(a.role) - CREW_ROLES.indexOf(b.role) || a.name.localeCompare(b.name))
  const drillers = crew.filter(c => c.active && c.role === 'Driller')
  const onToday = crew.filter(c => c.active && stats.get(c.id)?.today).length
  const blank = (): CrewMember => ({ id: `cm_${Date.now()}`, name: '', role: 'Driller', active: true, joined: TODAY })

  return (
    <Page>
      <Head title="Drillers & crew" sub="Your people, each once. Pick them on projects and drill logs; what they did comes from the logs they are named on."
        right={<Btn kind="primary" onClick={() => setEdit(blank())}><Plus size={14} aria-hidden />Add a person</Btn>} />

      <Grid>
        <Tile label="Drillers" value={drillers.length} note={`${drillers.filter(d => !d.rig).length} not on a rig`} />
        <Tile label="People on shift today" value={onToday} note="Drillers and supervisors named on today's logs" />
        <Tile label="Supervisors" value={crew.filter(c => c.active && c.role === 'Supervisor').length} />
        <Tile label="Worked 14+ days in a row" value={crew.filter(c => (stats.get(c.id)?.streak ?? 0) >= 14).length} note="Up to today, from the logs" />
      </Grid>

      <Card pad={false} right={<Seg value={role} onChange={setRole} options={[{ value: 'all', label: 'Everyone' }, ...CREW_ROLES.map(r => ({ value: r, label: `${r}s` }))]} />} title="People">
        {rows.length === 0 ? <div style={{ padding: 24, fontSize: 13.5, color: T.muted }}>No one here yet. Add your drillers and supervisors, and they can be picked on projects and drill logs.</div> : (
          <Table>
            <thead><tr><th style={th}>Name</th><th style={th}>Role</th><th style={th}>Rig and shift</th><th style={th}>Phone</th><th style={thR}>Shifts this month</th><th style={thR}>Metres this month</th><th style={th}>Last shift</th><th style={thR}>Days in a row</th><th style={th} /></tr></thead>
            <tbody>
              {rows.map(c => {
                const s = stats.get(c.id)
                return (
                  <tr key={c.id} style={{ borderBottom: rowLine, opacity: c.active ? 1 : 0.55 }}>
                    <td style={{ ...td, color: T.text, fontWeight: 600 }}>{c.name}{!c.active && <span style={{ fontWeight: 400, color: T.faint }}> · left</span>}</td>
                    <td style={td}>{c.role}</td>
                    <td style={td}>{c.rig ? `${c.rig}${c.shift ? ` · ${c.shift}` : ''}` : <span style={{ color: T.dim }}>Not on a rig</span>}</td>
                    <td style={td}>{c.phone ?? <span style={{ color: T.dim }}>—</span>}</td>
                    <td style={tdR}>{s?.shifts || '—'}</td>
                    <td style={tdR}>{c.role === 'Driller' && s?.metres ? `${num(s.metres)} m` : '—'}</td>
                    <td style={td}>{s?.today ? <Status tone="good">Today</Status> : day(s?.last)}</td>
                    <td style={{ ...tdR, color: (s?.streak ?? 0) >= 14 ? 'var(--x-bad-text)' : T.muted, fontWeight: (s?.streak ?? 0) >= 14 ? 700 : 400 }}>{s?.streak || '—'}</td>
                    <td style={{ ...td, textAlign: 'right' }}><Btn size="sm" onClick={() => setEdit(c)}><Pencil size={12} aria-hidden />Edit</Btn></td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {edit && <PersonModal p={edit} rigs={rigs} taken={crew.filter(c => c.id !== edit.id).map(c => c.name.toLowerCase())} onClose={() => setEdit(null)} onSave={x => { saveCrew(x); setEdit(null) }} />}
    </Page>
  )
}

function PersonModal({ p, rigs, taken, onClose, onSave }: { p: CrewMember; rigs: string[]; taken: string[]; onClose: () => void; onSave: (p: CrewMember) => void }) {
  const [x, setX] = useState<CrewMember>(p)
  const set = <K extends keyof CrewMember>(k: K, v: CrewMember[K]) => setX(q => ({ ...q, [k]: v }))
  const name = x.name.trim().replace(/\s+/g, ' ')
  const clash = !!name && taken.includes(name.toLowerCase())
  return (
    <Modal title={p.name ? `Edit ${p.name}` : 'Add a person'} subtitle="The name as it is written on the drill log." onClose={onClose} width={680}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={!name || clash} onClick={() => onSave({ ...x, name })}>Save</Btn></>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 14 }}>
        <Field label="Full name" hint={clash ? 'Someone already has this name' : undefined}><input style={inputStyle} value={x.name} onChange={e => set('name', e.target.value)} autoFocus /></Field>
        <Field label="Role"><select style={inputStyle} value={x.role} onChange={e => set('role', e.target.value as CrewRole)}>{CREW_ROLES.map(r => <option key={r}>{r}</option>)}</select></Field>
        <Field label="Phone"><input style={inputStyle} type="tel" value={x.phone ?? ''} onChange={e => set('phone', e.target.value || undefined)} /></Field>
        <Field label="Rig now"><select style={inputStyle} value={x.rig ?? ''} onChange={e => set('rig', e.target.value || undefined)}><option value="">Not on a rig</option>{rigs.map(r => <option key={r}>{r}</option>)}</select></Field>
        <Field label="Shift"><select style={inputStyle} value={x.shift ?? ''} onChange={e => set('shift', (e.target.value || undefined) as CrewMember['shift'])}><option value="">Either</option><option>Day</option><option>Night</option></select></Field>
        <Field label="Still with you?"><select style={inputStyle} value={x.active ? 'yes' : 'no'} onChange={e => set('active', e.target.value === 'yes')}><option value="yes">Yes</option><option value="no">No, has left</option></select></Field>
      </div>
    </Modal>
  )
}
