'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/* Today was the first home of the one list. The list is now the Dashboard,
 * so an old link lands there. */
export default function TodayMoved() {
  const router = useRouter()
  useEffect(() => { router.replace('/admin/dashboard') }, [router])
  return null
}
