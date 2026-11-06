import { addDays, daysBetween } from './inventory-store'
import {
  chargeShift, versionOn, statusForShifts, daysInMonth, monthOf, BREAKDOWN_REASONS, ANY_FORMATION,
  type ClientRate, type ShiftLog, type ShiftName, type Charge,
} from './costing-store'

/* ==========================================================================
 * OWN RIGS AND CONTRACTORS' RIGS ON THE SAME PROJECT
 *
 * A company on XPLORIX is not "a contractor" or "a client". On one project it
 * can be all three things at once:
 *
 *     the client above        pays us for every metre
 *            │
 *           US  ── our own rigs      cost us fuel, crew, parts, the rig itself
 *            │
 *     contractors below       cost us what their work order says
 *
 * A government exploration agency works like this (its own rigs next to
 * outsourced ones), and so does a private contractor that hires a second
 * outfit to keep a programme on time. So nothing here is written for one
 * customer: a rig on a project is either ours or a contractor's, and that one
 * fact decides how its metres are costed.
 *
 * Three rules.
 *
 * 1. One record. A contractor's shift, once our site staff has checked it,
 *    sits in the same shift record as our own. Progress, the client's
 *    invoice, the forecast and the dashboard read it without knowing who
 *    turned the rods.
 *
 * 2. A work order is a client rate read from the paying side. It has the same
 *    shape (a rate by ground or by depth, standby, mobilisation), so the
 *    engine that prices a metre for our client prices the same metre for our
 *    contractor.
 *
 * 3. The contractor writes his own drill log, in the contractor login we give
 *    him, and nothing he reports counts until someone here has checked it.
 *    Nobody retypes or uploads a sheet. Reports wait in one list, and only
 *    checked metres are paid or billed on.
 *
 * Nothing at the top level of this file may use a value from costing-store:
 * the two files import each other, and whichever loads second is not ready
 * while the first is still being read.
 * ========================================================================== */

// ── words ─────────────────────────────────────────────────────────────────

/* The same two things have different names in different places. A public
 * sector agency says departmental and outsourced; most contractors say own
 * and contractor. The setting changes the words and nothing else. */
export type Wording = 'standard' | 'psu'
export function words(w: Wording | undefined) {
  const psu = w === 'psu'
  return {
    own: psu ? 'Departmental' : 'Own',
    ownRigs: psu ? 'Departmental rigs' : 'Own rigs',
    out: psu ? 'Outsourced' : 'Contractor',
    outRigs: psu ? 'Outsourced rigs' : 'Contractor rigs',
    ownLower: psu ? 'departmental' : 'own',
    outLower: psu ? 'outsourced' : 'contractor',
  }
}

// ── who and under what ────────────────────────────────────────────────────

/* A company that drills for us under a work order. He signs in with a
 * contractor login, which is created under Users like every other login. */
export interface Contractor {
  id: string
  name: string
  place?: string
  contact?: string
  email?: string
}

/* What a contract takes off a bill. Every contract words these differently,
 * so each rule is a switch with its own figures and the clause it comes from.
 * A rule that is off does nothing. */
export type DeductionKind = 'coreRecovery' | 'lateCompletion' | 'shortfall' | 'retention'
export interface DeductionRule {
  id: string
  kind: DeductionKind
  on: boolean
  clause?: string
  /* coreRecovery — judged hole by hole. Below X% recovery, Y% comes off what
   * that hole's metres are worth. The lowest band the hole falls under wins. */
  slabs?: { belowPct: number; deductPct: number }[]
  /* lateCompletion — a percentage for every week past the finish date, on the
   * work done late, up to a cap. */
  pctPerWeek?: number
  capPct?: number
  /* shortfall — a rig that makes fewer than so many metres in a month is
   * charged for each metre short. A part month counts in proportion. */
  minMetres?: number
  perMetre?: number
  /* retention — held back from every bill and released at the end. Money
   * held, not money lost, so it is shown on its own line. */
  holdPct?: number
}
export const DEDUCTION_LABEL: Record<DeductionKind, string> = {
  coreRecovery: 'Low core recovery', lateCompletion: 'Late completion', shortfall: 'Monthly shortfall', retention: 'Retention',
}

/* A rule in a sentence, the way the contract would say it. Read by both
 * sides: the company that set it and the contractor it applies to. */
export function ruleWords(r: DeductionRule): string {
  if (r.kind === 'coreRecovery') {
    const slabs = [...(r.slabs ?? [])].sort((a, b) => b.belowPct - a.belowPct)
    return slabs.length ? slabs.map(s => `below ${s.belowPct}% recovery, ${s.deductPct}% off the hole's metres`).join('; ') : 'no bands set'
  }
  if (r.kind === 'lateCompletion') return `${r.pctPerWeek ?? 0}% for each week past the finish date, on work done late${r.capPct ? `, up to ${r.capPct}%` : ''}`
  if (r.kind === 'shortfall') return `under ${r.minMetres ?? 0} m a rig a month, SAR ${Math.round(r.perMetre ?? 0).toLocaleString('en-US')} for each metre short`
  return `${r.holdPct ?? 0}% held from every bill until the work order closes`
}

/* Where a shift or a bill came from. A shift is always written by the
 * contractor in his login. 'entry' is only for a bill that came on paper and
 * was typed in here. */
export type ReportSource = 'login' | 'entry'
export const SOURCE_LABEL: Record<ReportSource, string> = {
  login: 'Contractor login', entry: 'Typed in',
}

export interface WorkOrder {
  id: string
  number: string
  project: string
  contractorId: string
  rigs: string[]
  startDate: string
  endDate: string
  plannedMetres: number
  /* Dated, like every rate: a revision starts on its date and leaves what was
   * drilled before it alone. */
  rates: ClientRate[]
  rules: DeductionRule[]
  paymentDays: number
  status: 'active' | 'closed'
  note?: string
}

/* Who checked a contractor's shift, when, and what he had first reported if
 * the checked figure is different. Kept on the shift itself, for the audit. */
export interface ShiftCheck {
  by: string
  at: string
  source: ReportSource
  claimedMetres?: number
  claimedRecovery?: number
  note?: string
}

/* A contractor's shift before it is part of the record. */
export type ReportStatus = 'waiting' | 'returned'
export interface ContractorReport {
  id: string
  workOrderId: string
  rig: string
  project: string
  date: string
  shift: ShiftName
  holeNumber: string | null
  holeSize: string
  formationType: string
  fromDepth?: number
  toDepth?: number
  metres: number
  coreRecovery: number          // metres of core
  shiftHours?: number           // 12 unless he says otherwise
  drillingHours: number
  standbyHours: number          // stopped, and he says not by him
  breakdownHours: number        // stopped by his own rig or crew
  reason: string
  holeClosed?: boolean
  remarks?: string
  /* Everything else the drill log form recorded (crew, engine hours, the
   * downtime lines, equipment, incidents, a second hole). Carried onto the
   * shift unchanged when the report is accepted. */
  extra?: Partial<ShiftLog>
  source: ReportSource
  receivedAt: string            // YYYY-MM-DDTHH:MM
  status: ReportStatus
  returnedBy?: string
  returnedAt?: string
  returnReason?: string
}

export type BillLineKind = 'metres' | 'standby' | 'mob' | 'demob' | 'other'
export interface BillLine {
  id: string
  kind: BillLineKind
  label: string
  hole?: string
  key: string                   // what it is matched to in the record
  qty: number
  unit: 'm' | 'day' | 'once'
  rate: number
  amount: number
}
export interface ManualDeduction { id: string; label: string; amount: number }

export type BillStatus = 'received' | 'approved' | 'returned' | 'paid'
export const BILL_STATUS_LABEL: Record<BillStatus, string> = {
  received: 'To check', approved: 'Approved for payment', returned: 'Sent back', paid: 'Paid',
}
/* What was approved, frozen on the day. If the record is corrected later the
 * approved bill still reads as it did when it was signed. */
export interface BillSnapshot {
  claimed: number; supported: number; deductions: number; held: number; net: number
  lines: { label: string; amount: number }[]
  by: string; at: string
}
export interface ContractorBill {
  id: string
  number: string                // the contractor's own bill number
  workOrderId: string
  project: string
  contractorId: string
  periodFrom: string
  periodTo: string
  receivedAt: string
  source: ReportSource
  lines: BillLine[]
  manual: ManualDeduction[]
  status: BillStatus
  approved?: BillSnapshot
  returnReason?: string
  paidAt?: string
}

/* The parts of the store this file reads. */
export interface ContractingState {
  shiftLogs: ShiftLog[]
  contractors?: Contractor[]
  workOrders?: WorkOrder[]
  contractorReports?: ContractorReport[]
  contractorBills?: ContractorBill[]
  holePlans?: Record<string, { plannedDepth: number; project?: string }>
  wording?: Wording
}

// ── reading ───────────────────────────────────────────────────────────────

export const ownLogs = (logs: ShiftLog[]) => logs.filter(l => !l.contractor)
export const boughtLogs = (logs: ShiftLog[]) => logs.filter(l => !!l.contractor)

export function contractorOf(state: ContractingState, id: string | undefined) {
  return (state.contractors ?? []).find(c => c.id === id)
}
export function contractorName(state: ContractingState, id: string | undefined) {
  return contractorOf(state, id)?.name ?? 'Contractor'
}
export function workOrderById(state: ContractingState, id: string | undefined) {
  return (state.workOrders ?? []).find(w => w.id === id)
}
/* The work order a rig is on, on a project. A rig with none is our own. */
export function workOrderFor(state: ContractingState, project: string, rig: string): WorkOrder | undefined {
  const all = (state.workOrders ?? []).filter(w => w.project === project && w.rigs.includes(rig))
  return all.find(w => w.status === 'active') ?? all[all.length - 1]
}
export function isContractorRig(state: ContractingState, project: string, rig: string) {
  return !!workOrderFor(state, project, rig)
}
export function payRateOn(wo: WorkOrder | undefined, date: string): ClientRate | undefined {
  return wo ? versionOn(wo.rates, date) : undefined
}
export function currentPayRate(wo: WorkOrder, today: string) {
  return versionOn(wo.rates, today) ?? [...wo.rates].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0]
}

const order = (l: { date: string; shift: string }) => `${l.date}${l.shift === 'Day' ? '0' : '1'}`
const sum = <T,>(list: T[], f: (x: T) => number) => list.reduce((s, x) => s + f(x), 0)
const r2 = (n: number) => Math.round(n * 100) / 100

/* Checked metres on a hole so far, optionally only before one shift. */
export function depthOf(logs: ShiftLog[], hole: string, before?: { date: string; shift: string }) {
  return sum(logs.filter(l => l.holeNumber === hole && (!before || order(l) < order(before))), l => l.metresDrilled)
}

export interface WorkOrderProgress {
  metres: number; recoveryPct: number; days: number; lastDate?: string
  perRigDay: number; plannedLeft: number; pctDone: number
  late: boolean; daysLate: number
}
export function workOrderProgress(state: ContractingState, wo: WorkOrder, today: string): WorkOrderProgress {
  const logs = state.shiftLogs.filter(l => l.workOrderId === wo.id)
  const metres = sum(logs, l => l.metresDrilled)
  const rigDays = new Set(logs.map(l => `${l.rig}|${l.date}`)).size
  const lastDate = logs.map(l => l.date).sort().pop()
  const open = wo.status === 'active' && metres < wo.plannedMetres
  return {
    metres, days: rigDays, lastDate,
    recoveryPct: metres > 0 ? (sum(logs, l => l.coreRecovery) / metres) * 100 : 0,
    perRigDay: rigDays ? metres / rigDays : 0,
    plannedLeft: Math.max(0, wo.plannedMetres - metres),
    pctDone: wo.plannedMetres > 0 ? Math.min(100, (metres / wo.plannedMetres) * 100) : 0,
    late: open && today > wo.endDate,
    daysLate: open && today > wo.endDate ? daysBetween(wo.endDate, today) : 0,
  }
}

// ── a report becomes a shift ──────────────────────────────────────────────

export interface Acceptance { metres?: number; coreRecovery?: number; standbyPayable?: boolean; note?: string }

/* The checked shift, in the exact shape costing reads. Fuel, crew and parts
 * are zero because they are the contractor's, not ours.
 *
 * A stoppage he calls standby is paid at the standby rate only if the checker
 * agrees the cause was not his. If not, the reason is recorded as his own
 * delay, which is never paid and never billed on to our client. */
export function reportToShift(r: ContractorReport, wo: WorkOrder, by: string, at: string, a: Acceptance = {}): ShiftLog {
  const metres = a.metres ?? r.metres
  const core = Math.min(a.coreRecovery ?? r.coreRecovery, metres)
  const down = r.standbyHours + r.breakdownHours
  const mostlyOwn = r.breakdownHours > 0 && r.breakdownHours >= r.standbyHours
  const refused = r.standbyHours > 0 && a.standbyPayable === false
  /* The reason he gave on his own downtime lines is kept: a crew shortage stays
   * a crew shortage instead of being filed as a mechanical breakdown. */
  const longest = (side: 'internal' | 'client') => (r.extra?.downtime ?? []).filter(d => d.side === side && d.hours > 0).sort((x, y) => y.hours - x.hours)[0]?.reason
  const reason = down <= 0 ? ''
    : refused ? 'Contractor Delay'
    : mostlyOwn ? (longest('internal') ?? (BREAKDOWN_REASONS.includes(r.reason) ? r.reason : 'Mechanical Breakdown'))
    : (longest('client') ?? (r.reason && !BREAKDOWN_REASONS.includes(r.reason) ? r.reason : 'Waiting for Instruction'))
  const check: ShiftCheck = { by, at, source: r.source }
  if (metres !== r.metres) check.claimedMetres = r.metres
  if (core !== r.coreRecovery) check.claimedRecovery = r.coreRecovery
  if (a.note?.trim()) check.note = a.note.trim()
  return {
    ...r.extra,
    downtime: refused ? r.extra?.downtime?.map(d => ({ ...d, side: 'internal' as const })) : r.extra?.downtime,
    id: `ctr_${r.rig}_${r.date}_${r.shift}`.replace(/\s+/g, ''),
    rig: r.rig, project: r.project, date: r.date, shift: r.shift,
    holeNumber: metres > 0 || r.holeNumber ? r.holeNumber : null,
    crewCount: r.extra?.crewCount ?? 0, shiftHours: r.shiftHours ?? 12,
    drillingHours: r.drillingHours, downtimeHours: down, downtimeReason: reason,
    metresDrilled: metres, coreRecovery: core,
    holeSize: r.holeSize, formationType: r.formationType,
    holeClosedThisShift: r.holeClosed || undefined,
    meterStart: r.fromDepth, meterEnd: r.fromDepth != null ? Math.round((r.fromDepth + metres) * 100) / 100 : undefined,
    downtimeSide: down <= 0 ? undefined : refused || mostlyOwn ? 'internal' : 'client',
    // His fuel is his own cost. It is kept on the record if he gave it, and never costed.
    partsUsed: [], fuelLitres: r.extra?.fuelLitres ?? 0, waterLitres: r.extra?.waterLitres ?? 0, additivesKg: r.extra?.additivesKg ?? 0,
    contractor: wo.contractorId, workOrderId: wo.id, check,
  }
}

// ── what the checker should look at before accepting ──────────────────────

export interface Flag { tone: 'bad' | 'warn' | 'info'; text: string }

/* Read against the record, not against a rule book: the things a site
 * geologist would catch by eye if he had the last month in front of him. */
export function reportFlags(state: ContractingState, r: ContractorReport, today: string): Flag[] {
  const out: Flag[] = []
  const wo = workOrderById(state, r.workOrderId)
  const logs = state.shiftLogs
  const hours = r.drillingHours + r.standbyHours + r.breakdownHours
  if (logs.some(l => l.rig === r.rig && l.project === r.project && l.date === r.date && l.shift === r.shift)) {
    out.push({ tone: 'bad', text: 'A shift for this rig, date and shift is already in the record.' })
  }
  if (r.date > today) out.push({ tone: 'bad', text: 'The date is in the future.' })
  if (wo && (r.date < wo.startDate)) out.push({ tone: 'warn', text: `Before the work order started (${dmy(wo.startDate)}).` })
  if (wo && !wo.rigs.includes(r.rig)) out.push({ tone: 'bad', text: `${r.rig} is not on work order ${wo.number}.` })
  if (r.coreRecovery > r.metres + 0.001) out.push({ tone: 'bad', text: 'Core recovered is more than the metres drilled.' })
  const shiftLen = r.shiftHours ?? 12
  if (Math.abs(hours - shiftLen) > 0.01) out.push({ tone: 'warn', text: `The hours add up to ${r2(hours)}, not the ${shiftLen} of a shift.` })

  if (r.holeNumber && r.metres > 0) {
    const plan = state.holePlans?.[r.holeNumber]
    if (plan?.project && plan.project !== r.project) out.push({ tone: 'bad', text: `${r.holeNumber} belongs to another project.` })
    if (!plan && !logs.some(l => l.holeNumber === r.holeNumber)) out.push({ tone: 'warn', text: `${r.holeNumber} is not on the plan for this project.` })
    if (logs.some(l => l.holeNumber === r.holeNumber && l.holeClosedThisShift && order(l) < order(r))) {
      out.push({ tone: 'bad', text: `${r.holeNumber} was already closed.` })
    }
    // Where the hole stands, counting the earlier reports still waiting.
    const earlier = (state.contractorReports ?? []).filter(x => x.status === 'waiting' && x.id !== r.id && x.holeNumber === r.holeNumber && order(x) < order(r))
    const stands = depthOf(logs, r.holeNumber, r) + sum(earlier, x => x.metres)
    if (r.fromDepth != null && Math.abs(r.fromDepth - stands) > 0.05) {
      out.push({ tone: 'warn', text: `Starts at ${r2(r.fromDepth)} m, but the record for ${r.holeNumber} stands at ${r2(stands)} m.` })
    }
    if (plan && stands + r.metres > plan.plannedDepth + 0.05) {
      out.push({ tone: 'info', text: `Takes ${r.holeNumber} to ${r2(stands + r.metres)} m, past its planned ${plan.plannedDepth} m.` })
    }
  }
  if (r.metres > 0 && !r.holeNumber) out.push({ tone: 'bad', text: 'Metres are reported but no hole number.' })

  const past = logs.filter(l => l.rig === r.rig && l.project === r.project && l.metresDrilled > 0)
  if (past.length >= 6 && r.metres > 0) {
    const best = Math.max(...past.map(l => l.metresDrilled))
    if (r.metres > best * 1.25) out.push({ tone: 'warn', text: `${r2(r.metres)} m is well above this rig's best shift so far (${r2(best)} m).` })
  }
  if (r.metres > 0) {
    const pct = (r.coreRecovery / r.metres) * 100
    const rule = wo?.rules.find(x => x.kind === 'coreRecovery' && x.on)
    const limit = Math.max(0, ...(rule?.slabs ?? []).map(s => s.belowPct))
    if (limit && pct < limit) out.push({ tone: 'warn', text: `Core recovery ${pct.toFixed(0)}% is below the ${limit}% in the work order.` })
  }
  if (r.standbyHours > 0) {
    out.push({ tone: 'info', text: `Standby claimed: ${r2(r.standbyHours)} h, ${r.reason || 'no reason given'}. Decide whether it is payable.` })
  }
  return out
}
export const hasProblem = (flags: Flag[]) => flags.some(f => f.tone !== 'info')

// ── what the record supports paying ───────────────────────────────────────

function bandWords(c: Charge, rate: ClientRate | undefined) {
  if (!rate || !c.matched) return `${c.holeSize} · no rate in the work order`
  if (rate.structure === 'slab') {
    const row = rate.rateRows.find(x => x.holeSize === c.holeSize && (x.fromDepth == null || c.fromDepth >= x.fromDepth) && (x.toDepth == null || c.fromDepth < x.toDepth))
    return `${c.holeSize} · ${row?.fromDepth ?? 0}${row?.toDepth != null ? `–${row.toDepth} m` : ' m and deeper'}`
  }
  const row = rate.rateRows.find(x => x.holeSize === c.holeSize && Math.round(x.rate) === Math.round(c.rate))
  return `${c.holeSize} · ${row && row.formation !== ANY_FORMATION ? row.formation : c.formation || 'any ground'}`
}

export interface RecordLine {
  kind: BillLineKind
  key: string
  label: string
  hole?: string
  qty: number
  unit: 'm' | 'day' | 'once'
  rate: number
  amount: number
}
export interface RecordStatement {
  lines: RecordLine[]
  metres: number
  metresValue: number
  standbyDays: number
  total: number
  /* per hole: metres, core and value, for the recovery rule */
  holes: { hole: string; metres: number; core: number; value: number }[]
  /* per date: value of metres drilled, for the late rule */
  byDate: { date: string; rig: string; metres: number; value: number }[]
}

/* What the checked shifts between two dates come to at the work order's
 * rates: metres by hole and band, then standby days. This is the one
 * calculation behind the cost of a contractor's rig, the bill check and the
 * "not billed yet" figure, so the three cannot disagree. */
export function recordStatement(state: ContractingState, wo: WorkOrder, from: string, to: string): RecordStatement {
  const all = state.shiftLogs.filter(l => l.workOrderId === wo.id).sort((a, b) => order(a).localeCompare(order(b)))
  const depth: Record<string, number> = {}
  const acc: Record<string, RecordLine> = {}
  const holes: Record<string, { hole: string; metres: number; core: number; value: number }> = {}
  const byDate: RecordStatement['byDate'] = []
  all.forEach(l => {
    const inside = l.date >= from && l.date <= to
    const start = l.holeNumber ? (depth[l.holeNumber] ?? 0) : 0
    if (l.holeNumber) depth[l.holeNumber] = start + l.metresDrilled
    if (!inside || l.metresDrilled <= 0 || !l.holeNumber) return
    const rate = payRateOn(wo, l.date)
    let value = 0
    chargeShift(rate, l, start).forEach(c => {
      const words = bandWords(c, rate)
      const key = `m|${l.holeNumber}|${words}|${Math.round(c.rate)}`
      const e = (acc[key] ||= { kind: 'metres', key, hole: l.holeNumber!, label: `${l.holeNumber} · ${words}`, qty: 0, unit: 'm', rate: c.rate, amount: 0 })
      e.qty += c.metres; e.amount += c.amount; value += c.amount
    })
    const h = (holes[l.holeNumber] ||= { hole: l.holeNumber, metres: 0, core: 0, value: 0 })
    h.metres += l.metresDrilled; h.core += l.coreRecovery; h.value += value
    byDate.push({ date: l.date, rig: l.rig, metres: l.metresDrilled, value })
  })

  // A rig-day with shifts and no drilling, stopped for a reason that is not his.
  const days: Record<string, ShiftLog[]> = {}
  all.filter(l => l.date >= from && l.date <= to).forEach(l => { (days[`${l.rig}|${l.date}`] ||= []).push(l) })
  let standbyDays = 0
  Object.values(days).forEach(shifts => {
    if (statusForShifts(shifts) !== 'standby') return
    const rate = payRateOn(wo, shifts[0].date)?.standbyPerDay ?? 0
    const key = `s|${Math.round(rate)}`
    const e = (acc[key] ||= { kind: 'standby', key, label: 'Standby', qty: 0, unit: 'day', rate, amount: 0 })
    e.qty += 1; e.amount += rate; standbyDays += 1
  })

  const lines = Object.values(acc)
    .map(l => ({ ...l, qty: r2(l.qty), amount: Math.round(l.amount) }))
    .sort((a, b) => (a.kind === b.kind ? a.label.localeCompare(b.label, undefined, { numeric: true }) : a.kind === 'metres' ? -1 : 1))
  const metresLines = lines.filter(l => l.kind === 'metres')
  return {
    lines,
    metres: sum(metresLines, l => l.qty), metresValue: sum(metresLines, l => l.amount),
    standbyDays, total: sum(lines, l => l.amount),
    holes: Object.values(holes), byDate,
  }
}

// ── deductions ────────────────────────────────────────────────────────────

export interface Deduction { kind: DeductionKind | 'other'; label: string; working: string; amount: number; clause?: string }

const rupees = (n: number) => `SAR ${Math.round(n).toLocaleString('en-US')}`
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dmy = (date: string) => { const [y, m, d] = date.split('-').map(Number); return `${d} ${MON[m - 1]} ${y}` }

/* Every rule that is switched on, applied to what the record supports, each
 * with its working so a contractor can check the arithmetic. `payable` is the
 * supported value per hole after any over-claim has been cut back. */
export function deductionsFor(
  state: ContractingState, wo: WorkOrder, from: string, to: string, rec: RecordStatement,
): { deductions: Deduction[]; retention: Deduction | null } {
  const out: Deduction[] = []
  const on = (k: DeductionKind) => wo.rules.find(r => r.kind === k && r.on)

  const core = on('coreRecovery')
  if (core?.slabs?.length) {
    const slabs = [...core.slabs].filter(s => s.belowPct > 0 && s.deductPct > 0).sort((a, b) => a.belowPct - b.belowPct)
    rec.holes.forEach(h => {
      if (h.metres <= 0) return
      const pct = (h.core / h.metres) * 100
      const slab = slabs.find(s => pct < s.belowPct)
      if (!slab) return
      out.push({
        kind: 'coreRecovery', clause: core.clause,
        label: `${h.hole}: core recovery ${pct.toFixed(1)}%`,
        working: `below ${slab.belowPct}% · ${slab.deductPct}% off ${rupees(h.value)} for ${r2(h.metres)} m`,
        amount: Math.round(h.value * slab.deductPct / 100),
      })
    })
  }

  const short = on('shortfall')
  if (short?.minMetres && short.perMetre) {
    const months = new Set<string>()
    for (let d = from; d <= to; d = addDays(d, 1)) months.add(monthOf(d))
    wo.rigs.forEach(rig => months.forEach(m => {
      const first = [`${m}-01`, from, wo.startDate].sort().pop()!
      const last = [`${m}-${String(daysInMonth(m)).padStart(2, '0')}`, to].sort()[0]
      if (first > last) return
      const active = daysBetween(first, last) + 1
      const need = short.minMetres! * active / daysInMonth(m)
      const made = sum(rec.byDate.filter(x => x.rig === rig && x.date >= first && x.date <= last), x => x.metres)
      const gap = Math.round(need - made)
      if (gap < 1) return
      out.push({
        kind: 'shortfall', clause: short.clause,
        label: `${rig}: ${r2(made)} m in ${active} days`,
        working: `needs ${Math.round(need)} m (${short.minMetres} m a month) · ${gap} m short at ${rupees(short.perMetre!)}`,
        amount: gap * short.perMetre!,
      })
    }))
  }

  const late = on('lateCompletion')
  if (late?.pctPerWeek && to > wo.endDate) {
    const doneByEnd = sum(state.shiftLogs.filter(l => l.workOrderId === wo.id && l.date <= wo.endDate), l => l.metresDrilled)
    const lateValue = sum(rec.byDate.filter(x => x.date > wo.endDate), x => x.value)
    if (doneByEnd < wo.plannedMetres && lateValue > 0) {
      const weeks = Math.ceil(daysBetween(wo.endDate, to) / 7)
      const pct = Math.min(late.capPct ?? 100, weeks * late.pctPerWeek)
      out.push({
        kind: 'lateCompletion', clause: late.clause,
        label: `${weeks} ${weeks === 1 ? 'week' : 'weeks'} past the finish date`,
        working: `${late.pctPerWeek}% a week${late.capPct ? `, capped at ${late.capPct}%` : ''} · ${pct}% of ${rupees(lateValue)} drilled after ${dmy(wo.endDate)}`,
        amount: Math.round(lateValue * pct / 100),
      })
    }
  }

  const hold = on('retention')
  const base = Math.max(0, rec.total - sum(out, d => d.amount))
  const retention: Deduction | null = hold?.holdPct ? {
    kind: 'retention', clause: hold.clause, label: `Retention ${hold.holdPct}%`,
    working: `held back from ${rupees(base)}, released when the work order closes`,
    amount: Math.round(base * hold.holdPct / 100),
  } : null
  return { deductions: out, retention }
}

// ── checking a bill ───────────────────────────────────────────────────────

export interface CheckedLine {
  line: BillLine
  record: { qty: number; rate: number; amount: number } | null
  payable: number
  problems: string[]
}
export interface BillCheck {
  wo: WorkOrder | undefined
  lines: CheckedLine[]
  notClaimed: RecordLine[]
  claimed: number
  supported: number
  over: number
  deductions: Deduction[]
  retention: Deduction | null
  manual: ManualDeduction[]
  deducted: number
  held: number
  net: number
  clean: boolean
}

/* A bill is checked line by line against the checked shifts. A line is paid
 * for what the record shows, at the work order's rate, and never for more
 * than was claimed. Mobilisation and demobilisation are lump sums: they are
 * supported once, at the work order's figure. */
export function checkBill(state: ContractingState, bill: ContractorBill): BillCheck {
  const wo = workOrderById(state, bill.workOrderId)
  if (!wo) {
    const claimed = sum(bill.lines, l => l.amount)
    return { wo, lines: bill.lines.map(line => ({ line, record: null, payable: 0, problems: ['The work order is missing.'] })), notClaimed: [], claimed, supported: 0, over: claimed, deductions: [], retention: null, manual: bill.manual, deducted: 0, held: 0, net: 0, clean: false }
  }
  const rec = recordStatement(state, wo, bill.periodFrom, bill.periodTo)
  const rate = payRateOn(wo, bill.periodTo) ?? currentPayRate(wo, bill.periodTo)
  const others = (state.contractorBills ?? []).filter(b => b.workOrderId === wo.id && b.id !== bill.id && b.status !== 'returned' && b.receivedAt <= bill.receivedAt)
  const billedBefore = (k: BillLineKind) => others.some(b => b.lines.some(l => l.kind === k))
  const used = new Set<string>()

  const lines: CheckedLine[] = bill.lines.map(line => {
    const problems: string[] = []
    if (line.kind === 'mob' || line.kind === 'demob') {
      const agreed = line.kind === 'mob' ? (rate?.mobilisation ?? 0) : (rate?.demobilisation ?? 0)
      const word = line.kind === 'mob' ? 'Mobilisation' : 'Demobilisation'
      if (billedBefore(line.kind)) {
        problems.push(`${word} was already billed on an earlier bill.`)
        return { line, record: { qty: 0, rate: agreed, amount: 0 }, payable: 0, problems }
      }
      if (line.amount > agreed) problems.push(`The work order gives ${rupees(agreed)}.`)
      return { line, record: { qty: 1, rate: agreed, amount: agreed }, payable: Math.min(line.amount, agreed), problems }
    }
    if (line.kind === 'other') {
      problems.push('Not in the work order. Nothing in the record to check it against.')
      return { line, record: null, payable: 0, problems }
    }
    const r = rec.lines.find(x => x.key === line.key) ?? rec.lines.find(x => !used.has(x.key) && x.kind === line.kind && x.hole === line.hole && Math.round(x.rate) === Math.round(line.rate))
    if (!r) {
      problems.push(line.kind === 'standby' ? 'No standby day in the checked record for this period.' : 'No checked metres match this line.')
      return { line, record: null, payable: 0, problems }
    }
    used.add(r.key)
    const unit = line.unit === 'm' ? 'm' : line.qty === 1 ? 'day' : 'days'
    if (line.qty > r.qty + 0.01) problems.push(`The record shows ${r.qty} ${line.unit === 'm' ? 'm' : r.qty === 1 ? 'day' : 'days'}; the bill claims ${line.qty} ${unit}.`)
    if (Math.round(line.rate) > Math.round(r.rate)) problems.push(`The work order rate is ${rupees(r.rate)}; the bill uses ${rupees(line.rate)}.`)
    const payable = Math.round(Math.min(line.qty, r.qty) * Math.min(line.rate, r.rate))
    return { line, record: { qty: r.qty, rate: r.rate, amount: r.amount }, payable, problems }
  })

  const notClaimed = rec.lines.filter(x => !used.has(x.key))
  const claimed = sum(bill.lines, l => l.amount)
  const supported = sum(lines, l => l.payable)

  /* Deductions follow what is being paid, hole by hole: a hole cut back for an
   * over-claim is not then charged recovery on the metres that were refused. */
  const paidRec: RecordStatement = {
    ...rec,
    total: supported,
    holes: rec.holes.map(h => {
      const paid = sum(lines.filter(l => l.line.kind === 'metres' && l.line.hole === h.hole), l => l.payable)
      return { ...h, value: Math.min(h.value, paid) }
    }),
  }
  const { deductions, retention } = deductionsFor(state, wo, bill.periodFrom, bill.periodTo, paidRec)
  const deducted = sum(deductions, d => d.amount) + sum(bill.manual, m => m.amount)
  const afterDeductions = Math.max(0, supported - deducted)
  const hold = wo.rules.find(r => r.kind === 'retention' && r.on)?.holdPct ?? 0
  const held = Math.round(afterDeductions * hold / 100)
  return {
    wo, lines, notClaimed, claimed, supported, over: Math.max(0, claimed - supported),
    deductions,
    retention: retention ? { ...retention, amount: held, working: `held back from ${rupees(afterDeductions)}, released when the work order closes` } : null,
    manual: bill.manual, deducted, held, net: afterDeductions - held,
    clean: lines.every(l => l.problems.length === 0),
  }
}

export function snapshotOf(c: BillCheck, by: string, at: string): BillSnapshot {
  return {
    claimed: c.claimed, supported: c.supported, deductions: c.deducted, held: c.held, net: c.net,
    lines: [
      ...c.deductions.map(d => ({ label: `${d.label} (${d.working})`, amount: -d.amount })),
      ...c.manual.map(m => ({ label: m.label, amount: -m.amount })),
      ...(c.retention ? [{ label: c.retention.label, amount: -c.retention.amount }] : []),
    ],
    by, at,
  }
}

/* The bill's figures as they stand: frozen if it was approved, live if not. */
export function billFigures(state: ContractingState, bill: ContractorBill) {
  if (bill.approved) return bill.approved
  const c = checkBill(state, bill)
  return { claimed: c.claimed, supported: c.supported, deductions: c.deducted, held: c.held, net: c.net }
}

export function billDue(state: ContractingState, bill: ContractorBill) {
  const wo = workOrderById(state, bill.workOrderId)
  return addDays(bill.receivedAt.slice(0, 10), wo?.paymentDays ?? 30)
}

/* Lines for a new bill, filled from the checked record. The contractor raising
 * it in his login, or our staff typing in a paper bill, change only the
 * figures that differ. */
export function draftLines(state: ContractingState, wo: WorkOrder, from: string, to: string): BillLine[] {
  const rec = recordStatement(state, wo, from, to)
  const lines: BillLine[] = rec.lines.map((l, i) => ({ id: `l${i}`, kind: l.kind, key: l.key, label: l.label, hole: l.hole, qty: l.qty, unit: l.unit, rate: l.rate, amount: l.amount }))
  const before = (state.contractorBills ?? []).filter(b => b.workOrderId === wo.id && b.status !== 'returned')
  const rate = payRateOn(wo, to) ?? currentPayRate(wo, to)
  if (rate?.mobilisation && !before.some(b => b.lines.some(l => l.kind === 'mob'))) {
    lines.push({ id: 'mob', kind: 'mob', key: 'mob', label: 'Mobilisation', qty: 1, unit: 'once', rate: rate.mobilisation, amount: rate.mobilisation })
  }
  return lines
}

/* Checked work that no bill has covered yet: from the day after the last
 * bill's period to today. This is what we will owe. */
export function unbilled(state: ContractingState, wo: WorkOrder, today: string) {
  const bills = (state.contractorBills ?? []).filter(b => b.workOrderId === wo.id && b.status !== 'returned')
  const lastTo = bills.map(b => b.periodTo).sort().pop()
  const from = lastTo ? addDays(lastTo, 1) : wo.startDate
  if (from > today) return null
  const rec = recordStatement(state, wo, from, today)
  if (rec.total <= 0) return null
  const { deductions, retention } = deductionsFor(state, wo, from, today, rec)
  const deducted = sum(deductions, d => d.amount)
  return { from, to: today, rec, deductions, retention, deducted, net: rec.total - deducted - (retention?.amount ?? 0) }
}

// ── demo bills ────────────────────────────────────────────────────────────

/* Two bills for August, built from the seeded record so their figures are
 * real arithmetic. The first matches the record and was approved. The second
 * claims more metres and more standby than the site checked, so the bill
 * check has something to find. */
export function seedBills(state: ContractingState): ContractorBill[] {
  const wos = state.workOrders ?? []
  const p = wos.find(w => w.id === 'wo_b1'), q = wos.find(w => w.id === 'wo_b2')
  const out: ContractorBill[] = []
  if (p) {
    // 6 m more than was checked on the deepest band: approved at the record.
    const lines = draftLines({ ...state, contractorBills: [] }, p, '2026-09-18', '2026-10-18')
    const deep = [...lines].reverse().find(l => l.kind === 'metres')
    if (deep) { deep.qty = r2(deep.qty + 6); deep.amount = Math.round(deep.qty * deep.rate) }
    const bill: ContractorBill = {
      id: 'cb_1', number: 'CP/26-27/041', workOrderId: p.id, project: p.project, contractorId: p.contractorId,
      periodFrom: '2026-09-18', periodTo: '2026-10-18', receivedAt: '2026-10-21T11:20', source: 'login',
      lines, manual: [], status: 'received',
    }
    const c = checkBill({ ...state, contractorBills: [bill] }, bill)
    out.push({ ...bill, status: 'approved', approved: snapshotOf(c, 'Admin User', '2026-10-24T15:05') })
  }
  if (q) {
    const lines = draftLines({ ...state, contractorBills: [] }, q, '2026-09-18', '2026-10-18').map(l => {
      // 8 m more than was checked on the deepest band, and three standby days for one.
      if (l.kind === 'standby') return { ...l, qty: 3, amount: 3 * l.rate }
      return l
    })
    const deep = [...lines].reverse().find(l => l.kind === 'metres')
    if (deep) { deep.qty = r2(deep.qty + 8); deep.amount = Math.round(deep.qty * deep.rate) }
    out.push({
      id: 'cb_2', number: 'Q-INV-118', workOrderId: q.id, project: q.project, contractorId: q.contractorId,
      periodFrom: '2026-09-18', periodTo: '2026-10-18', receivedAt: '2026-10-23T16:40', source: 'login',
      lines, manual: [], status: 'received',
    })
  }
  return out
}

// ── the contractor's own side ─────────────────────────────────────────────

/* Where a hole stands at the start of a shift: checked metres before it, plus
 * the metres in earlier reports still waiting. A shift that was sent back is
 * not counted, so the corrected one starts where the record really is. Asked
 * for a shift in the past, it gives the depth the hole had reached by then,
 * which is what a corrected shift has to carry on from. */
export function holeStands(state: ContractingState, hole: string, at?: { date: string; shift: string }, skipReportId?: string) {
  const waiting = (state.contractorReports ?? []).filter(r => r.status === 'waiting' && r.holeNumber === hole && r.id !== skipReportId && (!at || order(r) < order(at)))
  return r2(depthOf(state.shiftLogs, hole, at) + sum(waiting, r => r.metres))
}

/* What the contractor sees. Only his own work orders and what belongs to
 * them: nothing of our own rigs, our client's rates or another contractor. */
export function contractorSide(state: ContractingState, contractorId: string) {
  const orders = (state.workOrders ?? []).filter(w => w.contractorId === contractorId)
  const ids = new Set(orders.map(w => w.id))
  const reports = (state.contractorReports ?? []).filter(r => ids.has(r.workOrderId))
  return {
    orders,
    waiting: reports.filter(r => r.status === 'waiting'),
    returned: reports.filter(r => r.status === 'returned'),
    accepted: state.shiftLogs.filter(l => l.workOrderId && ids.has(l.workOrderId)),
    bills: (state.contractorBills ?? []).filter(b => ids.has(b.workOrderId)),
  }
}

// ── the drill log form, to a report and back ──────────────────────────────

/* The contractor fills in the same drill log form as everyone else. What he
 * sends is kept as a report until it is checked: the figures the check reads
 * are lifted out, and everything else the form recorded rides along. */
export function draftToReport(log: ShiftLog, wo: WorkOrder, id: string, receivedAt: string): ContractorReport {
  const lines = log.downtime ?? []
  const standby = sum(lines.filter(l => l.side === 'client'), l => l.hours)
  const breakdown = sum(lines.filter(l => l.side === 'internal'), l => l.hours)
  return {
    id, workOrderId: wo.id, rig: log.rig, project: wo.project, date: log.date, shift: log.shift,
    holeNumber: log.holeNumber, holeSize: log.holeSize, formationType: log.formationType,
    fromDepth: log.meterStart, toDepth: log.meterEnd, metres: log.metresDrilled, coreRecovery: log.coreRecovery,
    shiftHours: log.shiftHours, drillingHours: log.drillingHours, standbyHours: standby, breakdownHours: breakdown,
    reason: log.downtimeReason, holeClosed: log.holeClosedThisShift, remarks: log.notes,
    extra: {
      crewCount: log.crewCount, supervisor: log.supervisor, driller: log.driller, engineHmr: log.engineHmr, engineHours: log.engineHours,
      lithology: log.lithology, standbyMode: log.standbyMode, downtime: lines, equipmentUsed: log.equipmentUsed, incidents: log.incidents,
      attachments: log.attachments, notes: log.notes, nextHole: log.nextHole,
      fuelLitres: log.fuelLitres, waterLitres: log.waterLitres, additivesKg: log.additivesKg,
      loggedBy: log.loggedBy, loggedAt: log.loggedAt,
      // What the drill log checks said as he typed it, and his reasons.
      trust: log.trust,
    },
    source: 'login', receivedAt, status: 'waiting',
  }
}

/* A report laid back out as the form reads it, to correct one that came back. */
export function reportToDraft(r: ContractorReport): ShiftLog {
  const lines = r.extra?.downtime?.length ? r.extra.downtime : [
    ...(r.standbyHours > 0 ? [{ reason: r.reason, side: 'client' as const, hours: r.standbyHours }] : []),
    ...(r.breakdownHours > 0 ? [{ reason: r.reason, side: 'internal' as const, hours: r.breakdownHours }] : []),
  ]
  return {
    ...r.extra,
    id: r.id, rig: r.rig, project: r.project, date: r.date, shift: r.shift, holeNumber: r.holeNumber,
    crewCount: r.extra?.crewCount ?? 0, shiftHours: r.shiftHours ?? 12, drillingHours: r.drillingHours,
    downtimeHours: r.standbyHours + r.breakdownHours, downtimeReason: r.reason, downtime: lines,
    metresDrilled: r.metres, coreRecovery: r.coreRecovery, holeSize: r.holeSize, formationType: r.formationType,
    meterStart: r.fromDepth, meterEnd: r.fromDepth != null ? r2(r.fromDepth + r.metres) : undefined,
    holeClosedThisShift: r.holeClosed, notes: r.remarks ?? r.extra?.notes,
    fuelLitres: r.extra?.fuelLitres ?? 0, waterLitres: r.extra?.waterLitres ?? 0, additivesKg: r.extra?.additivesKg ?? 0,
  }
}

/* ── Who drills a project ────────────────────────────────────────────────
 *
 *   own         only the company's own rigs
 *   mixed       own rigs and at least one contractor's
 *   contractor  only contractors, under work orders
 *   none        nobody yet
 *
 * Rigs come from the project's own roster and its work orders; metres from
 * the shift logs, so a rig that has left still counts for what it drilled. */
export type WhoDrills = 'own' | 'mixed' | 'contractor' | 'none'
export const WHO_DRILLS_LABEL: Record<WhoDrills, string> = {
  own: 'Own rigs only', mixed: 'Own rigs and contractors', contractor: 'Contractors only', none: 'No rig yet',
}
export function whoDrills(state: ContractingState & { projects?: { name: string; rigs: string[] }[] }, project: string) {
  const orders = (state.workOrders ?? []).filter(w => w.project === project)
  const roster = (state.projects ?? []).find(p => p.name === project)?.rigs ?? []
  const logs = state.shiftLogs.filter(l => l.project === project && !l.segmentOf)
  const contractorRigs = new Set(orders.flatMap(o => o.rigs))
  const own = Array.from(new Set([...roster, ...logs.filter(l => !l.contractor).map(l => l.rig)])).filter(r => !contractorRigs.has(r)).sort()
  const byContractor = new Map<string, string[]>()
  orders.forEach(o => {
    const name = contractorName(state, o.contractorId)
    byContractor.set(name, Array.from(new Set([...(byContractor.get(name) ?? []), ...o.rigs])).sort())
  })
  const contractors = Array.from(byContractor.entries()).map(([name, rigs]) => ({ name, rigs }))
  const ownMetres = logs.filter(l => !l.contractor).reduce((s, l) => s + l.metresDrilled, 0)
  const contractorMetres = logs.filter(l => !!l.contractor).reduce((s, l) => s + l.metresDrilled, 0)
  const kind: WhoDrills = own.length && contractors.length ? 'mixed' : own.length ? 'own' : contractors.length ? 'contractor' : 'none'
  const total = ownMetres + contractorMetres
  return { kind, own, contractors, ownMetres, contractorMetres, contractorShare: total ? contractorMetres / total : 0 }
}
