'use client'

import { T, tint } from '../../components/kit'
import type { CostSource } from '../../../lib/tenders'
import { SOURCE_WORDS } from '../../../lib/tenders'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const day = (d?: string, year = false) => d ? `${Number(d.slice(8, 10))} ${MON[Number(d.slice(5, 7)) - 1]}${year ? ` ${d.slice(0, 4)}` : ''}` : '—'
export const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
export const n0 = (n: number) => Math.round(n).toLocaleString('en-US')
export const perM = (n: number | null | undefined) => n == null ? '—' : `SAR ${Math.round(n).toLocaleString('en-US')}/m`

export function dueWord(due: string, today: string) {
  const d = daysBetween(today, due)
  if (d < 0) return { text: `${-d} ${-d === 1 ? 'day' : 'days'} past due`, tone: 'bad' as const }
  if (d === 0) return { text: 'Due today', tone: 'bad' as const }
  if (d <= 7) return { text: `Due in ${d} ${d === 1 ? 'day' : 'days'}, ${day(due)}`, tone: 'warn' as const }
  return { text: `Due ${day(due)}`, tone: 'neutral' as const }
}

export const SOURCE_COLOR: Record<CostSource, string> = {
  record: T.green, thin: T.amber, near: T.blue, yours: 'var(--x-violet, #8b5cf6)', none: T.red,
}

export function SourceTag({ s }: { s: CostSource }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, padding: '2px 9px', borderRadius: 99, whiteSpace: 'nowrap', background: tint(SOURCE_COLOR[s], 12), color: T.text, border: `1px solid ${tint(SOURCE_COLOR[s], 35)}` }}>
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: 99, background: SOURCE_COLOR[s] }} />{SOURCE_WORDS[s]}
    </span>
  )
}

/* The tender's metres, coloured by where each one's cost comes from. */
export function CoverageBar({ coverage, total, height = 10, legend = false }: { coverage: Record<CostSource, number>; total: number; height?: number; legend?: boolean }) {
  const order: CostSource[] = ['record', 'thin', 'near', 'yours', 'none']
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div role="img" aria-label={order.filter(k => coverage[k] > 0).map(k => `${SOURCE_WORDS[k]} ${Math.round((coverage[k] / Math.max(1, total)) * 100)}%`).join(', ')}
        style={{ display: 'flex', height, borderRadius: 99, overflow: 'hidden', background: 'rgba(var(--x-ov),0.06)' }}>
        {order.map(k => coverage[k] > 0 && <div key={k} style={{ width: `${(coverage[k] / Math.max(1, total)) * 100}%`, background: SOURCE_COLOR[k] }} />)}
      </div>
      {legend && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: 12.5, color: T.muted }}>
          {order.filter(k => coverage[k] > 0).map(k => (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span aria-hidden style={{ width: 9, height: 9, borderRadius: 2, background: SOURCE_COLOR[k] }} />
              <b style={{ color: T.text }}>{n0(coverage[k])} m</b> {SOURCE_WORDS[k].toLowerCase()}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
