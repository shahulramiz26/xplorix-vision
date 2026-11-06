import { checkPassword, hashPassword, whoIs, json } from '../../../../lib/server/auth'
import { db } from '../../../../lib/server/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/* Change your own password. You must know the one you have. */
export async function POST(req: Request) {
  const who = await whoIs()
  if (!who) return json({ error: 'signed out' }, 401)
  let body: { current?: string; next?: string }
  try { body = await req.json() } catch { return json({ error: 'bad request' }, 400) }
  const current = body.current ?? '', next = body.next ?? ''
  if (next.length < 8) return json({ error: 'The new password needs at least 8 characters.' }, 400)
  if (next === current) return json({ error: 'The new password is the same as the old one.' }, 400)
  const { rows } = await db().query('select password_hash from xp_accounts where id = $1', [who.accountId])
  if (!rows[0] || !checkPassword(current, rows[0].password_hash)) return json({ error: 'Your current password is not right.' }, 403)
  await db().query('update xp_accounts set password_hash = $1 where id = $2', [hashPassword(next), who.accountId])
  return json({ ok: true })
}
