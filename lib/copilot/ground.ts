/* ==========================================================================
 * XPLORIX COPILOT — THE GROUND MODEL
 *
 * Copilot reads the rock ahead of the bit from the holes already drilled
 * around it. Every cored hole on the project is a column of measured rock:
 * rock class, RQD, fractures a metre and vein share, metre by metre from
 * the tray photos. For the hole being drilled, the next metres are
 * predicted from the nearest of those columns at the same depth, closer
 * holes counting more.
 *
 * The same model runs Geology GPS: once the bit has left the target
 * (vein-rich rock) and the holes around show nothing more below, Copilot
 * says where the hole can stop. Both are back-tested on the real cored
 * holes, leaving each hole out in turn, so the screen can say how often
 * they were right.
 * ========================================================================== */

import type { IntervalResult } from '../core/geotech'

export interface Column {
  hole: string
  x: number; z: number            // collar position, metres east and north of the project origin
  rows: IntervalResult[]          // 1 m rows from the core photos
  drilled: number
}

export const BROKEN_FF = 8         // natural fractures a metre: broken ground from here
export const WEAK_RQD = 60

export interface AheadMetre {
  from: number; to: number
  cls: number                      // most likely rock class, -1 when unknown
  ff: number; rqd: number; vein: number
  broken: boolean
  sure: number                     // 0–1: how much the nearby holes agree, and how close they are
  from_: string[]                  // the holes that spoke for this metre
}

const dist = (a: Column, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z)
function rowAt(c: Column, d: number) { return c.rows.find(r => d >= r.from && d < r.to) }

/* The next `metres` below `depth`, metre by metre, from up to `k` nearby holes. */
export function groundAhead(target: { hole: string; x: number; z: number }, cols: Column[], depth: number, metres = 12, k = 4): AheadMetre[] {
  const near = cols.filter(c => c.hole !== target.hole && c.rows.length)
    .map(c => ({ c, d: Math.max(15, dist(c, target)) }))
    .sort((a, b) => a.d - b.d).slice(0, k)
  const out: AheadMetre[] = []
  for (let i = 0; i < metres; i++) {
    const from = Math.floor(depth) + i, to = from + 1, mid = from + 0.5
    const seen = near.map(n => ({ n, r: rowAt(n.c, mid) })).filter(x => x.r) as { n: { c: Column; d: number }; r: IntervalResult }[]
    if (!seen.length) { out.push({ from, to, cls: -1, ff: 0, rqd: 0, vein: 0, broken: false, sure: 0, from_: [] }); continue }
    let W = 0, ff = 0, rqd = 0, vein = 0, bw = 0
    const vote = new Map<number, number>()
    seen.forEach(({ n, r }) => {
      const w = 1 / (n.d * n.d)
      W += w; ff += r.ff * w; rqd += r.rqd * w; vein += r.vein * w
      if (r.ff > BROKEN_FF || r.rqd < WEAK_RQD) bw += w
      vote.set(r.cls, (vote.get(r.cls) ?? 0) + w)
    })
    const cls = Array.from(vote.entries()).sort((a, b) => b[1] - a[1])[0][0]
    const brokenShare = bw / W
    const agree = Math.max(brokenShare, 1 - brokenShare)              // how one-sided the holes are
    const cover = Math.min(1, seen.length / Math.min(3, near.length))  // how many holes reach this deep
    const close = Math.min(1, 60 / near[0].d)                          // nearest hole within ~60 m: full weight
    out.push({
      from, to, cls, ff: ff / W, rqd: rqd / W, vein: vein / W,
      broken: brokenShare >= 0.4, sure: Math.round(agree * (0.55 + 0.45 * cover) * (0.7 + 0.3 * close) * 100) / 100,
      from_: seen.map(s => s.n.c.hole),
    })
  }
  return out
}

/* The first broken stretch ahead, if the holes around agree on it. */
export function nextBroken(ahead: AheadMetre[], depth: number, minSure = 0.55) {
  const i = ahead.findIndex(m => m.broken && m.sure >= minSure && m.to > depth)
  if (i < 0) return null
  let j = i
  while (j + 1 < ahead.length && ahead[j + 1].broken) j++
  const zone = ahead.slice(i, j + 1)
  return {
    top: Math.max(depth, ahead[i].from), base: ahead[j].to, inMetres: Math.max(0, ahead[i].from - depth),
    sure: zone.reduce((s, m) => s + m.sure, 0) / zone.length,
    ff: zone.reduce((s, m) => s + m.ff, 0) / zone.length,
    holes: Array.from(new Set(zone.flatMap(m => m.from_))),
  }
}

/* ── Back-test: leave each cored hole out, predict it from the others ──── */

export interface Backtest { k: number; holes: number; metres: number; right: number; brokenFound: number; brokenAll: number }

export function backtest(cols: Column[], k: number): Backtest {
  let metres = 0, right = 0, brokenFound = 0, brokenAll = 0, holes = 0
  cols.filter(c => c.rows.length > 20).forEach(c => {
    const others = cols.filter(o => o.hole !== c.hole)
    if (!others.length) return
    holes++
    const pred = groundAhead(c, others, 0, Math.ceil(c.drilled), k)
    c.rows.forEach(r => {
      const p = pred.find(m => r.from >= m.from && r.from < m.to)
      if (!p || !p.from_.length) return
      const actual = r.ff > BROKEN_FF || r.rqd < WEAK_RQD
      metres++
      if (p.broken === actual) right++
      if (actual) { brokenAll++; if (p.broken) brokenFound++ }
    })
  })
  return { k, holes, metres, right, brokenFound, brokenAll }
}

/* ── Geology GPS: where the target ends, and where the hole can stop ──── */

export interface GpsPlan {
  hole: string
  planned: number | null
  drilled: number
  targetTop: number | null; targetBase: number | null
  stopAt: number | null            // where Copilot says the hole can stop
  saving: number                   // metres not drilled
  missed: number                   // target metres below the stop (from the hole's own core): what stopping would have cost
  why: string
}

const AVG = 10       // metres in the moving average
const BUFFER = 8     // keep drilling this far past the last target metre

function vein10(rows: IntervalResult[], d: number) {
  const xs = rows.filter(r => r.from >= d - AVG && r.from < d)
  return xs.length ? xs.reduce((s, r) => s + r.vein, 0) / xs.length : 0
}

/* The share of veins that counts as target on this project: the richest
 * quarter of 10 m windows across every cored hole. */
export function targetLevel(cols: Column[]) {
  const v: number[] = []
  cols.forEach(c => { for (let d = AVG; d <= c.drilled; d += 2) v.push(vein10(c.rows, d)) })
  v.sort((a, b) => a - b)
  return v.length ? v[Math.floor(v.length * 0.75)] : 0.1
}

/* Run the hole down metre by metre as it was drilled. Stop when the last
 * 10 m are below target, the target has been seen, and the nearby holes
 * show no target in the next 20 m below. */
export function gpsFor(c: Column, cols: Column[], level: number, planned: number | null): GpsPlan {
  const end = Math.max(c.drilled, planned ?? 0)
  let top: number | null = null, base: number | null = null, stop: number | null = null
  for (let d = AVG; d <= c.drilled; d++) {
    const v = vein10(c.rows, d)
    if (v >= level) { if (top == null) top = d - AVG; base = d }
    if (top == null || base == null || d < base + BUFFER) continue
    const below = groundAhead(c, cols, d, 20, 4)
    const rich = below.filter(m => m.vein >= level && m.from_.length).length
    if (rich <= 2 && v < level * 0.8) { stop = d; break }
  }
  const saving = stop != null ? Math.max(0, end - stop) : 0
  const missed = stop != null ? c.rows.filter(r => r.from >= stop! && r.vein >= level).length : 0
  const why = top == null ? 'No target-grade veins seen in this hole.'
    : stop == null ? `Target from ${Math.round(top)} m runs to ${Math.round(base!)} m and the holes around show more below: keep drilling.`
    : `Target from ${Math.round(top)} m to ${Math.round(base!)} m. Below ${Math.round(stop)} m the last ${AVG} m and the holes around show no more target.`
  return { hole: c.hole, planned, drilled: c.drilled, targetTop: top, targetBase: base, stopAt: stop, saving, missed, why }
}
