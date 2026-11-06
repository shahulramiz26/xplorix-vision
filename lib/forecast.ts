'use client'

import {
  chargeShift, versionOn, monthOf, shiftMonth, daysInMonth, monthLabel, isOwnStop, shiftOrder, clientOf,
  isOverdue, outstanding, disputedAmount, money, moneyL,
  type ShiftLog, type ClientRate,
} from './costing-store'
import { computeRigMonth, type CostingState, type InvState } from './costing-view'
import { holesFromLogs, shortDate, type LiveHole } from './client-record'
import {
  TODAY, COMPLETED_PROJECTS, stockInStore, onOrder, partWorksIn, normFormation as groundOf,
  addDays, daysBetween, type Part, type Formation,
} from './inventory-store'

/* ==========================================================================
 * LOOKING AHEAD — this month, next month and every open hole
 *
 * Nothing here is typed in and nothing is guessed. It is a walk forward, one
 * day at a time, from what the logs already say:
 *
 *   1. how many metres a day each rig has really been making, stoppage days
 *      included, over the last 30 days;
 *   2. what is left of the hole it is on, and which planned holes come next;
 *   3. the client rate that applies to each metre at the depth and in the
 *      ground it will be drilled in;
 *   4. what a rig-day and a metre have really been costing;
 *   5. what is in the store, what is on order, and how long each part lasts.
 *
 * From the walk come the metres, the money, the parts — and the things that
 * go wrong on the way: a rig that runs out of planned holes, a part that runs
 * out before an order can arrive, money that is drilled but cannot be billed.
 *
 * It is a projection from the company's own record, not a trained model.
 * It gets sharper as more shifts are logged, and it is honest about its range:
 * the low and high cases are each rig's slowest and best month on record.
 * ========================================================================== */

const MOVE_DAYS = 1          // a rig move between two holes
const BUCKET = 10            // metres: how finely ground is learned by depth
const WINDOW = 30            // days of logs the daily rate is taken from

export type Likelihood = 'High' | 'Medium' | 'Low'
export type Tone = 'good' | 'warn' | 'bad' | 'info' | 'neutral'

export interface Segment {
  kind: 'hole' | 'move' | 'idle'
  hole?: string
  from: string; to: string; days: number
  metres: number
  planned?: number
  closes?: boolean
}

export interface PeriodNumbers {
  metres: number; low: number; high: number
  revenue: number; cost: number; margin: number; marginPct: number
  drillDays: number; moveDays: number; idleDays: number
  ratePerMetre: number; costPerMetre: number
}

export interface RigForecast {
  rig: string; project: string
  contractor: boolean
  mtd: { metres: number; revenue: number; cost: number; days: number }
  perDay: number; slow: number; fast: number
  loggedDays: number; zeroDays: number
  ownHours: number; ownEvents: number; clientHours: number
  fixedPerDay: number; variablePerMetre: number
  hole?: { id: string; drilled: number; planned?: number }
  segments: Segment[]
  rest: PeriodNumbers; next: PeriodNumbers
  idleFrom?: string
  lastHoleEnds?: string
}

export interface PartNeed {
  part: Part
  need: number                 // units worn out over the forecast
  inStore: number
  onOrderQty: number; onOrderDue?: string; onOrderLate: number    // days late, 0 if not
  runOut?: string              // the day the store has none left
  orderBy?: string             // last day an order still arrives in time
  gapDays: number              // days without the part if ordered today
  toOrder: number; spend: number
  status: 'covered' | 'order' | 'late'
}

export interface SwotItem { title: string; detail: string; figure?: string; href?: string }
export interface Swot { strengths: SwotItem[]; weaknesses: SwotItem[]; opportunities: SwotItem[]; threats: SwotItem[] }

export type RiskArea = 'holes' | 'rigs' | 'stock' | 'money' | 'contractors' | 'safety'
export const RISK_AREA_LABEL: Record<RiskArea, string> = {
  holes: 'Holes and plan', rigs: 'Rigs', stock: 'Parts and stock', money: 'Money', contractors: 'Contractors', safety: 'Safety',
}

export interface Risk {
  key: string
  area: RiskArea
  title: string
  detail: string
  when: string
  impact: number | null
  impactNote: string
  likelihood: Likelihood
  action: string
  href: string
  linkLabel: string
}

export interface Closing { hole: string; rig: string; project: string; date: string; value: number }

/* When a hole will reach its planned depth. The expected date uses the rig's
 * last 30 days; earliest and latest use its best and slowest month on record. */
export interface HoleFinish {
  hole: string; rig: string; project: string
  contractor: boolean
  state: 'drilling' | 'next' | 'left'     // on the rig now, waiting its turn, or open with no rig on it
  drilled: number; planned?: number; left: number
  perDay: number
  starts?: string
  finish?: string; earliest?: string; latest?: string
  daysLeft?: number
  valueNow: number; valueAtFinish: number
  problem?: 'no-plan' | 'at-depth' | 'no-rig' | 'beyond'
}

export interface Forecast {
  today: string
  thisMonth: string; nextMonth: string
  horizonStart: string; horizonEnd: string
  rigs: RigForecast[]
  rest: PeriodNumbers; next: PeriodNumbers
  mtd: { metres: number; revenue: number; cost: number; margin: number; marginPct: number; days: number }
  thisMonthTotal: { metres: number; revenue: number; cost: number; margin: number; marginPct: number; low: number; high: number }
  lastMonth: { month: string; metres: number; revenue: number; cost: number; margin: number; marginPct: number }
  /* One row a day from the first of this month to the end of next: what the
   * logs say up to today, and the walk after it. */
  daily: { date: string; metres: number; forecast: boolean }[]
  holeFinish: HoleFinish[]
  farEnd: string
  byProject: { project: string; rigs: number; metres: number; revenue: number; cost: number; margin: number; idleDays: number; plannedLeft: number; lastHoleEnds?: string }[]
  closings: Closing[]
  cash: {
    dueNext: number; dueNextCount: number
    overdue: number; overdueCount: number
    disputed: number
    readyToInvoice: number; readyCount: number
    notApproved: number; notApprovedCount: number
    closingValue: number
    stuckOpen: { hole: string; drilled: number; planned: number; value: number; rig: string; project: string }[]
  }
  parts: PartNeed[]
  partsSpend: number
  swot: Swot
  risks: Risk[]
  basis: string[]
  headline: { tone: Tone; text: string }
}

const order = shiftOrder
const sum = <T,>(list: T[], f: (x: T) => number) => list.reduce((s, x) => s + f(x), 0)
const round = (n: number) => Math.round(n)
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// ── ground by depth ───────────────────────────────────────────────────────

interface GroundModel { at: (depth: number) => string }

/* What ground a project's holes have been in at each depth. A new hole on the
 * same project is assumed to meet the same ground at the same depth — soft
 * near surface, harder below — which decides both the rate it earns on a
 * formation contract and which parts it wears. */
function groundModel(logs: ShiftLog[], project: string): GroundModel {
  const byHole: Record<string, ShiftLog[]> = {}
  logs.forEach(l => { if (l.project === project && l.holeNumber && l.metresDrilled > 0) (byHole[l.holeNumber] ||= []).push(l) })
  const buckets: Record<number, Record<string, number>> = {}
  const overall: Record<string, number> = {}
  Object.values(byHole).forEach(raw => {
    let depth = 0
    ;[...raw].sort((a, b) => order(a).localeCompare(order(b))).forEach(l => {
      const to = depth + l.metresDrilled
      let d = depth
      while (d < to - 1e-9) {
        const b = Math.floor(d / BUCKET)
        const hi = Math.min(to, (b + 1) * BUCKET)
        ;(buckets[b] ||= {})[l.formationType] = (buckets[b][l.formationType] ?? 0) + (hi - d)
        d = hi
      }
      overall[l.formationType] = (overall[l.formationType] ?? 0) + l.metresDrilled
      depth = to
    })
  })
  const top = (o?: Record<string, number>) => o ? Object.entries(o).sort((a, b) => b[1] - a[1])[0]?.[0] : undefined
  const fallback = top(overall) ?? 'Hard Formation'
  return {
    at(depth: number) {
      for (let b = Math.floor(depth / BUCKET); b >= 0; b--) {
        const f = top(buckets[b])
        if (f) return f
      }
      return fallback
    },
  }
}

/* What a stretch of hole earns and which ground it is in. */
function priceStretch(cr: ClientRate | undefined, ground: GroundModel, size: string, from: number, to: number) {
  let revenue = 0
  const byGround: Partial<Record<Formation, number>> = {}
  let d = from
  while (d < to - 1e-9) {
    const hi = Math.min(to, (Math.floor(d / BUCKET + 1e-9) + 1) * BUCKET)
    const formation = ground.at(d)
    const stretch = { holeSize: size, formationType: formation, metresDrilled: hi - d, date: '', shift: 'Day', holeNumber: null } as unknown as ShiftLog
    chargeShift(cr, stretch, d).forEach(c => { revenue += c.amount })
    const g = groundOf(formation)
    byGround[g] = (byGround[g] ?? 0) + (hi - d)
    d = hi
  }
  return { revenue, byGround }
}

// ── the walk ──────────────────────────────────────────────────────────────

interface DayRow {
  date: string; rig: string; project: string
  kind: 'hole' | 'move' | 'idle'
  hole?: string; planned?: number
  metres: number; revenue: number
  byGround: Partial<Record<Formation, number>>
  closes?: boolean
}

interface RigStart {
  rig: string; project: string; size: string
  hole: { id: string; depth: number; planned: number } | null
}

function walk(
  starts: RigStart[], queues: Record<string, { id: string; planned: number }[]>,
  rate: (rig: string) => number, from: string, to: string,
  rates: (project: string, date: string) => ClientRate | undefined, ground: Record<string, GroundModel>,
): DayRow[] {
  const queue: Record<string, { id: string; planned: number }[]> = {}
  Object.entries(queues).forEach(([p, q]) => { queue[p] = [...q] })
  const state = starts.map(s => ({ ...s, hole: s.hole ? { ...s.hole } : null, move: 0, next: null as { id: string; planned: number } | null }))
  const rows: DayRow[] = []
  for (let date = from; date <= to; date = addDays(date, 1)) {
    state.forEach(s => {
      const base = { date, rig: s.rig, project: s.project, metres: 0, revenue: 0, byGround: {} }
      if (s.move > 0) {
        s.move -= 1
        if (s.move === 0 && s.next) { s.hole = { id: s.next.id, depth: 0, planned: s.next.planned }; s.next = null }
        rows.push({ ...base, kind: 'move' })
        return
      }
      if (!s.hole) {
        const n = queue[s.project]?.shift()
        if (n) s.hole = { id: n.id, depth: 0, planned: n.planned }
      }
      if (!s.hole) { rows.push({ ...base, kind: 'idle' }); return }
      const metres = Math.max(0, Math.min(rate(s.rig), s.hole.planned - s.hole.depth))
      const priced = priceStretch(rates(s.project, date), ground[s.project], s.size, s.hole.depth, s.hole.depth + metres)
      s.hole.depth += metres
      const closes = s.hole.depth >= s.hole.planned - 1e-6
      rows.push({ ...base, kind: 'hole', hole: s.hole.id, planned: s.hole.planned, metres, revenue: priced.revenue, byGround: priced.byGround, closes })
      if (closes) {
        s.hole = null
        const n = queue[s.project]?.shift()
        if (n) { s.next = n; s.move = MOVE_DAYS }
      }
    })
  }
  return rows
}

function segmentsOf(rows: DayRow[]): Segment[] {
  const out: Segment[] = []
  rows.forEach(r => {
    const last = out[out.length - 1]
    if (last && last.kind === r.kind && last.hole === r.hole) {
      last.to = r.date; last.days += 1; last.metres += r.metres
      if (r.closes) last.closes = true
    } else {
      out.push({ kind: r.kind, hole: r.hole, from: r.date, to: r.date, days: 1, metres: r.metres, planned: r.planned, closes: r.closes })
    }
  })
  return out
}

function period(rows: DayRow[], low: number, high: number, fixedPerDay: (rig: string) => number, variablePerMetre: (rig: string) => number): PeriodNumbers {
  const metres = sum(rows, r => r.metres)
  const revenue = sum(rows, r => r.revenue)
  const cost = sum(rows, r => fixedPerDay(r.rig) + r.metres * variablePerMetre(r.rig))
  const margin = revenue - cost
  return {
    metres, low: Math.min(low, metres), high: Math.max(high, metres), revenue, cost, margin,
    marginPct: revenue > 0 ? (margin / revenue) * 100 : 0,
    drillDays: rows.filter(r => r.kind === 'hole').length,
    moveDays: rows.filter(r => r.kind === 'move').length,
    idleDays: rows.filter(r => r.kind === 'idle').length,
    ratePerMetre: metres > 0 ? revenue / metres : 0,
    costPerMetre: metres > 0 ? cost / metres : 0,
  }
}

// ── the forecast ──────────────────────────────────────────────────────────

export function buildForecast(costing: CostingState, inv: InvState, today: string = TODAY): Forecast {
  const logs = costing.shiftLogs
  const thisMonth = monthOf(today)
  const nextMonth = shiftMonth(thisMonth, 1)
  const horizonStart = addDays(today, 1)
  const restEnd = `${thisMonth}-${String(daysInMonth(thisMonth)).padStart(2, '0')}`
  const horizonEnd = `${nextMonth}-${String(daysInMonth(nextMonth)).padStart(2, '0')}`
  const windowStart = addDays(today, -(WINDOW - 1))
  const holes = holesFromLogs(costing)
  const holeById = new Map(holes.map(h => [h.id, h]))
  const plans = costing.holePlans ?? {}
  // Rigs that belong to a contractor working for us. Their metres and billing
  // are ours to forecast; their breakdowns, crew and parts are not.
  const contractorRigs = new Set(logs.filter(l => l.contractor).map(l => l.rig))

  // ── rigs that are working now ────────────────────────────────────────────
  const rigNames = Array.from(new Set(logs.map(l => l.rig))).sort()
  const live = rigNames.map(rig => {
    const mine = logs.filter(l => l.rig === rig).sort((a, b) => order(a).localeCompare(order(b)))
    const latest = mine[mine.length - 1]
    return { rig, mine, latest }
  }).filter(r => r.latest && !COMPLETED_PROJECTS.includes(r.latest.project) && daysBetween(r.latest.date, today) <= 14)

  const projects = Array.from(new Set(live.map(r => r.latest.project)))
  const ground: Record<string, GroundModel> = {}
  projects.forEach(p => { ground[p] = groundModel(logs, p) })
  const rateOn = (project: string, date: string) => versionOn(costing.clientRates.filter(c => c.project === project), date)

  // ── how each rig has really been drilling ────────────────────────────────
  const facts = live.map(({ rig, mine, latest }) => {
    const project = latest.project
    const recent = mine.filter(l => l.date >= windowStart && l.date <= today && l.project === project)
    const dates = Array.from(new Set(recent.map(l => l.date)))
    const metres = sum(recent, l => l.metresDrilled)
    const perDay = dates.length ? metres / dates.length : 0
    const zeroDays = dates.filter(d => sum(recent.filter(l => l.date === d), l => l.metresDrilled) === 0).length

    // Each month on record, as metres per logged day. The slowest and the best
    // are the low and high cases: things this rig has actually done.
    const byMonth: Record<string, { m: number; d: Set<string> }> = {}
    mine.filter(l => l.project === project).forEach(l => {
      const e = (byMonth[monthOf(l.date)] ||= { m: 0, d: new Set() })
      e.m += l.metresDrilled; e.d.add(l.date)
    })
    const monthly = Object.values(byMonth).filter(e => e.d.size >= 8).map(e => e.m / e.d.size)
    const slow = Math.min(perDay * 0.9, ...monthly)
    const fast = Math.max(perDay * 1.1, ...monthly)

    const own = recent.filter(l => l.downtimeHours > 0 && isOwnStop(l))
    const client = recent.filter(l => l.downtimeHours > 0 && !isOwnStop(l))

    // What a rig-day and a metre have cost, this month and last.
    let fixed = 0, variable = 0, days = 0, units = 0
    ;[thisMonth, shiftMonth(thisMonth, -1)].forEach(m => {
      computeRigMonth(costing, inv, project, rig, m).days.forEach(d => {
        if (!d.submitted) return
        // A contractor's rig is paid by the metre, so what it costs moves with metres too.
        const v = d.fuel + d.water + d.additives + d.parts + d.subcontract
        variable += v; fixed += d.total - v; days += 1; units += d.units
      })
    })

    const withHole = [...mine].reverse().find(l => l.holeNumber)
    const h = withHole?.holeNumber ? holeById.get(withHole.holeNumber) : undefined
    const current = h && h.status === 'drilling' ? h : undefined
    return {
      rig, project, size: latest.holeSize, perDay, slow, fast,
      loggedDays: dates.length, zeroDays,
      ownHours: sum(own, l => l.downtimeHours), ownEvents: own.length,
      clientHours: sum(client, l => l.downtimeHours),
      fixedPerDay: days ? fixed / days : 0, variablePerMetre: units ? variable / units : 0,
      current,
    }
  })
  const fact = (rig: string) => facts.find(f => f.rig === rig)!

  // ── what there is to drill ───────────────────────────────────────────────
  const starts: RigStart[] = facts.map(f => ({
    rig: f.rig, project: f.project, size: f.size,
    hole: f.current ? { id: f.current.id, depth: f.current.drilled, planned: Math.max(f.current.planned ?? f.current.drilled, f.current.drilled) } : null,
  }))
  const queues: Record<string, { id: string; planned: number }[]> = {}
  projects.forEach(p => {
    queues[p] = Object.entries(plans)
      .filter(([id, plan]) => plan.project === p && !holeById.has(id) && plan.plannedDepth > 0)
      .map(([id, plan]) => ({ id, planned: plan.plannedDepth }))
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
  })

  const run = (pick: (f: typeof facts[number]) => number) =>
    walk(starts, queues, rig => pick(fact(rig)), horizonStart, horizonEnd, rateOn, ground)
  const rows = run(f => f.perDay)
  const slowRows = run(f => f.slow)
  const fastRows = run(f => f.fast)
  // Further out, to see when the planned holes end for rigs that are still
  // busy at the end of next month, and when each open hole will be finished.
  const farEnd = addDays(horizonEnd, 120)
  const farRows = walk(starts, queues, rig => fact(rig).perDay, horizonStart, farEnd, rateOn, ground)
  const farSlow = walk(starts, queues, rig => fact(rig).slow, horizonStart, farEnd, rateOn, ground)
  const farFast = walk(starts, queues, rig => fact(rig).fast, horizonStart, farEnd, rateOn, ground)

  const inRest = (r: DayRow) => r.date <= restEnd
  const inNext = (r: DayRow) => r.date > restEnd
  const fixedOf = (rig: string) => fact(rig).fixedPerDay
  const varOf = (rig: string) => fact(rig).variablePerMetre
  const numbers = (f: (r: DayRow) => boolean, rig?: string) => {
    const pick = (list: DayRow[]) => list.filter(r => f(r) && (!rig || r.rig === rig))
    return period(pick(rows), sum(pick(slowRows), r => r.metres), sum(pick(fastRows), r => r.metres), fixedOf, varOf)
  }

  const rigs: RigForecast[] = facts.map(f => {
    const mine = rows.filter(r => r.rig === f.rig)
    const far = farRows.filter(r => r.rig === f.rig)
    const firstIdle = far.find(r => r.kind === 'idle')
    const lastDrill = [...far].reverse().find(r => r.kind === 'hole')
    const m = { metres: 0, revenue: 0, cost: 0, days: 0 }
    Array.from(new Set(logs.filter(l => l.rig === f.rig && monthOf(l.date) === thisMonth).map(l => l.project))).forEach(project => {
      computeRigMonth(costing, inv, project, f.rig, thisMonth).days.forEach(d => {
        if (!d.submitted) return
        m.metres += d.units; m.revenue += d.revenue; m.cost += d.total; m.days += 1
      })
    })
    return {
      rig: f.rig, project: f.project, perDay: f.perDay, slow: f.slow, fast: f.fast,
      contractor: contractorRigs.has(f.rig), mtd: m,
      loggedDays: f.loggedDays, zeroDays: f.zeroDays,
      ownHours: f.ownHours, ownEvents: f.ownEvents, clientHours: f.clientHours,
      fixedPerDay: f.fixedPerDay, variablePerMetre: f.variablePerMetre,
      hole: f.current ? { id: f.current.id, drilled: f.current.drilled, planned: f.current.planned } : undefined,
      segments: segmentsOf(mine),
      rest: numbers(inRest, f.rig), next: numbers(inNext, f.rig),
      idleFrom: firstIdle?.date,
      lastHoleEnds: firstIdle ? lastDrill?.date : undefined,
    }
  })

  const rest = numbers(inRest)
  const next = numbers(inNext)

  // ── this month so far ────────────────────────────────────────────────────
  const mtd = { metres: 0, revenue: 0, cost: 0, margin: 0, marginPct: 0, days: 0 }
  const pairs = new Map<string, { project: string; rig: string }>()
  logs.forEach(l => { if (monthOf(l.date) === thisMonth) pairs.set(`${l.project}|${l.rig}`, { project: l.project, rig: l.rig }) })
  pairs.forEach(({ project, rig }) => {
    computeRigMonth(costing, inv, project, rig, thisMonth).days.forEach(d => {
      if (!d.submitted) return
      mtd.metres += d.units; mtd.revenue += d.revenue; mtd.cost += d.total; mtd.days += 1
    })
  })
  mtd.margin = mtd.revenue - mtd.cost
  mtd.marginPct = mtd.revenue ? (mtd.margin / mtd.revenue) * 100 : 0
  const tm = { metres: mtd.metres + rest.metres, revenue: mtd.revenue + rest.revenue, cost: mtd.cost + rest.cost }
  const thisMonthTotal = {
    ...tm, margin: tm.revenue - tm.cost, marginPct: tm.revenue ? ((tm.revenue - tm.cost) / tm.revenue) * 100 : 0,
    low: mtd.metres + rest.low, high: mtd.metres + rest.high,
  }

  // ── last month, as it closed ─────────────────────────────────────────────
  const prev = shiftMonth(thisMonth, -1)
  const lm = { metres: 0, revenue: 0, cost: 0 }
  const prevPairs = new Map<string, { project: string; rig: string }>()
  logs.forEach(l => { if (monthOf(l.date) === prev) prevPairs.set(`${l.project}|${l.rig}`, { project: l.project, rig: l.rig }) })
  prevPairs.forEach(({ project, rig }) => {
    computeRigMonth(costing, inv, project, rig, prev).days.forEach(d => {
      if (!d.submitted) return
      lm.metres += d.units; lm.revenue += d.revenue; lm.cost += d.total
    })
  })
  const lastMonth = { month: prev, ...lm, margin: lm.revenue - lm.cost, marginPct: lm.revenue ? ((lm.revenue - lm.cost) / lm.revenue) * 100 : 0 }

  // ── day by day: the record to today, the walk after it ───────────────────
  const daily: Forecast['daily'] = []
  for (let d = `${thisMonth}-01`; d <= horizonEnd; d = addDays(d, 1)) {
    daily.push(d <= today
      ? { date: d, metres: sum(logs.filter(l => l.date === d), l => l.metresDrilled), forecast: false }
      : { date: d, metres: sum(rows.filter(r => r.date === d), r => r.metres), forecast: true })
  }

  // ── by project ───────────────────────────────────────────────────────────
  const byProject = projects.map(project => {
    const mine = rows.filter(r => r.project === project && inNext(r))
    const p = period(mine, 0, 0, fixedOf, varOf)
    const far = farRows.filter(r => r.project === project)
    const lastDrill = [...far].reverse().find(r => r.kind === 'hole')
    const endsInside = far.some(r => r.kind === 'idle')
    const plannedLeft = sum(starts.filter(s => s.project === project && s.hole), s => s.hole!.planned - s.hole!.depth) + sum(queues[project] ?? [], q => q.planned)
    return {
      project, rigs: facts.filter(f => f.project === project).length,
      metres: p.metres, revenue: p.revenue, cost: p.cost, margin: p.margin, idleDays: p.idleDays,
      plannedLeft, lastHoleEnds: endsInside ? lastDrill?.date : undefined,
    }
  })

  // ── holes that will close, and what they will be worth ───────────────────
  const closings: Closing[] = rows.filter(r => r.closes && r.hole).map(r => {
    const drilledAlready = holeById.get(r.hole!)?.value ?? 0
    const toCome = sum(rows.filter(x => x.hole === r.hole), x => x.revenue)
    return { hole: r.hole!, rig: r.rig, project: r.project, date: r.date, value: drilledAlready + toCome }
  })

  // ── when each open hole will be finished ─────────────────────────────────
  const closeDate = (list: DayRow[], hole: string) => list.find(r => r.hole === hole && r.closes)?.date
  const seenHoles = Array.from(new Set(farRows.filter(r => r.kind === 'hole' && r.hole).map(r => r.hole!)))
  const holeFinish: HoleFinish[] = seenHoles.map(id => {
    const mine = farRows.filter(r => r.hole === id)
    const f = fact(mine[0].rig)
    const now = holeById.get(id)
    const isCurrent = f.current?.id === id
    const drilled = now?.drilled ?? 0
    const planned = now?.planned ?? plans[id]?.plannedDepth
    const finish = closeDate(farRows, id)
    const noPlan = isCurrent && !now?.planned
    const atDepth = isCurrent && !!now?.planned && drilled >= now.planned
    const valueNow = now?.value ?? 0
    return {
      hole: id, rig: f.rig, project: f.project, contractor: contractorRigs.has(f.rig),
      state: isCurrent ? 'drilling' as const : 'next' as const,
      drilled, planned, left: planned ? Math.max(0, planned - drilled) : 0, perDay: f.perDay,
      starts: isCurrent ? undefined : mine[0].date,
      finish: noPlan || atDepth ? undefined : finish,
      earliest: noPlan || atDepth ? undefined : closeDate(farFast, id),
      latest: noPlan || atDepth ? undefined : closeDate(farSlow, id),
      daysLeft: noPlan || atDepth || !finish ? undefined : daysBetween(today, finish),
      valueNow, valueAtFinish: valueNow + sum(mine, r => r.revenue),
      problem: noPlan ? 'no-plan' as const : atDepth ? 'at-depth' as const : !finish ? 'beyond' as const : undefined,
    }
  })
  const walked = new Set(holeFinish.map(h => h.hole))
  holes.filter(h => h.status === 'drilling' && !walked.has(h.id) && !COMPLETED_PROJECTS.includes(h.project)).forEach(h => {
    holeFinish.push({
      hole: h.id, rig: h.rig, project: h.project, contractor: contractorRigs.has(h.rig), state: 'left',
      drilled: h.drilled, planned: h.planned, left: h.planned ? Math.max(0, h.planned - h.drilled) : 0, perDay: 0,
      valueNow: h.value, valueAtFinish: h.value, problem: 'no-rig',
    })
  })
  const stateRank = { drilling: 0, left: 1, next: 2 }
  holeFinish.sort((a, b) => stateRank[a.state] - stateRank[b.state] || (a.finish ?? a.starts ?? '9999').localeCompare(b.finish ?? b.starts ?? '9999'))

  // ── cash ─────────────────────────────────────────────────────────────────
  const invoices = costing.invoices.filter(i => i.status !== 'cancelled' && i.status !== 'draft')
  const unpaid = invoices.filter(i => i.status !== 'paid')
  const dueNext = unpaid.filter(i => i.dueDate && monthOf(i.dueDate) === nextMonth)
  const overdue = unpaid.filter(i => isOverdue(i, today))
  const disputed = invoices.filter(i => i.ownerStatus === 'disputed')
  const ready = holes.filter(h => h.status === 'approved' && !h.invoiceId)
  const notApproved = holes.filter(h => h.status === 'closed' || h.status === 'submitted')
  const currentIds = new Set(facts.map(f => f.current?.id).filter(Boolean))
  const stuckOpen = holes
    .filter(h => h.status === 'drilling' && !currentIds.has(h.id) && !COMPLETED_PROJECTS.includes(h.project))
    .map(h => ({ hole: h.id, drilled: h.drilled, planned: h.planned ?? h.drilled, value: h.value, rig: h.rig, project: h.project }))
  const cash = {
    dueNext: sum(dueNext, outstanding), dueNextCount: dueNext.length,
    overdue: sum(overdue, outstanding), overdueCount: overdue.length,
    disputed: sum(disputed, disputedAmount),
    readyToInvoice: sum(ready, h => h.value), readyCount: ready.length,
    notApproved: sum(notApproved, h => h.value), notApprovedCount: notApproved.length,
    closingValue: sum(closings, c => c.value),
    stuckOpen,
  }

  // ── parts ────────────────────────────────────────────────────────────────
  const stock = stockInStore(inv.pos, today).filter(l => !COMPLETED_PROJECTS.includes(l.project))
  const coming = onOrder(inv.pos, today)
  const everOrdered = new Set(inv.pos.flatMap(p => p.lines.map(l => l.itemId)))
  const dates: string[] = []
  for (let d = horizonStart; d <= horizonEnd; d = addDays(d, 1)) dates.push(d)
  const groundByDate: Record<string, Partial<Record<Formation, number>>> = {}
  /* Only our own rigs wear our parts. A contractor's metres are left out of
   * the wear, or the forecast would order bits for rigs that bring their own. */
  rows.filter(r => !contractorRigs.has(r.rig)).forEach(r => {
    const e = (groundByDate[r.date] ||= {})
    ;(Object.entries(r.byGround) as [Formation, number][]).forEach(([g, m]) => { e[g] = (e[g] ?? 0) + m })
  })
  const parts: PartNeed[] = inv.catalogue.filter(p => p.active && everOrdered.has(p.id) && p.lifeMetres > 0).map(part => {
    const inStore = sum(stock.filter(l => l.itemId === part.id), l => l.qty)
    const mine = coming.filter(o => o.itemId === part.id)
    const onTime = mine.filter(o => o.promisedDate && o.promisedDate >= today)
    const late = mine.filter(o => !o.promisedDate || o.promisedDate < today)
    let worn = 0
    let runOut: string | undefined
    let capacityAtEnd = inStore * part.lifeMetres
    dates.forEach(date => {
      const arrived = sum(onTime.filter(o => o.promisedDate! <= date), o => o.qty)
      const capacity = (inStore + arrived) * part.lifeMetres
      const g = groundByDate[date] ?? {}
      worn += sum(Object.entries(g) as [Formation, number][], ([f, m]) => partWorksIn(part, f) ? m : 0)
      // The day the store is empty and stays empty: a delivery that lands
      // later and catches up clears it.
      if (worn > capacity + 1e-6) runOut ??= date
      else runOut = undefined
      capacityAtEnd = capacity
    })
    const need = worn / part.lifeMetres
    /* Only parts the month will wear out at least one of. A barrel or a swivel
     * with thousands of metres of life is on the rig already and will still be
     * there at the end of the month; listing it would bury the real orders. */
    const short = need >= 1 && !!runOut
    const toOrder = short ? Math.max(1, Math.ceil((worn - capacityAtEnd) / part.lifeMetres - 1e-6)) : 0
    const orderBy = short ? addDays(runOut!, -part.leadTimeDays) : undefined
    const gapDays = short ? Math.max(0, daysBetween(runOut!, addDays(today, part.leadTimeDays))) : 0
    return {
      part, need, inStore,
      onOrderQty: sum(mine, o => o.qty),
      onOrderDue: onTime.map(o => o.promisedDate!).sort()[0],
      onOrderLate: Math.max(0, ...late.map(o => o.overdueDays ?? 0)),
      runOut: short ? runOut : undefined, orderBy, gapDays,
      toOrder, spend: toOrder * part.rate,
      status: !short ? 'covered' as const : orderBy! < today ? 'late' as const : 'order' as const,
    }
  }).sort((a, b) => (a.runOut ?? '9999').localeCompare(b.runOut ?? '9999') || b.spend - a.spend)
  const partsSpend = sum(parts, p => p.spend)
  const shortParts = parts.filter(p => p.status !== 'covered')
  const lateParts = parts.filter(p => p.status === 'late')

  // ── reading it: strengths, weaknesses, opportunities, threats ────────────
  const nextLabel = monthLabel(nextMonth)
  const nextName = nextLabel.split(' ')[0]
  const idleRigs = rigs.filter(r => r.next.idleDays > 0)
  const idleDays = sum(rigs, r => r.next.idleDays)
  const idleCost = sum(rigs, r => r.next.idleDays * r.fixedPerDay)
  const idleBilling = sum(rigs, r => r.next.idleDays * r.perDay) * (next.ratePerMetre || 0)
  const steady = [...rigs].filter(r => r.loggedDays >= 10).sort((a, b) => (a.zeroDays / a.loggedDays) - (b.zeroDays / b.loggedDays) || b.perDay - a.perDay)[0]
  const ownRigs = rigs.filter(r => !contractorRigs.has(r.rig))
  const ownHours = sum(ownRigs, r => r.ownHours)
  const worstOwn = [...ownRigs].sort((a, b) => b.ownHours - a.ownHours)[0]
  const metresPerHour = (r: RigForecast) => {
    const recent = logs.filter(l => l.rig === r.rig && l.date >= windowStart && l.date <= today)
    const hours = sum(recent, l => l.drillingHours)
    return hours ? sum(recent, l => l.metresDrilled) / hours : 0
  }
  const ownMetresLost = sum(ownRigs, r => r.ownHours * metresPerHour(r))
  const slowRevenue = sum(slowRows.filter(inNext), r => r.revenue)
  const stuckValue = sum(stuckOpen, s => s.value)
  const stuckToGo = sum(stuckOpen, s => Math.max(0, s.planned - s.drilled))
  const lateOrders = coming.filter(o => (o.overdueDays ?? 0) > 0)

  const strengths: SwotItem[] = []
  const weaknesses: SwotItem[] = []
  const opportunities: SwotItem[] = []
  const threats: SwotItem[] = []

  if (next.margin > 0) strengths.push({
    title: `Every metre earns more than it costs`,
    detail: `${nextName} is forecast at ${money(next.ratePerMetre)} billed and ${money(next.costPerMetre)} spent a metre, a margin of ${round(next.marginPct)}%.`,
    figure: moneyL(next.margin), href: '/admin/finance',
  })
  if (steady) strengths.push({
    title: `${steady.rig} is the steady one`,
    detail: `${steady.perDay.toFixed(1)} m a day over the last ${steady.loggedDays} logged days${steady.zeroDays === 0 ? ', with no day lost' : `, ${plural(steady.zeroDays, 'day')} lost`}.`,
    figure: `${steady.perDay.toFixed(1)} m/day`, href: '/admin/rigs',
  })
  if (cash.readyToInvoice > 0) strengths.push({
    title: `${plural(cash.readyCount, 'approved hole')} can be invoiced today`,
    detail: `Approved and waiting for an invoice. This is the quickest money on the list.`,
    figure: moneyL(cash.readyToInvoice), href: '/admin/finance',
  })
  const covered = parts.filter(p => p.status === 'covered').length
  if (parts.length && covered >= parts.length / 2) strengths.push({
    title: `${covered} of ${parts.length} parts are covered to the end of ${nextName}`,
    detail: `What is in the store and on order is enough for the metres planned.`,
    href: '/admin/inventory',
  })

  if (stuckOpen.length) weaknesses.push({
    title: `${plural(stuckOpen.length, 'hole')} left open short of planned depth`,
    detail: `${stuckOpen.map(s => `${s.hole} (${round(s.drilled)} of ${s.planned} m)`).join(', ')}. The rig moved on, and a hole that is not closed cannot be invoiced.`,
    figure: moneyL(stuckValue), href: '/admin/finance',
  })
  if (ownHours > 0 && worstOwn) weaknesses.push({
    title: `${round(ownHours)} hours lost to your own stoppages in 30 days`,
    detail: `Bit and rod changes, hydraulic, mechanical and electrical faults. ${worstOwn.rig} lost the most: ${round(worstOwn.ownHours)} hours over ${plural(worstOwn.ownEvents, 'shift')}. These are not billable.`,
    figure: `${round(ownMetresLost)} m`, href: '/admin/intelligence/contractors',
  })
  if (cash.notApproved > 0) weaknesses.push({
    title: `${plural(cash.notApprovedCount, 'closed hole')} not yet approved for billing`,
    detail: `Drilled and finished, but no invoice can be raised until they are approved.`,
    figure: moneyL(cash.notApproved), href: '/admin/finance',
  })
  const emptyShelf = shortParts.filter(p => p.inStore === 0)
  if (emptyShelf.length) weaknesses.push({
    title: `${plural(emptyShelf.length, 'part')} needed next month ${emptyShelf.length === 1 ? 'has' : 'have'} none in the store`,
    detail: emptyShelf.slice(0, 3).map(p => p.part.name).join(', ') + (emptyShelf.length > 3 ? ' and more.' : '.'),
    href: '/admin/inventory',
  })

  if (idleDays > 0) opportunities.push({
    title: `${plural(idleDays, 'rig-day')} free in ${nextName}`,
    detail: `${idleRigs.map(r => r.rig).join(' and ')} finish their planned holes before the month ends. One more hole released by the client fills those days.`,
    figure: `+${moneyL(idleBilling)}`, href: '/admin/projects',
  })
  if (stuckOpen.length) opportunities.push({
    title: `Close the open holes and bill them`,
    detail: stuckToGo > 0
      ? `${round(stuckToGo)} m more reaches planned depth on ${stuckOpen.map(s => s.hole).join(' and ')}. Or agree the shorter depth with the client and close them as they are.`
      : `They are at planned depth. Mark them closed in the driller's log and they can go for approval.`,
    figure: `+${moneyL(stuckValue)}`, href: '/admin/finance',
  })
  if ((ownMetresLost / 2) * next.ratePerMetre >= 50000) opportunities.push({
    title: `Halve your own stoppages`,
    detail: `Half of the ${round(ownHours)} hours lost in the last 30 days, at the metres each rig makes in a drilling hour.`,
    figure: `+${moneyL((ownMetresLost / 2) * next.ratePerMetre)}`, href: '/admin/intelligence/contractors',
  })
  const bestGap = sum(fastRows.filter(inNext), r => r.metres) - next.metres
  if (idleDays === 0 && bestGap > 5) opportunities.push({
    title: `Drill like your best month`,
    detail: `Each rig at its best month on record adds ${round(bestGap)} m in ${nextName}.`,
    figure: `+${moneyL(bestGap * next.ratePerMetre)}`, href: '/admin/intelligence/contractors',
  })

  if (idleDays > 0) threats.push({
    title: `Planned holes run out on ${shortDate(idleRigs.map(r => r.idleFrom!).sort()[0])}`,
    detail: `${idleRigs.map(r => `${r.rig} from ${shortDate(r.idleFrom)}`).join(', ')}. An idle rig still costs its crew and ownership every day.`,
    figure: `−${moneyL(idleCost)}`, href: '/admin/projects',
  })
  if (lateParts.length) threats.push({
    title: `${plural(lateParts.length, 'part')} will run out before a new order can arrive`,
    detail: `${lateParts[0].part.name}: the store runs out about ${shortDate(lateParts[0].runOut)} and the supplier needs ${lateParts[0].part.leadTimeDays} days.`,
    figure: moneyL(sum(lateParts, p => p.spend)), href: '/admin/inventory',
  })
  if (lateOrders.length) threats.push({
    title: `${plural(lateOrders.length, 'order line')} already late from suppliers`,
    detail: `${lateOrders[0].poNumber} from ${lateOrders[0].supplier} is ${lateOrders[0].overdueDays} days late. A late order now is a stopped rig next month.`,
    figure: moneyL(sum(lateOrders, o => o.value)), href: '/admin/inventory',
  })
  if (next.revenue - slowRevenue > 0) threats.push({
    title: `A slow month`,
    detail: `If every rig drills like its slowest month on record, ${nextName} makes ${round(sum(slowRows.filter(inNext), r => r.metres))} m instead of ${round(next.metres)} m.`,
    figure: `−${moneyL(next.revenue - slowRevenue)}`, href: '/admin/intelligence/contractors',
  })
  if (cash.overdue + cash.disputed > 0) threats.push({
    title: `Money already late or disputed`,
    detail: `${cash.overdueCount ? `${plural(cash.overdueCount, 'invoice')} overdue. ` : ''}${cash.disputed ? `${moneyL(cash.disputed)} held back by the client.` : ''}`,
    figure: moneyL(cash.overdue + cash.disputed), href: '/admin/finance',
  })

  // ── risk register ────────────────────────────────────────────────────────
  const risks: Risk[] = []
  byProject.filter(p => p.idleDays > 0).forEach(p => {
    const mine = rigs.filter(r => r.project === p.project && r.next.idleDays > 0)
    const first = mine.map(r => r.idleFrom!).sort()[0]
    const cost = sum(mine, r => r.next.idleDays * r.fixedPerDay)
    risks.push({
      key: `idle_${p.project}`, area: 'holes',
      title: `${p.project}: planned holes run out`,
      detail: `${mine.map(r => `${r.rig} is idle from ${shortDate(r.idleFrom)}`).join('; ')}. ${plural(p.idleDays, 'rig-day')} with no hole to drill in ${nextName}.`,
      when: shortDate(first),
      impact: cost, impactNote: 'crew and ownership cost with nothing billed',
      likelihood: 'High',
      // Ten days' notice when there is time for it; otherwise now, never a date already gone.
      action: addDays(first, -10) > today
        ? `Ask ${clientOf(p.project)} to release the next holes by ${shortDate(addDays(first, -10))}, and add them under Projects.`
        : `Ask ${clientOf(p.project)} to release the next holes now, and add them under Projects. If there are none, move the rig or close the project.`,
      href: '/admin/projects', linkLabel: 'Open projects',
    })
  })
  rigs.filter(r => r.next.idleDays === 0 && r.idleFrom).forEach(r => {
    risks.push({
      key: `idle_later_${r.rig}`, area: 'holes',
      title: `${r.rig}: last planned hole ends ${shortDate(r.lastHoleEnds)}`,
      detail: `Busy through ${nextName}, but nothing is planned after that on ${r.project}.`,
      when: shortDate(r.idleFrom),
      impact: r.fixedPerDay * 7, impactNote: 'for each idle week',
      likelihood: 'Medium',
      action: `Raise the next holes with the client during ${nextName}.`,
      href: '/admin/projects', linkLabel: 'Open projects',
    })
  })
  shortParts.slice(0, 2).forEach(p => {
    risks.push({
      key: `part_${p.part.id}`, area: 'stock',
      title: `${p.part.name}: store runs out`,
      detail: `${p.inStore} in the store${p.onOrderQty ? `, ${p.onOrderQty} on order` : ', none on order'}. The forecast uses ${p.need.toFixed(p.need < 10 ? 1 : 0)} by the end of ${nextName}. ${p.part.supplier} needs ${p.part.leadTimeDays} days.`,
      when: shortDate(p.runOut),
      impact: p.spend, impactNote: `to order ${p.toOrder}`,
      likelihood: p.status === 'late' ? 'High' : 'Medium',
      action: p.status === 'late'
        ? `Order ${p.toOrder} today. It still leaves about ${plural(p.gapDays, 'day')} on what the rigs are carrying, so ask for part delivery or borrow from another site.`
        : `Order ${p.toOrder} by ${shortDate(p.orderBy)}.`,
      href: '/admin/inventory', linkLabel: 'Open inventory',
    })
  })
  if (shortParts.length > 2) {
    const others = shortParts.slice(2)
    risks.push({
      key: 'parts_rest', area: 'stock',
      title: `${plural(others.length, 'more part')} to order for ${nextName}`,
      detail: others.slice(0, 4).map(p => p.part.name).join(', ') + (others.length > 4 ? ' and more.' : '.'),
      when: shortDate(others.map(p => p.runOut!).sort()[0]),
      impact: sum(others, p => p.spend), impactNote: 'to order',
      likelihood: 'Medium',
      action: 'Raise one purchase order per supplier from the list below.',
      href: '/admin/inventory', linkLabel: 'Open inventory',
    })
  }
  if (stuckOpen.length) risks.push({
    key: 'stuck', area: 'holes',
    title: `Drilled but cannot be billed`,
    detail: `${stuckOpen.map(s => s.hole).join(' and ')} are still open in the record, so they cannot be approved or invoiced.`,
    when: 'Now',
    impact: stuckValue, impactNote: 'drilled and not billable',
    likelihood: 'High',
    action: `Finish them to planned depth, or agree the shorter depth and mark them closed in the driller's log.`,
    href: '/admin/finance', linkLabel: 'Open finance',
  })
  if (cash.notApproved > 0) risks.push({
    key: 'approval', area: 'money',
    title: `Closed holes waiting for approval`,
    detail: `${plural(cash.notApprovedCount, 'hole')} finished but not approved. Until then the money is yours on paper only.`,
    when: 'Now',
    impact: cash.notApproved, impactNote: 'not yet billable',
    likelihood: 'Medium',
    action: 'Send them for approval this week so the invoice goes out before month end.',
    href: '/admin/finance', linkLabel: 'Open finance',
  })
  if (cash.overdue + cash.disputed > 0) risks.push({
    key: 'cash', area: 'money',
    title: `Invoices overdue or disputed`,
    detail: `${cash.overdueCount ? `${plural(cash.overdueCount, 'invoice')} past the due date. ` : ''}${cash.disputed ? `${moneyL(cash.disputed)} disputed by the client.` : ''}`,
    when: 'Now',
    impact: cash.overdue + cash.disputed, impactNote: 'cash not in the bank',
    likelihood: 'High',
    action: 'Answer the disputed lines with the shift record and chase the overdue ones.',
    href: '/admin/finance', linkLabel: 'Open finance',
  })
  if (next.revenue - slowRevenue > 0) risks.push({
    key: 'slow', area: 'rigs',
    title: `A slow month`,
    detail: `The forecast uses the last 30 days. Each rig at its slowest month on record makes ${round(next.metres - sum(slowRows.filter(inNext), r => r.metres))} m less.`,
    when: nextName,
    impact: next.revenue - slowRevenue, impactNote: 'less billed',
    likelihood: rigs.some(r => r.ownEvents >= 3) ? 'Medium' : 'Low',
    action: worstOwn && worstOwn.ownHours > 0
      ? `Watch ${worstOwn.rig}: ${round(worstOwn.ownHours)} hours of its own stoppages in 30 days. Service it before ${nextName}.`
      : 'Keep the daily metres in view on the Dashboard.',
    href: '/admin/intelligence/contractors', linkLabel: 'Open rig by rig',
  })
  const rank: Record<Likelihood, number> = { High: 0, Medium: 1, Low: 2 }
  risks.sort((a, b) => rank[a.likelihood] - rank[b.likelihood] || (b.impact ?? 0) - (a.impact ?? 0))

  // ── how it was worked out ────────────────────────────────────────────────
  const basis = [
    `Metres a day: each rig's own average over its last ${WINDOW} days of logs, with stoppage days counted. ${rigs.map(r => `${r.rig} ${r.perDay.toFixed(1)}`).join(', ')}.`,
    `What is drilled: the rest of the hole each rig is on, then the planned holes on its project in order, with ${MOVE_DAYS} day for each rig move. A rig with no planned hole left is shown idle.`,
    `Billing: the client rate for each metre at the depth it will be drilled. On a contract priced by ground, the ground at each depth is taken from holes already drilled on that project.`,
    `Cost: what a rig-day and a metre have cost this month and last, from Finance. An idle rig is still charged its crew and ownership.`,
    `Parts: metres to be drilled divided by each part's life, against what is in the store and on order. Only parts the month will wear out at least one of are listed; what a rig is already carrying is not counted.`,
    `Range: the low and high figures are each rig's slowest and best month on record.`,
  ]

  // ── one line ─────────────────────────────────────────────────────────────
  const firstIdle = idleRigs.map(r => r.idleFrom!).sort()[0]
  const headline = idleDays > 0
    ? { tone: 'warn' as Tone, text: `${nextName} looks like ${round(next.metres).toLocaleString('en-US')} m and ${moneyL(next.revenue)} billed, but planned holes run out on ${shortDate(firstIdle)} and ${plural(idleRigs.length, 'rig')} will stand idle.` }
    : lateParts.length
      ? { tone: 'warn' as Tone, text: `${nextName} looks like ${round(next.metres).toLocaleString('en-US')} m and ${moneyL(next.revenue)} billed. ${plural(lateParts.length, 'part')} will run out before a new order can arrive.` }
      : { tone: 'good' as Tone, text: `${nextName} looks like ${round(next.metres).toLocaleString('en-US')} m and ${moneyL(next.revenue)} billed, with holes planned for every rig.` }

  return {
    today, thisMonth, nextMonth, horizonStart, horizonEnd,
    rigs, rest, next, mtd, thisMonthTotal, lastMonth, daily, holeFinish, farEnd, byProject, closings, cash,
    parts, partsSpend, swot: { strengths, weaknesses, opportunities, threats }, risks, basis, headline,
  }
}

export type { LiveHole }
