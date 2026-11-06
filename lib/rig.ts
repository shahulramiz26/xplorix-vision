/* ==========================================================================
 * THE RIGS, LIVE (simulated)
 *
 * No rig sends readings yet, so each rig runs a small repeatable model of
 * itself: the bit goes down at a speed set by the rock and the settings,
 * torque and water follow the ground, the engine warms with load, the bit
 * and the water pump wear. The rock comes from the real cored holes around
 * the rig, so broken ground arrives where the core says it is. A few rigs
 * play out what a real sensor feed shows every week: a bit blocking, an
 * engine losing its cooling, a pump wearing out, a crew waiting for the
 * client with the engine running. What the crew (or Copilot) does changes
 * what happens next, which is how Copilot checks its own advice.
 * ========================================================================== */

import { DATA, holeOf, projectOf, normalRop, type Rig } from './data'
import { rockAhead, groundAt, type Metre } from './ground'

export interface Settings { rpm: number; wob: number; flow: number }
export const NORMAL: Settings = { rpm: 880, wob: 22, flow: 46 }
export const EASED: Settings = { rpm: 760, wob: 16, flow: 52 }
export const LIMITS = { rpm: [650, 1050], wob: [12, 32], flow: [30, 65] } as const

export type Mode = 'drilling' | 'standby' | 'flushing' | 'tripping' | 'stopped'
export interface Reading { t: number; rpm: number; wob: number; torque: number; pressure: number; flow: number; rop: number; engine: number; fuel: number }

export interface Live {
  rig: Rig; ahead: Metre[]; baseRop: number
  t: number                                // simulated seconds since the feed opened
  mode: Mode; modeLeft: number             // seconds left in a timed mode (flush, bit trip)
  engineOn: boolean; settings: Settings
  depth: number; startDepth: number
  bitUsed: number; bitLife: number
  pump: number                             // 1 = new; falls as it wears
  blockage: number                         // 0–1: core or cuttings jamming the bit
  cooling: number                          // 1 = fine; falls with a cooling fault
  coreLoss: number; stalled: number
  drillSecs: number; standbySecs: number; idleSecs: number; litres: number
  standbyReason: string | null; standbyFrom: number | null
  now: Reading; history: Reading[]         // one reading a minute, last 60 minutes
  script: Script
}
export interface Script { blockAt?: number; coolingFrom?: number; pumpWear?: number; standbyUntil?: number }

const SCRIPTS: Record<string, Script> = {
  'CP-01': { blockAt: 6 * 60 },                        // the bit starts to block after 6 minutes
  'RIG-002': { coolingFrom: 14 * 60 },                 // the radiator starts to fail after 14 minutes
  'RIG-003': { pumpWear: 0.0015 },                     // the water pump loses about 3.6% of its output a day
  'CP-02': { standbyUntil: 9e9 },                      // waiting for the geologist, engine running
}

const noise = (t: number, ch: number) => Math.sin(t * 0.011 + ch * 1.9) * 0.5 + Math.sin(t * 0.037 + ch * 0.4) * 0.3 + Math.sin(t * 0.13 + ch) * 0.2

export function openRig(rig: Rig): Live {
  const hole = holeOf(rig)
  const p = projectOf(rig)
  const ahead = hole ? rockAhead(hole, p.holes, 0, Math.ceil(Math.max(rig.holePlanned ?? 0, rig.holeDrilled) + 40)) : []
  const script = SCRIPTS[rig.rig] ?? {}
  const standby = script.standbyUntil != null
  const live: Live = {
    rig, ahead, baseRop: normalRop(rig, rig.formation), t: 0,
    mode: standby ? 'standby' : 'drilling', modeLeft: 0, engineOn: true, settings: { ...NORMAL },
    depth: rig.holeDrilled, startDepth: rig.holeDrilled, bitUsed: rig.bitUsed, bitLife: rig.bitLife,
    pump: script.pumpWear ? 0.9 : 1, blockage: 0, cooling: 1, coreLoss: 0, stalled: 0,
    drillSecs: 0, standbySecs: 0, idleSecs: 0, litres: 0,
    standbyReason: standby ? 'Geologist Standby' : null, standbyFrom: standby ? -38 * 60 : null,
    now: { t: 0, rpm: 0, wob: 0, torque: 0, pressure: 0, flow: 0, rop: 0, engine: 84, fuel: 70 }, history: [], script,
  }
  // Build the last hour so the trends have something to show from the first second
  let x = live
  const back: Reading[] = []
  for (let i = 60; i > 0; i--) { x = tick({ ...x, t: -i * 60 }, 60, true); back.push(x.now) }
  return { ...x, t: 0, history: back, depth: rig.holeDrilled, startDepth: rig.holeDrilled, coreLoss: 0, drillSecs: 0, standbySecs: 0, idleSecs: standby ? 38 * 60 : 0, litres: 0, bitUsed: rig.bitUsed, blockage: 0, cooling: 1 }
}

/* Advance `dt` simulated seconds. `warm` = building the hour before the screen opened. */
export function tick(s: Live, dt: number, warm = false): Live {
  const t = s.t + dt
  const sc = s.script
  let { mode, modeLeft, blockage, cooling, pump, depth, bitUsed, coreLoss, stalled, drillSecs, standbySecs, idleSecs, litres } = s
  if (!warm) {
    if (sc.blockAt != null && t > sc.blockAt && mode === 'drilling') blockage = Math.min(1, blockage + dt / 1500)
    if (sc.coolingFrom != null && t > sc.coolingFrom) cooling = Math.max(0.35, cooling - dt / 2400)
  }
  if (sc.pumpWear) pump = Math.max(0.6, pump - sc.pumpWear * dt / 3600)
  if (modeLeft > 0) { modeLeft -= dt; if (modeLeft <= 0) { modeLeft = 0; if (mode === 'flushing') { mode = 'drilling'; blockage = 0 } else if (mode === 'tripping') { mode = 'drilling'; bitUsed = 0 } } }

  const set = s.settings
  const n = (ch: number) => noise(t, ch)
  let r: Reading
  if (mode === 'drilling') {
    const g = groundAt(s.ahead, depth)
    const eased = set.rpm <= 800 && set.wob <= 18
    const wear = Math.min(1, bitUsed / s.bitLife)
    const load = (set.rpm / NORMAL.rpm) * 0.45 + (set.wob / NORMAL.wob) * 0.55
    let rop = s.baseRop * (g === 'good' ? 1 : g === 'hard' ? 0.7 : 0.57) * load * (1 - 0.35 * wear * wear) * (1 - 0.65 * blockage)
    let torque = 640 * (set.wob / NORMAL.wob) * (g === 'hard' ? 1.15 : 1) + n(1) * 35 + blockage * 260
    if (g === 'broken') { torque += 120 + Math.abs(noise(t * 2.3, 7)) * (eased ? 90 : 340); rop *= eased ? 0.92 : 0.62 }
    stalled = torque > 1250 ? stalled + dt : 0
    if (stalled > 0) rop *= 0.3
    const flow = set.flow * pump - blockage * 26 + n(3) * 1.2
    const pressure = 17 * (set.flow / NORMAL.flow) * (0.4 + 0.6 * pump) + blockage * 19 + (g === 'broken' && !eased ? 3 : 0) + n(4) * 0.5
    const engineTarget = 80 + 6 * load + (1 - cooling) * (load > 0.85 ? 34 : 14)
    const engine = s.now.engine + (engineTarget - s.now.engine) * Math.min(1, dt / 600) + n(6) * 0.15
    const m = rop * dt / 3600
    depth += m; bitUsed += m; drillSecs += dt
    if (g === 'broken') coreLoss += (eased ? 0.08 : 0.35) * m
    litres += 18 * load * dt / 3600
    r = { t, rpm: set.rpm + n(5) * 14, wob: set.wob + n(7) * 0.7, torque, pressure, flow, rop, engine, fuel: Math.max(5, s.now.fuel - 18 * load * dt / 3600 / 4) }
  } else if (mode === 'flushing') {
    const flow = 62 * pump + n(3), pressure = 12 + n(4) * 0.5
    r = { t, rpm: 120, wob: 0, torque: 180 + n(1) * 20, pressure, flow, rop: 0, engine: s.now.engine + (82 - s.now.engine) * Math.min(1, dt / 600), fuel: s.now.fuel - 10 * dt / 3600 / 4 }
    blockage = Math.max(0, blockage - dt / 120); litres += 10 * dt / 3600
  } else {
    // standby, tripping or stopped: no drilling; the engine idles only if it is left on
    const idle = s.engineOn && mode !== 'stopped'
    if (mode === 'standby') standbySecs += dt
    if (idle) { idleSecs += mode === 'standby' ? dt : 0; litres += 9 * dt / 3600 }
    const target = idle ? 74 : 40
    r = { t, rpm: mode === 'tripping' ? 60 : 0, wob: 0, torque: 0, pressure: 0, flow: 0, rop: 0, engine: s.now.engine + (target - s.now.engine) * Math.min(1, dt / 900) + n(6) * 0.1, fuel: s.now.fuel - (idle ? 9 : 0) * dt / 3600 / 4 }
  }
  const history = !warm && Math.floor(t / 60) !== Math.floor(s.t / 60) ? [...s.history.slice(-59), r] : s.history
  return { ...s, t, mode, modeLeft, blockage, cooling, pump, depth, bitUsed, coreLoss, stalled, drillSecs, standbySecs, idleSecs, litres, now: r, history }
}

export function clampSettings(x: Settings): Settings {
  const c = (v: number, [a, b]: readonly [number, number]) => Math.max(a, Math.min(b, v))
  return { rpm: c(x.rpm, LIMITS.rpm), wob: c(x.wob, LIMITS.wob), flow: c(x.flow, LIMITS.flow) }
}

/* Live cost a metre: this rig's cost an hour (its hole's cost a metre at its
 * normal speed) over the speed it is making right now. */
export function liveCost(s: Live) {
  const hole = holeOf(s.rig)
  const cpms = projectOf(s.rig).holes.map(h => h.cpm).filter((x): x is number => x != null).sort((a, b) => a - b)
  const cpm = hole?.cpm ?? cpms[Math.floor(cpms.length / 2)] ?? 450
  const perHour = cpm * s.baseRop
  return { perHour, perMetre: s.now.rop > 0.02 ? perHour / s.now.rop : null, base: cpm }
}

export const RIGS = DATA.rigs
