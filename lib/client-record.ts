import { TODAY } from './inventory-store'
import {
  chargeShift, versionOn, isOwnStop, shiftOrder, money, perUnit,
  type ShiftLog, type HoleStatus, type Invoice, type LineReview, type ClientRate,
} from './costing-store'

/* ==========================================================================
 * THE HOLE AND INVOICE RECORD — one record, read from both sides
 *
 * Every hole is built from the shift logs and the client rate in force on
 * each day. The company's own Dashboard, Finance and forecast read it, and
 * the client login reads the same thing for the projects shown to him, so
 * the two sides cannot be looking at different numbers.
 *
 * One privacy rule runs through every selector here: only what the client
 * pays for and what happened on the rig is carried. Fuel, crew cost, parts,
 * stock, the cost of running a rig, what a sub-contractor is paid and margin
 * are never read in this file.
 * ========================================================================== */

export type Side = 'contractor' | 'client'
export interface Stoppage { reason: string; hours: number; side: Side }

/* One shift on a hole. Deliberately no fuel, water, additives, parts or crew
 * cost: those stay with the company that drilled it. */
export interface HoleShift {
  id: string
  date: string; shift: 'Day' | 'Night'
  rig: string; hole: string | null
  from: number; to: number; metres: number; recoveryPct: number | null
  drilling: number; trips: number; standby: number; breakdown: number
  crew: number
  formation?: string; lithology?: string
  supervisor?: string; driller?: string
  stoppages: Stoppage[]
}

// ── INVOICES ──────────────────────────────────────────────────────────────

/* What the shift record says against what the line claims. Present on every
 * line that can be checked; a line with no check (mobilisation) is a contract
 * lump sum with nothing on the rig to compare it to. */
export interface LineCheck { claimed: number; verified: number; unit: 'm' | 'days'; note: string }
export interface PortalLine {
  label: string; depth?: string; qty: string; rate: string; amount: number
  hole?: string; check?: LineCheck
}
export interface PortalInvoice {
  id: string; number: string; project: string
  date: string; due?: string; holes: string[]
  lines: PortalLine[]; subtotal: number; taxPercent: number; total: number
  reviews: (LineReview | null)[]
  sentAt?: string; reviewedAt?: string
  paid: boolean; paidDate?: string
}

/* The amount a line is supported for: what the shift record says, at the
 * line's own rate. A line with no check is taken at face value. */
export function verifiedAmount(l: PortalLine) {
  if (!l.check) return l.amount
  if (l.check.claimed === 0) return 0
  return (l.amount / l.check.claimed) * l.check.verified
}
export type InvoiceState = 'to-verify' | 'disputed' | 'approved' | 'paid'
export function invoiceState(i: PortalInvoice): InvoiceState {
  if (i.paid) return 'paid'
  if (i.reviews.some(r => !r)) return 'to-verify'
  return i.reviews.some(r => r?.status === 'disputed') ? 'disputed' : 'approved'
}
export const INVOICE_STATE_LABEL: Record<InvoiceState, string> = {
  'to-verify': 'To check', disputed: 'Part disputed', approved: 'Approved', paid: 'Paid',
}
/* What a dispute on a line is worth. Where the shift record supports part of
 * the line, only the unsupported part is in dispute and the rest is still
 * payable. A line with no record to compare against is disputed in full. */
export function disputedLineValue(l: PortalLine) {
  if (l.check && l.check.claimed > 0 && l.check.claimed !== l.check.verified) {
    const supported = (l.amount / l.check.claimed) * Math.min(l.check.claimed, l.check.verified)
    return Math.max(0, l.amount - supported)
  }
  return l.amount
}
export function disputedValue(i: PortalInvoice) {
  return i.lines.reduce((s, l, k) => s + (i.reviews[k]?.status === 'disputed' ? disputedLineValue(l) : 0), 0)
}
/* What the client owes on an invoice: everything he has not disputed, plus tax. */
export function payable(i: PortalInvoice) {
  return (i.subtotal - disputedValue(i)) * (1 + i.taxPercent / 100)
}
export function isInvoiceOverdue(i: PortalInvoice) {
  return !i.paid && !!i.due && i.due < TODAY && invoiceState(i) !== 'to-verify'
}

/* Money on a set of invoices, all before tax so it compares with a budget.
 *   raised     everything that has been invoiced
 *   approved   lines the client has accepted
 *   disputed   lines the client has refused
 *   waiting    lines not looked at yet
 *   paid       accepted lines on invoices that have been paid
 *   overdue    accepted lines on unpaid invoices past their due date */
export function spendSummary(list: PortalInvoice[]) {
  const z = { raised: 0, approved: 0, disputed: 0, waiting: 0, paid: 0, overdue: 0, metresPaid: 0 }
  list.forEach(i => {
    const late = isInvoiceOverdue(i)
    i.lines.forEach((l, k) => {
      const r = i.reviews[k]
      z.raised += l.amount
      if (!r) { z.waiting += l.amount; return }
      const out = r.status === 'disputed' ? disputedLineValue(l) : 0
      const ok = l.amount - out
      z.disputed += out
      z.approved += ok
      if (i.paid) {
        z.paid += ok
        if (l.check?.unit === 'm') z.metresPaid += r.status === 'disputed' ? Math.min(l.check.claimed, l.check.verified) : l.check.claimed
      } else if (late) z.overdue += ok
    })
  })
  return z
}

/* ==========================================================================
 * BUILT FROM THE SHIFT LOGS
 * ========================================================================== */

export interface CostingStateLike {
  shiftLogs: ShiftLog[]
  clientRates: ClientRate[]
  holeStatus: Record<string, { status: HoleStatus; invoiceId?: string; submittedAt?: string; decidedAt?: string; returnReason?: string }>
  invoices: Invoice[]
  holePlans: Record<string, { plannedDepth: number; project?: string }>
}

export interface LiveHole {
  id: string; project: string; rig: string
  planned?: number; drilled: number; recoveryPct: number
  days: number; drillingDays: number; standbyDays: number; breakdownDays: number
  start: string; end?: string
  status: HoleStatus; submittedAt?: string; decidedAt?: string; returnReason?: string; invoiceId?: string
  shifts: HoleShift[]
  billing: { label: string; metres: number; rate: number; amount: number }[]
  standbyAmount: number
  value: number
}

/* Every hole, built from the shift logs and the client rate in force on each
 * day: the same inputs Finance uses, so the value here is the value on the
 * invoice. The client login filters this to the projects shown to that client. */
export function holesFromLogs(state: CostingStateLike): LiveHole[] {
  const byHole: Record<string, ShiftLog[]> = {}
  state.shiftLogs.forEach(l => { if (l.holeNumber) (byHole[l.holeNumber] ||= []).push(l) })
  return Object.entries(byHole).map(([id, raw]) => {
    const logs = [...raw].sort((a, b) => shiftOrder(a).localeCompare(shiftOrder(b)))
    const project = logs[0].project
    const rates = state.clientRates.filter(c => c.project === project)
    let depth = 0
    const lines: Record<string, { label: string; metres: number; rate: number; amount: number; from: number; to: number; slab: boolean }> = {}
    const shifts: HoleShift[] = logs.map(l => {
      const from = depth
      const cr = versionOn(rates, l.date)
      if (l.metresDrilled > 0) {
        chargeShift(cr, l, depth).forEach(c => {
          // By depth: one line per band, whatever the ground. By ground: one per ground.
          const slab = cr?.structure === 'slab'
          const k = slab ? `${c.holeSize}|${Math.round(c.rate)}|${c.matched}` : `${c.holeSize}|${c.formation}|${Math.round(c.rate)}`
          const e = (lines[k] ||= { label: `${c.holeSize} · ${c.formation}`, metres: 0, rate: c.rate, amount: 0, from: c.fromDepth, to: c.toDepth, slab })
          e.metres += c.metres; e.amount += c.amount
          e.from = Math.min(e.from, c.fromDepth); e.to = Math.max(e.to, c.toDepth)
        })
        depth += l.metresDrilled
      }
      const stoppages: Stoppage[] = l.downtime?.length
        ? l.downtime.map(x => ({ reason: x.reason, hours: x.hours, side: x.side === 'client' ? 'client' as Side : 'contractor' as Side }))
        : l.downtimeHours > 0 ? [{ reason: l.downtimeReason || 'Not stated', hours: l.downtimeHours, side: isOwnStop(l) ? 'contractor' as Side : 'client' as Side }] : []
      const lost = stoppages.reduce((a, x) => a + x.hours, 0)
      const breakdown = stoppages.filter(x => x.side === 'contractor').reduce((a, x) => a + x.hours, 0)
      return {
        id: l.id, date: l.date, shift: l.shift, rig: l.rig, hole: id,
        from, to: depth, metres: l.metresDrilled,
        recoveryPct: l.metresDrilled > 0 ? Math.round((l.coreRecovery / l.metresDrilled) * 100) : null,
        drilling: l.drillingHours, trips: Math.max(0, l.shiftHours - l.drillingHours - lost),
        standby: lost - breakdown, breakdown,
        crew: l.crewCount, formation: l.formationType, lithology: l.lithology, supervisor: l.supervisor, driller: l.driller,
        stoppages,
      }
    })
    const dates = Array.from(new Set(logs.map(l => l.date)))
    const dayKind = (d: string) => {
      const s = logs.filter(l => l.date === d)
      // A second hole opened in the same shift carries metres and no hours of its own.
      if (s.some(x => x.drillingHours > 0 || x.metresDrilled > 0)) return 'drilling'
      return s.some(x => isOwnStop(x)) ? 'breakdown' : 'standby'
    }
    const standbyDays = dates.filter(d => dayKind(d) === 'standby')
    const standbyAmount = standbyDays.reduce((s, d) => s + (versionOn(rates, d)?.standbyPerDay ?? 0), 0)
    const closing = logs.find(l => l.holeClosedThisShift)
    const st = state.holeStatus[id]
    const status: HoleStatus = st?.status && st.status !== 'drilling' ? st.status : closing ? 'closed' : 'drilling'
    const drilled = depth
    const core = logs.reduce((s, l) => s + l.coreRecovery, 0)
    const billing = Object.values(lines).sort((a, b) => a.from - b.from).map(({ label, metres, rate, amount, from, to, slab }) => ({
      label: slab ? `${label.split(' · ')[0]} · ${+from.toFixed(1)}–${+to.toFixed(1)} m` : label, metres, rate, amount,
    }))
    return {
      id, project, rig: logs[0].rig,
      planned: state.holePlans?.[id]?.plannedDepth, drilled,
      recoveryPct: drilled > 0 ? (core / drilled) * 100 : 0,
      days: dates.length,
      drillingDays: dates.filter(d => dayKind(d) === 'drilling').length,
      standbyDays: standbyDays.length,
      breakdownDays: dates.filter(d => dayKind(d) === 'breakdown').length,
      start: logs[0].date, end: closing?.date,
      status, submittedAt: st?.submittedAt, decidedAt: st?.decidedAt, returnReason: st?.returnReason, invoiceId: st?.invoiceId,
      shifts, billing, standbyAmount,
      value: billing.reduce((s, b) => s + b.amount, 0) + standbyAmount,
    }
  }).sort((a, b) => b.start.localeCompare(a.start))
}

/* An invoice sent to the client from Finance, as the client reads it. Each
 * metres line is checked against the hole's shift record; because the invoice
 * was built from that same record, a line can only fail the check if the
 * record changed after the invoice was sent. */
export function liveInvoices(state: CostingStateLike, holes: LiveHole[]): PortalInvoice[] {
  return state.invoices
    .filter(i => i.ownerStatus && i.status !== 'cancelled' && i.status !== 'draft')
    .map(i => ({
      id: i.id, number: i.number, project: i.project,
      date: i.date, due: i.dueDate, holes: i.holeNumbers,
      lines: i.lines.map(l => {
        const [holeId, ...rest] = l.label.split(' · ')
        const hole = holes.find(h => h.id === holeId)
        const claimed = parseFloat(l.qty)
        let check: LineCheck | undefined
        if (hole && rest[0] === 'standby') {
          check = { claimed, verified: hole.standbyDays, unit: 'days', note: claimed === hole.standbyDays ? 'Matches the shift record' : `Shift record shows ${hole.standbyDays} standby days` }
        } else if (hole) {
          const match = hole.billing.find(b => b.label === rest.join(' · '))
          const verified = match ? +match.metres.toFixed(1) : 0
          check = { claimed, verified, unit: 'm', note: claimed === verified ? 'Matches the shift record' : `Shift record shows ${verified} m` }
        }
        return { label: l.label, depth: l.depth, qty: l.qty, rate: l.rate, amount: l.amount, hole: hole?.id, check }
      }),
      subtotal: i.subtotal, taxPercent: i.taxPercent, total: i.total,
      reviews: i.lines.map((_, k) => i.lineReviews?.[k] ?? null),
      sentAt: i.sentAt, reviewedAt: i.reviewedAt,
      paid: i.status === 'paid', paidDate: i.paidDate,
    }))
}

/* ==========================================================================
 * DEMO INVOICES
 *
 * Three invoices on the shared demo project, so Finance and the client login
 * both have something to read on first load: one paid, one approved and past
 * its due date, one waiting for the client's check. Every line is built from
 * the seeded shift record at the seeded rates, so the figures are real
 * arithmetic and each line agrees with the record it is checked against.
 * ========================================================================== */

interface SeedSpec { number: string; holes: string[]; date: string; due: string; state: 'paid' | 'approved' | 'awaiting'; paidDate?: string; mobilisation?: boolean }
const SEED_SPECS: SeedSpec[] = [
  { number: 'INV-0001', holes: ['DH-901', 'DH-911', 'DH-902'], date: '2026-08-23', due: '2026-09-22', state: 'paid', paidDate: '2026-09-29', mobilisation: true },
  { number: 'INV-0002', holes: ['DH-951', 'DH-961', 'DH-952'], date: '2026-09-23', due: '2026-10-23', state: 'approved' },
  { number: 'INV-0003', holes: ['DH-001', 'DH-011'], date: '2026-10-28', due: '2026-11-27', state: 'awaiting' },
]

export function seedInvoices(state: CostingStateLike, project: string, client: string) {
  const holes = holesFromLogs(state).filter(h => h.project === project)
  const invoices: Invoice[] = []
  const holeStatus: Record<string, { status: HoleStatus; invoiceId?: string }> = {}
  SEED_SPECS.forEach((spec, n) => {
    const mine = spec.holes.map(id => holes.find(h => h.id === id)).filter((h): h is LiveHole => !!h && h.status !== 'drilling')
    if (mine.length === 0) return
    const lines: Invoice['lines'] = []
    mine.forEach(h => {
      h.billing.forEach(b => lines.push({ label: `${h.id} · ${b.label}`, qty: `${+b.metres.toFixed(1)} m`, rate: perUnit(b.rate), amount: b.amount }))
      if (h.standbyDays > 0) lines.push({ label: `${h.id} · standby`, qty: `${h.standbyDays} days`, rate: money(h.standbyAmount / h.standbyDays), amount: h.standbyAmount })
    })
    const cr = versionOn(state.clientRates.filter(c => c.project === project), spec.date)
    if (spec.mobilisation && cr?.mobilisation) lines.push({ label: 'Mobilisation', qty: '1', rate: money(cr.mobilisation), amount: cr.mobilisation })
    const subtotal = lines.reduce((s, l) => s + l.amount, 0)
    const total = subtotal * 1.15
    const id = `inv_seed_${n + 1}`
    invoices.push({
      id, number: spec.number, project, client, date: spec.date, holeNumbers: mine.map(h => h.id),
      lines, subtotal, taxPercent: 15, total,
      status: spec.state === 'paid' ? 'paid' : 'pending', dueDate: spec.due,
      paidDate: spec.paidDate, paidAmount: spec.state === 'paid' ? total : undefined,
      ownerStatus: spec.state === 'awaiting' ? 'awaiting' : 'approved',
      lineReviews: lines.map(() => spec.state === 'awaiting' ? null : { status: 'approved' as const }),
      sentAt: spec.date, reviewedAt: spec.state === 'awaiting' ? undefined : spec.date,
    })
    mine.forEach(h => { holeStatus[h.id] = { status: 'invoiced', invoiceId: id } })
  })
  return { invoices, holeStatus }
}

// ── SMALL FORMATTERS ──────────────────────────────────────────────────────

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function shortDate(date?: string) {
  if (!date) return '—'
  const [, m, d] = date.split('-').map(Number)
  return `${d} ${MON[m - 1]}`
}
export function num(n: number, digits = 0) {
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
export function daysBetween(a: string, b: string) {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000)
}

/* Turns rows into a CSV download. Used by every table's Export button. */
export function downloadCsv(name: string, rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const blob = new Blob(['﻿' + rows.map(r => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${name}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}
