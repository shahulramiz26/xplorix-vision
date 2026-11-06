'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useCosting, moneyL } from '../../../lib/costing-store'
import { useInventory, TODAY } from '../../../lib/inventory-store'
import { buildValue } from '../../../lib/value'
import { earlyWarnings } from '../../../lib/outlook-analytics'
import { answersOf, buildScorecard, scoreWord, type Score } from '../../../lib/scorecard'
import { useInbox } from '../../components/inbox'
import { WarningCard } from '../../components/outlook-charts'
import { LearnedCard, useLearning } from '../../components/ai-learn'
import { Page, Card, Table, Empty, T, tint, display, th, thR, td, tdR, tdStrong, rowLine } from '../../components/kit'

/* ==========================================================================
 * AI SCORECARD — is XPLORIX AI right, and is the team acting on it?
 *
 * Four scores out of 100 from the record (lib/scorecard.ts), the overall
 * score, how they move month by month, the departments, what was set aside
 * and why, and the measures the findings are meant to move. Money proven by
 * an invoice, a bill or an order is kept to a note at the end.
 * ========================================================================== */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const day = (d: string) => `${Number(d.slice(8, 10))} ${MON[Number(d.slice(5, 7)) - 1]}`
const colorOf = (n: number | null) => n == null ? 'var(--x-faint)' : n >= 80 ? T.green : n >= 60 ? '#65a30d' : n >= 40 ? T.amber : T.red

function Ring({ value, size = 120, stroke = 12, label }: { value: number | null; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r
  const v = value ?? 0
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label ?? 'Score'} ${value ?? 'not enough data'} out of 100`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(var(--x-ov),0.08)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colorOf(value)} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${(v / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontFamily={display} fontWeight={700} fontSize={size * 0.3} fill="var(--x-text)">{value ?? '—'}</text>
    </svg>
  )
}

export default function ScorecardPage() {
  const { state } = useCosting()
  const { state: inv } = useInventory()
  const inbox = useInbox()
  const [proofOpen, setProofOpen] = useState(false)
  const learned = useLearning()
  const answers = useMemo(() => answersOf(state.findingStatus ?? {}), [state.findingStatus])
  const warnings = useMemo(() => earlyWarnings(state, inv, TODAY), [state, inv])
  const sc = useMemo(() => buildScorecard(answers, inbox, warnings), [answers, inbox, warnings])
  const value = useMemo(() => buildValue(state, inv, inbox, '0000-01-01', TODAY), [state, inv, inbox])
  const proven = value.lines.filter(l => l.kind === 'proven')
  const weakest = sc.scores.filter(s => s.score != null).sort((a, b) => (a.score as number) - (b.score as number))[0]

  return (
    <Page>
      <div>
        <h1 style={{ margin: 0, fontFamily: display, fontSize: 22, fontWeight: 600, color: T.text }}>AI Scorecard</h1>
        <p style={{ margin: '5px 0 0', fontSize: 13.5, color: T.muted }}>Is XPLORIX AI right, and is the team acting on it? Four scores out of 100, all from your own record. <span style={{ display: 'inline-block', fontSize: 11.5, fontWeight: 600, padding: '1px 8px', borderRadius: 99, background: tint(T.blue, 12), color: T.text }}>Demo data</span></p>
      </div>

      <section aria-label="Overall score" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(210px, 100%), 1fr))', gap: 12 }}>
        <div style={{ background: tint(colorOf(sc.overall), 8), border: `1px solid ${tint(colorOf(sc.overall), 35)}`, borderRadius: 10, padding: 16, display: 'grid', gap: 10, justifyItems: 'start', boxShadow: 'var(--x-card-shadow)' }}>
          <Ring value={sc.overall} size={96} stroke={11} label="Overall" />
          <div style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: T.muted, letterSpacing: '0.05em' }}>OVERALL</span>
            <span style={{ fontFamily: display, fontSize: 24, fontWeight: 700, color: colorOf(sc.overall) }}>{scoreWord(sc.overall)}</span>
            <span style={{ fontSize: 13, color: T.muted, lineHeight: 1.5 }}>{weakest ? <>Lowest: <b style={{ color: T.text }}>{weakest.label}</b>. {weakest.key === 'coverage' ? 'Answer what is waiting in Tasks to lift it.' : weakest.key === 'speed' ? 'Answer findings the day they come in.' : weakest.key === 'useful' ? 'Too much is set aside; the reasons below show where XPLORIX needs sharpening.' : 'The measures are not moving yet; the findings behind them are in Tasks.'}</> : null}</span>
            {weakest?.key === 'coverage' && <Link href="/admin/tasks?dept=all" style={{ fontSize: 13, fontWeight: 600, color: T.orange, textDecoration: 'none' }}>Open Tasks →</Link>}
          </div>
        </div>
        {sc.scores.map(s => <ScoreTile key={s.key} s={s} />)}
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(460px, 100%), 1fr))', gap: 16, alignItems: 'start' }}>
        <Card title="Month by month" subtitle="Useful and speed, from the findings answered each month.">
          {sc.trend.length === 0 ? <Empty>Nothing answered yet.</Empty> : <TrendBars trend={sc.trend} />}
        </Card>
        <Card title="By department" subtitle="Who answers, how fast, and how much XPLORIX gets right for them." pad={false}>
          <Table>
            <thead><tr><th style={th}>Department</th><th style={thR}>Answered</th><th style={th}>Useful</th><th style={thR}>Days to answer</th><th style={thR}>Still open</th></tr></thead>
            <tbody>
              {sc.byDept.map(d => (
                <tr key={d.dept} style={{ borderTop: rowLine }}>
                  <td style={tdStrong}>{d.label}</td>
                  <td style={tdR}>{d.answered || '—'}</td>
                  <td style={{ ...td, minWidth: 130 }}>{d.useful == null ? <span style={{ color: T.faint }}>—</span> : (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span aria-hidden style={{ flex: 1, height: 8, borderRadius: 99, background: 'rgba(var(--x-ov),0.07)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${d.useful}%`, background: colorOf(d.useful) }} /></span>
                      <b style={{ color: T.text, fontSize: 12.5, minWidth: 34, textAlign: 'right' }}>{d.useful}%</b>
                    </span>)}</td>
                  <td style={tdR}>{d.medianDays == null ? '—' : d.medianDays <= 1 ? '≤ 1' : d.medianDays.toFixed(d.medianDays % 1 ? 1 : 0)}</td>
                  <td style={{ ...tdR, color: d.open ? T.text : T.muted, fontWeight: d.open ? 600 : 400 }}>{d.open || '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>

      <Card title="Results: the measures the findings are meant to move" subtitle="Six weeks of each. Better counts fully, steady counts half, worse counts nothing.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(230px, 100%), 1fr))', gap: 12 }}>
          {warnings.map(w => <WarningCard key={w.key} w={w} />)}
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(460px, 100%), 1fr))', gap: 16, alignItems: 'start' }}>
        <LearnedCard l={learned} />
        <Card title="Recently answered" subtitle="Found, and how many days until someone answered it." pad={false}>
          {sc.answers.slice(0, 8).map((a, i) => (
            <div key={a.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, padding: '10px 18px', borderTop: i ? rowLine : 'none', alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}><div style={{ fontSize: 13.5, color: T.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</div><div style={{ fontSize: 12, color: T.faint }}>Found {day(a.found)} · {a.status === 'dismissed' ? 'set aside' : 'acted on'}</div></div>
              <span style={{ fontSize: 12.5, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: tint(colorOf(Math.max(0, 100 - (a.days * 100) / 7)), 15), color: T.text, whiteSpace: 'nowrap' }}>{a.days === 0 ? 'Same day' : `${a.days} ${a.days === 1 ? 'day' : 'days'}`}</span>
            </div>
          ))}
        </Card>
      </div>

      <section style={{ border: `1px dashed ${T.border}`, borderRadius: 10, padding: '12px 18px', display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: T.muted }}>Money proven so far: <b style={{ color: T.text }}>{moneyL(value.totals.proven)}</b>, each line backed by an invoice paid, a bill cut or an order not placed.</span>
          {proven.length > 0 && <button type="button" onClick={() => setProofOpen(o => !o)} style={{ background: 'none', border: 'none', color: T.orange, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, padding: 0 }}>{proofOpen ? 'Hide' : 'Show the proof'}</button>}
        </div>
        {proofOpen && proven.map(l => (
          <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5, color: T.muted }}><span><b style={{ color: T.text }}>{l.what}</b> · {l.proof}</span><span style={{ whiteSpace: 'nowrap', color: T.text, fontWeight: 600 }}>{moneyL(l.money)}</span></div>
        ))}
      </section>
    </Page>
  )
}

function ScoreTile({ s }: { s: Score }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 14, display: 'grid', gap: 6, alignContent: 'start', boxShadow: 'var(--x-card-shadow)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Ring value={s.score} size={58} stroke={7} label={s.label} />
        <div style={{ display: 'grid' }}>
          <b style={{ fontSize: 14, color: T.text }}>{s.label}</b>
          <span style={{ fontSize: 12, fontWeight: 600, color: colorOf(s.score) }}>{scoreWord(s.score)}</span>
        </div>
      </div>
      <span style={{ fontSize: 12.5, color: T.text, lineHeight: 1.4 }}>{s.line}</span>
      <span style={{ fontSize: 11.5, color: T.faint, lineHeight: 1.45 }}>{s.detail}</span>
    </div>
  )
}

function TrendBars({ trend }: { trend: { month: string; n: number; useful: number | null; speed: number | null }[] }) {
  const W = 560, H = 230, PL = 34, PB = 40, PT = 20
  const slot = (W - PL - 10) / trend.length
  const bw = Math.min(34, slot * 0.28)
  const y = (v: number) => PT + (1 - v / 100) * (H - PT - PB)
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label={trend.map(t => `${MON[Number(t.month.slice(5, 7)) - 1]}: useful ${t.useful}, speed ${t.speed}`).join('; ')}>
        {[0, 50, 100].map(v => <g key={v}><line x1={PL} x2={W - 10} y1={y(v)} y2={y(v)} stroke="var(--x-border)" opacity={0.5} /><text x={PL - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--x-faint)">{v}</text></g>)}
        {trend.map((t, i) => {
          const cx = PL + slot * (i + 0.5)
          return (
            <g key={t.month}>
              {t.useful != null && <><rect x={cx - bw - 3} y={y(t.useful)} width={bw} height={H - PB - y(t.useful)} rx={4} fill={T.blue} /><text x={cx - bw / 2 - 3} y={y(t.useful) - 6} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--x-text)">{t.useful}</text></>}
              {t.speed != null && <><rect x={cx + 3} y={y(t.speed)} width={bw} height={H - PB - y(t.speed)} rx={4} fill={T.orange} /><text x={cx + bw / 2 + 3} y={y(t.speed) - 6} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--x-text)">{t.speed}</text></>}
              <text x={cx} y={H - 20} textAnchor="middle" fontSize={12} fill="var(--x-muted)">{MON[Number(t.month.slice(5, 7)) - 1]}</text>
              <text x={cx} y={H - 6} textAnchor="middle" fontSize={10.5} fill="var(--x-faint)">{t.n} answered</text>
            </g>
          )
        })}
      </svg>
      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: T.muted, marginTop: 6 }}>
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><span aria-hidden style={{ width: 12, height: 10, borderRadius: 2, background: T.blue }} />Useful</span>
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><span aria-hidden style={{ width: 12, height: 10, borderRadius: 2, background: T.orange }} />Speed</span>
      </div>
    </>
  )
}
