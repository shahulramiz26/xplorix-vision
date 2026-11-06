/* ==========================================================================
 * XPLORIX CORE — the photo step
 *
 * Turns one photo of a core tray into measurements a geologist can check:
 *
 *   1. Rows       the channels of core, found from the tray's divider walls
 *   2. Spans      along each row: core, no core (an empty channel), and the
 *                 driller's depth blocks
 *   3. Depth      every pixel along the rows gets a depth, from the tray's
 *                 from–to, laid along the core actually in the tray (an empty
 *                 tail at the end of the tray is tray left unused, not core
 *                 lost)
 *   4. Breaks     dark lines across the core: where, at what angle to the core
 *                 axis (alpha), how rough the trace is, and whether it looks
 *                 like a natural fracture or a break made in handling
 *   5. Bins       every 5 cm of core: colour, texture, veins, iron staining —
 *                 what the rock classes, the weathering index and the colour
 *                 log are built from
 *
 * This is image measurement, not a trained model. It is written so that the
 * same code runs in Node (the batch over a photo archive) and in the browser
 * (a photo uploaded from the core shed), on a plain RGBA pixel array.
 *
 * Every result carries a confidence. Nothing is final until a geologist has
 * checked the tray; their corrections are what a trained model learns from.
 * ========================================================================== */

export interface Pixels { width: number; height: number; data: Uint8ClampedArray | Uint8Array }

export interface TrayRow { top: number; bottom: number; band: [number, number]; x0: number; x1: number; from: number; to: number }
export type SpanKind = 'core' | 'empty' | 'block'
export interface Span { row: number; x0: number; x1: number; kind: SpanKind; from: number; to: number }
export interface Break {
  id: string
  row: number
  x: number               // centre of the trace, px
  dx: number              // horizontal shift of the trace from the top of the core to the bottom, px
  at: number              // depth, m
  alpha: number           // angle between the fracture and the core axis, degrees (90 = square across)
  rough: number           // amplitude of the trace about a straight line, mm
  jrc: number             // joint roughness coefficient proxy, 0–20
  stain: number           // how much browner/darker the rock is beside the break, 0–1
  strength: number        // how clear the dark line is, 0–1
  kind: 'natural' | 'handling'
  confidence: 'high' | 'medium' | 'low'
}
export interface Bin { from: number; to: number; core: number; L: number; a: number; b: number; tex: number; vein: number; ox: number; hex: string }
export interface TrayResult {
  width: number
  height: number
  rows: TrayRow[]
  spans: Span[]
  breaks: Break[]
  bins: Bin[]
  usedTo: number          // depth where the core in the tray ends
  rowConfidence: 'high' | 'medium' | 'low'
  notes: string[]
}

export interface TrayInput {
  from: number
  to: number
  coreDiameterMm?: number          // HQ 63.5 by default
  layout?: number[]                // divider positions as fractions of height, shared by a hole's trays
  idPrefix?: string
}

/* ── small helpers ─────────────────────────────────────────────────────── */

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const r3 = (n: number) => Math.round(n * 1000) / 1000

function boxSmooth(x: Float64Array | number[], k: number): Float64Array {
  const n = x.length, out = new Float64Array(n)
  const h = Math.max(1, Math.floor(k / 2))
  const pre = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + x[i]
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - h), b = Math.min(n, i + h + 1)
    out[i] = (pre[b] - pre[a]) / (b - a)
  }
  return out
}
function median(xs: number[]) {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
function std(xs: ArrayLike<number>) {
  let m = 0
  for (let i = 0; i < xs.length; i++) m += xs[i]
  m /= xs.length || 1
  let v = 0
  for (let i = 0; i < xs.length; i++) v += (xs[i] - m) ** 2
  return Math.sqrt(v / (xs.length || 1))
}

/* Luminance plane, and an HSV read per pixel. */
export function lumOf(p: Pixels): Float64Array {
  const { width: w, height: h, data } = p
  const out = new Float64Array(w * h)
  for (let i = 0, j = 0; i < w * h; i++, j += 4) out[i] = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]
  return out
}
function hsv(r: number, g: number, b: number) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
  let hue = 0
  if (d > 0) {
    if (mx === r) hue = ((g - b) / d) % 6
    else if (mx === g) hue = (b - r) / d + 2
    else hue = (r - g) / d + 4
    hue *= 60
    if (hue < 0) hue += 360
  }
  return { h: hue, s: mx ? d / mx : 0, v: mx / 255 }
}

/* sRGB → CIE Lab (D65), for colour that compares the way an eye does. */
export function toLab(r: number, g: number, b: number) {
  const f = (c: number) => { c /= 255; return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92 }
  const R = f(r), G = f(g), B = f(b)
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047
  const Y = (R * 0.2126 + G * 0.7152 + B * 0.0722)
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883
  const t = (v: number) => v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116
  return { L: 116 * t(Y) - 16, a: 500 * (t(X) - t(Y)), b: 200 * (t(Y) - t(Z)) }
}
const hex2 = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')

/* ── 1. rows ──────────────────────────────────────────────────────────────
 * A divider wall is a thin horizontal band, darker and smoother than the core
 * either side. Each line of pixels gets a score; dividers are the dips. */

export function lineScore(p: Pixels): Float64Array {
  const { width: w, height: h } = p
  const L = lumOf(p)
  const xa = Math.floor(w * 0.04), xb = Math.floor(w * 0.96)
  const bright = new Float64Array(h), tex = new Float64Array(h)
  for (let y = 0; y < h; y++) {
    let s = 0, t = 0
    for (let x = xa; x < xb; x++) {
      const v = L[y * w + x]
      s += v
      if (x > xa) t += Math.abs(v - L[y * w + x - 1])
    }
    bright[y] = s / (xb - xa)
    tex[y] = t / (xb - xa - 1)
  }
  const win = Math.max(5, h / 8)
  const sb = boxSmooth(bright, win), st = boxSmooth(tex, win)
  const db = std(bright) + 1e-6, dt = std(tex) + 1e-6
  const out = new Float64Array(h)
  for (let y = 0; y < h; y++) out[y] = (bright[y] - sb[y]) / db + (tex[y] - st[y]) / dt
  return out
}

export function dividersFromScore(s: ArrayLike<number>, threshold = -0.8, mergePx = 7, edgePx = 6): number[] {
  const h = s.length
  const dips: number[] = []
  for (let i = 2; i < h - 2; i++) {
    let lo = Infinity
    for (let k = i - 2; k <= i + 2; k++) lo = Math.min(lo, s[k])
    if (s[i] === lo && s[i] < threshold) dips.push(i)
  }
  const groups: number[][] = []
  dips.forEach(i => {
    const g = groups[groups.length - 1]
    if (g && i - g[g.length - 1] <= mergePx) g.push(i); else groups.push([i])
  })
  return groups.map(g => Math.round(g.reduce((a, b) => a + b, 0) / g.length)).filter(c => c > edgePx && c < h - edgePx)
}

/* The divider layout of a set of trays from one hole (same tray type), as
 * fractions of the photo height. Steadier than any one photo. */
export function holeLayout(photos: Pixels[]): number[] {
  if (!photos.length) return []
  const byH = new Map<number, Pixels[]>()
  photos.forEach(p => byH.set(p.height, [...(byH.get(p.height) ?? []), p]))
  const [h, set] = Array.from(byH.entries()).sort((a, b) => b[1].length - a[1].length)[0]
  const acc = new Float64Array(h)
  set.forEach(p => { const s = lineScore(p); for (let i = 0; i < h; i++) acc[i] += s[i] / set.length })
  return evenOut(dividersFromScore(acc).map(c => c / h))
}

/* A hole can use more than one tray type (photos of a different height). One
 * layout per type, from trays within a few pixels of the same height; a type
 * with fewer than three photos is left to each photo on its own. */
export function holeLayouts(photos: Pixels[]): { height: number; layout: number[] }[] {
  // Two tray types can photograph to almost the same height, so only photos of
  // exactly the same height share a layout.
  const byH = new Map<number, Pixels[]>()
  photos.forEach(p => byH.set(p.height, [...(byH.get(p.height) ?? []), p]))
  return Array.from(byH.entries()).filter(([, set]) => set.length >= 3).map(([height, set]) => ({ height, layout: holeLayout(set) }))
}
export function layoutFor(layouts: { height: number; layout: number[] }[], height: number): number[] | undefined {
  return layouts.find(l => l.height === height)?.layout
}

/* Trays have rows of equal height. Drop a cut that would make a row far
 * thinner than the others (a label or a crack, not a wall). */
function evenOut(cuts: number[]): number[] {
  let c = [...cuts]
  for (let pass = 0; pass < 4 && c.length > 1; pass++) {
    const edges = [0, ...c, 1]
    const hs = edges.slice(1).map((e, i) => e - edges[i])
    const med = median(hs)
    const thin = hs.findIndex(x => x < med * 0.45)
    if (thin < 0) break
    // Remove the cut on the side that leaves the more even rows.
    const removeIdx = thin === 0 ? 0 : thin === hs.length - 1 ? c.length - 1 : (hs[thin - 1] < hs[thin + 1] ? thin - 1 : thin)
    c = c.filter((_, i) => i !== removeIdx)
  }
  return c
}

function findRows(p: Pixels, layout?: number[]): { cuts: number[]; confidence: 'high' | 'medium' | 'low' } {
  const s = lineScore(p)
  const h = p.height
  const base = layout && layout.length ? layout : evenOut(dividersFromScore(s).map(c => c / h))
  const cuts: number[] = [], strength: number[] = []
  base.forEach(f => {
    const c = Math.round(f * h)
    const lo = Math.max(1, c - 4), hi = Math.min(h - 2, c + 5)
    let best = lo
    for (let i = lo; i < hi; i++) if (s[i] < s[best]) best = i
    cuts.push(best); strength.push(s[best])
  })
  const m = median(strength)
  return { cuts, confidence: m < -1.5 ? 'high' : m < -0.8 ? 'medium' : 'low' }
}

/* ── 2. spans: core, empty channel, depth block ──────────────────────────── */

interface Col { lum: number; sat: number; tex: number; empty: boolean; block: boolean }

function columns(p: Pixels, L: Float64Array, y0: number, y1: number, x0: number, x1: number): Col[] {
  const { width: w, data } = p
  const out: Col[] = []
  // The middle of the channel: the core's own surface, away from its edges.
  const m0 = Math.round(y0 + (y1 - y0) * 0.2), m1 = Math.max(m0 + 1, Math.round(y1 - (y1 - y0) * 0.2))
  for (let x = x0; x < x1; x++) {
    let ls = 0, ss = 0, ts = 0, n = 0, orange = 0
    for (let y = m0; y < m1; y++) {
      const i = y * w + x, j = i * 4
      const hv = hsv(data[j], data[j + 1], data[j + 2])
      ls += L[i]; ss += hv.s; n++
      // Grain along the core: a photo of tray plastic is smooth this way, rock is not.
      if (x + 1 < w) ts += Math.abs(L[i] - L[i + 1])
      if (hv.h >= 12 && hv.h <= 45 && hv.s > 0.38 && hv.v > 0.35) orange++
    }
    const lum = ls / n, sat = ss / n, tex = ts / n
    out.push({ lum, sat, tex, empty: false, block: orange / n > 0.6 })
  }
  return out
}

/* Empty channel: bright, grey and smooth for a stretch. Core that is merely
 * pale still has grain; tray plastic does not. */
function markEmpty(cols: Col[]) {
  const n = cols.length
  // Tray plastic is near white and flat; pale core is a little less bright and has grain.
  // Measured on clean full-size photos: empty tray reads 242–252, pale
  // smooth core up to about 238 — so the bar sits just above core.
  const raw = cols.map(c => c.lum > 241 && c.sat < 0.11 && c.tex < 13)
  // Hold a run only if it is at least 10 px (about 3 cm) long; fill 1–2 px holes inside one.
  let i = 0
  while (i < n) {
    if (!raw[i]) { i++; continue }
    let j = i
    while (j < n && (raw[j] || (j + 2 < n && (raw[j + 1] || raw[j + 2])))) j++
    if (j - i >= 14) for (let k = i; k < j; k++) cols[k].empty = true
    i = j + 1
  }
  // A sliver of "core" between empty stretches, or at the very end, is glare or
  // the tray wall, not rock.
  i = 0
  while (i < n) {
    if (cols[i].empty) { i++; continue }
    let j = i
    while (j < n && !cols[j].empty) j++
    const leftEmpty = i === 0 || cols[i - 1].empty, rightEmpty = j === n || cols[j]?.empty
    if (j - i < 12 && leftEmpty && rightEmpty && !(i === 0 && j === n)) for (let k = i; k < j; k++) cols[k].empty = true
    i = j
  }
}

/* Depth blocks: a short stretch of label colour across most of the channel. */
function cleanBlocks(cols: Col[]) {
  const n = cols.length
  let i = 0
  while (i < n) {
    if (!cols[i].block) { i++; continue }
    let j = i
    while (j < n && cols[j].block) j++
    const len = j - i
    // A depth block is a few centimetres long, flat in colour, and stands out
    // from the rock either side. Long or grainy orange stretches are rock.
    const inner = cols.slice(i, j)
    const flat = median(inner.map(c => c.tex)) < 22
    const side = (a: number, b: number) => cols.slice(Math.max(0, a), Math.min(n, b))
    const nb = [...side(i - 10, i - 2), ...side(j + 2, j + 10)]
    const blockSat = median(inner.map(c => c.sat))
    const apart = nb.length > 0 && median(nb.map(c => c.sat)) < blockSat - 0.15
    if (len < 4 || len > 24 || !flat || !apart) for (let k = i; k < j; k++) cols[k].block = false
    i = j
  }
}

/* ── 4. breaks ────────────────────────────────────────────────────────────
 * For every place along the row and every lean of the line, add up how much
 * darker the pixels on that line are than the core around them. A break is a
 * clear peak: a dark line that crosses most of the core. */

const LEANS = (() => { const out: number[] = []; for (let k = -14; k <= 14; k++) out.push(k * 0.25); return out })()  // dx per band height

function darkness(L: Float64Array, w: number, y0: number, y1: number, x0: number, x1: number, skip?: (x: number) => boolean): Float64Array[] {
  // For each line of the band: how much darker than the core around it. Empty
  // channel and depth blocks are filled with the line's typical core value
  // first, so the edge of white tray plastic does not look like a dark line.
  const rows: Float64Array[] = []
  for (let y = y0; y < y1; y++) {
    const line = new Float64Array(x1 - x0)
    const coreVals: number[] = []
    for (let x = x0; x < x1; x++) { line[x - x0] = L[y * w + x]; if (!skip?.(x - x0)) coreVals.push(line[x - x0]) }
    const fill = median(coreVals)
    if (skip) for (let i = 0; i < line.length; i++) if (skip(i)) line[i] = fill
    const loc = boxSmooth(line, 21)
    const d = new Float64Array(x1 - x0)
    for (let i = 0; i < d.length; i++) d[i] = Math.max(0, loc[i] - line[i])
    rows.push(d)
  }
  return rows
}

interface Cand { x: number; dx: number; score: number; cover: number }

function scanBreaks(D: Float64Array[], ok: (x: number) => boolean, bandH: number): Cand[] {
  const n = D[0]?.length ?? 0
  const H = D.length
  if (!H || !n) return []
  const all: Cand[] = []
  // Noise level of the darkness map, to set the bar.
  const vals: number[] = []
  for (let y = 0; y < H; y += 2) for (let x = 0; x < n; x += 3) vals.push(D[y][x])
  const noise = median(vals) + 1.4826 * median(vals.map(v => Math.abs(v - median(vals)))) + 1
  // A column with nothing dark near it cannot hold a break: skip it.
  const colMax = new Float64Array(n)
  for (let x = 0; x < n; x++) { let m = 0; for (let y = 0; y < H; y++) m = Math.max(m, D[y][x]); colMax[x] = m }
  const busy = new Uint8Array(n)
  const reach = Math.ceil(bandH * 1.8)
  for (let x = 0; x < n; x++) if (colMax[x] > noise * 1.6) for (let k = Math.max(0, x - reach); k <= Math.min(n - 1, x + reach); k++) busy[k] = 1
  const tryLean = (x: number, lean: number): Cand | null => {
    const dx = lean * bandH
    let sum = 0, hit = 0, cnt = 0
    for (let y = 0; y < H; y++) {
      const xx = Math.round(x + dx * ((y + 0.5) / H - 0.5))
      if (xx < 0 || xx >= n || !ok(xx)) continue
      // the darkest of the three pixels across the line: traces are not perfectly thin
      const v = Math.max(D[y][xx], xx > 0 ? D[y][xx - 1] * 0.7 : 0, xx < n - 1 ? D[y][xx + 1] * 0.7 : 0)
      sum += v; cnt++
      if (v > noise * 1.6) hit++
    }
    if (cnt < H * 0.7) return null
    const cover = hit / H
    return { x, dx, score: (sum / cnt) * cover, cover }
  }
  for (let x = 0; x < n; x++) {
    if (!ok(x) || !busy[x]) continue
    let best: Cand | null = null, bestLean = 0
    for (const lean of LEANS) {
      if (Math.round(lean * 4) % 2 !== 0) continue          // every 0.5 first
      const c = tryLean(x, lean)
      if (c && (!best || c.score > best.score)) { best = c; bestLean = lean }
    }
    for (const lean of [bestLean - 0.25, bestLean + 0.25]) {   // then the neighbours
      const c = tryLean(x, lean)
      if (c && best && c.score > best.score) best = c
    }
    if (best) all.push(best)
  }
  // Keep clear peaks only, at least 5 px apart.
  const scores = all.map(c => c.score)
  const bar = Math.max(noise * 1.2, median(scores) * 2.6)
  const picked: Cand[] = []
  ;[...all].sort((a, b) => b.score - a.score).forEach(c => {
    if (c.score < bar || c.cover < 0.6) return
    if (picked.some(p => Math.abs(p.x - c.x) < 5)) return
    picked.push(c)
  })
  return picked.sort((a, b) => a.x - b.x)
}

/* ── the whole tray ───────────────────────────────────────────────────── */

export function processTray(p: Pixels, input: TrayInput): TrayResult {
  const { width: w, height: h, data } = p
  const L = lumOf(p)
  const notes: string[] = []
  const coreMm = input.coreDiameterMm ?? 63.5
  const { cuts, confidence } = findRows(p, input.layout)
  const edges = [0, ...cuts, h]
  const xLeft = Math.round(w * 0.015), xRight = Math.round(w * 0.985)

  // Rows, each with its inner band (the core, clear of the divider walls).
  const rowsRaw = edges.slice(1).map((b, i) => {
    const t = edges[i]
    const pad = Math.max(1, Math.round((b - t) * 0.12))
    return { top: t, bottom: b, band: [t + pad, Math.max(t + pad + 2, b - pad)] as [number, number], x0: xLeft, x1: xRight }
  }).filter(r => r.bottom - r.top >= 6)
  if (rowsRaw.length < 2) notes.push('Few rows found: check the tray type and the photo framing.')

  // Spans along each row.
  type RawSpan = { row: number; x0: number; x1: number; kind: SpanKind }
  const rawSpans: RawSpan[] = []
  const colsByRow: Col[][] = []
  rowsRaw.forEach((r, ri) => {
    const cols = columns(p, L, r.band[0], r.band[1], r.x0, r.x1)
    cleanBlocks(cols)
    markEmpty(cols)
    colsByRow.push(cols)
    let s = 0
    const kindOf = (c: Col): SpanKind => c.block ? 'block' : c.empty ? 'empty' : 'core'
    for (let i = 1; i <= cols.length; i++) {
      if (i === cols.length || kindOf(cols[i]) !== kindOf(cols[s])) {
        rawSpans.push({ row: ri, x0: r.x0 + s, x1: r.x0 + i, kind: kindOf(cols[s]) })
        s = i
      }
    }
  })

  // 3. Depth. The tray's from–to is laid along the rows up to the last core;
  // an empty stretch after it is tray left unused.
  // Each row's core runs from its first to its last stretch that is not empty.
  // Empty channel before or after that is tray not filled (core goes on in the
  // next row); empty channel between core is core that is not there.
  const used = rowsRaw.map((r, ri) => {
    const ss = rawSpans.filter(sp => sp.row === ri && sp.kind !== 'empty')
    if (!ss.some(sp => sp.kind === 'core')) return { ux0: r.x0, ux1: r.x0 }
    return { ux0: Math.min(...ss.map(sp => sp.x0)), ux1: Math.max(...ss.map(sp => sp.x1)) }
  })
  const usedLen = used.map(u => Math.max(0, u.ux1 - u.ux0))
  let usedPx = usedLen.reduce((a, b) => a + b, 0)
  if (usedPx <= 0) { usedPx = rowsRaw.reduce((a, r) => a + r.x1 - r.x0, 0); notes.push('No core found in the photo.') }
  const span = input.to - input.from
  const mPerPx = span / usedPx
  const depthAt = (row: number, x: number) => {
    let px = 0
    for (let i = 0; i < row; i++) px += usedLen[i]
    px += clamp(x, used[row].ux0, used[row].ux1) - used[row].ux0
    return input.from + Math.min(usedPx, Math.max(0, px)) * mPerPx
  }
  const rows: TrayRow[] = rowsRaw.map((r, i) => ({ ...r, from: r3(depthAt(i, used[i].ux0)), to: r3(depthAt(i, used[i].ux1)) }))
  const spans: Span[] = rawSpans
    .map(sp => ({ ...sp, x0: Math.max(sp.x0, used[sp.row].ux0), x1: Math.min(sp.x1, used[sp.row].ux1) }))
    .filter(sp => sp.x1 > sp.x0)
    .map(sp => ({ ...sp, from: r3(depthAt(sp.row, sp.x0)), to: r3(depthAt(sp.row, sp.x1)) }))
  const usedTo = r3(input.from + usedPx * mPerPx)

  // 4. Breaks, row by row, inside core spans only (not at block or empty edges).
  const breaks: Break[] = []
  rowsRaw.forEach((r, ri) => {
    if (usedLen[ri] <= 0) return
    const [y0, y1] = r.band
    const bandH = y1 - y0
    const cols = colsByRow[ri]
    const D = darkness(L, w, y0, y1, r.x0, r.x1, x => !!cols[x]?.empty || !!cols[x]?.block)
    const lo = used[ri].ux0 - r.x0, hi = used[ri].ux1 - r.x0
    const ok = (x: number) => x >= lo + 5 && x < hi - 5 && !cols[x]?.empty && !cols[x]?.block
      && !cols[x - 2]?.empty && !cols[x + 2]?.empty && !cols[x - 2]?.block && !cols[x + 2]?.block
    const hMm = mPerPx * 1000                                        // mm along the core per px
    const vMm = coreMm / bandH                                       // mm across the core per px
    scanBreaks(D, ok, bandH).forEach((c, k) => {
      const x = r.x0 + c.x
      // Alpha: the angle of the fracture to the core axis, from the lean of its trace.
      const along = Math.abs(c.dx) * hMm, across = coreMm
      const alpha = Math.round((Math.atan2(across, along) * 180) / Math.PI)
      // Roughness: how far the darkest pixel strays from the straight trace.
      const off: number[] = []
      for (let y = 0; y < bandH; y++) {
        const cx = Math.round(c.x + c.dx * ((y + 0.5) / bandH - 0.5))
        let bi = cx, bv = -1
        for (let k2 = cx - 3; k2 <= cx + 3; k2++) if (k2 >= 0 && k2 < D[y].length && D[y][k2] > bv) { bv = D[y][k2]; bi = k2 }
        off.push((bi - cx) * hMm)
      }
      // Fit a straight line through the darkest pixels; what is left over is
      // the roughness, less the one-pixel jitter any photo has.
      const n2 = off.length, my = (n2 - 1) / 2
      const mo = off.reduce((a2, b2) => a2 + b2, 0) / n2
      let sxy = 0, sxx = 0
      off.forEach((o, y) => { sxy += (y - my) * (o - mo); sxx += (y - my) ** 2 })
      const slope = sxx ? sxy / sxx : 0
      const resid = Math.sqrt(off.reduce((a2, o, y) => a2 + (o - (mo + slope * (y - my))) ** 2, 0) / n2)
      const amp = Math.max(0, resid - hMm * 0.6)
      const traceMm = Math.hypot(across, along)
      const jrc = clamp(Math.round((400 * amp) / Math.max(traceMm, 1)), 0, 20)
      // Stain: is the rock beside the break browner or darker than the row's rock?
      const stain = stainAt(p, L, r.band, x, Math.round(c.dx), cols, r.x0)
      const strength = clamp(c.cover, 0, 1)
      // Natural or handling: a clean square break is most often made by hand.
      let kind: Break['kind'], conf: Break['confidence']
      if (alpha < 60) { kind = 'natural'; conf = alpha < 45 ? 'high' : 'medium' }
      else if (stain > 0.35 || jrc >= 8) { kind = 'natural'; conf = 'medium' }
      else if (alpha >= 78 && jrc <= 4 && stain < 0.2) { kind = 'handling'; conf = 'medium' }
      else { kind = alpha >= 75 ? 'handling' : 'natural'; conf = 'low' }
      breaks.push({
        id: `${input.idPrefix ?? 't'}-${ri}-${k}`, row: ri, x: Math.round(x), dx: Math.round(c.dx * 10) / 10,
        at: r3(depthAt(ri, x)), alpha, rough: Math.round(amp * 10) / 10, jrc, stain: Math.round(stain * 100) / 100,
        strength: Math.round(strength * 100) / 100, kind, confidence: conf,
      })
    })
  })

  // 5. Bins of 5 cm: colour, texture, veins, iron staining.
  const bins: Bin[] = []
  const step = 0.05
  for (let d = input.from; d < usedTo - 1e-9; d += step) {
    const a = d, b = Math.min(usedTo, d + step)
    let n = 0, coreN = 0, R = 0, G = 0, B = 0, tex = 0, vein = 0, ox = 0, total = 0
    spans.forEach(sp => {
      if (sp.to <= a || sp.from >= b) return
      const r = rowsRaw[sp.row]
      const fx = (dep: number) => sp.x0 + ((dep - sp.from) / Math.max(1e-9, sp.to - sp.from)) * (sp.x1 - sp.x0)
      const xa = Math.max(sp.x0, Math.floor(fx(Math.max(a, sp.from)))), xb = Math.min(sp.x1, Math.ceil(fx(Math.min(b, sp.to))))
      total += xb - xa
      if (sp.kind !== 'core') return
      const m0 = Math.round(r.band[0] + (r.band[1] - r.band[0]) * 0.15), m1 = Math.round(r.band[1] - (r.band[1] - r.band[0]) * 0.15)
      // Median lightness of this stretch, so veins are judged against their own rock.
      const ls: number[] = []
      for (let x = xa; x < xb; x++) for (let y = m0; y < m1; y += 2) ls.push(L[y * w + x])
      const lmed = median(ls)
      for (let x = xa; x < xb; x++) {
        coreN++
        for (let y = m0; y < m1; y++) {
          const i = y * w + x, j = i * 4
          R += data[j]; G += data[j + 1]; B += data[j + 2]; n++
          if (x > xa) tex += Math.abs(L[i] - L[i - 1])
          const hv = hsv(data[j], data[j + 1], data[j + 2])
          if (L[i] > lmed + 45 && hv.s < 0.18) vein++
          if (hv.h >= 10 && hv.h <= 45 && hv.s > 0.32 && hv.v > 0.25 && hv.v < 0.92) ox++
        }
      }
    })
    if (total === 0) continue
    const lab = n ? toLab(R / n, G / n, B / n) : { L: 0, a: 0, b: 0 }
    bins.push({
      from: r3(a), to: r3(b), core: Math.round((coreN / total) * 100) / 100,
      L: Math.round(lab.L * 10) / 10, a: Math.round(lab.a * 10) / 10, b: Math.round(lab.b * 10) / 10,
      tex: n ? Math.round((tex / n) * 10) / 10 : 0, vein: n ? Math.round((vein / n) * 1000) / 1000 : 0, ox: n ? Math.round((ox / n) * 1000) / 1000 : 0,
      hex: n ? `#${hex2(R / n)}${hex2(G / n)}${hex2(B / n)}` : '#000000',
    })
  }

  return { width: w, height: h, rows, spans, breaks, bins, usedTo, rowConfidence: confidence, notes }
}

/* Browner or darker beside a break than in the rest of the row: rust or clay
 * on an old fracture face. 0 = the same as the row, 1 = clearly stained. */
function stainAt(p: Pixels, L: Float64Array, band: [number, number], x: number, dx: number, cols: Col[], x0: number): number {
  const { width: w, data } = p
  const near: number[] = [], far: number[] = [], nearL: number[] = [], farL: number[] = []
  const [y0, y1] = band
  for (let y = y0; y < y1; y++) {
    const cx = Math.round(x + dx * ((y - y0 + 0.5) / (y1 - y0) - 0.5))
    for (let k = -8; k <= 8; k++) {
      const xx = cx + k
      if (xx < 0 || xx >= w || cols[xx - x0]?.empty || cols[xx - x0]?.block) continue
      const j = (y * w + xx) * 4
      const redness = (data[j] - data[j + 2]) / 255
      if (Math.abs(k) >= 2 && Math.abs(k) <= 4) { near.push(redness); nearL.push(L[y * w + xx]) }
      else if (Math.abs(k) >= 7) { far.push(redness); farL.push(L[y * w + xx]) }
    }
  }
  if (!near.length || !far.length) return 0
  const dRed = median(near) - median(far)
  const dDark = (median(farL) - median(nearL)) / 255
  return clamp(dRed * 4 + Math.max(0, dDark - 0.08) * 2, 0, 1)
}

/* ── colour names a geologist would use ──────────────────────────────────── */

const NAMED: { name: string; L: number; a: number; b: number }[] = [
  { name: 'White', L: 90, a: 0, b: 2 }, { name: 'Pale grey', L: 72, a: 0, b: 2 }, { name: 'Grey', L: 55, a: 0, b: 2 },
  { name: 'Dark grey', L: 38, a: 0, b: 1 }, { name: 'Black', L: 20, a: 0, b: 0 },
  { name: 'Green-grey', L: 50, a: -6, b: 5 }, { name: 'Dark green', L: 35, a: -10, b: 6 },
  { name: 'Blue-grey', L: 52, a: -2, b: -7 }, { name: 'Buff', L: 72, a: 4, b: 18 }, { name: 'Cream', L: 85, a: 2, b: 12 },
  { name: 'Brown', L: 45, a: 9, b: 20 }, { name: 'Red-brown', L: 42, a: 20, b: 22 }, { name: 'Orange-brown', L: 58, a: 15, b: 35 },
  { name: 'Pink', L: 70, a: 14, b: 8 }, { name: 'Yellow-brown', L: 62, a: 6, b: 30 },
]
export function colourName(L: number, a: number, b: number): string {
  let best = NAMED[0], bd = Infinity
  NAMED.forEach(c => { const d = (c.L - L) ** 2 * 0.6 + (c.a - a) ** 2 + (c.b - b) ** 2; if (d < bd) { bd = d; best = c } })
  return best.name
}
