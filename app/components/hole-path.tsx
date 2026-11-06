'use client'

import { useMemo, useRef, useState, type ReactNode } from 'react'
import { alongBearing, plannedPoint } from '../../lib/geo'
import type { HoleSurvey } from '../../lib/survey'
import { T, display, num } from './kit'

/* ==========================================================================
 * THE HOLE, DRAWN
 *
 * Three views of the same path, all to scale (a metre across is a metre
 * down), as the geologist expects:
 *
 *   3D           the hole in the ground, turned by dragging
 *   Plan view    from above: east across, north up
 *   Section      from the side, along the planned bearing: distance along
 *                the bearing across, depth down
 *
 * The planned hole is a dashed line; the hole as surveyed is solid orange; a
 * stretch drilled past the last approved reading is dotted, because it is
 * where the hole is expected to be, not where it was measured.
 * ========================================================================== */

const PLAN = 'var(--x-faint)'
const ACT = 'var(--x-orange)'
const r1 = (v: number) => Math.round(v * 10) / 10

function niceStep(span: number, ticks = 5) {
  const raw = span / ticks
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)))
  const m = raw / p
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p
}

function Legend({ projected }: { projected: boolean }) {
  const item = (dash: string, color: string, label: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <svg width="26" height="8" aria-hidden><line x1="1" y1="4" x2="25" y2="4" stroke={color} strokeWidth="2.5" strokeDasharray={dash} strokeLinecap="round" /></svg>{label}
    </span>
  )
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: T.muted, marginTop: 10 }}>
      {item('6 5', PLAN, 'Planned')}
      {item('', ACT, 'As surveyed')}
      {projected && item('1 5', ACT, 'Past the last survey')}
    </div>
  )
}

/* A 2-D view to scale: points in metres, x across, y down the page. */
function Frame2D({ width, height, series, xLabel, yLabel, yDown, extra }: {
  width: number; height: number
  series: { pts: { x: number; y: number; depth?: number; projected?: boolean }[]; color: string; dash?: string; dots?: boolean }[]
  xLabel: string; yLabel: string; yDown: boolean
  extra?: (sx: (x: number) => number, sy: (y: number) => number) => ReactNode
}) {
  const all = series.flatMap(s => s.pts)
  if (!all.length) return null
  const pad = { l: 52, r: 16, t: 14, b: 34 }
  let x0 = Math.min(...all.map(p => p.x)), x1 = Math.max(...all.map(p => p.x))
  let y0 = Math.min(...all.map(p => p.y)), y1 = Math.max(...all.map(p => p.y))
  const w = width - pad.l - pad.r, h = height - pad.t - pad.b
  // Equal scale both ways, centred, with a margin.
  const spanX = Math.max(x1 - x0, 1), spanY = Math.max(y1 - y0, 1)
  const k = Math.min(w / (spanX * 1.15), h / (spanY * 1.15))
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  x0 = cx - w / k / 2; x1 = cx + w / k / 2; y0 = cy - h / k / 2; y1 = cy + h / k / 2
  const sx = (x: number) => pad.l + (x - x0) * k
  const sy = (y: number) => yDown ? pad.t + (y - y0) * k : pad.t + (y1 - y) * k
  const step = niceStep(Math.max(x1 - x0, y1 - y0), 6)
  const xt: number[] = [], yt: number[] = []
  for (let v = Math.ceil(x0 / step) * step; v <= x1; v += step) xt.push(v)
  for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) yt.push(v)
  const path = (pts: { x: number; y: number }[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', overflow: 'visible' }} role="img" aria-label={`${xLabel} against ${yLabel}`}>
      {xt.map(v => <g key={`x${v}`}><line x1={sx(v)} x2={sx(v)} y1={pad.t} y2={pad.t + h} stroke="var(--x-border)" strokeOpacity="0.55" /><text x={sx(v)} y={pad.t + h + 15} fontSize="10.5" fill={T.faint} textAnchor="middle">{r1(v)}</text></g>)}
      {yt.map(v => <g key={`y${v}`}><line x1={pad.l} x2={pad.l + w} y1={sy(v)} y2={sy(v)} stroke="var(--x-border)" strokeOpacity="0.55" /><text x={pad.l - 6} y={sy(v) + 3.5} fontSize="10.5" fill={T.faint} textAnchor="end">{r1(v)}</text></g>)}
      <text x={pad.l + w / 2} y={height - 3} fontSize="11" fill={T.faint} textAnchor="middle">{xLabel}</text>
      <text x={12} y={pad.t + h / 2} fontSize="11" fill={T.faint} textAnchor="middle" transform={`rotate(-90 12 ${pad.t + h / 2})`}>{yLabel}</text>
      {extra?.(sx, sy)}
      {series.map((s, i) => {
        const solid = s.pts.filter(p => !p.projected)
        const lastSolid = solid[solid.length - 1]
        const proj = s.pts.filter(p => p.projected)
        return (
          <g key={i}>
            <path d={path(solid)} fill="none" stroke={s.color} strokeWidth={s.dash ? 2 : 2.6} strokeDasharray={s.dash} strokeLinecap="round" strokeLinejoin="round" />
            {proj.length > 0 && lastSolid && <path d={path([lastSolid, ...proj])} fill="none" stroke={s.color} strokeWidth="2.6" strokeDasharray="1 6" strokeLinecap="round" />}
            {s.dots && solid.slice(1).map((p, j) => <circle key={j} cx={sx(p.x)} cy={sy(p.y)} r="3" fill="var(--x-card)" stroke={s.color} strokeWidth="1.8"><title>{p.depth != null ? `${r1(p.depth)} m` : ''}</title></circle>)}
          </g>
        )
      })}
      {all[0] && <circle cx={sx(series[0].pts[0]?.x ?? 0)} cy={sy(series[0].pts[0]?.y ?? 0)} r="5" fill={T.text}><title>Collar</title></circle>}
    </svg>
  )
}

export function PlanView({ s }: { s: HoleSurvey }) {
  const series = [
    { pts: s.planned.map(p => ({ x: p.e, y: p.n })), color: PLAN, dash: '6 5' },
    { pts: s.path.map(p => ({ x: p.e, y: p.n, depth: p.depth, projected: p.projected })), color: ACT, dots: true },
  ].filter(x => x.pts.length > 1)
  if (!series.length) return null
  return (
    <div>
      <Frame2D width={460} height={360} series={series} xLabel="East of the collar, m" yLabel="North of the collar, m" yDown={false}
        extra={() => <g transform="translate(436 30)"><path d="M0 -14 L6 6 L0 2 L-6 6 Z" fill={T.text} /><text y="20" fontSize="11" fontWeight="700" fill={T.text} textAnchor="middle">N</text></g>} />
      <Legend projected={s.path.some(p => p.projected)} />
    </div>
  )
}

export function SectionView({ s }: { s: HoleSurvey }) {
  const az = s.plan?.azimuth ?? (s.path[1]?.azimuth ?? 0)
  const series = [
    { pts: s.planned.map(p => ({ x: alongBearing(p, az), y: p.tvd })), color: PLAN, dash: '6 5' },
    { pts: s.path.map(p => ({ x: alongBearing(p, az), y: p.tvd, depth: p.depth, projected: p.projected })), color: ACT, dots: true },
  ].filter(x => x.pts.length > 1)
  if (!series.length) return null
  return (
    <div>
      <Frame2D width={460} height={360} series={series} xLabel={`Along ${Math.round(az)}°, m`} yLabel="Vertical depth, m" yDown />
      <Legend projected={s.path.some(p => p.projected)} />
    </div>
  )
}

/* ── 3D ──────────────────────────────────────────────────────────────────── */

export function Path3D({ s, height = 420 }: { s: HoleSurvey; height?: number }) {
  const [view, setView] = useState({ yaw: -35, pitch: 24 })
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null)
  const W = 640, H = height

  const geo = useMemo(() => {
    const act = s.path.map(p => ({ x: p.e, y: p.n, z: -p.tvd, depth: p.depth, projected: p.projected }))
    const deepest = Math.max(s.drilled, s.plannedDepth ?? 0, s.lastSurveyed, 1)
    const plan = s.plan ? Array.from({ length: 21 }, (_, i) => { const d = (deepest * i) / 20; const q = plannedPoint(s.plan!, d); return { x: q.e, y: q.n, z: -q.tvd, depth: d } }) : []
    const all = [...act, ...plan, { x: 0, y: 0, z: 0 }]
    const ext = Math.max(...all.map(p => Math.max(Math.abs(p.x), Math.abs(p.y))), 10)
    const depth = Math.max(...all.map(p => -p.z), 10)
    return { act, plan, ext: ext * 1.15, depth }
  }, [s])

  const yaw = view.yaw * Math.PI / 180, pitch = view.pitch * Math.PI / 180
  const raw = (p: { x: number; y: number; z: number }) => {
    const xr = p.x * Math.cos(yaw) - p.y * Math.sin(yaw)
    const yr = p.x * Math.sin(yaw) + p.y * Math.cos(yaw)
    return { X: xr, Y: -(p.z * Math.cos(pitch) + yr * Math.sin(pitch)) }
  }
  // Fit the whole scene: the ground square and the deepest point.
  const box = [
    ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => ({ x: a * geo.ext, y: b * geo.ext, z: 0 })),
    ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => ({ x: a * geo.ext * 0.2, y: b * geo.ext * 0.2, z: -geo.depth })),
    ...geo.act, ...geo.plan,
  ].map(raw)
  const minX = Math.min(...box.map(b => b.X)), maxX = Math.max(...box.map(b => b.X))
  const minY = Math.min(...box.map(b => b.Y)), maxY = Math.max(...box.map(b => b.Y))
  const k = Math.min((W - 60) / (maxX - minX || 1), (H - 50) / (maxY - minY || 1))
  const ox = W / 2 - ((minX + maxX) / 2) * k, oy = H / 2 - ((minY + maxY) / 2) * k
  const P = (p: { x: number; y: number; z: number }) => { const r = raw(p); return { x: ox + r.X * k, y: oy + r.Y * k } }
  const line = (pts: { x: number; y: number; z: number }[]) => pts.map((p, i) => { const q = P(p); return `${i ? 'L' : 'M'}${q.x.toFixed(1)},${q.y.toFixed(1)}` }).join(' ')

  const g = geo.ext
  const gridStep = niceStep(g * 2, 4)
  const gridLines: { a: { x: number; y: number; z: number }; b: { x: number; y: number; z: number } }[] = []
  for (let v = -Math.floor(g / gridStep) * gridStep; v <= g; v += gridStep) {
    gridLines.push({ a: { x: v, y: -g, z: 0 }, b: { x: v, y: g, z: 0 } }, { a: { x: -g, y: v, z: 0 }, b: { x: g, y: v, z: 0 } })
  }
  const dStep = niceStep(geo.depth, 5)
  const ticks: number[] = []
  for (let d = dStep; d <= geo.depth; d += dStep) ticks.push(d)
  const solid = geo.act.filter(p => !p.projected)
  const proj = geo.act.filter(p => p.projected)
  const end = solid[solid.length - 1]
  const north = P({ x: 0, y: g * 0.95, z: 0 }), northBase = P({ x: 0, y: g * 0.7, z: 0 })

  const onDown = (e: React.PointerEvent) => { (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, ...view } }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return
    setView({ yaw: d.yaw + (e.clientX - d.x) * 0.5, pitch: Math.max(-5, Math.min(85, d.pitch + (e.clientY - d.y) * 0.4)) })
  }
  const btn: React.CSSProperties = { background: 'var(--x-card)', border: `1px solid ${T.border}`, borderRadius: 7, color: T.muted, fontSize: 12, padding: '4px 9px', cursor: 'pointer', fontFamily: 'inherit' }

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', touchAction: 'none', cursor: drag.current ? 'grabbing' : 'grab', userSelect: 'none' }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => { drag.current = null }} onPointerLeave={() => { drag.current = null }}
          role="img" aria-label="The hole in three dimensions. Drag to turn it.">
          {gridLines.map((l, i) => { const a = P(l.a), b = P(l.b); return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--x-border)" strokeOpacity="0.7" /> })}
          <line x1={northBase.x} y1={northBase.y} x2={north.x} y2={north.y} stroke={T.text} strokeWidth="1.6" markerEnd="url(#arrowN)" />
          <text x={north.x} y={north.y - 6} fontSize="12" fontWeight="700" fill={T.text} textAnchor="middle">N</text>
          <defs><marker id="arrowN" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill={T.text} /></marker></defs>
          {(() => { const a = P({ x: 0, y: 0, z: 0 }), b = P({ x: 0, y: 0, z: -geo.depth }); return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--x-border)" strokeWidth="1.2" strokeDasharray="2 4" /> })()}
          {ticks.map(d => { const q = P({ x: 0, y: 0, z: -d }); return <g key={d}><line x1={q.x - 4} x2={q.x + 4} y1={q.y} y2={q.y} stroke={T.faint} /><text x={q.x - 8} y={q.y + 3.5} fontSize="10.5" fill={T.faint} textAnchor="end">{r1(d)} m</text></g> })}
          {geo.plan.length > 1 && <path d={line(geo.plan)} fill="none" stroke={PLAN} strokeWidth="2" strokeDasharray="6 5" strokeLinecap="round" />}
          {solid.length > 1 && <path d={line(solid)} fill="none" stroke={ACT} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
          {proj.length > 0 && end && <path d={line([end, ...proj])} fill="none" stroke={ACT} strokeWidth="3" strokeDasharray="1 7" strokeLinecap="round" />}
          {solid.slice(1).map((p, i) => { const q = P(p); return <circle key={i} cx={q.x} cy={q.y} r="3.2" fill="var(--x-card)" stroke={ACT} strokeWidth="1.8"><title>{`${r1(p.depth)} m`}</title></circle> })}
          {(() => { const c = P({ x: 0, y: 0, z: 0 }); return <g><circle cx={c.x} cy={c.y} r="5.5" fill={T.text} /><text x={c.x + 9} y={c.y - 7} fontSize="11.5" fontWeight="600" fill={T.text}>{s.hole} collar</text></g> })()}
          {end && (() => { const q = P(end); return <text x={q.x + 8} y={q.y + 4} fontSize="11" fill={T.text}>{r1(end.depth)} m</text> })()}
          {geo.plan.length > 1 && (() => { const q = P(geo.plan[geo.plan.length - 1]); return <text x={q.x + 8} y={q.y + 4} fontSize="11" fill={T.faint}>plan</text> })()}
        </svg>
        <div style={{ position: 'absolute', right: 6, top: 6, display: 'flex', gap: 4 }}>
          <button style={btn} aria-label="Turn left" onClick={() => setView(v => ({ ...v, yaw: v.yaw - 30 }))}>⟲</button>
          <button style={btn} aria-label="Turn right" onClick={() => setView(v => ({ ...v, yaw: v.yaw + 30 }))}>⟳</button>
          <button style={btn} onClick={() => setView({ yaw: -35, pitch: 24 })}>Reset</button>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <Legend projected={proj.length > 0} />
        <span style={{ fontSize: 11.5, color: T.faint, marginTop: 10 }}>Drag to turn the view.</span>
      </div>
    </div>
  )
}

/* The deviation figures, as tiles read at a glance. */
export function DeviationFigures({ s }: { s: HoleSurvey }) {
  const d = s.deviation
  const cell = (label: string, value: ReactNode, note?: string, tone?: string) => (
    <div style={{ padding: '12px 14px', border: `1px solid ${T.border}`, borderRadius: 10, background: T.card, minWidth: 0 }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: T.faint, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: tone ?? T.text, ...num, lineHeight: 1.1 }}>{value}</div>
      {note && <div style={{ fontSize: 12, color: T.faint, marginTop: 6 }}>{note}</div>}
    </div>
  )
  const tone = !d ? undefined : d.angle >= 6 ? T.red : d.angle >= 3 ? T.amber : T.green
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
      {cell('Off the planned line', d ? `${r1(d.metres)} m` : '—', d ? `at ${r1(d.depth)} m · ${r1(d.horizontal)} m across, ${r1(Math.abs(d.vertical))} m ${d.vertical >= 0 ? 'high' : 'low'}` : 'Needs a planned direction and 2 approved readings', tone)}
      {cell('Angle from plan', d ? `${r1(d.angle)}°` : '—', d ? `Azimuth ${d.azimuthDrift >= 0 ? '+' : '−'}${Math.abs(r1(d.azimuthDrift))}° · dip ${d.dipDrift >= 0 ? '+' : '−'}${Math.abs(r1(d.dipDrift))}°` : undefined, tone)}
      {cell('Last surveyed', s.lastSurveyed ? `${r1(s.lastSurveyed)} m` : 'None', s.drilled ? `of ${r1(s.drilled)} m drilled` : undefined, s.drilled - s.lastSurveyed > 50 ? T.amber : undefined)}
      {cell('Sharpest bend', s.maxDls ? `${r1(s.maxDls)}°` : '—', 'every 30 m', s.maxDls >= 3 ? T.amber : undefined)}
    </div>
  )
}

