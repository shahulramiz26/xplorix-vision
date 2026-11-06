'use client'

import type { Group } from '../../lib/core/drill-link'
import { T, tint, Card } from './kit'

/* A bar either side of zero: how far a group's core recovery sits from the
 * average for the same ground. */
function Diverge({ v, max = 10 }: { v: number; max?: number }) {
  const w = 120, half = w / 2
  const len = (Math.min(max, Math.abs(v)) / max) * half
  const c = v < -1 ? T.red : v > 1 ? T.green : T.faint
  return (
    <svg width={w} height={12} aria-hidden style={{ flexShrink: 0 }}>
      <rect x={0} y={5} width={w} height={2} fill={tint(T.faint, 25)} />
      <rect x={v < 0 ? half - len : half} y={2} width={len} height={8} rx={2} fill={c} />
      <line x1={half} x2={half} y1={0} y2={12} stroke={T.muted} strokeWidth={1} />
    </svg>
  )
}

export function CoreFactors({ factors, note }: { factors: { title: string; question: string; groups: Group[] }[]; note?: string }) {
  if (!factors.length) return null
  return (
    <Card title="What lines up with lost and broken core" subtitle={note ?? 'Each shift is compared with shifts in the same ground. Left of the line: worse than the ground average. A pattern to check, not proof of a cause.'}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 20 }}>
        {factors.map(f => (
          <div key={f.title} style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{f.title}</div>
            <div style={{ fontSize: 12, color: T.faint, margin: '2px 0 10px' }}>{f.question}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {f.groups.map(g => (
                <div key={g.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 120px 92px', alignItems: 'center', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: T.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.label}</div>
                    <div style={{ fontSize: 11.5, color: T.faint }}>{g.shifts} shifts · {Math.round(g.metres)} m{g.shifts < 5 ? ' · too few to judge' : ''}</div>
                  </div>
                  <Diverge v={g.vsRec} />
                  <div style={{ fontSize: 12, color: T.muted, textAlign: 'right' }}>
                    <b style={{ color: T.text }}>{g.vsRec >= 0 ? '+' : '−'}{Math.abs(g.vsRec).toFixed(1)}</b> pts rec.<br />
                    <span style={{ color: T.faint }}>{g.vsRqd >= 0 ? '+' : '−'}{Math.abs(g.vsRqd).toFixed(1)} pts RQD</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
