import { outstanding, type ShiftLog } from '../costing-store'
import { addDays, supplierPerformance } from '../inventory-store'
import { standbyLedger } from '../money-checks'
import { lifeGaps } from '../stock-checks'
import { billFigures, contractorName } from '../contracting'
import { holesFromLogs } from '../client-record'
import type { InboxUnit } from '../inbox'
import type { Finding } from '../findings'
import {
  type AiCtx, type Source, dw, n0, n1, pct, plural, list, daysBetween, moneyL, money, company,
  shifts, rigShifts, groundMix, hardShare, stops, pace, ropIn, dayLoss, supervisorOf, rigsIn, holesIn,
} from './record'

/* ==========================================================================
 * XPLORIX AI — WHY, AND THE NEXT STEP
 *
 * Every task already says what is wrong. This adds the two things a manager
 * would add on reading it:
 *
 *   why    the cause, read from the record: the ground the rig was in, the
 *          stops behind a slow week, the supplier's own record of lateness,
 *          the days the client has taken to pay before. Each line can be
 *          opened to the shifts, orders or invoices it came from.
 *   draft  the next step written out and ready to approve: the purchase
 *          order with its quantity and date, the reminder to the client,
 *          the message to the supervisor, the invoice lines. A person
 *          approves it, edits it or sets it aside. XPLORIX never sends
 *          anything on its own.
 *
 * Each kind of task has its own reasoning below; anything without one gets
 * a careful general answer from its own figures, never an invented one.
 * ========================================================================== */

export interface Why { text: string; href?: string }

export interface Draft {
  kind: 'email' | 'po' | 'invoice' | 'workorder' | 'transfer' | 'note'
  to: string                 // who it goes to, in words
  via: string                // Email, Message, Purchase order…
  subject?: string
  body: string
  table?: { cols: string[]; rows: string[][]; total?: [string, string] }
  approve: string            // the button: "Approve", "Approve order"
  done: string               // kept on the task once approved
}

export interface Explanation {
  why: Why[]
  basis: string              // what the reasoning read, in one line
  sources: Source[]
  draft?: Draft
  confidence: 'High' | 'Medium' | 'Low'
}

const greet = (who: string) => `Dear ${who},`
const sign = () => `\n\nRegards,\nOperations, ${company()}`
const keyOf = (id: string) => id.replace(/^live:/, '')
const has = (u: InboxUnit, p: string | RegExp) => u.items.some(f => typeof p === 'string' ? f.id.startsWith(p) : p.test(f.id))
const item = (u: InboxUnit, p: string) => u.items.find(f => f.id.startsWith(p))

export function explain(u: InboxUnit, c: AiCtx): Explanation {
  const lead = u.items[0]
  const id = lead.id
  try {
    if (id.startsWith('stock:idle_') || id.startsWith('stock:stranded_')) return idleStock(u, c)
    if (id.startsWith('stock:buy-check:')) return buyCheck(u, c)
    if (u.subject.startsWith('part:') || id.startsWith('stock:running_') || id.startsWith('stock:low_') || id.startsWith('stock:late_') || id.startsWith('risk:part_') || id.startsWith('stock:life:') || id.startsWith('stock:30d:stock_')) return part(u, c)
    if (id.startsWith('live:od_')) return overdue(u, c)
    if (id === 'live:ready') return ready(u, c)
    if (id === 'live:tosend') return toSend(u, c)
    if (id === 'risk:stuck') return stuck(u, c)
    if (id.startsWith('billing:standby-loose:')) return standby(u, c)
    if (id.startsWith('billing:rate:') || id.startsWith('live:rr_')) return rates(u, c)
    if (id.startsWith('live:ctr_bill_')) return bill(u, c)
    if (id.startsWith('live:ctr_late_')) return lateWo(u, c)
    if (id === 'live:ctr_reports') return reports(u, c)
    if (id.startsWith('maintenance:service:') || u.subject.startsWith('service:')) return service(u, c)
    if (id === 'maintenance:30d:rig' || id.startsWith('live:bd_')) return breakdown(u, c)
    if (u.subject === 'crew:fatigue' || id.startsWith('crew:fatigue:')) return fatigue(u, c)
    if (id === 'operations:30d:rop' || id.startsWith('live:kpi_')) return slow(u, c)
    if (id === 'finance:30d:fuel' || id.startsWith('finance:fuel-engine:')) return fuel(u, c)
    if (id.startsWith('risk:idle_') || id.startsWith('live:idle_')) return idle(u, c)
    if (id.startsWith('data:warn:copy-of-shift')) return copies(u, c)
    if (id.startsWith('data:missing:') || id.startsWith('live:ns_')) return missing(u, c)
    if (id.startsWith('data:stop:') || id.startsWith('billing:holes-blocked')) return badLog(u, c)
    if (id === 'crew:30d:stops') return crewStops(u, c)
    if (id.startsWith('live:sv_')) return survey(u, c)
    if (id.startsWith('geology:')) return core(u, c)
  } catch { /* a reasoning step that cannot read its figures falls back to the general one */ }
  return general(u, c)
}

/* ── stores ─────────────────────────────────────────────────────────────── */

function part(u: InboxUnit, c: AiCtx): Explanation {
  const ids = u.items.map(f => (f.ref?.itemId as string | undefined) ?? f.id.match(/(?:^|[_|:])(t\d+)(?=$|[_|:])/)?.[1]).filter(Boolean) as string[]
  const itemId = ids.map(x => x.match(/t\d+/)?.[0]).find(Boolean) ?? u.subject.replace('part:', '')
  const p = c.inv.catalogue.find(x => x.id === itemId)
  if (!p) return general(u, c)
  const why: Why[] = []
  const sources: Source[] = [{ label: 'Parts & inventory', href: '/admin/inventory' }]
  // Who wears it, and in what ground.
  const since = addDays(c.today, -29)
  const users: Record<string, { qty: number; logs: ShiftLog[] }> = {}
  shifts(c, l => l.date >= since).forEach(l => (l.partsUsed ?? []).forEach(x => {
    if (x.itemId !== itemId) return
    const e = (users[l.rig] ||= { qty: 0, logs: [] }); e.qty += x.qty ?? 0; e.logs.push(l)
  }))
  const byRig = Object.entries(users).sort((a, b) => b[1].qty - a[1].qty)
  if (byRig.length) {
    const used = byRig.reduce((s, [, v]) => s + v.qty, 0)
    const mix = groundMix(byRig.flatMap(([, v]) => v.logs))[0]
    why.push({ text: `${list(byRig.slice(0, 3).map(([r, v]) => `${r} (${n0(v.qty)})`))} used ${n0(used)} in the last 30 days${mix ? `, ${pct(mix.share * 100)} of it in ${mix.g.toLowerCase()} ground` : ''}.`, href: '/admin/logs/drill' })
  }
  const gap = lifeGaps(c.costing.shiftLogs, c.inv.catalogue).find(g => g.itemId === itemId)
  if (gap) why.push({ text: `It lasts ${n0(gap.observedLife)} m in ${gap.formation.toLowerCase()} ground, not the ${n0(gap.catalogueLife)} m the catalogue assumes, so it wears out ${n1(gap.catalogueLife / Math.max(1, gap.observedLife))}× faster than planned and the store empties sooner than the reorder level expects.`, href: '/admin/inventory' })
  const running = u.items.find(f => f.ref?.runsOutOn)
  const need = c.forecast.parts.find(x => x.part.id === itemId)
  const runOut = (running?.ref?.runsOutOn as string | undefined) ?? need?.runOut
  if (runOut) {
    const arrive = addDays(c.today, p.leadTimeDays)
    why.push({ text: runOut <= c.today
      ? `The store has none now. ${p.supplier} quotes ${p.leadTimeDays} days, so an order placed today arrives about ${dw(arrive)}.`
      : `At this rate the store is empty on ${dw(runOut)}. ${p.supplier} quotes ${p.leadTimeDays} days, so an order placed today arrives about ${dw(arrive)}${arrive > runOut ? `: ${plural(daysBetween(runOut, arrive), 'day')} with none` : ', just in time'}.` })
  }
  const owed = (po: typeof c.inv.pos[number]) => (po.lines.find(l => l.itemId === itemId)?.qty ?? 0) - po.receipts.reduce((a, r) => a + r.lines.filter(l => l.itemId === itemId).reduce((b, l) => b + l.accepted, 0), 0)
  const open = c.inv.pos.filter(po => po.status !== 'draft' && po.status !== 'received' && owed(po) > 0)
  const late = open.filter(po => po.promisedDate && po.promisedDate < c.today)
  const perf = supplierPerformance(c.inv.pos, c.inv.suppliers, p.supplier)
  if (late.length) {
    const po = late[0]
    why.push({ text: `${po.number} from ${po.supplier} was promised for ${dw(po.promisedDate)} and is ${plural(daysBetween(po.promisedDate!, c.today), 'day')} late${perf.avgDelay != null && perf.avgDelay > 0 ? `; this supplier has delivered ${n1(perf.avgDelay)} days late on average` : ''}.` })
  }
  const due = open.find(po => po.promisedDate && po.promisedDate >= c.today)
  if (due) why.push({ text: `${due.number} for ${n0(owed(due))} is promised for ${dw(due.promisedDate)}${perf.onTimePct != null ? `; ${p.supplier} has been on time ${pct(perf.onTimePct)} of the time` : ''}.` })
  const rigOut = u.items.filter(f => /^RIG|^C[PQ]/.test(f.title) && f.title.includes(' 0 left')).map(f => f.title.split(':')[0])
  if (rigOut.length) why.push({ text: `${list(rigOut)} ${rigOut.length === 1 ? 'has' : 'have'} none left on the rig, so the next worn one stops the rig until the store sends more.` })
  const lost = rigOut.map(r => dayLoss(c, r)).filter(Boolean) as { money: number }[]
  if (lost.length) why.push({ text: `A day ${lost.length > 1 ? `with ${lost.length === 2 ? 'both' : 'these'} rigs` : ''} stopped for it costs about ${moneyL(lost.reduce((s, x) => s + x.money, 0))} in metres not drilled.`.replace('day  stopped', 'day stopped') })

  // The next step: chase what is late, otherwise order what the forecast needs.
  let draft: Draft | undefined
  const sup = c.inv.suppliers.find(s => s.name === (late[0]?.supplier ?? p.supplier))
  if (late.length) {
    const po = late[0]
    draft = {
      kind: 'email', to: `${po.supplier}${sup?.contact ? ` (${sup.contact})` : ''}`, via: 'Email',
      subject: `${po.number}: ${p.name} now ${daysBetween(po.promisedDate!, c.today)} days late`,
      body: `${greet(sup?.contact || po.supplier)}\n\nOur order ${po.number} for ${n0(owed(po))} × ${p.name} was promised for ${dw(po.promisedDate)} and has not arrived. Our rigs are drilling and need it now.\n\nPlease confirm by tomorrow the date it will reach site and the transport details. If it cannot reach us within 7 days, tell us today so we can buy it elsewhere and cancel this line.${sign()}`,
      approve: 'Approve', done: `Chased ${po.supplier} for ${po.number}`,
    }
  } else {
    // The forecast counts wear at the catalogue life; where the ground wears the part faster, order for the real life.
    const base = Math.max(1, need?.toOrder || Math.ceil(need?.need ?? 0) || p.minStock || 1)
    const qty = gap ? Math.ceil(base * gap.catalogueLife / Math.max(1, gap.observedLife)) : base
    draft = {
      kind: 'po', to: p.supplier, via: 'Purchase order',
      subject: `Draft order: ${n0(qty)} × ${p.name}`,
      body: `Needed on site by ${dw(runOut && runOut > c.today ? runOut : addDays(c.today, p.leadTimeDays))}. Quantity is what the next ${plural(Math.max(14, daysBetween(c.today, c.forecast.horizonEnd)), 'day')} of planned metres will wear out${gap ? ` at the life the ground really gives (${n0(gap.observedLife)} m)` : ''}, less what is in the store and on order.`,
      table: { cols: ['Part', 'Qty', 'Rate', 'Amount'], rows: [[`${p.partNumber} · ${p.name}`, n0(qty), money(p.rate), money(qty * p.rate)]], total: ['Total', money(qty * p.rate)] },
      approve: 'Approve order', done: `Order for ${n0(qty)} × ${p.name} approved`,
    }
  }
  return { why: why.length ? why : [{ text: u.detail }], basis: `Read from parts used on every shift, the stores and open orders, and ${p.supplier}'s delivery record.`, sources, draft, confidence: why.length >= 3 ? 'High' : 'Medium' }
}

function idleStock(u: InboxUnit, c: AiCtx): Explanation {
  const itemId = u.items[0].id.match(/t\d+/)?.[0]
  const p = c.inv.catalogue.find(x => x.id === itemId)
  if (!p) return general(u, c)
  const since = addDays(c.today, -59)
  const used: Record<string, number> = {}
  shifts(c, l => l.date >= since).forEach(l => (l.partsUsed ?? []).forEach(x => { if (x.itemId === itemId) used[l.project] = (used[l.project] ?? 0) + (x.qty ?? 0) }))
  const where = Object.entries(used).sort((a, b) => b[1] - a[1])[0]
  const sameSize = shifts(c, l => l.date >= since && (!p.holeSize || l.holeSize === p.holeSize)).length
  const why: Why[] = [
    { text: `None was used on any shift in the last 60 days${p.holeSize ? `, although ${plural(sameSize, `${p.holeSize} shift`)} were drilled` : ''}.` },
    { text: `${moneyL(u.money ?? 0)} is tied up in it; at the catalogue life it covers ${n0(p.lifeMetres)} m a piece.` },
  ]
  if (where) why.push({ text: `${where[0]} is where this part has been used (${n0(where[1])} in 60 days), so that is where it earns its keep.` })
  const to = where?.[0] ?? c.costing.projects.find(x => x.status === 'active')?.name ?? 'a live project'
  return {
    why, basis: 'Read from parts used on every shift and what each store holds.', sources: [{ label: 'Parts & inventory', href: '/admin/inventory' }], confidence: 'Medium',
    draft: { kind: 'transfer', to: `Stores, ${to}`, via: 'Stock transfer', subject: `Move ${p.name} to ${to}`,
      body: `Move the idle ${p.name} to ${to} and issue it there before ordering any more. Nothing new is bought.`,
      table: { cols: ['Part', 'To', 'Value'], rows: [[p.name, to, moneyL(u.money ?? 0)]] }, approve: 'Approve transfer', done: `Transfer of ${p.name} to ${to} approved` },
  }
}

function buyCheck(u: InboxUnit, c: AiCtx): Explanation {
  const f = u.items[0]
  return {
    why: [{ text: f.detail }, { text: `Moving them costs only transport; buying them again spends ${moneyL(f.money ?? 0)} and leaves the closed project's stock to sit.` }],
    basis: 'Read from the draft order and every store’s stock.', sources: [{ label: 'Parts & inventory', href: '/admin/inventory' }], confidence: 'High',
    draft: { kind: 'transfer', to: 'Stores', via: 'Stock transfer', subject: 'Move first, then trim the order', body: `Move the free parts across, then take the same quantity off the order before it goes to the supplier.`, approve: 'Approve transfer', done: 'Transfer approved and order trimmed' },
  }
}

/* ── billing ────────────────────────────────────────────────────────────── */

function overdue(u: InboxUnit, c: AiCtx): Explanation {
  const inv = c.costing.invoices.find(i => i.id === keyOf(u.items[0].id).slice(3))
  if (!inv) return general(u, c)
  const owed = outstanding(inv)
  const late = inv.dueDate ? daysBetween(inv.dueDate, c.today) : 0
  const paid = c.costing.invoices.filter(i => i.client === inv.client && i.paidDate && i.dueDate && i.id !== inv.id)
  const habit = paid.length ? Math.round(paid.reduce((s, i) => s + daysBetween(i.dueDate!, i.paidDate!), 0) / paid.length) : null
  const monthBill = c.forecast.lastMonth.revenue
  const why: Why[] = [
    { text: `${inv.number} for ${moneyL(owed)} went to ${inv.client} on ${dw(inv.date)} and fell due on ${dw(inv.dueDate)}: ${plural(late, 'day')} ago.`, href: '/admin/finance' },
    inv.ownerStatus === 'approved'
      ? { text: `The client approved every line of it in the portal${inv.reviewedAt ? ` on ${dw(inv.reviewedAt.slice(0, 10))}` : ''}, so nothing is in dispute: this is a payment delay, not a query.` }
      : { text: `The client has not yet answered it in the portal, so the delay may be a question about a line.` },
  ]
  if (habit != null) why.push({ text: habit > 0 ? `${inv.client} has paid ${plural(habit, 'day')} after the due date on average before, so this is ${late > habit * 2 ? 'well past' : 'close to'} their usual delay.` : `${inv.client} has paid on time before, so this is unusual for them.` })
  if (monthBill > 0) why.push({ text: `It is ${pct((owed / monthBill) * 100)} of a month's billing, held by the client.` })
  return {
    why, basis: 'Read from the invoice, the client’s answers in the portal and how this client has paid before.', sources: [{ label: inv.number, href: '/admin/finance' }], confidence: 'High',
    draft: {
      kind: 'email', to: `${inv.client}, accounts`, via: 'Email', subject: `Payment reminder: ${inv.number}, ${money(owed)} due ${dw(inv.dueDate)}`,
      body: `${greet(`${inv.client} accounts team`)}\n\nOur invoice ${inv.number} dated ${dw(inv.date)} for ${money(owed)} was due on ${dw(inv.dueDate)}${inv.ownerStatus === 'approved' ? ', and every line of it was approved in the client portal' : ''}. It covers holes ${list(inv.holeNumbers)}.\n\nCould you confirm the date of payment? A statement of account is attached. If anything is holding it, tell us and we will sort it the same day.${sign()}`,
      approve: 'Approve', done: `Payment reminder sent for ${inv.number}`,
    },
  }
}

function ready(u: InboxUnit, c: AiCtx): Explanation {
  const holes = holesFromLogs(c.costing).filter(h => h.status === 'approved' && !h.invoiceId)
  if (!holes.length) return general(u, c)
  const proj = holes[0].project, client = c.costing.projects.find(p => p.name === proj)?.client ?? 'the client'
  const total = holes.reduce((s, h) => s + h.value, 0)
  return {
    why: [
      { text: `${list(holes.map(h => h.id))} ${holes.length === 1 ? 'was' : 'were'} approved by ${client}${holes[0].decidedAt ? ` on ${dw(holes[0].decidedAt.slice(0, 10))}` : ''}; every shift behind ${holes.length === 1 ? 'it' : 'them'} passed XPLORIX's checks.` },
      { text: `Approved but not invoiced, ${moneyL(total)} earns nothing: each week it waits is a week later on the client's payment terms.` },
    ],
    basis: 'Read from the holes’ approvals and the client rates in force on each shift.', sources: [{ label: 'Finance & billing', href: '/admin/finance' }], confidence: 'High',
    draft: { kind: 'invoice', to: client, via: 'Invoice', subject: `Draft invoice: ${list(holes.map(h => h.id))}`,
      body: `Lines priced at the contract rates on the day each metre was drilled.`,
      table: { cols: ['Hole', 'Metres', 'Amount'], rows: holes.map(h => [h.id, n0(h.drilled), money(h.value)]), total: ['Before tax', money(total)] },
      approve: 'Approve invoice', done: `Invoice for ${list(holes.map(h => h.id))} approved` },
  }
}

function toSend(u: InboxUnit, c: AiCtx): Explanation {
  const holes = holesFromLogs(c.costing).filter(h => h.status === 'closed')
  if (!holes.length) return general(u, c)
  const client = c.costing.projects.find(p => p.name === holes[0].project)?.client ?? 'the client'
  const oldest = holes.map(h => h.end).filter(Boolean).sort()[0]
  return {
    why: [
      { text: `${list(holes.map(h => `${h.id} (${n0(h.drilled)} m)`))} ${holes.length === 1 ? 'is' : 'are'} closed in the drill log${oldest ? `, the first on ${dw(oldest)}` : ''}, but not yet sent to ${client} for approval.` },
      { text: `A hole cannot be invoiced until the client approves it, so ${moneyL(u.money ?? 0)} is waiting on one click here.` },
    ],
    basis: 'Read from the holes closed in the drill log and their approval state.', sources: [{ label: 'Finance & billing', href: '/admin/finance' }], confidence: 'High',
    draft: { kind: 'email', to: client, via: 'Client portal + email', subject: `Holes for approval: ${list(holes.map(h => h.id))}`,
      body: `${greet(client)}\n\nHoles ${list(holes.map(h => h.id))} are complete. The metres, core recovery and tray photos are in your XPLORIX portal; every shift has passed our checks.\n\nPlease approve them there, or tell us what you would like looked at.${sign()}`,
      approve: 'Send for approval', done: `Sent ${list(holes.map(h => h.id))} for approval` },
  }
}

function stuck(u: InboxUnit, c: AiCtx): Explanation {
  const s = c.forecast.cash.stuckOpen
  if (!s.length) return general(u, c)
  const sup = supervisorOf(c, s[0].rig)
  return {
    why: [
      ...s.slice(0, 3).map(h => ({ text: `${h.hole} on ${h.rig} is at ${n0(h.drilled)} of ${n0(h.planned)} m but still open in the record: nobody ticked "hole closed".` })),
      { text: `Until it is closed it cannot be approved, invoiced or paid: ${moneyL(s.reduce((a, h) => a + h.value, 0))} is held by a missing tick.` },
    ],
    basis: 'Read from the planned depths and the last shift on each hole.', sources: [{ label: 'Projects & holes', href: '/admin/projects' }], confidence: 'High',
    draft: { kind: 'note', to: sup ?? 'Supervisor', via: 'Message', body: `${sup ? `Hi ${sup.split(' ')[0]}, ` : ''}${list(s.map(h => h.hole))} ${s.length === 1 ? 'has' : 'have'} reached planned depth. Please tick "Hole closed" on the last shift in XPLORIX today so we can send ${s.length === 1 ? 'it' : 'them'} to the client. Thanks.`, approve: 'Approve', done: `Asked ${sup ?? 'the supervisor'} to close ${list(s.map(h => h.hole))}` },
  }
}

function standby(u: InboxUnit, c: AiCtx): Explanation {
  const f = u.items[0]
  const keys = (f.ref?.keys as string[] | undefined) ?? []
  const days = standbyLedger(c.costing, c.inv).days.filter(d => keys.includes(d.key))
  if (!days.length) return general(u, c)
  const rigs = Array.from(new Set(days.map(d => d.rig)))
  const noNote = days.filter(d => !d.noted).length
  const client = c.costing.projects.find(p => p.name === days[0].project)?.client ?? 'the client'
  const why: Why[] = [
    { text: `On ${plural(days.length, 'day')} the client held ${list(rigs)} while ${rigs.length === 1 ? 'it was' : 'they were'} between holes. The contract pays standby, but an invoice is built hole by hole, so a day on no hole lands on no invoice.`, href: '/admin/intelligence/money' },
    { text: `Most were ${(() => { const m: Record<string, number> = {}; days.forEach(d => { if (d.reasons) m[d.reasons] = (m[d.reasons] ?? 0) + 1 }); return Object.entries(m).sort((a, b) => b[1] - a[1])[0]?.[0]?.toLowerCase() || 'client waits' })()}: ${list(days.slice(0, 4).map(d => `${d.rig} ${dw(d.date)} (${n0(d.hours)} h)`))}${days.length > 4 ? ' and more' : ''}.` },
  ]
  if (noNote) why.push({ text: `${plural(noNote, 'day')} ${noNote === 1 ? 'has' : 'have'} no note saying who asked the rig to wait. Add one before billing: it is the first thing the client will ask.` })
  const total = days.reduce((s, d) => s + d.earned, 0)
  return {
    why, basis: 'Read from every shift on client standby, which hole it was on, and every invoice raised.', sources: [{ label: 'Money checks', href: '/admin/intelligence/money' }], confidence: 'High',
    draft: { kind: 'invoice', to: client, via: 'Invoice lines', subject: `Standby lines for the next invoice to ${client}`,
      body: 'Each day is recorded on the invoice, so it can never be billed twice.',
      table: { cols: ['Rig', 'Date', 'Hours', 'Amount'], rows: days.map(d => [d.rig, dw(d.date), n1(d.hours), money(d.earned)]), total: ['Standby', money(total)] },
      approve: 'Add to next invoice', done: `${plural(days.length, 'standby day')} added to the next invoice` },
  }
}

function rates(u: InboxUnit, c: AiCtx): Explanation {
  const f = u.items[0]
  const p = c.costing.projects.find(x => x.name === f.project) ?? c.costing.projects[0]
  const prop = (c.costing.rateProposals ?? []).find(r => `billing:rate:${r.id}` === f.id)
  const waited = prop ? daysBetween(prop.proposedAt.slice(0, 10), c.today) : null
  return {
    why: [{ text: f.detail }, ...(waited != null ? [{ text: `It has waited ${plural(waited, 'day')}. Every metre drilled meanwhile is billed at the old rates and cannot be re-billed later without the client's agreement.` }] : [])],
    basis: 'Read from the rate proposal and the contract rates in force.', sources: [{ label: 'Projects', href: '/admin/projects' }], confidence: 'Medium',
    draft: { kind: 'email', to: p?.client ?? 'Client', via: 'Email', subject: `New rates for ${p?.name ?? 'the project'}: waiting for your approval`,
      body: `${greet(p?.client ?? 'Sir/Madam')}\n\nWe sent revised rates for ${p?.name ?? 'the project'}${prop ? ` on ${dw(prop.proposedAt.slice(0, 10))}` : ''}${prop?.rate.note ? ` (${prop.rate.note})` : ''}. They are in your XPLORIX portal for approval.\n\nCould you approve them or let us know what you would like to discuss this week? Until then we continue to bill at the current rates.${sign()}`,
      approve: 'Approve', done: 'Client reminded about the new rates' },
  }
}

/* ── contractors ────────────────────────────────────────────────────────── */

function bill(u: InboxUnit, c: AiCtx): Explanation {
  const b = c.costing.contractorBills.find(x => x.id === keyOf(u.items[0].id).slice(9))
  if (!b) return general(u, c)
  const fig = billFigures(c.costing, b)
  const name = contractorName(c.costing, b.contractorId)
  const over = fig.claimed - fig.supported
  const why: Why[] = [
    { text: `${b.number} from ${name} claims ${money(fig.claimed)} for ${dw(b.periodFrom)} to ${dw(b.periodTo)}; the shifts your site staff checked support ${money(fig.supported)}.`, href: '/admin/contractors' },
  ]
  if (over > 0) why.push({ text: `The ${money(over)} difference is metres or standby he reported that the checked record does not show. Approving at his figure pays for work the record cannot prove.` })
  if (fig.deductions) why.push({ text: `The work order's own rules take ${money(fig.deductions)} off${fig.held ? ` and hold ${money(fig.held)}` : ''}, leaving ${money(fig.net)} to pay.` })
  const ct = c.costing.contractors.find(x => x.id === b.contractorId)
  return {
    why, basis: 'Read from the bill, the contractor shifts your site checked, and the work order’s rates and rules.', sources: [{ label: 'Contractors', href: '/admin/contractors' }], confidence: 'High',
    draft: over > 0 ? { kind: 'email', to: `${name}${ct?.email ? ` <${ct.email}>` : ''}`, via: 'Email', subject: `${b.number}: approved at the checked figure`,
      body: `${greet(name)}\n\nWe have checked ${b.number} against the shifts our site accepted. The checked record supports ${money(fig.supported)}, not the ${money(fig.claimed)} claimed; after the work order's deductions the bill is ${money(fig.net)}.\n\nThe line-by-line comparison is attached. If you have a shift we have not seen, send the signed report and we will look at it again.${sign()}`,
      approve: 'Approve at checked figure', done: `${b.number} approved at ${money(fig.net)}` } : undefined,
  }
}

function lateWo(u: InboxUnit, c: AiCtx): Explanation {
  const wo = c.costing.workOrders.find(w => w.id === keyOf(u.items[0].id).slice(9))
  if (!wo) return general(u, c)
  const name = contractorName(c.costing, wo.contractorId)
  const done = shifts(c, l => l.workOrderId === wo.id).reduce((s, l) => s + l.metresDrilled, 0)
  const rule = wo.rules.find(r => r.kind === 'lateCompletion')
  const p = pace(shifts(c, l => l.workOrderId === wo.id && l.date >= addDays(c.today, -13)))
  const left = Math.max(0, wo.plannedMetres - done)
  return {
    why: [
      { text: `${wo.number} was due to finish on ${dw(wo.endDate)}; ${name} has drilled ${n0(done)} of ${n0(wo.plannedMetres)} m.` },
      ...(p.perDay ? [{ text: `At his last two weeks' pace (${n1(p.perDay)} m a day) the ${n0(left)} m left take about ${plural(Math.ceil(left / p.perDay), 'more day')}.` }] : []),
      ...(rule ? [{ text: 'The work order has a late-completion deduction, so the delay can be charged to him.' }] : []),
    ],
    basis: 'Read from the work order and the contractor’s checked shifts.', sources: [{ label: 'Contractors', href: '/admin/contractors' }], confidence: 'Medium',
    draft: { kind: 'email', to: name, via: 'Email', subject: `${wo.number}: past the finish date`, body: `${greet(name)}\n\n${wo.number} was due to finish on ${dw(wo.endDate)}. ${n0(left)} m remain. Please send by tomorrow a recovery plan with the rigs, crew and dates to finish${rule ? `, noting that the late-completion terms of the work order apply from the due date` : ''}.${sign()}`, approve: 'Approve', done: `Recovery plan requested from ${name}` },
  }
}

function reports(u: InboxUnit, c: AiCtx): Explanation {
  const waiting = (c.costing.contractorReports ?? []).filter(r => r.status === 'waiting')
  const rigs = Array.from(new Set(waiting.map(r => r.rig)))
  return {
    why: [
      { text: `${plural(waiting.length, 'shift')} from ${list(rigs)} ${waiting.length === 1 ? 'is' : 'are'} reported by the contractors and waiting for your site staff.` },
      { text: 'Until a shift is accepted it is not in the record: it is not paid, not billed to the client and not in any forecast.' },
    ],
    basis: 'Read from the contractor reports waiting.', sources: [{ label: 'Contractors', href: '/admin/contractors' }], confidence: 'High',
  }
}

/* ── rigs and maintenance ───────────────────────────────────────────────── */

function service(u: InboxUnit, c: AiCtx): Explanation {
  const f = u.items[0]
  const rig = f.rig ?? rigsIn(f.title)[0]
  if (!rig) return general(u, c)
  const recent = rigShifts(c, rig, 14)
  const perDay = recent.reduce((s, l) => s + (l.engineHours ?? (l.drillingHours > 0 ? l.shiftHours : 0)), 0) / 14
  const hours = Number(f.title.match(/(\d+) engine hours/)?.[1] ?? 0)
  const overBy = hours - 250
  const crossed = perDay > 0 && overBy > 0 ? addDays(c.today, -Math.round(overBy / perDay)) : null
  const bds = (c.costing.maintenance ?? []).filter(m => m.rig === rig && m.maintenanceType === 'Breakdown' && m.date >= addDays(c.today, -89))
  const r = c.forecast.rigs.find(x => x.rig === rig)
  const pause = r?.segments.find(s => s.kind !== 'hole' && s.from > c.today)
  const loss = dayLoss(c, rig)
  const why: Why[] = [
    { text: `${rig} has run about ${n1(perDay)} engine hours a day over the last two weeks${crossed ? `, so it passed its 250-hour service around ${dw(crossed)}` : ''}.`, href: '/admin/logs/maintenance' },
  ]
  if (bds.length) why.push({ text: `It has had ${plural(bds.length, 'breakdown')} in the last 90 days (${list(bds.slice(0, 3).map(b => `${b.component.toLowerCase()} on ${dw(b.date)}`))}); running past service makes the next one more likely.` })
  if (loss) why.push({ text: `A breakdown day costs about ${moneyL(loss.money)} in metres not drilled; a service takes a shift.` })
  why.push({ text: pause ? `Its next pause in the plan is a ${pause.kind === 'move' ? 'rig move' : 'gap with no hole'} on ${dw(pause.from)}${pause.from > addDays(c.today, 3) ? ', too far away: service it sooner' : ': service it then'}.` : 'No rig move or gap is planned soon, so book it for the next day shift.' })
  const day = pause && pause.from <= addDays(c.today, 3) ? pause.from : addDays(c.today, 1)
  return {
    why, basis: 'Read from engine hours on every shift, the maintenance log and the rig’s plan.', sources: [{ label: 'Maintenance', href: '/admin/logs/maintenance' }], confidence: 'High',
    draft: { kind: 'workorder', to: 'Workshop', via: 'Maintenance work order', subject: `250 h service: ${rig}, ${dw(day)} day shift`,
      body: `Standard 250-hour service on ${rig} during the ${dw(day)} day shift. Log it in the maintenance log when done so the engine-hour count restarts.`,
      table: { cols: ['Check', 'Note'], rows: [['Engine oil and filters', 'Change'], ['Fuel and air filters', 'Change'], ['Hydraulic return filter, oil level', 'Check, top up'], ['Rod handler, head, wire line', 'Grease, inspect']] },
      approve: 'Approve work order', done: `Service on ${rig} booked for ${dw(day)}` },
  }
}

function breakdown(u: InboxUnit, c: AiCtx): Explanation {
  const rig = rigsIn(u.title)[0] ?? keyOf(u.items[0].id).replace(/^bd_/, '')
  const m = (c.costing.maintenance ?? []).filter(x => x.rig === rig && x.maintenanceType === 'Breakdown' && x.date >= addDays(c.today, -29))
  const loss = dayLoss(c, rig)
  const why: Why[] = m.map(x => ({ text: `${dw(x.date)}: ${x.component} — ${x.action.toLowerCase()} (${n1(x.hours)} h stopped).`, href: '/admin/logs/maintenance' }))
  const own = stops(rigShifts(c, rig, 30), 'own')
  if (own[0]) why.push({ text: `In its drill logs the biggest own stop is "${own[0].reason}", ${n1(own[0].hours)} h in 30 days.` })
  if (loss) why.push({ text: `Each stopped day costs about ${moneyL(loss.money)} in metres not drilled.` })
  return { why: why.length ? why : [{ text: u.detail }], basis: 'Read from the maintenance log and the rig’s drill logs.', sources: [{ label: 'Maintenance', href: '/admin/logs/maintenance' }], confidence: m.length ? 'High' : 'Medium',
    draft: { kind: 'note', to: 'Workshop', via: 'Note', body: `Look at ${rig}'s ${m[0]?.component.toLowerCase() ?? 'repeat stops'} before it fails again: find the cause, not just the fix, and log what was found.`, approve: 'Approve', done: `Workshop asked to find the cause on ${rig}` } }
}

function fatigue(u: InboxUnit, c: AiCtx): Explanation {
  const people = u.items.map(f => ({ name: f.title.replace(/ has worked.*/, ''), days: Number(f.title.match(/(\d+) days/)?.[1] ?? 0) })).sort((a, b) => b.days - a.days)
  const since = addDays(c.today, -29)
  const logs = shifts(c, l => l.date >= since && !!l.driller)
  const rigOf = (d: string) => logs.filter(l => l.driller === d).sort((a, b) => b.date.localeCompare(a.date))[0]?.rig
  const tired = new Set(people.map(p => p.name))
  const rested = Array.from(new Set(logs.map(l => l.driller as string))).filter(d => !tired.has(d))
  const rate = (d: string, from: string, to: string) => pace(logs.filter(l => l.driller === d && l.date >= from && l.date <= to)).rop
  const top = people[0]
  const early = top ? rate(top.name, since, addDays(c.today, -15)) : 0, late = top ? rate(top.name, addDays(c.today, -14), c.today) : 0
  const why: Why[] = [{ text: `${list(people.map(p => `${p.name} (${p.days})`))} have had no day off in that run, by the drill logs.` }]
  if (early && late && late < early * 0.95) why.push({ text: `${top.name}'s speed has dropped from ${n1(early)} to ${n1(late)} m an hour over the last two weeks: fatigue shows in the metres before it shows in an incident.` })
  why.push({ text: rested.length ? `${list(rested.slice(0, 3))} ${rested.length === 1 ? 'has' : 'have'} had rest days and can cover.` : 'No rested driller is on the books to cover: relief needs a hire or a contractor crew.' })
  const pairs = people.slice(0, 3).map((p, i) => [p.name, rigOf(p.name) ?? '', rested[i % Math.max(1, rested.length)] ?? 'Relief crew', dw(addDays(c.today, 1 + i))])
  return {
    why, basis: 'Read from the driller named on every shift.', sources: [{ label: 'Drillers & crew', href: '/admin/people' }], confidence: 'High',
    draft: { kind: 'note', to: 'HR and site in-charge', via: 'Relief rota', subject: 'Two days off each, starting with the longest runs',
      body: 'Each driller gets two days off; the cover driller takes his rig for those shifts.',
      table: { cols: ['Driller', 'Rig', 'Covered by', 'Off from'], rows: pairs }, approve: 'Approve rota', done: 'Relief rota approved' },
  }
}

function slow(u: InboxUnit, c: AiCtx): Explanation {
  const [a, b] = rigsIn(u.title)
  if (!a) return general(u, c)
  const la = rigShifts(c, a), pa = pace(la)
  const why: Why[] = []
  if (b) {
    const lb = rigShifts(c, b), pb = pace(lb)
    const ha = hardShare(la), hb = hardShare(lb)
    if (Math.abs(ha - hb) >= 0.1) why.push({ text: `${a} has drilled ${pct(ha * 100)} of its metres in hard or very hard ground, against ${pct(hb * 100)} for ${b}${ha > hb ? ': much of the gap is the ground, not the crew' : ', so the ground does not explain it'}.` })
    const sa = Array.from(new Set(la.map(l => l.holeSize))).sort(), sb = Array.from(new Set(lb.map(l => l.holeSize))).sort()
    if (sa.join() !== sb.join()) why.push({ text: `${a} drills ${list(sa)}, ${b} drills ${list(sb)}; a bigger core size is slower in the same ground.` })
    // Like for like: the same ground on both rigs.
    const common = groundMix(la).map(x => x.g).filter(g => ropIn(lb, g) != null && ropIn(la, g) != null)
    common.slice(0, 2).forEach(g => {
      const ra = ropIn(la, g)!, rb = ropIn(lb, g)!
      why.push({ text: `In ${g.toLowerCase()} ground alone, ${a} makes ${ra.toFixed(2)} m an hour and ${b} ${rb.toFixed(2)}${ra < rb * 0.9 ? `: the gap is there in the same ground, so it is the rig, the bits or the crew` : ': about the same, so the ground mix explains the gap'}.` })
    })
    if (pa.onBottom < pb.onBottom - 0.05) why.push({ text: `The bit is on bottom ${pct(pa.onBottom * 100)} of ${a}'s shift time, against ${pct(pb.onBottom * 100)} on ${b}: it loses more hours to tripping and stops.` })
  }
  const ctr = la.find(l => l.contractor)?.contractor
  if (ctr) why.push({ text: `${a} is ${contractorName(c.costing, ctr)}'s rig, paid by the metre: slower drilling costs you plan days, not money a metre.` })
  const own = stops(la, 'own')
  if (own[0]) why.push({ text: `Its biggest own stop is "${own[0].reason}": ${n1(own[0].hours)} h in 30 days.`, href: '/admin/analytics/operation' })
  const drillers = Array.from(new Set(la.map(l => l.driller).filter(Boolean))) as string[]
  if (drillers.length > 1) {
    const r = drillers.map(d => ({ d, rop: pace(la.filter(l => l.driller === d)).rop })).sort((x, y) => y.rop - x.rop)
    if (r[0].rop > r[r.length - 1].rop * 1.15) why.push({ text: `On the same rig, ${r[0].d} makes ${n1(r[0].rop)} m an hour and ${r[r.length - 1].d} ${n1(r[r.length - 1].rop)}: a crew pairing can close part of the gap.` })
  }
  const sup = supervisorOf(c, a)
  return {
    why: why.length ? why : [{ text: u.detail }], basis: `Read from ${plural(la.length, 'shift')} on ${a} in the last 30 days${b ? ` and the same on ${b}` : ''}.`, sources: [{ label: 'Operations analytics', href: '/admin/analytics/operation' }], confidence: why.length >= 2 ? 'High' : 'Medium',
    draft: { kind: 'note', to: sup ?? 'Supervisor', via: 'Message', body: `${sup ? `Hi ${sup.split(' ')[0]}, ` : ''}${a} is running ${u.title.match(/\d+%/)?.[0] ?? 'well'} slower than ${b ?? 'the fleet'}. ${own[0] ? `Its biggest own stop is ${own[0].reason.toLowerCase()}. ` : ''}Please check bit choice for the ground and trip times this week, and note any reason in the log. Thanks.`, approve: 'Approve', done: `Supervisor asked to look at ${a}` },
  }
}

function fuel(u: InboxUnit, c: AiCtx): Explanation {
  const rig = rigsIn(u.title)[0]
  if (!rig) return general(u, c)
  const la = rigShifts(c, rig), pa = pace(la)
  const fleet = shifts(c, l => l.date >= addDays(c.today, -29) && !l.contractor && l.rig !== rig)
  const pf = pace(fleet)
  const engineOff = la.filter(l => (l.engineHours ?? 0) > 0 && l.drillingHours === 0)
  const why: Why[] = [
    { text: `${rig} drilled ${pa.rop.toFixed(2)} m an hour against ${pf.rop.toFixed(2)} for the rest of your own fleet${pa.rop < pf.rop * 0.95 ? ': a rig that drills slower burns more fuel for each metre, even at the same litres an hour' : ''}.` },
    { text: `${pct(hardShare(la) * 100)} of its metres were in hard or very hard ground (fleet: ${pct(hardShare(fleet) * 100)})${hardShare(la) <= hardShare(fleet) ? ', so harder ground does not explain the extra fuel' : ', which explains part of it'}.` },
  ]
  const lph = (ls: typeof la) => { const h = ls.reduce((a, l) => a + (l.engineHours ?? 0), 0); return h ? ls.reduce((a, l) => a + l.fuelLitres, 0) / h : 0 }
  if (lph(la) && lph(fleet)) why.push({ text: `It burns ${n1(lph(la))} litres an engine hour against ${n1(lph(fleet))} for the fleet${lph(la) > lph(fleet) * 1.1 ? ': check idling, the injectors and the fuel issue register' : ', so the engine itself is normal: the litres go on slow metres'}.` })
  if (engineOff.length) why.push({ text: `On ${plural(engineOff.length, 'shift')} the engine ran with no metres drilled: idling on standby is fuel with nothing to show for it.` })
  return {
    why, basis: `Read from fuel, engine hours and metres on ${plural(la.length, 'shift')}.`, sources: [{ label: 'Consumables analytics', href: '/admin/analytics/consumables' }], confidence: 'Medium',
    draft: { kind: 'note', to: 'Site in-charge', via: 'Note', body: `Check ${rig}'s fuel issue register against the drill logs for the last two weeks, and switch the engine off on standby longer than an hour.`, approve: 'Approve', done: `Fuel check on ${rig} asked for` },
  }
}

function idle(u: InboxUnit, c: AiCtx): Explanation {
  const project = u.items[0].id.replace(/^risk:idle_/, '')
  const bp = c.forecast.byProject.find(p => p.project === project)
  const rigs = c.forecast.rigs.filter(r => r.project === project)
  const p = c.costing.projects.find(x => x.name === project)
  if (!bp || !rigs.length) return general(u, c)
  const why: Why[] = rigs.map(r => ({ text: `At its ${n1(r.perDay)} m a day, ${r.rig} finishes its last planned hole about ${dw(r.lastHoleEnds ?? r.idleFrom)}; nothing is planned after it.` }))
  why.push({ text: `That leaves ${plural(bp.idleDays, 'rig-day')} with no hole before the end of ${dw(c.forecast.horizonEnd).split(' ')[1]}. A rig standing still still costs its crew, hire and lodging.` })
  return {
    why, basis: 'Read from the hole plan and each rig’s pace over the last 30 days.', sources: [{ label: 'Outlook', href: '/admin/intelligence/months' }], confidence: 'High',
    draft: { kind: 'email', to: p?.client ?? 'Client', via: 'Email', subject: `${project}: next holes needed by ${dw(addDays(rigs.map(r => r.lastHoleEnds ?? r.idleFrom ?? c.today).sort()[0], -10))}`,
      body: `${greet(p?.client ?? 'Sir/Madam')}\n\nOn ${project}, the holes released to us will be finished around ${list(rigs.map(r => `${dw(r.lastHoleEnds ?? r.idleFrom)} (${r.rig})`))}. To keep the rigs drilling without a stand-down, could you release the next holes, with collars and planned depths, at least ten days before then?\n\nWe can share the forecast in your portal if useful.${sign()}`,
      approve: 'Approve', done: `Asked ${p?.client ?? 'the client'} for the next holes` },
  }
}

/* ── drill log quality ──────────────────────────────────────────────────── */

function copies(u: InboxUnit, c: AiCtx): Explanation {
  const ev = u.items[0].evidence ?? []
  const rigs = Array.from(new Set(ev.map(e => e.split(' · ')[0])))
  const sups = Array.from(new Set(rigs.map(r => supervisorOf(c, r)).filter(Boolean))) as string[]
  const contractorRigs = rigs.filter(r => shifts(c, l => l.rig === r && !!l.contractor).length > 0)
  return {
    why: [
      { text: `${u.title.match(/^\d+/)?.[0] ?? 'Several'} shifts carry exactly the same metres, hours, fuel and core as an earlier shift, mostly on ${list(rigs.slice(0, 3))}.`, href: '/admin/intelligence/drill-logs' },
      { text: 'Real shifts are never identical twice in a row; a copied shift usually means last shift was re-entered instead of measured.' },
      ...(contractorRigs.length ? [{ text: `${list(contractorRigs)} ${contractorRigs.length === 1 ? 'is a contractor rig' : 'are contractor rigs'}: copied shifts there are copied metres you pay for.` }] : []),
    ],
    basis: 'Read by comparing every shift with the shifts before it on the same rig.', sources: [{ label: 'Drill log check', href: '/admin/intelligence/drill-logs' }], confidence: 'High',
    draft: { kind: 'note', to: sups.length ? list(sups) : 'Supervisors', via: 'Message', body: `Hi, XPLORIX found shifts on ${list(rigs.slice(0, 3))} with every figure the same as the shift before. Please check each one against the rig's own figures today, and correct it or add the reason in the log. Thanks.`, approve: 'Approve', done: 'Supervisors asked to check copied shifts' },
  }
}

function missing(u: InboxUnit, c: AiCtx): Explanation {
  const f = u.items[0]
  const rig = f.rig ?? rigsIn(f.title)[0] ?? keyOf(f.id).replace(/^ns_/, '')
  const sup = supervisorOf(c, rig)
  const loss = dayLoss(c, rig)
  return {
    why: [
      { text: `${rig}: ${f.detail}` },
      { text: `A missing shift is missing metres, cost and billing${loss ? `: about ${moneyL(loss.money / 2)} a shift on this rig` : ''}, and every forecast built on it reads low.` },
    ],
    basis: 'Read from the shifts expected for every rig on a project.', sources: [{ label: 'Drill logs', href: '/admin/logs/drill' }], confidence: 'High',
    draft: { kind: 'note', to: sup ?? 'Supervisor', via: 'Message', body: `${sup ? `Hi ${sup.split(' ')[0]}, ` : ''}${rig}'s ${f.detail.replace(/\.$/, '')} shift log is not in XPLORIX. Please enter it today, or log the rig as stood down if it did not work. Thanks.`, approve: 'Approve', done: `${sup ?? 'Supervisor'} asked for ${rig}'s missing shift` },
  }
}

function badLog(u: InboxUnit, c: AiCtx): Explanation {
  const f = u.items[0]
  return {
    why: [{ text: f.detail }, { text: 'A figure that cannot be right flows into cost per metre, the hole’s value and the invoice. Finance will not approve the hole until it is corrected.' }],
    basis: 'Read by checking the shift against the shifts before and after it.', sources: [{ label: 'Drill log', href: f.href ?? '/admin/logs/drill' }], confidence: 'High',
    draft: { kind: 'note', to: f.owner, via: 'Message', body: `Hi, ${f.title}. Please open the shift in XPLORIX and correct it today: the hole cannot be billed until it is right. Thanks.`, approve: 'Approve', done: 'Correction asked for' },
  }
}

function crewStops(u: InboxUnit, c: AiCtx): Explanation {
  const name = u.title.replace(/'s shifts.*/, '')
  const mine = shifts(c, l => l.driller === name && l.date >= addDays(c.today, -29))
  const s = stops(mine, 'own')
  const rig = mine[0]?.rig
  const others = rig ? shifts(c, l => l.rig === rig && l.driller !== name && l.date >= addDays(c.today, -29)) : []
  const why: Why[] = [{ text: u.detail }]
  if (s.length) why.push({ text: `Most of it is ${list(s.slice(0, 2).map(x => `${x.reason.toLowerCase()} (${n1(x.hours)} h)`))}.` })
  if (others.length) why.push({ text: `Other drillers on ${rig} lose ${n1(stops(others, 'own').reduce((a, x) => a + x.hours, 0) / Math.max(1, others.length))} h a shift to own stops, so ${pace(mine).own / Math.max(1, mine.length) > stops(others, 'own').reduce((a, x) => a + x.hours, 0) / Math.max(1, others.length) * 1.3 ? 'it is the crew more than the rig' : 'the rig shares the blame'}.` })
  return { why, basis: `Read from ${plural(mine.length, 'shift')} with ${name} as driller.`, sources: [{ label: 'Drillers and crew', href: '/admin/analytics/driller-crew' }], confidence: 'Medium' }
}

function survey(u: InboxUnit, c: AiCtx): Explanation {
  const hole = holesIn(u.title)[0]
  const rig = hole ? shifts(c, l => l.holeNumber === hole).sort((a, b) => b.date.localeCompare(a.date))[0]?.rig : undefined
  const sup = rig ? supervisorOf(c, rig) : undefined
  return {
    why: [{ text: u.detail }, ...(hole ? [{ text: `Every metre drilled off line makes the correction longer; the geologist decides whether to wedge, correct or accept it.` }] : [])],
    basis: 'Read from the survey readings against the planned line.', sources: [{ label: 'Projects & holes', href: '/admin/projects' }], confidence: 'Medium',
    draft: !hole ? undefined : u.items[0].id.startsWith('live:sv_gap_')
      ? { kind: 'note', to: sup ?? 'Supervisor', via: 'Message', body: `${sup ? `Hi ${sup.split(' ')[0]}, ` : ''}${hole} has ${u.title.split(': ')[1]?.replace(' since the last survey', '') ?? 'gone a long way'} since its last survey reading. Please take a reading at the next rod change and enter it in the drill log. Thanks.`, approve: 'Approve', done: `Survey reading asked for on ${hole}` }
      : { kind: 'note', to: sup ? `${sup} and the geologist` : 'Supervisor and geologist', via: 'Message', body: `${hole} is ${u.title.split(': ')[1] ?? 'off its planned line'}. Please hold the next run until the geologist has looked at the survey and agreed what to do. Thanks.`, approve: 'Approve', done: `Survey on ${hole} sent to site` },
  }
}

function core(u: InboxUnit, c: AiCtx): Explanation {
  const hole = holesIn(u.title)[0]
  const logs = hole ? shifts(c, l => l.holeNumber === hole) : []
  const mix = groundMix(logs)[0]
  const sup = logs[0] ? supervisorOf(c, logs[0].rig) : undefined
  return {
    why: [{ text: u.items[0].detail }, ...(mix ? [{ text: `${hole} is mostly in ${mix.g.toLowerCase()} ground, where recovery drops when runs are long or the bit is pushed fast.` }] : [])],
    basis: 'Read from the drill logs and the tray photos.', sources: [{ label: `${hole ?? 'Hole'} log`, href: u.href ?? '/admin/geology' }], confidence: 'Medium',
    draft: { kind: 'note', to: sup ?? 'Supervisor', via: 'Message', body: `${hole ?? 'This hole'}: core recovery on the tray photos is below 85%. Please shorten the runs, check the core lifters and slow the feed in this ground, and measure recovery the same way as the geologist. Thanks.`, approve: 'Approve', done: 'Crew told about core recovery' },
  }
}

/* ── anything else ──────────────────────────────────────────────────────── */

function general(u: InboxUnit, c: AiCtx): Explanation {
  const why: Why[] = u.items.length > 1
    ? u.items.slice(0, 4).map((f: Finding) => ({ text: `${f.title}${f.money ? ` (${moneyL(f.money)})` : ''}.`, href: f.href }))
    : [{ text: u.detail }]
  ;(u.items[0].evidence ?? []).slice(0, 3).forEach(e => why.push({ text: `Behind it: ${e}.` }))
  return {
    why, basis: 'Read from the figures behind this task.', sources: u.href ? [{ label: 'Open', href: u.href }] : [], confidence: 'Medium',
    draft: u.action ? { kind: 'note', to: u.owner, via: 'Note', body: u.action, approve: 'Approve', done: `Sent to ${u.owner}` } : undefined,
  }
}
