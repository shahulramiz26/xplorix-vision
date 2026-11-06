'use client'

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { AddedBreak, BreakVerdict, Change, CoreHole, CoreIndex, CoreTray, GapVerdict } from './model'
import { flatten, intervals, totals, type Overrides } from './geotech'

/* ==========================================================================
 * XPLORIX CORE — the store
 *
 * The photo step's results come as one file per hole (public/core/*.json),
 * loaded the first time a screen needs that hole. What the geologist decides
 * (a break's kind, a gap's kind, breaks added, trays checked, names for the
 * rock classes) and photos added in the browser are kept here, with who and
 * when. In the demo it lives in the browser; with a database it is a table.
 * ========================================================================== */

export interface CoreReview {
  breaks: Record<string, BreakVerdict>
  gaps: Record<string, GapVerdict>
  added: AddedBreak[]
  checked: Record<string, { by: string; at: string }>
  classNames: Record<number, string>
  changes: (Change & { tray?: string })[]
  uploads: (CoreTray & { photo: string })[]      // photos added in the browser, with the photo as a data URL
  reviewer: string
}

const EMPTY: CoreReview = { breaks: {}, gaps: {}, added: [], checked: {}, classNames: {}, changes: [], uploads: [], reviewer: 'Priya Nair (geologist)' }
const KEY = 'xplorix_core_v2_oct'

export function stamp() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

interface Ctx {
  index: CoreIndex | null
  review: CoreReview
  holes: Record<string, CoreHole>
  load: (hole: string) => Promise<CoreHole | null>
  setBreak: (id: string, tray: string, v: BreakVerdict | null, label: string) => void
  setGap: (id: string, tray: string, v: GapVerdict | null, label: string) => void
  addBreak: (b: AddedBreak) => void
  removeAdded: (id: string) => void
  check: (tray: string) => void
  uncheck: (tray: string) => void
  nameClass: (id: number, name: string) => void
  addUpload: (t: CoreTray & { photo: string }) => boolean
  removeUpload: (id: string) => void
  reset: () => void
}

const C = createContext<Ctx | null>(null)
const cache: Record<string, Promise<CoreHole | null>> = {}

export function CoreProvider({ children }: { children: ReactNode }) {
  const [index, setIndex] = useState<CoreIndex | null>(null)
  const [review, setReview] = useState<CoreReview>(EMPTY)
  const [holes, setHoles] = useState<Record<string, CoreHole>>({})
  const loaded = useRef(false)

  useEffect(() => {
    try { const raw = localStorage.getItem(KEY); if (raw) setReview({ ...EMPTY, ...JSON.parse(raw) }) } catch { /* private window */ }
    loaded.current = true
    fetch('/core/index.json').then(r => r.ok ? r.json() : null).then(setIndex).catch(() => setIndex(null))
  }, [])

  const save = useCallback((fn: (s: CoreReview) => CoreReview) => {
    setReview(s => {
      const n = fn(s)
      try { localStorage.setItem(KEY, JSON.stringify(n)) } catch { /* full or private: kept for this visit */ }
      return n
    })
  }, [])

  const load = useCallback((hole: string) => {
    if (!cache[hole]) {
      cache[hole] = fetch(`/core/${hole}.json`).then(r => r.ok ? r.json() as Promise<CoreHole> : null).catch(() => null)
      cache[hole].then(h => { if (h) setHoles(s => ({ ...s, [hole]: h })) })
    }
    return cache[hole]
  }, [])

  const log = (s: CoreReview, what: string, tray?: string) => [{ at: stamp(), by: s.reviewer, what, tray }, ...s.changes].slice(0, 500)

  const ctx: Ctx = {
    index, review, holes, load,
    setBreak: (id, tray, v, label) => save(s => {
      const breaks = { ...s.breaks }
      if (v) breaks[id] = v; else delete breaks[id]
      return { ...s, breaks, changes: log(s, label, tray) }
    }),
    setGap: (id, tray, v, label) => save(s => {
      const gaps = { ...s.gaps }
      if (v) gaps[id] = v; else delete gaps[id]
      return { ...s, gaps, changes: log(s, label, tray) }
    }),
    addBreak: b => save(s => ({ ...s, added: [...s.added, b], changes: log(s, `Added a ${b.kind} break at ${b.at.toFixed(2)} m`, b.tray) })),
    removeAdded: id => save(s => {
      const b = s.added.find(x => x.id === id)
      return { ...s, added: s.added.filter(x => x.id !== id), changes: log(s, `Removed the break added at ${b?.at.toFixed(2)} m`, b?.tray) }
    }),
    check: tray => save(s => ({ ...s, checked: { ...s.checked, [tray]: { by: s.reviewer, at: stamp() } }, changes: log(s, 'Marked the tray checked', tray) })),
    uncheck: tray => save(s => { const checked = { ...s.checked }; delete checked[tray]; return { ...s, checked, changes: log(s, 'Opened the tray again', tray) } }),
    nameClass: (id, name) => save(s => ({ ...s, classNames: { ...s.classNames, [id]: name }, changes: log(s, `Named rock class ${classLetter(id)} "${name}"`) })),
    addUpload: t => {
      // Photos are kept in the browser in the demo, which holds only a few MB:
      // say so when it is full instead of losing the photo quietly.
      const n = { ...review, uploads: [...review.uploads.filter(u => u.id !== t.id), t], changes: log(review, `Added tray photo ${t.from.toFixed(1)}–${t.to.toFixed(1)} m`, t.id) }
      try { localStorage.setItem(KEY, JSON.stringify(n)) } catch { return false }
      setReview(n)
      return true
    },
    removeUpload: id => save(s => ({ ...s, uploads: s.uploads.filter(u => u.id !== id), changes: log(s, 'Removed an added tray photo', id) })),
    reset: () => save(() => EMPTY),
  }
  return <C.Provider value={ctx}>{children}</C.Provider>
}

export function useCore() {
  const c = useContext(C)
  if (!c) throw new Error('useCore outside CoreProvider')
  return c
}

export const holeOfTray = (id: string) => id.replace(/-(T|U)[^-]+$/, '')
export const classLetter = (id: number) => String.fromCharCode(65 + id)
export function className(review: CoreReview, id: number) {
  if (id < 0) return '—'
  return review.classNames[id] ? review.classNames[id] : `Class ${classLetter(id)}`
}

export function overridesOf(r: CoreReview): Overrides {
  return { breaks: r.breaks, gaps: r.gaps, added: r.added }
}

/* One hole, loaded, with the photos added in the browser and the geologist's
 * corrections applied. */
export function useHole(hole: string | undefined) {
  const { holes, load, review } = useCore()
  useEffect(() => { if (hole) void load(hole) }, [hole, load])
  const data = hole ? holes[hole] : undefined
  return useMemo(() => {
    if (!data) return { data: undefined, trays: [] as CoreTray[], flat: undefined, rows: [], total: undefined }
    const ups = review.uploads.filter(u => u.hole === data.hole)
    const trays = [...data.trays.filter(t => !ups.some(u => Math.abs(u.from - t.from) < 0.01)), ...ups].sort((a, b) => a.from - b.from)
    const flat = flatten(trays, overridesOf(review))
    const rows = intervals(flat, 1)
    return { data, trays, flat, rows, total: totals(rows) }
  }, [data, review])
}

/* Every hole with photos, loaded together (screens that look across holes). */
export function useAllHoles(enabled = true) {
  const { index, holes, load, review } = useCore()
  useEffect(() => { if (enabled) index?.holes.forEach(h => void load(h.hole)) }, [index, load, enabled])
  return useMemo(() => {
    if (!index) return { ready: false, list: [] as ReturnType<typeof oneHole>[] }
    const list = index.holes.map(h => holes[h.hole]).filter(Boolean).map(d => oneHole(d, review))
    return { ready: list.length === index.holes.length, list }
  }, [index, holes, review])
}
function oneHole(data: CoreHole, review: CoreReview) {
  const ups = review.uploads.filter(u => u.hole === data.hole)
  const trays = [...data.trays.filter(t => !ups.some(u => Math.abs(u.from - t.from) < 0.01)), ...ups].sort((a, b) => a.from - b.from)
  const flat = flatten(trays, overridesOf(review))
  const rows = intervals(flat, 1)
  return { data, trays, flat, rows, total: totals(rows), checked: trays.filter(t => review.checked[t.id]).length }
}
