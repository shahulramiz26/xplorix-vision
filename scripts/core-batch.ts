/* ==========================================================================
 * XPLORIX CORE — batch over a photo archive
 *
 * Reads tray photos (one folder per drill hole, with trays.csv: sample_no,
 * from_m, to_m, file — as pipeline/nvcl_trays.py saves them), runs the photo
 * step on every tray, ties each tray to the shift logs that drilled it, finds
 * the rock classes across all holes, and writes:
 *
 *   public/core/photos/<hole>/tray_NNN.jpg   the photos
 *   public/core/<hole>.json                   everything measured, per hole
 *   public/core/index.json                    holes and rock classes
 *   lib/core/summary.json                     per shift: what the core says
 *                                             (read by the drilling side)
 *
 * Run:  npx tsx scripts/core-batch.ts <folder with one sub-folder per hole>
 * ========================================================================== */

import fs from 'fs'
import path from 'path'
import jpeg from 'jpeg-js'
import { processTray, holeLayouts, layoutFor, type Pixels } from '../lib/core/engine'
import { flatten, interval, FEAT_KEYS, scaled, nearestClass, type Feat } from '../lib/core/geotech'
import type { CoreHole, CoreIndex, CoreTray, RockClassCentre } from '../lib/core/model'
import { PHOTO_SOURCES, CORE_DIAMETER_MM, NVCL_CREDIT } from '../lib/core/sources'
import { SEED_SHIFT_LOGS } from '../lib/costing-store'

const SRC = process.argv[2]
if (!SRC) { console.error('Give the folder that holds one sub-folder per drill hole.'); process.exit(1) }
const OUT = path.join(__dirname, '..', 'public', 'core')
fs.mkdirSync(path.join(OUT, 'photos'), { recursive: true })

function load(file: string): Pixels {
  const buf = fs.readFileSync(file)
  if (buf[0] !== 0xff) throw new Error(`${file}: expected a JPEG photo`)
  const p = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true })
  return { width: p.width, height: p.height, data: p.data }
}
const csv = (f: string) => fs.readFileSync(f, 'utf8').trim().split(/\r?\n/).slice(1).map(l => l.trim().split(','))

const logs = SEED_SHIFT_LOGS.filter(l => l.holeNumber && !l.segmentOf)
const holes: CoreHole[] = []

for (const src of PHOTO_SOURCES) {
  const dir = path.join(SRC, src.nvcl)
  if (!fs.existsSync(dir)) { console.warn(`skip ${src.hole}: no folder ${dir}`); continue }
  const hl = logs.filter(l => l.holeNumber === src.hole).sort((a, b) => (a.meterStart ?? 0) - (b.meterStart ?? 0))
  if (!hl.length) { console.warn(`skip ${src.hole}: no shift logs`); continue }
  const drilled = Math.max(...hl.map(l => l.meterEnd ?? 0))
  const size = hl[0].holeSize || 'HQ'
  const rowsCsv = csv(path.join(dir, 'trays.csv')).map(c => ({ n: +c[0], from: +c[1], to: +c[2], file: c[3] }))
    .filter(r => r.file && !/\.hd\.jpg$/i.test(r.file) && fs.existsSync(path.join(dir, r.file))).sort((a, b) => a.from - b.from)
  const f0 = rowsCsv[0].from
  const shift = f0 - Math.min(f0, 3)
  const photos = rowsCsv.map(r => load(path.join(dir, r.file)))
  const layouts = holeLayouts(photos)
  fs.mkdirSync(path.join(OUT, 'photos', src.hole), { recursive: true })
  const trays: CoreTray[] = []
  rowsCsv.forEach((r, i) => {
    const from = +(r.from - shift).toFixed(3), to = +(r.to - shift).toFixed(3)
    if (to > drilled + 0.01) return
    const id = `${src.hole}-T${String(trays.length + 1).padStart(2, '0')}`
    const px = photos[i]
    const res = processTray(px, { from, to, layout: layoutFor(layouts, px.height), coreDiameterMm: CORE_DIAMETER_MM[size] ?? 63.5, idPrefix: id })
    const file = `tray_${String(trays.length + 1).padStart(3, '0')}.jpg`
    fs.copyFileSync(path.join(dir, r.file), path.join(OUT, 'photos', src.hole, file))
    // the full-size photo for the tray screens, when the archive has one
    const hdSrc = path.join(dir, r.file.replace(/\.jpg$/i, '.hd.jpg'))
    const hd = fs.existsSync(hdSrc) ? file.replace(/\.jpg$/, '.hd.jpg') : undefined
    if (hd) fs.copyFileSync(hdSrc, path.join(OUT, 'photos', src.hole, hd))
    const shiftsHere = hl.filter(l => (l.meterEnd ?? 0) > from && (l.meterStart ?? 0) < to)
    const last = hl.find(l => (l.meterEnd ?? 0) >= to) ?? hl[hl.length - 1]
    trays.push({
      id, hole: src.hole, no: trays.length + 1, file, from, to, usedTo: res.usedTo, w: res.width, h: res.height,
      rows: res.rows, spans: res.spans, breaks: res.breaks, bins: res.bins.map(b => ({ ...b, cls: -1 })),
      rowConfidence: res.rowConfidence, notes: res.notes, shiftIds: shiftsHere.map(l => l.id), hd,
      takenAt: `${last.date}T${last.shift === 'Day' ? '18:40' : '06:40'}`, takenBy: last.supervisor ?? 'Site supervisor', source: 'archive',
    })
  })
  holes.push({
    hole: src.hole, project: hl[0].project, rig: hl[0].rig, holeSize: size, drilled,
    photographedTo: trays.length ? Math.max(...trays.map(t => t.usedTo)) : 0,
    source: { name: NVCL_CREDIT, hole: src.nvcl, licence: 'CC BY 4.0', shift: +shift.toFixed(3) },
    trays,
  })
  const nb = trays.reduce((s, t) => s + t.breaks.length, 0)
  console.log(`${src.hole} ← NVCL ${src.nvcl}: ${trays.length} trays, ${nb} breaks, to ${holes[holes.length - 1].photographedTo.toFixed(1)} of ${drilled} m`)
}

/* Rock classes: k-means over every 5 cm of core in every hole, on colour,
 * grain, veins and staining. Six classes; the geologist names them. */
const all = holes.flatMap(h => h.trays.flatMap(t => t.bins.filter(b => b.core > 0.5)))
const scale = Object.fromEntries(FEAT_KEYS.map(k => {
  const xs = all.map(b => b[k] as number)
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  const s = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) || 1
  return [k, [m, s]]
})) as Record<keyof Feat, [number, number]>
const K = 6
let seed = 7
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
const vecs = all.map(b => scaled(b, scale))
const dist = (p: number[], q: number[]) => p.reduce((s, v, i) => s + (v - q[i]) ** 2, 0)
// k-means++ start, so the classes are the same on every run
const cIdx = [Math.floor(rnd() * vecs.length)]
while (cIdx.length < K) {
  const d = vecs.map(v => Math.min(...cIdx.map(i => dist(v, vecs[i]))))
  const tot = d.reduce((a, b) => a + b, 0)
  let r = rnd() * tot, i = 0
  while (r > d[i]) { r -= d[i]; i++ }
  cIdx.push(Math.min(i, vecs.length - 1))
}
let C = cIdx.map(i => [...vecs[i]])
let assign = new Array(vecs.length).fill(0)
for (let it = 0; it < 40; it++) {
  assign = vecs.map(v => { let bi = 0, bd = Infinity; C.forEach((c, i) => { const dd = dist(v, c); if (dd < bd) { bd = dd; bi = i } }); return bi })
  C = C.map((c, i) => {
    const mine = vecs.filter((_, j) => assign[j] === i)
    return mine.length ? c.map((_, k) => mine.reduce((s, v) => s + v[k], 0) / mine.length) : c
  })
}
// Classes ordered dark to light, so "Class A" is always the darkest.
const centres: (Feat & { hex: string; share: number })[] = C.map((_, i) => {
  const mine = all.filter((_, j) => assign[j] === i)
  const m = (k: keyof Feat) => mine.reduce((s, b) => s + (b[k] as number), 0) / (mine.length || 1)
  const rgb = mine.reduce((s, b) => [s[0] + parseInt(b.hex.slice(1, 3), 16), s[1] + parseInt(b.hex.slice(3, 5), 16), s[2] + parseInt(b.hex.slice(5, 7), 16)], [0, 0, 0])
  const hx = rgb.map(v => Math.round(v / (mine.length || 1)).toString(16).padStart(2, '0')).join('')
  return { L: m('L'), a: m('a'), b: m('b'), tex: m('tex'), vein: m('vein'), ox: m('ox'), hex: `#${hx}`, share: mine.length / all.length }
})
const order = centres.map((c, i) => ({ c, i })).sort((p, q) => p.c.L - q.c.L)
const classes: RockClassCentre[] = order.map((o, id) => ({ id, ...roundF(o.c), hex: o.c.hex, share: +o.c.share.toFixed(3) }))
function roundF(c: Feat) { return { L: +c.L.toFixed(2), a: +c.a.toFixed(2), b: +c.b.toFixed(2), tex: +c.tex.toFixed(2), vein: +c.vein.toFixed(4), ox: +c.ox.toFixed(4) } }
holes.forEach(h => h.trays.forEach(t => t.bins.forEach(b => { b.cls = nearestClass(b, classes, scale) })))

/* Write the holes and the index. */
holes.forEach(h => fs.writeFileSync(path.join(OUT, `${h.hole}.json`), JSON.stringify(h)))
const index: CoreIndex = {
  generatedAt: new Date().toISOString().slice(0, 16),
  holes: holes.map(h => ({ hole: h.hole, project: h.project, rig: h.rig, drilled: h.drilled, photographedTo: h.photographedTo, trays: h.trays.length, source: h.source.hole })),
  classes,
  scale: scale as CoreIndex['scale'],
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index))

/* What the core says about each shift, for the drilling side. Before any
 * geologist has checked a tray these are the photo step's suggestions. */
const summary: Record<string, { hole: string; from: number; to: number; recovery: number; rqd: number; ff: number; driller: number; photographed: number }> = {}
holes.forEach(h => {
  const f = flatten(h.trays)
  logs.filter(l => l.holeNumber === h.hole).forEach(l => {
    const a = l.meterStart ?? 0, b = l.meterEnd ?? 0
    const r = interval(f, a, b)
    if (!r || r.length < (b - a) * 0.6) return
    summary[l.id] = {
      hole: h.hole, from: a, to: b, recovery: +r.recovery.toFixed(1), rqd: +r.rqd.toFixed(1), ff: +r.ff.toFixed(2),
      driller: l.metresDrilled ? +((l.coreRecovery / l.metresDrilled) * 100).toFixed(1) : 0, photographed: +r.length.toFixed(2),
    }
  })
})
fs.writeFileSync(path.join(__dirname, '..', 'lib', 'core', 'summary.json'), JSON.stringify({ generatedAt: index.generatedAt, shifts: summary }))
const sizes = holes.map(h => fs.statSync(path.join(OUT, `${h.hole}.json`)).size)
console.log(`\n${holes.length} holes, ${holes.reduce((s, h) => s + h.trays.length, 0)} trays, ${Object.keys(summary).length} shifts with core results; JSON ${(sizes.reduce((a, b) => a + b, 0) / 1e6).toFixed(1)} MB`)
console.log('classes', classes.map(c => `${c.hex} L${c.L.toFixed(0)} ${Math.round(c.share * 100)}%`).join(' | '))
