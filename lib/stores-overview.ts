import {
  stockInStore, onOrder, poStatus, poValue, rigHoldings, addDays, daysBetween,
  type PurchaseOrder, type Part, type RigBurn, type RigKitEntry, type AlertSettings,
} from './inventory-store'

/* ==========================================================================
 * STORES AT A GLANCE
 *
 * The question a store answers: will any rig stop for a part? Every part
 * that has been bought is set against the next delivery that could save it,
 * at the rate the rigs are wearing it. Beside it, the orders in flight and
 * what is sitting where. The same arithmetic as the stock alerts.
 * ========================================================================== */

export type Runway = 'stops' | 'tight' | 'covered'
export interface RunwayRow {
  part: Part
  inStore: number
  daysLeft: number           // at today's wear
  runsOutOn: string
  onOrder: number
  arrives?: string           // the soonest promised delivery, or lead time if ordered today
  arrivesFrom: 'order' | 'lead'
  lateDays: number | null    // the order on the way is late by this many days
  gapDays: number            // days a rig would stand
  state: Runway
}

export function runways(pos: PurchaseOrder[], parts: Part[], burn: RigBurn[], today: string, coverDays: number): RunwayRow[] {
  const stock = stockInStore(pos, today)
  const orders = onOrder(pos, today)
  const have: Record<string, number> = {}
  stock.forEach(l => { have[l.itemId] = (have[l.itemId] ?? 0) + l.qty })
  const everOrdered = new Set(pos.flatMap(p => p.lines.map(l => l.itemId)))
  const totalBurn = burn.reduce((a, b) => a + b.metresPerDay, 0)
  if (totalBurn <= 0) return []
  return parts.filter(p => p.active && everOrdered.has(p.id) && p.lifeMetres > 0).map(part => {
    const n = have[part.id] ?? 0
    const days = (n * part.lifeMetres) / totalBurn
    const mine = orders.filter(o => o.itemId === part.id)
    const onWay = mine.reduce((a, o) => a + o.qty, 0)
    const promised = mine.map(o => o.promisedDate).filter(Boolean).sort()[0] as string | undefined
    const late = mine.map(o => o.overdueDays ?? 0).reduce((a, b) => Math.max(a, b), 0)
    /* A late order has no date worth trusting: it arrives no sooner than
     * today. With nothing on order, the soonest it can come is the lead time. */
    const arrives = onWay > 0 ? (promised && promised >= today ? promised : today) : addDays(today, part.leadTimeDays)
    const runsOutOn = addDays(today, Math.floor(days))
    const gap = Math.max(0, daysBetween(runsOutOn, arrives))
    const state: Runway = runsOutOn < arrives || (onWay > 0 && late > 0 && days < coverDays) ? 'stops'
      : daysBetween(arrives, runsOutOn) < coverDays || days < part.leadTimeDays + coverDays ? 'tight' : 'covered'
    return {
      part, inStore: n, daysLeft: Math.floor(days), runsOutOn, onOrder: onWay, arrives, arrivesFrom: onWay > 0 ? 'order' : 'lead',
      lateDays: late > 0 ? late : null, gapDays: gap, state,
    } as RunwayRow
  }).sort((a, b) => ({ stops: 0, tight: 1, covered: 2 }[a.state] - { stops: 0, tight: 1, covered: 2 }[b.state]) || a.daysLeft - b.daysLeft)
}

export interface OrderStage { key: 'draft' | 'placed' | 'late' | 'partial' | 'received'; label: string; pos: PurchaseOrder[]; value: number }
export function orderStages(pos: PurchaseOrder[], today: string): OrderStage[] {
  const isLate = (po: PurchaseOrder) => !!po.promisedDate && po.promisedDate < today
  const stages: OrderStage[] = [
    { key: 'draft', label: 'Drafts, not placed', pos: pos.filter(p => poStatus(p) === 'draft'), value: 0 },
    { key: 'placed', label: 'Placed, on time', pos: pos.filter(p => poStatus(p) === 'ordered' && !isLate(p)), value: 0 },
    { key: 'late', label: 'Late', pos: pos.filter(p => (poStatus(p) === 'ordered' || poStatus(p) === 'partial') && isLate(p)), value: 0 },
    { key: 'partial', label: 'Part received', pos: pos.filter(p => poStatus(p) === 'partial' && !isLate(p)), value: 0 },
    { key: 'received', label: 'Received, last 30 days', pos: pos.filter(p => poStatus(p) === 'received' && p.receipts.some(r => daysBetween(r.date, today) <= 30)), value: 0 },
  ]
  stages.forEach(s => { s.value = s.pos.reduce((t, p) => t + poValue(p), 0) })
  return stages
}

export interface SiteRow { project: string; closed: boolean; store: number; idle: number; onRigs: number; lines: number }
export function stockBySite(
  pos: PurchaseOrder[], parts: Part[], rigKit: RigKitEntry[], projects: string[], closed: string[],
  rigsOn: (project: string) => string[], used: (rig: string, project: string) => { itemId: string; qty: number }[],
  today: string, s: AlertSettings,
): SiteRow[] {
  const stock = stockInStore(pos, today)
  return projects.map(project => {
    const mine = stock.filter(l => l.project === project)
    const onRigs = rigsOn(project).reduce((t, rig) => t + rigHoldings(pos, parts, rig, project, used(rig, project), rigKit).reduce((a, l) => a + (l.onRig * l.avgRate), 0), 0)
    return {
      project, closed: closed.includes(project), lines: mine.length,
      store: mine.reduce((t, l) => t + l.value, 0),
      idle: mine.filter(l => l.ageDays >= s.idleDays).reduce((t, l) => t + l.value, 0),
      onRigs,
    }
  })
}
