'use client'

import { ReactNode, useMemo, useRef, useState } from 'react'
import { T, tint, mono } from './kit'
import { polePoint } from '../../lib/core/downhole'

/* ==========================================================================
 * XPLORIX CORE — charts for the downhole data
 *
 *   <DepthTracks>  any number of logs side by side on one depth scale:
 *                  colour bands, curves, stacked colours, pictures, ticks
 *   <Scatter>      points on two axes (the domain map, measured against
 *                  predicted, shape against size)
 *   <Histogram>    counts in bins
 *   <Stereonet>    poles to planes, lower hemisphere, equal area
 * ========================================================================== */

type Iv = { from: number; to: number }
export type Track =
  | { kind: 'band'; label: string; w?: number; items: (Iv & { hex: string; title?: string })[] }
  | { kind: 'curve'; label: string; w?: number; items: (Iv & { v: number })[]; max: number; min?: number; log?: boolean; color: string; second?: { items: (Iv & { v: number })[]; color: string }; fmt?: (v: number) => string }
  | { kind: 'stack'; label: string; w?: number; items: (Iv & { parts: { hex: string; share: number }[] })[] }
  | { kind: 'image'; label: string; w?: number; items: (Iv & { src: string })[] }
  | { kind: 'ticks'; label: string; w?: number; items: { at: number; hex: string; len?: number; title?: string }[] }

export function DepthTracks({ tracks, top, bottom, pxPerM = 4, read }: {
  tracks: Track[]; top: number; bottom: number; pxPerM?: number; read?: (d: number) => ReactNode
}) {
  const [at, setAt] = useState<{ d: number; y: number; x: number } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const HEAD = 52, LEFT = 40, GAP = 8
  const H = Math.max(40, (bottom - top) * pxPerM)
  const y = (d: number) => HEAD + (d - top) * pxPerM
  const xs: number[] = []
  let cx = LEFT
  tracks.forEach(t => { xs.push(cx); cx += (t.w ?? 70) + GAP })
  const W = cx
  const step = bottom - top > 150 ? 20 : bottom - top > 60 ? 10 : 5
  const ticks: number[] = []
  for (let d = Math.ceil(top / step) * step; d <= bottom; d += step) ticks.push(d)

  const curve = (items: (Iv & { v: number })[], x0: number, w: number, min: number, max: number, log?: boolean) => {
    const X = (v: number) => {
      const f = log ? (Math.log10(Math.max(1e-6, v)) - Math.log10(Math.max(1e-6, min))) / (Math.log10(max) - Math.log10(Math.max(1e-6, min))) : (v - min) / (max - min || 1)
      return x0 + Math.max(0, Math.min(1, f)) * w
    }
    let line = '', area = '', prev: number | null = null
    items.forEach(s => {
      const gap = prev == null || s.from - prev > 0.05
      line += gap ? `M${X(s.v)},${y(s.from)}V${y(s.to)}` : `H${X(s.v)}V${y(s.to)}`
      area += `M${x0},${y(s.from)}H${X(s.v)}V${y(s.to)}H${x0}Z`
      prev = s.to
    })
    return { line, area }
  }

  return (
    <div ref={box} style={{ position: 'relative' }}>
      <div style={{ overflowX: 'auto' }}>
        <svg width={W} height={HEAD + H + 6} style={{ display: 'block', cursor: 'crosshair', fontFamily: 'inherit' }}
          onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); const py = e.clientY - r.top; const d = top + (py - HEAD) / pxPerM; setAt(d < top || d > bottom ? null : { d, y: py, x: e.clientX - r.left }) }}
          onMouseLeave={() => setAt(null)} role="img" aria-label="Downhole logs on one depth scale">
          {ticks.map(d => (
            <g key={d}>
              <line x1={LEFT - 5} x2={W} y1={y(d)} y2={y(d)} stroke={tint(T.faint, 16)} />
              <text x={LEFT - 8} y={y(d) + 3.5} fontSize={10} textAnchor="end" fill={T.muted} style={{ fontFamily: mono }}>{d}</text>
            </g>
          ))}
          <text x={LEFT - 8} y={HEAD - 6} fontSize={9.5} textAnchor="end" fill={T.faint}>m</text>
          {tracks.map((t, i) => {
            const x0 = xs[i], w = t.w ?? 70
            return (
              <g key={t.label + i}>
                <foreignObject x={x0} y={0} width={w} height={HEAD - 4}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: T.text, lineHeight: 1.2, height: HEAD - 4, display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>{t.label}</div>
                </foreignObject>
                <rect x={x0} y={HEAD} width={w} height={H} fill={tint(T.faint, 6)} stroke={T.line} />
                {t.kind === 'band' && t.items.map((s, k) => <rect key={k} x={x0} y={y(s.from)} width={w} height={Math.max(0.8, y(s.to) - y(s.from))} fill={s.hex}>{s.title && <title>{s.title}</title>}</rect>)}
                {t.kind === 'stack' && t.items.map((s, k) => {
                  let px = x0
                  return <g key={k}>{s.parts.map((p, j) => { const pw = p.share * w; const r = <rect key={j} x={px} y={y(s.from)} width={pw} height={Math.max(0.8, y(s.to) - y(s.from))} fill={p.hex} />; px += pw; return r })}</g>
                })}
                {t.kind === 'image' && t.items.map((s, k) => <image key={k} href={s.src} x={x0} y={y(s.from)} width={w} height={Math.max(1, y(s.to) - y(s.from))} preserveAspectRatio="xMidYMid slice" />)}
                {t.kind === 'ticks' && t.items.map((s, k) => <line key={k} x1={x0} x2={x0 + w * (s.len ?? 1)} y1={y(s.at)} y2={y(s.at)} stroke={s.hex} strokeWidth={1.6}>{s.title && <title>{s.title}</title>}</line>)}
                {t.kind === 'curve' && (() => {
                  const c = curve(t.items, x0, w, t.min ?? 0, t.max, t.log)
                  const c2 = t.second ? curve(t.second.items, x0, w, t.min ?? 0, t.max, t.log) : null
                  return <>
                    <path d={c.area} fill={tint(t.color, 22)} />
                    <path d={c.line} fill="none" stroke={t.color} strokeWidth={1.2} />
                    {c2 && <path d={c2.line} fill="none" stroke={t.second!.color} strokeWidth={1.2} strokeDasharray="3 2" />}
                    <text x={x0} y={HEAD + H + 0} fontSize={0} />
                  </>
                })()}
              </g>
            )
          })}
          {at && <line x1={LEFT} x2={W} y1={at.y} y2={at.y} stroke={T.orange} />}
          {at && <>
            <rect x={0} y={at.y - 9} width={LEFT - 4} height={18} rx={4} fill={T.orange} />
            <text x={LEFT - 8} y={at.y + 4} fontSize={10} fontWeight={700} textAnchor="end" fill="#fff" style={{ fontFamily: mono }}>{at.d.toFixed(1)}</text>
          </>}
        </svg>
      </div>
      {at && read && (
        <div style={{ position: 'absolute', pointerEvents: 'none', left: Math.min(at.x + 16, (box.current?.clientWidth ?? 600) - 250), top: Math.max(0, at.y - 10), width: 236, background: 'var(--x-side, #fff)', border: `1px solid ${T.border}`, borderRadius: 10, padding: '9px 11px', boxShadow: '0 10px 30px rgba(0,0,0,.12)', fontSize: 12, color: T.muted, lineHeight: 1.55, zIndex: 2 }}>
          {read(at.d)}
        </div>
      )}
    </div>
  )
}

/* Points on two axes. */
export function Scatter({ points, xLabel, yLabel, logX, logY, height = 320, diagonal, xDomain, yDomain }: {
  points: { x: number; y: number; hex: string; title?: string; r?: number }[]
  xLabel: string; yLabel: string; logX?: boolean; logY?: boolean; height?: number; diagonal?: boolean
  xDomain?: [number, number]; yDomain?: [number, number]
}) {
  const W = 560, H = height, P = { l: 46, r: 12, t: 10, b: 36 }
  const tx = (v: number) => logX ? Math.log10(Math.max(1e-6, v)) : v
  const ty = (v: number) => logY ? Math.log10(Math.max(1e-6, v)) : v
  const dom = useMemo(() => {
    const xs = points.map(p => tx(p.x)), ys = points.map(p => ty(p.y))
    let x0 = xDomain ? tx(xDomain[0]) : Math.min(...xs), x1 = xDomain ? tx(xDomain[1]) : Math.max(...xs)
    let y0 = yDomain ? ty(yDomain[0]) : Math.min(...ys), y1 = yDomain ? ty(yDomain[1]) : Math.max(...ys)
    if (diagonal) { x0 = y0 = Math.min(x0, y0); x1 = y1 = Math.max(x1, y1) }
    const px = (x1 - x0) * 0.04 || 1, py = (y1 - y0) * 0.04 || 1
    return { x0: x0 - px, x1: x1 + px, y0: y0 - py, y1: y1 + py }
  }, [points, diagonal, xDomain, yDomain]) // eslint-disable-line react-hooks/exhaustive-deps
  const X = (v: number) => P.l + ((tx(v) - dom.x0) / (dom.x1 - dom.x0)) * (W - P.l - P.r)
  const Y = (v: number) => H - P.b - ((ty(v) - dom.y0) / (dom.y1 - dom.y0)) * (H - P.t - P.b)
  const ticks = (a: number, b: number, log?: boolean) => {
    if (log) { const out: number[] = []; for (let e = Math.ceil(a); e <= Math.floor(b); e++) out.push(10 ** e); return out }
    const span = b - a, raw = span / 5, mag = 10 ** Math.floor(Math.log10(raw)), st = [1, 2, 5, 10].map(m => m * mag).find(s => span / s <= 6) ?? raw
    const out: number[] = []; for (let v = Math.ceil(a / st) * st; v <= b; v += st) out.push(+v.toFixed(6)); return out
  }
  const fmt = (v: number) => Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : Math.abs(v) >= 10 || v === 0 ? String(Math.round(v)) : String(+v.toPrecision(2))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', maxHeight: H + 40 }} role="img" aria-label={`${yLabel} against ${xLabel}`}>
      {ticks(dom.x0, dom.x1, logX).map(v => <g key={`x${v}`}><line x1={X(v)} x2={X(v)} y1={P.t} y2={H - P.b} stroke={tint(T.faint, 14)} /><text x={X(v)} y={H - P.b + 14} fontSize={10} textAnchor="middle" fill={T.faint}>{fmt(v)}</text></g>)}
      {ticks(dom.y0, dom.y1, logY).map(v => <g key={`y${v}`}><line x1={P.l} x2={W - P.r} y1={Y(v)} y2={Y(v)} stroke={tint(T.faint, 14)} /><text x={P.l - 6} y={Y(v) + 3.5} fontSize={10} textAnchor="end" fill={T.faint}>{fmt(v)}</text></g>)}
      {diagonal && <line x1={X(logX ? 10 ** dom.x0 : dom.x0)} y1={Y(logY ? 10 ** dom.y0 : dom.y0)} x2={X(logX ? 10 ** dom.x1 : dom.x1)} y2={Y(logY ? 10 ** dom.y1 : dom.y1)} stroke={T.muted} strokeDasharray="4 4" />}
      {points.map((p, i) => <circle key={i} cx={X(p.x)} cy={Y(p.y)} r={p.r ?? 2.6} fill={p.hex} fillOpacity={0.8} stroke="rgba(0,0,0,.25)" strokeWidth={0.4}>{p.title && <title>{p.title}</title>}</circle>)}
      <text x={(P.l + W - P.r) / 2} y={H - 4} fontSize={11} textAnchor="middle" fill={T.muted}>{xLabel}</text>
      <text x={12} y={(P.t + H - P.b) / 2} fontSize={11} textAnchor="middle" fill={T.muted} transform={`rotate(-90 12 ${(P.t + H - P.b) / 2})`}>{yLabel}</text>
    </svg>
  )
}

export function Histogram({ values, bins = 24, log, label, color = T.bar, height = 150 }: { values: number[]; bins?: number; log?: boolean; label: string; color?: string; height?: number }) {
  const W = 420, H = height, P = 26
  const t = (v: number) => log ? Math.log10(Math.max(1e-6, v)) : v
  const xs = values.map(t)
  const a = Math.min(...xs), b = Math.max(...xs)
  const counts = new Array(bins).fill(0)
  xs.forEach(v => { counts[Math.min(bins - 1, Math.floor(((v - a) / (b - a || 1)) * bins))]++ })
  const max = Math.max(1, ...counts)
  const bw = (W - P) / bins
  const at = (k: number) => { const v = a + (k / bins) * (b - a); return log ? 10 ** v : v }
  const fmt = (v: number) => v >= 10 ? String(Math.round(v)) : String(+v.toPrecision(2))
  return (
    <svg viewBox={`0 0 ${W} ${H + 30}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label={label}>
      {counts.map((n, k) => <rect key={k} x={P + k * bw + 1} y={H - (n / max) * (H - 8)} width={bw - 2} height={(n / max) * (H - 8)} fill={color} opacity={0.85}><title>{fmt(at(k))}–{fmt(at(k + 1))}: {n}</title></rect>)}
      {[0, bins / 2, bins].map(k => <text key={k} x={P + k * bw} y={H + 14} fontSize={10} textAnchor={k === 0 ? 'start' : k === bins ? 'end' : 'middle'} fill={T.faint}>{fmt(at(k))}</text>)}
      <text x={(W + P) / 2} y={H + 28} fontSize={11} textAnchor="middle" fill={T.muted}>{label}</text>
      <text x={0} y={10} fontSize={10} fill={T.faint}>n</text>
    </svg>
  )
}

export function Stereonet({ points, size = 300 }: { points: { dip: number; dipDir: number; hex: string; title?: string }[]; size?: number }) {
  const R = size / 2 - 22, c = size / 2
  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', maxWidth: size + 40, height: 'auto' }} role="img" aria-label="Stereonet: poles to planes, lower hemisphere">
      <circle cx={c} cy={c} r={R} fill={tint(T.faint, 5)} stroke={T.muted} />
      {[30, 60].map(d => { const p = polePoint(90 - d, 0, R); return <circle key={d} cx={c} cy={c} r={Math.abs(p.y)} fill="none" stroke={tint(T.faint, 25)} strokeDasharray="2 3" /> })}
      <line x1={c - R} x2={c + R} y1={c} y2={c} stroke={tint(T.faint, 25)} />
      <line x1={c} x2={c} y1={c - R} y2={c + R} stroke={tint(T.faint, 25)} />
      {[['N', 0, -1], ['E', 1, 0], ['S', 0, 1], ['W', -1, 0]].map(([l, dx, dy]) => <text key={l as string} x={c + (dx as number) * (R + 12)} y={c + (dy as number) * (R + 12) + 4} fontSize={11} fontWeight={700} textAnchor="middle" fill={T.muted}>{l}</text>)}
      {points.map((p, i) => { const q = polePoint(p.dip, p.dipDir, R); return <circle key={i} cx={c + q.x} cy={c + q.y} r={2.6} fill={p.hex} fillOpacity={0.8}>{p.title && <title>{p.title}</title>}</circle> })}
    </svg>
  )
}

export function HoleTabs({ holes, value, onChange }: { holes: string[]; value: string; onChange: (h: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {holes.map(h => (
        <button key={h} type="button" onClick={() => onChange(h)} style={{
          padding: '6px 11px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
          border: `1px solid ${h === value ? tint(T.orange, 60) : T.border}`, background: h === value ? tint(T.orange, 14) : 'transparent', color: h === value ? T.text : T.muted,
        }}>{h}</button>
      ))}
    </div>
  )
}

export function KeyRow({ items }: { items: { hex: string; label: string }[] }) {
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: T.muted }}>
      {items.map(i => <span key={i.label} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><span style={{ width: 10, height: 10, borderRadius: 2, background: i.hex, border: `1px solid ${T.border}` }} />{i.label}</span>)}
    </div>
  )
}

export function SampleBadge({ children = 'Sample data' }: { children?: ReactNode }) {
  return <span title="Generated for the demo from what the real tray photos show; an import replaces it" style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 5, background: tint(T.blue, 14), color: T.text, border: `1px solid ${tint(T.blue, 40)}`, whiteSpace: 'nowrap' }}>{children}</span>
}
