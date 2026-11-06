'use client'

import { useMemo } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { safety, safetyInsights } from '../../../../lib/analytics'
import { day } from '../../../../lib/projects'
import { Page, PageHead, Card, Tile, Grid, Split, Table, Meter, Empty, Tip, Status, axisTick, gridStroke, th, td, tdR, tdStrong, rowLine, T } from '../../../components/kit'
import { useAnalytics, BoardTabs, FilterBar, n0 } from '../shared'

/* HEALTH AND SAFETY — is everyone working safely?
 * Every incident and near miss the supervisors logged on a drill log. */

export default function SafetyDashboard() {
  const { state, f } = useAnalytics()
  const x = useMemo(() => safety(state, f), [state, f])
  const topType = Math.max(1, ...x.byType.map(t => t.value))
  const sevTone = (s: string) => /high|serious|major|critical/i.test(s) ? 'bad' as const : /medium|moderate/i.test(s) ? 'warn' as const : 'info' as const

  return (
    <Page>
      <PageHead question="Is everyone working safely?" tone={x.incidents.some(i => sevTone(i.severity) === 'bad') ? 'bad' : x.incidents.length ? 'warn' : 'neutral'}
        answer={x.shifts
          ? <>{x.incidents.length ? `${x.incidents.length} ${x.incidents.length === 1 ? 'incident' : 'incidents'}` : 'No incidents'} logged in {n0(x.shifts)} shifts {x.s.label}.</>
          : <>No shifts logged for these filters.</>}
        right={<FilterBar />} />
      <BoardTabs />

      <Grid min={170}>
        <Tile label="Incidents and near misses" value={x.incidents.length} tone={x.incidents.length ? 'warn' : undefined} />
        <Tile label="Serious" value={x.incidents.filter(i => sevTone(i.severity) === 'bad').length} tone={x.incidents.some(i => sevTone(i.severity) === 'bad') ? 'bad' : undefined} />
        <Tile label="Shifts worked" value={n0(x.shifts)} note={`${n0(x.crewShifts)} crew-shifts`} />
        <Tile label="Per 100 shifts" value={x.shifts ? (x.incidents.length / x.shifts * 100).toFixed(1) : '—'} />
      </Grid>

      {x.incidents.length === 0 ? <Card><Empty>No incident or near miss is logged for these filters. Supervisors add them on the drill log, under Incidents.</Empty></Card> : <>
        <Split>
          <Card title="By type" pad={false}>
            <Table>
              <tbody>
                {x.byType.map(t => (
                  <tr key={t.name} style={{ borderBottom: rowLine }}>
                    <td style={tdStrong}>{t.name}</td><td style={{ ...td, width: '45%' }}><Meter value={t.value} max={topType} color={T.amber} /></td><td style={tdR}>{t.value}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
          <Card title="By severity" pad={false}>
            <Table>
              <tbody>
                {x.bySeverity.map(t => (
                  <tr key={t.name} style={{ borderBottom: rowLine }}>
                    <td style={td}><Status tone={sevTone(t.name)}>{t.name}</Status></td><td style={tdR}>{t.value}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </Split>
        <Card title="Week by week">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={x.trend} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={gridStroke} vertical={false} />
              <XAxis dataKey="week" tick={axisTick} tickLine={false} axisLine={{ stroke: T.border }} />
              <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} width={30} />
              <Tooltip content={<Tip names={{ incidents: 'Incidents' }} />} />
              <Bar dataKey="incidents" fill={T.amber} maxBarSize={30} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Every incident" subtitle="Newest first." pad={false}>
          <Table>
            <thead><tr><th style={th}>Date</th><th style={th}>Rig</th><th style={th}>Shift</th><th style={th}>Type</th><th style={th}>Severity</th><th style={th}>What happened</th></tr></thead>
            <tbody>
              {x.incidents.map(i => (
                <tr key={i.id} style={{ borderBottom: rowLine }}>
                  <td style={tdStrong}>{day(i.date)}</td><td style={td}>{i.rig}</td><td style={td}>{i.shift}</td><td style={td}>{i.type}</td>
                  <td style={td}><Status tone={sevTone(i.severity)}>{i.severity}</Status></td><td style={{ ...td, whiteSpace: 'normal' }}>{i.note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </>}
    </Page>
  )
}
