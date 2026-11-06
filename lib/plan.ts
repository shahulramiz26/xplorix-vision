'use client'

import { computeRigMonth, type CostingState, type InvState } from './costing-view'
import { monthOf, type DayCost, type ProjectRecord, type ShiftLog } from './costing-store'
import { projectStats } from './projects'
import { TODAY, addDays } from './inventory-store'

/* ==========================================================================
 * PLAN AGAINST ACTUAL
 *
 * Three questions about a project, all from the same costed days Finance
 * uses, so no figure here can differ from Finance:
 *
 *   budget     what it has cost so far against what it may cost, and what a
 *              metre costs against what a metre should cost
 *   schedule   metres drilled to date against metres the plan expected by
 *              today
 *   depth      for one hole, speed and cost per metre band by band down the
 *              hole, so harder ground shows where it starts
 * ========================================================================== */

const r1 = (v: number) => Math.round(v * 10) / 10

/* Every costed rig-day on the project, for every rig and month with a log. */
export function projectDays(state: CostingState, inv: InvState, project: string): DayCost[] {
  const logs = state.shiftLogs.filter(l => l.project === project)
  const pairs = new Set(logs.map(l => `${l.rig}|${monthOf(l.date)}`))
  return Array.from(pairs).flatMap(k => {
    const [rig, month] = k.split('|')
    return computeRigMonth(state, inv, project, rig, month).days
  })
}

export interface BudgetView {
  set: boolean
  spent: number; metres: number; cpm: number
  budgetTotal?: number; budgetPerMetre?: number
  spentPct?: number            // spent as a share of the total budget
  donePct?: number             // metres drilled as a share of the planned metres
  target: number               // planned metres
  atCompletion?: number        // what the whole project will cost at today's cost per metre
  overPerMetre?: number        // + when a metre costs more than budgeted
  tone: 'good' | 'warn' | 'bad' | 'neutral'
  verdict: string
}
export function projectBudget(state: CostingState, inv: InvState, p: ProjectRecord): BudgetView {
  const days = projectDays(state, inv, p.name)
  const spent = days.reduce((s, d) => s + d.total, 0)
  const metres = days.reduce((s, d) => s + d.units, 0)
  const cpm = metres > 0 ? spent / metres : 0
  const target = projectStats(state, p).target
  const set = !!(p.budgetTotal || p.budgetPerMetre)
  const spentPct = p.budgetTotal ? (spent / p.budgetTotal) * 100 : undefined
  const donePct = target ? (metres / target) * 100 : undefined
  const atCompletion = target && cpm ? cpm * target : undefined
  const overPerMetre = p.budgetPerMetre && cpm ? cpm - p.budgetPerMetre : undefined
  let tone: BudgetView['tone'] = 'neutral'
  let verdict = 'No budget set for this project.'
  if (set) {
    const perBad = overPerMetre != null && p.budgetPerMetre ? overPerMetre / p.budgetPerMetre : 0
    const totBad = p.budgetTotal && atCompletion ? (atCompletion - p.budgetTotal) / p.budgetTotal : 0
    const worst = Math.max(perBad, totBad)
    tone = metres === 0 ? 'neutral' : worst > 0.1 ? 'bad' : worst > 0 ? 'warn' : 'good'
    verdict = metres === 0 ? 'Nothing drilled yet.'
      : worst > 0 ? 'Running over budget.' : 'Within budget.'
  }
  return { set, spent, metres, cpm, budgetTotal: p.budgetTotal, budgetPerMetre: p.budgetPerMetre, spentPct, donePct, target, atCompletion, overPerMetre, tone, verdict }
}

export interface SchedulePoint { date: string; planned?: number; actual?: number }
export interface ScheduleView {
  points: SchedulePoint[]
  target: number
  plannedEnd?: string
  planBasis: 'end-date' | 'daily-target' | 'none'
  plannedByToday?: number
  actual: number
  ahead?: number               // + ahead of plan, − behind
  ratePerDay: number           // metres a day over the last 30 days
  expectedFinish?: string      // when the planned metres are reached at that rate
}

const dayN = (d: string) => Math.round(new Date(`${d}T00:00:00Z`).getTime() / 86400000)
const dateOf = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10)

/* The planned line runs straight from the start date to the planned metres:
 * at the planned end date when one is set, or at the pace the daily target
 * gives for the rigs on the project. */
export function projectSchedule(state: CostingState, p: ProjectRecord, today = TODAY): ScheduleView {
  const target = projectStats(state, p).target
  const logs = state.shiftLogs.filter(l => l.project === p.name)
  const rigs = new Set([...p.rigs, ...(state.workOrders ?? []).filter(w => w.project === p.name && w.status === 'active').flatMap(w => w.rigs)])
  let plannedEnd = p.plannedEnd
  let planBasis: ScheduleView['planBasis'] = plannedEnd ? 'end-date' : 'none'
  if (!plannedEnd && p.dailyTarget && rigs.size && target) {
    plannedEnd = addDays(p.startDate, Math.ceil(target / (p.dailyTarget * rigs.size)))
    planBasis = 'daily-target'
  }
  const start = dayN(p.startDate)
  const end = plannedEnd ? dayN(plannedEnd) : undefined
  const plannedAt = (n: number) => end != null && end > start && target ? Math.max(0, Math.min(target, ((n - start) / (end - start)) * target)) : undefined

  const perDay: Record<number, number> = {}
  logs.forEach(l => { const n = dayN(l.date); perDay[n] = (perDay[n] ?? 0) + l.metresDrilled })
  const t = dayN(today)
  const last = Math.max(t, end ?? t)
  // A point a week, plus today and the planned end, so the lines meet the dates that matter.
  const marks = new Set<number>()
  for (let n = start; n <= last; n += 7) marks.add(n)
  marks.add(t); if (end != null) marks.add(end)
  const sorted = Array.from(marks).filter(n => n >= start).sort((a, b) => a - b)
  let cum = 0, k = start
  const points: SchedulePoint[] = sorted.map(n => {
    for (; k <= Math.min(n, t); k++) cum += perDay[k] ?? 0
    return { date: dateOf(n), planned: plannedAt(n) != null ? r1(plannedAt(n)!) : undefined, actual: n <= t ? r1(cum) : undefined }
  })
  const actual = r1(logs.filter(l => l.date <= today).reduce((s, l) => s + l.metresDrilled, 0))
  const recent = logs.filter(l => l.date > addDays(today, -30) && l.date <= today).reduce((s, l) => s + l.metresDrilled, 0)
  const ratePerDay = recent / 30
  const plannedByToday = plannedAt(t)
  const left = Math.max(0, target - actual)
  return {
    points, target, plannedEnd, planBasis, actual, ratePerDay,
    plannedByToday: plannedByToday != null ? r1(plannedByToday) : undefined,
    ahead: plannedByToday != null ? r1(actual - plannedByToday) : undefined,
    expectedFinish: left === 0 ? today : ratePerDay > 0 ? addDays(today, Math.ceil(left / ratePerDay)) : undefined,
  }
}

// ── one hole, metre band by metre band ────────────────────────────────────

export interface DepthBand {
  from: number; to: number
  metres: number; drillHours: number; stopHours: number
  cost: number
  rop: number | null           // metres an hour on bottom
  cpm: number | null           // cost per metre drilled in the band
  size: string                 // the core size that drilled most of the band
  ground: string               // the ground most of the band was logged as
}

/* What each shift on a hole cost: its rig-day's cost shared out by metres
 * drilled (or evenly, on a day nothing was drilled). */
export function shiftCosts(state: CostingState, inv: InvState, project: string): Record<string, number> {
  const out: Record<string, number> = {}
  projectDays(state, inv, project).forEach(d => {
    const shifts = d.shifts
    if (!shifts.length) return
    const m = shifts.reduce((s, l) => s + l.metresDrilled, 0)
    shifts.forEach(l => { out[l.id] = (out[l.id] ?? 0) + (m > 0 ? d.total * (l.metresDrilled / m) : d.total / shifts.length) })
  })
  return out
}

export function depthBands(state: CostingState, inv: InvState, hole: string, step?: number, withCost = true): { bands: DepthBand[]; step: number } {
  const logs = state.shiftLogs.filter(l => l.holeNumber === hole)
  if (!logs.length) return { bands: [], step: step ?? 10 }
  const project = logs[0].project
  const costs = withCost ? shiftCosts(state, inv, project) : {}
  // Each shift's interval: from the depth it started at to the depth it ended at.
  const order = [...logs].sort((a, b) => `${a.date}${a.shift === 'Day' ? 0 : 1}${a.segmentOf ? 1 : 0}`.localeCompare(`${b.date}${b.shift === 'Day' ? 0 : 1}${b.segmentOf ? 1 : 0}`))
  let at = 0
  const spans = order.map(l => {
    const from = l.meterStart ?? at
    const to = l.meterEnd ?? from + l.metresDrilled
    at = Math.max(at, to)
    return { l, from, to }
  })
  const deepest = Math.max(...spans.map(s => s.to), 0)
  const size = step ?? (deepest > 300 ? 20 : deepest > 120 ? 10 : 5)
  const n = Math.max(1, Math.ceil(deepest / size))
  const acc = Array.from({ length: n }, (_, i) => ({ from: i * size, to: Math.min(deepest, (i + 1) * size), metres: 0, drillHours: 0, stopHours: 0, cost: 0, sizes: {} as Record<string, number>, grounds: {} as Record<string, number> }))
  const share = (b: typeof acc[number], l: ShiftLog, k: number, m: number) => {
    b.metres += m
    b.drillHours += l.drillingHours * k
    b.stopHours += l.downtimeHours * k
    b.cost += (costs[l.id] ?? 0) * k
    if (m > 0) {
      b.sizes[l.holeSize] = (b.sizes[l.holeSize] ?? 0) + m
      const g = (l.formationType || '').replace(' Formation', '')
      if (g) b.grounds[g] = (b.grounds[g] ?? 0) + m
    }
  }
  spans.forEach(({ l, from, to }) => {
    const len = to - from
    if (len <= 0) {
      // Nothing drilled: its hours and cost sit at the depth the hole stood.
      const i = Math.min(n - 1, Math.max(0, Math.floor(from / size - 1e-9)))
      share(acc[i], l, 1, 0)
      return
    }
    acc.forEach(b => {
      const o = Math.min(to, b.to) - Math.max(from, b.from)
      if (o > 0) share(b, l, o / len, o)
    })
  })
  const top = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
  return {
    step: size,
    bands: acc.map(b => ({
      from: b.from, to: r1(b.to), metres: r1(b.metres), drillHours: r1(b.drillHours), stopHours: r1(b.stopHours), cost: Math.round(b.cost),
      rop: b.drillHours > 0 && b.metres > 0 ? Math.round((b.metres / b.drillHours) * 100) / 100 : null,
      cpm: b.metres > 0 ? Math.round(b.cost / b.metres) : null,
      size: top(b.sizes), ground: top(b.grounds),
    })),
  }
}
