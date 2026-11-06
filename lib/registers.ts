/* ==========================================================================
 * THE COMPANY'S RIGS AND PEOPLE
 *
 * Until now a rig or a driller existed only once its name was typed onto a
 * project. These two lists are the company's own record of them: added once,
 * picked from everywhere else (projects, drill logs, first counts).
 * ========================================================================== */

export const RIG_TYPES = ['Diamond core', 'RC', 'Blast hole', 'Water well', 'Geotechnical'] as const
export type RigType = typeof RIG_TYPES[number]
export const RIG_STATES = ['working', 'standby', 'repair', 'retired'] as const
export type RigState = typeof RIG_STATES[number]
export const RIG_STATE_LABEL: Record<RigState, string> = { working: 'Working', standby: 'Available', repair: 'Under repair', retired: 'Retired' }

export interface RigRecord {
  id: string
  rig: string                 // the name used on every log, e.g. RIG-001
  type: RigType
  make?: string
  model?: string
  year?: number
  sizes: string[]             // core sizes it drills
  depthCapacity?: number      // metres, at its largest size
  owned: boolean              // false: hired in
  state: RigState
  notes?: string
  added: string               // YYYY-MM-DD
}

export const CREW_ROLES = ['Driller', 'Helper', 'Supervisor', 'Mechanic', 'Geologist'] as const
export type CrewRole = typeof CREW_ROLES[number]

export interface CrewMember {
  id: string
  name: string
  role: CrewRole
  phone?: string
  rig?: string                // the rig he is on now
  shift?: 'Day' | 'Night'
  joined?: string
  active: boolean
}

const R = (rig: string, make: string, model: string, year: number, capacity: number, state: RigState, sizes = ['NQ', 'HQ']): RigRecord =>
  ({ id: `rr_${rig}`, rig, type: 'Diamond core', make, model, year, sizes, depthCapacity: capacity, owned: true, state, added: '2026-07-07' })

/* The demo company's fleet. Makes are left generic: it is demo data. */
export const SEED_RIGS: RigRecord[] = [
  R('RIG-001', 'Make A', 'Core 1200', 2019, 1200, 'working'),
  R('RIG-002', 'Make A', 'Core 1200', 2020, 1200, 'working'),
  R('RIG-003', 'Make B', 'Core 900', 2017, 900, 'working'),
  R('RIG-004', 'Make B', 'Core 900', 2016, 900, 'standby'),
  R('RIG-005', 'Make A', 'Core 1500', 2022, 1500, 'standby', ['NQ', 'HQ', 'PQ']),
]

const P = (name: string, role: CrewRole, rig?: string, shift?: 'Day' | 'Night', phone?: string): CrewMember =>
  ({ id: `cm_${name.replace(/\W+/g, '_').toLowerCase()}`, name, role, rig, shift, phone, joined: '2026-07-07', active: true })

export const SEED_CREW: CrewMember[] = [
  P('Mahesh Yadav', 'Driller', 'RIG-001', 'Day'), P('Ravi Kumar', 'Driller', 'RIG-001', 'Night'),
  P('Santosh Patil', 'Driller', 'RIG-002', 'Day'), P('Dinesh Sahu', 'Driller', 'RIG-002', 'Night'),
  P('Farid Khan', 'Driller', 'RIG-003', 'Day'), P('Gopal Das', 'Driller', 'RIG-003', 'Night'),
  P('Naveen Reddy', 'Driller'), P('Lokesh Meena', 'Driller'),
  P('Arun Verma', 'Supervisor', 'RIG-001', 'Day'), P('Imran Shaikh', 'Supervisor', 'RIG-002', 'Night'),
  P('Pradeep Rao', 'Supervisor', 'RIG-003', 'Day'), P('Kiran Joshi', 'Supervisor'), P('Suresh Nair', 'Supervisor'),
  P('Vijay Kale', 'Mechanic'),
]
