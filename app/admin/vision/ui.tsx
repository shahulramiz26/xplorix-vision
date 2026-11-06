'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'

/* The vision screens share one dark look with the cockpit: the look of a
 * control room, so a demo moves between them without a jolt. */

export const V = {
  bg: '#0E1116', panel: '#161B22', raised: '#1C232D', line: '#2A3340', text: '#E8EDF3', muted: '#9AA6B5', faint: '#677486',
  orange: '#F97316', red: '#EF4444', amber: '#F59E0B', green: '#22C55E', blue: '#3B82F6', violet: '#8B5CF6', teal: '#14B8A6',
}
export const vmono = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace"

export type Stage = 'today' | 'launch' | 'y2' | 'y3'
export const STAGE: Record<Stage, { label: string; color: string; note: string }> = {
  today: { label: 'TODAY · BUILT', color: V.green, note: 'In the MVP now' },
  launch: { label: 'LAUNCH', color: V.orange, note: 'Copilot level 1' },
  y2: { label: 'YEAR 2', color: V.violet, note: 'Planned' },
  y3: { label: 'YEAR 3+', color: V.blue, note: 'Vision' },
}

export function Shell({ stage, title, lead, right, children }: { stage: Stage; title: string; lead: ReactNode; right?: ReactNode; children: ReactNode }) {
  const st = STAGE[stage]
  return (
    <div style={{ background: V.bg, color: V.text, borderRadius: 16, padding: 'clamp(14px, 2.2vw, 26px)', display: 'grid', gap: 16 }}>
      <style>{`
        .v-btn { font-family: inherit; cursor: pointer; border-radius: 10px; border: 1px solid ${V.line}; background: ${V.raised}; color: ${V.text}; padding: 0 14px; min-height: 40px; font-size: 13.5px; font-weight: 600; display: inline-flex; align-items: center; gap: 8px; text-decoration: none; }
        .v-btn:hover { border-color: #3A4656; }
        .v-btn:focus-visible { outline: 2px solid ${V.orange}; outline-offset: 2px; }
        .v-tab { width: 100%; border-collapse: collapse; font-size: 13px; }
        .v-tab th { text-align: left; font-size: 11px; letter-spacing: .08em; color: ${V.faint}; font-weight: 700; padding: 9px 12px; border-bottom: 1px solid ${V.line}; white-space: nowrap; }
        .v-tab td { padding: 9px 12px; border-bottom: 1px solid ${V.line}; color: ${V.muted}; vertical-align: top; }
        .v-tab td.n, .v-tab th.n { text-align: right; font-family: ${vmono}; white-space: nowrap; }
        .v-tab td:first-child { white-space: nowrap; }
        .v-tab tr:last-child td { border-bottom: none; }
      `}</style>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.12em', color: st.color, border: `1px solid ${st.color}`, borderRadius: 999, padding: '3px 10px' }}>{st.label}</span>
            <Link href="/admin/vision" style={{ fontSize: 12.5, color: V.faint, textDecoration: 'none' }}>XPLORIX Vision ›</Link>
          </div>
          <h1 style={{ fontSize: 'clamp(22px, 2.6vw, 30px)', fontWeight: 800, margin: '10px 0 6px', letterSpacing: '-.01em', color: V.text }}>{title}</h1>
          <div style={{ fontSize: 14.5, color: V.muted, lineHeight: 1.55, maxWidth: 900 }}>{lead}</div>
        </div>
        {right && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{right}</div>}
      </div>
      {children}
    </div>
  )
}

export function Box({ title, sub, children, pad = true, right }: { title?: string; sub?: string; children: ReactNode; pad?: boolean; right?: ReactNode }) {
  return (
    <section style={{ background: V.panel, border: `1px solid ${V.line}`, borderRadius: 14, minWidth: 0, overflow: 'hidden' }}>
      {title && <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, padding: '12px 14px', borderBottom: pad ? undefined : `1px solid ${V.line}` }}>
        <div><div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.1em', color: V.muted }}>{title.toUpperCase()}</div>{sub && <div style={{ fontSize: 12.5, color: V.faint, marginTop: 3 }}>{sub}</div>}</div>
        {right}
      </div>}
      <div style={{ padding: pad ? (title ? '0 14px 14px' : 14) : 0 }}>{children}</div>
    </section>
  )
}

export function Stat({ label, value, note, tone }: { label: string; value: ReactNode; note?: ReactNode; tone?: string }) {
  return (
    <div style={{ background: V.panel, border: `1px solid ${V.line}`, borderRadius: 14, padding: '12px 14px', borderLeft: `3px solid ${tone ?? V.line}` }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: V.faint }}>{label.toUpperCase()}</div>
      <div style={{ fontFamily: vmono, fontSize: 26, fontWeight: 700, marginTop: 4 }}>{value}</div>
      {note && <div style={{ fontSize: 12.5, color: V.muted, marginTop: 2, lineHeight: 1.45 }}>{note}</div>}
    </div>
  )
}
export function Stats({ children, min = 170 }: { children: ReactNode; min?: number }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))`, gap: 12 }}>{children}</div>
}
export function Note({ children }: { children: ReactNode }) {
  return <div role="note" style={{ padding: '9px 12px', borderRadius: 10, border: `1px dashed ${V.line}`, fontSize: 12.5, color: V.muted, lineHeight: 1.55 }}>{children}</div>
}
export function Pill({ children, color }: { children: ReactNode; color: string }) {
  return <span style={{ display: 'inline-block', fontSize: 11.5, fontWeight: 700, color, border: `1px solid ${color}`, borderRadius: 999, padding: '1px 9px', whiteSpace: 'nowrap' }}>{children}</span>
}
