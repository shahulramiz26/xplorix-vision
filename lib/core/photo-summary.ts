import summary from './summary.json'
import type { ShiftLog } from '../costing-store'

/* ==========================================================================
 * XPLORIX CORE → DRILLING
 *
 * What the tray photos say about each shift, small enough to ship with the
 * drilling screens (made by scripts/core-batch.ts). Before a geologist
 * checks the trays these are the photo step's own numbers.
 * ========================================================================== */

export interface ShiftPhoto { hole: string; from: number; to: number; recovery: number; rqd: number; ff: number; driller: number; photographed: number }
export const PHOTO_SHIFTS = (summary as { shifts: Record<string, ShiftPhoto> }).shifts

export interface PhotoGroup { key: string; shifts: number; metres: number; recovery: number; driller: number; rqd: number }

/* Length-weighted photo recovery by rig, driller or project. */
export function photoBy(logs: ShiftLog[], key: (l: ShiftLog) => string): PhotoGroup[] {
  const m = new Map<string, { n: number; L: number; rec: number; drl: number; rqd: number }>()
  logs.forEach(l => {
    const p = PHOTO_SHIFTS[l.id]
    if (!p || p.photographed <= 0) return
    const k = key(l)
    const g = m.get(k) ?? { n: 0, L: 0, rec: 0, drl: 0, rqd: 0 }
    g.n++; g.L += p.photographed; g.rec += p.recovery * p.photographed; g.drl += p.driller * p.photographed; g.rqd += p.rqd * p.photographed
    m.set(k, g)
  })
  return Array.from(m.entries()).map(([k, g]) => ({ key: k, shifts: g.n, metres: g.L, recovery: g.rec / g.L, driller: g.drl / g.L, rqd: g.rqd / g.L }))
}

export function photoTotal(logs: ShiftLog[]) {
  return photoBy(logs, () => 'all')[0] ?? null
}
