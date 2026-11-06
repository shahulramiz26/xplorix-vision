'use client'

import { monthOf, isOwnStop, moneyL, money, type ShiftLog } from './costing-store'
import { TODAY, addDays, daysBetween } from './inventory-store'
import { computeRigMonth, type CostingState, type InvState } from './costing-view'
import {
  workOrderFor, contractorName, workOrderProgress, billFigures, checkBill, unbilled, recordStatement, type WorkOrder,
} from './contracting'
import { shortDate } from './client-record'
import type { Forecast, Risk, RiskArea, Likelihood } from './forecast'

/* ==========================================================================
 * XPLORIX INTELLIGENCE — the analysis behind the four screens
 *
 * Nothing here is typed in and nothing is a trained model. Every figure is
 * worked out from the drill logs, the maintenance logs, the dated rates, the
 * work orders and the bills: the same record Finance and the Dashboard read.
 *
 *   scorecard          own rigs and each contractor on the same measures
 *   workOrderOutlook   whether each contractor will finish on time
 *   riskRegister       the forecast's risks, plus the ones that come from
 *                      contractors, silent rigs, unchecked shifts and safety
 * ========================================================================== */

const sum = <T,>(list: T[], f: (x: T) => number) => list.reduce((s, x) => s + f(x), 0)
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// ── own rigs against each contractor ──────────────────────────────────────

export interface Reporting {
  shifts: number            // checked shifts in the record
  asSent: number            // accepted exactly as he sent them
  changed: number           // the checker corrected metres or core
  overMetres: number        // metres claimed above what was accepted
  returned: number          // sent back and not yet corrected
  waiting: number           // sent, not checked yet
  sameDay: number           // sent on the day of the shift or the morning after
  timed: number             // shifts where the time of sending is known
  accuracyPct: number
}
export interface Billing {
  count: number; toCheck: number
  claimed: number; supported: number; over: number; deductions: number; held: number; net: number
  overPct: number
  owedNotBilled: number     // checked work no bill covers yet
}

export interface ScoreRow {
  key: string
  kind: 'own' | 'contractor'
  name: string
  contractorId?: string
  rigNames: string[]
  projects: string[]
  rigs: number
  days: number; drillDays: number; standbyDays: number; breakdownDays: number
  metres: number; core: number; recoveryPct: number
  perRigDay: number
  drillingHours: number; perHour: number
  shiftHours: number; ownStopHours: number; standbyHours: number
  availabilityPct: number       // share of shift hours not lost to his own stops
  cost: number; revenue: number; margin: number
  costPerMetre: number; ratePerMetre: number; marginPerMetre: number; marginPct: number
  incidents: number
  // Days on a project with a daily target, and how many met it.
  targetDays: number; onTargetDays: number
  reporting?: Reporting
  billing?: Billing
}

const blank = (key: string, kind: ScoreRow['kind'], name: string): ScoreRow => ({
  key, kind, name, rigNames: [], projects: [], rigs: 0, days: 0, drillDays: 0, standbyDays: 0, breakdownDays: 0,
  metres: 0, core: 0, recoveryPct: 0, perRigDay: 0, drillingHours: 0, perHour: 0, shiftHours: 0, ownStopHours: 0, standbyHours: 0,
  availabilityPct: 0, cost: 0, revenue: 0, margin: 0, costPerMetre: 0, ratePerMetre: 0, marginPerMetre: 0, marginPct: 0, incidents: 0,
  targetDays: 0, onTargetDays: 0,
})
function finish(r: ScoreRow) {
  r.rigs = r.rigNames.length
  r.recoveryPct = r.metres ? (r.core / r.metres) * 100 : 0
  r.perRigDay = r.days ? r.metres / r.days : 0
  r.perHour = r.drillingHours ? r.metres / r.drillingHours : 0
  r.availabilityPct = r.shiftHours ? ((r.shiftHours - r.ownStopHours) / r.shiftHours) * 100 : 0
  r.margin = r.revenue - r.cost
  r.costPerMetre = r.metres ? r.cost / r.metres : 0
  r.ratePerMetre = r.metres ? r.revenue / r.metres : 0
  r.marginPerMetre = r.metres ? r.margin / r.metres : 0
  r.marginPct = r.revenue ? (r.margin / r.revenue) * 100 : 0
  return r
}

/* How a shift's stopped hours split between the driller's own stops and
 * standby. Uses the lines on the log where it has them. */
function stopHours(l: ShiftLog) {
  if (l.downtime?.length) {
    const own = sum(l.downtime.filter(x => x.side === 'internal'), x => x.hours)
    return { own, standby: sum(l.downtime, x => x.hours) - own }
  }
  return isOwnStop(l) ? { own: l.downtimeHours, standby: 0 } : { own: 0, standby: l.downtimeHours }
}

export type Measure = 'perRigDay' | 'perHour' | 'recoveryPct' | 'availabilityPct' | 'costPerMetre' | 'marginPerMetre'
export const MEASURES: { key: Measure; label: string; unit: string; lowIsGood?: boolean; digits: number; money?: boolean; what: string }[] = [
  { key: 'perRigDay', label: 'Metres a rig-day', unit: 'm', digits: 1, what: 'Every day with a shift counts, stopped days included.' },
  { key: 'perHour', label: 'Metres a drilling hour', unit: 'm', digits: 2, what: 'Speed while the bit is on bottom.' },
  { key: 'recoveryPct', label: 'Core recovery', unit: '%', digits: 1, what: 'Metres of core against metres drilled.' },
  { key: 'availabilityPct', label: 'Rig availability', unit: '%', digits: 1, what: 'Shift hours not lost to the driller’s own stops.' },
  { key: 'costPerMetre', label: 'Cost of a metre', unit: '', digits: 0, money: true, lowIsGood: true, what: 'Own rigs: fuel, crew, repairs, parts and the rig. Contractor: what the work order pays.' },
  { key: 'marginPerMetre', label: 'Left on a metre', unit: '', digits: 0, money: true, what: 'What the client pays for the metre, less what it cost.' },
]

export interface Scorecard {
  rows: ScoreRow[]              // own rigs first, then contractors by metres
  rigs: (ScoreRow & { party: string })[]
  months: string[]
  trend: { month: string; byParty: Record<string, { metres: number; days: number; perRigDay: number; recoveryPct: number }> }[]
  best: Partial<Record<Measure, string>>      // the party key that leads each measure
  hasContractors: boolean
  findings: { tone: 'good' | 'warn' | 'bad' | 'info'; text: string }[]
}

export function buildScorecard(state: CostingState, inv: InvState, project: string, month: string, today: string = TODAY): Scorecard {
  const inScope = (l: ShiftLog) => (project === 'all' || l.project === project) && !l.segmentOf
  const allLogs = state.shiftLogs.filter(l => project === 'all' || l.project === project)
  const months = Array.from(new Set(allLogs.map(l => monthOf(l.date)))).sort()
  const use = month === 'all' ? months : [month]
  const logs = allLogs.filter(l => use.includes(monthOf(l.date)))

  const partyOf = (p: string, rig: string): { key: string; kind: 'own' | 'contractor'; name: string; wo?: WorkOrder } => {
    const wo = workOrderFor(state, p, rig)
    return wo ? { key: wo.contractorId, kind: 'contractor', name: contractorName(state, wo.contractorId), wo } : { key: 'own', kind: 'own', name: 'Own rigs' }
  }

  const parties: Record<string, ScoreRow> = {}
  const rigRows: Record<string, ScoreRow & { party: string }> = {}
  const trendAcc: Record<string, Record<string, { metres: number; days: number; core: number }>> = {}
  const pairs = Array.from(new Set(logs.map(l => `${l.project}|${l.rig}`))).map(k => { const [p, rig] = k.split('|'); return { project: p, rig } })

  pairs.forEach(({ project: p, rig }) => {
    const who = partyOf(p, rig)
    const party = (parties[who.key] ||= { ...blank(who.key, who.kind, who.name), contractorId: who.kind === 'contractor' ? who.key : undefined })
    const row = (rigRows[rig] ||= { ...blank(rig, who.kind, rig), party: who.name, contractorId: party.contractorId })
    ;[party, row].forEach(r => {
      if (!r.rigNames.includes(rig)) r.rigNames.push(rig)
      if (!r.projects.includes(p)) r.projects.push(p)
    })
    const target = (state.projects ?? []).find(x => x.name === p)?.dailyTarget
    use.forEach(m => {
      const t = ((trendAcc[m] ||= {})[who.key] ||= { metres: 0, days: 0, core: 0 })
      computeRigMonth(state, inv, p, rig, m).days.forEach(d => {
        if (!d.submitted) return
        ;[party, row].forEach(r => {
          r.days += 1
          if (d.status === 'drilling') r.drillDays += 1
          if (d.status === 'standby') r.standbyDays += 1
          if (d.status === 'breakdown') r.breakdownDays += 1
          r.metres += d.units; r.core += d.coreRecovery; r.cost += d.total; r.revenue += d.revenue
          if (target) { r.targetDays += 1; if (d.units >= target - 1e-6) r.onTargetDays += 1 }
        })
        t.metres += d.units; t.days += 1; t.core += d.coreRecovery
      })
    })
    logs.filter(l => l.project === p && l.rig === rig && inScope(l)).forEach(l => {
      const h = stopHours(l)
      ;[party, row].forEach(r => {
        r.drillingHours += l.drillingHours; r.shiftHours += l.shiftHours
        r.ownStopHours += h.own; r.standbyHours += h.standby
        r.incidents += l.incidents?.length ?? 0
      })
    })
  })

  // Reporting and bills, for contractors only.
  Object.values(parties).filter(r => r.kind === 'contractor').forEach(r => {
    const mine = logs.filter(l => l.contractor === r.contractorId && !l.segmentOf)
    const reports = (state.contractorReports ?? []).filter(x => {
      const wo = (state.workOrders ?? []).find(w => w.id === x.workOrderId)
      return wo?.contractorId === r.contractorId && (project === 'all' || x.project === project) && use.includes(monthOf(x.date))
    })
    const changed = mine.filter(l => l.check?.claimedMetres != null || l.check?.claimedRecovery != null)
    const timed = mine.filter(l => l.loggedAt)
    r.reporting = {
      shifts: mine.length, asSent: mine.length - changed.length, changed: changed.length,
      overMetres: sum(changed, l => Math.max(0, (l.check?.claimedMetres ?? l.metresDrilled) - l.metresDrilled)),
      returned: reports.filter(x => x.status === 'returned').length,
      waiting: reports.filter(x => x.status === 'waiting').length,
      sameDay: timed.filter(l => l.loggedAt!.slice(0, 10) <= addDays(l.date, 1)).length, timed: timed.length,
      accuracyPct: mine.length ? ((mine.length - changed.length) / mine.length) * 100 : 0,
    }
    const bills = (state.contractorBills ?? []).filter(b => b.contractorId === r.contractorId && (project === 'all' || b.project === project)
      && (month === 'all' || monthOf(b.periodTo) === month || monthOf(b.periodFrom) === month))
    const b: Billing = { count: bills.length, toCheck: bills.filter(x => x.status === 'received').length, claimed: 0, supported: 0, over: 0, deductions: 0, held: 0, net: 0, overPct: 0, owedNotBilled: 0 }
    bills.forEach(bill => {
      const f = billFigures(state, bill)
      b.claimed += f.claimed; b.supported += f.supported; b.deductions += f.deductions; b.held += f.held; b.net += f.net
      b.over += Math.max(0, f.claimed - f.supported)
    })
    b.overPct = b.claimed ? (b.over / b.claimed) * 100 : 0
    ;(state.workOrders ?? []).filter(w => w.contractorId === r.contractorId && w.status === 'active' && (project === 'all' || w.project === project))
      .forEach(w => { b.owedNotBilled += unbilled(state, w, today)?.net ?? 0 })
    r.billing = b
  })

  const rows = Object.values(parties).map(finish).filter(r => r.days > 0)
    .sort((a, b) => (a.kind === 'own' ? 0 : 1) - (b.kind === 'own' ? 0 : 1) || b.metres - a.metres)
  const rigs = Object.values(rigRows).map(r => finish(r) as ScoreRow & { party: string }).filter(r => r.days > 0)
    .sort((a, b) => b.perRigDay - a.perRigDay)

  const best: Scorecard['best'] = {}
  MEASURES.forEach(m => {
    const ranked = rows.filter(r => r.metres > 0).sort((a, b) => m.lowIsGood ? a[m.key] - b[m.key] : b[m.key] - a[m.key])
    if (ranked.length > 1) best[m.key] = ranked[0].key
  })

  const trend = months.filter(m => use.includes(m) || month !== 'all').map(m => ({
    month: m,
    byParty: Object.fromEntries(Object.entries(trendAcc[m] ?? {}).map(([k, v]) => [k, {
      metres: v.metres, days: v.days, perRigDay: v.days ? v.metres / v.days : 0, recoveryPct: v.metres ? (v.core / v.metres) * 100 : 0,
    }])),
  })).filter(t => Object.keys(t.byParty).length > 0)

  // What the table says, in sentences.
  const findings: Scorecard['findings'] = []
  const own = rows.find(r => r.kind === 'own')
  const outs = rows.filter(r => r.kind === 'contractor')
  const name = (key?: string) => rows.find(r => r.key === key)?.name ?? ''
  if (rows.length > 1) {
    const fast = rows.find(r => r.key === best.perRigDay)
    const slow = [...rows].filter(r => r.metres > 0).sort((a, b) => a.perRigDay - b.perRigDay)[0]
    if (fast && slow && fast.key !== slow.key) findings.push({ tone: 'info',
      text: `${fast.name} ${fast.kind === 'own' ? 'make' : 'makes'} the most metres a rig-day: ${fast.perRigDay.toFixed(1)} m against ${slow.perRigDay.toFixed(1)} m for ${slow.name}.` })
    const cheap = rows.find(r => r.key === best.costPerMetre)
    const dear = [...rows].filter(r => r.metres > 0).sort((a, b) => b.costPerMetre - a.costPerMetre)[0]
    if (cheap && dear && cheap.key !== dear.key) findings.push({ tone: 'info',
      text: `A metre costs least from ${cheap.name} at ${money(cheap.costPerMetre)}, and most from ${dear.name} at ${money(dear.costPerMetre)}.` })
    if (best.recoveryPct) {
      const low = [...rows].filter(r => r.metres > 0).sort((a, b) => a.recoveryPct - b.recoveryPct)[0]
      findings.push({ tone: low.recoveryPct < 90 ? 'warn' : 'good',
        text: `Core recovery is best from ${name(best.recoveryPct)} (${rows.find(r => r.key === best.recoveryPct)!.recoveryPct.toFixed(1)}%) and lowest from ${low.name} (${low.recoveryPct.toFixed(1)}%).` })
    }
  }
  if (own && outs.length) {
    const out = outs.reduce((a, r) => ({ metres: a.metres + r.metres, margin: a.margin + r.margin }), { metres: 0, margin: 0 })
    const outPer = out.metres ? out.margin / out.metres : 0
    findings.push({ tone: own.marginPerMetre >= outPer ? 'good' : 'warn',
      text: `Your own rigs leave ${money(own.marginPerMetre)} on a metre after cost. A contractor's metre leaves ${money(outPer)}.` })
  }
  outs.forEach(r => {
    const rep = r.reporting!
    if (rep.changed > 0) findings.push({ tone: rep.accuracyPct < 90 ? 'warn' : 'info',
      text: `${r.name}: ${rep.changed} of ${plural(rep.shifts, 'shift')} had to be corrected at the check${rep.overMetres > 0 ? `, ${rep.overMetres.toFixed(1)} m more claimed than was drilled` : ''}.` })
    if (r.billing && r.billing.over > 0) findings.push({ tone: 'warn',
      text: `${r.name} has billed ${moneyL(r.billing.over)} more than the checked record supports (${r.billing.overPct.toFixed(1)}% of what was claimed).` })
    if (r.ownStopHours > 0 && r.availabilityPct < 90) findings.push({ tone: 'warn',
      text: `${r.name} lost ${Math.round(r.ownStopHours)} hours to their own stops: rig availability ${r.availabilityPct.toFixed(0)}%.` })
  })

  return { rows, rigs, months, trend, best, hasContractors: outs.length > 0, findings }
}

// ── will each contractor finish on time ───────────────────────────────────

export interface OrderOutlook {
  wo: WorkOrder
  contractor: string
  metres: number; planned: number; left: number; pctDone: number
  daysLeft: number                // to the finish date; negative once it has passed
  perDayNow: number               // all his rigs together, last 30 days, every day counted
  perDayNeeded: number            // to finish on the date
  predicted?: string              // when the metres will be done at today's pace
  daysLate: number                // predicted past the finish date; 0 if on time
  state: 'done' | 'on-time' | 'tight' | 'late' | 'stopped'
  recoveryPct: number
  recoveryFloor?: number          // the first core recovery band in his contract
  lateRule?: { pctPerWeek: number; capPct?: number }
  atStake: number                 // deduction if the forecast holds, or 0
}

export function workOrderOutlook(state: CostingState, today: string = TODAY): OrderOutlook[] {
  return (state.workOrders ?? []).filter(w => w.status === 'active').map(wo => {
    const p = workOrderProgress(state, wo, today)
    const from = addDays(today, -29)
    const recent = state.shiftLogs.filter(l => l.workOrderId === wo.id && l.date >= from && l.date <= today)
    const span = Math.max(1, Math.min(30, daysBetween(wo.startDate > from ? wo.startDate : from, today) + 1))
    const perDayNow = sum(recent, l => l.metresDrilled) / span
    const daysLeft = daysBetween(today, wo.endDate)
    const left = p.plannedLeft
    const predicted = left <= 0 ? undefined : perDayNow > 0 ? addDays(today, Math.ceil(left / perDayNow)) : undefined
    const daysLate = predicted ? Math.max(0, daysBetween(wo.endDate, predicted)) : 0
    const state_: OrderOutlook['state'] = left <= 0 ? 'done' : perDayNow <= 0 ? 'stopped' : daysLate > 0 ? 'late' : daysBetween(predicted!, wo.endDate) <= 7 ? 'tight' : 'on-time'
    const core = wo.rules.find(r => r.on && r.kind === 'coreRecovery')
    const late = wo.rules.find(r => r.on && r.kind === 'lateCompletion')
    const floor = core?.slabs?.length ? Math.max(...core.slabs.map(s => s.belowPct)) : undefined
    // Metres drilled after the finish date, at the average rate he is paid, less the late percentage.
    const paid = sum(state.shiftLogs.filter(l => l.workOrderId === wo.id), l => l.metresDrilled)
    const lateMetres = daysLate > 0 && perDayNow > 0 ? Math.min(left, perDayNow * daysLate) : 0
    const rec = recordStatement(state, wo, wo.startDate, today)
    const metreLines = rec.lines.filter(l => l.kind === 'metres')
    const avgRate = paid > 0 ? sum(metreLines, l => l.amount) / paid : 0
    const pct = late ? Math.min(late.capPct ?? 100, (late.pctPerWeek ?? 0) * Math.ceil(daysLate / 7)) : 0
    return {
      wo, contractor: contractorName(state, wo.contractorId),
      metres: p.metres, planned: wo.plannedMetres, left, pctDone: p.pctDone,
      daysLeft, perDayNow, perDayNeeded: left > 0 && daysLeft > 0 ? left / daysLeft : 0,
      predicted, daysLate, state: state_,
      recoveryPct: p.recoveryPct, recoveryFloor: floor,
      lateRule: late ? { pctPerWeek: late.pctPerWeek ?? 0, capPct: late.capPct } : undefined,
      atStake: lateMetres * avgRate * pct / 100,
    }
  }).sort((a, b) => b.daysLate - a.daysLate || a.daysLeft - b.daysLeft)
}

// ── the full risk register ────────────────────────────────────────────────

export interface ScoredRisk extends Risk {
  size: 'Large' | 'Medium' | 'Small' | 'Not in money'
  score: number             // 1 to 9: chance times size
}

/* Size is judged against a month of billing, so the same bands make sense for
 * a company with one rig and for one with thirty. */
function sized(r: Risk, monthBilling: number): ScoredRisk {
  const share = r.impact != null && monthBilling > 0 ? r.impact / monthBilling : 0
  const size: ScoredRisk['size'] = r.impact == null ? 'Not in money' : share >= 0.1 ? 'Large' : share >= 0.03 ? 'Medium' : 'Small'
  const l = { High: 3, Medium: 2, Low: 1 }[r.likelihood]
  const s = { Large: 3, Medium: 2, Small: 1, 'Not in money': 2 }[size]
  return { ...r, size, score: l * s }
}

export function buildRiskRegister(f: Forecast, state: CostingState, today: string = TODAY): ScoredRisk[] {
  const risks: Risk[] = [...f.risks]
  const add = (area: RiskArea, likelihood: Likelihood, r: Omit<Risk, 'area' | 'likelihood'>) => risks.push({ area, likelihood, ...r })
  const nextName = new Date(`${f.nextMonth}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })

  // Contractors: finish dates, core, shifts and bills.
  workOrderOutlook(state, today).forEach(o => {
    if (o.state === 'late') add('contractors', o.daysLeft < 0 ? 'High' : 'Medium', {
      key: `wo_late_${o.wo.id}`,
      title: `${o.contractor}: ${o.wo.number} will finish ${plural(o.daysLate, 'day')} late`,
      detail: `${Math.round(o.left)} m left of ${o.planned} m. At ${o.perDayNow.toFixed(1)} m a day it is done on ${shortDate(o.predicted)}, against a finish date of ${shortDate(o.wo.endDate)}. It needs ${o.perDayNeeded > 0 ? `${o.perDayNeeded.toFixed(1)} m a day` : 'more days than are left'} to finish on time.`,
      when: shortDate(o.wo.endDate),
      impact: o.atStake > 0 ? o.atStake : null, impactNote: o.atStake > 0 ? 'late deduction under the work order' : 'your own client’s dates move with it',
      action: `Ask ${o.contractor} for a second shift or another rig now, or agree a new finish date in writing.`,
      href: '/admin/contractors', linkLabel: 'Open contractors',
    })
    if (o.state === 'stopped') add('contractors', 'High', {
      key: `wo_stopped_${o.wo.id}`,
      title: `${o.contractor}: no metres on ${o.wo.number} in 30 days`,
      detail: `${Math.round(o.left)} m is still to drill and the work order ends ${shortDate(o.wo.endDate)}.`,
      when: 'Now', impact: null, impactNote: 'the metres are not being drilled',
      action: `Find out whether ${o.contractor} is still on site, and close the work order if not.`,
      href: '/admin/contractors', linkLabel: 'Open contractors',
    })
    if (o.recoveryFloor != null && o.metres > 0 && o.recoveryPct < o.recoveryFloor) add('contractors', 'Medium', {
      key: `wo_core_${o.wo.id}`,
      title: `${o.contractor}: core recovery ${o.recoveryPct.toFixed(1)}% on ${o.wo.number}`,
      detail: `Below the ${o.recoveryFloor}% band in the work order. The deduction is judged hole by hole on the bill, and low recovery is also what your own client will question.`,
      when: 'Now', impact: null, impactNote: 'quality of the core',
      action: `Raise it with ${o.contractor} on site: bit, run length and mud. Check the holes one by one under Contractors.`,
      href: '/admin/contractors', linkLabel: 'Open contractors',
    })
  })
  const waiting = (state.contractorReports ?? []).filter(r => r.status === 'waiting')
  const oldWaiting = waiting.filter(r => daysBetween(r.date, today) >= 2)
  if (oldWaiting.length) add('contractors', 'High', {
    key: 'reports_waiting',
    title: `${plural(oldWaiting.length, 'contractor shift')} not checked for two days or more`,
    detail: `${sum(oldWaiting, r => r.metres).toFixed(1)} m is outside the record until it is checked: it cannot be paid, and it cannot be billed to your client.`,
    when: 'Now', impact: null, impactNote: 'metres outside the record',
    action: 'Check them today under Contractors. Each takes a minute.',
    href: '/admin/contractors', linkLabel: 'Open contractors',
  })
  const returned = (state.contractorReports ?? []).filter(r => r.status === 'returned')
  if (returned.length) add('contractors', 'Medium', {
    key: 'reports_returned',
    title: `${plural(returned.length, 'shift')} sent back and not corrected`,
    detail: `${Array.from(new Set(returned.map(r => r.rig))).join(', ')}. The contractor has not sent them again.`,
    when: 'Now', impact: null, impactNote: 'a gap in the record',
    action: 'Remind the contractor. The reason is beside each shift in his login.',
    href: '/admin/contractors', linkLabel: 'Open contractors',
  })
  const billsOver = (state.contractorBills ?? []).filter(b => b.status === 'received').map(b => ({ b, c: checkBill(state, b) })).filter(x => x.c.over > 0)
  if (billsOver.length) add('contractors', 'High', {
    key: 'bills_over',
    title: `${plural(billsOver.length, 'contractor bill')} above the checked record`,
    detail: billsOver.map(x => `${x.b.number} from ${contractorName(state, x.b.contractorId)} claims ${moneyL(x.c.over)} more than the shifts support`).join('; ') + '.',
    when: 'Now', impact: sum(billsOver, x => x.c.over), impactNote: 'would be overpaid if approved as claimed',
    action: 'Approve only what the record supports, or send the bill back with the reason.',
    href: '/admin/contractors', linkLabel: 'Open contractors',
  })

  // Rigs: gone quiet, or losing days to their own stops.
  f.rigs.forEach(r => {
    const last = state.shiftLogs.filter(l => l.rig === r.rig).map(l => l.date).sort().pop()
    const quiet = last ? daysBetween(last, today) : 0
    if (quiet >= 2) add('rigs', quiet >= 4 ? 'High' : 'Medium', {
      key: `quiet_${r.rig}`,
      title: `${r.rig}: no shift logged for ${plural(quiet, 'day')}`,
      detail: `The last log is ${shortDate(last)}. Either the rig is stopped and nobody has said so, or the logs are not being entered. Both make every forecast for it wrong.`,
      when: 'Now', impact: r.perDay > 0 ? r.perDay * quiet * (f.next.ratePerMetre || 0) : null, impactNote: 'billing not in the record',
      action: r.contractor ? 'Ask the contractor to send the missing shifts from his login.' : 'Ask the supervisor to enter the missing drill logs.',
      href: '/admin/logs/drill', linkLabel: 'Open drill logs',
    })
    if (!r.contractor && r.loggedDays >= 10 && r.zeroDays / r.loggedDays >= 0.15) add('rigs', 'Medium', {
      key: `zero_${r.rig}`,
      title: `${r.rig}: ${r.zeroDays} of the last ${r.loggedDays} days made no metres`,
      detail: `${Math.round(r.ownHours)} hours were its own stops and ${Math.round(r.clientHours)} hours were standby. A rig that stops this often will not hold its forecast.`,
      when: nextName, impact: r.zeroDays * r.fixedPerDay, impactNote: 'crew and rig cost on days with no metres, last 30 days',
      action: r.ownHours >= r.clientHours ? 'Look at its maintenance log and plan the service before next month.' : 'Most of it is standby: charge it, and raise the cause with the client.',
      href: '/admin/logs/maintenance', linkLabel: 'Open maintenance logs',
    })
  })

  // Holes: open with no planned depth, so nothing can be predicted or closed.
  const noPlan = f.holeFinish.filter(h => h.problem === 'no-plan')
  if (noPlan.length) add('holes', 'Medium', {
    key: 'holes_no_plan',
    title: `${plural(noPlan.length, 'open hole')} with no planned depth`,
    detail: `${noPlan.map(h => h.hole).join(', ')}. With no planned depth there is no finish date, and the month forecast treats the hole as finished.`,
    when: 'Now', impact: null, impactNote: 'the forecast is short',
    action: 'Add the planned depth under Projects.',
    href: '/admin/projects', linkLabel: 'Open projects',
  })

  // Safety: incidents on the logs in the last 30 days.
  const since = addDays(today, -29)
  const incidents = state.shiftLogs.filter(l => l.date >= since && l.date <= today).flatMap(l => (l.incidents ?? []).map(x => ({ ...x, rig: l.rig, date: l.date })))
  if (incidents.length) {
    const serious = incidents.filter(x => /high|major|serious|lost/i.test(x.severity))
    const byRig: Record<string, number> = {}
    incidents.forEach(x => { byRig[x.rig] = (byRig[x.rig] ?? 0) + 1 })
    const worst = Object.entries(byRig).sort((a, b) => b[1] - a[1])[0]
    add('safety', serious.length ? 'High' : incidents.length >= 3 ? 'Medium' : 'Low', {
      key: 'incidents',
      title: `${plural(incidents.length, 'incident')} logged in the last 30 days`,
      detail: `${serious.length ? `${plural(serious.length, 'serious one')}. ` : ''}${worst[0]} has the most: ${worst[1]}. The latest was ${incidents.sort((a, b) => b.date.localeCompare(a.date))[0].type.toLowerCase()} on ${shortDate(incidents[0].date)}.`,
      when: 'Now', impact: null, impactNote: 'people, and the client’s confidence',
      action: `Review each one with the supervisor on ${worst[0]} and record what was changed.`,
      href: '/admin/logs/drill', linkLabel: 'Open drill logs',
    })
  }

  const monthBilling = Math.max(f.next.revenue, f.thisMonthTotal.revenue, 1)
  return risks.map(r => sized(r, monthBilling)).sort((a, b) => b.score - a.score || (b.impact ?? 0) - (a.impact ?? 0))
}
