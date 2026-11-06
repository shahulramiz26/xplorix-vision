'use client'

import { useMemo } from 'react'
import { COMPANY_NAME, type ShiftLog } from '../../lib/costing-store'
import { useSignedIn } from '../../lib/session'
import { contractorSide, type Contractor, type ContractorReport } from '../../lib/contracting'
import type { LogScope } from '../components/drill-log-form'
import { Page, Card, Empty } from '../components/kit'

/* ==========================================================================
 * THE CONTRACTOR WHO IS SIGNED IN
 *
 * A contractor login belongs to one contractor and opens only his own work
 * orders with the company that gave it to him: nothing of that company's own
 * rigs, what its client pays, or any other contractor.
 * ========================================================================== */

/* The company that gave the login: the client, from where the contractor sits. */
/* The company the contractor works for. Always the current value. */
export { COMPANY_NAME as CLIENT_NAME } from '../../lib/costing-store'

export function useMe() {
  const store = useSignedIn('contractor')
  const { state, user } = store
  const me: Contractor | undefined = state.contractors.find(c => c.id === user?.contractorId)
  const side = useMemo(() => contractorSide(state, me?.id ?? ''), [state, me?.id])
  /* What he may log against: each running work order's project, with the
   * rigs he brought to it. The people are his own, so they are typed. */
  const scopes: LogScope[] = useMemo(() => {
    const by: Record<string, LogScope> = {}
    side.orders.filter(w => w.status === 'active').forEach(w => {
      const s = (by[w.project] ||= { project: w.project, rigs: [], supervisors: [], drillers: [], workOrderId: w.id })
      s.rigs = Array.from(new Set([...s.rigs, ...w.rigs]))
    })
    return Object.values(by)
  }, [side.orders])
  return { ...store, me, side, scopes }
}

// ── one shift, wherever it stands ─────────────────────────────────────────

export type ShiftState = 'waiting' | 'returned' | 'checked'
export interface MyShift {
  key: string
  state: ShiftState
  rig: string
  date: string
  shift: 'Day' | 'Night'
  hole: string | null
  metres: number
  core: number
  stoppedHours: number
  reason: string
  report?: ContractorReport
  log?: ShiftLog
}
const order = (x: { date: string; shift: string; rig: string }) => `${x.date}${x.shift === 'Day' ? '0' : '1'}${x.rig}`

/* Everything the contractor has sent, newest first: waiting, sent back, and
 * checked into the record. */
export function myShifts(side: ReturnType<typeof contractorSide>): MyShift[] {
  const fromReport = (r: ContractorReport): MyShift => ({
    key: r.id, state: r.status === 'returned' ? 'returned' : 'waiting', rig: r.rig, date: r.date, shift: r.shift, hole: r.holeNumber,
    metres: r.metres, core: r.coreRecovery, stoppedHours: r.standbyHours + r.breakdownHours, reason: r.reason, report: r,
  })
  const fromLog = (l: ShiftLog): MyShift => ({
    key: l.id, state: 'checked', rig: l.rig, date: l.date, shift: l.shift, hole: l.holeNumber,
    metres: l.metresDrilled, core: l.coreRecovery, stoppedHours: l.downtimeHours, reason: l.downtimeReason, log: l,
  })
  return [...side.waiting.map(fromReport), ...side.returned.map(fromReport), ...side.accepted.filter(l => !l.segmentOf).map(fromLog)]
    .sort((a, b) => order(b).localeCompare(order(a)))
}

/* Shown when the login has no contractor record behind it. */
export function NoLogin() {
  return (
    <Page>
      <Card><Empty>
        This login is not tied to a contractor yet.<br />
        In the Company Admin, open Users and create a contractor login.
      </Empty></Card>
    </Page>
  )
}
