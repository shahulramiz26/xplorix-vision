import { redirect } from 'next/navigation'

/* The old address. XPLORIX Intelligence is now four screens under
 * /admin/intelligence; anyone with the old link lands on Today. */
export default function OldIntelligence() {
  redirect('/admin/dashboard')
}
