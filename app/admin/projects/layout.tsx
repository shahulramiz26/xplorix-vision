'use client'

import { CostingProvider } from '../../../lib/costing-store'

/* Holes added on the Projects screen are saved as hole plans in the costing
 * store, so the same hole — and its planned depth — is what Finance and the
 * Client Portal read. That store needs its provider above this route. */
export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return <CostingProvider>{children}</CostingProvider>
}
