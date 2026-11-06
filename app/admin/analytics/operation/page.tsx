'use client'

import { useMemo } from 'react'
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { operations, operationsInsights } from '../../../../lib/analytics'
import { Page, PageHead, Card, Tile, Grid, Split, Table, Meter, Empty, Legend, Tip, Status, axisTick, gridStroke, th, thR, td, tdR, tdStrong, rowLine, T } from '../../../components/kit'
import { useAnalytics, BoardTabs, FilterBar, rigColour, n0, n1 } from '../shared'

/* OPERATIONS — are the rigs drilling as fast as they should?
 * Speed while the bit is on bottom, metres and core by week, every stop by
 * its reason and whose it was, and speed by ground and core size. */

export default function OperationsDashboard() {
  const { state, f } = useAnalytics()
  const o = useMemo(() => operations(state, f), [state, f])
  const lost = o.ownHours + o.clientHours
  const topStop = Math.max(1, ...o.downtime.map(d => d.hours))
  const onTarget = o.target.reduce((s, t) => s + t.on, 0), targetDays = o.target.reduce((s, t) => s + t.days, 0)

  return (
    <Page>
      <PageHead question="Are the rigs drilling as fast as they should?"
        answer={o.metres > 0
          ? <>{n0(o.metres)} m in {o.days} rig-days {o.s.label}: {o.rop.toFixed(2)} m an hour on bottom, with the bit drilling {Math.round(o.productivePct)}% of shift time.</>
          : <>No metres logged for these filters.</>}
        right={<FilterBar />} />
      <BoardTabs />

      <Grid min={170}>
        <Tile label="Metres drilled" value={`${n0(o.metres)} m`} note={`${o.days ? n1(o.metres / o.days) : 0} m a rig-day`} />
        <Tile label="Metres an hour" value={o.rop.toFixed(2)} note={`${n0(o.drillHours)} h with the bit on bottom`} />
        <Tile label="Core recovery" value={o.metres ? `${o.recoveryPct.toFixed(1)}%` : '—'} tone={o.metres && o.recoveryPct < 90 ? 'warn' : undefined} />
        <Tile label="Stopped hours" value={`${n0(lost)} h`} note={`${n0(o.ownHours)} h your side · ${n0(o.clientHours)} h client side`} />
        {targetDays > 0 && <Tile label="Days on target" value={`${onTarget} of ${targetDays}`} tone={onTarget / targetDays < 0.5 ? 'warn' : 'good'} note="Rig-days at the project's daily target" />}
      </Grid>

      {o.metres === 0 ? <Card><Empty>Nothing drilled in these filters.</Empty></Card> : <>
        <Split>
          <Card title="Metres an hour, week by week" subtitle="Metres drilled ÷ hours the bit was on bottom, per rig.">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={o.ropTrend} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={gridStroke} vertical={false} />
                <XAxis dataKey="week" tick={axisTick} tickLine={false} axisLine={{ stroke: T.border }} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} width={36} />
                <Tooltip content={<Tip unit=" m/h" />} />
                {o.rigs.map((r, i) => <Line key={r} dataKey={r} stroke={rigColour(i)} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />)}
              </LineChart>
            </ResponsiveContainer>
            <Legend items={o.rigs.map((r, i) => ({ color: rigColour(i), label: r, line: true }))} />
          </Card>
          <Card title="Metres and core recovery, week by week" subtitle="Bars are metres; the line is core recovery.">
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={o.metresTrend} margin={{ top: 10, right: 6, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={gridStroke} vertical={false} />
                <XAxis dataKey="week" tick={axisTick} tickLine={false} axisLine={{ stroke: T.border }} />
                <YAxis yAxisId="m" tick={axisTick} tickLine={false} axisLine={false} width={40} />
                <YAxis yAxisId="r" orientation="right" domain={[50, 100]} tick={axisTick} tickLine={false} axisLine={false} width={34} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip content={<Tip names={{ metres: 'Metres', recovery: 'Core recovery %' }} />} />
                <Bar yAxisId="m" dataKey="metres" fill={T.bar} maxBarSize={30} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Line yAxisId="r" dataKey="recovery" stroke={T.orangeD} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
            <Legend items={[{ color: T.bar, label: 'Metres' }, { color: T.orangeD, label: 'Core recovery', line: true }]} />
          </Card>
        </Split>

        <Split>
          <Card title="Stops by reason" subtitle="Every stopped hour in the logs, and whose it was." pad={false}>
            {o.downtime.length === 0 ? <Empty>No stops logged.</Empty> : (
              <Table>
                <thead><tr><th style={th}>Reason</th><th style={th}>Side</th><th style={thR}>Shifts</th><th style={thR}>Hours</th><th style={{ ...th, width: 140 }}>Share</th></tr></thead>
                <tbody>
                  {o.downtime.map(d => (
                    <tr key={`${d.reason}${d.own}`} style={{ borderBottom: rowLine }}>
                      <td style={tdStrong}>{d.reason}</td>
                      <td style={td}><Status tone={d.own ? 'warn' : 'info'}>{d.own ? 'Yours' : 'Client'}</Status></td>
                      <td style={tdR}>{d.times}</td>
                      <td style={tdR}>{n1(d.hours)}</td>
                      <td style={td}><Meter value={d.hours} max={topStop} color={d.own ? T.ownSide : T.clientSide} /></td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          <Card title="Where each rig's hours went" subtitle="Drilling, trips and handling, its own stops, and client stops.">
            <ResponsiveContainer width="100%" height={Math.max(160, o.byRig.length * 46 + 40)}>
              <BarChart data={o.byRig} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={gridStroke} horizontal={false} />
                <XAxis type="number" tick={axisTick} tickLine={false} axisLine={{ stroke: T.border }} tickFormatter={(v: number) => `${v} h`} />
                <YAxis type="category" dataKey="rig" tick={axisTick} tickLine={false} axisLine={false} width={58} />
                <Tooltip content={<Tip unit=" h" names={{ drilling: 'Drilling', other: 'Trips and handling', own: 'Own stops', client: 'Client stops' }} />} />
                <Bar dataKey="drilling" stackId="h" fill={T.green} isAnimationActive={false} />
                <Bar dataKey="other" stackId="h" fill={T.faint} isAnimationActive={false} />
                <Bar dataKey="own" stackId="h" fill={T.ownSide} isAnimationActive={false} />
                <Bar dataKey="client" stackId="h" fill={T.clientSide} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
            <Legend items={[{ color: T.green, label: 'Drilling' }, { color: T.faint, label: 'Trips and handling' }, { color: T.ownSide, label: 'Own stops' }, { color: T.clientSide, label: 'Client stops' }]} />
          </Card>
        </Split>

        <Split>
          <Card title="Speed by ground and core size" subtitle="Metres an hour on bottom, for each ground the drillers logged.">
            {o.byGround.length === 0 ? <Empty>No ground logged.</Empty> : <>
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={o.byGround} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="ground" tick={axisTick} tickLine={false} axisLine={{ stroke: T.border }} />
                  <YAxis tick={axisTick} tickLine={false} axisLine={false} width={36} />
                  <Tooltip content={<Tip unit=" m/h" />} />
                  {o.sizes.map((z, i) => <Bar key={z} dataKey={z} fill={rigColour(i)} maxBarSize={28} radius={[4, 4, 0, 0]} isAnimationActive={false} />)}
                </BarChart>
              </ResponsiveContainer>
              <Legend items={o.sizes.map((z, i) => ({ color: rigColour(i), label: z }))} />
            </>}
          </Card>
          <Card title="Rig by rig" pad={false}>
            <Table>
              <thead><tr><th style={th}>Rig</th><th style={th}>Whose</th><th style={thR}>Days</th><th style={thR}>Metres</th><th style={thR}>m a day</th><th style={thR}>m an hour</th>{targetDays > 0 && <th style={thR}>On target</th>}</tr></thead>
              <tbody>
                {o.byRig.map(r => {
                  const t = o.target.find(x => x.rig === r.rig)
                  return (
                    <tr key={r.rig} style={{ borderBottom: rowLine }}>
                      <td style={tdStrong}>{r.rig}</td><td style={td}>{r.owner}</td><td style={tdR}>{r.days}</td><td style={tdR}>{n1(r.metres)}</td>
                      <td style={tdR}>{n1(r.perDay)}</td><td style={tdR}>{r.rop.toFixed(2)}</td>
                      {targetDays > 0 && <td style={{ ...tdR, color: t && t.on / t.days < 0.5 ? T.amber : undefined }}>{t ? `${t.on} of ${t.days}` : '—'}</td>}
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          </Card>
        </Split>
      </>}
    </Page>
  )
}
