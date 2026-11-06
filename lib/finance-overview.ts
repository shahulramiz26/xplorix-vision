import { monthOf, outstanding, isOverdue, type Invoice } from './costing-store'
import { computeRigMonth } from './costing-view'
import { workOrderFor, contractorName } from './contracting'
import type { OverviewCosting, OverviewInv } from './admin-overview'
import type { LiveHole } from './client-record'

/* ==========================================================================
 * FINANCE AT A GLANCE
 *
 * Two questions, from the same costing the rig-by-rig screen uses:
 *   which rig and project made money this month, and which did not
 *   where every rupee of drilled work stands on its way to cash
 * ========================================================================== */

export interface ProfitRow {
  key: string
  project: string
  rig: string
  contractor?: string
  metres: number
  days: number
  standbyDays: number
  breakdownDays: number
  revenue: number
  cost: number
  margin: number
  marginPct: number
  costPerMetre: number
  ratePerMetre: number
}

export function profitByRig(costing: OverviewCosting, inv: OverviewInv, month: string): ProfitRow[] {
  const pairs = new Map<string, { project: string; rig: string }>()
  costing.shiftLogs.forEach(l => { if (monthOf(l.date) === month) pairs.set(`${l.project}|${l.rig}`, { project: l.project, rig: l.rig }) })
  const rows: ProfitRow[] = []
  pairs.forEach(({ project, rig }, key) => {
    const v = computeRigMonth(costing, inv, project, rig, month)
    const r: ProfitRow = { key, project, rig, metres: 0, days: 0, standbyDays: 0, breakdownDays: 0, revenue: 0, cost: 0, margin: 0, marginPct: 0, costPerMetre: 0, ratePerMetre: 0 }
    const wo = workOrderFor(costing, project, rig)
    if (wo) r.contractor = contractorName(costing, wo.contractorId)
    v.days.forEach(d => {
      if (!d.submitted) return
      r.days += 1; r.metres += d.units; r.revenue += d.revenue; r.cost += d.total
      if (d.status === 'standby') r.standbyDays += 1
      if (d.status === 'breakdown') r.breakdownDays += 1
    })
    if (!r.days) return
    r.margin = r.revenue - r.cost
    r.marginPct = r.revenue ? (r.margin / r.revenue) * 100 : 0
    r.costPerMetre = r.metres ? r.cost / r.metres : 0
    r.ratePerMetre = r.metres ? r.revenue / r.metres : 0
    rows.push(r)
  })
  return rows.sort((a, b) => b.margin - a.margin)
}

export interface ProjectProfit { project: string; rigs: number; metres: number; revenue: number; cost: number; margin: number; marginPct: number }
export function byProject(rows: ProfitRow[]): ProjectProfit[] {
  const m = new Map<string, ProjectProfit>()
  rows.forEach(r => {
    const p = m.get(r.project) ?? { project: r.project, rigs: 0, metres: 0, revenue: 0, cost: 0, margin: 0, marginPct: 0 }
    p.rigs += 1; p.metres += r.metres; p.revenue += r.revenue; p.cost += r.cost
    m.set(r.project, p)
  })
  return Array.from(m.values()).map(p => ({ ...p, margin: p.revenue - p.cost, marginPct: p.revenue ? ((p.revenue - p.cost) / p.revenue) * 100 : 0 })).sort((a, b) => b.margin - a.margin)
}

// ── from drilled to paid ──────────────────────────────────────────────────

export type StageKey = 'drilled' | 'closed' | 'client' | 'approved' | 'invoiced' | 'paid'
export interface StageItem { id: string; label: string; sub: string; value: number; since?: string; href: string; flag?: string }
export interface Stage { key: StageKey; label: string; help: string; value: number; items: StageItem[]; oldest?: string }

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dd = (d?: string) => d ? `${Number(d.slice(8, 10))} ${MON[Number(d.slice(5, 7)) - 1]}` : ''
const daysSince = (d: string | undefined, today: string) => d ? Math.max(0, Math.round((new Date(today).getTime() - new Date(d).getTime()) / 86400000)) : 0

export function cashStages(p: {
  today: string
  stuck: { hole: string; drilled: number; planned: number; value: number; rig: string; project: string }[]
  toSend: LiveHole[]; returned: LiveHole[]; waitingOwner: LiveHole[]; readyToInvoice: LiveHole[]
  invoices: Invoice[]
  holeLink: (h: { project: string; rig: string; end?: string; start?: string }) => string
  invoiceLink: (i: Invoice) => string
}): Stage[] {
  const { today } = p
  const ago = (d?: string) => { if (!d) return ''; const n = daysSince(d, today); return n === 0 ? 'today' : `${n} ${n === 1 ? 'day' : 'days'}` }
  const hole = (h: LiveHole, since?: string, flag?: string): StageItem => ({
    id: h.id, label: h.id, sub: `${h.rig} · ${h.project}${since ? ` · ${ago(since)}` : ''}`, value: h.value, since, href: p.holeLink(h), flag,
  })
  const unpaid = p.invoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled')
  const paid = p.invoices.filter(i => i.status === 'paid' && i.paidDate && daysSince(i.paidDate, today) <= 90)
  const stages: Stage[] = [
    {
      key: 'drilled', label: 'Drilled, cannot be billed', help: 'Holes stopped short of their planned depth and left open. A hole is billed when it is closed.',
      value: 0, items: p.stuck.map(s => ({ id: s.hole, label: s.hole, sub: `${s.rig} · ${s.project} · ${Math.round(s.drilled)} of ${Math.round(s.planned)} m`, value: s.value, href: p.holeLink({ project: s.project, rig: s.rig }) })),
    },
    {
      key: 'closed', label: 'Closed, not sent', help: 'Finished holes not yet sent to the client for approval.',
      value: 0, items: [...p.returned.map(h => hole(h, h.decidedAt?.slice(0, 10) ?? h.end, 'Sent back by the client')), ...p.toSend.map(h => hole(h, h.end))],
    },
    {
      key: 'client', label: 'With the client', help: 'Sent for approval. The client has not answered yet.',
      value: 0, items: p.waitingOwner.map(h => hole(h, h.submittedAt?.slice(0, 10))),
    },
    {
      key: 'approved', label: 'Approved, to invoice', help: 'The client approved them. Raise the invoice.',
      value: 0, items: p.readyToInvoice.map(h => hole(h, h.decidedAt?.slice(0, 10))),
    },
    {
      key: 'invoiced', label: 'Invoiced, not paid', help: 'Raised and waiting for payment.',
      value: 0, items: unpaid.map(i => ({
        id: i.id, label: i.number, sub: `${i.project}${i.dueDate ? ` · due ${dd(i.dueDate)}` : ''}`, value: outstanding(i), since: i.date, href: p.invoiceLink(i),
        flag: i.ownerStatus === 'disputed' ? 'Disputed' : isOverdue(i, today) ? `Overdue ${daysSince(i.dueDate, today)} ${daysSince(i.dueDate, today) === 1 ? 'day' : 'days'}` : undefined,
      })),
    },
    {
      key: 'paid', label: 'Paid, last 90 days', help: 'Money in the bank.',
      value: 0, items: paid.map(i => ({ id: i.id, label: i.number, sub: `${i.project} · paid ${dd(i.paidDate)}`, value: i.paidAmount ?? i.total, since: i.paidDate, href: p.invoiceLink(i) })),
    },
  ]
  stages.forEach(s => {
    s.value = s.items.reduce((t, x) => t + x.value, 0)
    s.items.sort((a, b) => (b.flag ? 1 : 0) - (a.flag ? 1 : 0) || b.value - a.value)
    s.oldest = s.key === 'paid' ? undefined : s.items.map(x => x.since).filter(Boolean).sort()[0]
  })
  return stages
}
