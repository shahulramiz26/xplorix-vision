'use client'

import { createContext, createElement, useContext, useEffect, useState, ReactNode } from 'react'
import { ownershipBreakdown, SEED_OWNERSHIP, type RigOwnership } from './costing-store'
import { SEED_CATALOGUE, normFormation, partWorksIn, type Part, type Formation, FORMATIONS } from './inventory-store'

/* ==========================================================================
 * XPLORIX BID INTELLIGENCE
 *
 * A tender is the costing engine run forwards.
 *
 * Costing takes logs and produces a cost per metre. Bidding takes assumptions
 * and produces the same figure before a single metre is drilled. Same layers,
 * same arithmetic, same vocabulary — so a bid that is won converts into a
 * project that costs out identically instead of quietly disagreeing with the
 * spreadsheet it was priced on.
 *
 *   assumptions → ROP → production → duration
 *                                      ↓
 *                    consumables + crew + fuel + ownership
 *                                      ↓
 *                                 total cost
 *                                      ↓
 *                          ÷ billable metres = CPM
 *                                      ↓
 *                        + margin + risk = bid price
 *
 * Nothing here is a black box. Every number carries where it came from, how
 * confident that source is, and the working that produced it. A contractor who
 * has never priced a tender should be able to read the derivation and argue
 * with any line of it — that is the whole product.
 *
 * No rule is hard-coded into a calculation. Base rates of penetration, wear
 * factors, shift losses and risk weights all live in editable tables, because
 * the one thing certain about drilling assumptions is that yours will differ
 * from mine.
 * ========================================================================== */

/* ── Where a number came from ──────────────────────────────────────────────
 *
 * The single most important idea in the module. An estimate built from a
 * client's own geological report is worth more than one built from a regional
 * average, which is worth more than a guess — and the estimator has to be able
 * to see which is which at a glance, on every figure, without clicking. */

export type Source = 'client' | 'historical' | 'reference' | 'user'
export type Confidence = 'high' | 'medium' | 'low'

export const SOURCE_LABEL: Record<Source, string> = {
  client: 'Client tender data',
  historical: 'Your own past projects',
  reference: 'XPLORIX reference library',
  user: 'Estimator assumption',
}
export const SOURCE_SHORT: Record<Source, string> = {
  client: 'Client', historical: 'History', reference: 'Reference', user: 'Assumed',
}
/* Confidence follows the source unless the estimator overrides it. Client data
 * is not automatically high — a tender that says "hard rock" and nothing else
 * is still a guess. */
export const SOURCE_CONFIDENCE: Record<Source, Confidence> = {
  client: 'high', historical: 'high', reference: 'medium', user: 'low',
}

export interface Sourced {
  value: number
  source: Source
  confidence: Confidence
  note?: string
}

export const sourced = (value: number, source: Source, note?: string): Sourced => ({
  value, source, confidence: SOURCE_CONFIDENCE[source], note,
})

/* ── Tender scope ─────────────────────────────────────────────────────── */

export const METHODS = ['Diamond Core', 'RC', 'Blast Hole', 'Geotechnical'] as const
export type Method = typeof METHODS[number]

export const HOLE_SIZES = ['AQ', 'BQ', 'NQ', 'HQ', 'PQ'] as const

export const HARDNESS = ['Soft', 'Medium', 'Hard', 'Very Hard', 'Extremely Hard'] as const
export type Hardness = typeof HARDNESS[number]

export const ABRASIVENESS = ['Low', 'Medium', 'High', 'Very High'] as const
export const FRACTURING = ['Low', 'Medium', 'High', 'Very High'] as const
export const GROUND = ['Competent', 'Fractured', 'Broken', 'Highly Broken', 'Clay / Problematic'] as const

export type Level4 = typeof ABRASIVENESS[number]
export type GroundCondition = typeof GROUND[number]

/* One band of rock the hole passes through. Percentages are of total metres,
 * so the bands always describe the whole job. */
export interface GeoBand {
  id: string
  name: string
  lithology: string
  hardness: Hardness
  abrasiveness: Level4
  fracturing: Level4
  ground: GroundCondition
  sharePct: number
  source: Source
  confidence: Confidence
  expectedRecoveryPct: number
}

export interface BidScope {
  method: Method
  holeSize: string
  totalMetres: number
  holeCount: number
  avgDepth: number
  maxDepth: number
  inclinationDeg: number       // 90 = vertical
  shiftsPerDay: number
  shiftHours: number
  workingDaysPerWeek: number
  requiredDays?: number        // the tender's completion window, if any
}

/* ── What a shift actually spends its hours on ─────────────────────────────
 *
 * Assuming twelve hours of drilling in a twelve-hour shift is the single most
 * common way a tender is underpriced. The hours are itemised so the loss is
 * visible and arguable. */
export interface ShiftBudget {
  bitChangeHrs: number
  rodHandlingHrs: number
  maintenanceHrs: number
  surveyHrs: number
  otherDowntimeHrs: number
}

export function effectiveHours(scope: BidScope, b: ShiftBudget): number {
  const lost = b.bitChangeHrs + b.rodHandlingHrs + b.maintenanceHrs + b.surveyHrs + b.otherDowntimeHrs
  return Math.max(0, scope.shiftHours - lost)
}

/* ── Rate of penetration ───────────────────────────────────────────────────
 *
 * A base rate looked up from an editable table, then adjusted. The adjustments
 * matter more than the base: the same granite drills at wildly different rates
 * depending on how broken it is and how deep you are.
 *
 * Everything below is data, not code. An admin who disagrees with "hard rock
 * at NQ runs 5.5 m/hr" changes the row, not the application. */

export interface RopRule {
  id: string
  method: Method
  hardness: Hardness
  holeSize: string
  baseRop: number      // metres per effective drilling hour
  source: Source
}

export const SEED_ROP_RULES: RopRule[] = [
  { id: 'rr1', method: 'Diamond Core', hardness: 'Soft',           holeSize: 'NQ', baseRop: 9.0, source: 'reference' },
  { id: 'rr2', method: 'Diamond Core', hardness: 'Medium',         holeSize: 'NQ', baseRop: 7.0, source: 'reference' },
  { id: 'rr3', method: 'Diamond Core', hardness: 'Hard',           holeSize: 'NQ', baseRop: 5.5, source: 'reference' },
  { id: 'rr4', method: 'Diamond Core', hardness: 'Very Hard',      holeSize: 'NQ', baseRop: 4.0, source: 'reference' },
  { id: 'rr5', method: 'Diamond Core', hardness: 'Extremely Hard', holeSize: 'NQ', baseRop: 2.8, source: 'reference' },
  { id: 'rr6', method: 'Diamond Core', hardness: 'Soft',           holeSize: 'HQ', baseRop: 8.0, source: 'reference' },
  { id: 'rr7', method: 'Diamond Core', hardness: 'Medium',         holeSize: 'HQ', baseRop: 6.2, source: 'reference' },
  { id: 'rr8', method: 'Diamond Core', hardness: 'Hard',           holeSize: 'HQ', baseRop: 4.8, source: 'reference' },
  { id: 'rr9', method: 'Diamond Core', hardness: 'Very Hard',      holeSize: 'HQ', baseRop: 3.5, source: 'reference' },
  { id: 'rr10', method: 'Diamond Core', hardness: 'Extremely Hard', holeSize: 'HQ', baseRop: 2.4, source: 'reference' },
  { id: 'rr11', method: 'Diamond Core', hardness: 'Hard',          holeSize: 'PQ', baseRop: 3.9, source: 'reference' },
  { id: 'rr12', method: 'Diamond Core', hardness: 'Medium',        holeSize: 'PQ', baseRop: 5.1, source: 'reference' },
  { id: 'rr13', method: 'RC',           hardness: 'Hard',          holeSize: 'NQ', baseRop: 22,  source: 'reference' },
  { id: 'rr14', method: 'RC',           hardness: 'Medium',        holeSize: 'NQ', baseRop: 28,  source: 'reference' },
]

/* Each adjustment is a named percentage the estimator can see and change. */
export interface RopFactor { label: string; pct: number }

export interface RopSettings {
  abrasiveness: Record<Level4, number>
  fracturing: Record<Level4, number>
  ground: Record<GroundCondition, number>
  depthPer100m: number        // applied beyond the first 100 m
  inclinationPenalty: number  // applied when the hole is not vertical
  crewExperience: number      // estimator's own crew factor
}

export const DEFAULT_ROP_SETTINGS: RopSettings = {
  abrasiveness: { Low: 0, Medium: -3, High: -6, 'Very High': -11 },
  fracturing:   { Low: 0, Medium: -4, High: -9, 'Very High': -15 },
  ground: {
    Competent: 0, Fractured: -5, Broken: -11,
    'Highly Broken': -18, 'Clay / Problematic': -14,
  },
  depthPer100m: -4,
  inclinationPenalty: -3,
  crewExperience: 5,
}

export interface RopResult {
  band: GeoBand
  baseRop: number
  baseSource: Source
  factors: RopFactor[]
  finalRop: number
  metres: number
}

export function estimateRop(
  band: GeoBand, scope: BidScope, rules: RopRule[], s: RopSettings,
): RopResult {
  const rule =
    rules.find(r => r.method === scope.method && r.hardness === band.hardness && r.holeSize === scope.holeSize)
    ?? rules.find(r => r.method === scope.method && r.hardness === band.hardness)
  const baseRop = rule?.baseRop ?? 0

  const factors: RopFactor[] = []
  const push = (label: string, pct: number) => { if (pct !== 0) factors.push({ label, pct }) }

  push(`${band.abrasiveness.toLowerCase()} abrasiveness`, s.abrasiveness[band.abrasiveness])
  push(`${band.fracturing.toLowerCase()} fracturing`, s.fracturing[band.fracturing])
  push(band.ground.toLowerCase(), s.ground[band.ground])

  /* Depth costs time — tripping, rod handling and hole condition all worsen
   * with it — so the penalty scales with how far past 100 m the average hole
   * runs rather than being a flat number. */
  const depthSteps = Math.max(0, (scope.avgDepth - 100) / 100)
  push(`average depth ${Math.round(scope.avgDepth)} m`, +(s.depthPer100m * depthSteps).toFixed(1))

  if (scope.inclinationDeg < 90) push(`${scope.inclinationDeg}° inclined`, s.inclinationPenalty)
  push('crew experience', s.crewExperience)

  const finalRop = factors.reduce((r, f) => r * (1 + f.pct / 100), baseRop)
  return {
    band, baseRop, baseSource: rule?.source ?? 'user', factors,
    finalRop: Math.max(0, finalRop),
    metres: scope.totalMetres * (band.sharePct / 100),
  }
}

/* ── Production ────────────────────────────────────────────────────────────
 *
 * Metres per rig per day, then the days needed. Availability covers the things
 * no shift budget can predict — a rig down for three days, a week of rain, a
 * client stopping work — and is deliberately separate from the shift losses so
 * the two are argued about independently. */

export interface ProductionPlan {
  effHoursPerShift: number
  effHoursPerDay: number
  blendedRop: number
  metresPerRigDay: number
  rigDays: number
  calendarDays: number
  rigCount: number
  availabilityPct: number
  meetsDeadline: boolean | null
}

export function planProduction(
  scope: BidScope, budget: ShiftBudget, rops: RopResult[],
  rigCount: number, availabilityPct: number,
): ProductionPlan {
  const effHoursPerShift = effectiveHours(scope, budget)
  const effHoursPerDay = effHoursPerShift * scope.shiftsPerDay

  /* Blended by metres, not by band count: a 5% band of extremely hard rock
   * should not drag the average as hard as a 60% band of it. */
  const totalM = rops.reduce((s, r) => s + r.metres, 0)
  const hours = rops.reduce((s, r) => s + (r.finalRop > 0 ? r.metres / r.finalRop : 0), 0)
  const blendedRop = hours > 0 ? totalM / hours : 0

  const metresPerRigDay = effHoursPerDay * blendedRop * (availabilityPct / 100)
  const rigDays = metresPerRigDay > 0 ? scope.totalMetres / metresPerRigDay : 0
  const perRig = rigCount > 0 ? rigDays / rigCount : 0
  const weekFactor = scope.workingDaysPerWeek > 0 ? 7 / scope.workingDaysPerWeek : 1
  const calendarDays = Math.ceil(perRig * weekFactor)

  return {
    effHoursPerShift, effHoursPerDay, blendedRop,
    metresPerRigDay, rigDays: Math.ceil(rigDays), calendarDays, rigCount, availabilityPct,
    meetsDeadline: scope.requiredDays ? calendarDays <= scope.requiredDays : null,
  }
}

/* ── Rig suitability ───────────────────────────────────────────────────────
 *
 * A weighted score, with every component visible. The score never picks the
 * rig — it orders the options and explains itself, and the estimator decides.
 * A rig that cannot reach the depth is excluded outright rather than scored
 * low, because no amount of cheapness fixes a rig that cannot do the job. */

export interface RigSpec {
  id: string
  name: string
  method: Method
  maxDepth: number
  sizes: string[]
  fuelLitresPerHour: number
  historicalRopFactor: number   // 1.0 = as the rule says
  maintenancePerDay: number
  status: 'Available' | 'Assigned' | 'Mobilising' | 'Under Maintenance' | 'Standby' | 'Decommissioned'
  availableFrom?: string
  locationKm: number            // from the site
}

export const SEED_RIGS: RigSpec[] = [
  { id: 'RIG-001', name: 'RIG-001', method: 'Diamond Core', maxDepth: 600, sizes: ['NQ', 'HQ'], fuelLitresPerHour: 10, historicalRopFactor: 1.04, maintenancePerDay: 280, status: 'Assigned', locationKm: 240 },
  { id: 'RIG-002', name: 'RIG-002', method: 'Diamond Core', maxDepth: 450, sizes: ['NQ', 'HQ'], fuelLitresPerHour: 9.2, historicalRopFactor: 0.96, maintenancePerDay: 250, status: 'Available', locationKm: 90 },
  { id: 'RIG-003', name: 'RIG-003', method: 'Diamond Core', maxDepth: 800, sizes: ['NQ', 'HQ', 'PQ'], fuelLitresPerHour: 11.5, historicalRopFactor: 1.00, maintenancePerDay: 3600, status: 'Under Maintenance', availableFrom: '2026-11-22', locationKm: 410 },
]

export const RIG_WEIGHTS = {
  technical: 30, productivity: 25, operatingCost: 20, availability: 15, mobilisation: 10,
}

export interface RigScore {
  rig: RigSpec
  eligible: boolean
  blockedBecause?: string
  technical: number
  productivity: number
  operatingCost: number
  availability: number
  mobilisation: number
  total: number
  notes: string[]
}

export function scoreRigs(rigs: RigSpec[], scope: BidScope, own: RigOwnership[], month: string): RigScore[] {
  const dayCost = (r: RigSpec) => {
    const o = own.find(x => x.rig === r.id)
    return (o ? ownershipBreakdown(o, month).perDay : 0) + r.maintenancePerDay
  }
  const costs = rigs.map(dayCost).filter(c => c > 0)
  const cheapest = costs.length ? Math.min(...costs) : 1
  const nearest = Math.min(...rigs.map(r => r.locationKm), 1)
  const bestRop = Math.max(...rigs.map(r => r.historicalRopFactor), 0.01)

  return rigs.map(rig => {
    const notes: string[] = []
    let blockedBecause: string | undefined

    if (rig.method !== scope.method) blockedBecause = `Cannot run ${scope.method}`
    else if (rig.maxDepth < scope.maxDepth) blockedBecause = `Rated to ${rig.maxDepth} m, hole plan reaches ${scope.maxDepth} m`
    else if (!rig.sizes.includes(scope.holeSize)) blockedBecause = `Does not run ${scope.holeSize}`
    else if (rig.status === 'Decommissioned') blockedBecause = 'Decommissioned'

    const technical = blockedBecause ? 0 : RIG_WEIGHTS.technical
    const productivity = (rig.historicalRopFactor / bestRop) * RIG_WEIGHTS.productivity
    const c = dayCost(rig)
    const operatingCost = c > 0 ? (cheapest / c) * RIG_WEIGHTS.operatingCost : 0

    /* Under maintenance is not unavailable. A rig with a return date is a
     * scheduling question; only decommissioned is a dead end. */
    const availScale: Record<RigSpec['status'], number> = {
      Available: 1, Standby: 0.9, 'Under Maintenance': 0.6, Mobilising: 0.55,
      Assigned: 0.35, Decommissioned: 0,
    }
    const availability = availScale[rig.status] * RIG_WEIGHTS.availability
    if (rig.status === 'Under Maintenance' && rig.availableFrom) notes.push(`Back from maintenance ${rig.availableFrom}`)
    if (rig.status === 'Assigned') notes.push('On another project — would need releasing')

    const mobilisation = (nearest / Math.max(nearest, rig.locationKm)) * RIG_WEIGHTS.mobilisation
    if (rig.locationKm > 300) notes.push(`${rig.locationKm} km away, mobilisation will be heavy`)
    if (rig.historicalRopFactor > 1) notes.push(`Runs ${Math.round((rig.historicalRopFactor - 1) * 100)}% above the reference rate`)

    return {
      rig, eligible: !blockedBecause, blockedBecause,
      technical, productivity, operatingCost, availability, mobilisation,
      total: blockedBecause ? 0 : technical + productivity + operatingCost + availability + mobilisation,
      notes,
    }
  }).sort((a, b) => b.total - a.total)
}

/* ── Crew ─────────────────────────────────────────────────────────────── */

export interface CrewRole {
  id: string
  role: string
  perDay: number
  perRig: number          // how many of this role each rig needs, per day
  projectWide: number     // how many are shared across the whole job
  accommodation: number
}

export const SEED_CREW: CrewRole[] = [
  { id: 'c1', role: 'Driller',           perDay: 450, perRig: 2, projectWide: 0, accommodation: 120 },
  { id: 'c2', role: 'Assistant Driller', perDay: 300,  perRig: 2, projectWide: 0, accommodation: 100 },
  { id: 'c3', role: 'Helper',            perDay: 180,  perRig: 4, projectWide: 0, accommodation: 90 },
  { id: 'c4', role: 'Supervisor',        perDay: 650, perRig: 0, projectWide: 1, accommodation: 150 },
  { id: 'c5', role: 'Mechanic',          perDay: 400, perRig: 0, projectWide: 1, accommodation: 120 },
  { id: 'c6', role: 'Geologist',         perDay: 750, perRig: 0, projectWide: 1, accommodation: 150 },
  { id: 'c7', role: 'HSE Officer',       perDay: 450, perRig: 0, projectWide: 1, accommodation: 120 },
]

export interface CrewLine { role: string; heads: number; perDay: number; accommodation: number; total: number }

export function planCrew(roles: CrewRole[], rigCount: number, days: number): CrewLine[] {
  return roles.map(r => {
    const heads = r.perRig * rigCount + r.projectWide
    return {
      role: r.role, heads, perDay: r.perDay, accommodation: r.accommodation,
      total: heads * (r.perDay + r.accommodation) * days,
    }
  }).filter(l => l.heads > 0)
}

/* ── Consumables ───────────────────────────────────────────────────────────
 *
 * Read straight off the parts catalogue, so a bid and a live project agree on
 * what a bit costs and how long it lasts. Wear follows the ground the same way
 * it does in the field: the harder the rock, the shorter the life. */

export const WEAR_BY_HARDNESS: Record<Hardness, number> = {
  Soft: 2.2, Medium: 1.5, Hard: 1.0, 'Very Hard': 0.6, 'Extremely Hard': 0.42,
}

export interface ConsumableLine {
  itemId: string
  partNumber: string
  name: string
  catalogueLife: number
  effectiveLife: number
  qtyNeeded: number
  withContingency: number
  rate: number
  cost: number
  inStock: number
  shortfall: number
}

export function planConsumables(
  catalogue: Part[], rops: RopResult[], contingencyPct: number,
  stock: Record<string, number> = {},
): ConsumableLine[] {
  return catalogue.filter(p => p.active && p.lifeMetres > 0).map(p => {
    /* Each band of rock is charged against the part only if the part works in
     * that ground, and at the life that ground actually allows. */
    let units = 0
    let weightedLife = 0
    let matchedMetres = 0
    rops.forEach(r => {
      const f: Formation = normFormation(r.band.hardness)
      if (!partWorksIn(p, f)) return
      const life = p.lifeMetres * WEAR_BY_HARDNESS[r.band.hardness]
      units += r.metres / life
      weightedLife += life * r.metres
      matchedMetres += r.metres
    })
    if (matchedMetres === 0) return null
    const withContingency = Math.ceil(units * (1 + contingencyPct / 100))
    const inStock = stock[p.id] ?? 0
    return {
      itemId: p.id, partNumber: p.partNumber, name: p.name,
      catalogueLife: p.lifeMetres,
      effectiveLife: weightedLife / matchedMetres,
      qtyNeeded: Math.ceil(units), withContingency,
      rate: p.rate, cost: withContingency * p.rate,
      inStock, shortfall: Math.max(0, withContingency - inStock),
    }
  }).filter(Boolean).sort((a, b) => b!.cost - a!.cost) as ConsumableLine[]
}

/* ── Costs ─────────────────────────────────────────────────────────────────
 *
 * The same three layers the costing module uses, so a won bid and a live
 * project speak the same language. */

export interface UnitPrices {
  fuelPerLitre: number
  waterPerMetre: number
  additivesPerMetre: number
  coreBoxPerMetre: number
  mobPerRig: number
  demobPerRig: number
  sitePerDay: number       // camp, water tanker, support vehicle
  overheadPct: number
}

export const DEFAULT_PRICES: UnitPrices = {
  fuelPerLitre: 1.7, waterPerMetre: 6, additivesPerMetre: 11,
  coreBoxPerMetre: 12, mobPerRig: 85000, demobPerRig: 65000,
  sitePerDay: 600, overheadPct: 8,
}

export interface CostLine { label: string; layer: 'operating' | 'ownership' | 'indirect'; amount: number; note?: string }

export interface CostBreakdown {
  lines: CostLine[]
  operating: number
  ownership: number
  indirect: number
  subtotal: number
  contingency: number
  total: number
  perDrilledMetre: number
  perBillableMetre: number
  billableMetres: number
}

export function buildCosts(
  scope: BidScope, plan: ProductionPlan, prices: UnitPrices,
  crew: CrewLine[], consumables: ConsumableLine[],
  rigs: RigSpec[], own: RigOwnership[], month: string,
  acceptancePct: number, contingencyPerMetre: number,
): CostBreakdown {
  const lines: CostLine[] = []
  const rigDays = plan.rigDays
  const drillingHours = plan.effHoursPerDay * rigDays

  const fuelLitres = rigs.reduce((s, r) => s + r.fuelLitresPerHour, 0) / Math.max(1, rigs.length)
  lines.push({ label: 'Fuel', layer: 'operating', amount: drillingHours * fuelLitres * prices.fuelPerLitre,
    note: `${Math.round(drillingHours)} drilling hrs × ${fuelLitres.toFixed(1)} L/hr` })
  lines.push({ label: 'Water', layer: 'operating', amount: scope.totalMetres * prices.waterPerMetre })
  lines.push({ label: 'Drilling fluids & additives', layer: 'operating', amount: scope.totalMetres * prices.additivesPerMetre })
  lines.push({ label: 'Core boxes & sampling', layer: 'operating', amount: scope.totalMetres * prices.coreBoxPerMetre })

  const crewTotal = crew.reduce((s, c) => s + c.total, 0)
  lines.push({ label: 'Crew, wages and accommodation', layer: 'operating', amount: crewTotal,
    note: `${crew.reduce((s, c) => s + c.heads, 0)} people × ${plan.calendarDays} days` })

  const tooling = consumables.reduce((s, c) => s + c.cost, 0)
  lines.push({ label: 'Tooling and consumables', layer: 'operating', amount: tooling,
    note: `${consumables.length} catalogue items, wear by formation` })

  const maint = rigs.reduce((s, r) => s + r.maintenancePerDay, 0) / Math.max(1, rigs.length) * rigDays
  lines.push({ label: 'Maintenance and service', layer: 'operating', amount: maint })

  const ownPerDay = rigs.reduce((s, r) => {
    const o = own.find(x => x.rig === r.id)
    return s + (o ? ownershipBreakdown(o, month).perDay : 0)
  }, 0) / Math.max(1, rigs.length)
  lines.push({ label: 'Rig ownership', layer: 'ownership', amount: ownPerDay * rigDays,
    note: `depreciation, EMI and insurance across ${rigDays} rig days` })

  lines.push({ label: 'Mobilisation', layer: 'indirect', amount: prices.mobPerRig * plan.rigCount })
  lines.push({ label: 'Demobilisation', layer: 'indirect', amount: prices.demobPerRig * plan.rigCount })
  lines.push({ label: 'Site establishment and support', layer: 'indirect', amount: prices.sitePerDay * plan.calendarDays })

  const preOverhead = lines.reduce((s, l) => s + l.amount, 0)
  lines.push({ label: `Overhead at ${prices.overheadPct}%`, layer: 'indirect', amount: preOverhead * prices.overheadPct / 100 })

  const by = (layer: CostLine['layer']) => lines.filter(l => l.layer === layer).reduce((s, l) => s + l.amount, 0)
  const subtotal = lines.reduce((s, l) => s + l.amount, 0)

  /* Drilled and billable are not the same thing. If the contract pays only on
   * accepted metres, pricing against drilled metres quietly gives the margin
   * away. */
  const billableMetres = scope.totalMetres * (acceptancePct / 100)
  const contingency = contingencyPerMetre * scope.totalMetres
  const total = subtotal + contingency

  return {
    lines, operating: by('operating'), ownership: by('ownership'), indirect: by('indirect'),
    subtotal, contingency, total,
    perDrilledMetre: scope.totalMetres > 0 ? total / scope.totalMetres : 0,
    perBillableMetre: billableMetres > 0 ? total / billableMetres : 0,
    billableMetres,
  }
}

/* ── Risk ──────────────────────────────────────────────────────────────────
 *
 * Risk is priced, not scored. A number out of a hundred means nothing to
 * anyone signing the bid; rupees per metre of cover is a figure they can argue
 * about, accept or refuse. The score is kept only as a way of sorting. */

export const RISK_CATEGORIES = ['Geology', 'Equipment', 'Schedule', 'Commercial', 'Logistics', 'Financial'] as const
export type RiskCategory = typeof RISK_CATEGORIES[number]

export interface RiskItem {
  id: string
  category: RiskCategory
  label: string
  detail: string
  weight: number            // contributes to the score
  costPerMetre: number      // what covering it actually costs
  active: boolean
  auto?: boolean            // raised by the engine rather than by hand
}

export const SEED_RISKS: RiskItem[] = [
  { id: 'k1', category: 'Geology', label: 'Formation split is an assumption', detail: 'No client geological report, so the rock mix is the estimator’s own. A 10% swing toward harder ground moves cost per metre more than any other single variable.', weight: 14, costPerMetre: 8, active: false },
  { id: 'k2', category: 'Geology', label: 'Broken ground expected', detail: 'Fractured or broken formations raise downtime, shorten bit life and reduce recovery.', weight: 10, costPerMetre: 5, active: false },
  { id: 'k3', category: 'Equipment', label: 'No rig free at project start', detail: 'The recommended rig is assigned or under maintenance, so the start date depends on something outside this tender.', weight: 18, costPerMetre: 6, active: false },
  { id: 'k4', category: 'Schedule', label: 'Deadline cannot be met at this fleet size', detail: 'Planned duration exceeds the tender window. Either add a rig or accept the penalty exposure.', weight: 20, costPerMetre: 9, active: false },
  { id: 'k5', category: 'Logistics', label: 'Remote site', detail: 'Long haul for crew, fuel, water and parts. Every shortage costs a day rather than an hour.', weight: 8, costPerMetre: 4, active: false },
  { id: 'k6', category: 'Logistics', label: 'Water not available on site', detail: 'Tankering water is both a standing cost and a stoppage risk.', weight: 10, costPerMetre: 5, active: false },
  { id: 'k7', category: 'Commercial', label: 'High retention', detail: 'A large share of the contract is held back until completion.', weight: 6, costPerMetre: 2, active: false },
  { id: 'k8', category: 'Financial', label: 'Long payment period', detail: 'Working capital is carried for months before the first payment lands.', weight: 7, costPerMetre: 2, active: false },
  { id: 'k9', category: 'Commercial', label: 'Delay penalty in the contract', detail: 'Late completion is charged, so schedule risk becomes money risk.', weight: 9, costPerMetre: 3, active: false },
]

export interface RiskResult {
  score: number
  band: 'Low' | 'Medium' | 'High' | 'Critical'
  contingencyPerMetre: number
  byCategory: { category: RiskCategory; score: number; cost: number; count: number }[]
  active: RiskItem[]
}

export function assessRisk(items: RiskItem[]): RiskResult {
  const active = items.filter(i => i.active)
  const score = Math.min(100, active.reduce((s, i) => s + i.weight, 0))
  const contingencyPerMetre = active.reduce((s, i) => s + i.costPerMetre, 0)
  const byCategory = RISK_CATEGORIES.map(category => {
    const mine = active.filter(i => i.category === category)
    return {
      category,
      score: mine.reduce((s, i) => s + i.weight, 0),
      cost: mine.reduce((s, i) => s + i.costPerMetre, 0),
      count: mine.length,
    }
  }).filter(c => c.count > 0)

  return {
    score, contingencyPerMetre, byCategory, active,
    band: score <= 25 ? 'Low' : score <= 50 ? 'Medium' : score <= 75 ? 'High' : 'Critical',
  }
}

/* The engine raises what it can see for itself, so the estimator is not
 * relied on to remember that the rig is busy or the schedule does not fit. */
export function autoRisks(
  plan: ProductionPlan, scope: BidScope, chosen: RigScore[], bands: GeoBand[],
): { id: string; reason: string }[] {
  const out: { id: string; reason: string }[] = []
  if (plan.meetsDeadline === false) {
    out.push({ id: 'k4', reason: `${plan.calendarDays} days planned against a ${scope.requiredDays}-day window` })
  }
  if (chosen.some(r => r.rig.status === 'Assigned' || r.rig.status === 'Under Maintenance')) {
    out.push({ id: 'k3', reason: chosen.filter(r => r.rig.status !== 'Available').map(r => `${r.rig.name} is ${r.rig.status.toLowerCase()}`).join(', ') })
  }
  if (bands.every(b => b.source === 'user')) {
    out.push({ id: 'k1', reason: 'Every formation band is an estimator assumption' })
  }
  if (bands.some(b => b.ground === 'Broken' || b.ground === 'Highly Broken')) {
    out.push({ id: 'k2', reason: bands.filter(b => b.ground.includes('Broken')).map(b => b.name).join(', ') })
  }
  return out
}

/* ── Pricing ───────────────────────────────────────────────────────────── */

export type PricingMethod = 'margin' | 'markup' | 'manual'

export interface FormationRate { hardness: Hardness; rate: number }

export interface PricingResult {
  method: PricingMethod
  bidPerMetre: number
  revenue: number
  cost: number
  profit: number
  marginPct: number
  markupPct: number
  breakEvenPerMetre: number
}

export function priceBid(
  costs: CostBreakdown, method: PricingMethod,
  targetMarginPct: number, markupPct: number, manualRate: number,
): PricingResult {
  const cost = costs.total
  const cpm = costs.perBillableMetre
  const bidPerMetre =
    method === 'margin' ? (targetMarginPct >= 100 ? cpm : cpm / (1 - targetMarginPct / 100))
    : method === 'markup' ? cpm * (1 + markupPct / 100)
    : manualRate
  const revenue = bidPerMetre * costs.billableMetres
  const profit = revenue - cost
  return {
    method, bidPerMetre, revenue, cost, profit,
    marginPct: revenue > 0 ? (profit / revenue) * 100 : 0,
    markupPct: cost > 0 ? (profit / cost) * 100 : 0,
    breakEvenPerMetre: cpm,
  }
}

/* ── The bid ───────────────────────────────────────────────────────────── */

export type BidStatus = 'draft' | 'pricing' | 'submitted' | 'won' | 'lost' | 'expired'
export const BID_STATUSES: BidStatus[] = ['draft', 'pricing', 'submitted', 'won', 'lost', 'expired']
export const BID_STATUS_LABEL: Record<BidStatus, string> = {
  draft: 'Draft', pricing: 'Pricing', submitted: 'Submitted',
  won: 'Won', lost: 'Lost', expired: 'Expired',
}

export interface Bid {
  id: string
  number: string
  name: string
  client: string
  state: string
  district: string
  siteName: string
  status: BidStatus
  issueDate: string
  deadline: string
  expectedStart: string

  scope: BidScope
  bands: GeoBand[]
  budget: ShiftBudget
  rigIds: string[]
  availabilityPct: number
  acceptancePct: number
  consumableContingencyPct: number
  prices: UnitPrices
  ropSettings: RopSettings
  risks: RiskItem[]

  pricingMethod: PricingMethod
  targetMarginPct: number
  markupPct: number
  manualRate: number

  remoteSite: boolean
  waterOnSite: boolean
  createdAt: string
  notes?: string
}

/* One place computes a bid, so the summary bar, every section and the review
 * can never disagree. */
export interface BidResult {
  rops: RopResult[]
  plan: ProductionPlan
  scores: RigScore[]
  chosen: RigScore[]
  crew: CrewLine[]
  consumables: ConsumableLine[]
  risk: RiskResult
  costs: CostBreakdown
  pricing: PricingResult
  auto: { id: string; reason: string }[]
  confidence: Confidence
}

export function computeBid(bid: Bid, catalogue: Part[], own: RigOwnership[], stock: Record<string, number>): BidResult {
  const month = bid.expectedStart.slice(0, 7)
  const rops = bid.bands.map(b => estimateRop(b, bid.scope, SEED_ROP_RULES, bid.ropSettings))
  const scores = scoreRigs(SEED_RIGS, bid.scope, own, month)
  const chosen = scores.filter(s => bid.rigIds.includes(s.rig.id))
  const rigs = chosen.map(c => c.rig)

  const plan = planProduction(bid.scope, bid.budget, rops, Math.max(1, rigs.length), bid.availabilityPct)
  const auto = autoRisks(plan, bid.scope, chosen, bid.bands)

  /* Anything the engine can see for itself is switched on automatically; the
   * estimator can still turn it off, but has to do it deliberately. */
  const risks = bid.risks.map(r => auto.some(a => a.id === r.id) ? { ...r, active: true, auto: true } : r)
  const risk = assessRisk(risks)

  const crew = planCrew(SEED_CREW, Math.max(1, rigs.length), plan.calendarDays)
  const consumables = planConsumables(catalogue, rops, bid.consumableContingencyPct, stock)
  const costs = buildCosts(bid.scope, plan, bid.prices, crew, consumables, rigs, own, month,
    bid.acceptancePct, risk.contingencyPerMetre)
  const pricing = priceBid(costs, bid.pricingMethod, bid.targetMarginPct, bid.markupPct, bid.manualRate)

  /* An estimate is only as good as its weakest input, so confidence is the
   * floor of what went in rather than an average that flatters it. */
  const sources = bid.bands.map(b => b.source)
  const confidence: Confidence =
    sources.every(s => s === 'client' || s === 'historical') ? 'high'
    : sources.some(s => s === 'client' || s === 'historical' || s === 'reference') ? 'medium'
    : 'low'

  return { rops, plan, scores, chosen, crew, consumables, risk, costs, pricing, auto, confidence }
}

/* ── Completeness ──────────────────────────────────────────────────────────
 *
 * Sections, not wizard steps. An estimator gets the rig answer, then goes back
 * and changes the shift pattern — forcing that into a straight line makes the
 * tool fight the work. */

export type SectionKey = 'scope' | 'geology' | 'rigs' | 'production' | 'consumables' | 'costs' | 'pricing' | 'risk' | 'review'

export const SECTIONS: { key: SectionKey; n: string; label: string }[] = [
  { key: 'scope', n: '01', label: 'Scope' },
  { key: 'geology', n: '02', label: 'Geology' },
  { key: 'rigs', n: '03', label: 'Rigs & crew' },
  { key: 'production', n: '04', label: 'Production' },
  { key: 'consumables', n: '05', label: 'Consumables' },
  { key: 'costs', n: '06', label: 'Costs' },
  { key: 'pricing', n: '07', label: 'Pricing' },
  { key: 'risk', n: '08', label: 'Risk' },
  { key: 'review', n: '09', label: 'Review' },
]

export type SectionState = 'done' | 'attention' | 'missing'

export function sectionStates(bid: Bid, r: BidResult): Record<SectionKey, SectionState> {
  const bandTotal = bid.bands.reduce((s, b) => s + b.sharePct, 0)
  return {
    scope: bid.scope.totalMetres > 0 && bid.scope.holeCount > 0 ? 'done' : 'missing',
    geology: bid.bands.length === 0 ? 'missing'
      : Math.abs(bandTotal - 100) > 0.5 ? 'attention'
      : r.confidence === 'low' ? 'attention' : 'done',
    rigs: bid.rigIds.length === 0 ? 'missing'
      : r.chosen.some(c => !c.eligible || c.rig.status !== 'Available') ? 'attention' : 'done',
    production: r.plan.metresPerRigDay <= 0 ? 'missing'
      : r.plan.meetsDeadline === false ? 'attention' : 'done',
    consumables: r.consumables.length === 0 ? 'missing'
      : r.consumables.some(c => c.shortfall > 0) ? 'attention' : 'done',
    costs: r.costs.total > 0 ? 'done' : 'missing',
    pricing: r.pricing.bidPerMetre <= 0 ? 'missing'
      : r.pricing.marginPct < 8 ? 'attention' : 'done',
    risk: r.risk.score > 50 ? 'attention' : 'done',
    review: r.pricing.bidPerMetre > 0 && bid.bands.length > 0 && bid.rigIds.length > 0 ? 'done' : 'missing',
  }
}

/* ── Seed ──────────────────────────────────────────────────────────────── */

let seq = 0
export const uid = (p: string) => `${p}_${Date.now()}_${++seq}_${Math.floor(Math.random() * 9999)}`

const band = (
  name: string, lithology: string, hardness: Hardness, abrasiveness: Level4,
  fracturing: Level4, ground: GroundCondition, sharePct: number, source: Source, rec = 92,
): GeoBand => ({
  id: uid('gb'), name, lithology, hardness, abrasiveness, fracturing, ground,
  sharePct, source, confidence: SOURCE_CONFIDENCE[source], expectedRecoveryPct: rec,
})

export function blankBid(n: number): Bid {
  return {
    id: uid('bid'), number: `BID-2026-${String(n).padStart(3, '0')}`,
    name: '', client: '', state: '', district: '', siteName: '',
    status: 'draft', issueDate: '2026-10-31', deadline: '2026-12-02', expectedStart: '2026-12-19',
    scope: {
      method: 'Diamond Core', holeSize: 'HQ', totalMetres: 5000, holeCount: 20,
      avgDepth: 250, maxDepth: 320, inclinationDeg: 90,
      shiftsPerDay: 2, shiftHours: 12, workingDaysPerWeek: 6,
    },
    bands: [band('Overburden', 'Weathered laterite', 'Soft', 'Low', 'Medium', 'Fractured', 20, 'user', 80)],
    budget: { bitChangeHrs: 0.5, rodHandlingHrs: 1, maintenanceHrs: 0.5, surveyHrs: 0.3, otherDowntimeHrs: 1.7 },
    rigIds: [], availabilityPct: 85, acceptancePct: 96, consumableContingencyPct: 10,
    prices: { ...DEFAULT_PRICES }, ropSettings: { ...DEFAULT_ROP_SETTINGS },
    risks: SEED_RISKS.map(r => ({ ...r })),
    pricingMethod: 'margin', targetMarginPct: 20, markupPct: 18, manualRate: 0,
    remoteSite: false, waterOnSite: true, createdAt: '2026-10-31',
  }
}

export const SEED_BIDS: Bid[] = [
  {
    ...blankBid(1),
    id: 'bid_sandur', number: 'BID-2026-001',
    name: 'Shield Gold Exploration', client: 'ABC Mining Company',
    state: 'Al Madinah', district: 'Mahd adh Dhahab', siteName: 'Block C',
    status: 'pricing', issueDate: '2026-10-19', deadline: '2026-12-17', expectedStart: '2027-01-02',
    scope: {
      method: 'Diamond Core', holeSize: 'HQ', totalMetres: 12500, holeCount: 42,
      avgDepth: 298, maxDepth: 420, inclinationDeg: 70,
      shiftsPerDay: 2, shiftHours: 12, workingDaysPerWeek: 6, requiredDays: 150,
    },
    bands: [
      band('Overburden', 'Weathered laterite', 'Soft', 'Low', 'High', 'Broken', 14, 'client', 72),
      band('Banded ferruginous quartzite', 'BFQ', 'Very Hard', 'Very High', 'Medium', 'Competent', 46, 'client', 95),
      band('Shale and phyllite', 'Phyllite', 'Medium', 'Medium', 'High', 'Fractured', 22, 'client', 88),
      band('Granitic basement', 'Granite gneiss', 'Hard', 'High', 'Low', 'Competent', 18, 'reference', 96),
    ],
    rigIds: ['RIG-002'], availabilityPct: 82, acceptancePct: 95,
    remoteSite: true, waterOnSite: false,
    targetMarginPct: 22,
  },
  {
    ...blankBid(2),
    id: 'bid_raj', number: 'BID-2026-002',
    name: 'Najran Base Metal Programme', client: 'XYZ Minerals Co.',
    state: 'Najran', district: 'Al Masane', siteName: 'North Belt',
    status: 'draft', issueDate: '2026-10-28', deadline: '2026-12-30', expectedStart: '2027-01-18',
    scope: {
      method: 'Diamond Core', holeSize: 'NQ', totalMetres: 8200, holeCount: 34,
      avgDepth: 241, maxDepth: 300, inclinationDeg: 90,
      shiftsPerDay: 1, shiftHours: 12, workingDaysPerWeek: 6,
    },
    bands: [
      band('Alluvium', 'Sand and gravel', 'Soft', 'Medium', 'Very High', 'Highly Broken', 10, 'user', 60),
      band('Mica schist', 'Schist', 'Medium', 'High', 'High', 'Fractured', 48, 'user', 86),
      band('Quartzite', 'Quartzite', 'Hard', 'Very High', 'Medium', 'Competent', 42, 'user', 94),
    ],
    rigIds: ['RIG-003'], availabilityPct: 80, acceptancePct: 94,
    remoteSite: false, waterOnSite: true,
    targetMarginPct: 18,
  },
]

/* ── Store ─────────────────────────────────────────────────────────────── */

interface State { bids: Bid[] }

const KEY = 'xplorix_bids_v2_sar'

interface Ctx {
  state: State
  saveBid: (b: Bid) => void
  deleteBid: (id: string) => void
  duplicateBid: (id: string, name: string) => void
  resetAll: () => void
}

const BidCtx = createContext<Ctx | null>(null)

export function BidProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ bids: SEED_BIDS })
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) { const s = JSON.parse(raw); if (s.bids?.length) setState(s) }
    } catch {}
    setLoaded(true)
  }, [])
  useEffect(() => { if (loaded) try { localStorage.setItem(KEY, JSON.stringify(state)) } catch {} }, [state, loaded])

  const value: Ctx = {
    state,
    saveBid: b => setState(s => ({
      bids: s.bids.some(x => x.id === b.id) ? s.bids.map(x => x.id === b.id ? b : x) : [b, ...s.bids],
    })),
    deleteBid: id => setState(s => ({ bids: s.bids.filter(b => b.id !== id) })),
    /* Scenarios are whole copies rather than a diff, so changing one can
     * never reach back into the bid it came from. */
    duplicateBid: (id, name) => setState(s => {
      const src = s.bids.find(b => b.id === id)
      if (!src) return s
      return { bids: [{ ...src, id: uid('bid'), number: `${src.number}-S`, name, status: 'draft' }, ...s.bids] }
    }),
    resetAll: () => setState({ bids: SEED_BIDS }),
  }

  /* createElement rather than JSX, so this file stays a plain .ts module. The
   * engine above is pure arithmetic with no React in it at all — keeping the
   * one provider JSX-free means the whole thing can be imported, tested or
   * moved to a server without dragging a .tsx extension along with it. */
  return createElement(BidCtx.Provider, { value }, children)
}

export function useBids() {
  const c = useContext(BidCtx)
  if (!c) throw new Error('useBids must be used inside BidProvider')
  return c
}

/* ── Formatting ────────────────────────────────────────────────────────── */

export function money(n: number) {
  return `${n < 0 ? '−' : ''}SAR ${Math.abs(Math.round(n)).toLocaleString('en-US')}`
}
export function moneyL(n: number) {
  const a = Math.abs(n)
  if (a >= 1000000) return `${n < 0 ? '−' : ''}SAR ${(a / 1000000).toFixed(2)}M`
  if (a >= 100000) return `${n < 0 ? '−' : ''}SAR ${Math.round(a / 1000)}K`
  return money(n)
}
export function perMetre(n: number) { return `SAR ${Math.round(n).toLocaleString('en-US')}/m` }
export function pct(n: number) { return `${n.toFixed(1)}%` }
export function signed(n: number) { return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%` }

const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
export function fullDate(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  return `${day} ${MON[m - 1]} ${y}`
}
export function daysUntil(from: string, to: string) {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000)
}

export const C = {
  bg: 'var(--x-bg)', card: 'var(--x-card)', border: 'var(--x-border)',
  orange: 'var(--x-orange)', orangeD: 'var(--x-orange-d)',
  green: 'var(--x-green)', red: 'var(--x-red)', amber: 'var(--x-amber)',
  blue: 'var(--x-blue)', purple: 'var(--x-purple)', teal: 'var(--x-teal)',
  text: 'var(--x-text)', muted: 'var(--x-muted)', faint: 'var(--x-faint)', dim: 'var(--x-dim)',
}

export const CONFIDENCE_TONE: Record<Confidence, string> = {
  high: C.green, medium: C.amber, low: C.red,
}
export const SOURCE_TONE: Record<Source, string> = {
  client: C.green, historical: C.teal, reference: C.blue, user: C.amber,
}
export const HARDNESS_TONE: Record<Hardness, string> = {
  Soft: C.green, Medium: C.teal, Hard: C.amber, 'Very Hard': C.red, 'Extremely Hard': C.purple,
}
export const STATUS_TONE: Record<BidStatus, string> = {
  draft: C.faint, pricing: C.amber, submitted: C.blue, won: C.green, lost: C.red, expired: C.dim,
}
