'use client'

// ── PLACEHOLDER FOR OPERATIONAL + MAINTENANCE DASHBOARDS ───────────────────
// Stands in for real data from your Operational Dashboard (drilling/standby/
// repair days, meters drilled, fuel, downtime) and Maintenance Dashboard
// (maintenance cost). Finance treats every field here as READ-ONLY.
//
// Days are split into drilling/standby/repair — not one combined number —
// because a day-rate contract bills each type at a different rate. Cost
// (labour, rig rate, fuel) doesn't care about the split, since a rig
// staffed but idle still costs the same as one drilling; only client
// billing needs the breakdown.
//
// To wire in the real thing: replace OPERATIONAL_RECORDS with a fetch/query
// against your actual operations system, keeping this shape (or adjust it
// and update lib/finance-store.tsx's costBreakdown function to match).

export interface OperationalRecord {
  rig: string
  project: string
  month: string              // '2026-07'
  drillingDays: number        // from Operational Dashboard — days actively drilling
  standbyDays: number         // from Operational Dashboard — staffed, idle, client-caused
  repairDays: number          // from Operational Dashboard — staffed, idle, breakdown/repair
  metersDrilled: number       // from Operational Dashboard
  fuelLitresPerDay: number    // from Operational Dashboard
  downtimeHoursPerDay: number // from Operational Dashboard
  maintenanceCost: number     // from Maintenance Dashboard, already in SAR for the month
}

export const OPERATIONAL_RECORDS: OperationalRecord[] = [
  { rig: 'Rig A1', project: 'Site B - South Ridge', month: '2026-06', drillingDays: 17, standbyDays: 2, repairDays: 1, metersDrilled: 150, fuelLitresPerDay: 105, downtimeHoursPerDay: 2.5, maintenanceCost: 15000 },
  { rig: 'Rig A1', project: 'Site A - North Field', month: '2026-07', drillingDays: 22, standbyDays: 3, repairDays: 1, metersDrilled: 210, fuelLitresPerDay: 110, downtimeHoursPerDay: 3.0, maintenanceCost: 18000 },
  { rig: 'Rig A1', project: 'Site A - North Field', month: '2026-08', drillingDays: 20, standbyDays: 3, repairDays: 1, metersDrilled: 195, fuelLitresPerDay: 112, downtimeHoursPerDay: 2.2, maintenanceCost: 16000 },

  { rig: 'Rig A2', project: 'Site C - East Basin', month: '2026-06', drillingDays: 14, standbyDays: 2, repairDays: 2, metersDrilled: 120, fuelLitresPerDay: 100, downtimeHoursPerDay: 4.1, maintenanceCost: 14000 },
  { rig: 'Rig A2', project: 'Site A - North Field', month: '2026-07', drillingDays: 19, standbyDays: 3, repairDays: 2, metersDrilled: 165, fuelLitresPerDay: 115, downtimeHoursPerDay: 3.6, maintenanceCost: 22000 },
  { rig: 'Rig A2', project: 'Site A - North Field', month: '2026-08', drillingDays: 18, standbyDays: 3, repairDays: 1, metersDrilled: 158, fuelLitresPerDay: 113, downtimeHoursPerDay: 2.8, maintenanceCost: 17000 },

  { rig: 'Rig B1', project: 'Site C - East Basin', month: '2026-06', drillingDays: 15, standbyDays: 3, repairDays: 1, metersDrilled: 130, fuelLitresPerDay: 108, downtimeHoursPerDay: 3.3, maintenanceCost: 13000 },
  { rig: 'Rig B1', project: 'Site B - South Ridge', month: '2026-07', drillingDays: 19, standbyDays: 2, repairDays: 1, metersDrilled: 180, fuelLitresPerDay: 108, downtimeHoursPerDay: 2.0, maintenanceCost: 16000 },
  { rig: 'Rig B1', project: 'Site B - South Ridge', month: '2026-08', drillingDays: 18, standbyDays: 2, repairDays: 1, metersDrilled: 172, fuelLitresPerDay: 106, downtimeHoursPerDay: 2.4, maintenanceCost: 15500 },

  { rig: 'Rig C1', project: 'Site A - North Field', month: '2026-05', drillingDays: 16, standbyDays: 3, repairDays: 1, metersDrilled: 140, fuelLitresPerDay: 118, downtimeHoursPerDay: 3.8, maintenanceCost: 12000 },
  { rig: 'Rig C1', project: 'Site C - East Basin', month: '2026-07', drillingDays: 15, standbyDays: 3, repairDays: 2, metersDrilled: 140, fuelLitresPerDay: 120, downtimeHoursPerDay: 4.5, maintenanceCost: 21000 },
  { rig: 'Rig C1', project: 'Site C - East Basin', month: '2026-08', drillingDays: 15, standbyDays: 2, repairDays: 2, metersDrilled: 135, fuelLitresPerDay: 119, downtimeHoursPerDay: 3.9, maintenanceCost: 19500 },

  { rig: 'Rig C2', project: 'Site C - East Basin', month: '2026-07', drillingDays: 14, standbyDays: 2, repairDays: 1, metersDrilled: 118, fuelLitresPerDay: 109, downtimeHoursPerDay: 2.9, maintenanceCost: 10500 },
  { rig: 'Rig C2', project: 'Site C - East Basin', month: '2026-08', drillingDays: 15, standbyDays: 2, repairDays: 1, metersDrilled: 125, fuelLitresPerDay: 110, downtimeHoursPerDay: 2.6, maintenanceCost: 11000 },
]

// Total staffed days — drilling + standby + repair. Cost accrues on every
// one of these regardless of type (labour and rig rental don't care why
// the rig was staffed that day), so this is what cost math should use.
export function totalDaysOperated(r: OperationalRecord): number { return r.drillingDays + r.standbyDays + r.repairDays }
export function totalFuelLitres(r: OperationalRecord): number { return r.fuelLitresPerDay * totalDaysOperated(r) }
export function totalDowntimeHours(r: OperationalRecord): number { return r.downtimeHoursPerDay * totalDaysOperated(r) }

export function operationalRecordsForRig(rig: string): OperationalRecord[] {
  return OPERATIONAL_RECORDS.filter(r => r.rig === rig).sort((a, b) => a.month.localeCompare(b.month))
}
export function findOperationalRecord(rig: string, project: string, month: string): OperationalRecord | undefined {
  return OPERATIONAL_RECORDS.find(r => r.rig === rig && r.project === project && r.month === month)
}
export function allRigsWithOperationalData(): string[] {
  return Array.from(new Set(OPERATIONAL_RECORDS.map(r => r.rig)))
}
// Every rig operating on a given project, for a given month — the basis for
// Project Cost, which combines all of them before applying the client rate.
export function operationalRecordsForProjectMonth(project: string, month: string): OperationalRecord[] {
  return OPERATIONAL_RECORDS.filter(r => r.project === project && r.month === month)
}
// Every (project, month) pair that has any operational data at all.
export function allProjectMonths(): { project: string; month: string }[] {
  const seen = new Set<string>()
  const out: { project: string; month: string }[] = []
  OPERATIONAL_RECORDS.forEach(r => {
    const key = `${r.project}__${r.month}`
    if (!seen.has(key)) { seen.add(key); out.push({ project: r.project, month: r.month }) }
  })
  return out.sort((a, b) => a.project.localeCompare(b.project) || a.month.localeCompare(b.month))
}
export function monthsForProject(project: string): string[] {
  return Array.from(new Set(OPERATIONAL_RECORDS.filter(r => r.project === project).map(r => r.month))).sort()
}

