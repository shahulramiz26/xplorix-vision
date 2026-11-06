import { randomBytes } from 'crypto'
import { hashPassword, newPassword, whoIs, json } from '../../../lib/server/auth'
import { db, tx } from '../../../lib/server/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/* ==========================================================================
 * COMPANIES
 *
 * Every company on XPLORIX has its own record and its own logins, and never
 * sees another's. Only the account that set XPLORIX up may add one. A new
 * company starts empty, on the real date, with one login: its Company Admin.
 * ========================================================================== */

async function owner() {
  const who = await whoIs()
  return who?.owner ? who : null
}

export async function GET() {
  if (!(await owner())) return json({ error: 'Only the XPLORIX owner can do this.' }, 401)
  const { rows } = await db().query(
    `select c.id, c.name, c.code, c.demo, c.created_at,
            (select a.username from xp_accounts a where a.company_id = c.id and a.role = 'admin' order by a.created_at limit 1) as admin_username,
            (select a.name from xp_accounts a where a.company_id = c.id and a.role = 'admin' order by a.created_at limit 1) as admin_name,
            (select count(*) from xp_accounts a where a.company_id = c.id) as logins,
            (select count(*) from xp_records r where r.company_id = c.id and r.store = 'costing' and r.coll = 'projects' and not r.deleted) as projects,
            (select count(*) from xp_records r where r.company_id = c.id and r.store = 'costing' and r.coll = 'shiftLogs' and not r.deleted) as logs,
            (select max(r.updated_at) from xp_records r where r.company_id = c.id) as last_change
       from xp_companies c order by c.created_at`)
  return json({
    companies: rows.map(r => ({
      id: r.id, name: r.name, code: r.code, demo: r.demo, createdAt: r.created_at, adminUsername: r.admin_username, adminName: r.admin_name,
      logins: Number(r.logins), projects: Number(r.projects), logs: Number(r.logs), lastChange: r.last_change,
    })),
  })
}

export async function POST(req: Request) {
  if (!(await owner())) return json({ error: 'Only the XPLORIX owner can do this.' }, 401)
  let body: { name?: string; code?: string; adminName?: string; adminUsername?: string }
  try { body = await req.json() } catch { return json({ error: 'bad request' }, 400) }
  const name = (body.name ?? '').trim(), code = (body.code ?? '').trim().toUpperCase()
  const adminName = (body.adminName ?? '').trim(), adminUsername = (body.adminUsername ?? '').trim()
  if (name.length < 2 || name.length > 80) return json({ error: 'Enter the company name.' }, 400)
  if (!/^[A-Z0-9]{2,5}$/.test(code)) return json({ error: 'Code: 2 to 5 letters or numbers.' }, 400)
  if (!adminName) return json({ error: 'Enter the name of their Company Admin.' }, 400)
  if (!/^[A-Za-z0-9_.-]{3,30}$/.test(adminUsername)) return json({ error: 'Username: 3 to 30 letters, numbers, dots, dashes or underscores.' }, 400)
  const id = `c_${randomBytes(6).toString('hex')}`
  const password = newPassword()
  try {
    await tx(async c => {
      // seeded: there is no demo data to load. demo false: it lives on the real date.
      await c.query('insert into xp_companies (id, name, code, demo, seeded) values ($1, $2, $3, false, true)', [id, name, code])
      await c.query('insert into xp_accounts (id, company_id, username, password_hash, role, name) values ($1, $2, $3, $4, $5, $6)',
        [`acc_admin_${id}`, id, adminUsername, hashPassword(password), 'admin', adminName])
    })
  } catch (e) {
    const err = e as { code?: string; constraint?: string }
    if (err.code === '23505') return json({ error: err.constraint === 'xp_companies_code' ? `The code ${code} is already used by another company.` : `The username ${adminUsername} is already taken.` }, 409)
    throw e
  }
  return json({ id, name, code, adminUsername, password })
}

/* A new password for a company's admin, for when theirs is lost. */
export async function PUT(req: Request) {
  if (!(await owner())) return json({ error: 'Only the XPLORIX owner can do this.' }, 401)
  let body: { id?: string }
  try { body = await req.json() } catch { return json({ error: 'bad request' }, 400) }
  const { rows } = await db().query(`select id, username from xp_accounts where company_id = $1 and role = 'admin' order by created_at limit 1`, [body.id ?? ''])
  if (!rows[0]) return json({ error: 'That company has no admin login.' }, 404)
  const password = newPassword()
  await db().query('update xp_accounts set password_hash = $1 where id = $2', [hashPassword(password), rows[0].id])
  await db().query('delete from xp_attempts where key = $1', [String(rows[0].username).toLowerCase()])
  return json({ adminUsername: rows[0].username, password })
}
