import { cookies } from 'next/headers'
import { hashPassword, sessionCookie, whoIs, json, HOME_COMPANY, OWNER_ACCOUNT } from '../../../lib/server/auth'
import { db, ensureSchema, hasDb, tx } from '../../../lib/server/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const COMPANY = { id: HOME_COMPANY, name: 'Apex Drilling Solutions', code: 'APX' }

/* First-time set-up: makes the company and its Company Admin. Works once,
 * while the database has no company in it. */
export async function POST(req: Request) {
  if (!hasDb()) return json({ error: 'No database is connected.' }, 400)
  let body: { name?: string; username?: string; password?: string }
  try { body = await req.json() } catch { return json({ error: 'bad request' }, 400) }
  const name = (body.name ?? '').trim(), username = (body.username ?? '').trim(), password = body.password ?? ''
  if (!name) return json({ error: 'Enter your name.' }, 400)
  if (!/^[A-Za-z0-9_.-]{3,30}$/.test(username)) return json({ error: 'Username: 3 to 30 letters, numbers, dots, dashes or underscores.' }, 400)
  if (password.length < 8) return json({ error: 'Password: at least 8 characters.' }, 400)
  await ensureSchema()
  const accountId = OWNER_ACCOUNT
  const made = await tx(async c => {
    await c.query('select pg_advisory_xact_lock(hashtext($1))', ['xp:setup'])
    if (Number((await c.query('select count(*) as n from xp_companies')).rows[0].n) > 0) return false
    await c.query('insert into xp_companies (id, name, code, demo) values ($1, $2, $3, true)', [COMPANY.id, COMPANY.name, COMPANY.code])
    await c.query('insert into xp_accounts (id, company_id, username, password_hash, role, name) values ($1, $2, $3, $4, $5, $6)',
      [accountId, COMPANY.id, username, hashPassword(password), 'admin', name])
    return true
  })
  if (!made) return json({ error: 'Set-up has already been done. Sign in instead.' }, 409)
  cookies().set(sessionCookie(accountId))
  return json({ ok: true })
}

/* The Company Admin's browser has loaded the demo data: do not load it again. */
export async function PUT() {
  const who = await whoIs()
  if (!who || who.role !== 'admin') return json({ error: 'signed out' }, 401)
  await db().query('update xp_companies set seeded = true where id = $1', [who.companyId])
  return json({ ok: true })
}
