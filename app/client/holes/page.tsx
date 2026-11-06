'use client'

import { useMemo, useState } from 'react'
import { holeVerdict } from '../../../lib/log-checks'
import { CheckedMark } from '../../components/checked-mark'
import { useRouter } from 'next/navigation'
import { money, moneyL, COMPANY_NAME } from '../../../lib/costing-store'
import { useClient, CLIENT_HOLE } from '../../../lib/client-view'
import { num, downloadCsv } from '../../../lib/client-record'
import { projectHoles, day, type PlanStatus } from '../../../lib/projects'
import {
  Page, PageHead, Card, Tile, Grid, Seg, Btn, Table, Status, DepthBar, Empty, inputStyle,
  th, thR, td, tdR, tdStrong, rowLine, T,
} from '../../components/kit'

/* ==========================================================================
 * HOLES — every hole on the client's projects, from plan to invoice
 *
 * One row a hole: how deep it was meant to go, how deep it is, how long it
 * took, how well the core came out, how many days he is charged standby for,
 * and what it bills at his contract rates. A finished hole waits here for his
 * approval before it can be invoiced.
 * ========================================================================== */

type View = 'all' | 'submitted' | PlanStatus
const VIEWS: { value: View; label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'drilling', label: 'Drilling' }, { value: 'submitted', label: 'Waiting for you' },
  { value: 'closed', label: 'Finished' }, { value: 'approved', label: 'Approved' }, { value: 'invoiced', label: 'Invoiced' }, { value: 'planned', label: 'Planned' },
]
export default function ClientHoles() {
  const c = useClient()
  const router = useRouter()
  const [view, setView] = useState<View>('all')
  const [project, setProject] = useState('all')

  // Holes the rigs have touched, plus the ones still only on the plan.
  const planned = c.projects.flatMap(p => projectHoles(c.state, p.name).filter(h => h.status === 'planned').map(h => ({ ...h, project: p.name })))
  const rows = [
    ...c.holes.map(h => {
      const hours = h.shifts.reduce((s, x) => s + x.drilling, 0)
      return { id: h.id, project: h.project, rig: h.rig, planned: h.planned, drilled: h.drilled, days: h.days, rate: hours > 0 ? h.drilled / hours : null,
        recovery: h.drilled > 0 ? h.recoveryPct : null, standbyDays: h.standbyDays, breakdownDays: h.breakdownDays, value: h.value, status: h.status as PlanStatus, start: h.start, end: h.end, returned: h.returnReason }
    }),
    ...planned.map(h => ({ id: h.id, project: h.project, rig: '', planned: h.planned, drilled: 0, days: 0, rate: null, recovery: null, standbyDays: 0, breakdownDays: 0, value: 0, status: 'planned' as PlanStatus, start: '', end: undefined, returned: undefined })),
  ].filter(h => project === 'all' || h.project === project)
  const shown = rows.filter(h => view === 'all' || h.status === view)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const verdicts = useMemo(() => Object.fromEntries(rows.filter(h => h.status !== 'planned').map(h => [h.id, holeVerdict(c.state, h.id)])), [c.state, rows.length])
  const checkedCount = Object.values(verdicts).filter(v => v.ok).length

  const touched = rows.filter(h => h.status !== 'planned')
  const metres = touched.reduce((s, h) => s + h.drilled, 0)
  const core = c.holes.filter(h => project === 'all' || h.project === project).reduce((s, h) => s + h.drilled * h.recoveryPct / 100, 0)
  const waiting = rows.filter(h => h.status === 'submitted')
  const count = (v: View) => v === 'all' ? rows.length : rows.filter(h => h.status === v).length

  const exportCsv = () => downloadCsv('xplorix-holes', [
    ['Hole', 'Project', 'Rig', 'Planned m', 'Drilled m', 'Days on hole', 'Metres an hour', 'Core recovery %', 'Standby days', 'Days stopped, not charged', 'Value at contract rates', 'Started', 'Finished', 'Status'],
    ...shown.map(h => [h.id, h.project, h.rig, h.planned, h.drilled, h.days, h.rate?.toFixed(2), h.recovery?.toFixed(1), h.standbyDays, h.breakdownDays, Math.round(h.value), h.start, h.end, CLIENT_HOLE[h.status].label]),
  ])

  if (c.projects.length === 0) {
    return <Page><PageHead question="How is each hole doing?" answer={<>{COMPANY_NAME} has not shown you a project yet.</>} /></Page>
  }

  return (
    <Page>
      <PageHead question="How is each hole doing?" tone={waiting.length ? 'warn' : 'good'}
        answer={<>
          {count('drilling')} {count('drilling') === 1 ? 'hole is' : 'holes are'} drilling and {touched.length - count('drilling')} {touched.length - count('drilling') === 1 ? 'is' : 'are'} finished. {' '}
          {waiting.length ? <b style={{ color: T.text }}>{waiting.length} {waiting.length === 1 ? 'is' : 'are'} waiting for your approval, worth {money(waiting.reduce((s, h) => s + h.value, 0))} before tax.</b> : 'None is waiting for your approval.'}
        </>}
        right={<Btn size="sm" onClick={exportCsv}>Export</Btn>} />

      <Grid min={180}>
        <Tile label="Drilling now" value={count('drilling')} note={`${count('planned')} more on the plan`} />
        <Tile label="Waiting for you" value={waiting.length} tone={waiting.length ? 'warn' : 'good'} note={waiting.length ? money(waiting.reduce((s, h) => s + h.value, 0)) : 'Nothing to approve'} />
        <Tile label="Metres drilled" value={`${num(metres)} m`} note={`${touched.length} holes`} />
        <Tile label="Core recovery" value={metres > 0 ? `${((core / metres) * 100).toFixed(1)}%` : '—'} note="Across every hole drilled" />
        <Tile label="Billed or billable" value={moneyL(touched.reduce((s, h) => s + h.value, 0))} note="At your contract rates, before tax" />
      </Grid>

      <Card pad={false} title="Holes" subtitle={`Click a hole for every shift on it, what stopped it and what it bills.${checkedCount ? ` ${checkedCount} of ${touched.length} are marked Checked: every shift on them passed the XPLORIX drill log checks as it was logged.` : ''}`}
        right={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {c.projects.length > 1 && (
            <select value={project} onChange={e => setProject(e.target.value)} aria-label="Project" style={{ ...inputStyle, width: 'auto', padding: '6px 10px', fontSize: 12.5 }}>
              <option value="all">All projects</option>
              {c.projects.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
            </select>
          )}
          <Seg options={VIEWS.filter(v => v.value === 'all' || count(v.value) > 0).map(v => ({ value: v.value, label: `${v.label} · ${count(v.value)}` }))} value={view} onChange={setView} />
        </div>}>
        {shown.length === 0 ? <Empty>No holes match this filter.</Empty> : (
          <Table>
            <thead>
              <tr>
                <th style={th}>Hole</th><th style={th}>Project</th><th style={th}>Rig</th><th style={th}>Depth</th>
                <th style={thR}>Days</th><th style={thR}>Metres an hour</th><th style={thR}>Core recovery</th><th style={thR}>Standby days</th>
                <th style={thR}>Value</th><th style={th}>Started</th><th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(h => (
                <tr key={h.id} className="xpl-row" onClick={() => router.push(`/client/holes/${encodeURIComponent(h.id)}`)} style={{ borderBottom: rowLine, cursor: 'pointer' }}>
                  <td style={tdStrong}>{h.id}{verdicts[h.id]?.ok && <div style={{ marginTop: 3 }}><CheckedMark v={verdicts[h.id]} compact /></div>}</td>
                  <td style={td}>{h.project}</td>
                  <td style={td}>{h.rig || '—'}</td>
                  <td style={td}>{h.status === 'planned' ? <span>{h.planned ? `${num(h.planned)} m planned` : '—'}</span> : <DepthBar drilled={h.drilled} planned={h.planned} width={150} />}</td>
                  <td style={tdR}>{h.days || '—'}</td>
                  <td style={tdR}>{h.rate == null ? '—' : h.rate.toFixed(2)}</td>
                  <td style={tdR}>{h.recovery == null ? '—' : `${h.recovery.toFixed(0)}%`}</td>
                  <td style={{ ...tdR, color: h.standbyDays ? T.text : T.muted }}>{h.standbyDays || '—'}</td>
                  <td style={{ ...tdR, color: T.text }}>{h.value ? money(h.value) : '—'}</td>
                  <td style={td}>{h.start ? day(h.start) : '—'}</td>
                  <td style={td}><Status tone={CLIENT_HOLE[h.status].tone}>{CLIENT_HOLE[h.status].label}</Status></td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <div style={{ fontSize: 12.5, color: T.faint, lineHeight: 1.6, maxWidth: 820 }}>
        Standby days are days a rig was stopped for a reason that is not {COMPANY_NAME}&rsquo;s, charged at the standby rate. A day lost to their own rig or crew is not charged.
      </div>
    </Page>
  )
}
