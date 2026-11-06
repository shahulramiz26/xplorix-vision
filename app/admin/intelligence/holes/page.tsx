'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { money, moneyL, monthOf, monthLabel } from '../../../../lib/costing-store'
import { daysBetween } from '../../../../lib/inventory-store'
import { holesFromLogs, downloadCsv, shortDate } from '../../../../lib/client-record'
import type { HoleFinish } from '../../../../lib/forecast'
import {
  T, tint, Page, PageHead, Card, Tile, Grid, Btn, Status, Table, Empty, DepthBar, inputStyle,
  th, thR, td, tdR, tdStrong, rowLine,
} from '../../../components/kit'
import { Timeline, TimelineKey, Basis, type Lane } from '../../../components/outlook'
import { useIntel, IntelTabs, n0, n1 } from '../shared'

/* ==========================================================================
 * HOLE FINISH PREDICTION — when each open hole reaches its planned depth
 *
 * For every hole on a rig: metres left, divided by what that rig has really
 * made a day over its last 30 days, stopped days included. The earliest and
 * latest dates use the rig's best and slowest month on record, so the range
 * is something the rig has actually done.
 *
 * A hole with no planned depth, or already at depth and not closed, or open
 * with no rig on it, cannot be predicted. Those are listed with what to do.
 * ========================================================================== */

const PROBLEM: Record<NonNullable<HoleFinish['problem']>, { word: string; why: string; todo: string; href: string; link: string }> = {
  'no-plan': { word: 'No planned depth', why: 'There is no planned depth on the hole, so there is nothing to count down to.', todo: 'Add the planned depth to the hole.', href: '/admin/projects', link: 'Open projects' },
  'at-depth': { word: 'At planned depth, still open', why: 'The hole has reached its planned depth but nobody has closed it.', todo: 'Close it in the drill log, or raise the planned depth if it is going deeper.', href: '/admin/logs/drill', link: 'Open drill logs' },
  'no-rig': { word: 'Open, no rig on it', why: 'The rig that was drilling it has moved to another hole.', todo: 'Send a rig back to finish it, or agree the shorter depth with the client and close it. An open hole cannot be invoiced.', href: '/admin/logs/drill', link: 'Open drill logs' },
  beyond: { word: 'Beyond the forecast', why: 'At today’s pace it is not finished inside the forecast period.', todo: 'Check the planned depth, or put a second shift on the rig.', href: '/admin/projects', link: 'Open projects' },
}

/* Earliest, expected and latest on one shared time axis. */
function DateRange({ h, from, to }: { h: HoleFinish; from: string; to: string }) {
  if (!h.finish) return <span style={{ color: T.faint }}>—</span>
  const span = Math.max(1, daysBetween(from, to))
  const at = (d: string) => Math.max(0, Math.min(100, (daysBetween(from, d) / span) * 100))
  const lo = h.earliest ?? h.finish, hi = h.latest ?? h.finish
  return (
    <div style={{ minWidth: 190 }} title={`Earliest ${shortDate(lo)}, expected ${shortDate(h.finish)}, latest ${h.latest ? shortDate(hi) : 'beyond the forecast'}`}>
      <div style={{ position: 'relative', height: 14 }}>
        <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 6, height: 2, background: T.line }} />
        <span aria-hidden style={{ position: 'absolute', left: `${at(lo)}%`, width: `${Math.max(1.5, at(hi) - at(lo))}%`, top: 4, height: 6, borderRadius: 3, background: tint(T.bar, 45) }} />
        <span aria-hidden style={{ position: 'absolute', left: `calc(${at(h.finish)}% - 2px)`, top: 0, width: 4, height: 14, borderRadius: 2, background: T.text }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: T.faint, marginTop: 3 }}>
        <span>{shortDate(lo)}</span><span>{h.latest ? shortDate(hi) : 'later'}</span>
      </div>
    </div>
  )
}

export default function HoleFinishPrediction() {
  const { state, f } = useIntel()
  const [project, setProject] = useState('all')
  const all = f.holeFinish.filter(h => project === 'all' || h.project === project)
  const onRig = all.filter(h => h.state === 'drilling')
  const next = all.filter(h => h.state === 'next')
  const stuck = all.filter(h => h.problem && h.problem !== 'beyond')
  const dated = all.filter(h => h.finish)
  const thisMonth = dated.filter(h => monthOf(h.finish!) === f.thisMonth)
  const nextMonth = dated.filter(h => monthOf(h.finish!) === f.nextMonth)
  const first = [...onRig].filter(h => h.finish).sort((a, b) => a.finish!.localeCompare(b.finish!))[0]
  const axisEnd = dated.map(h => h.latest ?? h.finish!).sort().pop() ?? f.horizonEnd
  const projects = Array.from(new Set(f.holeFinish.map(h => h.project)))
  const thisName = monthLabel(f.thisMonth).split(' ')[0], nextName = monthLabel(f.nextMonth).split(' ')[0]

  const done = useMemo(() => holesFromLogs(state).filter(h => h.status !== 'drilling' && h.days > 0 && (project === 'all' || h.project === project)), [state, project])
  const pace = done.map(h => h.drilled / h.days)
  const withPlan = done.filter(h => h.planned)
  const onDepth = withPlan.filter(h => h.drilled >= h.planned! * 0.98).length

  const lanes: Lane[] = f.rigs.filter(r => project === 'all' || r.project === project).map(r => ({
    key: r.rig, label: r.rig, sub: `${r.perDay.toFixed(1)} m a day${r.contractor ? ' · contractor' : ''}`,
    bars: r.segments.map(s => s.kind === 'hole'
      ? { kind: 'work' as const, from: s.from, to: s.to, label: s.hole, ends: s.closes, title: `${s.hole}: ${shortDate(s.from)} to ${shortDate(s.to)}, ${n0(s.metres)} m${s.closes ? `, reaches ${s.planned} m` : ''}` }
      : s.kind === 'move' ? { kind: 'move' as const, from: s.from, to: s.to, title: `Rig move, ${shortDate(s.from)}` }
      : { kind: 'idle' as const, from: s.from, to: s.to, title: `No hole planned from ${shortDate(s.from)}` }),
  }))

  const exportCsv = () => downloadCsv('hole-finish-prediction', [
    ['Hole', 'Project', 'Rig', 'Whose rig', 'State', 'Drilled m', 'Planned m', 'Left m', 'Rig makes a day', 'Starts', 'Earliest finish', 'Expected finish', 'Latest finish', 'Days from today', 'Billable now', 'Billable when finished', 'Note'],
    ...all.map(h => [h.hole, h.project, h.rig, h.contractor ? 'Contractor' : 'Own', h.state === 'drilling' ? 'On a rig' : h.state === 'next' ? 'Next in line' : 'No rig on it',
      n1(h.drilled), h.planned, n1(h.left), h.perDay.toFixed(1), h.starts, h.earliest, h.finish, h.latest, h.daysLeft, Math.round(h.valueNow), Math.round(h.valueAtFinish), h.problem ? PROBLEM[h.problem].word : '']),
  ])

  const status = (h: HoleFinish) => h.problem
    ? <Status tone={h.problem === 'beyond' ? 'neutral' : 'warn'}>{PROBLEM[h.problem].word}</Status>
    : <Status tone={h.daysLeft! <= 7 ? 'good' : 'info'}>{h.daysLeft === 0 ? 'Today' : h.daysLeft === 1 ? 'Tomorrow' : `In ${h.daysLeft} days`}</Status>

  return (
    <Page>
      <IntelTabs />
      <PageHead question="When will each hole be finished?" tone={stuck.length ? 'warn' : 'good'}
        answer={f.rigs.length === 0 ? 'No rig has logged a shift in the last 14 days, so there is nothing to predict from yet.' : <>
          {onRig.length} {onRig.length === 1 ? 'hole is' : 'holes are'} on a rig. {thisMonth.length} should reach planned depth in {thisName} and {nextMonth.length} in {nextName}.{' '}
          {first ? <>The next to finish is <b style={{ color: T.text }}>{first.hole} on {shortDate(first.finish)}</b>. </> : null}
          {stuck.length > 0 && <>{stuck.length} {stuck.length === 1 ? 'hole' : 'holes'} cannot be given a date until something is put right.</>}
        </>}
        right={<Btn size="sm" onClick={exportCsv} disabled={!all.length}>Export</Btn>} />

      {projects.length > 1 && (
        <div>
          <select value={project} aria-label="Project" onChange={e => setProject(e.target.value)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer', fontWeight: 600 }}>
            <option value="all">All projects</option>{projects.map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
      )}

      <Grid min={185}>
        <Tile label="On a rig now" value={onRig.length} note={`${n0(onRig.reduce((s, h) => s + h.left, 0))} m still to drill`} />
        <Tile label={`Finishing in ${thisName}`} value={thisMonth.length} tone={thisMonth.length ? 'good' : undefined} note={thisMonth.length ? `${moneyL(thisMonth.reduce((s, h) => s + h.valueAtFinish, 0))} becomes billable` : 'None reach depth this month'} />
        <Tile label={`Finishing in ${nextName}`} value={nextMonth.length} note={nextMonth.length ? `${moneyL(nextMonth.reduce((s, h) => s + h.valueAtFinish, 0))} becomes billable` : 'None'} />
        <Tile label="Next in line" value={next.length} note={next.length ? `First starts ${shortDate([...next].sort((a, b) => (a.starts ?? '').localeCompare(b.starts ?? ''))[0].starts)}` : 'No planned hole is waiting'} tone={next.length ? undefined : 'warn'} />
        <Tile label="Cannot be dated" value={stuck.length} tone={stuck.length ? 'warn' : 'good'} note={stuck.length ? `${moneyL(stuck.reduce((s, h) => s + h.valueNow, 0))} drilled on them` : 'Every open hole has a date'} />
      </Grid>

      <Card title="Holes on a rig now" pad={false}
        subtitle="Soonest first. The bar runs from the earliest to the latest finish; the mark is the expected date.">
        {onRig.length === 0 ? <Empty>No hole is on a rig at the moment.</Empty> : (
          <Table>
            <thead><tr>
              <th style={th}>Hole</th><th style={th}>Rig</th><th style={th}>Depth</th><th style={thR}>Left</th><th style={thR}>Rig makes a day</th>
              <th style={th}>Expected finish</th><th style={th}>Earliest to latest</th><th style={th}>When</th><th style={thR}>Billable when finished</th>
            </tr></thead>
            <tbody>
              {onRig.map(h => (
                <tr key={h.hole} style={{ borderBottom: rowLine, verticalAlign: 'middle' }}>
                  <td style={{ ...tdStrong, whiteSpace: 'normal' }}>{h.hole}<div style={{ fontSize: 12, color: T.faint, fontWeight: 400 }}>{h.project}</div></td>
                  <td style={td}>{h.rig}{h.contractor && <div style={{ fontSize: 12, color: T.faint }}>Contractor</div>}</td>
                  <td style={td}><DepthBar drilled={h.drilled} planned={h.planned} width={150} /></td>
                  <td style={tdR}>{h.planned ? `${n1(h.left)} m` : '—'}</td>
                  <td style={tdR}>{h.perDay.toFixed(1)} m</td>
                  <td style={{ ...td, color: T.text, fontWeight: 700 }}>{h.finish ? shortDate(h.finish) : '—'}</td>
                  <td style={td}><DateRange h={h} from={f.today} to={axisEnd} /></td>
                  <td style={td}>{status(h)}</td>
                  <td style={{ ...tdR, color: T.text }}>{money(h.valueAtFinish)}<div style={{ fontSize: 11.5, color: T.faint }}>{money(h.valueNow)} so far</div></td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {stuck.length > 0 && (
        <Card title={`Cannot be given a date · ${stuck.length}`} subtitle="Put these right and the hole gets a finish date, and the month forecast gets its metres." pad={false}>
          {stuck.map((h, i) => {
            const p = PROBLEM[h.problem!]
            return (
              <div key={h.hole} style={{ display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', padding: '13px 18px', borderTop: i ? rowLine : undefined }}>
                <div style={{ flex: '1 1 420px', minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}><span aria-hidden style={{ color: T.amber, fontWeight: 800, marginRight: 8 }}>!</span>{h.hole} · {p.word}</div>
                  <div style={{ fontSize: 12.5, color: T.muted, marginTop: 3, paddingLeft: 17, lineHeight: 1.55 }}>
                    {h.project} · {h.rig} · {n1(h.drilled)} m drilled{h.planned ? ` of ${h.planned} m` : ''} · {money(h.valueNow)} drilled and not billable. {p.why} {p.todo}
                  </div>
                </div>
                <Link href={p.href} style={{ fontSize: 13, fontWeight: 600, color: T.orange, whiteSpace: 'nowrap', textDecoration: 'none' }}>{p.link} →</Link>
              </div>
            )
          })}
        </Card>
      )}

      <Card title="Next in line" pad={false}
        subtitle="Planned holes not started yet. Each is taken by the first rig on its project to come free, with one day for the move.">
        {next.length === 0 ? <Empty>No planned hole is waiting. When the holes on the rigs are finished, the rigs stand idle. Add the next holes under Projects.</Empty> : (
          <Table>
            <thead><tr>
              <th style={th}>Hole</th><th style={th}>Rig that takes it</th><th style={thR}>Planned depth</th><th style={th}>Starts</th>
              <th style={th}>Expected finish</th><th style={th}>Earliest to latest</th><th style={thR}>Billable when finished</th>
            </tr></thead>
            <tbody>
              {next.map(h => (
                <tr key={h.hole} style={{ borderBottom: rowLine }}>
                  <td style={{ ...tdStrong, whiteSpace: 'normal' }}>{h.hole}<div style={{ fontSize: 12, color: T.faint, fontWeight: 400 }}>{h.project}</div></td>
                  <td style={td}>{h.rig}{h.contractor && <span style={{ color: T.faint }}> · contractor</span>}</td>
                  <td style={tdR}>{h.planned ? `${n0(h.planned)} m` : '—'}</td>
                  <td style={td}>{shortDate(h.starts)}</td>
                  <td style={{ ...td, color: T.text, fontWeight: 700 }}>{h.finish ? shortDate(h.finish) : `After ${shortDate(f.farEnd)}`}</td>
                  <td style={td}><DateRange h={h} from={f.today} to={axisEnd} /></td>
                  <td style={{ ...tdR, color: T.text }}>{money(h.valueAtFinish)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {lanes.length > 0 && (
        <Card title={`Rig plan to ${shortDate(f.horizonEnd)}`} subtitle="Each rig finishes the hole it is on, then takes the next planned hole on its project.">
          <div style={{ marginBottom: 14 }}><TimelineKey /></div>
          <Timeline lanes={lanes} start={f.horizonStart} end={f.horizonEnd} split={`${f.nextMonth}-01`} splitLabel={`${nextName} starts`} />
        </Card>
      )}

      <Card title="How finished holes went" pad={false}
        subtitle={done.length ? `${done.length} finished holes took between ${Math.min(...pace).toFixed(1)} and ${Math.max(...pace).toFixed(1)} m a day.${withPlan.length ? ` ${onDepth} of ${withPlan.length} with a planned depth reached it.` : ''}` : undefined}>
        {done.length === 0 ? <Empty>No hole has been finished yet.</Empty> : (
          <Table>
            <thead><tr><th style={th}>Hole</th><th style={th}>Project</th><th style={th}>Rig</th><th style={thR}>Planned</th><th style={thR}>Drilled</th><th style={thR}>Days</th><th style={thR}>Metres a day</th><th style={thR}>Days with no metres</th><th style={thR}>Core</th><th style={th}>Finished</th></tr></thead>
            <tbody>
              {done.slice(0, 14).map(h => (
                <tr key={h.id} style={{ borderBottom: rowLine }}>
                  <td style={tdStrong}>{h.id}</td><td style={td}>{h.project}</td><td style={td}>{h.rig}</td>
                  <td style={tdR}>{h.planned ? `${n0(h.planned)} m` : '—'}</td>
                  <td style={{ ...tdR, color: h.planned && h.drilled < h.planned * 0.98 ? T.text : T.muted }}>{n1(h.drilled)} m</td>
                  <td style={tdR}>{h.days}</td>
                  <td style={{ ...tdR, color: T.text, fontWeight: 600 }}>{(h.drilled / h.days).toFixed(1)}</td>
                  <td style={tdR}>{h.standbyDays + h.breakdownDays || '—'}</td>
                  <td style={tdR}>{h.drilled ? `${h.recoveryPct.toFixed(0)}%` : '—'}</td>
                  <td style={td}>{shortDate(h.end)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Basis lines={[
        `Expected finish: metres left on the hole, divided by what its rig has made a day over the last 30 days of logs, with stopped days counted. ${f.rigs.map(r => `${r.rig} ${r.perDay.toFixed(1)}`).join(', ')}.`,
        'Earliest and latest: the same sum using that rig’s best and slowest month on record. A rig with a short record has a narrow range.',
        'Next in line: planned holes on the project, in number order. Each goes to the first rig that comes free, with one day for the move.',
        'Billable when finished: metres already drilled plus the metres to come, at the client rate for the depth and the ground each metre will be drilled in.',
        'A hole needs a planned depth to be given a date. Planned depths are kept under Projects.',
      ]} note="This is a projection from your own drill logs, not a trained model. It moves every time a shift is logged or a hole is planned. Learning from ground and core comes with AI prediction, which is in development." />
    </Page>
  )
}
