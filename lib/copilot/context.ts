/* ==========================================================================
 * XPLORIX COPILOT — WHAT COPILOT KNOWS ABOUT A PROJECT
 *
 * One place that gathers, from the MVP's own record, everything the cockpit,
 * Geology GPS and the fleet brain read: every cored hole as a column of
 * rock at its collar, each hole's plan and last survey, each rig's normal
 * speed in each ground and the best crew in it, what each hole has cost a
 * metre, and how far into its life the bit is.
 * ========================================================================== */

import { useMemo } from 'react'
import { useCosting, type ShiftLog } from '../costing-store'
import { useInventory } from '../inventory-store'
import { projectHoles } from '../projects'
import { holeSurvey } from '../survey'
import { depthBands } from '../plan'
import { useAllHoles } from '../core/store'
import { normals, rateOf } from '../core/drill-link'
import type { Column } from './ground'

export interface HoleInfo {
  id: string; project: string; rig?: string; status: string
  drilled: number; planned: number | null; lastSurvey: number | null
  x: number; z: number; hasCore: boolean
  cpm: number | null; formation: string
}

export interface Know {
  ready: boolean
  projects: string[]
  holes: HoleInfo[]
  cols: Column[]                                    // cored holes, for the ground model
  normal: (rig: string, formation: string) => number
  bestCrew: (formation: string) => { name: string; rop: number } | null
  byGround: { ground: string; metres: number; shifts: number; fleet: number; best: { name: string; rop: number } | null; rigs: number }[]
  bit: (rig: string) => { used: number; life: number; name: string }
  drillers: string[]
  logs: ShiftLog[]
}

const median = (v: number[]) => { if (!v.length) return 0; const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }

export function useKnow(project?: string): Know {
  const { state } = useCosting()
  const { state: inv } = useInventory()
  const all = useAllHoles()
  return useMemo(() => {
    const logs = state.shiftLogs.filter(l => !l.segmentOf)
    const projects = Array.from(new Set(all.list.map(h => h.data.project)))
    const proj = project ?? projects[0] ?? ''
    const core = new Map(all.list.map(h => [h.data.hole, h]))
    const drilled = projectHoles(state, proj).filter(h => h.status !== 'planned')
    const sv = drilled.map(h => ({ h, s: holeSurvey(state, h.id) }))
    const origin = sv.find(x => x.s.latLon)?.s.latLon
    const holes: HoleInfo[] = sv.map(({ h, s }) => {
      const ll = s.latLon
      const bands = depthBands(state, inv, h.id).bands
      const cost = bands.reduce((a, b) => a + b.cost, 0), m = bands.reduce((a, b) => a + b.metres, 0)
      const last = [...logs].filter(l => l.holeNumber === h.id).sort((a, b) => b.date.localeCompare(a.date))[0]
      return {
        id: h.id, project: proj, rig: h.rig, status: h.status, drilled: h.drilled, planned: s.plannedDepth ?? h.planned ?? null,
        lastSurvey: s.lastSurveyed || null,
        x: ll && origin ? (ll.lon - origin.lon) * 111320 * Math.cos(origin.lat * Math.PI / 180) : 0,
        z: ll && origin ? (ll.lat - origin.lat) * 111320 : 0,
        hasCore: core.has(h.id), cpm: m > 0 ? cost / m : null, formation: last?.formationType ?? 'Medium Formation',
      }
    })
    const cols: Column[] = holes.filter(h => h.hasCore).map(h => {
      const c = core.get(h.id)!
      return { hole: h.id, x: h.x, z: h.z, rows: c.rows, drilled: c.rows.length ? c.rows[c.rows.length - 1].to : 0 }
    })
    const norm = normals(logs)
    const normal = (rig: string, formation: string) => {
      const l = logs.find(x => x.rig === rig && x.formationType === formation && x.metresDrilled > 0 && x.drillingHours > 0)
      return l ? norm(l) : median(logs.filter(x => x.formationType === formation && x.drillingHours > 0).map(rateOf))
    }
    const grounds = Array.from(new Set(logs.map(l => l.formationType).filter(Boolean)))
    const bestCrew = (formation: string) => {
      const by = new Map<string, number[]>()
      logs.filter(l => l.formationType === formation && l.drillingHours > 0 && l.metresDrilled > 0 && l.driller).forEach(l => by.set(l.driller!, [...(by.get(l.driller!) ?? []), rateOf(l)]))
      const best = Array.from(by.entries()).filter(([, v]) => v.length >= 3).map(([name, v]) => ({ name, rop: median(v) })).sort((a, b) => b.rop - a.rop)[0]
      return best ?? null
    }
    const byGround = grounds.map(g => {
      const xs = logs.filter(l => l.formationType === g && l.drillingHours > 0)
      return { ground: g, metres: xs.reduce((s, l) => s + l.metresDrilled, 0), shifts: xs.length, fleet: median(xs.map(rateOf)), best: bestCrew(g), rigs: new Set(xs.map(l => l.rig)).size }
    }).sort((a, b) => b.metres - a.metres)
    const bitPart = inv.catalogue.find(p => p.category === 'Bit' && /impregnated/i.test(p.name)) ?? inv.catalogue.find(p => p.category === 'Bit')
    const bit = (rig: string) => {
      const life = bitPart?.lifeMetres ?? 100
      const mine = logs.filter(l => l.rig === rig).sort((a, b) => `${a.date}${a.shift}`.localeCompare(`${b.date}${b.shift}`))
      let used = 0
      mine.forEach(l => {
        const changed = l.downtimeReason === 'Bit Change' || (l.downtime ?? []).some(d => d.reason === 'Bit Change') || (l.bitRuns ?? []).some(b => b.replaced)
        used = changed ? 0 : used + l.metresDrilled
      })
      return { used: used % life, life, name: bitPart?.name ?? 'Bit' }
    }
    const drillers = Array.from(new Set(logs.map(l => l.driller).filter(Boolean) as string[]))
    return { ready: all.ready, projects, holes, cols, normal, bestCrew, byGround, bit, drillers, logs }
  }, [state, inv, all.ready, all.list, project])
}
