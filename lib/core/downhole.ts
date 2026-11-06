import type { CoreHole, CoreTray } from './model'
import type { Flat, IntervalResult } from './geotech'
import { jointSets } from './geotech'
import { toLab } from './engine'

/* ==========================================================================
 * XPLORIX CORE — the other downhole data
 *
 * A tray photo is one dataset. Most holes also have assays, downhole
 * geophysics, core-scanner readings (XRF and hyperspectral), a televiewer
 * run, lab strength tests, and the geologist's own log. This file holds
 * those, one row a metre, joined to the photo measurements on depth.
 *
 * DEMO DATA. The demo holes have no assays or scans of their own, so these
 * are generated from what the real photos show at each metre (rock class,
 * veins, staining, fractures), with fixed seeds so every screen and every
 * visit shows the same numbers. An imported CSV replaces them hole by hole.
 *
 * Then, from all of it together:
 *   - the geologist's log checked against the photos (lithology and RQD)
 *   - veins found on the photos, sorted into vein classes
 *   - structures from the televiewer: true dip and dip direction
 *   - domains: metres grouped by photo + chemistry + geophysics together
 *   - predictions: rock strength, mineralogy and rock quality where they were
 *     not measured, from the metres where they were
 * ========================================================================== */

export interface HoleView { data: CoreHole; rows: IntervalResult[]; flat: Flat; trays: CoreTray[] }

/* ── seeded numbers ──────────────────────────────────────────────────────── */

function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }
export function rng(seed: string) {
  let a = hash(seed)
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
export function gauss(r: () => number) { const u = Math.max(1e-9, r()), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) }
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const r1 = (v: number) => Math.round(v * 10) / 10
const r2 = (v: number) => Math.round(v * 100) / 100
const r3 = (v: number) => Math.round(v * 1000) / 1000
export const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0

/* ── the rock types the geologist logs ──────────────────────────────────── */

export interface Lith { code: string; name: string; hex: string }
/* What the geologist calls the rock that each photo class mostly is. Used
 * only to write the demo's manual log and chemistry; the screens find the
 * match between photo classes and the log from the data itself. */
export const LITHS: Lith[] = [
  { code: 'BAS', name: 'Basalt', hex: '#4b5a52' },
  { code: 'SLT', name: 'Siltstone', hex: '#8a7a68' },
  { code: 'OXD', name: 'Oxidised zone', hex: '#b5743a' },
  { code: 'QVS', name: 'Quartz-veined sediment', hex: '#9aa7b5' },
  { code: 'SST', name: 'Sandstone', hex: '#d2bf95' },
  { code: 'LST', name: 'Limestone', hex: '#c9d1d6' },
]
const CONFUSE = [1, 0, 1, 4, 3, 4]     // what each is most often mistaken for

interface Sig { SiO2: number; Al2O3: number; Fe2O3: number; CaO: number; MgO: number; K2O: number; S: number; Au: number; Cu: number; As: number; density: number; magsus: number; gamma: number; ucs: number; min: number[] }
/* Per class: oxides in %, S %, Au g/t, Cu and As ppm, density g/cm³,
 * magnetic susceptibility ×10⁻³ SI, gamma API, UCS MPa, mineral mix. */
const SIG: Sig[] = [
  { SiO2: 48, Al2O3: 15, Fe2O3: 12, CaO: 9, MgO: 7, K2O: 0.5, S: 0.12, Au: 0.015, Cu: 110, As: 4, density: 2.92, magsus: 22, gamma: 14, ucs: 175, min: [0.08, 0.5, 0.08, 0.26, 0.03, 0.05] },
  { SiO2: 62, Al2O3: 16, Fe2O3: 6, CaO: 1.5, MgO: 2, K2O: 3.2, S: 0.3, Au: 0.03, Cu: 45, As: 18, density: 2.68, magsus: 0.4, gamma: 118, ucs: 70, min: [0.3, 0.12, 0.42, 0.06, 0.07, 0.03] },
  { SiO2: 55, Al2O3: 14, Fe2O3: 18, CaO: 0.6, MgO: 0.8, K2O: 1.4, S: 0.02, Au: 0.07, Cu: 60, As: 40, density: 2.32, magsus: 1.1, gamma: 62, ucs: 16, min: [0.24, 0.02, 0.14, 0.01, 0.33, 0.26] },
  { SiO2: 74, Al2O3: 9, Fe2O3: 4, CaO: 2.5, MgO: 1, K2O: 2.1, S: 1.1, Au: 0.22, Cu: 520, As: 260, density: 2.71, magsus: 0.3, gamma: 70, ucs: 140, min: [0.58, 0.05, 0.22, 0.11, 0.02, 0.02] },
  { SiO2: 80, Al2O3: 8, Fe2O3: 2.4, CaO: 0.8, MgO: 0.5, K2O: 1.8, S: 0.05, Au: 0.012, Cu: 15, As: 6, density: 2.55, magsus: 0.15, gamma: 46, ucs: 90, min: [0.74, 0.02, 0.12, 0.03, 0.07, 0.02] },
  { SiO2: 8, Al2O3: 2, Fe2O3: 0.8, CaO: 48, MgO: 2.2, K2O: 0.3, S: 0.05, Au: 0.008, Cu: 8, As: 3, density: 2.71, magsus: 0.05, gamma: 11, ucs: 80, min: [0.06, 0.01, 0.03, 0.88, 0.01, 0.01] },
]
export const MINERALS = ['Quartz', 'Chlorite', 'White mica', 'Carbonate', 'Kaolinite', 'Iron oxides']
export const MINERAL_HEX = ['#d9dde3', '#4f8a5b', '#c7b26d', '#8fb3d9', '#e7c7b0', '#b4652e']

/* Which hole has which dataset. Real projects are patchy like this. */
export const DATASETS = {
  assay: { label: 'Assays (fire assay Au, 4-acid ICP)', short: 'Assays' },
  geophys: { label: 'Downhole geophysics (density, mag sus, gamma)', short: 'Geophysics' },
  scanner: { label: 'Core scanner (XRF + hyperspectral)', short: 'Core scanner' },
  televiewer: { label: 'Televiewer (ATV / OTV)', short: 'Televiewer' },
  lab: { label: 'Lab strength tests (UCS)', short: 'Lab UCS' },
  manualLith: { label: "Geologist's lithology log", short: 'Lithology log' },
  manualRqd: { label: "Geologist's geotech log (RQD)", short: 'Geotech log' },
} as const
export type DatasetKey = keyof typeof DATASETS
const HAS: Record<DatasetKey, (h: string) => boolean> = {
  assay: () => true,
  geophys: () => true,
  scanner: h => ['DH-961', 'DH-952', 'DH-911', 'DH-131'].includes(h),
  televiewer: h => ['DH-961', 'DH-131', 'DH-101'].includes(h),
  lab: h => ['DH-961', 'DH-131', 'DH-101', 'DH-952'].includes(h),
  manualLith: () => true,
  manualRqd: h => ['DH-961', 'DH-131', 'DH-101'].includes(h),
}
export const hasData = (k: DatasetKey, hole: string) => HAS[k](hole)

/* Hole collar orientation, for the televiewer. */
const ORIENT: Record<string, { az: number; dip: number }> = {
  'DH-961': { az: 92, dip: -62 }, 'DH-131': { az: 268, dip: -70 }, 'DH-101': { az: 255, dip: -65 },
}
export const holeOrient = (h: string) => ORIENT[h] ?? { az: 90, dip: -60 }

/* ── one metre, every dataset ───────────────────────────────────────────── */

export interface Metre {
  hole: string; project: string; from: number; to: number; cls: number
  photo: { L: number; a: number; b: number; vein: number; ox: number; ff: number; rqd: number; rec: number; weathering: number; hex: string }
  assay: { Au: number; Cu: number; As: number; S: number; SiO2: number; Al2O3: number; Fe2O3: number; CaO: number; MgO: number; K2O: number }
  geophys: { density: number; magsus: number; gamma: number }
  scanner?: { mix: number[]; dominant: number }
  ucs?: number           // lab test, where one was taken
}

const hexRgb = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]

export function holeMetres(h: HoleView): Metre[] {
  const hole = h.data.hole
  const r = rng(`metres:${hole}`)
  let auWalk = 0, cuWalk = 0        // slow-changing noise, so grades run in zones like real assays
  let lastCls = 0
  let nextLab = 4 + r() * 6
  return h.rows.map(row => {
    const cls = row.cls >= 0 ? row.cls : lastCls
    lastCls = cls
    const s = SIG[cls]
    const [R, G, B] = hexRgb(row.hex || '#808080')
    const lab = toLab(R, G, B)
    auWalk = auWalk * 0.7 + gauss(r) * 0.35
    cuWalk = cuWalk * 0.8 + gauss(r) * 0.35
    const v = row.vein, ox = row.ox
    const Au = s.Au * Math.exp(auWalk + 12 * Math.max(0, v - 0.06) + gauss(r) * 0.35)
    const S = Math.max(0.005, s.S * (1 + 6 * v) * Math.exp(gauss(r) * 0.25) * (ox > 0.3 ? 0.2 : 1))
    const assay = {
      Au: r3(clamp(Au, 0.002, 40)),
      Cu: Math.round(clamp(s.Cu * Math.exp(cuWalk + 3 * v + gauss(r) * 0.3), 2, 20000)),
      As: Math.round(clamp(s.As * Math.exp(0.7 * auWalk + 6 * v + gauss(r) * 0.4), 1, 20000)),
      S: r2(S),
      SiO2: r1(clamp(s.SiO2 + 40 * v + gauss(r) * 2.2, 1, 98)),
      Al2O3: r1(clamp(s.Al2O3 - 6 * v + gauss(r) * 0.9, 0.2, 30)),
      Fe2O3: r1(clamp(s.Fe2O3 + 14 * ox + gauss(r) * 0.9, 0.2, 60)),
      CaO: r1(clamp(s.CaO + gauss(r) * Math.max(0.3, s.CaO * 0.06), 0.05, 56)),
      MgO: r1(clamp(s.MgO + gauss(r) * 0.4, 0.05, 25)),
      K2O: r2(clamp(s.K2O + gauss(r) * 0.25, 0.02, 8)),
    }
    const geophys = {
      density: r2(clamp(s.density - 0.35 * ox - (1 - row.recovery / 100) * 0.25 - 0.0022 * (100 - row.rqd) - 0.006 * Math.min(20, row.ff) + gauss(r) * 0.025, 1.8, 3.4)),   // reads low in broken ground
      magsus: r2(clamp(s.magsus * Math.exp(gauss(r) * 0.3) * (1 - 0.8 * Math.min(1, ox * 2)), 0.01, 120)),
      gamma: Math.round(clamp(s.gamma * (1 + gauss(r) * 0.08), 2, 300)),
    }
    let scanner: Metre['scanner']
    if (hasData('scanner', hole)) {
      const mix = s.min.map((m, i) => Math.max(0.001, m * Math.exp(gauss(r) * 0.18) + (i === 0 ? 1.4 * v : 0) + (i >= 4 ? 0.6 * ox : 0)))
      const tot = mix.reduce((a, b) => a + b, 0)
      const norm = mix.map(m => r3(m / tot))
      scanner = { mix: norm, dominant: norm.indexOf(Math.max(...norm)) }
    }
    let ucs: number | undefined
    if (hasData('lab', hole) && row.from >= nextLab && row.recovery > 90) {
      const wf = [1, 1, 0.82, 0.55, 0.3, 0.12][row.weathering] ?? 1
      ucs = Math.round(clamp(s.ucs * wf * (1 - 0.004 * row.ff * 10) * Math.exp(gauss(r) * 0.16), 0.5, 320))
      nextLab = row.from + 9 + r() * 7
    }
    return {
      hole, project: h.data.project, from: row.from, to: row.to, cls,
      photo: { L: r1(lab.L), a: r1(lab.a), b: r1(lab.b), vein: row.vein, ox: row.ox, ff: row.ff, rqd: row.rqd, rec: row.recovery, weathering: row.weathering, hex: row.hex },
      assay, geophys, scanner, ucs,
    }
  })
}

/* ── the geologist's own log ────────────────────────────────────────────── */

export interface ManualInterval { hole: string; from: number; to: number; lith: string; rqd?: number; by: string; at: string; imported?: boolean }

const LOGGERS = ['R. Menon', 'A. Kumar', 'S. Pillai']
const smoothLabels = (xs: number[], w = 2) => xs.map((_, i) => {
  const c: Record<number, number> = {}
  for (let k = Math.max(0, i - w); k <= Math.min(xs.length - 1, i + w); k++) c[xs[k]] = (c[xs[k]] ?? 0) + 1
  return Number(Object.entries(c).sort((a, b) => b[1] - a[1])[0][0])
})

/* The demo's hand log: units of a few metres, named by the geologist, with
 * the misses a busy core shed makes (a unit called the wrong thing, a
 * boundary a metre off, RQD guessed high in broken ground). */
export function demoManualLog(h: HoleView): ManualInterval[] {
  const hole = h.data.hole
  const r = rng(`manual:${hole}`)
  if (!h.rows.length) return []
  let last = 0
  const labels = smoothLabels(h.rows.map(x => { if (x.cls >= 0) last = x.cls; return last }))
  const runs: { from: number; to: number; cls: number }[] = []
  h.rows.forEach((row, i) => {
    const p = runs[runs.length - 1]
    if (p && p.cls === labels[i] && Math.abs(row.from - p.to) < 0.01) p.to = row.to
    else runs.push({ from: row.from, to: row.to, cls: labels[i] })
  })
  // units shorter than 3 m are folded into the one above
  const units: typeof runs = []
  runs.forEach(u => {
    const p = units[units.length - 1]
    const joined = p && Math.abs(u.from - p.to) < 0.01
    if (p && joined && (u.to - u.from < 3 || p.cls === u.cls)) { p.to = u.to; return }
    units.push({ ...u })
  })
  const by = LOGGERS[hash(hole) % LOGGERS.length]
  const geotech = hasData('manualRqd', hole)
  const out: ManualInterval[] = []
  units.forEach((u, i) => {
    let from = u.from, to = u.to
    if (i > 0 && Math.abs(u.from - units[i - 1].to) < 0.01) from = out[i - 1].to
    const next = units[i + 1]
    if (next && Math.abs(next.from - u.to) < 0.01) to = r1(clamp(u.to + (r() - 0.5) * 2.4, from + 1, next.to - 1))
    const wrong = r() < 0.13
    const lith = LITHS[wrong ? CONFUSE[u.cls] : u.cls].name
    let rqd: number | undefined
    if (geotech) {
      const inside = h.rows.filter(x => x.from >= from - 0.01 && x.to <= to + 0.01)
      const photo = mean(inside.map(x => x.rqd))
      rqd = Math.round(clamp(photo + 4 + gauss(r) * 6 + (photo < 60 && r() < 0.35 ? 22 : 0), 0, 100))
    }
    out.push({ hole, from: r1(from), to: r1(to), lith, rqd, by, at: '2026-08-' + String(4 + (hash(hole) % 20)).padStart(2, '0') })
  })
  return out
}

/* ── checking the hand log against the photos ───────────────────────────── */

export interface LogCheck {
  hole: string
  metres: number
  agree: number                                   // share of metres where the log and the photo class agree
  classToLith: Record<number, { lith: string; share: number }>
  disagreements: { from: number; to: number; logged: string; photo: string; photoCls: number }[]
  boundaries: { at: number; nearest: number | null; off: number }[]
  rqd: { from: number; to: number; logged: number; photo: number; diff: number }[]
  rqdBias: number; rqdMae: number
}

const lithAt = (log: ManualInterval[], d: number) => log.find(x => d >= x.from && d < x.to)?.lith

/* Which logged rock each photo class is, worked out from every logged metre
 * on every hole: the most common name for that class. */
export function classLithMap(views: HoleView[], logs: Record<string, ManualInterval[]>) {
  const t: Record<number, Record<string, number>> = {}
  views.forEach(h => h.rows.forEach(row => {
    const l = lithAt(logs[h.data.hole] ?? [], (row.from + row.to) / 2)
    if (!l || row.cls < 0) return
    t[row.cls] = t[row.cls] ?? {}
    t[row.cls][l] = (t[row.cls][l] ?? 0) + 1
  }))
  const out: Record<number, { lith: string; share: number }> = {}
  Object.entries(t).forEach(([c, m]) => {
    const tot = Object.values(m).reduce((a, b) => a + b, 0)
    const [lith, n] = Object.entries(m).sort((a, b) => b[1] - a[1])[0]
    out[Number(c)] = { lith, share: n / tot }
  })
  return out
}

export function checkLog(h: HoleView, log: ManualInterval[], map: Record<number, { lith: string; share: number }>): LogCheck {
  const hole = h.data.hole
  let ok = 0, n = 0
  const dis: LogCheck['disagreements'] = []
  h.rows.forEach(row => {
    const logged = lithAt(log, (row.from + row.to) / 2)
    if (!logged || row.cls < 0) return
    n++
    const photo = map[row.cls]?.lith ?? '—'
    if (photo === logged) { ok++; return }
    const p = dis[dis.length - 1]
    if (p && p.logged === logged && p.photo === photo && Math.abs(p.to - row.from) < 0.01) p.to = row.to
    else dis.push({ from: row.from, to: row.to, logged, photo, photoCls: row.cls })
  })
  // photo boundaries: where the smoothed photo class changes
  let last = 0
  const labels = smoothLabels(h.rows.map(x => { if (x.cls >= 0) last = x.cls; return last }))
  const pb: number[] = []
  h.rows.forEach((row, i) => { if (i && labels[i] !== labels[i - 1] && map[labels[i]]?.lith !== map[labels[i - 1]]?.lith) pb.push(row.from) })
  const boundaries = log.slice(1).map(x => {
    const nearest = pb.length ? pb.reduce((a, b) => Math.abs(b - x.from) < Math.abs(a - x.from) ? b : a) : null
    return { at: x.from, nearest, off: nearest == null ? 99 : r1(Math.abs(nearest - x.from)) }
  })
  const rqd = log.filter(x => x.rqd != null).map(x => {
    const inside = h.rows.filter(rw => rw.from >= x.from - 0.01 && rw.to <= x.to + 0.01)
    const photo = Math.round(mean(inside.map(rw => rw.rqd)))
    return { from: x.from, to: x.to, logged: x.rqd!, photo, diff: x.rqd! - photo }
  }).filter(x => x.to - x.from >= 1)
  return {
    hole, metres: n, agree: n ? ok / n : 0, classToLith: map,
    disagreements: dis.filter(d => d.to - d.from >= 2),
    boundaries, rqd,
    rqdBias: mean(rqd.map(x => x.diff)), rqdMae: mean(rqd.map(x => Math.abs(x.diff))),
  }
}

/* ── veins ──────────────────────────────────────────────────────────────── */

export interface Vein { id: string; hole: string; tray: string; from: number; to: number; length: number; intensity: number; ox: number; L: number; hostL: number; cls: number; confidence: 'high' | 'medium' | 'low' }
export interface VeinClass { id: number; letter: string; name: string; description: string; hex: string }
export const VEIN_CLASSES: VeinClass[] = [
  { id: 0, letter: 'A', name: 'Massive to blocky quartz vein', description: 'Thick, bright, mostly white quartz with blocky texture; quartz-matrix breccia in places, little fill.', hex: '#e8e4d8' },
  { id: 1, letter: 'B', name: 'Laminated quartz ribbons', description: 'Thin pale quartz–carbonate ribbons in a dark host, laminated, with stylolites; often carbonaceous.', hex: '#7c8794' },
  { id: 2, letter: 'C', name: 'Iron-stained vein', description: 'Quartz vein with brown iron-oxide staining on its walls: weathered or oxidised, fluids have moved along it.', hex: '#c0814a' },
  { id: 3, letter: 'D', name: 'Quartz veinlets (stockwork)', description: 'Short thin veinlets crossing the core in more than one direction; a stockwork where they cluster.', hex: '#b9c6cf' },
]

export function findVeins(h: HoleView): Vein[] {
  const bins = h.flat.bins.filter(b => b.core > 0.5).sort((a, b) => a.from - b.from)
  const out: Vein[] = []
  let run: typeof bins = []
  const flush = (i: number) => {
    if (!run.length) return
    const from = run[0].from, to = run[run.length - 1].to
    const before = bins.slice(Math.max(0, i - run.length - 3), i - run.length), after = bins.slice(i, i + 3)
    const host = [...before, ...after]
    const intensity = mean(run.map(b => b.vein)), ox = mean(run.map(b => b.ox)), L = mean(run.map(b => b.L)), hostL = host.length ? mean(host.map(b => b.L)) : L
    const length = to - from
    // vein class by fixed rules on what the photo shows
    let cls: number, margin: number
    if (ox >= 0.16) { cls = 2; margin = (ox - 0.16) / 0.16 }
    else if (length >= 0.15 && intensity >= 0.28) { cls = 0; margin = Math.min((length - 0.15) / 0.15, (intensity - 0.28) / 0.2) }
    else if (hostL < 50) { cls = 1; margin = (50 - hostL) / 15 }
    else { cls = 3; margin = 0.5 }
    out.push({
      id: `${h.data.hole}-V${out.length + 1}`, hole: h.data.hole, tray: run[0].tray, from: r2(from), to: r2(to), length: r2(length),
      intensity: r3(intensity), ox: r3(ox), L: r1(L), hostL: r1(hostL), cls, confidence: margin > 0.6 ? 'high' : margin > 0.2 ? 'medium' : 'low',
    })
    run = []
  }
  bins.forEach((b, i) => {
    const prev = run[run.length - 1]
    if (b.vein >= 0.2 && (!prev || Math.abs(b.from - prev.to) < 0.001)) run.push(b)
    else { flush(i); if (b.vein >= 0.2) run.push(b) }
  })
  flush(bins.length)
  return out
}

/* ── structures from the televiewer ─────────────────────────────────────── */

export interface Structure { id: string; hole: string; at: number; alpha: number; beta: number; dip: number; dipDir: number; type: 'Joint' | 'Vein' | 'Shear'; set: number }

/* alpha, beta and the hole's direction → the plane's true dip and dip
 * direction. Core frame: z down the hole, x to the top of the core. */
export function trueOrientation(alpha: number, beta: number, az: number, holeDip: number) {
  const rad = Math.PI / 180
  const a = alpha * rad, b = beta * rad, T = az * rad, P = Math.abs(holeDip) * rad
  const n = [Math.cos(a) * Math.cos(b), Math.cos(a) * Math.sin(b), Math.sin(a)]
  const d = [Math.sin(T) * Math.cos(P), Math.cos(T) * Math.cos(P), -Math.sin(P)]        // E, N, Up
  const u = [Math.sin(T) * Math.sin(P), Math.cos(T) * Math.sin(P), Math.cos(P)]
  const rr = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]]
  let N = [0, 1, 2].map(i => n[0] * u[i] + n[1] * rr[i] + n[2] * d[i])
  if (N[2] < 0) N = N.map(v => -v)
  const dip = Math.acos(clamp(N[2], -1, 1)) / rad
  let dipDir = Math.atan2(N[0], N[1]) / rad
  if (dipDir < 0) dipDir += 360
  return { dip: Math.round(dip), dipDir: Math.round(dipDir) }
}

export function televiewer(h: HoleView): Structure[] {
  const hole = h.data.hole
  if (!hasData('televiewer', hole)) return []
  const r = rng(`atv:${hole}`)
  const o = holeOrient(hole)
  const nat = h.flat.breaks.filter(b => b.kind === 'natural')
  const sets = jointSets(nat.map(b => b.alpha)).sets
  const betaOf = sets.map(() => 30 + r() * 300)
  const veinAt = (d: number) => h.flat.bins.some(x => d >= x.from - 0.03 && d <= x.to + 0.03 && x.vein >= 0.2)
  const out: Structure[] = []
  nat.forEach(b => {
    if (r() > 0.72) return               // the televiewer misses some, and finds some the photo does not
    const set = sets.length ? sets.reduce((bi, s, i) => Math.abs(s.mean - b.alpha) < Math.abs(sets[bi].mean - b.alpha) ? i : bi, 0) : 0
    const beta = ((betaOf[set] ?? 90) + gauss(r) * 14 + 360) % 360
    const t = trueOrientation(b.alpha, beta, o.az, o.dip)
    const close = nat.filter(x => Math.abs(x.at - b.at) < 0.15).length
    out.push({ id: `${hole}-S${out.length + 1}`, hole, at: r2(b.at), alpha: b.alpha, beta: Math.round(beta), ...t, type: veinAt(b.at) ? 'Vein' : close >= 4 ? 'Shear' : 'Joint', set })
  })
  return out
}

/* Stereonet: lower hemisphere, equal area, pole to each plane. */
export function polePoint(dip: number, dipDir: number, R: number) {
  const trend = ((dipDir + 180) % 360) * Math.PI / 180
  const plunge = (90 - dip) * Math.PI / 180
  const rr = R * Math.SQRT2 * Math.sin((Math.PI / 2 - plunge) / 2)
  return { x: rr * Math.sin(trend), y: -rr * Math.cos(trend) }
}

/* ── features, domains, maps ────────────────────────────────────────────── */

export type FeatureSet = 'photo' | 'chem' | 'all'
interface Feat { key: string; label: string; get: (m: Metre) => number; sets: FeatureSet[]; word: [string, string] }
const lg = (v: number) => Math.log10(Math.max(1e-4, v))
export const FEATURES: Feat[] = [
  { key: 'L', label: 'Brightness', get: m => m.photo.L, sets: ['photo', 'all'], word: ['dark', 'pale'] },
  { key: 'a', label: 'Red–green', get: m => m.photo.a, sets: ['photo', 'all'], word: ['greenish', 'reddish'] },
  { key: 'b', label: 'Yellow–blue', get: m => m.photo.b, sets: ['photo', 'all'], word: ['bluish grey', 'brown'] },
  { key: 'vein', label: 'Veins', get: m => m.photo.vein, sets: ['photo', 'all'], word: ['few veins', 'veined'] },
  { key: 'ox', label: 'Iron staining', get: m => m.photo.ox, sets: ['photo', 'all'], word: ['fresh', 'stained'] },
  { key: 'ff', label: 'Fractures', get: m => Math.min(20, m.photo.ff), sets: ['photo', 'all'], word: ['massive', 'fractured'] },
  { key: 'Au', label: 'Au (log)', get: m => lg(m.assay.Au), sets: ['chem', 'all'], word: ['barren', 'Au-bearing'] },
  { key: 'Cu', label: 'Cu (log)', get: m => lg(m.assay.Cu), sets: ['chem', 'all'], word: ['low Cu', 'Cu-rich'] },
  { key: 'As', label: 'As (log)', get: m => lg(m.assay.As), sets: ['chem', 'all'], word: ['low As', 'high As'] },
  { key: 'SiO2', label: 'SiO₂', get: m => m.assay.SiO2, sets: ['chem', 'all'], word: ['low silica', 'siliceous'] },
  { key: 'Fe2O3', label: 'Fe₂O₃', get: m => m.assay.Fe2O3, sets: ['chem', 'all'], word: ['low iron', 'iron-rich'] },
  { key: 'CaO', label: 'CaO', get: m => m.assay.CaO, sets: ['chem', 'all'], word: ['low Ca', 'calcareous'] },
  { key: 'K2O', label: 'K₂O', get: m => m.assay.K2O, sets: ['chem', 'all'], word: ['low K', 'potassic'] },
  { key: 'MgO', label: 'MgO', get: m => m.assay.MgO, sets: ['chem', 'all'], word: ['low Mg', 'mafic'] },
  { key: 'density', label: 'Density', get: m => m.geophys.density, sets: ['chem', 'all'], word: ['light', 'dense'] },
  { key: 'magsus', label: 'Mag sus (log)', get: m => lg(m.geophys.magsus), sets: ['chem', 'all'], word: ['non-magnetic', 'magnetic'] },
  { key: 'gamma', label: 'Gamma', get: m => m.geophys.gamma, sets: ['chem', 'all'], word: ['low gamma', 'high gamma'] },
]

function standardise(ms: Metre[], fs: Feat[], balance = false) {
  const X = ms.map(m => fs.map(f => f.get(m)))
  const mu = fs.map((_, j) => mean(X.map(x => x[j])))
  const sd = fs.map((_, j) => Math.sqrt(mean(X.map(x => (x[j] - mu[j]) ** 2))) || 1)
  // With photo and chemistry together, each block gets the same total weight,
  // so eleven chemistry columns do not drown six photo ones.
  const nPhoto = fs.filter(f => !f.sets.includes('chem')).length, nChem = fs.length - nPhoto
  const w = fs.map(f => !balance || !nPhoto || !nChem ? 1 : Math.sqrt(fs.length / 2 / (f.sets.includes('chem') ? nChem : nPhoto)))
  return { Z: X.map(x => x.map((v, j) => ((v - mu[j]) / sd[j]) * w[j])), mu, sd }
}
const dist2 = (a: number[], b: number[]) => a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0)

export function kmeans(Z: number[][], k: number, seed: string) {
  const r = rng(seed)
  const C: number[][] = [Z[Math.floor(r() * Z.length)]]
  while (C.length < k) {
    const d = Z.map(z => Math.min(...C.map(c => dist2(z, c))))
    const tot = d.reduce((a, b) => a + b, 0)
    let x = r() * tot, i = 0
    while (i < d.length - 1 && x > d[i]) { x -= d[i]; i++ }
    C.push([...Z[i]])
  }
  let lab = new Array(Z.length).fill(0)
  for (let it = 0; it < 30; it++) {
    lab = Z.map(z => { let bi = 0, bd = Infinity; C.forEach((c, i) => { const d = dist2(z, c); if (d < bd) { bd = d; bi = i } }); return bi })
    for (let i = 0; i < k; i++) {
      const g = Z.filter((_, j) => lab[j] === i)
      if (g.length) C[i] = g[0].map((_, d) => mean(g.map(z => z[d])))
    }
  }
  return { lab, C }
}

/* First two principal components, by power iteration: a flat map where
 * metres that are alike sit close together. */
export function pca2(Z: number[][]) {
  const p = Z[0]?.length ?? 0
  const cov = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => mean(Z.map(z => z[i] * z[j]))))
  const comps: number[][] = []
  const vals: number[] = []
  const M = cov.map(row => [...row])
  for (let c = 0; c < 2; c++) {
    let v = Array.from({ length: p }, (_, i) => 1 / Math.sqrt(p) + i * 1e-3)
    let lam = 0
    for (let it = 0; it < 100; it++) {
      const w = M.map(row => row.reduce((s, x, j) => s + x * v[j], 0))
      lam = Math.sqrt(w.reduce((s, x) => s + x * x, 0)) || 1
      v = w.map(x => x / lam)
    }
    comps.push(v); vals.push(lam)
    for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) M[i][j] -= lam * v[i] * v[j]
  }
  const total = cov.reduce((s, row, i) => s + row[i], 0) || 1
  return { xy: Z.map(z => comps.map(v => z.reduce((s, x, j) => s + x * v[j], 0))), explained: vals.map(l => l / total), comps }
}

export const DOMAIN_HEX = ['#5B8DEF', '#E46A9B', '#3FB68B', '#E9A23B', '#9B6BD3', '#3BB0B8', '#C2410C', '#64748B']

export interface Domains { set: FeatureSet; k: number; labels: number[]; names: string[]; xy: number[][]; explained: number[]; sizes: number[]; profile: { key: string; label: string; z: number }[][] }

export function domains(ms: Metre[], set: FeatureSet, k = 6): Domains {
  const fs = FEATURES.filter(f => f.sets.includes(set))
  const { Z } = standardise(ms, fs, set === 'all')
  const km = kmeans(Z, k, `dom:${set}:${ms.length}`)
  // number the domains from palest to darkest so the colours stay put
  const Lmean = Array.from({ length: k }, (_, i) => mean(ms.filter((_, j) => km.lab[j] === i).map(m => m.photo.L)))
  const order = Lmean.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v).map(x => x.i)
  const remap: Record<number, number> = {}
  order.forEach((old, nw) => { remap[old] = nw })
  const labels = km.lab.map(l => remap[l])
  const C = order.map(old => km.C[old])
  const profile = C.map(c => fs.map((f, j) => ({ key: f.key, label: f.label, z: c[j] })).sort((a, b) => Math.abs(b.z) - Math.abs(a.z)))
  // named by the two measures that most set it apart; a later word if two names would match
  const used = new Set<string>()
  const names = profile.map(p => {
    const words = Array.from(new Set(p.map(x => FEATURES.find(f => f.key === x.key)!.word[x.z > 0 ? 1 : 0])))
    let name = words.slice(0, 2).join(', ')
    for (let j = 2; used.has(name) && j < words.length; j++) name = `${words[0]}, ${words[j]}`
    used.add(name)
    return name
  })
  const p = pca2(Z)
  return { set, k, labels, names: names.map(n => n[0].toUpperCase() + n.slice(1)), xy: p.xy, explained: p.explained, sizes: C.map((_, i) => labels.filter(l => l === i).length), profile }
}

/* ── predictions ────────────────────────────────────────────────────────── */

/* Ridge regression: fit on the metres that were measured, predict the rest. */
function ridge(X: number[][], y: number[], lambda = 1) {
  const p = X[0].length + 1
  const A = Array.from({ length: p }, () => new Array(p).fill(0))
  const b = new Array(p).fill(0)
  X.forEach((x, n) => {
    const xx = [1, ...x]
    for (let i = 0; i < p; i++) { b[i] += xx[i] * y[n]; for (let j = 0; j < p; j++) A[i][j] += xx[i] * xx[j] }
  })
  for (let i = 1; i < p; i++) A[i][i] += lambda
  // Gauss–Jordan
  const M = A.map((row, i) => [...row, b[i]])
  for (let c = 0; c < p; c++) {
    let piv = c; for (let r = c + 1; r < p; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r
    ;[M[c], M[piv]] = [M[piv], M[c]]
    const d = M[c][c] || 1e-9
    for (let j = c; j <= p; j++) M[c][j] /= d
    for (let r = 0; r < p; r++) if (r !== c) { const f = M[r][c]; for (let j = c; j <= p; j++) M[r][j] -= f * M[c][j] }
  }
  const w = M.map(row => row[p])
  return (x: number[]) => w[0] + x.reduce((s, v, i) => s + v * w[i + 1], 0)
}
const r2score = (y: number[], yh: number[]) => { const m = mean(y); const ss = y.reduce((s, v) => s + (v - m) ** 2, 0) || 1; return 1 - y.reduce((s, v, i) => s + (v - yh[i]) ** 2, 0) / ss }

export const ISRM = [
  { grade: 'R0', name: 'Extremely weak', max: 1 }, { grade: 'R1', name: 'Very weak', max: 5 }, { grade: 'R2', name: 'Weak', max: 25 },
  { grade: 'R3', name: 'Medium strong', max: 50 }, { grade: 'R4', name: 'Strong', max: 100 }, { grade: 'R5', name: 'Very strong', max: 250 }, { grade: 'R6', name: 'Extremely strong', max: Infinity },
]
export const strengthGrade = (ucs: number) => ISRM.find(g => ucs < g.max) ?? ISRM[ISRM.length - 1]
export const STRENGTH_HEX = ['#7f1d1d', '#b91c1c', '#ea580c', '#eab308', '#65a30d', '#15803d', '#0f5132']

export interface Predictions {
  ucs: number[]                                       // per metre, MPa
  ucsFit: { r2: number; n: number; pairs: { measured: number; predicted: number; hole: string; at: number }[] }
  mineral: number[]                                   // per metre, dominant mineral index (measured where scanned)
  mineralMeasured: boolean[]
  mineralFit: { accuracy: number; n: number; byHole: { hole: string; accuracy: number }[] }
  rqd: number[]                                       // per metre, predicted from geophysics and chemistry only (no photo)
  rqdFit: { r2: number }
}

export function predict(ms: Metre[]): Predictions {
  const fs = FEATURES.filter(f => f.sets.includes('all'))
  const { Z } = standardise(ms, fs)

  // strength: leave-one-hole-out to say how good it is, then fit on everything
  const lab = ms.map((m, i) => ({ m, i })).filter(x => x.m.ucs != null)
  const pairs: Predictions['ucsFit']['pairs'] = []
  Array.from(new Set(lab.map(x => x.m.hole))).forEach(hole => {
    const tr = lab.filter(x => x.m.hole !== hole), te = lab.filter(x => x.m.hole === hole)
    if (tr.length < 8) return
    const f = ridge(tr.map(x => Z[x.i]), tr.map(x => Math.log(x.m.ucs!)), 3)
    te.forEach(x => pairs.push({ measured: x.m.ucs!, predicted: Math.round(Math.exp(f(Z[x.i]))), hole, at: x.m.from }))
  })
  const fUcs = lab.length >= 8 ? ridge(lab.map(x => Z[x.i]), lab.map(x => Math.log(x.m.ucs!)), 3) : () => Math.log(60)
  const ucs = Z.map(z => Math.round(clamp(Math.exp(fUcs(z)), 0.5, 320)))
  const ucsR2 = pairs.length ? r2score(pairs.map(p => Math.log(p.measured)), pairs.map(p => Math.log(p.predicted))) : 0

  // mineralogy: nearest centre, trained on the scanned holes
  const scanned = ms.map((m, i) => ({ m, i })).filter(x => x.m.scanner)
  const centres = (rows: typeof scanned) => MINERALS.map((_, k) => {
    const g = rows.filter(x => x.m.scanner!.dominant === k)
    return g.length ? Z[0].map((_, d) => mean(g.map(x => Z[x.i][d]))) : null
  })
  const near = (cs: (number[] | null)[], z: number[]) => { let bi = 0, bd = Infinity; cs.forEach((c, k) => { if (!c) return; const d = dist2(z, c); if (d < bd) { bd = d; bi = k } }); return bi }
  const byHole = Array.from(new Set(scanned.map(x => x.m.hole))).map(hole => {
    const cs = centres(scanned.filter(x => x.m.hole !== hole))
    const te = scanned.filter(x => x.m.hole === hole)
    const ok = te.filter(x => near(cs, Z[x.i]) === x.m.scanner!.dominant).length
    return { hole, accuracy: te.length ? ok / te.length : 0, n: te.length }
  })
  const csAll = centres(scanned)
  const mineral = ms.map((m, i) => m.scanner ? m.scanner.dominant : near(csAll, Z[i]))
  const nScan = byHole.reduce((s, x) => s + x.n, 0)

  // rock quality from what a probe logs without the core (chemistry and geophysics)
  const chem = FEATURES.filter(f => f.sets.includes('chem'))
  const Zc = standardise(ms, chem).Z
  const fRqd = ridge(Zc, ms.map(m => m.photo.rqd), 5)
  const rqd = Zc.map(z => Math.round(clamp(fRqd(z), 0, 100)))
  return {
    ucs, ucsFit: { r2: ucsR2, n: lab.length, pairs },
    mineral, mineralMeasured: ms.map(m => !!m.scanner),
    mineralFit: { accuracy: nScan ? byHole.reduce((s, x) => s + x.accuracy * x.n, 0) / nScan : 0, n: nScan, byHole: byHole.map(({ hole, accuracy }) => ({ hole, accuracy })) },
    rqd, rqdFit: { r2: r2score(ms.map(m => m.photo.rqd), rqd) },
  }
}
