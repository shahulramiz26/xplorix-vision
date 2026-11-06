/* ==========================================================================
 * DOWNHOLE SURVEYS
 *
 * A survey reading says which way the hole was pointing at a depth: azimuth
 * (compass bearing) and dip (angle from flat, negative down). Readings reach
 * XPLORIX three ways, and all three end in the same list:
 *
 *   log      the supervisor writes the reading on the shift's drill log
 *   manual   the office types it on the hole's Survey tab
 *   import   a file exported from the survey tool: IMDEX, Reflex, Devico,
 *            a local gyro or a spreadsheet. Any layout works: the columns
 *            are recognised by name, or matched once by hand and the match
 *            kept as a tool profile for next time.
 *
 * A reading counts only once it is approved. A reading from the shift log or
 * a file arrives "to check"; the office or geologist approves it. A reading
 * the office types itself is approved as it is saved.
 *
 * Readings written on a shift log stay on the log. Approving or rejecting one
 * writes a record into `surveys` under the id log_<logId>_<n>, so the log is
 * never edited by the approval and the supervisor's own record stays his.
 * ========================================================================== */

import {
  minimumCurvature, deviation, plannedPoint, collarLatLon, normAz,
  type Collar, type CoordSystem, type PathPoint, type Deviation, type Station,
} from './geo'

export type SurveyStatus = 'pending' | 'approved' | 'rejected'
export type SurveySource = 'log' | 'manual' | 'import'

/* What the supervisor writes on the drill log. */
export interface ShiftSurvey { depth: number; azimuth: number; dip: number; tool?: string }

export interface SurveyReading {
  id: string
  hole: string
  project: string
  depth: number
  azimuth: number
  dip: number
  tool?: string
  takenOn?: string           // YYYY-MM-DD, when the tool says it was taken
  source: SurveySource
  file?: string              // the file it came from, for an import
  by: string
  at: string                 // YYYY-MM-DDTHH:MM, when it reached XPLORIX
  status: SurveyStatus
  decidedBy?: string
  decidedAt?: string
  note?: string              // why it was rejected
  logId?: string             // a reading from a shift log: which log
}

/* How one tool's export is laid out, kept so the next file from the same tool
 * needs no matching. */
export type AngleConvention = 'dip-negative' | 'dip-positive' | 'inclination'
export interface SurveyProfile {
  id: string
  name: string
  columns: { hole: string; depth: string; azimuth: string; dip: string; tool?: string; date?: string }
  units: 'm' | 'ft'
  angle: AngleConvention
}

export const SURVEY_TOOLS = ['Gyro (north-seeking)', 'Gyro', 'Magnetic multishot', 'Magnetic single shot', 'IMDEX', 'Reflex', 'Devico', 'Other']

/* The parts of the costing state this file reads. Kept loose so it can be
 * called with the store's state as it is. */
interface Plan { plannedDepth: number; project?: string; collar?: Collar; azimuth?: number; dip?: number }
interface Log { id: string; holeNumber: string | null; project: string; date: string; shift: string; metresDrilled: number; meterEnd?: number; supervisor?: string; loggedBy?: string; loggedAt?: string; surveys?: ShiftSurvey[]; segmentOf?: string; holeClosedThisShift?: boolean }
interface Proj { name: string; coords?: CoordSystem; utmZone?: string }
export interface SurveyState {
  shiftLogs: Log[]
  holePlans: Record<string, Plan>
  surveys?: SurveyReading[]
  projects?: Proj[]
}

const r1 = (v: number) => Math.round(v * 10) / 10

/* Every reading on a hole, from every source, with its status. */
export function holeReadings(state: SurveyState, hole: string): SurveyReading[] {
  const stored = (state.surveys ?? []).filter(s => s.hole === hole)
  const byId = new Map(stored.map(s => [s.id, s]))
  const onLogs = new Set<string>()
  const fromLogs: SurveyReading[] = []
  state.shiftLogs.forEach(l => {
    if (l.segmentOf || l.holeNumber !== hole || !l.surveys?.length) return
    l.surveys.forEach((s, i) => {
      const id = `log_${l.id}_${i}`
      onLogs.add(id)
      const decided = byId.get(id)
      fromLogs.push({
        id, hole, project: l.project, depth: s.depth, azimuth: s.azimuth, dip: s.dip, tool: s.tool,
        takenOn: l.date, source: 'log', by: l.supervisor || l.loggedBy || 'Supervisor', at: l.loggedAt ?? `${l.date}T00:00`,
        status: decided?.status ?? 'pending', decidedBy: decided?.decidedBy, decidedAt: decided?.decidedAt, note: decided?.note, logId: l.id,
      })
    })
  })
  /* A decision record for a log reading is not a reading of its own, while
   * the log is there to read. Without the log (the client is sent approved
   * readings, not the supervisor's log entries) the record stands alone: it
   * carries the reading as it was approved. */
  const own = stored.filter(s => s.source !== 'log' || !onLogs.has(s.id))
  return [...own, ...fromLogs].sort((a, b) => a.depth - b.depth || a.at.localeCompare(b.at))
}

/* Every reading waiting for a decision, across the company. */
export function pendingReadings(state: SurveyState): SurveyReading[] {
  const holes = new Set<string>()
  ;(state.surveys ?? []).forEach(s => holes.add(s.hole))
  state.shiftLogs.forEach(l => { if (l.holeNumber && l.surveys?.length) holes.add(l.holeNumber) })
  return Array.from(holes).flatMap(h => holeReadings(state, h)).filter(r => r.status === 'pending')
}

/* How deep a hole is, from the shift record. */
export function drilledDepth(state: SurveyState, hole: string) {
  let d = 0
  state.shiftLogs.forEach(l => {
    if (l.holeNumber !== hole) return
    d = Math.max(d, l.meterEnd ?? 0)
  })
  const sum = state.shiftLogs.filter(l => l.holeNumber === hole).reduce((s, l) => s + l.metresDrilled, 0)
  return r1(Math.max(d, sum))
}

export interface SurveyWarning { id: string; tone: 'warn' | 'bad' | 'info'; title: string; detail: string }

export interface HoleSurvey {
  hole: string
  project?: string
  plan?: { azimuth: number; dip: number }
  collar?: Collar
  latLon: { lat: number; lon: number } | null
  plannedDepth?: number
  drilled: number
  readings: SurveyReading[]
  approved: SurveyReading[]
  path: PathPoint[]             // the hole as surveyed, carried on to the drilled depth
  planned: { depth: number; e: number; n: number; tvd: number }[]
  deviation: Deviation | null
  lastSurveyed: number          // depth of the deepest approved reading
  maxDls: number                // sharpest bend, degrees every 30 m
  warnings: SurveyWarning[]
}

/* Limits used for the warnings. Industry practice varies by programme; these
 * are cautious defaults, written here so they are easy to change. */
export const SURVEY_LIMITS = {
  gap: 50,            // metres drilled past the last survey before it is called overdue
  angleWarn: 3, angleBad: 6,          // degrees off the planned direction
  dlsWarn: 3,         // degrees every 30 m
  offWarnPct: 5,      // metres off plan as a percentage of the depth
}

export function holeSurvey(state: SurveyState, hole: string): HoleSurvey {
  const plan = state.holePlans[hole]
  const project = plan?.project ?? state.shiftLogs.find(l => l.holeNumber === hole)?.project
  const proj = (state.projects ?? []).find(p => p.name === project)
  const readings = holeReadings(state, hole)
  const approved = readings.filter(r => r.status === 'approved')
  const drilled = drilledDepth(state, hole)
  const planDir = plan?.azimuth != null && plan?.dip != null ? { azimuth: normAz(plan.azimuth), dip: plan.dip } : undefined
  const stations: Station[] = approved.map(r => ({ depth: r.depth, azimuth: r.azimuth, dip: r.dip }))
  const lastSurveyed = stations.length ? Math.max(...stations.map(s => s.depth)) : 0
  const path = stations.length ? minimumCurvature(stations, { start: planDir, to: drilled > lastSurveyed ? drilled : undefined }) : []
  const to = Math.max(drilled, plan?.plannedDepth ?? 0, lastSurveyed)
  const planned = planDir && to > 0
    ? [0, to].map(depth => ({ depth, ...plannedPoint(planDir, depth) }))
    : []
  const measured = path.filter(p => !p.projected)
  const dev = planDir && measured.length > 1 ? deviation(measured, planDir) : null
  const maxDls = measured.reduce((m, p) => Math.max(m, p.dls), 0)

  const warnings: SurveyWarning[] = []
  const pending = readings.filter(r => r.status === 'pending').length
  if (pending) warnings.push({ id: 'pending', tone: 'info', title: `${pending} ${pending === 1 ? 'reading is' : 'readings are'} waiting to be checked`, detail: 'Only approved readings draw the hole path. Check them in the table below.' })
  if (!planDir) warnings.push({ id: 'noplan', tone: 'info', title: 'No planned direction', detail: 'Set the planned azimuth and dip on the project’s Holes tab to measure how far the hole has drifted.' })
  const finished = state.shiftLogs.some(l => l.holeNumber === hole && l.holeClosedThisShift)
  if (finished && drilled > 0 && drilled - lastSurveyed > SURVEY_LIMITS.gap) {
    warnings.push({
      id: 'gap', tone: 'info',
      title: lastSurveyed ? `The deepest ${r1(drilled - lastSurveyed)} m have no approved survey` : 'The hole was finished with no approved survey',
      detail: `${lastSurveyed ? `The last approved reading is at ${r1(lastSurveyed)} m of the ${r1(drilled)} m drilled.` : `${r1(drilled)} m drilled.`} An end-of-hole survey fixes where the hole finished.`,
    })
  } else if (drilled > 0 && drilled - lastSurveyed > SURVEY_LIMITS.gap) {
    warnings.push({
      id: 'gap', tone: 'warn',
      title: lastSurveyed ? `${r1(drilled - lastSurveyed)} m drilled since the last survey` : `${r1(drilled)} m drilled and no approved survey`,
      detail: `The last ${lastSurveyed ? `approved reading is at ${r1(lastSurveyed)} m` : 'reading has not been taken or approved'}. Survey every ${SURVEY_LIMITS.gap} m or so, so drift is caught while it can still be corrected.`,
    })
  }
  if (dev) {
    const pct = dev.depth > 0 ? (dev.metres / dev.depth) * 100 : 0
    if (dev.angle >= SURVEY_LIMITS.angleWarn || pct >= SURVEY_LIMITS.offWarnPct) {
      const way = [
        Math.abs(dev.azimuthDrift) >= 0.5 ? `${Math.abs(r1(dev.azimuthDrift))}° ${dev.azimuthDrift > 0 ? 'clockwise' : 'anticlockwise'} of plan` : '',
        Math.abs(dev.dipDrift) >= 0.5 ? `${Math.abs(r1(dev.dipDrift))}° ${dev.dipDrift > 0 ? 'flatter' : 'steeper'}` : '',
      ].filter(Boolean).join(' and ')
      warnings.push({
        id: 'dev', tone: dev.angle >= SURVEY_LIMITS.angleBad ? 'bad' : 'warn',
        title: `${r1(dev.metres)} m off the planned line at ${r1(dev.depth)} m`,
        detail: `The hole points ${r1(dev.angle)}° away from plan${way ? `: ${way}` : ''}. Tell the geologist before the next run, while the target can still be reached.`,
      })
    }
  }
  if (maxDls >= SURVEY_LIMITS.dlsWarn) {
    const at = measured.find(p => p.dls === maxDls)
    warnings.push({ id: 'dls', tone: 'warn', title: `Sharp bend: ${r1(maxDls)}° every 30 m`, detail: `Near ${r1(at?.depth ?? 0)} m. Sharp bends wear rods and make the next trip harder.` })
  }

  return {
    hole, project, plan: planDir, collar: plan?.collar,
    latLon: collarLatLon(plan?.collar, proj?.coords, proj?.utmZone),
    plannedDepth: plan?.plannedDepth, drilled, readings, approved, path, planned, deviation: dev, lastSurveyed, maxDls, warnings,
  }
}

// ── importing a file ──────────────────────────────────────────────────────

/* A text table: CSV, semicolon, tab or pipe separated. Quoted fields with
 * separators or new lines inside them are kept whole. */
export function parseTable(text: string): string[][] {
  const clean = text.replace(/^﻿/, '')
  const sample = clean.split(/\r?\n/).slice(0, 10).join('\n')
  const seps = [',', ';', '\t', '|']
  const sep = seps.map(s => ({ s, n: sample.split(s).length })).sort((a, b) => b.n - a.n)[0].s
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && cell === '') quoted = true
    else if (ch === sep) { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some(c => c.trim() !== '')) rows.push(row.map(c => c.trim()))
      row = []
    } else cell += ch
  }
  row.push(cell)
  if (row.some(c => c.trim() !== '')) rows.push(row.map(c => c.trim()))
  return rows
}

/* The header row is the first row that names at least a depth and a direction
 * column: some tools print a title or the job details above it. */
export function findHeader(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const g = guessColumns(rows[i])
    if (g.depth && (g.azimuth || g.dip)) return i
  }
  return 0
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '')
/* Names the common tools and spreadsheets use for each column. */
const NAMES: Record<keyof SurveyProfile['columns'], RegExp[]> = {
  hole: [/^(hole|holeid|holeno|holenumber|holename|bhid|bh|dhid|drillhole|drillholeid|well|wellname|boreholeid|borehole|hid|siteid)$/],
  depth: [/^(depth|md|measureddepth|surveydepth|station|stationdepth|at|atdepth|depthm|depthft|mdm|mdft|alongholedepth|ahd|distance|from|todepth)$/, /depth/],
  azimuth: [/^(azimuth|azi|az|azim|azimuthdeg|azm|azgrid|azimuthgrid|gridazimuth|trueazimuth|azimuthtrue|aztrue|magazimuth|azimuthmag|azmag|bearing|correctedazimuth)$/, /azi/],
  dip: [/^(dip|dipdeg|inclination|incl|inc|incdeg|tilt|angle|dipangle)$/, /^(dip|incl|inc)/],
  tool: [/^(tool|tooltype|instrument|surveytool|toolname|method|surveytype|surveymethod|type)$/],
  date: [/^(date|surveydate|datetime|time|timestamp|taken|takenon|surveyedon)$/],
}
export function guessColumns(headers: string[]): Partial<SurveyProfile['columns']> {
  const out: Partial<SurveyProfile['columns']> = {}
  const used = new Set<string>()
  ;(Object.keys(NAMES) as (keyof SurveyProfile['columns'])[]).forEach(k => {
    for (const re of NAMES[k]) {
      const h = headers.find(x => !used.has(x) && re.test(norm(x)))
      if (h) { out[k] = h; used.add(h); break }
    }
  })
  return out
}
/* What the header says about angle and unit, when it says anything. */
export function guessAngle(header?: string): AngleConvention | undefined {
  const n = norm(header ?? '')
  if (/^inc/.test(n)) return 'inclination'
  return undefined
}
export function guessUnits(header?: string): 'm' | 'ft' | undefined {
  const h = (header ?? '').toLowerCase()
  if (/\bft\b|feet|\(ft\)|_ft/.test(h)) return 'ft'
  if (/\bm\b|metre|meter|\(m\)|_m\b/.test(h)) return 'm'
  return undefined
}

/* A profile that fits these headers, if one was saved for them. */
export function profileFor(profiles: SurveyProfile[], headers: string[]): SurveyProfile | undefined {
  const set = new Set(headers)
  return profiles.find(p => [p.columns.hole, p.columns.depth, p.columns.azimuth, p.columns.dip].every(c => c && set.has(c)))
}

export const num = (s: string | undefined) => {
  if (s == null) return NaN
  const t = s.replace(/[°\s]/g, '').replace(/,(?=\d{3}\b)/g, '')
  // "45,5" with a comma decimal (common in European exports)
  const v = Number(/^-?\d+,\d+$/.test(t) ? t.replace(',', '.') : t)
  return t === '' ? NaN : v
}

/* A date as the tool wrote it → YYYY-MM-DD, when it can be read. */
function isoDate(s?: string) {
  if (!s) return undefined
  const t = s.trim()
  // A date Excel saved as its day number (days since 30 Dec 1899).
  if (/^\d{5}(\.\d+)?$/.test(t)) { const n = Number(t); if (n > 20000 && n < 80000) return new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10) }
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return undefined
}

export interface ImportRow {
  line: number                  // row number in the file, for the user
  hole: string
  depth: number; azimuth: number; dip: number
  tool?: string; takenOn?: string
  problem?: string              // set when the row cannot be saved
  note?: string                 // set when the row can be saved but needs a look
}

/* Rows of the file → readings in XPLORIX's own terms, each checked. */
export function readImport(rows: string[][], headerAt: number, profile: Omit<SurveyProfile, 'id' | 'name'>, ctx: {
  holes: Record<string, { drilled: number; planned?: number }>   // the holes this company knows
  existing: { hole: string; depth: number }[]                     // readings already in XPLORIX
  holeOverride?: string                                           // a file for one hole with no hole column
}): ImportRow[] {
  const head = rows[headerAt] ?? []
  const col = (name?: string) => (name ? head.indexOf(name) : -1)
  const ix = { hole: col(profile.columns.hole), depth: col(profile.columns.depth), azimuth: col(profile.columns.azimuth), dip: col(profile.columns.dip), tool: col(profile.columns.tool), date: col(profile.columns.date) }
  const known = new Map(Object.keys(ctx.holes).map(h => [h.toUpperCase(), h]))
  const seen = new Set<string>()
  const already = new Set(ctx.existing.map(e => `${e.hole}|${r1(e.depth)}`))
  const ft = profile.units === 'ft' ? 0.3048 : 1
  return rows.slice(headerAt + 1).map((r, i) => {
    const raw = ctx.holeOverride ?? (ix.hole >= 0 ? r[ix.hole] ?? '' : '')
    const hole = known.get(raw.trim().toUpperCase()) ?? raw.trim().toUpperCase()
    const d = num(r[ix.depth]) * ft
    const az = num(r[ix.azimuth])
    const a = num(r[ix.dip])
    let dip = a
    if (profile.angle === 'inclination') dip = a - 90
    else if (profile.angle === 'dip-positive') dip = -Math.abs(a)
    const row: ImportRow = {
      line: headerAt + i + 2, hole, depth: r1(d), azimuth: Math.round(normAz(az) * 100) / 100, dip: Math.round(dip * 100) / 100,
      tool: ix.tool >= 0 ? r[ix.tool] || undefined : undefined, takenOn: ix.date >= 0 ? isoDate(r[ix.date]) : undefined,
    }
    if (!raw.trim()) row.problem = 'No hole number'
    else if (!known.has(raw.trim().toUpperCase())) row.problem = `${hole} is not a hole in XPLORIX`
    else if (!isFinite(d)) row.problem = 'Depth is not a number'
    else if (d < 0) row.problem = 'Depth is below zero'
    else if (!isFinite(az)) row.problem = 'Azimuth is not a number'
    else if (az < 0 || az > 360) row.problem = 'Azimuth must be between 0 and 360'
    else if (!isFinite(a)) row.problem = profile.angle === 'inclination' ? 'Inclination is not a number' : 'Dip is not a number'
    else if (profile.angle === 'inclination' && (a < 0 || a > 180)) row.problem = 'Inclination must be between 0 and 180'
    else if (profile.angle !== 'inclination' && (a < -90 || a > 90)) row.problem = 'Dip must be between −90 and 90'
    else if (profile.angle === 'dip-negative' && a > 0) row.note = 'Dip is upward. Check whether this tool writes dip as positive downward.'
    if (!row.problem) {
      const key = `${hole}|${row.depth}`
      const info = ctx.holes[hole]
      if (seen.has(key)) row.problem = 'Same hole and depth appear twice in the file'
      else if (already.has(key)) row.problem = 'A reading at this depth is already in XPLORIX'
      else if (info && info.drilled > 0 && row.depth > info.drilled + 1) row.note = `Deeper than the ${r1(info.drilled)} m drilled so far`
      seen.add(key)
    }
    return row
  })
}

/* A survey file as text, whatever it came in. CSV and text files are read as
 * they are; a spreadsheet (.xlsx) is read by its first sheet. */
export async function fileToRows(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) {
    const { readXlsx } = await import('./xlsx-lite')
    try { return readXlsx(await file.arrayBuffer()) } catch (e) { throw new Error(`The spreadsheet could not be read. Save it as CSV and upload again.${e instanceof Error && e.message ? ` (${e.message})` : ''}`) }
  }
  if (name.endsWith('.xls')) throw new Error('Old Excel files (.xls) cannot be read. Save it as .xlsx or CSV and upload again.')
  return parseTable(await file.text())
}
