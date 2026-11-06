import { isOwnStop, moneyL, money, type ShiftLog } from '../costing-store'
import { addDays, normFormation } from '../inventory-store'
import type { CostingState, InvState } from '../costing-view'
import type { InboxResult } from '../inbox'
import type { Forecast } from '../forecast'
import { COMPANY_NAME } from '../company'

/* ==========================================================================
 * XPLORIX AI — what it reads
 *
 * Everything the AI layer says is worked out from one object: the company's
 * record (shifts, maintenance, invoices, stores), the one task list built
 * from it, and the forecast. Nothing is stored apart from the record, so an
 * answer can always be traced to the shifts, orders or invoices behind it.
 *
 * In this MVP the words are written by XPLORIX's own templates from these
 * figures (the "demo" engine). A live language model plugs in at the same
 * point later: it is handed this same context and the same task, and its
 * answer is shown in the same places. See lib/ai/engine.ts.
 * ========================================================================== */

export interface AiCtx {
  costing: CostingState
  inv: InvState
  inbox: InboxResult
  forecast: Forecast
  today: string
}

export const ctxOf = (costing: CostingState, inv: InvState, inbox: InboxResult, today: string): AiCtx =>
  ({ costing, inv, inbox, forecast: inbox.forecast, today })

/* A link the reader can open to check a sentence. */
export interface Source { label: string; href: string }

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const dw = (d?: string) => d ? `${Number(d.slice(8, 10))} ${MON[Number(d.slice(5, 7)) - 1]}` : ''
export const n0 = (v: number) => Math.round(v).toLocaleString('en-US')
export const n1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString('en-US')
export const pct = (v: number) => `${Math.round(v)}%`
export const plural = (n: number, one: string, many = `${one}s`) => `${n0(n)} ${n === 1 ? one : many}`
export const list = (xs: string[]) => xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000)
export { moneyL, money }
export const company = () => COMPANY_NAME

/* Own shifts, one row a shift (second-hole rows folded away). */
export const shifts = (c: AiCtx, filter: (l: ShiftLog) => boolean = () => true) =>
  c.costing.shiftLogs.filter(l => !l.segmentOf && filter(l))

export const lastDays = (c: AiCtx, days: number) => addDays(c.today, -(days - 1))

export function rigShifts(c: AiCtx, rig: string, days = 30) {
  const since = lastDays(c, days)
  return shifts(c, l => l.rig === rig && l.date >= since && l.date <= c.today)
}

/* Metres by ground, largest first, with each one's share. */
export function groundMix(logs: ShiftLog[]) {
  const m: Record<string, number> = {}
  logs.forEach(l => { if (l.metresDrilled > 0) { const g = normFormation(l.formationType); m[g] = (m[g] ?? 0) + l.metresDrilled } })
  const total = Object.values(m).reduce((s, x) => s + x, 0)
  return Object.entries(m).map(([g, metres]) => ({ g, metres, share: total ? metres / total : 0 })).sort((a, b) => b.metres - a.metres)
}
export const hardShare = (logs: ShiftLog[]) => groundMix(logs).filter(x => x.g === 'Hard' || x.g === 'Very Hard').reduce((s, x) => s + x.share, 0)

/* Stopped hours by reason. `side` picks own stops, client standby, or both. */
export function stops(logs: ShiftLog[], side: 'own' | 'client' | 'all' = 'all') {
  const m: Record<string, number> = {}
  logs.forEach(l => {
    if (l.downtime?.length) {
      l.downtime.forEach(d => {
        if (side === 'own' && d.side !== 'internal') return
        if (side === 'client' && d.side !== 'client') return
        m[d.reason] = (m[d.reason] ?? 0) + d.hours
      })
    } else if (l.downtimeHours > 0) {
      const own = isOwnStop(l)
      if ((side === 'own' && !own) || (side === 'client' && own)) return
      m[l.downtimeReason || 'Not given'] = (m[l.downtimeReason || 'Not given'] ?? 0) + l.downtimeHours
    }
  })
  return Object.entries(m).map(([reason, hours]) => ({ reason, hours })).sort((a, b) => b.hours - a.hours)
}

/* How a rig drilled over a set of shifts. */
export function pace(logs: ShiftLog[]) {
  const metres = logs.reduce((s, l) => s + l.metresDrilled, 0)
  const drill = logs.reduce((s, l) => s + l.drillingHours, 0)
  const shiftH = logs.reduce((s, l) => s + l.shiftHours, 0)
  const days = new Set(logs.map(l => l.date)).size
  const core = logs.reduce((s, l) => s + l.coreRecovery, 0)
  const fuel = logs.reduce((s, l) => s + l.fuelLitres, 0)
  const own = stops(logs, 'own').reduce((s, x) => s + x.hours, 0)
  const client = stops(logs, 'client').reduce((s, x) => s + x.hours, 0)
  return {
    metres, drill, shiftH, days, shifts: logs.length,
    rop: drill ? metres / drill : 0,
    perDay: days ? metres / days : 0,
    onBottom: shiftH ? drill / shiftH : 0,
    recovery: metres ? (core / metres) * 100 : 0,
    fuelPerMetre: metres ? fuel / metres : 0,
    own, client,
  }
}

/* Speed in one ground on one rig: metres per bit-hour. */
export function ropIn(logs: ShiftLog[], ground: string) {
  const g = logs.filter(l => normFormation(l.formationType) === ground && l.drillingHours > 0)
  const m = g.reduce((s, l) => s + l.metresDrilled, 0), h = g.reduce((s, l) => s + l.drillingHours, 0)
  return h >= 6 ? m / h : null
}

export const RIG_RE = /\b((?:RIG|CP|CQ|CR|CN)-\d{2,3})\b/gi
export const HOLE_RE = /\b(DH-\d{2,4})\b/gi
export const rigsIn = (t: string) => Array.from(new Set((t.match(RIG_RE) ?? []).map(s => s.toUpperCase())))
export const holesIn = (t: string) => Array.from(new Set((t.match(HOLE_RE) ?? []).map(s => s.toUpperCase())))

/* What a stopped day costs a rig: the metres it would have made at the rate
 * the contract pays for them. From the forecast's own figures. */
export function dayLoss(c: AiCtx, rig: string) {
  const r = c.forecast.rigs.find(x => x.rig === rig)
  if (!r || !r.perDay) return null
  const rate = r.rest.ratePerMetre || r.next.ratePerMetre || c.forecast.rest.ratePerMetre
  return rate ? { metres: r.perDay, money: r.perDay * rate } : null
}

export const supervisorOf = (c: AiCtx, rig: string) =>
  shifts(c, l => l.rig === rig && !!l.supervisor).sort((a, b) => b.date.localeCompare(a.date))[0]?.supervisor
