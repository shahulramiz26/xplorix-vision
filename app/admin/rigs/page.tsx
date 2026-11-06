'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, Pencil } from 'lucide-react'
import { projectCode, useCosting } from '../../../lib/costing-store'
import { TODAY } from '../../../lib/inventory-store'
import { useAdminOverview, financeLink, RIG_STATUS_LABEL, type RigStatus } from '../../../lib/admin-overview'
import { num } from '../../../lib/client-record'
import { RIG_TYPES, RIG_STATES, RIG_STATE_LABEL, type RigRecord, type RigState } from '../../../lib/registers'
import {
  Page, Head, Card, Tile, Grid, Btn, Table, Status, Note, DepthBar, Modal, Field, inputStyle,
  th, thR, td, tdR, rowLine, T, display, type Tone,
} from '../../components/kit'
import { RigCostModal, rigCostLine } from '../../components/cost-panels'

/* RIGS — the company's fleet, and what each rig is doing today.
 *
 * The list is the company's own record of its rigs (lib/registers.ts): added
 * once here, then picked on projects, drill logs and stock counts. Where a
 * rig is and what it drilled comes from the shift logs, as on the Dashboard.
 * A contractor's rig is his, so it is listed under Contractors. */

const statusTone: Record<RigStatus, Tone> = { drilling: 'good', standby: 'warn', breakdown: 'bad', 'no-shift': 'neutral', 'to-check': 'warn', idle: 'neutral' }
const stateTone: Record<RigState, Tone> = { working: 'good', standby: 'info', repair: 'bad', retired: 'neutral' }
const SIZES = ['BQ', 'NQ', 'HQ', 'PQ']

export default function RigsPage() {
  const o = useAdminOverview()
  const { state, saveRig } = useCosting()
  const [edit, setEdit] = useState<RigRecord | null>(null)
  const [showRetired, setShowRetired] = useState(false)
  const [costFor, setCostFor] = useState<string | null>(null)
  const register = state.rigRegister ?? []
  const live = useMemo(() => new Map(o.rigs.filter(r => !r.contractor).map(r => [r.rig, r])), [o.rigs])
  const drillersOn = (rig: string) => (state.crew ?? []).filter(c => c.active && c.rig === rig && c.role === 'Driller').map(c => c.name)

  /* A rig that logs shifts but was never added is still shown, marked, so
   * nothing drilled is ever hidden. */
  const unlisted = o.rigs.filter(r => !r.contractor && !register.some(x => x.rig === r.rig)).map(r => r.rig)
  const rows = register.filter(r => showRetired || r.state !== 'retired')
  const working = rows.filter(r => live.get(r.rig)?.status === 'drilling').length
  const theirs = o.rigs.filter(r => r.contractor)

  const blank = (): RigRecord => ({ id: `rr_${Date.now()}`, rig: '', type: 'Diamond core', sizes: ['HQ'], owned: true, state: 'standby', added: TODAY })

  return (
    <Page>
      <Head title="Rigs" sub="Your fleet: each rig once, with what it is doing today from the shift logs."
        right={<Btn kind="primary" onClick={() => setEdit(blank())}><Plus size={14} aria-hidden />Add a rig</Btn>} />

      <Grid>
        <Tile label="Rigs in your fleet" value={register.filter(r => r.state !== 'retired').length} note={`${register.filter(r => !r.owned && r.state !== 'retired').length} hired in`} />
        <Tile label="Drilling today" value={`${working} of ${rows.filter(r => r.state !== 'retired').length}`} note="From today's shift logs" />
        <Tile label="Available" value={register.filter(r => r.state === 'standby').length} note="On no project, ready to go" />
        <Tile label="Under repair" value={register.filter(r => r.state === 'repair').length} note="Marked here or broken down today" />
      </Grid>

      {unlisted.length > 0 && <Note tone="warn">{unlisted.join(', ')} {unlisted.length === 1 ? 'logs' : 'log'} shifts but {unlisted.length === 1 ? 'is' : 'are'} not in your fleet list. <button type="button" onClick={() => setEdit({ ...blank(), rig: unlisted[0], state: 'working' })} style={{ background: 'none', border: 'none', color: T.orange, fontWeight: 600, cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontSize: 'inherit' }}>Add {unlisted[0]}</button></Note>}

      <Card pad={false}>
        {rows.length === 0 ? <div style={{ padding: 24, fontSize: 13.5, color: T.muted }}>No rigs yet. Add your first rig: its name as the drillers write it on the log, its type and the core sizes it drills.</div> : (
          <Table>
            <thead>
              <tr>
                <th style={th}>Rig</th><th style={th}>Type and sizes</th><th style={th}>Today</th><th style={th}>Project and hole</th>
                <th style={th}>Drillers</th><th style={th}>Rig cost</th><th style={thR}>This month</th><th style={th} />
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const l = live.get(r.rig)
                const drillers = drillersOn(r.rig)
                return (
                  <tr key={r.id} style={{ borderBottom: rowLine, opacity: r.state === 'retired' ? 0.6 : 1 }}>
                    <td style={td}>
                      <div style={{ color: T.text, fontWeight: 700, fontFamily: display, fontSize: 14 }}>{r.rig}</div>
                      <div style={{ fontSize: 11.5, color: T.faint, marginTop: 3 }}>{[r.make, r.model, r.year].filter(Boolean).join(' · ') || '—'}{r.owned ? '' : ' · hired in'}</div>
                    </td>
                    <td style={td}>
                      <div style={{ color: T.text }}>{r.type}</div>
                      <div style={{ fontSize: 11.5, color: T.faint, marginTop: 3 }}>{r.sizes.join(', ')}{r.depthCapacity ? ` · to ${num(r.depthCapacity)} m` : ''}</div>
                    </td>
                    <td style={td}>
                      {l && l.status !== 'no-shift' ? <Status tone={statusTone[l.status]}>{RIG_STATUS_LABEL[l.status]}</Status> : <Status tone={stateTone[r.state]}>{RIG_STATE_LABEL[r.state]}</Status>}
                      {l && <div style={{ fontSize: 11.5, color: T.faint, marginTop: 5, whiteSpace: 'normal', maxWidth: 200 }}>{l.note}</div>}
                    </td>
                    <td style={td}>
                      {l?.project ? <>
                        <div style={{ color: T.text }}>{l.hole ?? 'No hole'}</div>
                        <div style={{ fontSize: 11.5, color: T.faint, marginTop: 3 }}>{projectCode(l.project)} · {l.project}</div>
                        {l.hole && <div style={{ marginTop: 6, maxWidth: 170 }}><DepthBar drilled={l.holeDrilled} planned={l.holePlanned} /></div>}
                      </> : <span style={{ color: T.dim }}>On no project</span>}
                    </td>
                    <td style={{ ...td, whiteSpace: 'normal', minWidth: 120, maxWidth: 170 }}>{drillers.length ? drillers.join(', ') : <span style={{ color: T.dim }}>None set</span>}</td>
                    <td style={td}>
                      {(() => { const c = rigCostLine(state, r.rig); return (
                        <button type="button" onClick={() => setCostFor(r.rig)} aria-label={`Rig cost of ${r.rig}`}
                          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                          {c ? <><div style={{ color: T.text, fontWeight: 600, fontSize: 13 }}>{c}</div><div style={{ fontSize: 11.5, color: T.orange, marginTop: 3, fontWeight: 600 }}>Change</div></>
                            : <Status tone="warn">Not set · add</Status>}
                        </button>) })()}
                    </td>
                    <td style={tdR}>
                      {l?.monthDays ? <>
                        <div style={{ color: T.text, fontWeight: 600 }}>{num(l.monthMetres)} m</div>
                        <div style={{ fontSize: 11.5, color: T.faint, marginTop: 3 }}>{(l.monthMetres / l.monthDays).toFixed(1)} m a day · {l.monthLostHours} h lost</div>
                      </> : <span style={{ color: T.dim }}>—</span>}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        {l?.project && <Btn size="sm" href={financeLink({ project: l.project, rig: r.rig, month: o.month })}>Costing</Btn>}
                        <Btn size="sm" onClick={() => setEdit(r)}><Pencil size={12} aria-hidden />Edit</Btn>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', fontSize: 13, color: T.muted }}>
        {register.some(r => r.state === 'retired') && <button type="button" onClick={() => setShowRetired(v => !v)} style={{ background: 'none', border: 'none', color: T.orange, fontWeight: 600, cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontSize: 13 }}>{showRetired ? 'Hide retired rigs' : 'Show retired rigs'}</button>}
        <span>Put a rig on a project, with its drillers, under <Link href="/admin/projects" style={{ color: T.orange, fontWeight: 600, textDecoration: 'none' }}>Projects</Link>. Drillers are listed under <Link href="/admin/people" style={{ color: T.orange, fontWeight: 600, textDecoration: 'none' }}>Drillers &amp; crew</Link>.</span>
      </div>

      {theirs.length > 0 && (
        <Note>
          {theirs.length} contractor {theirs.length === 1 ? 'rig' : 'rigs'} ({theirs.map(r => r.rig).join(', ')}) also {theirs.length === 1 ? 'drills' : 'drill'} on your projects. They are not part of your fleet; see them under <Link href="/admin/contractors" style={{ color: T.orange, fontWeight: 600, textDecoration: 'none' }}>Contractors</Link>.
        </Note>
      )}

      {edit && <RigModal r={edit} taken={register.filter(x => x.id !== edit.id).map(x => x.rig.toUpperCase())} onClose={() => setEdit(null)} onSave={x => {
        const isNew = !register.some(y => y.id === x.id)
        saveRig(x); setEdit(null)
        // A new rig's next step is what it costs: asked once, here, not later in Finance.
        if (isNew && !rigCostLine(state, x.rig)) setCostFor(x.rig)
      }} />}
      {costFor && <RigCostModal rig={costFor} hired={register.find(x => x.rig === costFor)?.owned === false} onClose={() => setCostFor(null)} />}
    </Page>
  )
}

function RigModal({ r, taken, onClose, onSave }: { r: RigRecord; taken: string[]; onClose: () => void; onSave: (r: RigRecord) => void }) {
  const [x, setX] = useState<RigRecord>(r)
  const set = <K extends keyof RigRecord>(k: K, v: RigRecord[K]) => setX(p => ({ ...p, [k]: v }))
  const name = x.rig.trim().toUpperCase()
  const clash = !!name && taken.includes(name)
  const ok = !!name && !clash && x.sizes.length > 0
  return (
    <Modal title={r.rig ? `Edit ${r.rig}` : 'Add a rig'} subtitle="The name is what the drillers write on the log, so keep it the same everywhere." onClose={onClose} width={720}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={!ok} onClick={() => onSave({ ...x, rig: name })}>Save rig</Btn></>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 14 }}>
        <Field label="Rig name" hint={clash ? 'Another rig already has this name' : 'For example, RIG-006'}><input style={{ ...inputStyle, borderColor: clash ? 'var(--x-red)' : undefined }} value={x.rig} onChange={e => set('rig', e.target.value)} autoFocus /></Field>
        <Field label="Type"><select style={inputStyle} value={x.type} onChange={e => set('type', e.target.value as RigRecord['type'])}>{RIG_TYPES.map(t => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Status"><select style={inputStyle} value={x.state} onChange={e => set('state', e.target.value as RigState)}>{RIG_STATES.map(t => <option key={t} value={t}>{RIG_STATE_LABEL[t]}</option>)}</select></Field>
        <Field label="Make"><input style={inputStyle} value={x.make ?? ''} onChange={e => set('make', e.target.value || undefined)} /></Field>
        <Field label="Model"><input style={inputStyle} value={x.model ?? ''} onChange={e => set('model', e.target.value || undefined)} /></Field>
        <Field label="Year"><input style={inputStyle} type="number" value={x.year ?? ''} onChange={e => set('year', parseInt(e.target.value) || undefined)} /></Field>
        <Field label="Depth it can reach, m"><input style={inputStyle} type="number" value={x.depthCapacity ?? ''} onChange={e => set('depthCapacity', parseFloat(e.target.value) || undefined)} /></Field>
        <Field label="Owned or hired"><select style={inputStyle} value={x.owned ? 'owned' : 'hired'} onChange={e => set('owned', e.target.value === 'owned')}><option value="owned">Owned</option><option value="hired">Hired in</option></select></Field>
      </div>
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: T.muted, marginBottom: 6 }}>Core sizes it drills</div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {SIZES.map(sz => (
            <label key={sz} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13.5, color: T.text }}>
              <input type="checkbox" checked={x.sizes.includes(sz)} onChange={e => set('sizes', e.target.checked ? [...x.sizes, sz] : x.sizes.filter(s => s !== sz))} />{sz}
            </label>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 14 }}><Field label="Notes"><input style={inputStyle} value={x.notes ?? ''} onChange={e => set('notes', e.target.value || undefined)} /></Field></div>
      {!r.rig && <div style={{ marginTop: 14, fontSize: 12.5, color: T.faint, lineHeight: 1.6 }}>Next you enter its rig cost: price or hire, EMI, depreciation and insurance. It follows the rig to every project. Fuel and crew are set on each project.</div>}
    </Modal>
  )
}
