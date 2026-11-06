'use client'

import Link from 'next/link'
import { Sparkles, ChevronRight } from 'lucide-react'
import type { Insight } from '../../lib/analytics'
import { T, Card, toneColor } from './kit'

/* The insights for a dashboard, shown on the page rather than behind a
 * button: each one says what was found, the figures behind it, and what to do. */
export function InsightsCard({ insights, empty, subtitle = 'Worked out from your own logs for the filters above. They change as each shift comes in.' }: { insights: Insight[]; empty?: string; subtitle?: string }) {
  return (
    <Card title="XPLORIX insights" subtitle={subtitle}
      right={<Sparkles size={16} style={{ color: T.orange }} />} pad={false}>
      {insights.length === 0
        ? <div style={{ padding: '16px 18px', fontSize: 13, color: T.faint }}>{empty ?? 'Nothing stands out for these filters.'}</div>
        : insights.map((i, n) => {
          const body = (
            <div style={{ display: 'flex', gap: 12, padding: '13px 18px', borderTop: n ? `1px solid ${T.line}` : 'none', alignItems: 'flex-start' }}>
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: toneColor[i.tone], flexShrink: 0, marginTop: 6 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text, lineHeight: 1.4 }}>{i.title}</div>
                <div style={{ fontSize: 12.5, color: T.muted, marginTop: 3, lineHeight: 1.5 }}>{i.detail}</div>
                {i.action && <div style={{ fontSize: 12.5, color: T.text, marginTop: 5, lineHeight: 1.5 }}><span style={{ color: T.faint }}>What to do: </span>{i.action}</div>}
              </div>
              {i.href && <ChevronRight size={16} style={{ color: T.faint, flexShrink: 0, marginTop: 3 }} />}
            </div>
          )
          return i.href
            ? <Link key={i.id} href={i.href} className="xpl-row" style={{ display: 'block', textDecoration: 'none' }}>{body}</Link>
            : <div key={i.id}>{body}</div>
        })}
    </Card>
  )
}

