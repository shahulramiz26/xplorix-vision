'use client'

import { ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts'
import { money } from '../../lib/costing-store'
import { day } from '../../lib/projects'
import type { BudgetView, ScheduleView } from '../../lib/plan'
import { TODAY } from '../../lib/inventory-store'
import { T, Card, Legend, Tip, Meter, Empty, Status, axisTick, gridStroke, display, toneColor, num } from './kit'

/* ==========================================================================
 * PLAN AGAINST ACTUAL, ON THE PROJECT
 *
 *   ScheduleCard   metres drilled against the planned line, to date
 *   BudgetCard     cost so far against the budget, and a metre's cost
 *                  against what a metre should cost
 * ========================================================================== */

const n0 = (v: number) => Math.round(v).toLocaleString('en-US')
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const short = (d: string) => `${Number(d.slice(8))} ${MON[Number(d.slice(5, 7)) - 1]}`
const dayN = (d: string) => Math.round(new Date(`${d}T00:00:00Z`).getTime() / 86400000)
const fromN = (n: number) => short(new Date(n * 86400000).toISOString().slice(0, 10))

export function ScheduleCard({ s, onSetPlan }: { s: ScheduleView; onSetPlan?: () => void }) {
  const tone = s.ahead == null ? 'neutral' : s.ahead >= 0 ? 'good' : s.ahead > -0.1 * (s.plannedByToday ?? 0) ? 'warn' : 'bad'
  const subtitle = s.ahead == null
    ? `${n0(s.actual)} m drilled. Set a planned end date, or a daily target with rigs on the project, to draw the plan.`
    : `${n0(s.actual)} m drilled against ${n0(s.plannedByToday ?? 0)} m planned by today: ${s.ahead >= 0 ? `${n0(s.ahead)} m ahead` : `${n0(-s.ahead)} m behind`}.`
  const data = s.points.map(p => ({ n: dayN(p.date), planned: p.planned, actual: p.actual }))
  return (
    <Card title="Plan against actual" subtitle={subtitle}
      right={s.ahead != null ? <Status tone={tone}>{s.ahead >= 0 ? 'Ahead of plan' : 'Behind plan'}</Status> : onSetPlan ? <button onClick={onSetPlan} style={{ background: 'none', border: 'none', color: T.orange, fontWeight: 600, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Set the plan</button> : undefined}>
      {!data.length ? <Empty>No dates to draw yet.</Empty> : <>
        <ResponsiveContainer width="100%" height={250}>
          <ComposedChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={gridStroke} vertical={false} />
            <XAxis dataKey="n" type="number" domain={['dataMin', 'dataMax']} tick={axisTick} tickLine={false} axisLine={{ stroke: T.border }} tickFormatter={fromN} minTickGap={28} />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => `${n0(v)} m`} />
            <Tooltip content={<Tip unit=" m" fmt={fromN} names={{ planned: 'Planned', actual: 'Drilled' }} />} />
            {s.target > 0 && <ReferenceLine y={s.target} stroke={T.muted} strokeDasharray="4 3" label={{ value: `${n0(s.target)} m planned`, fill: T.faint, fontSize: 11, position: 'insideTopLeft' }} />}
            <ReferenceLine x={dayN(TODAY)} stroke={T.faint} strokeDasharray="2 3" label={{ value: 'Today', fill: T.faint, fontSize: 11, position: 'insideTopRight' }} />
            <Line dataKey="planned" stroke={T.muted} strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls isAnimationActive={false} />
            <Area dataKey="actual" stroke={T.orange} fill={T.orange} fillOpacity={0.12} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <Legend items={[{ color: T.muted, label: s.planBasis === 'daily-target' ? 'Planned, at the daily target' : 'Planned', line: true, dash: true }, { color: T.orange, label: 'Drilled' }]} />
          <span style={{ fontSize: 12, color: T.faint }}>
            {s.plannedEnd ? `Plan ends ${day(s.plannedEnd)}` : 'No planned end'}
            {s.target > 0 && s.actual >= s.target ? ' · all the planned metres are drilled'
              : s.ratePerDay > 0 ? ` · at ${s.ratePerDay.toFixed(1)} m a day (last 30 days) the planned metres are reached ${s.expectedFinish ? day(s.expectedFinish) : '—'}` : ''}
          </span>
        </div>
      </>}
    </Card>
  )
}

export function BudgetCard({ b, onSet }: { b: BudgetView; onSet?: () => void }) {
  if (!b.set) {
    return (
      <Card title="Budget" right={onSet ? <button onClick={onSet} style={{ background: 'none', border: 'none', color: T.orange, fontWeight: 600, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Set a budget</button> : undefined}>
        <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.55 }}>
          No budget yet. So far {n0(b.metres)} m have cost {money(b.spent)}{b.metres ? `, ${money(b.cpm)} a metre` : ''}. Set a total and a cost per metre to see both against the budget. The client never sees it.
        </div>
      </Card>
    )
  }
  const big = (label: string, value: string, note: string, color?: string) => (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: T.faint, marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, ...num, color: color ?? T.text, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 12, color: T.faint, marginTop: 5, lineHeight: 1.4 }}>{note}</div>
    </div>
  )
  const over = b.overPerMetre ?? 0
  const perColor = b.budgetPerMetre && b.metres ? (over > 0 ? (over / b.budgetPerMetre > 0.1 ? T.red : T.amber) : T.green) : undefined
  const atEnd = b.atCompletion
  const endColor = b.budgetTotal && atEnd ? (atEnd > b.budgetTotal * 1.1 ? T.red : atEnd > b.budgetTotal ? T.amber : T.green) : undefined
  return (
    <Card title="Budget against actual" subtitle={`${b.verdict} Your own figures: never shown to the client, a contractor or a supervisor.`}
      right={<span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
        <Status tone={b.tone}>{b.tone === 'good' ? 'Within budget' : b.tone === 'neutral' ? 'Not started' : 'Over budget'}</Status>
        {onSet && <button onClick={onSet} style={{ background: 'none', border: 'none', color: T.orange, fontWeight: 600, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Change</button>}
      </span>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 18 }}>
        {big('Cost per metre', b.metres ? money(b.cpm) : '—', b.budgetPerMetre ? `budget ${money(b.budgetPerMetre)}${b.metres ? ` · ${over > 0 ? `${money(over)} over` : `${money(-over)} under`}` : ''}` : 'no budget per metre set', perColor)}
        {big('Spent so far', money(b.spent), b.budgetTotal ? `of ${money(b.budgetTotal)} · ${(b.spentPct ?? 0).toFixed(1)}%` : 'no total budget set')}
        {big('Drilled', `${n0(b.metres)} m`, b.target ? `of ${n0(b.target)} m · ${(b.donePct ?? 0).toFixed(1)}%` : 'no planned metres')}
        {big('At this cost per metre, the whole project', atEnd ? money(atEnd) : '—', b.budgetTotal && atEnd ? `${atEnd > b.budgetTotal ? `${money(atEnd - b.budgetTotal)} over` : `${money(b.budgetTotal - atEnd)} under`} the ${money(b.budgetTotal)} budget` : 'needs metres drilled and planned', endColor)}
      </div>
      {b.budgetTotal ? (
        <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 54px', gap: 10, alignItems: 'center', fontSize: 12, color: T.muted }}>
            <span>Money spent</span><Meter value={b.spent} max={b.budgetTotal} color={(b.spentPct ?? 0) > (b.donePct ?? 0) + 5 ? T.amber : T.blue} /><span style={{ textAlign: 'right' }}>{(b.spentPct ?? 0).toFixed(0)}%</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 54px', gap: 10, alignItems: 'center', fontSize: 12, color: T.muted }}>
            <span>Metres drilled</span><Meter value={b.metres} max={b.target || 1} color={T.green} /><span style={{ textAlign: 'right' }}>{(b.donePct ?? 0).toFixed(0)}%</span>
          </div>
          <div style={{ fontSize: 11.5, color: (b.spentPct ?? 0) > (b.donePct ?? 0) + 5 ? toneColor.warn : T.faint }}>
            {(b.spentPct ?? 0) > (b.donePct ?? 0) + 5 ? 'Money is being spent faster than the metres are being drilled.' : 'Money and metres are moving together.'}
          </div>
        </div>
      ) : null}
    </Card>
  )
}
