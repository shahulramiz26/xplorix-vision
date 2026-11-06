'use client'

import { useMemo } from 'react'
import { ResponsiveContainer, BarChart, Bar, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { consumables, consumablesInsights } from '../../../../lib/analytics'
import { money } from '../../../../lib/costing-store'
import { Page, PageHead, Card, Tile, Grid, Split, Table, Meter, Empty, Legend, Tip, Status, axisTick, gridStroke, th, thR, td, tdR, tdStrong, rowLine, T } from '../../../components/kit'
import { useAnalytics, BoardTabs, FilterBar, n0, n1 } from '../shared'

/* CONSUMABLES — where are fuel, water, additives and parts going?
 * Your own rigs only: a contractor's fuel and parts are his. The cost split
 * is the same day costing Finance uses. */

export default function ConsumablesDashboard() {
  const { state, inv, f } = useAnalytics()
  const c = useMemo(() => consumables(state, inv, f), [state, inv, f])
  const total = c.costRows.reduce((s, r) => s + r.value, 0)
  const topPart = Math.max(1, ...c.parts.map(p => p.cost))

  return (
    <Page>
      <PageHead question="Where are fuel, water, additives and parts going?"
        answer={c.ownMetres > 0
          ? <>Your rigs drilled {n0(c.ownMetres)} m {c.s.label} on {n0(c.fuel)} litres of fuel: {n1(c.fuel / c.ownMetres)} litres a metre.</>
          : <>None of your own rigs drilled in these filters.</>}
        right={<FilterBar />} />
      <BoardTabs />

      <Grid min={170}>
        <Tile label="Fuel" value={`${n0(c.fuel)} L`} note={c.ownMetres ? `${n1(c.fuel / c.ownMetres)} L a metre` : undefined} />
        <Tile label="Water" value={`${n0(c.water)} L`} note={c.ownMetres ? `${n0(c.water / c.ownMetres)} L a metre` : undefined} />
        <Tile label="Additives" value={`${n0(c.additives)} kg`} note={c.ownMetres ? `${n1(c.additives / c.ownMetres)} kg a metre` : undefined} />
        <Tile label="Parts used up" value={money(c.partsCost)} note="At catalogue price, from the drill logs" />
      </Grid>

      <Split>
        <Card title="Where the money went" subtitle={total ? `${money(total)} ${c.s.label}, from the same day costing as Finance.` : 'From the same day costing as Finance.'} pad={false}>
          {c.costRows.length === 0 ? <Empty>No cost in these filters. Set rig and operating costs in Finance.</Empty> : (
            <Table>
              <tbody>
                {c.costRows.map(r => (
                  <tr key={r.name} style={{ borderBottom: rowLine }}>
                    <td style={tdStrong}>{r.name}</td>
                    <td style={{ ...td, width: '40%' }}><Meter value={r.value} max={c.costRows[0].value} color={r.name === 'Contractors' ? T.clientSide : T.bar} /></td>
                    <td style={tdR}>{Math.round((r.value / total) * 100)}%</td>
                    <td style={{ ...tdR, color: T.text }}>{money(r.value)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card title="Fuel, week by week" subtitle="Bars are litres; the line is litres a metre.">
          {c.fuel === 0 ? <Empty>No fuel logged.</Empty> : <>
            <ResponsiveContainer width="100%" height={230}>
              <ComposedChart data={c.fluids} margin={{ top: 10, right: 6, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={gridStroke} vertical={false} />
                <XAxis dataKey="week" tick={axisTick} tickLine={false} axisLine={{ stroke: T.border }} />
                <YAxis yAxisId="f" tick={axisTick} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => `${n0(v)}`} />
                <YAxis yAxisId="m" orientation="right" tick={axisTick} tickLine={false} axisLine={false} width={34} />
                <Tooltip content={<Tip names={{ fuel: 'Fuel L', fuelPerMetre: 'Litres a metre' }} />} />
                <Bar yAxisId="f" dataKey="fuel" fill={T.bar} maxBarSize={30} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Line yAxisId="m" dataKey="fuelPerMetre" stroke={T.orangeD} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
            <Legend items={[{ color: T.bar, label: 'Fuel, litres' }, { color: T.orangeD, label: 'Litres a metre', line: true }]} />
          </>}
        </Card>
      </Split>

      <Card title="Rig by rig" subtitle="Per metre drilled, so a busy rig and a quiet one compare fairly." pad={false}>
        {c.byRig.length === 0 ? <Empty>No own rig in these filters.</Empty> : (
          <Table>
            <thead><tr><th style={th}>Rig</th><th style={thR}>Metres</th><th style={thR}>Fuel L</th><th style={thR}>L a metre</th><th style={thR}>Water L</th><th style={thR}>L a metre</th><th style={thR}>Additives kg</th><th style={thR}>kg a metre</th></tr></thead>
            <tbody>
              {c.byRig.map(r => (
                <tr key={r.rig} style={{ borderBottom: rowLine }}>
                  <td style={tdStrong}>{r.rig}</td><td style={tdR}>{n1(r.metres)}</td>
                  <td style={tdR}>{n0(r.fuel)}</td><td style={{ ...tdR, color: T.text }}>{n1(r.fuelPerMetre)}</td>
                  <td style={tdR}>{n0(r.water)}</td><td style={tdR}>{n0(r.waterPerMetre)}</td>
                  <td style={tdR}>{n0(r.additives)}</td><td style={tdR}>{r.additivesPerMetre.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Split>
        <Card title="Parts used up" subtitle="Parts the drillers logged as finished, at catalogue price." pad={false}>
          {c.parts.length === 0 ? <Empty>No part logged as used. Drillers add them under Accessories on the drill log.</Empty> : (
            <Table>
              <thead><tr><th style={th}>Part</th><th style={thR}>Units</th><th style={thR}>Cost</th><th style={{ ...th, width: 120 }} /></tr></thead>
              <tbody>
                {c.parts.map(p => (
                  <tr key={p.itemId} style={{ borderBottom: rowLine }}>
                    <td style={tdStrong}>{p.name}</td><td style={tdR}>{p.qty}</td><td style={tdR}>{money(p.cost)}</td>
                    <td style={td}><Meter value={p.cost} max={topPart} color={T.purple} /></td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card title="Parts used up, week by week">
          {c.partsCost === 0 ? <Empty>Nothing logged.</Empty> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={c.partsTrend} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={gridStroke} vertical={false} />
                <XAxis dataKey="week" tick={axisTick} tickLine={false} axisLine={{ stroke: T.border }} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => `SAR ${Math.round(v / 1000)}k`} />
                <Tooltip content={<Tip names={{ cost: 'Cost SAR' }} />} />
                <Bar dataKey="cost" fill={T.purple} maxBarSize={30} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </Split>

      <Split>
        <Card title="Stock on the rigs" subtitle="Starting kit and issues, less what the drill logs say was used up. Parts used or at their minimum." pad={false}>
          {c.stock.length === 0 ? <Empty>Nothing used up or running low.</Empty> : (
            <Table>
              <thead><tr><th style={th}>Rig</th><th style={th}>Part</th><th style={thR}>Used</th><th style={thR}>On the rig</th><th style={thR}>Minimum</th><th style={th}>State</th></tr></thead>
              <tbody>
                {c.stock.map(s => (
                  <tr key={`${s.rig}${s.name}`} style={{ borderBottom: rowLine }}>
                    <td style={tdStrong}>{s.rig}</td><td style={td}>{s.name}</td><td style={tdR}>{s.used}</td><td style={{ ...tdR, color: T.text }}>{s.onRig}</td><td style={tdR}>{s.min}</td>
                    <td style={td}><Status tone={s.onRig <= 0 ? 'bad' : s.onRig <= s.min ? 'warn' : 'good'}>{s.onRig <= 0 ? 'None left' : s.onRig <= s.min ? 'Low' : 'Enough'}</Status></td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card title="Equipment hours" subtitle="Hours of equipment named on the drill logs.">
          {c.equipment.length === 0 ? <Empty>No equipment logged. Drillers can add it under Equipment Used.</Empty> : (
            <ResponsiveContainer width="100%" height={Math.max(140, c.equipment.length * 36 + 40)}>
              <BarChart data={c.equipment} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={gridStroke} horizontal={false} />
                <XAxis type="number" tick={axisTick} tickLine={false} axisLine={{ stroke: T.border }} tickFormatter={(v: number) => `${v} h`} />
                <YAxis type="category" dataKey="name" tick={axisTick} tickLine={false} axisLine={false} width={120} />
                <Tooltip content={<Tip unit=" h" names={{ hours: 'Hours' }} />} />
                <Bar dataKey="hours" fill={T.teal} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </Split>
    </Page>
  )
}
