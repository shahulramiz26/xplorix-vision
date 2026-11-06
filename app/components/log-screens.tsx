'use client'

import { ReactNode, useEffect, useMemo, useState } from 'react'
import { Activity, Wrench, Download, Plus, Pencil, Trash2, RotateCcw, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import {
  useCosting, projectCode, MAINTENANCE_TYPES, MAINTENANCE_TYPE_LABEL,
  type ShiftLog, type MaintenanceLog, type ProjectRecord,
} from '../../lib/costing-store'
import { contractorName } from '../../lib/contracting'
import { downloadCsv } from '../../lib/client-record'
import { T, tint, Page, Head, Card, Btn, Modal, Status, Empty, Table, inputStyle, th, td, rowLine, mono } from './kit'
import { DrillLogForm, type LogScope } from './drill-log-form'
import { checkShift } from '../../lib/log-checks'
import { MaintenanceLogForm } from './maintenance-log-form'

/* ==========================================================================
 * LOGS — every submitted drill log and maintenance log, in one place
 *
 * The Company Admin sees all of them and can change any; a supervisor sees
 * and changes his own. A change is saved on the same record every other
 * screen reads, so Finance, the Dashboard and the client's view move with it,
 * and the log keeps who changed it and when.
 * ========================================================================== */

/* Edit and delete stay in view however far the table is scrolled sideways. */
const pinned: React.CSSProperties = { position: 'sticky', right: 0, textAlign: 'right', background: T.card, boxShadow: `-10px 0 10px -10px ${tint(T.text, 22)}` }

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function DateCell({ date, icon }: { date: string; icon: ReactNode }) {
  const [y, m, d] = date.split('-').map(Number)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
      <span aria-hidden style={{ width: 30, height: 30, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: tint(T.orange, 12), color: T.orange, flexShrink: 0 }}>{icon}</span>
      <span style={{ color: T.text, fontWeight: 700, whiteSpace: 'nowrap' }}>{String(d).padStart(2, '0')} {MON[m - 1]} {y}</span>
    </span>
  )
}
function ShiftPill({ shift }: { shift?: string }) {
  if (!shift) return <span style={{ color: T.faint }}>—</span>
  return <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 9px', borderRadius: 999, border: `1px solid ${T.border}`, color: shift === 'Night' ? T.muted : T.orange, whiteSpace: 'nowrap' }}>{shift}</span>
}
const sel: React.CSSProperties = { ...inputStyle, cursor: 'pointer', fontWeight: 600 }
const tdM: React.CSSProperties = { ...td, fontFamily: mono, fontSize: 12.5 }
const iconBtn: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', padding: 6, lineHeight: 0, borderRadius: 6 }

type Dir = 'asc' | 'desc'
function SortTh<K extends string>({ k, label, sort, onSort, right }: { k: K; label: ReactNode; sort: { k: K; dir: Dir }; onSort: (k: K) => void; right?: boolean }) {
  const on = sort.k === k
  return (
    <th style={{ ...th, textAlign: right ? 'right' : 'left' }} aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      <button type="button" onClick={() => onSort(k)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: on ? T.text : 'inherit', textTransform: 'inherit', letterSpacing: 'inherit' }}>
        {label}{on ? (sort.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />) : <ArrowUpDown size={11} style={{ opacity: 0.5 }} />}
      </button>
    </th>
  )
}
function useSort<K extends string>(start: K) {
  const [sort, setSort] = useState<{ k: K; dir: Dir }>({ k: start, dir: 'desc' })
  const onSort = (k: K) => setSort(s => s.k === k ? { k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { k, dir: 'desc' })
  return { sort, onSort }
}

/* What a login may log against. The admin: every running project and its own
 * rigs. A supervisor: the projects he is assigned to. */
export function ownScopes(projects: ProjectRecord[], supervisor?: string): LogScope[] {
  return projects
    .filter(p => p.status !== 'completed' && p.rigs.length > 0 && (!supervisor || p.supervisors.includes(supervisor)))
    .map(p => ({ project: p.name, rigs: p.rigs, supervisors: p.supervisors, drillers: p.drillers }))
}

function Filters({ children, from, to, onFrom, onTo, onReset, dirty }: { children: ReactNode; from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void; onReset: () => void; dirty: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      {children}
      <div style={{ ...inputStyle, flex: '2 1 300px', width: 'auto', display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px' }}>
        <span style={{ fontSize: 12.5, color: T.faint, whiteSpace: 'nowrap' }}>From</span>
        <input type="date" value={from} aria-label="From date" onChange={e => onFrom(e.target.value)} style={{ background: 'none', border: 'none', color: T.text, fontFamily: 'inherit', fontSize: 13, minWidth: 0, flex: 1 }} />
        <span style={{ fontSize: 12.5, color: T.faint }}>to</span>
        <input type="date" value={to} aria-label="To date" onChange={e => onTo(e.target.value)} style={{ background: 'none', border: 'none', color: T.text, fontFamily: 'inherit', fontSize: 13, minWidth: 0, flex: 1 }} />
      </div>
      {dirty && <button type="button" onClick={onReset} style={{ ...iconBtn, color: T.faint, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontFamily: 'inherit' }}><RotateCcw size={13} /> Clear</button>}
    </div>
  )
}

// ── DRILL LOGS ────────────────────────────────────────────────────────────

type DK = 'date' | 'shift' | 'metres' | 'hmr' | 'engine' | 'core' | 'drill' | 'down'

export function DrillLogsScreen({ who, supervisor, top }: { who: string; supervisor?: string; top?: ReactNode }) {
  const { state, saveShiftLog, deleteShiftLog } = useCosting()
  const [project, setProject] = useState('all')
  const [rig, setRig] = useState('all')
  const [sup, setSup] = useState('all')
  const [shift, setShift] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [shown, setShown] = useState(25)
  const [editing, setEditing] = useState<ShiftLog | 'new' | null>(null)
  const [removing, setRemoving] = useState<ShiftLog | null>(null)
  const { sort, onSort } = useSort<DK>('date')

  /* A supervisor sees the logs he wrote. The admin sees every shift in the
   * record, a contractor's checked shifts included. */
  const mine = useMemo(() => state.shiftLogs.filter(l => !l.segmentOf && (!supervisor || l.supervisor === supervisor)), [state.shiftLogs, supervisor])
  const seg = useMemo(() => { const m: Record<string, ShiftLog> = {}; state.shiftLogs.forEach(l => { if (l.segmentOf) m[l.segmentOf] = l }); return m }, [state.shiftLogs])
  const projects = Array.from(new Set(mine.map(l => l.project))).sort()
  const rigsAll = Array.from(new Set(mine.filter(l => project === 'all' || l.project === project).map(l => l.rig))).sort()
  const sups = Array.from(new Set(mine.map(l => l.supervisor ?? '').filter(Boolean))).sort()

  const rows = useMemo(() => {
    const val = (l: ShiftLog): string | number => sort.k === 'date' ? `${l.date}${l.shift === 'Day' ? '0' : '1'}` : sort.k === 'shift' ? l.shift
      : sort.k === 'metres' ? l.metresDrilled + (seg[l.id]?.metresDrilled ?? 0) : sort.k === 'hmr' ? l.engineHmr ?? -1 : sort.k === 'engine' ? l.engineHours ?? -1
      : sort.k === 'core' ? l.coreRecovery : sort.k === 'drill' ? l.drillingHours : l.downtimeHours
    return mine
      .filter(l => (project === 'all' || l.project === project) && (rig === 'all' || l.rig === rig) && (sup === 'all' || l.supervisor === sup)
        && (shift === 'all' || l.shift === shift) && (!from || l.date >= from) && (!to || l.date <= to))
      .sort((a, b) => { const x = val(a), y = val(b); const c = x < y ? -1 : x > y ? 1 : a.rig.localeCompare(b.rig); return sort.dir === 'asc' ? c : -c })
  }, [mine, seg, project, rig, sup, shift, from, to, sort])

  const scopes = useMemo(() => ownScopes(state.projects, supervisor), [state.projects, supervisor])
  /* Opened from a link elsewhere (the supervisor's Today, a finding): ?edit=<log id>
   * opens that log, ?new=1 opens a blank one. Only logs this screen shows can be opened. */
  const [linked, setLinked] = useState(false)
  useEffect(() => {
    if (linked || !mine.length) return
    const q = new URLSearchParams(window.location.search)
    const id = q.get('edit')
    const hit = id ? mine.find(l => l.id === id) : undefined
    if (hit) setEditing(hit)
    else if (q.get('new') === '1' && scopes.length) setEditing('new')
    if (id || q.get('new')) window.history.replaceState(null, '', window.location.pathname)
    setLinked(true)
  }, [mine, scopes, linked])
  /* A log being changed keeps its own project and rig in the choices, even on
   * a project that has since finished or a rig that belongs to a contractor. */
  const scopesFor = (l: ShiftLog): LogScope[] => {
    const p = state.projects.find(x => x.name === l.project)
    const base = scopes.filter(s => s.project !== l.project)
    const own = scopes.find(s => s.project === l.project)
    return [...base, { project: l.project, rigs: Array.from(new Set([...(own?.rigs ?? p?.rigs ?? []), l.rig])), supervisors: p?.supervisors ?? [], drillers: p?.drillers ?? [], workOrderId: l.workOrderId }]
  }
  const dirty = project !== 'all' || rig !== 'all' || sup !== 'all' || shift !== 'all' || !!from || !!to
  const reset = () => { setProject('all'); setRig('all'); setSup('all'); setShift('all'); setFrom(''); setTo('') }

  const exportIt = () => downloadCsv('drill-logs', [
    ['Date', 'Shift', 'Project', 'Rig', 'Driller', 'Supervisor', 'Hole', 'Meter start (m)', 'Meter end (m)', 'Meters drilled', 'Lithology', 'Formation', 'Engine HMR', 'Engine hours', 'Core recovery (m)', 'Drilling hours', 'Downtime hours', 'Downtime reasons', 'Fuel (L)', 'Water (L)', 'Additives (kg)', 'Crew', 'Logged by', 'Notes'],
    ...rows.map(l => [l.date, l.shift, l.project, l.rig, l.driller ?? '', l.supervisor ?? '', l.holeNumber ?? '', l.meterStart ?? '', l.meterEnd ?? '', l.metresDrilled, l.lithology ?? '', l.formationType,
      l.engineHmr ?? '', l.engineHours ?? '', l.coreRecovery, l.drillingHours, l.downtimeHours, (l.downtime ?? []).map(d => `${d.reason} (${d.side}) ${d.hours}h`).join('; ') || l.downtimeReason,
      l.fuelLitres, l.waterLitres, l.additivesKg, l.crewCount, l.contractor ? contractorName(state, l.contractor) : l.loggedBy ?? '', l.notes ?? '']),
  ])

  return (
    <Page>
      <Head title="Drill Logs" sub="Shift-by-shift drilling records"
        right={<>
          <Btn onClick={exportIt} disabled={!rows.length}><Download size={14} /> Export logs</Btn>
          <Btn kind="primary" onClick={() => setEditing('new')} disabled={!scopes.length}><Plus size={15} /> New Drill Log</Btn>
        </>} />
      {top}

      <Filters from={from} to={to} onFrom={setFrom} onTo={setTo} onReset={reset} dirty={dirty}>
        <select value={project} aria-label="Project" onChange={e => { setProject(e.target.value); setRig('all') }} style={{ ...sel, flex: '1 1 170px', width: 'auto' }}>
          <option value="all">All Projects</option>{projects.map(p => <option key={p} value={p}>{projectCode(p)} · {p}</option>)}
        </select>
        <select value={rig} aria-label="Rig" onChange={e => setRig(e.target.value)} style={{ ...sel, flex: '1 1 150px', width: 'auto' }}>
          <option value="all">All Rigs</option>{rigsAll.map(r => <option key={r}>{r}</option>)}
        </select>
        {!supervisor && (
          <select value={sup} aria-label="Supervisor" onChange={e => setSup(e.target.value)} style={{ ...sel, flex: '1 1 170px', width: 'auto' }}>
            <option value="all">All Supervisors</option>{sups.map(s => <option key={s}>{s}</option>)}
          </select>
        )}
        <select value={shift} aria-label="Shift" onChange={e => setShift(e.target.value)} style={{ ...sel, flex: '1 1 130px', width: 'auto' }}>
          <option value="all">All Shifts</option><option>Day</option><option>Night</option>
        </select>
      </Filters>

      <Card pad={false}>
        {rows.length === 0 ? <Empty>{mine.length === 0 ? 'No drill logs yet. Create the first one with New Drill Log.' : 'No drill logs match these filters.'}</Empty> : (
          <Table>
            <thead><tr>
              <SortTh k="date" label="Date" sort={sort} onSort={onSort} />
              <SortTh k="shift" label="Shift" sort={sort} onSort={onSort} />
              <th style={th}>Checks</th>
              <th style={th}>Project</th><th style={th}>Rig</th><th style={th}>Driller</th><th style={th}>Supervisor</th><th style={th}>Hole</th>
              <th style={th}>Meter start (m)</th><th style={th}>Meter end (m)</th>
              <SortTh k="metres" label="Meters drilled" sort={sort} onSort={onSort} />
              <th style={th}>Lithology</th>
              <SortTh k="hmr" label="Engine HMR" sort={sort} onSort={onSort} />
              <SortTh k="engine" label="Engine hours" sort={sort} onSort={onSort} />
              <SortTh k="core" label="Core recovery" sort={sort} onSort={onSort} />
              <SortTh k="drill" label="Drilling hours" sort={sort} onSort={onSort} />
              <SortTh k="down" label="Downtime hours" sort={sort} onSort={onSort} />
              <th style={{ ...th, ...pinned }}>Actions</th>
            </tr></thead>
            <tbody>
              {rows.slice(0, shown).map(l => {
                const second = seg[l.id]
                return (
                  <tr key={l.id} className="xpl-row" style={{ borderBottom: rowLine }}>
                    <td style={td}><DateCell date={l.date} icon={<Activity size={15} />} /></td>
                    <td style={td}><ShiftPill shift={l.shift} /></td>
                    <td style={td}><TrustMark log={l} state={state} /></td>
                    <td style={{ ...tdM, color: T.blue }}>{projectCode(l.project)}</td>
                    <td style={tdM}>{l.rig}{l.contractor && <div style={{ fontFamily: 'inherit', fontSize: 11.5, color: T.faint }}>{contractorName(state, l.contractor)}</div>}</td>
                    <td style={{ ...td, color: T.text, fontWeight: 600 }}>{l.driller || '—'}</td>
                    <td style={{ ...td, color: T.text, fontWeight: 600 }}>{l.supervisor || '—'}</td>
                    <td style={tdM}>{l.holeNumber ?? '—'}{second && <div style={{ color: T.faint }}>+ {second.holeNumber}</div>}</td>
                    <td style={tdM}>{l.meterStart != null ? +l.meterStart.toFixed(2) : '—'}</td>
                    <td style={tdM}>{l.meterEnd != null ? +l.meterEnd.toFixed(2) : '—'}</td>
                    <td style={tdM}>{l.standbyMode ? <Status tone="warn">Standby</Status> : `${l.metresDrilled} m`}{second && <div style={{ color: T.faint }}>+ {second.metresDrilled} m</div>}</td>
                    <td style={{ ...td, whiteSpace: 'normal', minWidth: 110 }}>{l.lithology || '—'}</td>
                    <td style={tdM}>{l.engineHmr ?? '—'}</td>
                    <td style={tdM}>{l.engineHours != null ? `${l.engineHours}h` : '—'}</td>
                    <td style={tdM}>{l.metresDrilled > 0 ? `${l.coreRecovery} m` : '—'}</td>
                    <td style={tdM}>{l.drillingHours}h</td>
                    <td style={{ ...tdM, color: l.downtimeHours > 0 ? T.amber : T.faint }}>{l.downtimeHours}h</td>
                    <td style={{ ...td, ...pinned }}>
                      <button type="button" aria-label={`Edit the ${l.shift} shift of ${l.rig} on ${l.date}`} title="Edit" onClick={() => setEditing(l)} style={{ ...iconBtn, color: T.muted }}><Pencil size={15} /></button>
                      <button type="button" aria-label={`Delete the ${l.shift} shift of ${l.rig} on ${l.date}`} title="Delete" onClick={() => setRemoving(l)} style={{ ...iconBtn, color: T.faint }}><Trash2 size={15} /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
        {rows.length > 0 && (
          <div style={{ padding: '11px 18px', borderTop: rowLine, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', fontSize: 12.5, color: T.faint }}>
            <span>Showing {Math.min(shown, rows.length)} of {rows.length} logs · {Math.round(rows.reduce((s, l) => s + l.metresDrilled + (seg[l.id]?.metresDrilled ?? 0), 0)).toLocaleString('en-US')} m in all</span>
            {rows.length > shown && <button type="button" onClick={() => setShown(n => n + 50)} style={{ background: 'none', border: 'none', color: T.orange, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5 }}>Show 50 more</button>}
          </div>
        )}
      </Card>

      {editing && (
        <Modal title={editing === 'new' ? 'Create Drill Log' : 'Edit Drill Log'} width={1000} onClose={() => setEditing(null)}
          subtitle={editing !== 'new' ? <>{editing.rig} · {editing.date} · {editing.shift} shift{editing.loggedBy ? ` · logged by ${editing.loggedBy}` : ''}{editing.editedBy ? ` · last changed by ${editing.editedBy}` : ''}</> : undefined}>
          <DrillLogForm
            variant={editing !== 'new' && editing.contractor ? 'contractor' : 'own'}
            scopes={editing === 'new' ? scopes : scopesFor(editing)}
            existing={editing === 'new' ? undefined : editing}
            lockSupervisor={editing === 'new' ? supervisor : undefined}
            by={who} submitLabel={editing === 'new' ? 'Create Log' : 'Save Changes'}
            onCancel={() => setEditing(null)}
            onSubmit={log => { saveShiftLog(log); setEditing(null) }} />
        </Modal>
      )}
      {removing && (
        <Modal title="Delete this drill log?" width={480} onClose={() => setRemoving(null)}
          subtitle={`${removing.rig} · ${removing.date} · ${removing.shift} shift · ${removing.metresDrilled} m`}
          footer={<><Btn onClick={() => setRemoving(null)}>Keep it</Btn><Btn kind="danger" onClick={() => { deleteShiftLog(removing.id); setRemoving(null) }}>Delete log</Btn></>}>
          <div style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.6 }}>Its metres, hours and costs leave every screen that reads the record. If a figure is wrong, edit the log instead.</div>
        </Modal>
      )}
    </Page>
  )
}

// ── MAINTENANCE LOGS ──────────────────────────────────────────────────────

type MK = 'date' | 'type' | 'hours' | 'cost' | 'action'

export function MaintenanceLogsScreen({ who, supervisor, top }: { who: string; supervisor?: string; top?: ReactNode }) {
  const { state, saveMaintenance, deleteMaintenance } = useCosting()
  const [project, setProject] = useState('all')
  const [rig, setRig] = useState('all')
  const [shift, setShift] = useState('all')
  const [type, setType] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [editing, setEditing] = useState<MaintenanceLog | 'new' | null>(null)
  const [removing, setRemoving] = useState<MaintenanceLog | null>(null)
  const { sort, onSort } = useSort<MK>('date')

  const mine = useMemo(() => state.maintenance.filter(m => !supervisor || m.supervisor === supervisor), [state.maintenance, supervisor])
  const projects = Array.from(new Set(mine.map(m => m.project))).sort()
  const rigsAll = Array.from(new Set(mine.filter(m => project === 'all' || m.project === project).map(m => m.rig))).sort()
  const rows = useMemo(() => {
    const val = (m: MaintenanceLog): string | number => sort.k === 'date' ? m.date : sort.k === 'type' ? m.maintenanceType : sort.k === 'hours' ? m.hours : sort.k === 'cost' ? m.cost : m.action
    return mine
      .filter(m => (project === 'all' || m.project === project) && (rig === 'all' || m.rig === rig) && (shift === 'all' || m.shift === shift)
        && (type === 'all' || m.maintenanceType === type) && (!from || m.date >= from) && (!to || m.date <= to))
      .sort((a, b) => { const x = val(a), y = val(b); const c = x < y ? -1 : x > y ? 1 : a.rig.localeCompare(b.rig); return sort.dir === 'asc' ? c : -c })
  }, [mine, project, rig, shift, type, from, to, sort])

  const scopes = useMemo(() => ownScopes(state.projects, supervisor), [state.projects, supervisor])
  const scopesFor = (m: MaintenanceLog): LogScope[] => {
    const p = state.projects.find(x => x.name === m.project)
    const own = scopes.find(s => s.project === m.project)
    return [...scopes.filter(s => s.project !== m.project), { project: m.project, rigs: Array.from(new Set([...(own?.rigs ?? p?.rigs ?? []), m.rig])), supervisors: p?.supervisors ?? [], drillers: p?.drillers ?? [], workOrderId: m.workOrderId }]
  }
  const dirty = project !== 'all' || rig !== 'all' || shift !== 'all' || type !== 'all' || !!from || !!to
  const reset = () => { setProject('all'); setRig('all'); setShift('all'); setType('all'); setFrom(''); setTo('') }
  const money = (n: number) => `SAR ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const exportIt = () => downloadCsv('maintenance-logs', [
    ['Date', 'Shift', 'Type', 'Project', 'Rig', 'Supervisor', 'Duration (hours)', 'Component', 'Action taken', 'Service cost', 'Engine oil (L)', 'Hydraulic oil (L)', 'Transmission oil (L)', 'Notes'],
    ...rows.map(m => [m.date, m.shift ?? '', MAINTENANCE_TYPE_LABEL[m.maintenanceType], m.project, m.rig, m.supervisor ?? '', m.hours, m.component, m.action, m.cost, m.engineOilL ?? 0, m.hydraulicOilL ?? 0, m.transmissionOilL ?? 0, m.notes ?? '']),
  ])

  return (
    <Page>
      <Head title="Maintenance Logs" sub="Rig maintenance and repair records"
        right={<>
          <Btn onClick={exportIt} disabled={!rows.length}><Download size={14} /> Export logs</Btn>
          <Btn kind="primary" onClick={() => setEditing('new')} disabled={!scopes.length}><Plus size={15} /> New Maintenance Log</Btn>
        </>} />
      {top}

      <Filters from={from} to={to} onFrom={setFrom} onTo={setTo} onReset={reset} dirty={dirty}>
        <select value={project} aria-label="Project" onChange={e => { setProject(e.target.value); setRig('all') }} style={{ ...sel, flex: '1 1 170px', width: 'auto' }}>
          <option value="all">All Projects</option>{projects.map(p => <option key={p} value={p}>{projectCode(p)} · {p}</option>)}
        </select>
        <select value={rig} aria-label="Rig" onChange={e => setRig(e.target.value)} style={{ ...sel, flex: '1 1 150px', width: 'auto' }}>
          <option value="all">All Rigs</option>{rigsAll.map(r => <option key={r}>{r}</option>)}
        </select>
        <select value={shift} aria-label="Shift" onChange={e => setShift(e.target.value)} style={{ ...sel, flex: '1 1 130px', width: 'auto' }}>
          <option value="all">All Shifts</option><option>Day</option><option>Night</option>
        </select>
        <select value={type} aria-label="Type" onChange={e => setType(e.target.value)} style={{ ...sel, flex: '1 1 170px', width: 'auto' }}>
          <option value="all">All Types</option>{MAINTENANCE_TYPES.map(t => <option key={t} value={t}>{MAINTENANCE_TYPE_LABEL[t]}</option>)}
        </select>
      </Filters>

      <Card pad={false}>
        {rows.length === 0 ? <Empty>{mine.length === 0 ? 'No maintenance logs yet. Create the first one with New Maintenance Log.' : 'No maintenance logs match these filters.'}</Empty> : (
          <Table>
            <thead><tr>
              <SortTh k="date" label="Date" sort={sort} onSort={onSort} />
              <th style={th}>Shift</th>
              <SortTh k="type" label="Type" sort={sort} onSort={onSort} />
              <th style={th}>Project</th><th style={th}>Rig</th><th style={th}>Component</th>
              <SortTh k="hours" label="Duration (hours)" sort={sort} onSort={onSort} />
              <SortTh k="cost" label="Service cost" sort={sort} onSort={onSort} />
              <SortTh k="action" label="Action taken" sort={sort} onSort={onSort} />
              <th style={{ ...th, ...pinned }}>Actions</th>
            </tr></thead>
            <tbody>
              {rows.map(m => (
                <tr key={m.id} className="xpl-row" style={{ borderBottom: rowLine }}>
                  <td style={td}><DateCell date={m.date} icon={<Wrench size={15} />} /></td>
                  <td style={td}><ShiftPill shift={m.shift} /></td>
                  <td style={td}><span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: tint(m.maintenanceType === 'Breakdown' ? T.amber : T.blue, 12), border: `1px solid ${tint(m.maintenanceType === 'Breakdown' ? T.amber : T.blue, 36)}`, color: T.text, whiteSpace: 'nowrap' }}>{MAINTENANCE_TYPE_LABEL[m.maintenanceType]}</span></td>
                  <td style={{ ...tdM, color: T.blue }}>{projectCode(m.project)}</td>
                  <td style={tdM}>{m.rig}{m.contractor && <div style={{ fontFamily: 'inherit', fontSize: 11.5, color: T.faint }}>{contractorName(state, m.contractor)}</div>}</td>
                  <td style={{ ...td, whiteSpace: 'normal', minWidth: 130 }}>{m.component}</td>
                  <td style={tdM}>{m.hours}h</td>
                  <td style={tdM}>{m.contractor ? '—' : money(m.cost)}</td>
                  <td style={td}>{m.action}</td>
                  <td style={{ ...td, ...pinned }}>
                    <button type="button" aria-label={`Edit the maintenance log of ${m.rig} on ${m.date}`} title="Edit" onClick={() => setEditing(m)} style={{ ...iconBtn, color: T.muted }}><Pencil size={15} /></button>
                    <button type="button" aria-label={`Delete the maintenance log of ${m.rig} on ${m.date}`} title="Delete" onClick={() => setRemoving(m)} style={{ ...iconBtn, color: T.faint }}><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {rows.length > 0 && (
          <div style={{ padding: '11px 18px', borderTop: rowLine, fontSize: 12.5, color: T.faint }}>
            {rows.length} logs · {rows.reduce((s, m) => s + m.hours, 0)} hours · {money(rows.reduce((s, m) => s + m.cost, 0))} in service cost
          </div>
        )}
      </Card>

      {editing && (
        <Modal title={editing === 'new' ? 'Create Maintenance Log' : 'Edit Maintenance Log'} width={900} onClose={() => setEditing(null)}
          subtitle={editing !== 'new' ? <>{editing.rig} · {editing.date}{editing.loggedBy ? ` · logged by ${editing.loggedBy}` : ''}{editing.editedBy ? ` · last changed by ${editing.editedBy}` : ''}</> : undefined}>
          <MaintenanceLogForm
            variant={editing !== 'new' && editing.contractor ? 'contractor' : 'own'}
            scopes={editing === 'new' ? scopes : scopesFor(editing)}
            existing={editing === 'new' ? undefined : editing}
            contractorId={editing !== 'new' ? editing.contractor : undefined}
            lockSupervisor={editing === 'new' ? supervisor : undefined}
            by={who} submitLabel={editing === 'new' ? 'Create Log' : 'Save Changes'}
            onCancel={() => setEditing(null)}
            onSubmit={m => { saveMaintenance(m); setEditing(null) }} />
        </Modal>
      )}
      {removing && (
        <Modal title="Delete this maintenance log?" width={480} onClose={() => setRemoving(null)}
          subtitle={`${removing.rig} · ${removing.date} · ${MAINTENANCE_TYPE_LABEL[removing.maintenanceType]}`}
          footer={<><Btn onClick={() => setRemoving(null)}>Keep it</Btn><Btn kind="danger" onClick={() => { deleteMaintenance(removing.id); setRemoving(null) }}>Delete log</Btn></>}>
          <div style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.6 }}>Its hours and service cost leave the rig&apos;s costing. If a figure is wrong, edit the log instead.</div>
        </Modal>
      )}
    </Page>
  )
}

/* What the drill log checks say about one shift, in a glance: clean, saved
 * with reasons, unusual and unexplained, or figures that cannot be right. */
function TrustMark({ log, state }: { log: ShiftLog; state: Parameters<typeof checkShift>[0] }) {
  const checks = checkShift(state, log, { contractor: !!log.contractor })
  const said = new Set((log.trust?.warnings ?? []).map(w => w.id))
  const stops = checks.filter(c => c.level === 'stop')
  const open = checks.filter(c => c.level === 'warn' && !said.has(c.id))
  const explained = checks.filter(c => c.level === 'warn' && said.has(c.id))
  const tip = [...stops, ...open].map(c => c.title).concat(explained.map(c => `Explained: ${c.title} (${log.trust?.warnings.find(w => w.id === c.id)?.reason})`)).join('\n')
  const pill = (bg: string, fg: string, text: string) => (
    <span title={tip || 'Passes every XPLORIX check'} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, background: bg, color: fg, whiteSpace: 'nowrap' }}>{text}</span>
  )
  if (stops.length) return pill(tint(T.red, 14), T.red, `✕ ${stops.length} wrong`)
  if (open.length) return pill(tint(T.amber, 16), T.amber, `! ${open.length} to explain`)
  if (explained.length) return pill('rgba(var(--x-ov),0.06)', T.muted, `✓ ${explained.length} explained`)
  return pill(tint(T.green, 14), T.green, '✓ Clean')
}
