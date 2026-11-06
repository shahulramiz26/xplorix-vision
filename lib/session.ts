'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { useCosting, type AppUser, type UserRole } from './costing-store'
import { useSession } from './backend'

/* ==========================================================================
 * WHO IS SIGNED IN
 *
 * The supervisor's, the contractor's and the client's screens each belong to
 * one login, and show only what that login may see. The MVP has no accounts
 * in the browser demo, so there the login is chosen by the link the person
 * arrived on (?as=) or the "signed in as" picker in the header. With a
 * database connected it is simply the user who signed in. The Company Admin
 * can still open any login's screens to see what they see.
 * ========================================================================== */

const key = (role: UserRole) => `xplorix_as_${role}`
const listeners = new Set<() => void>()
function subscribe(fn: () => void) {
  listeners.add(fn)
  const onStorage = (e: StorageEvent) => { if (e.key?.startsWith('xplorix_as_')) fn() }
  window.addEventListener('storage', onStorage)
  return () => { listeners.delete(fn); window.removeEventListener('storage', onStorage) }
}
export function signInAs(role: UserRole, id: string) {
  try { localStorage.setItem(key(role), id) } catch { /* private mode: lasts for this visit */ }
  listeners.forEach(fn => fn())
}

/* The login in use for a role, and the others the demo can switch to. `as`
 * may be a user id, or the id of the contractor or the name of the client the
 * login belongs to, so a link from the Company Admin lands on the right one. */
export function useSignedIn(role: UserRole) {
  const store = useCosting()
  const saved = useSyncExternalStore(subscribe, () => { try { return localStorage.getItem(key(role)) ?? '' } catch { return '' } }, () => '')
  const session = useSession()
  const all = store.state.users.filter(u => u.role === role && u.active)
  // Signed in for real: you are who the server says you are, and nobody else.
  if (session.status === 'in' && session.user.role !== 'admin') {
    const me = all.find(u => u.id === session.user.userRef)
    return { ...store, user: me, all: me ? [me] : [], preview: false }
  }
  const match = (u: AppUser) => u.id === saved || (!!saved && (u.contractorId === saved || u.client === saved || u.name === saved))
  const user: AppUser | undefined = all.find(match) ?? all[0]
  // The demo, or the Company Admin looking at what a login sees.
  return { ...store, user, all, preview: true }
}

/* Mounted once by each shell: reads ?as= and marks a new login as opened the
 * first time its owner arrives. */
export function useArrival(role: UserRole) {
  const { user, saveUser } = useSignedIn(role)
  const session = useSession()
  useEffect(() => {
    const as = new URLSearchParams(window.location.search).get('as')
    if (as) signInAs(role, as)
  }, [role])
  useEffect(() => {
    // Only the login's own owner opening it counts, not the admin looking in.
    if (user && !user.opened && !(session.status === 'in' && session.user.role === 'admin')) saveUser({ ...user, opened: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])
}
