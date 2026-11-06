'use client'

import { useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useCosting, setAdminName } from '../../lib/costing-store'
import { useSession, loadSession, useSyncStatus, HOME } from '../../lib/backend'
import type { Role } from '../../lib/sync-spec'
import { T } from './kit'

/* ==========================================================================
 * WHO MAY BE ON THIS SCREEN
 *
 * In the browser demo: anyone, as before. With a database connected: only
 * someone signed in to this kind of login. The Company Admin may also open
 * the other three, to see what they see. Nothing is drawn until the data on
 * screen is the real data for that login.
 *
 * This keeps the wrong person off a screen. What keeps the data from them is
 * the server, which never sends it.
 * ========================================================================== */

function Waiting({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.bg, color: T.muted, fontSize: 14, padding: 24, textAlign: 'center' }}>
      <div>{children}</div>
    </div>
  )
}

export function Guard({ role, children }: { role: Role; children: ReactNode }) {
  const s = useSession()
  const { ready } = useCosting()
  const router = useRouter()
  const allowed = s.status === 'in' && (s.user.role === role || s.user.role === 'admin')
  const unseeded = s.status === 'in' && s.user.role === 'admin' && !s.user.company.seeded

  useEffect(() => {
    if (s.status === 'out') router.replace('/auth/login')
    else if (s.status === 'setup' || unseeded) router.replace('/setup')
    else if (s.status === 'in' && !allowed) router.replace(HOME[s.user.role])
  }, [s, allowed, unseeded, router])

  if (s.status === 'demo') return <>{children}</>
  if (s.status === 'in' && s.user.role === 'admin') setAdminName(s.user.name)
  if (s.status === 'error') {
    return (
      <Waiting>
        <div style={{ color: T.text, fontWeight: 600, marginBottom: 8 }}>{s.message}</div>
        <button onClick={() => void loadSession(true)} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, color: T.text, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>Try again</button>
      </Waiting>
    )
  }
  if (allowed && !unseeded && ready) return <>{children}</>
  return <Waiting>Loading…</Waiting>
}

/* A small line that says whether what you entered has reached the server.
 * Silent in the demo and when everything is saved. */
export function SavedState() {
  const st = useSyncStatus()
  if (!st.live || (st.pending === 0 && !st.offline)) return null
  const waiting = st.offline
  return (
    <span role="status" title={waiting ? 'Kept on this device. It will be sent when the connection is back.' : 'Sending to the server'} style={{
      fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 6, whiteSpace: 'nowrap',
      background: `color-mix(in srgb, ${waiting ? 'var(--x-amber)' : 'var(--x-blue)'} 12%, transparent)`,
      border: `1px solid color-mix(in srgb, ${waiting ? 'var(--x-amber)' : 'var(--x-blue)'} 35%, transparent)`, color: T.text,
    }}>{waiting ? `No connection · ${st.pending} not sent yet` : `Saving ${st.pending}…`}</span>
  )
}
