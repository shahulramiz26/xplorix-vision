'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useServerSync } from './backend'

/* ==========================================================================
 * XPLORIX PARTS & INVENTORY
 *
 * Every drilling consumable is a cost spread across the metres it drills.
 *
 *     cost per metre = rate paid / life in metres
 *     SAR 22,000 bit / 100 m = SAR 220 per metre
 *
 * Three things happen to a part, and they are different facts:
 *
 *   Existing stock   what was already on the shelf the day the system
 *                    started. No project, no rig. Sits until issued.
 *   Starting kit     what has to go on a rig before it can turn at all.
 *                    Assigned straight to the rig, no purchase order.
 *   Issued           replacements handed over once something wears out,
 *                    drawn off the shelf.
 *
 *   Purchase order → store shelf → issued to a rig
 *                                      ↑
 *                    starting kit ─────┘
 *
 * Starting kit plus everything issued since is what a rig is carrying, and
 * that is what decides its tooling cost per metre. Adding a second bit does
 * not make each metre cost twice as much — a bit is SAR 220/m whether the rig
 * holds one or three. Quantity decides how long you can keep drilling; rate
 * and life decide what each metre costs.
 *
 * The rate used is the rate actually paid, blended across the units that
 * reached the rig, so a replacement bought dearer moves the figure.
 *
 * Two rules make the charge honest:
 *
 *   1. It is dated. Parts issued on the 14th change the 14th onward and
 *      nothing before it, the same way every rate in costing behaves.
 *   2. It follows the ground. A part is tagged with the formations it works
 *      in, so seven metres of soft and eleven of hard on the same day are
 *      charged at different rates.
 * ========================================================================== */

/* The day the app is on: fixed for the demo company, the real day for a real one. */
export { TODAY } from './company'

// ── FORMATIONS ────────────────────────────────────────────────────────────

export const FORMATIONS = ['Soft', 'Medium', 'Hard', 'Very Hard'] as const
export type Formation = typeof FORMATIONS[number]

export function normFormation(v: string): Formation {
  const t = (v || '').toLowerCase().replace(/formation|strata|rock/g, '').replace(/\s+/g, ' ').trim()
  if (t.startsWith('very')) return 'Very Hard'
  if (t.startsWith('hard')) return 'Hard'
  if (t.startsWith('med')) return 'Medium'
  return 'Soft'
}

/* Which ground a part actually works in.
 *
 * A surface casing is consumed in the soft overburden and never at 200 m in
 * granite. A water swivel turns in whatever the hole is made of. An
 * impregnated bit runs in hard ground and harder. Tagging the part is what
 * lets a day charge each stretch of hole at the right rate instead of
 * smearing one blended figure across ground that cost wildly different
 * amounts to drill. */
export type FormationUse = 'soft' | 'hard+' | 'veryHard' | 'all'

export const FORMATION_USE_LABEL: Record<FormationUse, string> = {
  soft: 'Soft ground only',
  'hard+': 'Hard and very hard',
  veryHard: 'Very hard only',
  all: 'All ground',
}

export const FORMATION_USES: FormationUse[] = ['all', 'soft', 'hard+', 'veryHard']

/* Reads the free-text tag carried by older records. Anything unrecognised
 * counts as general purpose, so a part is never silently charged nowhere. */
export function formationUse(p: Part): FormationUse {
  const raw = (p.formationUse ?? p.formation ?? '').toString().toLowerCase().trim()
  if (FORMATION_USES.includes(raw as FormationUse)) return raw as FormationUse
  if (raw.startsWith('very')) return 'veryHard'
  if (raw.startsWith('hard')) return 'hard+'
  if (raw.startsWith('soft')) return 'soft'
  return 'all'
}

const USE_COVERS: Record<FormationUse, Formation[]> = {
  all: ['Soft', 'Medium', 'Hard', 'Very Hard'],
  soft: ['Soft'],
  'hard+': ['Medium', 'Hard', 'Very Hard'],
  veryHard: ['Very Hard'],
}

export function partWorksIn(p: Part, f: Formation): boolean {
  return USE_COVERS[formationUse(p)].includes(f)
}

// ── PARTS CATALOGUE ───────────────────────────────────────────────────────

export type PartCategory = 'Bit' | 'Rod & Casing' | 'Core Barrel' | 'Accessory' | 'Spares'
export const CATEGORIES: PartCategory[] = ['Bit', 'Rod & Casing', 'Core Barrel', 'Accessory', 'Spares']

/* Every part wears in metres. One life figure, one cost per metre. */
export interface Part {
  id: string
  partNumber: string
  name: string
  serialNumber?: string
  category: PartCategory
  rate: number            // SAR per unit
  formation?: string      // legacy tag, read by formationUse()
  formationUse?: FormationUse
  lifeMetres: number      // metres before replacement
  /* The core size it belongs to: an HQ bit wears only on HQ metres. Blank for
   * a part used whatever the size, such as a water swivel. */
  holeSize?: string
  supplier: string
  leadTimeDays: number
  minStock: number
  active: boolean
}

/* Kept as an alias so the finance module needs no change to its imports. */
export type ToolingItem = Part
export type ToolCategory = PartCategory

export function costPerMetre(p: Part): number {
  return p.lifeMetres > 0 ? p.rate / p.lifeMetres : 0
}

/* Catalogue-wide figure. Useful as a reference price for a rig nobody has
 * kitted out yet, but never the thing a real day is charged at — a day is
 * charged on what its own rig is carrying. See toolingRatesFor. */
export function toolingPerMetre(parts: Part[]): number {
  return parts.filter(p => p.active).reduce((s, p) => s + costPerMetre(p), 0)
}

export function toolingPerMetreForFormation(parts: Part[], f: Formation): number {
  return parts.filter(p => p.active && partWorksIn(p, f)).reduce((s, p) => s + costPerMetre(p), 0)
}

// ── SUPPLIERS ─────────────────────────────────────────────────────────────

export interface Supplier {
  id: string
  name: string
  contact: string
  phone: string
  quotedLeadDays: number
  rating?: number
  ratingNote?: string
}

// ── PURCHASE ORDERS ───────────────────────────────────────────────────────

export type POStatus = 'draft' | 'ordered' | 'partial' | 'received'
export interface POLine { itemId: string; qty: number; rate: number }

export interface ReceiptLine {
  itemId: string
  accepted: number
  damaged: number
  rejected: number
}

export const DELAY_REASONS = [
  'Supplier delay', 'Transport', 'Customs or documentation',
  'Our order raised late', 'Partial availability', 'Other',
] as const
export type DelayReason = typeof DELAY_REASONS[number]

export interface Receipt {
  id: string
  date: string
  lines: ReceiptLine[]
  delayReason?: DelayReason
  note?: string
}

// ── REORDERS ──────────────────────────────────────────────────────────────

export type ReorderStatus = 'raised' | 'sent' | 'promised' | 'closed' | 'credited'
export const REORDER_STATUS_LABEL: Record<ReorderStatus, string> = {
  raised: 'Raised', sent: 'Sent back', promised: 'Replacement promised',
  closed: 'Replaced', credited: 'Credited',
}
export const REORDER_OPEN_STATUSES: ReorderStatus[] = ['raised', 'sent', 'promised']

export interface ReorderReceipt {
  date: string
  accepted: number
  damaged: number
  rejected: number
  note?: string
}

export interface Reorder {
  id: string
  itemId: string
  qty: number
  reason: string
  raisedDate: string
  round: number
  parentId?: string
  status: ReorderStatus
  promisedDate?: string
  receipt?: ReorderReceipt
}

export function isOpenReorder(r: Reorder) {
  return !r.receipt && r.status !== 'credited'
}
export function openReorders(po: PurchaseOrder) {
  return po.reorders.filter(isOpenReorder)
}

// ── MOVEMENTS ─────────────────────────────────────────────────────────────

export interface Transfer {
  id: string
  date: string
  itemId: string
  qty: number
  toProject: string
  note?: string
}

/* Issued from the store shelf to a rig on a project. */
export interface Issue {
  id: string
  date: string
  project: string
  rig: string
  issuedBy: string
  lines: { itemId: string; qty: number }[]
}

/* Parts already on the shelf before the system started. No project, no rig —
 * they sit in the store until issued, exactly like a purchase order receipt. */
export interface StoreStockEntry {
  id: string
  date: string
  addedBy: string
  lines: { itemId: string; qty: number; rate: number }[]
}

/* The kit a rig needs before it can turn. Assigned straight to the rig with
 * no purchase order behind it — a starting balance, counted as issued for
 * costing. */
export interface RigKitEntry {
  id: string
  date: string
  project: string
  rig: string
  addedBy: string
  /* qty is in new-part equivalents: two half-worn bits are one bit's worth of
   * life. `pieces` and `condition` keep what was actually counted. */
  lines: { itemId: string; qty: number; rate: number; pieces?: number; condition?: Condition }[]
  /* count: the first count when the rig joined XPLORIX
   * learned: a part the drill log used that the rig was never given, confirmed as already on the rig
   * recount: found on a monthly recount, more than XPLORIX expected */
  source?: 'count' | 'learned' | 'recount'
}

/* How worn a part already on the rig is when it is counted, as the share of
 * its life left. Rough on purpose: nobody measures a bit's crown on day one. */
export type Condition = 'new' | 'half' | 'worn'
export const CONDITION_LIFE: Record<Condition, number> = { new: 1, half: 0.5, worn: 0.15 }
export const CONDITION_LABEL: Record<Condition, string> = { new: 'New', half: 'Half used', worn: 'Nearly worn' }

/* A recount: what XPLORIX expected on the rig, against what was there. Less
 * than expected is lost or used without being logged, and is treated as used. */
export interface RigCount {
  id: string
  date: string
  project: string
  rig: string
  by: string
  lines: { itemId: string; expected: number; counted: number }[]
}

/* Stock already on rigs when a company joins: charged to the metres it
 * drills at today's rate, or treated as already paid for. */
export type Valuation = 'charge' | 'paid'

/* Parts a recount found missing, per rig and project: added to what the
 * drill logs say was used. */
export function countLosses(counts: RigCount[], rig: string, project: string): { itemId: string; qty: number }[] {
  const out: Record<string, number> = {}
  counts.filter(c => c.rig === rig && c.project === project).forEach(c => c.lines.forEach(l => {
    if (l.counted < l.expected) out[l.itemId] = (out[l.itemId] ?? 0) + (l.expected - l.counted)
  }))
  return Object.entries(out).map(([itemId, qty]) => ({ itemId, qty }))
}

export interface PurchaseOrder {
  id: string
  number: string
  supplier: string
  project: string
  status: POStatus
  createdDate: string
  orderedDate?: string
  promisedDate?: string
  lines: POLine[]
  receipts: Receipt[]
  reorders: Reorder[]
  issues: Issue[]
  transfers: Transfer[]
  note?: string
}

// ── QUANTITY HELPERS ───────────────────────────────────────────────────────

export function poValue(po: PurchaseOrder) {
  return po.lines.reduce((s, l) => s + l.qty * l.rate, 0)
}
export function rateOfLine(po: PurchaseOrder, itemId: string) {
  return po.lines.find(l => l.itemId === itemId)?.rate ?? 0
}
export function qtyOrdered(po: PurchaseOrder, itemId: string) {
  return po.lines.filter(l => l.itemId === itemId).reduce((s, l) => s + l.qty, 0)
}
export function qtyReceived(po: PurchaseOrder, itemId: string) {
  const first = po.receipts.flatMap(r => r.lines).filter(l => l.itemId === itemId)
    .reduce((s, l) => s + l.accepted, 0)
  const replaced = po.reorders.filter(r => r.itemId === itemId)
    .reduce((s, r) => s + (r.receipt?.accepted ?? 0), 0)
  return first + replaced
}
export function qtyFaulty(po: PurchaseOrder, itemId: string) {
  const first = po.receipts.flatMap(r => r.lines).filter(l => l.itemId === itemId)
    .reduce((s, l) => s + l.damaged + l.rejected, 0)
  const again = po.reorders.filter(r => r.itemId === itemId)
    .reduce((s, r) => s + (r.receipt?.damaged ?? 0) + (r.receipt?.rejected ?? 0), 0)
  return first + again
}
export function qtyReorderedFor(po: PurchaseOrder, itemId: string) {
  return po.reorders.filter(r => r.itemId === itemId).reduce((s, r) => s + r.qty, 0)
}
export function qtyToReorder(po: PurchaseOrder, itemId: string) {
  return Math.max(0, qtyFaulty(po, itemId) - qtyReorderedFor(po, itemId))
}
export function poHasSomethingToReorder(po: PurchaseOrder) {
  return po.lines.some(l => qtyToReorder(po, l.itemId) > 0)
}
export function qtyTransferred(po: PurchaseOrder, itemId: string) {
  return po.transfers.filter(t => t.itemId === itemId).reduce((s, t) => s + t.qty, 0)
}
export function qtyIssuedTotal(po: PurchaseOrder, itemId: string) {
  return po.issues.flatMap(i => i.lines).filter(l => l.itemId === itemId).reduce((s, l) => s + l.qty, 0)
}
export function qtyIssuedTo(po: PurchaseOrder, itemId: string, project: string) {
  return po.issues.filter(i => i.project === project)
    .flatMap(i => i.lines).filter(l => l.itemId === itemId).reduce((s, l) => s + l.qty, 0)
}
export function qtyNeverDelivered(po: PurchaseOrder, itemId: string) {
  const delivered = po.receipts.flatMap(r => r.lines).filter(l => l.itemId === itemId)
    .reduce((s, l) => s + l.accepted + l.damaged + l.rejected, 0)
  return Math.max(0, qtyOrdered(po, itemId) - delivered)
}
export function poHasSomethingToReceive(po: PurchaseOrder) {
  return po.status !== 'draft' && po.lines.some(l => qtyNeverDelivered(po, l.itemId) > 0)
}
export function qtyInStore(po: PurchaseOrder, itemId: string) {
  return Math.max(0, qtyReceived(po, itemId) - qtyIssuedTotal(po, itemId))
}
export function poReceivedValue(po: PurchaseOrder) {
  return po.lines.reduce((s, l) => s + qtyReceived(po, l.itemId) * l.rate, 0)
}
export function poIssuedValue(po: PurchaseOrder) {
  return po.lines.reduce((s, l) => s + qtyIssuedTotal(po, l.itemId) * l.rate, 0)
}
export function poStoreValue(po: PurchaseOrder) {
  return po.lines.reduce((s, l) => s + qtyInStore(po, l.itemId) * l.rate, 0)
}
export function poFaultyValue(po: PurchaseOrder) {
  return po.lines.reduce((s, l) => s + qtyFaulty(po, l.itemId) * l.rate, 0)
}
export function poOpenReorderValue(po: PurchaseOrder) {
  return openReorders(po).reduce((s, r) => s + r.qty * rateOfLine(po, r.itemId), 0)
}
export function poStatus(po: PurchaseOrder): POStatus {
  if (po.status === 'draft') return 'draft'
  if (po.lines.every(l => qtyReceived(po, l.itemId) >= l.qty)) return 'received'
  return po.receipts.length > 0 ? 'partial' : 'ordered'
}

export function daysBetween(from: string, to: string) {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000)
}
export function addDays(date: string, n: number) {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}
export function receiptDelayDays(po: PurchaseOrder, r: Receipt): number | null {
  return po.promisedDate ? daysBetween(po.promisedDate, r.date) : null
}

// ── SUPPLIER PERFORMANCE ──────────────────────────────────────────────────

export interface SupplierPerformance {
  supplier: string; orders: number; completed: number; value: number
  quotedLead: number | null; actualLead: number | null
  avgDelay: number | null; onTimePct: number | null
  delivered: number; faulty: number; faultyPct: number | null
  openReorders: number; repeatFailures: number; rating?: number
}

export function supplierPerformance(pos: PurchaseOrder[], suppliers: Supplier[], name: string): SupplierPerformance {
  const mine = pos.filter(p => p.supplier === name && p.status !== 'draft')
  const leads: number[] = []
  const delays: number[] = []
  mine.forEach(po => po.receipts.forEach(r => {
    if (po.orderedDate) leads.push(daysBetween(po.orderedDate, r.date))
    if (r.delayReason === 'Our order raised late') return
    const d = receiptDelayDays(po, r)
    if (d != null) delays.push(d)
  }))
  const avg = (a: number[]) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null
  const sup = suppliers.find(s => s.name === name)
  let delivered = 0, faulty = 0
  mine.forEach(po => po.lines.forEach(l => {
    delivered += qtyReceived(po, l.itemId) + qtyFaulty(po, l.itemId)
    faulty += qtyFaulty(po, l.itemId)
  }))
  return {
    supplier: name, orders: mine.length,
    completed: mine.filter(p => poStatus(p) === 'received').length,
    value: mine.reduce((s, p) => s + poValue(p), 0),
    quotedLead: sup?.quotedLeadDays ?? null, actualLead: avg(leads),
    avgDelay: avg(delays),
    onTimePct: delays.length ? (delays.filter(d => d <= 0).length / delays.length) * 100 : null,
    delivered, faulty, faultyPct: delivered > 0 ? (faulty / delivered) * 100 : null,
    openReorders: mine.reduce((s, p) => s + openReorders(p).length, 0),
    repeatFailures: mine.reduce((s, p) =>
      s + p.reorders.filter(r => r.receipt && (r.receipt.damaged + r.receipt.rejected) > 0).length, 0),
    rating: sup?.rating,
  }
}

// ── STORE SHELF ───────────────────────────────────────────────────────────

export interface StockLine {
  key: string; poId: string; poNumber: string; itemId: string
  project: string; qty: number; rate: number; value: number
  ageDays: number; movedHere: boolean
}

export function stockInStore(pos: PurchaseOrder[], today: string): StockLine[] {
  const out: StockLine[] = []
  pos.forEach(po => po.lines.forEach(l => {
    const rate = l.rate
    const lastReceipt = po.receipts
      .filter(r => r.lines.some(x => x.itemId === l.itemId && x.accepted > 0))
      .map(r => r.date).sort().pop()
    const home = qtyReceived(po, l.itemId)
      - qtyTransferred(po, l.itemId)
      - qtyIssuedTo(po, l.itemId, po.project)
    if (home > 0) {
      out.push({
        key: `${po.id}|${l.itemId}|${po.project}`,
        poId: po.id, poNumber: po.number, itemId: l.itemId, project: po.project,
        qty: home, rate, value: home * rate,
        ageDays: lastReceipt ? daysBetween(lastReceipt, today) : 0,
        movedHere: false,
      })
    }
    const byProject: Record<string, { qty: number; last: string }> = {}
    po.transfers.filter(t => t.itemId === l.itemId).forEach(t => {
      const e = byProject[t.toProject] ??= { qty: 0, last: t.date }
      e.qty += t.qty
      if (t.date > e.last) e.last = t.date
    })
    Object.entries(byProject).forEach(([project, e]) => {
      const qty = e.qty - qtyIssuedTo(po, l.itemId, project)
      if (qty <= 0) return
      out.push({
        key: `${po.id}|${l.itemId}|${project}`,
        poId: po.id, poNumber: po.number, itemId: l.itemId, project,
        qty, rate, value: qty * rate,
        ageDays: daysBetween(e.last, today), movedHere: true,
      })
    })
  }))
  return out.sort((a, b) => b.value - a.value)
}

export interface OnOrderLine {
  itemId: string; qty: number; value: number
  poNumber: string; supplier: string
  promisedDate?: string; overdueDays: number | null
  awaitingReplacement: boolean
}

export function onOrder(pos: PurchaseOrder[], today: string): OnOrderLine[] {
  const out: OnOrderLine[] = []
  pos.filter(p => p.status !== 'draft').forEach(po => po.lines.forEach(l => {
    const q = qtyNeverDelivered(po, l.itemId)
    if (q <= 0) return
    const open = openReorders(po).filter(r => r.itemId === l.itemId)
    const due = open.length
      ? (open.map(r => r.promisedDate).filter(Boolean).sort()[0] ?? undefined)
      : po.promisedDate
    out.push({
      itemId: l.itemId, qty: q, value: q * l.rate,
      poNumber: po.number, supplier: po.supplier,
      promisedDate: due,
      overdueDays: due && due < today ? daysBetween(due, today) : null,
      awaitingReplacement: open.length > 0,
    })
  }))
  return out.sort((a, b) => (b.overdueDays ?? -1) - (a.overdueDays ?? -1))
}

/* ==========================================================================
 * WHAT A RIG IS CARRYING
 *
 * Starting kit plus everything issued since. Optionally as at a date, which
 * is what makes the tooling charge dated: a bit issued on the 14th changes
 * the 14th onward and leaves the 13th exactly as it was costed.
 * ========================================================================== */

export interface RigUnit {
  itemId: string
  kitQty: number; kitValue: number
  issuedQty: number; issuedValue: number
  qty: number; value: number
  firstDate: string
  lastDate: string
}

export function rigUnits(
  pos: PurchaseOrder[],
  rigKit: RigKitEntry[],
  rig: string,
  project: string,
  onOrBefore?: string,
): Record<string, RigUnit> {
  const acc: Record<string, RigUnit> = {}
  const touch = (itemId: string, date: string): RigUnit => {
    const e = acc[itemId] ??= {
      itemId, kitQty: 0, kitValue: 0, issuedQty: 0, issuedValue: 0,
      qty: 0, value: 0, firstDate: date, lastDate: date,
    }
    if (date < e.firstDate) e.firstDate = date
    if (date > e.lastDate) e.lastDate = date
    return e
  }

  rigKit
    .filter(e => e.rig === rig && e.project === project && (!onOrBefore || e.date <= onOrBefore))
    .forEach(e => e.lines.forEach(l => {
      const u = touch(l.itemId, e.date)
      u.kitQty += l.qty
      u.kitValue += l.qty * l.rate
    }))

  pos.forEach(po => po.issues
    .filter(i => i.rig === rig && (i.project ?? po.project) === project && (!onOrBefore || i.date <= onOrBefore))
    .forEach(i => i.lines.forEach(l => {
      const u = touch(l.itemId, i.date)
      u.issuedQty += l.qty
      u.issuedValue += l.qty * rateOfLine(po, l.itemId)
    })))

  Object.values(acc).forEach(u => {
    u.qty = u.kitQty + u.issuedQty
    u.value = u.kitValue + u.issuedValue
  })
  return acc
}

/* ── Tooling rate per formation ────────────────────────────────────────────
 *
 * For each part the rig is carrying, the rate actually paid blended across
 * the units that reached it, divided by that part's life. Summed over the
 * parts that work in a given formation, that is the tooling cost of a metre
 * of that ground on that rig on that day.
 *
 * Ground the rig holds no tagged parts for falls back to the blended rate
 * across everything, so a metre is never drilled free. That fallback is
 * reported rather than hidden — it means a part is tagged wrong. */

export interface ToolingRateLine {
  itemId: string
  partNumber: string
  name: string
  category: PartCategory
  use: FormationUse
  size?: string
  qty: number
  avgRate: number
  catalogueRate: number
  lifeMetres: number
  perMetre: number
  value: number
}

export interface ToolingRates {
  byFormation: Record<Formation, number>
  blended: number
  lines: ToolingRateLine[]
  fellBack: Formation[]
  kitted: boolean
}

export const EMPTY_TOOLING: ToolingRates = {
  byFormation: { Soft: 0, Medium: 0, Hard: 0, 'Very Hard': 0 },
  blended: 0, lines: [], fellBack: [], kitted: false,
}

export function toolingRatesFor(
  pos: PurchaseOrder[],
  rigKit: RigKitEntry[],
  parts: Part[],
  rig: string,
  project: string,
  onOrBefore?: string,
): ToolingRates {
  const units = rigUnits(pos, rigKit, rig, project, onOrBefore)
  const lines: ToolingRateLine[] = []

  Object.values(units).forEach(u => {
    const part = parts.find(p => p.id === u.itemId)
    if (!part || u.qty <= 0 || part.lifeMetres <= 0) return
    const avgRate = u.value / u.qty
    lines.push({
      itemId: u.itemId,
      partNumber: part.partNumber,
      name: part.name,
      category: part.category,
      use: formationUse(part),
      size: part.holeSize || undefined,
      qty: u.qty,
      avgRate,
      catalogueRate: part.rate,
      lifeMetres: part.lifeMetres,
      perMetre: avgRate / part.lifeMetres,
      value: u.value,
    })
  })

  const blended = lines.reduce((s, l) => s + l.perMetre, 0)
  const byFormation = { ...EMPTY_TOOLING.byFormation }
  const fellBack: Formation[] = []

  FORMATIONS.forEach(f => {
    const mine = lines.filter(l => USE_COVERS[l.use].includes(f))
    if (mine.length === 0 && lines.length > 0) {
      byFormation[f] = blended
      fellBack.push(f)
    } else {
      byFormation[f] = mine.reduce((s, l) => s + l.perMetre, 0)
    }
  })

  return {
    byFormation, blended,
    lines: lines.sort((a, b) => b.perMetre - a.perMetre),
    fellBack, kitted: lines.length > 0,
  }
}

/* What a metre of this ground, at this core size, wears out. A part tagged
 * with a size counts only on metres of that size, so a hole that changes from
 * HQ to NQ is not charged for both sets of bits. Ground with no part of its
 * own falls back to everything carried at that size, as byFormation does. */
export function toolingFor(t: ToolingRates, f: Formation, size?: string): number {
  const atSize = t.lines.filter(l => !l.size || !size || l.size === size)
  if (atSize.length === 0) return 0
  const mine = atSize.filter(l => USE_COVERS[l.use].includes(f))
  return (mine.length ? mine : atSize).reduce((s, l) => s + l.perMetre, 0)
}

/* ── What a rig is carrying, for the screen ───────────────────────────── */

export interface RigHoldingLine {
  itemId: string
  partNumber: string
  name: string
  category: PartCategory
  use: FormationUse
  size?: string
  lifeMetres: number
  kitQty: number           // from "Assign starting kit" — no purchase order
  issuedQty: number        // handed over from the store shelf
  totalQty: number
  totalUsed: number        // scrapped, from the driller's log
  onRig: number
  kitValue: number
  issuedValue: number
  totalValue: number
  avgRate: number
  costPerMetre: number     // blended rate paid ÷ life
}

export function rigHoldings(
  pos: PurchaseOrder[],
  parts: Part[],
  rig: string,
  project: string,
  partsUsed: { itemId: string; qty: number }[],
  rigKit: RigKitEntry[] = [],
): RigHoldingLine[] {
  const units = rigUnits(pos, rigKit, rig, project)
  const used: Record<string, number> = {}
  partsUsed.forEach(u => { used[u.itemId] = (used[u.itemId] ?? 0) + u.qty })

  return Object.values(units)
    .map(u => {
      const part = parts.find(p => p.id === u.itemId)
      if (!part) return null
      const avgRate = u.qty > 0 ? u.value / u.qty : part.rate
      return {
        itemId: u.itemId,
        partNumber: part.partNumber,
        name: part.name,
        category: part.category,
        use: formationUse(part), size: part.holeSize || undefined,
        lifeMetres: part.lifeMetres,
        kitQty: u.kitQty,
        issuedQty: u.issuedQty,
        totalQty: u.qty,
        totalUsed: used[u.itemId] ?? 0,
        onRig: Math.max(0, u.qty - (used[u.itemId] ?? 0)),
        kitValue: u.kitValue,
        issuedValue: u.issuedValue,
        totalValue: u.value,
        avgRate,
        costPerMetre: part.lifeMetres > 0 ? avgRate / part.lifeMetres : 0,
      }
    })
    .filter(Boolean) as RigHoldingLine[]
}

// ── CONSUMPTION ───────────────────────────────────────────────────────────

export interface ConsumptionLine {
  date: string; rig: string; project: string
  itemId: string; qty: number; value: number; poNumber: string
}

export function consumption(pos: PurchaseOrder[], f?: { rig?: string; project?: string; month?: string }): ConsumptionLine[] {
  const out: ConsumptionLine[] = []
  pos.forEach(po => po.issues.forEach(i => {
    if (f?.rig && i.rig !== f.rig) return
    if (f?.project && (i.project ?? po.project) !== f.project) return
    if (f?.month && i.date.slice(0, 7) !== f.month) return
    i.lines.forEach(l => {
      const rate = rateOfLine(po, l.itemId)
      out.push({ date: i.date, rig: i.rig, project: i.project ?? po.project, itemId: l.itemId, qty: l.qty, value: l.qty * rate, poNumber: po.number })
    })
  }))
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

export function consumptionValue(pos: PurchaseOrder[], f?: { rig?: string; project?: string; month?: string }) {
  return consumption(pos, f).reduce((s, c) => s + c.value, 0)
}

/* ==========================================================================
 * TERRAIN — what the ground is actually doing to the parts
 *
 * The catalogue's life figure is a claim: a supplier's number, or whatever
 * was assumed when the tender was priced. The driller's log is what really
 * happened — every shift records the ground it was in and the parts that
 * were scrapped in it.
 *
 * Metres in that ground ÷ units scrapped in that ground = the life the part
 * actually gets. The gap between that and the catalogue is the gap between
 * what a metre was priced at and what it cost.
 * ========================================================================== */

export interface ShiftFact {
  rig: string
  project: string
  date: string
  metres: number
  formation: Formation
  holeSize?: string
  used: { itemId: string; qty: number }[]
}

export interface TerrainCell {
  formation: Formation
  metres: number
  scrapped: number
  observedLife: number | null
  catalogueLife: number
  observedPerMetre: number | null
  cataloguePerMetre: number
  lifeDeltaPct: number | null
  confident: boolean
}

export interface TerrainRow {
  itemId: string
  partNumber: string
  name: string
  category: PartCategory
  use: FormationUse
  rate: number
  catalogueLife: number
  cells: Record<Formation, TerrainCell>
  totalScrapped: number
  totalSpend: number
  worst: TerrainCell | null
  best: TerrainCell | null
}

/* Below this many scrapped units a formation figure is one unlucky bit, not
 * a pattern, so it is shown as evidence rather than as a number to act on. */
export const TERRAIN_MIN_SAMPLE = 3

/* `alsoInclude` carries the parts a rig is holding that have not scrapped a
 * unit yet. They belong in the table: a part running far past its catalogue
 * life is as much a finding as one falling short, and a part that never shows
 * wear usually means the driller is not logging it. */
export function terrainRows(facts: ShiftFact[], parts: Part[], alsoInclude: string[] = []): TerrainRow[] {
  const metresBy: Record<Formation, number> = { Soft: 0, Medium: 0, Hard: 0, 'Very Hard': 0 }
  facts.forEach(f => { metresBy[f.formation] += f.metres })

  const scrapBy: Record<string, Record<Formation, number>> = {}
  facts.forEach(f => f.used.forEach(u => {
    const row = scrapBy[u.itemId] ??= { Soft: 0, Medium: 0, Hard: 0, 'Very Hard': 0 }
    row[f.formation] += u.qty
  }))

  alsoInclude.forEach(id => { scrapBy[id] ??= { Soft: 0, Medium: 0, Hard: 0, 'Very Hard': 0 } })

  return Object.entries(scrapBy).map(([itemId, scrap]) => {
    const part = parts.find(p => p.id === itemId)
    if (!part) return null
    const cells = {} as Record<Formation, TerrainCell>
    FORMATIONS.forEach(f => {
      const metres = metresBy[f]
      const scrapped = scrap[f]
      const observedLife = scrapped > 0 ? metres / scrapped : null
      const confident = scrapped >= TERRAIN_MIN_SAMPLE
      cells[f] = {
        formation: f, metres, scrapped, observedLife,
        catalogueLife: part.lifeMetres,
        observedPerMetre: observedLife && observedLife > 0 ? part.rate / observedLife : null,
        cataloguePerMetre: costPerMetre(part),
        lifeDeltaPct: observedLife != null && part.lifeMetres > 0
          ? ((observedLife - part.lifeMetres) / part.lifeMetres) * 100 : null,
        confident,
      }
    })
    const rated = FORMATIONS.map(f => cells[f]).filter(c => c.confident && c.observedLife != null)
    const totalScrapped = FORMATIONS.reduce((s, f) => s + cells[f].scrapped, 0)
    return {
      itemId, partNumber: part.partNumber, name: part.name,
      category: part.category, use: formationUse(part), rate: part.rate,
      catalogueLife: part.lifeMetres, cells, totalScrapped,
      totalSpend: totalScrapped * part.rate,
      worst: rated.length ? rated.reduce((a, b) => (a.observedLife! < b.observedLife! ? a : b)) : null,
      best: rated.length ? rated.reduce((a, b) => (a.observedLife! > b.observedLife! ? a : b)) : null,
    }
  }).filter(Boolean).sort((a, b) =>
    (b!.totalScrapped > 0 ? 1 : 0) - (a!.totalScrapped > 0 ? 1 : 0) ||
    b!.totalSpend - a!.totalSpend) as TerrainRow[]
}

/* Where the ground actually is, and what each band really costs to drill.
 * Cross that against the rate the client pays for it and you find out which
 * formation is carrying the project and which is losing money per metre. */
export interface GroundBand {
  formation: Formation
  metres: number
  sharePct: number
  toolingPerMetre: number
  toolingSpend: number
}

export function groundMix(facts: ShiftFact[], tooling: ToolingRates): GroundBand[] {
  const metres: Record<Formation, number> = { Soft: 0, Medium: 0, Hard: 0, 'Very Hard': 0 }
  const spend: Record<Formation, number> = { Soft: 0, Medium: 0, Hard: 0, 'Very Hard': 0 }
  facts.forEach(f => { metres[f.formation] += f.metres; spend[f.formation] += f.metres * toolingFor(tooling, f.formation, f.holeSize) })
  const total = FORMATIONS.reduce((s, f) => s + metres[f], 0)
  return FORMATIONS.map(f => ({
    formation: f,
    metres: metres[f],
    sharePct: total > 0 ? (metres[f] / total) * 100 : 0,
    toolingPerMetre: metres[f] > 0 ? spend[f] / metres[f] : tooling.byFormation[f],
    toolingSpend: spend[f],
  })).filter(b => b.metres > 0)
}

/* ==========================================================================
 * SUPPLIERS — the price you actually paid
 *
 * A cheap supplier that ships one part in ten broken is not cheap. Faults
 * have to be re-ordered, and the rig waits. These turn the raw record into
 * the figure that should decide the next order.
 * ========================================================================== */

export interface SupplierInsight extends SupplierPerformance {
  /* Unit price loaded with the proportion that had to be sent back. */
  effectiveLoadingPct: number
  /* Every lead time seen, so reliability is visible instead of an average
   * hiding a range of 8 to 40 days. */
  leadTimes: number[]
  leadMin: number | null
  leadMax: number | null
  leadSpread: number | null
  /* Replacements that arrived faulty again — a different problem from a
   * first-time fault, and worth seeing on its own. */
  reorderRounds: number
  survivedPct: number | null
  /* Value still owed, and the ground that cannot be drilled while it is. */
  owedValue: number
  worstLateDays: number
  /* Faults concentrated in one part, rather than spread across the range. */
  faultByItem: { itemId: string; delivered: number; faulty: number; pct: number }[]
}

export function supplierInsight(
  pos: PurchaseOrder[], suppliers: Supplier[], name: string, today: string,
): SupplierInsight {
  const base = supplierPerformance(pos, suppliers, name)
  const mine = pos.filter(p => p.supplier === name && p.status !== 'draft')

  const leadTimes: number[] = []
  mine.forEach(po => po.receipts.forEach(r => {
    if (po.orderedDate) leadTimes.push(daysBetween(po.orderedDate, r.date))
  }))

  const byItem: Record<string, { delivered: number; faulty: number }> = {}
  mine.forEach(po => po.lines.forEach(l => {
    const e = byItem[l.itemId] ??= { delivered: 0, faulty: 0 }
    e.delivered += qtyReceived(po, l.itemId) + qtyFaulty(po, l.itemId)
    e.faulty += qtyFaulty(po, l.itemId)
  }))

  const rounds = mine.flatMap(p => p.reorders)
  const settled = rounds.filter(r => r.receipt)
  const survived = settled.filter(r => (r.receipt!.damaged + r.receipt!.rejected) === 0).length

  let worstLateDays = 0
  onOrder(pos, today).filter(o => o.supplier === name).forEach(o => {
    if (o.overdueDays && o.overdueDays > worstLateDays) worstLateDays = o.overdueDays
  })

  return {
    ...base,
    effectiveLoadingPct: base.faultyPct ?? 0,
    leadTimes,
    leadMin: leadTimes.length ? Math.min(...leadTimes) : null,
    leadMax: leadTimes.length ? Math.max(...leadTimes) : null,
    leadSpread: leadTimes.length ? Math.max(...leadTimes) - Math.min(...leadTimes) : null,
    reorderRounds: rounds.length,
    survivedPct: settled.length ? (survived / settled.length) * 100 : null,
    owedValue: mine.reduce((s, p) => s + poOpenReorderValue(p), 0),
    worstLateDays,
    faultByItem: Object.entries(byItem)
      .map(([itemId, e]) => ({ itemId, ...e, pct: e.delivered > 0 ? (e.faulty / e.delivered) * 100 : 0 }))
      .filter(e => e.faulty > 0)
      .sort((a, b) => b.pct - a.pct),
  }
}

// ── ALERTS ────────────────────────────────────────────────────────────────

export type AlertKind = 'runningOut' | 'dueSoon' | 'lowStock' | 'overdue' | 'replacement' | 'idle' | 'stranded'
export type AlertLevel = 'info' | 'warn' | 'urgent'

export interface Alert {
  id: string; kind: AlertKind; level: AlertLevel; title: string; detail: string; value?: number
  /* For a part running out: days the store lasts, and the days a rig would
   * stand if it is ordered today (lead time beyond what the store covers). */
  days?: number; gapDays?: number
}

export interface AlertSettings {
  idleDays: number; idleValue: number; coverDays: number
}
export const DEFAULT_ALERTS: AlertSettings = { idleDays: 30, idleValue: 1500, coverDays: 5 }

export interface RigBurn { rig: string; metresPerDay: number; formation: Formation }

export function buildAlerts(
  pos: PurchaseOrder[], parts: Part[], today: string,
  completedProjects: string[], burn: RigBurn[], s: AlertSettings = DEFAULT_ALERTS,
  suppliers: Supplier[] = [],
): Alert[] {
  const out: Alert[] = []
  const nameOf = (id: string) => parts.find(p => p.id === id)?.name ?? id
  const stock = stockInStore(pos, today)

  stock.filter(l => completedProjects.includes(l.project)).forEach(l => {
    out.push({
      id: `stranded_${l.key}`, kind: 'stranded', level: 'warn',
      title: `${nameOf(l.itemId)} is stranded on a closed project`,
      detail: `${l.qty} in the store against ${l.project}, which is complete. Move it or it stays invisible.`,
      value: l.value,
    })
  })

  onOrder(pos, today).forEach(l => {
    if (l.overdueDays == null || l.overdueDays <= 0) return
    out.push({
      id: `late_${l.poNumber}_${l.itemId}`,
      kind: l.awaitingReplacement ? 'replacement' : 'overdue',
      level: l.overdueDays > 14 ? 'urgent' : 'warn',
      title: l.awaitingReplacement
        ? `Replacement for ${nameOf(l.itemId)} is ${l.overdueDays} days late`
        : `${nameOf(l.itemId)} is ${l.overdueDays} days late`,
      detail: `${l.qty} on ${l.poNumber} from ${l.supplier}, due ${l.promisedDate}. Chase it or re-source.`,
      value: l.value,
    })
  })

  /* Arriving soon, and not late yet. The window between "promised next week"
   * and "three days late" is the only stretch where a phone call still changes
   * the outcome, and until now nothing appeared in it at all. A supplier that
   * habitually slips gets a louder warning than one that never has. */
  onOrder(pos, today).forEach(l => {
    if (!l.promisedDate || (l.overdueDays != null && l.overdueDays > 0)) return
    const daysAway = daysBetween(today, l.promisedDate)
    if (daysAway < 0 || daysAway > s.coverDays) return
    const record = suppliers.length ? supplierPerformance(pos, suppliers, l.supplier) : null
    const slips = record?.onTimePct != null && record.onTimePct < 50
    out.push({
      id: `duesoon_${l.poNumber}_${l.itemId}`, kind: 'dueSoon',
      level: slips ? 'warn' : 'info',
      title: l.awaitingReplacement
        ? `Replacement for ${nameOf(l.itemId)} is due ${daysAway === 0 ? 'today' : `in ${daysAway} day${daysAway === 1 ? '' : 's'}`}`
        : `${nameOf(l.itemId)} is due ${daysAway === 0 ? 'today' : `in ${daysAway} day${daysAway === 1 ? '' : 's'}`}`,
      detail: `${l.qty} on ${l.poNumber} from ${l.supplier}, promised ${l.promisedDate}.`
        + (slips ? ` ${l.supplier} has only made ${Math.round(record!.onTimePct!)}% of its dates — worth confirming now.`
                 : ' Confirm it is on its way.'),
      value: l.value,
    })
  })

  pos.forEach(po => openReorders(po).forEach(r => {
    if (r.promisedDate) return
    const age = daysBetween(r.raisedDate, today)
    if (age < 7) return
    out.push({
      id: `reorder_open_${r.id}`, kind: 'replacement', level: age > 21 ? 'urgent' : 'warn',
      title: `${nameOf(r.itemId)} sent back ${age} days ago with no replacement date`,
      detail: `${r.qty} on ${po.number} from ${po.supplier} — ${r.reason}.`,
      value: r.qty * rateOfLine(po, r.itemId),
    })
  }))

  const have: Record<string, number> = {}
  stock.forEach(l => { have[l.itemId] = (have[l.itemId] ?? 0) + l.qty })
  const everOrdered = new Set(pos.flatMap(p => p.lines.map(l => l.itemId)))
  const totalBurn = burn.reduce((a, b) => a + b.metresPerDay, 0)
  const live = parts.filter(p => p.active && everOrdered.has(p.id))

  live.forEach(part => {
    const n = have[part.id] ?? 0
    if (totalBurn <= 0) return
    const metresOfLife = n * part.lifeMetres
    const days = metresOfLife / totalBurn
    if (days >= part.leadTimeDays + s.coverDays) return
    const onWay = onOrder(pos, today).filter(o => o.itemId === part.id).reduce((a, o) => a + o.qty, 0)
    out.push({
      id: `running_${part.id}`, kind: 'runningOut', days: Math.floor(days), gapDays: Math.max(0, Math.ceil(part.leadTimeDays - days)),
      level: days < part.leadTimeDays && onWay === 0 ? 'urgent' : 'warn',
      title: n === 0 ? `${part.name} — none in the store` : `${part.name} runs out in ${Math.floor(days)} days`,
      detail: `${n} in store covers ${Math.round(metresOfLife).toLocaleString('en-US')} m at ${totalBurn.toFixed(1)} m/day. Lead time is ${part.leadTimeDays} days`
        + (onWay > 0 ? `, and ${onWay} is already on order.` : days < part.leadTimeDays ? ' — already too late to avoid a gap.' : ' — order now.'),
      value: Math.max(1, part.minStock - n) * part.rate,
    })
  })

  live.forEach(part => {
    const n = have[part.id] ?? 0
    if (n < part.minStock && !out.some(a => a.id === `running_${part.id}`)) {
      out.push({
        id: `low_${part.id}`, kind: 'lowStock', level: 'info',
        title: `${part.name} is below minimum stock`,
        detail: `${n} in the store against a minimum of ${part.minStock}.`,
        value: (part.minStock - n) * part.rate,
      })
    }
  })

  const idle: Record<string, { qty: number; value: number; oldest: number; pos: Set<string> }> = {}
  stock.filter(l => !completedProjects.includes(l.project)).forEach(l => {
    const e = idle[l.itemId] ??= { qty: 0, value: 0, oldest: 0, pos: new Set() }
    e.qty += l.qty; e.value += l.value
    e.oldest = Math.max(e.oldest, l.ageDays)
    e.pos.add(l.poNumber)
  })
  Object.entries(idle).forEach(([itemId, e]) => {
    if (out.some(a => a.id === `running_${itemId}`)) return
    if (e.oldest < s.idleDays && e.value < s.idleValue) return
    out.push({
      id: `idle_${itemId}`, kind: 'idle',
      level: e.oldest >= s.idleDays * 2 ? 'warn' : 'info',
      title: `${nameOf(itemId)} is sitting in the store`,
      detail: `${e.qty} received up to ${e.oldest} days ago on ${Array.from(e.pos).join(', ')}, not yet issued to any rig.`,
      value: e.value,
    })
  })

  const rank: Record<AlertLevel, number> = { urgent: 0, warn: 1, info: 2 }
  return out.sort((a, b) => rank[a.level] - rank[b.level] || (b.value ?? 0) - (a.value ?? 0))
}

/* ==========================================================================
 * SEED
 * ========================================================================== */

const P = (
  id: string, partNumber: string, name: string, category: PartCategory,
  lifeMetres: number, rate: number,
  supplier: string, leadTimeDays: number, minStock: number,
  use: FormationUse = 'hard+',
): Part => ({
  id, partNumber, name, category, formationUse: use, rate, lifeMetres,
  supplier, leadTimeDays, minStock, active: true,
})

export const SEED_CATALOGUE: Part[] = [
  P('t01', 'HQ-ROD-30',  'HQ Wire Line Drill Rod 3.0 m',   'Rod & Casing', 5000,  650,  'Boart Longyear Saudi', 21, 6,  'all'),
  P('t02', 'HQ-CB-30',   'HQ Core Barrel 3.0 m',           'Core Barrel',  2000,  4900, 'Boart Longyear Saudi', 28, 1,  'all'),
  P('t03', 'HQ-ITA-01',  'HQ Inner Tube Assembly',         'Core Barrel',  2000,  4100, 'Boart Longyear Saudi', 28, 1,  'all'),
  P('t04', 'HQ-RS-01',   'HQ Diamond Reamer Shell',        'Bit',          500,   1430, 'Sandvik Mining',       18, 2,  'hard+'),
  P('t05', 'HQ-OS-01',   'HQ Over Shot Assembly',          'Accessory',    2000,  2860, 'Boart Longyear Saudi', 24, 1,  'all'),
  P('t06', 'HQ-CL-01',   'HQ Core Lifter',                 'Accessory',    20,    82,   'Drillco Tools',        10, 20, 'all'),
  P('t07', 'HQ-CLC-01',  'HQ Core Lifter Case',            'Accessory',    50,    106,  'Drillco Tools',        10, 12, 'all'),
  P('t08', 'HQ-BIT-IMP', 'HQ Impregnated Bit',             'Bit',          100,   1830, 'Sandvik Mining',       18, 3,  'hard+'),
  P('t09', 'HQ-CB-SPR',  'HQ Core Barrel Spares',          'Spares',       500,   3120, 'Boart Longyear Saudi', 28, 1,  'all'),
  P('t10', 'WS-NQNW-01', 'Water Swivel NQ/NW Connection',  'Accessory',    5000,  2080, 'Drillco Tools',        14, 1,  'all'),
  P('t11', 'HP-NQNW-01', 'Hoisting Plug NQ/NW Connection', 'Accessory',    5000,  2450, 'Drillco Tools',        14, 1,  'all'),
  P('t12', 'ADP-01',     'Adaptors',                       'Accessory',    5000,  410,  'Drillco Tools',        10, 2,  'all'),
  P('t13', 'PW-CSG-30',  'PW Casing 3.0 m',                'Rod & Casing', 10000, 900, 'Gulf Casing & Steel',      30, 4,  'soft'),
  P('t14', 'HW-CSG-30',  'HW Casing 3.0 m',                'Rod & Casing', 10000, 735,  'Gulf Casing & Steel',      30, 4,  'soft'),
  P('t15', 'PW-TC-BIT',  'PW Casing TC Bit',               'Bit',          200,   450,  'Gulf Casing & Steel',      30, 2,  'soft'),
  P('t16', 'HW-TC-BIT',  'HW Casing TC / Shoe Bit',        'Bit',          200,   315,  'Gulf Casing & Steel',      30, 2,  'soft'),
  P('t17', 'WS-SPR-02',  'Water Swivel Spares, 2 sets',    'Spares',       5000,  2080, 'Drillco Tools',        14, 1,  'all'),
]

export const SEED_SUPPLIERS: Supplier[] = [
  { id: 's1', name: 'Boart Longyear Saudi', contact: 'Faisal Al-Harbi', phone: '+966 50 214 3381', quotedLeadDays: 25, rating: 5, ratingNote: 'Reliable, never had to chase' },
  { id: 's2', name: 'Sandvik Mining',       contact: 'Omar Siddiqui',  phone: '+966 55 870 1142', quotedLeadDays: 18, rating: 4 },
  { id: 's3', name: 'Drillco Tools',        contact: 'Yousef Al-Qahtani', phone: '+966 53 377 8104', quotedLeadDays: 12, rating: 2, ratingNote: 'Cheap but slow, and packaging is poor' },
  { id: 's4', name: 'Gulf Casing & Steel',      contact: 'Majed Al-Otaibi', phone: '+966 56 208 4519', quotedLeadDays: 30, rating: 3 },
]

const seedRate = (id: string) => SEED_CATALOGUE.find(p => p.id === id)!.rate
type RLine = [string, number, number?, number?]
type ISpec = [string, string, [string, number][]]

const PO = (
  id: string, number: string, supplier: string, project: string,
  createdDate: string, orderedDate: string, promisedDate: string,
  lines: [string, number][],
  receipts: [string, RLine[], DelayReason?][],
  issues: ISpec[],
  reorders: Reorder[] = [],
): PurchaseOrder => ({
  id, number, supplier, project, status: 'ordered', createdDate, orderedDate, promisedDate,
  lines: lines.map(([itemId, qty]) => ({ itemId, qty, rate: seedRate(itemId) })),
  receipts: receipts.map(([date, ls, delayReason], k) => ({
    id: `${id}_r${k}`, date, delayReason,
    lines: ls.map(([itemId, accepted, damaged = 0, rejected = 0]) => ({ itemId, accepted, damaged, rejected })),
  })),
  issues: issues.map(([date, rig, ls], k) => ({
    id: `${id}_i${k}`, date, project, rig, issuedBy: 'Store',
    lines: ls.map(([itemId, qty]) => ({ itemId, qty })),
  })),
  reorders, transfers: [],
})

export const SEED_POS: PurchaseOrder[] = [
  PO('po1', 'PO-2026-041', 'Sandvik Mining', 'Site A - North Field', '2026-08-19', '2026-08-20', '2026-09-07',
    [['t08', 3], ['t04', 2]],
    [['2026-09-05', [['t08', 3], ['t04', 2]]]],
    [['2026-09-18', 'RIG-001', [['t08', 1]]], ['2026-10-03', 'RIG-001', [['t04', 1]]], ['2026-09-19', 'RIG-002', [['t08', 1]]]]),

  PO('po2', 'PO-2026-047', 'Gulf Casing & Steel', 'Site A - North Field', '2026-08-27', '2026-08-28', '2026-09-27',
    [['t13', 4], ['t14', 4], ['t16', 2]],
    [['2026-09-23', [['t14', 4]]]],
    []),

  PO('po3', 'PO-2026-052', 'Drillco Tools', 'Site A - North Field', '2026-09-04', '2026-09-05', '2026-09-17',
    [['t06', 30], ['t07', 20], ['t12', 2]],
    [['2026-09-26', [['t06', 30], ['t07', 18, 2], ['t12', 2]], 'Transport']],
    [['2026-09-29', 'RIG-001', [['t06', 10], ['t07', 8]]], ['2026-10-01', 'RIG-002', [['t06', 8], ['t07', 5]]]],
    [{ id: 'ro_1', itemId: 't07', qty: 2, reason: 'Cases cracked in transit', raisedDate: '2026-09-27', round: 1, status: 'promised', promisedDate: '2026-11-02' }]),

  PO('po4', 'PO-2026-033', 'Boart Longyear Saudi', 'Site A - North Field', '2026-07-23', '2026-07-24', '2026-08-18',
    [['t03', 1], ['t09', 1], ['t05', 1]],
    [['2026-08-15', [['t03', 1], ['t09', 1], ['t05', 1]]]],
    [['2026-09-18', 'RIG-001', [['t03', 1], ['t05', 1]]]]),

  PO('po5', 'PO-2026-055', 'Sandvik Mining', 'Site B - South Ridge', '2026-09-06', '2026-09-07', '2026-09-25',
    [['t08', 2], ['t04', 1]],
    [['2026-09-22', [['t08', 2], ['t04', 1]]]],
    [['2026-09-24', 'RIG-003', [['t08', 2], ['t04', 1]]]]),

  PO('po6', 'PO-2026-018', 'Drillco Tools', 'Site C - East Basin', '2026-06-19', '2026-06-20', '2026-07-07',
    [['t10', 1], ['t17', 1]],
    [['2026-07-05', [['t10', 1], ['t17', 1]]]],
    []),

  PO('po7', 'PO-2026-058', 'Boart Longyear Saudi', 'Site A - North Field', '2026-10-07', '2026-10-08', '2026-11-05',
    [['t01', 6], ['t02', 1]], [], []),

  PO('po10', 'PO-2026-063', 'Sandvik Mining', 'Site A - North Field', '2026-10-09', '2026-10-10', '2026-10-28',
    [['t08', 4], ['t04', 2]],
    [['2026-10-26', [['t08', 4], ['t04', 2]]]],
    [['2026-10-22', 'RIG-001', [['t08', 1]]], ['2026-10-27', 'RIG-001', [['t08', 1], ['t04', 1]]],
     ['2026-10-23', 'RIG-002', [['t08', 1]]]]),

  PO('po11', 'PO-2026-064', 'Drillco Tools', 'Site A - North Field', '2026-10-19', '2026-10-20', '2026-11-03',
    [['t06', 24], ['t07', 16]],
    [],
    []),

  PO('po9', 'PO-2026-060', 'Boart Longyear Saudi', 'Site A - North Field', '2026-09-19', '2026-09-20', '2026-10-11',
    [['t03', 2]],
    [['2026-10-07', [['t03', 1, 1]]]],
    [],
    [
      { id: 'ro_2', itemId: 't03', qty: 1, reason: 'Tube bent, latch would not seat', raisedDate: '2026-10-08', round: 1, status: 'closed', promisedDate: '2026-10-20',
        receipt: { date: '2026-10-20', accepted: 0, damaged: 1, rejected: 0, note: 'Same fault again' } },
      { id: 'ro_3', itemId: 't03', qty: 1, reason: 'Replacement arrived with the same fault', raisedDate: '2026-10-20', round: 2, parentId: 'ro_2', status: 'promised', promisedDate: '2026-11-12' },
    ]),

  { id: 'po8', number: 'PO-2026-061', supplier: 'Drillco Tools', project: 'Site A - North Field',
    status: 'draft', createdDate: '2026-10-19',
    lines: [{ itemId: 't06', qty: 40, rate: seedRate('t06') }, { itemId: 't07', qty: 25, rate: seedRate('t07') }],
    receipts: [], reorders: [], issues: [], transfers: [], note: 'Awaiting approval' },
]

/* A spare moved from a closed project's store instead of being bought: what
 * the "Before you buy" check on a new order does, kept in the demo record so
 * the Value screen can show it. */
SEED_POS.find(p => p.id === 'po6')?.transfers.push({ id: 'po6_tr1', date: '2026-10-26', itemId: 't17', qty: 1, toProject: 'Site A - North Field', note: 'Moved instead of buying' })

/* Kits are dated before the first shift of the month, which is what a real
 * site does — the rig cannot turn until it is kitted. Date one of these
 * after the first log and the early days of the month read free. */
export const SEED_RIG_KIT: RigKitEntry[] = [
  {
    id: 'rk_seed_1', date: '2026-07-15', addedBy: 'Store', source: 'count',
    project: 'Site A - North Field', rig: 'RIG-001',
    lines: [
      { itemId: 't08', qty: 2, rate: 1830 },
      { itemId: 't06', qty: 8, rate: 82 },
      { itemId: 't07', qty: 5, rate: 106 },
      { itemId: 't01', qty: 6, rate: 650 },
      { itemId: 't14', qty: 2, rate: 735 },
      { itemId: 't16', qty: 1, rate: 315 },
    ],
  },
  {
    id: 'rk_seed_2', date: '2026-07-15', addedBy: 'Store', source: 'count',
    project: 'Site A - North Field', rig: 'RIG-002',
    lines: [
      { itemId: 't08', qty: 1, rate: 1830 },
      { itemId: 't04', qty: 1, rate: 1430 },
      { itemId: 't01', qty: 6, rate: 650 },
      { itemId: 't14', qty: 2, rate: 735 },
    ],
  },
  {
    id: 'rk_seed_3', date: '2026-07-15', addedBy: 'Store', source: 'count',
    project: 'Site B - South Ridge', rig: 'RIG-003',
    lines: [
      { itemId: 't08', qty: 1, rate: 1830 },
      { itemId: 't01', qty: 6, rate: 650 },
    ],
  },
]

export const PROJECTS = ['Site A - North Field', 'Site B - South Ridge', 'Site C - East Basin']
export const COMPLETED_PROJECTS = ['Site C - East Basin']
export const RIGS = ['RIG-001', 'RIG-002', 'RIG-003']
export const PROJECT_CODES: Record<string, string> = {
  'Site A - North Field': 'PRJ-001',
  'Site B - South Ridge': 'PRJ-002',
  'Site C - East Basin': 'PRJ-003',
}
export function projectCode(name: string) {
  return PROJECT_CODES[name] ?? name.match(/^([A-Za-z]+-\d+)/)?.[1] ?? name
}
export function isLiveProject(name: string) { return !COMPLETED_PROJECTS.includes(name) }

/* ==========================================================================
 * STORE
 * ========================================================================== */

interface State {
  catalogue: Part[]
  suppliers: Supplier[]
  pos: PurchaseOrder[]
  rigKit: RigKitEntry[]
  storeStock: StoreStockEntry[]
  alerts: AlertSettings
  rigCounts: RigCount[]
  valuation: Valuation
}

function initial(): State {
  return {
    catalogue: SEED_CATALOGUE, suppliers: SEED_SUPPLIERS, pos: SEED_POS,
    rigKit: SEED_RIG_KIT, storeStock: [], alerts: DEFAULT_ALERTS, rigCounts: [], valuation: 'charge',
  }
}

export const seedInventoryState = () => initial()
function emptyInventory(): State {
  return { catalogue: [], suppliers: [], pos: [], rigKit: [], storeStock: [], alerts: DEFAULT_ALERTS, rigCounts: [], valuation: 'charge' }
}

let seq = 0
export const uid = (p: string) => `${p}_${Date.now()}_${++seq}_${Math.floor(Math.random() * 9999)}`

interface Ctx {
  state: State
  savePart: (p: Part) => void
  importParts: (parts: Part[]) => void
  deletePart: (id: string) => void
  saveSupplier: (s: Supplier) => void
  savePO: (po: PurchaseOrder) => void
  deletePO: (id: string) => void
  placeOrder: (id: string, orderedDate: string, promisedDate: string) => void
  addReceipt: (poId: string, r: Omit<Receipt, 'id'>) => void
  addReorder: (poId: string, r: Omit<Reorder, 'id'>) => void
  updateReorder: (poId: string, r: Reorder) => void
  receiveReorder: (poId: string, reorderId: string, receipt: ReorderReceipt) => void
  addIssue: (poId: string, i: Omit<Issue, 'id'>) => void
  addTransfer: (poId: string, t: Omit<Transfer, 'id'>) => void
  addStoreStock: (e: Omit<StoreStockEntry, 'id'>) => void
  addRigKit: (e: Omit<RigKitEntry, 'id'>) => void
  addRigCount: (c: Omit<RigCount, 'id'>, found?: Omit<RigKitEntry, 'id'>) => void
  setValuation: (v: Valuation) => void
  saveAlertSettings: (s: AlertSettings) => void
  resetAll: () => void
}

const InvCtx = createContext<Ctx | null>(null)
const KEY = 'xplorix_inventory_v13_sar'
const LEGACY_KEY = 'xplorix_inventory_sar_legacy'

/* One store per browser tab. The root layout mounts this once; the Finance and
 * Inventory routes also wrap themselves in it, and when they do they join the
 * one already above them rather than keeping a second copy of the stock. */
export function InventoryProvider({ children }: { children: ReactNode }) {
  const parent = useContext(InvCtx)
  if (parent) return <>{children}</>
  return <InventoryRoot>{children}</InventoryRoot>
}

function InventoryRoot({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(initial)
  const [loaded, setLoaded] = useState(false)
  // Kept on the server when a database is connected; in this browser when not.
  const sync = useServerSync('inventory', state, setState, emptyInventory)
  const local = sync.mode === 'demo'

  useEffect(() => {
    if (!local) return
    try {
      const base = initial()
      const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY)
      if (raw) {
        const saved = JSON.parse(raw)
        /* v10 called these openingStock and openingBalance. Same data, so it
         * is carried across rather than thrown away. */
        const rigKit = saved.rigKit ?? saved.openingStock ?? []
        const storeStock = saved.storeStock ?? saved.openingBalance ?? []
        setState({
          ...base,
          ...saved,
          rigKit: rigKit.length > 0 ? rigKit : base.rigKit,
          storeStock,
        })
      }
    } catch {}
    setLoaded(true)
  }, [local])
  useEffect(() => { if (local && loaded) try { localStorage.setItem(KEY, JSON.stringify(state)) } catch {} }, [state, loaded, local])

  function up<T extends { id: string }>(list: T[], x: T): T[] {
    return list.some(i => i.id === x.id) ? list.map(i => i.id === x.id ? x : i) : [...list, x]
  }
  const onPO = (id: string, f: (po: PurchaseOrder) => PurchaseOrder) =>
    setState(s => ({ ...s, pos: s.pos.map(p => p.id === id ? f(p) : p) }))

  return (
    <InvCtx.Provider value={{
      state,
      savePart: p => setState(s => ({ ...s, catalogue: up(s.catalogue, p) })),
      importParts: parts => setState(s => {
        let cat = s.catalogue
        parts.forEach(p => {
          const existing = cat.find(x =>
            (p.partNumber && x.partNumber?.toLowerCase() === p.partNumber.toLowerCase()) ||
            x.name.toLowerCase() === p.name.toLowerCase())
          cat = existing ? cat.map(x => x.id === existing.id ? { ...p, id: existing.id } : x) : [...cat, p]
        })
        return { ...s, catalogue: cat }
      }),
      deletePart: id => setState(s => {
        const used = s.pos.some(p => p.lines.some(l => l.itemId === id))
        return {
          ...s,
          catalogue: used
            ? s.catalogue.map(p => p.id === id ? { ...p, active: false } : p)
            : s.catalogue.filter(p => p.id !== id),
        }
      }),
      saveSupplier: x => setState(s => ({ ...s, suppliers: up(s.suppliers, x) })),
      savePO: po => setState(s => ({ ...s, pos: up(s.pos, po) })),
      deletePO: id => setState(s => ({ ...s, pos: s.pos.filter(p => p.id !== id) })),
      placeOrder: (id, orderedDate, promisedDate) =>
        onPO(id, p => ({ ...p, status: 'ordered', orderedDate, promisedDate })),
      addReceipt: (poId, r) => onPO(poId, p => ({ ...p, receipts: [...p.receipts, { ...r, id: uid('rc') }] })),
      addReorder: (poId, r) => onPO(poId, p => ({ ...p, reorders: [...p.reorders, { ...r, id: uid('ro') }] })),
      updateReorder: (poId, r) => onPO(poId, p => ({ ...p, reorders: p.reorders.map(x => x.id === r.id ? r : x) })),
      receiveReorder: (poId, reorderId, receipt) => onPO(poId, p => {
        const target = p.reorders.find(r => r.id === reorderId)
        if (!target) return p
        const closed: Reorder = { ...target, receipt, status: 'closed' }
        const faulty = receipt.damaged + receipt.rejected
        const next: Reorder[] = faulty > 0 ? [{
          id: uid('ro'), itemId: target.itemId, qty: faulty,
          reason: `Round ${target.round} replacement arrived unusable`,
          raisedDate: receipt.date, round: target.round + 1, parentId: target.id, status: 'raised',
        }] : []
        return { ...p, reorders: [...p.reorders.map(r => r.id === reorderId ? closed : r), ...next] }
      }),
      addIssue: (poId, i) => onPO(poId, p => ({ ...p, issues: [...p.issues, { ...i, id: uid('is') }] })),
      addTransfer: (poId, t) => onPO(poId, p => ({ ...p, transfers: [...p.transfers, { ...t, id: uid('tr') }] })),
      addStoreStock: e => setState(s => ({ ...s, storeStock: [...s.storeStock, { ...e, id: uid('ss') }] })),
      addRigKit: e => setState(s => ({ ...s, rigKit: [...s.rigKit, { ...e, id: uid('rk') }] })),
      addRigCount: (c, found) => setState(s => ({
        ...s, rigCounts: [...(s.rigCounts ?? []), { ...c, id: uid('rc') }],
        rigKit: found && found.lines.length ? [...s.rigKit, { ...found, id: uid('rk') }] : s.rigKit,
      })),
      setValuation: v => setState(s => ({ ...s, valuation: v })),
      saveAlertSettings: a => setState(s => ({ ...s, alerts: a })),
      resetAll: () => setState(initial()),
    }}>{children}</InvCtx.Provider>
  )
}

export function useInventory() {
  const c = useContext(InvCtx)
  if (!c) throw new Error('useInventory must be used inside InventoryProvider')
  return c
}

/* ── Formatting ─────────────────────────────────────────────────────────── */

const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

export function money(n: number) {
  return `${n < 0 ? '−' : ''}SAR ${Math.abs(Math.round(n)).toLocaleString('en-US')}`
}
export function moneyL(n: number) {
  const a = Math.abs(n)
  if (a >= 1000000) return `${n < 0 ? '−' : ''}SAR ${(a / 1000000).toFixed(2)}M`
  if (a >= 100000) return `${n < 0 ? '−' : ''}SAR ${Math.round(a / 1000)}K`
  return money(n)
}
export function perMetre(n: number) { return `SAR ${n.toFixed(2)}/m` }
export function dayLabel(d: string) {
  const [, m, day] = d.split('-').map(Number)
  return `${day} ${MON[m - 1]}`
}
export function fullDate(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  return `${day} ${MON[m - 1]} ${y}`
}
export function monthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}

/* ── Compatibility ──────────────────────────────────────────────────────────
 * Old names, kept so nothing outside these files breaks on the rename. Use
 * the new names in anything you write from here. */
export const startupStore = rigHoldings
export type StartupLine = RigHoldingLine
export type OpeningStockEntry = RigKitEntry
export type OpeningBalanceEntry = StoreStockEntry
