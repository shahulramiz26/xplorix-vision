import { monthOf, isOwnStop, type Invoice, type FindingStatus } from './costing-store'
import { TODAY, addDays } from './inventory-store'
import { computeRigMonth, type CostingState, type InvState } from './costing-view'
import { standbyLedger } from './money-checks'
import { auditRecord } from './log-checks'
import { holesFromLogs } from './client-record'
import { contractorName, billFigures } from './contracting'
import { monthNumbers } from './admin-overview'
import type { InboxResult } from './inbox'

/* ==========================================================================
 * VALUE — what XPLORIX has been worth, from the record
 *
 * A customer believes a number only if he can open the thing behind it. So
 * every figure here is one of four kinds, never mixed:
 *
 *   proven     money the record shows: standby billed on an invoice that
 *              was paid, a contractor's bill approved at the checked record
 *              instead of his claim, a part moved from another store instead
 *              of bought. Each line names the invoice, bill or transfer.
 *   cash       money that was the company's anyway, collected sooner: an
 *              overdue invoice paid after XPLORIX raised it.
 *   estimate   a loss that did not happen: a rig that did not stop for a
 *              part XPLORIX said would run out. Valued at that rig's own
 *              cost of a stopped day, with the working shown.
 *   pending    acted on, the result not in the record yet (an invoice sent,
 *              not paid).
 *
 * And, kept beside them so the page is honest: what was found and is still
 * open, and what was set aside, with the reason given.
 *
 * Before and after compares the company's first month on XPLORIX with the
 * month chosen, on the same measures, from the same record.
 * ========================================================================== */

export type ValueKind = 'proven' | 'cash' | 'estimate' | 'pending' | 'open' | 'waiting' | 'setaside'
export interface ValueLine {
  id: string
  kind: ValueKind
  dept: string
  what: string             // what XPLORIX found
  found?: string           // YYYY-MM-DD
  who?: string
  proof: string            // what the record shows
  money: number
  date: string             // when the money was proven or the line stood
  href?: string
  method?: string          // how an estimate was worked out
}

export interface Trend {
  key: string
  label: string
  before: number | null
  after: number | null
  beforeMonth?: string
  afterMonth?: string
  fmt: (n: number) => string
  goodWhenUp: boolean
  note?: string
}

export interface ValueReport {
  from: string
  to: string
  lines: ValueLine[]
  totals: Record<ValueKind, number>
  counts: Record<ValueKind, number>
  trends: Trend[]
  firstMonth: string
  lastMonth: string
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const day = (d?: string) => d ? `${Number(d.slice(8, 10))} ${MON[Number(d.slice(5, 7)) - 1]}` : ''
const money = (n: number) => `SAR ${Math.round(n).toLocaleString('en-US')}`

/* What one of the company's own rigs costs on a day it does not drill:
 * crew, ownership and the rest of the day, from the record. */
function stoppedDayCost(costing: CostingState, inv: InvState, rig?: string): number {
  const months = new Set<string>()
  costing.shiftLogs.forEach(l => { if (!l.contractor && (!rig || l.rig === rig)) months.add(`${l.project}|${l.rig}|${monthOf(l.date)}`) })
  const totals: number[] = []
  months.forEach(k => {
    const [project, r, m] = k.split('|')
    computeRigMonth(costing, inv, project, r, m).days.forEach(d => { if (d.submitted && d.units <= 0) totals.push(d.total) })
  })
  if (!totals.length) return 0
  const s = [...totals].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

export function buildValue(costing: CostingState, inv: InvState, inbox: InboxResult | null, from: string, to: string = TODAY): ValueReport {
  const lines: ValueLine[] = []
  const inPeriod = (d?: string) => !!d && d >= from && d <= to
  const invById: Record<string, Invoice> = {}
  costing.invoices.forEach(i => { invById[i.id] = i })

  // ── proven: standby XPLORIX found on no hole, billed on an invoice ──────
  const ledger = standbyLedger(costing, inv)
  const earned: Record<string, number> = {}
  ledger.days.forEach(d => { earned[d.key] = d.earned })
  costing.invoices.filter(i => i.status !== 'cancelled' && (i.standbyDays ?? []).length).forEach(i => {
    const amount = (i.standbyDays ?? []).reduce((s, k) => s + (earned[k] ?? 0), 0)
    const paid = i.status === 'paid'
    const date = paid ? (i.paidDate ?? i.date) : i.date
    if (!inPeriod(date) || amount <= 0) return
    lines.push({
      id: `standby:${i.id}`, kind: paid ? 'proven' : 'pending', dept: 'Billing and client',
      what: `Client standby on ${i.project} was on no hole, so on no invoice`,
      proof: `${(i.standbyDays ?? []).length} days on ${i.number}${paid ? `, paid ${day(i.paidDate)}` : `, sent ${day(i.date)}, not paid yet`}`,
      money: amount, date, href: '/admin/finance', who: 'Billing',
    })
  })

  // ── proven: contractor bills approved at the checked record ─────────────
  ;(costing.contractorBills ?? []).filter(b => (b.status === 'approved' || b.status === 'paid') && b.approved).forEach(b => {
    const f = billFigures(costing, b)
    const cut = f.claimed - f.supported
    const date = (b.paidAt ?? b.receivedAt).slice(0, 10)
    if (cut <= 0 || !inPeriod(date)) return
    lines.push({
      id: `bill:${b.id}`, kind: 'proven', dept: 'Sub-contractors',
      what: `Bill ${b.number} from ${contractorName(costing, b.contractorId)} claimed more than the checked record`,
      proof: `Approved at the record: ${money(f.supported)} of ${money(f.claimed)} claimed`,
      money: cut, date, href: '/admin/contractors?tab=bills', who: 'Contracts',
    })
  })

  // ── proven: parts moved from another store instead of bought ────────────
  inv.pos.forEach(po => po.transfers.filter(t => (t.note ?? '').startsWith('Moved instead of buying')).forEach(t => {
    if (!inPeriod(t.date)) return
    const rate = po.lines.find(l => l.itemId === t.itemId)?.rate ?? 0
    const part = inv.catalogue.find(p => p.id === t.itemId)?.name ?? t.itemId
    lines.push({
      id: `move:${po.id}:${t.id}`, kind: 'proven', dept: 'Stores and procurement',
      what: `${part} was being ordered while ${t.qty} sat in another store`,
      proof: `${t.qty} moved from ${po.project} to ${t.toProject} on ${day(t.date)} (${po.number})${(t.note ?? '').includes(' on ') ? `; ${(t.note ?? '').split(' on ').pop()} cut by ${t.qty}` : ''}`,
      money: t.qty * rate, date: t.date, href: '/admin/inventory', who: 'Stores',
    })
  }))

  // ── what was done with each answered finding ─────────────────────────────
  const statuses = Object.entries(costing.findingStatus ?? {}) as [string, FindingStatus][]
  let dayCost: number | null = null
  statuses.forEach(([id, st]) => {
    const f = st.found
    if (!f) return
    const answered = st.at.slice(0, 10)
    const foundOn = f.on ?? answered

    if (st.status === 'dismissed') {
      if (inPeriod(foundOn) || inPeriod(answered)) lines.push({ id: `aside:${id}`, kind: 'setaside', dept: f.dept, what: f.title, found: foundOn, who: st.by, proof: `Set aside: "${st.note}"`, money: f.money ?? 0, date: answered })
      return
    }
    if (st.status !== 'done' && st.status !== 'assigned') return

    // Overdue invoices collected after XPLORIX raised them.
    const overdue = f.items.find(i => i.kind === 'invoice-overdue')
    if (overdue) {
      const inv_ = invById[String(overdue.ref?.invoiceId ?? '')]
      if (inv_?.status === 'paid' && inPeriod(inv_.paidDate)) {
        lines.push({ id: `cash:${id}`, kind: 'cash', dept: f.dept, what: f.title, found: foundOn, who: st.to ?? st.by,
          proof: `${inv_.number} paid ${day(inv_.paidDate)}`, money: inv_.paidAmount ?? inv_.total, date: inv_.paidDate!, href: '/admin/finance' })
        return
      }
    }

    // A part that would have run out, and a rig that did not stop for it.
    const runout = f.items.find(i => i.kind === 'stock-runout')
    if (runout && runout.ref?.itemId) {
      const item = String(runout.ref.itemId)
      const gap = Number(runout.ref.gapDays ?? 0)
      const restocked = inv.pos.some(po =>
        po.receipts.some(r => r.date >= answered && r.lines.some(l => l.itemId === item && l.accepted > 0))
        || po.transfers.some(t => t.itemId === item && t.date >= answered))
      const stops = costing.shiftLogs.some(l => l.date >= answered && isOwnStop(l) && /part|spare|material/i.test(l.downtimeReason))
      if (restocked && !stops && gap > 0) {
        if (dayCost === null) dayCost = stoppedDayCost(costing, inv)
        const estimate = gap * dayCost
        if (estimate > 0 && inPeriod(answered)) {
          lines.push({ id: `est:${id}`, kind: 'estimate', dept: f.dept, what: f.title, found: foundOn, who: st.to ?? st.by,
            proof: 'Stock came in before it ran out; no rig logged a stop for parts',
            method: `${gap} days a rig would have stood × ${money(dayCost)}, the median cost of one of your rigs on a day it did not drill`,
            money: estimate, date: answered, href: '/admin/inventory' })
          return
        }
      }
    }

    // Acted on; the record does not show the result yet.
    if ((f.money ?? 0) > 0 && inPeriod(answered)) {
      lines.push({ id: `pend:${id}`, kind: 'pending', dept: f.dept, what: f.title, found: foundOn, who: st.to ?? st.by,
        proof: st.status === 'assigned' ? `Handed to ${st.to}; not in the record yet` : 'Marked done; not in the record yet', money: f.money ?? 0, date: answered })
    }
  })

  // ── still open, with money on it ────────────────────────────────────────
  ;(inbox?.open ?? []).filter(u => (u.money ?? 0) > 0 && u.severity !== 'watch').forEach(u => {
    /* Money the client owes, or holes not billed yet, is your money waiting
     * to come in. It is shown on its own, never added to a loss. */
    const waiting = /^live:(od_|ready$|tosend$)|^risk:stuck$/.test(u.id)
    lines.push({ id: `open:${u.id}`, kind: waiting ? 'waiting' : 'open', dept: u.dept, what: u.title, found: u.since, who: u.state === 'handed' ? u.status?.to : u.owner,
      proof: u.state === 'handed' ? `Handed to ${u.status?.to}, not done yet` : 'Not acted on yet', money: u.money ?? 0, date: to, href: u.href })
  })

  const totals = { proven: 0, cash: 0, estimate: 0, pending: 0, open: 0, waiting: 0, setaside: 0 } as Record<ValueKind, number>
  const counts = { proven: 0, cash: 0, estimate: 0, pending: 0, open: 0, waiting: 0, setaside: 0 } as Record<ValueKind, number>
  lines.forEach(l => { totals[l.kind] += l.money; counts[l.kind] += 1 })
  lines.sort((a, b) => b.money - a.money)

  // ── before and after ────────────────────────────────────────────────────
  const months = Array.from(new Set(costing.shiftLogs.map(l => monthOf(l.date)))).sort()
  const firstMonth = months[0] ?? monthOf(to)
  const lastMonth = monthOf(to)
  const trends = buildTrends(costing, inv, firstMonth, lastMonth, ledger)

  return { from, to, lines, totals, counts, trends, firstMonth, lastMonth }
}

function buildTrends(costing: CostingState, inv: InvState, first: string, last: string, ledger: ReturnType<typeof standbyLedger>): Trend[] {
  const byMonth = <T>(m: string, list: T[], date: (x: T) => string | undefined) => list.filter(x => { const d = date(x); return !!d && monthOf(d) === m })

  // Days from a hole being closed to its invoice being paid.
  const holes = holesFromLogs(costing)
  const closedOn: Record<string, string | undefined> = {}
  holes.forEach(h => { closedOn[h.id] = h.end })
  const toPaid = (m: string) => {
    const xs: number[] = []
    byMonth(m, costing.invoices.filter(i => i.status === 'paid'), i => i.paidDate).forEach(i => i.holeNumbers.forEach(h => {
      const c = closedOn[h]; if (c && i.paidDate) xs.push((new Date(i.paidDate).getTime() - new Date(c).getTime()) / 86400000)
    }))
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
  }

  // Drill logs that pass every check, or were saved with a reason.
  const audits = auditRecord(costing)
  const passing = (m: string) => {
    const a = audits.filter(x => monthOf(x.log.date) === m)
    return a.length ? (a.filter(x => x.checks.length === 0).length / a.length) * 100 : null
  }

  // Client standby that reached a hole's bill or an invoice.
  const standby = (m: string) => {
    const d = ledger.days.filter(x => monthOf(x.date) === m && x.state !== 'no-rate')
    return d.length ? (d.filter(x => x.state !== 'not-on-hole').length / d.length) * 100 : null
  }


  const fuel = (m: string) => {
    const ls = costing.shiftLogs.filter(x => monthOf(x.date) === m && !x.contractor && (x.engineHours ?? 0) > 0 && x.fuelLitres > 0)
    const h = ls.reduce((s, x) => s + (x.engineHours ?? 0), 0)
    return h ? ls.reduce((s, x) => s + x.fuelLitres, 0) / h : null
  }

  const pct = (n: number) => `${Math.round(n)}%`
  /* The first month that has the figure, against the last one that does,
   * up to the month chosen: a month with no paid invoice says nothing. */
  const months: string[] = []
  for (let m = first; m <= last; m = monthOf(addDays(`${m}-28`, 7))) months.push(m)
  const span = (key: string, label: string, f: (m: string) => number | null, fmt: (n: number) => string, goodWhenUp: boolean, note?: string, settledOnly = false): Trend => {
    /* Billing takes weeks: the running month's standby is not billed yet, so a
     * measure of what reached a bill only looks at months that are over. */
    const open = monthOf(TODAY)
    const have = months.filter(m => !settledOnly || m < open).map(m => ({ m, v: f(m) })).filter(x => x.v != null)
    const b = have[0], a = have.length > 1 ? have[have.length - 1] : undefined
    return { key, label, before: b?.v ?? null, after: a?.v ?? null, beforeMonth: b?.m, afterMonth: a?.m, fmt, goodWhenUp, note }
  }
  const nums = (m: string) => monthNumbers(costing, inv, m)
  return [
    span('paid', 'Days from hole closed to paid', toPaid, n => `${Math.round(n)}`, false),
    span('logs', 'Drill logs that pass every check', passing, pct, true),
    span('standby', 'Client standby that reached a bill', standby, pct, true, 'Months that are over only: standby is billed after the month ends.', true),
    span('breakdown', 'Rig-days lost to your own breakdowns', m => { const x = nums(m); return x.rigDays ? x.breakdownDays : null }, n => `${n}`, false),
    span('fuel', 'Fuel per engine hour', fuel, n => `${n.toFixed(1)} L`, false),
    span('cpm', 'Cost per metre', m => nums(m).costPerMetre || null, n => money(n), false, 'Moves with the ground as well as with how the rigs are run.'),
  ]
}

export const VALUE_PERIODS = (to: string = TODAY) => [
  { key: 'month', label: 'This month', from: `${monthOf(to)}-01` },
  { key: '90', label: 'Last 90 days', from: addDays(to, -89) },
  { key: 'all', label: 'Since you started', from: '0000-01-01' },
]
