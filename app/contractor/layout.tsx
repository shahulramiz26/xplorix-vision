'use client'

import { LayoutDashboard, Activity, Wrench, ClipboardList, FileText, ScrollText } from 'lucide-react'
import { CostingProvider } from '../../lib/costing-store'
import { PortalShell } from '../components/portal-shell'
import { ThemeScope } from '../components/theme'
import { useMe, CLIENT_NAME } from './me'

/* ==========================================================================
 * CONTRACTOR LOGIN — a contractor's side of the work he does for a client
 *
 * A company on XPLORIX that hires a contractor gives him this login. In it he
 * writes his own drill log and maintenance log, sees every log he has sent
 * and what the client said about it, and has a small view of how his rigs
 * are doing. His bills and the terms of his work order are here too.
 *
 * It mounts the same store the client's Company Admin uses, so a shift sent
 * here is waiting on the client's Contractors screen at once, and the
 * client's answer shows here without a refresh.
 * ========================================================================== */

function Shell({ children }: { children: React.ReactNode }) {
  const { side } = useMe()
  return (
    <PortalShell role="contractor" label="Contractor Login" home="/contractor" group={`Work for ${CLIENT_NAME}`} nav={[
      { href: '/contractor', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/contractor/drill-log', label: 'Drill log', icon: Activity },
      { href: '/contractor/maintenance-log', label: 'Maintenance log', icon: Wrench },
      { href: '/contractor/logs', label: 'Submitted logs', icon: ClipboardList, badge: side.returned.length },
      { href: '/contractor/bills', label: 'Bills', icon: FileText, badge: side.bills.filter(b => b.status === 'returned').length },
      { href: '/contractor/work-order', label: 'Work order', icon: ScrollText },
    ]}>{children}</PortalShell>
  )
}

export default function ContractorLayout({ children }: { children: React.ReactNode }) {
  return (
    <CostingProvider>
      <ThemeScope />
      <Shell>{children}</Shell>
    </CostingProvider>
  )
}
