/* ==========================================================================
 * THE ROCK AHEAD
 *
 * Every cored hole around a rig is a column of measured rock: fractures a
 * metre, RQD and vein share, metre by metre from the tray photos. The next
 * metres below the bit are predicted from the nearest columns at the same
 * depth, closer holes counting more. The same columns tell Copilot when the
 * target (vein-rich rock) has run out below, so a hole can stop early.
 * ========================================================================== */

import type { Hole } from './data'

export const BROKEN_FF = 8
export const WEAK_RQD = 60

export interface Metre {
  from: number; to: number
  ff: number; rqd: number; vein: number; recovery: number
  broken: boolean; sure: number
  holes: string[]
}

export function rockAhead(target: { id: string; x: number; z: number }, holes: Hole[], from: number, metres: number, k = 4): Metre[] {
  const near = holes.filter(h => h.id !== target.id && h.rows.length)
    .map(h => ({ h, d: Math.max(15, Math.hypot(h.x - target.x, h.z - target.z)) }))
    .sort((a, b) => a.d - b.d).slice(0, k)
  const out: Metre[] = []
  for (let i = 0; i < metres; i++) {
    const a = Math.floor(from) + i, mid = a + 0.5
    const seen = near.map(n => ({ n, row: n.h.rows.find(r => mid >= r.from && mid < r.to) })).filter(x => x.row)
    if (!seen.length) { out.push({ from: a, to: a + 1, ff: 0, rqd: 0, vein: 0, recovery: 0, broken: false, sure: 0, holes: [] }); continue }
    let W = 0, ff = 0, rqd = 0, vein = 0, rec = 0, bw = 0
    seen.forEach(({ n, row }) => {
      const w = 1 / (n.d * n.d)
      W += w; ff += row!.ff * w; rqd += row!.rqd * w; vein += row!.vein * w; rec += row!.recovery * w
      if (row!.ff > BROKEN_FF || row!.rqd < WEAK_RQD) bw += w
    })
    const share = bw / W
    const agree = Math.max(share, 1 - share)
    const cover = Math.min(1, seen.length / Math.min(3, near.length))
    const close = Math.min(1, 60 / near[0].d)
    out.push({ from: a, to: a + 1, ff: ff / W, rqd: rqd / W, vein: vein / W, recovery: rec / W, broken: share >= 0.4, sure: Math.round(agree * (0.55 + 0.45 * cover) * (0.7 + 0.3 * close) * 100) / 100, holes: seen.map(s => s.n.h.id) })
  }
  return out
}

export function nextBroken(ahead: Metre[], depth: number, minSure = 0.45) {
  const i = ahead.findIndex(m => m.broken && m.sure >= minSure && m.to > depth)
  if (i < 0) return null
  let j = i
  while (j + 1 < ahead.length && ahead[j + 1].broken) j++
  const zone = ahead.slice(i, j + 1)
  return {
    top: Math.max(depth, ahead[i].from), base: ahead[j].to, inMetres: Math.max(0, ahead[i].from - depth),
    sure: zone.reduce((s, m) => s + m.sure, 0) / zone.length,
    ff: zone.reduce((s, m) => s + m.ff, 0) / zone.length,
    holes: Array.from(new Set(zone.flatMap(m => m.holes))),
  }
}

export function groundAt(ahead: Metre[], d: number): 'good' | 'hard' | 'broken' {
  const m = ahead.find(x => d >= x.from && d < x.to)
  if (!m || !m.holes.length) return 'good'
  return m.broken ? 'broken' : m.ff > 5 ? 'hard' : 'good'
}

/* The richest quarter of 10 m vein windows across the project's cored holes. */
export function targetLevel(holes: Hole[]) {
  const v: number[] = []
  holes.forEach(h => {
    for (let d = 10; d <= (h.rows.at(-1)?.to ?? 0); d += 2) {
      const xs = h.rows.filter(r => r.from >= d - 10 && r.from < d)
      if (xs.length) v.push(xs.reduce((s, r) => s + r.vein, 0) / xs.length)
    }
  })
  v.sort((a, b) => a - b)
  return v.length ? v[Math.floor(v.length * 0.75)] : 0.1
}

/* Geology GPS from the holes around: is there any target-grade rock left
 * between the bit and the planned depth? If not, stop a few metres past
 * the deepest target seen around at this level. */
export function stopCall(target: { id: string; x: number; z: number }, holes: Hole[], depth: number, planned: number | null, level: number) {
  if (!planned || planned - depth < 15) return null
  const below = rockAhead(target, holes, depth, Math.ceil(planned - depth), 4)
  const known = below.filter(m => m.holes.length)
  if (known.length < (planned - depth) * 0.4) return null              // the holes around do not reach deep enough to judge
  const rich = below.filter(m => m.vein >= level && m.holes.length)
  if (rich.length > Math.max(2, known.length * 0.1)) return null
  const above = rockAhead(target, holes, Math.max(0, depth - 40), 40, 4).filter(m => m.vein >= level)
  const lastTarget = above.length ? above[above.length - 1].to : null
  // No target seen around at this level: stop now. Otherwise keep 8 m past the last of it.
  const stopAt = lastTarget == null ? depth : Math.max(depth, lastTarget + 8)
  const saving = planned - stopAt
  if (saving < 12) return null
  return { stopAt, saving, lastTarget, holes: Array.from(new Set(known.flatMap(m => m.holes))) }
}
