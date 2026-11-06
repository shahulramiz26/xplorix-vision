'use client'

import { nextBroken, stopCall, targetLevel } from '../lib/ground'
import { holeOf, projectOf, DATA } from '../lib/data'
import type { Live, Reading } from '../lib/rig'

/* The pieces of the Pulse screen that show one rig: gauges, trends and the
 * hole with the rock ahead of the bit. */

type Key = keyof Omit<Reading, 't'>
export const METRICS: { k: Key; label: string; unit: string; min: number; max: number; lo: number; hi: number; dp: number }[] = [
  { k: 'rpm', label: 'Rotation', unit: 'rpm', min: 0, max: 1200, lo: 600, hi: 1050, dp: 0 },
  { k: 'wob', label: 'Bit load', unit: 'kN', min: 0, max: 40, lo: 10, hi: 32, dp: 1 },
  { k: 'torque', label: 'Torque', unit: 'N·m', min: 0, max: 1600, lo: 300, hi: 1000, dp: 0 },
  { k: 'pressure', label: 'Water pressure', unit: 'bar', min: 0, max: 45, lo: 10, hi: 24, dp: 1 },
  { k: 'flow', label: 'Water flow', unit: 'L/min', min: 0, max: 70, lo: 36, hi: 62, dp: 0 },
  { k: 'rop', label: 'Penetration', unit: 'm/h', min: 0, max: 1.2, lo: 0.3, hi: 1.2, dp: 2 },
  { k: 'engine', label: 'Engine', unit: '°C', min: 40, max: 110, lo: 60, hi: 92, dp: 0 },
  { k: 'fuel', label: 'Fuel', unit: '%', min: 0, max: 100, lo: 20, hi: 100, dp: 0 },
]
const fmt = (v: number, dp: number) => v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
export function tone(m: typeof METRICS[number], v: number, drilling: boolean) {
  if (!drilling && m.k !== 'engine' && m.k !== 'fuel') return 'var(--faint)'
  if (v >= m.lo && v <= m.hi) return 'var(--green)'
  const span = m.max - m.min
  return v < m.lo - span * 0.1 || v > m.hi + span * 0.06 ? 'var(--red)' : 'var(--amber)'
}

export function Gauges({ s }: { s: Live }) {
  const drilling = s.mode === 'drilling'
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(132px, 46%), 1fr))', gap: 10 }}>
      {METRICS.map(m => {
        const v = s.now[m.k] as number, c = tone(m, v, drilling)
        const p = Math.max(0, Math.min(1, (v - m.min) / (m.max - m.min)))
        return (
          <div key={m.k} style={{ background: 'var(--raised)', borderRadius: 12, padding: '10px 12px', borderLeft: `3px solid ${c}` }}>
            <div className="eyebrow">{m.label}</div>
            <div className="mono" style={{ fontSize: 24, fontWeight: 700, marginTop: 3 }}>{fmt(v, m.dp)}<span style={{ fontSize: 11.5, color: 'var(--faint)', marginLeft: 4 }}>{m.unit}</span></div>
            <div style={{ height: 4, background: 'var(--raised2)', borderRadius: 2, marginTop: 6, position: 'relative' }}>
              <div style={{ position: 'absolute', left: `${(m.lo - m.min) / (m.max - m.min) * 100}%`, width: `${(m.hi - m.lo) / (m.max - m.min) * 100}%`, top: 0, bottom: 0, background: 'rgba(34,197,94,.22)' }} />
              <div style={{ position: 'absolute', left: `calc(${p * 100}% - 4px)`, top: -3, width: 8, height: 10, borderRadius: 3, background: c, transition: 'left .6s' }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function Trends({ s }: { s: Live }) {
  const keys: Key[] = ['pressure', 'flow', 'torque', 'rop', 'engine']
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(200px, 100%), 1fr))', gap: 10 }}>
      {keys.map(k => {
        const m = METRICS.find(x => x.k === k)!
        const h = [...s.history.slice(-59), s.now]
        const vals = h.map(x => x[k] as number)
        const lo = Math.min(m.lo, ...vals), hi = Math.max(m.hi, ...vals), pad = (hi - lo) * 0.1 || 1
        const W = 220, H = 54, Y = (v: number) => H - 4 - ((v - (lo - pad)) / ((hi + pad) - (lo - pad))) * (H - 8)
        const d = vals.map((v, i) => `${i ? 'L' : 'M'}${(i / Math.max(1, vals.length - 1)) * W},${Y(v).toFixed(1)}`).join(' ')
        const c = tone(m, vals[vals.length - 1], s.mode === 'drilling')
        return (
          <div key={k} style={{ background: 'var(--raised)', borderRadius: 12, padding: '9px 11px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span style={{ color: 'var(--muted)', fontWeight: 600 }}>{m.label}</span><span className="mono" style={{ fontWeight: 700 }}>{fmt(vals[vals.length - 1], m.dp)} <span style={{ color: 'var(--faint)', fontWeight: 400 }}>{m.unit}</span></span></div>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 54, display: 'block', marginTop: 4 }} aria-label={`${m.label}, last hour`}>
              <rect x={0} width={W} y={Y(Math.min(m.hi, hi + pad))} height={Math.max(0, Y(Math.max(m.lo, lo - pad)) - Y(Math.min(m.hi, hi + pad)))} fill="rgba(34,197,94,.08)" />
              <path d={d} fill="none" stroke={c} strokeWidth={1.8} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--faint)' }}><span>−60 min</span><span>now</span></div>
          </div>
        )
      })}
    </div>
  )
}

/* The hole around the bit: 10 m drilled above, 16 m predicted below. */
export function HoleStrip({ s }: { s: Live }) {
  const above = 10, below = 16
  const top = Math.max(0, s.depth - above), bot = s.depth + below
  const H = 470, W = 210, X0 = 64, BW = 44
  const Y = (d: number) => ((d - top) / (bot - top)) * H
  const ms = s.ahead.filter(m => m.to > top && m.from < bot)
  const nb = nextBroken(s.ahead, s.depth)
  const hole = holeOf(s.rig)
  const stop = hole ? stopCall(hole, projectOf(s.rig).holes, s.depth, s.rig.holePlanned, targetLevel(projectOf(s.rig).holes)) : null
  const planned = s.rig.holePlanned
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label={`${s.rig.hole}: bit at ${s.depth.toFixed(1)} m`}>
      <defs><pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="rgba(239,68,68,.22)" /><line x1="0" y1="0" x2="0" y2="7" stroke="#EF4444" strokeWidth="3" /></pattern></defs>
      {ms.map(m => {
        const y0 = Y(Math.max(top, m.from)), y1 = Y(Math.min(bot, m.to))
        const fill = !m.holes.length ? '#232B36' : m.broken ? 'url(#hatch)' : m.vein >= 0.07 ? '#5B4A86' : m.ff > 5 ? '#6B5A3A' : '#355345'
        return <rect key={m.from} x={X0} y={y0} width={BW} height={Math.max(0.5, y1 - y0)} fill={fill} opacity={m.to <= s.depth ? 0.5 : 0.35 + 0.65 * m.sure} />
      })}
      <rect x={X0} y={0} width={BW} height={Y(s.depth)} fill="none" stroke="#4A5668" />
      <rect x={X0} y={Y(s.depth)} width={BW} height={H - Y(s.depth)} fill="none" stroke="#344052" strokeDasharray="4 4" />
      {Array.from({ length: Math.floor(bot) - Math.ceil(top) + 1 }, (_, i) => Math.ceil(top) + i).filter(d => d % 2 === 0).map(d => (
        <g key={d}><line x1={X0 - 5} x2={X0} y1={Y(d)} y2={Y(d)} stroke="#344052" /><text x={X0 - 8} y={Y(d) + 4} textAnchor="end" className="mono" style={{ fontSize: 10.5, fill: '#6A7686' }}>{d}</text></g>
      ))}
      {nb && nb.top < bot && <g><line x1={X0 + BW + 4} x2={X0 + BW + 4} y1={Y(nb.top)} y2={Y(Math.min(bot, nb.base))} stroke="#EF4444" strokeWidth={3} /><text x={X0 + BW + 10} y={Y(nb.top) + 11} style={{ fontSize: 11, fill: '#EF4444', fontWeight: 700 }}>broken</text><text x={X0 + BW + 10} y={Y(nb.top) + 24} style={{ fontSize: 10, fill: '#9AA6B4' }}>{Math.round(nb.sure * 100)}% sure</text></g>}
      {planned != null && planned > top && planned < bot && <g><line x1={X0 - 6} x2={X0 + BW + 6} y1={Y(planned)} y2={Y(planned)} stroke="#9AA6B4" strokeDasharray="5 3" /><text x={X0 + BW + 10} y={Y(planned) + 4} style={{ fontSize: 10, fill: '#9AA6B4' }}>planned {Math.round(planned)} m</text></g>}
      {stop && <g><line x1={X0 - 6} x2={X0 + BW + 6} y1={Y(stop.stopAt)} y2={Y(stop.stopAt)} stroke="#8B5CF6" strokeWidth={2.5} /><text x={X0 + BW + 10} y={Y(stop.stopAt) - 20} style={{ fontSize: 10.5, fill: '#8B5CF6', fontWeight: 700 }}>stop here</text><text x={X0 + BW + 10} y={Y(stop.stopAt) - 8} style={{ fontSize: 10, fill: '#9AA6B4' }}>saves {Math.round(stop.saving)} m</text></g>}
      <g transform={`translate(${X0 + BW / 2}, ${Y(s.depth)})`}><circle r={12} fill="rgba(249,115,22,.22)" className="ping" /><path d="M-11,-6 L11,-6 L0,9 Z" fill="#F97316" /></g>
      <text x={X0 + BW + 10} y={Y(s.depth) + 4} className="mono" style={{ fontSize: 12, fill: '#E9EEF4', fontWeight: 700 }}>{s.depth.toFixed(1)} m</text>
    </svg>
  )
}

export const KIND_LABEL = { broken: 'Rock ahead', core: 'Core quality', blocking: 'Bit blocking', engine: 'Engine', pump: 'Water pump', standby: 'Billable standby', idle: 'Diesel', cost: 'Cost a metre', bit: 'Bit life', stop: 'Geology GPS', survey: 'Survey' } as const
export const fleetSize = DATA.rigs.length
