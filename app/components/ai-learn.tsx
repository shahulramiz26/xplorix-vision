'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { Gauge, Ruler, MessageSquareQuote, Target } from 'lucide-react'
import { learning, type Learning, type Learned } from '../../lib/ai/learn'
import { dw, n0 } from '../../lib/ai/record'
import { useAiCtx, AiMark } from './ai'
import { Card, T, tint, display, axisTick, gridStroke, Tip, Legend, num } from './kit'

/* ==========================================================================
 * FORECASTS THAT LEARN, ON SCREEN
 *
 * <ForecastCheck>  Outlook: each past week's forecast against what was drilled,
 *                  with the reason for the biggest miss.
 * <LearnedCard>    the AI Scorecard: what XPLORIX has corrected from the record.
 *
 * Re-running six weeks of forecasts takes a moment, so it is worked out just
 * after the page has drawn rather than holding the page back.
 * ========================================================================== */

export function useLearning(): Learning | null {
  const ctx = useAiCtx()
  const [l, setL] = useState<Learning | null>(null)
  useEffect(() => {
    const t = setTimeout(() => { try { setL(learning(ctx)) } catch { setL({ weeks: [], accuracy: null, trend: null, learned: [] }) } }, 30)
    return () => clearTimeout(t)
  }, [ctx])
  return l
}

export function ForecastCheck({ l }: { l: Learning | null }) {
  if (!l) return <Card title="Forecast against what was drilled" subtitle="Checking past weeks…"><div style={{ height: 120 }} /></Card>
  if (!l.weeks.length) return null
  const data = l.weeks.map(w => ({ week: `${dw(w.from)}`, Forecast: Math.round(w.forecast), Drilled: Math.round(w.actual) }))
  const misses = l.weeks.filter(w => w.miss && Math.abs(w.errorPct) >= 10)
  return (
    <Card title="Forecast against what was drilled"
      subtitle="Each week, the forecast as it stood the Sunday before, from only the shifts logged by then, against the metres the rigs then drilled."
      right={<AiMark label="Forecasts that learn" size={11} />}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', gap: 20, alignItems: 'start' }}>
        <div>
          <div style={{ display: 'flex', gap: 18, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 8 }}>
            <div><div style={{ ...num, fontSize: 28, fontWeight: 600, color: T.text }}>{l.accuracy != null ? `${Math.round(l.accuracy)}%` : '—'}</div><div style={{ fontSize: 12, color: T.muted }}>accuracy, last {l.weeks.length} weeks</div></div>
            <div style={{ fontSize: 12.5, color: T.muted, maxWidth: 260, lineHeight: 1.5 }}>{l.trend === 'better' ? 'The misses are getting smaller as more shifts come in.' : l.trend === 'worse' ? 'The misses grew in the middle weeks; the reasons are listed alongside.' : 'Steady. Most misses are stops nobody could see coming.'}</div>
          </div>
          <Legend items={[{ color: tint(T.orange, 55), label: 'Forecast' }, { color: T.bar, label: 'Drilled' }]} />
          <div style={{ height: 210, marginTop: 8 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 6, right: 4, left: -14, bottom: 0 }} barGap={2}>
                <CartesianGrid stroke={gridStroke} vertical={false} />
                <XAxis dataKey="week" tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'rgba(var(--x-ov),0.04)' }} content={<Tip unit=" m" />} />
                <Bar dataKey="Forecast" fill={tint(T.orange, 55)} radius={[3, 3, 0, 0]} />
                <Bar dataKey="Drilled" fill={T.bar} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Why it missed</div>
          {misses.length === 0 && <div style={{ fontSize: 13, color: T.muted }}>Every week was within 10%.</div>}
          {misses.map(w => (
            <div key={w.from} style={{ display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr)', gap: 10, fontSize: 13, lineHeight: 1.5, paddingBottom: 8, borderBottom: `1px solid ${T.line}` }}>
              <span style={{ fontWeight: 700, color: Math.abs(w.errorPct) >= 30 ? 'var(--x-bad-text)' : T.text }}>{w.errorPct > 0 ? '+' : '−'}{Math.round(Math.abs(w.errorPct))}%</span>
              <span style={{ color: T.muted }}>Week of {dw(w.from)}: {n0(w.forecast)} m forecast, {n0(w.actual)} m drilled. <b style={{ color: T.text, fontWeight: 600 }}>{w.miss!.rig}</b> made {n0(w.miss!.actual)} m against {n0(w.miss!.forecast)} m because {w.miss!.why}.</span>
            </div>
          ))}
          <div style={{ fontSize: 12, color: T.faint, lineHeight: 1.5 }}>Every week the pace of each rig, the life of each part in each ground and the hole plan are read again from the record, so the next forecast starts from what really happened.</div>
        </div>
      </div>
    </Card>
  )
}

const ICON: Record<Learned['kind'], React.ElementType> = { accuracy: Target, pace: Gauge, part: Ruler, feedback: MessageSquareQuote }

export function LearnedCard({ l }: { l: Learning | null }) {
  return (
    <Card title="What XPLORIX has learned from your record" subtitle="Corrections the AI made from your own shifts, parts and answers. Each one changes what it says next." right={<AiMark size={11} />} pad={false}>
      {!l ? <div style={{ padding: 18, fontSize: 13, color: T.faint }}>Reading the record…</div> : l.learned.length === 0
        ? <div style={{ padding: 18, fontSize: 13, color: T.faint }}>Nothing yet: it needs a few weeks of shifts.</div>
        : l.learned.map((x, i) => {
          const Icon = ICON[x.kind]
          const body = (
            <div style={{ display: 'flex', gap: 12, padding: '12px 18px', borderTop: i ? `1px solid ${T.line}` : 'none', alignItems: 'flex-start' }}>
              <span aria-hidden style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: tint(T.orange, 12) }}><Icon size={15} style={{ color: T.orange }} /></span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text, lineHeight: 1.4 }}>{x.title}</div>
                <div style={{ fontSize: 12.5, color: T.muted, marginTop: 3, lineHeight: 1.5 }}>{x.detail}</div>
              </div>
            </div>
          )
          return x.href ? <Link key={i} href={x.href} className="xpl-row" style={{ display: 'block', textDecoration: 'none' }}>{body}</Link> : <div key={i}>{body}</div>
        })}
    </Card>
  )
}
