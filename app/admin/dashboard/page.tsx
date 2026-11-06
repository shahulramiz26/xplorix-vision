'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { CalendarDays, ArrowRight } from 'lucide-react'
import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts'
import { moneyL, perUnit, monthLabel, shiftMonth, daysInMonth, useCosting } from '../../../lib/costing-store'
import { useInventory, TODAY, PROJECTS, COMPLETED_PROJECTS, RIGS, countLosses } from '../../../lib/inventory-store'
import { IS_DEMO } from '../../../lib/company'
import { useAdminOverview, financeLink } from '../../../lib/admin-overview'
import { companyToday } from '../../../lib/company-overview'
import { stockBySite } from '../../../lib/stores-overview'
import { num } from '../../../lib/client-record'
import { photoTotal } from '../../../lib/core/photo-summary'
import { useInbox } from '../../components/inbox'
import { BriefCard } from '../../components/ai'
import { MoneyPanel, VizTile, SparkBars, Ring, SplitBar, GroundDonut, StockBar, CostBullet } from '../../components/dash-viz'
import {
  Page, Card, Btn, Table, Status, Legend, Tip, Delta, Empty,
  th, thR, td, tdR, rowLine, T, tint, display, axisTick, gridStroke, num as figure, eyebrow } from '../../components/kit'

/* DASHBOARD — the company at a glance.
 *
 * Figures only; what needs doing lives in Tasks. Read top to bottom the way
 * an owner asks: what happened today, in what ground, at what cost a metre
 * on each rig, how the projects stand, the rigs' health, whether the logs
 * are in, what the contractors did, and what sits in the stores. */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const day = (d?: string) => d ? `${Number(d.slice(8, 10))} ${MON[Number(d.slice(5, 7)) - 1]}` : ''

function StartHere() {
  const { state } = useCosting()
  const { state: inv } = useInventory()
  if (IS_DEMO || state.shiftLogs.length > 0) return null
  const steps: { done: boolean | null; title: string; detail: string; href: string; action: string }[] = [
    { done: null, title: 'Change your password', detail: 'You were given it by XPLORIX. Make it your own.', href: '/admin/settings', action: 'Open Settings' },
    { done: (state.rigRegister ?? []).length > 0, title: 'Add your rigs', detail: 'Each rig once: its name as written on the log, its type and core sizes.', href: '/admin/rigs', action: 'Open Rigs' },
    { done: (state.crew ?? []).length > 0, title: 'Add your drillers and supervisors', detail: 'So they can be picked on projects and drill logs.', href: '/admin/people', action: 'Open Drillers & crew' },
    { done: state.projects.length > 0, title: 'Create your first project', detail: 'The client, the contract rates, the rigs and crew on it, and the holes to drill.', href: '/admin/projects/new', action: 'New project' },
    { done: state.ownership.length + state.operating.length > 0, title: 'Enter what each rig costs', detail: 'The rig cost on each rig under Rigs; fuel and crew when a rig is put on a project.', href: '/admin/rigs', action: 'Open Rigs' },
    { done: inv.catalogue.length > 0, title: 'Count what is on each rig', detail: 'Can wait. Needed for parts cost on each metre and stock warnings.', href: '/admin/inventory', action: 'Open Stores' },
  ]
  return (
    <Card title="Start here" subtitle="Each step is ticked when it is done." pad={false}>
      {steps.map((s, i) => (
        <Link key={s.title} href={s.href} className="xpl-row" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 18px', borderTop: i ? rowLine : undefined, textDecoration: 'none' }}>
          <span aria-hidden style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 700, background: s.done ? tint(T.green, 16) : 'rgba(var(--x-ov),0.05)', color: s.done ? T.green : T.muted }}>{s.done ? '✓' : i + 1}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{s.title}</div>
            <div style={{ fontSize: 12.5, color: T.muted, marginTop: 2 }}>{s.detail}</div>
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.orange, whiteSpace: 'nowrap' }}>{s.action} →</span>
        </Link>
      ))}
    </Card>
  )
}

export default function AdminDashboard() {
  const o = useAdminOverview()
  const { state: costing } = useCosting()
  const { state: inv } = useInventory()
  const inbox = useInbox()
  const c = useMemo(() => companyToday(costing, inv, TODAY), [costing, inv])
  const stock = useMemo(() => {
    const used = (rig: string, project: string) => {
      const out: { itemId: string; qty: number }[] = []
      costing.shiftLogs.filter(l => l.rig === rig && l.project === project && !l.contractor).forEach(l => (l.partsUsed ?? []).forEach(u => {
        const e = out.find(x => x.itemId === u.itemId); if (e) e.qty += u.qty ?? 0; else out.push({ itemId: u.itemId, qty: u.qty ?? 0 })
      }))
      return [...out, ...countLosses(inv.rigCounts ?? [], rig, project)]
    }
    const rigsOn = (p: string) => RIGS.filter(r => costing.shiftLogs.some(l => l.rig === r && l.project === p) || inv.rigKit.some(k => k.rig === r && k.project === p))
    const sites = stockBySite(inv.pos, inv.catalogue, inv.rigKit, PROJECTS, COMPLETED_PROJECTS, rigsOn, used, TODAY, inv.alerts)
    return { store: sites.reduce((s, x) => s + x.store, 0), rigs: sites.reduce((s, x) => s + x.onRigs, 0), idle: sites.reduce((s, x) => s + x.idle, 0) }
  }, [costing.shiftLogs, inv])
  const lastMonth = monthLabel(shiftMonth(o.month, -1)).split(' ')[0]
  const prevPerDay = o.prev.rigDays ? o.prev.metres / o.dayOfMonth : 0
  const core = useMemo(() => photoTotal(costing.shiftLogs), [costing.shiftLogs])
  const dueToday = inbox.open.filter(u => u.severity === 'act').length
  const f = inbox.forecast

  return (
    <Page>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: display, fontSize: 22, fontWeight: 600, color: T.text }}>Your company today</h1>
          <p style={{ margin: '5px 0 0', fontSize: 13.5, color: T.muted }}>{day(TODAY)} · from today&apos;s drill logs, the maintenance log, costing and stores.{IS_DEMO ? ' Demo data.' : ''}</p>
        </div>
        <Link href="/admin/tasks" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 40, padding: '0 14px', borderRadius: 10, border: `1px solid ${T.border}`, background: T.card, color: T.text, textDecoration: 'none', fontSize: 13.5, fontWeight: 600 }}>
          <CalendarDays size={16} aria-hidden style={{ color: T.orange }} />Tasks{dueToday ? <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: T.red, borderRadius: 99, padding: '1px 8px' }}>{dueToday} today</span> : null}<ArrowRight size={14} aria-hidden style={{ color: T.faint }} />
        </Link>
      </div>

      <StartHere />
      <BriefCard />

      <MoneyPanel
        today={c.moneyToday}
        month={{ revenue: f.mtd.revenue, cost: f.mtd.cost, margin: f.mtd.margin, metres: f.mtd.metres }}
        monthClose={{ revenue: f.thisMonthTotal.revenue, cost: f.thisMonthTotal.cost, margin: f.thisMonthTotal.margin, metres: f.thisMonthTotal.metres }}
        next={{ revenue: f.next.revenue, cost: f.next.cost, margin: f.next.margin, metres: f.next.metres }}
        lastSameDays={{ revenue: o.prev.revenue, cost: o.prev.cost, margin: o.prev.margin }}
        monthName={monthLabel(o.month).split(' ')[0]} nextName={monthLabel(f.nextMonth).split(' ')[0]}
        dayOfMonth={o.dayOfMonth} daysInMonth={daysInMonth(o.month)} series={c.moneyDays} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(210px, 100%), 1fr))', gap: 12 }}>
        <VizTile label="Metres today" value={`${num(c.today.metres)} m`} note={prevPerDay ? <>{lastMonth} averaged {prevPerDay.toFixed(0)} m a day</> : undefined}>
          <SparkBars values={o.daily.slice(-14).map(d => d.metres)} />
        </VizTile>
        <VizTile label="Rigs drilling" value={`${c.today.rigsActive} of ${c.today.rigsOnProjects}`} note={`${c.today.ownActive} yours, ${c.today.rigsActive - c.today.ownActive} contractors'`} href="/admin/rigs">
          <Ring share={c.today.rigsOnProjects ? c.today.rigsActive / c.today.rigsOnProjects : 0} color="var(--x-blue)" />
        </VizTile>
        <VizTile label="Drillers on shift" value={String(c.today.drillers)} note="Your own, named on today's logs" href="/admin/people" />
        <VizTile label="Downtime today" value={`${num(c.today.downtime)} h`} tone={c.today.ownDowntime > 0 ? 'bad' : undefined}
          note={<><span style={{ color: 'var(--x-bad-text)' }}>■</span> {num(c.today.ownDowntime)} h yours or the contractor&apos;s · <span style={{ color: 'var(--x-amber)' }}>■</span> {num(c.today.downtime - c.today.ownDowntime)} h client standby</>}>
          <SplitBar a={c.today.ownDowntime} b={c.today.downtime - c.today.ownDowntime} w={72} />
        </VizTile>
        {core && <VizTile label="Core recovery, tray photos" value={`${core.recovery.toFixed(0)}%`} tone={core.recovery < 90 ? 'warn' : undefined} href="/admin/geology"
          note={`Drill logs say ${core.driller.toFixed(0)}% · RQD ${core.rqd.toFixed(0)}%`}>
          <Ring share={core.recovery / 100} color={core.recovery < 90 ? 'var(--x-amber)' : 'var(--x-green)'} />
        </VizTile>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))', gap: 16, alignItems: 'start' }}>
        <Card title={`Metres per day, ${monthLabel(o.month)}`} subtitle="All rigs, yours and contractors'">
          {prevPerDay > 0 && <div style={{ marginBottom: 10 }}><Legend items={[{ color: T.bar, label: 'Metres drilled' }, { color: T.muted, label: `${lastMonth} average, ${prevPerDay.toFixed(0)} m a day`, line: true, dash: true }]} /></div>}
          <ResponsiveContainer width="100%" height={196}>
            <BarChart data={o.daily} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={gridStroke} vertical={false} />
              <XAxis dataKey="day" tick={axisTick} tickLine={false} axisLine={{ stroke: T.border }} interval={0} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => `${v} m`} />
              <Tooltip cursor={{ fill: 'rgba(var(--x-ov),0.03)' }} content={({ active, payload, label }) => active && payload?.length ? <Tip active label={`${label} ${monthLabel(o.month).split(' ')[0]}`} unit=" m" payload={[{ dataKey: 'metres', name: 'Metres drilled', value: payload[0].value as number, color: T.bar }]} /> : null} />
              {prevPerDay > 0 && <ReferenceLine y={prevPerDay} stroke={T.muted} strokeDasharray="4 3" />}
              <Bar dataKey="metres" maxBarSize={20} radius={[3, 3, 0, 0]} isAnimationActive={false}>
                {o.daily.map((d, i) => <Cell key={i} fill={i === o.daily.length - 1 ? 'var(--x-orange)' : T.bar} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Metres by ground" subtitle={`${monthLabel(o.month)} so far, and today`}>
          {c.lithology.length === 0 ? <Empty>No metres logged this month.</Empty> : <GroundDonut rows={c.lithology} />}
        </Card>
      </div>

      <Card title="Every rig today" subtitle="Cost a metre today for every rig. Bar: what a metre cost today. Tick: what it earned. Red when it cost more than it earned. Live estimate as the rig drills: Pulse." pad={false}
        right={<Link href="/admin/finance" style={{ fontSize: 12.5, color: T.orange, fontWeight: 600, textDecoration: 'none' }}>Finance →</Link>}>
        {c.rigs.length === 0 ? <Empty>No rig has logged a shift this month.</Empty> : (() => {
          const maxM = Math.max(1, ...c.rigs.map(r => r.metresToday))
          const maxC = Math.max(1, ...c.rigs.filter(r => !r.cpmDate).flatMap(r => [r.cpm ?? 0, r.rate ?? 0]))
          return (
            <Table>
              <thead><tr><th style={th}>Rig</th><th style={th}>Project and hole</th><th style={th}>Metres today</th><th style={th}>Cost a metre today</th><th style={thR}>Downtime</th><th style={thR}>This month</th><th style={th} /></tr></thead>
              <tbody>
                {c.rigs.map(r => (
                  <tr key={`${r.project}|${r.rig}`} style={{ borderTop: rowLine }}>
                    <td style={td}><div style={{ color: T.text, fontWeight: 600 }}>{r.rig}</div><div style={{ fontSize: 12, color: T.faint }}>{r.contractor ?? 'Your rig'}</div></td>
                    <td style={td}><div style={{ color: T.text }}>{r.hole ?? '—'}</div><div style={{ fontSize: 12, color: T.faint }}>{r.project}</div></td>
                    <td style={{ ...td, minWidth: 150 }}>
                      {r.reported ? <div style={{ display: 'grid', gap: 4 }}>
                        <span style={{ ...figure, fontSize: 13, color: T.text, fontWeight: 600 }}>{num(r.metresToday)} m{r.unchecked ? <span style={{ fontFamily: 'inherit', fontSize: 11.5, color: T.faint, fontWeight: 400 }}> · not checked</span> : null}</span>
                        <span aria-hidden style={{ height: 6, borderRadius: 3, background: 'rgba(var(--x-ov),0.06)', overflow: 'hidden', width: 120 }}><span style={{ display: 'block', height: '100%', width: `${(r.metresToday / maxM) * 100}%`, background: T.bar }} /></span>
                      </div> : <span style={{ color: 'var(--x-bad-text)', fontWeight: 600 }}>No log</span>}
                    </td>
                    <td style={{ ...td, minWidth: 210 }}>
                      {r.cpm != null && !r.cpmDate ? (
                        <div style={{ display: 'grid', gap: 4 }}>
                          <span style={{ ...figure, fontSize: 13.5, color: r.rate != null && r.cpm > r.rate ? 'var(--x-bad-text)' : T.text, fontWeight: 600 }}>{perUnit(r.cpm)} <span style={{ fontFamily: 'inherit', fontSize: 12, fontWeight: 400, color: T.faint }}>earned {r.rate != null ? perUnit(r.rate) : '—'}</span></span>
                          <CostBullet cost={r.cpm} earned={r.rate} max={maxC * 1.05} w={150} />
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gap: 3 }}>
                          <span style={{ fontSize: 12.5, color: T.muted, fontWeight: 600 }}>{r.unchecked ? 'Shift to check first' : 'Not costed yet today'}</span>
                          {r.cpm != null && <span style={{ ...figure, fontSize: 12, color: T.faint }}>last {perUnit(r.cpm)}<span style={{ fontFamily: 'inherit' }}> on {day(r.cpmDate)}</span></span>}
                        </div>
                      )}
                    </td>
                    <td style={{ ...tdR, color: r.ownDowntimeToday ? 'var(--x-bad-text)' : T.muted }}>{r.downtimeToday ? `${num(r.downtimeToday)} h` : '0'}{r.downtimeToday && !r.ownDowntimeToday ? <div style={{ fontFamily: 'inherit', fontSize: 11.5, color: T.faint }}>client standby</div> : null}</td>
                    <td style={tdR}>{num(r.monthMetres)} m<div style={{ fontSize: 11.5, color: T.faint }}>{r.monthCpm != null ? perUnit(r.monthCpm) : '—'}</div></td>
                    <td style={{ ...td, textAlign: 'right' }}><Btn size="sm" href={financeLink({ project: r.project, rig: r.rig, month: o.month })}>Costing</Btn></td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )
        })()}
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))', gap: 16, alignItems: 'start' }}>
        <Card title="Projects" subtitle="Metres drilled against the metres planned." right={<Link href="/admin/projects" style={{ fontSize: 12.5, color: T.orange, fontWeight: 600, textDecoration: 'none' }}>All projects →</Link>}>
          <div style={{ display: 'grid', gap: 16 }}>
            {c.projects.map(p => (
              <Link key={p.id} href={`/admin/projects/${p.id}`} style={{ display: 'grid', gridTemplateColumns: p.status === 'completed' ? '1fr' : 'auto minmax(0, 1fr)', gap: 14, alignItems: 'center', textDecoration: 'none' }}>
                {p.status !== 'completed' && <div style={{ position: 'relative', width: 52, height: 52 }}>
                  <Ring share={(p.pct ?? 0) / 100} size={52} stroke={6} color="var(--x-green)" />
                  <span style={{ ...figure, position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 600, color: T.text }}>{(p.pct ?? 0).toFixed(0)}%</span>
                </div>}
                <div style={{ minWidth: 0, display: 'grid', gap: 3 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{p.name} <span style={{ fontWeight: 400, color: T.faint, fontSize: 12.5 }}>· {p.client}</span></span>
                    {p.status === 'completed' ? <Status tone="neutral">Completed</Status> : <span style={{ ...figure, fontSize: 12.5, color: T.text }}><b>{num(p.drilled)}</b> of {num(p.planned)} m</span>}
                  </div>
                  <span style={{ fontSize: 12, color: T.faint }}>{p.status === 'completed' ? 'Finished before this month' : `${p.holesDone} of ${p.holes} holes finished · ${p.rigs} ${p.rigs === 1 ? 'rig' : 'rigs'} · ${num(p.monthMetres)} m this month`}</span>
                </div>
              </Link>
            ))}
          </div>
        </Card>
        <Card title="Maintenance" subtitle={`${monthLabel(o.month)}, your own rigs`} right={<Link href="/admin/logs/maintenance" style={{ fontSize: 12.5, color: T.orange, fontWeight: 600, textDecoration: 'none' }}>Maintenance log →</Link>}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
            <Mini label="Services" value={String(c.maintenance.services)} />
            <Mini label="Breakdowns" value={String(c.maintenance.breakdowns)} bad={c.maintenance.breakdowns > 0} />
            <Mini label="Hours down" value={`${num(c.maintenance.hours)} h`} />
            <Mini label="Repair cost" value={moneyL(c.maintenance.cost)} />
          </div>
          <div style={{ marginTop: 12, fontSize: 13, color: T.text, lineHeight: 1.55 }}>
            {c.maintenance.down.length || c.maintenance.repair.length
              ? <>Down now: <b style={{ color: 'var(--x-bad-text)' }}>{Array.from(new Set([...c.maintenance.down, ...c.maintenance.repair])).join(', ')}</b>.</>
              : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span aria-hidden style={{ width: 8, height: 8, borderRadius: 9, background: T.green }} />Every rig is running today.</span>}
          </div>
          {c.maintenance.recent.length > 0 && (() => {
            const maxH = Math.max(1, ...c.maintenance.recent.map(m => m.hours))
            return (
              <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                {c.maintenance.recent.map(m => (
                  <div key={m.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 90px auto', gap: 10, alignItems: 'center', fontSize: 12.5, color: T.muted }}>
                    <span style={{ minWidth: 0 }}><b style={{ color: T.text }}>{m.rig}</b> · {m.maintenanceType} · {m.component}</span>
                    <span aria-hidden style={{ height: 6, borderRadius: 3, background: 'rgba(var(--x-ov),0.06)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${(m.hours / maxH) * 100}%`, background: m.maintenanceType === 'Breakdown' ? 'var(--x-red)' : 'var(--x-plan)' }} /></span>
                    <span style={{ ...figure, whiteSpace: 'nowrap', fontSize: 12 }}>{day(m.date)} · {m.hours} h</span>
                  </div>
                ))}
              </div>
            )
          })()}
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 16, alignItems: 'start' }}>
        <Card title="Drill logs in today" subtitle="Two shifts a rig: day and night." right={<Link href="/admin/logs/drill" style={{ fontSize: 12.5, color: T.orange, fontWeight: 600, textDecoration: 'none' }}>Drill logs →</Link>}>
          <div style={{ display: 'grid', gap: 14 }}>
            {[{ l: 'Your rigs', n: c.logsIn.ownIn, of: c.logsIn.ownExpected, note: c.logsIn.missing.length ? `Missing from ${c.logsIn.missing.join(', ')}` : 'All in' },
              { l: 'Contractors', n: c.logsIn.ctrReported, of: c.logsIn.ctrExpected, note: c.logsIn.ctrUnchecked ? `${c.logsIn.ctrUnchecked} reported, waiting to be checked` : 'All checked' }].map(x => (
              <div key={x.l} style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: 12, alignItems: 'center' }}>
                <div style={{ position: 'relative', width: 52, height: 52 }}>
                  <Ring share={x.of ? x.n / x.of : 0} size={52} color={x.of && x.n < x.of ? 'var(--x-amber)' : 'var(--x-green)'} />
                  <span style={{ ...figure, position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 600, color: T.text }}>{x.n}/{x.of}</span>
                </div>
                <div><div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{x.l}</div><div style={{ fontSize: 12.5, color: T.faint }}>{x.note}</div></div>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Contractors" subtitle="This month's metres, and what a metre costs you." right={<Link href="/admin/contractors" style={{ fontSize: 12.5, color: T.orange, fontWeight: 600, textDecoration: 'none' }}>Contractors →</Link>}>
          {c.contractors.length === 0 ? <Empty>No contractor rigs this month.</Empty> : (() => {
            const maxM = Math.max(1, ...c.contractors.map(x => x.monthMetres))
            return (
              <div style={{ display: 'grid', gap: 14 }}>
                {c.contractors.map(x => (
                  <div key={x.id} style={{ display: 'grid', gap: 5 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{x.name} <span style={{ fontWeight: 400, fontSize: 12, color: T.faint }}>{x.rigs.join(', ')}</span></span>
                      <span style={{ ...figure, fontSize: 12.5, color: T.text, fontWeight: 600 }}>{x.cpm != null ? perUnit(x.cpm) : '—'}</span>
                    </div>
                    <span aria-hidden style={{ height: 8, borderRadius: 3, background: 'rgba(var(--x-ov),0.06)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${(x.monthMetres / maxM) * 100}%`, background: 'var(--x-purple)' }} /></span>
                    <span style={{ fontSize: 12, color: T.faint }}>{num(x.monthMetres)} m this month · {num(x.metresToday)} m today{x.uncheckedToday ? ' (not checked yet)' : ''}{x.downtimeToday ? ` · ${num(x.downtimeToday)} h stopped` : ''}</span>
                  </div>
                ))}
              </div>
            )
          })()}
        </Card>
        <Card title="Stores" subtitle="What you hold, and what is not moving." right={<Link href="/admin/inventory" style={{ fontSize: 12.5, color: T.orange, fontWeight: 600, textDecoration: 'none' }}>Stores →</Link>}>
          <StockBar store={stock.store} rigs={stock.rigs} idle={stock.idle} idleDays={inv.alerts.idleDays} />
        </Card>
      </div>
    </Page>
  )
}

function Mini({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return <div style={{ padding: '10px 12px', borderRadius: 10, background: bad ? tint(T.red, 7) : 'rgba(var(--x-ov),0.035)', display: 'grid', gap: 3 }}>
    <span style={{ fontSize: 12, color: bad ? 'var(--x-bad-text)' : T.muted, fontWeight: 600 }}>{label}</span>
    <span style={{ ...figure, fontSize: 19, fontWeight: 600, color: bad ? 'var(--x-bad-text)' : T.text }}>{value}</span>
  </div>
}