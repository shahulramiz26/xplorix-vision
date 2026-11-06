import { isOwnStop, money, monthOf, type ShiftLog } from './costing-store'
import { TODAY, addDays, rigHoldings, normFormation as groundOfLog, type Formation } from './inventory-store'
import { computeRigMonth, type CostingState, type InvState } from './costing-view'
import { workOrderFor, contractorName } from './contracting'
import { shortDate } from './client-record'

/* ==========================================================================
 * ANALYTICS — every figure on the six dashboards, worked out from the record
 *
 * Nothing here is typed in or sampled. Each dashboard reads the same shift
 * logs, maintenance logs and parts records as Finance and the Dashboard, for
 * the project, rig and period picked at the top of the screen. The insights
 * under each heading are rules applied to those same figures: each one says
 * what it found and the numbers behind it.
 * ========================================================================== */

export type Period = '30d' | 'month' | 'last' | 'all'
export const PERIODS: { value: Period; label: string }[] = [
  { value: 'all', label: 'Since the start' }, { value: '30d', label: 'Last 30 days' },
  { value: 'month', label: 'This month' }, { value: 'last', label: 'Last month' },
]
export interface Filters { project: string; rig: string; period: Period }

export interface Insight {
  id: string
  tone: 'good' | 'warn' | 'bad' | 'info'
  title: string
  detail: string
  action?: string
  href?: string
}

const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0)
const r1 = (v: number) => Math.round(v * 10) / 10
const f1 = (v: number) => r1(v).toLocaleString('en-US')
const ground = (l: { formationType: string }): Formation => groundOfLog(l.formationType)
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`

/* The first day and the last day the period covers. */
export function range(period: Period, today: string = TODAY): { from: string; to: string; label: string } {
  const m = monthOf(today)
  if (period === '30d') return { from: addDays(today, -29), to: today, label: 'in the last 30 days' }
  if (period === 'month') return { from: `${m}-01`, to: today, label: 'this month' }
  if (period === 'last') {
    const [y, mm] = m.split('-').map(Number)
    const prev = mm === 1 ? `${y - 1}-12` : `${y}-${String(mm - 1).padStart(2, '0')}`
    return { from: `${prev}-01`, to: addDays(`${m}-01`, -1), label: 'last month' }
  }
  return { from: '0000-01-01', to: today, label: 'since the start' }
}

/* The logs a dashboard reads. A second-hole row carries metres and nothing
 * else, so it counts for metres and is skipped for hours, crew and fluids. */
export function scope(state: CostingState, f: Filters) {
  const { from, to, label } = range(f.period)
  const logs = state.shiftLogs.filter(l => l.date >= from && l.date <= to
    && (f.project === 'all' || l.project === f.project) && (f.rig === 'all' || l.rig === f.rig))
  const maint = (state.maintenance ?? []).filter(m => m.date >= from && m.date <= to
    && (f.project === 'all' || m.project === f.project) && (f.rig === 'all' || m.rig === f.rig))
  const whole = logs.filter(l => !l.segmentOf)
  return { from, to, label, logs, whole, maint }
}

/* Whose rig: our own, or a named contractor's. */
export function ownerOf(state: CostingState, l: { project: string; rig: string }) {
  const wo = workOrderFor(state, l.project, l.rig)
  return wo ? contractorName(state, wo.contractorId) : 'Own'
}

/* Weeks start on a Monday, labelled by that Monday. */
export function weekOf(date: string) {
  const d = new Date(`${date}T00:00:00Z`)
  const back = (d.getUTCDay() + 6) % 7
  return addDays(date, -back)
}
function weeks(from: string, to: string, logs: { date: string }[]) {
  const first = logs.length ? logs.map(l => l.date).sort()[0] : to
  const start = weekOf(from > first ? from : first)
  const out: string[] = []
  for (let w = start; w <= to; w = addDays(w, 7)) out.push(w)
  return out
}

/* Stopped hours on a log, split by whose stop it was, line by line where the
 * log has lines. */
export function stops(l: ShiftLog) {
  if (l.downtime?.length) return l.downtime.filter(d => d.hours > 0).map(d => ({ reason: d.reason || 'Not stated', own: d.side === 'internal', hours: d.hours }))
  return l.downtimeHours > 0 ? [{ reason: l.downtimeReason || 'Not stated', own: isOwnStop(l), hours: l.downtimeHours }] : []
}

/* Days on target, by rig: only on projects that carry a daily target. */
function targetDays(state: CostingState, logs: ShiftLog[]) {
  const out: Record<string, { rig: string; target: number; days: number; on: number }> = {}
  const byRigDay: Record<string, number> = {}
  logs.forEach(l => { const k = `${l.rig}|${l.project}|${l.date}`; byRigDay[k] = (byRigDay[k] ?? 0) + l.metresDrilled })
  Object.entries(byRigDay).forEach(([k, m]) => {
    const [rig, project] = k.split('|')
    const target = (state.projects ?? []).find(p => p.name === project)?.dailyTarget
    if (!target) return
    const e = (out[rig] ||= { rig, target, days: 0, on: 0 })
    e.days += 1; if (m >= target - 1e-6) e.on += 1
  })
  return Object.values(out)
}

// ── OPERATIONS ──────────────────────────────────────────────────────────────

export function operations(state: CostingState, f: Filters) {
  const s = scope(state, f)
  const metres = sum(s.logs, l => l.metresDrilled)
  const core = sum(s.logs, l => l.coreRecovery)
  const drillHours = sum(s.whole, l => l.drillingHours)
  const shiftHours = sum(s.whole, l => l.shiftHours)
  const allStops = s.whole.flatMap(stops)
  const ownHours = sum(allStops.filter(x => x.own), x => x.hours)
  const clientHours = sum(allStops.filter(x => !x.own), x => x.hours)
  const days = new Set(s.whole.map(l => `${l.rig}|${l.date}`)).size

  const rigs = Array.from(new Set(s.logs.map(l => l.rig))).sort()
  const wk = weeks(s.from, s.to, s.logs)
  const ropTrend = wk.map(w => {
    const row: Record<string, number | string | null> = { week: shortDate(w) }
    rigs.forEach(rig => {
      const mine = s.logs.filter(l => l.rig === rig && weekOf(l.date) === w)
      const h = sum(mine.filter(l => !l.segmentOf), l => l.drillingHours)
      row[rig] = h > 0 ? r1((sum(mine, l => l.metresDrilled) / h) * 100) / 100 : null
    })
    return row
  })
  const metresTrend = wk.map(w => {
    const mine = s.logs.filter(l => weekOf(l.date) === w)
    const m = sum(mine, l => l.metresDrilled)
    return { week: shortDate(w), metres: r1(m), recovery: m > 0 ? r1((sum(mine, l => l.coreRecovery) / m) * 100) : null }
  })

  const reasons: Record<string, { reason: string; own: boolean; hours: number; times: number }> = {}
  allStops.forEach(x => { const k = `${x.reason}|${x.own}`; const e = (reasons[k] ||= { reason: x.reason, own: x.own, hours: 0, times: 0 }); e.hours += x.hours; e.times += 1 })
  const downtime = Object.values(reasons).sort((a, b) => b.hours - a.hours)

  const byRig = rigs.map(rig => {
    const mine = s.whole.filter(l => l.rig === rig)
    const st = mine.flatMap(stops)
    const shift = sum(mine, l => l.shiftHours), drill = sum(mine, l => l.drillingHours)
    const own = sum(st.filter(x => x.own), x => x.hours), client = sum(st.filter(x => !x.own), x => x.hours)
    const m = sum(s.logs.filter(l => l.rig === rig), l => l.metresDrilled)
    const d = new Set(mine.map(l => l.date)).size
    return { rig, owner: ownerOf(state, mine[0] ?? { project: '', rig }), drilling: r1(drill), own: r1(own), client: r1(client), other: r1(Math.max(0, shift - drill - own - client)), metres: m, days: d, perDay: d ? m / d : 0, rop: drill ? m / drill : 0 }
  })

  const forms: Formation[] = ['Soft', 'Medium', 'Hard', 'Very Hard']
  const sizes = Array.from(new Set(s.logs.filter(l => l.metresDrilled > 0).map(l => l.holeSize))).sort()
  const byGround = forms.map(g => {
    const row: Record<string, number | string | null> = { ground: g }
    sizes.forEach(z => {
      const mine = s.whole.filter(l => ground(l) === g && l.holeSize === z && l.metresDrilled > 0)
      const h = sum(mine, l => l.drillingHours)
      row[z] = h > 0 ? Math.round((sum(mine, l => l.metresDrilled) / h) * 100) / 100 : null
    })
    return row
  }).filter(r => sizes.some(z => r[z] != null))

  const target = targetDays(state, s.logs)
  return {
    s, metres, core, recoveryPct: metres ? (core / metres) * 100 : 0, drillHours, shiftHours, ownHours, clientHours, days,
    rop: drillHours ? metres / drillHours : 0, productivePct: shiftHours ? (drillHours / shiftHours) * 100 : 0,
    rigs, ropTrend, metresTrend, downtime, byRig, sizes, byGround, target,
  }
}

export function operationsInsights(o: ReturnType<typeof operations>): Insight[] {
  const out: Insight[] = []
  const live = o.byRig.filter(r => r.drilling > 0)
  if (live.length >= 2) {
    const fast = [...live].sort((a, b) => b.rop - a.rop)[0], slow = [...live].sort((a, b) => a.rop - b.rop)[0]
    if (fast.rop > slow.rop * 1.15) out.push({
      id: 'rop', tone: 'warn', title: `${slow.rig} drills ${Math.round((1 - slow.rop / fast.rop) * 100)}% slower than ${fast.rig}`,
      detail: `${slow.rop.toFixed(2)} m a drilling hour against ${fast.rop.toFixed(2)} for ${fast.rig} ${o.s.label}.`,
      action: `Compare the two rigs' bits, ground and crews in Drillers and crew; at ${fast.rig}'s pace, ${slow.rig}'s ${f1(slow.drilling)} drilling hours would have made ${f1(slow.drilling * (fast.rop - slow.rop))} m more.`,
    })
  }
  const top = o.downtime[0]
  const lost = o.ownHours + o.clientHours
  if (top && lost > 0) out.push({
    id: 'stop', tone: top.own ? 'bad' : 'info',
    title: `${top.reason} is the biggest stop: ${r1(top.hours)} hours`,
    detail: `${Math.round((top.hours / lost) * 100)}% of all ${r1(lost)} stopped hours, over ${plural(top.times, 'shift')}. ${top.own ? 'Your own side: not billable.' : 'Client side: billable as standby.'}`,
    action: top.own ? 'Open Maintenance to see what failed, and when it last failed.' : 'Make sure each standby day is on the client\'s invoice.',
  })
  o.target.filter(t => t.days >= 5 && t.on / t.days < 0.5).sort((a, b) => a.on / a.days - b.on / b.days).slice(0, 2).forEach(t => out.push({
    id: `kpi_${t.rig}`, tone: 'warn', title: `${t.rig} met its ${t.target} m target on ${t.on} of ${t.days} days`,
    detail: `${Math.round((t.on / t.days) * 100)}% of its logged days ${o.s.label}.`,
    action: 'Look at its stops and its metres an hour above: a slow rig and a stopped rig need different fixes.',
  }))
  if (o.sizes.length >= 2) {
    const hard = o.byGround.find(g => g.ground === 'Hard')
    const [a, b] = o.sizes
    if (hard && hard[a] != null && hard[b] != null) out.push({
      id: 'size', tone: 'info', title: `In hard ground, ${b} drills ${Number(hard[b]).toFixed(2)} m an hour and ${a} ${Number(hard[a]).toFixed(2)}`,
      detail: 'Worth knowing when quoting a hole that changes size part way down.',
    })
  }
  if (o.metres > 0 && o.recoveryPct < 90) out.push({
    id: 'core', tone: 'warn', title: `Core recovery is ${o.recoveryPct.toFixed(1)}%`,
    detail: 'Under 90%. Many contracts deduct for low recovery.', action: 'Check core lifters and drilling speed in broken ground.',
  })
  return out
}

// ── HOLE BY HOLE ────────────────────────────────────────────────────────────

export function holeShifts(state: CostingState, hole: string) {
  const logs = state.shiftLogs.filter(l => l.holeNumber === hole)
    .sort((a, b) => `${a.date}${a.shift === 'Day' ? 0 : 1}`.localeCompare(`${b.date}${b.shift === 'Day' ? 0 : 1}`))
  let depth = 0
  return logs.map(l => {
    const from = l.meterStart ?? depth
    const to = l.meterEnd ?? from + l.metresDrilled
    depth = to
    const st = stops(l)
    return { l, from: r1(from), to: r1(to), label: `${shortDate(l.date)} ${l.shift === 'Day' ? 'D' : 'N'}`, own: sum(st.filter(x => x.own), x => x.hours), client: sum(st.filter(x => !x.own), x => x.hours), reasons: st.map(x => x.reason) }
  })
}

// ── MAINTENANCE ─────────────────────────────────────────────────────────────

export function maintenance(state: CostingState, f: Filters) {
  const s = scope(state, f)
  const m = s.maint
  const types = ['Breakdown', 'Preventive', 'Scheduled', 'Component Replacement'].map(t => {
    const mine = m.filter(x => x.maintenanceType === t)
    return { type: t, count: mine.length, hours: sum(mine, x => x.hours), cost: sum(mine, x => x.cost) }
  }).filter(t => t.count > 0)
  const wk = weeks(s.from, s.to, m.length ? m : s.logs)
  const trend = wk.map(w => {
    const mine = m.filter(x => weekOf(x.date) === w)
    return { week: shortDate(w), hours: sum(mine, x => x.hours), cost: sum(mine, x => x.cost) }
  })
  const comps: Record<string, { component: string; count: number; hours: number; cost: number }> = {}
  m.forEach(x => (x.component || 'Not stated').split(',').map(c => c.trim()).filter(Boolean).forEach(c => {
    const e = (comps[c] ||= { component: c, count: 0, hours: 0, cost: 0 }); e.count += 1; e.hours += x.hours; e.cost += x.cost
  }))
  const components = Object.values(comps).sort((a, b) => b.count - a.count || b.hours - a.hours)
  const rigs = Array.from(new Set([...s.logs.map(l => l.rig), ...m.map(x => x.rig)])).sort()
  const byRig = rigs.map(rig => {
    const mine = m.filter(x => x.rig === rig)
    const shifts = s.whole.filter(l => l.rig === rig)
    const days = new Set(shifts.map(l => l.date)).size
    // A breakdown event = a run of shifts stopped by a mechanical cause, counted once per start.
    const ownMech = shifts.filter(l => stops(l).some(x => x.own && /mechanical|hydraulic|electrical|breakdown|engine|pump/i.test(x.reason)))
    const events = Math.max(mine.filter(x => x.maintenanceType === 'Breakdown').length, new Set(ownMech.map(l => l.date)).size ? countRuns(ownMech.map(l => l.date)) : 0)
    return {
      rig, owner: ownerOf(state, { project: (mine[0] ?? shifts[0])?.project ?? '', rig }),
      logs: mine.length, hours: sum(mine, x => x.hours), cost: sum(mine, x => x.cost), days, events,
      mtbfDays: events ? days / events : null,
      engineOil: sum(mine, x => x.engineOilL ?? 0), hydraulicOil: sum(mine, x => x.hydraulicOilL ?? 0), transmissionOil: sum(mine, x => x.transmissionOilL ?? 0),
      stopHours: sum(ownMech.flatMap(stops).filter(x => x.own), x => x.hours),
    }
  })
  return { s, m, types, trend, components, byRig, hours: sum(m, x => x.hours), cost: sum(m, x => x.cost), breakdowns: m.filter(x => x.maintenanceType === 'Breakdown').length }
}
function countRuns(dates: string[]) {
  const d = Array.from(new Set(dates)).sort()
  return d.filter((x, i) => i === 0 || addDays(d[i - 1], 1) !== x).length
}

export function maintenanceInsights(x: ReturnType<typeof maintenance>): Insight[] {
  const out: Insight[] = []
  const c = x.components[0]
  if (c) out.push({ id: 'comp', tone: c.count >= 2 ? 'bad' : 'warn', title: `${c.component}: ${plural(c.count, 'repair')}, ${r1(c.hours)} hours`, detail: `${money(c.cost)} in service cost ${x.s.label}.`, action: c.count >= 2 ? 'The same part failing twice is a pattern: check its service interval and spare stock.' : 'Keep a spare on site if it stops the rig for days.' })
  const worst = x.byRig.filter(r => r.stopHours > 0).sort((a, b) => b.stopHours - a.stopHours)[0]
  if (worst) out.push({ id: 'rig', tone: 'warn', title: `${worst.rig} stood ${r1(worst.stopHours)} hours for its own breakdowns`, detail: `${worst.events ? `${plural(worst.events, 'breakdown')} in ${plural(worst.days, 'working day')}, about one every ${r1(worst.mtbfDays ?? 0)} days.` : ''} Every one of those hours carried crew and rig cost with no metres.` })
  if (x.m.length && !x.m.some(m => m.maintenanceType === 'Preventive' || m.maintenanceType === 'Scheduled')) out.push({ id: 'prev', tone: 'warn', title: 'Only breakdowns are logged', detail: 'No preventive or scheduled service is in the record for this period.', action: 'Ask supervisors to log routine services too, so the next failure can be seen coming.' })
  if (!x.m.length && x.s.logs.length) out.push({ id: 'none', tone: 'info', title: 'No maintenance logged', detail: `Drill logs are coming in, but no maintenance log for ${x.s.label}.`, action: 'Ask supervisors to log every service, even an oil change.' })
  return out
}

// ── DRILLERS AND CREW ───────────────────────────────────────────────────────

export function crew(state: CostingState, f: Filters) {
  const s = scope(state, f)
  const names = Array.from(new Set(s.whole.map(l => l.driller).filter(Boolean))) as string[]
  const drillers = names.map(name => {
    const mine = s.whole.filter(l => l.driller === name)
    const ids = new Set(mine.map(l => l.id))
    const metres = sum(s.logs.filter(l => ids.has(l.id) || (l.segmentOf && ids.has(l.segmentOf))), l => l.metresDrilled)
    const core = sum(s.logs.filter(l => ids.has(l.id) || (l.segmentOf && ids.has(l.segmentOf))), l => l.coreRecovery)
    const hours = sum(mine, l => l.drillingHours)
    const own = sum(mine.flatMap(stops).filter(x => x.own), x => x.hours)
    const rigs = Array.from(new Set(mine.map(l => l.rig)))
    return { name, rigs, owner: ownerOf(state, mine[0]), shifts: mine.length, metres, hours, rop: hours ? metres / hours : 0, perShift: mine.length ? metres / mine.length : 0, own, recovery: metres ? (core / metres) * 100 : 0 }
  }).sort((a, b) => b.metres - a.metres)
  const wk = weeks(s.from, s.to, s.logs)
  const hours = wk.map(w => {
    const mine = s.whole.filter(l => weekOf(l.date) === w)
    const shift = sum(mine, l => l.shiftHours), drill = sum(mine, l => l.drillingHours)
    return { week: shortDate(w), crewHours: sum(mine, l => l.crewCount * l.shiftHours), drilling: drill, utilisation: shift ? Math.round((drill / shift) * 100) : null }
  })
  return { s, drillers, hours, heads: sum(s.whole, l => l.crewCount), shiftHours: sum(s.whole, l => l.shiftHours), drillHours: sum(s.whole, l => l.drillingHours) }
}

export function crewInsights(c: ReturnType<typeof crew>): Insight[] {
  const out: Insight[] = []
  const d = c.drillers.filter(x => x.shifts >= 4)
  if (d.length >= 2) {
    const best = [...d].sort((a, b) => b.rop - a.rop)[0], worst = [...d].sort((a, b) => a.rop - b.rop)[0]
    if (best.rop > worst.rop * 1.15) out.push({ id: 'rop', tone: 'info', title: `${best.name} drills fastest: ${best.rop.toFixed(2)} m an hour`, detail: `${worst.name} is slowest at ${worst.rop.toFixed(2)} (${worst.rigs.join(', ')}). Ground and rig differ too, so compare drillers on the same rig first.`, action: best.rigs.some(r => worst.rigs.includes(r)) ? `Both work ${best.rigs.find(r => worst.rigs.includes(r))}: pair them for a few shifts.` : undefined })
    const stops = [...d].sort((a, b) => b.own / b.shifts - a.own / a.shifts)[0]
    if (stops.own > 0) out.push({ id: 'stops', tone: 'warn', title: `${stops.name}'s shifts lose the most to own stops`, detail: `${r1(stops.own)} hours over ${plural(stops.shifts, 'shift')}, ${r1(stops.own / stops.shifts)} a shift.` })
  }
  const util = c.shiftHours ? (c.drillHours / c.shiftHours) * 100 : 0
  if (c.shiftHours > 0) out.push({ id: 'util', tone: util < 65 ? 'warn' : 'good', title: `The bit was on bottom ${Math.round(util)}% of shift time`, detail: `${f1(c.drillHours)} drilling hours out of ${f1(c.shiftHours)} shift hours, ${c.s.label}.`, action: util < 65 ? 'Tripping, moves and stops take the rest: Operations shows which.' : undefined })
  return out
}

// ── CONSUMABLES ─────────────────────────────────────────────────────────────

export function consumables(state: CostingState, inv: InvState, f: Filters) {
  const s = scope(state, f)
  const own = s.whole.filter(l => !workOrderFor(state, l.project, l.rig))
  const ownMetres = sum(s.logs.filter(l => !workOrderFor(state, l.project, l.rig)), l => l.metresDrilled)
  const wk = weeks(s.from, s.to, s.logs)
  const fluids = wk.map(w => {
    const mine = own.filter(l => weekOf(l.date) === w)
    const m = sum(s.logs.filter(l => weekOf(l.date) === w && !workOrderFor(state, l.project, l.rig)), l => l.metresDrilled)
    const fuel = sum(mine, l => l.fuelLitres)
    return { week: shortDate(w), fuel, water: sum(mine, l => l.waterLitres), additives: sum(mine, l => l.additivesKg), fuelPerMetre: m ? r1(fuel / m) : null }
  })
  const rigs = Array.from(new Set(own.map(l => l.rig))).sort()
  const byRig = rigs.map(rig => {
    const mine = own.filter(l => l.rig === rig)
    const m = sum(s.logs.filter(l => l.rig === rig), l => l.metresDrilled)
    const fuel = sum(mine, l => l.fuelLitres), water = sum(mine, l => l.waterLitres), additives = sum(mine, l => l.additivesKg)
    return { rig, metres: m, fuel, water, additives, fuelPerMetre: m ? fuel / m : 0, waterPerMetre: m ? water / m : 0, additivesPerMetre: m ? additives / m : 0 }
  })
  const part = (id: string) => inv.catalogue.find(p => p.id === id)
  const usedBy: Record<string, { itemId: string; name: string; qty: number; cost: number }> = {}
  own.forEach(l => (l.partsUsed ?? []).forEach(u => {
    const p = part(u.itemId); if (!p) return
    const e = (usedBy[u.itemId] ||= { itemId: u.itemId, name: p.name, qty: 0, cost: 0 }); e.qty += u.qty; e.cost += u.qty * p.rate
  }))
  const parts = Object.values(usedBy).sort((a, b) => b.cost - a.cost)
  const partsTrend = wk.map(w => ({ week: shortDate(w), cost: sum(own.filter(l => weekOf(l.date) === w).flatMap(l => l.partsUsed ?? []), u => u.qty * (part(u.itemId)?.rate ?? 0)) }))
  const equip: Record<string, number> = {}
  own.forEach(l => (l.equipmentUsed ?? []).forEach(e => { equip[e.name] = (equip[e.name] ?? 0) + e.hours }))
  const equipment = Object.entries(equip).map(([name, hours]) => ({ name, hours })).sort((a, b) => b.hours - a.hours)

  // What it all cost, from the same day costing as Finance.
  const cost = { fuel: 0, water: 0, additives: 0, tooling: 0, labour: 0, repairs: 0, ownership: 0, contractors: 0 }
  const pairs = Array.from(new Set(s.logs.map(l => `${l.project}|${l.rig}|${monthOf(l.date)}`)))
  pairs.forEach(k => {
    const [p, rig, m] = k.split('|')
    computeRigMonth(state, inv, p, rig, m).days.forEach(d => {
      if (!d.submitted || d.date < s.from || d.date > s.to) return
      cost.fuel += d.fuel; cost.water += d.water; cost.additives += d.additives; cost.tooling += d.parts
      cost.labour += d.labour.total; cost.repairs += d.repairs; cost.ownership += d.ownership; cost.contractors += d.subcontract
    })
  })
  const costRows = [
    { name: 'Fuel', value: cost.fuel }, { name: 'Crew and lodging', value: cost.labour }, { name: 'Rig ownership', value: cost.ownership },
    { name: 'Bits and parts', value: cost.tooling }, { name: 'Repairs', value: cost.repairs }, { name: 'Additives', value: cost.additives },
    { name: 'Water', value: cost.water }, { name: 'Contractors', value: cost.contractors },
  ].filter(r => r.value > 0).sort((a, b) => b.value - a.value)

  // Stock on each own rig: its kit and issues, less what the logs say was used up.
  const stock = rigs.flatMap(rig => {
    const projects = Array.from(new Set(own.filter(l => l.rig === rig).map(l => l.project)))
    return projects.flatMap(p => rigHoldings(inv.pos, inv.catalogue, rig, p, state.shiftLogs.filter(l => l.rig === rig && l.project === p).flatMap(l => l.partsUsed ?? []), inv.rigKit)
      .map(h => ({ rig, name: h.name, onRig: h.onRig, used: h.totalUsed, min: part(h.itemId)?.minStock ?? 0 })))
  }).filter(x => x.used > 0 || x.onRig <= x.min).sort((a, b) => (a.onRig - a.min) - (b.onRig - b.min))

  return { s, ownMetres, fluids, byRig, parts, partsTrend, equipment, costRows, stock, fuel: sum(own, l => l.fuelLitres), water: sum(own, l => l.waterLitres), additives: sum(own, l => l.additivesKg), partsCost: sum(parts, p => p.cost) }
}

export function consumablesInsights(c: ReturnType<typeof consumables>): Insight[] {
  const out: Insight[] = []
  const r = c.byRig.filter(x => x.metres > 20)
  if (r.length >= 2) {
    const hi = [...r].sort((a, b) => b.fuelPerMetre - a.fuelPerMetre)[0], lo = [...r].sort((a, b) => a.fuelPerMetre - b.fuelPerMetre)[0]
    if (hi.fuelPerMetre > lo.fuelPerMetre * 1.15) out.push({ id: 'fuel', tone: 'warn', title: `${hi.rig} burns ${r1(hi.fuelPerMetre)} litres a metre`, detail: `${Math.round((hi.fuelPerMetre / lo.fuelPerMetre - 1) * 100)}% more than ${lo.rig} (${r1(lo.fuelPerMetre)} L a metre). A slow rig burns fuel on hours, not metres.`, action: 'Check engine idling and slow drilling on that rig.' })
  }
  const big = c.costRows[0]
  const total = sum(c.costRows, x => x.value)
  if (big && total) out.push({ id: 'cost', tone: 'info', title: `Biggest cost: ${big.name.toLowerCase()}, ${Math.round((big.value / total) * 100)}% of the total`, detail: `${money(big.value)} of ${money(total)}, ${c.s.label}.` })
  const low = c.stock.filter(x => x.onRig <= x.min && x.min > 0).slice(0, 2)
  low.forEach(x => out.push({ id: `stock_${x.rig}_${x.name}`, tone: x.onRig <= 0 ? 'bad' : 'warn', title: `${x.rig}: ${x.onRig} left of ${x.name}`, detail: `At or under the minimum of ${x.min}.`, action: 'Issue more from the store, or order.', href: '/admin/inventory' }))
  if (c.ownMetres > 0 && c.partsCost === 0) out.push({ id: 'parts', tone: 'warn', title: 'No parts used are logged', detail: 'Drillers have not recorded any bit or part used up. Tooling cost still comes from the rig\'s kit, but stock on the rig cannot go down.', action: 'Ask drillers to add the part under Accessories when they change a bit.' })
  return out
}

// ── HEALTH AND SAFETY ───────────────────────────────────────────────────────

export function safety(state: CostingState, f: Filters) {
  const s = scope(state, f)
  const incidents = s.whole.flatMap(l => (l.incidents ?? []).map((i, n) => ({ id: `${l.id}_${n}`, date: l.date, rig: l.rig, project: l.project, shift: l.shift, type: i.type || 'Not stated', severity: i.severity || 'Not stated', note: i.note })))
  const count = (key: 'type' | 'severity') => Object.entries(incidents.reduce((a, i) => ({ ...a, [i[key]]: (a[i[key]] ?? 0) + 1 }), {} as Record<string, number>)).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  const wk = weeks(s.from, s.to, s.logs)
  const trend = wk.map(w => ({ week: shortDate(w), incidents: incidents.filter(i => weekOf(i.date) === w).length }))
  const shifts = s.whole.length
  return { s, incidents: incidents.sort((a, b) => b.date.localeCompare(a.date)), byType: count('type'), bySeverity: count('severity'), trend, shifts, crewShifts: sum(s.whole, l => l.crewCount) }
}

export function safetyInsights(x: ReturnType<typeof safety>): Insight[] {
  if (!x.shifts) return []
  if (!x.incidents.length) return [{ id: 'none', tone: 'warn', title: `No incident or near miss logged in ${plural(x.shifts, 'shift')}`, detail: 'A site that logs nothing is usually a site that does not report, not one where nothing happens.', action: 'Remind supervisors that near misses go on the drill log under Incidents.' }]
  const out: Insight[] = []
  const serious = x.incidents.filter(i => /high|serious|major|critical/i.test(i.severity))
  out.push({ id: 'count', tone: serious.length ? 'bad' : 'info', title: `${plural(x.incidents.length, 'incident')} in ${plural(x.shifts, 'shift')}`, detail: `${serious.length ? `${plural(serious.length, 'serious one')}. ` : ''}Most often: ${x.byType[0]?.name}.` })
  const byRig = Object.entries(x.incidents.reduce((a, i) => ({ ...a, [i.rig]: (a[i.rig] ?? 0) + 1 }), {} as Record<string, number>)).sort((a, b) => b[1] - a[1])[0]
  if (byRig && byRig[1] >= 2) out.push({ id: 'rig', tone: 'warn', title: `${byRig[0]} has the most: ${byRig[1]}`, detail: 'Go through them with its supervisor.' })
  return out
}

/* The Dashboard's own insights: the money questions, across everything. */
export interface DashboardInsightInput {
  rigs: { name: string; kind: 'own' | 'contractor'; metres: number; days: number; cost: number; revenue: number; costPerMetre: number; marginPerMetre: number; ratePerMetre: number; onTargetDays: number; targetDays: number }[]
}
export function dashboardInsights(x: DashboardInsightInput): Insight[] {
  const out: Insight[] = []
  const rigs = x.rigs.filter(r => r.metres > 0)
  const ranked = [...rigs].sort((a, b) => b.marginPerMetre - a.marginPerMetre)
  const best = ranked[0], worst = ranked[ranked.length - 1]
  if (worst && worst.marginPerMetre < 0) out.push({
    id: 'loss', tone: 'bad', title: `${worst.name} is losing ${money(-worst.marginPerMetre)} on every metre`,
    detail: `It cost ${money(worst.costPerMetre)} a metre against ${money(worst.ratePerMetre)} billed: ${money(worst.revenue - worst.cost)} over ${plural(worst.days, 'day')}.`,
    action: worst.kind === 'own' ? 'Open its costing: a slow rig carries crew and rig cost on fewer metres.' : 'Check its work order rates against the client rates.',
    href: '/admin/intelligence/contractors',
  })
  if (best && worst && best !== worst && best.marginPerMetre > 0) out.push({
    id: 'best', tone: 'good', title: `${best.name} leaves the most: ${money(best.marginPerMetre)} a metre`,
    detail: `${money(best.revenue - best.cost)} on ${Math.round(best.metres).toLocaleString('en-US')} m, against ${money(worst.marginPerMetre)} a metre for ${worst.name}.`,
    href: '/admin/intelligence/contractors',
  })
  rigs.filter(r => r.kind === 'own' && r.days >= 5 && r.ratePerMetre > 0).forEach(r => {
    const perDay = r.cost / r.days
    const need = perDay / r.ratePerMetre
    const makes = r.metres / r.days
    // Only a rig near or under its break-even line: one well clear of it needs no warning.
    if (makes > need * 1.3) return
    out.push({
      id: `be_${r.name}`, tone: makes < need ? 'bad' : 'info',
      title: `${r.name} needs ${r1(need)} m a day to break even`,
      detail: `It costs about ${money(perDay)} a day and earns ${money(r.ratePerMetre)} a metre on average. It is making ${r1(makes)} m a day.`,
      action: makes < need ? 'Every day under that line loses money: fix its stops before anything else.' : undefined,
      href: '/admin/finance',
    })
  })
  rigs.filter(r => r.targetDays >= 5 && r.onTargetDays === 0).forEach(r => out.push({
    id: `kpi_${r.name}`, tone: 'warn', title: `${r.name} has not met its daily target once`, detail: `0 of ${r.targetDays} days.`, href: '/admin/analytics/operation',
  }))
  return out.slice(0, 5)
}
