'use client'

import { useEffect, useRef, useSyncExternalStore, type Dispatch, type SetStateAction } from 'react'
import {
  MAY_SEND, applyChange, diffStates, fromRecords,
  type Change, type Role, type StoreName,
} from './sync-spec'
import { applyCompany } from './company'

/* ==========================================================================
 * THE BROWSER'S SIDE OF THE SERVER
 *
 * Two modes, decided by one question the app asks when it opens:
 *
 *   demo     no database behind the app. Everything stays in this browser,
 *            exactly as the MVP always worked.
 *   server   a database is connected. You sign in, the stores are filled
 *            from the server with what your login may see, every change you
 *            make is sent, and other people's changes arrive on their own.
 *
 * A change that cannot be sent (no signal at the rig) is kept in this
 * browser and sent when the connection is back. Nothing is lost by closing
 * the tab.
 * ========================================================================== */

export interface SessionUser {
  role: Role; name: string; username: string; userRef: string | null
  company: { id: string; name: string; code?: string | null; demo: boolean; seeded: boolean }
  owner?: boolean
}
export type Session =
  | { status: 'loading' }
  | { status: 'demo' }
  | { status: 'setup' }
  | { status: 'out' }
  | { status: 'error'; message: string }
  | { status: 'in'; user: SessionUser }

const LOADING: Session = { status: 'loading' }
let session: Session = LOADING
let asked = false
const sessionListeners = new Set<() => void>()
const tell = (set: Set<() => void>) => set.forEach(f => f())

export async function api<T = unknown>(path: string, init?: { method?: string; body?: unknown }): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(path, {
    method: init?.method ?? 'GET', credentials: 'same-origin', cache: 'no-store',
    headers: init?.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  let data: unknown = null
  try { data = await res.json() } catch { /* an empty or non-JSON answer */ }
  return { ok: res.ok, status: res.status, data: data as T }
}

export async function loadSession(force = false): Promise<Session> {
  if (asked && !force) return session
  asked = true
  try {
    const r = await api<{ backend: boolean; setup?: boolean; user?: SessionUser | null; error?: string }>('/api/auth/me')
    if (r.status === 404 || (r.ok && !r.data?.backend)) session = { status: 'demo' }
    else if (!r.ok) session = { status: 'error', message: r.data?.error ?? 'The server could not be reached.' }
    else if (r.data.user) session = { status: 'in', user: r.data.user }
    else session = r.data.setup ? { status: 'setup' } : { status: 'out' }
  } catch {
    // Offline while opening the app. A page that is already open keeps working; a fresh one cannot know who you are.
    session = { status: 'error', message: 'No connection. Check the network and try again.' }
  }
  // Which company, and what day it is there, before any screen reads either.
  applyCompany(session.status === 'in' ? session.user.company : null)
  tell(sessionListeners)
  if (session.status === 'in') engine.start(session.user)
  return session
}

export function useSession(): Session {
  const s = useSyncExternalStore(
    fn => { sessionListeners.add(fn); return () => { sessionListeners.delete(fn) } },
    () => session, () => LOADING)
  useEffect(() => { void loadSession() }, [])
  return s
}
export async function signIn(username: string, password: string): Promise<{ ok: true; role: Role } | { ok: false; error: string }> {
  try {
    const r = await api<{ role?: Role; error?: string }>('/api/auth/login', { method: 'POST', body: { username, password } })
    if (!r.ok || !r.data?.role) return { ok: false, error: r.data?.error ?? 'Could not sign in.' }
    return { ok: true, role: r.data.role }
  } catch { return { ok: false, error: 'No connection. Check the network and try again.' } }
}

export async function signOut() {
  try { await api('/api/auth/logout', { method: 'POST' }) } catch { /* signing out of this browser is what matters */ }
  engine.stop()
  window.location.href = '/auth/login'
}

export const HOME: Record<Role, string> = {
  admin: '/admin/dashboard', supervisor: '/supervisor/today', contractor: '/contractor', client: '/client',
}

// ── keeping the stores and the server in step ─────────────────────────────

type AnyState = Record<string, unknown>
interface Registered {
  empty: () => AnyState
  get: () => AnyState
  set: Dispatch<SetStateAction<AnyState>>
  base: AnyState                // the state as last agreed with the server, plus what is waiting to be sent
  ready: boolean
}
export interface SyncStatus { live: boolean; pending: number; offline: boolean; rejected: number }

const POLL_MS = Math.max(5, Number(process.env.NEXT_PUBLIC_SYNC_SECONDS) || 20) * 1000

class Engine {
  user: SessionUser | null = null
  rev = 0
  stores: Partial<Record<StoreName, Registered>> = {}
  outbox: Change[] = []
  busy = false
  offline = false
  rejected = 0
  timer: ReturnType<typeof setInterval> | null = null
  retry: ReturnType<typeof setTimeout> | null = null
  listeners = new Set<() => void>()
  snapshotStatus: SyncStatus = { live: false, pending: 0, offline: false, rejected: 0 }

  key() { return `xplorix_outbox_${this.user?.company.id}_${this.user?.username}` }

  start(user: SessionUser) {
    if (this.user) return
    this.user = user
    try { this.outbox = JSON.parse(localStorage.getItem(this.key()) ?? '[]') } catch { this.outbox = [] }
    this.timer = setInterval(() => { if (document.visibilityState === 'visible') void this.cycle() }, POLL_MS)
    window.addEventListener('online', this.wake)
    window.addEventListener('focus', this.wake)
    document.addEventListener('visibilitychange', this.wake)
    this.publish()
    void this.cycle()
  }
  stop() {
    if (this.timer) clearInterval(this.timer)
    if (this.retry) clearTimeout(this.retry)
    window.removeEventListener('online', this.wake)
    window.removeEventListener('focus', this.wake)
    document.removeEventListener('visibilitychange', this.wake)
    this.user = null; this.timer = null
  }
  wake = () => { if (document.visibilityState === 'visible') void this.cycle() }

  publish() {
    const next: SyncStatus = { live: !!this.user, pending: this.outbox.length, offline: this.offline, rejected: this.rejected }
    const a = this.snapshotStatus
    if (a.live !== next.live || a.pending !== next.pending || a.offline !== next.offline || a.rejected !== next.rejected) {
      this.snapshotStatus = next
      tell(this.listeners)
    }
  }
  save() { try { localStorage.setItem(this.key(), JSON.stringify(this.outbox)) } catch { /* storage full or private mode: kept for this visit */ } }

  /* A store joins. If the engine already holds a newer picture than this
   * store has, the whole picture is asked for again. */
  register(store: StoreName, r: Omit<Registered, 'base' | 'ready'>) {
    this.stores[store] = { ...r, base: r.empty(), ready: false }
    this.rev = 0
    if (this.user) void this.cycle()
    return () => { delete this.stores[store] }
  }
  isReady(store: StoreName) { return !!this.stores[store]?.ready }

  /* The store's state changed on this side: queue what is different. */
  changed(store: StoreName, state: AnyState) {
    const r = this.stores[store]
    if (!r || !r.ready || !this.user) return
    const changes = diffStates(store, r.base, state, MAY_SEND[this.user.role][store] ?? [])
    r.base = state
    if (changes.length === 0) return
    // A later change to the same record replaces an earlier one still waiting.
    const keyOf = (c: Change) => `${c.store}|${c.coll}|${c.id}`
    const fresh = new Set(changes.map(keyOf))
    this.outbox = [...this.outbox.filter(c => !fresh.has(keyOf(c))), ...changes]
    this.save(); this.publish()
    void this.cycle()
  }

  /* Send what is waiting, then take what is new. One at a time. */
  async cycle() {
    if (this.busy || !this.user) return
    this.busy = true
    try {
      do {
        const sending = this.outbox.slice(0, 400)
        const r = await api<{ rev: number; unchanged?: true; snapshot?: Change[]; changes?: Change[]; rejected?: unknown[] }>(
          sending.length ? '/api/sync' : `/api/sync?since=${this.rev}`,
          sending.length ? { method: 'POST', body: { changes: sending, since: this.rev } } : undefined)
        if (r.status === 401) { session = { status: 'out' }; tell(sessionListeners); this.stop(); window.location.href = '/auth/login'; return }
        if (!r.ok) {
          // The server refused the batch outright (a malformed change). Dropping it is the only way forward.
          if (r.status >= 400 && r.status < 500 && sending.length) { this.outbox = this.outbox.slice(sending.length); this.rejected += sending.length; this.save() }
          else throw new Error(`sync ${r.status}`)
        } else {
          if (sending.length) {
            const sent = new Set(sending)
            this.outbox = this.outbox.filter(c => !sent.has(c))
            this.rejected += r.data.rejected?.length ?? 0
            this.save()
          }
          this.take(r.data)
        }
        this.offline = false
      } while (this.outbox.length > 0)
    } catch {
      this.offline = true
      if (this.retry) clearTimeout(this.retry)
      this.retry = setTimeout(() => void this.cycle(), 8000)
    } finally {
      this.busy = false
      this.publish()
    }
  }

  /* Lay the server's answer over each store, keeping whatever is still waiting to be sent. */
  take(d: { rev: number; unchanged?: true; snapshot?: Change[]; changes?: Change[] }) {
    if (d.unchanged) {
      // Nothing new, but a store that has just joined an empty company still becomes ready.
      (Object.keys(this.stores) as StoreName[]).forEach(name => { const r = this.stores[name]!; if (!r.ready) { r.ready = true; r.set(() => r.base) } })
      tell(this.listeners)
      return
    }
    this.rev = d.rev
    ;(Object.keys(this.stores) as StoreName[]).forEach(name => {
      const r = this.stores[name]!
      const waiting = this.outbox.filter(c => c.store === name)
      let next: AnyState
      if (d.snapshot) next = fromRecords(name, r.empty(), d.snapshot)
      else {
        const skip = new Set(waiting.map(c => `${c.coll}|${c.id}`))
        next = (d.changes ?? []).filter(c => c.store === name && !skip.has(`${c.coll}|${c.id}`)).reduce((s, c) => applyChange(s, c), r.ready ? r.get() : r.empty())
      }
      if (d.snapshot) waiting.forEach(c => { next = applyChange(next, c) })
      r.base = next
      r.ready = true
      r.set(() => next)
    })
    tell(this.listeners)
  }
}

export const engine = new Engine()

/* A store calls this once. In demo mode it does nothing and the store keeps
 * itself in the browser as before. In server mode the store is emptied,
 * filled from the server, and from then on kept in step.
 *
 * `mode` is 'loading' until the app knows which it is. */
export function useServerSync<S extends object>(
  store: StoreName, state: S, setState: Dispatch<SetStateAction<S>>, empty: () => S,
): { mode: 'loading' | 'demo' | 'server'; ready: boolean } {
  const s = useSession()
  const latest = useRef(state)
  latest.current = state
  const live = s.status === 'in'
  const ready = useSyncExternalStore(
    fn => { engine.listeners.add(fn); return () => { engine.listeners.delete(fn) } },
    () => engine.isReady(store), () => false)

  useEffect(() => {
    if (!live) return
    setState(() => empty())
    return engine.register(store, {
      empty: empty as () => AnyState,
      get: () => latest.current as AnyState,
      set: setState as unknown as Dispatch<SetStateAction<AnyState>>,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, store])

  useEffect(() => { if (live) engine.changed(store, state as AnyState) }, [live, store, state])

  return { mode: s.status === 'loading' ? 'loading' : s.status === 'demo' ? 'demo' : 'server', ready: live && ready }
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    fn => { engine.listeners.add(fn); return () => { engine.listeners.delete(fn) } },
    () => engine.snapshotStatus, () => engine.snapshotStatus)
}

/* Send records straight to the server, in batches. Used once, to load the demo data. */
export async function upload(changes: Change[], onProgress?: (done: number, total: number) => void) {
  for (let i = 0; i < changes.length; i += 300) {
    const r = await api('/api/sync', { method: 'POST', body: { changes: changes.slice(i, i + 300), since: Number.MAX_SAFE_INTEGER } })
    if (!r.ok) throw new Error(`upload failed (${r.status})`)
    onProgress?.(Math.min(i + 300, changes.length), changes.length)
  }
}

/* Wait until everything queued has reached the server (or give up after a while). */
export async function settled(ms = 12000) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (!engine.busy && engine.outbox.length === 0) return true
    await new Promise(r => setTimeout(r, 150))
  }
  return false
}

/* A password for a login in Users: made on the server, shown once. The login
 * itself has to have reached the server first, so this waits for that. */
export async function issuePassword(userRef: string): Promise<{ ok: true; username: string; password: string } | { ok: false; error: string }> {
  for (let i = 0; i < 6; i++) {
    await settled()
    try {
      const r = await api<{ username?: string; password?: string; error?: string }>('/api/accounts', { method: 'POST', body: { userRef } })
      if (r.ok && r.data.username && r.data.password) return { ok: true, username: r.data.username, password: r.data.password }
      if (r.status !== 404) return { ok: false, error: r.data?.error ?? 'The password could not be made.' }
    } catch { return { ok: false, error: 'No connection. The login is saved; reset its password when you are back online.' } }
    await new Promise(r => setTimeout(r, 700))
  }
  return { ok: false, error: 'The login was not saved in time. Use Reset password in a moment.' }
}
export async function revokeLogin(userRef: string) {
  try { await api(`/api/accounts?userRef=${encodeURIComponent(userRef)}`, { method: 'DELETE' }) } catch { /* the login is already removed from Users, so it cannot sign in */ }
}
