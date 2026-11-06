'use client'

import { ForecastCheck, useLearning } from '../../../components/ai-learn'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { money, moneyL, monthLabel, monthOf } from '../../../../lib/costing-store'
import { daysBetween } from '../../../../lib/inventory-store'
import { shortDate } from '../../../../lib/client-record'
import type { Forecast, PartNeed, PeriodNumbers } from '../../../../lib/forecast'
import {
  T, tint, display, Page, PageHead, Card, Tile, Grid, Split, Seg, Status, Table, Empty,
  th, thR, td, tdR, tdStrong, rowLine, type Tone, num, eyebrow } from '../../../components/kit'
import { Timeline, TimelineKey, RangeBar, Basis, type Lane } from '../../../components/outlook'
import { ForecastBars, Waterfall, Tornado, WarningCard, shortMoney, type Metric } from '../../../components/outlook-charts'
import { monthSeries, bridge, levers, whatIf, earlyWarnings, type WhatIf } from '../../../../lib/outlook-analytics'
import { buildRiskRegister } from '../../../../lib/intelligence'
import { useIntel, IntelTabs, n0 } from '../shared'

/* ==========================================================================
 * THIS MONTH AND NEXT — how the month will close, and what follows it
 *
 *   This month   what the logs already say, plus the days still to come
 *   Next month   the same walk carried on: metres, billing, cost, parts
 *
 * Both come from one walk forward from today, rig by rig, hole by hole. The
 * range on every figure is each rig's slowest and best month on record.
 * ========================================================================== */

type Tab = 'this' | 'next'

function lanesOf(f: Forecast): Lane[] {
  return f.rigs.map(r => ({
    key: r.rig, label: r.rig, sub: `${r.project.split(' - ')[0]} · ${r.perDay.toFixed(1)} m a day`,
    bars: r.segments.map(s => s.kind === 'hole'
      ? { kind: 'work' as const, from: s.from, to: s.to, label: s.hole, ends: s.closes,
          title: `${s.hole}: ${shortDate(s.from)} to ${shortDate(s.to)}, ${n0(s.metres)} m${s.closes ? `, reaches ${s.planned} m planned depth` : ''}` }
      : s.kind === 'move' ? { kind: 'move' as const, from: s.from, to: s.to, title: `Rig move, ${shortDate(s.from)}` }
      : { kind: 'idle' as const, from: s.from, to: s.to, title: `No hole planned from ${shortDate(s.from)}: ${s.days} days idle` }),
  }))
}

/* Metres a day: solid for what is logged, light for what is forecast. */
function DailyChart({ days, today }: { days: Forecast['daily']; today: string }) {
  const top = Math.max(1, ...days.map(d => d.metres))
  const logged = days.filter(d => !d.forecast)
  return (
    <>
      <div role="img" aria-label={`Metres a day. ${logged.length} days logged, ${days.length - logged.length} forecast.`}
        style={{ display: 'grid', gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`, gap: 3, alignItems: 'end', height: 150 }}>
        {days.map(d => (
          <div key={d.date} title={`${shortDate(d.date)}: ${Math.round(d.metres)} m${d.forecast ? ' forecast' : ' logged'}`} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
            <div style={{
              height: `${(d.metres / top) * 100}%`, minHeight: 2, borderRadius: '3px 3px 0 0',
              background: d.forecast ? tint(T.bar, 30) : d.metres ? T.bar : tint(T.amber, 60),
              border: d.forecast ? `1px dashed ${tint(T.bar, 70)}` : undefined, borderBottom: 'none',
              outline: d.date === today ? `2px solid ${T.text}` : undefined, outlineOffset: 1,
            }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`, gap: 3, marginTop: 5 }}>
        {days.map(d => <div key={d.date} style={{ fontSize: 10, color: d.date === today ? T.text : T.faint, fontWeight: d.date === today ? 700 : 400, textAlign: 'center' }}>{Number(d.date.slice(8))}</div>)}
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: T.muted, marginTop: 12 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><span aria-hidden style={{ width: 14, height: 10, borderRadius: 2, background: T.bar }} />Logged</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><span aria-hidden style={{ width: 14, height: 10, borderRadius: 2, background: tint(T.bar, 30), border: `1px dashed ${tint(T.bar, 70)}` }} />Forecast</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><span aria-hidden style={{ width: 14, height: 4, borderRadius: 2, background: tint(T.amber, 60) }} />A day with shifts and no metres</span>
      </div>
    </>
  )
}

function MetresTile({ label, value, low, high }: { label: string; value: number; low: number; high: number }) {
  return (
    <div style={{ padding: '14px 16px', background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, minWidth: 0 }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: T.faint, marginBottom: 7 }}>{label}</div>
      <div style={{ fontSize: 23, fontWeight: 600, color: T.text, ...num, lineHeight: 1.1 }}>{n0(value)} m</div>
      {high - low < 1
        ? <div style={{ fontSize: 12, color: T.faint, marginTop: 8, lineHeight: 1.45 }}>The same at the slowest and the best pace: the planned holes run out first.</div>
        : <div style={{ marginTop: 10 }}><RangeBar low={low} mid={value} high={high} unit=" m" /></div>}
    </div>
  )
}

const change = (now: number, before: number) => before ? ((now - before) / before) * 100 : 0
const changeWords = (pct: number, than: string) => Math.abs(pct) < 3 ? `About the same as ${than}` : `${Math.abs(Math.round(pct))}% ${pct > 0 ? 'more' : 'less'} than ${than}`

function ThisMonth({ f }: { f: Forecast }) {
  const name = monthLabel(f.thisMonth).split(' ')[0]
  const lastName = monthLabel(f.lastMonth.month).split(' ')[0]
  const days = f.daily.filter(d => monthOf(d.date) === f.thisMonth)
  const daysLeft = days.filter(d => d.forecast).length
  const t = f.thisMonthTotal
  const vs = change(t.revenue, f.lastMonth.revenue)
  const closing = f.closings.filter(c => monthOf(c.date) === f.thisMonth)
  const idle = f.rest.idleDays
  const rows: { label: string; last: string; soFar: string; rest: string; total: string; strong?: boolean }[] = [
    { label: 'Metres', last: `${n0(f.lastMonth.metres)} m`, soFar: `${n0(f.mtd.metres)} m`, rest: `${n0(f.rest.metres)} m`, total: `${n0(t.metres)} m`, strong: true },
    { label: 'To be billed', last: moneyL(f.lastMonth.revenue), soFar: moneyL(f.mtd.revenue), rest: moneyL(f.rest.revenue), total: moneyL(t.revenue) },
    { label: 'Cost', last: moneyL(f.lastMonth.cost), soFar: moneyL(f.mtd.cost), rest: moneyL(f.rest.cost), total: moneyL(t.cost) },
    { label: 'Margin', last: `${moneyL(f.lastMonth.margin)} · ${Math.round(f.lastMonth.marginPct)}%`, soFar: `${moneyL(f.mtd.margin)} · ${Math.round(f.mtd.marginPct)}%`, rest: `${moneyL(f.rest.margin)} · ${Math.round(f.rest.marginPct)}%`, total: `${moneyL(t.margin)} · ${Math.round(t.marginPct)}%`, strong: true },
    { label: 'Billed a metre', last: f.lastMonth.metres ? money(f.lastMonth.revenue / f.lastMonth.metres) : '—', soFar: f.mtd.metres ? money(f.mtd.revenue / f.mtd.metres) : '—', rest: f.rest.metres ? money(f.rest.ratePerMetre) : '—', total: t.metres ? money(t.revenue / t.metres) : '—' },
    { label: 'Cost of a metre', last: f.lastMonth.metres ? money(f.lastMonth.cost / f.lastMonth.metres) : '—', soFar: f.mtd.metres ? money(f.mtd.cost / f.mtd.metres) : '—', rest: f.rest.metres ? money(f.rest.costPerMetre) : '—', total: t.metres ? money(t.cost / t.metres) : '—' },
  ]

  return (
    <>
      <Grid min={176}>
        <MetresTile label={`${name} will close at`} value={t.metres} low={t.low} high={t.high} />
        <Tile label="Drilled so far" value={`${n0(f.mtd.metres)} m`} note={`${t.metres ? Math.round((f.mtd.metres / t.metres) * 100) : 0}% of the month · ${daysLeft} days to go`} />
        <Tile label="To be billed" value={moneyL(t.revenue)} tone={vs < -3 ? 'warn' : vs > 3 ? 'good' : 'neutral'} note={f.lastMonth.revenue ? changeWords(vs, lastName) : `${moneyL(f.mtd.revenue)} earned so far`} />
        <Tile label="It will cost" value={moneyL(t.cost)} note={`${moneyL(f.mtd.cost)} spent so far`} />
        <Tile label="Margin" value={moneyL(t.margin)} tone={t.margin >= 0 ? 'good' : 'bad'} note={`${Math.round(t.marginPct)}% of billing${f.lastMonth.revenue ? ` · ${lastName} closed at ${Math.round(f.lastMonth.marginPct)}%` : ''}`} />
        <Tile label="Idle rig-days to month end" value={String(idle)} tone={idle ? 'warn' : 'good'} note={idle ? `${f.rigs.filter(r => r.rest.idleDays > 0).map(r => r.rig).join(', ')} with no hole planned` : 'Every rig has a hole to the end of the month'} />
      </Grid>

      <Card title={`Metres a day in ${name}`} subtitle={`${n0(f.mtd.metres)} m logged to ${shortDate(f.today)}, ${n0(f.rest.metres)} m forecast for the ${daysLeft} days left.`}>
        <DailyChart days={days} today={f.today} />
      </Card>

      <Split left={3} right={2}>
        <Card title="Rig by rig" subtitle="What each rig has done this month, and what it will add before the month ends." pad={false}>
          <Table>
            <thead><tr>
              <th style={th}>Rig</th><th style={thR}>So far</th><th style={thR}>Makes a day</th><th style={thR}>Rest of month</th><th style={thR}>Month total</th><th style={thR}>Billed</th><th style={th}>Rest of month</th>
            </tr></thead>
            <tbody>
              {f.rigs.map(r => (
                <tr key={r.rig} style={{ borderBottom: rowLine }}>
                  <td style={{ ...tdStrong, whiteSpace: 'normal' }}>{r.rig}<div style={{ fontSize: 11.5, color: T.faint, fontWeight: 400 }}>{r.project.split(' - ')[0]}{r.contractor ? ' · contractor' : ''}</div></td>
                  <td style={tdR}>{n0(r.mtd.metres)} m<div style={{ fontSize: 11.5, color: T.faint }}>{r.mtd.days} days</div></td>
                  <td style={tdR}>{r.perDay.toFixed(1)} m</td>
                  <td style={tdR}>{n0(r.rest.metres)} m<div style={{ fontSize: 11.5, color: T.faint }}>{n0(r.rest.low)} to {n0(r.rest.high)}</div></td>
                  <td style={{ ...tdR, color: T.text, fontWeight: 700 }}>{n0(r.mtd.metres + r.rest.metres)} m</td>
                  <td style={tdR}>{moneyL(r.mtd.revenue + r.rest.revenue)}</td>
                  <td style={td}>{r.rest.idleDays > 0
                    ? <Status tone="warn">{r.rest.idleDays} idle {r.rest.idleDays === 1 ? 'day' : 'days'}</Status>
                    : r.zeroDays > 0 ? <Status tone="neutral">{r.zeroDays} stopped {r.zeroDays === 1 ? 'day' : 'days'} in 30</Status> : <Status tone="good">Steady</Status>}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card title={`Holes that finish in ${name}`} subtitle="Once closed and approved, each can be invoiced." pad={false}>
          {closing.length === 0 ? <Empty>No hole on a rig reaches planned depth before the month ends.</Empty> : (
            <Table>
              <thead><tr><th style={th}>Hole</th><th style={th}>Rig</th><th style={th}>Reaches depth</th><th style={thR}>Worth</th></tr></thead>
              <tbody>
                {closing.map(c => (
                  <tr key={c.hole} style={{ borderBottom: rowLine }}>
                    <td style={tdStrong}>{c.hole}</td><td style={td}>{c.rig}</td>
                    <td style={td}>{shortDate(c.date)}<span style={{ color: T.faint }}> · in {daysBetween(f.today, c.date)} days</span></td>
                    <td style={{ ...tdR, color: T.text }}>{moneyL(c.value)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <div style={{ padding: '11px 16px', borderTop: rowLine }}>
            <Link href="/admin/intelligence/holes" style={{ fontSize: 12.5, fontWeight: 600, color: T.orange, textDecoration: 'none' }}>Every hole&rsquo;s finish date →</Link>
          </div>
        </Card>
      </Split>

      <Card title={`${name} against ${lastName}`} subtitle="Last month as it closed, this month so far, the days still to come, and where the month will end." pad={false}>
        <Table>
          <thead><tr><th style={th} /><th style={thR}>{lastName}, closed</th><th style={thR}>{name} so far</th><th style={thR}>Still to come</th><th style={thR}>{name} will close at</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label} style={{ borderBottom: rowLine }}>
                <td style={{ ...td, color: T.text, fontWeight: r.strong ? 700 : 500 }}>{r.label}</td>
                <td style={tdR}>{r.last}</td><td style={tdR}>{r.soFar}</td><td style={tdR}>{r.rest}</td>
                <td style={{ ...tdR, color: T.text, fontWeight: 700 }}>{r.total}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  )
}

function PartRow({ p }: { p: PartNeed }) {
  const tone: Tone = p.status === 'late' ? 'bad' : 'warn'
  return (
    <tr style={{ borderBottom: rowLine }}>
      <td style={{ ...tdStrong, whiteSpace: 'normal', minWidth: 190 }}>
        {p.part.name}
        <div style={{ fontSize: 11.5, fontWeight: 400, color: T.faint, marginTop: 2 }}>{p.part.supplier} · {p.part.leadTimeDays} days to deliver</div>
      </td>
      <td style={tdR}>{p.need.toFixed(p.need < 10 ? 1 : 0)}</td>
      <td style={tdR}>{p.inStore}{p.onOrderQty > 0 && <span style={{ color: T.faint }}> + {p.onOrderQty} on order</span>}</td>
      <td style={{ ...tdR, color: T.text }}>{shortDate(p.runOut)}</td>
      <td style={td}>
        <Status tone={tone}>{p.status === 'late' ? 'Order today' : `Order by ${shortDate(p.orderBy)}`}</Status>
        {p.status === 'late' && p.gapDays > 0 && <div style={{ fontSize: 11.5, color: T.faint, marginTop: 4 }}>about {p.gapDays} days short even so</div>}
      </td>
      <td style={{ ...tdR, color: T.text, fontWeight: 600 }}>{p.toOrder} · {moneyL(p.spend)}</td>
    </tr>
  )
}

function NextMonth({ f }: { f: Forecast }) {
  const [allParts, setAllParts] = useState(false)
  const nextLabel = monthLabel(f.nextMonth)
  const name = nextLabel.split(' ')[0]
  const thisName = monthLabel(f.thisMonth).split(' ')[0]
  const short = f.parts.filter(p => p.status !== 'covered')
  const shown = allParts ? short : short.slice(0, 6)
  const idle = f.next.idleDays
  const vs = change(f.next.revenue, f.thisMonthTotal.revenue)
  const firstOrder = short.map(p => p.orderBy!).sort()[0]
  const days = f.daily.filter(d => monthOf(d.date) === f.nextMonth)
  const closing = f.closings.filter(c => monthOf(c.date) === f.nextMonth)
  const numbers = (p: PeriodNumbers) => `${p.drillDays} drilling · ${p.moveDays} moving · ${p.idleDays} idle`

  return (
    <>
      <Grid min={172}>
        <MetresTile label={`Metres in ${name}`} value={f.next.metres} low={f.next.low} high={f.next.high} />
        <Tile label="To be billed" value={moneyL(f.next.revenue)} tone={vs < -3 ? 'warn' : vs > 3 ? 'good' : 'neutral'} note={changeWords(vs, `${thisName} will close at`)} />
        <Tile label="It will cost" value={moneyL(f.next.cost)} note={`${money(f.next.costPerMetre)} a metre, against ${money(f.next.ratePerMetre)} billed`} />
        <Tile label="Margin" value={moneyL(f.next.margin)} tone={f.next.margin >= 0 ? 'good' : 'bad'} note={`${Math.round(f.next.marginPct)}% of billing · ${thisName} is running at ${Math.round(f.thisMonthTotal.marginPct)}%`} />
        <Tile label="Parts to order" value={short.length ? moneyL(f.partsSpend) : 'Nothing'} tone={short.some(p => p.status === 'late') ? 'bad' : short.length ? 'warn' : 'good'}
          note={short.length ? `${short.length} parts · ${firstOrder <= f.today ? 'first order today' : `first order by ${shortDate(firstOrder)}`}` : 'Store and orders cover the month'} />
        <Tile label="Idle rig-days" value={String(idle)} tone={idle ? 'warn' : 'good'} note={idle ? `${f.rigs.filter(r => r.next.idleDays > 0).map(r => r.rig).join(', ')} with no hole planned` : 'Every rig has holes for the whole month'} />
      </Grid>

      <Card title={`Rig plan to ${shortDate(f.horizonEnd)}`}
        subtitle={`Each rig finishes the hole it is on, then takes the next planned hole on its project.${idle ? ' The striped blocks are days with nothing planned.' : ''}`}
        right={<Link href="/admin/projects" style={{ fontSize: 12.5, fontWeight: 600, color: T.orange, textDecoration: 'none' }}>Add planned holes</Link>}>
        <div style={{ marginBottom: 14 }}><TimelineKey /></div>
        <Timeline lanes={lanesOf(f)} start={f.horizonStart} end={f.horizonEnd} split={`${f.nextMonth}-01`} splitLabel={`${name} starts`} />
      </Card>

      <Card title={`Metres a day in ${name}`} subtitle="All rigs together. A drop is a rig finishing its last planned hole or moving.">
        <DailyChart days={days} today={f.today} />
      </Card>

      <Split left={3} right={2}>
        <Card title={`${name}, rig by rig`} pad={false} subtitle="Expected metres with the slow and best case, and how the rig's days are spent.">
          <Table>
            <thead><tr><th style={th}>Rig</th><th style={thR}>Makes a day</th><th style={thR}>Metres</th><th style={thR}>Slow to best</th><th style={thR}>Billed</th><th style={thR}>Margin</th><th style={th}>Days</th></tr></thead>
            <tbody>
              {f.rigs.map(r => (
                <tr key={r.rig} style={{ borderBottom: rowLine }}>
                  <td style={{ ...tdStrong, whiteSpace: 'normal' }}>{r.rig}<div style={{ fontSize: 11.5, color: T.faint, fontWeight: 400 }}>{r.project.split(' - ')[0]}{r.contractor ? ' · contractor' : ''}</div></td>
                  <td style={tdR}>{r.perDay.toFixed(1)} m</td>
                  <td style={{ ...tdR, color: T.text, fontWeight: 700 }}>{n0(r.next.metres)} m</td>
                  <td style={tdR}>{n0(r.next.low)} to {n0(r.next.high)}</td>
                  <td style={tdR}>{moneyL(r.next.revenue)}</td>
                  <td style={{ ...tdR, color: T.text }}>{moneyL(r.next.margin)}</td>
                  <td style={{ ...td, whiteSpace: 'normal', fontSize: 12.5 }}>{numbers(r.next)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <Card title={`${name} by project`} pad={false}>
            <Table>
              <thead><tr><th style={th}>Project</th><th style={thR}>Metres</th><th style={thR}>Billed</th><th style={thR}>Margin</th></tr></thead>
              <tbody>
                {f.byProject.map(p => (
                  <tr key={p.project} style={{ borderBottom: rowLine }}>
                    <td style={{ ...tdStrong, whiteSpace: 'normal' }}>{p.project}
                      <div style={{ fontSize: 11.5, fontWeight: 400, color: T.faint, marginTop: 2 }}>{p.rigs} {p.rigs === 1 ? 'rig' : 'rigs'} · {p.lastHoleEnds ? `planned holes end ${shortDate(p.lastHoleEnds)}` : 'holes planned beyond the month'}</div>
                    </td>
                    <td style={tdR}>{n0(p.metres)}</td><td style={tdR}>{moneyL(p.revenue)}</td>
                    <td style={{ ...tdR, color: T.text, fontWeight: 600 }}>{moneyL(p.margin)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <Card title="Money you can bring forward" subtitle="Work already done that is not yet cash.">
            <div style={{ display: 'grid', gap: 11 }}>
              {[
                { label: 'Approved holes, ready to invoice', value: f.cash.readyToInvoice, note: `${f.cash.readyCount} holes` },
                { label: 'Closed holes, not yet approved', value: f.cash.notApproved, note: `${f.cash.notApprovedCount} holes` },
                { label: 'Open holes the rig has left', value: f.cash.stuckOpen.reduce((s, x) => s + x.value, 0), note: f.cash.stuckOpen.map(s => s.hole).join(', ') || 'none' },
                { label: `Holes that finish in ${name}`, value: closing.reduce((s, c) => s + c.value, 0), note: `${closing.length} holes` },
                ...(f.cash.overdue > 0 ? [{ label: 'Invoices overdue', value: f.cash.overdue, note: `${f.cash.overdueCount} invoices` }] : []),
                ...(f.cash.dueNext > 0 ? [{ label: `Invoices due in ${name}`, value: f.cash.dueNext, note: `${f.cash.dueNextCount} invoices` }] : []),
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'baseline' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: T.muted }}>{r.label}</div>
                    <div style={{ fontSize: 11.5, color: T.faint, marginTop: 1 }}>{r.note}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{moneyL(r.value)}</div>
                </div>
              ))}
              <Link href="/admin/finance" style={{ fontSize: 12.5, fontWeight: 600, color: T.orange, textDecoration: 'none', marginTop: 2 }}>Open Finance</Link>
            </div>
          </Card>
        </div>
      </Split>

      <Card title="Parts to order" subtitle="What the planned metres will use, against the store and what is on order. Your own rigs only: a contractor brings his own." pad={false}>
        {short.length === 0 ? <Empty>The store and open orders cover every part to the end of {nextLabel}.</Empty> : (
          <>
            <Table>
              <thead><tr><th style={th}>Part</th><th style={thR}>Will use</th><th style={thR}>In store</th><th style={thR}>Store runs out</th><th style={th}>Order</th><th style={thR}>Qty · cost</th></tr></thead>
              <tbody>{shown.map(p => <PartRow key={p.part.id} p={p} />)}</tbody>
            </Table>
            {short.length > 6 && (
              <button onClick={() => setAllParts(v => !v)} style={{ width: '100%', padding: '11px', background: 'none', border: 'none', borderTop: `1px solid ${T.line}`, color: T.muted, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {allParts ? 'Show fewer' : `Show all ${short.length} parts`}
              </button>
            )}
          </>
        )}
      </Card>
    </>
  )
}

export default function MonthsPage() {
  const { state, inv, f } = useIntel()
  const [tab, setTab] = useState<Tab>('this')
  const [metric, setMetric] = useState<Metric>('margin')
  const [bridgeTab, setBridgeTab] = useState<'this' | 'next'>('this')
  const [w, setW] = useState<WhatIf>({ speed: 0, rate: 0, cost: 0, downDays: 0, idleFilled: false })
  const thisName = monthLabel(f.thisMonth), nextName = monthLabel(f.nextMonth)
  const points = useMemo(() => monthSeries(state, inv, f), [state, inv, f])
  const warnings = useMemo(() => earlyWarnings(state, inv, f.today), [state, inv, f.today])
  const learned = useLearning()
  const lv = useMemo(() => levers(f), [f])
  const risks = useMemo(() => buildRiskRegister(f, state), [f, state])
  const cur = points.find(p => p.kind === 'current'), next = points.find(p => p.kind === 'forecast')
  const prev = points.filter(p => p.kind === 'actual').pop()
  const b1 = prev && cur ? bridge(prev, cur) : null
  const b2 = cur && next ? bridge(cur, next) : null
  const sim = whatIf(f, w)
  const worse = warnings.filter(x => x.state === 'worse')
  const short = shortMoney
  const tName = thisName.split(' ')[0], nName = nextName.split(' ')[0]

  if (f.rigs.length === 0) return <Page><IntelTabs /><PageHead question="What is coming?" answer="No rig has logged a shift in the last 14 days, so there is nothing to forecast from yet." /></Page>

  const biggest = b1 ? [['more metres', b1.volume], ['the rate a metre', b1.rate], ['the cost a metre', b1.cost]].sort((a, b) => Math.abs(b[1] as number) - Math.abs(a[1] as number))[0] : null
  return (
    <Page>
      <IntelTabs />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: display, fontSize: 22, fontWeight: 600, color: T.text }}>Outlook</h1>
          <p style={{ margin: '5px 0 0', fontSize: 13.5, color: T.muted }}>Forecast, what drives it, what could change it, and what is starting to turn. From your own record, as of {shortDate(f.today)}.</p>
        </div>
        <nav aria-label="On this page" className="xpl-chips" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[['#forecast', 'Forecast'], ['#accuracy', 'Accuracy'], ['#drivers', 'Drivers'], ['#scenarios', 'Scenarios'], ['#warnings', 'Early warnings'], ['#detail', 'Month in detail']].map(([h, l]) => (
            <a key={h} href={h} style={{ fontSize: 12.5, fontWeight: 600, color: T.text, textDecoration: 'none', padding: '6px 11px', borderRadius: 99, border: `1px solid ${T.border}`, background: T.card }}>{l}</a>
          ))}
        </nav>
      </div>

      <section aria-label="Summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: 12 }}>
        {cur && (
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '14px 16px', display: 'grid', gap: 6, boxShadow: 'inset 3px 0 0 var(--x-orange)' }}>
            <span style={{ ...eyebrow }}>{tName} closes at about</span>
            <span style={{ ...num, fontSize: 26, fontWeight: 600, color: T.text }}>{short(cur.margin)} <span style={{ fontSize: 14, color: T.faint, fontWeight: 500 }}>margin</span></span>
            <RangeLine low={cur.low?.margin ?? cur.margin} mid={cur.margin} high={cur.high?.margin ?? cur.margin} fmt={short} />
            <span style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.5 }}>{n0(cur.metres)} m, {Math.round(f.thisMonthTotal.marginPct)}% margin.{prev && biggest ? <> {cur.margin >= prev.margin ? 'Up' : 'Down'} {short(Math.abs(cur.margin - prev.margin))} on {MONTHS[Number(prev.month.slice(5, 7)) - 1]}, mostly from {biggest[0]}.</> : null}</span>
          </div>
        )}
        {next && (
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '14px 16px', display: 'grid', gap: 6 }}>
            <span style={{ ...eyebrow }}>{nName} is forecast at</span>
            <span style={{ ...num, fontSize: 26, fontWeight: 600, color: T.text }}>{short(next.margin)} <span style={{ fontSize: 14, color: T.faint, fontWeight: 500 }}>margin</span></span>
            <RangeLine low={next.margin - Math.max(Math.abs(lv[0]?.low ?? 0), 0)} mid={next.margin} high={next.margin + Math.max(lv[0]?.high ?? 0, 0)} fmt={short} />
            <span style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.5 }}>{n0(next.metres)} m. Biggest swing: {lv[0]?.label.toLowerCase()}, worth up to {short(Math.max(Math.abs(lv[0]?.low ?? 0), Math.abs(lv[0]?.high ?? 0)))}.</span>
          </div>
        )}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '14px 16px', display: 'grid', gap: 6, boxShadow: worse.length ? 'inset 3px 0 0 var(--x-red)' : 'inset 3px 0 0 var(--x-green)' }}>
          <span style={{ ...eyebrow }}>Starting to turn</span>
          <span style={{ ...num, fontSize: 26, fontWeight: 600, color: worse.length ? 'var(--x-bad-text)' : T.text }}>{worse.length} <span style={{ fontSize: 14, color: T.faint, fontWeight: 500, fontFamily: display }}>of {warnings.length} measures</span></span>
          <span style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.5 }}>{worse.length ? <>Turning the wrong way: {worse.map(x => x.label.toLowerCase()).join(', ')}.</> : 'No measure is turning the wrong way over the last two weeks.'}{risks[0] ? <> First risk to act on: {risks[0].title.replace(/\.$/, '')}.</> : null}</span>
        </div>
      </section>

      <div id="forecast" style={{ scrollMarginTop: 80 }}>
        <Card title="Forecast" subtitle={`The months as they closed, ${tName} so far plus the days to come, and ${nName}. The black whisker is the range from each rig's slowest to its best month.`}
          right={<Seg<Metric> value={metric} onChange={setMetric} options={[{ value: 'margin', label: 'Margin' }, { value: 'revenue', label: 'Billing' }, { value: 'metres', label: 'Metres' }]} />}>
          <ForecastBars points={points} metric={metric} />
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: T.muted, marginTop: 6 }}>
            <Key fill="var(--x-muted)" label="Closed" /><Key fill={T.orange} label="Logged this month" /><Key hatch label="Forecast" /><span>│ Slowest to best</span>
          </div>
        </Card>
      </div>

      <div id="accuracy" style={{ scrollMarginTop: 80 }}>
        <ForecastCheck l={learned} />
      </div>

      <div id="drivers" style={{ scrollMarginTop: 80 }}>
        {(b1 || b2) && (() => {
          const b = bridgeTab === 'next' && b2 ? b2 : (b1 ?? b2)!
          return (
            <Card title={`Why margin moves: ${MONTHS[Number(b.from.month.slice(5, 7)) - 1]} to ${MONTHS[Number(b.to.month.slice(5, 7)) - 1]}`} subtitle="Three steps that add up exactly: more or fewer metres, the rate a metre, and the cost a metre. Green helped, red cost you."
              right={b1 && b2 ? <Seg<'this' | 'next'> value={bridgeTab} onChange={setBridgeTab} options={[{ value: 'this', label: `${MONTHS[Number(b1.from.month.slice(5, 7)) - 1].slice(0, 3)} → ${tName.slice(0, 3)}` }, { value: 'next', label: `${tName.slice(0, 3)} → ${nName.slice(0, 3)}` }]} /> : undefined}>
              <div style={{ maxWidth: 980 }}><Waterfall b={b} /></div>
            </Card>
          )
        })()}
      </div>

      <div id="scenarios" style={{ scrollMarginTop: 80 }}>
        <Card title={`What could change ${nName}`} subtitle="Each bar is one thing that can happen, worked out from your rigs' own speed and costs. The longest bar matters most.">
          <Tornado levers={lv} base={next?.margin ?? 0} />
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: rowLine, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(380px, 100%), 1fr))', gap: 20, alignItems: 'center' }}>
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text }}>Try your own</div>
              <Slider label="Drilling speed" unit="%" min={-30} max={30} value={w.speed} onChange={v => setW({ ...w, speed: v })} />
              <Slider label="Client rate a metre" unit="%" min={-15} max={15} value={w.rate} onChange={v => setW({ ...w, rate: v })} />
              <Slider label="Cost a metre" unit="%" min={-20} max={20} value={w.cost} onChange={v => setW({ ...w, cost: v })} />
              <Slider label="Rig-days lost" unit=" days" min={0} max={30} value={w.downDays} onChange={v => setW({ ...w, downDays: v })} />
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: T.text }}><input type="checkbox" checked={w.idleFilled} onChange={e => setW({ ...w, idleFilled: e.target.checked })} />The client releases holes for every idle rig-day</label>
              <button type="button" onClick={() => setW({ speed: 0, rate: 0, cost: 0, downDays: 0, idleFilled: false })} style={{ justifySelf: 'start', background: 'none', border: 'none', padding: 0, color: T.orange, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5 }}>Back to the forecast</button>
            </div>
            <div style={{ display: 'grid', gap: 10, padding: 18, borderRadius: 10, background: Math.abs(sim.margin - sim.base) < 1 ? 'rgba(var(--x-ov),0.04)' : sim.margin > sim.base ? tint(T.green, 8) : tint(T.red, 7) }}>
              <span style={{ fontSize: 12.5, color: T.muted, fontWeight: 600 }}>{nName} margin, with these changes</span>
              <span style={{ ...num, fontSize: 34, fontWeight: 600, color: T.text }}>{short(sim.margin)}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: Math.abs(sim.margin - sim.base) < 1 ? T.muted : sim.margin > sim.base ? 'var(--x-good-text)' : 'var(--x-bad-text)' }}>{Math.abs(sim.margin - sim.base) < 1 ? 'The forecast as it stands. Move a slider.' : `${sim.margin > sim.base ? '+' : '−'}${short(Math.abs(sim.margin - sim.base))} against the forecast`}</span>
              <span style={{ fontSize: 12.5, color: T.muted }}>{n0(sim.metres)} m · billing {short(sim.revenue)} · cost {short(sim.cost)} · {Math.round(sim.marginPct)}% margin</span>
            </div>
          </div>
        </Card>
      </div>

      <div id="warnings" style={{ scrollMarginTop: 80 }}>
        <Card title="Early warnings" subtitle="Six weeks of each measure. A measure is flagged when its last two weeks are 5% or more the wrong side of the four before.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(230px, 100%), 1fr))', gap: 12 }}>
            {[...warnings].sort((a, b) => Number(b.state === 'worse') - Number(a.state === 'worse')).map(x => <WarningCard key={x.key} w={x} />)}
          </div>
        </Card>
      </div>

      <div id="risks" style={{ scrollMarginTop: 80 }}>
        <Link href="/admin/tasks?dept=all" className="xpl-row" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 16px', borderRadius: 10, border: `1px solid ${T.border}`, background: T.card, textDecoration: 'none' }}>
          <span style={{ fontSize: 13.5, color: T.text }}><b>{risks.length} risks</b> found in this forecast are in Tasks, each with its cause and a drafted next step{risks.filter(r => r.score >= 6).length ? <>, <b style={{ color: 'var(--x-bad-text)' }}>{risks.filter(r => r.score >= 6).length} to act on now</b></> : null}.</span>
          <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 600, color: T.orange }}>Open Tasks →</span>
        </Link>
      </div>

      <div id="detail" style={{ scrollMarginTop: 80, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
        <h2 style={{ margin: 0, fontFamily: display, fontSize: 20, color: T.text }}>Month in detail</h2>
        <Seg<Tab> options={[{ value: 'this', label: tName }, { value: 'next', label: nName }]} value={tab} onChange={setTab} />
      </div>
      {tab === 'this' ? <ThisMonth f={f} /> : <NextMonth f={f} />}

      <Basis lines={f.basis} note={<>
        A projection from your own records, walked forward day by day. It is checked every week against what the rigs then drilled (Accuracy, above), and each rig's pace and each part's life are read again from the record, so the next forecast starts from what really happened.
      </>} />
    </Page>
  )
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function Key({ fill, hatch, label }: { fill?: string; hatch?: boolean; label: string }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span aria-hidden style={{ width: 14, height: 10, borderRadius: 2, background: hatch ? `repeating-linear-gradient(45deg, ${tint(T.orange, 55)} 0 3px, ${tint(T.orange, 15)} 3px 6px)` : fill, border: hatch ? `1px dashed ${T.orange}` : 'none' }} />{label}</span>
}

function Slider({ label, unit, min, max, value, onChange }: { label: string; unit: string; min: number; max: number; value: number; onChange: (v: number) => void }) {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: T.text }}><span>{label}</span><b>{value > 0 && unit === '%' ? '+' : ''}{value}{unit}</b></span>
      <input type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--x-orange)' }} />
    </label>
  )
}

/* Slow, expected and best case on one line, the expected marked. */
function RangeLine({ low, mid, high, fmt }: { low: number; mid: number; high: number; fmt: (n: number) => string }) {
  const span = Math.max(1, high - low)
  const at = ((mid - low) / span) * 100
  return (
    <div style={{ display: 'grid', gap: 3 }}>
      <div aria-label={`Range ${fmt(low)} to ${fmt(high)}`} style={{ position: 'relative', height: 8, borderRadius: 4, background: tint(T.orange, 16) }}>
        <span style={{ position: 'absolute', top: -3, left: `calc(${Math.max(0, Math.min(100, at))}% - 1.5px)`, width: 3, height: 14, borderRadius: 2, background: T.orange }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.faint, fontFamily: num.fontFamily }}><span>{fmt(low)}</span><span>{fmt(high)}</span></div>
    </div>
  )
}
