'use client'

import { Bell, FolderOpen, Activity, Target, FileText } from 'lucide-react'
import { CostingProvider, COMPANY_NAME } from '../../lib/costing-store'
import { useClient } from '../../lib/client-view'
import { PortalShell } from '../components/portal-shell'
import { ThemeScope } from '../components/theme'

/* ==========================================================================
 * CLIENT LOGIN — the client's side of the work being drilled for him
 *
 * The company doing the drilling gives its client this login, from Users. It
 * answers the client's questions in the order he asks them: what is happening
 * today, how are my projects, what are the rigs doing, where is each hole,
 * and what am I being asked to pay.
 *
 * It mounts the contractor's own record, so a hole sent for approval or an
 * invoice raised in Finance is here at once, and the client's answer shows in
 * Finance without a refresh. Costs, margin, stock and what a sub-contractor
 * is paid are never part of what a client sees.
 * ========================================================================== */

function Shell({ children }: { children: React.ReactNode }) {
  const c = useClient()
  return (
    <PortalShell role="client" label="Client Login" home="/client" group={`Drilled by ${COMPANY_NAME}`} nav={[
      { href: '/client', label: 'Today', icon: Bell, badge: c.holesWaiting.length + c.toVerify.length + c.inbox.waiting.length },
      { href: '/client/projects', label: 'Projects', icon: FolderOpen, badge: c.inbox.count },
      { href: '/client/operations', label: 'Operations', icon: Activity },
      { href: '/client/holes', label: 'Holes', icon: Target, badge: c.holesWaiting.length },
      { href: '/client/invoices', label: 'Invoices', icon: FileText, badge: c.toVerify.length },
    ]}>{children}</PortalShell>
  )
}

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <CostingProvider>
      <ThemeScope />
      <Shell>{children}</Shell>
    </CostingProvider>
  )
}
