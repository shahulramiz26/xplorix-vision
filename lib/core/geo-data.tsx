'use client'

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAllHoles, useCore, stamp } from './store'
import {
  holeMetres, demoManualLog, classLithMap, checkLog, findVeins, televiewer, domains, predict,
  type Metre, type ManualInterval, type LogCheck, type Vein, type Structure, type Domains, type FeatureSet, type Predictions, type HoleView,
} from './downhole'
import { parseTable } from '../survey'

/* ==========================================================================
 * XPLORIX CORE — everything worked out from the photos and the other data
 *
 * One provider, so the metres, the log checks, the veins, the domains and
 * the predictions are worked out once for every Geology screen (and Ask
 * XPLORIX), not once per screen. Nothing is computed until a screen asks.
 *
 * What the geologist adds — an imported log or dataset, names for vein
 * classes — is kept here. In the demo it lives in the browser.
 * ========================================================================== */

export interface ExtraData { file: string; cols: string[]; rows: { from: number; to: number; v: (number | null)[] }[]; at: string }
export interface GeoEdits {
  manual: Record<string, ManualInterval[]>          // imported hand logs, by hole
  extra: Record<string, ExtraData>                  // imported downhole columns, by hole
  veinNames: Record<number, { name: string; description: string }>
  chipNames: Record<number, string>
}
const EMPTY: GeoEdits = { manual: {}, extra: {}, veinNames: {}, chipNames: {} }
const KEY = 'xplorix_core_data_v1'

export interface GeoData {
  ready: boolean
  holes: HoleView[]
  metres: Metre[]                                    // every hole, top to bottom
  byHole: Record<string, Metre[]>
  logs: Record<string, ManualInterval[]>
  map: ReturnType<typeof classLithMap>
  checks: LogCheck[]
  veins: Vein[]
  structures: Structure[]
  domains: (set: FeatureSet) => Domains
  pred: Predictions | null
}

interface Ctx {
  edits: GeoEdits
  want: () => void
  data: GeoData
  importManual: (text: string, file: string) => { ok: boolean; text: string }
  importExtra: (text: string, file: string) => { ok: boolean; text: string }
  clearImport: (kind: 'manual' | 'extra', hole: string) => void
  nameVein: (id: number, name: string, description: string) => void
  nameChip: (id: number, name: string) => void
}
const C = createContext<Ctx | null>(null)

const EMPTY_DATA: GeoData = { ready: false, holes: [], metres: [], byHole: {}, logs: {}, map: {}, checks: [], veins: [], structures: [], domains: () => ({ set: 'all', k: 0, labels: [], names: [], xy: [], explained: [], sizes: [], profile: [] }), pred: null }

export function GeoDataProvider({ children }: { children: ReactNode }) {
  const [edits, setEdits] = useState<GeoEdits>(EMPTY)
  const [on, setOn] = useState(false)
  useEffect(() => { try { const raw = localStorage.getItem(KEY); if (raw) setEdits({ ...EMPTY, ...JSON.parse(raw) }) } catch { /* private window */ } }, [])
  const save = useCallback((fn: (s: GeoEdits) => GeoEdits) => setEdits(s => {
    const n = fn(s)
    try { localStorage.setItem(KEY, JSON.stringify(n)) } catch { /* kept for this visit */ }
    return n
  }), [])
  const want = useCallback(() => setOn(true), [])
  const data = useCompute(on, edits)
  const { index } = useCore()
  const known = new Set(index?.holes.map(h => h.hole) ?? [])

  const ctx: Ctx = {
    edits, want, data,
    importManual: (text, file) => {
      const t = readIntervals(text)
      if (!t.ok) return t
      const li = t.cols.findIndex(c => /^(lith|lithology|rock|rock_type|geol|unit)/i.test(c))
      const qi = t.cols.findIndex(c => /^rqd/i.test(c))
      if (li < 0 && qi < 0) return { ok: false, text: 'No LITH or RQD column found. The file needs HOLE_ID, FROM, TO and LITH (and RQD if you have it).' }
      const by: Record<string, ManualInterval[]> = {}
      t.rows.forEach(r => {
        if (!known.has(r.hole)) return
        const rqd = qi >= 0 ? Number(r.cells[qi]) : NaN
        ;(by[r.hole] = by[r.hole] ?? []).push({ hole: r.hole, from: r.from, to: r.to, lith: li >= 0 ? r.cells[li] || '—' : '—', rqd: Number.isFinite(rqd) ? rqd : undefined, by: 'Imported', at: stamp(), imported: true })
      })
      const holes = Object.keys(by)
      if (!holes.length) return { ok: false, text: `None of the HOLE_IDs match a hole with core photos (${Array.from(known).slice(0, 4).join(', ')}…).` }
      save(s => ({ ...s, manual: { ...s.manual, ...by } }))
      return { ok: true, text: `Imported ${t.rows.length} intervals for ${holes.join(', ')} from ${file}. The check below now uses your log.` }
    },
    importExtra: (text, file) => {
      const t = readIntervals(text)
      if (!t.ok) return t
      const num = t.cols.map((_, j) => t.rows.filter(r => Number.isFinite(Number(r.cells[j])) && r.cells[j] !== '').length >= t.rows.length * 0.6)
      const cols = t.cols.filter((_, j) => num[j])
      if (!cols.length) return { ok: false, text: 'No number columns found besides HOLE_ID, FROM and TO.' }
      const by: Record<string, ExtraData> = {}
      t.rows.forEach(r => {
        if (!known.has(r.hole)) return
        const e = (by[r.hole] = by[r.hole] ?? { file, cols, rows: [], at: stamp() })
        e.rows.push({ from: r.from, to: r.to, v: t.cols.map((_, j) => j).filter(j => num[j]).map(j => { const v = Number(r.cells[j]); return r.cells[j] !== '' && Number.isFinite(v) ? v : null }) })
      })
      const holes = Object.keys(by)
      if (!holes.length) return { ok: false, text: 'None of the HOLE_IDs match a hole with core photos.' }
      save(s => ({ ...s, extra: { ...s.extra, ...by } }))
      return { ok: true, text: `Imported ${cols.length} columns (${cols.slice(0, 5).join(', ')}${cols.length > 5 ? '…' : ''}) for ${holes.join(', ')}.` }
    },
    clearImport: (kind, hole) => save(s => { const m = { ...s[kind] }; delete m[hole]; return { ...s, [kind]: m } }),
    nameVein: (id, name, description) => save(s => ({ ...s, veinNames: { ...s.veinNames, [id]: { name, description } } })),
    nameChip: (id, name) => save(s => ({ ...s, chipNames: { ...s.chipNames, [id]: name } })),
  }
  return <C.Provider value={ctx}>{children}</C.Provider>
}

/* Reads HOLE_ID, FROM, TO and whatever else from a CSV or tab-separated file. */
function readIntervals(text: string) {
  const rows = parseTable(text)
  const hi = rows.findIndex(r => r.some(c => /^(hole|hole_?id|bhid|holeid)$/i.test(c)) && r.some(c => /^(from|depth_?from|mfrom)$/i.test(c)))
  if (hi < 0) return { ok: false as const, text: 'No header with HOLE_ID, FROM and TO found.', cols: [], rows: [] }
  const head = rows[hi]
  const h = head.findIndex(c => /^(hole|hole_?id|bhid|holeid)$/i.test(c))
  const f = head.findIndex(c => /^(from|depth_?from|mfrom)$/i.test(c))
  const t = head.findIndex(c => /^(to|depth_?to|mto)$/i.test(c))
  if (t < 0) return { ok: false as const, text: 'No TO column found.', cols: [], rows: [] }
  const rest = head.map((c, j) => ({ c, j })).filter(x => ![h, f, t].includes(x.j))
  const out = rows.slice(hi + 1).map(r => ({ hole: r[h], from: Number(r[f]), to: Number(r[t]), cells: rest.map(x => r[x.j] ?? '') })).filter(r => r.hole && Number.isFinite(r.from) && Number.isFinite(r.to) && r.to > r.from)
  if (!out.length) return { ok: false as const, text: 'The file has a header but no rows with a hole and depths.', cols: [], rows: [] }
  return { ok: true as const, text: '', cols: rest.map(x => x.c), rows: out }
}

function useCompute(on: boolean, edits: GeoEdits): GeoData {
  const all = useAllHoles(on)
  const base = useMemo(() => {
    if (!on || !all.ready) return null
    const holes: HoleView[] = all.list.filter(h => h.flat).map(h => ({ data: h.data, rows: h.rows, flat: h.flat!, trays: h.trays }))
    const byHole: Record<string, Metre[]> = {}
    holes.forEach(h => { byHole[h.data.hole] = holeMetres(h) })
    const metres = holes.flatMap(h => byHole[h.data.hole])
    const veins = holes.flatMap(findVeins)
    const structures = holes.flatMap(televiewer)
    return { holes, byHole, metres, veins, structures }
  }, [on, all.ready, all.list])
  const logged = useMemo(() => {
    if (!base) return null
    const logs: Record<string, ManualInterval[]> = {}
    base.holes.forEach(h => { logs[h.data.hole] = edits.manual[h.data.hole] ?? demoManualLog(h) })
    const map = classLithMap(base.holes, logs)
    const checks = base.holes.map(h => checkLog(h, logs[h.data.hole], map))
    return { logs, map, checks }
  }, [base, edits.manual])
  const pred = useMemo(() => base && base.metres.length ? predict(base.metres) : null, [base])
  const cache = useMemo(() => ({} as Partial<Record<FeatureSet, Domains>>), [base])
  return useMemo(() => {
    if (!base || !logged) return EMPTY_DATA
    return {
      ready: true, ...base, ...logged, pred,
      domains: (set: FeatureSet) => (cache[set] = cache[set] ?? domains(base.metres, set)),
    }
  }, [base, logged, pred, cache])
}

export function useGeo() {
  const c = useContext(C)
  if (!c) throw new Error('useGeo outside GeoDataProvider')
  useEffect(() => { c.want() }, [c])
  return c
}

/* The hand log's lithology names, in a fixed order, with a colour each. */
export const LITH_HEX: Record<string, string> = {
  Basalt: '#4b5a52', Siltstone: '#8a7a68', 'Oxidised zone': '#b5743a', 'Quartz-veined sediment': '#9aa7b5', Sandstone: '#d2bf95', Limestone: '#c9d1d6',
}
const EXTRA_HEX = ['#6b8fbf', '#bf6b8f', '#8fbf6b', '#bfa36b', '#6bbfb4', '#a06bbf']
export function lithHex(name: string) {
  if (LITH_HEX[name]) return LITH_HEX[name]
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return EXTRA_HEX[h % EXTRA_HEX.length]
}
