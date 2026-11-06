'use client'

import { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { T, tint, display, Card, Status, type Tone } from './kit'

/* ==========================================================================
 * OUTLOOK — the pieces a forecast is shown with
 *
 * Used by XPLORIX Intelligence (the contractor) and by AI prediction in the
 * client login. Same shapes on both sides, different facts.
 *
 *   Timeline     who drills what, day by day, and where the gaps are
 *   SwotGrid     what is working, what is not, what can be gained, what can go wrong
 *   RiskTable    each risk with a date, a rupee figure, a chance and an action
 *   Basis        how the forecast was worked out, in plain words
 * ========================================================================== */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const day = (date: string) => { const [, m, d] = date.split('-').map(Number); return `${d} ${MON[m - 1]}` }
const gap = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000)
const plus = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)

// ── TIMELINE ──────────────────────────────────────────────────────────────

export interface Bar {
  kind: 'work' | 'move' | 'idle'
  from: string; to: string
  label?: string
  title?: string
  ends?: boolean       // the hole reaches planned depth at the end of this bar
}
export interface Lane { key: string; label: ReactNode; sub?: ReactNode; bars: Bar[] }

export function Timeline({ lanes, start, end, split, splitLabel, idleLabel = 'No hole planned' }: {
  lanes: Lane[]; start: string; end: string
  split?: string; splitLabel?: string; idleLabel?: string
}) {
  const total = gap(start, end) + 1
  const pos = (date: string) => (gap(start, date) / total) * 100
  const width = (from: string, to: string) => ((gap(from, to) + 1) / total) * 100
  const ticks: string[] = []
  for (let d = start; d <= end; d = plus(d, 7)) ticks.push(d)

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 720 }}>
        {/* dates */}
        <div style={{ display: 'flex', marginBottom: 6 }}>
          <div style={{ width: 150, flexShrink: 0 }} />
          <div style={{ position: 'relative', flex: 1, height: 18 }}>
            {ticks.map(t => (
              <span key={t} style={{ position: 'absolute', left: `${pos(t)}%`, fontSize: 11, color: T.faint, whiteSpace: 'nowrap' }}>{day(t)}</span>
            ))}
          </div>
        </div>

        {lanes.map(lane => (
          <div key={lane.key} style={{ display: 'flex', alignItems: 'center', padding: '7px 0', borderTop: `1px solid ${T.line}` }}>
            <div style={{ width: 150, flexShrink: 0, paddingRight: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{lane.label}</div>
              {lane.sub && <div style={{ fontSize: 11.5, color: T.faint, marginTop: 2 }}>{lane.sub}</div>}
            </div>
            <div style={{ position: 'relative', flex: 1, height: 34 }}>
              {ticks.map(t => (
                <span key={t} aria-hidden style={{ position: 'absolute', left: `${pos(t)}%`, top: -7, bottom: -7, width: 1, background: T.line }} />
              ))}
              {split && (
                <span aria-hidden style={{ position: 'absolute', left: `${pos(split)}%`, top: -7, bottom: -7, width: 1, background: T.faint }} />
              )}
              {lane.bars.map((b, i) => {
                const w = width(b.from, b.to)
                const base: React.CSSProperties = {
                  position: 'absolute', left: `${pos(b.from)}%`, width: `calc(${w}% - 2px)`, top: 3, height: 28,
                  borderRadius: 5, display: 'flex', alignItems: 'center', overflow: 'hidden',
                  fontSize: 11.5, whiteSpace: 'nowrap', padding: '0 7px',
                }
                if (b.kind === 'move') return (
                  <div key={i} title={b.title ?? 'Rig move'} style={{ ...base, padding: 0, top: 13, height: 8, background: T.dim, borderRadius: 2 }} />
                )
                if (b.kind === 'idle') return (
                  <div key={i} title={b.title} style={{
                    ...base, color: T.text, fontWeight: 600,
                    border: `1px dashed ${T.amber}`,
                    background: `repeating-linear-gradient(135deg, ${tint(T.amber, 20)} 0 6px, ${tint(T.amber, 7)} 6px 12px)`,
                  }}>{w > 9 ? idleLabel : w > 4 ? 'Idle' : ''}</div>
                )
                return (
                  <div key={i} title={b.title} style={{
                    ...base, color: T.text, fontWeight: 600,
                    background: tint(T.bar, 24), border: `1px solid ${tint(T.bar, 60)}`,
                  }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{w > 5 ? b.label : ''}</span>
                    {b.ends && w > 5 && <span aria-hidden style={{ marginLeft: 'auto', paddingLeft: 6, color: T.muted, fontWeight: 500 }}>✓</span>}
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {split && (
          <div style={{ display: 'flex', marginTop: 4 }}>
            <div style={{ width: 150, flexShrink: 0 }} />
            <div style={{ position: 'relative', flex: 1, height: 16 }}>
              <span style={{ position: 'absolute', left: `calc(${pos(split)}% + 6px)`, fontSize: 11, fontWeight: 600, color: T.muted, whiteSpace: 'nowrap' }}>{splitLabel}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function TimelineKey({ idle = 'Idle: no hole planned', move = true }: { idle?: string; move?: boolean }) {
  const item: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7 }
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: T.muted }}>
      <span style={item}><span aria-hidden style={{ width: 18, height: 10, borderRadius: 3, background: tint(T.bar, 24), border: `1px solid ${tint(T.bar, 60)}` }} />Drilling a hole</span>
      <span style={item}><span aria-hidden style={{ fontWeight: 700, color: T.muted }}>✓</span>Reaches planned depth</span>
      {move && <span style={item}><span aria-hidden style={{ width: 14, height: 6, borderRadius: 2, background: T.dim }} />Rig move</span>}
      <span style={item}><span aria-hidden style={{ width: 18, height: 10, borderRadius: 3, border: `1px dashed ${T.amber}`, background: tint(T.amber, 18) }} />{idle}</span>
    </div>
  )
}

// ── SWOT ──────────────────────────────────────────────────────────────────

export interface SwotEntry { title: string; detail: string; figure?: string; href?: string }

const QUAD: { key: 'strengths' | 'weaknesses' | 'opportunities' | 'threats'; letter: string; name: string; says: string; tone: Tone }[] = [
  { key: 'strengths', letter: 'S', name: 'Strengths', says: 'What is working for you', tone: 'good' },
  { key: 'weaknesses', letter: 'W', name: 'Weaknesses', says: 'What is costing you today', tone: 'warn' },
  { key: 'opportunities', letter: 'O', name: 'Opportunities', says: 'What you can gain', tone: 'info' },
  { key: 'threats', letter: 'T', name: 'Threats', says: 'What can go wrong', tone: 'bad' },
]
const toneOf: Record<Tone, string> = { good: T.green, warn: T.amber, bad: T.red, info: T.blue, neutral: T.faint }

export function SwotGrid({ swot, empty }: {
  swot: Record<'strengths' | 'weaknesses' | 'opportunities' | 'threats', SwotEntry[]>
  empty?: Partial<Record<'strengths' | 'weaknesses' | 'opportunities' | 'threats', string>>
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 400px), 1fr))', gap: 12 }}>
      {QUAD.map(q => {
        const c = toneOf[q.tone]
        const items = swot[q.key]
        return (
          <section key={q.key} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden', minWidth: 0 }}>
            <header style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 16px', borderBottom: `1px solid ${T.line}` }}>
              <span aria-hidden style={{
                width: 26, height: 26, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: display, fontSize: 14, fontWeight: 700, color: T.text, background: tint(c, 20), border: `1px solid ${tint(c, 50)}`,
              }}>{q.letter}</span>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text }}>{q.name}</div>
                <div style={{ fontSize: 12, color: T.faint, marginTop: 1 }}>{q.says}</div>
              </div>
            </header>
            {items.length === 0 && (
              <div style={{ padding: '16px', fontSize: 13, color: T.faint }}>{empty?.[q.key] ?? 'Nothing to report here.'}</div>
            )}
            {items.map((it, i) => {
              const body = (
                <div className={it.href ? 'xpl-row' : undefined} style={{ display: 'flex', gap: 14, padding: '12px 16px', borderTop: i ? `1px solid ${T.line}` : undefined, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text, lineHeight: 1.4 }}>{it.title}</div>
                    <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.55, marginTop: 3 }}>{it.detail}</div>
                  </div>
                  {it.figure && (
                    <div style={{ fontFamily: display, fontSize: 15, fontWeight: 700, color: T.text, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{it.figure}</div>
                  )}
                </div>
              )
              return it.href
                ? <Link key={i} href={it.href} style={{ display: 'block', textDecoration: 'none' }}>{body}</Link>
                : <div key={i}>{body}</div>
            })}
          </section>
        )
      })}
    </div>
  )
}

// ── RISKS ─────────────────────────────────────────────────────────────────

export interface RiskRow {
  key: string; title: string; detail: string
  when: string
  impact: string; impactNote?: string
  likelihood: 'High' | 'Medium' | 'Low'
  action: string
  href?: string; linkLabel?: string
}
const chanceTone: Record<RiskRow['likelihood'], Tone> = { High: 'bad', Medium: 'warn', Low: 'neutral' }

export function RiskTable({ risks, stake = 'At stake' }: { risks: RiskRow[]; stake?: string }) {
  const head: React.CSSProperties = {
    padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: T.faint,
    letterSpacing: '0.03em', whiteSpace: 'nowrap', borderBottom: `1px solid ${T.border}`,
  }
  const cell: React.CSSProperties = { padding: '13px 14px', fontSize: 13, color: T.muted, verticalAlign: 'top', lineHeight: 1.5 }
  if (!risks.length) return <div style={{ padding: 20, fontSize: 13.5, color: T.faint }}>No risks found for the period.</div>
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
        <thead>
          <tr>
            <th style={{ ...head, width: '31%' }}>Risk</th>
            <th style={head}>When</th>
            <th style={{ ...head, textAlign: 'right' }}>{stake}</th>
            <th style={head}>Chance</th>
            <th style={{ ...head, width: '34%' }}>What to do</th>
          </tr>
        </thead>
        <tbody>
          {risks.map(r => (
            <tr key={r.key} style={{ borderBottom: `1px solid ${T.line}` }}>
              <td style={cell}>
                <div style={{ fontWeight: 600, color: T.text }}>{r.title}</div>
                <div style={{ fontSize: 12.5, marginTop: 3 }}>{r.detail}</div>
              </td>
              <td style={{ ...cell, whiteSpace: 'nowrap', color: T.text }}>{r.when}</td>
              <td style={{ ...cell, textAlign: 'right', whiteSpace: 'nowrap' }}>
                <div style={{ fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums' }}>{r.impact}</div>
                {r.impactNote && <div style={{ fontSize: 11.5, color: T.faint, marginTop: 2, whiteSpace: 'normal', maxWidth: 150, marginLeft: 'auto' }}>{r.impactNote}</div>}
              </td>
              <td style={cell}><Status tone={chanceTone[r.likelihood]}>{r.likelihood}</Status></td>
              <td style={cell}>
                <div>{r.action}</div>
                {r.href && (
                  <Link href={r.href} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 12.5, fontWeight: 600, color: T.orange, textDecoration: 'none' }}>
                    {r.linkLabel ?? 'Open'} <ArrowRight size={13} />
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── RANGE ─────────────────────────────────────────────────────────────────

/* Low, expected and high on one line, so the range is seen and not just read. */
export function RangeBar({ low, mid, high, unit = '' }: { low: number; mid: number; high: number; unit?: string }) {
  const lo = Math.min(low, mid), hi = Math.max(high, mid)
  const span = Math.max(hi - lo, 1)
  const pad = span * 0.12
  const at = (v: number) => ((v - (lo - pad)) / (span + pad * 2)) * 100
  const n = (v: number) => Math.round(v).toLocaleString('en-US')
  return (
    <div>
      <div style={{ position: 'relative', height: 16 }}>
        <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 7, height: 2, background: T.line }} />
        <span aria-hidden style={{ position: 'absolute', left: `${at(lo)}%`, width: `${at(hi) - at(lo)}%`, top: 5, height: 6, borderRadius: 3, background: tint(T.bar, 45) }} />
        <span aria-hidden style={{ position: 'absolute', left: `calc(${at(mid)}% - 2px)`, top: 1, width: 4, height: 14, borderRadius: 2, background: T.text }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: T.faint, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
        <span>Slow {n(lo)}{unit}</span><span>Best {n(hi)}{unit}</span>
      </div>
    </div>
  )
}

// ── BASIS ─────────────────────────────────────────────────────────────────

export function Basis({ title = 'How XPLORIX worked this out', lines, note }: { title?: string; lines: string[]; note?: ReactNode }) {
  return (
    <Card title={title} subtitle="No hidden numbers. Every figure above comes from records you can open.">
      <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
        {lines.map((l, i) => (
          <li key={i} style={{ display: 'flex', gap: 12, fontSize: 13, color: T.muted, lineHeight: 1.55 }}>
            <span aria-hidden style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 6, background: tint(T.faint, 18), color: T.text, fontSize: 11.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>{i + 1}</span>
            <span>{l}</span>
          </li>
        ))}
      </ol>
      {note && <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.line}`, fontSize: 12.5, color: T.faint, lineHeight: 1.6 }}>{note}</div>}
    </Card>
  )
}
