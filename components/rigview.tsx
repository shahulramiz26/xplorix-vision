'use client'

import { Activity, ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { nextBroken, stopCall, targetLevel } from '../lib/ground'
import { holeOf, projectOf } from '../lib/data'
import type { Live, Reading } from '../lib/rig'

/* One rig on the Pulse screen: readings with their status in words, the last
 * hour as streaming area charts with out-of-range points marked, and the hole
 * with the rock ahead of the bit. */

type Key = keyof Omit<Reading, 't'>
export interface Metric { k: Key; label: string; unit: string; min: number; max: number; lo: number; hi: number; dp: number }
export const METRICS: Metric[] = [
  { k: 'rop', label: 'Penetration', unit: 'm/h', min: 0, max: 1.2, lo: 0.3, hi: 1.2, dp: 2 },
  { k: 'torque', label: 'Torque', unit: 'N·m', min: 0, max: 1600, lo: 300, hi: 1000, dp: 0 },
  { k: 'pressure', label: 'Water pressure', unit: 'bar', min: 0, max: 45, lo: 10, hi: 24, dp: 1 },
  { k: 'flow', label: 'Water flow', unit: 'L/min', min: 0, max: 70, lo: 36, hi: 62, dp: 0 },
  { k: 'engine', label: 'Engine', unit: '°C', min: 40, max: 110, lo: 60, hi: 92, dp: 0 },
  { k: 'rpm', label: 'Rotation', unit: 'rpm', min: 0, max: 1200, lo: 600, hi: 1050, dp: 0 },
  { k: 'wob', label: 'Bit load', unit: 'kN', min: 0, max: 40, lo: 10, hi: 32, dp: 1 },
  { k: 'fuel', label: 'Fuel', unit: '%', min: 0, max: 100, lo: 20, hi: 100, dp: 0 },
]
export type State = 'normal' | 'watch' | 'out' | 'idle'
export const STATE_WORD: Record<State, string> = { normal: 'Normal', watch: 'Watch', out: 'Out of range', idle: 'Not running' }
export const STATE_C: Record<State, string> = { normal: 'var(--green)', watch: 'var(--amber)', out: 'var(--red)', idle: 'var(--faint)' }
export const fmt = (v: number, dp: number) => v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
export function stateOf(m: Metric, v: number, drilling: boolean): State {
  if (!drilling && m.k !== 'engine' && m.k !== 'fuel') return 'idle'
  if (v >= m.lo && v <= m.hi) return 'normal'
  const span = m.max - m.min
  return v < m.lo - span * 0.1 || v > m.hi + span * 0.06 ? 'out' : 'watch'
}

function trend(s: Live, k: Key) {
  const h = s.history.slice(-10)
  if (h.length < 3) return 0
  const d = (s.now[k] as number) - (h[0][k] as number)
  const m = METRICS.find(x => x.k === k)!
  return Math.abs(d) < (m.max - m.min) * 0.02 ? 0 : d > 0 ? 1 : -1
}

export function Readings({ s }: { s: Live }) {
  const drilling = s.mode === 'drilling'
  return (
    <div className="gauges">
      {METRICS.map(m => {
        const v = s.now[m.k] as number, st = stateOf(m, v, drilling), c = STATE_C[st]
        const p = Math.max(0, Math.min(1, (v - m.min) / (m.max - m.min)))
        const tr = trend(s, m.k)
        const Arrow = tr > 0 ? ArrowUp : tr < 0 ? ArrowDown : Minus
        return (
          <div key={m.k} className="raised" style={{ padding: '11px 12px 10px', borderLeft: `3px solid ${c}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="label">{m.label}</span>
              <Arrow size={13} color="var(--faint)" aria-label={tr > 0 ? 'rising' : tr < 0 ? 'falling' : 'steady'} />
            </div>
            <div className="mono" style={{ fontSize: 26, fontWeight: 700, marginTop: 4, lineHeight: 1.1 }}>{fmt(v, m.dp)}<span style={{ fontSize: 12, color: 'var(--faint)', marginLeft: 4, fontWeight: 500 }}>{m.unit}</span></div>
            <div style={{ height: 4, background: 'var(--raised2)', borderRadius: 2, marginTop: 9, position: 'relative' }} aria-hidden>
              <div style={{ position: 'absolute', left: `${(m.lo - m.min) / (m.max - m.min) * 100}%`, width: `${(m.hi - m.lo) / (m.max - m.min) * 100}%`, top: 0, bottom: 0, background: 'rgba(34,160,107,.25)', borderRadius: 2 }} />
              <div style={{ position: 'absolute', left: `calc(${p * 100}% - 3px)`, top: -3, width: 6, height: 10, borderRadius: 2, background: c, transition: 'left .6s ease-out' }} />
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: st === 'normal' ? 'var(--muted)' : c, marginTop: 6 }}>{STATE_WORD[st]}</div>
          </div>
        )
      })}
    </div>
  )
}

/* Streaming area charts: the last hour, the normal band, out-of-range points marked with a triangle. */
export function Streams({ s }: { s: Live }) {
  const keys: Key[] = ['rop', 'torque', 'pressure', 'flow', 'engine']
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(250px, 100%), 1fr))', gap: 12 }}>
      {keys.map(k => {
        const m = METRICS.find(x => x.k === k)!
        const h = [...s.history.slice(-59), s.now]
        const vals = h.map(x => x[k] as number)
        const lo = Math.min(m.lo, ...vals), hi = Math.max(m.hi, ...vals), pad = (hi - lo) * 0.12 || 1
        const W = 260, H = 70, y0 = lo - pad, y1 = hi + pad
        const X = (i: number) => (i / Math.max(1, vals.length - 1)) * W
        const Y = (v: number) => H - 2 - ((v - y0) / (y1 - y0)) * (H - 6)
        const line = vals.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')
        const st = stateOf(m, vals[vals.length - 1], s.mode === 'drilling')
        const c = st === 'normal' ? 'var(--blue)' : STATE_C[st]
        const outs = vals.map((v, i) => ({ v, i, st: stateOf(m, v, s.mode === 'drilling') })).filter(x => x.st === 'out').filter((_, j, a) => j % Math.max(1, Math.ceil(a.length / 6)) === 0)
        const id = `g-${k}`
        return (
          <figure key={k} className="raised" style={{ margin: 0, padding: '10px 12px 8px' }}>
            <figcaption style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{m.label}</span>
              <span><span className="mono" style={{ fontSize: 14, fontWeight: 700 }}>{fmt(vals[vals.length - 1], m.dp)}</span> <span style={{ fontSize: 11.5, color: 'var(--faint)' }}>{m.unit}</span> <span style={{ fontSize: 11.5, fontWeight: 600, color: st === 'normal' ? 'var(--muted)' : STATE_C[st] }}>· {STATE_WORD[st]}</span></span>
            </figcaption>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 70, display: 'block', marginTop: 6 }} role="img" aria-label={`${m.label} over the last hour, now ${fmt(vals[vals.length - 1], m.dp)} ${m.unit}, ${STATE_WORD[st]}`}>
              <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={c} stopOpacity={0.28} /><stop offset="100%" stopColor={c} stopOpacity={0} /></linearGradient></defs>
              <rect x={0} width={W} y={Y(Math.min(m.hi, y1))} height={Math.max(0, Y(Math.max(m.lo, y0)) - Y(Math.min(m.hi, y1)))} fill="rgba(34,160,107,.07)" />
              <line x1={0} x2={W} y1={Y(Math.min(m.hi, y1))} y2={Y(Math.min(m.hi, y1))} stroke="rgba(34,160,107,.35)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
              <path d={`${line} L${W},${H} L0,${H} Z`} fill={`url(#${id})`} />
              <path d={line} fill="none" stroke={c} strokeWidth={1.8} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
              {outs.map(o => <path key={o.i} d={`M${X(o.i)},${Y(o.v) - 7} l4,6 l-8,0 z`} fill="var(--red)" />)}
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--faint)', marginTop: 2 }}><span>60 min ago</span><span>now</span></div>
          </figure>
        )
      })}
    </div>
  )
}

/* The hole around the bit: 10 m drilled above, 16 m predicted below. */
export function HoleStrip({ s }: { s: Live }) {
  const above = 10, below = 16
  const top = Math.max(0, s.depth - above), bot = s.depth + below
  const H = 500, W = 220, X0 = 56, BW = 46
  const Y = (d: number) => ((d - top) / (bot - top)) * H
  const ms = s.ahead.filter(m => m.to > top && m.from < bot)
  const nb = nextBroken(s.ahead, s.depth)
  const hole = holeOf(s.rig)
  const stop = hole ? stopCall(hole, projectOf(s.rig).holes, s.depth, s.rig.holePlanned, targetLevel(projectOf(s.rig).holes)) : null
  const planned = s.rig.holePlanned
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label={`${s.rig.hole}: bit at ${s.depth.toFixed(1)} m${nb ? `, broken ground in ${nb.inMetres.toFixed(1)} m` : ''}${stop ? `, Geology GPS stop at ${Math.round(stop.stopAt)} m` : ''}`}>
        <defs><pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="rgba(239,68,68,.2)" /><line x1="0" y1="0" x2="0" y2="7" stroke="#EF4444" strokeWidth="3" /></pattern></defs>
        {ms.map(m => {
          const y0 = Y(Math.max(top, m.from)), y1 = Y(Math.min(bot, m.to))
          const fill = !m.holes.length ? 'var(--raised2)' : m.broken ? 'url(#hatch)' : m.vein >= 0.07 ? '#6D5BA8' : m.ff > 5 ? '#8A7448' : '#3F6B57'
          return <rect key={m.from} x={X0} y={y0} width={BW} height={Math.max(0.5, y1 - y0)} fill={fill} opacity={m.to <= s.depth ? 0.55 : 0.35 + 0.65 * m.sure} />
        })}
        <rect x={X0} y={0} width={BW} height={Y(s.depth)} fill="none" stroke="var(--line3)" />
        <rect x={X0} y={Y(s.depth)} width={BW} height={H - Y(s.depth)} fill="none" stroke="var(--line3)" strokeDasharray="4 4" />
        {Array.from({ length: Math.floor(bot) - Math.ceil(top) + 1 }, (_, i) => Math.ceil(top) + i).filter(d => d % 2 === 0).map(d => (
          <g key={d}><line x1={X0 - 5} x2={X0} y1={Y(d)} y2={Y(d)} stroke="var(--line3)" /><text x={X0 - 8} y={Y(d) + 4} textAnchor="end" style={{ fontFamily: 'var(--mono)', fontSize: 10.5, fill: 'var(--faint)' }}>{d}</text></g>
        ))}
        {nb && nb.top < bot && <g><line x1={X0 + BW + 5} x2={X0 + BW + 5} y1={Y(nb.top)} y2={Y(Math.min(bot, nb.base))} stroke="var(--red)" strokeWidth={3} /><text x={X0 + BW + 11} y={Y(nb.top) + 11} style={{ fontSize: 11.5, fill: 'var(--red)', fontWeight: 700 }}>Broken</text><text x={X0 + BW + 11} y={Y(nb.top) + 24} style={{ fontSize: 10.5, fill: 'var(--muted)' }}>{Math.round(nb.sure * 100)}% sure</text></g>}
        {planned != null && planned > top && planned < bot && <g><line x1={X0 - 6} x2={X0 + BW + 6} y1={Y(planned)} y2={Y(planned)} stroke="var(--muted)" strokeDasharray="5 3" /><text x={X0 + BW + 11} y={Y(planned) + 4} style={{ fontSize: 10.5, fill: 'var(--muted)' }}>Planned {Math.round(planned)} m</text></g>}
        {stop && <g><line x1={X0 - 6} x2={X0 + BW + 6} y1={Y(stop.stopAt)} y2={Y(stop.stopAt)} stroke="var(--violet)" strokeWidth={2.5} /><text x={X0 + BW + 11} y={Y(stop.stopAt) - 22} style={{ fontSize: 11, fill: 'var(--violet)', fontWeight: 700 }}>Stop here</text><text x={X0 + BW + 11} y={Y(stop.stopAt) - 9} style={{ fontSize: 10.5, fill: 'var(--muted)' }}>saves {Math.round(stop.saving)} m</text></g>}
        <g transform={`translate(${X0 + BW / 2}, ${Y(s.depth)})`}><circle r={12} fill="rgba(249,115,22,.2)" className="ping" /><path d="M-11,-6 L11,-6 L0,9 Z" fill="var(--orange)" /></g>
        <text x={X0 + BW + 11} y={Y(s.depth) + 4} style={{ fontFamily: 'var(--mono)', fontSize: 12.5, fill: 'var(--text)', fontWeight: 700 }}>{s.depth.toFixed(1)} m</text>
      </svg>
      <div style={{ display: 'grid', gap: 5, marginTop: 10, fontSize: 11.5, color: 'var(--muted)' }}>
        {[['#3F6B57', 'Good rock'], ['#8A7448', 'Harder ground'], ['#6D5BA8', 'Target (veins)'], ['hatch', 'Broken ground']].map(([c, l]) => (
          <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <span aria-hidden style={{ width: 14, height: 10, borderRadius: 2, background: c === 'hatch' ? 'repeating-linear-gradient(45deg, #EF4444 0 2px, rgba(239,68,68,.25) 2px 5px)' : c }} />{l}
          </span>
        ))}
        <span style={{ color: 'var(--faint)' }}>Below the bit: brighter = surer</span>
      </div>
    </div>
  )
}

export function Spark({ s }: { s: Live }) {
  const v = [...s.history.slice(-30), s.now].map(x => x.rop)
  const W = 120, H = 26, max = Math.max(0.6, ...v)
  const d = v.map((x, i) => `${i ? 'L' : 'M'}${(i / Math.max(1, v.length - 1)) * W},${H - 2 - (x / max) * (H - 4)}`).join(' ')
  return <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 26, display: 'block' }} aria-hidden><path d={d} fill="none" stroke={s.mode === 'drilling' ? 'var(--blue)' : 'var(--faint)'} strokeWidth={1.6} vectorEffect="non-scaling-stroke" /></svg>
}

export const KIND_LABEL = { broken: 'Rock ahead', core: 'Core quality', blocking: 'Bit blocking', engine: 'Engine', pump: 'Water pump', standby: 'Billable standby', idle: 'Diesel', cost: 'Cost a metre', bit: 'Bit life', stop: 'Geology GPS', survey: 'Survey' } as const
export { Activity }
