import { monthOf, shiftMonth } from './costing-store'
import { addDays } from './inventory-store'
import { monthNumbers, type OverviewCosting, type OverviewInv } from './admin-overview'
import { computeRigMonth } from './costing-view'
import type { Forecast } from './forecast'

/* ==========================================================================
 * OUTLOOK ANALYTICS — the numbers behind the Outlook charts
 *
 *   series       the last months as they closed, this month (logged plus
 *                forecast) and next month, each with its low and high
 *   bridge       why margin moves from one month to the next: volume, rate
 *                and cost a metre, adding up exactly
 *   levers       how much each thing that can happen moves next month's
 *                margin, for the tornado chart and the what-if sliders
 *   warnings     measures drifting the wrong way, week by week
 *
 * Every range and every lever is worked from the company's own record: the
 * rigs' slowest and best months, their fixed cost a day and their variable
 * cost a metre. None of it is a trained model.
 * ========================================================================== */

export interface MonthPoint {
  month: string
  kind: 'actual' | 'current' | 'forecast'
  metres: number; revenue: number; cost: number; margin: number
  low?: { metres: number; revenue: number; margin: number }
  high?: { metres: number; revenue: number; margin: number }
  logged?: number                          // the current month: metres already in the logs
}

const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0)

/* Fleet economics from the forecast's own rig facts. */
export function economics(f: Forecast) {
  const rigs = f.rigs
  const nextMetres = sum(rigs, r => r.next.metres)
  const variable = nextMetres ? sum(rigs, r => r.next.metres * r.variablePerMetre) / nextMetres : (rigs.length ? sum(rigs, r => r.variablePerMetre) / rigs.length : 0)
  const rate = f.next.metres ? f.next.revenue / f.next.metres : f.rest.ratePerMetre
  const perDay = rigs.length ? sum(rigs, r => r.perDay) / rigs.length : 0
  return { variable, rate, contribution: rate - variable, perDay }
}

export function monthSeries(costing: OverviewCosting, inv: OverviewInv, f: Forecast): MonthPoint[] {
  const { contribution, rate } = economics(f)
  const range = (m: number, rev: number, mg: number, lo: number, hi: number) => ({
    low: { metres: lo, revenue: rev - (m - lo) * rate, margin: mg - (m - lo) * contribution },
    high: { metres: hi, revenue: rev + (hi - m) * rate, margin: mg + (hi - m) * contribution },
  })
  const past = [3, 2, 1].map(k => shiftMonth(f.thisMonth, -k)).map(m => monthNumbers(costing, inv, m))
    .filter(n => n.metres > 0)
    .map(n => ({ month: n.month, kind: 'actual' as const, metres: n.metres, revenue: n.revenue, cost: n.cost, margin: n.margin }))
  const t = f.thisMonthTotal
  const cur: MonthPoint = { month: f.thisMonth, kind: 'current', metres: t.metres, revenue: t.revenue, cost: t.cost, margin: t.margin, logged: f.mtd.metres, ...range(t.metres, t.revenue, t.margin, t.low, t.high) }
  const n = f.next
  const nxt: MonthPoint = { month: f.nextMonth, kind: 'forecast', metres: n.metres, revenue: n.revenue, cost: n.cost, margin: n.margin, ...range(n.metres, n.revenue, n.margin, n.low, n.high) }
  return [...past, cur, nxt]
}

/* Margin from month a to month b, split three ways that add up exactly:
 *   volume   more or fewer metres, at a's margin a metre
 *   rate     what a metre is billed at, on b's metres
 *   cost     what a metre costs, on b's metres (a rise is a loss) */
export interface Bridge { from: MonthPoint; to: MonthPoint; volume: number; rate: number; cost: number }
export function bridge(a: MonthPoint, b: MonthPoint): Bridge {
  const ra = a.metres ? a.revenue / a.metres : 0, ca = a.metres ? a.cost / a.metres : 0
  const rb = b.metres ? b.revenue / b.metres : 0, cb = b.metres ? b.cost / b.metres : 0
  return { from: a, to: b, volume: (b.metres - a.metres) * (ra - ca), rate: b.metres * (rb - ra), cost: -b.metres * (cb - ca) }
}

/* What each thing that can happen does to next month's margin. */
export interface Lever { key: string; label: string; low: number; high: number; lowWord: string; highWord: string }
export function levers(f: Forecast): Lever[] {
  const e = economics(f)
  const n = f.next
  const variableCost = e.variable * n.metres
  const rigDay = e.perDay * e.contribution
  return [
    { key: 'speed', label: 'Drilling speed', low: -0.1 * n.metres * e.contribution, high: 0.1 * n.metres * e.contribution, lowWord: '10% slower', highWord: '10% faster' },
    { key: 'rate', label: 'Client rate a metre', low: -0.05 * n.revenue, high: 0.05 * n.revenue, lowWord: '5% lower', highWord: '5% higher' },
    { key: 'cost', label: 'Cost a metre (fuel, bits, crew)', low: -0.1 * variableCost, high: 0.1 * variableCost, lowWord: '10% dearer', highWord: '10% cheaper' },
    { key: 'breakdown', label: 'A rig breaks down', low: -5 * rigDay, high: 0, lowWord: 'one rig down 5 days', highWord: 'none' },
    { key: 'parts', label: 'A part arrives late', low: -7 * rigDay, high: 0, lowWord: 'one rig stands 7 days', highWord: 'on time' },
    { key: 'holes', label: 'Client releases more holes', low: 0, high: sum(f.rigs, r => r.next.idleDays) * rigDay, lowWord: 'none', highWord: 'every idle rig-day filled' },
  ].sort((a, b) => (b.high - b.low) - (a.high - a.low))
}

export interface WhatIf { speed: number; rate: number; cost: number; downDays: number; idleFilled: boolean }
export function whatIf(f: Forecast, w: WhatIf) {
  const e = economics(f)
  const n = f.next
  const metres = Math.max(0, n.metres * (1 + w.speed / 100) - w.downDays * e.perDay + (w.idleFilled ? sum(f.rigs, r => r.next.idleDays) * e.perDay : 0))
  const revenue = metres * e.rate * (1 + w.rate / 100)
  const fixed = n.cost - e.variable * n.metres
  const cost = fixed + metres * e.variable * (1 + w.cost / 100)
  return { metres, revenue, cost, margin: revenue - cost, marginPct: revenue ? ((revenue - cost) / revenue) * 100 : 0, base: n.margin }
}

/* ── early warnings ─────────────────────────────────────────────────────── */

export interface Warning {
  key: string; label: string; unit: string
  weeks: { from: string; value: number | null }[]
  recent: number | null; before: number | null
  goodWhenUp: boolean
  state: 'worse' | 'better' | 'steady' | 'thin'
  note: string
}

export function earlyWarnings(costing: OverviewCosting, inv: OverviewInv, today: string): Warning[] {
  const logs = costing.shiftLogs.filter(l => !l.segmentOf)
  const weeks = Array.from({ length: 6 }, (_, i) => { const to = addDays(today, -7 * (5 - i)); return { from: addDays(to, -6), to } })
  const inWeek = (d: string, w: { from: string; to: string }) => d >= w.from && d <= w.to

  // Day costs for the months the six weeks touch, own and contractor rigs.
  const months = Array.from(new Set(weeks.flatMap(w => [monthOf(w.from), monthOf(w.to)])))
  const pairs = new Set<string>()
  logs.filter(l => months.includes(monthOf(l.date))).forEach(l => pairs.add(`${l.project}|${l.rig}|${monthOf(l.date)}`))
  const dayCosts: { date: string; units: number; total: number }[] = []
  pairs.forEach(k => { const [p, r, m] = k.split('|'); computeRigMonth(costing, inv, p, r, m).days.forEach(d => { if (d.submitted) dayCosts.push({ date: d.date, units: d.units, total: d.total }) }) })

  const measure = (key: string, label: string, unit: string, goodWhenUp: boolean, f: (w: { from: string; to: string }) => number | null, note: string): Warning => {
    const vals = weeks.map(w => ({ from: w.from, value: f(w) }))
    const avg = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }
    const recent = avg(vals.slice(-2).map(v => v.value)), before = avg(vals.slice(0, 4).map(v => v.value))
    let state: Warning['state'] = 'thin'
    if (recent != null && before != null && before !== 0) {
      const ch = (recent - before) / Math.abs(before)
      state = Math.abs(ch) < 0.05 ? 'steady' : (ch > 0) === goodWhenUp ? 'better' : 'worse'
    }
    return { key, label, unit, weeks: vals, recent, before, goodWhenUp, state, note }
  }
  const wl = (w: { from: string; to: string }) => logs.filter(l => inWeek(l.date, w))
  return [
    measure('pace', 'Metres a rig-day', 'm', true, w => { const l = wl(w); const d = new Set(l.map(x => `${x.rig}|${x.date}`)).size; return d ? sum(l, x => x.metresDrilled) / d : null }, 'All rigs, yours and contractors\''),
    measure('cpm', 'Cost a metre', 'SAR', false, w => { const d = dayCosts.filter(x => inWeek(x.date, w)); const u = sum(d, x => x.units); return u ? sum(d, x => x.total) / u : null }, 'All-in, from the costing'),
    measure('own', 'Hours lost to own stops', 'h', false, w => { const l = wl(w); return l.length ? sum(l.filter(x => x.downtimeSide !== 'client'), x => x.downtimeHours) : null }, 'Breakdowns and own delays, not billable'),
    measure('standby', 'Client standby hours', 'h', false, w => { const l = wl(w); return l.length ? sum(l.filter(x => x.downtimeSide === 'client'), x => x.downtimeHours) : null }, 'Billable, but rigs not drilling'),
    measure('core', 'Core recovery', '%', true, w => { const l = wl(w).filter(x => x.metresDrilled > 0); const m = sum(l, x => x.metresDrilled); return m ? (sum(l, x => x.coreRecovery) / m) * 100 : null }, 'Core recovered against metres drilled'),
    measure('fuel', 'Fuel a metre', 'L', false, w => { const l = wl(w).filter(x => !x.contractor && x.metresDrilled > 0); const m = sum(l, x => x.metresDrilled); return m ? sum(l, x => x.fuelLitres) / m : null }, 'Your own rigs'),
  ]
}
