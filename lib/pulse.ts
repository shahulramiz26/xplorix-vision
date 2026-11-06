/* ==========================================================================
 * XPLORIX PULSE — live rig sensors (simulated feed)
 *
 * What the Pulse screen would show once rigs carry sensors: rotation, bit
 * load, torque, water pressure and flow, penetration, engine and fuel, read
 * every couple of seconds through a gateway on the rig.
 *
 * No rig sends anything yet, so every reading here is made up by a small,
 * repeatable model: each rig gets its own steady "signature" from its name,
 * follows what its drill log says it is doing today (drilling, standby,
 * breakdown, parked), and a few rigs play out a pattern a real sensor would
 * catch — a bit blocking, an engine running hot, broken ground, an engine
 * idling on standby. The screen says plainly that the feed is simulated.
 *
 * Swap point: replace `reading()` with the latest values from the rig
 * gateway and keep everything else.
 * ========================================================================== */

import type { RigRow } from './admin-overview'

export type MetricKey = 'rpm' | 'wob' | 'torque' | 'pressure' | 'flow' | 'rop' | 'engine' | 'fuel'
export interface Metric {
  key: MetricKey; label: string; unit: string; min: number; max: number
  lo: number; hi: number; dp: number; drilling: boolean
  /* One line on why this is worth measuring, shown under "Sensors fitted". */
  how: string
}
export const METRICS: Record<MetricKey, Metric> = {
  rpm: { key: 'rpm', label: 'Rotation', unit: 'rpm', min: 0, max: 1400, lo: 500, hi: 1150, dp: 0, drilling: true, how: 'Hall-effect pickup on the drill head' },
  wob: { key: 'wob', label: 'Bit load', unit: 'kN', min: 0, max: 60, lo: 12, hi: 38, dp: 1, drilling: true, how: 'Pressure transducer on the feed cylinder' },
  torque: { key: 'torque', label: 'Torque', unit: 'N·m', min: 0, max: 1600, lo: 250, hi: 1050, dp: 0, drilling: true, how: 'Pressure on the rotation motor' },
  pressure: { key: 'pressure', label: 'Water pressure', unit: 'bar', min: 0, max: 60, lo: 8, hi: 28, dp: 1, drilling: true, how: 'Inline transducer after the water pump' },
  flow: { key: 'flow', label: 'Water flow', unit: 'L/min', min: 0, max: 90, lo: 30, hi: 65, dp: 0, drilling: true, how: 'Flow meter on the pump line' },
  rop: { key: 'rop', label: 'Penetration', unit: 'm/h', min: 0, max: 12, lo: 2.5, hi: 9, dp: 1, drilling: true, how: 'Depth encoder on the feed frame' },
  engine: { key: 'engine', label: 'Engine temp', unit: '°C', min: 40, max: 115, lo: 70, hi: 95, dp: 0, drilling: false, how: 'Engine computer (CAN bus)' },
  fuel: { key: 'fuel', label: 'Fuel', unit: '%', min: 0, max: 100, lo: 20, hi: 100, dp: 0, drilling: false, how: 'Tank level sender' },
}
export const METRIC_KEYS = Object.keys(METRICS) as MetricKey[]

export type Mode = 'drilling' | 'standby' | 'breakdown' | 'offline' | 'parked'
export type Scenario = 'normal' | 'water' | 'heat' | 'ground' | 'idleburn'
export type Level = 'good' | 'warn' | 'bad' | 'neutral'

export interface PulseRig {
  rig: string; project: string | null; hole: string | null
  mode: Mode; scenario: Scenario; seed: number
  startDepth: number
  logged: number | null       // metres in today's shift logs
  sensorBase: number          // metres the depth sensor counted before the screen opened
  fuel0: number
  signal: number              // bars, 0–4
}

/* The demo shift clock: the screen opens at 14:20 on the fixed demo day and
 * runs on in real time from there. */
export const OPEN_AT = 14 * 3600 + 20 * 60
const ONSET = OPEN_AT - 14 * 60   // when the scripted patterns began

export function clock(t: number, secs = true) {
  const s = Math.floor(t) % 86400
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}${secs ? ':' + p(s % 60) : ''}`
}

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
/* A repeatable number in [-1, 1] for a rig, a channel and a moment. */
function noise(seed: number, ch: number, step: number) {
  let x = (seed ^ Math.imul(ch + 1, 0x9e3779b1) ^ Math.imul(step, 0x85ebca6b)) >>> 0
  x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d); x ^= x >>> 12; x = Math.imul(x, 0x297a2d39); x ^= x >>> 15
  return ((x >>> 0) / 4294967295) * 2 - 1
}
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const ramp = (t: number, over = 900) => clamp((t - ONSET) / over, 0, 1)

/* Which rig plays which part, from today's logs. */
export function buildFleet(rigs: RigRow[]): PulseRig[] {
  let drillingSeen = 0, noShiftSeen = 0, normalLogged = 0
  const parts: Scenario[] = ['normal', 'water', 'heat', 'ground']   // each pattern once; the rest run normal
  return rigs.map(r => {
    const seed = hash(r.rig)
    const logged = r.day == null && r.night == null ? null : (r.day ?? 0) + (r.night ?? 0)
    let mode: Mode
    if (r.status === 'drilling' || r.status === 'to-check') mode = 'drilling'
    else if (r.status === 'standby') mode = 'standby'
    else if (r.status === 'breakdown') mode = 'breakdown'
    else if (r.status === 'idle') mode = 'parked'
    else mode = noShiftSeen++ === 0 ? 'drilling' : 'offline'   // one rig drilling with no log in yet
    let scenario: Scenario = 'normal'
    if (mode === 'drilling') scenario = parts[drillingSeen++] ?? 'normal'
    if (mode === 'standby') scenario = 'idleburn'
    /* Sensor metres before 14:20: close to the log, with one rig a little over. */
    const drift = 1 + noise(seed, 99, 1) * 0.015
    let sensorBase = 0
    if (logged != null) {
      const over = scenario === 'normal' && logged > 0 && normalLogged++ === 0
      sensorBase = Math.round((over ? logged + Math.max(3.5, logged * 0.11) : logged * drift) * 10) / 10
    } else if (mode === 'drilling') sensorBase = Math.round((r.last7PerDay ?? 30) * 0.55 * 10) / 10
    return {
      rig: r.rig, project: r.project, hole: r.hole, mode, scenario, seed,
      startDepth: r.holeDrilled || 0, logged, sensorBase,
      fuel0: 46 + Math.round((noise(seed, 7, 3) + 1) * 20), signal: mode === 'offline' ? 0 : 2 + Math.round((noise(seed, 8, 2) + 1)),
    }
  })
}

const BASE: Record<MetricKey, number> = { rpm: 880, wob: 24, torque: 640, pressure: 17, flow: 46, rop: 5.4, engine: 85, fuel: 0 }
const SWING: Record<MetricKey, number> = { rpm: 45, wob: 2.2, torque: 70, pressure: 1.4, flow: 2.5, rop: 0.55, engine: 0.8, fuel: 0 }

/* One reading. `t` is seconds into the demo day. */
export function reading(p: PulseRig, k: MetricKey, t: number): number | null {
  if (p.mode === 'offline' || p.mode === 'parked') return k === 'fuel' ? p.fuel0 : null
  const ch = METRIC_KEYS.indexOf(k)
  const step = Math.floor(t / 2)
  const own = 1 + noise(p.seed, ch, 0) * 0.12              // this rig's own level
  const wave = Math.sin(t / (240 + ch * 37) + (p.seed % 97)) * SWING[k] * 0.8
  const jitter = noise(p.seed, ch, step) * SWING[k] * 0.6
  if (k === 'fuel') {
    const burn = p.mode === 'drilling' ? 0.045 : p.mode === 'standby' ? 0.014 : 0
    return clamp(p.fuel0 - burn * (t - ONSET) / 60, 3, 100)
  }
  if (k === 'engine') {
    if (p.mode === 'breakdown') return clamp(78 - (t - ONSET) / 60 * 0.9, 36, 90)
    let v = (p.mode === 'standby' ? 74 : BASE.engine * own) + wave * 0.6 + jitter * 0.5
    if (p.scenario === 'heat') v += 13 * ramp(t, 1500)
    return v
  }
  if (p.mode !== 'drilling') return 0
  let v = BASE[k] * own + wave + jitter
  const r = ramp(t)
  if (p.scenario === 'water') {
    if (k === 'pressure') v += 17 * r
    if (k === 'flow') v -= 27 * r
    if (k === 'rop') v *= 1 - 0.55 * r
    if (k === 'torque') v += 180 * r
  }
  if (p.scenario === 'ground') {
    if (k === 'torque') v += noise(p.seed, 20, Math.floor(t / 6)) * 330 + 160
    if (k === 'rop') v *= 0.42
    if (k === 'rpm') v *= 0.86
    if (k === 'wob') v *= 0.8
  }
  return Math.max(0, v)
}

/* Depth of the bit, and metres the sensor has counted today. */
export function depthAt(p: PulseRig, t: number) {
  if (p.mode !== 'drilling') return p.startDepth
  const avg = BASE.rop * (p.scenario === 'water' ? 0.62 : p.scenario === 'ground' ? 0.42 : 1)
  return p.startDepth + avg * Math.max(0, t - OPEN_AT) / 3600
}
export function sensorMetres(p: PulseRig, t: number) {
  return p.sensorBase + (depthAt(p, t) - p.startDepth)
}

export function level(m: Metric, v: number | null, mode: Mode): Level {
  if (v == null) return 'neutral'
  if (m.drilling && mode !== 'drilling') return 'neutral'
  if (v >= m.lo && v <= m.hi) return 'good'
  const span = m.max - m.min
  return v < m.lo - span * 0.1 || v > m.hi + span * 0.08 ? 'bad' : 'warn'
}

export function history(p: PulseRig, k: MetricKey, t: number, minutes = 30) {
  const out: { t: number; v: number | null }[] = []
  for (let i = minutes; i >= 0; i--) out.push({ t: t - i * 60, v: reading(p, k, t - i * 60) })
  return out
}

export const MODE_LABEL: Record<Mode, string> = {
  drilling: 'Drilling', standby: 'Standby, engine on', breakdown: 'Engine off, breakdown', offline: 'No signal', parked: 'Parked',
}

/* ── ESG from the rig: diesel, CO₂ and water since the shift began ──────── *
 * Fuel burn by what the rig is doing (drilling, idling on standby, off),
 * CO₂ from diesel at the standard factor, and water from the flow meter
 * while drilling. Same simulated model as the readings above.            */

export const SHIFT_START = 7 * 3600
export const CO2_KG_PER_LITRE = 2.68       // diesel, tank to exhaust
const DRILL_LITRES_HOUR = 18

export interface Esg {
  rig: string; metres: number
  diesel: number | null; idle: number | null; co2: number | null
  co2PerMetre: number | null; water: number | null
}

export function esgToday(p: PulseRig, t: number): Esg {
  const metres = sensorMetres(p, t)
  if (p.mode === 'offline') return { rig: p.rig, metres, diesel: null, idle: null, co2: null, co2PerMetre: null, water: null }
  const own = 1 + noise(p.seed, 30, 0) * 0.1
  const h = (a: number, b: number) => Math.max(0, b - a) / 3600
  let drillH = 0, idleH = 0
  if (p.mode === 'drilling') drillH = h(SHIFT_START, t)
  if (p.mode === 'standby') { const idleFrom = ONSET - 32 * 60; drillH = h(SHIFT_START, idleFrom); idleH = h(idleFrom, t) }
  if (p.mode === 'breakdown') drillH = h(SHIFT_START, ONSET - 95 * 60)
  const idle = idleH * IDLE_LITRES_HOUR
  const diesel = drillH * DRILL_LITRES_HOUR * own + idle
  const co2 = diesel * CO2_KG_PER_LITRE
  const water = drillH * BASE.flow * 60 * own
  return { rig: p.rig, metres, diesel, idle, co2, co2PerMetre: metres >= 1 ? co2 / metres : null, water }
}

/* ── Alarms, each with the reading behind it and what to do ─────────────── */

export interface Alarm {
  id: string; rig: string; level: 'act' | 'watch'; since: number
  title: string; why: string; todo: string; href: string; action: string
  key?: MetricKey
}
const r1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString('en-US')
const r0 = (n: number) => Math.round(n).toLocaleString('en-US')
export const DIESEL_PER_LITRE = 1.62   // SAR, matches the seeded operating rates
export const IDLE_LITRES_HOUR = 9

export function alarms(fleet: PulseRig[], t: number): Alarm[] {
  const out: Alarm[] = []
  fleet.forEach(p => {
    const at = (k: MetricKey, s = t) => reading(p, k, s) ?? 0
    const before = t - 15 * 60
    if (p.scenario === 'water' && ramp(t) > 0.35) out.push({
      id: `${p.rig}-water`, rig: p.rig, level: 'act', since: ONSET + 300, key: 'pressure',
      title: `Water pressure up, return flow down at ${r0(depthAt(p, t))} m`,
      why: `Pressure has gone from **${r1(at('pressure', before))} to ${r1(at('pressure'))} bar** in 15 minutes while flow fell from **${r0(at('flow', before))} to ${r0(at('flow'))} L/min**, and penetration slowed to **${r1(at('rop'))} m/h**. Together that usually means the bit is blocking: core jammed in the tube, or water lost into open ground.`,
      todo: 'Ask the driller to pull back and flush before the next run. If return water is lost, add mud or polymer. Check this depth against the core for broken ground.',
      href: '/admin/logs/drill', action: 'Open drill logs',
    })
    if (p.scenario === 'heat' && at('engine') > 93) {
      const rate = (at('engine') - at('engine', t - 600)) / 10
      const mins = rate > 0.05 ? Math.round((105 - at('engine')) / rate) : null
      out.push({
        id: `${p.rig}-heat`, rig: p.rig, level: at('engine') > 97 ? 'act' : 'watch', since: ONSET + 600, key: 'engine',
        title: `Engine running hot: ${r0(at('engine'))} °C and rising`,
        why: `Engine temperature is up **${r1(at('engine') - at('engine', t - 1800))} °C in 30 minutes** with the same rotation and load, so it is not working harder: cooling is falling behind.${mins ? ` At this rate it reaches the 105 °C cut-out in about **${mins} minutes**.` : ''}`,
        todo: 'Check coolant and blow out the radiator screen at the next rod change. If it keeps climbing, stop before the cut-out rather than after it.',
        href: '/admin/logs/maintenance', action: 'Open maintenance',
      })
    }
    if (p.scenario === 'ground') out.push({
      id: `${p.rig}-ground`, rig: p.rig, level: 'watch', since: ONSET + 120, key: 'torque',
      title: `Broken ground likely from ${r0(p.startDepth)} m`,
      why: `Torque is swinging between **${r0(BASE.torque * 0.9)} and ${r0(BASE.torque * 1.6)} N·m** and penetration is down to **${r1(at('rop'))} m/h** with bit load held. That is what fractured or faulted rock feels like at the bit; core recovery often drops through it.`,
      todo: 'Ease the bit load and shorten runs through this section. Tell the geologist so the trays from here are checked first.',
      href: '/admin/geology/rock-mass', action: 'Open rock mass',
    })
    if (p.scenario === 'idleburn') {
      const mins = Math.round((t - ONSET + 32 * 60) / 60)
      const litres = mins / 60 * IDLE_LITRES_HOUR
      out.push({
        id: `${p.rig}-idle`, rig: p.rig, level: 'watch', since: ONSET - 32 * 60, key: 'engine',
        title: `Engine idling on standby for ${mins} minutes`,
        why: `The rig is on standby with no rotation, but the engine has been running for **${mins} minutes**. At about ${IDLE_LITRES_HOUR} L an hour idling that is **${r0(litres)} L of diesel, about SAR ${r0(litres * DIESEL_PER_LITRE)}**, for no metres.`,
        todo: 'Ask the crew to switch off while they wait, unless they need it for lights or heating.',
        href: '/admin/rigs', action: 'Open rigs',
      })
    }
    if (p.mode === 'breakdown') out.push({
      id: `${p.rig}-down`, rig: p.rig, level: 'act', since: ONSET - 95 * 60,
      title: `Engine off since ${clock(ONSET - 95 * 60, false)}`,
      why: `The last readings before it stopped: rotation dropped to zero, then the engine. Nothing has come from the drill head since, and the engine is cooling at **${r0(at('engine'))} °C**.`,
      todo: 'The breakdown is already in the drill log. Use the stop time here to check the downtime the shift reports.',
      href: '/admin/logs/maintenance', action: 'Open maintenance',
    })
    const sm = sensorMetres(p, t)
    if (p.logged != null && p.logged > 0 && sm - p.logged > Math.max(2, p.logged * 0.06)) out.push({
      id: `${p.rig}-gap`, rig: p.rig, level: 'watch', since: OPEN_AT,
      title: `Depth sensor counts ${r1(sm - p.logged)} m more than the shift log`,
      why: `The shift log says **${r1(p.logged)} m** today; the depth sensor has counted **${r1(sm)} m**. Either a run is missing from the log, or the reported metres were rounded down.`,
      todo: 'Ask the supervisor to check the runs against the core blocks before the log is approved.',
      href: '/admin/logs/drill', action: 'Open drill logs',
    })
  })
  /* Rigs drilling with no checked shift log: one alarm for all of them. */
  const nolog = fleet.filter(p => p.logged == null && p.mode === 'drilling')
  if (nolog.length) {
    const m = nolog.reduce((s, p) => s + sensorMetres(p, t), 0)
    out.push({
      id: 'nolog', rig: nolog[0].rig, level: 'watch', since: OPEN_AT,
      title: `${nolog.length === 1 ? `${nolog[0].rig} is` : `${nolog.length} rigs are`} drilling with no checked shift log`,
      why: `The sensors show ${nolog.map(p => `**${p.rig}** at ${r1(sensorMetres(p, t))} m`).join(', ')} today, **${r1(m)} m** in all, but no shift log for them has been checked yet.`,
      todo: 'Check the reported shifts against these sensor metres, or remind the supervisor to send one.',
      href: '/admin/logs/drill', action: 'Open drill logs',
    })
  }
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'act' ? -1 : 1))
}
