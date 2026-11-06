'use client'

import { ReactNode } from 'react'
import { T, tint, mono } from '../../components/kit'
import { SOURCE_LABEL, type ReportSource, type Contractor } from '../../../lib/contracting'
import { useCosting, loginOfContractor, ADMIN_NAME } from '../../../lib/costing-store'

/* Small pieces the four Contractors tabs share. */

/* Who is signed in. The MVP has no accounts yet, so every check and approval
 * is stamped with this name; with real logins it becomes the user's own. */
export const me = () => ADMIN_NAME

export const n0 = (v: number) => Math.round(v).toLocaleString('en-US')
export const n1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString('en-US', { maximumFractionDigits: 1 })
export const rs = (v: number) => `SAR ${n0(v)}`
export const pc = (v: number) => `${v.toFixed(1)}%`

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function shortDay(date: string) {
  const [, m, d] = date.slice(0, 10).split('-').map(Number)
  return `${d} ${MON[m - 1]}`
}
export function period(from: string, to: string) {
  return from.slice(0, 7) === to.slice(0, 7) ? `${Number(from.slice(8, 10))}–${shortDay(to)}` : `${shortDay(from)} – ${shortDay(to)}`
}

export const linkBtn: React.CSSProperties = {
  background: 'none', border: 'none', padding: 0, color: T.orange, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
}
export const numInput: React.CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

/* How a bill reached us. A word and a mark, never colour alone. */
export function SourceTag({ source }: { source: ReportSource }) {
  const live = source === 'login'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap',
      background: live ? tint(T.green, 10) : 'rgba(var(--x-ov),0.05)', border: `1px solid ${live ? tint(T.green, 30) : T.border}`, color: T.muted,
    }}>
      <span aria-hidden style={{ fontSize: 10, color: live ? T.green : T.faint }}>{live ? '◉' : '✎'}</span>
      {SOURCE_LABEL[source]}
    </span>
  )
}

/* Own rig or contractor's rig, in the words the company uses. */
export function RunTag({ own, label }: { own: boolean; label: string }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 5, letterSpacing: '0.02em', whiteSpace: 'nowrap',
      background: own ? tint(T.blue, 12) : tint(T.orange, 12), border: `1px solid ${own ? tint(T.blue, 32) : tint(T.orange, 34)}`, color: T.text,
    }}>{label}</span>
  )
}

/* Whether the contractor can sign in. */
export function LoginState({ c }: { c?: Contractor }) {
  const { state } = useCosting()
  if (!c) return null
  const login = loginOfContractor(state.users, c.id)
  if (!login) return <span style={{ fontSize: 12, color: T.faint }}>No login yet</span>
  const ok = login.active
  return (
    <span style={{ fontSize: 12, color: T.muted }}>
      <span aria-hidden style={{ color: ok ? T.green : T.faint, fontWeight: 800 }}>{ok ? '✓ ' : '• '}</span>
      {ok ? (login.opened ? 'Login in use' : 'Login created, not opened yet') : 'Login switched off'} <span style={{ fontFamily: mono, color: T.faint }}>{login.username}</span>
    </span>
  )
}

export function Rows({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
      {items.map(([k, v], i) => (
        <div key={i} style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: T.faint, marginBottom: 4 }}>{k}</div>
          <div style={{ fontSize: 13.5, color: T.text, lineHeight: 1.45 }}>{v}</div>
        </div>
      ))}
    </div>
  )
}

/* One line of a money statement: words on the left, figure on the right. */
export function Sum({ label, value, strong, tone, note }: { label: ReactNode; value: ReactNode; strong?: boolean; tone?: string; note?: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: strong ? '11px 0 2px' : '6px 0', borderTop: strong ? `1px solid ${T.border}` : undefined, marginTop: strong ? 6 : 0 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: strong ? 14 : 13, fontWeight: strong ? 700 : 400, color: strong ? T.text : T.muted }}>{label}</div>
        {note && <div style={{ fontSize: 12, color: T.faint, marginTop: 2, lineHeight: 1.45 }}>{note}</div>}
      </div>
      <div style={{ fontSize: strong ? 17 : 13.5, fontWeight: strong ? 700 : 600, color: tone ?? T.text, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{value}</div>
    </div>
  )
}
