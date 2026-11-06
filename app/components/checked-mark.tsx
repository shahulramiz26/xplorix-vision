'use client'

import { ShieldCheck } from 'lucide-react'
import { T, tint } from './kit'
import type { HoleVerdict, ShiftVerdict } from '../../lib/log-checks'

/* "Checked by XPLORIX": shown only when every shift behind the figure passed
 * the drill log checks or was saved with a reason. Anything less shows
 * nothing on another company's screen; the contractor's own screens say
 * what is open. */
export function CheckedMark({ v, compact, title }: { v: HoleVerdict | null | undefined; compact?: boolean; title?: string }) {
  if (!v || !v.ok) return null
  return (
    <span title={title ?? `All ${v.shifts} shifts on this hole passed the XPLORIX drill log checks as they were logged`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: compact ? '1px 7px' : '3px 9px', borderRadius: 999, fontSize: compact ? 11 : 12, fontWeight: 700,
        color: T.green, background: tint(T.green, 12), whiteSpace: 'nowrap' }}>
      <ShieldCheck size={compact ? 12 : 13} />{compact ? 'Checked' : 'Checked by XPLORIX'}
    </span>
  )
}

/* One shift, for the company's own lists. */
export function VerdictPill({ v, open = 0 }: { v: ShiftVerdict; open?: number }) {
  const [fg, text] = v === 'stop' ? [T.red, '✕ Cannot be right'] : v === 'open' ? [T.amber, `! ${open || ''} to explain`.replace('  ', ' ')]
    : v === 'explained' ? [T.muted, '✓ Explained'] : v === 'pass' ? [T.green, '✓ Clean'] : [T.faint, '—']
  return <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, color: fg, background: v === 'unchecked' ? 'transparent' : tint(fg, 13), whiteSpace: 'nowrap' }}>{text}</span>
}
