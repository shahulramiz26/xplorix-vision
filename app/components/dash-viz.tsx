'use client'

import Link from 'next/link'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from 'recharts'
import { ArrowRight } from 'lucide-react'
import { moneyL, perUnit } from '../../lib/costing-store'
import { T, tint, num, eyebrow, display, axisTick, gridStroke, Tip, radius } from './kit'

/* ==========================================================================
 * DASHBOARD VISUALS
 *
 * The pieces the Dashboard is drawn with, so every figure on it is read at a
 * glance: the money panel (today, this month, next month), KPI tiles with a
 * small chart each, a ring, a donut, a stacked bar and a bullet for cost
 * against what a metre earns. Charts follow the ui-ux-pro-max chart rules:
 * every colour is labelled in words, numbers are printed, nothing relies on
 * colour alone.
 * ========================================================================== */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dshort = (d: string) => `${Number(d.slice(8, 10))} ${MON[Number(d.slice(5, 7)) - 1]}`

/* ── money ──────────────────────────────────────────────────────────────── */

export interface MoneyCol { revenue: number; cost: number; margin: number; metres?: number }

function MoneyFigures({ m, faint }: { m: MoneyCol; faint?: boolean }) {
  const pct = m.revenue ? (m.margin / m.revenue) * 100 : 0
  const costShare = m.revenue ? Math.min(100, (m.cost / m.revenue) * 100) : 0
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div>
        <div style={{ ...eyebrow }}>Margin</div>
        <div style={{ ...num, fontSize: 26, fontWeight: 600, color: m.margin < 0 ? 'var(--x-bad-text)' : T.text, lineHeight: 1.15, opacity: faint ? 0.92 : 1 }}>{moneyL(m.margin)}</div>
        <div style={{ fontSize: 12, color: T.faint, marginTop: 2 }}>{pct.toFixed(0)}% of billing{m.metres ? ` · ${perUnit(m.cost / m.metres)} cost a metre` : ''}</div>
      </div>
      {/* Billing split into what it cost and what it leaves. */}
      <div aria-label={`Billing ${moneyL(m.revenue)}: cost ${moneyL(m.cost)}, margin ${moneyL(m.margin)}`} style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: 'rgba(var(--x-ov),0.06)' }}>
        <span style={{ width: `${costShare}%`, background: 'var(--x-plan)' }} />
        <span style={{ flex: 1, background: T.green }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12.5 }}>
        <div><div style={{ color: T.faint }}><span aria-hidden style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: T.green, marginRight: 6 }} />Billing</div><div style={{ ...num, color: T.text, fontWeight: 600, fontSize: 14 }}>{moneyL(m.revenue)}</div></div>
        <div><div style={{ color: T.faint }}><span aria-hidden style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--x-plan)', marginRight: 6 }} />Cost</div><div style={{ ...num, color: T.text, fontWeight: 600, fontSize: 14 }}>{moneyL(m.cost)}</div></div>
      </div>
    </div>
  )
}

export function MoneyPanel({ today, month, monthClose, next, monthName, nextName, dayOfMonth, daysInMonth, lastSameDays, series }: {
  today: MoneyCol | null; month: MoneyCol; monthClose: MoneyCol & { low?: number; high?: number }; next: MoneyCol
  monthName: string; nextName: string; dayOfMonth: number; daysInMonth: number; lastSameDays: MoneyCol
  series: { date: string; revenue: number; cost: number; margin: number }[]
}) {
  const col: React.CSSProperties = { display: 'grid', alignContent: 'start', gap: 12, padding: '16px 18px', minWidth: 0 }
  const head = (t: string, sub: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: T.text, fontFamily: display }}>{t}</h3>
      <span style={{ fontSize: 12, color: T.faint }}>{sub}</span>
    </div>
  )
  const vsLast = lastSameDays.margin ? ((month.margin - lastSameDays.margin) / Math.abs(lastSameDays.margin)) * 100 : null
  const done = Math.min(100, (month.margin / Math.max(1, monthClose.margin)) * 100)
  return (
    <section aria-label="Money" style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: radius, overflow: 'hidden', boxShadow: 'var(--x-card-shadow)' }}>
      <header style={{ padding: '12px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: T.text, fontFamily: display }}>Money</h2>
          <div style={{ fontSize: 12.5, color: T.faint, marginTop: 2 }}>What the drilling billed, what it cost, and what it leaves: today, this month, and next month at today&apos;s pace.</div>
        </div>
        <Link href="/admin/finance" style={{ fontSize: 12.5, color: T.orange, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>Finance<ArrowRight size={13} aria-hidden /></Link>
      </header>
      <div className="xpl-money" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(250px, 100%), 1fr))' }}>
        <div style={{ ...col }}>
          {head('Today', 'shifts logged so far')}
          {today ? <MoneyFigures m={today} /> : <div style={{ fontSize: 13, color: T.faint }}>No costed shift yet today.</div>}
        </div>
        <div style={{ ...col, borderLeft: `1px solid ${T.border}` }} className="xpl-money-col">
          {head(monthName, `day ${dayOfMonth} of ${daysInMonth}`)}
          <MoneyFigures m={month} />
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: T.muted }}>
              <span>Expected close</span><span style={{ ...num, color: T.text, fontWeight: 600 }}>{moneyL(monthClose.margin)}</span>
            </div>
            <div aria-label={`${done.toFixed(0)}% of the expected margin is in`} style={{ height: 6, borderRadius: 3, background: 'rgba(var(--x-ov),0.07)', overflow: 'hidden' }}>
              <div style={{ width: `${done}%`, height: '100%', background: T.orange }} />
            </div>
            <div style={{ fontSize: 12, color: T.faint }}>{done.toFixed(0)}% in so far{vsLast != null ? <> · <span style={{ color: vsLast >= 0 ? 'var(--x-good-text)' : 'var(--x-bad-text)', fontWeight: 600 }}>{vsLast >= 0 ? '▲' : '▼'} {Math.abs(vsLast).toFixed(0)}%</span> on the same days last month</> : null}</div>
          </div>
        </div>
        <div style={{ ...col, borderLeft: `1px solid ${T.border}`, background: 'rgba(var(--x-ov),0.015)' }} className="xpl-money-col">
          {head(nextName, 'forecast')}
          <MoneyFigures m={next} faint />
          <div style={{ fontSize: 12, color: T.faint }}>From each rig&apos;s last 30 days over the holes planned. <Link href="/admin/intelligence/months" style={{ color: T.orange, fontWeight: 600, textDecoration: 'none' }}>Outlook →</Link></div>
        </div>
      </div>
      {series.length > 1 && (
        <div style={{ borderTop: `1px solid ${T.border}`, padding: '12px 18px 8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ ...eyebrow }}>Billing and cost by day, {monthName}</span>
            <span style={{ display: 'inline-flex', gap: 14, fontSize: 12, color: T.muted }}>
              <span><span aria-hidden style={{ display: 'inline-block', width: 14, height: 0, borderTop: `2px solid ${T.green}`, marginRight: 6, verticalAlign: 'middle' }} />Billing</span>
              <span><span aria-hidden style={{ display: 'inline-block', width: 14, height: 0, borderTop: '2px dashed var(--x-plan)', marginRight: 6, verticalAlign: 'middle' }} />Cost</span>
            </span>
          </div>
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={series.map(s => ({ ...s, label: dshort(s.date) }))} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
              <defs><linearGradient id="xpl-bill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--x-green)" stopOpacity={0.22} /><stop offset="100%" stopColor="var(--x-green)" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid stroke={gridStroke} vertical={false} />
              <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => moneyL(v)} />
              <Tooltip content={({ active, payload, label }) => active && payload?.length ? <Tip active label={label as string} payload={[
                { dataKey: 'revenue', name: 'Billing', value: moneyL(payload[0].payload.revenue), color: 'var(--x-green)' },
                { dataKey: 'cost', name: 'Cost', value: moneyL(payload[0].payload.cost), color: 'var(--x-plan)' },
                { dataKey: 'margin', name: 'Margin', value: moneyL(payload[0].payload.margin), color: 'transparent' },
              ]} /> : null} />
              <Area type="monotone" dataKey="revenue" stroke="var(--x-green)" strokeWidth={2} fill="url(#xpl-bill)" isAnimationActive={false} />
              <Area type="monotone" dataKey="cost" stroke="var(--x-plan)" strokeWidth={1.5} strokeDasharray="4 3" fill="none" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      <style>{`@media (max-width: 820px) { .xpl-money-col { border-left: none !important; border-top: 1px solid var(--x-border); } }`}</style>
    </section>
  )
}

/* ── KPI tiles with a small picture ─────────────────────────────────────── */

export function VizTile({ label, value, note, href, children, tone }: { label: string; value: React.ReactNode; note?: React.ReactNode; href?: string; children?: React.ReactNode; tone?: 'bad' | 'warn' }) {
  const style: React.CSSProperties = {
    display: 'grid', gridTemplateColumns: children ? 'minmax(0, 1fr) auto' : '1fr', gap: 10, alignItems: 'center', textDecoration: 'none',
    background: T.card, border: `1px solid ${T.border}`, borderRadius: radius, padding: '13px 15px',
    boxShadow: tone === 'bad' ? 'inset 3px 0 0 var(--x-red)' : tone === 'warn' ? 'inset 3px 0 0 var(--x-amber)' : 'var(--x-card-shadow)',
  }
  const inner = <>
    <div style={{ minWidth: 0, display: 'grid', gap: 5 }}>
      <span style={{ ...eyebrow }}>{label}</span>
      <span style={{ ...num, fontSize: 24, fontWeight: 600, color: T.text, lineHeight: 1.1 }}>{value}</span>
      {note && <span style={{ fontSize: 12, color: T.faint, lineHeight: 1.45 }}>{note}</span>}
    </div>
    {children && <div aria-hidden>{children}</div>}
  </>
  return href ? <Link href={href} className="xpl-row" style={style}>{inner}</Link> : <div style={style}>{inner}</div>
}

/* Last days as bars, the newest in the accent. */
export function SparkBars({ values, w = 96, h = 40 }: { values: number[]; w?: number; h?: number }) {
  const max = Math.max(1, ...values)
  const bw = w / Math.max(1, values.length)
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {values.map((v, i) => {
        const bh = v > 0 ? Math.max(2, (v / max) * (h - 2)) : 1.5
        return <rect key={i} x={i * bw + 1} y={h - bh} width={Math.max(1, bw - 2)} height={bh} rx={1} fill={i === values.length - 1 ? 'var(--x-orange)' : 'var(--x-blue)'} opacity={i === values.length - 1 ? 1 : 0.55} />
      })}
    </svg>
  )
}

/* A ring that fills to a share; the number is printed beside it. */
export function Ring({ share, size = 44, stroke = 6, color = 'var(--x-green)' }: { share: number; size?: number; stroke?: number; color?: string }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, share))
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(var(--x-ov),0.09)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${v * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  )
}

/* Two parts of a whole, side by side: own stops and client standby. */
export function SplitBar({ a, b, w = 96, colorA = 'var(--x-red)', colorB = 'var(--x-amber)' }: { a: number; b: number; w?: number; colorA?: string; colorB?: string }) {
  const t = a + b
  return (
    <svg width={w} height={10} viewBox={`0 0 ${w} 10`}>
      <rect x={0} y={0} width={w} height={10} rx={3} fill="rgba(var(--x-ov),0.07)" />
      {t > 0 && <rect x={0} y={0} width={(a / t) * w} height={10} rx={3} fill={colorA} />}
      {t > 0 && <rect x={(a / t) * w} y={0} width={(b / t) * w} height={10} rx={3} fill={colorB} />}
    </svg>
  )
}

/* ── ground mix ─────────────────────────────────────────────────────────── */

const GROUND: Record<string, string> = { Soft: '#5FB98C', Medium: 'var(--x-amber)', Hard: 'var(--x-orange-b)', 'Very Hard': 'var(--x-red)' }

export function GroundDonut({ rows }: { rows: { name: string; month: number; today: number }[] }) {
  const total = rows.reduce((s, r) => s + r.month, 0)
  const hard = rows.filter(r => r.name === 'Hard' || r.name === 'Very Hard').reduce((s, r) => s + r.month, 0)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: 18, alignItems: 'center' }}>
      <div style={{ position: 'relative', width: 148, height: 148 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows} dataKey="month" nameKey="name" innerRadius={48} outerRadius={70} startAngle={90} endAngle={-270} stroke="var(--x-card)" strokeWidth={2} isAnimationActive={false}>
              {rows.map(r => <Cell key={r.name} fill={GROUND[r.name] ?? 'var(--x-blue)'} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', textAlign: 'center' }}>
          <span style={{ ...num, fontSize: 20, fontWeight: 600, color: T.text }}>{total ? Math.round((hard / total) * 100) : 0}%</span>
          <span style={{ fontSize: 11, color: T.faint }}>hard or<br />very hard</span>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 9, minWidth: 0 }}>
        {rows.map(r => (
          <div key={r.name} style={{ display: 'grid', gridTemplateColumns: '10px minmax(0, 1fr) auto', gap: 8, alignItems: 'baseline', fontSize: 13 }}>
            <span aria-hidden style={{ width: 10, height: 10, borderRadius: 2, background: GROUND[r.name] ?? 'var(--x-blue)' }} />
            <span style={{ color: T.text, fontWeight: 600 }}>{r.name} <span style={{ color: T.faint, fontWeight: 400 }}>{total ? Math.round((r.month / total) * 100) : 0}%</span></span>
            <span style={{ ...num, fontSize: 12.5, color: T.text, textAlign: 'right' }}>{Math.round(r.month).toLocaleString('en-US')} m<span style={{ color: T.faint }}> · {Math.round(r.today)} today</span></span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── stock: one bar, three parts ────────────────────────────────────────── */

export function StockBar({ store, rigs, idle, idleDays }: { store: number; rigs: number; idle: number; idleDays: number }) {
  const total = store + rigs
  const parts = [
    { k: 'In the stores', v: store - Math.min(idle, store), c: 'var(--x-blue)' },
    { k: `Idle ${idleDays}+ days`, v: Math.min(idle, store), c: 'var(--x-red)' },
    { k: 'On the rigs', v: rigs, c: 'var(--x-teal)' },
  ]
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ ...num, fontSize: 24, fontWeight: 600, color: T.text }}>{moneyL(total)}</span><span style={{ fontSize: 12.5, color: T.faint }}>held in stock</span>
      </div>
      <div aria-hidden style={{ display: 'flex', height: 12, borderRadius: 4, overflow: 'hidden', gap: 2 }}>
        {parts.filter(p => p.v > 0).map(p => <span key={p.k} style={{ width: `${(p.v / Math.max(1, total)) * 100}%`, background: p.c }} />)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
        {parts.map(p => (
          <div key={p.k} style={{ fontSize: 12.5 }}>
            <div style={{ color: T.faint }}><span aria-hidden style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: p.c, marginRight: 6 }} />{p.k}</div>
            <div style={{ ...num, color: p.k.startsWith('Idle') && p.v > 0 ? 'var(--x-bad-text)' : T.text, fontWeight: 600, fontSize: 14 }}>{moneyL(p.v)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── cost against what a metre earns ────────────────────────────────────── */

/* A bullet: the bar is what a metre cost, the tick is what it earned. */
export function CostBullet({ cost, earned, max, w = 120 }: { cost: number | null; earned: number | null; max: number; w?: number }) {
  if (cost == null) return <span style={{ color: T.faint }}>—</span>
  const x = (v: number) => Math.min(w, (v / Math.max(1, max)) * w)
  const over = earned != null && cost > earned
  return (
    <svg width={w} height={14} viewBox={`0 0 ${w} 14`} role="img" aria-label={`Cost ${perUnit(cost)}${earned != null ? `, earned ${perUnit(earned)}` : ''}`}>
      <rect x={0} y={3} width={w} height={8} rx={3} fill="rgba(var(--x-ov),0.06)" />
      <rect x={0} y={3} width={x(cost)} height={8} rx={3} fill={over ? 'var(--x-red)' : 'var(--x-plan)'} />
      {earned != null && <rect x={x(earned) - 1.5} y={0} width={3} height={14} rx={1} fill="var(--x-text)" />}
    </svg>
  )
}

export const tintOf = tint
