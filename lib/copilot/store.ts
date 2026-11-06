/* ==========================================================================
 * XPLORIX COPILOT — WHAT COPILOT SAID, WHAT THE CREW DID, WHAT HAPPENED
 *
 * Every piece of advice is kept with the driller's answer and, once the
 * readings have had time to show it, whether it worked. That record is the
 * learning loop: it is what the command centre counts, what each alert's
 * "worked 8 of 10 times" comes from, and what the fleet brain learns on.
 *
 * Kept in the browser for the demo, with thirty days of demo history so the
 * command centre has something to show before anyone drills. Swap point:
 * the same shape posted to the server.
 * ========================================================================== */

import { useSyncExternalStore } from 'react'

export type AlertKind = 'broken-ahead' | 'slow' | 'bit-life' | 'engine-hot' | 'blocking' | 'survey-due' | 'gps-stop' | 'idle' | 'stall'
export type Action = 'done' | 'later' | 'applied' | 'auto' | 'none'
export type Outcome = 'worked' | 'failed' | 'pending'

export interface CopilotEvent {
  id: string; at: string                     // ISO date and time
  rig: string; hole: string; depth: number; driller: string
  kind: AlertKind; title: string
  action: Action; outcome: Outcome | null
  hoursSaved: number; metresSaved: number
  level: 1 | 2 | 3 | 4                       // autopilot level it was given at
  demo?: boolean                             // seeded demo history, not from a session
}

export type EntryKind = 'bit-change' | 'rod-change' | 'downtime' | 'incident' | 'survey' | 'note'
export interface VoiceEntry { at: string; depth: number; kind: EntryKind; minutes?: number; reason?: string; text: string }
export interface LogDraft {
  id: string; rig: string; hole: string; date: string; shift: 'Day' | 'Night'; driller: string
  startDepth: number; endDepth: number; drillHours: number; coreLoss: number
  entries: VoiceEntry[]; status: 'draft' | 'sent' | 'approved'; invoiced?: boolean
}

interface Data { v: 1; events: CopilotEvent[]; drafts: LogDraft[]; seeded: boolean }
const KEY = 'xplorix-copilot-v1'
let data: Data = { v: 1, events: [], drafts: [], seeded: false }
let loaded = false
const subs = new Set<() => void>()

function load() {
  if (loaded || typeof window === 'undefined') return
  loaded = true
  try { const s = localStorage.getItem(KEY); if (s) data = { ...data, ...JSON.parse(s) } } catch { /* private mode: lasts for this visit */ }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)) } catch { /* ignore */ }
  subs.forEach(f => f())
}
const subscribe = (f: () => void) => { subs.add(f); return () => subs.delete(f) }
const snap = () => { load(); return data }
const empty: Data = { v: 1, events: [], drafts: [], seeded: false }

export function useCopilot() {
  const d = useSyncExternalStore(subscribe, snap, () => empty)
  return d
}

export const copilot = {
  add(e: Omit<CopilotEvent, 'id'>) { load(); const ev = { ...e, id: `ce_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}` }; data = { ...data, events: [ev, ...data.events] }; save(); return ev.id },
  update(id: string, p: Partial<CopilotEvent>) { load(); data = { ...data, events: data.events.map(e => e.id === id ? { ...e, ...p } : e) }; save() },
  saveDraft(d: LogDraft) { load(); data = { ...data, drafts: [d, ...data.drafts.filter(x => x.id !== d.id)] }; save() },
  updateDraft(id: string, p: Partial<LogDraft>) { load(); data = { ...data, drafts: data.drafts.map(x => x.id === id ? { ...x, ...p } : x) }; save() },
  reset() { data = { v: 1, events: [], drafts: [], seeded: false }; save() },
  /* Thirty days of demo history across the fleet, made once, the same every time. */
  seed(rigs: { rig: string; hole: string | null }[], drillers: string[], today: string) {
    load()
    if (data.seeded) return
    let x = 20261031
    const rnd = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648 }
    const kinds: [AlertKind, string, number, number][] = [
      ['broken-ahead', 'Broken ground ahead: eased rotation and bit load', 1.2, 0.86],
      ['slow', 'Drilling slower than normal for the ground', 0.5, 0.74],
      ['bit-life', 'Bit near the end of its life: new bit made ready', 0.8, 0.92],
      ['engine-hot', 'Engine running hot: coolant checked at rod change', 3, 0.88],
      ['blocking', 'Water pressure up, flow down: pulled back and flushed', 1.5, 0.83],
      ['survey-due', 'Survey due: reading taken', 0, 0.95],
      ['idle', 'Engine idling on standby: switched off', 0, 0.9],
      ['gps-stop', 'Geology GPS: target passed, hole stopped early', 0, 0.8],
    ]
    const ev: CopilotEvent[] = []
    const base = new Date(`${today}T12:00:00`).getTime()
    for (let day = 30; day >= 1; day--) {
      rigs.forEach((r, ri) => {
        const n = 2 + Math.floor(rnd() * 4)
        for (let i = 0; i < n; i++) {
          const pick = rnd()
          const k = pick < 0.24 ? 0 : pick < 0.42 ? 1 : pick < 0.56 ? 2 : pick < 0.64 ? 3 : pick < 0.78 ? 4 : pick < 0.9 ? 5 : pick < 0.985 ? 6 : 7
          const [kind, title, hours, works] = kinds[k]
          const lvl = (day < 8 && rnd() < 0.35 ? 2 : 1) as 1 | 2
          const followed = rnd() < (lvl === 2 ? 0.9 : 0.78)
          const worked = followed && rnd() < works
          const at = new Date(base - day * 86400000 + (6 + rnd() * 14) * 3600000)
          ev.push({
            id: `seed_${day}_${ri}_${i}`, at: at.toISOString(), rig: r.rig, hole: r.hole ?? '—', depth: Math.round(40 + rnd() * 220),
            driller: drillers[(ri + i) % Math.max(1, drillers.length)] ?? '—', kind, title,
            action: followed ? (lvl === 2 ? 'applied' : 'done') : 'later', outcome: followed ? (worked ? 'worked' : 'failed') : null,
            hoursSaved: worked ? Math.round(hours * (0.6 + rnd() * 0.8) * 10) / 10 : 0,
            metresSaved: worked && kind === 'gps-stop' ? Math.round(18 + rnd() * 30) : 0,
            level: lvl, demo: true,
          })
        }
      })
    }
    data = { ...data, events: [...data.events, ...ev].sort((a, b) => b.at.localeCompare(a.at)), seeded: true }
    save()
  },
}

/* "Worked 8 of 10 times": the record for one kind of advice. */
export function record(events: CopilotEvent[], kind: AlertKind, rig?: string) {
  const xs = events.filter(e => e.kind === kind && (!rig || e.rig === rig) && (e.outcome === 'worked' || e.outcome === 'failed'))
  return { worked: xs.filter(e => e.outcome === 'worked').length, of: xs.length }
}
