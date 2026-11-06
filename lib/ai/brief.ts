import { monthOf, shiftMonth, monthLabel, perUnit } from '../costing-store'
import { addDays } from '../inventory-store'
import { monthNumbers } from '../admin-overview'
import { companyToday } from '../company-overview'
import { SEVERITY_LABEL } from '../findings'
import { type AiCtx, type Source, dw, n0, n1, pct, plural, list, moneyL, shifts, pace, stops } from './record'
import type { Why } from './explain'

/* ==========================================================================
 * XPLORIX AI — THE BRIEF
 *
 * What a good operations manager would tell the owner first thing: what
 * happened, whether the month is on course, what needs him today and where
 * money is waiting. Written from the same record and the same task list as
 * every other screen, so the brief never says something Tasks does not.
 *
 * Two editions: the morning brief (yesterday and today) and the weekly one
 * (the last seven days against the seven before, and the week ahead).
 * ========================================================================== */

export interface BriefLine { text: string; href?: string; tone?: 'good' | 'bad' | 'neutral' }
export interface Brief { title: string; lines: BriefLine[]; sources: Source[] }

/* Why cost a metre moved: this month so far against the same days last month.
 * A metre's cost is the cost of a rig-day over the metres a rig-day makes, so
 * the change is either more cost a day, fewer metres a day, or both. */
export function costWhy(c: AiCtx): { headline: string; short: string; why: Why[]; up: boolean } | null {
  const month = monthOf(c.today)
  const day = Number(c.today.slice(8))
  const now = monthNumbers(c.costing, c.inv, month)
  const prev = monthNumbers(c.costing, c.inv, shiftMonth(month, -1), day)
  if (!now.metres || !prev.metres || !now.costPerMetre || !prev.costPerMetre) return null
  const ch = now.costPerMetre / prev.costPerMetre - 1
  const up = ch > 0
  const prevName = monthLabel(shiftMonth(month, -1)).split(' ')[0]
  const costDay = (m: typeof now) => m.rigDays ? m.cost / m.rigDays : 0
  const cd = costDay(now) / Math.max(1, costDay(prev)) - 1
  const md = now.perRigDay / Math.max(0.01, prev.perRigDay) - 1
  const why: Why[] = []
  const pace_ = { text: `A rig-day made ${n1(now.perRigDay)} m against ${n1(prev.perRigDay)} m in the same days of ${prevName} (${md >= 0 ? '+' : '−'}${pct(Math.abs(md) * 100)}).`, href: '/admin/analytics/operation' }
  const cost_ = { text: `A rig-day cost ${moneyL(costDay(now))} against ${moneyL(costDay(prev))} (${cd >= 0 ? '+' : '−'}${pct(Math.abs(cd) * 100)}).`, href: '/admin/finance' }
  // Lead with whichever moved cost a metre more.
  if (Math.abs(md) >= Math.abs(cd)) why.push(pace_, cost_); else why.push(cost_, pace_)
  if (now.breakdownDays !== prev.breakdownDays) why.push({ text: `Breakdown days: ${n0(now.breakdownDays)} against ${n0(prev.breakdownDays)}. A day stopped for a breakdown carries the rig's full cost and no metres.`, href: '/admin/logs/maintenance' })
  if (now.standbyDays !== prev.standbyDays) why.push({ text: `Client standby days: ${n0(now.standbyDays)} against ${n0(prev.standbyDays)}; these are paid by the client, so they lift cost a metre but not your margin.` })
  const since = `${month}-01`
  const own = stops(shifts(c, l => !l.contractor && l.date >= since && l.date <= c.today), 'own')[0]
  if (own) why.push({ text: `The biggest own stop this month is "${own.reason}", ${n0(own.hours)} h across the fleet.`, href: '/admin/analytics/operation' })
  const lead = Math.abs(md) >= Math.abs(cd)
    ? (md < 0 ? 'mostly because the rigs drilled fewer metres a day' : 'mostly because the rigs drilled more metres a day')
    : (cd > 0 ? 'mostly because a rig-day cost more' : 'mostly because a rig-day cost less')
  return { up, why, headline: `Cost a metre is ${perUnit(now.costPerMetre)} this month, ${up ? 'up' : 'down'} ${pct(Math.abs(ch) * 100)} on the same days of ${prevName}, ${lead}.`,
    short: `**Cost a metre is ${up ? 'up' : 'down'} ${pct(Math.abs(ch) * 100)}** on the same days of ${prevName}, ${lead}.` }
}

export function dailyBrief(c: AiCtx): Brief {
  const t = companyToday(c.costing, c.inv, c.today)
  const f = c.forecast
  const yday = addDays(c.today, -1)
  const ym = shifts(c, l => l.date === yday).reduce((s, l) => s + l.metresDrilled, 0)
  const lines: BriefLine[] = []
  const month = monthLabel(monthOf(c.today)).split(' ')[0]
  /* The Dashboard already shows today's metres, rigs and the month's money,
   * so the brief does not say them again: it says what they mean. */
  const since = `${monthOf(c.today)}-01`
  const mDays = new Set(shifts(c, l => l.date >= since && l.date < c.today).map(l => l.date)).size
  const mAvg = mDays ? shifts(c, l => l.date >= since && l.date < c.today).reduce((s, l) => s + l.metresDrilled, 0) / mDays : 0
  if (mAvg) {
    const d = (ym / mAvg - 1) * 100
    lines.push({ text: `**Yesterday ${n0(ym)} m**, ${Math.abs(d) < 3 ? `in line with ${month}'s daily average` : `${pct(Math.abs(d))} ${d > 0 ? 'above' : 'below'} ${month}'s daily average of ${n0(mAvg)} m`}.`, href: '/admin/analytics/operation', tone: d < -10 ? 'bad' : d > 3 ? 'good' : 'neutral' })
  }
  const cw = costWhy(c)
  if (cw) lines.push({ text: cw.short, href: '/admin/finance', tone: cw.up ? 'bad' : 'good' })
  const act = c.inbox.open.filter(u => u.severity === 'act')
  if (act.length) {
    const top = [...act].sort((a, b) => (b.money ?? 0) - (a.money ?? 0)).slice(0, 3)
    lines.push({ text: `**First today:** ${list(top.map(u => `${u.title.replace(/\.$/, '')}${u.money ? ` (${moneyL(u.money)})` : ''}`))}.`, href: '/admin/tasks?dept=all', tone: 'bad' })
  }
  // Money waiting is not repeated here: its tasks lead the line above, and Finance holds the rest.
  const plan = c.inbox.open.filter(u => u.severity === 'plan').sort((a, b) => (b.money ?? 0) - (a.money ?? 0))[0]
  if (plan) lines.push({ text: `To plan this week: ${plan.title.replace(/\.$/, '')}${plan.money ? ` (${moneyL(plan.money)})` : ''}.`, href: '/admin/tasks?dept=all' })
  return { title: `Morning brief · ${dw(c.today)}`, lines, sources: [{ label: 'Drill logs', href: '/admin/logs/drill' }, { label: 'Tasks', href: '/admin/tasks?dept=all' }, { label: 'Outlook', href: '/admin/intelligence/months' }] }
}

export function weeklyBrief(c: AiCtx): Brief {
  const a = addDays(c.today, -6), b = addDays(c.today, -13)
  const wk = pace(shifts(c, l => l.date >= a && l.date <= c.today))
  const pr = pace(shifts(c, l => l.date >= b && l.date < a))
  const lines: BriefLine[] = []
  const ch = pr.metres ? wk.metres / pr.metres - 1 : 0
  lines.push({ text: `**${n0(wk.metres)} m in the last 7 days**, ${ch >= 0 ? 'up' : 'down'} ${pct(Math.abs(ch) * 100)} on the week before, at ${wk.rop.toFixed(2)} m an hour on bottom (was ${pr.rop.toFixed(2)}).`, href: '/admin/analytics/operation', tone: ch >= 0 ? 'good' : 'bad' })
  if (wk.own || pr.own) lines.push({ text: `Own stops: ${n0(wk.own)} h against ${n0(pr.own)} h; client standby ${n0(wk.client)} h against ${n0(pr.client)} h.`, href: '/admin/analytics/operation', tone: wk.own > pr.own ? 'bad' : 'neutral' })
  // What the team did with the tasks this week, and whether XPLORIX was right.
  const st = Object.values(c.costing.findingStatus ?? {}).filter(s => s.at && s.at.slice(0, 10) >= a)
  const acted = st.filter(s => s.status === 'done' || s.status === 'assigned').length
  const aside = st.filter(s => s.status === 'dismissed').length
  lines.push({ text: st.length
    ? `**Tasks: ${n0(st.length)} answered this week**, ${acted} acted on and ${aside} set aside as not relevant; XPLORIX was useful on ${pct((acted / Math.max(1, acted + aside)) * 100)} of them.`
    : `**No task has been answered this week.** ${plural(c.inbox.open.length, 'task is', 'tasks are')} open, ${c.inbox.counts.act} of them ${SEVERITY_LABEL.act.toLowerCase()}.`, href: '/admin/value' })
  const next7 = c.forecast.daily.filter(d => d.forecast && d.date > c.today && d.date <= addDays(c.today, 7)).reduce((s, d) => s + d.metres, 0)
  lines.push({ text: `**Next 7 days: about ${n0(next7)} m** at each rig's last-30-day pace.${c.forecast.holeFinish.filter(h => h.finish && h.finish <= addDays(c.today, 7)).length ? ` ${list(c.forecast.holeFinish.filter(h => h.finish && h.finish <= addDays(c.today, 7)).map(h => h.hole))} should reach planned depth.` : ''}`, href: '/admin/intelligence/months' })
  const plan = c.inbox.open.filter(u => u.severity !== 'watch').sort((x, y) => (y.money ?? 0) - (x.money ?? 0)).slice(0, 3)
  if (plan.length) lines.push({ text: `Biggest money to settle: ${list(plan.map(u => `${u.title.replace(/\.$/, '')}${u.money ? ` (${moneyL(u.money)})` : ''}`))}.`, href: '/admin/tasks?dept=all' })
  return { title: `Weekly brief · ${dw(a)} to ${dw(c.today)}`, lines, sources: [{ label: 'Analytics', href: '/admin/analytics' }, { label: 'AI Scorecard', href: '/admin/value' }, { label: 'Outlook', href: '/admin/intelligence/months' }] }
}
