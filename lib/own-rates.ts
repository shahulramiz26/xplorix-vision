import { monthOf, type DayCost } from './costing-store'
import { normFormation, FORMATIONS, type Formation } from './inventory-store'
import { computeRigMonth, type CostingState, type InvState } from './costing-view'

/* ==========================================================================
 * YOUR OWN RATE BOOK — what a metre has really cost you, by ground, size
 * and depth
 *
 * A tender asks for a rate per metre for each size, ground and depth band.
 * The honest answer is what those metres cost the company the last time it
 * drilled them. This reads every costed day in the record (the same costing
 * Finance uses) and files each metre under its ground, core size and depth
 * band:
 *
 *   cost       the day's cost shared over its metres, except tooling, which
 *              is charged to the ground that wore it out. Days the rig did
 *              not drill and earned nothing (breakdowns, moves) still cost
 *              money, so that cost is spread over the same rig-month's
 *              metres. Standby days are left out: the client pays for them
 *              at the standby rate. That makes it an all-in cost per metre.
 *   revenue    what the client paid for those metres at the contract rate
 *   speed      metres per drilling hour, from the shift logs
 *
 * Own rigs and contractors' rigs are kept apart: one is what drilling costs
 * you, the other what sub-contracting costs you.
 * ========================================================================== */

export const DEPTH_BANDS = [
  { key: '0-100', from: 0, to: 100, label: '0–100 m' },
  { key: '100-200', from: 100, to: 200, label: '100–200 m' },
  { key: '200-300', from: 200, to: 300, label: '200–300 m' },
  { key: '300+', from: 300, to: Infinity, label: '300 m and deeper' },
] as const
export type DepthKey = typeof DEPTH_BANDS[number]['key']
export const depthKey = (d: number): DepthKey => (DEPTH_BANDS.find(b => d >= b.from && d < b.to) ?? DEPTH_BANDS[3]).key

export type RigKind = 'own' | 'contractor'

export interface RateCell {
  kind: RigKind
  formation: Formation
  holeSize: string
  depth: DepthKey
  metres: number
  cost: number
  revenue: number
  drillHours: number
  rigDays: number
  /* Derived */
  costPerMetre: number
  ratePerMetre: number
  metresPerHour: number
}

export interface RateBook {
  cells: RateCell[]
  /* Drilling hours a rig gives in a working day on average, from the logs. */
  drillHoursPerRigDay: { own: number; contractor: number }
  totals: { own: { metres: number; cost: number; revenue: number; rigMonths: number }; contractor: { metres: number; cost: number; revenue: number; rigMonths: number } }
  sizes: string[]
}

const key = (k: RigKind, f: string, s: string, d: string) => `${k}|${f}|${s}|${d}`

export function buildRateBook(state: CostingState, inv: InvState): RateBook {
  const acc: Record<string, Omit<RateCell, 'costPerMetre' | 'ratePerMetre' | 'metresPerHour'> & { days: Set<string> }> = {}
  const totals = { own: { metres: 0, cost: 0, revenue: 0, rigMonths: 0 }, contractor: { metres: 0, cost: 0, revenue: 0, rigMonths: 0 } }
  const add = (k: RigKind, f: Formation, s: string, d: DepthKey) =>
    (acc[key(k, f, s, d)] ||= { kind: k, formation: f, holeSize: s, depth: d, metres: 0, cost: 0, revenue: 0, drillHours: 0, rigDays: 0, days: new Set() })

  const seen = new Set<string>()
  state.shiftLogs.forEach(l => {
    if (l.segmentOf) return
    const k = `${l.project}|${l.rig}|${monthOf(l.date)}`
    if (seen.has(k)) return
    seen.add(k)
    const v = computeRigMonth(state, inv, l.project, l.rig, monthOf(l.date))
    if (!v.hasLogs) return
    const kind: RigKind = v.workOrder ? 'contractor' : 'own'
    const metresMonth = v.days.reduce((s, d) => s + d.units, 0)
    if (metresMonth <= 0) return
    /* Cost of the days that drilled nothing and earned nothing (breakdowns,
     * moves), spread over the month's metres. A standby day is left out: the
     * client pays for it at the standby rate, so it is not put on the metre. */
    const idleCost = v.days.filter(d => d.units <= 0 && d.revenue <= 0).reduce((s, d) => s + d.total, 0)
    const idlePerMetre = idleCost / metresMonth
    totals[kind].rigMonths += 1
    v.days.forEach((d: DayCost) => {
      if (d.units <= 0) return
      const toolTotal = d.toolingByFormation.reduce((s, t) => s + t.amount, 0)
      const rest = d.total - toolTotal
      d.charges.forEach(c => {
        if (c.metres <= 0) return
        const f = normFormation(c.formation)
        const tf = d.toolingByFormation.find(t => t.formation === f)
        const tool = tf && tf.metres > 0 ? tf.amount * (c.metres / tf.metres) : 0
        const cost = rest * (c.metres / d.units) + tool + idlePerMetre * c.metres
        const cell = add(kind, f, c.holeSize, depthKey(c.fromDepth))
        cell.metres += c.metres; cell.cost += cost; cell.revenue += c.amount
        cell.days.add(`${d.rig}|${d.date}`)
        totals[kind].metres += c.metres; totals[kind].cost += cost; totals[kind].revenue += c.amount
      })
    })
  })

  // Speed, from the logs: drilling hours shared over the shift's metres.
  const hoursByKind = { own: { hours: 0, rigDays: new Set<string>() }, contractor: { hours: 0, rigDays: new Set<string>() } }
  state.shiftLogs.forEach(l => {
    if (l.segmentOf) return
    const kind: RigKind = l.contractor ? 'contractor' : 'own'
    if (l.drillingHours > 0) { hoursByKind[kind].hours += l.drillingHours; hoursByKind[kind].rigDays.add(`${l.rig}|${l.date}`) }
    if (l.metresDrilled <= 0 || l.drillingHours <= 0 || l.meterStart == null) return
    const cell = acc[key(kind, normFormation(l.formationType), l.holeSize, depthKey(l.meterStart))]
    if (cell) cell.drillHours += l.drillingHours
  })

  const cells: RateCell[] = Object.values(acc).map(({ days, ...c }) => ({
    ...c, rigDays: days.size,
    costPerMetre: c.metres ? c.cost / c.metres : 0,
    ratePerMetre: c.metres ? c.revenue / c.metres : 0,
    metresPerHour: c.drillHours ? c.metres / c.drillHours : 0,
  }))
  const perDay = (k: RigKind) => hoursByKind[k].rigDays.size ? hoursByKind[k].hours / hoursByKind[k].rigDays.size : 0
  return {
    cells, totals,
    drillHoursPerRigDay: { own: perDay('own'), contractor: perDay('contractor') },
    sizes: Array.from(new Set(cells.map(c => c.holeSize))).sort(),
  }
}

// ── pricing a tender from the book ────────────────────────────────────────

export type Confidence = 'high' | 'medium' | 'low' | 'near' | 'none'
export const confidenceOf = (metres: number): Confidence => metres >= 200 ? 'high' : metres >= 60 ? 'medium' : metres > 0 ? 'low' : 'none'

export interface TenderInput {
  holeSize: string
  totalMetres: number
  avgDepth: number
  mix: Record<Formation, number>     // per cent of metres in each ground
  marginPct: number
  rigs: number
  kind: RigKind
}

export interface TenderLine {
  formation: Formation
  depth: DepthKey
  metres: number
  costPerMetre: number | null
  quotePerMetre: number | null
  paidBefore: number | null        // what clients paid for this band, if drilled before
  metresPerHour: number | null
  basis: string                    // where the figure came from
  confidence: Confidence
  sample: number                   // metres of record behind it
}

export interface TenderResult {
  lines: TenderLine[]
  cost: number
  price: number
  profit: number
  rigDays: number | null
  calendarDays: number | null
  missing: number                  // metres with no figure in the record
  timedMetres: number              // metres the time estimate covers
  recordMarginPct: number | null
}

/* The share of each depth band in a hole drilled to `depth`, metres spread
 * evenly down the hole. */
export function depthShares(depth: number): { key: DepthKey; share: number }[] {
  if (depth <= 0) return [{ key: '0-100', share: 1 }]
  return DEPTH_BANDS.map(b => ({ key: b.key, share: Math.max(0, Math.min(depth, b.to) - b.from) / depth })).filter(x => x.share > 0)
}

/* The record's figure for a ground, size and depth: the cell itself, or the
 * nearest depth band in the same ground and size, said so. */
function lookup(book: RateBook, kind: RigKind, f: Formation, size: string, d: DepthKey) {
  const same = (c: RateCell) => c.kind === kind && c.formation === f && c.holeSize === size
  const exact = book.cells.find(c => same(c) && c.depth === d)
  if (exact && exact.metres > 0) return { cell: exact, basis: 'Your record, same ground, size and depth' }
  const order = DEPTH_BANDS.map(b => b.key)
  const i = order.indexOf(d)
  const near = book.cells.filter(same).sort((a, b) => Math.abs(order.indexOf(a.depth) - i) - Math.abs(order.indexOf(b.depth) - i) || b.metres - a.metres)[0]
  if (near) return { cell: near, basis: `Your record in this ground and size at ${DEPTH_BANDS.find(b => b.key === near.depth)!.label}; nothing at this depth yet` }
  return null
}

export function priceTender(book: RateBook, t: TenderInput): TenderResult {
  const lines: TenderLine[] = []
  const shares = depthShares(t.avgDepth)
  const mixTotal = FORMATIONS.reduce((s, f) => s + (t.mix[f] || 0), 0) || 1
  FORMATIONS.forEach(f => {
    const fm = (t.mix[f] || 0) / mixTotal
    if (fm <= 0) return
    shares.forEach(s => {
      const metres = t.totalMetres * fm * s.share
      if (metres <= 0) return
      const hit = lookup(book, t.kind, f, t.holeSize, s.key)
      const cpm = hit ? hit.cell.costPerMetre : null
      lines.push({
        formation: f, depth: s.key, metres,
        costPerMetre: cpm, quotePerMetre: cpm != null ? cpm / (1 - t.marginPct / 100) : null,
        paidBefore: hit && hit.cell.ratePerMetre > 0 ? hit.cell.ratePerMetre : null,
        metresPerHour: hit && hit.cell.metresPerHour > 0 ? hit.cell.metresPerHour : null,
        basis: hit ? hit.basis : 'Not in your record: no metres in this ground and size yet',
        confidence: hit ? (hit.basis.startsWith('Your record, same') ? confidenceOf(hit.cell.metres) : 'near') : 'none',
        sample: hit ? hit.cell.metres : 0,
      })
    })
  })
  const priced = lines.filter(l => l.costPerMetre != null)
  const cost = priced.reduce((s, l) => s + l.metres * (l.costPerMetre as number), 0)
  const price = priced.reduce((s, l) => s + l.metres * (l.quotePerMetre as number), 0)
  // Time for the metres the record has a speed for; the rest are left out and said so.
  const timed = lines.filter(l => l.metresPerHour)
  const hours = timed.length ? timed.reduce((s, l) => s + l.metres / (l.metresPerHour as number), 0) : null
  const perDay = book.drillHoursPerRigDay[t.kind]
  const rigDays = hours != null && perDay > 0 ? hours / perDay : null
  const tot = book.totals[t.kind]
  return {
    lines, cost, price, profit: price - cost,
    rigDays, calendarDays: rigDays != null ? rigDays / Math.max(1, t.rigs) : null,
    missing: lines.filter(l => l.costPerMetre == null).reduce((s, l) => s + l.metres, 0),
    timedMetres: timed.reduce((s, l) => s + l.metres, 0),
    recordMarginPct: tot.revenue > 0 ? ((tot.revenue - tot.cost) / tot.revenue) * 100 : null,
  }
}
