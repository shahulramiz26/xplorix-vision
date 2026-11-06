import { rng, gauss, kmeans, mean } from './downhole'
import { toLab } from './engine'

/* ==========================================================================
 * XPLORIX CORE — RC chips
 *
 * An RC hole brings up chips, not core: one compartment of a chip tray per
 * metre. A photo of the tray is read compartment by compartment:
 *
 *   1. Grains   every chip is found against the tray (connected pixels that
 *               are not tray colour)
 *   2. Measure  area, perimeter, how long and thin it is (eccentricity), how
 *               ragged its outline is (shape complexity), its colour
 *   3. Colours  the two or three colours most of the chips are
 *   4. Clusters metres that look alike across every RC hole — the start of a
 *               log the geologist names
 *
 * DEMO DATA. The company has no RC holes, so three sample RC holes are drawn
 * here: each compartment is painted from the rock at that depth (a seeded
 * picture), then measured by the same grain step that reads an uploaded
 * photo. The measuring is real; the photos are drawn.
 * ========================================================================== */

export interface ChipLith { code: string; name: string; palette: [string, number][]; size: number; sizeSd: number; ecc: number; rough: number; fines: number }
export const CHIP_LITHS: ChipLith[] = [
  { code: 'OXD', name: 'Oxide clay', palette: [['#b5743a', 0.45], ['#c99a5b', 0.3], ['#8a4b26', 0.25]], size: 22, sizeSd: 0.55, ecc: 0.55, rough: 0.35, fines: 0.55 },
  { code: 'SAP', name: 'Saprock', palette: [['#a89074', 0.4], ['#c4ad8a', 0.35], ['#7d6a55', 0.25]], size: 34, sizeSd: 0.5, ecc: 0.6, rough: 0.3, fines: 0.3 },
  { code: 'BAS', name: 'Basalt', palette: [['#3f4a45', 0.55], ['#56625b', 0.3], ['#2b3330', 0.15]], size: 52, sizeSd: 0.45, ecc: 0.55, rough: 0.18, fines: 0.05 },
  { code: 'QVN', name: 'Quartz vein', palette: [['#e8e6df', 0.55], ['#cfcfc8', 0.3], ['#9aa1a8', 0.15]], size: 64, sizeSd: 0.5, ecc: 0.5, rough: 0.12, fines: 0.04 },
  { code: 'SLT', name: 'Siltstone', palette: [['#6f6a63', 0.5], ['#8a8178', 0.3], ['#504b46', 0.2]], size: 38, sizeSd: 0.4, ecc: 0.82, rough: 0.14, fines: 0.1 },
  { code: 'SST', name: 'Sandstone', palette: [['#cdb991', 0.5], ['#b9a37a', 0.3], ['#e0d2b0', 0.2]], size: 30, sizeSd: 0.35, ecc: 0.35, rough: 0.25, fines: 0.15 },
]

export const RC_HOLES = [
  { hole: 'RC-301', project: 'Site C - East Pit (RC)', rig: 'RC-01', depth: 96, units: [[0, 'OXD'], [22, 'SAP'], [34, 'SLT'], [51, 'QVN'], [57, 'SLT'], [70, 'BAS']] },
  { hole: 'RC-302', project: 'Site C - East Pit (RC)', rig: 'RC-01', depth: 120, units: [[0, 'OXD'], [17, 'SAP'], [29, 'SST'], [48, 'SLT'], [66, 'QVN'], [74, 'SLT'], [92, 'BAS']] },
  { hole: 'RC-303', project: 'Site C - East Pit (RC)', rig: 'RC-01', depth: 84, units: [[0, 'OXD'], [26, 'SAP'], [38, 'BAS'], [61, 'QVN'], [66, 'BAS']] },
] as const

export const COMP = 112             // compartment picture, px
export const MM_PER_PX = 0.25       // a 28 mm compartment, 112 px across
const TRAY_BG = [38, 38, 40]

export function lithAt(hole: typeof RC_HOLES[number], d: number) {
  let code: string = hole.units[0][1]
  hole.units.forEach(([at, c]) => { if (d >= at) code = c })
  return CHIP_LITHS.findIndex(l => l.code === code)
}

/* ── drawing a compartment (demo only) ─────────────────────────────────── */

const rgb = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]

export function paintCompartment(g: CanvasRenderingContext2D, seed: string, li: number, mix?: { li: number; share: number }) {
  const r = rng(seed)
  g.fillStyle = `rgb(${TRAY_BG.join(',')})`
  g.fillRect(0, 0, COMP, COMP)
  const draw = (L: ChipLith, n: number) => {
    for (let k = 0; k < n; k++) {
      let x = r() * COMP, y = r() * COMP
      const area = Math.exp(Math.log(L.size) + gauss(r) * L.sizeSd)
      const ecc = Math.min(0.97, Math.max(0.05, L.ecc + gauss(r) * 0.12))
      const ax = Math.sqrt(area / Math.PI / Math.sqrt(1 - ecc * ecc)), bx = ax * Math.sqrt(1 - ecc * ecc)
      const rot = r() * Math.PI
      let pick = r(), col = L.palette[0][0]
      for (const [c, w] of L.palette) { if (pick < w) { col = c; break } pick -= w }
      const [R, G, B] = rgb(col)
      const j = gauss(r) * 14
      g.fillStyle = `rgb(${Math.round(R + j)},${Math.round(G + j)},${Math.round(B + j)})`
      const nv = 6 + Math.floor(r() * 4)
      g.beginPath()
      for (let v = 0; v < nv; v++) {
        const t = (v / nv) * Math.PI * 2
        const rr = 1 + gauss(r) * L.rough
        const px = Math.cos(t) * ax * rr, py = Math.sin(t) * bx * rr
        const X = x + px * Math.cos(rot) - py * Math.sin(rot), Y = y + px * Math.sin(rot) + py * Math.cos(rot)
        if (v) g.lineTo(X, Y); else g.moveTo(X, Y)
      }
      g.closePath(); g.fill()
      x += 0; y += 0
    }
    // fines: a dusting of tiny grains
    const nf = Math.round(L.fines * 260)
    for (let k = 0; k < nf; k++) {
      const [R, G, B] = rgb(L.palette[Math.floor(r() * L.palette.length)][0])
      g.fillStyle = `rgba(${R},${G},${B},0.8)`
      g.fillRect(r() * COMP, r() * COMP, 1.2, 1.2)
    }
  }
  const L = CHIP_LITHS[li]
  const n = Math.round(Math.min(110, 3600 / L.size) * (0.85 + r() * 0.3))
  draw(L, mix ? Math.round(n * (1 - mix.share)) : n)
  if (mix) draw(CHIP_LITHS[mix.li], Math.round(n * mix.share))
}

/* ── measuring: works on any photo ──────────────────────────────────────── */

export interface Grain { area: number; perimeter: number; ecc: number; complexity: number; rgb: [number, number, number] }
export interface ChipSample { grains: Grain[]; colours: { hex: string; share: number }[]; area: number; perimeter: number; ecc: number; complexity: number; cover: number; mask: Uint8Array }

const hex = (c: number[]) => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')

/* The tray colour is what the border of the picture mostly is. */
function background(d: Uint8ClampedArray, w: number, h: number) {
  const px: number[][] = []
  for (let x = 0; x < w; x += 2) { px.push([d[x * 4], d[x * 4 + 1], d[x * 4 + 2]]); const i = ((h - 1) * w + x) * 4; px.push([d[i], d[i + 1], d[i + 2]]) }
  for (let y = 0; y < h; y += 2) { const i = y * w * 4; px.push([d[i], d[i + 1], d[i + 2]]); const k = (y * w + w - 1) * 4; px.push([d[k], d[k + 1], d[k + 2]]) }
  const L = px.map(p => p[0] + p[1] + p[2]).sort((a, b) => a - b)
  const darkest = L[Math.floor(L.length * 0.2)]
  const bg = px.filter(p => p[0] + p[1] + p[2] <= darkest + 30)
  return [0, 1, 2].map(c => mean(bg.map(p => p[c])))
}

export function measureChips(d: Uint8ClampedArray, w: number, h: number): ChipSample {
  const bg = background(d, w, h)
  const mask = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const dr = d[i * 4] - bg[0], dg = d[i * 4 + 1] - bg[1], db = d[i * 4 + 2] - bg[2]
    if (dr * dr + dg * dg + db * db > 30 * 30) mask[i] = 1
  }
  const lab = new Int32Array(w * h).fill(-1)
  const grains: Grain[] = []
  const stack: number[] = []
  let cover = 0
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || lab[s] >= 0) continue
    const id = grains.length
    stack.push(s); lab[s] = id
    let n = 0, per = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, R = 0, G = 0, B = 0
    while (stack.length) {
      const p = stack.pop()!
      const x = p % w, y = (p - x) / w
      n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y
      R += d[p * 4]; G += d[p * 4 + 1]; B += d[p * 4 + 2]
      let edge = false
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]
      for (const q of nb) {
        if (q < 0 || !mask[q]) { edge = true; continue }
        if (lab[q] < 0) { lab[q] = id; stack.push(q) }
      }
      if (edge) per++
    }
    cover += n
    if (n < 6) { grains.push({ area: 0, perimeter: 0, ecc: 0, complexity: 0, rgb: [0, 0, 0] }); continue }
    const mx = sx / n, my = sy / n
    const cxx = sxx / n - mx * mx, cyy = syy / n - my * my, cxy = sxy / n - mx * my
    const tr = cxx + cyy, det = cxx * cyy - cxy * cxy
    const l1 = tr / 2 + Math.sqrt(Math.max(0, tr * tr / 4 - det)), l2 = tr / 2 - Math.sqrt(Math.max(0, tr * tr / 4 - det))
    const area = n * MM_PER_PX * MM_PER_PX, perimeter = per * MM_PER_PX
    grains.push({ area, perimeter, ecc: l1 > 0 ? Math.sqrt(Math.max(0, 1 - l2 / l1)) : 0, complexity: (per * per) / (4 * Math.PI * n), rgb: [R / n, G / n, B / n] })
  }
  const real = grains.filter(g => g.area > 0)
  // two or three colours that most of the chip area is
  let colours: { hex: string; share: number }[] = []
  if (real.length >= 3) {
    const k = Math.min(3, real.length)
    const km = kmeans(real.map(g => g.rgb.map(v => v / 40)), k, `col:${real.length}:${Math.round(real[0].area * 100)}`)
    const tot = real.reduce((s, g) => s + g.area, 0)
    colours = Array.from({ length: k }, (_, i) => {
      const gs = real.filter((_, j) => km.lab[j] === i)
      const a = gs.reduce((s, g) => s + g.area, 0)
      return { hex: hex([0, 1, 2].map(c => gs.reduce((s, g) => s + g.rgb[c] * g.area, 0) / Math.max(1e-9, a))), share: a / tot }
    }).filter(c => c.share > 0).sort((a, b) => b.share - a.share)
  }
  const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0 }
  return {
    grains: real, colours,
    area: med(real.map(g => g.area)), perimeter: med(real.map(g => g.perimeter)), ecc: med(real.map(g => g.ecc)), complexity: med(real.map(g => g.complexity)),
    cover: cover / (w * h), mask,
  }
}

/* An outline of every grain found, drawn over the photo. */
export function outline(d: Uint8ClampedArray, mask: Uint8Array, w: number, h: number) {
  const out = new Uint8ClampedArray(d)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x
    if (!mask[p]) continue
    const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1 || !mask[p - 1] || !mask[p + 1] || !mask[p - w] || !mask[p + w]
    if (edge) { out[p * 4] = 255; out[p * 4 + 1] = 120; out[p * 4 + 2] = 20 }
  }
  return out
}

/* ── one metre of chips, and the RC holes ──────────────────────────────── */

export interface ChipMetre {
  hole: string; from: number; to: number; li: number
  img: string; outlined: string
  colours: { hex: string; share: number }[]
  area: number; perimeter: number; ecc: number; complexity: number; grains: number; cover: number
  sizes: number[]                          // every grain's area, mm², for the histogram
  shapes: { area: number; complexity: number; hex: string }[]
  cluster: number
}

export function chipFeatures(m: ChipMetre) {
  const c = m.colours[0] ? rgb(m.colours[0].hex) : [128, 128, 128]
  const L = toLab(c[0], c[1], c[2])
  return [L.L / 12, L.a / 6, L.b / 6, Math.log(Math.max(0.01, m.area)) * 1.5, m.ecc * 5, m.complexity * 2, m.cover * 4]
}

/* Group metres that look alike, numbered from darkest to palest. */
export function chipClusters(ms: ChipMetre[], k = 5) {
  if (ms.length < k) return ms.map(() => 0)
  const X = ms.map(chipFeatures)
  const km = kmeans(X, k, `chips:${ms.length}`)
  const L = Array.from({ length: k }, (_, i) => mean(X.filter((_, j) => km.lab[j] === i).map(x => x[0])))
  const order = L.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v).map(x => x.i)
  const remap: Record<number, number> = {}
  order.forEach((o, i) => { remap[o] = i })
  return km.lab.map(l => remap[l])
}
export const CHIP_CLUSTER_HEX = ['#334155', '#7c6f64', '#a16207', '#0e7490', '#cbd5e1', '#be185d']
