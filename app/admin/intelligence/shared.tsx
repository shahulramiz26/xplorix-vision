'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { GitCompare, Flag, CalendarRange, ShieldAlert, ListChecks, ClipboardCheck, Banknote, Calculator } from 'lucide-react'
import { useCosting, C } from '../../../lib/costing-store'
import { useInventory } from '../../../lib/inventory-store'
import { buildForecast } from '../../../lib/forecast'
import { T, tint } from '../../components/kit'

/* ==========================================================================
 * XPLORIX INTELLIGENCE — pieces the four analysis screens share
 *
 * All four read one forecast, built once from the same stores Finance, the
 * Dashboard and Inventory read. Nothing on these screens is typed in.
 * ========================================================================== */

export function useIntel() {
  const { state } = useCosting()
  const { state: inv } = useInventory()
  const f = useMemo(() => buildForecast(state, inv), [state, inv])
  return { state, inv, f }
}

const SCREENS = [
  { href: '/admin/intelligence', label: 'Today', icon: ListChecks },
  { href: '/admin/intelligence/drill-logs', label: 'Drill log check', icon: ClipboardCheck },
  { href: '/admin/intelligence/money', label: 'Money checks', icon: Banknote },
  { href: '/admin/intelligence/pricing', label: 'Price a tender', icon: Calculator },
  { href: '/admin/intelligence/contractors', label: 'Contractor comparison', icon: GitCompare },
  { href: '/admin/intelligence/holes', label: 'Hole finish prediction', icon: Flag },
  { href: '/admin/intelligence/months', label: 'This month and next', icon: CalendarRange },
  { href: '/admin/intelligence/risks', label: 'Risk analysis', icon: ShieldAlert },
]

/* The Intelligence screens used to carry their own row of links to each
 * other. They now sit inside their departments, and the department's tabs
 * come from the admin shell (app/components/dept-tabs.tsx). Kept so the
 * screens that render it need no change. */
export function IntelTabs() {
  return null
}

/* One colour for each party, the same on every chart: own rigs first. */
const PARTY_COLOURS = [C.blue, C.orangeD, C.teal, C.purple, C.green]
export function partyColour(index: number) { return PARTY_COLOURS[index % PARTY_COLOURS.length] }

export function Dot({ colour }: { colour: string }) {
  return <span aria-hidden style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 3, background: colour, marginRight: 7, flexShrink: 0 }} />
}

export const n0 = (v: number) => Math.round(v).toLocaleString('en-US')
export const n1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString('en-US')
