import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
// Field Slate type for the app screens, served with the app (no font host needed).
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-sans/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/600.css'
import { InventoryProvider } from '@/lib/inventory-store'

const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'XPLORIX | Drilling Intelligence Platform',
  description: 'XPLORIX - Drilling intelligence platform for exploration drilling: one record of the drilling for contractors and mine owners',
}

const NO_FLASH = `try{if(/^\\/(admin|client|supervisor)(\\/|$)/.test(location.pathname)&&localStorage.getItem('xplorix_theme')!=='dark')document.documentElement.dataset.theme='light'}catch(e){}`

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        {/* Sets the theme before the first paint on the app screens (light unless
            dark was chosen), so the screen does not flash dark while it loads. */}
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH }} />
      </head>
      <body className={`${inter.className} bg-[#0A0F1C] text-white min-h-screen`}>
        <InventoryProvider>
          <div className="bg-grid-pattern fixed inset-0 pointer-events-none" />
          <div className="relative z-10">
            {children}
          </div>
        </InventoryProvider>
      </body>
    </html>
  )
}
