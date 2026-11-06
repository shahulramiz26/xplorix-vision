import type { CoreTray, BreakVerdict, GapVerdict } from './model'

/* ==========================================================================
 * XPLORIX CORE — the numbers
 *
 * Every result is counted from what the photo step found and the geologist
 * confirmed, with the rules a geologist uses with a tape and a protractor.
 * Nothing is stored as a bare number, so each one can be traced to the photo.
 *
 *   Core recovery   core in the tray ÷ length drilled
 *   RQD             pieces 10 cm or longer ÷ length (cut only by natural
 *                   fractures and by missing core; a break made in handling
 *                   does not cut a piece)                        (Deere 1964)
 *   Fractures / m   natural fractures ÷ metres of core
 *   Joint density   wJd = Σ f(α) ÷ length, f = 1 (α ≥ 60°), 1.5 (30–60°),
 *                   3.5 (15–30°), 6 (< 15°)                 (Palmström 2005)
 *   RQD from wJd    110 − 2.5 × wJd, a cross-check on RQD   (Palmström 2005)
 *   JRC proxy       roughness of each fracture trace, 400 × amplitude ÷
 *                   trace length, capped 0–20                (Barton 1982)
 *   Weathering      grade 1 (fresh) to 5 (completely weathered), from iron
 *                   staining on the core surface
 *   GSI proxy       1.5 × JCond89 + RQD ÷ 2                 (Hoek et al. 2013)
 *                   JCond89 from roughness and weathering on the photo;
 *                   aperture, infill and persistence cannot be seen on a
 *                   photo and are taken as typical (4 + 4 + 2 of 22)
 *   Discing         three or more square breaks (α ≥ 75°) each closer than
 *                   half the core diameter to the next
 *   Alpha           angle of each fracture to the core axis; true dip and dip
 *                   direction need an orientation line on the core (beta)
 * ========================================================================== */

export interface Overrides {
  breaks: Record<string, BreakVerdict>          // break id → what the geologist says
  gaps: Record<string, GapVerdict>              // gap id (tray:row:x0) → lost, sampled or not a gap
  added: { id: string; tray: string; at: number; alpha: number; kind: 'natural' | 'handling' }[]
}
export const NO_OVERRIDES: Overrides = { breaks: {}, gaps: {}, added: [] }

export interface HoleBreak { id: string; tray: string; at: number; alpha: number; jrc: number; kind: 'natural' | 'handling'; confidence: 'high' | 'medium' | 'low'; changed: boolean }
export interface HoleGap { id: string; tray: string; from: number; to: number; verdict: GapVerdict; changed: boolean }

export const gapId = (tray: string, row: number, x0: number) => `${tray}:${row}:${x0}`

/* Everything along a hole, with the geologist's corrections applied. */
export function flatten(trays: CoreTray[], ov: Overrides = NO_OVERRIDES) {
  const cover: { from: number; to: number; tray: string }[] = []
  const breaks: HoleBreak[] = []
  const gaps: HoleGap[] = []
  const bins: (CoreTray['bins'][number] & { tray: string })[] = []
  trays.forEach(t => {
    cover.push({ from: t.from, to: t.usedTo, tray: t.id })
    t.breaks.forEach(b => {
      const v = ov.breaks[b.id]
      if (v === 'none') return
      breaks.push({ id: b.id, tray: t.id, at: b.at, alpha: b.alpha, jrc: b.jrc, kind: v ?? b.kind, confidence: b.confidence, changed: !!v })
    })
    t.spans.filter(s => s.kind === 'empty').forEach(s => {
      const id = gapId(t.id, s.row, s.x0)
      const v = ov.gaps[id]
      if (v === 'core') return
      gaps.push({ id, tray: t.id, from: s.from, to: s.to, verdict: v ?? 'lost', changed: !!v })
    })
    t.bins.forEach(b => bins.push({ ...b, tray: t.id }))
  })
  ov.added.forEach(a => {
    if (!trays.some(t => t.id === a.tray)) return
    breaks.push({ id: a.id, tray: a.tray, at: a.at, alpha: a.alpha, jrc: 0, kind: a.kind, confidence: 'high', changed: true })
  })
  breaks.sort((a, b) => a.at - b.at)
  gaps.sort((a, b) => a.from - b.from)
  cover.sort((a, b) => a.from - b.from)
  return { cover, breaks, gaps, bins }
}
export type Flat = ReturnType<typeof flatten>

const ov1 = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))

/* Pieces of core along the whole hole: cut by natural fractures, by missing
 * core and by the end of the photographed length. */
export function pieces(f: Flat): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = []
  const cuts = f.breaks.filter(b => b.kind === 'natural').map(b => b.at)
  f.cover.forEach(c => {
    // core present = cover minus gaps (lost or sampled)
    let at = c.from
    const segs: { from: number; to: number }[] = []
    f.gaps.filter(g => g.to > c.from && g.from < c.to).forEach(g => {
      if (g.from > at) segs.push({ from: at, to: g.from })
      at = Math.max(at, g.to)
    })
    if (at < c.to) segs.push({ from: at, to: c.to })
    segs.forEach(s => {
      let p = s.from
      cuts.filter(x => x > s.from && x < s.to).forEach(x => { out.push({ from: p, to: x }); p = x })
      out.push({ from: p, to: s.to })
    })
  })
  return out.filter(p => p.to - p.from > 0.0005)
}

export const WJD_FACTOR = (alpha: number) => alpha >= 60 ? 1 : alpha >= 30 ? 1.5 : alpha >= 15 ? 3.5 : 6

export function weatheringGrade(ox: number): 1 | 2 | 3 | 4 | 5 {
  return ox < 0.04 ? 1 : ox < 0.12 ? 2 : ox < 0.28 ? 3 : ox < 0.5 ? 4 : 5
}
export const WEATHERING = ['', 'Fresh', 'Slightly weathered', 'Moderately weathered', 'Highly weathered', 'Completely weathered']

export function roughnessRating(jrc: number) { return jrc >= 14 ? 6 : jrc >= 10 ? 5 : jrc >= 6 ? 3 : jrc >= 2 ? 1 : 0 }
export function weatheringRating(g: number) { return [0, 6, 5, 3, 1, 0][g] ?? 0 }
export const ASSUMED_JCOND = 4 + 4 + 2   // aperture, infill, persistence: not visible on a photo

export function gsiProxy(rqd: number, jrc: number, grade: number) {
  const jcond = roughnessRating(jrc) + weatheringRating(grade) + ASSUMED_JCOND
  return Math.round(Math.max(0, Math.min(100, 1.5 * jcond + rqd / 2)))
}

export function rqdClass(rqd: number) {
  return rqd >= 90 ? 'Excellent' : rqd >= 75 ? 'Good' : rqd >= 50 ? 'Fair' : rqd >= 25 ? 'Poor' : 'Very poor'
}
export function gsiClass(gsi: number) {
  return gsi >= 75 ? 'Very good' : gsi >= 55 ? 'Good' : gsi >= 35 ? 'Fair' : gsi >= 20 ? 'Poor' : 'Very poor'
}

export interface IntervalResult {
  from: number
  to: number
  length: number            // photographed length inside the interval
  recovered: number
  recovery: number          // %
  rqd: number               // %
  natural: number
  handling: number
  unsure: number            // low-confidence suggestions not yet checked
  ff: number                // natural fractures per metre of core
  wjd: number
  rqdWjd: number
  jrc: number
  ox: number
  weathering: number        // grade 1–5
  gsi: number
  vein: number              // share of core surface
  hex: string
  cls: number               // most common rock class
  alphas: number[]
}

function meanHex(hexes: string[]) {
  if (!hexes.length) return '#000000'
  let r = 0, g = 0, b = 0
  hexes.forEach(h => { r += parseInt(h.slice(1, 3), 16); g += parseInt(h.slice(3, 5), 16); b += parseInt(h.slice(5, 7), 16) })
  const n = hexes.length, x = (v: number) => Math.round(v / n).toString(16).padStart(2, '0')
  return `#${x(r)}${x(g)}${x(b)}`
}

export function interval(f: Flat, a: number, b: number, ps = pieces(f)): IntervalResult | null {
  const length = f.cover.reduce((s, c) => s + ov1(a, b, c.from, c.to), 0)
  if (length < 0.02) return null
  const lost = f.gaps.filter(g => g.verdict === 'lost').reduce((s, g) => s + ov1(a, b, g.from, g.to), 0)
  const sampled = f.gaps.filter(g => g.verdict === 'sampled').reduce((s, g) => s + ov1(a, b, g.from, g.to), 0)
  const recovered = Math.max(0, length - lost)
  const measured = Math.max(0.0001, length - sampled)     // sampled-out core cannot be judged
  const long = ps.reduce((s, p) => s + (p.to - p.from >= 0.1 - 1e-9 ? ov1(a, b, p.from, p.to) : 0), 0)
  const inside = f.breaks.filter(x => x.at >= a && x.at < b)
  const nat = inside.filter(x => x.kind === 'natural')
  const wjd = nat.reduce((s, x) => s + WJD_FACTOR(x.alpha), 0) / length
  const jrc = nat.length ? nat.reduce((s, x) => s + x.jrc, 0) / nat.length : 0
  const bins = f.bins.filter(x => x.to > a && x.from < b && x.core > 0.2)
  const w = bins.reduce((s, x) => s + x.core, 0) || 1
  const ox = bins.reduce((s, x) => s + x.ox * x.core, 0) / w
  const vein = bins.reduce((s, x) => s + x.vein * x.core, 0) / w
  const counts: Record<number, number> = {}
  bins.forEach(x => { counts[x.cls] = (counts[x.cls] ?? 0) + x.core })
  const cls = Number(Object.entries(counts).sort((p, q) => q[1] - p[1])[0]?.[0] ?? -1)
  const rqd = Math.min(100, (long / measured) * 100)
  const grade = weatheringGrade(ox)
  return {
    from: a, to: b, length, recovered,
    recovery: (recovered / length) * 100,
    rqd,
    natural: nat.length, handling: inside.length - nat.length,
    unsure: inside.filter(x => x.confidence === 'low' && !x.changed).length,
    ff: recovered > 0 ? nat.length / recovered : 0,
    wjd, rqdWjd: Math.max(0, Math.min(100, 110 - 2.5 * wjd)),
    jrc, ox, weathering: grade, gsi: gsiProxy(rqd, jrc, grade), vein,
    hex: meanHex(bins.map(x => x.hex)), cls, alphas: nat.map(x => x.alpha),
  }
}

/* Fixed intervals down the hole (1 m by default). */
export function intervals(f: Flat, step = 1): IntervalResult[] {
  if (!f.cover.length) return []
  const ps = pieces(f)
  const top = Math.floor(f.cover[0].from / step) * step, end = Math.max(...f.cover.map(c => c.to))
  const out: IntervalResult[] = []
  for (let a = top; a < end - 1e-9; a += step) {
    const r = interval(f, round3(a), round3(Math.min(end, a + step)), ps)
    if (r) out.push(r)
  }
  return out
}
const round3 = (n: number) => Math.round(n * 1000) / 1000

/* Length-weighted totals. */
export function totals(rs: IntervalResult[]) {
  const L = rs.reduce((s, r) => s + r.length, 0)
  const wt = (k: keyof IntervalResult) => L ? rs.reduce((s, r) => s + (r[k] as number) * r.length, 0) / L : 0
  const rec = rs.reduce((s, r) => s + r.recovered, 0)
  const nat = rs.reduce((s, r) => s + r.natural, 0)
  return {
    metres: L, recovery: L ? (rec / L) * 100 : 0, rqd: wt('rqd'), ff: rec ? nat / rec : 0,
    wjd: wt('wjd'), jrc: wt('jrc'), gsi: wt('gsi'), weathering: wt('weathering'), vein: wt('vein'),
    natural: nat, handling: rs.reduce((s, r) => s + r.handling, 0), unsure: rs.reduce((s, r) => s + r.unsure, 0),
  }
}

/* Stress cracking: runs of square breaks closer than half the core diameter. */
export function discing(f: Flat, coreMm = 63.5) {
  const gap = coreMm / 2000
  const sq = f.breaks.filter(b => b.alpha >= 75)
  const zones: { from: number; to: number; count: number }[] = []
  let run: typeof sq = []
  const flush = () => { if (run.length >= 3) zones.push({ from: run[0].at, to: run[run.length - 1].at, count: run.length }); run = [] }
  sq.forEach(b => {
    if (run.length && b.at - run[run.length - 1].at > gap) flush()
    run.push(b)
  })
  flush()
  return zones
}

/* Joint sets: groups of natural fractures at a similar angle to the core axis.
 * One to three sets, kept only when the split is clear. */
export function jointSets(alphas: number[]) {
  const xs = [...alphas].sort((a, b) => a - b)
  if (xs.length < 6) return { sets: xs.length ? [{ mean: avg(xs), sd: sd(xs), n: xs.length, share: 1 }] : [], note: xs.length ? 'Too few fractures to split into sets.' : 'No natural fractures.' }
  const fit = (k: number) => {
    let c = Array.from({ length: k }, (_, i) => xs[Math.floor(((i + 0.5) / k) * xs.length)])
    let groups: number[][] = []
    for (let it = 0; it < 30; it++) {
      groups = c.map(() => [])
      xs.forEach(x => { let bi = 0; c.forEach((m, i) => { if (Math.abs(x - m) < Math.abs(x - c[bi])) bi = i }); groups[bi].push(x) })
      c = groups.map((g, i) => g.length ? avg(g) : c[i])
    }
    const within = groups.reduce((s, g) => s + g.reduce((t, x) => t + (x - avg(g)) ** 2, 0), 0)
    return { groups: groups.filter(g => g.length), within }
  }
  const one = fit(1)
  let best = one
  for (const k of [2, 3]) {
    const f = fit(k)
    const enough = f.groups.every(g => g.length / xs.length >= 0.1)
    const apart = f.groups.map(avg).sort((a, b) => a - b).every((m, i, arr) => i === 0 || m - arr[i - 1] >= 15)
    if (enough && apart && f.within < best.within * 0.55) best = f
  }
  return {
    sets: best.groups.map(g => ({ mean: Math.round(avg(g)), sd: Math.round(sd(g)), n: g.length, share: g.length / xs.length })).sort((a, b) => b.n - a.n),
    note: '',
  }
}
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1)
const sd = (xs: number[]) => { const m = avg(xs); return Math.sqrt(avg(xs.map(x => (x - m) ** 2))) }

/* Rock class of a bin: the nearest class centre in scaled colour/texture space. */
export type Feat = { L: number; a: number; b: number; tex: number; vein: number; ox: number }
export const FEAT_KEYS: (keyof Feat)[] = ['L', 'a', 'b', 'tex', 'vein', 'ox']
export const FEAT_WEIGHT: Record<keyof Feat, number> = { L: 1.2, a: 1, b: 1, tex: 0.8, vein: 0.6, ox: 0.6 }
export function scaled(x: Feat, scale: Record<keyof Feat, [number, number]>) {
  return FEAT_KEYS.map(k => ((x[k] - scale[k][0]) / (scale[k][1] || 1)) * FEAT_WEIGHT[k])
}
export function nearestClass(x: Feat, centres: Feat[], scale: Record<keyof Feat, [number, number]>) {
  const v = scaled(x, scale)
  let bi = 0, bd = Infinity
  centres.forEach((c, i) => { const w = scaled(c, scale); const d = v.reduce((s, q, j) => s + (q - w[j]) ** 2, 0); if (d < bd) { bd = d; bi = i } })
  return bi
}
