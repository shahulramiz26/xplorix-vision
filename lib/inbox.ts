import { buildFindings, DEPTS, type Finding, type Dept, type Severity } from './findings'
import { computeOverview, type Attention } from './admin-overview'
import { TODAY, addDays } from './inventory-store'
import type { FindingStatus } from './costing-store'
import type { CostingState, InvState } from './costing-view'

/* ==========================================================================
 * THE INBOX — every finding, once
 *
 * Several screens used to raise their own warnings: the Dashboard's "Needs
 * you", the Intelligence card, Inventory's "Needs attention", the insight
 * cards on each analytics board. The same late order appeared four times,
 * each in a different design. This file is now the only place a warning is
 * made into something to act on:
 *
 *   1. every source is read once: the findings engine (lib/findings.ts) and
 *      the live operational items (lib/admin-overview.ts);
 *   2. what two sources both say is kept once, the more specific one;
 *   3. findings about the same thing (a part, a hole, an invoice) become one
 *      story, with each finding as a step;
 *   4. each story has one status. Done, handed on, set aside or reminded is
 *      kept against it, and a story that gains new evidence opens again.
 *
 * The Dashboard shows the whole list; each department's screen shows its
 * share of the same list, so a story marked done anywhere is done
 * everywhere. Nothing is ever dropped silently: folded groups carry their
 * counts, reminders wait in view with their date.
 * ========================================================================== */

export interface InboxUnit {
  id: string                 // the status is kept under this
  subject: string
  severity: Severity
  dept: Dept
  depts: Dept[]
  title: string
  detail: string
  action?: string
  owner: string
  due?: string
  money?: number
  moneyNote?: string
  href?: string
  since?: string
  tags: string[]
  items: Finding[]           // more than one: a story
  about?: string             // what a story's findings share, in words
  status?: FindingStatus     // as stored, when it still applies
  state: 'open' | 'handed' | 'reminder' | 'done' | 'dismissed'
  isNew: boolean
}

export interface InboxResult {
  units: InboxUnit[]
  open: InboxUnit[]          // to act on: open and handed on, most urgent first
  reminders: InboxUnit[]     // waiting for their date
  handled: InboxUnit[]       // done or set aside
  fresh: InboxUnit[]         // new since yesterday, also listed in their place
  counts: Record<Severity, number>
  atStake: number            // one figure per story, so nothing is counted twice
  byDept: Record<Dept, { open: number; act: number; money: number }>
  audits: ReturnType<typeof buildFindings>['audits']
  forecast: ReturnType<typeof buildFindings>['forecast']
}

const RANK: Record<Severity, number> = { act: 0, plan: 1, watch: 2 }
const ownerOf = (d: Dept) => DEPTS.find(x => x.key === d)?.owner ?? 'Owner'

const ACTION: Record<string, string> = {
  rr_: 'Read the client\'s reason, agree the rates with him, and send them again.',
  pn_: 'Read what changed, and adjust the plan or the crew if it affects them.',
  norate_: 'Add the missing size and ground to the contract rates. Until then these metres bill at zero.',
  ctr_reports: 'Check each shift against what the site saw, then accept it, change it or send it back.',
  ctr_: 'Check it line by line against the checked shifts before approving it.',
  ctr_late_: 'Agree a recovery plan with the contractor, and apply the late deduction the work order allows.',
  bd_: 'Find out what broke and when the rig will drill again; log the repair.',
  idle_: 'Add the next holes, move the rig to another project, or stand it down.',
  kpi_: 'Look at the stops and the ground on its last shifts, and talk to the driller.',
  ns_: 'Ask the supervisor for the shift, or log the rig as stood down.',
  ret_: 'Read the client\'s reason, put the hole right, and send it again.',
  dis_: 'Answer the disputed lines with the shifts behind them, or credit them.',
  od_: 'Call the client\'s accounts team today and send the statement.',
  ready: 'Raise the invoice for these holes today.',
  tosend: 'Approve the holes, or send them to the client for approval.',
}

/* Live items from the operational overview, in the findings' shape. */
function fromAttention(a: Attention): Finding | null {
  const k = a.key
  const sev = (t: Attention['tone']): Severity => t === 'bad' ? 'act' : t === 'warn' ? 'plan' : t === 'info' ? 'watch' : 'watch'
  /* The overview's own wording is for a button ("Open invoice"); here the
   * line says what to do, and the money sits in its own column. */
  const iso = (t: string) => t.replace(/(\d{4})-(\d{2})-(\d{2})/g, (_, y, m, d) => `${Number(d)} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1]}`)
  const title = a.money ? a.title.replace(/ · SAR [\d,.]+(?:K|M)?$/, '') : a.title
  const base = { title, detail: iso(a.detail), href: a.href, action: ACTION[k] ?? ACTION[k.startsWith('ctr_late_') ? 'ctr_late_' : k.startsWith('ctr_bill_') ? 'ctr_' : k.replace(/_.*$/, '_')], money: a.money, since: a.since }
  const make = (dept: Dept, severity: Severity, extra: Partial<Finding> = {}): Finding =>
    ({ id: `live:${k}`, dept, severity, owner: ownerOf(dept), subject: `live:${k}`, ...base, ...extra })
  if (k === 'stock') return null                                    // the stores findings say it in full
  if (k.startsWith('rr_')) return make('billing', 'act', { tag: 'Rates' })
  if (k.startsWith('pn_')) return make('operations', 'watch', { tag: 'Client' })
  if (k.startsWith('norate_')) return make('billing', 'act', { tag: 'Rates', moneyNote: 'billing at zero' })
  if (k === 'ctr_reports') return make('contractors', 'act', { tag: 'Shifts to check', due: TODAY })
  if (k.startsWith('ctr_bill_')) return make('contractors', a.tone === 'bad' ? 'act' : 'plan',
    { tag: 'Bill', subject: `bill:${k.slice(9)}`, kind: 'bill-over', ref: { billId: k.slice(9) }, moneyNote: a.money ? 'above the record' : undefined })
  if (k.startsWith('ctr_late_')) return make('contractors', 'plan', { tag: 'Late work order', subject: `wo:${k.slice(9)}` })
  if (k.startsWith('bd_')) return make('maintenance', 'act', { tag: 'Breakdown', rig: k.slice(3), due: TODAY })
  if (k.startsWith('idle_')) return make('operations', 'plan', { tag: 'Idle rig', rig: k.slice(5) })
  if (k.startsWith('kpi_')) return make('operations', 'plan', { tag: 'Under target', rig: k.slice(4) })
  if (k.startsWith('ns_')) return make('data', 'act', { tag: 'No shift today', rig: k.slice(3), due: TODAY })
  if (k.startsWith('ret_')) return make('billing', 'act', { tag: 'Returned hole', subject: `hole:${k.slice(4)}` })
  if (k.startsWith('dis_')) return make('billing', 'act', { tag: 'Disputed', subject: `invoice:${k.slice(4)}`, moneyNote: 'held back' })
  if (k.startsWith('od_')) return make('billing', 'act', { tag: 'Overdue', subject: `invoice:${k.slice(3)}`, kind: 'invoice-overdue', ref: { invoiceId: k.slice(3) }, moneyNote: 'outstanding' })
  if (k === 'ready') return make('billing', 'act', { tag: 'Ready to invoice', kind: 'ready-to-invoice', moneyNote: 'to invoice', due: TODAY })
  if (k === 'tosend') return make('billing', 'act', { tag: 'Approval', kind: 'approval-waiting', moneyNote: 'waiting for approval' })
  if (k === 'survey_wait') return make('operations', 'plan', { tag: 'Survey' })
  if (k.startsWith('sv_')) return make('operations', sev(a.tone), { tag: 'Survey', subject: `hole:${k.split('_').slice(2).join('_')}` })
  return make('operations', sev(a.tone))
}

/* The findings engine says some of the same things in general words. The
 * live item names the invoice, the bill or the work order, so it wins. */
const SUPERSEDED = (id: string) => id === 'risk:cash' || id === 'risk:approval' || id === 'risk:bills_over' || id.startsWith('risk:wo_late_')

/* What a finding is about, read from its id where the engine did not say. */
function subjectOf(f: Finding, partByName: Record<string, string>): string {
  if (f.subject) return f.subject
  const id = f.id
  if (id.startsWith('stock:') || id.startsWith('risk:part_')) {
    const m = id.match(/(?:^|[_|:])(t\d+)(?=$|[_|:])/)
    if (m) return `part:${m[1]}`
    const byName = id.match(/^stock:30d:stock_[^_]+_(.+)$/)
    if (byName && partByName[byName[1]]) return `part:${partByName[byName[1]]}`
  }
  if (id.startsWith('crew:fatigue:')) return 'crew:fatigue'
  if (id.startsWith('maintenance:service:')) return `service:${id.split(':')[2]}`
  return id
}

function tagOf(f: Finding): string | undefined {
  if (f.tag) return f.tag
  const id = f.id
  if (id.startsWith('stock:late_')) return 'Late'
  if (id.startsWith('stock:running_') || id.startsWith('risk:part_') || id.startsWith('stock:30d:stock_')) return 'Runs out'
  if (id.startsWith('stock:low_')) return 'Low stock'
  if (id.startsWith('stock:idle_')) return 'Idle'
  if (id.startsWith('stock:stranded_')) return 'Stranded'
  if (id.startsWith('stock:duesoon_')) return 'Arriving'
  if (id.startsWith('stock:life:')) return 'Part life'
  if (id.startsWith('stock:buy-check:')) return 'Before you buy'
  if (id.startsWith('stock:replacement') || id.startsWith('stock:reorder')) return 'Replacement'
  if (id.startsWith('data:stop:')) return 'Cannot be right'
  if (id.startsWith('data:missing:')) return 'Missing shift'
  if (id.startsWith('data:warn:')) return 'To explain'
  if (id.startsWith('maintenance:service:')) return 'Service due'
  if (id.startsWith('billing:standby-loose:')) return 'Standby'
  if (id.startsWith('billing:holes-blocked:')) return 'Blocked by logs'
  if (id.startsWith('crew:fatigue:')) return 'Fatigue'
  return undefined
}

/* A story's headline: its most urgent finding, except where the findings
 * are the same kind about different people. `about` names what they share. */
function storyTitle(subject: string, items: Finding[]): string {
  if (subject === 'crew:fatigue') {
    const days = items.map(f => Number(f.title.match(/(\d+) days/)?.[1] ?? 0))
    return `${items.length} drillers have worked ${Math.min(...days)} to ${Math.max(...days)} days in a row`
  }
  return items[0].title
}
function aboutOf(subject: string, partName: (id: string) => string): string {
  if (subject.startsWith('part:')) return partName(subject.slice(5))
  if (subject.startsWith('hole:')) return subject.slice(5)
  if (subject.startsWith('invoice:')) return 'this invoice'
  if (subject.startsWith('service:')) return subject.slice(8)
  if (subject === 'crew:fatigue') return 'crew fatigue'
  return 'the same thing'
}

/* Does a stored status still answer this story? Not if it has gained a
 * finding since, and not once a reminder's date has come. */
function stateOf(st: FindingStatus | undefined, ids: string[], today: string): InboxUnit['state'] {
  if (!st) return 'open'
  if (st.ids && ids.some(id => !st.ids!.includes(id))) return 'open'
  if (st.status === 'snoozed') return st.until && st.until <= today ? 'open' : 'reminder'
  if (st.status === 'assigned') return 'handed'
  return st.status === 'done' ? 'done' : 'dismissed'
}

export function buildInbox(costing: CostingState, inv: InvState, today: string = TODAY): InboxResult {
  const base = buildFindings(costing, inv, today)
  const overview = computeOverview(costing, inv)
  const live = overview.attention.map(fromAttention).filter((f): f is Finding => !!f)
  const all = [...base.findings.filter(f => !SUPERSEDED(f.id)), ...live]

  const partByName: Record<string, string> = {}
  inv.catalogue.forEach(p => { partByName[p.name] = p.id })
  const partName = (id: string) => inv.catalogue.find(p => p.id === id)?.name ?? id

  // Group by subject, the most urgent and largest finding first in each.
  const groups = new Map<string, Finding[]>()
  all.forEach(f => {
    const s = subjectOf(f, partByName)
    const g = groups.get(s) ?? []
    g.push({ ...f, subject: s, tag: tagOf(f) })
    groups.set(s, g)
  })
  const status = costing.findingStatus ?? {}
  const yesterday = addDays(today, -1)

  const units: InboxUnit[] = Array.from(groups.entries()).map(([subject, raw]) => {
    const items = raw.sort((a, b) => RANK[a.severity] - RANK[b.severity] || (b.money ?? 0) - (a.money ?? 0))
    const lead = items[0]
    const story = items.length > 1
    // A single finding keeps its own id, so a status set on Today still applies.
    const id = story ? `story:${subject}` : lead.id
    const st = status[id]
    const ids = items.map(f => f.id)
    const since = items.map(f => f.since).filter((d): d is string => !!d).sort().pop()
    return {
      id, subject, items,
      severity: lead.severity,
      dept: lead.dept,
      depts: Array.from(new Set(items.map(f => f.dept))),
      title: story ? storyTitle(subject, items) : lead.title,
      about: story ? aboutOf(subject, partName) : undefined,
      detail: lead.detail,
      action: lead.action,
      owner: lead.owner,
      due: items.map(f => f.due).filter((d): d is string => !!d).sort()[0],
      money: Math.max(0, ...items.map(f => f.money ?? 0)) || undefined,
      moneyNote: items.find(f => f.money === Math.max(...items.map(x => x.money ?? 0)))?.moneyNote,
      href: lead.href,
      since,
      tags: Array.from(new Set(items.map(f => f.tag).filter((t): t is string => !!t))),
      status: st,
      state: stateOf(st, ids, today),
      isNew: !!since && since >= yesterday,
    }
  }).sort((a, b) => RANK[a.severity] - RANK[b.severity] || (b.money ?? 0) - (a.money ?? 0))

  const open = units.filter(u => u.state === 'open' || u.state === 'handed')
  const counts: Record<Severity, number> = { act: 0, plan: 0, watch: 0 }
  open.forEach(u => { counts[u.severity] += 1 })
  const byDept = {} as InboxResult['byDept']
  DEPTS.forEach(d => { byDept[d.key] = { open: 0, act: 0, money: 0 } })
  open.forEach(u => u.depts.forEach(d => {
    byDept[d].open += 1
    if (u.severity === 'act') byDept[d].act += 1
    if (d === u.dept) byDept[d].money += u.money ?? 0
  }))

  return {
    units, open,
    reminders: units.filter(u => u.state === 'reminder'),
    handled: units.filter(u => u.state === 'done' || u.state === 'dismissed'),
    fresh: open.filter(u => u.isNew),
    counts,
    atStake: open.reduce((s, u) => s + (u.money ?? 0), 0),
    byDept,
    audits: base.audits,
    forecast: base.forecast,
  }
}
