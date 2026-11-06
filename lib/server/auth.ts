import { createHash, createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import { db, dbUrl, ensureSchema, hasDb } from './db'
import type { Role } from '../sync-spec'

/* ==========================================================================
 * SIGNING IN
 *
 * A username and a password. The password is never stored: only a salted
 * scrypt hash of it. Signing in sets a signed cookie the browser cannot read
 * or change; every request is checked against the account again, so a login
 * that was removed or switched off stops working at once.
 * ========================================================================== */

/* The first company, and the account made with it at set-up. */
export const HOME_COMPANY = 'c1'
export const OWNER_ACCOUNT = `acc_admin_${HOME_COMPANY}`

const COOKIE = 'xp_session'
const DAYS = 14

function secret() {
  // Set SESSION_SECRET to choose it. Without one it is derived from the
  // database connection string, which only the server knows.
  return process.env.SESSION_SECRET || createHash('sha256').update(`xplorix:${dbUrl()}`).digest('hex')
}

export function hashPassword(password: string) {
  const salt = randomBytes(16)
  const key = scryptSync(password, salt, 32)
  return `s1$${salt.toString('base64')}$${key.toString('base64')}`
}
export function checkPassword(password: string, stored: string) {
  const [v, salt, key] = stored.split('$')
  if (v !== 's1' || !salt || !key) return false
  const want = Buffer.from(key, 'base64')
  const got = scryptSync(password, Buffer.from(salt, 'base64'), want.length)
  return got.length === want.length && timingSafeEqual(got, want)
}

/* Easy to read aloud and type on a phone: no 0/O, 1/l/I. */
export function newPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ', lower = 'abcdefghijkmnpqrstuvwxyz', digit = '23456789'
  const pick = (s: string) => s[randomInt(s.length)]
  return Array.from({ length: 5 }, () => pick(upper) + pick(lower)).join('').slice(0, 8) + pick(digit) + pick(digit)
}

const b64 = (s: string) => Buffer.from(s).toString('base64url')
const sign = (body: string) => createHmac('sha256', secret()).update(body).digest('base64url')

export function sessionCookie(accountId: string) {
  const body = b64(JSON.stringify({ a: accountId, x: Date.now() + DAYS * 86400_000 }))
  return {
    name: COOKIE, value: `${body}.${sign(body)}`,
    httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: DAYS * 86400,
  }
}
export const clearedCookie = () => ({ name: COOKIE, value: '', httpOnly: true, sameSite: 'lax' as const, path: '/', maxAge: 0 })

export interface Who {
  accountId: string
  companyId: string
  company: { id: string; name: string; code: string | null; demo: boolean; seeded: boolean }
  /* The account that set XPLORIX up. It alone may add companies. */
  owner: boolean
  role: Role
  userRef: string | null      // the login's own record in Users; null for the Company Admin
  name: string
  username: string
}

/* The account behind this request, or null. */
export async function whoIs(): Promise<Who | null> {
  if (!hasDb()) return null
  const raw = cookies().get(COOKIE)?.value
  if (!raw) return null
  const [body, sig] = raw.split('.')
  if (!body || !sig) return null
  const want = sign(body)
  if (sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null
  let claim: { a: string; x: number }
  try { claim = JSON.parse(Buffer.from(body, 'base64url').toString()) } catch { return null }
  if (!claim?.a || !(claim.x > Date.now())) return null
  await ensureSchema()
  const { rows } = await db().query(
    `select a.id, a.company_id, a.username, a.role, a.user_ref, a.name, c.name as company_name, c.code, c.demo, c.seeded,
            (select r.data from xp_records r where r.company_id = a.company_id and r.store = 'costing' and r.coll = 'users' and r.id = a.user_ref and not r.deleted) as user_rec
       from xp_accounts a join xp_companies c on c.id = a.company_id where a.id = $1`, [claim.a])
  const a = rows[0]
  if (!a) return null
  // Anyone but the admin signs in as a record in Users. Removed or switched off: no entry.
  if (a.role !== 'admin' && (!a.user_rec || a.user_rec.active === false)) return null
  return {
    accountId: a.id, companyId: a.company_id, role: a.role, userRef: a.user_ref, name: a.user_rec?.name ?? a.name, username: a.username,
    company: { id: a.company_id, name: a.company_name, code: a.code, demo: a.demo, seeded: a.seeded },
    owner: a.id === OWNER_ACCOUNT,
  }
}

export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
