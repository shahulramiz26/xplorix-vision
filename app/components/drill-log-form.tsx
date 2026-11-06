'use client'

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2, Paperclip, Upload, ShieldCheck, ShieldAlert, OctagonX, Compass } from 'lucide-react'
import {
  useCosting, uid, nowStamp, shiftOrder, isOwnStop, HOLE_SIZES, LITHOLOGIES,
  type ShiftLog, type ShiftName, type DowntimeLine,
} from '../../lib/costing-store'
import { useInventory, rigHoldings, TODAY } from '../../lib/inventory-store'
import { equipment as EQUIPMENT, incidentTypes, severityTypes } from '../../lib/mock-data'
import { projectHoles } from '../../lib/projects'
import { checkShift, describeChanges, type LogCheck } from '../../lib/log-checks'
import { T, tint, Btn, Seg, inputStyle, num as figure } from './kit'
import { SURVEY_TOOLS } from '../../lib/survey'

/* ==========================================================================
 * THE DRILL LOG FORM
 *
 * One form, used everywhere a shift is written: the Company Admin's Logs
 * screen, the supervisor's login and the contractor's login. One submission
 * per rig per shift. Everything downstream (cost per metre, hole status, the
 * client's invoice, the forecast) is worked out from what is entered here.
 *
 * The sections follow the order a shift is told in: who and when, what was
 * drilled, whether the hole was finished, what stopped the rig, what was
 * used, and anything that went wrong.
 *
 * The contractor's version leaves out bit usage and accessories, and does not
 * insist on fuel: those are his own stock and his own cost. Everything the
 * client pays on is the same.
 * ========================================================================== */

export const INTERNAL_REASONS = [
  'Mechanical Breakdown', 'Hydraulic Issue', 'Electrical Fault', 'Bit Change', 'Rod Change',
  'Rig Move', 'Hole Problem', 'Fuel Shortage', 'Operator Delay', 'Crew Shortage', 'Other internal',
]
export const CLIENT_REASONS = [
  'Waiting for Instruction', 'Geologist Standby', 'Site Access Issue', 'Water Shortage',
  'Weather Condition', 'Permit Pending', 'Safety Hold', 'Other client',
]
const FORMATIONS = ['Soft Formation', 'Medium Formation', 'Hard Formation', 'Very Hard Formation']

/* What a login may log against: a project, the rigs on it that are theirs,
 * and the people to choose from. */
export interface LogScope {
  project: string
  rigs: string[]
  supervisors: string[]
  drillers: string[]
  workOrderId?: string
}

let seq = 0
const rid = () => `row${Date.now()}_${++seq}`
const num = (v: string) => (v.trim() === '' ? 0 : parseFloat(v) || 0)
const r2 = (n: number) => Math.round(n * 100) / 100
const str = (n: number | undefined) => (n == null || Number.isNaN(n) ? '' : String(n))

// ── small pieces ──────────────────────────────────────────────────────────

function Panel({ title, right, children, hint }: { title?: ReactNode; right?: ReactNode; children: ReactNode; hint?: string }) {
  return (
    <section style={{ border: `1px solid ${T.border}`, borderRadius: 10, background: T.card, padding: '18px 20px' }}>
      {(title || right) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{title}</div>
            {hint && <div style={{ fontSize: 12, color: T.faint, marginTop: 3, lineHeight: 1.5 }}>{hint}</div>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  )
}
function L({ label, req, hint, children }: { label: string; req?: boolean; hint?: ReactNode; children: ReactNode }) {
  return (
    <label style={{ display: 'block', minWidth: 0 }}>
      <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: T.muted, marginBottom: 6 }}>{label}{req && <span style={{ color: T.orange }}> *</span>}</span>
      {children}
      {hint && <span style={{ display: 'block', fontSize: 11.5, color: T.faint, marginTop: 5, lineHeight: 1.45 }}>{hint}</span>}
    </label>
  )
}
const grid = (min: number, gap = 14): React.CSSProperties => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap })
const sel: React.CSSProperties = { ...inputStyle, cursor: 'pointer' }
const numIn: React.CSSProperties = { ...inputStyle, fontVariantNumeric: 'tabular-nums' }
const off: React.CSSProperties = { opacity: 0.6 }

function AddBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: T.orange, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
      <Plus size={14} /> Add
    </button>
  )
}
function Bin({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} style={{ background: 'none', border: 'none', color: T.red, cursor: 'pointer', padding: 8, lineHeight: 0, flexShrink: 0 }}>
      <Trash2 size={15} />
    </button>
  )
}
function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{label}</div>
        <div style={{ fontSize: 12, color: T.faint, marginTop: 3, lineHeight: 1.45 }}>{hint}</div>
      </div>
      <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} style={{
        width: 44, height: 24, borderRadius: 10, flexShrink: 0, cursor: 'pointer', border: 'none', padding: 0,
        position: 'relative', background: on ? T.orange : 'var(--x-border3)', transition: 'background 0.15s',
      }}>
        <span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
      </button>
    </div>
  )
}
function RowNo({ n }: { n: number }) {
  return <span style={{ width: 22, fontSize: 12.5, color: T.faint, fontVariantNumeric: 'tabular-nums', flexShrink: 0, paddingTop: 10 }}>{n}.</span>
}

// ── the form's own state ──────────────────────────────────────────────────

interface DownRow { id: string; reason: string; side: 'internal' | 'client'; hours: string }
interface BitRow { id: string; itemId: string; serial: string; mStart: string; mEnd: string; replaced: boolean; notes: string }
interface EquipRow { id: string; name: string; hours: string }
interface AccRow { id: string; itemId: string; qty: string }
interface IncidentRow { id: string; type: string; severity: string; note: string }
interface SurveyRow { id: string; depth: string; az: string; dip: string; tool: string }

interface F {
  shiftHours: number; standby: boolean; standbyReason: string
  project: string; rig: string; date: string; shift: '' | ShiftName; supervisor: string; driller: string; crew: string
  drill: string; down: string; hmr: string; engHours: string
  hole: string; size: string; mStart: string; mEnd: string; core: string; formation: string; lithology: string
  closed: boolean
  nhHole: string; nhSize: string; nhStarted: boolean; nhStart: string; nhEnd: string; nhCore: string; nhFormation: string; nhLithology: string
  downRows: DownRow[]; bits: BitRow[]; equip: EquipRow[]; acc: AccRow[]; incidents: IncidentRow[]
  fuel: string; water: string; additives: string
  files: string[]; notes: string
  surveys: SurveyRow[]
}

function fromLog(l: ShiftLog | undefined, scopes: LogScope[], start: Partial<Pick<F, 'project' | 'rig' | 'date' | 'shift' | 'supervisor'>>): F {
  const one = scopes.length === 1 ? scopes[0] : undefined
  const project = l?.project ?? start.project ?? one?.project ?? ''
  const sc = scopes.find(s => s.project === project)
  const lines: DowntimeLine[] = l?.downtime?.length ? l.downtime
    : l && l.downtimeHours > 0 ? [{ reason: l.downtimeReason, side: isOwnStop(l) ? 'internal' : 'client', hours: l.downtimeHours }] : []
  const n = l?.nextHole
  return {
    shiftHours: l?.shiftHours === 10 ? 10 : 12, standby: !!l?.standbyMode,
    standbyReason: l?.standbyMode ? (lines[0]?.reason ?? '') : '',
    project, rig: l?.rig ?? start.rig ?? (sc && sc.rigs.length === 1 ? sc.rigs[0] : ''),
    date: l?.date ?? start.date ?? TODAY, shift: l?.shift ?? start.shift ?? '',
    supervisor: l?.supervisor ?? start.supervisor ?? '', driller: l?.driller ?? '', crew: l ? str(l.crewCount) : '',
    drill: l ? str(l.drillingHours) : '', down: l ? str(l.downtimeHours) : '', hmr: str(l?.engineHmr), engHours: str(l?.engineHours),
    hole: l?.holeNumber ?? '', size: l?.holeSize ?? '', mStart: str(l?.meterStart), mEnd: str(l?.meterEnd),
    core: l ? str(l.coreRecovery) : '', formation: l?.formationType ?? '', lithology: l?.lithology ?? '',
    closed: !!l?.holeClosedThisShift,
    nhHole: n?.holeNumber ?? '', nhSize: n?.holeSize ?? '', nhStarted: !!n?.started, nhStart: str(n?.meterStart), nhEnd: str(n?.meterEnd), nhCore: str(n?.coreRecovery),
    nhFormation: n?.formationType ?? '', nhLithology: n?.lithology ?? '',
    downRows: l?.standbyMode ? [] : lines.map(d => ({ id: rid(), reason: d.reason, side: d.side, hours: str(d.hours) })),
    bits: (l?.bitRuns ?? []).map(b => ({ id: rid(), itemId: b.itemId, serial: b.serialNo ?? '', mStart: str(b.meterStart), mEnd: str(b.meterEnd), replaced: b.replaced, notes: b.notes ?? '' })),
    equip: (l?.equipmentUsed ?? []).map(e => ({ id: rid(), name: e.name, hours: str(e.hours) })),
    acc: (l?.partsUsed ?? []).filter(p => !(l?.bitRuns ?? []).some(b => b.itemId === p.itemId && b.replaced)).map(p => ({ id: rid(), itemId: p.itemId, qty: str(p.qty) })),
    incidents: (l?.incidents ?? []).map(i => ({ id: rid(), ...i })),
    fuel: l ? str(l.fuelLitres) : '', water: l ? str(l.waterLitres) : '', additives: l ? str(l.additivesKg) : '',
    files: l?.attachments ?? [], notes: l?.notes ?? '',
    surveys: (l?.surveys ?? []).map(x => ({ id: rid(), depth: str(x.depth), az: str(x.azimuth), dip: str(x.dip), tool: x.tool ?? '' })),
  }
}

// ── the form ──────────────────────────────────────────────────────────────

export function DrillLogForm({ variant, scopes, existing, start = {}, lockSupervisor, by, skipReportId, submitLabel, onSubmit, onCancel, top }: {
  variant: 'own' | 'contractor'
  scopes: LogScope[]
  existing?: ShiftLog
  start?: Partial<Pick<F, 'project' | 'rig' | 'date' | 'shift' | 'supervisor'>>
  lockSupervisor?: string
  by: string
  skipReportId?: string
  submitLabel: string
  onSubmit: (log: ShiftLog) => void
  onCancel?: () => void
  top?: ReactNode
}) {
  const { state } = useCosting()
  const { state: inv } = useInventory()
  const [f, setF] = useState<F>(() => fromLog(existing, scopes, { ...start, supervisor: lockSupervisor ?? start.supervisor }))
  const [tried, setTried] = useState(false)
  // The reason given for each warning, by the warning's id.
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const fileInput = useRef<HTMLInputElement>(null)
  const u = (p: Partial<F>) => setF(x => ({ ...x, ...p }))
  const contractor = variant === 'contractor'

  /* What is being edited can arrive after the first paint (the record is read
   * from the browser once the page has loaded), so the form is refilled when
   * it does. */
  const loadedFor = useRef(existing?.id)
  useEffect(() => {
    if (existing?.id === loadedFor.current) return
    loadedFor.current = existing?.id
    setF(fromLog(existing, scopes, { ...start, supervisor: lockSupervisor ?? start.supervisor }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id])

  const scope = scopes.find(s => s.project === f.project)
  const rigs = scope?.rigs ?? []
  // A project or rig that is no longer in scope is dropped rather than kept.
  useEffect(() => {
    if (f.project && !scope) u({ project: scopes.length === 1 ? scopes[0].project : '', rig: '' })
    else if (scope && f.rig && !rigs.includes(f.rig)) u({ rig: rigs.length === 1 ? rigs[0] : '' })
    else if (scope && !f.rig && rigs.length === 1) u({ rig: rigs[0] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.project, scope?.project, rigs.join('|')])
  useEffect(() => { if (lockSupervisor && f.supervisor !== lockSupervisor) u({ supervisor: lockSupervisor }) }, [lockSupervisor, f.supervisor])

  // ── holes on the project ────────────────────────────────────────────────
  const holes = useMemo(() => {
    if (!f.project) return { open: [] as string[], closed: [] as string[] }
    const all = projectHoles(state, f.project)
    /* A contractor is offered his own open holes and the ones on the plan
     * that nobody has started; a hole another rig is on is not his. */
    const mineIds = new Set<string>()
    if (contractor && scope?.workOrderId) {
      state.shiftLogs.forEach(l => { if (l.workOrderId === scope.workOrderId && l.holeNumber) mineIds.add(l.holeNumber) })
      state.contractorReports.forEach(r => { if (r.workOrderId === scope.workOrderId && r.holeNumber) mineIds.add(r.holeNumber) })
    }
    const ok = (id: string, planned: boolean) => !contractor || mineIds.has(id) || planned
    return {
      open: all.filter(h => (h.status === 'planned' || h.status === 'drilling') && ok(h.id, h.status === 'planned')).map(h => h.id),
      closed: all.filter(h => h.status !== 'planned' && h.status !== 'drilling' && ok(h.id, false)).map(h => h.id),
    }
  }, [state, f.project, contractor, scope?.workOrderId])

  /* Where a hole stood when this shift began: every checked metre before it,
   * and for a contractor the metres he has sent that are still waiting. */
  const standsAt = (hole: string) => {
    if (!hole || !f.date || !f.shift) return 0
    const before = shiftOrder({ date: f.date, shift: f.shift })
    const inRecord = state.shiftLogs
      .filter(l => l.holeNumber === hole && l.id !== existing?.id && (!existing || l.segmentOf !== existing.id) && shiftOrder(l) < before)
      .reduce((s, l) => s + l.metresDrilled, 0)
    const waiting = contractor ? state.contractorReports
      .filter(r => r.status === 'waiting' && r.holeNumber === hole && r.id !== skipReportId && shiftOrder(r) < before)
      .reduce((s, r) => s + r.metres, 0) : 0
    return r2(inRecord + waiting)
  }
  const stands = standsAt(f.hole)
  /* The size a hole is being drilled at: what the last shift on it used, or
   * what the plan says, or the project's usual size. */
  const sizeOfHole = (hole: string) => {
    const last = [...state.shiftLogs].filter(l => l.holeNumber === hole && l.holeSize).sort((a, b) => shiftOrder(b).localeCompare(shiftOrder(a)))[0]
    const size = last?.holeSize || state.holePlans?.[hole]?.holeSize || state.projects.find(p => p.name === f.project)?.holeSize || ''
    return HOLE_SIZES.includes(size) ? size : ''
  }
  // Choosing a hole starts the shift where the record stands.
  const lastHole = useRef(f.hole)
  useEffect(() => {
    if (f.hole === lastHole.current && f.mStart !== '') return
    lastHole.current = f.hole
    if (f.hole) u({ mStart: String(stands), ...(f.size ? {} : { size: sizeOfHole(f.hole) }) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.hole, stands])
  // A new hole opened in the same shift takes its size the same way.
  useEffect(() => {
    if (f.nhHole && !f.nhSize) u({ nhSize: sizeOfHole(f.nhHole) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.nhHole])

  // ── parts this rig is carrying, for bits and accessories ────────────────
  const parts = useMemo(() => {
    if (contractor || !f.rig || !f.project) return []
    const used: { itemId: string; qty: number }[] = []
    state.shiftLogs.filter(l => l.rig === f.rig && l.project === f.project && l.id !== existing?.id)
      .forEach(l => (l.partsUsed ?? []).forEach(p => used.push({ itemId: p.itemId, qty: p.qty ?? 0 })))
    return rigHoldings(inv.pos, inv.catalogue, f.rig, f.project, used, inv.rigKit)
  }, [contractor, f.rig, f.project, state.shiftLogs, inv, existing?.id])
  const bitParts = parts.filter(p => p.category === 'Bit')
  const accParts = parts.filter(p => p.category !== 'Bit')

  // ── figures ─────────────────────────────────────────────────────────────
  const mStart = num(f.mStart), mEnd = f.mEnd.trim() === '' ? mStart : num(f.mEnd)
  const metres = f.standby ? 0 : r2(mEnd - mStart)
  const core = f.standby ? 0 : num(f.core)
  const drill = f.standby ? 0 : num(f.drill)
  const down = f.standby ? f.shiftHours : num(f.down)
  const rowsSum = r2(f.downRows.reduce((s, r) => s + num(r.hours), 0))
  const nhMetres = r2(num(f.nhEnd) - num(f.nhStart))
  const blank = (v: string) => v.trim() === ''

  const duplicate = !!f.rig && !!f.date && !!f.shift && (
    state.shiftLogs.some(l => l.id !== existing?.id && !l.segmentOf && l.rig === f.rig && l.date === f.date && l.shift === f.shift)
    || (contractor && state.contractorReports.some(r => r.id !== skipReportId && r.rig === f.rig && r.date === f.date && r.shift === f.shift)))

  const problems: string[] = []
  if (!f.project) problems.push('Choose the project.')
  if (!f.rig) problems.push('Choose the rig.')
  if (!f.date) problems.push('Choose the shift date.')
  else if (f.date > TODAY) problems.push('The shift date is in the future.')
  if (!f.shift) problems.push('Choose the shift.')
  if (blank(f.supervisor)) problems.push('Enter the supervisor.')
  if (blank(f.driller)) problems.push('Enter the driller.')
  if (!(num(f.crew) > 0)) problems.push('Enter the crew count.')
  if (duplicate) problems.push(`A ${String(f.shift).toLowerCase()} shift for ${f.rig} on this date is already logged. Open that log to change it.`)
  if (f.standby) {
    if (!f.standbyReason) problems.push('Choose why the rig is on standby.')
  } else {
    if (blank(f.drill)) problems.push('Enter the drilling hours.')
    if (blank(f.down)) problems.push('Enter the downtime hours (0 if there were none).')
    if (!blank(f.drill) && !blank(f.down) && Math.abs(drill + down - f.shiftHours) > 0.01) problems.push(`Drilling ${drill} h plus downtime ${down} h does not add up to the ${f.shiftHours} h shift.`)
    if (!f.hole) problems.push('Choose the hole.')
    if (!f.size) problems.push('Choose the hole or bit size.')
    if (blank(f.mStart) || blank(f.mEnd)) problems.push('Enter the meter start and meter end (the same figure if nothing was drilled).')
    if (metres < 0) problems.push('Meter end is less than meter start.')
    if (blank(f.core)) problems.push('Enter the core recovery (0 if none).')
    if (core > metres + 0.001) problems.push('Core recovered cannot be more than the metres drilled.')
    if (!f.formation) problems.push('Choose the formation type.')
    if (down > 0 && f.downRows.length === 0) problems.push('Add the downtime reasons. They decide whether the hours are billable.')
    if (f.downRows.some(r => !r.reason || !(num(r.hours) > 0))) problems.push('Every downtime line needs a reason and its hours.')
    if (f.downRows.length > 0 && Math.abs(rowsSum - down) > 0.01) problems.push(`The downtime lines add up to ${rowsSum} h, but downtime hours is ${down} h.`)
    if (f.closed) {
      if (!f.nhHole && f.nhStarted) problems.push('Choose the new hole number.')
      if (f.nhHole && f.nhHole === f.hole) problems.push('The new hole is the same as the hole that was closed.')
      if (f.nhHole && !f.nhSize) problems.push('Choose the size of the new hole.')
      if (f.nhStarted && !(nhMetres > 0)) problems.push('Enter the meter start and end on the new hole.')
      if (f.nhStarted && blank(f.nhCore)) problems.push('Enter the core recovery on the new hole (0 if none).')
      if (f.nhStarted && num(f.nhCore) > nhMetres + 0.001) problems.push('Core recovered on the new hole cannot be more than the metres drilled on it.')
      if (f.nhStarted && !f.nhFormation) problems.push('Choose the formation on the new hole.')
    }
    if (f.bits.some(b => !b.itemId)) problems.push('Choose the bit on every bit usage line, or remove the line.')
    if (f.acc.some(a => !a.itemId || !(num(a.qty) > 0))) problems.push('Every accessory line needs the item and a quantity.')
  }
  if (!contractor && blank(f.fuel)) problems.push('Enter the fuel used (0 if none).')
  if (blank(f.water)) problems.push('Enter the water used (0 if none).')
  if (blank(f.additives)) problems.push('Enter the additives used (0 if none).')
  if (f.equip.some(e => !e.name || !(num(e.hours) > 0))) problems.push('Every equipment line needs the equipment and its hours.')
  if (f.incidents.some(i => !i.type || !i.severity)) problems.push('Every incident needs a type and a severity.')
  if (!contractor && !f.standby) {
    const deepest = Math.max(mEnd, f.closed && f.nhStarted ? num(f.nhEnd) : 0)
    f.surveys.forEach((x, i) => {
      const d = parseFloat(x.depth), a = parseFloat(x.az), p = parseFloat(x.dip)
      if (!(d >= 0)) problems.push(`Survey reading ${i + 1}: enter the depth.`)
      else if (deepest > 0 && d > deepest + 0.5) problems.push(`Survey reading ${i + 1}: ${d} m is deeper than the hole at the end of the shift.`)
      if (!(a >= 0 && a <= 360)) problems.push(`Survey reading ${i + 1}: azimuth is 0 to 360.`)
      if (!(p >= -90 && p <= 90)) problems.push(`Survey reading ${i + 1}: dip is −90 (straight down) to 90.`)
    })
  }

  /* The shift as it would be saved. Built the same way for the checks as
   * the typing goes on, and for the save itself. */
  const build = (): ShiftLog => {
    const lines: DowntimeLine[] = f.standby
      ? [{ reason: f.standbyReason, side: 'client', hours: f.shiftHours }]
      : f.downRows.map(r => ({ reason: r.reason, side: r.side, hours: num(r.hours) }))
    const main = [...lines].sort((a, b) => b.hours - a.hours)[0]
    const internal = lines.filter(l => l.side === 'internal').reduce((s, l) => s + l.hours, 0)
    const client = lines.filter(l => l.side === 'client').reduce((s, l) => s + l.hours, 0)
    const bits = f.standby ? [] : f.bits.map(b => ({ itemId: b.itemId, serialNo: b.serial.trim() || undefined, meterStart: num(b.mStart), meterEnd: num(b.mEnd), replaced: b.replaced, notes: b.notes.trim() || undefined }))
    const log: ShiftLog = {
      ...(existing ?? {}),
      id: existing?.id ?? uid('sl'),
      rig: f.rig, project: f.project, date: f.date, shift: f.shift as ShiftName,
      holeNumber: f.standby ? null : f.hole || null,
      crewCount: num(f.crew), shiftHours: f.shiftHours,
      drillingHours: drill, downtimeHours: down,
      downtimeReason: main?.reason ?? '', downtimeSide: lines.length ? (internal >= client && internal > 0 ? 'internal' : 'client') : undefined,
      downtime: lines,
      metresDrilled: metres, coreRecovery: core,
      holeSize: f.size || existing?.holeSize || 'HQ', formationType: f.standby ? '' : f.formation, lithology: f.standby ? undefined : f.lithology || undefined,
      meterStart: f.standby ? undefined : mStart, meterEnd: f.standby ? undefined : mEnd,
      holeClosedThisShift: !f.standby && f.closed ? true : undefined,
      nextHole: !f.standby && f.closed && f.nhHole ? {
        holeNumber: f.nhHole, holeSize: f.nhSize, started: f.nhStarted,
        meterStart: f.nhStarted ? num(f.nhStart) : 0, meterEnd: f.nhStarted ? num(f.nhEnd) : 0, coreRecovery: f.nhStarted ? num(f.nhCore) : 0,
        formationType: f.nhStarted ? f.nhFormation : '', lithology: f.nhStarted ? f.nhLithology || undefined : undefined,
      } : undefined,
      engineHmr: blank(f.hmr) ? undefined : num(f.hmr), engineHours: blank(f.engHours) ? undefined : num(f.engHours),
      standbyMode: f.standby || undefined,
      bitRuns: contractor ? undefined : bits,
      partsUsed: contractor || f.standby ? [] : [
        ...f.acc.map(a => ({ itemId: a.itemId, qty: num(a.qty) })),
        // A bit only counts as used up when it was changed out.
        ...bits.filter(b => b.replaced).map(b => ({ itemId: b.itemId, qty: 1, metres: b.meterEnd - b.meterStart || undefined, note: b.notes })),
      ],
      equipmentUsed: f.equip.map(e => ({ name: e.name, hours: num(e.hours) })),
      incidents: f.incidents.map(i => ({ type: i.type, severity: i.severity, note: i.note.trim() })),
      attachments: f.files, notes: f.notes.trim() || undefined,
      surveys: contractor || f.standby || !f.surveys.length ? undefined : f.surveys.map(x => ({ depth: r2(num(x.depth)), azimuth: num(x.az), dip: num(x.dip), tool: x.tool || undefined })),
      fuelLitres: num(f.fuel), waterLitres: num(f.water), additivesKg: num(f.additives),
      supervisor: f.supervisor.trim(), driller: f.driller.trim(),
      loggedBy: existing?.loggedBy ?? by, loggedAt: existing?.loggedAt ?? nowStamp(),
      ...(existing ? { editedBy: by, editedAt: nowStamp() } : {}),
    }
    return log
  }

  // ── the drill log checks ────────────────────────────────────────────────
  /* Metres a contractor has sent on the hole that are still waiting for the
   * site check: they are in the hole, just not accepted yet. */
  const pendingOnHole = (() => {
    if (!contractor || !f.hole || !f.date || !f.shift) return 0
    const before = shiftOrder({ date: f.date, shift: f.shift })
    return r2(state.contractorReports
      .filter(r => r.status === 'waiting' && r.holeNumber === f.hole && r.id !== skipReportId && shiftOrder(r) < before)
      .reduce((s, r) => s + r.metres, 0))
  })()
  const ready = !!f.rig && !!f.date && !!f.shift
  const checks: LogCheck[] = useMemo(() => ready
    ? checkShift(state, build(), { pendingOnHole, isNew: !existing, contractor, before: existing })
    : [],
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [f, state, ready, pendingOnHole, existing?.id, contractor])
  const stops = checks.filter(c => c.level === 'stop')
  const warns = checks.filter(c => c.level === 'warn')
  const unexplained = warns.filter(w => !(reasons[w.id] ?? '').trim())

  const submit = () => {
    setTried(true)
    if (problems.length || stops.length || unexplained.length) return
    const log = build()
    log.trust = { checkedAt: nowStamp(), by, warnings: warns.map(w => ({ id: w.id, title: w.title, reason: (reasons[w.id] ?? '').trim() })) }
    if (existing) {
      const changes = describeChanges(existing, log)
      if (changes.length) log.history = [...(existing.history ?? []), { at: nowStamp(), by, changes, reason: (reasons['edit-after-approval'] ?? '').trim() || undefined }]
    }
    onSubmit(log)
  }

  const people = (list: string[], id: string) => contractor
    ? <datalist id={id}>{Array.from(new Set(list)).map(n => <option key={n} value={n} />)}</datalist> : null
  const holeOptions = (value: string, exclude?: string) => (
    <>
      <option value="">{holes.open.length + holes.closed.length ? 'Select hole…' : 'No holes available yet'}</option>
      {holes.open.filter(h => h !== exclude).length > 0 && <optgroup label="Open holes">{holes.open.filter(h => h !== exclude).map(h => <option key={h} value={h}>{h}</option>)}</optgroup>}
      {holes.closed.length > 0 && !exclude && <optgroup label="Closed holes">{holes.closed.map(h => <option key={h} value={h}>{h}</option>)}</optgroup>}
      {value && !holes.open.includes(value) && !holes.closed.includes(value) && <option value={value}>{value}</option>}
    </>
  )

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {top}

      {/* ── basic shift details ─────────────────────────────────────────── */}
      <Panel title="Basic Shift Details"
        right={<Seg<string> value={String(f.shiftHours)} onChange={v => u({ shiftHours: Number(v) })} options={[{ value: '10', label: '10h' }, { value: '12', label: '12h' }]} />}>
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ padding: '12px 14px', borderRadius: 10, border: `1px solid ${f.standby ? tint(T.orange, 45) : T.border}`, background: f.standby ? tint(T.orange, 6) : T.bg }}>
            <Toggle on={f.standby} onChange={v => u({ standby: v })} label="Standby Mode"
              hint="Enable if operations are on hold. Drilling fields are hidden and the downtime is set to Client." />
          </div>
          <div style={grid(170)}>
            <L label="Project" req>
              <select value={f.project} onChange={e => u({ project: e.target.value, rig: '', hole: '', nhHole: '' })} style={sel}>
                <option value="">Select project…</option>
                {scopes.map(s => <option key={s.project} value={s.project}>{s.project}</option>)}
              </select>
            </L>
            <L label="Rig" req>
              <select value={f.rig} disabled={!f.project} onChange={e => u({ rig: e.target.value })} style={{ ...sel, ...(f.project ? {} : off) }}>
                <option value="">{f.project ? 'Select rig…' : 'Select a project first'}</option>
                {rigs.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </L>
            <L label="Shift Date" req><input type="date" value={f.date} max={TODAY} onChange={e => u({ date: e.target.value })} style={inputStyle} /></L>
            <L label="Shift" req>
              <select value={f.shift} onChange={e => u({ shift: e.target.value as F['shift'] })} style={sel}>
                <option value="">Select shift…</option><option value="Day">Day</option><option value="Night">Night</option>
              </select>
            </L>
          </div>
          <div style={{ ...grid(170), paddingTop: 16, borderTop: `1px solid ${T.line}` }}>
            <L label="Supervisor" req>
              {lockSupervisor ? <input value={lockSupervisor} readOnly style={{ ...inputStyle, ...off }} />
                : contractor ? <input value={f.supervisor} onChange={e => u({ supervisor: e.target.value })} placeholder="Your supervisor on site" list="dl-sup" style={inputStyle} />
                : (
                  <select value={f.supervisor} onChange={e => u({ supervisor: e.target.value })} style={sel}>
                    <option value="">Select supervisor…</option>
                    {Array.from(new Set([...(scope?.supervisors ?? []), ...(f.supervisor ? [f.supervisor] : [])])).map(n => <option key={n}>{n}</option>)}
                  </select>
                )}
              {people(state.shiftLogs.filter(l => l.workOrderId === scope?.workOrderId).map(l => l.supervisor ?? '').filter(Boolean), 'dl-sup')}
            </L>
            <L label="Driller" req>
              {contractor ? <input value={f.driller} onChange={e => u({ driller: e.target.value })} placeholder="Driller on this shift" list="dl-drl" style={inputStyle} />
                : (
                  <select value={f.driller} onChange={e => u({ driller: e.target.value })} style={sel}>
                    <option value="">Select driller…</option>
                    {Array.from(new Set([...(scope?.drillers ?? []), ...(f.driller ? [f.driller] : [])])).map(n => <option key={n}>{n}</option>)}
                  </select>
                )}
              {people(state.shiftLogs.filter(l => l.workOrderId === scope?.workOrderId).map(l => l.driller ?? '').filter(Boolean), 'dl-drl')}
            </L>
            <L label="Crew Count" req><input type="number" min={0} value={f.crew} onChange={e => u({ crew: e.target.value })} placeholder="0" style={numIn} /></L>
          </div>
          {f.standby && (
            <div style={grid(220)}>
              <L label="Reason for standby" req hint={`The whole ${f.shiftHours} h shift is recorded as standby, on the client.`}>
                <select value={f.standbyReason} onChange={e => u({ standbyReason: e.target.value })} style={sel}>
                  <option value="">Select reason…</option>{CLIENT_REASONS.map(r => <option key={r}>{r}</option>)}
                </select>
              </L>
              <L label="Engine HMR"><input type="number" value={f.hmr} onChange={e => u({ hmr: e.target.value })} placeholder="0" style={numIn} /></L>
              <L label="Engine Hours"><input type="number" value={f.engHours} onChange={e => u({ engHours: e.target.value })} placeholder="0" style={numIn} /></L>
            </div>
          )}
        </div>
      </Panel>

      {!f.standby && (
        <>
          {/* ── operation details ──────────────────────────────────────── */}
          <Panel title="Operation Details">
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={grid(220)}>
                <L label="Drilling Hours" req><input type="number" min={0} value={f.drill} onChange={e => u({ drill: e.target.value })} placeholder="0" style={numIn} /></L>
                <L label="Downtime Hours" req><input type="number" min={0} value={f.down} onChange={e => u({ down: e.target.value })} placeholder="0" style={numIn} /></L>
              </div>
              <div style={grid(220)}>
                <L label="Engine HMR" hint="The engine's hour-meter reading at the end of the shift."><input type="number" min={0} value={f.hmr} onChange={e => u({ hmr: e.target.value })} placeholder="0" style={numIn} /></L>
                <L label="Engine Hours"><input type="number" min={0} value={f.engHours} onChange={e => u({ engHours: e.target.value })} placeholder="0" style={numIn} /></L>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
                <L label="Hole" req hint={contractor ? 'Your open holes, and holes on the plan that are not started.' : 'Holes are managed in Projects, on the project’s Holes tab.'}>
                  <select value={f.hole} disabled={!f.project} onChange={e => u({ hole: e.target.value })} style={sel}>{holeOptions(f.hole)}</select>
                </L>
                <L label="Hole / Bit Size" req>
                  <select value={f.size} onChange={e => u({ size: e.target.value })} style={sel}>
                    <option value="">Select hole/bit size…</option>{HOLE_SIZES.map(h => <option key={h}>{h}</option>)}
                  </select>
                </L>
                <L label="Meter Start (m)" req hint={f.hole && !blank(f.mStart) && Math.abs(mStart - stands) > 0.05 ? `The record for ${f.hole} stands at ${stands} m.` : undefined}>
                  <input type="number" min={0} value={f.mStart} onChange={e => u({ mStart: e.target.value })} placeholder="0" style={numIn} />
                </L>
                <L label="Meter End (m)" req><input type="number" min={0} value={f.mEnd} onChange={e => u({ mEnd: e.target.value })} placeholder="0" style={numIn} /></L>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
                <L label="Meters Drilled (m)" hint="Calculated from start and end">
                  <input readOnly value={metres > 0 ? metres : ''} placeholder="0" style={{ ...numIn, ...off }} />
                </L>
                <L label="Core Recovery (m)" req hint={metres > 0 && core > 0 ? `${((core / metres) * 100).toFixed(0)}% recovery` : undefined}>
                  <input type="number" min={0} value={f.core} onChange={e => u({ core: e.target.value })} placeholder="0" style={numIn} />
                </L>
                <L label="Formation Type" req>
                  <select value={f.formation} onChange={e => u({ formation: e.target.value })} style={sel}>
                    <option value="">Select formation…</option>{FORMATIONS.map(x => <option key={x} value={x}>{x}</option>)}
                  </select>
                </L>
                <L label="Lithology Type">
                  <select value={f.lithology} onChange={e => u({ lithology: e.target.value })} style={sel}>
                    <option value="">Select lithology…</option>
                    {Array.from(new Set([...LITHOLOGIES, ...(f.lithology ? [f.lithology] : [])])).map(x => <option key={x}>{x}</option>)}
                  </select>
                </L>
              </div>
            </div>
          </Panel>

          {/* ── hole closed this shift ─────────────────────────────────── */}
          <Panel>
            <Toggle on={f.closed} onChange={v => u({ closed: v })} label="Hole Closed This Shift?"
              hint="Enable if this hole was completed. If a new hole was started in the same shift, enter it below." />
            {f.closed && (
              <div style={{ marginTop: 14, padding: '16px 16px', borderRadius: 10, border: `1px solid ${T.border}`, background: T.bg, display: 'grid', gap: 14 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: T.orange }}>New Hole Started This Shift</div>
                <div style={grid(220)}>
                  <L label="New Hole Number" hint="Leave empty if no new hole was opened this shift.">
                    <select value={f.nhHole} onChange={e => u({ nhHole: e.target.value, nhStart: e.target.value ? String(standsAt(e.target.value)) : '' })} style={sel}>{holeOptions(f.nhHole, f.hole)}</select>
                  </L>
                  <L label="Hole / Bit Size" req={!!f.nhHole}>
                    <select value={f.nhSize} disabled={!f.nhHole} onChange={e => u({ nhSize: e.target.value })} style={sel}>
                      <option value="">Select size…</option>{HOLE_SIZES.map(h => <option key={h}>{h}</option>)}
                    </select>
                  </L>
                </div>
                {f.nhHole && (
                  <div style={{ padding: '12px 14px', borderRadius: 10, border: `1px solid ${T.border}`, background: T.card }}>
                    <Toggle on={f.nhStarted} onChange={v => u({ nhStarted: v })} label="Started drilling in new hole?"
                      hint="Turn off if the new hole was opened but no meters were drilled yet." />
                  </div>
                )}
                {f.nhHole && f.nhStarted && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
                      <L label="Meter Start (m)" req><input type="number" min={0} value={f.nhStart} onChange={e => u({ nhStart: e.target.value })} placeholder="0" style={numIn} /></L>
                      <L label="Meter End (m)" req><input type="number" min={0} value={f.nhEnd} onChange={e => u({ nhEnd: e.target.value })} placeholder="0" style={numIn} /></L>
                      <L label="Meters Drilled (m)" hint="Calculated from start/end"><input readOnly value={nhMetres > 0 ? nhMetres : ''} placeholder="0" style={{ ...numIn, ...off }} /></L>
                      <L label="Core Recovery (m)" req hint={nhMetres > 0 && num(f.nhCore) > 0 ? `${((num(f.nhCore) / nhMetres) * 100).toFixed(0)}% recovery` : 'On the new hole only'}>
                        <input type="number" min={0} value={f.nhCore} onChange={e => u({ nhCore: e.target.value })} placeholder="0" style={numIn} />
                      </L>
                      <L label="Formation Type" req>
                        <select value={f.nhFormation} onChange={e => u({ nhFormation: e.target.value })} style={sel}>
                          <option value="">Select formation…</option>{FORMATIONS.map(x => <option key={x} value={x}>{x}</option>)}
                        </select>
                      </L>
                    </div>
                    <L label="Lithology">
                      <select value={f.nhLithology} onChange={e => u({ nhLithology: e.target.value })} style={sel}>
                        <option value="">Select lithology…</option>{LITHOLOGIES.map(x => <option key={x}>{x}</option>)}
                      </select>
                    </L>
                  </>
                )}
              </div>
            )}
          </Panel>

          {/* ── downtime reasons ───────────────────────────────────────── */}
          <Panel title={<span style={{ fontSize: 14 }}>Downtime Reasons</span>} right={<AddBtn onClick={() => u({ downRows: [...f.downRows, { id: rid(), reason: '', side: 'internal', hours: '' }] })} />}
            hint="Internal is your own stop and is never billable. Client is standby.">
            {f.downRows.length === 0 && <div style={{ fontSize: 13, color: T.faint }}>{down > 0 ? 'Add a line for each reason the rig was stopped.' : 'No downtime this shift.'}</div>}
            <div style={{ display: 'grid', gap: 10 }}>
              {f.downRows.map((r, i) => {
                const set = (p: Partial<DownRow>) => u({ downRows: f.downRows.map(x => x.id === r.id ? { ...x, ...p } : x) })
                return (
                  <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <RowNo n={i + 1} />
                    <div style={{ flex: '1 1 240px' }}>
                      <select value={r.reason} aria-label="Downtime reason" onChange={e => set({ reason: e.target.value })} style={sel}>
                        <option value="">Select reason</option>
                        {Array.from(new Set([...(r.side === 'internal' ? INTERNAL_REASONS : CLIENT_REASONS), ...(r.reason ? [r.reason] : [])])).map(x => <option key={x}>{x}</option>)}
                      </select>
                    </div>
                    <Seg<'internal' | 'client'> value={r.side} onChange={v => set({ side: v, reason: '' })} options={[{ value: 'internal', label: 'Internal' }, { value: 'client', label: 'Client' }]} />
                    <div style={{ width: 110 }}><input type="number" min={0} value={r.hours} aria-label="Hours" onChange={e => set({ hours: e.target.value })} placeholder="Hours" style={numIn} /></div>
                    <Bin label="Remove this reason" onClick={() => u({ downRows: f.downRows.filter(x => x.id !== r.id) })} />
                  </div>
                )
              })}
            </div>
          </Panel>

          {/* ── bit usage (own rigs only) ──────────────────────────────── */}
          {!contractor && (
            <Panel title={<span style={{ fontSize: 14 }}>Bit Usage</span>} right={<AddBtn onClick={() => u({ bits: [...f.bits, { id: rid(), itemId: '', serial: '', mStart: f.mStart, mEnd: f.mEnd, replaced: false, notes: '' }] })} />}>
              {f.bits.length === 0 && <div style={{ fontSize: 13, color: T.faint }}>No bit logged for this shift.</div>}
              <div style={{ display: 'grid', gap: 12 }}>
                {f.bits.map((b, i) => {
                  const set = (p: Partial<BitRow>) => u({ bits: f.bits.map(x => x.id === b.id ? { ...x, ...p } : x) })
                  const part = bitParts.find(p => p.itemId === b.itemId)
                  const run = num(b.mEnd) - num(b.mStart)
                  return (
                    <div key={b.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <RowNo n={i + 1} />
                      <div style={{ flex: 1, display: 'grid', gap: 9, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          <div style={{ flex: '1 1 260px' }}>
                            <select value={b.itemId} aria-label="Bit" onChange={e => set({ itemId: e.target.value })} style={sel}>
                              <option value="">{bitParts.length ? 'Select bit' : f.rig ? 'No bits on this rig' : 'Select a rig first'}</option>
                              {bitParts.map(p => <option key={p.itemId} value={p.itemId}>{p.partNumber ? `${p.partNumber} · ` : ''}{p.name} ({p.onRig} on rig)</option>)}
                              {b.itemId && !part && <option value={b.itemId}>{inv.catalogue.find(p => p.id === b.itemId)?.name ?? b.itemId}</option>}
                            </select>
                          </div>
                          <div style={{ flex: '0 1 220px' }}><input value={b.serial} aria-label="Serial number" onChange={e => set({ serial: e.target.value })} placeholder="Serial Number (optional)" style={{ ...inputStyle, fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }} /></div>
                          <Bin label="Remove this bit" onClick={() => u({ bits: f.bits.filter(x => x.id !== b.id) })} />
                        </div>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                          <div style={{ width: 140 }}><input type="number" value={b.mStart} aria-label="Bit meter start" onChange={e => set({ mStart: e.target.value })} placeholder="Meter Start" style={numIn} /></div>
                          <span style={{ fontSize: 12.5, color: T.faint }}>to</span>
                          <div style={{ width: 140 }}><input type="number" value={b.mEnd} aria-label="Bit meter end" onChange={e => set({ mEnd: e.target.value })} placeholder="Meter End" style={numIn} /></div>
                          <button type="button" onClick={() => set({ replaced: !b.replaced })} style={{
                            padding: '9px 14px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
                            background: b.replaced ? tint(T.orange, 12) : T.bg, border: `1px solid ${b.replaced ? tint(T.orange, 50) : T.border}`, color: b.replaced ? T.text : T.faint,
                          }}>{b.replaced ? 'Bit was replaced' : 'Not yet replaced'}</button>
                          {run > 0 && part && part.lifeMetres > 0 && <span style={{ fontSize: 12, color: T.faint }}>{run.toFixed(1)} m of its {part.lifeMetres} m life</span>}
                        </div>
                        <input value={b.notes} aria-label="Bit notes" onChange={e => set({ notes: e.target.value })} placeholder="Notes (optional)" style={inputStyle} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </Panel>
          )}
        </>
      )}

      {/* ── equipment ─────────────────────────────────────────────────────── */}
      <Panel title={<span style={{ fontSize: 14 }}>Equipment Used</span>} right={<AddBtn onClick={() => u({ equip: [...f.equip, { id: rid(), name: '', hours: '' }] })} />}>
        {f.equip.length === 0 && <div style={{ fontSize: 13, color: T.faint }}>No equipment added.</div>}
        <div style={{ display: 'grid', gap: 10 }}>
          {f.equip.map((e, i) => {
            const set = (p: Partial<EquipRow>) => u({ equip: f.equip.map(x => x.id === e.id ? { ...x, ...p } : x) })
            return (
              <div key={e.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <RowNo n={i + 1} />
                <div style={{ flex: 1 }}>
                  <select value={e.name} aria-label="Equipment" onChange={ev => set({ name: ev.target.value })} style={sel}>
                    <option value="">Select equipment</option>{EQUIPMENT.map(x => <option key={x}>{x}</option>)}
                  </select>
                </div>
                <div style={{ width: 110 }}><input type="number" min={0} value={e.hours} aria-label="Equipment hours" onChange={ev => set({ hours: ev.target.value })} placeholder="Hours" style={numIn} /></div>
                <Bin label="Remove this equipment" onClick={() => u({ equip: f.equip.filter(x => x.id !== e.id) })} />
              </div>
            )
          })}
        </div>
      </Panel>

      {/* ── consumables ───────────────────────────────────────────────────── */}
      <Panel title={<span style={{ fontSize: 14 }}>Consumables</span>} hint={contractor ? 'Fuel is optional: it is your own cost and is not used in what you are paid.' : undefined}>
        <div style={grid(170)}>
          <L label="Fuel (L)" req={!contractor}><input type="number" min={0} value={f.fuel} onChange={e => u({ fuel: e.target.value })} placeholder={contractor ? 'Optional' : '0'} style={numIn} /></L>
          <L label="Water (L)" req><input type="number" min={0} value={f.water} onChange={e => u({ water: e.target.value })} placeholder="0" style={numIn} /></L>
          <L label="Additives (kg)" req><input type="number" min={0} value={f.additives} onChange={e => u({ additives: e.target.value })} placeholder="0" style={numIn} /></L>
        </div>
      </Panel>

      {/* ── accessories (own rigs only) ───────────────────────────────────── */}
      {!contractor && !f.standby && (
        <Panel title={<span style={{ fontSize: 14 }}>Accessories</span>} right={<AddBtn onClick={() => u({ acc: [...f.acc, { id: rid(), itemId: '', qty: '' }] })} />}
          hint="What was used up this shift, from what this rig is carrying.">
          {f.acc.length === 0 && <div style={{ fontSize: 13, color: T.faint }}>No accessories added.</div>}
          <div style={{ display: 'grid', gap: 10 }}>
            {f.acc.map((a, i) => {
              const set = (p: Partial<AccRow>) => u({ acc: f.acc.map(x => x.id === a.id ? { ...x, ...p } : x) })
              const part = accParts.find(p => p.itemId === a.itemId)
              return (
                <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <RowNo n={i + 1} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <select value={a.itemId} aria-label="Accessory" onChange={e => set({ itemId: e.target.value })} style={sel}>
                      <option value="">{accParts.length ? 'Select accessory' : f.rig ? 'Nothing on this rig' : 'Select a rig first'}</option>
                      {accParts.map(p => <option key={p.itemId} value={p.itemId}>{p.partNumber ? `${p.partNumber} · ` : ''}{p.name} ({p.onRig} on rig)</option>)}
                      {a.itemId && !part && <option value={a.itemId}>{inv.catalogue.find(p => p.id === a.itemId)?.name ?? a.itemId}</option>}
                    </select>
                    {part && num(a.qty) > part.onRig && <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}><span aria-hidden style={{ color: T.amber, fontWeight: 800 }}>! </span>Only {part.onRig} on the rig.</div>}
                  </div>
                  <div style={{ width: 90 }}><input type="number" min={0} value={a.qty} aria-label="Quantity" onChange={e => set({ qty: e.target.value })} placeholder="Qty" style={numIn} /></div>
                  <Bin label="Remove this accessory" onClick={() => u({ acc: f.acc.filter(x => x.id !== a.id) })} />
                </div>
              )
            })}
          </div>
        </Panel>
      )}

      {/* ── downhole survey ──────────────────────────────────────────────── */}
      {!contractor && !f.standby && (
        <Panel title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14 }}><Compass size={15} style={{ color: T.faint }} /> Downhole survey</span>}
          hint="Only if a survey was taken this shift. Dip is the angle from flat, negative going down: −60 means 60° below flat. The office checks each reading before it draws the hole."
          right={<AddBtn onClick={() => u({ surveys: [...f.surveys, { id: rid(), depth: f.mEnd || '', az: f.surveys[f.surveys.length - 1]?.az ?? '', dip: f.surveys[f.surveys.length - 1]?.dip ?? '', tool: f.surveys[f.surveys.length - 1]?.tool ?? '' }] })} />}>
          {f.surveys.length === 0 && <div style={{ fontSize: 13, color: T.faint }}>No survey this shift.</div>}
          <div style={{ display: 'grid', gap: 10 }}>
            {f.surveys.map((x, i) => {
              const set = (p: Partial<SurveyRow>) => u({ surveys: f.surveys.map(y => y.id === x.id ? { ...y, ...p } : y) })
              return (
                <div key={x.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <RowNo n={i + 1} />
                  <div style={{ flex: '1 1 110px' }}><L label="Depth, m"><input type="number" value={x.depth} onChange={e => set({ depth: e.target.value })} style={numIn} aria-label={`Survey ${i + 1} depth`} /></L></div>
                  <div style={{ flex: '1 1 110px' }}><L label="Azimuth, °"><input type="number" value={x.az} onChange={e => set({ az: e.target.value })} placeholder="e.g. 60" style={numIn} aria-label={`Survey ${i + 1} azimuth`} /></L></div>
                  <div style={{ flex: '1 1 110px' }}><L label="Dip, °"><input type="number" value={x.dip} onChange={e => set({ dip: e.target.value })} placeholder="e.g. −60" style={numIn} aria-label={`Survey ${i + 1} dip`} /></L></div>
                  <div style={{ flex: '2 1 180px' }}><L label="Tool">
                    <select value={x.tool} onChange={e => set({ tool: e.target.value })} style={sel} aria-label={`Survey ${i + 1} tool`}>
                      <option value="">Not stated</option>{SURVEY_TOOLS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select></L></div>
                  <Bin label="Remove this survey reading" onClick={() => u({ surveys: f.surveys.filter(y => y.id !== x.id) })} />
                </div>
              )
            })}
          </div>
        </Panel>
      )}

      {/* ── incidents ─────────────────────────────────────────────────────── */}
      <Panel title={<span style={{ fontSize: 14 }}>Incidents</span>} right={<AddBtn onClick={() => u({ incidents: [...f.incidents, { id: rid(), type: '', severity: '', note: '' }] })} />}>
        {f.incidents.length === 0 && <div style={{ fontSize: 13, color: T.faint }}>No incidents this shift.</div>}
        <div style={{ display: 'grid', gap: 10 }}>
          {f.incidents.map((x, i) => {
            const set = (p: Partial<IncidentRow>) => u({ incidents: f.incidents.map(y => y.id === x.id ? { ...y, ...p } : y) })
            return (
              <div key={x.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <RowNo n={i + 1} />
                <div style={{ flex: '1 1 160px' }}>
                  <select value={x.type} aria-label="Incident type" onChange={e => set({ type: e.target.value })} style={sel}>
                    <option value="">Select type</option>{incidentTypes.map(t => <option key={t.value} value={t.label}>{t.label}</option>)}<option>Near miss</option>
                  </select>
                </div>
                <div style={{ flex: '0 1 150px' }}>
                  <select value={x.severity} aria-label="Severity" onChange={e => set({ severity: e.target.value })} style={sel}>
                    <option value="">Severity</option>{severityTypes.map(t => <option key={t.value} value={t.label}>{t.label}</option>)}
                  </select>
                </div>
                <div style={{ flex: '2 1 240px' }}><input value={x.note} aria-label="What happened" onChange={e => set({ note: e.target.value })} placeholder="What happened" style={inputStyle} /></div>
                <Bin label="Remove this incident" onClick={() => u({ incidents: f.incidents.filter(y => y.id !== x.id) })} />
              </div>
            )
          })}
        </div>
      </Panel>

      {/* ── attachments ───────────────────────────────────────────────────── */}
      <Panel title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14 }}><Paperclip size={15} style={{ color: T.faint }} /> Attachments</span>}
        right={<>
          <input ref={fileInput} type="file" multiple style={{ display: 'none' }} onChange={e => { u({ files: [...f.files, ...Array.from(e.target.files ?? []).map(x => x.name)] }); e.target.value = '' }} />
          <button type="button" onClick={() => fileInput.current?.click()} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 8, border: `1px solid ${tint(T.orange, 35)}`, background: tint(T.orange, 10), color: T.orange, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            <Upload size={14} /> Add Files
          </button>
        </>}>
        {f.files.length === 0 ? <div style={{ fontSize: 13, color: T.faint }}>No attachments added.</div> : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {f.files.map((name, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderRadius: 7, border: `1px solid ${T.border}`, fontSize: 12.5, color: T.muted }}>
                {name}
                <button type="button" aria-label={`Remove ${name}`} onClick={() => u({ files: f.files.filter((_, j) => j !== i) })} style={{ background: 'none', border: 'none', color: T.faint, cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>
              </span>
            ))}
          </div>
        )}
      </Panel>

      {/* ── notes ─────────────────────────────────────────────────────────── */}
      <Panel>
        <L label="Notes">
          <textarea value={f.notes} onChange={e => u({ notes: e.target.value })} rows={3} placeholder="Shift observations, issues encountered…" style={{ ...inputStyle, resize: 'vertical' }} />
        </L>
      </Panel>

      {ready && <ChecksPanel checks={checks} reasons={reasons} setReason={(id, v) => setReasons(r => ({ ...r, [id]: v }))} tried={tried} />}

      {tried && problems.length > 0 && (
        <div role="alert" style={{ padding: '12px 14px', borderRadius: 10, background: tint(T.amber, 8), border: `1px solid ${tint(T.amber, 36)}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 5 }}>Before this log can be saved</div>
          {problems.map((p, i) => <div key={i} style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.55 }}><span aria-hidden style={{ color: T.amber, fontWeight: 800, marginRight: 6 }}>!</span>{p}</div>)}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: onCancel ? '1fr 1fr' : '1fr', gap: 12 }}>
        {onCancel && <Btn onClick={onCancel}>Cancel</Btn>}
        <Btn kind="primary" onClick={submit}>{submitLabel}</Btn>
      </div>
    </div>
  )
}

/* ── what the checks say, as the shift is typed ───────────────────────────── */

function ChecksPanel({ checks, reasons, setReason, tried }: {
  checks: LogCheck[]; reasons: Record<string, string>; setReason: (id: string, v: string) => void; tried: boolean
}) {
  const stops = checks.filter(c => c.level === 'stop')
  const warns = checks.filter(c => c.level === 'warn')
  if (!checks.length) return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '12px 14px', borderRadius: 10, background: tint(T.green, 7), border: `1px solid ${tint(T.green, 30)}` }}>
      <ShieldCheck size={17} style={{ color: T.green, flexShrink: 0 }} />
      <div style={{ fontSize: 13, color: T.text }}><b>XPLORIX checks:</b> this shift agrees with the rest of the record.</div>
    </div>
  )
  return (
    <section aria-label="XPLORIX checks" style={{ border: `1px solid ${stops.length ? tint(T.red, 35) : tint(T.amber, 40)}`, borderRadius: 10, background: T.card, overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '13px 18px', background: stops.length ? tint(T.red, 6) : tint(T.amber, 7), borderBottom: `1px solid ${T.line}` }}>
        <ShieldAlert size={17} style={{ color: stops.length ? T.red : T.amber, flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>XPLORIX checks</div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
            {stops.length ? `${stops.length} to put right before saving` : ''}{stops.length && warns.length ? ' · ' : ''}{warns.length ? `${warns.length} unusual, saved with a reason` : ''}
          </div>
        </div>
      </div>
      {stops.map(c => (
        <div key={c.id} style={{ display: 'flex', gap: 10, padding: '12px 18px', borderTop: `1px solid ${T.line}` }}>
          <OctagonX size={15} style={{ color: T.red, flexShrink: 0, marginTop: 2 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text, lineHeight: 1.4 }}>{c.title}</div>
            {c.detail && <div style={{ fontSize: 12.5, color: T.muted, marginTop: 3, lineHeight: 1.5 }}>{c.detail}</div>}
          </div>
        </div>
      ))}
      {warns.map(c => {
        const missing = tried && !(reasons[c.id] ?? '').trim()
        return (
          <div key={c.id} style={{ display: 'flex', gap: 10, padding: '12px 18px', borderTop: `1px solid ${T.line}` }}>
            <span aria-hidden style={{ color: T.amber, fontWeight: 800, width: 15, textAlign: 'center', flexShrink: 0 }}>!</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text, lineHeight: 1.4 }}>{c.title}</div>
              {c.detail && <div style={{ fontSize: 12.5, color: T.muted, marginTop: 3, lineHeight: 1.5 }}>{c.detail}</div>}
              <input value={reasons[c.id] ?? ''} onChange={e => setReason(c.id, e.target.value)} aria-label={`Reason: ${c.title}`}
                placeholder="Why? (needed to save)" style={{ ...inputStyle, marginTop: 8, fontSize: 13, borderColor: missing ? T.red : undefined }} />
            </div>
          </div>
        )
      })}
    </section>
  )
}
