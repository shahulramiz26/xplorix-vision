'use client'

import type { ReactNode } from 'react'
import { useEscape } from './kit'
import { C, iStyle, derivedStyle } from '../../lib/costing-store'
import { hexA } from '../../lib/theme'

/* Form and table pieces of the costing screens: Finance rig by rig, and the
 * cost forms that also open from Rigs and from a project. */

export function Card({ title, subtitle, right, children, pad = true, accent }: {
  title?: string; subtitle?: string; right?: ReactNode; children: ReactNode; pad?: boolean; accent?: string
}) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', borderLeft: accent ? `3px solid ${accent}` : undefined }}>
      {title && (
        <div style={{ padding: '11px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{title}</div>
            {subtitle && <div style={{ fontSize: 11, color: C.faint, marginTop: 3 }}>{subtitle}</div>}
          </div>
          {right}
        </div>
      )}
      <div style={pad ? { padding: 16 } : undefined}>{children}</div>
    </div>
  )
}

export function Stat({ label, value, note, color = C.text, big }: {
  label: string; value: string; note?: string; color?: string; big?: boolean
}) {
  return (
    <div style={{ padding: '12px 14px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: big ? 21 : 17, fontWeight: 900, color, fontFamily: 'ui-monospace, monospace', lineHeight: 1.15 }}>{value}</div>
      {note && <div style={{ fontSize: 10, color: C.faint, marginTop: 5 }}>{note}</div>}
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, height: 15 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 10, color: C.dim, marginTop: 4, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  )
}

export function NumField({ label, value, onChange, hint, color = C.text, suffix }: {
  label: string; value: number; onChange: (n: number) => void; hint?: string; color?: string; suffix?: string
}) {
  return (
    <Field label={label} hint={hint}>
      <div style={{ position: 'relative' }}>
        <input type="number" value={Number.isFinite(value) ? value : 0}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          style={{ ...iStyle, color, fontWeight: 700, fontFamily: 'ui-monospace, monospace', paddingRight: suffix ? 42 : 10 }} />
        {suffix && <span style={{ position: 'absolute', right: 9, top: 7, fontSize: 10.5, color: C.dim, pointerEvents: 'none' }}>{suffix}</span>}
      </div>
    </Field>
  )
}

export function TextField({ label, value, onChange, placeholder, hint }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string
}) {
  return (
    <Field label={label} hint={hint}>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={iStyle} />
    </Field>
  )
}

export function DateField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      <input type="date" value={value} onChange={e => onChange(e.target.value)} style={{ ...iStyle }} />
    </Field>
  )
}

/* A value XPLORIX worked out. `onOverride` makes it typeable — the calculation
 * is a starting point, never a lock — and an overridden value keeps the manual
 * tag so a month later you can still see which figures were computed. */
export function Derived({ label, value, hint, color = C.text, overridden, onOverride, onClear }: {
  label: string; value: string; hint?: string; color?: string
  overridden?: number; onOverride?: (n: number) => void; onClear?: () => void
}) {
  const manual = overridden != null
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
        <Tag tone={manual ? C.amber : C.dim}>{manual ? 'manual' : 'auto'}</Tag>
      </div>
      {manual && onOverride ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <input type="number" value={overridden} onChange={e => onOverride(parseFloat(e.target.value) || 0)}
            style={{ ...iStyle, color: C.amber, fontWeight: 700, fontFamily: 'ui-monospace, monospace' }} />
          <button onClick={onClear} title="Back to the calculated value"
            style={{ padding: '0 12px', borderRadius: 8, background: 'rgba(var(--x-ov),0.04)', border: `1px solid ${C.border}`, color: C.faint, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>Reset</button>
        </div>
      ) : (
        <div style={{ ...derivedStyle, color, fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span>{value}</span>
          {onOverride && (
            <button onClick={() => onOverride(0)} title="Enter this by hand"
              style={{ background: 'none', border: 'none', color: C.dim, fontSize: 10, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>edit</button>
          )}
        </div>
      )}
      {hint && <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>{hint}</div>}
    </div>
  )
}

export function Tag({ children, tone = C.faint }: { children: ReactNode; tone?: string }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
      padding: '2px 7px', borderRadius: 5, color: tone,
      background: `${hexA(tone, 0x1A)}`, border: `1px solid ${hexA(tone, 0x33)}`, whiteSpace: 'nowrap',
    }}>{children}</span>
  )
}

/* iOS-style switch. Used where the choice is genuinely on/off — a segmented
 * control is better when two named alternatives both need naming. */
export function Switch({ on, onChange, label, hint }: {
  on: boolean; onChange: (v: boolean) => void; label: string; hint?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0' }}>
      <button onClick={() => onChange(!on)} role="switch" aria-checked={on} style={{
        width: 38, height: 22, borderRadius: 11, flexShrink: 0, marginTop: 1, cursor: 'pointer',
        border: 'none', padding: 0, position: 'relative',
        background: on ? C.orange : 'var(--x-border3)', transition: 'background 0.18s',
      }}>
        <span style={{
          position: 'absolute', top: 3, left: on ? 19 : 3, width: 16, height: 16,
          borderRadius: '50%', background: '#fff', transition: 'left 0.18s',
          boxShadow: '0 1px 3px rgba(var(--x-shadow),0.4)',
        }} />
      </button>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: C.faint, marginTop: 3, lineHeight: 1.5 }}>{hint}</div>}
      </div>
    </div>
  )
}

/* Segmented control. Used where two named alternatives both need naming — a
 * switch is better only when the choice is genuinely on/off. */
export function Toggle<T extends string>({ options, value, onChange, labels }: {
  options: readonly T[]; value: T; onChange: (v: T) => void; labels?: Record<string, string>
}) {
  return (
    <div style={{ display: 'flex', gap: 4, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 9, padding: 4 }}>
      {options.map(o => (
        <button key={o} onClick={() => onChange(o)} style={{
          flex: 1, padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
          border: 'none', whiteSpace: 'nowrap', fontFamily: 'inherit',
          background: value === o ? C.orange : 'transparent', color: value === o ? '#fff' : C.faint,
        }}>{labels?.[o] ?? o}</button>
      ))}
    </div>
  )
}

export function Btn({ children, onClick, tone = 'ghost', disabled, size = 'md' }: {
  children: ReactNode; onClick?: () => void; tone?: 'primary' | 'ghost' | 'danger'; disabled?: boolean; size?: 'sm' | 'md'
}) {
  const tones: Record<string, React.CSSProperties> = {
    primary: { background: `linear-gradient(135deg, ${C.orange}, ${C.orangeD})`, color: '#fff', border: 'none' },
    ghost: { background: 'rgba(var(--x-ov),0.04)', border: `1px solid ${C.border}`, color: C.muted },
    danger: { background: 'color-mix(in srgb, var(--x-red) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--x-red) 22%, transparent)', color: C.red },
  }
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, cursor: disabled ? 'not-allowed' : 'pointer',
      borderRadius: 9, fontWeight: 700, fontFamily: 'inherit', opacity: disabled ? 0.45 : 1,
      padding: size === 'sm' ? '5px 11px' : '8px 15px', fontSize: size === 'sm' ? 11.5 : 12.5,
      whiteSpace: 'nowrap', ...tones[tone],
    }}>{children}</button>
  )
}

export function Note({ tone = C.blue, children }: { tone?: string; children: ReactNode }) {
  return (
    <div style={{ padding: '9px 13px', borderRadius: 9, background: `${hexA(tone, 0x0F)}`, border: `1px solid ${hexA(tone, 0x33)}`, fontSize: 11.5, color: tone, lineHeight: 1.55 }}>{children}</div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div style={{ padding: '34px 20px', textAlign: 'center', color: C.faint, fontSize: 12.5, lineHeight: 1.7 }}>{children}</div>
}

/* Dense financial tables: numerals monospace and right aligned, so a column
 * reads as a column of figures rather than of words. */
export const th: React.CSSProperties = {
  padding: '7px 12px', textAlign: 'left', fontSize: 10, color: C.faint, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap',
  borderBottom: `1px solid ${C.border}`, background: 'rgba(var(--x-ov),0.02)',
}
export const thR: React.CSSProperties = { ...th, textAlign: 'right' }
export const td: React.CSSProperties = { padding: '7px 12px', fontSize: 12, color: C.muted, whiteSpace: 'nowrap' }
export const tdN: React.CSSProperties = { ...td, textAlign: 'right', fontFamily: 'ui-monospace, monospace' }
export const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' }
export const rowBorder = '1px solid color-mix(in srgb, var(--x-border) 50%, transparent)'

/* Metres to one decimal: a day's metres are a sum of shifts, and a sum of
 * decimals carries float noise (6.300000000000001) that must never reach the screen. */
export const fm = (m: number) => String(Math.round(m * 10) / 10)

export function Modal({ title, subtitle, width = 760, onClose, children, footer }: {
  title: string; subtitle?: string; width?: number; onClose: () => void; children: ReactNode; footer?: ReactNode
}) {
  useEscape(onClose)
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(var(--x-shadow),0.82)', backdropFilter: 'blur(10px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, width, maxWidth: '100%', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px 13px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12, color: C.faint, marginTop: 4 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} aria-label="Close" style={{ padding: 7, borderRadius: 8, background: 'rgba(var(--x-ov),0.04)', border: `1px solid ${C.border}`, color: C.faint, cursor: 'pointer', lineHeight: 0, fontFamily: 'inherit' }}>✕</button>
        </div>
        <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>{children}</div>
        {footer && <div style={{ padding: '13px 20px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>{footer}</div>}
      </div>
    </div>
  )
}

export function Grid({ cols, children }: { cols: number; children: ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gap: 12 }}>{children}</div>
}

export function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{title}</div>
        {note && <div style={{ fontSize: 11, color: C.faint, marginTop: 4, maxWidth: 640, lineHeight: 1.6, minHeight: 17 }}>{note}</div>}
      </div>
      {children}
    </div>
  )
}
