'use client'

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCosting, C } from '../../../lib/costing-store'
import { useInventory } from '../../../lib/inventory-store'
import { PERIODS, type Filters, type Period } from '../../../lib/analytics'
import { T, tint, Seg, inputStyle } from '../../components/kit'

/* ==========================================================================
 * ANALYTICS — what the six dashboards share
 *
 * The filters live in the layout, so moving from one dashboard to the next
 * keeps the project, rig and period you picked.
 * ========================================================================== */

const FilterCtx = createContext<{ f: Filters; set: (p: Partial<Filters>) => void } | null>(null)

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const [f, setF] = useState<Filters>({ project: 'all', rig: 'all', period: 'all' })
  const value = useMemo(() => ({ f, set: (p: Partial<Filters>) => setF(x => ({ ...x, ...p, ...(p.project ? { rig: 'all' } : {}) })) }), [f])
  return <FilterCtx.Provider value={value}>{children}</FilterCtx.Provider>
}

export function useAnalytics() {
  const { state } = useCosting()
  const { state: inv } = useInventory()
  const ctx = useContext(FilterCtx)
  const [own, setOwn] = useState<Filters>({ project: 'all', rig: 'all', period: 'all' })
  const f = ctx?.f ?? own
  const set = ctx?.set ?? ((p: Partial<Filters>) => setOwn(x => ({ ...x, ...p })))
  return { state, inv, f, set }
}

const BOARDS = [
  { href: '/admin/analytics/operation', label: 'Operations' },
  { href: '/admin/analytics/performance', label: 'Hole by hole' },
  { href: '/admin/analytics/maintenance', label: 'Maintenance' },
  { href: '/admin/analytics/driller-crew', label: 'Drillers and crew' },
  { href: '/admin/analytics/consumables', label: 'Consumables' },
  { href: '/admin/analytics/hsc', label: 'Health and safety' },
]

export function BoardTabs() {
  const path = usePathname()
  return (
    <nav aria-label="Analytics dashboards" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {BOARDS.map(b => {
        const on = path === b.href
        return (
          <Link key={b.href} href={b.href} aria-current={on ? 'page' : undefined} style={{
            padding: '7px 12px', borderRadius: 9, fontSize: 12.5, fontWeight: 600, textDecoration: 'none',
            color: on ? T.text : T.muted, background: on ? tint(T.orange, 12) : T.card, border: `1px solid ${on ? tint(T.orange, 45) : T.border}`,
          }}>{b.label}</Link>
        )
      })}
    </nav>
  )
}

/* Project, rig and period. The rig list follows the project. */
export function FilterBar({ withPeriod = true }: { withPeriod?: boolean }) {
  const { state, f, set } = useAnalytics()
  const projects = (state.projects ?? []).map(p => p.name)
  const rigs = Array.from(new Set(state.shiftLogs.filter(l => f.project === 'all' || l.project === f.project).map(l => l.rig))).sort()
  const sel = { ...inputStyle, width: 'auto', padding: '6px 10px', fontSize: 12.5, cursor: 'pointer' }
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <select aria-label="Project" value={f.project} onChange={e => set({ project: e.target.value })} style={sel}>
        <option value="all">All projects</option>
        {projects.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
      <select aria-label="Rig" value={f.rig} onChange={e => set({ rig: e.target.value })} style={sel}>
        <option value="all">All rigs</option>
        {rigs.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
      {withPeriod && <Seg<Period> options={PERIODS} value={f.period} onChange={v => set({ period: v })} />}
    </div>
  )
}

export { InsightsCard } from '../../components/insights-card'

/* One colour per rig, the same on every chart of a dashboard. */
const RIG_COLOURS = [C.blue, C.orangeD, C.teal, C.purple, C.green, C.amber]
export const rigColour = (i: number) => RIG_COLOURS[i % RIG_COLOURS.length]

export const n0 = (v: number) => Math.round(v).toLocaleString('en-US')
export const n1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString('en-US')
