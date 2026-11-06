import { cookies } from 'next/headers'
import { checkPassword, sessionCookie, json } from '../../../../lib/server/auth'
import { db, ensureSchema, hasDb } from '../../../../lib/server/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: Request) {
  if (!hasDb()) return json({ error: 'No database is connected.' }, 400)
  let body: { username?: string; password?: string }
  try { body = await req.json() } catch { return json({ error: 'bad request' }, 400) }
  const username = (body.username ?? '').trim()
  const password = body.password ?? ''
  if (!username || !password) return json({ error: 'Enter your username and password.' }, 400)
  await ensureSchema()
  /* Guessing is slowed down: after 8 wrong passwords for one username, that
   * username is refused for 10 minutes, right or wrong. */
  const key = username.toLowerCase().slice(0, 80)
  const held = (await db().query('select blocked_until > now() as held from xp_attempts where key = $1', [key])).rows[0]?.held
  if (held) return json({ error: 'Too many wrong passwords. Wait 10 minutes and try again.' }, 429)
  const { rows } = await db().query(
    `select a.id, a.role, a.password_hash, a.user_ref,
            (select r.data from xp_records r where r.company_id = a.company_id and r.store = 'costing' and r.coll = 'users' and r.id = a.user_ref and not r.deleted) as user_rec
       from xp_accounts a where lower(a.username) = lower($1)`, [username])
  const a = rows[0]
  // The same answer whether the username or the password is wrong.
  if (!a || !checkPassword(password, a.password_hash)) {
    await db().query(
      `insert into xp_attempts (key, fails) values ($1, 1)
       on conflict (key) do update set
         fails = case when xp_attempts.blocked_until is not null and xp_attempts.blocked_until <= now() then 1 else xp_attempts.fails + 1 end,
         blocked_until = case when (case when xp_attempts.blocked_until is not null and xp_attempts.blocked_until <= now() then 1 else xp_attempts.fails + 1 end) >= 8
                              then now() + interval '10 minutes' else null end`, [key])
    return json({ error: 'That username and password do not match.' }, 401)
  }
  await db().query('delete from xp_attempts where key = $1', [key])
  if (a.role !== 'admin' && (!a.user_rec || a.user_rec.active === false)) return json({ error: 'This login has been switched off. Ask your Company Admin.' }, 403)
  cookies().set(sessionCookie(a.id))
  return json({ ok: true, role: a.role })
}
