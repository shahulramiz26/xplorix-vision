'use client'

import { useMemo } from 'react'
import { isOwnStop, depthIndex, shiftOrder, type useCosting, type ShiftLog } from './costing-store'
import { useSignedIn } from './session'
import { holesFromLogs, liveInvoices, invoiceState } from './client-record'
import { ownerInbox, type PlanStatus } from './projects'

/* ==========================================================================
 * WHAT THE CLIENT SEES
 *
 * A client login belongs to one client: the company named on the project.
 * It shows the projects the contractor has chosen to show him, read straight
 * from the contractor's own record, so the two sides cannot be looking at
 * different numbers.
 *
 * One rule runs through every selector here: the client sees what he pays
 * for and what happened on the rig. Fuel, crew cost, parts, stock, the cost
 * of running a rig, what a sub-contractor is paid, and margin never leave
 * the contractor's side, so nothing in this file reads them.
 * ========================================================================== */

type State = ReturnType<typeof useCosting>['state']

/* A hole's status in the client's own words. */
export const CLIENT_HOLE: Record<PlanStatus, { label: string; tone: 'good' | 'warn' | 'bad' | 'info' | 'neutral' }> = {
  planned: { label: 'Planned', tone: 'neutral' },
  drilling: { label: 'Drilling', tone: 'info' },
  closed: { label: 'Finished, not sent yet', tone: 'neutral' },
  submitted: { label: 'Waiting for you', tone: 'warn' },
  approved: { label: 'Approved', tone: 'good' },
  invoiced: { label: 'Invoiced', tone: 'good' },
}

/* One shift as the client reads it. Deliberately no fuel, water, additives,
 * parts or notes: those stay with the contractor. */
export interface ClientShift {
  id: string
  project: string
  date: string
  shift: 'Day' | 'Night'
  rig: string
  hole: string | null
  from?: number
  to?: number
  metres: number
  recoveryPct: number | null
  formation: string
  lithology?: string
  drillingHours: number
  standbyHours: number          // stopped for a reason that is the client's: paid as standby
  breakdownHours: number        // the contractor's own stop: not charged
  stops: { reason: string; hours: number; mine: boolean }[]
  crew: number
  supervisor?: string
  driller?: string
  holeClosed: boolean
  incidents: { type: string; severity: string; note: string }[]
  loggedAt?: string
  order: string                 // date, day before night, a second hole after the first
}

export function clientShifts(logs: ShiftLog[]): ClientShift[] {
  const at = depthIndex(logs)
  return logs.map(l => {
    const lines = l.downtime?.length ? l.downtime
      : l.downtimeHours > 0 ? [{ reason: l.downtimeReason || 'Not stated', side: isOwnStop(l) ? 'internal' as const : 'client' as const, hours: l.downtimeHours }] : []
    const from = l.holeNumber ? (l.meterStart ?? at[l.id] ?? 0) : undefined
    return {
      id: l.id, project: l.project, date: l.date, shift: l.shift, rig: l.rig, hole: l.holeNumber,
      from, to: from != null ? Math.round((from + l.metresDrilled) * 100) / 100 : undefined,
      metres: l.metresDrilled,
      recoveryPct: l.metresDrilled > 0 ? (l.coreRecovery / l.metresDrilled) * 100 : null,
      formation: l.formationType, lithology: l.lithology,
      drillingHours: l.drillingHours,
      standbyHours: lines.filter(x => x.side === 'client').reduce((s, x) => s + x.hours, 0),
      breakdownHours: lines.filter(x => x.side === 'internal').reduce((s, x) => s + x.hours, 0),
      stops: lines.map(x => ({ reason: x.reason, hours: x.hours, mine: x.side === 'client' })),
      crew: l.crewCount, supervisor: l.supervisor, driller: l.driller,
      holeClosed: !!l.holeClosedThisShift, incidents: l.incidents ?? [], loggedAt: l.loggedAt, order: shiftOrder(l),
    }
  }).sort((a, b) => b.order.localeCompare(a.order) || a.rig.localeCompare(b.rig))
}

export function clientView(state: State, client: string) {
  const inbox = ownerInbox(state, client || '\u0000')
  const projects = inbox.shared
  const names = new Set(projects.map(p => p.name))
  const logs = state.shiftLogs.filter(l => names.has(l.project))
  const holes = holesFromLogs(state).filter(h => names.has(h.project))
  const invoices = liveInvoices(state, holes).filter(i => names.has(i.project))
  return {
    projects, names, logs, shifts: clientShifts(logs), holes, invoices, inbox,
    holesWaiting: holes.filter(h => h.status === 'submitted'),
    toVerify: invoices.filter(i => invoiceState(i) === 'to-verify'),
    events: (state.projectEvents ?? []).filter(e => names.has(e.project)),
  }
}

/* The client who is signed in, and everything he may read. */
export function useClient() {
  const store = useSignedIn('client')
  const { state, user } = store
  const client = user?.client ?? ''
  const view = useMemo(() => clientView(state, client), [state, client])
  return { ...store, client, ...view }
}
