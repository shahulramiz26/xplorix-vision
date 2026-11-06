/* ==========================================================================
 * DEMO GEOMETRY
 *
 * The browser demo's holes get a collar, a planned direction and survey
 * readings, so the map, the hole path and the warnings have something to
 * show. Everything is worked out from the hole number, so every browser sees
 * the same holes. A real company starts with none of this: its own collars and
 * surveys are entered or imported.
 *
 * Imports nothing from the store, so the store can call it while it builds
 * its seed.
 * ========================================================================== */

import type { SurveyReading } from './survey'
import { latLonToUtm } from './geo'

interface SeedPlan { plannedDepth: number; project?: string; collar?: { lat?: number; lon?: number; easting?: number; northing?: number; rl?: number }; azimuth?: number; dip?: number }
interface SeedLog { id: string; holeNumber: string | null; project: string; date: string; metresDrilled: number; supervisor?: string }

/* A number from 0 to 1 that depends only on the text and the salt. */
function rand(text: string, salt: number) {
  let h = 2166136261 ^ salt
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) }
  return ((h >>> 0) % 100000) / 100000
}

/* Where each demo project sits, and how it keeps its collars. */
export const DEMO_SITES: Record<string, { coords: 'latlon' | 'utm'; utmZone?: string; lat: number; lon: number; rl: number; azimuth: number; dip: number }> = {
  'Site A - North Field': { coords: 'latlon', lat: 23.4812, lon: 40.8621, rl: 1015, azimuth: 60, dip: -60 },
  'Site B - South Ridge': { coords: 'utm', utmZone: '38N', lat: 22.2047, lon: 43.2183, rl: 962, azimuth: 135, dip: -70 },
  'Site C - East Basin': { coords: 'latlon', lat: 20.9815, lon: 42.6034, rl: 1120, azimuth: 0, dip: -90 },
}

/* Collar and direction for every planned hole on a demo site. Holes are set
 * out on a grid, about 60 m apart, numbered along the lines. */
export function withSeedGeometry<P extends SeedPlan>(plans: Record<string, P>): Record<string, P> {
  const out: Record<string, P> = {}
  const byProject: Record<string, string[]> = {}
  Object.entries(plans).forEach(([id, p]) => { if (p.project) (byProject[p.project] ||= []).push(id) })
  Object.entries(plans).forEach(([id, p]) => {
    const site = p.project ? DEMO_SITES[p.project] : undefined
    if (!site) { out[id] = p; return }
    const list = byProject[p.project!].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    const k = list.indexOf(id)
    const row = Math.floor(k / 4), col = k % 4
    // 60 m between holes on a line, 80 m between lines, a little scatter.
    const dE = col * 60 + (rand(id, 1) - 0.5) * 12, dN = -row * 80 + (rand(id, 2) - 0.5) * 12
    const lat = site.lat + dN / 111320
    const lon = site.lon + dE / (111320 * Math.cos(site.lat * Math.PI / 180))
    const rl = Math.round((site.rl + (rand(id, 3) - 0.5) * 14) * 10) / 10
    const collar = site.coords === 'utm'
      ? (() => { const u = latLonToUtm(lat, lon); return { easting: Math.round(u.easting * 10) / 10, northing: Math.round(u.northing * 10) / 10, rl } })()
      : { lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6, rl }
    out[id] = { ...p, collar, azimuth: site.azimuth, dip: site.dip }
  })
  return out
}

/* Survey readings for the demo holes that have been drilled: one every 30 m,
 * the way a gyro is run, drifting a little as real holes do. Three holes are
 * set up to show what XPLORIX warns about:
 *   DH-013  has drifted well off its planned line
 *   DH-004  has gone more than 50 m past its last survey
 *   DH-102  has its latest readings still waiting to be checked */
export function seedSurveys(plans: Record<string, SeedPlan>, logs: SeedLog[]): SurveyReading[] {
  const drilled: Record<string, { m: number; project: string; last: string; first: string; by: string }> = {}
  logs.forEach(l => {
    if (!l.holeNumber) return
    const e = (drilled[l.holeNumber] ||= { m: 0, project: l.project, last: l.date, first: l.date, by: l.supervisor ?? 'Supervisor' })
    e.m += l.metresDrilled
    if (l.date > e.last) e.last = l.date
    if (l.date < e.first) e.first = l.date
    if (l.supervisor) e.by = l.supervisor
  })
  const out: SurveyReading[] = []
  Object.entries(drilled).forEach(([hole, d]) => {
    const plan = plans[hole]
    if (!plan || plan.azimuth == null || plan.dip == null || d.m < 30) return
    // A contractor's rig in the demo runs its own surveys, sent to its client; none here.
    if (!DEMO_SITES[d.project]) return
    const wild = hole === 'DH-013'
    const stopAt = hole === 'DH-004' ? Math.max(30, d.m - 75) : d.m
    const driftAz = wild ? 1.7 : (rand(hole, 7) - 0.3) * 0.45      // degrees every 30 m
    const driftDip = wild ? 0.9 : (rand(hole, 8) - 0.25) * 0.35
    const tool = rand(hole, 9) > 0.5 ? 'Gyro (north-seeking)' : 'Reflex'
    const span = (new Date(`${d.last}T00:00Z`).getTime() - new Date(`${d.first}T00:00Z`).getTime()) / 86400000
    for (let depth = 30, i = 1; depth <= stopAt + 0.01; depth += 30, i++) {
      const az = plan.azimuth + driftAz * i + (rand(hole, 100 + i) - 0.5) * 0.6
      const dip = Math.min(-40, plan.dip + driftDip * i + (rand(hole, 200 + i) - 0.5) * 0.3)
      const dayN = Math.round(span * (depth / d.m))
      const date = new Date(new Date(`${d.first}T00:00Z`).getTime() + dayN * 86400000).toISOString().slice(0, 10)
      const pending = hole === 'DH-102' && depth > stopAt - 60
      out.push({
        id: `sv_${hole}_${depth}`, hole, project: d.project, depth, tool,
        azimuth: Math.round(((az % 360) + 360) % 360 * 10) / 10, dip: Math.round(dip * 10) / 10,
        takenOn: date, source: 'import', file: `${hole}_survey.csv`, by: d.by, at: `${date}T18:30`,
        status: pending ? 'pending' : 'approved', ...(pending ? {} : { decidedBy: 'Geologist', decidedAt: `${date}T19:10` }),
      })
    }
  })
  return out
}
