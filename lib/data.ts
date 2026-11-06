/* ==========================================================================
 * The record Copilot reads, exported from the XPLORIX MVP (31 Oct 2026):
 * every rig, its hole, its normal speed in each ground and its bit; every
 * hole with its collar, plan, last survey and cost a metre; the core of the
 * cored holes metre by metre from the tray photos; the contract rates; the
 * best crew in each ground. Nothing here is made up; the live readings are.
 * ========================================================================== */

import raw from '../data/xplorix-data.json'

export interface CoreRow { from: number; to: number; ff: number; rqd: number; vein: number; recovery: number; cls: number }
export interface Hole {
  id: string; rig: string | null; status: string; drilled: number; planned: number | null; lastSurvey: number | null
  x: number; z: number; formation: string; size: string; cpm: number | null; rows: CoreRow[]
}
export interface Project { name: string; holes: Hole[]; rateRows: { size: string; formation: string; rate: number }[]; standbyPerDay: number }
export interface Rig {
  rig: string; project: string; hole: string; status: string; holeDrilled: number; holePlanned: number | null
  normal: Record<string, number>; bitUsed: number; bitLife: number; driller: string | null; formation: string; size: string
}
export interface Data {
  today: string; dieselSarPerLitre: number; projects: Project[]; rigs: Rig[]
  best: Record<string, { name: string; rop: number }>
  bit: { name: string; rate: number; supplier: string; lead: number }
  shiftLogs: number; metres: number
}

type RawHole = Omit<Hole, 'rows'> & { rows: number[][] }
const r = raw as unknown as Omit<Data, 'projects'> & { projects: (Omit<Project, 'holes'> & { holes: RawHole[] })[] }

export const DATA: Data = {
  ...r,
  projects: r.projects.map(p => ({
    ...p,
    holes: p.holes.map(h => ({ ...h, rows: h.rows.map(([from, to, ff, rqd, vein, recovery, cls]) => ({ from, to, ff, rqd, vein, recovery, cls })) })),
  })),
}

export const projectOf = (rig: Rig) => DATA.projects.find(p => p.name === rig.project)!
export const holeOf = (rig: Rig) => projectOf(rig).holes.find(h => h.id === rig.hole)

/* This rig's normal metres an hour in a ground, from its own shift logs. */
export function normalRop(rig: Rig, formation: string) {
  return rig.normal[formation] ?? Object.values(rig.normal)[0] ?? 0.55
}

/* The contract rate a metre for the ground being drilled. */
export function ratePerMetre(rig: Rig) {
  const p = projectOf(rig)
  const f = rig.formation.toLowerCase()
  const want = f.includes('very') ? 'very hard' : f.includes('hard') || f.includes('medium') ? 'hard' : 'soft'
  const row = p.rateRows.find(x => x.formation.toLowerCase().startsWith(want)) ?? p.rateRows[0]
  return row?.rate ?? 800
}
