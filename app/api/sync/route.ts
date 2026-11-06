import { whoIs, json } from '../../../lib/server/auth'
import { pull, push } from '../../../lib/server/records'
import type { Change } from '../../../lib/sync-spec'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

/* What changed since `since`, for the login asking. */
export async function GET(req: Request) {
  const who = await whoIs()
  if (!who) return json({ error: 'signed out' }, 401)
  const since = Number(new URL(req.url).searchParams.get('since')) || 0
  return json(await pull(who, since))
}

/* Save changes, then answer as GET does. Changes the login may not make are
 * left out and named in `rejected`. */
export async function POST(req: Request) {
  const who = await whoIs()
  if (!who) return json({ error: 'signed out' }, 401)
  let body: { changes?: Change[]; since?: number }
  try { body = await req.json() } catch { return json({ error: 'bad request' }, 400) }
  const changes = Array.isArray(body.changes) ? body.changes.slice(0, 3000) : []
  const rejected = await push(who, changes)
  return json({ ...(await pull(who, Number(body.since) || 0)), rejected })
}
