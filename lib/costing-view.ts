'use client'

import { toolingRatesFor, type useInventory } from './inventory-store'
import { workOrderFor, payRateOn, type WorkOrder } from './contracting'
import {
  monthOf, daysInMonth, versionOn, depthIndex, ownershipBreakdown, blankOperating, blankOwnership,
  dayCost, rollup, withCumulative, holesFromDays, holeResult,
  type useCosting, type RigOwnership, type OwnershipBreakdown, type OperatingRate, type ClientRate,
  type DayCost, type DayCostMTD, type Rollup, type HoleResult,
} from './costing-store'

/* ==========================================================================
 * THE COSTING VIEW
 *
 * One place turns logs plus dated rates into costed days for a rig on a
 * project in a month. Finance reads it for the Performance table, the
 * Drillholes table and the invoice; the Dashboard reads it for this month's
 * cost, revenue and margin. If a number appears on two screens it came from
 * this one call, so the two cannot disagree.
 * ========================================================================== */

export interface RigMonthView {
  hasLogs: boolean
  ownership?: RigOwnership
  ob: OwnershipBreakdown
  operating?: OperatingRate
  clientRate?: ClientRate
  days: DayCostMTD[]
  roll: Rollup
  holes: HoleResult[]
  unallocated: number
  unallocatedDays: number
  budgetOwnershipCPU: number
  productionVariancePct: number
  /* Set when the rig is a contractor's: its cost is then what the work order
   * pays for the metres, and ownership, fuel, crew and parts are all nil. */
  workOrder?: WorkOrder
  // The committee assigns one rock category for the whole project. If the logs
  // disagree, every metre is underpriced and there is no line item to recover
  // it — so the mismatch is surfaced rather than left to final billing.
  loggedFormation: string
}

export const EMPTY_OB: OwnershipBreakdown = {
  landedPrice: 0, depPerYear: 0, depPerMonth: 0, emi: 0,
  emiActive: false, emiMonthsLeft: 0, insurancePerMonth: 0, otherFixedPerMonth: 0,
  perMonth: 0, perDay: 0, perUnit: 0, basisLabel: '',
}

export type CostingState = ReturnType<typeof useCosting>['state']
export type InvState = ReturnType<typeof useInventory>['state']

/* A plain function rather than a hook, because the month strip needs the same
 * calculation for several months at once and a hook cannot be called in a loop. */
export function computeRigMonth(state: CostingState, inv: InvState, project: string, rig: string, month: string): RigMonthView {
  const logs = state.shiftLogs.filter(l => l.rig === rig && l.project === project && monthOf(l.date) === month)
  if (logs.length === 0) {
    return {
      hasLogs: false, ob: EMPTY_OB, days: [], roll: rollup([]),
      holes: [], unallocated: 0, unallocatedDays: 0,
      budgetOwnershipCPU: 0, productionVariancePct: 0, loggedFormation: '',
    }
  }

  // A rig named on a work order for this project is a contractor's rig.
  const workOrder = workOrderFor(state, project, rig)
  const ownVersions = workOrder ? [] : state.ownership.filter(o => o.rig === rig)
  const opVersions = state.operating.filter(o => o.rig === rig && o.project === project)
  const crVersions = state.clientRates.filter(c => c.project === project)

  const monthEnd = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`
  const lastLogged = logs.map(l => l.date).sort()[logs.length - 1]
  const lastDay = Math.min(Number(lastLogged.slice(8)), Number(monthEnd.slice(8)))

  const ownership = versionOn(ownVersions, monthEnd)
  const ob = ownership ? ownershipBreakdown(ownership, month) : EMPTY_OB
  const operating = versionOn(opVersions, monthEnd)
  const clientRate = versionOn(crVersions, monthEnd)

  const raw: DayCost[] = []
  /* Where every shift's hole stood when the shift began, from the whole
   * project's record: a hole keeps its depth across months and rigs. */
  const startAt = depthIndex(state.shiftLogs.filter(l => l.project === project))

  /* Our own rig costs money from the first of the month whether it drilled or
   * not, so its month starts on day one. A contractor's rig costs nothing on a
   * day it was not here, so its month starts at its first shift. */
  const firstDay = workOrder ? Number(logs.map(l => l.date).sort()[0].slice(8)) : 1
  for (let n = firstDay; n <= lastDay; n++) {
    const date = `${month}-${String(n).padStart(2, '0')}`
    const shifts = logs.filter(l => l.date === date)
    const maint = state.maintenance.filter(m => m.rig === rig && m.project === project && m.date === date)
    const op = versionOn(opVersions, date) ?? blankOperating(rig, project, date)
    const own = versionOn(ownVersions, date) ?? blankOwnership(rig, date)
    const obDay = versionOn(ownVersions, date) ? ownershipBreakdown(own, month) : EMPTY_OB
    const cr = versionOn(crVersions, date)

    /* The tooling rate as it stood on this date — the rig's starting kit plus
     * everything issued up to it. Parts issued later do not reach back and
     * change a day that was already costed. */
    const tooling = toolingRatesFor(inv.pos, inv.rigKit, inv.catalogue, rig, project, date)

    const d = dayCost(date, rig, project, shifts, maint, op, own, obDay, cr, tooling, s => startAt[s.id] ?? 0,
      workOrder ? { rate: payRateOn(workOrder, date) } : undefined)
    raw.push(d)
  }

  const days = withCumulative(raw)
  const roll = rollup(raw)
  const holes = holesFromDays(raw, state.holeStatus).map(h => holeResult(h, raw))
  const orphan = raw.filter(d => !d.holeNumber)

  // Most common lithology in the logs, for the category check.
  const counts: Record<string, number> = {}
  logs.forEach(l => { if (l.formationType) counts[l.formationType] = (counts[l.formationType] || 0) + l.metresDrilled })
  const loggedFormation = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''

  return {
    hasLogs: true, ownership, ob, operating, clientRate, days, roll, holes, workOrder,
    unallocated: orphan.reduce((s, d) => s + d.total, 0),
    unallocatedDays: orphan.length,
    budgetOwnershipCPU: ownership && ownership.expectedUnitsPerMonth > 0 ? ob.perMonth / ownership.expectedUnitsPerMonth : 0,
    productionVariancePct: ownership && ownership.expectedUnitsPerMonth > 0
      ? ((roll.units - ownership.expectedUnitsPerMonth) / ownership.expectedUnitsPerMonth) * 100 : 0,
    loggedFormation,
  }
}
