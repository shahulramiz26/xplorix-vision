import { hashPassword, newPassword, whoIs, json } from '../../../lib/server/auth'
import { db } from '../../../lib/server/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/* A password for one of the logins in Users: a new login, or a reset. The
 * password is made here, stored only as a hash, and sent back once. */
export async function POST(req: Request) {
  const who = await whoIs()
  if (!who || who.role !== 'admin') return json({ error: 'Only the Company Admin can do this.' }, 401)
  let body: { userRef?: string }
  try { body = await req.json() } catch { return json({ error: 'bad request' }, 400) }
  const userRef = body.userRef ?? ''
  const { rows } = await db().query(
    `select data from xp_records where company_id = $1 and store = 'costing' and coll = 'users' and id = $2 and not deleted`, [who.companyId, userRef])
  const u = rows[0]?.data as { name: string; username: string; role: string } | undefined
  if (!u) return json({ error: 'That login is not saved yet. Try again in a moment.' }, 404)
  const password = newPassword()
  const id = `acc_${who.companyId}_${userRef}`
  try {
    await db().query(
      `insert into xp_accounts (id, company_id, username, password_hash, role, user_ref, name) values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (id) do update set username = excluded.username, password_hash = excluded.password_hash, role = excluded.role, name = excluded.name`,
      [id, who.companyId, u.username, hashPassword(password), u.role, userRef, u.name])
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return json({ error: `The username ${u.username} is already taken.` }, 409)
    throw e
  }
  return json({ username: u.username, password })
}

/* The login was removed from Users: it can no longer sign in. */
export async function DELETE(req: Request) {
  const who = await whoIs()
  if (!who || who.role !== 'admin') return json({ error: 'Only the Company Admin can do this.' }, 401)
  const userRef = new URL(req.url).searchParams.get('userRef') ?? ''
  await db().query('delete from xp_accounts where company_id = $1 and user_ref = $2', [who.companyId, userRef])
  return json({ ok: true })
}
