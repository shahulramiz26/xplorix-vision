import type { PoolClient } from 'pg'
import { db, tx } from './db'
import { judge, visible, type Rec } from './policy'
import type { Who } from './auth'
import { SPEC, type Change } from '../sync-spec'

/* ==========================================================================
 * THE COMPANY'S RECORD
 *
 * One row per record. Every save takes the next number from one counter, so
 * "what changed since I last looked" is a single comparison. Saves for one
 * company are taken one at a time, so that number is also the order they
 * happened in.
 * ========================================================================== */

type Row = { store: string; coll: string; id: string; data: unknown; deleted: boolean; rev: string; created_rev: string }
const rec = (r: Row): Rec => ({ store: r.store as Rec['store'], coll: r.coll, id: r.id, data: r.deleted ? null : r.data, c: Number(r.created_rev) })

async function loadAll(q: { query: PoolClient['query'] }, companyId: string): Promise<Rec[]> {
  const { rows } = await q.query('select store, coll, id, data, deleted, rev, created_rev from xp_records where company_id = $1 and not deleted', [companyId])
  return (rows as Row[]).map(rec)
}

export interface Pulled { rev: number; unchanged?: true; snapshot?: Rec[]; changes?: Rec[] }

/* What this login should now hold. The admin, who sees everything, is sent
 * only what changed. Everyone else is sent the whole of what they may see,
 * because what they may see can change with a record they never held. */
export async function pull(who: Who, since: number): Promise<Pulled> {
  const top = Number((await db().query('select coalesce(max(rev), 0) as m from xp_records where company_id = $1', [who.companyId])).rows[0].m)
  if (top <= since) return { rev: since, unchanged: true }
  if (who.role === 'admin' && since > 0) {
    const { rows } = await db().query('select store, coll, id, data, deleted, rev, created_rev from xp_records where company_id = $1 and rev > $2 order by rev', [who.companyId, since])
    return { rev: top, changes: (rows as Row[]).map(rec) }
  }
  return { rev: top, snapshot: visible(who, await loadAll(db(), who.companyId)) }
}

const BATCH = 400
async function write(c: PoolClient, who: Who, list: Change[]) {
  for (let i = 0; i < list.length; i += BATCH) {
    const part = list.slice(i, i + BATCH)
    await c.query(
      `insert into xp_records (company_id, store, coll, id, data, deleted, rev, created_rev, updated_by)
       select $1, r.store, r.coll, r.id, r.data, r.deleted, r.rev, r.rev, $7
         from (select t.store, t.coll, t.id, t.data, t.deleted, nextval('xp_rev') as rev
                 from unnest($2::text[], $3::text[], $4::text[], $5::jsonb[], $6::boolean[]) with ordinality as t(store, coll, id, data, deleted, ord)
                order by t.ord) r
       on conflict (company_id, store, coll, id) do update
         set data = excluded.data, deleted = excluded.deleted, rev = excluded.rev, updated_by = excluded.updated_by, updated_at = now()`,
      [who.companyId, part.map(x => x.store), part.map(x => x.coll), part.map(x => x.id),
        part.map(x => x.data == null ? null : JSON.stringify(x.data)), part.map(x => x.data == null), who.username])
  }
}

export interface Rejected { coll: string; id: string; reason: string }

export async function push(who: Who, changes: Change[]): Promise<Rejected[]> {
  const rejected: Rejected[] = []
  const clean = changes.filter(ch => ch && SPEC[ch.store]?.[ch.coll] && typeof ch.id === 'string' && ch.id.length > 0 && ch.id.length <= 200)
  if (clean.length === 0) return rejected
  await tx(async c => {
    await c.query('select pg_advisory_xact_lock(hashtext($1))', [`xp:${who.companyId}`])
    // The admin may write anything, so nothing needs reading first.
    if (who.role === 'admin') { await write(c, who, dedupe(clean)); return }
    const all = await loadAll(c, who.companyId)
    const accepted: Change[] = []
    for (const ch of clean) {
      const at = all.findIndex(r => r.store === ch.store && r.coll === ch.coll && r.id === ch.id)
      const verdict = judge(who, ch, at >= 0 ? all[at].data : undefined, all)
      if (!verdict.ok) { rejected.push({ coll: ch.coll, id: ch.id, reason: verdict.reason }); continue }
      for (const w of [{ ...ch, data: verdict.data }, ...(verdict.also ?? [])]) {
        accepted.push(w)
        // Later changes in the same request are judged against this one.
        const j = all.findIndex(r => r.store === w.store && r.coll === w.coll && r.id === w.id)
        if (w.data == null) { if (j >= 0) all.splice(j, 1) }
        else if (j >= 0) all[j] = { ...all[j], data: w.data }
        else all.push({ ...w, data: w.data, c: Number.MAX_SAFE_INTEGER })
      }
    }
    await write(c, who, dedupe(accepted))
  })
  return rejected
}

/* One statement cannot touch the same row twice: the last change to a record wins. */
function dedupe(list: Change[]): Change[] {
  const last = new Map<string, Change>()
  list.forEach(ch => { const k = `${ch.store}|${ch.coll}|${ch.id}`; last.delete(k); last.set(k, ch) })
  return Array.from(last.values())
}
