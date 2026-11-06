'use client'

import { ReactNode, useMemo, useRef } from 'react'
import Link from 'next/link'
import type { CoreTray, BreakVerdict, GapVerdict, AddedBreak } from '../../lib/core/model'
import type { IntervalResult } from '../../lib/core/geotech'
import { gapId } from '../../lib/core/geotech'
import { useCore, className } from '../../lib/core/store'
import { T, tint, mono } from './kit'

/* ==========================================================================
 * XPLORIX CORE — pieces shared by the Geology screens
 * ========================================================================== */

export const CORE_COLOURS = {
  natural: '#E5487F',      // natural fracture
  handling: '#22A06B',     // break made in handling
  unsure: '#F5A524',       // low confidence, worth a look
  lost: '#E5484D',         // core lost
  sampled: '#3E7BFA',      // core taken for samples
  block: '#3E7BFA',
}

export const photoSrc = (t: CoreTray & { photo?: string }, big = false) => t.photo ?? `/core/photos/${t.hole}/${big && t.hd ? t.hd : t.file}`
export const pct = (n: number) => `${Math.round(n)}%`
export const m1 = (n: number) => `${n.toFixed(1)} m`
export const dep = (a: number, b: number) => `${a.toFixed(2)}–${b.toFixed(2)} m`

/* Depth to a point on the photo, and back. */
export function depthAtX(t: CoreTray, row: number, x: number): number | null {
  const s = t.spans.find(sp => sp.row === row && x >= sp.x0 && x <= sp.x1)
  if (!s) return null
  return s.from + ((x - s.x0) / Math.max(1, s.x1 - s.x0)) * (s.to - s.from)
}
export function xAtDepth(t: CoreTray, at: number): { row: number; x: number } | null {
  const s = t.spans.find(sp => at >= sp.from && at <= sp.to)
  if (!s) return null
  return { row: s.row, x: s.x0 + ((at - s.from) / Math.max(1e-9, s.to - s.from)) * (s.x1 - s.x0) }
}

export type Sel = { kind: 'break'; id: string } | { kind: 'gap'; id: string } | { kind: 'added'; id: string } | null

/* A tray photo with what the photo step found drawn over it. */
export function TrayPhoto({ tray, sel, onSelect, onAdd, adding, show = { rows: true, breaks: true, gaps: true }, compact }: {
  tray: CoreTray & { photo?: string }
  sel?: Sel
  onSelect?: (s: Sel) => void
  onAdd?: (row: number, x: number) => void
  adding?: boolean
  show?: { rows: boolean; breaks: boolean; gaps: boolean }
  compact?: boolean
}) {
  const { review } = useCore()
  const svg = useRef<SVGSVGElement>(null)
  const { w, h } = tray
  const added = review.added.filter(a => a.tray === tray.id)
  const click = (e: React.MouseEvent) => {
    if (!adding || !onAdd || !svg.current) return
    const r = svg.current.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * w, y = ((e.clientY - r.top) / r.height) * h
    const row = tray.rows.findIndex(rw => y >= rw.top && y < rw.bottom)
    if (row >= 0) onAdd(row, x)
  }
  const sw = Math.max(0.8, w / 400)
  return (
    <div style={{ position: 'relative', width: '100%', lineHeight: 0, borderRadius: compact ? 6 : 10, overflow: 'hidden', background: '#111', cursor: adding ? 'crosshair' : 'default' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photoSrc(tray, !compact)} alt={`Core tray ${tray.no}, ${dep(tray.from, tray.to)}`} style={{ width: '100%', height: 'auto', display: 'block', imageRendering: compact ? 'auto' : 'auto' }} />
      <svg ref={svg} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" onClick={click}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} role="img" aria-label="What the photo step found">
        {show.rows && tray.rows.map((r, i) => (
          <g key={`r${i}`}>
            <line x1={0} x2={w} y1={r.top} y2={r.top} stroke="#00B7FF" strokeOpacity={0.55} strokeWidth={sw * 0.6} strokeDasharray={`${sw * 3} ${sw * 3}`} />
            {!compact && <text x={2} y={r.band[0] + 6 * sw} fontSize={6 * sw} fill="#fff" stroke="#000" strokeWidth={sw * 0.6} paintOrder="stroke" style={{ fontFamily: mono }}>{r.from.toFixed(1)}</text>}
          </g>
        ))}
        {show.gaps && tray.spans.filter(s => s.kind !== 'core').map(s => {
          const r = tray.rows[s.row]
          const id = gapId(tray.id, s.row, s.x0)
          const v: GapVerdict | 'block' = s.kind === 'block' ? 'block' : (review.gaps[id] ?? 'lost')
          if (v === 'core') return (
            <rect key={id} x={s.x0} y={r.band[0]} width={s.x1 - s.x0} height={r.band[1] - r.band[0]} fill="none" stroke="#fff" strokeOpacity={0.6} strokeDasharray={`${sw * 2} ${sw * 2}`} strokeWidth={sw * 0.6}
              onClick={e => { if (!adding) { e.stopPropagation(); onSelect?.({ kind: 'gap', id }) } }} style={{ cursor: onSelect ? 'pointer' : 'default' }} />
          )
          const c = v === 'block' ? CORE_COLOURS.block : v === 'sampled' ? CORE_COLOURS.sampled : CORE_COLOURS.lost
          const on = sel?.kind === 'gap' && sel.id === id
          return (
            <rect key={id} x={s.x0} y={r.band[0]} width={s.x1 - s.x0} height={r.band[1] - r.band[0]} fill={c} fillOpacity={0.25} stroke={c} strokeWidth={on ? sw * 2 : sw}
              onClick={e => { if (s.kind === 'block' || adding) return; e.stopPropagation(); onSelect?.({ kind: 'gap', id }) }}
              style={{ cursor: onSelect && s.kind !== 'block' ? 'pointer' : 'default' }}>
              <title>{s.kind === 'block' ? 'Depth block' : v === 'sampled' ? 'Core taken for samples' : 'No core in the tray'} · {dep(s.from, s.to)}</title>
            </rect>
          )
        })}
        {show.breaks && tray.breaks.map(b => {
          const r = tray.rows[b.row]
          const v = review.breaks[b.id]
          if (v === 'none' && !(sel?.kind === 'break' && sel.id === b.id)) return null
          const kind = v ?? b.kind
          const c = v === 'none' ? '#999' : kind === 'natural' ? CORE_COLOURS.natural : CORE_COLOURS.handling
          const on = sel?.kind === 'break' && sel.id === b.id
          const y0 = r.band[0], y1 = r.band[1]
          return (
            <g key={b.id} onClick={e => { if (adding) return; e.stopPropagation(); onSelect?.({ kind: 'break', id: b.id }) }} style={{ cursor: onSelect ? 'pointer' : 'default' }}>
              <line x1={b.x - b.dx / 2} x2={b.x + b.dx / 2} y1={y0} y2={y1} stroke="transparent" strokeWidth={sw * 7} />
              <line x1={b.x - b.dx / 2} x2={b.x + b.dx / 2} y1={y0} y2={y1} stroke={c} strokeWidth={on ? sw * 2.4 : sw * 1.3}
                strokeDasharray={kind === 'handling' ? `${sw * 2.5} ${sw * 1.5}` : undefined} />
              {!v && b.confidence === 'low' && <circle cx={b.x} cy={y0 - sw * 0.5} r={sw * 2.2} fill={CORE_COLOURS.unsure} stroke="#000" strokeWidth={sw * 0.4} />}
              {v && v !== 'none' && <circle cx={b.x} cy={y0 - sw * 0.5} r={sw * 2.2} fill="#FFE14D" stroke="#000" strokeWidth={sw * 0.4} />}
              {on && <rect x={b.x - sw * 6} y={y0 - sw} width={sw * 12} height={y1 - y0 + sw * 2} fill="none" stroke="#fff" strokeWidth={sw * 0.8} />}
              <title>{kind === 'natural' ? 'Natural fracture' : 'Break made in handling'} · {b.at.toFixed(2)} m · α {b.alpha}°{v ? ' · changed by the geologist' : b.confidence === 'low' ? ' · low confidence' : ''}</title>
            </g>
          )
        })}
        {show.breaks && added.map(a => {
          const p = xAtDepth(tray, a.at)
          if (!p) return null
          const r = tray.rows[p.row]
          const on = sel?.kind === 'added' && sel.id === a.id
          const c = a.kind === 'natural' ? CORE_COLOURS.natural : CORE_COLOURS.handling
          return (
            <g key={a.id} onClick={e => { if (adding) return; e.stopPropagation(); onSelect?.({ kind: 'added', id: a.id }) }} style={{ cursor: 'pointer' }}>
              <line x1={p.x} x2={p.x} y1={r.band[0]} y2={r.band[1]} stroke="transparent" strokeWidth={sw * 7} />
              <line x1={p.x} x2={p.x} y1={r.band[0]} y2={r.band[1]} stroke={c} strokeWidth={on ? sw * 2.4 : sw * 1.3} strokeDasharray={a.kind === 'handling' ? `${sw * 2.5} ${sw * 1.5}` : undefined} />
              <circle cx={p.x} cy={r.band[0] - sw * 0.5} r={sw * 2.2} fill="#FFE14D" stroke="#000" strokeWidth={sw * 0.4} />
              <title>Added by the geologist · {a.at.toFixed(2)} m</title>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export function CoreLegend() {
  const items: [string, ReactNode][] = [
    ['Natural fracture', <span key="n" style={{ width: 14, height: 2, background: CORE_COLOURS.natural, display: 'inline-block' }} />],
    ['Break made in handling', <span key="h" style={{ width: 14, height: 0, borderTop: `2px dashed ${CORE_COLOURS.handling}`, display: 'inline-block' }} />],
    ['Low confidence: please check', <span key="u" style={{ width: 9, height: 9, borderRadius: 9, background: CORE_COLOURS.unsure, display: 'inline-block' }} />],
    ['Changed by the geologist', <span key="c" style={{ width: 9, height: 9, borderRadius: 9, background: '#FFE14D', border: '1px solid #000', display: 'inline-block' }} />],
    ['No core in the tray', <span key="l" style={{ width: 14, height: 9, background: tint(CORE_COLOURS.lost, 35), border: `1px solid ${CORE_COLOURS.lost}`, display: 'inline-block' }} />],
    ['Taken for samples', <span key="s" style={{ width: 14, height: 9, background: tint(CORE_COLOURS.sampled, 35), border: `1px solid ${CORE_COLOURS.sampled}`, display: 'inline-block' }} />],
  ]
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: T.muted }}>
      {items.map(([l, s]) => <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{s}{l}</span>)}
    </div>
  )
}

/* A horizontal bar for a 0–100 value in a table. */
export function Bar({ value, max = 100, color = T.bar, w = 80 }: { value: number; max?: number; color?: string; w?: number }) {
  return (
    <span aria-hidden style={{ display: 'inline-block', width: w, height: 7, borderRadius: 4, background: tint(T.faint, 22), verticalAlign: 'middle', overflow: 'hidden' }}>
      <span style={{ display: 'block', width: `${Math.max(0, Math.min(100, (value / max) * 100))}%`, height: '100%', background: color, borderRadius: 4 }} />
    </span>
  )
}

export const recColour = (v: number) => v >= 95 ? T.green : v >= 85 ? T.amber : T.red
export const rqdColour = (v: number) => v >= 75 ? T.green : v >= 50 ? T.amber : T.red

/* Histogram of fracture angles to the core axis, 0–90°, in 10° bins. */
export function AlphaChart({ alphas, sets, height = 120 }: { alphas: number[]; sets?: { mean: number; n: number }[]; height?: number }) {
  const bins = useMemo(() => { const b = new Array(9).fill(0); alphas.forEach(a => { b[Math.min(8, Math.floor(a / 10))]++ }); return b }, [alphas])
  const max = Math.max(1, ...bins)
  const W = 360, H = height, pad = 22
  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} style={{ width: '100%', maxWidth: 520, height: 'auto' }} role="img" aria-label="Fracture angles to the core axis">
      {bins.map((n, i) => {
        const bw = (W - pad) / 9, bh = (n / max) * (H - 10)
        return (
          <g key={i}>
            <rect x={pad + i * bw + 2} y={H - bh} width={bw - 4} height={bh} rx={2} fill={T.bar} opacity={0.85}><title>{i * 10}–{i * 10 + 10}°: {n}</title></rect>
            <text x={pad + i * bw + bw / 2} y={H + 13} fontSize={10} textAnchor="middle" fill={T.faint}>{i * 10}</text>
          </g>
        )
      })}
      {sets?.map((s, i) => {
        const x = pad + (s.mean / 90) * (W - pad)
        return <g key={i}><line x1={x} x2={x} y1={4} y2={H} stroke={T.orange} strokeWidth={1.5} strokeDasharray="4 3" /><text x={x + 3} y={12} fontSize={10} fill={T.orange}>Set {i + 1}</text></g>
      })}
      <text x={0} y={10} fontSize={10} fill={T.faint}>n</text>
    </svg>
  )
}

/* The strip log: core columns beside drilling columns, one row per metre. */
export interface StripDrill { from: number; to: number; rate: number; normal: number; driller: string; shift: string; date: string; downtime: number; reason: string; drillerRec: number }
export const CLASS_HEX = ['#3b3f45', '#6b5b4b', '#8c6a46', '#7d7f80', '#b19e86', '#c9cbc6', '#5b7a6a', '#a0574a']
export function classHex(id: number, centres?: { hex: string }[]) { return id < 0 ? 'transparent' : centres?.[id]?.hex ?? CLASS_HEX[id % CLASS_HEX.length] }

export function Swatch({ hex, size = 12 }: { hex: string; size?: number }) {
  return <span aria-hidden style={{ display: 'inline-block', width: size, height: size, borderRadius: 3, background: hex, border: `1px solid ${T.border}`, verticalAlign: 'middle' }} />
}

export function DemoPhotos() {
  return <span title="Real tray photos from Australia's National Virtual Core Library (CC BY 4.0), shown on demo holes" style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 5, background: tint(T.amber, 16), color: T.text, border: `1px solid ${tint(T.amber, 40)}`, whiteSpace: 'nowrap' }}>Demo: real NVCL photos on demo holes</span>
}

export type { BreakVerdict, GapVerdict, AddedBreak }
