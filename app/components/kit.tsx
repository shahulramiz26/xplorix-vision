'use client'

import { ReactNode, useEffect } from 'react'
import Link from 'next/link'
import { C } from '../../lib/costing-store'
import { hexA } from '../../lib/theme'

/* ==========================================================================
 * XPLORIX UI KIT — the pieces every screen is built from
 *
 * Same surfaces, borders and orange as the rest of XPLORIX, kept deliberately
 * plain: no glow, no gradients on data, no emoji. A client reads this to
 * decide whether to pay, so the screen should look like a record.
 *
 * Two rules for anything that carries a number:
 *   - a status is never colour alone — it always has a word and a mark;
 *   - text stays in the text colours — a coloured dot beside it says who.
 * ========================================================================== */

export const T = {
  ...C,
  raised: 'var(--x-raised)',
  line: 'color-mix(in srgb, var(--x-border) 60%, transparent)',
  // Series colours for charts (validated on the card surface).
  actual: 'var(--x-actual)', plan: 'var(--x-plan)', forecast: 'var(--x-forecast)',
    ownSide: 'var(--x-blue)', clientSide: 'var(--x-orange-d)',
  bar: 'var(--x-blue)',
}
/* A colour at part strength, for tinted backgrounds and soft borders. Written
 * this way so it works on a token that is a CSS variable, in either theme. */
export const tint = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`
export const display = "'IBM Plex Sans', -apple-system, 'Segoe UI', sans-serif"
export const mono = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
/* Figures that sit in columns or stand as a headline number. */
export const num: React.CSSProperties = { fontFamily: mono, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }
/* Small uppercase label, used above figures and over table columns. */
export const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--x-faint)' }
export const radius = 10

export type Tone = 'good' | 'warn' | 'bad' | 'info' | 'neutral'
export const toneColor: Record<Tone, string> = {
  good: C.green, warn: C.amber, bad: C.red, info: C.blue, neutral: C.faint,
}
const toneMark: Record<Tone, string> = { good: '✓', warn: '!', bad: '✕', info: '•', neutral: '•' }

// ── PAGE HEAD ─────────────────────────────────────────────────────────────

/* Every screen is a question its reader is asking, with the answer on the
 * line below it. The charts underneath are the evidence. */
export function PageHead({ question, answer, tone = 'neutral', right }: {
  question: string; answer: ReactNode; tone?: Tone; right?: ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0, flex: '1 1 420px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: T.text, margin: 0, fontFamily: display, letterSpacing: '-0.015em', lineHeight: 1.25, textWrap: 'balance' }}>{question}</h1>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 8, maxWidth: 820 }}>
          <span aria-hidden style={{
            flexShrink: 0, width: 18, height: 18, borderRadius: '50%', marginTop: 1,
            background: `${hexA(toneColor[tone], 0x22)}`, color: toneColor[tone], fontSize: 11, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{toneMark[tone]}</span>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: T.muted, margin: 0 }}>{answer}</p>
        </div>
      </div>
      {right && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{right}</div>}
    </div>
  )
}

export function Page({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 48, maxWidth: 1680, width: '100%' }}>{children}</div>
}

// ── CARD / TILE ───────────────────────────────────────────────────────────

export function Card({ title, subtitle, right, children, pad = true }: {
  title?: string; subtitle?: string; right?: ReactNode; children: ReactNode; pad?: boolean
}) {
  return (
    <section style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: radius, overflow: 'hidden', minWidth: 0, boxShadow: 'var(--x-card-shadow)' }}>
      {title && (
        <header style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: T.text, fontFamily: display, letterSpacing: '-0.005em' }}>{title}</h2>
            {subtitle && <div style={{ fontSize: 12.5, color: T.faint, marginTop: 2, lineHeight: 1.45 }}>{subtitle}</div>}
          </div>
          {right}
        </header>
      )}
      <div style={pad ? { padding: 16 } : undefined}>{children}</div>
    </section>
  )
}

export function Tile({ label, value, note, tone }: { label: string; value: ReactNode; note?: ReactNode; tone?: Tone }) {
  return (
    <div style={{ position: 'relative', padding: '13px 16px 14px', background: T.card, border: `1px solid ${T.border}`, borderRadius: radius, minWidth: 0, boxShadow: 'var(--x-card-shadow)', overflow: 'hidden' }}>
      {tone && tone !== 'neutral' && <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: toneColor[tone] }} />}
      <div style={{ ...eyebrow, marginBottom: 8 }}>{label}</div>
      <div style={{ ...num, fontSize: 22, fontWeight: 600, color: T.text, lineHeight: 1.1 }}>{value}</div>
      {note && (
        <div style={{ fontSize: 12, color: tone && tone !== 'neutral' ? toneColor[tone] : T.faint, marginTop: 7, lineHeight: 1.45 }}>
          {tone && tone !== 'neutral' && <span aria-hidden style={{ marginRight: 5, fontWeight: 800 }}>{toneMark[tone]}</span>}
          {note}
        </div>
      )}
    </div>
  )
}

export function Grid({ min = 190, children }: { min?: number; children: ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 12 }}>{children}</div>
}
export function Split({ children, left = 1, right = 1 }: { children: ReactNode; left?: number; right?: number }) {
  return (
    <div className="xpl-split" style={{ display: 'grid', gridTemplateColumns: `minmax(0,${left}fr) minmax(0,${right}fr)`, gap: 16 }}>
      {children}
    </div>
  )
}

// ── STATUS / TAGS ─────────────────────────────────────────────────────────

export function Status({ tone, children }: { tone: Tone; children: ReactNode }) {
  const c = toneColor[tone]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 6,
      fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', lineHeight: 1.6,
      background: `${hexA(c, 0x16)}`, border: `1px solid ${hexA(c, 0x3a)}`, color: T.text,
    }}>
      <span aria-hidden style={{ color: c, fontWeight: 800, fontSize: 10.5 }}>{toneMark[tone]}</span>
      {children}
    </span>
  )
}

/* Phase 3 and Phase 4 screens show what is coming, not what is built. */
export function InDevelopment({ phase, children }: { phase: string; children: ReactNode }) {
  return (
    <div style={{
      padding: '13px 16px', borderRadius: 10, display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap',
      background: 'color-mix(in srgb, var(--x-amber) 7%, transparent)', border: '1px solid color-mix(in srgb, var(--x-amber) 28%, transparent)',
    }}>
      <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 5, background: 'color-mix(in srgb, var(--x-amber) 18%, transparent)', color: T.amber, whiteSpace: 'nowrap', letterSpacing: '0.05em' }}>
        IN DEVELOPMENT · {phase}
      </span>
      <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.55, flex: '1 1 260px', minWidth: 0 }}>{children}</div>
    </div>
  )
}

export function Note({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  const c = toneColor[tone]
  return (
    <div style={{ padding: '10px 14px', borderRadius: 10, fontSize: 12.5, lineHeight: 1.55, background: `${hexA(c, 0x12)}`, border: `1px solid ${hexA(c, 0x38)}`, color: T.muted }}>
      {children}
    </div>
  )
}

// ── BUTTONS / FILTERS ─────────────────────────────────────────────────────

export function Btn({ children, onClick, kind = 'ghost', size = 'md', disabled, href }: {
  children: ReactNode; onClick?: () => void; kind?: 'primary' | 'ghost' | 'good' | 'danger'
  size?: 'sm' | 'md'; disabled?: boolean; href?: string
}) {
  const kinds: Record<string, React.CSSProperties> = {
    primary: { background: T.orange, color: 'var(--x-on-accent)', border: '1px solid transparent', boxShadow: '0 1px 2px rgba(var(--x-shadow),0.12)' },
    ghost: { background: T.card, border: `1px solid var(--x-border3)`, color: T.text },
    good: { background: 'color-mix(in srgb, var(--x-green) 14%, transparent)', border: '1px solid color-mix(in srgb, var(--x-green) 40%, transparent)', color: 'var(--x-good-text)' },
    danger: { background: 'color-mix(in srgb, var(--x-red) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--x-red) 35%, transparent)', color: 'var(--x-bad-text)' },
  }
  const style: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: disabled ? 'not-allowed' : 'pointer',
    minHeight: size === 'sm' ? 30 : 36, padding: size === 'sm' ? '0 11px' : '0 14px', borderRadius: 7, fontSize: size === 'sm' ? 12.5 : 13,
    fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap', textDecoration: 'none', transition: 'background-color .15s, border-color .15s',
    opacity: disabled ? 0.45 : 1, ...kinds[kind],
  }
  if (href) return <Link href={href} style={style}>{children}</Link>
  return <button onClick={onClick} disabled={disabled} style={style}>{children}</button>
}

export function Seg<V extends string>({ options, value, onChange }: {
  options: { value: V; label: string }[]; value: V; onChange: (v: V) => void
}) {
  return (
    <div role="tablist" style={{ display: 'inline-flex', gap: 2, background: 'var(--x-raised2)', border: `1px solid ${T.border}`, borderRadius: 8, padding: 2, flexWrap: 'wrap' }}>
      {options.map(o => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)} style={{
          minHeight: 28, padding: '0 11px', borderRadius: 6, fontSize: 12.5, fontWeight: value === o.value ? 600 : 500, cursor: 'pointer', border: 'none',
          fontFamily: 'inherit', whiteSpace: 'nowrap',
          background: value === o.value ? T.card : 'transparent',
          boxShadow: value === o.value ? '0 1px 2px rgba(var(--x-shadow),0.12), 0 0 0 1px var(--x-border)' : 'none',
          color: value === o.value ? T.text : T.muted,
        }}>{o.label}</button>
      ))}
    </div>
  )
}

// ── TABLE ─────────────────────────────────────────────────────────────────

export const th: React.CSSProperties = {
  padding: '9px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: T.faint, textTransform: 'uppercase',
  letterSpacing: '0.06em', whiteSpace: 'nowrap', borderBottom: `1px solid ${T.border}`, background: 'var(--x-raised)',
}
export const thR: React.CSSProperties = { ...th, textAlign: 'right' }
export const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: T.muted, whiteSpace: 'nowrap' }
export const tdR: React.CSSProperties = { ...td, textAlign: 'right', fontFamily: mono, fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }
export const tdStrong: React.CSSProperties = { ...td, color: T.text, fontWeight: 600 }
export const rowLine = `1px solid ${T.line}`

export function Table({ children }: { children: ReactNode }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>{children}</table>
    </div>
  )
}

/* A number that broke a contract line. The mark and the weight carry it, so it
 * still reads without colour. */
export function Flag({ on, children }: { on: boolean; children: ReactNode }) {
  if (!on) return <>{children}</>
  return (
    <span style={{ color: 'var(--x-orange-p)', fontWeight: 700 }}>
      <span aria-hidden style={{ marginRight: 4 }}>▲</span>{children}
    </span>
  )
}

// ── MODAL ─────────────────────────────────────────────────────────────────

/* Escape closes whatever modal is open, as on every desktop app. */
export function useEscape(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
}

export function Modal({ title, subtitle, width = 860, onClose, children, footer }: {
  title: string; subtitle?: ReactNode; width?: number; onClose: () => void; children: ReactNode; footer?: ReactNode
}) {
  useEscape(onClose)
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 16px', overflowY: 'auto' }}>
      <div role="dialog" aria-modal onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: width, background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden', boxShadow: '0 24px 60px rgba(var(--x-shadow),0.25)' }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.line}`, display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: T.text, fontFamily: display }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12.5, color: T.faint, marginTop: 4 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: T.faint, cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 2 }}>×</button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
        {footer && <div style={{ padding: '14px 20px', borderTop: `1px solid ${T.line}`, display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>{footer}</div>}
      </div>
    </div>
  )
}

// ── CHART PIECES ──────────────────────────────────────────────────────────

export const axisTick = { fill: T.faint, fontSize: 11, fontFamily: mono }
export const gridStroke = 'color-mix(in srgb, var(--x-border) 90%, transparent)'

export function Legend({ items }: { items: { color: string; label: string; dash?: boolean; line?: boolean }[] }) {
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: T.muted }}>
      {items.map(i => (
        <span key={i.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          {i.line
            ? <span aria-hidden style={{ width: 18, height: 0, borderTop: `2px ${i.dash ? 'dashed' : 'solid'} ${i.color}` }} />
            : <span aria-hidden style={{ width: 10, height: 10, borderRadius: 2, background: i.color }} />}
          {i.label}
        </span>
      ))}
    </div>
  )
}

/* Tooltip body shared by every chart: the label, then one row per series with
 * its own colour key, value in the text colour. */
export function Tip({ active, payload, label, unit = '', names, fmt }: {
  active?: boolean; payload?: { name?: string; dataKey?: string | number; value?: number | string | null; color?: string }[]
  label?: string | number; unit?: string; names?: Record<string, string>
  fmt?: (label: number) => string        // for a numeric axis, such as dates as day numbers
}) {
  if (!active || !payload?.length) return null
  const rows = payload.filter(p => p.value != null)
  if (!rows.length) return null
  return (
    <div style={{ background: 'var(--x-panel)', border: `1px solid ${T.border}`, borderRadius: 8, padding: '9px 12px', boxShadow: '0 10px 30px rgba(var(--x-shadow),0.5)' }}>
      <div style={{ fontSize: 11.5, color: T.faint, marginBottom: 6 }}>{fmt && typeof label === 'number' ? fmt(label) : label}</div>
      {rows.map(p => (
        <div key={String(p.dataKey)} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: T.text, padding: '1.5px 0' }}>
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
          <span style={{ color: T.muted }}>{names?.[String(p.dataKey)] ?? p.name}</span>
          <span style={{ marginLeft: 'auto', paddingLeft: 14, fontWeight: 600, fontFamily: mono, fontVariantNumeric: 'tabular-nums' }}>
            {typeof p.value === 'number' ? p.value.toLocaleString('en-US') : p.value}{unit}
          </span>
        </div>
      ))}
    </div>
  )
}

/* Plain proportional bar for table rows and small comparisons. */
export function Meter({ value, max, color = T.bar, height = 8 }: { value: number; max: number; color?: string; height?: number }) {
  return (
    <div style={{ height, background: 'rgba(var(--x-ov),0.05)', borderRadius: height / 2, overflow: 'hidden', minWidth: 60 }}>
      <div style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%`, height: '100%', background: color, borderRadius: height / 2 }} />
    </div>
  )
}

/* ==========================================================================
 * Pieces added for the Company Admin console
 * ========================================================================== */

/* Plain page header: what this screen is, one line on what it is for, and the
 * screen's main action on the right. */
export function Head({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0, flex: '1 1 380px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: T.text, margin: 0, fontFamily: display, letterSpacing: '-0.015em', lineHeight: 1.25 }}>{title}</h1>
        {sub && <p style={{ fontSize: 14, lineHeight: 1.6, color: T.muted, margin: '6px 0 0', maxWidth: 760 }}>{sub}</p>}
      </div>
      {right && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{right}</div>}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div style={{ padding: '26px 18px', fontSize: 13.5, color: T.faint, lineHeight: 1.6, textAlign: 'center' }}>{children}</div>
}

export const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 11px', minHeight: 36, background: T.card, border: `1px solid var(--x-border3)`, borderRadius: 7,
  color: T.text, fontSize: 13.5, fontFamily: 'inherit',
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: T.muted, marginBottom: 6 }}>{label}</span>
      {children}
      {hint && <span style={{ display: 'block', fontSize: 12, color: T.faint, marginTop: 5, lineHeight: 1.5 }}>{hint}</span>}
    </label>
  )
}

/* On/off. Used where a setting really is one or the other. */
export function Switch({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '9px 0' }}>
      <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} style={{
        width: 36, height: 21, borderRadius: 11, flexShrink: 0, marginTop: 1, cursor: 'pointer', border: 'none', padding: 0,
        position: 'relative', background: on ? T.orange : 'var(--x-border3)', transition: 'background 0.15s',
      }}>
        <span style={{ position: 'absolute', top: 3, left: on ? 18 : 3, width: 15, height: 15, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
      </button>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, color: T.text }}>{label}</div>
        {hint && <div style={{ fontSize: 12, color: T.faint, marginTop: 2, lineHeight: 1.5 }}>{hint}</div>}
      </div>
    </div>
  )
}

/* A hole drawn the way a driller thinks of it: how far down, against how far
 * it is meant to go. The tick is the planned depth. */
export function DepthBar({ drilled, planned, width = 160 }: { drilled: number; planned?: number; width?: number | string }) {
  const max = Math.max(planned ?? 0, drilled, 1)
  const pct = (drilled / max) * 100
  return (
    <div title={planned ? `${drilled} m drilled of ${planned} m planned` : `${drilled} m drilled`} style={{ width, minWidth: 90 }}>
      <div style={{ position: 'relative', height: 8, background: 'rgba(var(--x-ov),0.06)', borderRadius: 4 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: T.bar, borderRadius: 4 }} />
        {planned != null && planned >= drilled && (
          <span aria-hidden style={{ position: 'absolute', right: 0, top: -3, width: 2, height: 14, background: T.muted, borderRadius: 1 }} />
        )}
      </div>
      <div style={{ fontSize: 12, color: T.faint, marginTop: 5, fontVariantNumeric: 'tabular-nums' }}>
        <span style={{ color: T.text, fontWeight: 600 }}>{Math.round(drilled)} m</span>{planned != null ? ` of ${planned} m` : ''}
      </div>
    </div>
  )
}

/* Fourteen small bars: one per day. A gap in the row is a day with no metres. */
export function Spark({ values, height = 26 }: { values: { date: string; metres: number }[]; height?: number }) {
  const max = Math.max(...values.map(v => v.metres), 1)
  return (
    <div aria-label="Metres per day, last 14 days" style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height }}>
      {values.map(v => (
        <div key={v.date} title={`${v.date}: ${v.metres} m`} style={{
          width: 5, height: v.metres > 0 ? Math.max(3, (v.metres / max) * height) : 2,
          background: v.metres > 0 ? T.bar : 'rgba(var(--x-ov),0.12)', borderRadius: '2px 2px 0 0',
        }} />
      ))}
    </div>
  )
}

/* Change against a comparison, said in words and with a mark. `goodWhenUp`
 * decides which direction is the good one (metres up is good, cost up is not). */
export function Delta({ now, before, goodWhenUp = true, unit = '%' }: { now: number; before: number; goodWhenUp?: boolean; unit?: '%' | 'pts' }) {
  if (!before) return <span style={{ color: T.faint }}>no earlier figure</span>
  const change = unit === '%' ? ((now - before) / Math.abs(before)) * 100 : now - before
  if (Math.abs(change) < 0.5) return <span style={{ color: T.faint }}>same as last month</span>
  const up = change > 0
  const good = up === goodWhenUp
  return (
    <span style={{ color: good ? T.green : T.amber }}>
      <span aria-hidden style={{ marginRight: 4 }}>{up ? '▲' : '▼'}</span>
      {Math.abs(change).toFixed(unit === '%' ? 0 : 1)}{unit === '%' ? '%' : ' pts'} {up ? 'up' : 'down'} on last month
    </span>
  )
}
