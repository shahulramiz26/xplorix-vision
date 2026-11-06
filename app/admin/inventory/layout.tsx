'use client'

import { InventoryProvider } from '../../../lib/inventory-store'
import { CostingProvider } from '../../../lib/costing-store'

/* Inventory reads the driller's log to work out how fast each rig is burning
 * through ground, which is what turns "you have 3 bits" into "you run out on
 * Thursday". That log lives in the costing store, so both providers mount. */
export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  return (
    <InventoryProvider>
      <CostingProvider>{children}</CostingProvider>
    </InventoryProvider>
  )
}
