'use client'

import { useMemo, useState } from 'react'
import { ResponsiveContainer, ScatterChart, Scatter, ComposedChart, Bar, Line, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip } from 'recharts'
import { crew, crewInsights } from '../../../../lib/analytics'
import { Page, PageHead, Card, Tile, Grid, Split, Table, Empty, Legend, Tip, axisTick, gridStroke, th, thR, td, tdR, tdStrong, rowLine, T } from '../../../components/kit'
import { photoBy } from '../../../../lib/core/photo-summary'
import { useAnalytics, BoardTabs, FilterBar, rigColour, n0, n1 } from '../shared'

/* DRILLERS AND CREW — who is drilling well, and who needs help?
 * Every driller named on a log, on the same measures, and the crew's hours
 * against the hours the bit was turning. */

type Sort = 'metres' | 'rop' | 'perShift' | 'own'

export default function DrillersDashboard() {
  const { state, f } = useAnalytics()
  const c = useMemo(() => crew(state, f), [state, f])
  const photo = useMemo(() => new Map(photoBy(c.s.whole, l => l.driller ?? '').map(g => [g.key, g])), [c.s.whole])
  const [sort, setSort] = useState<Sort>('metres')
  const rows = [...c.drillers].sort((a, b) => sort === 'own' ? a.own / Math.max(1, a.shifts) - b.own / Math.max(1, b.shifts) : b[sort] - a[sort])
  const owners = Array.from(new Set(c.drillers.map(d => d.owner)))
  const util = c.shiftHours ? (c.drillHours / c.shiftHours) * 100 : 0
  const head = (key: Sort, label: string) => (
    <th style={{ ...thR, cursor: 'pointer', color: sort === key ? T.text : undefined }} onClick={() => setSort(key)} aria-sort={sort === key ? 'descending' : undefined}>{label}{sort === key ? ' ↓' : ''}</th>
  )

  return (
    <Page>
      <PageHead question="Who is drilling well, and who needs help?"
        answer={c.drillers.length
          ? <>{c.drillers.length} drillers {c.s.label}. The bit was on bottom {Math.round(util)}% of shift time.</>
          : <>No driller named on the logs for these filters.</>}
        right={<FilterBar />} />
      <BoardTabs />

      <Grid min={170}>
        <Tile label="Drillers" value={c.drillers.length} note={`${c.s.whole.length} shifts`} />
        <Tile label="Crew-shifts" value={n0(c.heads)} note="People on the rig, shift by shift" />
        <Tile label="Shift hours" value={`${n0(c.shiftHours)} h`} />
        <Tile label="Bit on bottom" value={`${Math.round(util)}%`} tone={util < 65 ? 'warn' : 'good'} note={`${n0(c.drillHours)} drilling hours`} />
      </Grid>

      {c.drillers.length === 0 ? <Card><Empty>Nothing to show for these filters.</Empty></Card> : <>
        <Card title="Drillers" subtitle="Click a heading to sort. Core, photos is measured on the tray photos of that driller's shifts. Own stops are hours lost to your side's causes." pad={false}>
          <Table>
            <thead><tr>
              <th style={th}>Driller</th><th style={th}>Rig</th><th style={thR}>Shifts</th>
              {head('metres', 'Metres')}{head('rop', 'm an hour')}{head('perShift', 'm a shift')}<th style={thR} title="What the driller wrote in the drill log">Core, log</th><th style={thR} title="Measured on the tray photos">Core, photos</th><th style={thR}>RQD</th>{head('own', 'Own stops')}
            </tr></thead>
            <tbody>
              {rows.map(d => (
                <tr key={d.name} style={{ borderBottom: rowLine }}>
                  <td style={tdStrong}>{d.name}</td>
                  <td style={td}>{d.rigs.join(', ')}{d.owner !== 'Own' && <span style={{ color: T.faint }}> · {d.owner}</span>}</td>
                  <td style={tdR}>{d.shifts}</td><td style={tdR}>{n1(d.metres)}</td><td style={tdR}>{d.rop.toFixed(2)}</td><td style={tdR}>{n1(d.perShift)}</td>
                  <td style={tdR}>{d.metres ? `${d.recovery.toFixed(1)}%` : '—'}</td>
                  {(() => { const p = photo.get(d.name); return <><td style={{ ...tdR, color: p && p.recovery < 90 ? T.red : T.muted }}>{p ? `${p.recovery.toFixed(1)}%` : '—'}</td><td style={tdR}>{p ? `${p.rqd.toFixed(0)}%` : '—'}</td></> })()}<td style={tdR}>{d.own ? `${n1(d.own)} h` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Split>
          <Card title="Speed against metres" subtitle="Each dot is a driller. Bigger dot: more hours lost to own stops.">
            <ResponsiveContainer width="100%" height={260}>
              <ScatterChart margin={{ top: 10, right: 16, bottom: 10, left: 0 }}>
                <CartesianGrid stroke={gridStroke} />
                <XAxis type="number" dataKey="metres" name="Metres" tick={axisTick} tickLine={false} axisLine={{ stroke: T.border }} tickFormatter={(v: number) => `${v} m`} />
                <YAxis type="number" dataKey="rop" name="m an hour" tick={axisTick} tickLine={false} axisLine={false} width={40} />
                <ZAxis type="number" dataKey="own" range={[60, 420]} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => {
                  const d = active && payload?.[0]?.payload as (typeof rows)[number] | undefined
                  return d ? <div style={{ background: 'var(--x-panel)', border: `1px solid ${T.border}`, borderRadius: 9, padding: '9px 12px', fontSize: 12.5, color: T.text }}>
                    <b>{d.name}</b> · {d.rigs.join(', ')}<br />{n1(d.metres)} m · {d.rop.toFixed(2)} m an hour · {n1(d.own)} h own stops</div> : null
                }} />
                {owners.map((o, i) => <Scatter key={o} name={o} data={c.drillers.filter(d => d.owner === o)} fill={rigColour(i)} fillOpacity={0.75} isAnimationActive={false} />)}
              </ScatterChart>
            </ResponsiveContainer>
            <Legend items={owners.map((o, i) => ({ color: rigColour(i), label: o === 'Own' ? 'Your drillers' : o }))} />
          </Card>
          <Card title="Crew hours, week by week" subtitle="Bars are hours on bottom; the line is the share of shift time drilling.">
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={c.hours} margin={{ top: 10, right: 6, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={gridStroke} vertical={false} />
                <XAxis dataKey="week" tick={axisTick} tickLine={false} axisLine={{ stroke: T.border }} />
                <YAxis yAxisId="h" tick={axisTick} tickLine={false} axisLine={false} width={40} tickFormatter={(v: number) => `${v} h`} />
                <YAxis yAxisId="p" orientation="right" domain={[0, 100]} tick={axisTick} tickLine={false} axisLine={false} width={34} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip content={<Tip names={{ drilling: 'Drilling hours', utilisation: 'On bottom %' }} />} />
                <Bar yAxisId="h" dataKey="drilling" fill={T.bar} maxBarSize={30} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Line yAxisId="p" dataKey="utilisation" stroke={T.orangeD} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
            <Legend items={[{ color: T.bar, label: 'Drilling hours' }, { color: T.orangeD, label: 'Share of shift time on bottom', line: true }]} />
          </Card>
        </Split>
      </>}
    </Page>
  )
}
