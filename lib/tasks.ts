import { addDays } from './inventory-store'
import type { InboxUnit } from './inbox'

/* ==========================================================================
 * TASKS ON A CALENDAR
 *
 * Every notification has a day:
 *   due        the record gives one (a service due, shifts to check today)
 *   moved      someone moved it to a day ("Move to…")
 *   late       it was due before today and is still open: shown on today
 *   suggested  the record gives no date, so XPLORIX suggests one: act-now
 *              today; plan-for-it, then watch, spread over the coming working
 *              days so no day is overloaded.
 * A suggested day is marked as suggested, never shown as a deadline.
 * ========================================================================== */

export type When = 'due' | 'moved' | 'late' | 'suggested'
export interface TaskItem { u: InboxUnit; date: string; when: When; lateFrom?: string }

const isWeekend = (d: string) => { const w = new Date(`${d}T00:00:00Z`).getUTCDay(); return w === 0 || w === 6 }
const nextWorkday = (d: string) => { let x = addDays(d, 1); while (isWeekend(x)) x = addDays(x, 1); return x }

export function placeTasks(open: InboxUnit[], reminders: InboxUnit[], today: string, perDay = 4): TaskItem[] {
  const out: TaskItem[] = []
  reminders.forEach(u => out.push({ u, date: u.status?.until ?? today, when: 'moved' }))
  const undated: InboxUnit[] = []
  open.forEach(u => {
    if (u.due && u.due < today) out.push({ u, date: today, when: 'late', lateFrom: u.due })
    else if (u.due) out.push({ u, date: u.due, when: 'due' })
    else undated.push(u)
  })
  undated.filter(u => u.severity === 'act').forEach(u => out.push({ u, date: today, when: 'suggested' }))
  /* Plan, then watch: the biggest money first, at most a few a working day,
   * so no day is buried. */
  let d = nextWorkday(today)
  const count = (x: string) => out.filter(t => t.date === x).length
  const queue = [
    ...undated.filter(u => u.severity === 'plan').sort((a, b) => (b.money ?? 0) - (a.money ?? 0)),
    ...undated.filter(u => u.severity === 'watch').sort((a, b) => (b.money ?? 0) - (a.money ?? 0)),
  ]
  queue.forEach(u => {
    while (count(d) >= perDay) d = nextWorkday(d)
    out.push({ u, date: d, when: 'suggested' })
  })
  return out
}

export const DEPT_COLOR: Record<string, string> = {
  billing: '#2563eb', finance: '#7c3aed', stock: '#d97706', maintenance: '#dc2626', operations: '#059669',
  contractors: '#0891b2', data: '#475569', crew: '#db2777', safety: '#ea580c', geology: '#65a30d',
}
