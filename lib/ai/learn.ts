import { addDays } from '../inventory-store'
import { buildForecast, type Forecast } from '../forecast'
import { lifeGaps } from '../stock-checks'
import { deptLabel, type Dept } from '../findings'
import { type AiCtx, dw, n0, n1, pct, plural, list, shifts, stops } from './record'

/* ==========================================================================
 * XPLORIX AI — FORECASTS THAT LEARN, AND WHAT THEY LEARNED
 *
 * A forecast is only worth trusting if it is checked. Each past week, the
 * forecast is run again as it stood on that Sunday, from only the shifts
 * logged by then, and its next seven days are set against what the rigs
 * then drilled. Where it missed, the record says why: a breakdown, the
 * client stopping a rig, a rig that moved.
 *
 * Beside it, what XPLORIX has corrected from the company's own record:
 * each rig's real pace, how long parts really last in each ground, and
 * the reasons people gave when they set a task aside.
 * ========================================================================== */

export interface WeekCheck {
  from: string; to: string
  forecast: number; actual: number
  errorPct: number                        // signed: + means the forecast was high
  miss?: { rig: string; forecast: number; actual: number; why: string }
}

export interface Learned { title: string; detail: string; href?: string; kind: 'pace' | 'part' | 'feedback' | 'accuracy' }

export interface Learning {
  weeks: WeekCheck[]
  accuracy: number | null                 // 100 − mean absolute error, last weeks
  trend: 'better' | 'worse' | 'steady' | null
  learned: Learned[]
}

/* What one rig was forecast to drill between two dates, from the walk. */
function rigForecast(f: Forecast, rig: string, from: string, to: string) {
  const r = f.rigs.find(x => x.rig === rig)
  if (!r) return 0
  return r.segments.reduce((s, seg) => {
    if (seg.kind !== 'hole' || seg.days <= 0) return s
    const a = seg.from > from ? seg.from : from, b = seg.to < to ? seg.to : to
    if (a > b) return s
    const days = Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000) + 1
    return s + seg.metres * Math.min(1, days / seg.days)
  }, 0)
}

export function learning(c: AiCtx, weeks = 6): Learning {
  const out: WeekCheck[] = []
  for (let k = weeks; k >= 1; k--) {
    const asOf = addDays(c.today, -7 * k)
    const from = addDays(asOf, 1), to = addDays(asOf, 7)
    const known = { ...c.costing, shiftLogs: c.costing.shiftLogs.filter(l => l.date <= asOf) }
    if (!known.shiftLogs.length) continue
    let f: Forecast
    try { f = buildForecast(known, c.inv, asOf) } catch { continue }
    const fc = f.daily.filter(d => d.forecast && d.date >= from && d.date <= to).reduce((s, d) => s + d.metres, 0)
    const week = shifts(c, l => l.date >= from && l.date <= to)
    const actual = week.reduce((s, l) => s + l.metresDrilled, 0)
    if (!fc && !actual) continue
    // The rig that made most of the miss, and why, from its shifts that week.
    const rigs = Array.from(new Set([...f.rigs.map(r => r.rig), ...week.map(l => l.rig)]))
    const per = rigs.map(r => {
      const a = week.filter(l => l.rig === r).reduce((s, l) => s + l.metresDrilled, 0)
      return { rig: r, forecast: rigForecast(f, r, from, to), actual: a }
    }).sort((x, y) => Math.abs(y.forecast - y.actual) - Math.abs(x.forecast - x.actual))
    const m = per[0]
    let miss: WeekCheck['miss']
    if (m && Math.abs(m.forecast - m.actual) >= 20) {
      const ls = week.filter(l => l.rig === m.rig)
      const own = stops(ls, 'own'), cl = stops(ls, 'client')
      const ownH = own.reduce((s, x) => s + x.hours, 0), clH = cl.reduce((s, x) => s + x.hours, 0)
      const projects = Array.from(new Set(ls.map(l => l.project)))
      const why = m.actual < m.forecast
        ? (clH >= ownH && clH >= 12 ? `the client held it for ${n0(clH)} h (${cl[0]?.reason.toLowerCase()})`
          : ownH >= 12 ? `${own[0]?.reason.toLowerCase()} stopped it for ${n0(ownH)} h`
          : !ls.length ? 'it logged no shifts that week'
          : 'it drilled slower than its own 30-day pace')
        : (!f.rigs.some(r => r.rig === m.rig) ? `it was not drilling when the forecast was made and came on that week${projects[0] ? ` (${projects[0]})` : ''}` : 'it drilled faster than its own 30-day pace')
      miss = { rig: m.rig, forecast: m.forecast, actual: m.actual, why }
    }
    out.push({ from, to, forecast: fc, actual, errorPct: actual ? ((fc - actual) / actual) * 100 : 0, miss })
  }
  const errs = out.map(w => Math.abs(w.errorPct))
  const accuracy = errs.length ? Math.max(0, 100 - errs.reduce((s, x) => s + x, 0) / errs.length) : null
  const half = Math.floor(errs.length / 2)
  const early = half ? errs.slice(0, half).reduce((s, x) => s + x, 0) / half : 0
  const late = half ? errs.slice(-half).reduce((s, x) => s + x, 0) / half : 0
  const trend = !half ? null : late < early * 0.85 ? 'better' : late > early * 1.15 ? 'worse' : 'steady'

  const learned: Learned[] = []
  if (accuracy != null) learned.push({ kind: 'accuracy', title: `The seven-day forecast has been within ${pct(100 - accuracy)} of the metres drilled, on average`, detail: `Checked against ${plural(out.length, 'week')}. ${trend === 'better' ? 'The misses are getting smaller as more shifts are logged.' : trend === 'worse' ? 'The misses grew in some weeks; Outlook shows each one and why.' : 'The misses are steady; most come from stops the record could not see coming.'}`, href: '/admin/intelligence/months#accuracy' })
  // Each rig's pace, as the record now has it against six weeks ago.
  try {
    const then = buildForecast({ ...c.costing, shiftLogs: c.costing.shiftLogs.filter(l => l.date <= addDays(c.today, -42)) }, c.inv, addDays(c.today, -42))
    const moved = c.forecast.rigs.map(r => ({ r, was: then.rigs.find(x => x.rig === r.rig)?.perDay })).filter(x => x.was && Math.abs(x.r.perDay - x.was) / x.was >= 0.08)
    if (moved.length) learned.push({ kind: 'pace', title: `Rig pace corrected on ${plural(moved.length, 'rig')}`, detail: list(moved.map(x => `${x.r.rig} ${n1(x.was!)} → ${n1(x.r.perDay)} m a day`)) + '. Forecasts, hole finish dates and part needs now use the new pace.', href: '/admin/intelligence/months' })
  } catch { /* not enough record six weeks back */ }
  lifeGaps(c.costing.shiftLogs, c.inv.catalogue).slice(0, 3).forEach(g => learned.push({
    kind: 'part', title: `${g.name}: ${n0(g.observedLife)} m in ${g.formation.toLowerCase()} ground, not ${n0(g.catalogueLife)} m`,
    detail: `Measured from ${plural(g.scrapped, 'one', 'worn out')} over ${n0(g.metres)} m. Drafted orders are sized at the real life; the parts catalogue still says ${n0(g.catalogueLife)} m until someone corrects it.`, href: '/admin/inventory',
  }))
  Object.values(c.costing.findingStatus ?? {}).filter(s => s.status === 'dismissed' && s.note).slice(-4).forEach(s => learned.push({
    kind: 'feedback', title: `Set aside: ${s.found?.title ?? 'a task'}`,
    detail: `"${s.note}" (${s.by}, ${dw(s.at.slice(0, 10))}). The reason is kept with the task${s.found?.dept ? ` in ${deptLabel(s.found.dept as Dept).toLowerCase()}` : ''}, and XPLORIX does not raise it again unless the record changes.`,
  }))
  return { weeks: out, accuracy, trend, learned }
}
