'use client'

import { useMemo } from 'react'
import {
  useInventory, buildAlerts, normFormation, TODAY, RIGS, COMPLETED_PROJECTS,
  type Alert, type Formation,
} from './inventory-store'
import {
  useCosting, isOwnStop, clientOf, statusForShifts, monthOf, shiftMonth, isShared, isOverdue, outstanding,
  disputedAmount, money, moneyL, type ShiftLog, type Invoice,
} from './costing-store'
import { computeRigMonth } from './costing-view'
import { holesFromLogs, shortDate as shortDay, type LiveHole } from './client-record'
import { contractorInbox, projectByName, projectHoles } from './projects'
import { workOrderFor, contractorName, workOrderProgress, billFigures } from './contracting'
import { holeSurvey, pendingReadings } from './survey'

/* ==========================================================================
 * THE CONTRACTOR'S DASHBOARD — what it reads
 *
 * Nothing here is typed in. Every figure comes from the same stores the rest
 * of the console uses: shift logs and rates (costing), parts and purchase
 * orders (inventory). So a number on the Dashboard is the number on Finance
 * or Inventory, and opening either screen confirms it.
 * ========================================================================== */

/* 'to-check' is a contractor's rig whose shift for today has come in but has
 * not been checked by us yet, so it is not in the record. */
/* 'idle' is a rig with no shift today and no hole left to drill on its
 * project: waiting for the client to release more holes, or to be moved. */
export type RigStatus = 'drilling' | 'standby' | 'breakdown' | 'no-shift' | 'to-check' | 'idle'
export const RIG_STATUS_LABEL: Record<RigStatus, string> = {
  drilling: 'Drilling', standby: 'Standby', breakdown: 'Breakdown', 'no-shift': 'No shift received', 'to-check': 'Reported, to check', idle: 'Idle, no hole left',
}

export interface RigRow {
  rig: string
  project: string | null
  hole: string | null
  status: RigStatus
  note: string
  holeDrilled: number
  holePlanned?: number
  recoveryPct: number | null
  day: number | null          // metres on today's day shift; null = not received
  night: number | null
  monthMetres: number
  monthDays: number           // days this rig has a log for, this month
  monthLostHours: number
  /* The project's daily target and how the rig stands against it: days this
   * month at or over it, and its average over the last seven logged days. */
  target?: number
  monthOnTarget: number
  last7PerDay: number | null
  last14: { date: string; metres: number }[]
  // Set when the rig is a contractor's, working for us under a work order.
  contractor?: string
}

export interface MonthNumbers {
  month: string
  metres: number
  rigDays: number
  perRigDay: number
  revenue: number
  cost: number
  costPerMetre: number
  ratePerMetre: number
  margin: number
  marginPct: number
  standbyDays: number
  breakdownDays: number
  lostHours: number
}

export type Tone = 'good' | 'warn' | 'bad' | 'info' | 'neutral'
export interface Attention { key: string; tone: Tone; title: string; detail: string; href: string; action: string; money?: number; since?: string }

const order = (l: { date: string; shift: string }) => `${l.date}${l.shift === 'Day' ? '0' : '1'}`
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10)
}

/* Deep link into Finance: the screen opens on this project, rig, month and tab. */
export function financeLink(p: { project: string; rig: string; month: string; tab?: 'Performance' | 'Drillholes' | 'Tracker' }) {
  const q = new URLSearchParams({ project: p.project, rig: p.rig, month: p.month, tab: p.tab ?? 'Performance' })
  return `/admin/finance/rigs?${q.toString()}`
}

export function monthNumbers(
  costing: ReturnType<typeof useCosting>['state'], inv: ReturnType<typeof useInventory>['state'], month: string, upToDay?: number,
): MonthNumbers {
  const pairs = new Map<string, { project: string; rig: string }>()
  costing.shiftLogs.forEach(l => { if (monthOf(l.date) === month) pairs.set(`${l.project}|${l.rig}`, { project: l.project, rig: l.rig }) })
  const z: MonthNumbers = {
    month, metres: 0, rigDays: 0, perRigDay: 0, revenue: 0, cost: 0, costPerMetre: 0, ratePerMetre: 0,
    margin: 0, marginPct: 0, standbyDays: 0, breakdownDays: 0, lostHours: 0,
  }
  pairs.forEach(({ project, rig }) => {
    const v = computeRigMonth(costing, inv, project, rig, month)
    // Same days as the other month where a like-for-like comparison is wanted.
    const days = upToDay ? v.days.filter(d => Number(d.date.slice(8)) <= upToDay) : v.days
    days.forEach(d => {
      if (!d.submitted) return
      z.metres += d.units; z.revenue += d.revenue; z.cost += d.total; z.rigDays += 1
      z.lostHours += d.downtimeHours
      if (d.status === 'standby') z.standbyDays += 1
      if (d.status === 'breakdown') z.breakdownDays += 1
    })
  })
  z.perRigDay = z.rigDays ? z.metres / z.rigDays : 0
  z.costPerMetre = z.metres ? z.cost / z.metres : 0
  z.ratePerMetre = z.metres ? z.revenue / z.metres : 0
  z.margin = z.revenue - z.cost
  z.marginPct = z.revenue ? (z.margin / z.revenue) * 100 : 0
  return z
}

export type OverviewCosting = ReturnType<typeof useCosting>['state']
export type OverviewInv = ReturnType<typeof useInventory>['state']

export function useAdminOverview() {
  const { state: costing } = useCosting()
  const { state: inv } = useInventory()
  return useMemo(() => computeOverview(costing, inv), [costing, inv])
}

/* The same figures as a plain function, so the inbox (lib/inbox.ts) can read
 * them without a second copy of the logic. */
export function computeOverview(costing: OverviewCosting, inv: OverviewInv) {
  {
    const today = TODAY
    const month = monthOf(today)
    const dayOfMonth = Number(today.slice(8))
    const logs = costing.shiftLogs
    const holes = holesFromLogs(costing)
    const holeById = new Map(holes.map(h => [h.id, h]))

    // ── rigs ───────────────────────────────────────────────────────────────
    const rigNames = Array.from(new Set([...RIGS, ...logs.map(l => l.rig)])).sort()
    const rigs: RigRow[] = rigNames.map(rig => {
      const mine = logs.filter(l => l.rig === rig).sort((a, b) => order(a).localeCompare(order(b)))
      const todays = mine.filter(l => l.date === today)
      const latest = mine[mine.length - 1]
      const withHole = [...mine].reverse().find(l => l.holeNumber)
      const hole = withHole?.holeNumber ? holeById.get(withHole.holeNumber) : undefined
      const inMonth = mine.filter(l => monthOf(l.date) === month)
      const wo = latest ? workOrderFor(costing, latest.project, rig) : undefined
      const unchecked = (costing.contractorReports ?? []).filter(r => r.rig === rig && r.status === 'waiting' && r.date === today)
      const project = latest ? projectByName(costing, latest.project) : undefined
      // Nothing logged today and nothing left to drill on its project: idle, not missing.
      const nothingLeft = !!latest && !projectHoles(costing, latest.project).some(h => h.status === 'drilling' || h.status === 'planned')
      const status: RigStatus = todays.length === 0 ? (unchecked.length ? 'to-check' : nothingLeft ? 'idle' : 'no-shift') : statusForShifts(todays)
      const target = project?.dailyTarget || undefined
      const byDay = new Map<string, number>()
      mine.forEach(l => byDay.set(l.date, (byDay.get(l.date) ?? 0) + l.metresDrilled))
      const last7 = Array.from(byDay.keys()).sort().slice(-7)
      const lost = todays.filter(l => l.downtimeHours > 0)
      const shift = (name: 'Day' | 'Night') => todays.find(l => l.shift === name)?.metresDrilled ?? null
      return {
        rig, project: latest?.project ?? null, hole: hole?.id ?? null, status,
        contractor: wo ? contractorName(costing, wo.contractorId) : undefined,
        note: status === 'to-check' ? `${unchecked.length} ${unchecked.length === 1 ? 'shift' : 'shifts'} reported today, ${unchecked.reduce((s, r) => s + r.metres, 0)} m, not checked yet`
          : status === 'no-shift' ? (latest ? `Last shift received ${shortDay(latest.date)}` : 'No shifts logged yet')
          : status === 'idle' ? `Every hole on ${latest!.project} is finished · last shift ${shortDay(latest!.date)}`
          : lost.length ? lost.map(l => `${l.downtimeReason || 'Stoppage'}, ${l.downtimeHours} h`).join(' · ')
          : 'No stoppages today',
        holeDrilled: hole?.drilled ?? 0, holePlanned: hole?.planned,
        recoveryPct: hole && hole.drilled > 0 ? hole.recoveryPct : null,
        day: shift('Day'), night: shift('Night'),
        monthMetres: inMonth.reduce((s, l) => s + l.metresDrilled, 0),
        monthDays: new Set(inMonth.map(l => l.date)).size,
        monthLostHours: inMonth.reduce((s, l) => s + l.downtimeHours, 0),
        target,
        monthOnTarget: target ? Array.from(byDay.entries()).filter(([d, m]) => monthOf(d) === month && m >= target - 1e-6).length : 0,
        last7PerDay: last7.length ? last7.reduce((s, d) => s + (byDay.get(d) ?? 0), 0) / last7.length : null,
        last14: Array.from({ length: 14 }, (_, i) => {
          const date = addDays(today, i - 13)
          return { date, metres: mine.filter(l => l.date === date).reduce((s, l) => s + l.metresDrilled, 0) }
        }),
      }
    })

    // Our own rigs first, then the contractors' rigs.
    rigs.sort((a, b) => Number(!!a.contractor) - Number(!!b.contractor) || a.rig.localeCompare(b.rig))

    // ── this month against last month, same number of days ─────────────────
    const now = monthNumbers(costing, inv, month)
    const prev = monthNumbers(costing, inv, shiftMonth(month, -1), dayOfMonth)

    const daily = Array.from({ length: dayOfMonth }, (_, i) => {
      const date = `${month}-${String(i + 1).padStart(2, '0')}`
      return { day: String(i + 1), date, metres: logs.filter(l => l.date === date).reduce((s, l) => s + l.metresDrilled, 0) }
    })

    const lostBy: Record<string, { reason: string; hours: number; own: boolean }> = {}
    logs.filter(l => monthOf(l.date) === month && l.downtimeHours > 0).forEach((l: ShiftLog) => {
      const reason = l.downtimeReason || 'Not stated'
      const e = (lostBy[reason] ||= { reason, hours: 0, own: isOwnStop(l) })
      e.hours += l.downtimeHours
    })
    const lost = Object.values(lostBy).sort((a, b) => b.hours - a.hours)

    // ── money ──────────────────────────────────────────────────────────────
    const invoices = costing.invoices.filter(i => i.status !== 'cancelled')
    const unpaid = invoices.filter(i => i.status !== 'paid')
    const overdue = unpaid.filter(i => isOverdue(i, today))
    const disputed = invoices.filter(i => i.ownerStatus === 'disputed')
    const withOwner = unpaid.filter(i => i.ownerStatus === 'awaiting')
    const readyToInvoice = holes.filter(h => h.status === 'approved' && !h.invoiceId)
    const returned = holes.filter(h => h.status === 'closed' && h.returnReason)
    const toSend = holes.filter(h => h.status === 'closed' && !h.returnReason)
    const waitingOwner = holes.filter(h => h.status === 'submitted')
    const money_ = {
      outstanding: unpaid.reduce((s, i) => s + outstanding(i), 0),
      overdueValue: overdue.reduce((s, i) => s + outstanding(i), 0),
      readyValue: readyToInvoice.reduce((s, h) => s + h.value, 0),
      toSendValue: toSend.reduce((s, h) => s + h.value, 0),
      invoices, unpaid, overdue, disputed, withOwner, readyToInvoice, returned, toSend, waitingOwner,
    }

    // ── stock: the same alerts Inventory shows ─────────────────────────────
    const burnMonth = logs.filter(l => l.metresDrilled > 0).map(l => monthOf(l.date)).sort().pop() ?? month
    const burn = RIGS.map(rig => {
      const shifts = logs.filter(l => l.rig === rig && monthOf(l.date) === burnMonth && l.metresDrilled > 0)
      if (!shifts.length) return null
      const days = new Set(shifts.map(s => s.date)).size
      const metres = shifts.reduce((s, l) => s + l.metresDrilled, 0)
      const counts: Record<string, number> = {}
      shifts.forEach(s => { const f = normFormation(s.formationType); counts[f] = (counts[f] ?? 0) + s.metresDrilled })
      const formation = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Hard') as Formation
      return { rig, metresPerDay: Math.round((metres / days) * 10) / 10, formation }
    }).filter(Boolean) as { rig: string; metresPerDay: number; formation: Formation }[]
    const alerts: Alert[] = buildAlerts(inv.pos, inv.catalogue, today, COMPLETED_PROJECTS, burn, inv.alerts, inv.suppliers)
    const urgentAlerts = alerts.filter(a => a.level === 'urgent')

    // ── what needs the admin today ─────────────────────────────────────────
    const linkFor = (h: LiveHole, tab: 'Drillholes' | 'Tracker' = 'Drillholes') =>
      financeLink({ project: h.project, rig: h.rig, month: monthOf(h.end ?? h.start), tab })
    const invLink = (i: Invoice) => {
      const h = holeById.get(i.holeNumbers[0])
      return h ? linkFor(h, 'Tracker') : '/admin/finance'
    }
    // ── projects: what the client did, and rates he sent back ──────────────
    const inbox = contractorInbox(costing)
    const idOf = (name: string) => projectByName(costing, name)?.id ?? ''
    const projectItems: Attention[] = [
      ...inbox.returned.map(r => ({
        key: `rr_${r.id}`, tone: 'bad' as Tone, action: 'Open contract rates', href: `/admin/projects/${idOf(r.project)}?tab=rates`,
        title: `${projectByName(costing, r.project)?.client ?? 'The client'} sent the new rates back`, detail: `${r.project} · ${r.ownerNote ?? 'No reason given'}`,
      })),
      ...Array.from(new Set(inbox.unseen.map(e => e.project))).map(name => {
        const mine = inbox.unseen.filter(e => e.project === name)
        return {
          key: `pn_${name}`, tone: 'info' as Tone, action: 'Open project', href: `/admin/projects/${idOf(name)}`,
          title: mine.length === 1 ? `${projectByName(costing, name)?.client ?? 'The client'}: ${mine[0].title.toLowerCase()}` : `${mine.length} changes from ${projectByName(costing, name)?.client ?? 'the client'}`,
          detail: `${name} · ${mine.map(e => e.detail ?? e.title).slice(0, 2).join(' · ')}`,
        }
      }),
    ]

    // ── contractors working for us ─────────────────────────────────────────
    const reportsWaiting = (costing.contractorReports ?? []).filter(r => r.status === 'waiting')
    const billsToCheck = (costing.contractorBills ?? []).filter(b => b.status === 'received')
    const lateOrders = (costing.workOrders ?? []).filter(w => workOrderProgress(costing, w, today).late)
    const ctrLink = (tab: string, project?: string) => `/admin/contractors?tab=${tab}${project ? `&project=${encodeURIComponent(project)}` : ''}`
    const contractorItems: Attention[] = [
      ...(reportsWaiting.length ? [{
        key: 'ctr_reports', tone: 'warn' as Tone, action: 'Check them', href: ctrLink('reports', reportsWaiting[0].project),
        since: reportsWaiting.map(r => r.date).sort().pop(),
        title: `${reportsWaiting.length} contractor ${reportsWaiting.length === 1 ? 'shift is' : 'shifts are'} waiting to be checked`,
        detail: `${Array.from(new Set(reportsWaiting.map(r => r.rig))).join(', ')} · not in the record, and not paid or billed, until accepted`,
      }] : []),
      ...billsToCheck.map(b => {
        const f = billFigures(costing, b)
        return {
          key: `ctr_bill_${b.id}`, tone: (f.claimed > f.supported ? 'bad' : 'info') as Tone, action: 'Check the bill', href: ctrLink('bills', b.project),
          money: f.claimed > f.supported ? f.claimed - f.supported : undefined, since: (b as { receivedAt?: string }).receivedAt?.slice(0, 10),
          title: `Bill ${b.number} from ${contractorName(costing, b.contractorId)} is waiting · ${money(f.claimed)}`,
          detail: f.claimed > f.supported ? `It claims ${money(f.claimed - f.supported)} more than the checked record supports` : 'Every line matches the checked record',
        }
      }),
      ...lateOrders.map(w => {
        const p = workOrderProgress(costing, w, today)
        return {
          key: `ctr_late_${w.id}`, tone: 'warn' as Tone, action: 'Open work order', href: ctrLink('orders', w.project),
          title: `${contractorName(costing, w.contractorId)} is ${p.daysLate} days past the finish date on ${w.number}`,
          detail: `${Math.round(p.plannedLeft)} m still to drill of ${w.plannedMetres} m`,
        }
      }),
    ]

    /* Metres in the record that no line of the contract rates covers. They bill
     * at zero until the line is added, so the admin is told the same day. */
    const unpriced = new Map<string, { metres: number; lines: Set<string> }>()
    holes.filter(h => h.status !== 'invoiced').forEach(h => h.billing.filter(b => b.metres > 0 && b.rate === 0).forEach(b => {
      const e = unpriced.get(h.project) ?? { metres: 0, lines: new Set<string>() }
      e.metres += b.metres; e.lines.add(b.label); unpriced.set(h.project, e)
    }))
    const rateItems: Attention[] = Array.from(unpriced.entries()).map(([name, u]) => ({
      key: `norate_${name}`, tone: 'bad' as Tone, action: 'Open contract rates', href: `/admin/projects/${idOf(name)}?tab=rates`,
      title: `${Math.round(u.metres * 10) / 10} m on ${name} has no contract rate`,
      detail: `${Array.from(u.lines).slice(0, 3).join(', ')} · these metres bill at zero until the rate is added`,
    }))

    /* The survey: readings waiting to be checked, and holes still being
     * drilled that have drifted off plan or gone too far without a survey. */
    const surveyLink = (hole: string) => `/admin/analytics/performance?hole=${encodeURIComponent(hole)}&view=survey`
    const waitingReadings = pendingReadings(costing)
    const surveyItems: Attention[] = []
    if (waitingReadings.length) {
      const holesW = Array.from(new Set(waitingReadings.map(r => r.hole)))
      surveyItems.push({
        key: 'survey_wait', tone: 'info', action: 'Check readings', href: surveyLink(holesW[0]),
        title: `${waitingReadings.length} survey ${waitingReadings.length === 1 ? 'reading is' : 'readings are'} waiting to be checked`,
        detail: `${holesW.slice(0, 5).join(', ')}${holesW.length > 5 ? ' and more' : ''} · only approved readings draw the hole path`,
      })
    }
    // Only on a project that surveys at all, so a company that does not run
    // surveys is not told about every hole it drills.
    const surveyed = new Set([...(costing.surveys ?? []).map(r => r.project), ...costing.shiftLogs.filter(l => l.surveys?.length).map(l => l.project)])
    ;(costing.projects ?? []).filter(p => p.status === 'active' && surveyed.has(p.name)).forEach(p => projectHoles(costing, p.name).filter(h => h.status === 'drilling').forEach(h => {
      const sv = holeSurvey(costing, h.id)
      sv.warnings.filter(w => w.id === 'dev' || w.id === 'gap').forEach(w => surveyItems.push({
        key: `sv_${w.id}_${h.id}`, tone: w.tone === 'bad' ? 'bad' : 'warn', action: 'Open survey', href: surveyLink(h.id),
        title: `${h.id}: ${w.title.charAt(0).toLowerCase()}${w.title.slice(1)}`, detail: w.detail,
      }))
    }))

    const attention: Attention[] = [
      ...projectItems,
      ...rateItems,
      ...contractorItems,
      ...rigs.filter(r => r.status === 'breakdown').map(r => ({
        key: `bd_${r.rig}`, tone: 'bad' as Tone, action: 'Open rig', href: '/admin/rigs', since: today,
        title: `${r.rig} is broken down today`, detail: `${r.project ?? ''} · ${r.note}`,
      })),
      ...rigs.filter(r => r.status === 'idle' && r.project && projectByName(costing, r.project)?.status !== 'completed').map(r => ({
        key: `idle_${r.rig}`, tone: 'info' as Tone, action: 'Open project', href: `/admin/projects/${idOf(r.project!)}`,
        title: `${r.rig} has no hole left to drill`, detail: `${r.note}. Add the next holes, move the rig, or mark the project completed.`,
      })),
      ...rigs.filter(r => r.target && r.last7PerDay != null && r.status !== 'idle' && r.last7PerDay < r.target - 1e-6).map(r => ({
        key: `kpi_${r.rig}`, tone: 'warn' as Tone, action: 'Open costing', href: financeLink({ project: r.project ?? '', rig: r.rig, month }),
        title: `${r.rig} is under its ${r.target} m a day target`,
        detail: `${r.last7PerDay!.toFixed(1)} m a day over its last 7 logged days · ${r.monthOnTarget} of ${r.monthDays} days on target this month`,
      })),
      ...rigs.filter(r => r.status === 'no-shift' && r.project && !COMPLETED_PROJECTS.includes(r.project)).map(r => ({
        key: `ns_${r.rig}`, tone: 'warn' as Tone, action: 'Open rig', href: '/admin/rigs', since: today,
        title: `No shift received from ${r.rig} today`, detail: r.note,
      })),
      ...returned.map(h => ({
        key: `ret_${h.id}`, tone: 'bad' as Tone, action: 'Fix and resend', href: linkFor(h),
        title: `${clientOf(h.project)} returned hole ${h.id}`, detail: h.returnReason ?? '',
      })),
      ...disputed.map(i => ({
        key: `dis_${i.id}`, tone: 'bad' as Tone, action: 'Open invoice', href: invLink(i), money: disputedAmount(i),
        title: `Invoice ${i.number}: ${(i.lineReviews ?? []).filter(r => r?.status === 'disputed').length} line(s) disputed by ${clientOf(i.project)}`,
        detail: `${money(disputedAmount(i))} held back before tax · ${i.project}`,
      })),
      ...overdue.map(i => ({
        key: `od_${i.id}`, tone: 'warn' as Tone, action: 'Open invoice', href: invLink(i), money: outstanding(i),
        title: `Invoice ${i.number} is overdue · ${money(outstanding(i))}`, detail: `${i.project} · due ${i.dueDate}`,
      })),
      ...(readyToInvoice.length ? [{
        key: 'ready', tone: 'info' as Tone, action: 'Raise invoice', href: linkFor(readyToInvoice[0]), money: money_.readyValue,
        title: `${readyToInvoice.length} approved ${readyToInvoice.length === 1 ? 'hole is' : 'holes are'} ready to invoice · ${moneyL(money_.readyValue)}`,
        detail: readyToInvoice.map(h => h.id).join(', '),
      }] : []),
      ...(toSend.length ? [{
        key: 'tosend', tone: 'info' as Tone, action: 'Open holes', href: linkFor(toSend[0]), money: money_.toSendValue,
        title: `${toSend.length} closed ${toSend.length === 1 ? 'hole is' : 'holes are'} not yet approved for billing · ${moneyL(money_.toSendValue)}`,
        detail: [
          toSend.some(h => isShared(h.project)) ? `${toSend.filter(h => isShared(h.project)).length} to send to the client` : '',
          toSend.some(h => !isShared(h.project)) ? `${toSend.filter(h => !isShared(h.project)).length} for you to approve` : '',
          `${toSend.slice(0, 6).map(h => h.id).join(', ')}${toSend.length > 6 ? ' and more' : ''}`,
        ].filter(Boolean).join(' · '),
      }] : []),
      ...surveyItems,
      ...(urgentAlerts.length ? [{
        key: 'stock', tone: 'warn' as Tone, action: 'Open inventory', href: '/admin/inventory',
        title: `${urgentAlerts.length} urgent stock ${urgentAlerts.length === 1 ? 'problem' : 'problems'}`,
        detail: urgentAlerts.slice(0, 2).map(a => a.title).join(' · '),
      }] : []),
    ]

    return {
      today, month, dayOfMonth, rigs, now, prev, daily, lost, money: money_, alerts, urgentAlerts, attention, holes,
      projects: costing.projects ?? [], projectNews: inbox.count + inbox.returned.length,
      contractorWork: reportsWaiting.length + billsToCheck.length,
    }
  }
}
