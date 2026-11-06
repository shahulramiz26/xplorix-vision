'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Page, Head, T } from '../../components/kit'

/* ANALYTICS — six dashboards, each named by the question it answers.
 * They recalculate every time a shift is submitted. */

const BOARDS = [
  { href: '/admin/analytics/operation', title: 'Operations', ask: 'Are the rigs drilling as fast as they should?', has: 'Metres an hour, metres and core, stops by reason, speed by ground and size' },
  { href: '/admin/analytics/performance', title: 'Hole by hole', ask: 'What happened in this hole, shift by shift?', has: 'Depth progress, every run, bit changes' },
  { href: '/admin/analytics/maintenance', title: 'Maintenance', ask: 'What keeps breaking, and what does it cost?', has: 'Repairs by type and component, time between breakdowns, oil use' },
  { href: '/admin/analytics/driller-crew', title: 'Drillers and crew', ask: 'Who is drilling well, and who needs help?', has: 'Metres and speed by driller, crew hours, time on bottom' },
  { href: '/admin/analytics/consumables', title: 'Consumables', ask: 'Where are fuel, water and additives going?', has: 'Fuel, water and additives per metre, parts used, where the money goes, stock on rigs' },
  { href: '/admin/analytics/hsc', title: 'Health and safety', ask: 'Is everyone working safely?', has: 'Incidents and near misses by type, severity and week' },
]

export default function AnalyticsPage() {
  return (
    <Page>
      <Head title="Analytics" sub="Six dashboards, worked out from your own shift and maintenance logs. Each opens on the question it answers; ask XPLORIX about anything on them." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
        {BOARDS.map(b => (
          <Link key={b.href} href={b.href} className="xpl-row" style={{
            display: 'flex', gap: 14, alignItems: 'center', padding: '18px 18px', borderRadius: 10, textDecoration: 'none',
            background: T.card, border: `1px solid ${T.border}`,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, color: T.faint }}>{b.title}</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: T.text, margin: '5px 0 7px', lineHeight: 1.35 }}>{b.ask}</div>
              <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.5 }}>{b.has}</div>
            </div>
            <ChevronRight size={18} style={{ color: T.faint, flexShrink: 0 }} />
          </Link>
        ))}
      </div>
    </Page>
  )
}
