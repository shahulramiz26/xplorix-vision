/* ==========================================================================
 * WHAT COPILOT REMEMBERS
 *
 * Every piece of advice, what the crew did and whether it worked. That is
 * the "worked 8 of 10 times" on each card and what Copilot learns on.
 * Kept in the browser for the demo, starting from a demo record so the
 * first advice already has a history. Swap point: the same records posted
 * to the server, shared across the fleet.
 * ========================================================================== */

import { useSyncExternalStore } from 'react'
import type { Kind } from './copilot'

export interface Outcome { at: number; rig: string; kind: Kind; what: string; action: 'done' | 'applied' | 'auto' | 'later'; worked: boolean | null; text: string; hours: number; sar: number }
interface Mem { v: 1; record: Record<string, { worked: number; of: number }>; log: Outcome[] }

const KEY = 'xplorix-copilot-memory-v1'
const SEED: Mem['record'] = {
  broken: { worked: 41, of: 48 }, core: { worked: 17, of: 21 }, blocking: { worked: 26, of: 31 }, engine: { worked: 12, of: 14 },
  pump: { worked: 9, of: 10 }, standby: { worked: 38, of: 38 }, idle: { worked: 30, of: 33 }, cost: { worked: 22, of: 31 },
  bit: { worked: 19, of: 20 }, stop: { worked: 4, of: 5 }, survey: { worked: 27, of: 27 },
}
let mem: Mem = { v: 1, record: { ...SEED }, log: [] }
let loaded = false
const subs = new Set<() => void>()
function load() {
  if (loaded || typeof window === 'undefined') return
  loaded = true
  try { const s = localStorage.getItem(KEY); if (s) mem = { ...mem, ...JSON.parse(s) } } catch { /* private mode */ }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(mem)) } catch { /* ignore */ } subs.forEach(f => f()) }
const empty: Mem = { v: 1, record: SEED, log: [] }

export function useMemory() {
  return useSyncExternalStore(f => { subs.add(f); return () => subs.delete(f) }, () => { load(); return mem }, () => empty)
}
export const memory = {
  learn(o: Outcome) {
    load()
    const r = mem.record[o.kind] ?? { worked: 0, of: 0 }
    const record = o.worked == null ? mem.record : { ...mem.record, [o.kind]: { worked: r.worked + (o.worked ? 1 : 0), of: r.of + 1 } }
    mem = { ...mem, record, log: [o, ...mem.log].slice(0, 200) }
    save()
  },
  reset() { mem = { v: 1, record: { ...SEED }, log: [] }; save() },
}
