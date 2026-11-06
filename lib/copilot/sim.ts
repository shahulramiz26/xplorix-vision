/* ==========================================================================
 * XPLORIX COPILOT — THE RIG, SIMULATED
 *
 * No rig sends live readings yet, so the cockpit runs a small, repeatable
 * model of one: the bit goes down at a rate set by the rock and by the
 * settings, torque and water follow the ground, the engine warms with load
 * and the bit wears metre by metre. The rock comes from the ground model
 * (the real cored holes around), so broken ground arrives where the radar
 * said it would. The screen says plainly that the feed is simulated.
 *
 * What the driller (or Copilot, at autopilot levels 2–3) does changes what
 * happens next: easing rotation and bit load through broken ground keeps
 * torque steady and the core whole; leaving them up costs metres and core.
 * That is what lets Copilot check whether its own advice worked.
 * ========================================================================== */

import type { AheadMetre } from './ground'

export interface Settings { rpm: number; wob: number; flow: number }
export type Ground = 'good' | 'broken' | 'hard'

export interface RigState {
  t: number                         // seconds of simulated drilling
  depth: number                     // bit depth, m
  settings: Settings
  rpm: number; wob: number; torque: number; pressure: number; flow: number
  rop: number                       // m/h right now
  engine: number                    // °C
  bitUsed: number                   // metres on this bit
  bitLife: number                   // metres the bit is rated for
  ground: Ground
  coreLoss: number                  // metres of core likely lost so far in broken ground
  stalled: number                   // seconds stuck (torque over the limit)
  drillingSecs: number
  metresToday: number
  baseRop: number                   // this rig's normal m/h in good ground, from its own shift logs
}

export const NORMAL: Settings = { rpm: 880, wob: 22, flow: 46 }
export const BROKEN_SETTINGS: Settings = { rpm: 760, wob: 16, flow: 52 }
export const LIMITS = { rpm: [650, 1050], wob: [12, 32], flow: [30, 65] } as const

/* The rock at a depth, from the prediction (metres not covered: good rock). */
export function groundAt(ahead: AheadMetre[], d: number): Ground {
  const m = ahead.find(x => d >= x.from && d < x.to)
  if (!m || !m.from_.length) return 'good'
  return m.broken ? 'broken' : m.ff > 5 ? 'hard' : 'good'
}

function noise(t: number, ch: number) {
  return Math.sin(t * 0.7 + ch * 1.9) * 0.5 + Math.sin(t * 1.9 + ch * 0.4) * 0.3 + Math.sin(t * 4.3 + ch) * 0.2
}

export function start(depth: number, bitUsed: number, bitLife: number, metresToday: number, baseRop = 0.6): RigState {
  return {
    t: 0, depth, settings: { ...NORMAL }, rpm: NORMAL.rpm, wob: NORMAL.wob, torque: 640, pressure: 17, flow: NORMAL.flow,
    rop: baseRop, engine: 84, bitUsed, bitLife, ground: 'good', coreLoss: 0, stalled: 0, drillingSecs: 0, metresToday, baseRop,
  }
}

/* Advance `dt` simulated seconds. */
export function step(s: RigState, dt: number, ahead: AheadMetre[], opts: { engineFault?: boolean } = {}): RigState {
  const g = groundAt(ahead, s.depth)
  const set = s.settings
  const eased = set.rpm <= 800 && set.wob <= 18
  const wear = Math.min(1, s.bitUsed / s.bitLife)                 // a worn bit cuts slower
  const base = s.baseRop * (g === 'good' ? 1 : g === 'hard' ? 0.7 : 0.57)
  const load = (set.rpm / NORMAL.rpm) * 0.45 + (set.wob / NORMAL.wob) * 0.55
  let rop = base * load * (1 - 0.35 * wear * wear)
  let torque = 640 * (set.wob / NORMAL.wob) * (g === 'hard' ? 1.15 : 1) + noise(s.t, 1) * 40
  let loss = 0
  if (g === 'broken') {
    // Broken rock grabs the bit: torque swings, core falls out of the tube.
    const swing = eased ? 90 : 340
    torque += 120 + Math.abs(noise(s.t * 2.3, 7)) * swing
    rop *= eased ? 0.92 : 0.62
    loss = (eased ? 0.08 : 0.35) * (rop * dt / 3600)
  }
  const stalled = torque > 1250 ? s.stalled + dt : 0
  if (stalled > 0) rop *= 0.3
  const flowIn = set.flow + noise(s.t, 3) * 1.5
  const pressure = 17 * (flowIn / NORMAL.flow) + (g === 'broken' && !eased ? 4 : 0) + noise(s.t, 4) * 0.6
  // A cooling fault: the radiator copes at eased load, not at full load
  const target = 80 + 6 * load + (opts.engineFault ? (load > 0.85 ? 22 : 6) : 0)
  const engine = s.engine + (target - s.engine) * Math.min(1, dt / 600)
  const metres = rop * dt / 3600
  return {
    ...s, t: s.t + dt, depth: s.depth + metres, rpm: set.rpm + noise(s.t, 5) * 15, wob: set.wob + noise(s.t, 6) * 0.8,
    torque, pressure, flow: flowIn, rop, engine, bitUsed: s.bitUsed + metres, ground: g,
    coreLoss: s.coreLoss + loss, stalled, drillingSecs: s.drillingSecs + dt, metresToday: s.metresToday + metres,
  }
}

/* Settings Copilot would choose for the ground, kept inside the limits. */
export function settingsFor(g: Ground): Settings {
  return g === 'broken' ? { ...BROKEN_SETTINGS } : g === 'hard' ? { rpm: 820, wob: 24, flow: 48 } : { ...NORMAL }
}
export function clampSettings(x: Settings): Settings {
  const c = (v: number, [a, b]: readonly [number, number]) => Math.max(a, Math.min(b, v))
  return { rpm: c(x.rpm, LIMITS.rpm), wob: c(x.wob, LIMITS.wob), flow: c(x.flow, LIMITS.flow) }
}

/* What easing off through broken ground saved, against drilling it at normal
 * settings: the slower cut, plus the stuck-bit stops (about a quarter of an
 * hour a metre at full load in broken rock). */
export function brokenSaving(baseRop: number, metres: number, eased: Settings) {
  const load = (eased.rpm / NORMAL.rpm) * 0.45 + (eased.wob / NORMAL.wob) * 0.55
  const un = baseRop * 0.57 * 0.62, ok = baseRop * 0.57 * load * 0.92
  return { hours: Math.max(0, metres / un - metres / ok) + 0.25 * metres, core: metres * (0.35 - 0.08) }
}
