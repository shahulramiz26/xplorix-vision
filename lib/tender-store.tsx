'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { SEED_TENDERS, type Tender } from './tenders'
import { IS_DEMO } from './company'

/* The tenders, kept in this browser like the rest of the demo. A real
 * company starts with none. */
const KEY = 'xplorix_tenders_v2_sar'

interface Ctx {
  tenders: Tender[]
  loaded: boolean
  save: (t: Tender) => void
  remove: (id: string) => void
}
const TenderCtx = createContext<Ctx | null>(null)

export function TenderProvider({ children }: { children: ReactNode }) {
  const [tenders, setTenders] = useState<Tender[]>(IS_DEMO ? SEED_TENDERS : [])
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) { const s = JSON.parse(raw); if (Array.isArray(s)) setTenders(s) }
    } catch {}
    setLoaded(true)
  }, [])
  useEffect(() => { if (loaded) try { localStorage.setItem(KEY, JSON.stringify(tenders)) } catch {} }, [tenders, loaded])
  const value: Ctx = {
    tenders, loaded,
    save: t => setTenders(list => list.some(x => x.id === t.id) ? list.map(x => x.id === t.id ? t : x) : [t, ...list]),
    remove: id => setTenders(list => list.filter(x => x.id !== id)),
  }
  return <TenderCtx.Provider value={value}>{children}</TenderCtx.Provider>
}

export function useTenders() {
  const c = useContext(TenderCtx)
  if (!c) throw new Error('useTenders must be used inside TenderProvider')
  return c
}
