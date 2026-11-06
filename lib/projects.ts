'use client'

import {
  ANY_FORMATION, money, versionOn, newestFirst,
  type useCosting, type ClientRate, type HoleStatus, type ProjectRecord, type ProjectEvent, type RateProposal,
} from './costing-store'
import { holesFromLogs } from './client-record'
import { TODAY } from './inventory-store'

/* ==========================================================================
 * PROJECTS — what both sides read
 *
 * The contractor's Projects screen and the client's Projects screen are two
 * views of the same record. These selectors are shared by both, so "12 holes,
 * 4 planned" or "HQ hard rock SAR 11,200" cannot differ between them.
 *
 * Nothing here reads a cost. A project, as shared, is the contract: where,
 * for whom, at what rates, which holes, and who is on site.
 * ========================================================================== */

type State = ReturnType<typeof useCosting>['state']

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function day(date?: string) {
  if (!date) return '—'
  const [y, m, d] = date.slice(0, 10).split('-').map(Number)
  return `${d} ${MON[m - 1]} ${y}`
}
/* "12 Sep, 11:15" — and just the time if it happened today. */
export function when(at: string) {
  const [date, time] = at.split('T')
  if (date === TODAY) return `Today, ${time ?? ''}`.replace(/, $/, '')
  const [, m, d] = date.split('-').map(Number)
  return `${d} ${MON[m - 1]}${time ? `, ${time}` : ''}`
}

/* The same, for the middle of a sentence. */
export function whenIn(at: string) { return when(at).replace(/^Today/, 'today') }

// ── holes ─────────────────────────────────────────────────────────────────

export type PlanStatus = 'planned' | HoleStatus
export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  planned: 'Planned', drilling: 'Drilling', closed: 'Closed', submitted: 'With client',
  approved: 'Approved', invoiced: 'Invoiced',
}
export interface ProjectHole {
  id: string
  planned?: number
  drilled: number
  status: PlanStatus
  rig?: string
  start?: string; end?: string
  holeSize?: string
  note?: string
  by: 'contractor' | 'owner'
  recoveryPct?: number
}

/* Every hole on a project: the ones the rigs have touched, from the shift
 * logs, and the ones still only on the plan. */
export function projectHoles(state: State, project: string): ProjectHole[] {
  const plans = state.holePlans ?? {}
  const drilled = holesFromLogs(state).filter(h => h.project === project)
  const seen = new Set(drilled.map(h => h.id))
  const out: ProjectHole[] = drilled.map(h => ({
    id: h.id, planned: h.planned, drilled: h.drilled, status: h.status, rig: h.rig, start: h.start, end: h.end,
    holeSize: plans[h.id]?.holeSize, note: plans[h.id]?.note, by: plans[h.id]?.by ?? 'contractor', recoveryPct: h.recoveryPct,
  }))
  Object.entries(plans).forEach(([id, p]) => {
    if (p.project !== project || seen.has(id)) return
    out.push({ id, planned: p.plannedDepth, drilled: 0, status: 'planned', holeSize: p.holeSize, note: p.note, by: p.by ?? 'contractor' })
  })
  const rank: Record<PlanStatus, number> = { drilling: 0, planned: 1, closed: 2, submitted: 3, approved: 4, invoiced: 5 }
  return out.sort((a, b) => rank[a.status] - rank[b.status] || a.id.localeCompare(b.id, undefined, { numeric: true }))
}

/* The next hole number in the project's own style: DH-015 after DH-014. A
 * project with no holes yet starts its own series from `start`. The number is
 * moved on until it is one no project has used, because a hole number is
 * unique across the company. */
export function nextHoleId(taken: string[], after: string[] = [], mine: string[] = [], start = 'DH-001'): string {
  const used = new Set([...taken, ...after].map(x => x.toUpperCase()))
  const own = [...mine, ...after].map(id => id.match(/^(.*?)(\d+)$/)).filter(Boolean) as RegExpMatchArray[]
  let prefix: string, n: number, width: number
  if (own.length) {
    const counts: Record<string, number> = {}
    own.forEach(m => { counts[m[1]] = (counts[m[1]] ?? 0) + 1 })
    prefix = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
    const same = own.filter(m => m[1] === prefix)
    width = Math.max(...same.map(m => m[2].length))
    n = Math.max(...same.map(m => Number(m[2]))) + 1
  } else {
    const m = start.match(/^(.*?)(\d+)$/)
    prefix = m ? m[1] : 'DH-'; width = m ? m[2].length : 3; n = m ? Number(m[2]) : 1
  }
  let id = `${prefix}${String(n).padStart(width, '0')}`
  while (used.has(id.toUpperCase())) { n += 1; id = `${prefix}${String(n).padStart(width, '0')}` }
  return id
}
/* Where a new project's holes start: project 4 starts at DH-401. */
export function holeSeriesStart(code: string) {
  const n = Number(code.match(/(\d+)$/)?.[1] ?? 0)
  return `DH-${String(n * 100 + 1).padStart(3, '0')}`
}

export interface ProjectStats {
  holes: ProjectHole[]
  drilled: number
  plannedOnHoles: number
  toGo: number
  counts: { planned: number; drilling: number; done: number }
  target: number
}
export function projectStats(state: State, p: ProjectRecord): ProjectStats {
  const holes = projectHoles(state, p.name)
  const drilled = holes.reduce((s, h) => s + h.drilled, 0)
  const plannedOnHoles = holes.reduce((s, h) => s + Math.max(h.planned ?? h.drilled, h.drilled), 0)
  const open = holes.filter(h => h.status === 'planned' || h.status === 'drilling')
  return {
    holes, drilled, plannedOnHoles,
    toGo: open.reduce((s, h) => s + Math.max(0, (h.planned ?? h.drilled) - h.drilled), 0),
    counts: {
      planned: holes.filter(h => h.status === 'planned').length,
      drilling: holes.filter(h => h.status === 'drilling').length,
      done: holes.filter(h => h.status !== 'planned' && h.status !== 'drilling').length,
    },
    target: Math.max(p.plannedMetres ?? 0, plannedOnHoles),
  }
}

// ── contract rates ────────────────────────────────────────────────────────

export interface RateLine { key: string; label: string; unit: string; rate: number; note?: string }

/* A set of rates as the lines a contract schedule would print. */
export function rateLines(cr: ClientRate | undefined): RateLine[] {
  if (!cr) return []
  const flat = cr.structure !== 'slab'
  const rows: RateLine[] = cr.rateRows.map(r => {
    const band = `${r.fromDepth ?? 0}${r.toDepth != null ? `–${r.toDepth} m` : ' m and deeper'}`
    const what = flat ? (r.formation === ANY_FORMATION ? 'any ground' : r.formation) : band
    return {
      key: flat ? `${r.holeSize}|${r.formation}` : `${r.holeSize}|${r.fromDepth ?? 0}`,
      label: `${r.holeSize} · ${what}`, unit: 'a metre', rate: r.rate,
      note: r.adjustments.length
        ? r.adjustments.map(a => `${a.adjustPct > 0 ? '+' : ''}${a.adjustPct}% ${a.condition} ${a.depth} m`).join(', ')
        : undefined,
    }
  })
  return [
    ...rows,
    { key: 'standby', label: 'Standby', unit: 'a day', rate: cr.standbyPerDay },
    { key: 'mob', label: 'Mobilisation', unit: 'once', rate: cr.mobilisation },
    { key: 'demob', label: 'Demobilisation', unit: 'once', rate: cr.demobilisation },
  ]
}
export function structureWords(cr: ClientRate | undefined) {
  if (!cr) return 'No rates set'
  return cr.structure === 'slab' ? 'Priced by depth' : 'Priced by ground'
}

export interface RateChange { key: string; label: string; unit: string; from: number | null; to: number | null }
/* Old against new, line by line. A line on only one side is one that was added
 * or taken out. */
export function rateChanges(before: ClientRate | undefined, after: ClientRate): RateChange[] {
  const a = rateLines(before), b = rateLines(after)
  const keys = Array.from(new Set([...a.map(l => l.key), ...b.map(l => l.key)]))
  return keys.map(key => {
    const x = a.find(l => l.key === key), y = b.find(l => l.key === key)
    return { key, label: (y ?? x)!.label, unit: (y ?? x)!.unit, from: x ? x.rate : null, to: y ? y.rate : null }
  })
}
export function changeWords(c: RateChange) {
  if (c.from == null) return `added at ${money(c.to ?? 0)}`
  if (c.to == null) return 'removed'
  if (c.from === c.to) return 'no change'
  const pct = c.from ? ((c.to - c.from) / c.from) * 100 : 0
  return `${money(c.from)} → ${money(c.to)} (${pct > 0 ? '+' : ''}${pct.toFixed(1)}%)`
}

/* The rates in force today, the ones agreed to start later, and everything
 * that came before. */
export function contractOf(state: State, project: string) {
  const versions = newestFirst(state.clientRates.filter(c => c.project === project))
  const current = versionOn(state.clientRates.filter(c => c.project === project), TODAY)
  const upcoming = versions.filter(v => v.effectiveFrom > TODAY).reverse()
  const proposals = state.rateProposals ?? []
  const waiting = proposals.find(r => r.project === project && r.status === 'waiting')
  const returned = [...proposals].reverse().find(r => r.project === project && r.status === 'returned')
  const lastAnswer = [...proposals].reverse().find(r => r.project === project && (r.status === 'accepted' || r.status === 'returned'))
  return {
    versions, current, upcoming, waiting,
    // A returned proposal matters only until the contractor answers it with a new one.
    returned: returned && !waiting && lastAnswer?.id === returned.id ? returned : undefined,
  }
}

// ── changes and notifications ─────────────────────────────────────────────

export function eventsFor(state: State, project: string): ProjectEvent[] {
  return (state.projectEvents ?? []).filter(e => e.project === project).sort((a, b) => b.at.localeCompare(a.at))
}

/* What the client has not looked at yet, across the projects shared with him. */
export function ownerInbox(state: State, client?: string) {
  const shared = (state.projects ?? []).filter(p => p.shared && (!client || p.client.toLowerCase() === client.toLowerCase()))
  const names = new Set(shared.map(p => p.name))
  const unseen = (state.projectEvents ?? []).filter(e => names.has(e.project) && !e.seenByOwner && e.by === 'contractor')
  const waiting = (state.rateProposals ?? []).filter(r => names.has(r.project) && r.status === 'waiting')
  return { shared, unseen, waiting, count: waiting.length + unseen.filter(e => e.kind !== 'rates').length }
}

/* What the contractor has not looked at yet: things the client did. */
export function contractorInbox(state: State) {
  const unseen = (state.projectEvents ?? []).filter(e => e.by === 'owner' && !e.seenByContractor)
  const returned = (state.projects ?? []).map(p => contractOf(state, p.name).returned).filter(Boolean) as RateProposal[]
  return { unseen, returned, count: unseen.length }
}

export function projectByName(state: State, name: string) { return (state.projects ?? []).find(p => p.name === name) }
export function projectById(state: State, id: string) { return (state.projects ?? []).find(p => p.id === id) }

/* PRJ-004 after PRJ-003. */
export function nextProjectCode(projects: ProjectRecord[]) {
  const n = Math.max(0, ...projects.map(p => Number(p.code.match(/(\d+)$/)?.[1] ?? 0))) + 1
  return `PRJ-${String(n).padStart(3, '0')}`
}
