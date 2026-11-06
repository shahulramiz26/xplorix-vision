'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useSignedIn } from '../../../lib/session'
import { TODAY, addDays } from '../../../lib/inventory-store'
import { auditRecord, missingShifts, supervisorScores } from '../../../lib/log-checks'
import { ownScopes } from '../../components/log-screens'
import { Page, PageHead, Card, Grid, Tile, Table, Status, Empty, Btn, T, th, thR, td, tdR, tdStrong, rowLine, type Tone } from '../../components/kit'

/* ==========================================================================
 * SUPERVISOR · TODAY — what his rigs need from him
 *
 * Every figure in XPLORIX starts with the supervisor's shift log, so his
 * home screen asks one thing: is my part of the record complete and right?
 *   · his rigs, and whether today's two shifts are in
 *   · shifts in the last 7 days with no log
 *   · his own logs that the checks stop or want explained, each one link
 *     straight to the log to put it right
 *   · his record over 30 days against the company's
 * No rates, costs or invoices: the supervisor login never shows money.
 * ========================================================================== */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const day = (d: string) => { const [, m, dd] = d.split('-').map(Number); return `${dd} ${MON[m - 1]}` }

export default function SupervisorToday() {
  const { state, user } = useSignedIn('supervisor')
  const name = user?.name ?? ''
  const scopes = useMemo(() => ownScopes(state.projects, name), [state.projects, name])
  const myRigs = useMemo(() => Array.from(new Set(scopes.flatMap(s => s.rigs))), [scopes])
  const since30 = addDays(TODAY, -30)

  const audits = useMemo(() => auditRecord(state, { since: since30 }), [state, since30])
  const mine = audits.filter(a => a.log.supervisor === name)
  const toFix = mine.filter(a => a.checks.length > 0)
    .sort((a, b) => (b.checks.some(c => c.level === 'stop') ? 1 : 0) - (a.checks.some(c => c.level === 'stop') ? 1 : 0) || b.log.date.localeCompare(a.log.date))
  const stops = toFix.filter(a => a.checks.some(c => c.level === 'stop')).length
  const missing = useMemo(() => missingShifts(state, addDays(TODAY, -7), TODAY).filter(m => myRigs.includes(m.rig))
    .sort((a, b) => b.date.localeCompare(a.date) || a.rig.localeCompare(b.rig)), [state, myRigs])

  const scores = supervisorScores(audits)
  const me = scores.find(s => s.name === name)
  const pct = (s?: { shifts: number; open: number }) => s && s.shifts ? Math.round(((s.shifts - s.open) / s.shifts) * 100) : null
  const myPct = pct(me)
  const all = scores.reduce((a, s) => ({ shifts: a.shifts + s.shifts, open: a.open + s.open }), { shifts: 0, open: 0 })
  const companyPct = pct(all)

  const rigsToday = myRigs.map(rig => {
    const logs = state.shiftLogs.filter(l => l.rig === rig && !l.segmentOf)
    const today = logs.filter(l => l.date === TODAY)
    const last = [...logs].sort((a, b) => `${b.date}${b.shift === 'Night' ? 1 : 0}`.localeCompare(`${a.date}${a.shift === 'Night' ? 1 : 0}`))[0]
    const project = scopes.find(s => s.rigs.includes(rig))?.project ?? ''
    return {
      rig, project, last,
      dayIn: today.some(l => l.shift === 'Day'), nightIn: today.some(l => l.shift === 'Night'),
      metres: today.reduce((s, l) => s + l.metresDrilled, 0),
    }
  })

  if (!user) return null
  const tone: Tone = stops ? 'bad' : toFix.length || missing.length ? 'warn' : 'good'

  return (
    <Page>
      <PageHead question={`Good day, ${name.split(' ')[0]}. What do your rigs need from you?`} tone={tone}
        answer={toFix.length === 0 && missing.length === 0
          ? 'Your logs for the last 30 days agree with the rest of the record, and no shift is missing. Nothing to do but log the next one.'
          : <>
            {stops > 0 && <b style={{ color: T.text }}>{stops} {stops === 1 ? 'log has' : 'logs have'} a figure that cannot be right. </b>}
            {toFix.length - stops > 0 && <>{toFix.length - stops} {toFix.length - stops === 1 ? 'log needs' : 'logs need'} a short reason. </>}
            {missing.length > 0 && <>{missing.length} {missing.length === 1 ? 'shift' : 'shifts'} on your rigs in the last 7 days {missing.length === 1 ? 'has' : 'have'} no log.</>}
          </>}
        right={<Btn href="/supervisor/drilling-log?new=1" kind="primary">New drill log</Btn>} />

      <Grid min={170}>
        <Tile label="Your rigs" value={myRigs.length} note={scopes.map(s => s.project).join(', ') || 'No project assigned yet'} />
        <Tile label="Logs to put right" value={stops} tone={stops ? 'bad' : 'good'} note={stops ? 'Cannot be right as saved' : 'None'} />
        <Tile label="Logs to explain" value={toFix.length - stops} tone={toFix.length - stops ? 'warn' : 'good'} note="Unusual, with no reason given" />
        <Tile label="Shifts not logged" value={missing.length} tone={missing.length ? 'warn' : 'good'} note="Last 7 days, your rigs" />
        <Tile label="Your logs that pass, 30 days" value={myPct == null ? '—' : `${myPct}%`}
          tone={myPct == null ? undefined : myPct >= (companyPct ?? 0) ? 'good' : 'warn'}
          note={companyPct == null ? undefined : `Company: ${companyPct}%`} />
      </Grid>

      <Card title="Your rigs today" subtitle={`${day(TODAY)} · is each shift in the record?`} pad={false}>
        {rigsToday.length === 0 ? <Empty>You are not on a running project yet. The office adds you to a project, and its rigs appear here.</Empty> : (
          <Table>
            <thead><tr>
              <th style={th}>Rig</th><th style={th}>Project</th><th style={th}>Day shift</th><th style={th}>Night shift</th>
              <th style={thR}>Metres today</th><th style={th}>Last log</th><th style={th}></th>
            </tr></thead>
            <tbody>
              {rigsToday.map(r => (
                <tr key={r.rig} style={{ borderTop: rowLine }}>
                  <td style={tdStrong}>{r.rig}</td>
                  <td style={td}>{r.project}</td>
                  <td style={td}>{r.dayIn ? <Status tone="good">Logged</Status> : <Status tone="warn">Not yet</Status>}</td>
                  <td style={td}>{r.nightIn ? <Status tone="good">Logged</Status> : <Status tone="neutral">Not yet</Status>}</td>
                  <td style={tdR}>{r.metres ? `${r.metres} m` : '—'}</td>
                  <td style={td}>{r.last ? <>{day(r.last.date)} {r.last.shift.toLowerCase()}{r.last.holeNumber ? ` · ${r.last.holeNumber} at ${r.last.meterEnd ?? '—'} m` : ''}</> : 'Never logged'}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{!(r.dayIn && r.nightIn) && <Link href="/supervisor/drilling-log?new=1" style={{ color: T.orange, fontWeight: 600, textDecoration: 'none', fontSize: 12.5 }}>Log a shift →</Link>}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card title={`Your logs to look at${toFix.length ? ` · ${toFix.length}` : ''}`} subtitle="Last 30 days. Red cannot be saved as it is; amber needs a short reason. Open the log, and the form shows each check." pad={false}>
        {toFix.length === 0 ? <Empty>Every log you wrote in the last 30 days passes the checks, or has a reason with it.</Empty> : (
          <Table>
            <thead><tr><th style={th}>Shift</th><th style={th}>Rig</th><th style={th}>Hole</th><th style={th}>What the checks say</th><th style={th}></th></tr></thead>
            <tbody>
              {toFix.slice(0, 30).map(a => {
                const stop = a.checks.some(c => c.level === 'stop')
                return (
                  <tr key={a.log.id} style={{ borderTop: rowLine, verticalAlign: 'top' }}>
                    <td style={tdStrong}>{day(a.log.date)} · {a.log.shift}</td>
                    <td style={td}>{a.log.rig}</td>
                    <td style={td}>{a.log.holeNumber ?? '—'}</td>
                    <td style={{ ...td, whiteSpace: 'normal', minWidth: 260 }}>
                      {a.checks.map(c => (
                        <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 3 }}>
                          <Status tone={c.level === 'stop' ? 'bad' : 'warn'}>{c.level === 'stop' ? 'Wrong' : 'Explain'}</Status>
                          <span style={{ color: T.text }}>{c.title}</span>
                        </div>
                      ))}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <Link href={`/supervisor/drilling-log?edit=${encodeURIComponent(a.log.id)}`} style={{ color: stop ? T.red : T.orange, fontWeight: 700, textDecoration: 'none', fontSize: 12.5 }}>{stop ? 'Put it right →' : 'Add a reason →'}</Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Card title={`Shifts with no log${missing.length ? ` · ${missing.length}` : ''}`} subtitle="Your rigs, the last 7 days: the rig logged on the days around it, but not this shift. If the rig did not work, log it as a stop with the reason." pad={false}>
        {missing.length === 0 ? <Empty>No gaps. Every shift on your rigs in the last 7 days has a log.</Empty> : (
          <Table>
            <thead><tr><th style={th}>Date</th><th style={th}>Shift</th><th style={th}>Rig</th><th style={th}>Project</th><th style={th}></th></tr></thead>
            <tbody>
              {missing.slice(0, 20).map(m => (
                <tr key={`${m.rig}${m.date}${m.shift}`} style={{ borderTop: rowLine }}>
                  <td style={tdStrong}>{day(m.date)}</td><td style={td}>{m.shift}</td><td style={td}>{m.rig}</td><td style={td}>{m.project}</td>
                  <td style={{ ...td, textAlign: 'right' }}><Link href="/supervisor/drilling-log?new=1" style={{ color: T.orange, fontWeight: 600, textDecoration: 'none', fontSize: 12.5 }}>Log it →</Link></td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {me && (
        <Card title="Your record, last 30 days" subtitle="The office sees the same figures for every supervisor on Intelligence > Drill log check.">
          <Grid min={140}>
            <Tile label="Shifts you logged" value={me.shifts} />
            <Tile label="Clean first time" value={me.clean} tone="good" />
            <Tile label="Saved with a reason" value={me.explained} />
            <Tile label="Still open" value={me.open} tone={me.open ? 'warn' : 'good'} />
            <Tile label="Logged more than a day late" value={me.late} tone={me.late ? 'warn' : 'good'} />
          </Grid>
        </Card>
      )}
    </Page>
  )
}
