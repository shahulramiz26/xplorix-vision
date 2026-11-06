'use client'

import { SEED_RIGS, SEED_CREW, type RigRecord, type CrewMember } from './registers'
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import {
  normFormation as groundOf, TODAY, toolingFor,
  PROJECTS as INV_PROJECTS, COMPLETED_PROJECTS as INV_COMPLETED, RIGS as INV_RIGS, PROJECT_CODES as INV_CODES,
} from './inventory-store'
import type { ToolingRates, Formation } from './inventory-store'
import type { LogTrust, LogChange } from './log-checks'
import {
  reportToShift, seedBills,
  type Contractor, type WorkOrder, type ContractorReport, type ContractorBill, type ShiftCheck, type Wording, type BillSnapshot,
} from './contracting'
import { seedInvoices } from './client-record'
import { useServerSync } from './backend'
import { COMPANY_CODE, IS_DEMO } from './company'
import type { Collar, CoordSystem } from './geo'
import type { ShiftSurvey, SurveyReading, SurveyProfile } from './survey'
import { withSeedGeometry, seedSurveys, DEMO_SITES } from './seed-survey'

/* ==========================================================================
 * XPLORIX COSTING
 *
 * Two rules run through this whole file.
 *
 * 1. Quantities come from the logs. Rates come from Set rates.
 *    Metres, hours, crew counts, fuel, water and additives are recorded in the
 *    driller's log; repair cost comes from the maintenance log; parts from
 *    inventory. Nothing measurable is ever typed on a costing screen.
 *
 * 2. Rates are dated, and costing looks up the rate in force on the day.
 *    A hole closed in March keeps its March rate forever. Reclassify in month
 *    four and month four onward changes; nothing before it moves. An invoice
 *    already sent can never silently stop matching the screen.
 *
 * Cost is built in layers and the UI keeps them apart:
 *
 *   operating   fuel + water + additives + crew + repairs + parts
 *   ownership   depreciation + EMI + insurance, allocated per day
 *   full        operating + ownership          <- cost per unit divides this
 *
 * Mobilisation and demobilisation sit outside that stack: dated lump sums,
 * billed on their own line. Spreading a one-off move across a month's metres
 * makes every hole that month read wrong.
 * ========================================================================== */

// ── LOGS (read-only sources) ──────────────────────────────────────────────

export type ShiftName = 'Day' | 'Night'

/* What a shift took out of a part.
 *
 *   metres / days   how far the part ran — wear, which carries across shifts
 *   qty             how many whole units were finished off and scrapped
 *
 * The two are different facts. Seven metres of very hard ground wears a bit
 * far more than seven metres of soft, and a bit that shatters at 40 m is
 * scrapped whole even though it had barely worn. Only the driller knows that
 * happened, so qty is suggested from the wear and then left editable.
 *
 * metres and days are optional: a log written before wear was recorded still
 * reads, with each unit counting as one whole life. */
export interface PartUsage {
  itemId: string
  qty: number
  metres?: number
  days?: number
  note?: string
}

/* One row per shift, matching the driller's log form. Two shifts make a day. */
export interface ShiftLog {
  id: string
  rig: string
  project: string
  date: string              // YYYY-MM-DD
  shift: ShiftName
  holeNumber: string | null
  crewCount: number
  shiftHours: number
  drillingHours: number
  downtimeHours: number
  downtimeReason: string
  metresDrilled: number
  coreRecovery: number      // metres of core recovered
  holeSize: string          // NQ / HQ / PQ — drives the size adjustment
  formationType: string     // lithology; drives both cost and revenue
  // Set from "Hole Closed This Shift?" in the driller's log. Finance never
  // decides when a hole is finished — it reads that decision and the hole
  // appears in Drillholes as Closed, waiting for approval.
  holeClosedThisShift?: boolean
  /* Parts consumed this shift, picked from the parts catalogue. This is the
   * only place parts actually used gets recorded — the store knows what it
   * issued, but only the driller knows what went into the ground. */
  partsUsed?: PartUsage[]
  fuelLitres: number
  waterLitres: number
  additivesKg: number
  /* Set when the rig belongs to a contractor working for us under a work
   * order. The shift then carries no fuel, crew or parts of ours: what it cost
   * us is what the work order says we pay for those metres. Only a shift that
   * our own site staff has checked gets this far, and `check` says who checked
   * it and what the contractor first reported. */
  contractor?: string
  workOrderId?: string
  check?: ShiftCheck

  /* What the drill log form records beyond the figures costing needs. All
   * optional, so a log written before the form asked for them still reads. */
  supervisor?: string
  driller?: string
  engineHmr?: number          // the engine's hour-meter reading at the end of the shift
  engineHours?: number        // hours the engine ran this shift
  meterStart?: number         // depth of the hole at the start of the shift
  meterEnd?: number
  lithology?: string
  standbyMode?: boolean       // the whole shift was on hold for the client
  /* Whose stop it was. Internal is our own and never billable; client is
   * standby. When set it decides the day's status; `downtimeReason` then
   * carries the reason with the most hours. */
  downtimeSide?: 'internal' | 'client'
  downtime?: DowntimeLine[]
  bitRuns?: BitRun[]
  equipmentUsed?: { name: string; hours: number }[]
  incidents?: { type: string; severity: string; note: string }[]
  attachments?: string[]      // file names; the MVP keeps the name, not the file
  notes?: string
  /* Downhole survey readings taken this shift. Optional: most shifts have none.
   * (Tray photos are not kept here: they belong to XPLORIX Core.) */
  surveys?: ShiftSurvey[]
  /* A second hole started in the same shift after this one was closed. Its
   * metres are kept as a second row (`segmentOf` points back here) so every
   * metre sits on the hole it was drilled in. */
  nextHole?: NextHole
  segmentOf?: string
  loggedBy?: string
  loggedAt?: string           // YYYY-MM-DDTHH:MM
  editedBy?: string
  editedAt?: string
  /* What the drill log checks said when the shift was saved, and the reason
   * the supervisor gave for each warning (lib/log-checks.ts). */
  trust?: LogTrust
  /* Every change made after the shift was first saved: who, when, what. */
  history?: LogChange[]
}

export interface DowntimeLine { reason: string; side: 'internal' | 'client'; hours: number }
export interface BitRun { itemId: string; serialNo?: string; meterStart: number; meterEnd: number; replaced: boolean; notes?: string }
export interface NextHole {
  holeNumber: string; holeSize: string
  started: boolean            // false: opened, no metres yet
  meterStart: number; meterEnd: number
  coreRecovery?: number       // metres of core from the new hole
  formationType: string; lithology?: string
}

/* The row that carries a second hole's metres. Hours, crew, fuel and parts
 * stay on the first row: they belong to the shift, not to a hole. */
export function segmentFor(log: ShiftLog): ShiftLog | null {
  const n = log.nextHole
  if (!n || !n.started || !(n.meterEnd > n.meterStart)) return null
  return {
    id: `${log.id}_b`, segmentOf: log.id, rig: log.rig, project: log.project, date: log.date, shift: log.shift,
    holeNumber: n.holeNumber, crewCount: 0, shiftHours: 0, drillingHours: 0, downtimeHours: 0, downtimeReason: '',
    metresDrilled: Math.round((n.meterEnd - n.meterStart) * 100) / 100,
    coreRecovery: Math.min(n.coreRecovery ?? 0, Math.round((n.meterEnd - n.meterStart) * 100) / 100),
    holeSize: n.holeSize, formationType: n.formationType, lithology: n.lithology,
    meterStart: n.meterStart, meterEnd: n.meterEnd,
    partsUsed: [], fuelLitres: 0, waterLitres: 0, additivesKg: 0,
    contractor: log.contractor, workOrderId: log.workOrderId, check: log.check,
    supervisor: log.supervisor, driller: log.driller,
  }
}

/* Shifts in the order they happened: by date, day before night, and a second
 * hole after the hole that was closed in the same shift. */
export function shiftOrder(l: { date: string; shift: string; segmentOf?: string }) {
  return `${l.date}${l.shift === 'Day' ? '0' : '1'}${l.segmentOf ? '1' : '0'}`
}

/* Where each shift's hole stood when the shift began, worked out from every
 * shift before it on the same hole. One index for the whole record, so a
 * hole's depth carries across months and across rigs. */
export function depthIndex(logs: ShiftLog[]): Record<string, number> {
  const depth: Record<string, number> = {}
  const at: Record<string, number> = {}
  ;[...logs].sort((a, b) => shiftOrder(a).localeCompare(shiftOrder(b))).forEach(l => {
    if (!l.holeNumber) return
    at[l.id] = depth[l.holeNumber] ?? 0
    depth[l.holeNumber] = at[l.id] + l.metresDrilled
  })
  return at
}

export interface MaintenanceLog {
  id: string
  rig: string
  project: string
  date: string
  maintenanceType: MaintenanceType
  hours: number
  component: string         // one or more, joined with a comma
  action: string
  cost: number              // service or repair cost only, already in rupees; parts are costed from inventory
  shift?: ShiftName
  supervisor?: string
  partsUsed?: { itemId: string; qty: number }[]
  engineOilL?: number
  hydraulicOilL?: number
  transmissionOilL?: number
  attachments?: string[]
  notes?: string
  // A contractor's rig: his repair, recorded for the downtime, never our cost.
  contractor?: string
  workOrderId?: string
  loggedBy?: string
  loggedAt?: string
  editedBy?: string
  editedAt?: string
}
export type MaintenanceType = 'Preventive' | 'Breakdown' | 'Scheduled' | 'Component Replacement'
export const MAINTENANCE_TYPES: MaintenanceType[] = ['Breakdown', 'Preventive', 'Scheduled', 'Component Replacement']
export const MAINTENANCE_TYPE_LABEL: Record<MaintenanceType, string> = {
  Breakdown: 'Breakdown maintenance', Preventive: 'Preventive maintenance', Scheduled: 'Scheduled service', 'Component Replacement': 'Component replacement',
}
export const MAINTENANCE_ACTIONS = ['Repair performed', 'Part replaced', 'Inspection', 'Temporary fix', 'Adjustment']

/* A rig is drilling, broken, or standing by. There is no "idle": a day with no
 * drilling is standby — the client stopped work — and standby has its own
 * rate. Breakdown stays separate because it is the contractor's own fault and
 * can never be billed to the client. */
export type DayStatus = 'drilling' | 'standby' | 'breakdown'

export const DAY_STATUS_LABEL: Record<DayStatus, string> = {
  drilling: 'Drilling', standby: 'Standby', breakdown: 'Breakdown',
}

/* Downtime reasons that are the contractor's own problem. Everything else —
 * waiting for instruction, weather, safety hold, site access — is the client
 * stopping work, which is standby and is billable. */
export const BREAKDOWN_REASONS = [
  'Mechanical Breakdown', 'Hydraulic Issue', 'Electrical Fault',
  'Bit Change', 'Rod Change', 'Fuel Shortage', 'Operator Delay',
  'Rig Move', 'Hole Problem',
  // A contractor's stoppage that our site staff did not accept as standby.
  'Contractor Delay',
]

/* Was the stop ours? The form says so directly; an older log is read from
 * its reason. */
export function isOwnStop(s: Pick<ShiftLog, 'downtimeSide' | 'downtimeReason' | 'downtimeHours'>) {
  if (s.downtimeHours <= 0) return false
  return s.downtimeSide ? s.downtimeSide === 'internal' : BREAKDOWN_REASONS.includes(s.downtimeReason)
}

export function statusForShifts(shifts: ShiftLog[]): DayStatus {
  if (shifts.some(s => s.drillingHours > 0)) return 'drilling'
  if (shifts.some(s => isOwnStop(s))) return 'breakdown'
  return 'standby'
}

// ── RIG OWNERSHIP (Set rates → Rig cost) ──────────────────────────────────

export type AllocationBasis = 'operatingDay' | 'expectedUnit'
export type CostBasis = 'cash' | 'accounting'

export interface RigOwnership {
  id: string
  rig: string
  effectiveFrom: string
  note?: string

  basicPrice: number
  gstPercent: number
  transportation: number
  landedPriceOverride?: number

  depreciationRatePct: number
  depPerMonthOverride?: number

  // The EMI is typed, not computed — contractors already know their monthly
  // figure. `emiEndsMonth` is optional but worth filling: without it a closed
  // loan keeps charging forever and the rig looks permanently expensive.
  emiPerMonth: number
  emiEndsMonth?: string     // YYYY-MM, blank = no expiry
  insurancePerYear: number
  otherFixedPerMonth: number

  costBasis: CostBasis
  allocationBasis: AllocationBasis
  expectedOperatingDays: number
  expectedUnitsPerMonth: number
  ownershipPerDayOverride?: number
}

// ── OPERATING & LABOUR (Set rates → Operating cost) ───────────────────────

export interface OperatingRate {
  id: string
  rig: string
  project: string
  effectiveFrom: string
  note?: string

  // Unit prices only — the quantities come from the driller's log
  fuelPricePerLitre: number
  waterPricePerLitre: number
  additivePricePerKg: number

  // Labour. Crew count per shift comes from the log; only the rates are here.
  labourRate: number      // per head per shift, or per metre
  lodgingRate: number     // per head per night, or per metre
  transportRate: number   // per day, or per metre
  // On, the three rates above are charged against metres drilled instead of
  // against days and heads. Crew count then stops affecting cost, which is
  // simpler but throws away what the log knows.
  chargePerMetre: boolean
}

// ── CLIENT RATE (Set rates → Client cost) ─────────────────────────────────

/* A rate line, straight off the tender: a size, a formation, and a rate.
 * "Drilling in soft rock, HQ size — SAR 5,500 per m" is one row.
 *
 * Adjustments hang off their own row, not the project, because the tender's
 * conditions are written per line: "in case NQ size drilling is done before
 * 400 m depth, the rate shall decrease by 20%". Nothing about that is
 * standard, so the size, depth and percentage are all typed. */
export interface RateAdjustment {
  id: string
  condition: 'above' | 'below'
  depth: number
  adjustPct: number       // negative reduces the rate
}

/* One line covers a size, a formation and a depth range. Leave formation as
 * ANY_FORMATION and it matches whatever the log says; leave the depth range
 * blank and it applies at any depth. That one shape covers both contracts:
 *
 *   government   size + formation, no depth range
 *   private      size + ANY formation + depth bands
 *
 * and a contract that prices hard rock differently deep than shallow is just
 * both at once. */
export const ANY_FORMATION = 'Any formation'

export interface RateRow {
  id: string
  holeSize: string        // NQ / HQ / PQ / BQ / AQ
  formation: string       // a rock category, or ANY_FORMATION
  fromDepth?: number      // blank = from surface
  toDepth?: number        // blank = no limit
  rate: number            // SAR per metre
  adjustments: RateAdjustment[]
}

/* Two shapes, chosen per project because a client contract is one or the other:
 *
 *   flat   priced by formation — soft, hard, very hard — at any depth
 *   slab   priced by depth band — 0–50, 50–100, 100+ — whatever the rock
 *
 * The rows carry both sets of fields; the structure decides which are used and
 * which the editor shows, so switching never destroys what was typed. */
export type RateStructure = 'flat' | 'slab'

export interface ClientRate {
  id: string
  project: string
  effectiveFrom: string
  note?: string
  structure: RateStructure
  rateRows: RateRow[]
  standbyPerDay: number
  mobilisation: number
  demobilisation: number
}

/* The driller's log says "Very Hard Formation"; a tender says "Very hard rock".
 * Same thing, so both are reduced to their bare words before matching. */
export function normFormation(v: string) {
  return v.toLowerCase().replace(/formation|strata|rock/g, '').replace(/\s+/g, ' ').trim()
}

export function rateRowFor(cr: ClientRate | undefined, holeSize: string, formation: string, depth: number): RateRow | undefined {
  if (!cr) return undefined
  if (cr.structure === 'flat') {
    return cr.rateRows.find(r => r.holeSize === holeSize &&
      (r.formation === ANY_FORMATION || normFormation(r.formation) === normFormation(formation)))
  }
  return cr.rateRows.find(r => r.holeSize === holeSize &&
    (r.fromDepth == null || depth >= r.fromDepth) &&
    (r.toDepth == null || depth < r.toDepth))
}

export function structureLabel(cr: ClientRate | undefined) {
  if (!cr) return '—'
  return cr.structure === 'flat'
    ? `Flat · ${cr.rateRows.length} formation${cr.rateRows.length === 1 ? '' : 's'}`
    : `Slab · ${cr.rateRows.length} band${cr.rateRows.length === 1 ? '' : 's'}`
}

export interface Charge {
  date: string
  shift: ShiftName
  holeNumber: string | null
  holeSize: string
  formation: string
  fromDepth: number
  toDepth: number
  metres: number
  rate: number
  adjustmentPct: number
  amount: number
  matched: boolean
  /* Priced by depth band: the ground is still recorded but does not split the
   * bill, so all the metres in one band make one invoice line. */
  slab?: boolean
}

export function chargeShift(cr: ClientRate | undefined, log: ShiftLog, fromDepth: number): Charge[] {
  const out: Charge[] = []
  /* Depths to the centimetre. Depth is a running sum of logged metres, and a
   * sum like 90.1 + 9.9 lands a hair past 100 m — which would leave a sliver
   * of hole outside every rate band and raise a false "no rate" warning. */
  const cm = (x: number) => Math.round(x * 100) / 100
  const to = cm(fromDepth + log.metresDrilled)
  let d = cm(fromDepth)
  let guard = 0
  while (d < to && guard++ < 50) {
    const row = rateRowFor(cr, log.holeSize, log.formationType, d)
    const limit = row?.toDepth ?? to
    const hi = Math.min(to, limit)
    if (hi <= d) break
    const adjustmentPct = row ? adjustmentFor(row, d) : 0
    const rate = (row?.rate ?? 0) * (1 + adjustmentPct / 100)
    out.push({
      date: log.date, shift: log.shift, holeNumber: log.holeNumber,
      holeSize: log.holeSize, formation: log.formationType,
      fromDepth: d, toDepth: hi, metres: hi - d,
      rate, adjustmentPct, amount: (hi - d) * rate, matched: !!row,
      slab: cr?.structure === 'slab' || undefined,
    })
    d = hi
  }
  return out
}

// ── HOLE ──────────────────────────────────────────────────────────────────

/* 'submitted' only exists on a project shown to its client: the
 * contractor sends the closed hole across, and it is the owner who approves
 * it. On every other project the contractor still approves his own hole and
 * the status goes straight from closed to approved, exactly as before. */
export type HoleStatus = 'drilling' | 'closed' | 'submitted' | 'approved' | 'invoiced'

export const HOLE_STATUS_LABEL: Record<HoleStatus, string> = {
  drilling: 'Drilling', closed: 'Closed', submitted: 'With the client',
  approved: 'Approved', invoiced: 'Invoiced',
}

export interface HoleState {
  status: HoleStatus
  invoiceId?: string
  submittedAt?: string      // when it was sent to the client
  decidedAt?: string        // when the client approved or returned it
  returnReason?: string     // set when the owner sent it back; cleared on resend
}

export interface Hole {
  holeNumber: string
  rig: string
  project: string
  startDate: string
  endDate?: string
  status: HoleStatus
  invoiceId?: string
  submittedAt?: string
  decidedAt?: string
  returnReason?: string
}

/* What was planned for a hole before the first metre. Planned depth is the one
 * number the client needs to read progress: "planned 400 m, drilled 388 m". */
export interface HolePlan {
  plannedDepth: number
  project?: string
  holeSize?: string
  note?: string                       // what the hole is for, in the planner's words
  by?: 'contractor' | 'owner'         // who put it on the plan
  addedAt?: string
  /* Where the hole starts and which way it is meant to go. The collar is in
   * the project's coordinates (latitude/longitude or UTM); azimuth is the
   * compass bearing and dip the angle from flat, negative going down. */
  collar?: Collar
  azimuth?: number
  dip?: number
}

// ── PROJECT ───────────────────────────────────────────────────────────────
/* One record per project, and the only one. Finance, Inventory, the drill log,
 * the Dashboard and the Client Portal all read it, so a project created on the
 * Projects screen exists everywhere at once.
 *
 * `name` is what every shift log, rate and invoice is filed under. `shared`
 * means the client is on XPLORIX: the project, its contract rates, its planned
 * holes and the rigs and crew on site appear in the Client Portal, a closed
 * hole goes to the client for approval, and an invoice goes to him for
 * line-by-line checking. Costs and margin are never part of what is shared. */
export type ProjectStatus = 'active' | 'on-hold' | 'completed'
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  active: 'Active', 'on-hold': 'On hold', completed: 'Completed',
}
export interface ProjectRecord {
  id: string              // the project code: stable, used in links
  name: string
  code: string
  location: string
  client: string
  status: ProjectStatus
  startDate: string
  plannedMetres?: number
  /* The metres a rig should make in a day on this project: the KPI. Your own
   * figure, never shown to the client or the contractor. */
  dailyTarget?: number
  /* The budget: what the whole project may cost, and what a metre should
   * cost. Your own figures, like the daily target: never shown to the client,
   * the contractor or a supervisor. */
  budgetTotal?: number
  budgetPerMetre?: number
  /* When the plan says drilling ends. With the start date and the metres it
   * draws the planned line of the plan-against-actual chart. */
  plannedEnd?: string
  /* How the project's collars are written: latitude/longitude, or UTM metres
   * in the zone given (e.g. 43N). */
  coords?: CoordSystem
  utmZone?: string
  holeSize: string
  shared: boolean
  rigs: string[]
  supervisors: string[]
  drillers: string[]
  createdAt: string
}

/* Everything that changes on a project leaves a line here: who changed what
 * and when. It is the contractor's activity list and the client's "what
 * changed" list — the same lines — and the unseen ones are the notifications. */
export type ProjectEventKind = 'created' | 'shared' | 'details' | 'status' | 'rig' | 'crew' | 'hole' | 'rates'
export interface ProjectEvent {
  id: string
  project: string
  at: string              // YYYY-MM-DDTHH:MM
  kind: ProjectEventKind
  by: 'contractor' | 'owner'
  title: string
  detail?: string
  seenByOwner?: boolean
  seenByContractor?: boolean
}

/* A rate is a contract, so on a shared project the contractor cannot change it
 * alone. A new set of rates is a proposal; it becomes a client rate — and
 * starts pricing metres — only when the client accepts it. */
export type ProposalStatus = 'waiting' | 'accepted' | 'returned' | 'withdrawn'
export interface RateProposal {
  id: string
  project: string
  rate: ClientRate
  proposedAt: string
  status: ProposalStatus
  answeredAt?: string
  ownerNote?: string
}

// ── PROJECTS THE CLIENT CAN SEE ───────────────────────────────────────────
/* Mirrors of the project list for the plain functions in this file and others
 * that are not components and cannot read the store. The store keeps them in
 * step with its own list (see syncRegistry), so they are never typed by hand. */
const DEMO_CLIENT = 'Demo Mining Co.'
/* Projects shown to their client in his login. On these a finished hole goes
 * to the client for approval and an invoice goes to him for checking. */
export const SHARED_PROJECTS: string[] = []
export function isShared(project: string) { return SHARED_PROJECTS.includes(project) }

// ── INVOICE ───────────────────────────────────────────────────────────────
export interface InvoiceLine { label: string; qty: string; rate: string; amount: number; depth?: string }
export interface Invoice {
  id: string
  number: string
  project: string
  client: string
  date: string
  holeNumbers: string[]
  lines: InvoiceLine[]
  subtotal: number
  taxPercent: number
  total: number
  status: InvoiceStatus
  dueDate?: string
  paidDate?: string
  paidAmount?: number
  // Set only on a project shown to its client.
  ownerStatus?: OwnerInvoiceStatus
  lineReviews?: (LineReview | null)[]   // same order as lines; null = not looked at yet
  sentAt?: string
  reviewedAt?: string
  /* Standby days billed on this invoice that were on no hole, as rig|date.
   * Kept so the same day is never billed twice (lib/money-checks.ts). */
  standbyDays?: string[]
}

/* The client's answer, kept apart from the company's own status so
 * neither side can overwrite the other. */
export type OwnerInvoiceStatus = 'awaiting' | 'approved' | 'disputed'
export const OWNER_INVOICE_LABEL: Record<OwnerInvoiceStatus, string> = {
  awaiting: 'Waiting for the client', approved: 'Approved by the client', disputed: 'Disputed by the client',
}
export interface LineReview { status: 'approved' | 'disputed'; reason?: string }

export function ownerStatusFor(lines: InvoiceLine[], reviews: (LineReview | null)[]): OwnerInvoiceStatus {
  if (reviews.some(r => r?.status === 'disputed')) return 'disputed'
  if (lines.length > 0 && lines.every((_, i) => reviews[i]?.status === 'approved')) return 'approved'
  return 'awaiting'
}
export function disputedAmount(i: Invoice) {
  return i.lines.reduce((s, l, k) => s + (i.lineReviews?.[k]?.status === 'disputed' ? l.amount : 0), 0)
}

export type InvoiceStatus = 'draft' | 'pending' | 'paid' | 'cancelled'
export const INVOICE_STATUSES: InvoiceStatus[] = ['draft', 'pending', 'paid', 'cancelled']
export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'Draft', pending: 'Pending', paid: 'Paid', cancelled: 'Cancelled',
}
export function isOverdue(i: Invoice, today: string) {
  return i.status === 'pending' && !!i.dueDate && i.dueDate < today
}
export function outstanding(i: Invoice) {
  return i.status === 'cancelled' ? 0 : Math.max(0, i.total - (i.paidAmount ?? 0))
}

/* ==========================================================================
 * RATE LOOKUP — the version in force on a given date
 * ========================================================================== */

export interface Dated { effectiveFrom: string }

export function versionOn<T extends Dated>(versions: T[], date: string): T | undefined {
  return versions
    .filter(v => v.effectiveFrom <= date)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]
}
export function newestFirst<T extends Dated>(versions: T[]): T[] {
  return [...versions].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
}

/* ==========================================================================
 * OWNERSHIP
 * ========================================================================== */

export function daysInMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}
export function monthOf(date: string) { return date.slice(0, 7) }
export function shiftMonth(ym: string, by: number) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + by, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function monthsBetween(from: string, to: string) {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

export interface OwnershipBreakdown {
  landedPrice: number
  depPerYear: number; depPerMonth: number
  emi: number; emiActive: boolean; emiMonthsLeft: number
  insurancePerMonth: number; otherFixedPerMonth: number
  perMonth: number; perDay: number; perUnit: number
  basisLabel: string
}

export function ownershipBreakdown(o: RigOwnership, ym: string): OwnershipBreakdown {
  const landedPrice = o.landedPriceOverride ??
    (o.basicPrice + o.basicPrice * (o.gstPercent / 100) + o.transportation)

  const depPerYear = landedPrice * (o.depreciationRatePct / 100)
  const depPerMonth = o.depPerMonthOverride ?? depPerYear / 12

  const notExpired = !o.emiEndsMonth || ym <= o.emiEndsMonth
  const active = notExpired && o.costBasis !== 'accounting'
  const emi = active ? o.emiPerMonth : 0

  const insurancePerMonth = o.insurancePerYear / 12
  const perMonth = depPerMonth + emi + insurancePerMonth + o.otherFixedPerMonth

  let perDay = 0
  let basisLabel = ''
  if (o.allocationBasis === 'operatingDay') {
    perDay = o.expectedOperatingDays > 0 ? perMonth / o.expectedOperatingDays : 0
    basisLabel = `÷ ${o.expectedOperatingDays} operating days`
  } else {
    basisLabel = `÷ ${o.expectedUnitsPerMonth} expected metres`
  }
  if (o.ownershipPerDayOverride != null && o.allocationBasis !== 'expectedUnit') {
    perDay = o.ownershipPerDayOverride
  }

  return {
    landedPrice, depPerYear, depPerMonth,
    emi, emiActive: active,
    emiMonthsLeft: o.emiEndsMonth ? Math.max(0, monthsBetween(ym, o.emiEndsMonth)) : -1,
    insurancePerMonth, otherFixedPerMonth: o.otherFixedPerMonth,
    perMonth, perDay,
    perUnit: o.expectedUnitsPerMonth > 0 ? perMonth / o.expectedUnitsPerMonth : 0,
    basisLabel,
  }
}

/* ==========================================================================
 * DAILY COST — one row per calendar day, built from that day's shifts
 * ========================================================================== */

export interface LabourBreakdown {
  labour: number; lodging: number; transport: number
  heads: number; dayCrew: number; nightCrew: number; total: number
  perMetre: boolean
}

export function labourForDay(shifts: ShiftLog[], units: number, r: OperatingRate): LabourBreakdown {
  const dayCrew = shifts.filter(s => s.shift === 'Day').reduce((a, s) => a + s.crewCount, 0)
  const nightCrew = shifts.filter(s => s.shift === 'Night').reduce((a, s) => a + s.crewCount, 0)
  const heads = dayCrew + nightCrew

  if (r.chargePerMetre) {
    const labour = units * r.labourRate
    const lodging = units * r.lodgingRate
    const transport = units * r.transportRate
    return { labour, lodging, transport, heads, dayCrew, nightCrew, perMetre: true, total: labour + lodging + transport }
  }

  const labour = heads * r.labourRate
  const lodging = heads * r.lodgingRate
  const transport = heads > 0 ? r.transportRate : 0
  return { labour, lodging, transport, heads, dayCrew, nightCrew, perMetre: false, total: labour + lodging + transport }
}

/* What the parts cost on a day, split by the ground that wore them out. */
export interface ToolingCharge {
  formation: Formation
  metres: number
  rate: number
  amount: number
}

export interface DayCost {
  date: string; rig: string; project: string
  shifts: ShiftLog[]
  status: DayStatus
  holeNumber: string | null
  submitted: boolean
  drillingHours: number; downtimeHours: number; maintenanceHours: number
  units: number; coreRecovery: number
  fuelLitres: number; waterLitres: number; additivesKg: number
  fuel: number; water: number; additives: number
  labour: LabourBreakdown
  repairs: number; parts: number
  partsByMetre: number
  /* The tooling rate this day was actually charged at — a weighted average
   * across the formations drilled, so a day that cut soft and then hard reads
   * between the two. Shown in the day breakdown so any figure can be traced
   * back to the rig that produced it. */
  toolingRate: number
  toolingByFormation: ToolingCharge[]
  operating: number; ownership: number; total: number
  /* A contractor's rig: what we owe him for the day under his work order.
   * It takes the place of operating and ownership, which are both his. */
  outsourced: boolean
  subcontract: number
  payRate: number
  payUnmatched: boolean
  payCharges: Charge[]
  cpu: number | null
  rate: number
  adjustmentPct: number
  revenue: number
  unmatched: boolean
  charges: Charge[]
}

/* `pay` is given only for a contractor's rig: the work order rates in force on
 * the day (or undefined when none have been set yet). */
export function dayCost(
  date: string, rig: string, project: string,
  shifts: ShiftLog[], maint: MaintenanceLog[],
  op: OperatingRate, own: RigOwnership, ob: OwnershipBreakdown,
  cr: ClientRate | undefined, tooling: ToolingRates, depthSoFar: number | ((s: ShiftLog) => number),
  pay?: { rate: ClientRate | undefined },
): DayCost {
  const outsourced = !!pay
  const submitted = shifts.length > 0
  const status = submitted ? statusForShifts(shifts) : 'standby'
  const sum = (f: (s: ShiftLog) => number) => shifts.reduce((a, s) => a + f(s), 0)

  const units = sum(s => s.metresDrilled)
  const fuelLitres = sum(s => s.fuelLitres)
  const waterLitres = sum(s => s.waterLitres)
  const additivesKg = sum(s => s.additivesKg)

  const fuel = outsourced ? 0 : fuelLitres * op.fuelPricePerLitre
  const water = outsourced ? 0 : waterLitres * op.waterPricePerLitre
  const additives = outsourced ? 0 : additivesKg * op.additivePricePerKg
  const labour = outsourced
    ? { labour: 0, lodging: 0, transport: 0, heads: 0, dayCrew: 0, nightCrew: 0, total: 0, perMetre: false }
    : labourForDay(shifts, units, op)
  const repairs = outsourced ? 0 : maint.reduce((a, m) => a + m.cost, 0)
  const maintenanceHours = maint.reduce((a, m) => a + m.hours, 0)

  /* Parts are amortised, not charged on the day they were bought, and each
   * stretch of hole is charged for the ground it was actually in. Seven metres
   * of soft and eleven of hard on the same day are two different rates,
   * because they wear out two different sets of parts.
   *
   * The rate comes from what this rig was carrying on this date — its starting
   * kit plus everything issued up to it — so issuing a bit on the 14th moves
   * the 14th onward and leaves every day already costed exactly as it was. A
   * standby or breakdown day drills nothing, wears nothing and carries
   * nothing. */
  const toolingByFormation: ToolingCharge[] = []
  shifts.forEach(sh => {
    if (sh.metresDrilled <= 0) return
    const formation = groundOf(sh.formationType)
    // The contractor's bits and rods are his own; the ground is still recorded.
    const rate = outsourced ? 0 : toolingFor(tooling, formation, sh.holeSize)
    const existing = toolingByFormation.find(x => x.formation === formation)
    if (existing) {
      existing.metres += sh.metresDrilled
      existing.amount += sh.metresDrilled * rate
      // Two sizes in the same ground on one day: the rate shown is what the metres averaged.
      existing.rate = existing.metres > 0 ? existing.amount / existing.metres : rate
    } else {
      toolingByFormation.push({ formation, metres: sh.metresDrilled, rate, amount: sh.metresDrilled * rate })
    }
  })
  const partsByMetre = toolingByFormation.reduce((a, x) => a + x.amount, 0)
  const parts = partsByMetre
  const toolingRate = units > 0 ? partsByMetre / units : tooling.blended

  const operating = fuel + water + additives + labour.total + repairs + parts
  const ownership = outsourced ? 0 : own.allocationBasis === 'expectedUnit' ? units * ob.perUnit : ob.perDay

  const holeNumber = shifts.find(s => s.holeNumber)?.holeNumber ?? null
  const ordered = [...shifts].sort((a, b) => shiftOrder(a).localeCompare(shiftOrder(b)))
  const charges: Charge[] = []
  const payCharges: Charge[] = []
  /* Each shift is priced at the depth its own hole had reached. Given a
   * number, the day is one hole and the depth runs on from it; given a
   * function, every shift is looked up, so two holes in a day are each priced
   * at their own depth. */
  let depth = typeof depthSoFar === 'number' ? depthSoFar : 0
  ordered.forEach(sh => {
    if (sh.metresDrilled <= 0) return
    const at = typeof depthSoFar === 'function' ? depthSoFar(sh) : depth
    chargeShift(cr, sh, at).forEach(c => charges.push(c))
    /* The same stretch of hole priced a second time, at the work order's
     * rates: a work order is a client rate read from the paying side. */
    if (pay) chargeShift(pay.rate, sh, at).forEach(c => payCharges.push(c))
    depth = at + sh.metresDrilled
  })

  /* What a contractor's day costs us. Metres at his rate; a day the work was
   * stopped for a reason that is not his, at his standby rate; a day lost to
   * his own breakdown, nothing. */
  const payDrill = payCharges.reduce((a, c) => a + c.amount, 0)
  const subcontract = !outsourced ? 0
    : status === 'standby' ? (submitted ? (pay!.rate?.standbyPerDay ?? 0) : 0)
    : payDrill
  const total = operating + ownership + subcontract

  const drillRevenue = charges.reduce((a, c) => a + c.amount, 0)
  const revenue = status === 'standby'
    ? (submitted ? (cr?.standbyPerDay ?? 0) : 0)
    : drillRevenue
  const rate = units > 0 ? drillRevenue / units : 0
  const adjustmentPct = charges.find(c => c.adjustmentPct !== 0)?.adjustmentPct ?? 0
  const unmatched = charges.some(c => !c.matched)

  return {
    date, rig, project, shifts, status, holeNumber, submitted,
    drillingHours: sum(s => s.drillingHours), downtimeHours: sum(s => s.downtimeHours), maintenanceHours,
    units, coreRecovery: sum(s => s.coreRecovery),
    fuelLitres, waterLitres, additivesKg,
    fuel, water, additives, labour, repairs, parts, partsByMetre,
    toolingRate, toolingByFormation,
    operating, ownership, total,
    outsourced, subcontract, payCharges,
    payRate: units > 0 ? payDrill / units : 0,
    payUnmatched: payCharges.some(c => !c.matched),
    cpu: units > 0 ? total / units : null,
    rate, adjustmentPct, revenue, unmatched, charges,
  }
}

export function adjustmentFor(row: RateRow, depth: number): number {
  return row.adjustments.reduce((pct, a) =>
    pct + ((a.condition === 'above' ? depth < a.depth : depth >= a.depth) ? a.adjustPct : 0), 0)
}

/* ==========================================================================
 * ROLLUP
 * ========================================================================== */

export interface Rollup {
  days: number; drillingDays: number; standbyDays: number; breakdownDays: number
  missingDays: number
  units: number; coreRecovery: number; coreRecoveryPct: number
  drillingHours: number; downtimeHours: number; maintenanceHours: number; fuelLitres: number
  fuel: number; water: number; additives: number
  labour: number; repairs: number; parts: number
  operating: number; ownership: number; subcontract: number; total: number; revenue: number
  cpu: number; operatingCPU: number; ownershipCPU: number
  toolingPerUnit: number
  revenuePerUnit: number; margin: number; marginPct: number
}

export function rollup(days: DayCost[]): Rollup {
  const z: Rollup = {
    days: 0, drillingDays: 0, standbyDays: 0, breakdownDays: 0, missingDays: 0,
    units: 0, coreRecovery: 0, coreRecoveryPct: 0, drillingHours: 0, downtimeHours: 0, maintenanceHours: 0,
    fuelLitres: 0, fuel: 0, water: 0, additives: 0,
    labour: 0, repairs: 0, parts: 0, operating: 0, ownership: 0, subcontract: 0, total: 0, revenue: 0,
    cpu: 0, operatingCPU: 0, ownershipCPU: 0, toolingPerUnit: 0,
    revenuePerUnit: 0, margin: 0, marginPct: 0,
  }
  days.forEach(d => {
    z.days++
    if (d.status === 'drilling') z.drillingDays++
    if (d.status === 'standby') z.standbyDays++
    if (d.status === 'breakdown') z.breakdownDays++
    if (!d.submitted) z.missingDays++
    z.units += d.units; z.coreRecovery += d.coreRecovery
    z.drillingHours += d.drillingHours; z.downtimeHours += d.downtimeHours
    z.maintenanceHours += d.maintenanceHours
    z.fuelLitres += d.fuelLitres
    z.fuel += d.fuel; z.water += d.water; z.additives += d.additives
    z.labour += d.labour.total
    z.repairs += d.repairs; z.parts += d.parts
    z.operating += d.operating; z.ownership += d.ownership; z.subcontract += d.subcontract; z.total += d.total
    z.revenue += d.revenue
  })
  if (z.units > 0) {
    z.cpu = z.total / z.units
    z.operatingCPU = z.operating / z.units
    z.ownershipCPU = z.ownership / z.units
    z.toolingPerUnit = z.parts / z.units
    z.revenuePerUnit = z.revenue / z.units
    z.coreRecoveryPct = (z.coreRecovery / z.units) * 100
  }
  z.margin = z.revenue - z.total
  z.marginPct = z.revenue > 0 ? (z.margin / z.revenue) * 100 : 0
  return z
}

export function withCumulative(days: DayCost[]) {
  let u = 0, t = 0
  return days.map(d => {
    u += d.units; t += d.total
    return { ...d, mtdUnits: u, mtdTotal: t, mtdCPU: u > 0 ? t / u : null }
  })
}
export type DayCostMTD = ReturnType<typeof withCumulative>[number]

// ── HOLE ROLLUP ───────────────────────────────────────────────────────────
export interface HoleResult {
  hole: Hole
  days: DayCost[]
  roll: Rollup
  depth: number
  coreRecoveryPct: number
  rates: number[]
  unmatchedDays: number
  billing: BillingLine[]
}

export interface BillingLine {
  holeSize: string
  formation: string
  fromDepth: number
  toDepth: number
  metres: number
  rate: number
  amount: number
  matched: boolean
}

export function billingLines(days: DayCost[]): BillingLine[] {
  const acc: Record<string, BillingLine> = {}
  days.forEach(d => d.charges.forEach(c => {
    const k = c.slab ? `${c.holeSize}|${Math.round(c.rate)}|${c.matched}` : `${c.holeSize}|${c.formation}|${Math.round(c.rate)}`
    const e = acc[k]
    if (!e) {
      acc[k] = {
        holeSize: c.holeSize, formation: c.formation,
        fromDepth: c.fromDepth, toDepth: c.toDepth,
        metres: c.metres, rate: c.rate, amount: c.amount, matched: c.matched,
      }
    } else {
      e.fromDepth = Math.min(e.fromDepth, c.fromDepth)
      e.toDepth = Math.max(e.toDepth, c.toDepth)
      e.metres += c.metres
      e.amount += c.amount
    }
  }))
  return Object.values(acc).sort((a, b) => a.fromDepth - b.fromDepth)
}

/* The holes a day's shifts worked on. Usually one; two when a hole was
 * finished and the next one started before the day was out. */
function holesOnDay(d: DayCost): string[] {
  return Array.from(new Set(d.shifts.map(s => s.holeNumber).filter((h): h is string => !!h)))
}

/* A day's figures as they belong to one hole. A day spent on a single hole
 * is that hole's whole day. A day shared by two holes is split: metres, core
 * and billing are each hole's own, taken from its own shifts, and the day's
 * costs follow the metres, so nothing is counted twice and nothing is lost. */
function dayForHole(d: DayCost, hole: string): DayCost | null {
  const mine = d.shifts.filter(s => s.holeNumber === hole)
  if (mine.length === 0) return null
  const on = holesOnDay(d)
  if (on.length <= 1) return d
  const add = <T,>(list: T[], f: (x: T) => number) => list.reduce((a, x) => a + f(x), 0)
  const units = add(mine, x => x.metresDrilled)
  const share = d.units > 0 ? units / d.units : 1 / on.length
  const k = (n: number) => n * share
  const charges = d.charges.filter(c => c.holeNumber === hole)
  const payCharges = d.payCharges.filter(c => c.holeNumber === hole)
  // Whatever the day earned or was paid that is not metres (standby) follows the same share.
  const revenue = add(charges, c => c.amount) + k(d.revenue - add(d.charges, c => c.amount))
  const subcontract = add(payCharges, c => c.amount) + k(d.subcontract - add(d.payCharges, c => c.amount))
  const total = k(d.total - d.subcontract) + subcontract
  return {
    ...d, shifts: mine, holeNumber: hole, units, coreRecovery: add(mine, x => x.coreRecovery),
    drillingHours: k(d.drillingHours), downtimeHours: k(d.downtimeHours), maintenanceHours: k(d.maintenanceHours),
    fuelLitres: k(d.fuelLitres), waterLitres: k(d.waterLitres), additivesKg: k(d.additivesKg),
    fuel: k(d.fuel), water: k(d.water), additives: k(d.additives),
    labour: { ...d.labour, labour: k(d.labour.labour), lodging: k(d.labour.lodging), transport: k(d.labour.transport), total: k(d.labour.total) },
    repairs: k(d.repairs), parts: k(d.parts), partsByMetre: k(d.partsByMetre),
    toolingByFormation: d.toolingByFormation.map(t => ({ ...t, metres: k(t.metres), amount: k(t.amount) })),
    operating: k(d.operating), ownership: k(d.ownership), subcontract, total,
    cpu: units > 0 ? total / units : null,
    revenue, charges, payCharges,
  }
}

export function holesFromDays(allDays: DayCost[], statuses: Record<string, HoleState>): Hole[] {
  const byHole: Record<string, DayCost[]> = {}
  allDays.forEach(d => holesOnDay(d).forEach(h => { (byHole[h] ||= []).push(d) }))
  return Object.entries(byHole).map(([holeNumber, ds]) => {
    const sorted = [...ds].sort((a, b) => a.date.localeCompare(b.date))
    const closingDay = sorted.find(d => d.shifts.some(sh => sh.holeNumber === holeNumber && sh.holeClosedThisShift))
    const stored = statuses[holeNumber]?.status
    const st: HoleStatus = stored && stored !== 'drilling' ? stored : (closingDay ? 'closed' : 'drilling')
    return {
      holeNumber, rig: sorted[0].rig, project: sorted[0].project,
      startDate: sorted[0].date,
      endDate: closingDay?.date,
      status: st, invoiceId: statuses[holeNumber]?.invoiceId,
      submittedAt: statuses[holeNumber]?.submittedAt,
      decidedAt: statuses[holeNumber]?.decidedAt,
      returnReason: statuses[holeNumber]?.returnReason,
    }
  }).sort((a, b) => a.startDate.localeCompare(b.startDate))
}

export function holeResult(hole: Hole, allDays: DayCost[]): HoleResult {
  const days = allDays.map(d => dayForHole(d, hole.holeNumber)).filter((d): d is DayCost => !!d)
  const roll = rollup(days)
  return {
    hole, days, roll, depth: roll.units,
    coreRecoveryPct: roll.coreRecoveryPct,
    rates: Array.from(new Set(days.flatMap(d => d.charges).filter(c => c.metres > 0).map(c => Math.round(c.rate)))).sort((a, b) => a - b),
    unmatchedDays: days.filter(d => d.unmatched).length,
    billing: billingLines(days),
  }
}

export function isBillable(h: Hole) { return h.status === 'approved' && !h.invoiceId }
export function isFinished(h: Hole) { return h.status !== 'drilling' }

/* ==========================================================================
 * SEED DATA
 * ========================================================================== */

export const PROJECT_CODES: Record<string, string> = {}
export function projectCode(name: string) {
  return PROJECT_CODES[name] ?? name.match(/^([A-Za-z]+-\d+)/)?.[1] ?? name
}
export function rigCode(name: string) {
  return name.match(/^([A-Za-z]+-\d+)/)?.[1] ?? name
}

export const PROJECT_CLIENTS: Record<string, string> = {}
/* The client a project is for, in the words of its own record. */
export function clientOf(project: string) { return PROJECT_CLIENTS[project] || 'the client' }

/* The company's rigs and people, to pick from when a project is staffed. */
export const FLEET = [
  { rig: 'RIG-001', type: 'Core' }, { rig: 'RIG-002', type: 'Core' }, { rig: 'RIG-003', type: 'Core' },
  { rig: 'RIG-004', type: 'Core' }, { rig: 'RIG-005', type: 'Core' },
]
export const PEOPLE = {
  supervisors: ['Arun Verma', 'Imran Shaikh', 'Pradeep Rao', 'Kiran Joshi', 'Suresh Nair'],
  drillers: ['Mahesh Yadav', 'Ravi Kumar', 'Santosh Patil', 'Dinesh Sahu', 'Farid Khan', 'Gopal Das', 'Naveen Reddy', 'Lokesh Meena'],
}

/* The rigs and people to pick from when a project is staffed. A real company
 * keeps no separate list: a rig or a person exists once it has been named on
 * a project (or, for a rig, given its costs in Finance). The demo company
 * also has the spare fleet and crew above. */
export function rigPool(state: { projects: ProjectRecord[]; ownership: RigOwnership[]; rigRegister?: RigRecord[] }): { rig: string; type: string }[] {
  const known = new Map<string, string>()
  ;(state.rigRegister ?? []).filter(r => r.state !== 'retired').forEach(r => known.set(r.rig, r.type))
  if (IS_DEMO && !(state.rigRegister ?? []).length) FLEET.forEach(f => known.set(f.rig, f.type))
  const add = (rig: string) => { if (rig && !known.has(rig)) known.set(rig, 'Core') }
  state.projects.forEach(p => p.rigs.forEach(add))
  state.ownership.forEach(o => add(o.rig))
  return Array.from(known, ([rig, type]) => ({ rig, type })).sort((a, b) => a.rig.localeCompare(b.rig, undefined, { numeric: true }))
}
export function peoplePool(state: { projects: ProjectRecord[]; users: AppUser[]; crew?: CrewMember[] }): { supervisors: string[]; drillers: string[] } {
  const uniq = (list: string[]) => Array.from(new Set(list.filter(Boolean)))
  const crew = (state.crew ?? []).filter(c => c.active)
  return {
    supervisors: uniq([...crew.filter(c => c.role === 'Supervisor').map(c => c.name), ...(IS_DEMO ? PEOPLE.supervisors : []), ...state.projects.flatMap(p => p.supervisors), ...state.users.filter(u => u.role === 'supervisor').map(u => u.name)]),
    drillers: uniq([...crew.filter(c => c.role === 'Driller').map(c => c.name), ...(IS_DEMO ? PEOPLE.drillers : []), ...state.projects.flatMap(p => p.drillers)]),
  }
}

export const SEED_PROJECTS: ProjectRecord[] = [
  {
    id: 'PRJ-001', code: 'PRJ-001', name: 'Site A - North Field', location: 'North Field block', client: DEMO_CLIENT,
    status: 'active', startDate: '2026-07-19', plannedMetres: 2400, holeSize: 'HQ', shared: true,
    plannedEnd: '2027-03-20', budgetTotal: 1250000, budgetPerMetre: 520,
    coords: DEMO_SITES['Site A - North Field'].coords,
    rigs: ['RIG-001', 'RIG-002'], supervisors: ['Arun Verma', 'Imran Shaikh'],
    drillers: ['Mahesh Yadav', 'Ravi Kumar', 'Santosh Patil', 'Dinesh Sahu'], createdAt: '2026-07-12',
  },
  {
    id: 'PRJ-002', code: 'PRJ-002', name: 'Site B - South Ridge', location: 'South Ridge block', client: 'South Ridge Minerals',
    status: 'active', startDate: '2026-02-18', plannedMetres: 3000, holeSize: 'HQ', shared: false,
    plannedEnd: '2027-02-17', budgetTotal: 1650000, budgetPerMetre: 550,
    coords: DEMO_SITES['Site B - South Ridge'].coords, utmZone: DEMO_SITES['Site B - South Ridge'].utmZone,
    rigs: ['RIG-003'], supervisors: ['Pradeep Rao'], drillers: ['Farid Khan', 'Gopal Das'], createdAt: '2026-02-01',
  },
  {
    id: 'PRJ-003', code: 'PRJ-003', name: 'Site C - East Basin', location: 'East Basin block', client: 'East Basin Resources',
    status: 'completed', startDate: '2026-03-21', plannedMetres: 900, holeSize: 'HQ', shared: false,
    rigs: [], supervisors: [], drillers: [], createdAt: '2026-03-09',
  },
]

/* Brings the mirrors into step with the store's project list. Called by the
 * store before anything below it renders, and once here so a screen that is
 * outside the store still sees the seed projects. */
export function syncRegistry(projects: ProjectRecord[]) {
  const fill = (target: string[], values: string[]) => { target.length = 0; target.push(...values) }
  const refill = (target: Record<string, string>, pairs: [string, string][]) => {
    Object.keys(target).forEach(k => { delete target[k] })
    pairs.forEach(([k, v]) => { target[k] = v })
  }
  fill(SHARED_PROJECTS, projects.filter(p => p.shared).map(p => p.name))
  fill(INV_PROJECTS, projects.map(p => p.name))
  fill(INV_COMPLETED, projects.filter(p => p.status === 'completed').map(p => p.name))
  fill(INV_RIGS, Array.from(new Set([...(IS_DEMO ? FLEET.slice(0, 3).map(f => f.rig) : []), ...projects.flatMap(p => p.rigs)])).sort())
  const codes = projects.map(p => [p.name, p.code] as [string, string])
  refill(PROJECT_CODES, codes)
  refill(INV_CODES, codes)
  refill(PROJECT_CLIENTS, projects.map(p => [p.name, p.client] as [string, string]))
}
syncRegistry(SEED_PROJECTS)

export const ROCK_CATEGORIES = ['Soft rock', 'Medium rock', 'Hard rock', 'Very hard rock']
export const HOLE_SIZES = ['NQ', 'HQ', 'PQ', 'BQ', 'AQ']

export const SEED_OWNERSHIP: RigOwnership[] = [
  {
    id: 'own_r1', rig: 'RIG-001', effectiveFrom: '2026-02-18',
    basicPrice: 2100000, gstPercent: 0, transportation: 45000,
    depreciationRatePct: 20,
    emiPerMonth: 40600, emiEndsMonth: '2028-03',
    insurancePerYear: 31500, otherFixedPerMonth: 0,
    costBasis: 'cash', allocationBasis: 'operatingDay',
    expectedOperatingDays: 25, expectedUnitsPerMonth: 300,
    note: 'Opening entry',
  },
  {
    id: 'own_r2', rig: 'RIG-002', effectiveFrom: '2026-02-18',
    basicPrice: 1950000, gstPercent: 0, transportation: 40000,
    depreciationRatePct: 20,
    emiPerMonth: 37700, emiEndsMonth: '2027-10',
    insurancePerYear: 29300, otherFixedPerMonth: 0,
    costBasis: 'cash', allocationBasis: 'operatingDay',
    expectedOperatingDays: 25, expectedUnitsPerMonth: 300,
    note: 'Opening entry',
  },
  {
    id: 'own_r3', rig: 'RIG-003', effectiveFrom: '2026-02-18',
    basicPrice: 1800000, gstPercent: 0, transportation: 35000,
    depreciationRatePct: 20,
    emiPerMonth: 34800, emiEndsMonth: '2029-02',
    insurancePerYear: 27000, otherFixedPerMonth: 0,
    costBasis: 'cash', allocationBasis: 'operatingDay',
    expectedOperatingDays: 25, expectedUnitsPerMonth: 300,
    note: 'Opening entry',
  },
]

const opRate = (id: string, rig: string, project: string, from: string, fuel: number, note: string): OperatingRate => ({
  id, rig, project, effectiveFrom: from, note,
  fuelPricePerLitre: fuel, waterPricePerLitre: 0.05, additivePricePerKg: 14,
  labourRate: 230, lodgingRate: 75, transportRate: 350, chargePerMetre: false,
})

export const SEED_OPERATING: OperatingRate[] = [
  opRate('op_a1_1', 'RIG-001', 'Site A - North Field', '2026-02-18', 1.58, 'Opening entry'),
  opRate('op_a1_2', 'RIG-001', 'Site A - North Field', '2026-08-18', 1.62, 'Diesel price revision'),
  opRate('op_a1_3', 'RIG-001', 'Site A - North Field', '2026-09-18', 1.66, 'Diesel price revision'),
  opRate('op_a1_4', 'RIG-001', 'Site A - North Field', '2026-10-19', 1.70, 'Diesel price revision'),
  opRate('op_a2_1', 'RIG-002', 'Site A - North Field', '2026-02-18', 1.62, 'Opening entry'),
  opRate('op_a2_2', 'RIG-002', 'Site A - North Field', '2026-09-18', 1.66, 'Diesel price revision'),
  opRate('op_a2_3', 'RIG-002', 'Site A - North Field', '2026-10-19', 1.70, 'Diesel price revision'),
  opRate('op_b1_1', 'RIG-003', 'Site B - South Ridge', '2026-02-18', 1.66, 'Opening entry'),
]

export const SEED_CLIENT_RATES: ClientRate[] = [
  {
    id: 'cr_a_1', project: 'Site A - North Field', effectiveFrom: '2026-07-19',
    structure: 'flat',
    rateRows: [
      { id: 'r1', holeSize: 'HQ', formation: 'Soft rock', rate: 600, adjustments: [] },
      { id: 'r2', holeSize: 'HQ', formation: 'Hard rock', rate: 800, adjustments: [] },
      { id: 'r3', holeSize: 'HQ', formation: 'Very hard rock', rate: 950, adjustments: [] },
    ],
    standbyPerDay: 8500, mobilisation: 85000, demobilisation: 65000,
    note: 'Tender schedule 2.2.1.1c\u2013e',
  },
  {
    id: 'cr_b_1', project: 'Site B - South Ridge', effectiveFrom: '2026-02-18',
    structure: 'slab',
    rateRows: [
      { id: 'b1', holeSize: 'HQ', formation: ANY_FORMATION, fromDepth: 0, toDepth: 75, rate: 700, adjustments: [] },
      { id: 'b2', holeSize: 'HQ', formation: ANY_FORMATION, fromDepth: 75, toDepth: 150, rate: 780, adjustments: [] },
      { id: 'b3', holeSize: 'HQ', formation: ANY_FORMATION, fromDepth: 150, rate: 880, adjustments: [] },
    ],
    standbyPerDay: 7500, mobilisation: 75000, demobilisation: 60000,
    note: 'Contract rate card, depth bands',
  },
]

export const SEED_HOLE_STATUS: Record<string, HoleState> = {
  'DH-001': { status: 'approved' },
  'DH-011': { status: 'approved' },
  'DH-101': { status: 'approved' },
  // Drilled by a contractor, checked by our site, approved: ready to bill the client.
  'DH-131': { status: 'approved' },
  // Waiting with the client, so his login has a live approval on first load.
  'DH-002': { status: 'submitted', submittedAt: '2026-10-30' },
}

function markClosures(logs: ShiftLog[], holeNumbers: string[]): ShiftLog[] {
  const lastOf: Record<string, string> = {}
  logs.forEach(l => {
    if (l.holeNumber && holeNumbers.includes(l.holeNumber) && l.metresDrilled > 0) {
      const k = `${l.date}|${l.shift}`
      if (!lastOf[l.holeNumber] || k > lastOf[l.holeNumber]) lastOf[l.holeNumber] = k
    }
  })
  return logs.map(l =>
    l.holeNumber && lastOf[l.holeNumber] === `${l.date}|${l.shift}`
      ? { ...l, holeClosedThisShift: true } : l)
}

type DaySpec = [number, string, number, number, number?, number?, string?]

/* Core recovery differs hole to hole — ground, bit and crew all move it — so
 * the seed gives each hole its own figure instead of one flat percentage. */
const RECOVERY_STEPS = [0.96, 0.975, 0.94, 0.985, 0.955, 0.93]
function recoveryFor(hole: string) {
  if (!hole) return 0.95
  const n = hole.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0)
  return RECOVERY_STEPS[n % RECOVERY_STEPS.length]
}

function formationAt(depth: number, bands: [number, string][]): string {
  for (const [limit, name] of bands) if (depth < limit) return name
  return bands[bands.length - 1][1]
}

const DEPTH_BANDS: [number, string][] = [
  [35, 'Soft Formation'], [75, 'Hard Formation'], [Infinity, 'Very Hard Formation'],
]

const WEAR: Record<string, number> = { Soft: 2.2, Medium: 1.5, Hard: 1.0, 'Very Hard': 0.6 }

/* How a part wears.
 *
 *   terrain   harder ground eats it faster — bits, lifters, reamers
 *   flat      metres are metres whatever the rock — rods, swivels, barrels
 *   soft      only consumed in the overburden — casing and casing shoes,
 *             which are set near surface and never touched at depth
 */
type WearMode = 'terrain' | 'flat' | 'soft'

function partsFor(
  run: Record<string, number>, metres: number, formation: string,
): PartUsage[] {
  const out: PartUsage[] = []
  const key = formation.includes('Very') ? 'Very Hard' : formation.includes('Hard') ? 'Hard' : 'Soft'
  const factor = WEAR[key]
  const inSoft = key === 'Soft'

  // [catalogue id, life in metres, how it wears]
  const wearing: [string, number, WearMode][] = [
    ['t06', 20, 'terrain'],    // HQ Core Lifter
    ['t07', 50, 'terrain'],    // HQ Core Lifter Case
    ['t08', 100, 'terrain'],   // HQ Impregnated Bit
    ['t15', 200, 'soft'],      // PW Casing TC Bit
    ['t16', 200, 'soft'],      // HW Casing TC / Shoe Bit
    ['t04', 500, 'terrain'],   // HQ Diamond Reamer Shell
    ['t09', 500, 'terrain'],   // HQ Core Barrel Spares
    ['t02', 2000, 'flat'],     // HQ Core Barrel 3.0 m
    ['t03', 2000, 'flat'],     // HQ Inner Tube Assembly
    ['t05', 2000, 'flat'],     // HQ Over Shot Assembly
    ['t17', 2000, 'flat'],     // Water Swivel Spares
    ['t01', 5000, 'flat'],     // HQ Wire Line Drill Rod
    ['t10', 5000, 'flat'],     // Water Swivel
    ['t11', 5000, 'flat'],     // Hoisting Plug
    ['t12', 5000, 'flat'],     // Adaptors
    ['t13', 10000, 'soft'],    // PW Casing 3.0 m
    ['t14', 10000, 'soft'],    // HW Casing 3.0 m
  ]

  wearing.forEach(([id, baseLife, mode]) => {
    if (mode === 'soft' && !inSoft) return
    const life = mode === 'terrain' ? baseLife * factor : baseLife
    run[id] = (run[id] ?? 0) + metres
    while (run[id] >= life) {
      run[id] -= life
      const existing = out.find(o => o.itemId === id)
      if (existing) existing.qty += 1
      else out.push({ itemId: id, qty: 1, metres })
    }
  })
  return out
}

/* The month-and-day specs below were written for a demo that sat on 13 Sep 2026.
 * The demo now sits on 31 Oct 2026, so every seeded shift moves forward by the
 * same 48 days and all the gaps between events stay exactly as designed. */
const SEED_SHIFT_DAYS = 48
function seedDate(ymd: string) {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + SEED_SHIFT_DAYS)
  return d.toISOString().slice(0, 10)
}

function expand(rig: string, project: string, ym: string, size: string, specs: DaySpec[], bands = DEPTH_BANDS): ShiftLog[] {
  const out: ShiftLog[] = []
  const depth: Record<string, number> = {}
  const wear: Record<string, number> = {}
  specs.forEach(([day, hole, dm, nm, dd = 0, nd = 0, reason = '']) => {
    const date = seedDate(`${ym}-${String(day).padStart(2, '0')}`)
    const mk = (shift: ShiftName, metres: number, down: number, crew: number): ShiftLog => {
      const drillingHours = Math.max(0, 12 - down)
      const startDepth = hole ? (depth[hole] ?? 0) : 0
      if (hole) depth[hole] = startDepth + metres
      return {
        id: `${rig}_${date}_${shift}`.replace(/\s+/g, ''),
        rig, project, date, shift,
        holeNumber: hole || null,
        crewCount: down >= 12 ? 2 : crew,
        shiftHours: 12, drillingHours, downtimeHours: down,
        downtimeReason: down > 0 ? reason : '',
        metresDrilled: metres,
        coreRecovery: +(metres * recoveryFor(hole)).toFixed(2),
        holeSize: size,
        formationType: formationAt(startDepth, bands),
        fuelLitres: drillingHours * 10 + (down > 0 ? 6 : 0),
        waterLitres: metres * 120,
        additivesKg: +(metres * 0.8).toFixed(1),
        partsUsed: metres > 0 ? partsFor(wear, metres, formationAt(startDepth, bands)) : [],
      }
    }
    out.push(mk('Day', dm, dd, 4))
    out.push(mk('Night', nm, nd, 3))
  })
  return out
}

export const SEED_SHIFT_LOGS_A: ShiftLog[] = [
  ...expand('RIG-001', 'Site A - North Field', '2026-08', 'HQ', [
    [1, 'DH-001', 7, 5], [2, 'DH-001', 7, 5], [3, 'DH-001', 5, 5, 3, 0, 'Bit Change'],
    [4, 'DH-001', 7, 7], [5, 'DH-001', 7, 5], [6, 'DH-001', 7, 5],
    [7, 'DH-001', 5, 5, 2, 0, 'Ground Condition Issue'], [8, 'DH-001', 7, 5],
    [9, '', 0, 0, 12, 12, 'Waiting for Instruction'],
    [10, 'DH-002', 7, 5], [11, 'DH-002', 7, 5], [12, 'DH-002', 7, 5],
    [13, 'DH-002', 0, 0, 12, 12, 'Mechanical Breakdown'],
    [14, 'DH-002', 5, 5, 2, 0, 'Hydraulic Issue'], [15, 'DH-002', 7, 7],
    [16, 'DH-002', 7, 5], [17, 'DH-002', 7, 5], [18, 'DH-002', 7, 7],
    [19, 'DH-002', 5, 5], [20, '', 0, 0, 12, 12, 'Weather Condition'],
    [21, 'DH-003', 7, 5], [22, 'DH-003', 7, 5], [23, 'DH-003', 5, 5, 3, 0, 'Rod Change'],
    [24, 'DH-003', 7, 7], [25, 'DH-003', 7, 5], [26, 'DH-003', 7, 5],
    [27, 'DH-003', 7, 7], [28, 'DH-003', 5, 5],
  ]),
  ...expand('RIG-002', 'Site A - North Field', '2026-08', 'HQ', [
    [1, 'DH-011', 7, 7], [2, 'DH-011', 7, 5], [3, 'DH-011', 7, 7],
    [4, 'DH-011', 5, 5, 2, 0, 'Water Shortage'], [5, 'DH-011', 7, 7],
    [6, 'DH-011', 7, 5], [7, 'DH-011', 7, 7], [8, 'DH-011', 7, 5],
    [9, 'DH-011', 7, 7], [10, 'DH-011', 5, 5, 3, 0, 'Bit Change'],
    [11, 'DH-011', 7, 5], [12, 'DH-011', 7, 7], [13, 'DH-011', 7, 5], [14, 'DH-011', 7, 7],
    [15, '', 0, 0, 12, 12, 'Waiting for Instruction'],
    [16, 'DH-012', 7, 5], [17, 'DH-012', 7, 7], [18, 'DH-012', 5, 5, 4, 0, 'Electrical Fault'],
    [19, 'DH-012', 7, 5], [20, 'DH-012', 7, 7], [21, 'DH-012', 7, 5],
    [22, 'DH-012', 7, 7], [23, 'DH-012', 7, 5],
  ]),
]

export const SEED_SHIFT_LOGS_B: ShiftLog[] = expand('RIG-003', 'Site B - South Ridge', '2026-08', 'HQ', [
  [1, 'DH-101', 8, 7], [2, 'DH-101', 8, 8], [3, 'DH-101', 8, 7],
  [4, 'DH-101', 7, 7, 2, 0, 'Water Shortage'], [5, 'DH-101', 8, 8],
  [6, 'DH-101', 8, 7], [7, 'DH-101', 8, 8], [8, 'DH-101', 7, 7],
  [9, 'DH-101', 8, 7], [10, 'DH-101', 8, 8], [11, 'DH-101', 7, 7],
  [12, 'DH-101', 8, 7], [13, 'DH-101', 8, 8], [14, 'DH-101', 7, 7],
], [[Infinity, 'Hard Formation']])

/* June and July give the month strip something to compare against, and they
 * are deliberately different months rather than noise: June carries a bad
 * breakdown run and two weather stoppages, July is clean. September runs to
 * the 13th, which is where the system's today sits. */
export const SEED_SHIFT_LOGS_JUNE: ShiftLog[] = [
  ...expand('RIG-001', 'Site A - North Field', '2026-06', 'HQ', [
    [1, 'DH-901', 6, 5], [2, 'DH-901', 6, 5], [3, 'DH-901', 5, 4, 3, 0, 'Bit Change'],
    [4, 'DH-901', 0, 0, 12, 12, 'Mechanical Breakdown'],
    [5, 'DH-901', 0, 0, 12, 12, 'Mechanical Breakdown'],
    [6, 'DH-901', 4, 4, 5, 2, 'Hydraulic Issue'], [7, 'DH-901', 6, 5],
    [8, 'DH-901', 6, 6], [9, 'DH-901', 5, 5, 2, 0, 'Rod Change'],
    [10, '', 0, 0, 12, 12, 'Weather Condition'],
    [11, '', 0, 0, 12, 12, 'Weather Condition'],
    [12, 'DH-902', 6, 5], [13, 'DH-902', 6, 5], [14, 'DH-902', 6, 6],
    [15, 'DH-902', 5, 4, 3, 0, 'Electrical Fault'], [16, 'DH-902', 6, 5],
    [17, 'DH-902', 6, 6], [18, 'DH-902', 6, 5], [19, 'DH-902', 6, 6],
    [20, 'DH-902', 5, 5], [21, 'DH-902', 6, 5], [22, 'DH-902', 6, 6],
    [23, 'DH-902', 5, 5, 2, 0, 'Operator Delay'], [24, 'DH-902', 6, 5],
    [25, 'DH-902', 6, 6], [26, 'DH-902', 6, 5],
  ]),
  ...expand('RIG-002', 'Site A - North Field', '2026-06', 'HQ', [
    [2, 'DH-911', 7, 6], [3, 'DH-911', 7, 6], [4, 'DH-911', 7, 7],
    [5, 'DH-911', 6, 5, 2, 0, 'Water Shortage'], [6, 'DH-911', 7, 6],
    [7, 'DH-911', 7, 7], [8, 'DH-911', 7, 6], [9, 'DH-911', 7, 7],
    [10, '', 0, 0, 12, 12, 'Weather Condition'],
    [11, 'DH-911', 7, 6], [12, 'DH-911', 7, 7], [13, 'DH-911', 6, 6, 3, 0, 'Bit Change'],
    [14, 'DH-911', 7, 6], [15, 'DH-911', 7, 7], [16, 'DH-911', 7, 6],
    [17, 'DH-911', 7, 7], [18, 'DH-911', 6, 6],
  ]),
]

export const SEED_SHIFT_LOGS_JULY: ShiftLog[] = [
  ...expand('RIG-001', 'Site A - North Field', '2026-07', 'HQ', [
    [1, 'DH-951', 8, 6], [2, 'DH-951', 8, 7], [3, 'DH-951', 8, 6],
    [4, 'DH-951', 8, 7], [5, 'DH-951', 7, 7], [6, 'DH-951', 8, 6],
    [7, 'DH-951', 8, 7], [8, 'DH-951', 8, 7], [9, 'DH-951', 7, 6],
    [10, 'DH-951', 8, 7], [11, 'DH-951', 8, 6],
    [12, '', 0, 0, 12, 12, 'Waiting for Instruction'],
    [13, 'DH-952', 8, 7], [14, 'DH-952', 8, 6], [15, 'DH-952', 8, 7],
    [16, 'DH-952', 7, 7], [17, 'DH-952', 8, 6], [18, 'DH-952', 8, 7],
    [19, 'DH-952', 8, 6], [20, 'DH-952', 7, 7], [21, 'DH-952', 8, 6],
    [22, 'DH-952', 8, 7], [23, 'DH-952', 6, 6, 2, 0, 'Bit Change'],
    [24, 'DH-952', 8, 7], [25, 'DH-952', 8, 6], [26, 'DH-952', 8, 7],
    [27, 'DH-952', 7, 7], [28, 'DH-952', 8, 6], [29, 'DH-952', 8, 7],
  ]),
  ...expand('RIG-002', 'Site A - North Field', '2026-07', 'HQ', [
    [1, 'DH-961', 7, 7], [2, 'DH-961', 8, 6], [3, 'DH-961', 7, 7],
    [4, 'DH-961', 8, 7], [5, 'DH-961', 7, 6], [6, 'DH-961', 8, 7],
    [7, 'DH-961', 7, 7], [8, 'DH-961', 8, 6], [9, 'DH-961', 7, 7],
    [10, 'DH-961', 6, 6, 3, 0, 'Rod Change'], [11, 'DH-961', 8, 7],
    [12, 'DH-961', 7, 6], [13, 'DH-961', 8, 7], [14, 'DH-961', 7, 7],
    [15, 'DH-961', 8, 6], [16, 'DH-961', 7, 7], [17, 'DH-961', 8, 7],
    [18, 'DH-961', 7, 6], [19, 'DH-961', 8, 7], [20, 'DH-961', 7, 7],
    [21, 'DH-961', 8, 6], [22, 'DH-961', 7, 7],
  ]),
]

export const SEED_SHIFT_LOGS_SEP: ShiftLog[] = [
  ...expand('RIG-001', 'Site A - North Field', '2026-09', 'HQ', [
    [1, 'DH-004', 7, 6], [2, 'DH-004', 7, 5], [3, 'DH-004', 7, 6],
    [4, 'DH-004', 6, 5, 2, 0, 'Bit Change'], [5, 'DH-004', 7, 6],
    [6, 'DH-004', 7, 7], [7, 'DH-004', 7, 6],
    [8, '', 0, 0, 12, 12, 'Waiting for Instruction'],
    [9, 'DH-004', 7, 6], [10, 'DH-004', 7, 7], [11, 'DH-004', 6, 6],
    [12, 'DH-004', 7, 6], [13, 'DH-004', 7, 7],
  ]),
  ...expand('RIG-002', 'Site A - North Field', '2026-09', 'HQ', [
    [1, 'DH-013', 7, 7], [2, 'DH-013', 7, 6], [3, 'DH-013', 7, 7],
    [4, 'DH-013', 7, 6], [5, 'DH-013', 6, 6, 3, 0, 'Hydraulic Issue'],
    [6, 'DH-013', 7, 7], [7, 'DH-013', 7, 6], [8, 'DH-013', 7, 7],
    [9, 'DH-013', 7, 6], [10, 'DH-013', 7, 7], [11, 'DH-013', 6, 6],
    [12, 'DH-013', 7, 7], [13, 'DH-013', 7, 6],
  ]),
  ...expand('RIG-003', 'Site B - South Ridge', '2026-09', 'HQ', [
    [1, 'DH-102', 8, 7], [2, 'DH-102', 8, 8], [3, 'DH-102', 8, 7],
    [4, 'DH-102', 7, 7], [5, 'DH-102', 8, 8], [6, 'DH-102', 8, 7],
    [7, 'DH-102', 8, 8], [8, 'DH-102', 7, 7], [9, 'DH-102', 8, 7],
    [10, 'DH-102', 8, 8], [11, 'DH-102', 7, 7], [12, 'DH-102', 8, 7],
    [13, 'DH-102', 8, 8],
  ], [[Infinity, 'Hard Formation']]),
]

/* ── Contractors' rigs on Site B ───────────────────────────────────────────
 *
 * Site B is drilled three ways at once: our own RIG-003, two rigs from
 * Contractor P and one from Contractor Q. The contractors' shifts below have
 * already been checked by our site, so they are part of the record. They
 * carry no fuel, crew or parts: those are the contractor's. */
const SITE_B = 'Site B - South Ridge'
const HARD_GROUND: [number, string][] = [[Infinity, 'Hard Formation']]
const nextDay = (date: string) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10) }

function checked(logs: ShiftLog[], contractor: string, workOrderId: string, source: ShiftCheck['source'], recovery?: Record<string, number>): ShiftLog[] {
  return logs.map(l => ({
    ...l, crewCount: 0, fuelLitres: 0, waterLitres: 0, additivesKg: 0, partsUsed: [],
    coreRecovery: l.holeNumber && recovery?.[l.holeNumber] ? +(l.metresDrilled * recovery[l.holeNumber]).toFixed(2) : l.coreRecovery,
    contractor, workOrderId,
    check: { by: 'Pradeep Rao', at: `${nextDay(l.date)}T09:${l.shift === 'Day' ? '10' : '25'}`, source },
  }))
}

export const SEED_SHIFT_LOGS_CONTRACTORS: ShiftLog[] = [
  ...checked([
    ...expand('CP-01', SITE_B, '2026-08', 'HQ', [
      [3, 'DH-131', 7, 6], [4, 'DH-131', 7, 6], [5, 'DH-131', 7, 7], [6, 'DH-131', 6, 6, 2, 0, 'Bit Change'],
      [7, 'DH-131', 7, 6], [8, 'DH-131', 7, 7], [9, 'DH-131', 7, 6], [10, 'DH-131', 7, 6],
      [11, 'DH-131', 6, 6], [12, 'DH-131', 7, 7], [13, 'DH-131', 7, 6], [14, 'DH-131', 7, 6],
      [15, 'DH-131', 6, 5, 3, 0, 'Rod Change'], [16, 'DH-131', 7, 7], [17, 'DH-131', 7, 6],
      [18, 'DH-131', 7, 6], [19, 'DH-131', 7, 7], [20, 'DH-131', 7, 6], [21, 'DH-131', 7, 6], [22, 'DH-131', 6, 6],
      [23, '', 0, 0, 12, 12, 'Waiting for Instruction'],
      [24, 'DH-132', 7, 6], [25, 'DH-132', 7, 7], [26, 'DH-132', 7, 6], [27, 'DH-132', 7, 6],
      [28, 'DH-132', 6, 6, 2, 0, 'Hydraulic Issue'], [29, 'DH-132', 7, 7], [30, 'DH-132', 7, 6], [31, 'DH-132', 7, 6],
    ], HARD_GROUND),
    ...expand('CP-01', SITE_B, '2026-09', 'HQ', [
      [1, 'DH-132', 7, 6], [2, 'DH-132', 7, 7], [3, 'DH-132', 7, 6], [4, 'DH-132', 7, 6],
      [5, 'DH-132', 6, 6, 2, 0, 'Bit Change'], [6, 'DH-132', 7, 7], [7, 'DH-132', 7, 6], [8, 'DH-132', 7, 6],
      [9, 'DH-132', 7, 7], [10, 'DH-132', 7, 6], [11, 'DH-132', 6, 6], [12, 'DH-132', 7, 6],
    ], HARD_GROUND),
    ...expand('CP-02', SITE_B, '2026-08', 'HQ', [
      [10, 'DH-141', 6, 6], [11, 'DH-141', 6, 5], [12, 'DH-141', 6, 6], [13, 'DH-141', 6, 6],
      [14, 'DH-141', 6, 5], [15, 'DH-141', 6, 6], [16, 'DH-141', 6, 6], [17, 'DH-141', 5, 5, 2, 0, 'Bit Change'],
      [18, 'DH-141', 0, 0, 12, 12, 'Mechanical Breakdown'],
      [19, 'DH-141', 6, 6], [20, 'DH-141', 6, 5], [21, 'DH-141', 6, 6], [22, 'DH-141', 6, 6],
      [23, 'DH-141', 6, 5], [24, 'DH-141', 6, 6],
      [25, '', 0, 0, 12, 12, 'Site Access Issue'],
      [26, 'DH-141', 6, 6], [27, 'DH-141', 6, 5], [28, 'DH-141', 6, 6], [29, 'DH-141', 6, 6],
      [30, 'DH-141', 6, 5], [31, 'DH-141', 6, 6],
    ], HARD_GROUND),
    ...expand('CP-02', SITE_B, '2026-09', 'HQ', [
      [1, 'DH-142', 6, 6], [2, 'DH-142', 6, 5], [3, 'DH-142', 6, 6], [4, 'DH-142', 6, 6],
      [5, 'DH-142', 6, 5], [6, 'DH-142', 6, 6], [7, 'DH-142', 5, 5, 3, 0, 'Rod Change'], [8, 'DH-142', 6, 6],
      [9, 'DH-142', 6, 5], [10, 'DH-142', 6, 6], [11, 'DH-142', 6, 6], [12, 'DH-142', 6, 5],
    ], HARD_GROUND),
  ], 'ctr_p', 'wo_b1', 'login'),
  ...checked([
    ...expand('CQ-01', SITE_B, '2026-08', 'HQ', [
      [12, 'DH-151', 5, 4], [13, 'DH-151', 5, 5], [14, 'DH-151', 5, 4], [15, 'DH-151', 5, 5],
      [16, 'DH-151', 5, 4], [17, 'DH-151', 5, 5], [18, 'DH-151', 5, 4], [19, 'DH-151', 5, 5],
      [20, '', 0, 0, 12, 12, 'Weather Condition'],
      [21, 'DH-151', 5, 4], [22, 'DH-151', 5, 5], [23, 'DH-151', 5, 4], [24, 'DH-151', 5, 5],
      [25, 'DH-151', 5, 4], [26, 'DH-151', 3, 3, 4, 3, 'Mechanical Breakdown'], [27, 'DH-151', 5, 5],
      [28, 'DH-151', 5, 4], [29, 'DH-151', 5, 5], [30, 'DH-151', 5, 4], [31, 'DH-151', 5, 5],
    ], HARD_GROUND),
    ...expand('CQ-01', SITE_B, '2026-09', 'HQ', [
      [1, 'DH-152', 5, 4], [2, 'DH-152', 5, 5], [3, 'DH-152', 5, 4], [4, 'DH-152', 5, 5],
      [5, 'DH-152', 4, 4, 3, 0, 'Hydraulic Issue'], [6, 'DH-152', 5, 5], [7, 'DH-152', 5, 4], [8, 'DH-152', 5, 5],
      [9, 'DH-152', 5, 4], [10, 'DH-152', 5, 5], [11, 'DH-152', 5, 4], [12, 'DH-152', 5, 5],
    ], HARD_GROUND),
    // The night of the 11th was sent back to the contractor, so it is not in the record.
  ].filter(l => !(l.date === '2026-10-29' && l.shift === 'Night')), 'ctr_q', 'wo_b2', 'login', { 'DH-151': 0.86 }),
]

/* Who was on each rig, and what the form records beyond the figures: crew
 * names, engine hours, the depths, the ground, the downtime line. Filled in
 * for the seeded shifts so the Logs screen reads like a real record. */
const RIG_CREW: Record<string, { supervisor: string; day: string; night: string; hmr: number }> = {
  'RIG-001': { supervisor: 'Arun Verma', day: 'Mahesh Yadav', night: 'Ravi Kumar', hmr: 6120 },
  'RIG-002': { supervisor: 'Imran Shaikh', day: 'Santosh Patil', night: 'Dinesh Sahu', hmr: 4380 },
  'RIG-003': { supervisor: 'Pradeep Rao', day: 'Farid Khan', night: 'Gopal Das', hmr: 8050 },
  'CP-01': { supervisor: 'Vikas Jadhav', day: 'Anil Thakur', night: 'Rohit Pawar', hmr: 2210 },
  'CP-02': { supervisor: 'Vikas Jadhav', day: 'Sanjay More', night: 'Kunal Shinde', hmr: 3040 },
  'CQ-01': { supervisor: 'Manoj Tiwari', day: 'Sunil Kumar', night: 'Deepak Singh', hmr: 5560 },
}
export const LITHOLOGIES = ['Overburden', 'Clay', 'Sandstone', 'Shale', 'Limestone', 'Schist', 'Granite gneiss', 'Quartzite', 'Basalt', 'Copper ore', 'Iron ore', 'Coal', 'Other']
const LITHOLOGY_OF: Record<string, string> = { soft: 'Overburden', medium: 'Sandstone', hard: 'Granite gneiss', 'very hard': 'Quartzite' }

function detailed(logs: ShiftLog[]): ShiftLog[] {
  const at = depthIndex(logs)
  const hmr: Record<string, number> = {}
  return [...logs].sort((a, b) => shiftOrder(a).localeCompare(shiftOrder(b))).map(l => {
    const crew = RIG_CREW[l.rig] ?? { supervisor: 'Kiran Joshi', day: 'Naveen Reddy', night: 'Lokesh Meena', hmr: 3000 }
    const engineHours = l.drillingHours > 0 ? Math.min(l.shiftHours, l.drillingHours + 1) : l.downtimeHours >= l.shiftHours ? 0 : 2
    hmr[l.rig] = (hmr[l.rig] ?? crew.hmr) + engineHours
    const start = l.holeNumber ? at[l.id] ?? 0 : undefined
    const own = isOwnStop(l)
    return {
      ...l,
      supervisor: crew.supervisor, driller: l.shift === 'Day' ? crew.day : crew.night,
      engineHours, engineHmr: hmr[l.rig],
      meterStart: start, meterEnd: start != null ? +(start + l.metresDrilled).toFixed(2) : undefined,
      lithology: l.metresDrilled > 0 ? LITHOLOGY_OF[normFormation(l.formationType)] ?? 'Granite gneiss' : undefined,
      downtimeSide: l.downtimeHours > 0 ? (own ? 'internal' as const : 'client' as const) : undefined,
      downtime: l.downtimeHours > 0 ? [{ reason: l.downtimeReason || 'Not stated', side: own ? 'internal' as const : 'client' as const, hours: l.downtimeHours }] : [],
      standbyMode: l.downtimeHours >= l.shiftHours && !own && !l.holeNumber ? true : undefined,
      loggedBy: crew.supervisor, loggedAt: `${l.date}T${l.shift === 'Day' ? '18:25' : '23:50'}`,
    }
  })
}

export const SEED_SHIFT_LOGS: ShiftLog[] =
  detailed(markClosures(
    [...SEED_SHIFT_LOGS_JUNE, ...SEED_SHIFT_LOGS_JULY, ...SEED_SHIFT_LOGS_A,
     ...SEED_SHIFT_LOGS_B, ...SEED_SHIFT_LOGS_SEP, ...SEED_SHIFT_LOGS_CONTRACTORS],
    ['DH-901', 'DH-902', 'DH-911', 'DH-951', 'DH-952', 'DH-961',
     'DH-001', 'DH-002', 'DH-011', 'DH-101', 'DH-131', 'DH-141', 'DH-151']))

/* Planned depth for every seeded hole. A closed hole was planned at what it
 * reached, rounded up to the next 5 m; a hole still drilling has further to go. */
const OPEN_HOLE_PLANS: Record<string, number> = {
  'DH-003': 120, 'DH-012': 150, 'DH-004': 200, 'DH-013': 220, 'DH-102': 300,
  'DH-132': 320, 'DH-142': 280, 'DH-152': 250,
}
const UPCOMING_HOLES: [string, string, number][] = [
  ['DH-005', 'Site A - North Field', 200],
  ['DH-006', 'Site A - North Field', 180],
  ['DH-014', 'Site A - North Field', 220],
  ['DH-015', 'Site A - North Field', 240],
  ['DH-121', 'Site B - South Ridge', 300],
  ['DH-122', 'Site B - South Ridge', 280],
  ['DH-123', 'Site B - South Ridge', 320],
]
export const SEED_HOLE_PLANS: Record<string, HolePlan> = (() => {
  const drilled: Record<string, { m: number; project: string }> = {}
  SEED_SHIFT_LOGS.forEach(l => {
    if (!l.holeNumber) return
    const e = (drilled[l.holeNumber] ||= { m: 0, project: l.project })
    e.m += l.metresDrilled
  })
  const out: Record<string, HolePlan> = {}
  Object.entries(drilled).forEach(([hole, d]) => {
    out[hole] = { plannedDepth: OPEN_HOLE_PLANS[hole] ?? Math.ceil(d.m / 5) * 5, project: d.project }
  })
  // Holes that are planned but not started. These are what the next-month
  // forecast drills into once the current holes reach their planned depth.
  UPCOMING_HOLES.forEach(([hole, project, plannedDepth]) => { out[hole] = { plannedDepth, project } })
  return withSeedGeometry(out)
})()

const RAW_MAINTENANCE: MaintenanceLog[] = [
  { id: 'm1', rig: 'RIG-001', project: 'Site A - North Field', date: '2026-09-20', maintenanceType: 'Preventive', hours: 3, component: 'Engine', action: 'Inspection', cost: 400 },
  { id: 'm2', rig: 'RIG-001', project: 'Site A - North Field', date: '2026-09-30', maintenanceType: 'Breakdown', hours: 22, component: 'Hydraulic System', action: 'Part replaced', cost: 6200 },
  { id: 'm3', rig: 'RIG-001', project: 'Site A - North Field', date: '2026-10-01', maintenanceType: 'Breakdown', hours: 4, component: 'Hydraulic System', action: 'Repair performed', cost: 1100 },
  { id: 'm4', rig: 'RIG-001', project: 'Site A - North Field', date: '2026-10-10', maintenanceType: 'Scheduled', hours: 3, component: 'Compressor', action: 'Inspection', cost: 850 },
  { id: 'm5', rig: 'RIG-002', project: 'Site A - North Field', date: '2026-10-05', maintenanceType: 'Breakdown', hours: 8, component: 'Electrical', action: 'Repair performed', cost: 3750 },
  { id: 'm6', rig: 'RIG-001', project: 'Site A - North Field', date: '2026-07-22', maintenanceType: 'Breakdown', hours: 24, component: 'Engine', action: 'Part replaced', cost: 10750 },
  { id: 'm7', rig: 'RIG-001', project: 'Site A - North Field', date: '2026-07-23', maintenanceType: 'Breakdown', hours: 20, component: 'Engine', action: 'Repair performed', cost: 3100 },
  { id: 'm8', rig: 'RIG-001', project: 'Site A - North Field', date: '2026-08-02', maintenanceType: 'Breakdown', hours: 6, component: 'Electrical', action: 'Repair performed', cost: 2000 },
  { id: 'm9', rig: 'RIG-001', project: 'Site A - North Field', date: '2026-08-22', maintenanceType: 'Preventive', hours: 3, component: 'Engine', action: 'Inspection', cost: 400 },
  { id: 'm10', rig: 'RIG-002', project: 'Site A - North Field', date: '2026-08-29', maintenanceType: 'Preventive', hours: 2, component: 'Compressor', action: 'Inspection', cost: 350 },
  { id: 'm11', rig: 'RIG-001', project: 'Site A - North Field', date: '2026-10-22', maintenanceType: 'Scheduled', hours: 3, component: 'Mud Pump', action: 'Inspection', cost: 650 },
  { id: 'm12', rig: 'RIG-002', project: 'Site A - North Field', date: '2026-10-23', maintenanceType: 'Breakdown', hours: 9, component: 'Hydraulic System', action: 'Repair performed', cost: 2600 },
]
/* The same extra detail for the seeded maintenance logs: who logged it, on
 * which shift, and the oils a service takes. */
export const SEED_MAINTENANCE: MaintenanceLog[] = RAW_MAINTENANCE.map(m => {
  const engine = /engine/i.test(m.component), hyd = /hydraulic/i.test(m.component)
  const service = m.maintenanceType !== 'Breakdown'
  return {
    ...m, shift: 'Day' as ShiftName, supervisor: RIG_CREW[m.rig]?.supervisor ?? 'Kiran Joshi',
    engineOilL: engine ? (service ? 18 : 6) : 0, hydraulicOilL: hyd ? 40 : 0, transmissionOilL: 0,
    loggedBy: RIG_CREW[m.rig]?.supervisor ?? 'Kiran Joshi', loggedAt: `${m.date}T17:40`,
  }
})

/* ==========================================================================
 * STORE
 * ========================================================================== */

/* What has already happened on the seeded projects. Two lines are left unseen
 * by the client, and one rate proposal is waiting for him, so the Client
 * Portal opens with something to read and something to decide. */
export const SEED_PROJECT_EVENTS: ProjectEvent[] = [
  { id: 'pe_1', project: 'Site A - North Field', at: '2026-07-12T10:20', kind: 'created', by: 'contractor', title: 'Project created', detail: 'Site A - North Field · North Field block', seenByOwner: true, seenByContractor: true },
  { id: 'pe_2', project: 'Site A - North Field', at: '2026-07-12T10:24', kind: 'shared', by: 'contractor', title: `Shared with ${DEMO_CLIENT}`, detail: 'Contract rates, planned holes, rigs and crew are now visible in the client login.', seenByOwner: true, seenByContractor: true },
  { id: 'pe_3', project: 'Site A - North Field', at: '2026-07-12T10:31', kind: 'rates', by: 'contractor', title: 'Contract rates set, from 19 Jul 2026', detail: 'Tender schedule 2.2.1.1c\u2013e', seenByOwner: true, seenByContractor: true },
  { id: 'pe_4', project: 'Site A - North Field', at: '2026-07-15T09:05', kind: 'rig', by: 'contractor', title: 'RIG-001 and RIG-002 assigned', seenByOwner: true, seenByContractor: true },
  { id: 'pe_5', project: 'Site A - North Field', at: '2026-07-15T09:12', kind: 'crew', by: 'contractor', title: 'Crew assigned', detail: '2 supervisors, 4 drillers', seenByOwner: true, seenByContractor: true },
  { id: 'pe_6', project: 'Site A - North Field', at: '2026-10-29T16:40', kind: 'hole', by: 'contractor', title: '4 holes added to the plan', detail: 'DH-005 (200 m), DH-006 (180 m), DH-014 (220 m), DH-015 (240 m)', seenByOwner: false, seenByContractor: true },
  { id: 'pe_7', project: 'Site A - North Field', at: '2026-10-30T11:15', kind: 'rates', by: 'contractor', title: 'New rates proposed, from 18 Nov 2026', detail: 'Diesel price escalation, contract clause 14.2', seenByOwner: false, seenByContractor: true },
  { id: 'pe_8', project: 'Site B - South Ridge', at: '2026-02-01T12:00', kind: 'created', by: 'contractor', title: 'Project created', detail: 'Site B - South Ridge · South Ridge block', seenByContractor: true },
  { id: 'pe_9', project: 'Site C - East Basin', at: '2026-03-09T12:00', kind: 'created', by: 'contractor', title: 'Project created', detail: 'Site C - East Basin · East Basin block', seenByContractor: true },
  { id: 'pe_10', project: 'Site C - East Basin', at: '2026-10-17T17:30', kind: 'status', by: 'contractor', title: 'Project completed', seenByContractor: true },
]
export const SEED_RATE_PROPOSALS: RateProposal[] = [
  {
    id: 'rp_1', project: 'Site A - North Field', proposedAt: '2026-10-30T11:15', status: 'waiting',
    rate: {
      id: 'cr_a_2', project: 'Site A - North Field', effectiveFrom: '2026-11-18', structure: 'flat',
      rateRows: [
        { id: 'r1', holeSize: 'HQ', formation: 'Soft rock', rate: 600, adjustments: [] },
        { id: 'r2', holeSize: 'HQ', formation: 'Hard rock', rate: 832, adjustments: [] },
        { id: 'r3', holeSize: 'HQ', formation: 'Very hard rock', rate: 987, adjustments: [] },
      ],
      standbyPerDay: 8950, mobilisation: 85000, demobilisation: 65000,
      note: 'Diesel price escalation, contract clause 14.2',
    },
  },
]

/* ── Contractors, their work orders, and what is waiting to be checked ──── */

export const SEED_CONTRACTORS: Contractor[] = [
  { id: 'ctr_p', name: 'Contractor P', place: 'Demo company', contact: 'Site manager' },
  { id: 'ctr_q', name: 'Contractor Q', place: 'Demo company', contact: 'Proprietor' },
]

const payCard = (id: string, from: string, rates: [number, number, number], standby: number, mob: number, demob: number, note: string): ClientRate => ({
  id, project: SITE_B, effectiveFrom: from, structure: 'slab', note,
  rateRows: [
    { id: `${id}_1`, holeSize: 'HQ', formation: ANY_FORMATION, fromDepth: 0, toDepth: 75, rate: rates[0], adjustments: [] },
    { id: `${id}_2`, holeSize: 'HQ', formation: ANY_FORMATION, fromDepth: 75, toDepth: 150, rate: rates[1], adjustments: [] },
    { id: `${id}_3`, holeSize: 'HQ', formation: ANY_FORMATION, fromDepth: 150, rate: rates[2], adjustments: [] },
  ],
  standbyPerDay: standby, mobilisation: mob, demobilisation: demob,
})

/* The deduction figures are examples so the section has something to show.
 * Each customer's contract words these differently: switch a rule off, or
 * change its figures and clause to match the real work order. */
export const SEED_WORK_ORDERS: WorkOrder[] = [
  {
    id: 'wo_b1', number: 'WO-B-01', project: SITE_B, contractorId: 'ctr_p', rigs: ['CP-01', 'CP-02'],
    startDate: '2026-09-18', endDate: '2026-12-18', plannedMetres: 1100, paymentDays: 30, status: 'active',
    rates: [payCard('wr_p1', '2026-09-18', [530, 595, 670], 5800, 45000, 35000, 'Work order schedule of rates')],
    rules: [
      { id: 'd1', kind: 'coreRecovery', on: true, clause: 'Example clause 9.1', slabs: [{ belowPct: 90, deductPct: 10 }, { belowPct: 80, deductPct: 25 }] },
      { id: 'd2', kind: 'lateCompletion', on: true, clause: 'Example clause 12', pctPerWeek: 0.5, capPct: 10 },
      { id: 'd3', kind: 'shortfall', on: false, clause: '', minMetres: 250, perMetre: 60 },
      { id: 'd4', kind: 'retention', on: true, clause: 'Example clause 15', holdPct: 5 },
    ],
  },
  {
    id: 'wo_b2', number: 'WO-B-02', project: SITE_B, contractorId: 'ctr_q', rigs: ['CQ-01'],
    startDate: '2026-09-27', endDate: '2026-10-18', plannedMetres: 400, paymentDays: 45, status: 'active',
    rates: [payCard('wr_q1', '2026-09-27', [515, 585, 660], 5600, 40000, 30000, 'Work order schedule of rates')],
    rules: [
      { id: 'd1', kind: 'coreRecovery', on: true, clause: 'Example clause 9.1', slabs: [{ belowPct: 90, deductPct: 10 }, { belowPct: 80, deductPct: 25 }] },
      { id: 'd2', kind: 'lateCompletion', on: true, clause: 'Example clause 12', pctPerWeek: 0.5, capPct: 10 },
      { id: 'd3', kind: 'shortfall', on: true, clause: 'Example clause 10.3', minMetres: 300, perMetre: 60 },
      { id: 'd4', kind: 'retention', on: true, clause: 'Example clause 15', holdPct: 5 },
    ],
  },
]

const waiting = (id: string, workOrderId: string, rig: string, shift: ShiftName, hole: string | null, from: number | undefined, metres: number, core: number,
  hours: [number, number, number], reason: string, source: ContractorReport['source'], at: string, extra: Partial<ContractorReport> = {}): ContractorReport => ({
  id, workOrderId, rig, project: SITE_B, date: '2026-10-31', shift, holeNumber: hole, holeSize: 'HQ',
  formationType: metres > 0 ? 'Hard Formation' : '', fromDepth: from, toDepth: from != null ? from + metres : undefined,
  metres, coreRecovery: core, drillingHours: hours[0], standbyHours: hours[1], breakdownHours: hours[2], reason,
  source, receivedAt: at, status: 'waiting', ...extra,
})

/* Where each contractor hole stands in the seeded record, so the reports
 * waiting below carry on from the right depth. */
function seededDepth(hole: string) {
  return SEED_SHIFT_LOGS.filter(l => l.holeNumber === hole).reduce((s, l) => s + l.metresDrilled, 0)
}

/* Today's shifts from the three contractor rigs, not yet checked, and one
 * shift that was sent back. Between them they show what the checker is there
 * to catch: a standby claim to decide, a figure far above the rig's best, and
 * a depth that does not carry on from the record. */
export const SEED_CONTRACTOR_REPORTS: ContractorReport[] = (() => {
  const a = seededDepth('DH-132'), b = seededDepth('DH-142'), c = seededDepth('DH-152')
  return [
    waiting('rp_1', 'wo_b1', 'CP-01', 'Day', 'DH-132', a, 7, 6.8, [12, 0, 0], '', 'login', '2026-10-31T18:12'),
    waiting('rp_2', 'wo_b1', 'CP-01', 'Night', 'DH-132', a + 7, 6, 5.8, [12, 0, 0], '', 'login', '2026-10-31T18:12'),
    waiting('rp_3', 'wo_b1', 'CP-02', 'Day', 'DH-142', b, 6, 5.7, [12, 0, 0], '', 'login', '2026-10-31T18:20'),
    waiting('rp_4', 'wo_b1', 'CP-02', 'Night', null, undefined, 0, 0, [0, 12, 0], 'Waiting for Instruction', 'login', '2026-10-31T18:20',
      { remarks: 'Told to hold at 20:00 until the next hole location is cleared.' }),
    waiting('rp_5', 'wo_b2', 'CQ-01', 'Day', 'DH-152', c + 4, 5, 4.7, [12, 0, 0], '', 'login', '2026-10-31T18:40'),
    waiting('rp_6', 'wo_b2', 'CQ-01', 'Night', 'DH-152', c + 9, 9, 7.6, [12, 0, 0], '', 'login', '2026-10-31T18:40'),
    {
      ...waiting('rp_7', 'wo_b2', 'CQ-01', 'Night', 'DH-152', c - 10, 14, 11.9, [12, 0, 0], '', 'login', '2026-10-30T08:30'),
      date: '2026-10-29', status: 'returned', returnedBy: 'Pradeep Rao', returnedAt: '2026-10-30T10:05',
      returnReason: 'The log shows 14 m for one night shift. The rods on the rack give 4 m. Please correct and send again.',
    },
  ]
})()

/* ── Logins ────────────────────────────────────────────────────────────────
 *
 * The company admin creates every other login from one screen, Users:
 *
 *   supervisor   our own site staff: the drill log and the maintenance log
 *   contractor   a company drilling for us: his drill log, his submitted
 *                logs, a small view of his own performance
 *   client       the company we drill for: what is happening on his projects
 *
 * A login is tied to the thing it may see. A contractor's login to his
 * contractor record, a client's login to the client named on the projects, a
 * supervisor to the projects he is assigned to by name. */
export type UserRole = 'supervisor' | 'contractor' | 'client'
export const USER_ROLE_LABEL: Record<UserRole, string> = { supervisor: 'Supervisor', contractor: 'Contractor', client: 'Client' }
export interface AppUser {
  id: string
  name: string
  username: string
  role: UserRole
  active: boolean
  created: string             // YYYY-MM-DD
  email?: string
  opened?: boolean            // has signed in at least once
  contractorId?: string       // role contractor
  client?: string             // role client: the client's name as written on the project
}
/* Who the Company Admin is, for "checked by" and "logged by". The demo's
 * admin, until someone signs in and it becomes them. */
export let ADMIN_NAME = 'Admin User'
export function setAdminName(name: string) { if (name) ADMIN_NAME = name }
export { COMPANY_NAME } from './company'

export const SEED_USERS: AppUser[] = [
  { id: 'u_s1', name: 'Arun Verma', username: 'APX_SUP01', role: 'supervisor', active: true, created: '2026-07-19', opened: true },
  { id: 'u_s2', name: 'Imran Shaikh', username: 'APX_SUP02', role: 'supervisor', active: true, created: '2026-07-19', opened: true },
  { id: 'u_s3', name: 'Pradeep Rao', username: 'APX_SUP03', role: 'supervisor', active: true, created: '2026-09-18', opened: true },
  { id: 'u_c1', name: 'Contractor P', username: 'APX_CON01', role: 'contractor', active: true, created: '2026-09-14', opened: true, contractorId: 'ctr_p', email: 'site@contractor-p.example' },
  { id: 'u_c2', name: 'Contractor Q', username: 'APX_CON02', role: 'contractor', active: true, created: '2026-09-25', opened: true, contractorId: 'ctr_q', email: 'site@contractor-q.example' },
  { id: 'u_k1', name: 'Demo Mining Co.', username: 'APX_CLI01', role: 'client', active: true, created: '2026-07-12', opened: true, client: 'Demo Mining Co.', email: 'exploration@demo-mining.example' },
]
export function loginOfContractor(users: AppUser[] | undefined, contractorId: string | undefined) {
  return (users ?? []).find(u => u.role === 'contractor' && u.contractorId === contractorId)
}
export function loginOfClient(users: AppUser[] | undefined, client: string | undefined) {
  return (users ?? []).find(u => u.role === 'client' && !!client && u.client?.toLowerCase() === client.toLowerCase())
}
export function nextUsername(users: AppUser[], role: UserRole) {
  const tag = role === 'supervisor' ? 'SUP' : role === 'contractor' ? 'CON' : 'CLI'
  const n = Math.max(0, ...users.filter(u => u.role === role).map(u => Number(u.username.match(/(\d+)$/)?.[1] ?? 0))) + 1
  return `${COMPANY_CODE}_${tag}${String(n).padStart(2, '0')}`
}

interface State {
  shiftLogs: ShiftLog[]
  maintenance: MaintenanceLog[]
  ownership: RigOwnership[]
  operating: OperatingRate[]
  clientRates: ClientRate[]
  holeStatus: Record<string, HoleState>
  invoices: Invoice[]
  holePlans: Record<string, HolePlan>
  projects: ProjectRecord[]
  projectEvents: ProjectEvent[]
  rateProposals: RateProposal[]
  // Rigs that are not ours: who runs them, under what, and what is waiting.
  contractors: Contractor[]
  workOrders: WorkOrder[]
  contractorReports: ContractorReport[]
  contractorBills: ContractorBill[]
  wording: Wording
  users: AppUser[]
  /* What people did with each XPLORIX Intelligence finding (lib/findings.ts),
   * by the finding's id. A finding with no entry is open. */
  findingStatus: Record<string, FindingStatus>
  // The company's own rigs and people (lib/registers.ts).
  rigRegister: RigRecord[]
  crew: CrewMember[]
  // Downhole surveys: readings typed or imported in the office, and the
  // decisions on readings written on shift logs. Tool layouts for imports.
  surveys: SurveyReading[]
  surveyProfiles: SurveyProfile[]
}

export interface FindingStatus {
  /* snoozed: back in the list on `until`; it is never out of sight before
   * then, it waits under Reminders with its date. */
  status: 'done' | 'dismissed' | 'assigned' | 'snoozed'
  by: string; at: string
  to?: string        // who it was handed to
  note?: string      // why it is not relevant, or what was done
  until?: string     // YYYY-MM-DD, for snoozed
  /* The findings it covered when it was marked. A story that gains a new
   * finding opens again, so new evidence is never hidden by an old answer. */
  ids?: string[]
  /* What was found, as it stood when it was answered: kept so XPLORIX can
   * later check in the record what came of it (lib/value.ts), even after the
   * finding itself has gone from the list. */
  found?: FoundSnapshot
}
export interface FoundSnapshot {
  title: string
  dept: string
  money?: number
  on?: string           // the day it was found, where known
  items: { id: string; title: string; kind?: string; ref?: Record<string, string | number | string[]>; money?: number }[]
}

/* What the demo company did with earlier findings, so the inbox has a
 * history and the Value screen has something to check in the record. Each
 * keeps the finding as it stood when it was answered. */
const SEED_FINDING_STATUS: Record<string, FindingStatus> = {
  'past:inv-0001-overdue': {
    status: 'done', by: 'Admin User', at: '2026-09-23T10:15', ids: [],
    found: { title: 'Invoice INV-0001 is overdue', dept: 'billing', on: '2026-09-23', items: [{ id: 'live:od_inv_seed_1', title: 'Invoice INV-0001 is overdue', kind: 'invoice-overdue', ref: { invoiceId: 'inv_seed_1' } }] },
  },
  'past:t08-runout': {
    status: 'assigned', to: 'Stores', by: 'Admin User', at: '2026-10-16T09:40', ids: [],
    found: { title: 'HQ Impregnated Bit runs out in 7 days', dept: 'stock', money: 1830, on: '2026-10-16', items: [{ id: 'stock:running_t08', title: 'HQ Impregnated Bit runs out in 7 days', kind: 'stock-runout', ref: { itemId: 't08', gapDays: 11, runsOutOn: '2026-10-23' }, money: 1830 }] },
  },
  'past:rig002-fuel': {
    status: 'dismissed', note: 'New pump fitted on 20 Oct, settling in', by: 'Admin User', at: '2026-10-22T17:20', ids: [],
    found: { title: 'RIG-002 fuel 30% above its own normal', dept: 'finance', money: 410, on: '2026-10-22', items: [{ id: 'finance:fuel-own:RIG-002', title: 'RIG-002 fuel 30% above its own normal', money: 410 }] },
  },
}

/* Earlier answers, so the Scorecard has a history to score: what XPLORIX
 * found from July to September, who answered it, how fast, and what was set
 * aside as not relevant and why. Demo data. */
const PAST: [string, string, string, string, 'done' | 'dismissed', string?][] = [
  // found on, answered on, dept, title, answer, reason when set aside
  ['2026-08-20', '2026-08-22', 'data', 'RIG-001 night shift not logged', 'done'],
  ['2026-08-23', '2026-08-27', 'billing', 'Invoice INV-0001 to send for approval', 'done'],
  ['2026-08-26', '2026-09-02', 'stock', 'HQ Core Lifter below minimum stock', 'done'],
  ['2026-08-28', '2026-08-31', 'maintenance', 'RIG-002 service due at 250 engine hours', 'done'],
  ['2026-08-31', '2026-09-03', 'finance', 'RIG-001 fuel 22% above its own normal', 'dismissed', 'Long rod string at depth; expected'],
  ['2026-09-04', '2026-09-10', 'operations', 'Site A: next holes not released by the client', 'done'],
  ['2026-09-07', '2026-09-10', 'data', '3 shifts with no core recovery entered', 'done'],
  ['2026-09-11', '2026-09-21', 'stock', 'Water Swivel Spares sitting in the store 40 days', 'dismissed', 'Kept as a spare on purpose'],
  ['2026-09-14', '2026-09-15', 'billing', '2 closed holes not yet sent for approval', 'done'],
  ['2026-09-19', '2026-09-19', 'contractors', '4 contractor shifts waiting to be checked', 'done'],
  ['2026-09-22', '2026-09-25', 'maintenance', 'RIG-003: hydraulic hose replaced twice in a week', 'done'],
  ['2026-09-25', '2026-09-29', 'billing', 'Invoice INV-0001 is overdue', 'done'],
  ['2026-09-27', '2026-09-28', 'data', 'Day and night shift identical on RIG-002', 'done'],
  ['2026-09-30', '2026-10-03', 'crew', 'Driller on 21 days without a rest day', 'done'],
  ['2026-10-03', '2026-10-10', 'stock', 'PW Casing order 10 days late', 'done'],
  ['2026-10-05', '2026-10-05', 'contractors', 'Bill CP/26-27/041 claims more than the record', 'done'],
  ['2026-10-07', '2026-10-08', 'operations', 'CQ-01 drills 30% slower than RIG-003', 'dismissed', 'New crew settling in; reviewed with the contractor'],
  ['2026-10-11', '2026-10-12', 'billing', 'Client standby on Site B on no invoice', 'done'],
  ['2026-10-14', '2026-10-15', 'data', '1 shift with metres above the rig\'s best day', 'done'],
  ['2026-10-17', '2026-10-19', 'maintenance', 'RIG-001 service due at 250 engine hours', 'done'],
  ['2026-10-20', '2026-10-20', 'contractors', '6 contractor shifts waiting to be checked', 'done'],
  ['2026-10-21', '2026-10-22', 'stock', 'Water Swivel Spares being ordered while 1 sits at Site C', 'done'],
  ['2026-10-24', '2026-10-25', 'data', 'RIG-003 night shift not logged', 'done'],
  ['2026-10-26', '2026-10-27', 'finance', 'Tooling cost on RIG-002 up 18% this week', 'dismissed', 'Very hard ground this week; expected'],
  ['2026-10-28', '2026-10-29', 'billing', 'Ready-to-invoice holes waiting 5 days', 'done'],
]
const PAST_STATUS: Record<string, FindingStatus> = Object.fromEntries(PAST.map(([found, at, dept, title, status, note], i) => [
  `past:h${i + 1}`,
  { status, note, by: 'Admin User', at: `${at}T10:00`, ids: [], found: { title, dept, on: found, items: [{ id: `past:h${i + 1}`, title }] } } as FindingStatus,
]))

function initial(): State {
  const base = {
    shiftLogs: SEED_SHIFT_LOGS, maintenance: SEED_MAINTENANCE,
    ownership: SEED_OWNERSHIP, operating: SEED_OPERATING,
    clientRates: SEED_CLIENT_RATES, holeStatus: SEED_HOLE_STATUS as Record<string, HoleState>, invoices: [] as Invoice[],
    holePlans: SEED_HOLE_PLANS,
    projects: SEED_PROJECTS, projectEvents: SEED_PROJECT_EVENTS, rateProposals: SEED_RATE_PROPOSALS,
    contractors: SEED_CONTRACTORS, workOrders: SEED_WORK_ORDERS, contractorReports: SEED_CONTRACTOR_REPORTS,
    wording: 'standard' as Wording,
    users: SEED_USERS,
    surveys: seedSurveys(SEED_HOLE_PLANS, SEED_SHIFT_LOGS), surveyProfiles: [] as SurveyProfile[],
    findingStatus: { ...PAST_STATUS, ...SEED_FINDING_STATUS },
    rigRegister: SEED_RIGS, crew: SEED_CREW,
  }
  const demo = seedInvoices(base, SEED_PROJECTS[0].name, SEED_PROJECTS[0].client)
  /* Two days of client standby on Site B that were on no hole, billed on
   * their own invoice and paid: what the standby check finds. */
  const siteB = SEED_PROJECTS.find(p => p.name === SITE_B)
  const sbRate = versionOn(SEED_CLIENT_RATES.filter(c => c.project === SITE_B), '2026-10-07')?.standbyPerDay ?? 0
  const standbyDays = ['CQ-01|2026-10-07', 'CP-01|2026-10-10']
  const sbLines: InvoiceLine[] = standbyDays.map(k => ({ label: `${k.split('|')[0]} · client standby, no hole · ${k.slice(-2)}/${k.slice(-5, -3)}`, qty: '1 day', rate: money(sbRate), amount: sbRate }))
  const sbSub = sbLines.reduce((s, l) => s + l.amount, 0)
  const standbyInvoice: Invoice = {
    id: 'inv_seed_sb', number: 'INV-0004', project: SITE_B, client: siteB?.client ?? '', date: '2026-10-15', holeNumbers: [],
    lines: sbLines, subtotal: sbSub, taxPercent: 15, total: sbSub * 1.15, status: 'paid', dueDate: '2026-11-14',
    paidDate: '2026-10-27', paidAmount: sbSub * 1.15, standbyDays,
  }
  const withInvoices = { ...base, invoices: sbRate ? [...demo.invoices, standbyInvoice] : demo.invoices, holeStatus: { ...base.holeStatus, ...demo.holeStatus } }
  return { ...withInvoices, contractorBills: seedBills(withInvoices) }
}

/* The demo company as it is first loaded. Sent to the server once, by the
 * first-time set-up, when a database is connected. */
export const seedCostingState = () => initial()

/* A company with nothing in it yet: what a store holds until the server has
 * answered. */
function emptyState(): State {
  return {
    shiftLogs: [], maintenance: [], ownership: [], operating: [], clientRates: [], holeStatus: {}, invoices: [],
    holePlans: {}, projects: [], projectEvents: [], rateProposals: [], contractors: [], workOrders: [],
    contractorReports: [], contractorBills: [], wording: 'standard', users: [], findingStatus: {}, rigRegister: [], crew: [],
    surveys: [], surveyProfiles: [],
  }
}

/* A browser that saved its state before a seed plan existed still gets that
 * plan; anything the user set himself wins over the seed. */
function withSeedPlans(s: State): State {
  /* A demo browser saved before the answer history existed still gets it. */
  const history = IS_DEMO ? PAST_STATUS : {}
  /* A browser saved before surveys existed has hole plans and projects with
   * no collar, direction or site coordinates: fill those in from the seed,
   * keeping everything the user changed. */
  const plans: Record<string, HolePlan> = { ...SEED_HOLE_PLANS }
  Object.entries(s.holePlans ?? {}).forEach(([id, p]) => {
    const seed = SEED_HOLE_PLANS[id]
    plans[id] = seed ? { ...p, collar: p.collar ?? seed.collar, azimuth: p.azimuth ?? seed.azimuth, dip: p.dip ?? seed.dip } : p
  })
  const projects = (s.projects ?? []).map(p => {
    const seed = SEED_PROJECTS.find(x => x.id === p.id)
    return seed ? { ...p, coords: p.coords ?? seed.coords, utmZone: p.utmZone ?? seed.utmZone, budgetTotal: p.budgetTotal ?? seed.budgetTotal, budgetPerMetre: p.budgetPerMetre ?? seed.budgetPerMetre, plannedEnd: p.plannedEnd ?? seed.plannedEnd } : p
  })
  return { ...s, projects, holePlans: plans, surveys: s.surveys ?? [], findingStatus: { ...history, ...(s.findingStatus ?? {}) } }
}

export const uid = (p: string) => `${p}_${Date.now()}_${Math.floor(Math.random() * 9999)}`

/* The system's date with the clock's time: every seeded record sits on the
 * system date, so a change made now has to sit on it too or the change list
 * would jump a month. */
export function nowStamp() {
  const d = new Date()
  return `${TODAY}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
export function listOf(items: string[]) {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}
export function crewLine(p: { supervisors: string[]; drillers: string[] }) {
  const n = (k: number, one: string) => `${k} ${one}${k === 1 ? '' : 's'}`
  return `${n(p.supervisors.length, 'supervisor')}, ${n(p.drillers.length, 'driller')}`
}

export type VersionKind = 'ownership' | 'operating' | 'clientRate'

interface CtxValue {
  state: State
  saveOwnership: (o: RigOwnership) => void
  saveOperating: (o: OperatingRate) => void
  saveClientRate: (c: ClientRate) => void
  deleteVersion: (kind: VersionKind, id: string) => void
  setHoleStatus: (holeNumber: string, s: HoleStatus) => void
  addInvoice: (i: Invoice) => void
  updateInvoice: (i: Invoice) => void
  deleteInvoice: (id: string) => void
  // Company → client
  submitHole: (holeNumber: string) => void
  withdrawHole: (holeNumber: string) => void
  // Client → company
  ownerDecideHole: (holeNumber: string, approve: boolean, reason?: string) => void
  ownerReviewInvoice: (id: string, reviews: (LineReview | null)[]) => void
  ownerMarkPaid: (id: string) => void
  setHolePlan: (holeNumber: string, plan: HolePlan | null) => void
  // Projects
  createProject: (p: ProjectRecord, opening?: { rate?: ClientRate; holes?: { id: string; plan: HolePlan }[] }) => void
  updateProject: (id: string, patch: Partial<ProjectRecord>, log?: ProjectLog | ProjectLog[]) => void
  planHoles: (project: string, holes: { id: string; plan: HolePlan | null }[], by: 'contractor' | 'owner', log: ProjectLog) => void
  proposeRates: (project: string, rate: ClientRate) => void
  withdrawProposal: (id: string) => void
  ownerAnswerRates: (id: string, accept: boolean, note?: string) => void
  markProjectSeen: (project: string, who: 'contractor' | 'owner') => void
  // Contractors working for us
  // The shift record itself: a drill log or a maintenance log, new or changed.
  saveShiftLog: (log: ShiftLog) => void
  deleteShiftLog: (id: string) => void
  saveMaintenance: (m: MaintenanceLog) => void
  deleteMaintenance: (id: string) => void
  // Logins
  saveUser: (u: AppUser) => void
  removeUser: (id: string) => void
  saveContractor: (c: Contractor) => void
  saveWorkOrder: (w: WorkOrder) => void
  addReports: (r: ContractorReport[]) => void
  /* The contractor sends a shift, or sends a corrected one in place of the
   * one that came back. */
  saveReport: (r: ContractorReport) => void
  acceptReport: (id: string, by: string, a?: { metres?: number; coreRecovery?: number; standbyPayable?: boolean; note?: string }) => void
  returnReport: (id: string, by: string, reason: string) => void
  reopenReport: (id: string) => void
  deleteReport: (id: string) => void
  saveBill: (b: ContractorBill) => void
  approveBill: (id: string, snapshot: BillSnapshot) => void
  returnBill: (id: string, reason: string) => void
  reopenBill: (id: string) => void
  markBillPaid: (id: string) => void
  setWording: (w: Wording) => void
  // Downhole surveys
  /* Collar and planned direction for holes on a project, merged into each
   * hole's plan. A hole with no plan yet gets one at the depth it has reached. */
  setHoleSetup: (project: string, holes: { id: string; patch: Partial<HolePlan> }[], log: ProjectLog) => void
  saveSurveys: (readings: SurveyReading[]) => void
  deleteSurvey: (id: string) => void
  saveSurveyProfile: (p: SurveyProfile) => void
  setFindingStatus: (id: string, st: FindingStatus | null) => void
  saveRig: (r: RigRecord) => void
  saveCrew: (c: CrewMember) => void
  removeCrew: (id: string) => void
  resetAll: () => void
  /* True once the state on screen is the real one: read from this browser in
   * the demo, or from the server when a database is connected. */
  ready: boolean
  mode: 'loading' | 'demo' | 'server'
}

/* What a change is called in the project's change list. */
export interface ProjectLog { kind: ProjectEventKind; title: string; detail?: string }

const CostingContext = createContext<CtxValue | null>(null)
/* v4: logins, and the fuller drill and maintenance logs, joined the record. An older
 * saved copy has none of them, so it is left behind rather than merged. */
/* v6: the MVP v2 demo (an inbox history, standby billed, a bill cut to the record). */
const KEY = 'xplorix_costing_v7_sar'

/* One store per browser tab. A layout mounts the provider once; a screen that
 * also wraps itself in <CostingProvider> (Finance, Inventory, Projects do, so
 * each still works on its own) joins the one already above it instead of
 * starting a second copy that would drift from the first. */
export function CostingProvider({ children }: { children: ReactNode }) {
  const parent = useContext(CostingContext)
  if (parent) return <>{children}</>
  return <CostingRoot>{children}</CostingRoot>
}

function CostingRoot({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(initial)
  const [loaded, setLoaded] = useState(false)
  /* With a database connected the state comes from the server and goes back
   * to it. Without one it lives in this browser, as it always did. */
  const sync = useServerSync('costing', state, setState, emptyState)
  const local = sync.mode === 'demo'

  useEffect(() => {
    if (!local) return
    try { const raw = localStorage.getItem(KEY); if (raw) setState(() => withSeedPlans({ ...initial(), ...JSON.parse(raw) })) } catch {}
    setLoaded(true)
  }, [local])
  useEffect(() => { if (local && loaded) try { localStorage.setItem(KEY, JSON.stringify(state)) } catch {} }, [state, loaded, local])

  /* The company and its client are two tabs on the same store. When one
   * tab saves, the browser tells every other tab; taking that value here is
   * what makes an invoice raised in Finance appear in the Client Portal without
   * a refresh — and stops a tab that loaded earlier from saving its older copy
   * back over the newer one. Writing an identical value fires no event, so the
   * two tabs settle instead of echoing. */
  useEffect(() => {
    if (!local) return
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY || !e.newValue) return
      try { setState(withSeedPlans({ ...initial(), ...JSON.parse(e.newValue) })) } catch {}
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [local])

  function upsert<T extends { id: string }>(list: T[], item: T): T[] {
    return list.some(x => x.id === item.id) ? list.map(x => x.id === item.id ? item : x) : [...list, item]
  }

  const saveOwnership: CtxValue['saveOwnership'] = o => setState(s => ({ ...s, ownership: upsert(s.ownership, o) }))
  const saveOperating: CtxValue['saveOperating'] = o => setState(s => ({ ...s, operating: upsert(s.operating, o) }))
  const saveClientRate: CtxValue['saveClientRate'] = c => setState(s => ({ ...s, clientRates: upsert(s.clientRates, c) }))

  const deleteVersion: CtxValue['deleteVersion'] = (kind, id) => setState(s => {
    if (kind === 'ownership') return { ...s, ownership: s.ownership.filter(x => x.id !== id) }
    if (kind === 'operating') return { ...s, operating: s.operating.filter(x => x.id !== id) }
    return { ...s, clientRates: s.clientRates.filter(x => x.id !== id) }
  })

  const setHoleStatus: CtxValue['setHoleStatus'] = (holeNumber, status) => setState(s => ({
    ...s, holeStatus: { ...s.holeStatus, [holeNumber]: { ...s.holeStatus[holeNumber], status } },
  }))

  const addInvoice: CtxValue['addInvoice'] = inv => setState(s => {
    const hs = { ...s.holeStatus }
    inv.holeNumbers.forEach(n => { hs[n] = { status: 'invoiced', invoiceId: inv.id } })
    return { ...s, invoices: [...s.invoices, inv], holeStatus: hs }
  })
  const updateInvoice: CtxValue['updateInvoice'] = inv => setState(s => {
    const hs = { ...s.holeStatus }
    inv.holeNumbers.forEach(n => {
      hs[n] = inv.status === 'cancelled'
        ? { status: 'approved' }
        : { status: 'invoiced', invoiceId: inv.id }
    })
    return { ...s, invoices: s.invoices.map(i => i.id === inv.id ? inv : i), holeStatus: hs }
  })
  const deleteInvoice: CtxValue['deleteInvoice'] = id => setState(s => {
    const hs = { ...s.holeStatus }
    Object.keys(hs).forEach(n => { if (hs[n].invoiceId === id) hs[n] = { status: 'approved' } })
    return { ...s, invoices: s.invoices.filter(i => i.id !== id), holeStatus: hs }
  })

  /* Decisions are dated on the system's date, like every other record. */
  const stamp = () => TODAY

  const submitHole: CtxValue['submitHole'] = holeNumber => setState(s => ({
    ...s, holeStatus: { ...s.holeStatus, [holeNumber]: { status: 'submitted', submittedAt: stamp() } },
  }))
  const withdrawHole: CtxValue['withdrawHole'] = holeNumber => setState(s => ({
    ...s, holeStatus: { ...s.holeStatus, [holeNumber]: { status: 'closed' } },
  }))
  /* Approve moves the hole on to where the contractor can invoice it. Return
   * sends it back to closed and keeps the owner's reason beside it, so the
   * contractor knows what to fix before sending it again. */
  const ownerDecideHole: CtxValue['ownerDecideHole'] = (holeNumber, approve, reason) => setState(s => {
    const prev = s.holeStatus[holeNumber]
    return {
      ...s, holeStatus: {
        ...s.holeStatus,
        [holeNumber]: approve
          ? { status: 'approved', submittedAt: prev?.submittedAt, decidedAt: stamp() }
          : { status: 'closed', submittedAt: prev?.submittedAt, decidedAt: stamp(), returnReason: reason?.trim() || 'Returned by the client' },
      },
    }
  })
  const ownerReviewInvoice: CtxValue['ownerReviewInvoice'] = (id, reviews) => setState(s => ({
    ...s, invoices: s.invoices.map(i => i.id !== id ? i : {
      ...i, lineReviews: reviews, ownerStatus: ownerStatusFor(i.lines, reviews), reviewedAt: stamp(),
    }),
  }))
  const ownerMarkPaid: CtxValue['ownerMarkPaid'] = id => setState(s => ({
    ...s, invoices: s.invoices.map(i => i.id !== id ? i : {
      ...i, status: 'paid', paidDate: stamp(), paidAmount: i.total - disputedAmount(i) * (1 + i.taxPercent / 100),
    }),
  }))
  const setHolePlan: CtxValue['setHolePlan'] = (holeNumber, plan) => setState(s => {
    const next = { ...s.holePlans }
    if (plan) next[holeNumber] = plan; else delete next[holeNumber]
    return { ...s, holePlans: next }
  })

  // ── projects ─────────────────────────────────────────────────────────────
  /* Every project change goes through one of these, and every one of them
   * writes its own line in the change list. The side that made the change has
   * seen it; the other side has not, and that is its notification. */
  const event = (project: string, by: 'contractor' | 'owner', l: ProjectLog): ProjectEvent => ({
    id: uid('pe'), project, at: nowStamp(), by, kind: l.kind, title: l.title, detail: l.detail,
    seenByContractor: by === 'contractor', seenByOwner: by === 'owner',
  })

  const createProject: CtxValue['createProject'] = (p, opening) => setState(s => {
    const events: ProjectEvent[] = [event(p.name, 'contractor', { kind: 'created', title: 'Project created', detail: `${p.name} · ${p.location}` })]
    if (p.shared) events.push(event(p.name, 'contractor', { kind: 'shared', title: `Shared with ${p.client}`, detail: 'Contract rates, planned holes, rigs and crew are now visible in the client login.' }))
    if (opening?.rate) events.push(event(p.name, 'contractor', { kind: 'rates', title: `Contract rates set, from ${fullDate(opening.rate.effectiveFrom)}`, detail: opening.rate.note }))
    if (p.rigs.length) events.push(event(p.name, 'contractor', { kind: 'rig', title: `${listOf(p.rigs)} assigned` }))
    if (p.supervisors.length + p.drillers.length) events.push(event(p.name, 'contractor', { kind: 'crew', title: 'Crew assigned', detail: crewLine(p) }))
    const plans = { ...s.holePlans }
    const holes = opening?.holes ?? []
    holes.forEach(h => { plans[h.id] = { ...h.plan, project: p.name, by: 'contractor', addedAt: nowStamp() } })
    if (holes.length) events.push(event(p.name, 'contractor', {
      kind: 'hole', title: `${holes.length} ${holes.length === 1 ? 'hole' : 'holes'} added to the plan`,
      detail: holes.map(h => `${h.id} (${h.plan.plannedDepth} m)`).join(', '),
    }))
    return {
      ...s, projects: [...s.projects, p], holePlans: plans,
      clientRates: opening?.rate ? [...s.clientRates, opening.rate] : s.clientRates,
      projectEvents: [...s.projectEvents, ...events],
    }
  })

  const updateProject: CtxValue['updateProject'] = (id, patch, log) => setState(s => {
    const before = s.projects.find(p => p.id === id)
    if (!before) return s
    const logs = log ? (Array.isArray(log) ? log : [log]) : []
    return {
      ...s, projects: s.projects.map(p => p.id === id ? { ...p, ...patch } : p),
      projectEvents: [...s.projectEvents, ...logs.map(l => event(before.name, 'contractor', l))],
    }
  })

  const planHoles: CtxValue['planHoles'] = (project, holes, by, log) => setState(s => {
    const plans = { ...s.holePlans }
    holes.forEach(h => {
      if (h.plan) plans[h.id] = { by, addedAt: nowStamp(), ...plans[h.id], ...h.plan, project }
      else delete plans[h.id]
    })
    return { ...s, holePlans: plans, projectEvents: [...s.projectEvents, event(project, by, log)] }
  })

  const proposeRates: CtxValue['proposeRates'] = (project, rate) => setState(s => {
    const shared = s.projects.find(p => p.name === project)?.shared
    if (!shared) {
      return {
        ...s, clientRates: upsert(s.clientRates, rate),
        projectEvents: [...s.projectEvents, event(project, 'contractor', { kind: 'rates', title: `Contract rates changed, from ${fullDate(rate.effectiveFrom)}`, detail: rate.note })],
      }
    }
    // One proposal at a time: a new one replaces the one still waiting.
    const open = s.rateProposals.map(r => r.project === project && r.status === 'waiting' ? { ...r, status: 'withdrawn' as ProposalStatus } : r)
    return {
      ...s,
      rateProposals: [...open, { id: uid('rp'), project, rate, proposedAt: nowStamp(), status: 'waiting' }],
      projectEvents: [...s.projectEvents, event(project, 'contractor', { kind: 'rates', title: `New rates proposed, from ${fullDate(rate.effectiveFrom)}`, detail: rate.note })],
    }
  })

  const withdrawProposal: CtxValue['withdrawProposal'] = id => setState(s => {
    const r = s.rateProposals.find(x => x.id === id)
    if (!r || r.status !== 'waiting') return s
    return {
      ...s, rateProposals: s.rateProposals.map(x => x.id === id ? { ...x, status: 'withdrawn' } : x),
      projectEvents: [...s.projectEvents, event(r.project, 'contractor', { kind: 'rates', title: 'Rate proposal withdrawn', detail: 'The agreed rates stay in force.' })],
    }
  })

  const ownerAnswerRates: CtxValue['ownerAnswerRates'] = (id, accept, note) => setState(s => {
    const r = s.rateProposals.find(x => x.id === id)
    if (!r || r.status !== 'waiting') return s
    const answered: RateProposal = { ...r, status: accept ? 'accepted' : 'returned', answeredAt: nowStamp(), ownerNote: note?.trim() || undefined }
    return {
      ...s,
      rateProposals: s.rateProposals.map(x => x.id === id ? answered : x),
      clientRates: accept ? upsert(s.clientRates, r.rate) : s.clientRates,
      projectEvents: [...s.projectEvents, event(r.project, 'owner', accept
        ? { kind: 'rates', title: `New rates accepted, in force from ${fullDate(r.rate.effectiveFrom)}`, detail: note?.trim() || undefined }
        : { kind: 'rates', title: 'New rates sent back', detail: note?.trim() || 'No reason given' })],
    }
  })

  const markProjectSeen: CtxValue['markProjectSeen'] = (project, who) => setState(s => {
    const key = who === 'owner' ? 'seenByOwner' : 'seenByContractor'
    if (!s.projectEvents.some(e => e.project === project && !e[key])) return s
    return { ...s, projectEvents: s.projectEvents.map(e => e.project === project && !e[key] ? { ...e, [key]: true } : e) }
  })

  // ── the shift record ─────────────────────────────────────────────────────
  /* A log and the second-hole row that hangs off it are saved together, so a
   * change to the log can never leave an old second row behind. */
  const setFindingStatus: CtxValue['setFindingStatus'] = (id, st) => setState(s => {
    const next = { ...(s.findingStatus ?? {}) }
    if (st) next[id] = st; else delete next[id]
    return { ...s, findingStatus: next }
  })
  const saveShiftLog: CtxValue['saveShiftLog'] = log => setState(s => {
    const seg = segmentFor(log)
    const rest = s.shiftLogs.filter(l => l.id !== log.id && l.segmentOf !== log.id)
    return { ...s, shiftLogs: [...rest, log, ...(seg ? [seg] : [])] }
  })
  const deleteShiftLog: CtxValue['deleteShiftLog'] = id => setState(s => ({ ...s, shiftLogs: s.shiftLogs.filter(l => l.id !== id && l.segmentOf !== id) }))
  const saveMaintenance: CtxValue['saveMaintenance'] = m => setState(s => ({ ...s, maintenance: upsert(s.maintenance, m) }))
  const deleteMaintenance: CtxValue['deleteMaintenance'] = id => setState(s => ({ ...s, maintenance: s.maintenance.filter(m => m.id !== id) }))

  const saveUser: CtxValue['saveUser'] = u => setState(s => ({ ...s, users: upsert(s.users, u) }))
  const removeUser: CtxValue['removeUser'] = id => setState(s => ({ ...s, users: s.users.filter(u => u.id !== id) }))

  // ── contractors working for us ───────────────────────────────────────────
  const saveContractor: CtxValue['saveContractor'] = c => setState(s => ({ ...s, contractors: upsert(s.contractors, c) }))
  const saveWorkOrder: CtxValue['saveWorkOrder'] = w => setState(s => ({ ...s, workOrders: upsert(s.workOrders, w) }))
  const addReports: CtxValue['addReports'] = list => setState(s => ({ ...s, contractorReports: [...s.contractorReports, ...list] }))
  const saveReport: CtxValue['saveReport'] = r => setState(s => ({ ...s, contractorReports: upsert(s.contractorReports, r) }))
  /* Accepting a report is what puts it in the record. From this moment the
   * metres count toward progress, the client's invoice and what we owe. */
  const acceptReport: CtxValue['acceptReport'] = (id, by, a) => setState(s => {
    const r = s.contractorReports.find(x => x.id === id)
    const wo = r && s.workOrders.find(w => w.id === r.workOrderId)
    if (!r || !wo) return s
    const shift = reportToShift(r, wo, by, nowStamp(), a)
    const seg = segmentFor(shift)
    return {
      ...s,
      contractorReports: s.contractorReports.filter(x => x.id !== id),
      shiftLogs: [...s.shiftLogs.filter(l => l.id !== shift.id && l.segmentOf !== shift.id), shift, ...(seg ? [seg] : [])],
    }
  })
  const returnReport: CtxValue['returnReport'] = (id, by, reason) => setState(s => ({
    ...s, contractorReports: s.contractorReports.map(r => r.id !== id ? r : {
      ...r, status: 'returned', returnedBy: by, returnedAt: nowStamp(), returnReason: reason.trim() || 'Sent back without a reason',
    }),
  }))
  const reopenReport: CtxValue['reopenReport'] = id => setState(s => ({
    ...s, contractorReports: s.contractorReports.map(r => r.id !== id ? r : { ...r, status: 'waiting', returnedBy: undefined, returnedAt: undefined, returnReason: undefined }),
  }))
  const deleteReport: CtxValue['deleteReport'] = id => setState(s => ({ ...s, contractorReports: s.contractorReports.filter(r => r.id !== id) }))

  const saveBill: CtxValue['saveBill'] = b => setState(s => ({ ...s, contractorBills: upsert(s.contractorBills, b) }))
  const approveBill: CtxValue['approveBill'] = (id, snapshot) => setState(s => ({
    ...s, contractorBills: s.contractorBills.map(b => b.id !== id ? b : { ...b, status: 'approved', approved: snapshot, returnReason: undefined }),
  }))
  const returnBill: CtxValue['returnBill'] = (id, reason) => setState(s => ({
    ...s, contractorBills: s.contractorBills.map(b => b.id !== id ? b : { ...b, status: 'returned', approved: undefined, returnReason: reason.trim() || 'Sent back without a reason' }),
  }))
  const reopenBill: CtxValue['reopenBill'] = id => setState(s => ({
    ...s, contractorBills: s.contractorBills.map(b => b.id !== id ? b : { ...b, status: 'received', approved: undefined, returnReason: undefined, paidAt: undefined }),
  }))
  const markBillPaid: CtxValue['markBillPaid'] = id => setState(s => ({
    ...s, contractorBills: s.contractorBills.map(b => b.id !== id || !b.approved ? b : { ...b, status: 'paid', paidAt: nowStamp() }),
  }))
  const setWording: CtxValue['setWording'] = wording => setState(s => ({ ...s, wording }))

  const setHoleSetup: CtxValue['setHoleSetup'] = (project, holes, log) => setState(s => {
    const plans = { ...s.holePlans }
    holes.forEach(h => {
      const before = plans[h.id]
      const reached = s.shiftLogs.filter(l => l.holeNumber === h.id).reduce((m, l) => m + l.metresDrilled, 0)
      const base: HolePlan = before ?? { plannedDepth: Math.max(1, Math.ceil(reached)), by: 'contractor', addedAt: nowStamp() }
      plans[h.id] = { ...base, ...h.patch, project }
    })
    return { ...s, holePlans: plans, projectEvents: [...s.projectEvents, event(project, 'contractor', log)] }
  })
  const saveSurveys: CtxValue['saveSurveys'] = list => setState(s => ({ ...s, surveys: list.reduce((acc, r) => upsert(acc, r), s.surveys ?? []) }))
  const deleteSurvey: CtxValue['deleteSurvey'] = id => setState(s => ({ ...s, surveys: (s.surveys ?? []).filter(r => r.id !== id) }))
  const saveSurveyProfile: CtxValue['saveSurveyProfile'] = p => setState(s => ({ ...s, surveyProfiles: upsert(s.surveyProfiles ?? [], p) }))
  const saveRig: CtxValue['saveRig'] = x => setState(s => ({ ...s, rigRegister: upsert(s.rigRegister ?? [], x) }))
  const saveCrew: CtxValue['saveCrew'] = x => setState(s => ({ ...s, crew: upsert(s.crew ?? [], x) }))
  const removeCrew: CtxValue['removeCrew'] = id => setState(s => ({ ...s, crew: (s.crew ?? []).filter(c => c.id !== id) }))

  // Plain helper functions elsewhere read the project list through mirrors;
  // bring them into step before anything below renders.
  syncRegistry(state.projects ?? SEED_PROJECTS)

  return (
    <CostingContext.Provider value={{
      state, saveOwnership, saveOperating, saveClientRate, deleteVersion,
      setHoleStatus, addInvoice, updateInvoice, deleteInvoice,
      submitHole, withdrawHole, ownerDecideHole, ownerReviewInvoice, ownerMarkPaid, setHolePlan,
      createProject, updateProject, planHoles, proposeRates, withdrawProposal, ownerAnswerRates, markProjectSeen,
      saveShiftLog, deleteShiftLog, saveMaintenance, deleteMaintenance, saveUser, removeUser,
      saveContractor, saveWorkOrder, addReports, saveReport, acceptReport, returnReport, reopenReport, deleteReport,
      saveBill, approveBill, returnBill, reopenBill, markBillPaid, setWording, setFindingStatus, saveRig, saveCrew, removeCrew,
      setHoleSetup, saveSurveys, deleteSurvey, saveSurveyProfile,
      resetAll: () => { if (local) setState(initial()) },
      ready: local ? loaded : sync.ready, mode: sync.mode,
    }}>{children}</CostingContext.Provider>
  )
}

export function useCosting() {
  const c = useContext(CostingContext)
  if (!c) throw new Error('useCosting must be used inside CostingProvider')
  return c
}

/* Same context, but null instead of a throw when the provider is absent. A
 * screen that only wants the log history to enrich what it shows should
 * degrade rather than break the page. */
export function useCostingOptional() {
  return useContext(CostingContext)
}

/* ── Selectors ──────────────────────────────────────────────────────────── */

export function rigsFor(logs: ShiftLog[], project: string) {
  return Array.from(new Set(logs.filter(l => l.project === project).map(l => l.rig))).sort()
}
export function monthsFor(logs: ShiftLog[], rig: string, project: string) {
  return Array.from(new Set(logs.filter(l => l.rig === rig && l.project === project).map(l => monthOf(l.date)))).sort()
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export function monthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}
export function monthShort(ym: string) {
  const [, m] = ym.split('-').map(Number)
  return MON[m - 1]
}
export function dayLabel(date: string) {
  const [, m, d] = date.split('-').map(Number)
  return `${d} ${MON[m - 1]}`
}
export function fullDate(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  return `${d} ${MON[m - 1]} ${y}`
}

export function blankOwnership(rig: string, from: string): RigOwnership {
  return {
    id: uid('own'), rig, effectiveFrom: from,
    basicPrice: 0, gstPercent: 15, transportation: 0, depreciationRatePct: 20,
    emiPerMonth: 0, insurancePerYear: 0, otherFixedPerMonth: 0,
    costBasis: 'cash', allocationBasis: 'operatingDay',
    expectedOperatingDays: 25, expectedUnitsPerMonth: 300,
  }
}
export function blankOperating(rig: string, project: string, from: string): OperatingRate {
  return {
    id: uid('op'), rig, project, effectiveFrom: from,
    fuelPricePerLitre: 0, waterPricePerLitre: 0, additivePricePerKg: 0,
    labourRate: 0, lodgingRate: 0, transportRate: 0, chargePerMetre: false,
  }
}
export function blankClientRate(project: string, from: string): ClientRate {
  return {
    id: uid('cr'), project, effectiveFrom: from, structure: 'flat',
    rateRows: [{ id: uid('r'), holeSize: 'HQ', formation: 'Hard rock', rate: 0, adjustments: [] }],
    standbyPerDay: 0, mobilisation: 0, demobilisation: 0,
  }
}

/* ── UI tokens ──────────────────────────────────────────────────────────── */

export const C = {
  bg: 'var(--x-bg)', card: 'var(--x-card)', border: 'var(--x-border)',
  orange: 'var(--x-orange)', orangeD: 'var(--x-orange-d)',
  green: 'var(--x-green)', red: 'var(--x-red)', amber: 'var(--x-amber)',
  blue: 'var(--x-blue)', purple: 'var(--x-purple)', teal: 'var(--x-teal)',
  text: 'var(--x-text)', muted: 'var(--x-muted)', faint: 'var(--x-faint)', dim: 'var(--x-dim)',
}

export const LAYER = { operating: C.amber, ownership: C.purple, full: C.orange, revenue: C.blue }

export const iStyle: React.CSSProperties = {
  padding: '6px 10px', background: C.bg, border: `1px solid ${C.border}`,
  borderRadius: 7, color: C.text, fontSize: 12.5,
  fontFamily: 'inherit', width: '100%',
}
export const derivedStyle: React.CSSProperties = {
  padding: '6px 10px', background: 'rgba(var(--x-ov),0.02)',
  border: `1px dashed ${C.border}`, borderRadius: 7, color: C.text,
  fontSize: 12.5, fontFamily: 'ui-monospace, monospace', width: '100%',
}

export function money(n: number) {
  return `${n < 0 ? '−' : ''}SAR ${Math.abs(Math.round(n)).toLocaleString('en-US')}`
}
export function moneyL(n: number) {
  const a = Math.abs(n)
  if (a >= 1000000) return `${n < 0 ? '−' : ''}SAR ${(a / 1000000).toFixed(2)}M`
  if (a >= 100000) return `${n < 0 ? '−' : ''}SAR ${Math.round(a / 1000)}K`
  return money(n)
}
export function perUnit(n: number | null) {
  return n == null ? '—' : `${n < -0.5 ? '−' : ''}SAR ${Math.abs(Math.round(n)).toLocaleString('en-US')}/m`
}
export function pct(n: number) { return `${n.toFixed(1)}%` }

export function cpuColor(cpu: number, rate: number) {
  if (!rate) return C.muted
  const m = (rate - cpu) / rate
  return m >= 0.3 ? C.green : m >= 0.12 ? C.amber : C.red
}
export function marginColor(m: number) { return m >= 0 ? C.green : C.red }
export function statusColor(s: DayStatus) {
  return s === 'drilling' ? C.green : s === 'standby' ? C.amber : C.red
}
export function holeStatusColor(s: HoleStatus) {
  return s === 'drilling' ? C.blue : s === 'closed' ? C.amber : s === 'submitted' ? C.teal : s === 'approved' ? C.green : C.purple
}
