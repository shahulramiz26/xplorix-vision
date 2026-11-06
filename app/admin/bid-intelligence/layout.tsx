'use client'

import { InventoryProvider } from '../../../lib/inventory-store'
import { CostingProvider } from '../../../lib/costing-store'
import { BidProvider } from '../../../lib/bid-store'

/* Bid Intelligence is the costing engine run forwards, so it reads from both
 * of the modules it will eventually feed.
 *
 *   InventoryProvider   the parts catalogue, for consumable life and rates,
 *                       and what is on the shelf right now, for the shortfall
 *   CostingProvider     rig ownership, so a bid values a rig day exactly the
 *                       way a live project does
 *   BidProvider         the bids themselves
 *
 * Order matters: costing imports from inventory, so inventory sits above it.
 *
 * If InventoryProvider or CostingProvider is already mounted higher up — in
 * app/admin/layout.tsx or a shared providers file — remove it from here rather
 * than nesting a second copy. A second provider gives this route its own
 * private copy of the state, which then drifts from the rest of the app and
 * quietly prices bids against a catalogue nobody else can see.
 */
export default function BidIntelligenceLayout({ children }: { children: React.ReactNode }) {
  return (
    <InventoryProvider>
      <CostingProvider>
        <BidProvider>{children}</BidProvider>
      </CostingProvider>
    </InventoryProvider>
  )
}
