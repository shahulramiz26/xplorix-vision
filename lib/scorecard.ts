import { monthOf } from './costing-store'
import { daysBetween } from './inventory-store'
import { deptLabel, type Dept } from './findings'
import type { InboxResult } from './inbox'
import type { Warning } from './outlook-analytics'

/* ==========================================================================
 * SCORECARD — is XPLORIX helping, and is the team using it?
 *
 * Four scores out of 100, each from the record:
 *   Useful     of what XPLORIX raised and someone answered, the share acted
 *              on rather than set aside as not relevant. This scores XPLORIX.
 *   Speed      how fast a finding is answered: the median days from found
 *              to answered. The same day is 100; a week or more is 0.
 *   Coverage   of everything found, the share answered. Open items age.
 *   Results    of the measures the findings are meant to move (pace, cost a
 *              metre, own stops, standby, core, fuel), the share getting
 *              better: better counts 1, steady a half, worse nothing.
 * The overall score is the four averaged. Money proven is kept to a note.
 * ========================================================================== */

export interface Answer { id: string; dept: string; title: string; found: string; at: string; status: 'done' | 'dismissed' | 'assigned' | 'snoozed'; note?: string; days: number }
export interface Score { key: 'useful' | 'speed' | 'coverage' | 'results'; label: string; score: number | null; line: string; detail: string }
export interface DeptRow { dept: string; label: string; answered: number; acted: number; setAside: number; medianDays: number | null; open: number; useful: number | null }

const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const speedScore = (d: number | null) => d == null ? null : Math.round(Math.max(0, Math.min(100, 100 - (d * 100) / 7)))

export function answersOf(statuses: Record<string, { status: Answer['status']; at: string; note?: string; found?: { title: string; dept: string; on?: string } }>): Answer[] {
  return Object.entries(statuses).filter(([, s]) => s.found?.on && s.status !== 'snoozed').map(([id, s]) => ({
    id, dept: s.found!.dept, title: s.found!.title, found: s.found!.on!, at: s.at.slice(0, 10), status: s.status, note: s.note,
    days: Math.max(0, daysBetween(s.found!.on!, s.at.slice(0, 10))),
  })).sort((a, b) => b.at.localeCompare(a.at))
}

export function buildScorecard(answers: Answer[], inbox: InboxResult, warnings: Warning[]) {
  const acted = answers.filter(a => a.status !== 'dismissed')
  const setAside = answers.filter(a => a.status === 'dismissed')
  const useful = answers.length ? Math.round((acted.length / answers.length) * 100) : null
  const med = median(answers.map(a => a.days))
  const open = inbox.open.length + inbox.reminders.length
  const coverage = answers.length + open ? Math.round((answers.length / (answers.length + open)) * 100) : null
  const counted = warnings.filter(w => w.state !== 'thin')
  const results = counted.length ? Math.round((counted.reduce((s, w) => s + (w.state === 'better' ? 1 : w.state === 'steady' ? 0.5 : 0), 0) / counted.length) * 100) : null
  const scores: Score[] = [
    { key: 'useful', label: 'Useful', score: useful, line: useful == null ? 'Nothing answered yet' : `${acted.length} of ${answers.length} findings acted on`, detail: `${setAside.length} set aside as not relevant. That share scores XPLORIX itself: every reason given is used to make the checks sharper.` },
    { key: 'speed', label: 'Speed', score: speedScore(med), line: med == null ? 'Nothing answered yet' : `Half are answered within ${med === 0 ? 'the day' : `${med.toFixed(med % 1 ? 1 : 0)} ${med === 1 ? 'day' : 'days'}`}`, detail: 'Answered the same day scores 100; a week or more scores 0.' },
    { key: 'coverage', label: 'Coverage', score: coverage, line: `${answers.length} answered, ${open} still open`, detail: 'Of everything XPLORIX has found, the share someone has answered. Open findings that wait get older and cost more.' },
    { key: 'results', label: 'Results', score: results, line: counted.length ? `${counted.filter(w => w.state === 'better').length} of ${counted.length} measures improving` : 'Not enough weeks yet', detail: 'Six weeks of the measures the findings are meant to move: pace, cost a metre, own stops, standby, core and fuel.' },
  ]
  const have = scores.filter(s => s.score != null)
  const overall = have.length ? Math.round(have.reduce((t, s) => t + (s.score as number), 0) / have.length) : null

  // Month by month: useful and speed, from when each finding was answered.
  const months = Array.from(new Set(answers.map(a => monthOf(a.at)))).sort()
  const trend = months.map(m => {
    const mine = answers.filter(a => monthOf(a.at) === m)
    const u = mine.length ? Math.round((mine.filter(a => a.status !== 'dismissed').length / mine.length) * 100) : null
    return { month: m, n: mine.length, useful: u, speed: speedScore(median(mine.map(a => a.days))) }
  })

  const depts = Array.from(new Set([...answers.map(a => a.dept), ...inbox.open.map(u => u.dept)]))
  const byDept: DeptRow[] = depts.map(d => {
    const mine = answers.filter(a => a.dept === d)
    const ac = mine.filter(a => a.status !== 'dismissed').length
    return {
      dept: d, label: (() => { try { return deptLabel(d as Dept) } catch { return d } })(),
      answered: mine.length, acted: ac, setAside: mine.length - ac, medianDays: median(mine.map(a => a.days)),
      open: inbox.open.filter(u => u.dept === d).length, useful: mine.length ? Math.round((ac / mine.length) * 100) : null,
    }
  }).sort((a, b) => b.answered + b.open - (a.answered + a.open))

  return { scores, overall, trend, byDept, setAside, answers }
}

export const scoreWord = (n: number | null) => n == null ? 'Not enough yet' : n >= 80 ? 'Strong' : n >= 60 ? 'Good' : n >= 40 ? 'Needs work' : 'Weak'
