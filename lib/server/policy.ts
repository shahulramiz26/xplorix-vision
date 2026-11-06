import { SPEC, type Change } from '../sync-spec'
import type { Who } from './auth'

/* ==========================================================================
 * WHO MAY READ AND WRITE WHAT
 *
 * The browser only ever holds what this file lets through, and can only save
 * what this file accepts. That is what makes the four logins real:
 *
 *   admin        everything in the company
 *   supervisor   the projects he is on: their logs, holes and the parts on
 *                his rigs. No rates, no costs, no invoices.
 *   contractor   his own work orders, his own shifts, logs and bills.
 *                Nothing of the company's own rigs, its client or another
 *                contractor.
 *   client       the projects shown to him: the shift record without fuel,
 *                parts or crew cost, his contract rates, holes and invoices.
 *
 * Every rule here is also a rule of the screens. The screens are not trusted
 * to keep it.
 * ========================================================================== */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any
export interface Rec extends Change { data: Any; c: number }

const of = (all: Rec[], coll: string, store = 'costing') => all.filter(r => r.store === store && r.coll === coll)
const eq = (a?: string, b?: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()

/* What the rest of the rules need to know about the person asking. */
function scope(who: Who, all: Rec[]) {
  const me = of(all, 'users').find(r => r.id === who.userRef)?.data
  const projects = of(all, 'projects')
  const orders = of(all, 'workOrders')
  const logs = of(all, 'shiftLogs')
  const reports = of(all, 'contractorReports')
  const plans = of(all, 'holePlans')

  let mine: Rec[] = []
  let myOrders: Rec[] = []
  if (who.role === 'supervisor') mine = projects.filter(p => (p.data.supervisors ?? []).includes(me?.name))
  if (who.role === 'client') mine = projects.filter(p => p.data.shared && eq(p.data.client, me?.client))
  if (who.role === 'contractor') {
    myOrders = orders.filter(w => w.data.contractorId === me?.contractorId)
    const names = new Set(myOrders.map(w => w.data.project))
    mine = projects.filter(p => names.has(p.data.name))
  }
  const names = new Set<string>(mine.map(p => p.data.name))
  const orderIds = new Set<string>(myOrders.map(w => w.id))
  // Which project a hole belongs to: the plan says, or the first shift on it.
  const holeProject: Record<string, string> = {}
  logs.forEach(l => { if (l.data.holeNumber && !holeProject[l.data.holeNumber]) holeProject[l.data.holeNumber] = l.data.project })
  reports.forEach(r => { if (r.data.holeNumber && !holeProject[r.data.holeNumber]) holeProject[r.data.holeNumber] = r.data.project })
  plans.forEach(p => { if (p.data.project) holeProject[p.id] = p.data.project })
  return { me, names, myOrders, orderIds, holeProject, logs, reports, plans, projects, orders }
}

// ── reading ───────────────────────────────────────────────────────────────

/* A shift as the client may read it: what happened on the rig, and nothing
 * about what it cost or who was hired to drill it. */
function shiftForClient(l: Any) {
  const { fuelLitres, waterLitres, additivesKg, partsUsed, bitRuns, equipmentUsed, notes, attachments, contractor, workOrderId, check, engineHmr, engineHours, loggedBy, editedBy, editedAt, trust, history, ...keep } = l
  /* The drill log checks and the change history are the company's own working
   * record. The client keeps only the stamp that the shift was checked as it
   * was logged, for the "Checked by XPLORIX" mark: no reasons, no names. */
  void history
  const stamp = trust ? { checkedAt: trust.checkedAt, by: '', warnings: [] } : undefined
  void fuelLitres; void waterLitres; void additivesKg; void partsUsed; void bitRuns; void equipmentUsed; void notes; void attachments
  void contractor; void workOrderId; void check; void engineHmr; void engineHours; void loggedBy; void editedBy; void editedAt
  return { ...keep, fuelLitres: 0, waterLitres: 0, additivesKg: 0, partsUsed: [], ...(stamp ? { trust: stamp } : {}) }
}
/* The client reads the project as agreed with him; the daily target is the
 * contractor's own KPI and stays behind. */
const projectForClient = (p: Any) => { const { dailyTarget, ...rest } = p; void dailyTarget; return rest }
const projectStub = (p: Any) => ({
  id: p.id, name: p.name, code: p.code, location: p.location, client: '', status: p.status, startDate: p.startDate,
  holeSize: p.holeSize, shared: false, rigs: [], supervisors: [], drillers: [], createdAt: p.createdAt,
})
const orderStub = (w: Any) => ({
  id: w.id, number: '', project: w.project, contractorId: '', rigs: w.rigs, startDate: '', endDate: '', plannedMetres: 0,
  rates: [], rules: [], paymentDays: 0, status: w.status,
})

export function visible(who: Who, all: Rec[]): Rec[] {
  if (who.role === 'admin') return all
  const s = scope(who, all)
  if (!s.me) return []
  const out: Rec[] = []
  const keep = (list: Rec[], f: (r: Rec) => boolean, map?: (d: Any) => Any) =>
    list.forEach(r => { if (f(r)) out.push(map ? { ...r, data: map(r.data) } : r) })
  const inMine = (r: Rec) => s.names.has(r.data.project)
  const myHole = (r: Rec) => s.names.has(s.holeProject[r.id])

  keep(of(all, 'users'), r => r.id === who.userRef)
  keep(of(all, 'wording'), () => true)

  if (who.role === 'supervisor') {
    keep(s.projects, r => s.names.has(r.data.name))
    keep(s.logs, inMine)
    keep(of(all, 'maintenance'), inMine)
    keep(s.plans, myHole)
    keep(of(all, 'holeStatus'), myHole)
    // Only the names of contractors whose rigs are on his projects, to label their logs.
    const onSite = new Set(s.logs.filter(inMine).map(l => l.data.contractor).filter(Boolean))
    keep(of(all, 'contractors'), r => onSite.has(r.id), c => ({ id: c.id, name: c.name }))
    // The parts on his rigs, so a log can say which bit was used. No prices, no suppliers.
    keep(of(all, 'catalogue', 'inventory'), () => true, p => ({ ...p, rate: 0, supplier: '' }))
    keep(of(all, 'rigKit', 'inventory'), inMine, k => ({ ...k, lines: (k.lines ?? []).map((x: Any) => ({ ...x, rate: 0 })) }))
    keep(of(all, 'pos', 'inventory'), inMine, p => ({ ...p, supplier: '', lines: (p.lines ?? []).map((x: Any) => ({ ...x, rate: 0 })) }))
  }

  if (who.role === 'contractor') {
    const mineId = s.me.contractorId
    keep(of(all, 'contractors'), r => r.id === mineId)
    keep(s.orders, r => s.orderIds.has(r.id))
    keep(s.projects, r => s.names.has(r.data.name), projectStub)
    keep(s.logs, r => r.data.contractor === mineId)
    keep(s.reports, r => s.orderIds.has(r.data.workOrderId))
    keep(of(all, 'contractorBills'), r => r.data.contractorId === mineId)
    keep(of(all, 'maintenance'), r => r.data.contractor === mineId || s.orderIds.has(r.data.workOrderId))
    // His own holes, and planned holes nobody else has started.
    const others = new Set<string>()
    s.logs.forEach(l => { if (l.data.holeNumber && l.data.contractor !== mineId) others.add(l.data.holeNumber) })
    s.reports.forEach(r => { if (r.data.holeNumber && !s.orderIds.has(r.data.workOrderId)) others.add(r.data.holeNumber) })
    keep(s.plans, r => myHole(r) && !others.has(r.id))
    keep(of(all, 'holeStatus'), r => myHole(r) && !others.has(r.id))
  }

  if (who.role === 'client') {
    keep(s.projects, r => s.names.has(r.data.name), projectForClient)
    keep(s.logs, inMine, shiftForClient)
    keep(of(all, 'clientRates'), inMine)
    keep(of(all, 'invoices'), r => inMine(r) && !!r.data.ownerStatus && r.data.status !== 'draft' && r.data.status !== 'cancelled')
    keep(of(all, 'rateProposals'), inMine)
    keep(of(all, 'projectEvents'), inMine)
    keep(s.plans, myHole)
    keep(of(all, 'holeStatus'), myHole)
    keep(s.orders, inMine, orderStub)
  }
  return out
}

// ── writing ───────────────────────────────────────────────────────────────

export type Verdict =
  | { ok: true; data: Any | null; also?: Change[] }
  | { ok: false; reason: string }
const no = (reason: string): Verdict => ({ ok: false, reason })
const yes = (data: Any | null, also?: Change[]): Verdict => ({ ok: true, data, also })

/* `current` is the record as it stands (undefined if there is none).
 * `all` is the company's whole record, loaded once for the request. */
export function judge(who: Who, ch: Change, current: Any | undefined, all: Rec[]): Verdict {
  if (!SPEC[ch.store]?.[ch.coll]) return no('unknown collection')
  if (who.role === 'admin') return yes(ch.data)
  if (ch.store !== 'costing') return no('not yours to change')
  const s = scope(who, all)
  if (!s.me) return no('login not found')
  const d: Any = ch.data
  const removing = d == null

  // Every login may mark its own first sign-in, and nothing else about itself.
  if (ch.coll === 'users') {
    if (ch.id !== who.userRef || removing || !current) return no('not your login')
    return yes({ ...current, opened: true })
  }

  if (who.role === 'supervisor') {
    if (ch.coll !== 'shiftLogs' && ch.coll !== 'maintenance') return no('not yours to change')
    const mineNow = !current || (current.supervisor === s.me.name && !current.contractor && s.names.has(current.project))
    if (!mineNow) return no('another supervisor’s log')
    if (removing) return current ? yes(null) : no('nothing to remove')
    if (!s.names.has(d.project)) return no('not your project')
    if (d.supervisor !== s.me.name || d.contractor) return no('not logged as you')
    return yes(d)
  }

  if (who.role === 'contractor') {
    const mineId = s.me.contractorId
    if (ch.coll === 'contractorReports') {
      if (current && !(s.orderIds.has(current.workOrderId) && ['waiting', 'returned'].includes(current.status))) return no('already checked')
      if (removing) return current ? yes(null) : no('nothing to remove')
      const wo = s.myOrders.find(w => w.id === d.workOrderId && w.data.status === 'active')?.data
      if (!wo || wo.project !== d.project || !wo.rigs.includes(d.rig)) return no('not on your work order')
      const { returnedBy, returnedAt, returnReason, ...rest } = d
      void returnedBy; void returnedAt; void returnReason
      return yes({ ...rest, status: 'waiting' })
    }
    if (ch.coll === 'maintenance') {
      if (current && current.contractor !== mineId) return no('not your log')
      if (removing) return current ? yes(null) : no('nothing to remove')
      const wo = s.myOrders.find(w => w.data.project === d.project && w.data.rigs.includes(d.rig))
      if (!wo) return no('not your rig')
      return yes({ ...d, contractor: mineId, workOrderId: wo.id, cost: 0, partsUsed: [] })
    }
    if (ch.coll === 'contractorBills') {
      if (current && !(current.contractorId === mineId && ['received', 'returned'].includes(current.status))) return no('already approved')
      if (removing) return current ? yes(null) : no('nothing to remove')
      if (d.contractorId !== mineId || !s.orderIds.has(d.workOrderId)) return no('not your work order')
      const { approved, paidAt, returnReason, ...rest } = d
      void approved; void paidAt; void returnReason
      return yes({ ...rest, status: 'received' })
    }
    return no('not yours to change')
  }

  if (who.role === 'client') {
    if (removing) return no('not yours to remove')
    if (ch.coll === 'holeStatus') {
      if (!s.names.has(s.holeProject[ch.id])) return no('not your hole')
      if (current?.status !== 'submitted' || !['approved', 'closed'].includes(d.status)) return no('not waiting for you')
      return yes({ status: d.status, submittedAt: current.submittedAt, decidedAt: d.decidedAt, returnReason: d.status === 'closed' ? d.returnReason : undefined })
    }
    if (ch.coll === 'invoices') {
      if (!current || !s.names.has(current.project) || !current.ownerStatus) return no('not your invoice')
      if (current.status === 'paid' || current.status === 'cancelled') return no('invoice is closed')
      if (!Array.isArray(d.lineReviews) || d.lineReviews.length !== (current.lines ?? []).length) return no('lines do not match')
      const next = { ...current, lineReviews: d.lineReviews, ownerStatus: d.ownerStatus, reviewedAt: d.reviewedAt }
      return yes(d.status === 'paid' ? { ...next, status: 'paid', paidDate: d.paidDate, paidAmount: d.paidAmount } : next)
    }
    if (ch.coll === 'rateProposals') {
      if (!current || !s.names.has(current.project) || current.status !== 'waiting') return no('not waiting for you')
      if (!['accepted', 'returned'].includes(d.status)) return no('not an answer')
      const next = { ...current, status: d.status, answeredAt: d.answeredAt, ownerNote: d.ownerNote }
      // Accepting a proposal is what puts the new rates in force. The server
      // does that itself, from the proposal as it was sent.
      return yes(next, d.status === 'accepted' ? [{ store: 'costing', coll: 'clientRates', id: current.rate.id, data: current.rate }] : undefined)
    }
    if (ch.coll === 'holePlans') {
      if (current || s.holeProject[ch.id]) return no('hole number already used')
      if (!s.names.has(d.project) || d.by !== 'owner' || !(d.plannedDepth > 0)) return no('not your project')
      return yes(d)
    }
    if (ch.coll === 'projectEvents') {
      if (current) return s.names.has(current.project) ? yes({ ...current, seenByOwner: true }) : no('not your project')
      if (!s.names.has(d.project) || d.by !== 'owner') return no('not your project')
      return yes(d)
    }
    return no('not yours to change')
  }
  return no('not yours to change')
}
