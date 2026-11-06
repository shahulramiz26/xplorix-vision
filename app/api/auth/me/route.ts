import { whoIs, json } from '../../../../lib/server/auth'
import { db, ensureSchema, hasDb } from '../../../../lib/server/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/* Who is signed in. With no database behind the app, says so, and the app
 * runs as the browser demo. With a database and no company yet, asks for the
 * first-time set-up. */
export async function GET() {
  if (!hasDb()) return json({ backend: false })
  try {
    await ensureSchema()
    const who = await whoIs()
    if (who) return json({ backend: true, user: { role: who.role, name: who.name, username: who.username, userRef: who.userRef, company: who.company, owner: who.owner } })
    const n = Number((await db().query('select count(*) as n from xp_companies')).rows[0].n)
    return json({ backend: true, setup: n === 0, user: null })
  } catch (e) {
    console.error('auth/me', e)
    return json({ backend: true, error: 'The database could not be reached.' }, 503)
  }
}
