'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/* The engineering estimate was a sample screen. Bids are priced under
 * Tenders now, from the company's own record, so an old link lands there. */
export default function BidsMoved() {
  const router = useRouter()
  useEffect(() => { router.replace('/admin/tenders') }, [router])
  return null
}
