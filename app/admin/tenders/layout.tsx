'use client'

import { TenderProvider } from '../../../lib/tender-store'

export default function TendersLayout({ children }: { children: React.ReactNode }) {
  return <TenderProvider>{children}</TenderProvider>
}
