import { cookies } from 'next/headers'
import { clearedCookie, json } from '../../../../lib/server/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST() {
  cookies().set(clearedCookie())
  return json({ ok: true })
}
