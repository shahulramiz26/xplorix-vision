'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { IS_DEMO } from '../../lib/company'
import { T, tint } from './kit'

/* ==========================================================================
 * DEPARTMENT TABS — the screens that belong together
 *
 * The menu lists one entry per job. Where a job has more than one screen
 * (drill logs and the check on them; Finance and its money checks), the
 * screens are tabs across the top of the job, so XPLORIX Intelligence sits
 * with the work it is about instead of in a separate part of the menu.
 * Shown on the tab screens themselves, not on deeper pages under them.
 * ========================================================================== */

export interface Tab { href: string; label: string; sample?: true }
export const DEPT_TABS: Tab[][] = [
  [{ href: '/admin/projects', label: 'Projects' }, { href: '/admin/intelligence/holes', label: 'When each hole finishes' }],
  [{ href: '/admin/logs/drill', label: 'Drill logs' }, { href: '/admin/intelligence/drill-logs', label: 'Drill log check' }],
  [{ href: '/admin/contractors', label: 'Contractors' }, { href: '/admin/intelligence/contractors', label: 'Contractor comparison' }],
  [{ href: '/admin/finance', label: 'Overview' }, { href: '/admin/finance/rigs', label: 'Rig by rig' }, { href: '/admin/intelligence/money', label: 'Money checks' }],
  [{ href: '/admin/tenders', label: 'Tenders' }, { href: '/admin/intelligence/pricing', label: 'Rate book' }],
  [{ href: '/admin/intelligence/months', label: 'This month and next' }, { href: '/admin/intelligence/risks', label: 'Risks' }],
]

export function DeptTabs() {
  const path = usePathname()
  const group = DEPT_TABS.find(g => g.some(t => t.href === path))
  if (!group) return null
  const tabs = group.filter(t => IS_DEMO || !t.sample)
  if (tabs.length < 2) return null
  return (
    <nav aria-label="Screens in this section" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: `1px solid ${T.border}`, marginBottom: 20 }}>
      {tabs.map(t => {
        const on = t.href === path
        return (
          <Link key={t.href} href={t.href} aria-current={on ? 'page' : undefined} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 42, padding: '0 14px', marginBottom: -1,
            borderBottom: `3px solid ${on ? T.orange : 'transparent'}`, color: on ? T.text : T.muted,
            fontSize: 13.5, fontWeight: on ? 700 : 500, textDecoration: 'none',
          }}>
            {t.label}
            {t.sample && <span style={{ fontSize: 10.5, fontWeight: 700, color: T.muted, background: tint(T.amber, 16), borderRadius: 5, padding: '1px 5px' }}>SAMPLE</span>}
          </Link>
        )
      })}
    </nav>
  )
}
