'use client'

import { useMemo, useState } from 'react'
import { ClipboardCheck, RotateCcw, Check } from 'lucide-react'
import {
  useInventory, rigUnits, rigHoldings, countLosses, CONDITION_LIFE, CONDITION_LABEL, TODAY, daysBetween, money, moneyL,
  type Condition, type Part,
} from '../../../lib/inventory-store'
import { useCosting } from '../../../lib/costing-store'
import { Card, Btn, Modal, Field, Status, Note, inputStyle, T, tint, rowLine } from '../../components/kit'

/* ==========================================================================
 * WHAT IS ON EACH RIG
 *
 * A company joining XPLORIX does not know what is on its rigs, and without
 * it every cost a metre and every stock warning is wrong. Three ways in:
 *   First count   once, on the supervisor's phone: the list comes from the
 *                 rig's core sizes, so he types quantities and how worn
 *   Learned       a part the drill log used that the rig was never given:
 *                 one tap says it was already on the rig
 *   Recount       once a month: what XPLORIX thinks is there, ticked or
 *                 corrected; short is lost or not logged
 * ========================================================================== */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const day = (d?: string) => d ? `${Number(d.slice(8, 10))} ${MON[Number(d.slice(5, 7)) - 1]}` : '—'
const RECOUNT_DAYS = 30

export interface RigPlace { rig: string; project: string; sizes: string[]; firstShift?: string }

/* The rigs to count: your own, on the project they last logged on. */
export function useRigPlaces(): RigPlace[] {
  const { state } = useCosting()
  return useMemo(() => {
    const own = (state.rigRegister ?? []).filter(r => r.state !== 'retired')
    const contractorRigs = new Set((state.workOrders ?? []).flatMap(w => w.rigs))
    const names = Array.from(new Set([...own.map(r => r.rig), ...state.shiftLogs.filter(l => !l.contractor && !contractorRigs.has(l.rig)).map(l => l.rig)]))
    return names.map(rig => {
      const logs = state.shiftLogs.filter(l => l.rig === rig && !l.contractor).sort((a, b) => a.date.localeCompare(b.date))
      const project = logs[logs.length - 1]?.project ?? (state.projects ?? []).find(p => p.rigs.includes(rig))?.name ?? ''
      return { rig, project, sizes: own.find(r => r.rig === rig)?.sizes ?? ['HQ'], firstShift: logs.find(l => l.project === project)?.date }
    }).filter(p => p.project).sort((a, b) => a.rig.localeCompare(b.rig, undefined, { numeric: true }))
  }, [state.rigRegister, state.workOrders, state.shiftLogs, state.projects])
}

function usedOn(logs: { rig: string; project: string; partsUsed?: { itemId: string; qty?: number }[] }[], rig: string, project: string) {
  const out: Record<string, number> = {}
  logs.filter(l => l.rig === rig && l.project === project).forEach(l => (l.partsUsed ?? []).forEach(u => { out[u.itemId] = (out[u.itemId] ?? 0) + (u.qty ?? 0) }))
  return out
}

/* The overview card: which rigs are counted, which are due a recount, and
 * what the drill logs used that XPLORIX never saw go on the rig. */
export function RigCountCard() {
  const { state, addRigKit, addRigCount } = useInventory()
  const { state: costing } = useCosting()
  const places = useRigPlaces()
  const [counting, setCounting] = useState<RigPlace | null>(null)
  const [recounting, setRecounting] = useState<RigPlace | null>(null)

  const rows = places.map(p => {
    const first = state.rigKit.filter(k => k.rig === p.rig && k.project === p.project && (k.source ?? 'count') === 'count').map(k => k.date).sort()[0]
    const last = [...(state.rigCounts ?? []).filter(c => c.rig === p.rig && c.project === p.project).map(c => c.date), first].filter(Boolean).sort().pop()
    const units = rigUnits(state.pos, state.rigKit, p.rig, p.project)
    const used = usedOn(costing.shiftLogs, p.rig, p.project)
    const lost = Object.fromEntries(countLosses(state.rigCounts ?? [], p.rig, p.project).map(l => [l.itemId, l.qty]))
    const unknown = Object.entries(used).map(([itemId, q]) => ({ itemId, short: Math.round((q + (lost[itemId] ?? 0) - (units[itemId]?.qty ?? 0)) * 100) / 100 })).filter(x => x.short > 0)
    return { p, first, last, unknown, due: !!last && daysBetween(last, TODAY) > RECOUNT_DAYS }
  })
  const part = (id: string) => state.catalogue.find(c => c.id === id)
  /* Already on the rig follows the valuation setting; issued from the store
   * without a record is bought stock, so it is always charged. */
  const learn = (p: RigPlace, itemId: string, qty: number, how: 'rig' | 'store') => {
    const pt = part(itemId)
    addRigKit({
      date: p.firstShift ?? TODAY, project: p.project, rig: p.rig, source: 'learned',
      addedBy: how === 'rig' ? 'Already on the rig' : 'Issued from the store without a record',
      lines: [{ itemId, qty, pieces: qty, condition: 'new', rate: how === 'store' || state.valuation === 'charge' ? pt?.rate ?? 0 : 0 }],
    })
  }
  const [openRig, setOpenRig] = useState<string | null>(null)
  const notCounted = rows.filter(r => !r.first).length
  const due = rows.filter(r => r.due).length

  return (
    <Card title="What is on each rig" subtitle="Counted once when a rig joins, learned from the drill logs, checked once a month."
      right={<span style={{ fontSize: 12.5, color: T.muted }}>{notCounted ? `${notCounted} not counted` : 'All counted'}{due ? ` · ${due} due a recount` : ''}</span>}>
      <div style={{ display: 'grid', gap: 0 }}>
        {rows.map(({ p, first, last, unknown, due }, i) => (
          <div key={p.rig} style={{ display: 'grid', gap: 8, padding: '12px 0', borderTop: i ? rowLine : 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{p.rig}</span>
                <span style={{ fontSize: 12.5, color: T.faint }}> · {p.project}</span>
                <div style={{ fontSize: 12.5, color: T.muted, marginTop: 3 }}>
                  {!first ? <Status tone="warn">Not counted yet: parts on this rig cost nothing a metre</Status>
                    : <>First counted {day(first)}{last && last !== first ? `, last checked ${day(last)}` : ''}{due ? <b style={{ color: 'var(--x-bad-text)' }}> · recount due</b> : ''}</>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {!first ? <Btn size="sm" kind="primary" onClick={() => setCounting(p)}><ClipboardCheck size={13} aria-hidden />First count</Btn>
                  : <Btn size="sm" kind={due ? 'primary' : 'ghost'} onClick={() => setRecounting(p)}><RotateCcw size={13} aria-hidden />Recount</Btn>}
              </div>
            </div>
            {unknown.length > 0 && (
              <div style={{ background: tint(T.amber, 8), border: `1px solid ${tint(T.amber, 30)}`, borderRadius: 10, padding: '9px 12px', display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 12.5, color: T.text }}><b>{unknown.length} {unknown.length === 1 ? 'part was' : 'parts were'} used more than XPLORIX knew {p.rig} had.</b> Say where they came from, and they are costed right from now on.</span>
                  <Btn size="sm" onClick={() => setOpenRig(o => o === p.rig ? null : p.rig)}>{openRig === p.rig ? 'Hide' : 'Review'}</Btn>
                </div>
                {openRig === p.rig && unknown.map(u => (
                  <div key={u.itemId} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 12.5, paddingTop: 6, borderTop: `1px solid ${tint(T.amber, 25)}` }}>
                    <span style={{ color: T.text }}>{part(u.itemId)?.name ?? u.itemId}: <b>{u.short}</b> used beyond what the rig was given</span>
                    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                      <Btn size="sm" onClick={() => learn(p, u.itemId, u.short, 'rig')}><Check size={12} aria-hidden />Was already on the rig</Btn>
                      <Btn size="sm" onClick={() => learn(p, u.itemId, u.short, 'store')}>Came from the store, not recorded</Btn>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {rows.length === 0 && <span style={{ fontSize: 13, color: T.muted }}>No rig of yours is on a project yet.</span>}
      </div>
      {counting && <FirstCount p={counting} onClose={() => setCounting(null)} onSave={(by, date, lines) => {
        addRigKit({ date, project: counting.project, rig: counting.rig, addedBy: by, source: 'count', lines })
        setCounting(null)
      }} />}
      {recounting && <Recount p={recounting} onClose={() => setRecounting(null)} onSave={(by, date, lines) => {
        const found = lines.filter(l => l.counted > l.expected).map(l => {
          const pt = part(l.itemId)
          const q = Math.round((l.counted - l.expected) * 100) / 100
          return { itemId: l.itemId, qty: q, pieces: q, condition: 'new' as Condition, rate: state.valuation === 'paid' ? 0 : pt?.rate ?? 0 }
        })
        addRigCount({ date, project: recounting.project, rig: recounting.rig, by, lines }, { date, project: recounting.project, rig: recounting.rig, addedBy: by, source: 'recount', lines: found })
        setRecounting(null)
      }} />}
    </Card>
  )
}

function FirstCount({ p, onClose, onSave }: { p: RigPlace; onClose: () => void; onSave: (by: string, date: string, lines: { itemId: string; qty: number; rate: number; pieces: number; condition: Condition }[]) => void }) {
  const { state } = useInventory()
  const parts = state.catalogue.filter(c => c.active && (!c.holeSize || p.sizes.includes(c.holeSize)))
  const cats = Array.from(new Set(parts.map(c => c.category)))
  const [rows, setRows] = useState<Record<string, { n: string; c: Condition }>>({})
  const [by, setBy] = useState('Supervisor')
  const [date, setDate] = useState(p.firstShift && p.firstShift < TODAY ? p.firstShift : TODAY)
  const set = (id: string, patch: Partial<{ n: string; c: Condition }>) => setRows(r => ({ ...r, [id]: { n: r[id]?.n ?? '', c: r[id]?.c ?? 'new', ...patch } }))
  const lines = Object.entries(rows).map(([itemId, v]) => ({ itemId, pieces: parseFloat(v.n) || 0, condition: v.c })).filter(l => l.pieces > 0)
  const value = (pt: Part | undefined, pieces: number, c: Condition) => state.valuation === 'paid' ? 0 : (pt?.rate ?? 0) * pieces * CONDITION_LIFE[c]
  const total = lines.reduce((s, l) => s + value(state.catalogue.find(c => c.id === l.itemId), l.pieces, l.condition), 0)
  return (
    <Modal title={`First count · ${p.rig}`} subtitle={`What is on ${p.rig} today. The list is every ${p.sizes.join(' or ')} part in your catalogue: type how many, and how worn. Leave the rest empty.`} onClose={onClose} width={820}
      footer={<><span style={{ marginRight: 'auto', fontSize: 12.5, color: T.muted, alignSelf: 'center' }}>{lines.length} parts · {state.valuation === 'paid' ? 'treated as already paid' : `${moneyL(total)} to be charged to the metres it drills`}</span><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={!lines.length} onClick={() => onSave(by.trim() || 'Supervisor', date, lines.map(l => {
        const pt = state.catalogue.find(c => c.id === l.itemId)
        return { itemId: l.itemId, pieces: l.pieces, condition: l.condition, qty: Math.round(l.pieces * CONDITION_LIFE[l.condition] * 100) / 100, rate: state.valuation === 'paid' ? 0 : pt?.rate ?? 0 }
      }))}>Save the count</Btn></>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 12, marginBottom: 14 }}>
        <Field label="Counted by"><input style={inputStyle} value={by} onChange={e => setBy(e.target.value)} /></Field>
        <Field label="As on" hint="The rig's first shift on this project, so its first metres carry the cost"><input style={inputStyle} type="date" value={date} max={TODAY} onChange={e => setDate(e.target.value)} /></Field>
      </div>
      <Note>Half used means about half its life is left. A half-used bit counts as half a bit, so its cost a metre stays right.</Note>
      <div style={{ marginTop: 12, display: 'grid', gap: 14 }}>
        {cats.map(cat => (
          <div key={cat}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, letterSpacing: '0.04em', marginBottom: 6 }}>{cat.toUpperCase()}</div>
            {parts.filter(c => c.category === cat).map(pt => (
              <div key={pt.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 80px 150px', gap: 8, alignItems: 'center', padding: '5px 0', borderTop: rowLine }}>
                <span style={{ fontSize: 13, color: T.text, minWidth: 0 }}>{pt.name}<span style={{ color: T.faint }}> · {pt.partNumber}</span></span>
                <input aria-label={`${pt.name}, how many`} type="number" min={0} placeholder="0" value={rows[pt.id]?.n ?? ''} onChange={e => set(pt.id, { n: e.target.value })} style={{ ...inputStyle, padding: '6px 8px', textAlign: 'right' }} />
                <select aria-label={`${pt.name}, condition`} value={rows[pt.id]?.c ?? 'new'} onChange={e => set(pt.id, { c: e.target.value as Condition })} style={{ ...inputStyle, padding: '6px 8px' }}>
                  {(Object.keys(CONDITION_LABEL) as Condition[]).map(c => <option key={c} value={c}>{CONDITION_LABEL[c]}</option>)}
                </select>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Modal>
  )
}

function Recount({ p, onClose, onSave }: { p: RigPlace; onClose: () => void; onSave: (by: string, date: string, lines: { itemId: string; expected: number; counted: number }[]) => void }) {
  const { state } = useInventory()
  const { state: costing } = useCosting()
  const used = usedOn(costing.shiftLogs, p.rig, p.project)
  const losses = countLosses(state.rigCounts ?? [], p.rig, p.project)
  const usedList = [...Object.entries(used).map(([itemId, qty]) => ({ itemId, qty })), ...losses]
  const lines = rigHoldings(state.pos, state.catalogue, p.rig, p.project, usedList, state.rigKit).filter(l => l.totalQty > 0)
  const [counted, setCounted] = useState<Record<string, string>>({})
  const [by, setBy] = useState('Supervisor')
  const val = (l: typeof lines[number]) => counted[l.itemId] === undefined ? l.onRig : parseFloat(counted[l.itemId]) || 0
  const off = lines.filter(l => val(l) !== Math.round(l.onRig * 100) / 100)
  return (
    <Modal title={`Recount · ${p.rig}`} subtitle="What XPLORIX thinks is on the rig. Leave the ones that match; correct the rest." onClose={onClose} width={760}
      footer={<><span style={{ marginRight: 'auto', fontSize: 12.5, color: off.length ? 'var(--x-bad-text)' : T.muted, alignSelf: 'center' }}>{off.length ? `${off.length} different from XPLORIX` : 'Everything matches'}</span><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={() => onSave(by.trim() || 'Supervisor', TODAY, lines.map(l => ({ itemId: l.itemId, expected: Math.round(l.onRig * 100) / 100, counted: val(l) })))}>Save the recount</Btn></>}>
      <div style={{ marginBottom: 12, maxWidth: 260 }}><Field label="Counted by"><input style={inputStyle} value={by} onChange={e => setBy(e.target.value)} /></Field></div>
      {lines.length === 0 ? <span style={{ fontSize: 13, color: T.muted }}>XPLORIX has nothing on this rig yet. Do a first count instead.</span> : (
        <div style={{ display: 'grid' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 90px 100px', gap: 8, fontSize: 11.5, fontWeight: 700, color: T.faint, padding: '0 0 6px' }}><span>Part</span><span style={{ textAlign: 'right' }}>XPLORIX</span><span style={{ textAlign: 'right' }}>Counted</span></div>
          {lines.map(l => {
            const diff = val(l) - Math.round(l.onRig * 100) / 100
            return (
              <div key={l.itemId} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 90px 100px', gap: 8, alignItems: 'center', padding: '6px 0', borderTop: rowLine }}>
                <span style={{ fontSize: 13, color: T.text }}>{l.name}{diff !== 0 && <span style={{ fontSize: 12, color: diff < 0 ? 'var(--x-bad-text)' : 'var(--x-good-text)', fontWeight: 600 }}> · {diff < 0 ? `${-diff} missing (${money(-diff * l.avgRate)})` : `${diff} more found`}</span>}</span>
                <span style={{ fontSize: 13, color: T.muted, textAlign: 'right' }}>{Math.round(l.onRig * 100) / 100}</span>
                <input aria-label={`${l.name}, counted`} type="number" min={0} value={counted[l.itemId] ?? String(Math.round(l.onRig * 100) / 100)} onChange={e => setCounted(c => ({ ...c, [l.itemId]: e.target.value }))} style={{ ...inputStyle, padding: '6px 8px', textAlign: 'right' }} />
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}

/* The one setting: how stock already on the rigs is valued. */
export function ValuationSetting() {
  const { state, setValuation } = useInventory()
  const opt = (v: 'charge' | 'paid', title: string, sub: string) => (
    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 10, border: `1px solid ${state.valuation === v ? tint(T.orange, 45) : T.border}`, background: state.valuation === v ? tint(T.orange, 8) : T.card, cursor: 'pointer', flex: '1 1 260px' }}>
      <input type="radio" name="valuation" checked={state.valuation === v} onChange={() => setValuation(v)} style={{ marginTop: 3 }} />
      <span style={{ display: 'grid', gap: 2 }}><b style={{ fontSize: 13.5, color: T.text }}>{title}</b><span style={{ fontSize: 12.5, color: T.muted }}>{sub}</span></span>
    </label>
  )
  return (
    <Card title="Parts already on the rigs when you joined" subtitle="Set once. Applies to what is counted from now on.">
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {opt('charge', 'Charge them to the metres', "At today's catalogue rate, by how worn they were. Cost a metre is true from day one.")}
        {opt('paid', 'Treat them as already paid', 'They cost nothing a metre. Cost a metre starts with what you buy from now on.')}
      </div>
    </Card>
  )
}
