'use client'

import { useMemo } from 'react'
import { ResponsiveContainer, BarChart, Bar, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { maintenance, maintenanceInsights } from '../../../../lib/analytics'
import { money } from '../../../../lib/costing-store'
import { Page, PageHead, Card, Tile, Grid, Split, Table, Meter, Empty, Legend, Tip, axisTick, gridStroke, th, thR, td, tdR, tdStrong, rowLine, T } from '../../../components/kit'
import { useAnalytics, BoardTabs, FilterBar, n0, n1 } from '../shared'

/* MAINTENANCE — what keeps breaking, and what does it cost?
 * From the maintenance logs, set beside the hours each rig stood for its
 * own mechanical stops in the drill logs. */

export default function MaintenanceDashboard() {
  const { state, f } = useAnalytics()
  const x = useMemo(() => maintenance(state, f), [state, f])
  const topComp = Math.max(1, ...x.components.map(c => c.count))
  const oil = x.byRig.filter(r => r.engineOil + r.hydraulicOil + r.transmissionOil > 0)

  return (
    <Page>
      <PageHead question="What keeps breaking, and what does it cost?"
        answer={x.m.length
          ? <>{x.m.length} maintenance {x.m.length === 1 ? 'log' : 'logs'} {x.s.label}: {n0(x.hours)} hours and {money(x.cost)} in service cost, {x.breakdowns} of {x.m.length === 1 ? 'it a breakdown' : 'them breakdowns'}.</>
          : <>No maintenance logged for these filters.</>}
        right={<FilterBar />} />
      <BoardTabs />

      <Grid min={170}>
        <Tile label="Maintenance logs" value={x.m.length} note={`${x.breakdowns} ${x.breakdowns === 1 ? "breakdown" : "breakdowns"}`} tone={x.breakdowns && x.breakdowns === x.m.length ? 'warn' : undefined} />
        <Tile label="Hours in the workshop" value={`${n0(x.hours)} h`} />
        <Tile label="Service cost" value={money(x.cost)} note="Parts are costed from inventory" />
        <Tile label="Own mechanical stops" value={`${n0(x.byRig.reduce((s, r) => s + r.stopHours, 0))} h`} note="From the drill logs" />
      </Grid>

      {x.m.length === 0 && x.byRig.every(r => r.stopHours === 0) ? <Card><Empty>Nothing to show for these filters.</Empty></Card> : <>
        <Split>
          <Card title="By type" subtitle="How many, how long, and what it cost.">
            {x.types.length === 0 ? <Empty>No maintenance logged.</Empty> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={x.types} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="type" tick={axisTick} tickLine={false} axisLine={{ stroke: T.border }} />
                  <YAxis tick={axisTick} tickLine={false} axisLine={false} width={40} tickFormatter={(v: number) => `${v} h`} />
                  <Tooltip content={<Tip unit=" h" names={{ hours: 'Hours' }} />} />
                  <Bar dataKey="hours" fill={T.bar} maxBarSize={44} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
          <Card title="Hours and cost, week by week" subtitle="Bars are hours; the line is service cost.">
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={x.trend} margin={{ top: 10, right: 6, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={gridStroke} vertical={false} />
                <XAxis dataKey="week" tick={axisTick} tickLine={false} axisLine={{ stroke: T.border }} />
                <YAxis yAxisId="h" tick={axisTick} tickLine={false} axisLine={false} width={36} />
                <YAxis yAxisId="c" orientation="right" tick={axisTick} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => `SAR ${Math.round(v / 1000)}k`} />
                <Tooltip content={<Tip names={{ hours: 'Hours', cost: 'Cost SAR' }} />} />
                <Bar yAxisId="h" dataKey="hours" fill={T.bar} maxBarSize={30} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Line yAxisId="c" dataKey="cost" stroke={T.orangeD} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
            <Legend items={[{ color: T.bar, label: 'Hours' }, { color: T.orangeD, label: 'Service cost', line: true }]} />
          </Card>
        </Split>

        <Split>
          <Card title="What failed" subtitle="Each component named on a maintenance log." pad={false}>
            {x.components.length === 0 ? <Empty>No components logged.</Empty> : (
              <Table>
                <thead><tr><th style={th}>Component</th><th style={thR}>Times</th><th style={thR}>Hours</th><th style={thR}>Cost</th><th style={{ ...th, width: 120 }} /></tr></thead>
                <tbody>
                  {x.components.map(c => (
                    <tr key={c.component} style={{ borderBottom: rowLine }}>
                      <td style={tdStrong}>{c.component}</td><td style={tdR}>{c.count}</td><td style={tdR}>{n1(c.hours)}</td><td style={tdR}>{money(c.cost)}</td>
                      <td style={td}><Meter value={c.count} max={topComp} color={T.red} /></td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          <Card title="Rig by rig" subtitle="Days between breakdowns counts each run of breakdown days once." pad={false}>
            <Table>
              <thead><tr><th style={th}>Rig</th><th style={thR}>Logs</th><th style={thR}>Workshop h</th><th style={thR}>Own stops h</th><th style={thR}>Service cost</th><th style={thR}>Days between breakdowns</th></tr></thead>
              <tbody>
                {x.byRig.map(r => (
                  <tr key={r.rig} style={{ borderBottom: rowLine }}>
                    <td style={tdStrong}>{r.rig}{r.owner !== 'Own' && <span style={{ color: T.faint, fontWeight: 400 }}> · {r.owner}</span>}</td>
                    <td style={tdR}>{r.logs}</td><td style={tdR}>{n1(r.hours)}</td><td style={tdR}>{n1(r.stopHours)}</td><td style={tdR}>{money(r.cost)}</td>
                    <td style={tdR}>{r.mtbfDays != null ? n1(r.mtbfDays) : 'None logged'}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </Split>

        <Card title="Oil used" subtitle="Litres from the maintenance logs.">
          {oil.length === 0 ? <Empty>No oil logged.</Empty> : <>
            <ResponsiveContainer width="100%" height={Math.max(140, oil.length * 44 + 40)}>
              <BarChart data={oil} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={gridStroke} horizontal={false} />
                <XAxis type="number" tick={axisTick} tickLine={false} axisLine={{ stroke: T.border }} tickFormatter={(v: number) => `${v} L`} />
                <YAxis type="category" dataKey="rig" tick={axisTick} tickLine={false} axisLine={false} width={58} />
                <Tooltip content={<Tip unit=" L" names={{ engineOil: 'Engine', hydraulicOil: 'Hydraulic', transmissionOil: 'Transmission' }} />} />
                <Bar dataKey="engineOil" stackId="o" fill={T.bar} isAnimationActive={false} />
                <Bar dataKey="hydraulicOil" stackId="o" fill={T.orangeD} isAnimationActive={false} />
                <Bar dataKey="transmissionOil" stackId="o" fill={T.faint} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
            <Legend items={[{ color: T.bar, label: 'Engine' }, { color: T.orangeD, label: 'Hydraulic' }, { color: T.faint, label: 'Transmission' }]} />
          </>}
        </Card>
      </>}
    </Page>
  )
}
