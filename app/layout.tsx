import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-sans/700.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/700.css'
import './globals.css'
import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'XPLORIX Pulse · Copilot',
  description: 'XPLORIX Copilot: an AI agent that reads every rig, every second, and tells the crew what to do and how.',
}
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0B0E13' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>
}
