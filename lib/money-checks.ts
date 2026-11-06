import {
  isOwnStop, monthOf, versionOn, type ShiftLog, type Invoice, type HoleStatus,
} from './costing-store'
import { addDays, TODAY } from './inventory-store'
import { computeRigMonth, type CostingState, type InvState } from './costing-view'
import { checkShift, type LogCheck } from './log-checks'

/* ==========================================================================
 * MONEY CHECKS — between the rig and the invoice
 *
 * Three places a drilling contractor loses money without seeing it:
 *
 *   Standby   the client stopped the rig, the supervisor logged it, and it
 *             never reached an invoice: the day was not on a hole, the
 *             contract has no standby rate, or nobody wrote down why, so the
 *             client disputes it.
 *   Invoices  an invoice built on shifts that do not add up is the one the
 *             client sends back. Each hole is checked against its own logs
 *             before it goes out.
 *   Fuel      litres an engine hour, each rig against its own normal. What
 *             is burnt beyond that is put in rupees at the fuel price in the
 *             rig's own rates.
 *
 * Every figure comes from the same costing call Finance uses
 * (computeRigMonth), so this screen and Finance cannot disagree.
 * ========================================================================== */

export type StandbyState = 'invoiced' | 'to-invoice' | 'not-on-hole' | 'no-rate'
export const STANDBY_STATE_LABEL: Record<StandbyState, string> = {
  invoiced: 'On an invoice',
  'to-invoice': 'On a hole, not invoiced yet',
  'not-on-hole': 'On no hole, so on no invoice',
  'no-rate': 'No standby rate in the contract',
}

export interface StandbyDay {
  key: string               // rig|date, kept on the invoice that bills it
  project: string
  rig: string
  date: string
  hours: number             // client-side hours stopped that day
  reasons: string
  noted: boolean            // a note says why, so the client can be shown
  earned: number            // what the contract pays for the day
  paid: number              // what we pay a contractor for it, on his rig
  hole: string | null
  holeStatus?: HoleStatus
  state: StandbyState
  invoiceNumber?: string
}

export interface PartStop { project: string; rig: string; date: string; hours: number; reasons: string }

export const standbyKey = (rig: string, date: string) => `${rig}|${date}`

function clientHours(s: ShiftLog) {
  if (s.downtime?.length) return s.downtime.filter(d => d.side === 'client').reduce((a, d) => a + d.hours, 0)
  return isOwnStop(s) ? 0 : s.downtimeHours
}
function clientReasons(shifts: ShiftLog[]) {
  const r = new Set<string>()
  shifts.forEach(s => {
    if (s.downtime?.length) s.downtime.filter(d => d.side === 'client' && d.hours > 0).forEach(d => r.add(d.reason))
    else if (!isOwnStop(s) && s.downtimeHours > 0 && s.downtimeReason) r.add(s.downtimeReason)
  })
  return Array.from(r).join(', ')
}

/* Every rig-month in the record, costed once. */
function rigMonths(state: CostingState, since?: string) {
  const seen = new Set<string>()
  const out: { project: string; rig: string; month: string }[] = []
  state.shiftLogs.forEach(l => {
    if (l.segmentOf || (since && l.date < since)) return
    const k = `${l.project}|${l.rig}|${monthOf(l.date)}`
    if (!seen.has(k)) { seen.add(k); out.push({ project: l.project, rig: l.rig, month: monthOf(l.date) }) }
  })
  return out
}

export function standbyLedger(state: CostingState, inv: InvState, since?: string): { days: StandbyDay[]; partial: PartStop[] } {
  const billedLoose: Record<string, Invoice> = {}
  state.invoices.forEach(i => { if (i.status !== 'cancelled') (i.standbyDays ?? []).forEach(k => { billedLoose[k] = i }) })
  const byId: Record<string, Invoice> = {}
  state.invoices.forEach(i => { byId[i.id] = i })

  const days: StandbyDay[] = []
  const partial: PartStop[] = []
  rigMonths(state, since).forEach(({ project, rig, month }) => {
    const v = computeRigMonth(state, inv, project, rig, month)
    v.days.forEach(d => {
      if (!d.submitted || (since && d.date < since)) return
      const hours = d.shifts.reduce((a, s) => a + clientHours(s), 0)
      if (d.status === 'drilling') {
        if (hours >= 2) partial.push({ project, rig, date: d.date, hours, reasons: clientReasons(d.shifts) })
        return
      }
      if (d.status !== 'standby') return
      const key = standbyKey(rig, d.date)
      const hole = d.holeNumber
      const h = hole ? v.holes.find(x => x.hole.holeNumber === hole)?.hole : undefined
      const loose = billedLoose[key]
      const onHoleInvoice = h?.invoiceId ? byId[h.invoiceId] : undefined
      const st: StandbyState = d.revenue <= 0 ? 'no-rate'
        : loose || onHoleInvoice ? 'invoiced'
        : !hole ? 'not-on-hole' : 'to-invoice'
      days.push({
        key, project, rig, date: d.date, hours, reasons: clientReasons(d.shifts) || d.shifts[0]?.downtimeReason || '',
        noted: d.shifts.some(s => !!s.notes?.trim()), earned: d.revenue, paid: d.subcontract,
        hole, holeStatus: h?.status, state: st, invoiceNumber: (loose ?? onHoleInvoice)?.number,
      })
    })
  })
  days.sort((a, b) => b.date.localeCompare(a.date) || a.rig.localeCompare(b.rig))
  partial.sort((a, b) => b.date.localeCompare(a.date))
  return { days, partial }
}

/* Standby days on no hole and on no invoice yet, for one project: the ones
 * the invoice builder offers to add, so they are billed once and only once. */
export function looseStandby(state: CostingState, inv: InvState, project: string): StandbyDay[] {
  return standbyLedger(state, inv).days.filter(d => d.project === project && d.state === 'not-on-hole')
    .sort((a, b) => a.date.localeCompare(b.date) || a.rig.localeCompare(b.rig))
}

// ── Invoice check ─────────────────────────────────────────────────────────

export interface HoleCheck {
  hole: string
  shifts: number
  stops: { log: ShiftLog; check: LogCheck }[]
  open: { log: ShiftLog; check: LogCheck }[]
  explained: number
  standbyNoNote: number
}

/* Every shift behind a hole, read by the same checks as the drill log form. */
export function checkHole(state: CostingState, hole: string): HoleCheck {
  const logs = state.shiftLogs.filter(l => !l.segmentOf && (l.holeNumber === hole || l.nextHole?.holeNumber === hole))
  const out: HoleCheck = { hole, shifts: logs.length, stops: [], open: [], explained: 0, standbyNoNote: 0 }
  logs.forEach(l => {
    const said = new Set((l.trust?.warnings ?? []).map(w => w.id))
    checkShift(state, l, { contractor: !!l.contractor }).forEach(c => {
      if (c.level === 'stop') out.stops.push({ log: l, check: c })
      else if (said.has(c.id)) out.explained += 1
      else out.open.push({ log: l, check: c })
    })
    if (l.downtimeHours >= 4 && !isOwnStop(l) && !l.notes?.trim()) out.standbyNoNote += 1
  })
  return out
}

// ── Fuel against the engine ───────────────────────────────────────────────

export interface FuelRow {
  rig: string
  shifts: number
  litres: number
  engineHours: number
  perHour: number
  normal: number             // the rig's own median litres an engine hour
  overShifts: { log: ShiftLog; perHour: number; extra: number }[]
  extraLitres: number
  extraMoney: number
}

const median = (xs: number[]) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/* Each own rig against its own median, over the whole record so one bad
 * month cannot set its own normal. A shift counts as over at 30% above it. */
export function fuelCheck(state: CostingState, since: string = addDays(TODAY, -30)): FuelRow[] {
  const byRig: Record<string, ShiftLog[]> = {}
  state.shiftLogs.forEach(l => {
    if (l.segmentOf || l.contractor || !(l.engineHours && l.engineHours > 0) || !(l.fuelLitres > 0)) return
    ;(byRig[l.rig] ||= []).push(l)
  })
  return Object.entries(byRig).map(([rig, all]) => {
    const normal = median(all.map(l => l.fuelLitres / (l.engineHours as number)))
    const recent = all.filter(l => l.date >= since)
    const litres = recent.reduce((s, l) => s + l.fuelLitres, 0)
    const engineHours = recent.reduce((s, l) => s + (l.engineHours as number), 0)
    const overShifts = recent.map(l => {
      const perHour = l.fuelLitres / (l.engineHours as number)
      return { log: l, perHour, extra: l.fuelLitres - normal * (l.engineHours as number) }
    }).filter(x => all.length >= 6 && x.perHour > normal * 1.3 && x.extra > 0)
      .sort((a, b) => b.extra - a.extra)
    const price = (l: ShiftLog) => versionOn(state.operating.filter(o => o.rig === l.rig && o.project === l.project), l.date)?.fuelPricePerLitre ?? 0
    const extraLitres = overShifts.reduce((s, x) => s + x.extra, 0)
    const extraMoney = overShifts.reduce((s, x) => s + x.extra * price(x.log), 0)
    return { rig, shifts: recent.length, litres, engineHours, perHour: engineHours ? litres / engineHours : 0, normal, overShifts, extraLitres, extraMoney }
  }).filter(r => r.shifts > 0).sort((a, b) => b.extraMoney - a.extraMoney || a.rig.localeCompare(b.rig))
}
