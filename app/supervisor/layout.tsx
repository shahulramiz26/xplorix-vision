'use client'

import { Activity, Wrench, ListChecks } from 'lucide-react'
import { CostingProvider } from '../../lib/costing-store'
import { PortalShell } from '../components/portal-shell'
import { ThemeScope } from '../components/theme'

/* ==========================================================================
 * SUPERVISOR LOGIN — his day, the drill log and the maintenance log
 *
 * A supervisor's job in XPLORIX is to write the shift down, once, and right.
 * So this login opens on Today (his rigs, the shifts not logged yet, and the
 * logs the checks want him to put right), then the two logs: each opens on
 * the logs he has already sent, with a button to write the next one. He logs against the
 * projects he is assigned to, and can correct his own logs.
 *
 * It reads the same store as the office, so a log saved here is on the
 * admin's Logs screen, in Finance and on the Dashboard at once.
 * ========================================================================== */

const NAV = [
  { href: '/supervisor/today', label: 'Today', icon: ListChecks },
  { href: '/supervisor/drilling-log', label: 'Drill log', icon: Activity },
  { href: '/supervisor/maintenance-log', label: 'Maintenance log', icon: Wrench },
]

export default function SupervisorLayout({ children }: { children: React.ReactNode }) {
  return (
    <CostingProvider>
      <ThemeScope />
      <PortalShell role="supervisor" label="Supervisor" home="/supervisor/today" nav={NAV}>{children}</PortalShell>
    </CostingProvider>
  )
}
