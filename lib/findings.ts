import { monthOf, money, type ShiftLog } from './costing-store'
import {
  TODAY, addDays, buildAlerts, stockInStore, normFormation, COMPLETED_PROJECTS, RIGS, type Formation,
} from './inventory-store'
import type { CostingState, InvState } from './costing-view'
import {
  operations, operationsInsights, maintenance, maintenanceInsights, crew, crewInsights,
  consumables, consumablesInsights, safety, safetyInsights, dashboardInsights, type Insight,
} from './analytics'
import { buildScorecard, buildRiskRegister, type ScoredRisk } from './intelligence'
import { buildForecast, type Forecast, type RiskArea } from './forecast'
import { auditRecord, missingShifts, type LogAudit } from './log-checks'
import { standbyLedger, checkHole } from './money-checks'
import { buyCheck, lifeGaps } from './stock-checks'
import { PHOTO_SHIFTS, type ShiftPhoto } from './core/photo-summary'

/* ==========================================================================
 * FINDINGS — one list of what needs doing, for every department
 *
 * XPLORIX Intelligence used to say things in several places: the insight
 * card on each dashboard, the risk register, the inventory alerts. This file
 * gathers them, adds the checks no screen made yet, and gives every finding
 * the same shape: what is wrong, the figures and shifts behind it, the money
 * at stake, who should act, by when, and what to do.
 *
 * Every finding has a stable id, so a person can mark it done or not
 * relevant and it stays that way until the record changes enough to raise
 * it again under a new id.
 *
 * Nothing here is a trained model: each rule reads the company's own record.
 * The same findings are what an AI layer will read later.
 * ========================================================================== */

export type Dept =
  | 'data' | 'operations' | 'maintenance' | 'stock' | 'finance' | 'billing'
  | 'contractors' | 'crew' | 'safety' | 'geology'

export const DEPTS: { key: Dept; label: string; owner: string }[] = [
  { key: 'data', label: 'Drill log quality', owner: 'Supervisor' },
  { key: 'operations', label: 'Operations', owner: 'Site in-charge' },
  { key: 'maintenance', label: 'Maintenance', owner: 'Workshop' },
  { key: 'stock', label: 'Stores and procurement', owner: 'Stores' },
  { key: 'finance', label: 'Costing and finance', owner: 'Finance' },
  { key: 'billing', label: 'Billing and client', owner: 'Billing' },
  { key: 'contractors', label: 'Sub-contractors', owner: 'Contracts' },
  { key: 'crew', label: 'Crew', owner: 'HR' },
  { key: 'safety', label: 'Safety', owner: 'HSE' },
  { key: 'geology', label: 'Core quality', owner: 'Geologist' },
]
export const deptLabel = (d: Dept) => DEPTS.find(x => x.key === d)?.label ?? d
const ownerOf = (d: Dept) => DEPTS.find(x => x.key === d)?.owner ?? 'Owner'

export type Severity = 'act' | 'plan' | 'watch'
export const SEVERITY_LABEL: Record<Severity, string> = { act: 'Act now', plan: 'Plan for it', watch: 'Watch' }

export interface Finding {
  id: string
  dept: Dept
  severity: Severity
  title: string
  detail: string
  action?: string
  owner: string            // a role, or a named person where the record says who
  due?: string             // YYYY-MM-DD, or undefined for "as soon as possible"
  money?: number           // rupees at stake, where it can be put in money
  moneyNote?: string
  evidence?: string[]      // the shifts, holes or orders behind it
  href?: string
  rig?: string
  project?: string
  /* What the finding is about (a part, a hole, a rig, an invoice). Findings
   * that share a subject are one story in the inbox (lib/inbox.ts). */
  subject?: string
  since?: string           // YYYY-MM-DD the thing behind it happened, where known
  tag?: string             // a short kind label, for a department's filters
  kind?: string            // what XPLORIX tracks afterwards to value it (lib/value.ts)
  ref?: Record<string, string | number | string[]>
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const shortDate = (d: string) => {
  const [, m, dd] = d.split('-').map(Number)
  return `${dd} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]}`
}
const shiftLabel = (l: Pick<ShiftLog, 'rig' | 'date' | 'shift'>) => `${l.rig} · ${shortDate(l.date)} ${l.shift.toLowerCase()}`
const fromTone = (t: Insight['tone']): Severity | null => t === 'bad' ? 'act' : t === 'warn' ? 'plan' : t === 'info' ? 'watch' : null

function fromInsight(dept: Dept, key: string, i: Insight, href?: string): Finding | null {
  const severity = fromTone(i.tone)
  if (!severity) return null
  return { id: `${dept}:${key}:${i.id}`, dept, severity, title: i.title, detail: i.detail, action: i.action, owner: ownerOf(dept), href: i.href ?? href }
}

const RISK_DEPT: Record<RiskArea, Dept> = { holes: 'operations', rigs: 'operations', stock: 'stock', money: 'billing', contractors: 'contractors', safety: 'safety' }
function fromRisk(r: ScoredRisk): Finding {
  return {
    id: `risk:${r.key}`, dept: RISK_DEPT[r.area], severity: r.score >= 6 ? 'act' : r.score >= 3 ? 'plan' : 'watch',
    title: r.title.replace(/\.$/, ''), detail: r.detail, action: r.action, owner: ownerOf(RISK_DEPT[r.area]),
    money: r.impact ?? undefined, moneyNote: r.impact != null ? r.impactNote : undefined, href: r.href,
  }
}

export interface FindingsResult {
  findings: Finding[]
  audits: LogAudit[]
  forecast: Forecast
}

export function buildFindings(state: CostingState, inv: InvState, today: string = TODAY): FindingsResult {
  const out: Finding[] = []
  const push = (f: Finding | null) => { if (f && !out.some(x => x.id === f.id)) out.push(f) }
  const window = { project: 'all', rig: 'all', period: '30d' as const }
  const since = addDays(today, -29)
  const forecast = buildForecast(state, inv, today)
  const risks = buildRiskRegister(forecast, state, today)
  risks.forEach(r => push(fromRisk(r)))

  // ── drill log quality ──────────────────────────────────────────────────
  const audits = auditRecord(state, { since: addDays(today, -13) })
  const withStops = audits.filter(a => a.checks.some(c => c.level === 'stop'))
  withStops.slice(0, 12).forEach(a => {
    const stop = a.checks.find(c => c.level === 'stop')!
    push({
      id: `data:stop:${a.log.id}:${stop.id}`, dept: 'data', severity: 'act',
      title: `${shiftLabel(a.log)}: ${stop.title.replace(/\.$/, '')}`,
      detail: [stop.detail, a.checks.length > 1 ? `${plural(a.checks.length - 1, 'more check')} on this shift.` : ''].filter(Boolean).join(' '),
      action: 'Correct the log. Every figure built on it (cost, invoice, forecast) is wrong until then.',
      owner: a.log.supervisor || ownerOf('data'), due: today, evidence: [shiftLabel(a.log)],
      href: `/admin/logs/drill?edit=${encodeURIComponent(a.log.id)}`, rig: a.log.rig, project: a.log.project, since: a.log.date,
      subject: a.log.holeNumber ? `hole:${a.log.holeNumber}` : undefined,
    })
  })
  if (withStops.length > 12) push({
    id: `data:stops-more:${withStops.length}`, dept: 'data', severity: 'act',
    title: `${withStops.length - 12} more shifts with figures that cannot be right`,
    detail: 'See every one on the drill log check screen.', owner: ownerOf('data'), href: '/admin/intelligence/drill-logs',
  })
  // Unusual figures nobody has explained, grouped by kind so thirty become a few lines.
  const byKind: Record<string, { title: string; logs: ShiftLog[] }> = {}
  audits.forEach(a => a.checks.filter(c => c.level === 'warn').forEach(c => {
    const kind = c.id.replace(/^bit-\d+-/, 'bit-')
    ;(byKind[kind] ||= { title: c.title, logs: [] }).logs.push(a.log)
  }))
  const KIND_WORDS: Record<string, string> = {
    'hole-next-shift': 'the next shift does not start where this one ended', 'hole-past-plan': 'drilled past the planned depth',
    'hours-no-metres': 'drilling hours with no metres', 'hmr-vs-hours': 'hour meter and engine hours disagree',
    'driller-day-night': 'the same driller on day and night shifts', 'crew-unusual': 'crew size far from the rig’s usual',
    'speed-unusual': 'drilling speed far from the rig’s own normal', 'speed-record': 'more metres than the rig’s best ever',
    'copy-of-shift': 'every figure identical to an earlier shift', 'core-low': 'core recovery under 80%',
    'core-always-full': '100% core shift after shift', 'ground-unusual': 'ground unlike every hole nearby',
    'standby-no-note': 'client standby with no note', 'breakdown-no-maintenance': 'a breakdown with no maintenance log',
    'fuel-high': 'fuel far above the rig’s normal', 'fuel-engine-off': 'fuel logged with the engine off',
  }
  Object.entries(byKind).sort((a, b) => b[1].logs.length - a[1].logs.length).forEach(([kind, v]) => {
    const n = v.logs.length
    const words = KIND_WORDS[kind] ?? v.title
    const dept: Dept = kind.startsWith('fuel') ? 'finance' : kind === 'standby-no-note' ? 'billing' : kind === 'breakdown-no-maintenance' ? 'maintenance' : kind.startsWith('core') || kind === 'ground-unusual' ? 'geology' : kind === 'driller-day-night' ? 'crew' : 'data'
    push({
      id: `data:warn:${kind}:${n}`, dept, severity: n >= 3 || kind === 'copy-of-shift' ? 'plan' : 'watch',
      title: n === 1 ? `${shiftLabel(v.logs[0])}: ${v.title.replace(/\.$/, '')}` : `${n} shifts in two weeks: ${words}`,
      detail: n === 1 ? 'Saved without a reason.' : `Latest: ${shiftLabel(v.logs.sort((a, b) => b.date.localeCompare(a.date))[0])}. None of them was explained when it was saved.`,
      action: dept === 'billing' ? 'Add a note to each: who asked the rig to wait, and why. It is what the client will ask.'
        : dept === 'finance' ? 'Ask the site where the fuel went. Check the tank and the issue register.'
        : 'Open each shift and either correct it or give the reason.',
      owner: dept === 'data' ? 'Site in-charge' : ownerOf(dept),
      evidence: v.logs.slice(0, 6).map(shiftLabel), href: '/admin/intelligence/drill-logs',
    })
  })
  const missing = missingShifts(state, addDays(today, -6), today)
    .filter(m => !(m.date === today && m.shift === 'Night'))
  const missByRig: Record<string, typeof missing> = {}
  missing.forEach(m => { (missByRig[m.rig] ||= []).push(m) })
  Object.entries(missByRig).forEach(([rig, list]) => push({
    id: `data:missing:${rig}:${list.length}:${list[list.length - 1].date}`, dept: 'data', severity: list.length >= 2 ? 'act' : 'plan',
    title: `${rig}: ${plural(list.length, 'shift')} not logged in the last 7 days`,
    detail: list.slice(0, 4).map(m => `${shortDate(m.date)} ${m.shift.toLowerCase()}`).join(', ') + (list.length > 4 ? ' and more.' : '.'),
    action: 'Ask the supervisor to enter them, or log the rig as stood down. A missing shift is missing metres, cost and billing.',
    owner: 'Site in-charge', due: today, rig, project: list[0].project, href: '/admin/logs/drill', since: list[list.length - 1].date,
  }))

  // ── operations ─────────────────────────────────────────────────────────
  operationsInsights(operations(state, window)).forEach(i => push(fromInsight('operations', '30d', i, '/admin/analytics/operation')))
  forecast.holeFinish.filter(h => h.problem === 'at-depth').forEach(h => push({
    id: `operations:at-depth:${h.hole}`, dept: 'operations', severity: 'act',
    title: `${h.hole} has reached its planned depth but is still open`,
    detail: `${Math.round(h.drilled)} of ${h.planned} m on ${h.rig}. Until the driller ticks “hole closed” it cannot go to the client or be invoiced.`,
    action: 'Close it in the next shift log, or raise the planned depth if the client asked for more.',
    owner: 'Supervisor', due: today, money: h.valueNow, moneyNote: 'waiting to be billed', rig: h.rig, project: h.project, href: '/admin/intelligence/holes',
  }))

  // ── maintenance ────────────────────────────────────────────────────────
  maintenanceInsights(maintenance(state, window)).forEach(i => push(fromInsight('maintenance', '30d', i, '/admin/analytics/maintenance')))
  const SERVICE_EVERY = 250
  const ownRigs = Array.from(new Set(state.shiftLogs.filter(l => !l.contractor && l.date >= since).map(l => l.rig)))
  ownRigs.forEach(rig => {
    const services = (state.maintenance ?? []).filter(m => m.rig === rig && (m.maintenanceType === 'Preventive' || m.maintenanceType === 'Scheduled'))
    const last = services.map(m => m.date).sort().pop()
    const logs = state.shiftLogs.filter(l => l.rig === rig && !l.segmentOf && (!last || l.date > last))
    const hours = logs.reduce((s, l) => s + (l.engineHours ?? (l.drillingHours > 0 ? l.shiftHours : 0)), 0)
    if (hours >= SERVICE_EVERY * 0.9) {
      const standby = state.shiftLogs.filter(l => l.rig === rig && l.date >= addDays(today, -2) && l.standbyMode).length > 0
      push({
        id: `maintenance:service:${rig}:${last ?? 'none'}`, dept: 'maintenance', severity: hours >= SERVICE_EVERY * 1.2 ? 'act' : 'plan',
        title: `${rig}: ${Math.round(hours)} engine hours since ${last ? `its last service on ${shortDate(last)}` : 'any service on record'}`,
        detail: `Service is due every ${SERVICE_EVERY} h (default; set it per rig later). ${hours >= SERVICE_EVERY ? `${Math.round(hours - SERVICE_EVERY)} h overdue.` : 'Due within a few shifts.'}`,
        action: standby ? 'The rig is on client standby now: service it today, while it costs no metres.' : 'Plan the service for the next client standby or rig move, not a drilling day.',
        owner: 'Workshop', due: hours >= SERVICE_EVERY ? today : addDays(today, 3), rig, href: '/admin/logs/maintenance',
      })
    }
  })

  // ── stores and procurement ─────────────────────────────────────────────
  const logs = state.shiftLogs
  const burnMonth = logs.filter(l => l.metresDrilled > 0).map(l => monthOf(l.date)).sort().pop() ?? monthOf(today)
  const burn = RIGS.map(rig => {
    const shifts = logs.filter(l => l.rig === rig && monthOf(l.date) === burnMonth && l.metresDrilled > 0)
    if (!shifts.length) return null
    const days = new Set(shifts.map(s => s.date)).size
    const metres = shifts.reduce((s, l) => s + l.metresDrilled, 0)
    const counts: Record<string, number> = {}
    shifts.forEach(s => { const f = normFormation(s.formationType); counts[f] = (counts[f] ?? 0) + s.metresDrilled })
    const formation = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Hard') as Formation
    return { rig, metresPerDay: Math.round((metres / days) * 10) / 10, formation }
  }).filter(Boolean) as { rig: string; metresPerDay: number; formation: Formation }[]
  const alerts = buildAlerts(inv.pos, inv.catalogue, today, COMPLETED_PROJECTS, burn, inv.alerts, inv.suppliers)
  const stock = stockInStore(inv.pos, today)
  alerts.forEach(a => {
    const partId = a.id.replace(/^(running|low|idle)_/, '')
    if (a.kind === 'runningOut' && out.some(f => f.id === `risk:part_${partId}`)) return
    const severity: Severity = a.level === 'urgent' ? 'act' : a.level === 'warn' ? 'plan' : 'watch'
    // Before buying: is the same part idle somewhere else?
    const elsewhere = a.kind === 'runningOut' || a.kind === 'lowStock'
      ? stock.filter(l => l.itemId === partId && COMPLETED_PROJECTS.includes(l.project) && l.qty > 0) : []
    const spare = elsewhere.reduce((s, l) => s + l.qty, 0)
    push({
      id: `stock:${a.id}`, dept: 'stock', severity, title: a.title, detail: a.detail + (spare ? ` ${spare} sit on a closed project (${elsewhere[0].project}).` : ''),
      action: spare ? `Transfer the ${spare} from ${elsewhere[0].project} before ordering.` : a.kind === 'overdue' || a.kind === 'replacement' ? 'Chase the supplier today, or re-source.' : a.kind === 'idle' || a.kind === 'stranded' ? 'Issue it to a rig or move it to a live project.' : 'Order now.',
      owner: a.kind === 'overdue' || a.kind === 'replacement' || a.kind === 'dueSoon' ? 'Procurement' : 'Stores',
      money: a.value, moneyNote: a.kind === 'idle' || a.kind === 'stranded' ? 'tied up in stock' : 'to order', href: '/admin/inventory',
      kind: a.kind === 'runningOut' ? 'stock-runout' : a.kind === 'stranded' ? 'stranded' : undefined,
      ref: { itemId: partId, ...(a.gapDays != null ? { gapDays: a.gapDays, runsOutOn: addDays(today, a.days ?? 0) } : {}) },
    })
  })

  /* Draft orders for parts that already sit free in another store. */
  inv.pos.filter(po => po.status === 'draft' && po.lines.length).forEach(po => {
    const c = buyCheck(inv.pos, inv.catalogue, po, today, COMPLETED_PROJECTS)
    if (!c.length) return
    const saves = c.reduce((a, x) => a + x.saves, 0)
    push({
      id: `stock:buy-check:${po.id}:${c.map(x => `${x.itemId}x${x.free}`).join(',')}`, dept: 'stock', severity: 'act',
      title: `${po.number} buys ${money(saves)} of parts already in another store`,
      detail: c.map(x => `${x.name}: ordering ${x.ordering}, ${x.free} free on ${Array.from(new Set(x.spares.map(sp => sp.project))).join(', ')}`).join('; ') + '.',
      action: 'Open the order: XPLORIX moves them across in one click and trims the order.',
      owner: 'Procurement', money: saves, moneyNote: 'not spent', href: '/admin/inventory',
      kind: 'buy-check', ref: { poId: po.id, items: c.map(x => x.itemId) }, tag: 'Before you buy',
    })
  })

  /* Parts the ground wears out faster than the catalogue says: every metre in
   * that ground is costed, and quoted, too cheap. */
  lifeGaps(logs, inv.catalogue).slice(0, 5).forEach(g => push({
    id: `stock:life:${g.itemId}:${g.formation}:${g.scrapped}`, dept: 'stock', severity: 'plan',
    title: `${g.name} lasts ${Math.round(g.observedLife)} m in ${g.formation.toLowerCase()} ground, not ${g.catalogueLife} m`,
    detail: `${g.scrapped} used up over ${Math.round(g.metres).toLocaleString('en-US')} m of ${g.formation.toLowerCase()} ground: ${Math.abs(Math.round(g.deltaPct))}% less than the catalogue. Finance and bids still price it at the catalogue life.`,
    action: `Set its life to what the ground gives in the parts catalogue, or take it up with the supplier. Price ${g.formation.toLowerCase()} ground in the next bid at the real figure.`,
    owner: 'Stores', money: Math.round(g.understated), moneyNote: 'cost not in the figures so far', href: '/admin/inventory',
  }))

  // ── costing and finance ────────────────────────────────────────────────
  const card = buildScorecard(state, inv, 'all', 'all')
  dashboardInsights({ rigs: card.rigs.map(r => ({
    name: r.name, kind: r.kind, metres: r.metres, days: r.days, cost: r.cost, revenue: r.revenue, costPerMetre: r.costPerMetre,
    marginPerMetre: r.marginPerMetre, ratePerMetre: r.ratePerMetre, onTargetDays: r.onTargetDays, targetDays: r.targetDays,
  })) }).forEach(i => push(fromInsight('finance', 'all', i, '/admin/finance')))
  consumablesInsights(consumables(state, inv, window)).forEach(i => push(fromInsight(i.id.startsWith('stock') || i.id === 'parts' ? 'stock' : 'finance', '30d', i, '/admin/analytics/consumables')))
  // Fuel against the engine: litres an engine hour, each own rig against the fleet.
  const fuelRate = ownRigs.map(rig => {
    const l = logs.filter(x => x.rig === rig && !x.segmentOf && x.date >= since && (x.engineHours ?? 0) > 0 && x.fuelLitres > 0)
    const fuel = l.reduce((s, x) => s + x.fuelLitres, 0), hours = l.reduce((s, x) => s + (x.engineHours ?? 0), 0)
    return { rig, fuel, hours, rate: hours ? fuel / hours : 0, shifts: l.length }
  }).filter(x => x.shifts >= 6)
  if (fuelRate.length >= 2) {
    const fleet = fuelRate.reduce((s, x) => s + x.fuel, 0) / Math.max(1, fuelRate.reduce((s, x) => s + x.hours, 0))
    fuelRate.filter(x => x.rate > fleet * 1.2).forEach(x => {
      const extra = Math.round(x.fuel - fleet * x.hours)
      push({
        id: `finance:fuel-engine:${x.rig}`, dept: 'finance', severity: x.rate > fleet * 1.4 ? 'act' : 'plan',
        title: `${x.rig} burns ${x.rate.toFixed(1)} L an engine hour; the fleet burns ${fleet.toFixed(1)}`,
        detail: `About ${extra.toLocaleString('en-US')} L more than the fleet rate over ${Math.round(x.hours)} engine hours in 30 days.`,
        action: 'Check the fuel issue register against the logs, then idling and the injectors.',
        owner: 'Finance', rig: x.rig, href: '/admin/analytics/consumables',
      })
    })
  }

  /* An own rig on a running project with no rig cost or no operating cost is
   * costed without it, so every cost a metre and margin for it reads too low. */
  ;(state.projects ?? []).filter(p => p.status === 'active').forEach(p => (p.rigs ?? []).forEach(rig => {
    if ((state.workOrders ?? []).some(w => w.project === p.name && w.rigs.includes(rig))) return
    const noRig = !state.ownership.some(o => o.rig === rig)
    const noOp = !state.operating.some(o => o.rig === rig && o.project === p.name)
    if (!noRig && !noOp) return
    const drilled = logs.some(l => l.rig === rig && l.project === p.name && !l.contractor)
    push({
      id: `finance:no-cost:${rig}:${p.name}:${noRig ? 'r' : ''}${noOp ? 'o' : ''}`, dept: 'finance', severity: drilled ? 'act' : 'plan',
      title: `${rig} on ${p.name} has no ${noRig && noOp ? 'rig or operating cost' : noRig ? 'rig cost' : 'operating cost'}`,
      detail: `Its cost a metre leaves out ${noRig && noOp ? 'the rig itself, fuel and crew' : noRig ? 'the rig itself (price or hire, EMI, insurance)' : 'fuel, crew, lodging and transport'}, so its margin reads too high${drilled ? ' on every shift already logged' : ''}.`,
      action: noRig ? 'Enter the rig cost on the rig, under Rigs.' : 'Enter the operating cost under Rigs and crew on the project.',
      owner: ownerOf('finance'), rig, project: p.name, tag: 'Costs not set',
      href: noRig ? '/admin/rigs' : `/admin/projects/${p.id}?tab=team`,
    })
  }))

  // ── billing and client ─────────────────────────────────────────────────
  ;(state.rateProposals ?? []).filter(p => p.status === 'waiting').forEach(p => push({
    id: `billing:rate:${p.id}`, dept: 'billing', severity: 'plan',
    title: `New rates for ${p.project} are waiting for the client`,
    detail: `Proposed ${shortDate(p.proposedAt.slice(0, 10))}${p.rate.note ? ` (${p.rate.note})` : ''}. Until he accepts, invoices go out at the old rates.`,
    action: 'Follow up with the client this week.', owner: 'Billing', project: p.project, href: '/admin/projects',
  }))

  /* Standby the contract pays for that is on no hole, so on no invoice.
   * The invoice builder in Finance offers these days, once. */
  const sb = standbyLedger(state, inv)
  const loose = sb.days.filter(d => d.state === 'not-on-hole')
  Array.from(new Set(loose.map(d => d.project))).forEach(project => {
    const ds = loose.filter(d => d.project === project)
    const amount = ds.reduce((a, d) => a + d.earned, 0)
    push({
      id: `billing:standby-loose:${project}:${ds.length}:${ds.map(d => d.date).sort().pop()}`, dept: 'billing', severity: 'act',
      title: `${money(amount)} of client standby on ${project} is on no invoice`,
      detail: `${plural(ds.length, 'day')} the client stopped the rig while it was on no hole (${ds.slice(0, 4).map(d => `${d.rig} ${shortDate(d.date)}`).join(', ')}${ds.length > 4 ? '…' : ''}). No hole's bill carries them.`,
      action: 'Add them on the next invoice: Finance offers them when you review it.', owner: 'Billing', project,
      money: amount, moneyNote: 'standby at the contract rate', href: '/admin/intelligence/money',
      subject: `standby:${project}`, kind: 'standby-loose', ref: { project, keys: ds.map(d => d.key) }, tag: 'Standby',
      evidence: ds.map(d => `${d.rig} · ${shortDate(d.date)} · ${d.hours} h${d.noted ? '' : ' · no note'}`),
    })
  })

  /* Closed holes that cannot go to the client because a log behind them
   * cannot be right. */
  const holeNs = Array.from(new Set(logs.filter(l => l.holeNumber && l.holeClosedThisShift).map(l => l.holeNumber as string)))
  const blocked = holeNs.filter(n => {
    const st = state.holeStatus[n]?.status
    return (!st || st === 'closed' || st === 'submitted' || st === 'approved') && !state.holeStatus[n]?.invoiceId
  }).map(n => ({ n, c: checkHole(state, n) })).filter(x => x.c.stops.length > 0)
  if (blocked.length) push({
    id: `billing:holes-blocked:${blocked.map(b => b.n).join(',')}`, dept: 'billing', severity: 'act',
    title: `${plural(blocked.length, 'closed hole')} cannot be billed until ${blocked.length === 1 ? 'its logs are' : 'their logs are'} put right`,
    detail: `${blocked.map(b => `${b.n} (${b.c.stops[0].check.title.replace(/\.$/, '')})`).slice(0, 3).join('; ')}.`,
    action: 'Correct the shifts in the drill log. Finance will not approve or send these holes until then.',
    owner: 'Site in-charge', href: '/admin/intelligence/money',
    evidence: blocked.flatMap(b => b.c.stops.map(x => `${b.n} · ${shiftLabel(x.log)} · ${x.check.title}`)),
  })

  // ── sub-contractors (from the risk register) and crew ──────────────────
  crewInsights(crew(state, window)).forEach(i => push(fromInsight('crew', '30d', i, '/admin/analytics/driller-crew')))
  const drillers = Array.from(new Set(logs.filter(l => !l.segmentOf && l.date >= since && l.driller).map(l => l.driller as string)))
  drillers.forEach(d => {
    const days = Array.from(new Set(logs.filter(l => l.driller === d && !l.segmentOf).map(l => l.date))).sort()
    let run = 0, best = 0, end = ''
    days.forEach((x, i) => { run = i && addDays(days[i - 1], 1) === x ? run + 1 : 1; if (run > best) { best = run; end = x } })
    if (best >= 21 && end >= addDays(today, -2)) push({
      id: `crew:fatigue:${d}:${end}`, dept: 'crew', severity: best >= 28 ? 'act' : 'plan',
      title: `${d} has worked ${best} days in a row`,
      detail: 'Long runs without rest are when drilling slows and incidents happen.',
      action: 'Plan relief and a rest break in the rotation.', owner: 'HR', href: '/admin/analytics/driller-crew',
    })
  })

  // ── safety ─────────────────────────────────────────────────────────────
  safetyInsights(safety(state, window)).filter(i => i.id !== 'count').forEach(i => push(fromInsight('safety', '30d', i, '/admin/analytics/hsc')))

  // ── core quality ───────────────────────────────────────────────────────
  forecast.holeFinish.filter(h => h.state === 'drilling').forEach(h => {
    const runs = logs.filter(l => l.holeNumber === h.hole && l.metresDrilled > 0).sort((a, b) => (a.date + a.shift).localeCompare(b.date + b.shift)).slice(-4)
    const m = runs.reduce((s, l) => s + l.metresDrilled, 0), c = runs.reduce((s, l) => s + l.coreRecovery, 0)
    if (runs.length >= 3 && m > 0 && c / m < 0.9) push({
      id: `geology:recovery:${h.hole}:${runs[runs.length - 1].id}`, dept: 'geology', severity: c / m < 0.8 ? 'act' : 'plan',
      title: `${h.hole}: core recovery ${((c / m) * 100).toFixed(0)}% over the last ${runs.length} shifts`,
      detail: `Under the usual 90% contract band, while the hole is still being drilled (${Math.round(h.drilled)} m).`,
      action: 'Check core lifters, run length and drilling speed now, before more metres are drilled at this recovery.',
      owner: 'Site in-charge', rig: h.rig, project: h.project, href: '/admin/intelligence/drill-logs',
    })
  })

  // ── core quality from the tray photos ───────────────────────────────────
  // Shifts whose core, measured on the tray photo, came up short; and holes
  // where the driller's written recovery is well above what the photos show.
  const byHole = new Map<string, { l: ShiftLog; p: ShiftPhoto }[]>()
  logs.forEach(l => { const p = PHOTO_SHIFTS[l.id]; if (p && l.holeNumber) byHole.set(l.holeNumber, [...(byHole.get(l.holeNumber) ?? []), { l, p }]) })
  byHole.forEach((list, hole) => {
    const low = list.filter(x => x.p.recovery < 85).sort((a, b) => a.p.recovery - b.p.recovery)
    if (low.length) push({
      id: `geology:photo-low:${hole}:${low.map(x => x.l.id).join(',')}`, dept: 'geology', severity: low[0].p.recovery < 80 ? 'act' : 'plan',
      title: `${hole}: ${low.length} shift${low.length > 1 ? 's' : ''} under 85% core on the tray photos`,
      detail: `Worst ${low[0].p.from}–${low[0].p.to} m: ${Math.round(low[0].p.recovery)}% on the photo, RQD ${Math.round(low[0].p.rqd)}%, against ${Math.round(low[0].p.driller)}% written in the drill log (${low[0].l.driller}, ${low[0].l.date} ${low[0].l.shift.toLowerCase()}).`,
      action: 'Look at the trays, mark lost or sampled core, then talk to the crew about lifters, run length and speed in this ground.',
      owner: 'Geologist', rig: low[0].l.rig, project: low[0].l.project, href: `/admin/geology/holes/${hole}`,
    })
    const L = list.reduce((s, x) => s + x.p.photographed, 0)
    const gap = L ? list.reduce((s, x) => s + (x.p.driller - x.p.recovery) * x.p.photographed, 0) / L : 0
    if (list.length >= 5 && gap >= 4) push({
      id: `geology:photo-gap:${hole}:${list.length}`, dept: 'geology', severity: gap >= 8 ? 'act' : 'watch',
      title: `${hole}: drill log recovery ${gap.toFixed(0)} points above the tray photos`,
      detail: `Across ${list.length} shifts with photos. The client sees the photos, so the gap will be asked about.`,
      action: 'Check how the crew measures recovery at the rig; agree one method with the geologist.',
      owner: 'Geologist', rig: list[0].l.rig, project: list[0].l.project, href: `/admin/geology/holes/${hole}`,
    })
  })

  const rank: Record<Severity, number> = { act: 0, plan: 1, watch: 2 }
  out.sort((a, b) => rank[a.severity] - rank[b.severity] || (b.money ?? 0) - (a.money ?? 0))
  return { findings: out, audits, forecast }
}

/* The fleet, rig by rig, ranked by what each metre leaves. */
export function fleetTable(state: CostingState, inv: InvState) {
  return buildScorecard(state, inv, 'all', 'all').rigs
    .filter(r => r.metres > 0)
    .sort((a, b) => b.marginPerMetre - a.marginPerMetre)
}

export const fmtMoney = (n: number) => money(n)
