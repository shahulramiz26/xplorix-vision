'use client'

import { useMemo, useState } from 'react'
import { monthOf, monthShort, MAINTENANCE_TYPE_LABEL } from '../../../lib/costing-store'
import { downloadCsv } from '../../../lib/client-record'
import { when } from '../../../lib/projects'
import { T, tint, Page, Head, Card, Tile, Grid, Btn, Seg, Status, Empty, Table, th, thR, td, tdR, rowLine } from '../../components/kit'
import { n0, n1, shortDay, linkBtn } from '../../admin/contractors/shared'
import { useMe, myShifts, NoLogin, CLIENT_NAME } from '../me'
import { reportToDraft } from '../../../lib/contracting'
import { checkShift, shiftVerdict, isFullRecord } from '../../../lib/log-checks'
import { VerdictPill } from '../../components/checked-mark'

/* ==========================================================================
 * SUBMITTED LOGS — every log the contractor has sent, and what became of it
 *
 *   Sent back      the client could not accept it; his reason is beside it
 *   Waiting        sent, not checked yet; not counted and not paid
 *   Checked        in the record. If the client accepted a different figure
 *                  from the one sent, both are shown with his note.
 *
 * The checked list is the same record the client reads and the bill is
 * checked against, so there is one set of metres between the two companies.
 * ========================================================================== */

export default function SubmittedLogsPage() {
  const { state, me, side, deleteReport } = useMe()
  const [month, setMonth] = useState('all')
  const [showAll, setShowAll] = useState(false)
  const all = useMemo(() => myShifts(side), [side])

  if (!me) return <NoLogin />
  const ids = new Set(side.orders.map(w => w.id))
  const maint = state.maintenance.filter(m => m.contractor === me.id || (m.workOrderId && ids.has(m.workOrderId))).sort((a, b) => b.date.localeCompare(a.date))

  const returned = all.filter(s => s.state === 'returned')
  const waiting = all.filter(s => s.state === 'waiting')
  const months = Array.from(new Set(all.filter(s => s.state === 'checked').map(s => monthOf(s.date)))).sort()
  const checked = all.filter(s => s.state === 'checked' && (month === 'all' || monthOf(s.date) === month))
  const shown = showAll ? checked : checked.slice(0, 14)
  const metres = checked.reduce((s, x) => s + x.metres, 0)
  const core = checked.reduce((s, x) => s + x.core, 0)
  const changed = checked.filter(s => s.log?.check?.claimedMetres != null || s.log?.check?.claimedRecovery != null)
  const refused = checked.filter(s => s.log?.downtimeReason === 'Contractor Delay')
  /* The XPLORIX drill log checks on each shift he sent: what the client's
   * site staff will see beside it when they check it. */
  const live = isFullRecord(state)
  const sentChecks = (r: NonNullable<typeof waiting[number]['report']>) => {
    const said = new Set((r.extra?.trust?.warnings ?? []).map(w => w.id))
    // His earlier shifts on the same hole that are still waiting count towards where it stands.
    const ord = (x: { date: string; shift: string }) => `${x.date}${x.shift === 'Day' ? 0 : 1}`
    const pendingOnHole = waiting.map(w => w.report!).filter(x => x.id !== r.id && x.holeNumber && x.holeNumber === r.holeNumber && ord(x) < ord(r)).reduce((a, x) => a + x.metres, 0)
    const cs = checkShift(state, { ...reportToDraft(r), contractor: me?.id }, { contractor: true, pendingOnHole })
    const stops = cs.filter(c => c.level === 'stop'), open = cs.filter(c => c.level === 'warn' && !said.has(c.id))
    return { v: stops.length ? 'stop' as const : open.length ? 'open' as const : cs.length ? 'explained' as const : 'pass' as const, open: open.length, titles: [...stops, ...open].map(c => c.title) }
  }

  const exportIt = () => downloadCsv('shift-record', [
    ['Date', 'Shift', 'Rig', 'Hole', 'Metres checked', 'Metres sent', 'Core, m', 'Stopped, h', 'Reason', 'Checked by', 'Checked at', 'Note'],
    ...checked.map(s => [s.date, s.shift, s.rig, s.hole ?? '', s.metres, s.log?.check?.claimedMetres ?? s.metres, s.core, s.stoppedHours, s.reason, s.log?.check?.by ?? '', s.log?.check?.at ?? '', s.log?.check?.note ?? '']),
  ])

  return (
    <Page>
      <Head title="Submitted logs"
        sub={<>Every drill log and maintenance log you have sent to {CLIENT_NAME}, and what they said. Checked shifts are the record your bills are paid on.</>}
        right={<Btn kind="primary" href="/contractor/drill-log">Add a drill log</Btn>} />

      <Grid min={200}>
        <Tile label="Sent back" value={returned.length} tone={returned.length ? 'bad' : 'good'} note={returned.length ? 'Correct and send again' : 'Nothing to correct'} />
        <Tile label="Waiting to be checked" value={waiting.length} note={waiting.length ? `${n0(waiting.reduce((s, x) => s + x.metres, 0))} m, not counted yet` : 'Nothing waiting'} />
        <Tile label={month === 'all' ? 'Checked metres, all time' : `Checked metres, ${monthShort(month)}`} value={`${n0(metres)} m`} note={metres ? `Core recovery ${((core / metres) * 100).toFixed(1)}%` : undefined} />
        <Tile label="Accepted at a different figure" value={changed.length} note={refused.length ? `${refused.length} standby ${refused.length === 1 ? 'claim' : 'claims'} not accepted` : 'Standby claims all accepted'} />
      </Grid>

      {returned.length > 0 && (
        <Card title={`Sent back to you · ${returned.length}`} pad={false} subtitle="Not in the record. Correct the shift and send it again; the hole's depth has a gap until you do.">
          {returned.map((s, i) => (
            <div key={s.key} style={{ display: 'flex', gap: 16, padding: '14px 18px', borderTop: i ? rowLine : undefined, flexWrap: 'wrap', alignItems: 'flex-start', background: tint(T.red, 4) }}>
              <div style={{ flex: '1 1 400px', minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{s.rig} · {shortDay(s.date)} {s.shift.toLowerCase()} · {s.metres > 0 ? `${s.metres} m on ${s.hole}` : 'no metres'}</div>
                <div style={{ fontSize: 13.5, color: T.muted, marginTop: 5, lineHeight: 1.5 }}>“{s.report?.returnReason}”</div>
                <div style={{ fontSize: 12, color: T.faint, marginTop: 4 }}>{s.report?.returnedBy}, {CLIENT_NAME}{s.report?.returnedAt ? ` · ${when(s.report.returnedAt)}` : ''}</div>
              </div>
              <Btn kind="primary" size="sm" href={`/contractor/drill-log?fix=${encodeURIComponent(s.key)}`}>Correct and send again</Btn>
            </div>
          ))}
        </Card>
      )}

      <Card title={`Waiting to be checked · ${waiting.length}`} pad={false} subtitle={`Sent to ${CLIENT_NAME}. Not counted or paid until they check it.`}>
        {waiting.length === 0 ? <Empty>Nothing is waiting. Every shift you sent has been checked.</Empty> : (
          <Table>
            <thead><tr><th style={th}>Shift</th><th style={th}>Rig</th><th style={th}>Hole</th><th style={thR}>From</th><th style={thR}>To</th><th style={thR}>Metres</th><th style={thR}>Core</th><th style={th}>Stopped</th><th style={th}>XPLORIX checks</th><th style={th}>Sent</th><th style={th}></th></tr></thead>
            <tbody>
              {waiting.map(s => { const r = s.report!; return (
                <tr key={s.key} className="xpl-row" style={{ borderBottom: rowLine }}>
                  <td style={{ ...td, color: T.text }}>{shortDay(s.date)} {s.shift.toLowerCase()}</td>
                  <td style={td}>{s.rig}</td><td style={td}>{s.hole ?? '—'}</td>
                  <td style={tdR}>{r.fromDepth != null ? n1(r.fromDepth) : '—'}</td><td style={tdR}>{r.fromDepth != null ? n1(r.fromDepth + r.metres) : '—'}</td>
                  <td style={{ ...tdR, color: T.text, fontWeight: 600 }}>{s.metres || '—'}</td>
                  <td style={tdR}>{s.metres > 0 ? `${((s.core / s.metres) * 100).toFixed(0)}%` : '—'}</td>
                  <td style={td}>{s.stoppedHours > 0 ? `${s.stoppedHours} h · ${s.reason || 'no reason'}` : '—'}</td>
                  <td style={td}>{(() => { const k = sentChecks(r); return <span title={k.titles.join('\n') || 'Passes every check'}><VerdictPill v={k.v} open={k.open} /></span> })()}</td>
                  <td style={td}>{when(r.receivedAt)}</td>
                  <td style={{ ...td, textAlign: 'right' }}><button type="button" style={{ ...linkBtn, color: T.faint, fontWeight: 400 }} onClick={() => deleteReport(r.id)}>Take back</button></td>
                </tr>
              ) })}
            </tbody>
          </Table>
        )}
      </Card>

      <Card title="Checked, in the record" pad={false}
        subtitle={`${checked.length} shifts${changed.length ? ` · ${changed.length} accepted at a different figure from the one you sent` : ''}.`}
        right={<div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Seg<string> value={month} onChange={setMonth} options={[{ value: 'all', label: 'All' }, ...months.slice(-4).map(m => ({ value: m, label: monthShort(m) }))]} />
          <Btn size="sm" onClick={exportIt} disabled={!checked.length}>Export</Btn>
        </div>}>
        {checked.length === 0 ? <Empty>No checked shifts yet.</Empty> : (
          <Table>
            <thead><tr><th style={th}>Shift</th><th style={th}>Rig</th><th style={th}>Hole</th><th style={thR}>Metres</th><th style={thR}>Core</th><th style={th}>Stopped</th><th style={th}>XPLORIX checks</th><th style={th}>Checked by {CLIENT_NAME}</th></tr></thead>
            <tbody>
              {shown.map(s => {
                const c = s.log?.check
                const cut = c?.claimedMetres
                const notPaid = s.log?.downtimeReason === 'Contractor Delay'
                return (
                  <tr key={s.key} className="xpl-row" style={{ borderBottom: rowLine, verticalAlign: 'top' }}>
                    <td style={{ ...td, color: T.text }}>{shortDay(s.date)} {s.shift.toLowerCase()}</td>
                    <td style={td}>{s.rig}</td><td style={td}>{s.hole ?? '—'}</td>
                    <td style={{ ...tdR, color: T.text, fontWeight: 600 }}>{s.metres || '—'}{cut != null && <div style={{ fontSize: 12, color: T.muted, fontWeight: 400 }}><span aria-hidden style={{ color: T.amber, fontWeight: 800 }}>! </span>you sent {cut}</div>}</td>
                    <td style={tdR}>{s.metres > 0 ? `${((s.core / s.metres) * 100).toFixed(0)}%` : '—'}{c?.claimedRecovery != null && <div style={{ fontSize: 12, color: T.muted }}>you sent {c.claimedRecovery} m</div>}</td>
                    <td style={{ ...td, whiteSpace: 'normal', minWidth: 170 }}>
                      {s.stoppedHours > 0 ? <>{s.stoppedHours} h · {notPaid ? 'standby not accepted' : s.reason}</> : '—'}
                    </td>
                    <td style={td}>{s.log ? <VerdictPill v={shiftVerdict(state, s.log, live)} /> : '—'}</td>
                    <td style={{ ...td, whiteSpace: 'normal', minWidth: 200 }}>{c ? <>{c.by} · {when(c.at)}</> : '—'}{c?.note && <div style={{ fontSize: 12, color: T.faint, marginTop: 2 }}>“{c.note}”</div>}</td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
        {checked.length > 14 && (
          <div style={{ padding: '11px 18px', borderTop: rowLine }}>
            <button type="button" style={linkBtn} onClick={() => setShowAll(v => !v)}>{showAll ? 'Show the latest 14' : `Show all ${checked.length}`}</button>
          </div>
        )}
      </Card>

      <Card title={`Maintenance logs · ${maint.length}`} pad={false} right={<Btn size="sm" href="/contractor/maintenance-log">Open maintenance log</Btn>}>
        {maint.length === 0 ? <Empty>No maintenance logged yet.</Empty> : (
          <Table>
            <thead><tr><th style={th}>Date</th><th style={th}>Rig</th><th style={th}>Type</th><th style={th}>Component</th><th style={thR}>Hours</th><th style={th}>Action taken</th></tr></thead>
            <tbody>
              {maint.slice(0, 10).map(m => (
                <tr key={m.id} className="xpl-row" style={{ borderBottom: rowLine }}>
                  <td style={{ ...td, color: T.text }}>{shortDay(m.date)}</td><td style={td}>{m.rig}</td>
                  <td style={td}>{MAINTENANCE_TYPE_LABEL[m.maintenanceType]}</td><td style={{ ...td, whiteSpace: 'normal' }}>{m.component}</td>
                  <td style={tdR}>{m.hours} h</td><td style={td}>{m.action}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <div style={{ fontSize: 12.5, color: T.faint, lineHeight: 1.6 }}>
        <Status tone="neutral">One record</Status> <span style={{ marginLeft: 6 }}>These are the same checked shifts {CLIENT_NAME} sees. Your bills are checked against them, line by line.</span>
      </div>
    </Page>
  )
}
