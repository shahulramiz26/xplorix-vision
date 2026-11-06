import {
  stockInStore, normFormation, terrainRows, FORMATIONS,
  type PurchaseOrder, type Part, type Formation, type ShiftFact,
} from './inventory-store'
import type { ShiftLog } from './costing-store'

/* ==========================================================================
 * STOCK CHECKS — before money leaves for the supplier
 *
 *   Transfer before buying. A part about to be ordered for one project is
 *   often already sitting in another project's store: a closed project, or
 *   a live one where it has not moved for a month. Each order line is read
 *   against every store first, and the transfer is one click.
 *
 *   Part life by ground. The catalogue says a bit lasts so many metres; the
 *   shift logs say how long it really lasted in each ground. Where the
 *   ground gives clearly less, every metre was costed (and quoted) too cheap.
 *
 * Both read the company's own record, nothing else.
 * ========================================================================== */

export const IDLE_DAYS = 30

export interface Spare {
  project: string
  qty: number
  poId: string
  poNumber: string
  rate: number
  ageDays: number
  closed: boolean
  /* Only stock still on the order it arrived on can be moved in one step;
   * stock that was already moved once is shown, not offered. */
  movable: boolean
}

/* The same part in any other project's store that is free to move: all of it
 * on a closed project, and stock untouched for a month on a live one. */
export function sparesFor(pos: PurchaseOrder[], itemId: string, forProject: string, today: string, closedProjects: string[]): Spare[] {
  return stockInStore(pos, today)
    .filter(l => l.itemId === itemId && l.project !== forProject && l.qty > 0)
    .map(l => ({
      project: l.project, qty: l.qty, poId: l.poId, poNumber: l.poNumber, rate: l.rate, ageDays: l.ageDays,
      closed: closedProjects.includes(l.project), movable: !l.movedHere,
    }))
    .filter(s => s.closed || s.ageDays >= IDLE_DAYS)
    .sort((a, b) => Number(b.closed) - Number(a.closed) || b.qty - a.qty)
}

export interface BuyCheckLine {
  itemId: string
  name: string
  ordering: number
  spares: Spare[]
  free: number            // how many could come from other stores instead
  saves: number           // at the rate on this order
}

export function buyCheck(pos: PurchaseOrder[], catalogue: Part[], po: PurchaseOrder, today: string, closedProjects: string[]): BuyCheckLine[] {
  return po.lines.map(l => {
    const spares = sparesFor(pos.filter(p => p.id !== po.id), l.itemId, po.project, today, closedProjects)
    const free = Math.min(l.qty, spares.reduce((s, x) => s + x.qty, 0))
    return {
      itemId: l.itemId, name: catalogue.find(p => p.id === l.itemId)?.name ?? l.itemId,
      ordering: l.qty, spares, free, saves: free * l.rate,
    }
  }).filter(x => x.free > 0)
}

// ── Part life by ground ───────────────────────────────────────────────────

export interface LifeGap {
  itemId: string
  name: string
  formation: Formation
  observedLife: number
  catalogueLife: number
  deltaPct: number
  scrapped: number
  metres: number
  /* What the shorter life cost over the period: the metres in that ground
   * at the observed rate per metre, less the same metres at the catalogue's. */
  understated: number
}

export function shiftFacts(logs: ShiftLog[]): ShiftFact[] {
  return logs.filter(l => !l.segmentOf && !l.contractor).map(l => ({
    rig: l.rig, project: l.project, date: l.date, metres: l.metresDrilled,
    formation: normFormation(l.formationType), holeSize: l.holeSize,
    used: (l.partsUsed ?? []).map(u => ({ itemId: u.itemId, qty: u.qty ?? 0 })),
  }))
}

/* Parts lasting at least `threshold`% less than the catalogue in a ground,
 * on a sample big enough to act on. */
export function lifeGaps(logs: ShiftLog[], catalogue: Part[], threshold = 25): LifeGap[] {
  const rows = terrainRows(shiftFacts(logs), catalogue)
  const out: LifeGap[] = []
  rows.forEach(r => FORMATIONS.forEach(f => {
    const c = r.cells[f]
    if (!c.confident || c.observedLife == null || c.lifeDeltaPct == null || c.lifeDeltaPct > -threshold) return
    out.push({
      itemId: r.itemId, name: r.name, formation: f, observedLife: c.observedLife, catalogueLife: c.catalogueLife,
      deltaPct: c.lifeDeltaPct, scrapped: c.scrapped, metres: c.metres,
      understated: c.metres * ((c.observedPerMetre ?? 0) - c.cataloguePerMetre),
    })
  }))
  return out.sort((a, b) => b.understated - a.understated)
}
