import { AnalyticsProvider } from './shared'

export const metadata = {
  title: 'Analytics - XPLORIX',
}

/* No background of its own: the analytics screens sit on the same surface as
 * every other admin screen. The provider keeps the filters while you move
 * between the six dashboards. */
export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  return <AnalyticsProvider>{children}</AnalyticsProvider>
}
