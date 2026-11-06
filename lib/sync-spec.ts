/* ==========================================================================
 * WHAT IS KEPT ON THE SERVER
 *
 * The two stores (costing and inventory) keep their whole state in memory, as
 * they always did. On the server the same state is kept one record at a time,
 * so two people saving at once never overwrite each other's work.
 *
 *   list    an array of things with an id: one record each
 *   map     an object keyed by a name (a hole number): one record per key
 *   value   a single setting: one record
 *
 * Read by the browser and by the server, so it imports nothing.
 * ========================================================================== */

export type StoreName = 'costing' | 'inventory'
export type Shape = 'list' | 'map' | 'value'
export type Role = 'admin' | 'supervisor' | 'contractor' | 'client'

export const SPEC: Record<StoreName, Record<string, Shape>> = {
  costing: {
    shiftLogs: 'list', maintenance: 'list', ownership: 'list', operating: 'list', clientRates: 'list',
    invoices: 'list', projects: 'list', projectEvents: 'list', rateProposals: 'list',
    contractors: 'list', workOrders: 'list', contractorReports: 'list', contractorBills: 'list', users: 'list',
    holeStatus: 'map', holePlans: 'map', wording: 'value', findingStatus: 'map',
    surveys: 'list', surveyProfiles: 'list',
  },
  inventory: {
    catalogue: 'list', suppliers: 'list', pos: 'list', rigKit: 'list', storeStock: 'list', alerts: 'value',
  },
}

/* What each login may send. The server checks every change again; this only
 * stops a browser sending what would be refused anyway. */
export const MAY_SEND: Record<Role, Partial<Record<StoreName, string[] | 'all'>>> = {
  admin: { costing: 'all', inventory: 'all' },
  supervisor: { costing: ['shiftLogs', 'maintenance', 'users'] },
  contractor: { costing: ['contractorReports', 'contractorBills', 'maintenance', 'users'] },
  client: { costing: ['holeStatus', 'invoices', 'rateProposals', 'holePlans', 'projectEvents', 'users'] },
}

/* One record as it travels. `data: null` is a removal. `c` is the order the
 * record was first created in, which is the order lists are shown in. */
export interface Change { store: StoreName; coll: string; id: string; data: unknown | null; c?: number }

export const VALUE_ID = '_'

type AnyState = Record<string, unknown>

/* State → records. */
export function toRecords(store: StoreName, state: AnyState): Change[] {
  const out: Change[] = []
  Object.entries(SPEC[store]).forEach(([coll, shape]) => {
    const v = state[coll]
    if (shape === 'list') (v as { id: string }[] | undefined ?? []).forEach(x => { if (x && x.id) out.push({ store, coll, id: x.id, data: x }) })
    else if (shape === 'map') Object.entries(v as Record<string, unknown> | undefined ?? {}).forEach(([id, data]) => out.push({ store, coll, id, data }))
    else if (v !== undefined) out.push({ store, coll, id: VALUE_ID, data: { v } })
  })
  return out
}

/* Records → state, on top of an empty state. Lists come out in creation order. */
export function fromRecords<S extends AnyState>(store: StoreName, empty: S, records: Change[]): S {
  const next: AnyState = { ...empty }
  const mine = records.filter(r => r.store === store && r.data != null && SPEC[store][r.coll])
    .sort((a, b) => (a.c ?? Number.MAX_SAFE_INTEGER) - (b.c ?? Number.MAX_SAFE_INTEGER))
  Object.entries(SPEC[store]).forEach(([coll, shape]) => {
    const recs = mine.filter(r => r.coll === coll)
    if (shape === 'list') next[coll] = recs.map(r => r.data)
    else if (shape === 'map') next[coll] = Object.fromEntries(recs.map(r => [r.id, r.data]))
    else if (recs[0]) next[coll] = (recs[0].data as { v: unknown }).v
  })
  return next as S
}

/* One change laid over a state. */
export function applyChange<S extends AnyState>(state: S, ch: Change): S {
  const shape = SPEC[ch.store]?.[ch.coll]
  if (!shape) return state
  if (shape === 'list') {
    const list = (state[ch.coll] as { id: string }[] | undefined) ?? []
    const has = list.some(x => x.id === ch.id)
    const next = ch.data == null ? list.filter(x => x.id !== ch.id)
      : has ? list.map(x => x.id === ch.id ? ch.data as { id: string } : x) : [...list, ch.data as { id: string }]
    return { ...state, [ch.coll]: next }
  }
  if (shape === 'map') {
    const map = { ...((state[ch.coll] as Record<string, unknown> | undefined) ?? {}) }
    if (ch.data == null) delete map[ch.id]; else map[ch.id] = ch.data
    return { ...state, [ch.coll]: map }
  }
  return ch.data == null ? state : { ...state, [ch.coll]: (ch.data as { v: unknown }).v }
}

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b)

/* What changed between two states: the records to send. */
export function diffStates(store: StoreName, before: AnyState, after: AnyState, only: string[] | 'all' = 'all'): Change[] {
  const out: Change[] = []
  Object.entries(SPEC[store]).forEach(([coll, shape]) => {
    if (only !== 'all' && !only.includes(coll)) return
    const a = before[coll], b = after[coll]
    if (a === b) return
    if (shape === 'value') { if (!same(a, b) && b !== undefined) out.push({ store, coll, id: VALUE_ID, data: { v: b } }); return }
    const index = (v: unknown): Record<string, unknown> => shape === 'list'
      ? Object.fromEntries(((v as { id: string }[] | undefined) ?? []).filter(x => x && x.id).map(x => [x.id, x]))
      : ((v as Record<string, unknown> | undefined) ?? {})
    const ia = index(a), ib = index(b)
    Object.keys(ib).forEach(id => { if (!same(ia[id], ib[id])) out.push({ store, coll, id, data: ib[id] }) })
    Object.keys(ia).forEach(id => { if (!(id in ib)) out.push({ store, coll, id, data: null }) })
  })
  return out
}
