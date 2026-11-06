'use client'

import { monthOf, type useCosting } from './costing-store'
import { type useInventory } from './inventory-store'
import { computeRigMonth } from './costing-view'
import { workOrderFor, contractorName, type WorkOrder } from './contracting'

/* ==========================================================================
 * OWN RIGS AGAINST CONTRACTORS' RIGS — the same measures for both
 *
 * Every row is built from computeRigMonth, the one calculation Finance and
 * the Dashboard already use. So a rig's metres, cost and margin here are the
 * figures on its own Finance screen, and an own rig and a contractor's rig
 * are judged on exactly the same days of the same record.
 *
 * What differs is only where the cost comes from:
 *   own rig           fuel, crew, repairs, parts and the rig itself
 *   contractor's rig  his rate under the work order
 * ========================================================================== */

type CostingState = ReturnType<typeof useCosting>['state']
type InvState = ReturnType<typeof useInventory>['state']

export interface PartyRow {
  key: string
  kind: 'own' | 'contractor'
  name: string
  sub?: string
  rig?: string
  workOrder?: WorkOrder
  rigs: number
  days: number              // rig-days with a shift in the record
  drillDays: number
  standbyDays: number       // stopped, cause not the rig's
  breakdownDays: number     // stopped by the rig or its crew
  metres: number
  core: number
  downtimeHours: number
  cost: number
  revenue: number
  perRigDay: number
  recoveryPct: number
  costPerMetre: number
  ratePerMetre: number
  marginPerMetre: number
  margin: number
  marginPct: number
}

const blank = (key: string, kind: PartyRow['kind'], name: string): PartyRow => ({
  key, kind, name, rigs: 0, days: 0, drillDays: 0, standbyDays: 0, breakdownDays: 0, metres: 0, core: 0, downtimeHours: 0,
  cost: 0, revenue: 0, perRigDay: 0, recoveryPct: 0, costPerMetre: 0, ratePerMetre: 0, marginPerMetre: 0, margin: 0, marginPct: 0,
})
function finish(r: PartyRow): PartyRow {
  r.perRigDay = r.days ? r.metres / r.days : 0
  r.recoveryPct = r.metres ? (r.core / r.metres) * 100 : 0
  r.costPerMetre = r.metres ? r.cost / r.metres : 0
  r.ratePerMetre = r.metres ? r.revenue / r.metres : 0
  r.margin = r.revenue - r.cost
  r.marginPerMetre = r.metres ? r.margin / r.metres : 0
  r.marginPct = r.revenue ? (r.margin / r.revenue) * 100 : 0
  return r
}
function add(into: PartyRow, r: PartyRow) {
  into.rigs += r.rigs; into.days += r.days; into.drillDays += r.drillDays; into.standbyDays += r.standbyDays
  into.breakdownDays += r.breakdownDays; into.metres += r.metres; into.core += r.core; into.downtimeHours += r.downtimeHours
  into.cost += r.cost; into.revenue += r.revenue
}

export function monthsOnProject(state: CostingState, project: string) {
  return Array.from(new Set(state.shiftLogs.filter(l => l.project === project).map(l => monthOf(l.date)))).sort()
}

export interface Comparison {
  rigs: PartyRow[]
  own: PartyRow
  out: PartyRow
  contractors: PartyRow[]
  total: PartyRow
  hasBoth: boolean
}

/* `months` empty means the whole project. */
export function compareParties(state: CostingState, inv: InvState, project: string, months: string[]): Comparison {
  const all = monthsOnProject(state, project)
  const use = months.length ? months : all
  const rigNames = Array.from(new Set(state.shiftLogs.filter(l => l.project === project).map(l => l.rig))).sort()
  const rigs: PartyRow[] = []
  rigNames.forEach(rig => {
    const wo = workOrderFor(state, project, rig)
    const row = blank(rig, wo ? 'contractor' : 'own', rig)
    row.rig = rig; row.workOrder = wo; row.rigs = 1
    row.sub = wo ? `${contractorName(state, wo.contractorId)} · ${wo.number}` : undefined
    use.forEach(m => {
      computeRigMonth(state, inv, project, rig, m).days.forEach(d => {
        if (!d.submitted) return
        row.days += 1
        if (d.status === 'drilling') row.drillDays += 1
        if (d.status === 'standby') row.standbyDays += 1
        if (d.status === 'breakdown') row.breakdownDays += 1
        row.metres += d.units; row.core += d.coreRecovery; row.downtimeHours += d.downtimeHours
        row.cost += d.total; row.revenue += d.revenue
      })
    })
    if (row.days > 0) rigs.push(finish(row))
  })

  const own = blank('own', 'own', 'Own rigs')
  const out = blank('out', 'contractor', 'Contractor rigs')
  const total = blank('total', 'own', 'Project')
  const byContractor: Record<string, PartyRow> = {}
  rigs.forEach(r => {
    add(total, r)
    if (r.kind === 'own') { add(own, r); return }
    add(out, r)
    const id = r.workOrder!.contractorId
    const c = (byContractor[id] ||= { ...blank(id, 'contractor', contractorName(state, id)), workOrder: r.workOrder })
    add(c, r)
  })
  return {
    rigs, own: finish(own), out: finish(out), total: finish(total),
    contractors: Object.values(byContractor).map(finish).sort((a, b) => b.metres - a.metres),
    hasBoth: own.days > 0 && out.days > 0,
  }
}
