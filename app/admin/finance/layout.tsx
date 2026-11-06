'use client'

import { InventoryProvider } from '../../../lib/inventory-store'

/* The costing screen reads projects and purchase orders through useInventory,
 * so InventoryProvider has to sit above it. It used to be mounted on this
 * route; restoring it here.
 *
 * CostingProvider is mounted inside page.tsx and does not belong here.
 *
 * If your repo already mounts InventoryProvider higher up — in app/layout.tsx,
 * app/admin/layout.tsx or a shared providers file — delete this file instead
 * of adding it. Nesting a second provider would give the finance route its own
 * copy of inventory state, which would then drift from the rest of the app.
 */
export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return <InventoryProvider>{children}</InventoryProvider>
}
