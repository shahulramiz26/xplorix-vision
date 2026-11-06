/* ==========================================================================
 * Checks on XPLORIX Core: the photo step and the numbers.
 *
 *   npx tsx scripts/check-core.ts
 *
 * 1. A drawn tray where the answer is known: rows, breaks (where and at what
 *    angle), an empty stretch of channel, the tray left unused at the end.
 * 2. The geotech rules against hand-worked examples.
 * ========================================================================== */

import { processTray, type Pixels } from '../lib/core/engine'
import { flatten, interval, pieces, discing, jointSets, gsiProxy, WJD_FACTOR, weatheringGrade, type Overrides } from '../lib/core/geotech'
import type { CoreTray } from '../lib/core/model'

let fails = 0
const ok = (name: string, got: number | boolean, want: number | boolean, tol = 0) => {
  const pass = typeof want === 'boolean' ? got === want : Math.abs((got as number) - want) <= tol
  if (!pass) fails++
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}: ${typeof got === 'number' ? +got.toFixed(3) : got} (want ${want}${tol ? ` ± ${tol}` : ''})`)
}

/* ── 1. a drawn tray ─────────────────────────────────────────────────────
 * 5 rows of 1 m on a 400 × 150 photo: grey core with grain, black divider
 * walls, white tray plastic where there is no core (about 247, as measured on full-size NVCL photos). */
function drawTray() {
  const W = 400, H = 150, rows = 5, rh = H / rows
  const data = new Uint8ClampedArray(W * H * 4)
  let seed = 3
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  const set = (x: number, y: number, v: number[]) => { const j = (y * W + x) * 4; data[j] = v[0]; data[j + 1] = v[1]; data[j + 2] = v[2]; data[j + 3] = 255 }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const g = 120 + Math.round((rnd() - 0.5) * 50)
    set(x, y, [g, g + 4, g - 2])
  }
  // divider walls between rows
  for (let r = 1; r < rows; r++) for (let y = Math.round(r * rh) - 1; y <= Math.round(r * rh) + 1; y++) for (let x = 0; x < W; x++) set(x, y, [25, 25, 25])
  // empty channel: row 2 from x 200 to 260 (missing core), and the end of the last row (tray unused)
  const white = (r: number, x0: number, x1: number) => { for (let y = Math.round(r * rh) + 2; y < Math.round((r + 1) * rh) - 2; y++) for (let x = x0; x < x1; x++) { const g = 247 + Math.round((rnd() - 0.5) * 6); set(x, y, [g, g, g + 2]) } }
  white(2, 200, 260)
  white(4, 300, 400)
  // breaks: a dark line across the core, square (lean 0) or leaning
  const brk = (r: number, x: number, lean: number) => {
    const y0 = Math.round(r * rh) + 2, y1 = Math.round((r + 1) * rh) - 2
    for (let y = y0; y < y1; y++) {
      const cx = Math.round(x + lean * (y1 - y0) * ((y - y0 + 0.5) / (y1 - y0) - 0.5))
      for (const k of [-1, 0, 1]) set(cx + k, y, [30, 28, 26])
    }
  }
  brk(0, 100, 0)       // square break at 0.25 m in row 0
  brk(1, 150, 2)       // leaning break in row 1
  brk(3, 80, 0)
  brk(3, 300, -1.5)
  return { width: W, height: H, data } as Pixels
}

const px = drawTray()
const res = processTray(px, { from: 10, to: 14.75, coreDiameterMm: 63.5, idPrefix: 'T' })
ok('rows found', res.rows.length, 5)
ok('core ends where the tray is left unused (m)', res.usedTo, 14.75, 0.001)
const empties = res.spans.filter(s => s.kind === 'empty')
ok('one empty stretch inside the core', empties.length, 1)
const emptyLen = empties.reduce((s, e) => s + e.to - e.from, 0)
// 60 px of a 400 px row ≈ 0.155 m once the unused tail is taken out of the length
ok('empty stretch length (m)', emptyLen, 60 * (4.75 / (4 * 388 + 294)), 0.03)
const near = (row: number, x: number) => res.breaks.find(b => b.row === row && Math.abs(b.x - x) <= 4)
ok('square break found (row 0, x 100)', !!near(0, 100), true)
ok('leaning break found (row 1, x 150)', !!near(1, 150), true)
ok('square break found (row 3, x 80)', !!near(3, 80), true)
ok('leaning break found (row 3, x 300)', !!near(3, 300), true)
ok('square break alpha ≈ 90°', near(0, 100)?.alpha ?? 0, 90, 8)
// lean 2 band-heights across a ~26 px band = 52 px ≈ 127 mm along a 63.5 mm core → atan(63.5/127) ≈ 27°
ok('leaning break alpha', near(1, 150)?.alpha ?? 0, 27, 9)
if (process.env.DEBUG) console.log(res.breaks.map(b => `${b.row}:${b.x}:${b.alpha}`).join(' '))
ok('no false breaks', res.breaks.length, 4, 1)
ok('5 cm bins cover the core', res.bins.length, Math.ceil(4.75 / 0.05), 1)

/* ── 2. the rules ─────────────────────────────────────────────────────── */
const tray = (over: Partial<CoreTray>): CoreTray => ({
  id: 'X', hole: 'H', no: 1, file: '', from: 0, to: 3, usedTo: 3, w: 0, h: 0, rows: [], spans: [], breaks: [], bins: [],
  rowConfidence: 'high', notes: [], shiftIds: [], takenAt: '', takenBy: '', ...over,
})
const b = (id: string, at: number, alpha: number, kind: 'natural' | 'handling', jrc = 4) => ({ id, row: 0, x: 0, dx: 0, at, alpha, rough: 0, jrc, stain: 0, strength: 1, kind, confidence: 'high' as const })
const t1 = tray({
  breaks: [b('a', 0.5, 80, 'natural'), b('b', 0.55, 85, 'natural'), b('c', 1.2, 40, 'natural', 12), b('d', 2.0, 90, 'handling')],
  spans: [{ row: 0, x0: 10, x1: 20, kind: 'empty', from: 2.5, to: 2.7 }],
})
const f = flatten([t1])
// pieces: 0–0.5, 0.5–0.55, 0.55–1.2, 1.2–2.5, (gap 2.5–2.7), 2.7–3.0; handling break at 2.0 does not cut
ok('pieces', pieces(f).length, 5)
const r = interval(f, 0, 3)!
ok('recovery % (0.2 m lost of 3 m)', r.recovery, (2.8 / 3) * 100, 0.01)
ok('RQD % (0.5 + 0.65 + 1.3 + 0.3 = 2.75 of 3)', r.rqd, (2.75 / 3) * 100, 0.01)
ok('natural fractures', r.natural, 3)
ok('handling breaks', r.handling, 1)
ok('fractures per metre of core', r.ff, 3 / 2.8, 0.001)
ok('wJd (1 + 1 + 1.5) / 3', r.wjd, 3.5 / 3, 0.001)
ok('WJD factor at 20°', WJD_FACTOR(20), 3.5)
ok('weathering grade, little staining', weatheringGrade(0.01), 1)
ok('GSI proxy, RQD 80, JRC 12, fresh: 1.5 × (5 + 6 + 10) + 40', gsiProxy(80, 12, 1), 72)

// the geologist corrects: break b was made in handling, the gap was sampled core
const ov: Overrides = { breaks: { b: 'handling' }, gaps: { 'X:0:10': 'sampled' }, added: [] }
const r2 = interval(flatten([t1], ov), 0, 3)!
ok('after correction: recovery 100% (sampled is not lost)', r2.recovery, 100, 0.01)
ok('after correction: natural fractures', r2.natural, 2)
// pieces 0–0.5, 0.5–1.2, 1.2–2.5, 2.7–3.0 → all ≥ 10 cm: 2.8 of a measured 2.8 m
ok('after correction: RQD on the measured length', r2.rqd, 100, 0.01)

const discs = discing(flatten([tray({ breaks: [b('1', 1.00, 88, 'handling'), b('2', 1.02, 85, 'handling'), b('3', 1.045, 89, 'handling'), b('4', 1.5, 89, 'handling')] })]))
ok('discing: one zone of three square breaks close together', discs.length, 1)
ok('discing zone count', discs[0]?.count ?? 0, 3)
const js = jointSets([...Array(20)].map((_, i) => 30 + (i % 5)).concat([...Array(20)].map((_, i) => 80 + (i % 5))))
ok('two joint sets', js.sets.length, 2)

console.log(fails ? `\n${fails} check(s) failed` : '\nAll checks passed')
process.exit(fails ? 1 : 0)
