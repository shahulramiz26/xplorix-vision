import { monthOf } from './costing-store'
import { normFormation as normFormationLabel } from './inventory-store'
import { computeRigMonth } from './costing-view'
import { workOrderFor, contractorName } from './contracting'
import { projectHoles } from './projects'
import type { OverviewCosting, OverviewInv } from './admin-overview'

/* ==========================================================================
 * THE COMPANY AT A GLANCE — what the Dashboard reads
 *
 * Figures only, no to-do list: the to-do list is Tasks. Every number comes
 * from the drill logs, the maintenance log, the costing and the stores, the
 * same as the screens it links to.
 * ========================================================================== */

export interface RigToday {
  rig: string
  project: string
  contractor?: string
  hole: string | null
  metresToday: number
  downtimeToday: number
  ownDowntimeToday: number
  cpm: number | null            // cost per metre on the latest costed day
  cpmDate?: string              // that day, when it is not today
  rate: number | null           // earned per metre that day
  dayCost: number | null        // what that whole rig-day cost
  monthCpm: number | null
  monthMetres: number
  reported: boolean             // today's shifts are in (or reported, for a contractor)
  unchecked: number             // contractor shifts reported today, not checked yet
}

export interface ProjectGlance {
  id: string; name: string; client: string; status: string
  planned: number; drilled: number; pct: number | null
  holes: number; holesDone: number; rigs: number
  monthMetres: number
}

export interface ContractorGlance {
  id: string; name: string; rigs: string[]
  metresToday: number; downtimeToday: number; uncheckedToday: number
  cpm: number | null; cpmDate?: string
  monthMetres: number
}

export function companyToday(costing: OverviewCosting, inv: OverviewInv, today: string) {
  const month = monthOf(today)
  const logs = costing.shiftLogs.filter(l => !l.segmentOf)
  const todays = logs.filter(l => l.date === today)
  const reportsToday = (costing.contractorReports ?? []).filter(r => r.date === today && r.status === 'waiting')

  // ── every rig on a project this month ────────────────────────────────────
  const pairs = new Map<string, { project: string; rig: string }>()
  logs.filter(l => monthOf(l.date) === month).forEach(l => pairs.set(`${l.project}|${l.rig}`, { project: l.project, rig: l.rig }))
  reportsToday.forEach(r => pairs.set(`${r.project}|${r.rig}`, { project: r.project, rig: r.rig }))
  /* Money by day this month, all rigs: what the contract earns and what it
   * cost, from the same costed days Finance uses. */
  const dayMoney = new Map<string, { revenue: number; cost: number }>()
  const rigs: RigToday[] = Array.from(pairs.values()).map(({ project, rig }) => {
    const v = computeRigMonth(costing, inv, project, rig, month)
    v.days.filter(d => d.submitted && d.date <= today).forEach(d => {
      const e = dayMoney.get(d.date) ?? { revenue: 0, cost: 0 }
      e.revenue += d.revenue; e.cost += d.total; dayMoney.set(d.date, e)
    })
    const costed = v.days.filter(d => d.submitted && d.units > 0 && d.date <= today).sort((a, b) => a.date.localeCompare(b.date))
    const last = costed[costed.length - 1]
    const mine = todays.filter(l => l.rig === rig && l.project === project)
    const reps = reportsToday.filter(r => r.rig === rig && r.project === project)
    const wo = workOrderFor(costing, project, rig)
    const monthUnits = v.days.filter(d => d.submitted).reduce((s, d) => s + d.units, 0)
    const monthCost = v.days.filter(d => d.submitted).reduce((s, d) => s + d.total, 0)
    const lastHole = [...logs].reverse().find(l => l.rig === rig && l.project === project && l.holeNumber)?.holeNumber ?? reps[0]?.holeNumber ?? null
    return {
      rig, project, contractor: wo ? contractorName(costing, wo.contractorId) : undefined, hole: lastHole,
      metresToday: mine.reduce((s, l) => s + l.metresDrilled, 0) + reps.reduce((s, r) => s + r.metres, 0),
      downtimeToday: mine.reduce((s, l) => s + l.downtimeHours, 0) + reps.reduce((s, r) => s + r.standbyHours + r.breakdownHours, 0),
      ownDowntimeToday: mine.filter(l => l.downtimeSide !== 'client').reduce((s, l) => s + l.downtimeHours, 0) + reps.reduce((s, r) => s + r.breakdownHours, 0),
      cpm: last ? last.total / last.units : null, cpmDate: last && last.date !== today ? last.date : undefined,
      rate: last && last.units ? last.revenue / last.units : null,
      dayCost: last ? last.total : null,
      monthCpm: monthUnits ? monthCost / monthUnits : null, monthMetres: monthUnits,
      reported: mine.length > 0 || reps.length > 0, unchecked: reps.length,
    }
  }).sort((a, b) => Number(!!a.contractor) - Number(!!b.contractor) || a.rig.localeCompare(b.rig, undefined, { numeric: true }))

  // ── today across the company ────────────────────────────────────────────
  const own = rigs.filter(r => !r.contractor)
  const drillersToday = new Set(todays.filter(l => !l.contractor && l.driller).map(l => l.driller as string))
  const metresToday = rigs.reduce((s, r) => s + r.metresToday, 0)
  const costToday = own.filter(r => r.cpm != null && !r.cpmDate).reduce((s, r) => s + (r.cpm as number) * r.metresToday, 0)
  const metresCosted = own.filter(r => r.cpm != null && !r.cpmDate).reduce((s, r) => s + r.metresToday, 0)

  // ── metres by ground, this month and today ──────────────────────────────
  const ground = new Map<string, { month: number; today: number }>()
  logs.filter(l => monthOf(l.date) === month && l.metresDrilled > 0).forEach(l => {
    const k = normFormationLabel(l.formationType)
    const e = ground.get(k) ?? { month: 0, today: 0 }
    e.month += l.metresDrilled; if (l.date === today) e.today += l.metresDrilled
    ground.set(k, e)
  })
  reportsToday.forEach(r => { const k = normFormationLabel(r.formationType); const e = ground.get(k) ?? { month: 0, today: 0 }; e.today += r.metres; ground.set(k, e) })
  const lithology = Array.from(ground, ([name, v]) => ({ name, ...v })).sort((a, b) => b.month - a.month)

  // ── projects ─────────────────────────────────────────────────────────────
  const projects: ProjectGlance[] = (costing.projects ?? []).map(p => {
    const holes = projectHoles(costing as never, p.name)
    const drilled = logs.filter(l => l.project === p.name).reduce((s, l) => s + l.metresDrilled, 0)
    return {
      id: p.id, name: p.name, client: p.client, status: p.status,
      planned: p.plannedMetres ?? 0, drilled, pct: p.plannedMetres ? Math.min(100, (drilled / p.plannedMetres) * 100) : null,
      holes: holes.length, holesDone: holes.filter(h => h.status !== 'drilling' && h.status !== 'planned').length,
      rigs: new Set(logs.filter(l => l.project === p.name && monthOf(l.date) === month).map(l => l.rig)).size,
      monthMetres: logs.filter(l => l.project === p.name && monthOf(l.date) === month).reduce((s, l) => s + l.metresDrilled, 0),
    }
  }).sort((a, b) => Number(a.status === 'completed') - Number(b.status === 'completed') || b.monthMetres - a.monthMetres)

  // ── maintenance this month ──────────────────────────────────────────────
  const maint = (costing.maintenance ?? []).filter(m => monthOf(m.date) === month && !m.contractor)
  const maintenance = {
    services: maint.filter(m => m.maintenanceType !== 'Breakdown').length,
    breakdowns: maint.filter(m => m.maintenanceType === 'Breakdown').length,
    hours: maint.reduce((s, m) => s + m.hours, 0),
    cost: maint.reduce((s, m) => s + m.cost, 0),
    down: own.filter(r => todays.some(l => l.rig === r.rig && l.downtimeSide !== 'client' && /break|repair/i.test(l.downtimeReason))).map(r => r.rig),
    repair: (costing.rigRegister ?? []).filter(r => r.state === 'repair').map(r => r.rig),
    recent: [...maint].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4),
  }

  // ── drill logs in today ─────────────────────────────────────────────────
  const ownRigsToday = Array.from(new Set(own.map(r => r.rig)))
  const ownExpected = ownRigsToday.length * 2
  const ownIn = todays.filter(l => !l.contractor).length
  const ctrRigs = Array.from(new Set(rigs.filter(r => r.contractor).map(r => r.rig)))
  const logsIn = {
    ownExpected, ownIn, missing: ownRigsToday.filter(r => todays.filter(l => l.rig === r).length < 2),
    ctrExpected: ctrRigs.length * 2, ctrReported: reportsToday.length + todays.filter(l => l.contractor).length, ctrUnchecked: reportsToday.length,
  }

  // ── contractors ─────────────────────────────────────────────────────────
  const contractors: ContractorGlance[] = (costing.contractors ?? []).map(c => {
    const theirs = rigs.filter(r => r.contractor === c.name)
    const latest = theirs.filter(r => r.cpm != null).sort((a, b) => (b.cpmDate ?? today).localeCompare(a.cpmDate ?? today))[0]
    const units = theirs.reduce((s, r) => s + r.monthMetres, 0)
    const cost = theirs.reduce((s, r) => s + (r.monthCpm ?? 0) * r.monthMetres, 0)
    return {
      id: c.id, name: c.name, rigs: theirs.map(r => r.rig),
      metresToday: theirs.reduce((s, r) => s + r.metresToday, 0), downtimeToday: theirs.reduce((s, r) => s + r.downtimeToday, 0),
      uncheckedToday: theirs.reduce((s, r) => s + r.unchecked, 0),
      cpm: units ? cost / units : null, cpmDate: latest?.cpmDate, monthMetres: units,
    }
  }).filter(c => c.rigs.length)

  const moneyDays = Array.from(dayMoney, ([date, v]) => ({ date, ...v, margin: v.revenue - v.cost })).sort((a, b) => a.date.localeCompare(b.date))
  const t = dayMoney.get(today)
  return {
    month, rigs, lithology, projects, maintenance, logsIn, contractors, moneyDays,
    moneyToday: t ? { revenue: t.revenue, cost: t.cost, margin: t.revenue - t.cost } : null,
    today: {
      metres: metresToday, rigsActive: rigs.filter(r => r.metresToday > 0).length, rigsOnProjects: rigs.length,
      ownActive: own.filter(r => r.metresToday > 0).length, ownRigs: own.length,
      drillers: drillersToday.size,
      downtime: rigs.reduce((s, r) => s + r.downtimeToday, 0), ownDowntime: rigs.reduce((s, r) => s + r.ownDowntimeToday, 0),
      cpm: metresCosted ? costToday / metresCosted : null,
    },
  }
}
