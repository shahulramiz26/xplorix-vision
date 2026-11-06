import { FORMATIONS, type Formation } from './inventory-store'
import { addDays } from './inventory-store'
import { priceTender, DEPTH_BANDS, type RateBook, type DepthKey, type TenderLine } from './own-rates'
import { compareParties } from './contracting-view'
import { checkBill } from './contracting'
import type { RigForecast } from './forecast'

/* ==========================================================================
 * TENDERS: pricing new work, and giving work out
 *
 * Two kinds of tender, one list:
 *
 *   bid     a client asks you for a price. You price it from what the same
 *           metres cost you last time (lib/own-rates.ts), say where the record
 *           is thin or has nothing, add the risks you see, check you have the
 *           rigs, and send a rate with a walk-away figure under it.
 *   award   you give work to a sub-contractor. Each quote is set against what
 *           drilling it yourselves would cost, what the client pays you, and
 *           what that contractor's own record shows: speed, core, bills.
 *
 * Every figure says where it came from. Where the record has nothing, the
 * screen asks for your figure and marks it as yours; it never fills a gap.
 * ========================================================================== */

export type TenderKind = 'bid' | 'award'
export type TenderStatus = 'pricing' | 'sent' | 'won' | 'lost' | 'dropped'
export const STATUS_LABEL: Record<TenderKind, Record<TenderStatus, string>> = {
  bid: { pricing: 'Pricing', sent: 'Sent, waiting', won: 'Won', lost: 'Lost', dropped: 'Not bidding' },
  award: { pricing: 'Comparing quotes', sent: 'Offer made', won: 'Awarded', lost: 'Not given out', dropped: 'Dropped' },
}

export interface RiskLoad { id: string; label: string; pct: number; on: boolean }
/* Starting figures only. Each is the estimator's call and is changed on the
 * tender; the screen says so. */
export const RISK_LIBRARY: Omit<RiskLoad, 'on'>[] = [
  { id: 'remote', label: 'Remote site: longer moves and supply runs', pct: 4 },
  { id: 'ground', label: 'Broken or caving ground beyond what the tender describes', pct: 6 },
  { id: 'water', label: 'Water to be carted in', pct: 3 },
  { id: 'payment', label: 'Client pays later than 60 days', pct: 2 },
  { id: 'standby', label: 'Standby not paid, or capped', pct: 3 },
  { id: 'newclient', label: 'A client you have not drilled for', pct: 2 },
]
export const freshRisks = (on: string[] = []): RiskLoad[] => RISK_LIBRARY.map(r => ({ ...r, on: on.includes(r.id) }))

export interface Quote {
  id: string
  contractorId?: string     // a contractor in your record, if he is one
  name: string
  rate: number              // per metre
  standbyPerDay?: number
  mobilisation?: number
  note?: string
}

export interface Tender {
  id: string
  number: string
  kind: TenderKind
  name: string
  client: string
  place: string
  holeSize: string
  metres: number
  avgDepth: number
  mix: Record<Formation, number>   // % of metres in each ground
  rigs: number
  start: string
  finishBy: string
  due: string                      // when the price must be in
  margin: number                   // %
  risks: RiskLoad[]
  /* Cost per metre you enter for a ground and depth your record has never
   * drilled: key `${formation}|${depth}`. */
  yourRates: Record<string, number>
  /* award: what the client pays you per metre for this work. */
  clientRate?: number
  quotes: Quote[]
  awardedTo?: string
  status: TenderStatus
  sentOn?: string
  sentRate?: number                // the average rate per metre sent
  result?: { on: string; note?: string; winningRate?: number }
  createdAt: string
  notes?: string
}

export const bandLabel = (k: string) => DEPTH_BANDS.find(b => b.key === k)?.label ?? k
export const rateKey = (f: Formation, d: DepthKey | string) => `${f}|${d}`
const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0)

// ── a bid ──────────────────────────────────────────────────────────────────

/* Where a band's cost comes from, plainly:
 *   record   your own metres, same ground, size and depth (60 m or more)
 *   thin     same, but under 60 m behind it
 *   near     same ground and size, another depth band
 *   yours    the record has nothing; the figure is the one you entered
 *   none     the record has nothing and no figure is entered yet */
export type CostSource = 'record' | 'thin' | 'near' | 'yours' | 'none'
export const SOURCE_WORDS: Record<CostSource, string> = {
  record: 'Your record', thin: 'Thin record', near: 'Nearby depth', yours: 'Your figure', none: 'Not in your record',
}

export interface BidLine extends TenderLine {
  source: CostSource
  cost: number | null        // per metre, before risk
  walkAway: number | null    // cost plus risk: below this the band loses money
  quote: number | null       // per metre, with margin
}

export interface BidCalc {
  lines: BidLine[]
  riskPct: number
  metres: number
  priced: number             // metres with a cost
  missing: number            // metres with no cost at all
  cost: number
  riskAllowance: number
  margin: number
  price: number
  avgQuote: number | null
  avgWalkAway: number | null
  paidBefore: number | null  // what clients paid for the same bands, averaged
  coverage: Record<CostSource, number>   // metres
  rigDays: number | null     // at your own speed, all metres
  timedShare: number         // share of metres the speed comes from
  daysAvailable: number
  rigsNeeded: number | null
  recordMarginPct: number | null
}

const days = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)

export function priceBid(book: RateBook, t: Tender): BidCalc {
  const base = priceTender(book, {
    holeSize: t.holeSize, totalMetres: Math.max(0, t.metres), avgDepth: Math.max(0, t.avgDepth),
    mix: t.mix, marginPct: 0, rigs: Math.max(1, t.rigs), kind: 'own',
  })
  const riskPct = sum(t.risks.filter(r => r.on), r => r.pct)
  const m = Math.min(90, Math.max(0, t.margin))
  const lines: BidLine[] = base.lines.map(l => {
    let cost = l.costPerMetre
    let source: CostSource = l.confidence === 'none' ? 'none' : l.confidence === 'near' ? 'near' : l.confidence === 'low' ? 'thin' : 'record'
    const mine = t.yourRates[rateKey(l.formation, l.depth)]
    if (cost == null && mine > 0) { cost = mine; source = 'yours' }
    const walkAway = cost != null ? cost * (1 + riskPct / 100) : null
    return { ...l, source, cost, walkAway, quote: walkAway != null ? walkAway / (1 - m / 100) : null }
  })
  const priced = lines.filter(l => l.cost != null)
  const pricedMetres = sum(priced, l => l.metres)
  const cost = sum(priced, l => l.metres * (l.cost as number))
  const walk = sum(priced, l => l.metres * (l.walkAway as number))
  const price = sum(priced, l => l.metres * (l.quote as number))
  const paid = lines.filter(l => l.paidBefore != null)
  const coverage = { record: 0, thin: 0, near: 0, yours: 0, none: 0 } as Record<CostSource, number>
  lines.forEach(l => { coverage[l.source] += l.metres })

  /* Time at your own speed. Bands the record has no speed for take the
   * average of the bands it has, and the share that is real is said. */
  const timedShare = t.metres > 0 ? base.timedMetres / t.metres : 0
  const rigDays = base.rigDays != null && timedShare > 0 ? base.rigDays / timedShare : null
  const daysAvailable = Math.max(0, days(t.start, t.finishBy))
  return {
    lines, riskPct, metres: t.metres, priced: pricedMetres, missing: coverage.none,
    cost, riskAllowance: walk - cost, margin: price - walk, price,
    avgQuote: pricedMetres > 0 ? price / pricedMetres : null,
    avgWalkAway: pricedMetres > 0 ? walk / pricedMetres : null,
    paidBefore: paid.length ? sum(paid, l => l.metres * (l.paidBefore as number)) / sum(paid, l => l.metres) : null,
    coverage, rigDays, timedShare, daysAvailable,
    rigsNeeded: rigDays != null && daysAvailable > 0 ? Math.ceil(rigDays / daysAvailable) : null,
    recordMarginPct: base.recordMarginPct,
  }
}

// ── rigs you will have ────────────────────────────────────────────────────

export interface RigFree { rig: string; project?: string; freeFrom: string | null }   // null: busy past the forecast
/* Your own rigs and when each is free: a rig on no project is free now; a rig
 * on a project is free the day after its last planned hole, from the same
 * forecast the Outlook uses. Contractor rigs are left out. */
export function rigsFree(ownRigs: string[], forecastRigs: RigForecast[], today: string): RigFree[] {
  return ownRigs.map(rig => {
    const f = forecastRigs.find(r => r.rig === rig && !r.contractor)
    if (!f) return { rig, freeFrom: today }
    return { rig, project: f.project, freeFrom: f.idleFrom ?? null }
  }).sort((a, b) => (a.freeFrom ?? '9999').localeCompare(b.freeFrom ?? '9999') || a.rig.localeCompare(b.rig, undefined, { numeric: true }))
}

// ── giving work out ───────────────────────────────────────────────────────

export interface ContractorRecord {
  metres: number
  perRigDay: number
  recoveryPct: number
  breakdownShare: number     // % of his rig-days stopped by his own rig or crew
  costPerMetre: number       // what he has cost you, all-in
  bills: number
  billsOver: number          // bills that claimed more than the record
  overBy: number             // SAR claimed above the record, all bills
  returned: number           // shift reports sent back
  reports: number
}

type CState = Parameters<typeof compareParties>[0]
type IState = Parameters<typeof compareParties>[1]
export function contractorRecord(state: CState, inv: IState, contractorId: string): ContractorRecord | null {
  const orders = (state.workOrders ?? []).filter(w => w.contractorId === contractorId)
  if (!orders.length) return null
  const projects = Array.from(new Set(orders.map(o => o.project)))
  let metres = 0, rigDays = 0, core = 0, breakdown = 0, cost = 0
  projects.forEach(p => {
    const row = compareParties(state, inv, p, []).contractors.find(c => c.key === contractorId)
    if (!row) return
    metres += row.metres; rigDays += row.days; core += row.core; breakdown += row.breakdownDays; cost += row.cost
  })
  const ids = new Set(orders.map(o => o.id))
  const bills = (state.contractorBills ?? []).filter(b => ids.has(b.workOrderId))
  const checks = bills.map(b => checkBill(state, b))
  const reports = (state.contractorReports ?? []).filter(r => ids.has(r.workOrderId))
  return {
    metres, perRigDay: rigDays ? metres / rigDays : 0, recoveryPct: metres ? (core / metres) * 100 : 0,
    breakdownShare: rigDays ? (breakdown / rigDays) * 100 : 0, costPerMetre: metres ? cost / metres : 0,
    bills: bills.length, billsOver: checks.filter(c => c.over > 0).length, overBy: sum(checks, c => Math.max(0, c.over)),
    returned: reports.filter(r => r.status === 'returned').length, reports: reports.length,
  }
}

export interface QuoteCalc {
  quote: Quote
  record: ContractorRecord | null
  total: number              // metres at his rate, plus mobilisation
  perMetre: number           // total over metres
  keep: number | null        // what you keep per metre: client rate less his
  keepTotal: number | null
  rigDays: number | null     // at his own pace from the record
  finishOn: string | null
  late: boolean | null       // past the finish-by date
}

export function compareQuotes(state: CState, inv: IState, t: Tender): QuoteCalc[] {
  return t.quotes.map(q => {
    const record = q.contractorId ? contractorRecord(state, inv, q.contractorId) : null
    const total = q.rate * t.metres + (q.mobilisation ?? 0)
    const perMetre = t.metres > 0 ? total / t.metres : q.rate
    const keep = t.clientRate ? t.clientRate - perMetre : null
    const rigDays = record && record.perRigDay > 0 ? t.metres / record.perRigDay : null
    const finishOn = rigDays != null ? addDays(t.start, Math.ceil(rigDays / Math.max(1, t.rigs))) : null
    return {
      quote: q, record, total, perMetre, keep, keepTotal: keep != null ? keep * t.metres : null,
      rigDays, finishOn, late: finishOn ? finishOn > t.finishBy : null,
    }
  })
}

// ── the record of tenders ─────────────────────────────────────────────────

export interface TenderStats { sent: number; won: number; lost: number; waiting: number; lostOnPrice: { gap: number; n: number } }
export function tenderStats(list: Tender[]): TenderStats {
  const bids = list.filter(t => t.kind === 'bid')
  const decided = bids.filter(t => t.status === 'won' || t.status === 'lost')
  const priced = bids.filter(t => t.status === 'lost' && t.result?.winningRate && t.sentRate)
  return {
    sent: bids.filter(t => t.sentOn).length, won: decided.filter(t => t.status === 'won').length,
    lost: decided.filter(t => t.status === 'lost').length, waiting: bids.filter(t => t.status === 'sent').length,
    lostOnPrice: { gap: priced.length ? sum(priced, t => (t.sentRate as number) - (t.result!.winningRate as number)) / priced.length : 0, n: priced.length },
  }
}

const mix = (soft: number, medium: number, hard: number, vhard: number) =>
  ({ Soft: soft, Medium: medium, Hard: hard, 'Very Hard': vhard }) as Record<Formation, number>

/* The demo company's tenders. Invented, and shown under "Demo data". */
export const SEED_TENDERS: Tender[] = [
  {
    id: 'td_7', number: 'T-2026-07', kind: 'bid', name: 'West Plateau infill', client: 'West Plateau Minerals', place: 'West Plateau block',
    holeSize: 'HQ', metres: 2400, avgDepth: 160, mix: mix(20, 0, 50, 30), rigs: 2,
    start: '2026-12-20', finishBy: '2027-04-04', due: '2026-11-11', margin: 30,
    risks: freshRisks(['remote', 'newclient']), yourRates: {}, quotes: [], status: 'pricing', createdAt: '2026-10-26',
  },
  {
    id: 'td_8', number: 'T-2026-08', kind: 'bid', name: 'Red Valley deep holes', client: 'Red Valley Resources', place: 'Red Valley',
    holeSize: 'HQ', metres: 1500, avgDepth: 360, mix: mix(0, 30, 40, 30), rigs: 1,
    start: '2027-01-18', finishBy: '2027-06-17', due: '2026-11-17', margin: 30,
    risks: freshRisks(['ground', 'water', 'newclient']), yourRates: {}, quotes: [], status: 'pricing', createdAt: '2026-10-29',
  },
  {
    id: 'td_5', number: 'T-2026-05', kind: 'bid', name: 'East Basin phase 2', client: 'East Basin Resources', place: 'East Basin block',
    holeSize: 'HQ', metres: 900, avgDepth: 120, mix: mix(0, 0, 60, 40), rigs: 1,
    start: '2026-12-07', finishBy: '2027-03-04', due: '2026-10-19', margin: 30,
    risks: freshRisks(['payment']), yourRates: {}, quotes: [], status: 'sent', sentOn: '2026-10-19', sentRate: 980, createdAt: '2026-10-05',
  },
  {
    id: 'td_3', number: 'T-2026-03', kind: 'bid', name: 'South Ridge extension', client: 'South Ridge Minerals', place: 'South Ridge block',
    holeSize: 'HQ', metres: 1200, avgDepth: 150, mix: mix(0, 0, 70, 30), rigs: 1,
    start: '2026-10-19', finishBy: '2027-02-01', due: '2026-09-11', margin: 30,
    risks: freshRisks(['standby']), yourRates: {}, quotes: [], status: 'lost', sentOn: '2026-09-10', sentRate: 1020,
    result: { on: '2026-10-07', note: 'Went to a lower price', winningRate: 940 }, createdAt: '2026-08-27',
  },
  {
    id: 'td_2', number: 'T-2026-02', kind: 'bid', name: 'North Field infill', client: 'Demo Mining Co.', place: 'North Field block',
    holeSize: 'HQ', metres: 2400, avgDepth: 150, mix: mix(20, 0, 40, 40), rigs: 2,
    start: '2026-07-19', finishBy: '2027-02-17', due: '2026-06-27', margin: 32,
    risks: freshRisks([]), yourRates: {}, quotes: [], status: 'won', sentOn: '2026-06-26', sentRate: 950,
    result: { on: '2026-07-07', note: 'Became Site A - North Field' }, createdAt: '2026-06-15',
  },
  {
    id: 'ta_1', number: 'A-2026-01', kind: 'award', name: 'Site B infill holes', client: 'South Ridge Minerals', place: 'Site B - South Ridge',
    holeSize: 'HQ', metres: 1200, avgDepth: 140, mix: mix(0, 0, 70, 30), rigs: 1,
    start: '2026-12-02', finishBy: '2027-03-20', due: '2026-11-07', margin: 0,
    risks: freshRisks([]), yourRates: {}, clientRate: 780, status: 'pricing', createdAt: '2026-10-23',
    quotes: [
      { id: 'q1', contractorId: 'ctr_p', name: 'Contractor P', rate: 640, standbyPerDay: 6000, mobilisation: 60000 },
      { id: 'q2', contractorId: 'ctr_q', name: 'Contractor Q', rate: 585, standbyPerDay: 5600, mobilisation: 50000 },
      { id: 'q3', name: 'Contractor R', rate: 540, standbyPerDay: 5200, mobilisation: 45000, note: 'New to you: no shifts or bills in your record' },
    ],
  },
]

export function blankTender(kind: TenderKind, n: number, today: string, marginStart: number): Tender {
  return {
    id: `t_${Date.now()}_${Math.floor(Math.random() * 9999)}`, number: `${kind === 'bid' ? 'T' : 'A'}-${today.slice(0, 4)}-${String(n).padStart(2, '0')}`,
    kind, name: '', client: '', place: '', holeSize: 'HQ', metres: 1000, avgDepth: 150, mix: mix(25, 25, 25, 25), rigs: 1,
    start: addDays(today, 30), finishBy: addDays(today, 150), due: addDays(today, 14), margin: kind === 'bid' ? marginStart : 0,
    risks: freshRisks([]), yourRates: {}, quotes: [], status: 'pricing', createdAt: today,
  }
}

export const MIX_TOTAL = (t: Tender) => sum(FORMATIONS as unknown as Formation[], f => t.mix[f] || 0)
