import type { ShiftLog } from '../costing-store'
import type { StripDrill } from '../../app/components/core-ui'
import { interval, type Flat, type IntervalResult } from './geotech'

/* ==========================================================================
 * XPLORIX CORE — joining the core to the drilling record
 *
 * Each shift in the drill log drilled a known from–to. The core from those
 * metres is measured on the photo, so each shift can be set beside what its
 * core says: recovery and RQD on the photo against the driller's own
 * recovery, the drilling rate against the rig's normal rate in that ground,
 * the driller, the shift and the stops.
 * ========================================================================== */

export const rateOf = (l: ShiftLog) => l.drillingHours > 0 ? l.metresDrilled / l.drillingHours : 0

/* A rig's normal drilling rate in a ground: the median over its own shifts. */
export function normals(logs: ShiftLog[]) {
  const m = new Map<string, number[]>()
  logs.filter(l => !l.segmentOf && l.metresDrilled > 0 && l.drillingHours > 0).forEach(l => {
    const k = `${l.rig}|${l.formationType}`
    m.set(k, [...(m.get(k) ?? []), rateOf(l)])
  })
  const out = new Map<string, number>()
  m.forEach((v, k) => { const s = [...v].sort((a, b) => a - b); out.set(k, s[Math.floor(s.length / 2)]) })
  return (l: ShiftLog) => out.get(`${l.rig}|${l.formationType}`) ?? rateOf(l)
}

export function holeLogs(logs: ShiftLog[], hole: string) {
  return logs.filter(l => l.holeNumber === hole && !l.segmentOf && l.meterStart != null && l.meterEnd != null)
    .sort((a, b) => (a.meterStart ?? 0) - (b.meterStart ?? 0))
}

export function stripDrill(logs: ShiftLog[], hole: string): StripDrill[] {
  const normal = normals(logs)
  return holeLogs(logs, hole).map(l => ({
    from: l.meterStart!, to: l.meterEnd!, rate: rateOf(l), normal: normal(l), driller: l.driller ?? '—', shift: l.shift, date: l.date,
    downtime: l.downtimeHours, reason: l.downtimeReason, drillerRec: l.metresDrilled ? (l.coreRecovery / l.metresDrilled) * 100 : 0,
  }))
}

export interface ShiftCore { log: ShiftLog; core: IntervalResult; drillerRec: number; rate: number; normal: number; fast: boolean }

/* What the core says about each shift that has been photographed. */
export function shiftCore(logs: ShiftLog[], hole: string, flat: Flat): ShiftCore[] {
  const normal = normals(logs)
  return holeLogs(logs, hole).map(l => {
    const core = interval(flat, l.meterStart!, l.meterEnd!)
    if (!core || core.length < (l.meterEnd! - l.meterStart!) * 0.6) return null
    const rate = rateOf(l), nrm = normal(l)
    return { log: l, core, drillerRec: l.metresDrilled ? (l.coreRecovery / l.metresDrilled) * 100 : 0, rate, normal: nrm, fast: rate > nrm * 1.2 }
  }).filter(Boolean) as ShiftCore[]
}

/* Groups of shifts compared with the average for the same ground: a pattern to
 * look at, not proof of a cause. */
export interface Group { label: string; shifts: number; metres: number; rec: number; rqd: number; vsRec: number; vsRqd: number }
export function factors(sc: ShiftCore[]) {
  const ground = new Map<string, { L: number; rec: number; rqd: number }>()
  sc.forEach(s => {
    const g = ground.get(s.log.formationType) ?? { L: 0, rec: 0, rqd: 0 }
    g.L += s.core.length; g.rec += s.core.recovery * s.core.length; g.rqd += s.core.rqd * s.core.length
    ground.set(s.log.formationType, g)
  })
  const avg = (f: string) => { const g = ground.get(f)!; return { rec: g.rec / g.L, rqd: g.rqd / g.L } }
  const group = (label: string, xs: ShiftCore[]): Group => {
    let L = 0, rec = 0, rqd = 0, dRec = 0, dRqd = 0
    xs.forEach(s => { const a = avg(s.log.formationType); L += s.core.length; rec += s.core.recovery * s.core.length; rqd += s.core.rqd * s.core.length; dRec += (s.core.recovery - a.rec) * s.core.length; dRqd += (s.core.rqd - a.rqd) * s.core.length })
    return { label, shifts: xs.length, metres: L, rec: L ? rec / L : 0, rqd: L ? rqd / L : 0, vsRec: L ? dRec / L : 0, vsRqd: L ? dRqd / L : 0 }
  }
  const drillers = Array.from(new Set(sc.map(s => s.log.driller ?? '—'))).sort()
  const rigs = Array.from(new Set(sc.map(s => s.log.rig))).sort()
  return [
    { title: 'Drilling speed', question: 'Is core lost when the rig drills faster than its normal for the ground?', groups: [group('Normal speed', sc.filter(s => !s.fast)), group('20%+ faster than normal', sc.filter(s => s.fast))] },
    { title: 'Driller', question: 'Does one crew bring up better core in the same ground?', groups: drillers.map(d => group(d, sc.filter(s => (s.log.driller ?? '—') === d))) },
    { title: 'Shift', question: 'Day against night.', groups: (['Day', 'Night'] as const).map(x => group(`${x} shift`, sc.filter(s => s.log.shift === x))) },
    { title: 'Rig', question: 'Does one rig bring up better core?', groups: rigs.map(r => group(r, sc.filter(s => s.log.rig === r))) },
  ].map(f => ({ ...f, groups: f.groups.filter(g => g.shifts > 0) })).filter(f => f.groups.length > 1)
}
