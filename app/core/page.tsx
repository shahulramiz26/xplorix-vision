import type { Metadata } from 'next'
import CoreLanding from '../components/landing/core-landing'

export const metadata: Metadata = {
  title: 'XPLORIX Core | The core, logged from its photos (coming soon)',
  description: 'XPLORIX Core, in development: tray photos read row by row, breaks marked natural or handling, recovery and RQD suggested for the geologist to sign off, and every hole in 3D.',
}

export default function CorePage() {
  return <CoreLanding />
}
