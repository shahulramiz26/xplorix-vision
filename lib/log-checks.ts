import { shiftOrder, type ShiftLog, type MaintenanceLog, type HolePlan } from './costing-store'
import { normFormation, addDays, TODAY } from './inventory-store'

/* ==========================================================================
 * DRILL LOG CHECKS — the record is only as good as each shift in it
 *
 * Every figure in XPLORIX comes from the shift log. A log that adds up can
 * still be wrong: it starts where the last shift did not end, it is a copy
 * of yesterday, the engine ran four hours and twelve were drilled, or the
 * rig "drilled" twice its best ever. These checks read one shift against
 * the rest of the record and say so, in the supervisor's words.
 *
 * Two levels:
 *   stop   physically impossible, or it breaks the record for someone else.
 *          The log cannot be saved until it is put right.
 *   warn   possible, but unusual. The log can be saved with a short reason,
 *          which stays with the log and is shown wherever it is read.
 *
 * The same function runs in the form as the shift is typed, and over the
 * whole record for the data quality view in XPLORIX Intelligence, so a
 * shift is judged the same way wherever it is seen.
 *
 * Nothing here is a trained model. Each rig is compared with its own record:
 * its own speed in the same ground, its own best shift, its own fuel use.
 * ========================================================================== */

export type CheckLevel = 'stop' | 'warn'
export interface LogCheck {
  id: string            // stable per kind of check, so a reason can be kept against it
  level: CheckLevel
  title: string         // one line, what is wrong
  detail?: string       // the figures behind it
  area: 'hole' | 'hours' | 'engine' | 'crew' | 'speed' | 'core' | 'fuel' | 'stops' | 'bits' | 'timing' | 'approval'
}

/* What a log carries once it has been checked: each warning it was saved
 * with, and the reason given for it. */
export interface LogTrust {
  checkedAt: string
  by: string
  warnings: { id: string; title: string; reason: string }[]
}
export interface LogChange { at: string; by: string; changes: string[]; reason?: string }

export interface CheckState {
  shiftLogs: ShiftLog[]
  maintenance?: MaintenanceLog[]
  holePlans?: Record<string, HolePlan>
  holeStatus?: Record<string, { status: string }>
}

export interface CheckOptions {
  /* Metres on the hole that are in the record but not yet accepted (a
   * contractor's shifts waiting for the site check). */
  pendingOnHole?: number
  isNew?: boolean
  contractor?: boolean
  /* The log as it was before this edit, to see what is changing. */
  before?: ShiftLog
  today?: string
}

const INTERNAL_BREAKDOWN = /mechanical|hydraulic|electrical|breakdown|engine|pump/i
const r1 = (n: number) => Math.round(n * 10) / 10
const r2 = (n: number) => Math.round(n * 100) / 100
const median = (xs: number[]) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const GROUND_STEP: Record<string, number> = { Soft: 0, Medium: 1, Hard: 2, 'Very Hard': 3 }
const shortDay = (d: string) => {
  const [y, m, dd] = d.split('-').map(Number)
  return `${dd} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]}${y !== Number(TODAY.slice(0, 4)) ? ` ${y}` : ''}`
}
const label = (l: Pick<ShiftLog, 'date' | 'shift'>) => `${shortDay(l.date)} ${l.shift.toLowerCase()} shift`

/* The checks for one shift. `log` is the shift as it would be saved. */
export function checkShift(state: CheckState, log: ShiftLog, opt: CheckOptions = {}): LogCheck[] {
  const out: LogCheck[] = []
  const add = (c: LogCheck) => { if (!out.some(x => x.id === c.id)) out.push(c) }
  const today = opt.today ?? TODAY
  const others = state.shiftLogs.filter(l => l.id !== log.id && l.segmentOf !== log.id)
  const order = shiftOrder(log)
  const standby = !!log.standbyMode
  const hole = log.holeNumber
  const metres = log.metresDrilled
  const mStart = log.meterStart ?? 0
  const mEnd = log.meterEnd ?? mStart + metres

  // Whole shifts on the same rig, oldest first (second-hole rows carry no hours).
  const rigShifts = others.filter(l => l.rig === log.rig && !l.segmentOf).sort((a, b) => shiftOrder(a).localeCompare(shiftOrder(b)))
  const before = rigShifts.filter(l => shiftOrder(l) < order)
  const after = rigShifts.filter(l => shiftOrder(l) > order)
  const prev = before[before.length - 1]
  const next = after[0]
  const recent = before.filter(l => l.date >= addDays(log.date, -30))

  // ── the hole ───────────────────────────────────────────────────────────
  if (!standby && hole) {
    const onHole = others.filter(l => l.holeNumber === hole).sort((a, b) => shiftOrder(a).localeCompare(shiftOrder(b)))
    const earlier = onHole.filter(l => shiftOrder(l) < order)
    const stood = r2(earlier.reduce((s, l) => s + l.metresDrilled, 0) + (opt.pendingOnHole ?? 0))
    if (log.meterStart != null && Math.abs(mStart - stood) > 0.5) add({
      id: 'hole-continuity', level: 'stop', area: 'hole',
      title: `${hole} stood at ${stood} m before this shift, but meter start is ${mStart} m.`,
      detail: stood > mStart ? `${r1(stood - mStart)} m would be drilled twice.` : `${r1(mStart - stood)} m would be missing from the hole.`,
    })
    const closedBy = earlier.find(l => l.holeClosedThisShift)
    if (closedBy) add({
      id: 'hole-closed', level: 'stop', area: 'hole',
      title: `${hole} was closed on the ${label(closedBy)} (${closedBy.rig}).`,
      detail: 'Choose the hole the rig is on now, or reopen the hole in Projects.',
    })
    const sameSlot = others.find(l => l.holeNumber === hole && l.rig !== log.rig && l.date === log.date && l.shift === log.shift)
    if (sameSlot) add({
      id: 'hole-two-rigs', level: 'stop', area: 'hole',
      title: `${hole} is logged on ${sameSlot.rig} for the same shift.`,
      detail: 'One hole is drilled by one rig at a time. Check the hole number.',
    })
    const later = onHole.filter(l => shiftOrder(l) > order)[0]
    if (later && later.meterStart != null && Math.abs(later.meterStart - mEnd) > 0.5) add({
      id: 'hole-next-shift', level: 'warn', area: 'hole',
      title: `The next shift on ${hole} (${label(later)}) starts at ${later.meterStart} m, not ${mEnd} m.`,
      detail: 'Saving this changes where the next shift should start. Correct that shift too.',
    })
    const plan = state.holePlans?.[hole]?.plannedDepth
    if (plan && mEnd > plan + Math.max(5, plan * 0.1)) add({
      id: 'hole-past-plan', level: 'warn', area: 'hole',
      title: `This takes ${hole} to ${mEnd} m. It was planned to ${plan} m.`,
      detail: 'Say who asked for the extra depth, so it is billed and not questioned.',
    })
  }

  // ── hours ──────────────────────────────────────────────────────────────
  if (!standby) {
    if (metres > 0 && log.drillingHours <= 0) add({
      id: 'metres-no-hours', level: 'stop', area: 'hours',
      title: `${metres} m drilled with no drilling hours.`,
    })
    if (metres <= 0 && log.drillingHours >= 2) add({
      id: 'hours-no-metres', level: 'warn', area: 'hours',
      title: `${log.drillingHours} h of drilling and no metres.`,
      detail: 'If the rig was reaming, casing or fishing, say so. Otherwise enter the metres or move the hours to downtime.',
    })
  }

  // ── engine ─────────────────────────────────────────────────────────────
  const eh = log.engineHours
  if (eh != null) {
    if (eh > log.shiftHours + 0.01) add({
      id: 'engine-over-shift', level: 'stop', area: 'engine',
      title: `Engine ran ${eh} h in a ${log.shiftHours} h shift.`,
    })
    if (!standby && eh > 0 && log.drillingHours > eh + 0.01) add({
      id: 'drill-over-engine', level: 'stop', area: 'engine',
      title: `${log.drillingHours} h of drilling, but the engine ran ${eh} h.`,
      detail: 'The rig cannot drill with the engine off. Check both figures.',
    })
  }
  const hmr = log.engineHmr
  if (hmr != null && hmr > 0) {
    const lastHmr = [...before].reverse().find(l => (l.engineHmr ?? 0) > 0)
    if (lastHmr && hmr < (lastHmr.engineHmr ?? 0) - 0.5) add({
      id: 'hmr-backwards', level: 'stop', area: 'engine',
      title: `Hour meter ${hmr} is lower than ${lastHmr.engineHmr} on the ${label(lastHmr)}.`,
      detail: 'An hour meter only goes up.',
    })
    const nextHmr = after.find(l => (l.engineHmr ?? 0) > 0)
    if (nextHmr && hmr > (nextHmr.engineHmr ?? 0) + 0.5) add({
      id: 'hmr-after-next', level: 'stop', area: 'engine',
      title: `Hour meter ${hmr} is higher than ${nextHmr.engineHmr} on the later ${label(nextHmr)}.`,
    })
    // Only against the shift right before, so a missing log is not read as a jump.
    if (prev && (prev.engineHmr ?? 0) > 0 && eh != null && isNextSlot(prev, log)) {
      const moved = r1(hmr - (prev.engineHmr ?? 0))
      if (moved >= 0 && Math.abs(moved - eh) > 1.5) add({
        id: 'hmr-vs-hours', level: 'warn', area: 'engine',
        title: `Hour meter moved ${moved} h since the last shift, but engine hours says ${eh} h.`,
        detail: 'One of the two is wrong, or the engine ran between shifts.',
      })
    }
  }

  // ── crew ───────────────────────────────────────────────────────────────
  const driller = (log.driller ?? '').trim().toLowerCase()
  if (driller) {
    const twice = others.find(l => !l.segmentOf && l.rig !== log.rig && l.date === log.date && l.shift === log.shift && (l.driller ?? '').trim().toLowerCase() === driller)
    if (twice) add({
      id: 'driller-two-rigs', level: 'stop', area: 'crew',
      title: `${log.driller} is already logged on ${twice.rig} for this shift.`,
    })
    const otherShift = log.shift === 'Day' ? 'Night' : 'Day'
    const both = others.find(l => !l.segmentOf && l.date === log.date && l.shift === otherShift && (l.driller ?? '').trim().toLowerCase() === driller)
    if (both) add({
      id: 'driller-day-night', level: 'warn', area: 'crew',
      title: `${log.driller} is also on the ${otherShift.toLowerCase()} shift that day (${both.rig}).`,
      detail: '24 hours on the rig is a safety risk, or one log has the wrong driller.',
    })
  }
  const crews = recent.map(l => l.crewCount).filter(n => n > 0)
  if (crews.length >= 6 && log.crewCount > 0) {
    const usual = median(crews)
    if (Math.abs(log.crewCount - usual) >= 3) add({
      id: 'crew-unusual', level: 'warn', area: 'crew',
      title: `Crew of ${log.crewCount}. ${log.rig} usually runs with ${usual}.`,
    })
  }

  // ── speed ──────────────────────────────────────────────────────────────
  if (!standby && metres > 0 && log.drillingHours >= 3) {
    const g = normFormation(log.formationType)
    const peers = recent.filter(l => l.metresDrilled > 0 && l.drillingHours >= 3 && normFormation(l.formationType) === g && l.holeSize === log.holeSize)
    if (peers.length >= 5) {
      const norm = median(peers.map(l => l.metresDrilled / l.drillingHours))
      const rop = metres / log.drillingHours
      if (norm > 0 && (rop > norm * 2 || rop < norm * 0.4)) add({
        id: 'speed-unusual', level: 'warn', area: 'speed',
        title: `${rop.toFixed(2)} m a drilling hour. ${log.rig} usually makes ${norm.toFixed(2)} in ${g.toLowerCase()} ground at ${log.holeSize}.`,
        detail: rop > norm ? 'Check meter start and end, and the drilling hours.' : 'If the bit was worn or the ground changed, say so.',
      })
    }
    const best = Math.max(0, ...before.filter(l => l.metresDrilled > 0).map(l => l.metresDrilled))
    if (before.filter(l => l.metresDrilled > 0).length >= 10 && metres > best * 1.3 && metres - best >= 2) add({
      id: 'speed-record', level: 'warn', area: 'speed',
      title: `${metres} m in one shift. ${log.rig}'s best on record is ${best} m.`,
    })
  }

  // ── copied shifts ──────────────────────────────────────────────────────
  /* A copied log: metres, core, hours, crew, fuel, water and additives all
   * the same as the two shifts before it. Fuel or crew alone repeat in any
   * honest record; every figure three shifts running rarely does. */
  if (!standby && metres > 0) {
    const same = (l: ShiftLog) => !l.standbyMode && l.metresDrilled === metres && l.coreRecovery === log.coreRecovery
      && l.drillingHours === log.drillingHours && l.downtimeHours === log.downtimeHours && l.crewCount === log.crewCount
      && l.fuelLitres === log.fuelLitres && l.waterLitres === log.waterLitres && l.additivesKg === log.additivesKg
    const last2 = before.slice(-2)
    if (last2.length === 2 && last2.every(same)) add({
      id: 'copy-of-shift', level: 'warn', area: 'timing',
      title: `Every figure matches the two shifts before it (${label(last2[0])} and ${label(last2[1])}).`,
      detail: 'Metres, core, hours, crew, fuel, water and additives all the same three shifts running. Check these are not copies.',
    })
  }

  // ── core ───────────────────────────────────────────────────────────────
  if (!standby && metres >= 2) {
    const pct = (log.coreRecovery / metres) * 100
    if (pct < 80) add({
      id: 'core-low', level: 'warn', area: 'core',
      title: `Core recovery ${pct.toFixed(0)}%.`,
      detail: 'Most contracts deduct below 90%. Say what happened (broken ground, worn lifter, blocked tube).',
    })
    const lastRuns = before.filter(l => l.metresDrilled >= 2).slice(-5)
    if (pct >= 99.99 && lastRuns.length === 5 && lastRuns.every(l => l.coreRecovery >= l.metresDrilled - 0.001)) add({
      id: 'core-always-full', level: 'warn', area: 'core',
      title: '100% core recovery for six shifts in a row.',
      detail: 'Possible in good ground, but it often means core is not being measured.',
    })
  }

  // ── ground ─────────────────────────────────────────────────────────────
  if (!standby && hole && metres > 0 && log.formationType) {
    const mid = (mStart + mEnd) / 2
    const near = others.filter(l => l.project === log.project && l.holeNumber && l.holeNumber !== hole && l.metresDrilled > 0 && l.meterStart != null && l.formationType
      && (l.meterStart ?? 0) - 10 <= mid && ((l.meterEnd ?? (l.meterStart ?? 0) + l.metresDrilled) + 10) >= mid)
    const holes = new Set(near.map(l => l.holeNumber))
    if (holes.size >= 3) {
      const count: Record<string, number> = {}
      near.forEach(l => { const g = normFormation(l.formationType); count[g] = (count[g] ?? 0) + 1 })
      const usual = Object.entries(count).sort((a, b) => b[1] - a[1])[0][0]
      const mine = normFormation(log.formationType)
      if (Math.abs((GROUND_STEP[usual] ?? 0) - (GROUND_STEP[mine] ?? 0)) >= 2) add({
        id: 'ground-unusual', level: 'warn', area: 'core',
        title: `${mine} ground at ${Math.round(mid)} m. ${holes.size} other holes on this project were ${usual.toLowerCase()} at this depth.`,
        detail: 'Ground sets the rate the client pays. Check the formation.',
      })
    }
  }

  // ── stops ──────────────────────────────────────────────────────────────
  const lines = log.downtime ?? []
  const clientH = lines.filter(d => d.side === 'client').reduce((s, d) => s + d.hours, 0)
  if (clientH >= 4 && !(log.notes ?? '').trim()) add({
    id: 'standby-no-note', level: 'warn', area: 'stops',
    title: `${clientH} h of client standby with no note.`,
    detail: 'Say who asked the rig to wait and why. It is what makes standby billable without an argument.',
  })
  const ownBreak = lines.filter(d => d.side === 'internal' && INTERNAL_BREAKDOWN.test(d.reason)).reduce((s, d) => s + d.hours, 0)
  if (!opt.contractor && ownBreak >= 4 && !(state.maintenance ?? []).some(m => m.rig === log.rig && m.date >= addDays(log.date, -1) && m.date <= addDays(log.date, 1))) add({
    id: 'breakdown-no-maintenance', level: 'warn', area: 'stops',
    title: `${ownBreak} h of breakdown and no maintenance log for ${log.rig}.`,
    detail: 'Log the repair in Maintenance too, so the failure and its cost are on record.',
  })

  // ── fuel ───────────────────────────────────────────────────────────────
  if (!opt.contractor && eh != null && eh > 0 && log.fuelLitres > 0) {
    const peers = recent.filter(l => (l.engineHours ?? 0) > 0 && l.fuelLitres > 0).map(l => l.fuelLitres / (l.engineHours ?? 1))
    if (peers.length >= 6) {
      const norm = median(peers), now = log.fuelLitres / eh
      if (now > norm * 1.6) add({
        id: 'fuel-high', level: 'warn', area: 'fuel',
        title: `${log.fuelLitres} L for ${eh} engine hours: ${now.toFixed(0)} L an hour. ${log.rig} usually burns ${norm.toFixed(0)}.`,
        detail: `About ${Math.round(log.fuelLitres - norm * eh)} L more than normal. Say where it went (a pump, a generator, a top-up).`,
      })
    }
  }
  if (!opt.contractor && (eh === 0) && log.fuelLitres >= 50) add({
    id: 'fuel-engine-off', level: 'warn', area: 'fuel',
    title: `${log.fuelLitres} L of fuel with the engine at 0 h.`,
  })

  // ── bits ───────────────────────────────────────────────────────────────
  if (!standby) (log.bitRuns ?? []).forEach((b, i) => {
    if (b.meterEnd < b.meterStart) add({ id: `bit-${i}-backwards`, level: 'stop', area: 'bits', title: `Bit line ${i + 1}: meter end is less than meter start.` })
    else if (log.meterStart != null && (b.meterStart < mStart - 0.5 || b.meterEnd > mEnd + 0.5)) add({
      id: `bit-${i}-outside`, level: 'stop', area: 'bits',
      title: `Bit line ${i + 1} runs ${b.meterStart}–${b.meterEnd} m, outside this shift's ${mStart}–${mEnd} m.`,
    })
  })

  // ── timing ─────────────────────────────────────────────────────────────
  if (opt.isNew && log.date < addDays(today, -1)) {
    const days = Math.round((Date.parse(today) - Date.parse(log.date)) / 86400000)
    add({
      id: 'logged-late', level: 'warn', area: 'timing',
      title: `This shift is ${days} days old.`,
      detail: 'Say why it is logged late. Late logs are where mistakes creep in.',
    })
  }

  // ── after approval ─────────────────────────────────────────────────────
  if (opt.before && hole) {
    const st = state.holeStatus?.[opt.before.holeNumber ?? hole]?.status
    if (st && ['submitted', 'approved', 'invoiced', 'paid'].includes(st)) add({
      id: 'edit-after-approval', level: 'warn', area: 'approval',
      title: `${opt.before.holeNumber ?? hole} is already ${st === 'submitted' ? 'with the client' : st}. This changes what the client ${st === 'submitted' ? 'is checking' : 'agreed'}.`,
      detail: 'Say why. The change and the reason are kept on the log.',
    })
  }

  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'stop' ? -1 : 1))
}

/* Is `l` the shift right after `prev` on the same rig (no shift missing)? */
function isNextSlot(prev: ShiftLog, l: ShiftLog) {
  if (prev.shift === 'Day') return l.date === prev.date && l.shift === 'Night'
  return l.date === addDays(prev.date, 1) && l.shift === 'Day'
}

/* What changed between two versions of a log, in plain words. */
export function describeChanges(a: ShiftLog, b: ShiftLog): string[] {
  const out: string[] = []
  const f = (k: keyof ShiftLog, name: string, unit = '') => {
    const x = a[k], y = b[k]
    if ((x ?? '') !== (y ?? '') && !(typeof x === 'number' && typeof y === 'number' && Math.abs(x - y) < 0.001))
      out.push(`${name}: ${x ?? '—'}${x != null && unit ? ` ${unit}` : ''} → ${y ?? '—'}${y != null && unit ? ` ${unit}` : ''}`)
  }
  f('holeNumber', 'Hole'); f('meterStart', 'Meter start', 'm'); f('meterEnd', 'Meter end', 'm')
  f('metresDrilled', 'Metres', 'm'); f('coreRecovery', 'Core', 'm'); f('formationType', 'Formation')
  f('drillingHours', 'Drilling hours', 'h'); f('downtimeHours', 'Downtime', 'h'); f('downtimeSide', 'Downtime side')
  f('engineHmr', 'Hour meter'); f('engineHours', 'Engine hours', 'h'); f('fuelLitres', 'Fuel', 'L')
  f('crewCount', 'Crew'); f('driller', 'Driller'); f('holeClosedThisShift', 'Hole closed')
  return out
}

/* ── the whole record ────────────────────────────────────────────────────── */

export interface LogAudit {
  log: ShiftLog
  checks: LogCheck[]
  explained: number     // warnings that were saved with a reason
}

/* Every whole shift in the record, checked as if it were being saved now.
 * Warnings the supervisor already explained when saving are kept apart. */
export function auditRecord(state: CheckState, opts: { since?: string; project?: string; rig?: string } = {}): LogAudit[] {
  const logs = state.shiftLogs.filter(l => !l.segmentOf
    && (!opts.since || l.date >= opts.since) && (!opts.project || l.project === opts.project) && (!opts.rig || l.rig === opts.rig))
  return logs.map(l => {
    const checks = checkShift(state, l, { contractor: !!l.contractor })
    const said = new Set((l.trust?.warnings ?? []).map(w => w.id))
    return { log: l, checks: checks.filter(c => c.level === 'stop' || !said.has(c.id)), explained: checks.filter(c => c.level === 'warn' && said.has(c.id)).length }
  })
}

/* Shifts that should be in the record and are not: a rig that logged on the
 * days around a slot but not in it. */
export function missingShifts(state: CheckState, from: string, to: string = TODAY): { rig: string; project: string; date: string; shift: 'Day' | 'Night' }[] {
  const out: { rig: string; project: string; date: string; shift: 'Day' | 'Night' }[] = []
  const byRig: Record<string, ShiftLog[]> = {}
  state.shiftLogs.filter(l => !l.segmentOf).forEach(l => { (byRig[l.rig] ||= []).push(l) })
  Object.entries(byRig).forEach(([rig, logs]) => {
    const have = new Set(logs.map(l => `${l.date}|${l.shift}`))
    const dates = logs.map(l => l.date).sort()
    const first = dates[0] > from ? dates[0] : from
    const last = dates[dates.length - 1]
    for (let d = first; d <= to && d <= last; d = addDays(d, 1)) {
      ;(['Day', 'Night'] as const).forEach(s => {
        if (!have.has(`${d}|${s}`)) {
          const project = logs.filter(l => l.date <= d).sort((a, b) => shiftOrder(b).localeCompare(shiftOrder(a)))[0]?.project ?? logs[0].project
          out.push({ rig, project, date: d, shift: s })
        }
      })
    }
  })
  return out
}

/* How each supervisor's logs stand: on time, clean, explained, corrected. */
export interface SupervisorScore {
  name: string; shifts: number; clean: number; explained: number; open: number; edited: number; late: number
}
export function supervisorScores(audits: LogAudit[]): SupervisorScore[] {
  const by: Record<string, SupervisorScore> = {}
  audits.forEach(a => {
    const name = a.log.supervisor || 'Not named'
    const s = (by[name] ||= { name, shifts: 0, clean: 0, explained: 0, open: 0, edited: 0, late: 0 })
    s.shifts += 1
    if (a.checks.length === 0 && a.explained === 0) s.clean += 1
    if (a.explained > 0) s.explained += 1
    if (a.checks.length > 0) s.open += 1
    if (a.log.editedAt || (a.log.history?.length ?? 0) > 0) s.edited += 1
    if (a.log.loggedAt && a.log.loggedAt.slice(0, 10) > addDays(a.log.date, 1)) s.late += 1
  })
  return Object.values(by).sort((a, b) => b.shifts - a.shifts)
}

/* ==========================================================================
 * CHECKED BY XPLORIX — the mark another company can rely on
 *
 * A hole is checked when every shift on it passes the checks, or was saved
 * with a reason for what was unusual. Where the full shift is at hand (the
 * company's own screens, the demo) the checks are run again now. Where it is
 * not (the client's login, which never receives fuel or engine figures) the
 * stamp saved with the shift is read instead: a shift cannot be saved past a
 * check that stops it, so a stamped shift passed when it was logged.
 * ========================================================================== */

export type ShiftVerdict = 'pass' | 'explained' | 'open' | 'stop' | 'unchecked'

/* `live` is false when the record at hand has had the working figures taken
 * out (the client's login); the stamp is read instead. */
export const isFullRecord = (state: CheckState) => state.shiftLogs.some(l => l.engineHours != null || l.fuelLitres > 0)

export function shiftVerdict(state: CheckState, l: ShiftLog, live: boolean = isFullRecord(state)): ShiftVerdict {
  if (live) {
    const checks = checkShift(state, l, { contractor: !!l.contractor })
    if (checks.some(c => c.level === 'stop')) return 'stop'
    const said = new Set((l.trust?.warnings ?? []).map(w => w.id))
    const warns = checks.filter(c => c.level === 'warn')
    if (warns.some(c => !said.has(c.id))) return 'open'
    return warns.length ? 'explained' : 'pass'
  }
  if (l.trust) return l.trust.warnings.length ? 'explained' : 'pass'
  return 'unchecked'
}

export interface HoleVerdict { shifts: number; checked: number; open: number; stops: number; ok: boolean }

export function holeVerdict(state: CheckState, hole: string): HoleVerdict {
  const logs = state.shiftLogs.filter(l => !l.segmentOf && (l.holeNumber === hole || l.nextHole?.holeNumber === hole))
  const live = isFullRecord(state)
  const v = logs.map(l => shiftVerdict(state, l, live))
  const checked = v.filter(x => x === 'pass' || x === 'explained').length
  return { shifts: logs.length, checked, open: v.filter(x => x === 'open').length, stops: v.filter(x => x === 'stop').length, ok: logs.length > 0 && checked === logs.length }
}
