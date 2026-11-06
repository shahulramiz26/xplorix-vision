import type { Metadata } from 'next'
import Landing from './components/landing/landing'

export const metadata: Metadata = {
  title: 'XPLORIX | Every metre drilled. Every metre understood.',
  description: 'One record of the drilling for exploration drilling contractors and the mine owners they drill for: shift logs, checked invoices, and what is coming next month.',
}

export default function Home() {
  return <Landing />
}
