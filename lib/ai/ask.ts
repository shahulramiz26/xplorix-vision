import { monthOf, monthLabel, perUnit, outstanding, isOverdue } from '../costing-store'
import { addDays, normFormation } from '../inventory-store'
import { companyToday } from '../company-overview'
import { computeOverview } from '../admin-overview'
import { buildFleet, alarms as sensorAlarms, sensorMetres, reading, depthAt, MODE_LABEL, OPEN_AT, clock } from '../pulse'
import { holesFromLogs } from '../client-record'
import { standbyLedger } from '../money-checks'
import { contractorName } from '../contracting'
import {
  type AiCtx, type Source, dw, n0, n1, pct, plural, list, moneyL, money, shifts, rigShifts, pace, stops, ropIn,
  groundMix, rigsIn, holesIn, supervisorOf, dayLoss,
} from './record'
import type { InboxUnit } from '../inbox'
import { explain, type Draft } from './explain'
import { costWhy, dailyBrief, weeklyBrief } from './brief'

/* ==========================================================================
 * ASK XPLORIX — questions in plain words, answered from the record
 *
 * The demo engine reads a question for what it is about (a rig, a hole, a
 * part, money, the month ahead) and what kind of answer it wants (a figure,
 * a cause, a ranking, a draft), then works the answer out from the same
 * record every screen uses. Every answer lists what it read, so it can be
 * checked. A live language model takes the same question and the same
 * record later; the panel does not change.
 *
 * What the demo does not understand it says so, and offers questions it can
 * answer, rather than guessing.
 * ========================================================================== */

export interface Answer {
  text: string[]                       // paragraphs; **bold** is allowed
  table?: { cols: string[]; rows: string[][] }
  sources: Source[]
  draft?: Draft
  followups: string[]
  understood: boolean
}

const has = (q: string, ...words: (string | RegExp)[]) => words.some(w => typeof w === 'string' ? q.includes(w) : w.test(q))
const GROUNDS = ['very hard', 'hard', 'medium', 'soft']

/* Questions to start from, for the screen the person is on. */
export function suggestions(path: string): string[] {
  if (path.startsWith('/admin/finance')) return ['Why did cost per metre change this month?', 'Which invoices are overdue?', 'How much work is not yet cash?', 'Draft a reply to the client about standby']
  if (path.startsWith('/admin/inventory')) return ['Which parts run out first?', 'Why does the HQ core lifter run out so fast?', 'What stock is sitting idle?', 'What do we need to order this week?']
  if (path.startsWith('/admin/contractors')) return ['Compare my contractors', 'Why is CQ-01 slower than RIG-003?', 'Which contractor bills are above the record?']
  if (path.startsWith('/admin/logs/maintenance')) return ['Which rigs are due a service?', 'Why did CP-02 break down?', 'What does a stopped day cost?']
  if (path.startsWith('/admin/pulse')) return ['What are the sensors telling me?', 'Why is RIG-002 water pressure up?', 'Do the sensors agree with the shift logs?', 'Which rigs are drilling right now?']
  if (path.startsWith('/admin/logs/drill')) return ['Which shifts look copied?', 'Which shifts are missing?', 'Who are my fastest drillers?']
  if (path.startsWith('/admin/projects')) return ['When will DH-013 finish?', 'Which holes cannot be billed?', 'When do the planned holes run out?']
  if (path.startsWith('/admin/intelligence') || path.startsWith('/admin/analytics')) return ['How will this month close?', 'Why did cost per metre change this month?', 'Which rig is best in very hard ground?', 'What are the biggest risks?']
  if (path.startsWith('/admin/tenders')) return ['What does a metre cost me in hard ground?', 'Which rig is best in very hard ground?', 'How will this month close?']
  return ['What needs me today?', 'Why did cost per metre change this month?', 'How will this month close?', 'Which parts run out first?']
}

export function ask(question: string, c: AiCtx): Answer {
  const q = question.toLowerCase().replace(/[’']/g, "'").trim()
  const rigs = rigsIn(question).filter(r => c.costing.shiftLogs.some(l => l.rig === r))
  const holes = holesIn(question).filter(h => c.costing.shiftLogs.some(l => l.holeNumber === h))
  const ground = GROUNDS.find(g => q.includes(g))
  try {
    const task = c.inbox.open.find(u => q.includes(u.title.toLowerCase().replace(/\.$/, '')))
    if (task && !has(q, 'draft', 'write')) return taskAnswer(task, c)
    if (has(q, 'brief', 'summary', 'summarise', 'summarize', 'how are we doing', 'how is it going', 'overview')) return briefAnswer(c, has(q, 'week'))
    if (has(q, 'reply') && has(q, 'standby')) return standbyReply(c)
    if (has(q, 'draft', 'write', 'reply', 'message', 'email', 'remind')) return draftAnswer(q, c, rigs, holes)
    if (has(q, 'sensor', 'pulse', 'alarm', 'drilling right now', 'live sensor', 'water pressure', 'water flow', 'torque', 'engine temp', 'running hot', 'overheat', 'idling')) return sensorAnswer(q, c, rigs)
    if (has(q, 'need me', 'needs me', 'should i do', 'to do today', 'priorit', 'urgent', 'act on', 'my tasks', 'what first')) return todayAnswer(c)
    if (has(q, 'cost per metre', 'cost a metre', 'cost/m', 'cpm', 'cost per meter') || (has(q, 'cost') && has(q, 'metre', 'meter'))) return rigs.length ? rigAnswer(rigs[0], c) : costAnswer(c, has(q, 'why', 'change', 'up', 'rise', 'went', 'increase', 'drop'), ground)
    if (has(q, 'why') && rigs.length >= 1 && has(q, 'slow', 'faster', 'slower', 'behind')) return slowAnswer(rigs, c)
    if (has(q, 'best', 'fastest', 'quickest', 'top') && has(q, 'rig')) return rigRank(c, ground, false)
    if (has(q, 'worst', 'slowest') && has(q, 'rig')) return rigRank(c, ground, true)
    if (has(q, 'driller', 'crew')) return drillerAnswer(c, has(q, 'tired', 'fatigue', 'rest', 'day off'))
    if (has(q, 'contractor')) return contractorAnswer(c)
    if (holes.length) return holeAnswer(holes[0], c)
    if (has(q, 'planned holes', 'holes run out', 'next holes', 'idle rig', 'run out of holes')) return idleAnswer(c)
    if (has(q, 'cannot be billed', "can't be billed", 'cant be billed', 'not billed', 'blocked')) return blockedAnswer(c)
    if (has(q, 'stopped day', 'day stopped', 'downtime cost', 'cost of a stop')) return stopCostAnswer(c)
    if (has(q, 'part', 'stock', 'store', 'run out', 'runs out', 'order', 'bit', 'lifter', 'casing', 'rod', 'idle stock', 'sitting')) return partsAnswer(q, c)
    if (has(q, 'invoice', 'overdue', 'cash', 'paid', 'payment', 'bill', 'not yet cash', 'money waiting', 'receivable')) return cashAnswer(c, has(q, 'contractor'))
    if (has(q, 'standby')) return standbyAnswer(c)
    if (has(q, 'service', 'maintenance', 'breakdown', 'broke', 'repair', 'stopped day', 'stop costs')) return rigs.length ? rigAnswer(rigs[0], c, true) : serviceAnswer(c)
    if (has(q, 'fuel', 'diesel')) return fuelAnswer(c, rigs[0])
    if (has(q, 'forecast', 'month end', 'close', 'next month', 'this month', 'finish', 'will we', 'heading')) return monthAnswer(c)
    if (has(q, 'risk', 'go wrong', 'worry')) return riskAnswer(c)
    if (has(q, 'core', 'recovery', 'rqd')) return coreAnswer(c)
    if (has(q, 'copied', 'copy', 'missing shift', 'missing', 'not logged')) return logAnswer(c)
    if (has(q, 'metres', 'meters', 'drilled', 'how much', 'how many m')) return rigs.length ? rigAnswer(rigs[0], c) : metresAnswer(c)
    if (rigs.length) return rigAnswer(rigs[0], c)
  } catch { /* fall through to the honest answer */ }
  return {
    understood: false,
    text: ['I could not match that to your record. In this demo I answer about rigs, holes, drillers, parts, money, the month ahead and the tasks, and I can draft messages.'],
    sources: [], followups: ['What needs me today?', 'Why did cost per metre change this month?', 'Which parts run out first?', 'Draft a reply to the client about standby'],
  }
}

/* ── answers ────────────────────────────────────────────────────────────── */

function briefAnswer(c: AiCtx, week: boolean): Answer {
  const b = week ? weeklyBrief(c) : dailyBrief(c)
  return { understood: true, text: [`**${b.title}**`, ...b.lines.map(l => l.text)], sources: b.sources, followups: week ? ['What needs me today?', 'How will this month close?'] : ['Give me the weekly brief', 'Why did cost per metre change this month?'] }
}

function todayAnswer(c: AiCtx): Answer {
  const act = c.inbox.open.filter(u => u.severity === 'act').sort((a, b) => (b.money ?? 0) - (a.money ?? 0))
  const top = act.slice(0, 5)
  return {
    understood: true,
    text: [`**${plural(act.length, 'task is', 'tasks are')} marked act now**, with ${moneyL(act.reduce((s, u) => s + (u.money ?? 0), 0))} at stake. By money, start with:`],
    table: { cols: ['Task', 'Owner', 'At stake'], rows: top.map(u => [u.title, u.owner, u.money ? moneyL(u.money) : '—']) },
    sources: [{ label: 'Tasks', href: '/admin/tasks?dept=all' }],
    followups: top[0] ? [`Why: ${top[0].title}`.slice(0, 80), 'Give me the morning brief'] : ['Give me the morning brief'],
  }
}

function costAnswer(c: AiCtx, why: boolean, ground?: string): Answer {
  if (ground) {
    const g = ground === 'very hard' ? 'Very Hard' : ground[0].toUpperCase() + ground.slice(1)
    const t = companyToday(c.costing, c.inv, c.today)
    const logs = shifts(c, l => normFormation(l.formationType) === g && l.date >= addDays(c.today, -59))
    const rows = Array.from(new Set(logs.map(l => l.rig))).map(r => ({ r, rop: ropIn(logs.filter(l => l.rig === r), g) })).filter(x => x.rop != null).sort((a, b) => b.rop! - a.rop!)
    return {
      understood: true,
      text: [`In ${ground} ground over the last 60 days your rigs made ${list(rows.map(x => `${x.r} ${x.rop!.toFixed(2)} m/h`))}. A rig-day costs the same in any ground, so the slower the metres, the dearer each one is.`, `For a quote in ${ground} ground, use **Tenders → Price a tender**: it prices from what your own metres in that ground really cost.`],
      sources: [{ label: 'Tenders', href: '/admin/tenders' }, { label: 'Operations analytics', href: '/admin/analytics/operation' }],
      followups: [`Which rig is best in ${ground} ground?`, 'Why did cost per metre change this month?'],
      table: t.rigs.length ? { cols: ['Rig', 'Cost a metre this month'], rows: t.rigs.filter(r => r.monthCpm != null).map(r => [r.rig, perUnit(r.monthCpm)]) } : undefined,
    }
  }
  const w = costWhy(c)
  if (!w) return { understood: true, text: ['There are not enough costed metres this month and last to compare yet.'], sources: [], followups: [] }
  const t = companyToday(c.costing, c.inv, c.today)
  return {
    understood: true, text: why ? [w.headline, ...w.why.map(x => `• ${x.text}`)] : [w.headline],
    table: { cols: ['Rig', 'Cost a metre, month', 'Metres, month'], rows: t.rigs.filter(r => r.monthCpm != null).sort((a, b) => (b.monthCpm ?? 0) - (a.monthCpm ?? 0)).map(r => [r.contractor ? `${r.rig} (${r.contractor})` : r.rig, perUnit(r.monthCpm), n0(r.monthMetres)]) },
    sources: [{ label: 'Finance & billing', href: '/admin/finance' }, { label: 'Outlook: why margin moves', href: '/admin/intelligence/months#drivers' }],
    followups: why ? ['Which rig is best in very hard ground?', 'How will this month close?'] : ['Why did cost per metre change this month?'],
  }
}

function slowAnswer(rigs: string[], c: AiCtx): Answer {
  const u = c.inbox.open.find(x => x.id === 'operations:30d:rop' && rigs.every(r => x.title.includes(r)))
  const fake = u ?? { ...c.inbox.open[0], id: 'operations:30d:rop', title: `${rigs[0]} drills slower than ${rigs[1] ?? 'the fleet'}`, items: [{ ...c.inbox.open[0].items[0], id: 'operations:30d:rop', title: `${rigs[0]} drills slower than ${rigs[1] ?? 'the fleet'}` }] }
  const e = explain(fake, c)
  return { understood: true, text: [`**${fake.title}.** What the record shows:`, ...e.why.map(w => `• ${w.text}`)], sources: e.sources, draft: e.draft, followups: [`Tell me about ${rigs[0]}`, 'Which rig is best in very hard ground?'] }
}

function rigRank(c: AiCtx, ground: string | undefined, worst: boolean): Answer {
  const g = ground ? (ground === 'very hard' ? 'Very Hard' : ground[0].toUpperCase() + ground.slice(1)) : null
  const since = addDays(c.today, -59)
  const names = Array.from(new Set(shifts(c, l => l.date >= since).map(l => l.rig)))
  const rows = names.map(r => {
    const ls = shifts(c, l => l.rig === r && l.date >= since)
    const p = pace(ls)
    return { r, rop: g ? ropIn(ls, g) : (p.drill >= 6 ? p.rop : null), perDay: p.perDay, metres: g ? ls.filter(l => normFormation(l.formationType) === g).reduce((s, l) => s + l.metresDrilled, 0) : p.metres }
  }).filter(x => x.rop != null).sort((a, b) => worst ? a.rop! - b.rop! : b.rop! - a.rop!)
  if (!rows.length) return { understood: true, text: [`No rig has enough hours in ${ground ?? 'any'} ground in the last 60 days to compare.`], sources: [], followups: [] }
  const top = rows[0]
  return {
    understood: true,
    text: [`**${top.r} is the ${worst ? 'slowest' : 'fastest'}${ground ? ` in ${ground} ground` : ''}**: ${top.rop!.toFixed(2)} m for every hour the bit is on bottom over the last 60 days${rows[1] ? `, against ${rows[1].rop!.toFixed(2)} for ${rows[1].r}` : ''}. Speed is measured on bottom, so stops and moves do not blur it.`],
    table: { cols: ['Rig', 'm an hour on bottom', `Metres${ground ? ` in ${ground}` : ''}`], rows: rows.map(x => [x.r, x.rop!.toFixed(2), n0(x.metres)]) },
    sources: [{ label: 'Operations analytics', href: '/admin/analytics/operation' }],
    followups: [rows[1] ? `Why is ${rows[rows.length - 1].r} slower than ${rows[0].r}?` : 'Who are my fastest drillers?', 'What does a metre cost me in hard ground?'],
  }
}

function drillerAnswer(c: AiCtx, fatigue: boolean): Answer {
  if (fatigue) {
    const u = c.inbox.open.find(x => x.subject === 'crew:fatigue')
    if (u) { const e = explain(u, c); return { understood: true, text: [`**${u.title}.**`, ...e.why.map(w => `• ${w.text}`)], sources: e.sources, draft: e.draft, followups: ['Who are my fastest drillers?'] } }
  }
  const since = addDays(c.today, -29)
  const ls = shifts(c, l => l.date >= since && !!l.driller)
  const rows = Array.from(new Set(ls.map(l => l.driller as string))).map(d => {
    const mine = ls.filter(l => l.driller === d); const p = pace(mine)
    return { d, rig: mine[mine.length - 1]?.rig ?? '', rop: p.rop, own: p.own / Math.max(1, mine.length), shifts: mine.length }
  }).filter(x => x.shifts >= 5).sort((a, b) => b.rop - a.rop)
  return {
    understood: true,
    text: [`Over the last 30 days **${rows[0]?.d} is fastest** at ${rows[0]?.rop.toFixed(2)} m an hour on bottom, and ${rows[rows.length - 1]?.d} slowest at ${rows[rows.length - 1]?.rop.toFixed(2)}. Ground and rig differ between them, so compare drillers on the same rig before acting.`],
    table: { cols: ['Driller', 'Rig', 'm an hour', 'Own stop h a shift', 'Shifts'], rows: rows.map(x => [x.d, x.rig, x.rop.toFixed(2), n1(x.own), n0(x.shifts)]) },
    sources: [{ label: 'Drillers and crew', href: '/admin/analytics/driller-crew' }],
    followups: ['Which drillers need a day off?', 'Which rig is best in very hard ground?'],
  }
}

function contractorAnswer(c: AiCtx): Answer {
  const t = companyToday(c.costing, c.inv, c.today)
  const bills = c.inbox.open.filter(u => u.id.startsWith('live:ctr_bill_') || u.id.startsWith('live:ctr_late_'))
  return {
    understood: true,
    text: [`${plural(t.contractors.length, 'contractor')} working for you this month.`, ...bills.map(u => `• ${u.title}${u.money ? ` (${moneyL(u.money)})` : ''}.`)],
    table: { cols: ['Contractor', 'Rigs', 'Metres, month', 'Cost a metre'], rows: t.contractors.map(x => [x.name, x.rigs.join(', '), n0(x.monthMetres), perUnit(x.cpm)]) },
    sources: [{ label: 'Contractors', href: '/admin/contractors' }],
    followups: ['Why is CQ-01 slower than RIG-003?', 'Which contractor bills are above the record?'],
  }
}

function holeAnswer(hole: string, c: AiCtx): Answer {
  const h = holesFromLogs(c.costing).find(x => x.id === hole)
  const f = c.forecast.holeFinish.find(x => x.hole === hole)
  if (!h) return { understood: true, text: [`I found no shifts on ${hole}.`], sources: [], followups: [] }
  const text = [`**${hole}** on ${h.rig}, ${h.project}: ${n0(h.drilled)}${h.planned ? ` of ${n0(h.planned)}` : ''} m drilled, core recovery ${pct(h.recoveryPct)}, status ${h.status}. Worth ${moneyL(h.value)} at the contract rates so far.`]
  if (f?.finish) text.push(`At ${h.rig}'s ${n1(f.perDay)} m a day it reaches planned depth about **${dw(f.finish)}** (between ${dw(f.earliest)} at its best and ${dw(f.latest)} at its slowest month), worth ${moneyL(f.valueAtFinish)} when closed.`)
  const mix = groundMix(shifts(c, l => l.holeNumber === hole))
  if (mix.length) text.push(`Ground so far: ${list(mix.map(m => `${m.g.toLowerCase()} ${pct(m.share * 100)}`))}.`)
  const tasks = c.inbox.open.filter(u => u.title.includes(hole) || u.items.some(i => i.title.includes(hole)))
  tasks.forEach(u => text.push(`• Open task: ${u.title}.`))
  return { understood: true, text, sources: [{ label: `${hole}`, href: `/admin/geology/holes/${hole}` }, { label: 'Projects & holes', href: '/admin/projects' }], followups: [`Tell me about ${h.rig}`, 'Which holes cannot be billed?'] }
}

function partsAnswer(q: string, c: AiCtx): Answer {
  if (has(q, 'idle', 'sitting', 'not moving', 'stranded')) {
    const idle = c.inbox.open.filter(u => u.tags.includes('Idle') || u.tags.includes('Stranded'))
    return { understood: true, text: [`**${moneyL(idle.reduce((s, u) => s + (u.money ?? 0), 0))} of stock is not moving**, in ${plural(idle.length, 'line')}. Each one is a task with a drafted transfer to where the part is used.`], table: { cols: ['Part', 'Value'], rows: idle.map(u => [u.title.replace(/ is (sitting|stranded).*/, ''), moneyL(u.money ?? 0)]) }, sources: [{ label: 'Parts & inventory', href: '/admin/inventory' }], followups: ['Which parts run out first?'] }
  }
  const named = c.inv.catalogue.find(p => q.includes(p.name.toLowerCase()) || p.name.toLowerCase().split(' ').filter(w => w.length > 3).every(w => q.includes(w)))
  const u = named ? c.inbox.open.find(x => x.subject === `part:${named.id}` || x.items.some(i => i.ref?.itemId === named.id)) : undefined
  if (u && (has(q, 'why') || named)) {
    const e = explain(u, c)
    return { understood: true, text: [`**${u.title}.**`, ...e.why.map(w => `• ${w.text}`)], sources: e.sources, draft: e.draft, followups: ['Which parts run out first?', 'What stock is sitting idle?'] }
  }
  const needs = c.forecast.parts.filter(p => p.status !== 'covered').sort((a, b) => (a.runOut ?? '9').localeCompare(b.runOut ?? '9'))
  return {
    understood: true,
    text: [`**${plural(needs.length, 'part runs', 'parts run')} out before an order placed today can arrive**, at each rig's pace and the life the ground really gives. Ordering them now costs ${moneyL(needs.reduce((s, p) => s + p.spend, 0))}.`],
    table: { cols: ['Part', 'Store empty', 'Order by', 'To order'], rows: needs.map(p => [p.part.name, p.runOut ? dw(p.runOut) : 'now', p.orderBy ? (p.orderBy < c.today ? `${dw(p.orderBy)} (passed)` : dw(p.orderBy)) : '—', n0(p.toOrder)]) },
    sources: [{ label: 'Parts & inventory', href: '/admin/inventory' }, { label: 'Outlook: parts to order', href: '/admin/intelligence/months' }],
    followups: [needs[0] ? `Why does the ${needs[0].part.name} run out so fast?` : 'What stock is sitting idle?', 'What stock is sitting idle?'],
  }
}

function cashAnswer(c: AiCtx, contractor: boolean): Answer {
  if (contractor) {
    const b = c.inbox.open.filter(u => u.id.startsWith('live:ctr_bill_'))
    return { understood: true, text: b.length ? b.map(u => `• ${u.title}: ${u.detail}`) : ['No contractor bill is waiting above the checked record.'], sources: [{ label: 'Contractors', href: '/admin/contractors' }], followups: ['Compare my contractors'] }
  }
  const f = c.forecast.cash
  const over = c.costing.invoices.filter(i => isOverdue(i, c.today))
  return {
    understood: true,
    text: [`**${moneyL(f.overdue + f.readyToInvoice + f.notApproved)} of work done is not yet cash.** ${moneyL(f.overdue)} is overdue, ${moneyL(f.readyToInvoice)} is approved but not invoiced, and ${moneyL(f.notApproved)} waits for the client's approval. ${moneyL(f.dueNext)} more falls due in the next 30 days.`],
    table: over.length ? { cols: ['Invoice', 'Client', 'Due', 'Outstanding'], rows: over.map(i => [i.number, i.client, dw(i.dueDate), money(outstanding(i))]) } : undefined,
    sources: [{ label: 'Finance & billing', href: '/admin/finance' }, { label: 'Money checks', href: '/admin/intelligence/money' }],
    followups: over[0] ? [`Draft a payment reminder for ${over[0].number}`, 'How much standby is on no invoice?'] : ['How much standby is on no invoice?'],
  }
}

function standbyAnswer(c: AiCtx): Answer {
  const days = standbyLedger(c.costing, c.inv).days
  const loose = days.filter(d => d.state === 'not-on-hole')
  const total = days.reduce((s, d) => s + d.earned, 0)
  return {
    understood: true,
    text: [`The client stopped your rigs on **${plural(days.length, 'day')}**, worth ${moneyL(total)} at the contract's standby rate. ${loose.length ? `${plural(loose.length, 'day')} (${moneyL(loose.reduce((s, d) => s + d.earned, 0))}) ${loose.length === 1 ? 'was' : 'were'} on no hole, so on no invoice yet.` : 'Every day is on a hole, so on an invoice.'}`],
    sources: [{ label: 'Money checks', href: '/admin/intelligence/money' }],
    followups: ['Draft a reply to the client about standby', 'How much work is not yet cash?'],
  }
}

function serviceAnswer(c: AiCtx): Answer {
  const svc = c.inbox.open.filter(u => u.tags.includes('Service due'))
  const bds = (c.costing.maintenance ?? []).filter(m => m.maintenanceType === 'Breakdown' && m.date >= addDays(c.today, -29))
  return {
    understood: true,
    text: [svc.length ? `**${plural(svc.length, 'rig is', 'rigs are')} past the 250-hour service:** ${list(svc.map(u => u.title))}.` : 'No rig is past its service.', bds.length ? `${plural(bds.length, 'breakdown')} in 30 days: ${list(bds.map(b => `${b.rig} ${b.component.toLowerCase()} on ${dw(b.date)} (${n1(b.hours)} h)`))}.` : 'No breakdown in 30 days.'],
    sources: [{ label: 'Maintenance', href: '/admin/logs/maintenance' }],
    followups: svc[0] ? [`Tell me about ${svc[0].title.split(':')[0]}`, 'What does a stopped day cost?'] : ['What does a stopped day cost?'],
  }
}

function fuelAnswer(c: AiCtx, rig?: string): Answer {
  const since = addDays(c.today, -29)
  const names = Array.from(new Set(shifts(c, l => !l.contractor && l.date >= since && l.fuelLitres > 0).map(l => l.rig)))
  const rows = names.map(r => { const p = pace(rigShifts(c, r)); return { r, lpm: p.fuelPerMetre, rop: p.rop } }).sort((a, b) => b.lpm - a.lpm)
  const u = c.inbox.open.find(x => x.id === 'finance:30d:fuel' || x.id.startsWith('finance:fuel-engine:'))
  const e = u ? explain(u, c) : null
  return {
    understood: true,
    text: [`Fuel a metre on your own rigs over 30 days: ${list(rows.map(x => `${x.r} ${n1(x.lpm)} L`))}.`, ...(e && (!rig || u!.title.includes(rig)) ? e.why.map(w => `• ${w.text}`) : [])],
    sources: [{ label: 'Consumables analytics', href: '/admin/analytics/consumables' }], followups: ['Why did cost per metre change this month?'],
  }
}

function monthAnswer(c: AiCtx): Answer {
  const f = c.forecast
  const name = monthLabel(monthOf(c.today)).split(' ')[0], next = monthLabel(f.nextMonth).split(' ')[0]
  return {
    understood: true,
    text: [
      `**${name} should close at about ${n0(f.thisMonthTotal.metres)} m and a ${moneyL(f.thisMonthTotal.margin)} margin** (${pct(f.thisMonthTotal.marginPct)}), between ${n0(f.thisMonthTotal.low)} m if every rig drills at its slowest month and ${n0(f.thisMonthTotal.high)} m at its best.`,
      `**${next}: ${n0(f.next.metres)} m and ${moneyL(f.next.margin)}** at today's pace${f.next.idleDays ? `, with ${plural(f.next.idleDays, 'rig-day')} idle unless the client releases more holes` : ''}.`,
      `This is each rig's last-30-day pace walked forward over the holes planned, at the contract rates. Outlook shows how close the same method came in past weeks.`,
    ],
    table: { cols: ['Rig', 'm a day', 'Rest of month', next], rows: f.rigs.map(r => [r.rig, n1(r.perDay), n0(r.rest.metres), n0(r.next.metres)]) },
    sources: [{ label: 'Outlook', href: '/admin/intelligence/months' }], followups: ['What are the biggest risks?', 'When do the planned holes run out?'],
  }
}

function riskAnswer(c: AiCtx): Answer {
  const r = c.inbox.open.filter(u => u.items.some(i => i.id.startsWith('risk:'))).slice(0, 6)
  return { understood: true, text: [`**${plural(r.length, 'risk')} from the forecast are in your tasks**, most pressing first:`], table: { cols: ['Risk', 'Priority', 'At stake'], rows: r.map(u => [u.title, u.severity === 'act' ? 'Act now' : u.severity === 'plan' ? 'Plan for it' : 'Watch', u.money ? moneyL(u.money) : '—']) }, sources: [{ label: 'Risk map', href: '/admin/intelligence/risks' }, { label: 'Tasks', href: '/admin/tasks?dept=all' }], followups: ['How will this month close?'] }
}

function coreAnswer(c: AiCtx): Answer {
  const since = addDays(c.today, -29)
  const names = Array.from(new Set(shifts(c, l => l.date >= since && l.metresDrilled > 0).map(l => l.rig)))
  const rows = names.map(r => ({ r, rec: pace(rigShifts(c, r)).recovery })).sort((a, b) => a.rec - b.rec)
  const geo = c.inbox.open.filter(u => u.dept === 'geology')
  return { understood: true, text: [`Core recovery in the drill logs over 30 days: ${list(rows.map(x => `${x.r} ${pct(x.rec)}`))}.`, ...geo.map(u => `• ${u.title}.`)], sources: [{ label: 'Geology', href: '/admin/geology' }], followups: ['Which shifts look copied?'] }
}

function logAnswer(c: AiCtx): Answer {
  const u = c.inbox.open.filter(x => x.dept === 'data')
  return { understood: true, text: u.length ? u.map(x => `• **${x.title}.** ${x.detail}`) : ['Every shift is in and nothing looks copied.'], sources: [{ label: 'Drill log check', href: '/admin/intelligence/drill-logs' }], followups: ['Draft a message to the supervisors about copied shifts'] }
}

function metresAnswer(c: AiCtx): Answer {
  const t = companyToday(c.costing, c.inv, c.today)
  const f = c.forecast
  return { understood: true, text: [`**${n0(t.today.metres)} m today** on ${t.today.rigsActive} rigs, **${n0(f.mtd.metres)} m this month** so far, heading for ${n0(f.thisMonthTotal.metres)} m.`], table: { cols: ['Rig', 'Today', 'This month'], rows: t.rigs.map(r => [r.rig, n0(r.metresToday), n0(r.monthMetres)]) }, sources: [{ label: 'Dashboard', href: '/admin/dashboard' }], followups: ['How will this month close?'] }
}

function rigAnswer(rig: string, c: AiCtx, maint = false): Answer {
  const t = companyToday(c.costing, c.inv, c.today).rigs.find(r => r.rig === rig)
  const p = pace(rigShifts(c, rig))
  const r = c.forecast.rigs.find(x => x.rig === rig)
  const own = stops(rigShifts(c, rig), 'own')[0]
  const tasks = c.inbox.open.filter(u => u.title.includes(rig) || u.items.some(i => i.rig === rig))
  const text = [
    `**${rig}**${t ? ` on ${t.project}${t.hole ? `, drilling ${t.hole}` : ''}${t.contractor ? ` (${t.contractor})` : ''}` : ''}: ${n0(p.metres)} m in 30 days, ${n1(p.perDay)} m a day, ${p.rop.toFixed(2)} m an hour on bottom, core ${pct(p.recovery)}${t?.monthCpm != null ? `, ${perUnit(t.monthCpm)} this month` : ''}.`,
  ]
  if (own) text.push(`Its biggest own stop is "${own.reason}", ${n1(own.hours)} h in 30 days.`)
  if (r?.lastHoleEnds) text.push(`Planned work runs to about ${dw(r.lastHoleEnds)}.`)
  if (maint) { const m = (c.costing.maintenance ?? []).filter(x => x.rig === rig).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3); m.forEach(x => text.push(`• ${dw(x.date)}: ${x.maintenanceType.toLowerCase()}, ${x.component} (${n1(x.hours)} h).`)) }
  tasks.slice(0, 4).forEach(u => text.push(`• Open task: ${u.title}.`))
  const sup = supervisorOf(c, rig)
  return { understood: true, text, sources: [{ label: 'Rigs', href: '/admin/rigs' }, { label: 'Drill logs', href: '/admin/logs/drill' }], followups: [`Which rig is best in very hard ground?`, sup ? `Draft a message to ${sup} about ${rig}` : 'What needs me today?'] }
}

function draftAnswer(q: string, c: AiCtx, rigs: string[], holes: string[]): Answer {
  // A draft for something that is already a task: use the task's own draft.
  const pick = c.inbox.open.find(u => {
    const t = `${u.title} ${u.detail}`.toLowerCase()
    if (has(q, 'standby')) return u.id.startsWith('billing:standby-loose')
    if (has(q, 'payment', 'overdue', 'reminder for inv', 'inv-')) return u.id.startsWith('live:od_')
    if (has(q, 'copied', 'copy')) return u.id.startsWith('data:warn:copy')
    if (has(q, 'supplier', 'late order', 'chase')) return u.tags.includes('Late')
    if (has(q, 'next holes', 'holes run out', 'idle', 'request')) return u.id.startsWith('risk:idle_')
    if (has(q, 'contractor')) return u.id.startsWith('live:ctr_')
    if (has(q, 'rest', 'fatigue', 'day off', 'rota')) return u.subject === 'crew:fatigue'
    if (rigs.length) return t.includes(rigs[0].toLowerCase())
    if (holes.length) return t.includes(holes[0].toLowerCase())
    return false
  })
  if (pick) {
    const e = explain(pick, c)
    if (e.draft) return { understood: true, text: [`Here is a draft for **${pick.title}**. ${e.why[0]?.text ?? ''}`, 'Approve it from the task, or copy it from here.'], draft: e.draft, sources: [{ label: 'Open the task', href: `/admin/tasks?dept=all&open=${encodeURIComponent(pick.id)}` }], followups: ['What needs me today?'] }
  }
  if (has(q, 'standby')) return standbyReply(c)
  return { understood: false, text: ['Tell me who the message is for and what it is about, for example "Draft a payment reminder for INV-0002" or "Draft a message to the supervisors about copied shifts".'], sources: [], followups: ['Draft a payment reminder for INV-0002', 'Draft a reply to the client about standby'] }
}

function standbyReply(c: AiCtx): Answer {
  {
    const days = standbyLedger(c.costing, c.inv).days.slice(-8)
    const client = c.costing.projects[0]?.client ?? 'the client'
    return {
      understood: true, text: ['A reply to the client explaining the standby, with the days and hours from the shift logs:'],
      draft: { kind: 'email', to: client, via: 'Email', subject: 'Standby charges: the days and the reasons', body: `Dear ${client},\n\nThank you for your question on the standby charges. Each day below is from the signed shift log: the rig was ready to drill and held at your site's request.\n\n${days.map(d => `• ${d.rig}, ${dw(d.date)}: ${n1(d.hours)} h, ${d.reasons || 'waiting for instruction'}`).join('\n')}\n\nThe contract's standby rate applies to these hours. The shift logs are in your XPLORIX portal, and we are happy to go through any day with your site team.\n\nRegards,\nOperations`, approve: 'Copy draft', done: 'Standby reply drafted' },
      sources: [{ label: 'Money checks', href: '/admin/intelligence/money' }], followups: ['How much standby is on no invoice?'],
    }
  }
}

function taskAnswer(u: InboxUnit, c: AiCtx): Answer {
  const e = explain(u, c)
  return { understood: true, text: [`**${u.title}.**`, ...e.why.map(w => `• ${w.text}`), e.draft ? `I have drafted the next step: ${e.draft.via.toLowerCase()} to ${e.draft.to}.` : ''].filter(Boolean), draft: e.draft, sources: [...e.sources, { label: 'Open the task', href: `/admin/tasks?dept=all&open=${encodeURIComponent(u.id)}` }], followups: ['What needs me today?'] }
}

function idleAnswer(c: AiCtx): Answer {
  const r = c.forecast.rigs.filter(x => x.lastHoleEnds).sort((a, b) => (a.lastHoleEnds ?? '').localeCompare(b.lastHoleEnds ?? ''))
  const idle = c.inbox.open.filter(u => u.id.startsWith('risk:idle_'))
  return {
    understood: true,
    text: [`The first rig to run out of planned holes is **${r[0]?.rig}, about ${dw(r[0]?.lastHoleEnds)}**. ${plural(c.forecast.byProject.reduce((s, p) => s + p.idleDays, 0), 'rig-day')} have no hole to drill before the end of ${monthLabel(c.forecast.nextMonth).split(' ')[0]}.`, ...idle.map(u => `• ${u.title}: a request to the client for the next holes is drafted on the task.`)],
    table: { cols: ['Rig', 'Project', 'Last planned hole ends'], rows: r.map(x => [x.rig, x.project, dw(x.lastHoleEnds)]) },
    sources: [{ label: 'Outlook', href: '/admin/intelligence/months' }], followups: ['Draft a request to the client for the next holes', 'How will this month close?'],
  }
}

function blockedAnswer(c: AiCtx): Answer {
  const u = c.inbox.open.filter(x => x.id === 'risk:stuck' || x.id.startsWith('billing:holes-blocked') || x.id === 'live:tosend' || x.id.startsWith('live:ret_'))
  return { understood: true, text: u.length ? [`**${plural(u.length, 'thing holds', 'things hold')} holes back from billing:**`, ...u.map(x => `• ${x.title}${x.money ? ` (${moneyL(x.money)})` : ''}. ${explain(x, c).why[0]?.text ?? ''}`)] : ['Every closed hole can be billed.'], sources: [{ label: 'Finance & billing', href: '/admin/finance' }], followups: ['How much work is not yet cash?'] }
}

function stopCostAnswer(c: AiCtx): Answer {
  const rows = c.forecast.rigs.map(r => ({ r: r.rig, l: dayLoss(c, r.rig) })).filter(x => x.l).sort((a, b) => b.l!.money - a.l!.money)
  return { understood: true, text: ['A stopped day costs each rig the metres it would have made at the rate the contract pays for them, on top of its crew and hire, which run whether it drills or not:'], table: { cols: ['Rig', 'Metres a day', 'Billing lost a day'], rows: rows.map(x => [x.r, n1(x.l!.metres), moneyL(x.l!.money)]) }, sources: [{ label: 'Outlook', href: '/admin/intelligence/months' }], followups: ['Which rigs are due a service?'] }
}

export const contractorLabel = (c: AiCtx, id?: string) => contractorName(c.costing, id)

/* XPLORIX Pulse: the simulated rig sensors, read at the last reading. */
function sensorAnswer(q: string, c: AiCtx, rigs: string[]): Answer {
  const fleet = buildFleet(computeOverview(c.costing, c.inv).rigs)
  const t = OPEN_AT
  const al = sensorAlarms(fleet, t)
  const sources = [{ label: 'Pulse · live sensors', href: '/admin/pulse' }]
  const note = 'Pulse runs on a simulated sensor feed until rigs are fitted with sensors.'
  if (has(q, 'agree', 'log', 'match', 'against')) {
    const rows = fleet.filter(p => p.logged != null || p.mode === 'drilling').map(p => {
      const s = sensorMetres(p, t)
      return [p.rig, p.logged == null ? '—' : `${n1(p.logged)} m`, `${n1(s)} m`, p.logged == null ? 'Not checked yet' : s - p.logged > Math.max(2, p.logged * 0.06) ? `${n1(s - p.logged)} m not logged` : 'Agrees']
    })
    const off = rows.filter(r => r[3] !== 'Agrees')
    return {
      understood: true,
      text: [off.length ? `**${off.length} of ${rows.length} rigs** do not match their shift log yet: ${list(off.map(r => `${r[0]} (${r[3].toLowerCase()})`))}.` : 'Every rig\'s depth sensor agrees with its shift log.', note],
      table: { cols: ['Rig', 'Log', 'Sensor', 'Check'], rows }, sources, followups: ['What are the sensors telling me?'],
    }
  }
  const one = rigs.map(r => fleet.find(p => p.rig === r)).find(Boolean)
  if (one) {
    const mine = al.filter(a => a.rig === one.rig || a.why.includes(`**${one.rig}**`))
    const r = (k: Parameters<typeof reading>[1]) => reading(one, k, t)
    return {
      understood: true,
      text: [
        `**${one.rig}** at ${clock(t, false)}: ${MODE_LABEL[one.mode].toLowerCase()}${one.mode === 'drilling' ? `, bit at ${n1(depthAt(one, t))} m, ${n1(r('rop') ?? 0)} m/h, water ${n1(r('pressure') ?? 0)} bar and ${n0(r('flow') ?? 0)} L/min, engine ${n0(r('engine') ?? 0)} °C` : ''}.`,
        ...(mine.length ? mine.flatMap(a => [`**${a.title}.** ${a.why}`, `What to do: ${a.todo}`]) : ['Every reading is in its normal range.']),
        note,
      ],
      sources, followups: ['What are the sensors telling me?', 'Do the sensors agree with the shift logs?'],
    }
  }
  const drilling = fleet.filter(p => p.mode === 'drilling')
  const act = al.filter(a => a.level === 'act')
  return {
    understood: true,
    text: [
      `**${drilling.length} of ${fleet.length} rigs drilling** at ${clock(t, false)}. ${al.length ? `${al.length} ${al.length === 1 ? 'alarm' : 'alarms'}, ${act.length} to act on now.` : 'Every reading is in range.'}`,
      ...al.slice(0, 4).map(a => `• **${a.rig}: ${a.title}.** ${a.todo}`),
      note,
    ],
    table: { cols: ['Rig', 'Doing', 'Depth', 'm/h'], rows: fleet.map(p => [p.rig, MODE_LABEL[p.mode], `${n1(depthAt(p, t))} m`, p.mode === 'drilling' ? n1(reading(p, 'rop', t) ?? 0) : '—']) },
    sources, followups: al[0] ? [`Why is ${al[0].rig} ${al[0].key === 'engine' ? 'running hot' : 'water pressure up'}?`, 'Do the sensors agree with the shift logs?'] : ['Do the sensors agree with the shift logs?'],
  }
}
