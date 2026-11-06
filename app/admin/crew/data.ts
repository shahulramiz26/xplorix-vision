/* ------------------------------------------------------------------ *
 * XPLORIX Crew — availability pool + job postings (mock)
 *
 * Design note: the matching axis in drilling is rig experience,
 * certifications and rotation — not job title. Everything here is
 * modelled around that.
 * ------------------------------------------------------------------ */

export type CrewRole =
  | 'Driller' | 'Offsider' | 'Drill fitter' | 'Field geologist'
  | 'Rig manager' | 'HSE officer' | 'Core technician' | 'Drilling engineer'

export const CREW_ROLES: CrewRole[] = [
  'Driller', 'Offsider', 'Drill fitter', 'Field geologist',
  'Rig manager', 'HSE officer', 'Core technician', 'Drilling engineer',
]

export const ROTATIONS = ['28/14', '21/7', '14/14', '42/14', '6/1 local', 'Residential']

export const RIG_FAMILIES = [
  'LF90 / LF160', 'DE130 / DE740', 'UDR 1200', 'Schramm T685', 'Epiroc CM / ROC',
  'Sandvik DE / DL', 'Atlas Copco Christensen', 'Geoprobe', 'Underground S-series',
]

export const CERTIFICATIONS = [
  'DGMS Gas Testing', 'First Aid', 'Working at Heights', 'Confined Space',
  'MSHA Part 46', 'HLTAID011', 'Defensive Driving', 'IOSH Working Safely',
]

export interface CrewProfile {
  id: string
  initials: string
  displayName: string          // surname withheld until contact is released
  role: CrewRole
  yearsExperience: number
  basedIn: string
  nationality: string
  availableFrom: string        // ISO date
  rotationPrefs: string[]
  rigFamilies: string[]
  certifications: string[]
  willingToTravel: string[]    // regions
  passportValid: boolean
  /** XPLORIX-verified production, drawn from rigs logged on the platform.
   *  null when the person has never worked on an XPLORIX-logged rig. */
  verifiedMetres: number | null
  verifiedPeriod: string | null
  lastConfirmed: string        // ISO date — from the 30-day "still available?" ping
  summary: string
}

export const CREW: CrewProfile[] = [
  {
    id: 'c1', initials: 'RK', displayName: 'Ravi K.', role: 'Driller',
    yearsExperience: 11, basedIn: 'Mahd adh Dhahab, Al Madinah', nationality: 'India',
    availableFrom: '2026-12-02', rotationPrefs: ['28/14', '21/7'],
    rigFamilies: ['LF90 / LF160', 'DE130 / DE740'],
    certifications: ['DGMS Gas Testing', 'First Aid', 'Working at Heights'],
    willingToTravel: ['Asia', 'Africa', 'Middle East'], passportValid: true,
    verifiedMetres: 14200, verifiedPeriod: '2025',
    lastConfirmed: '2026-10-11',
    summary: 'Eleven years on wireline core, mostly gold and copper on the Arabian Shield and iron ore in India. Comfortable running deep NQ to 900 m.',
  },
  {
    id: 'c2', initials: 'JM', displayName: 'Joseph M.', role: 'Driller',
    yearsExperience: 8, basedIn: 'Lubumbashi', nationality: 'DRC',
    availableFrom: '2026-10-26', rotationPrefs: ['42/14', '28/14'],
    rigFamilies: ['LF90 / LF160', 'Atlas Copco Christensen'],
    certifications: ['First Aid', 'Confined Space', 'Defensive Driving'],
    willingToTravel: ['Africa'], passportValid: true,
    verifiedMetres: 9800, verifiedPeriod: '2025',
    lastConfirmed: '2026-10-14',
    summary: 'Copper-cobalt belt experience across Katanga and Lualaba. French and Swahili speaking, used to remote camp rotations.',
  },
  {
    id: 'c3', initials: 'AT', displayName: 'Ahmed T.', role: 'Drill fitter',
    yearsExperience: 14, basedIn: 'Dubai', nationality: 'Egypt',
    availableFrom: '2026-10-19', rotationPrefs: ['28/14', 'Residential'],
    rigFamilies: ['Schramm T685', 'Epiroc CM / ROC', 'Sandvik DE / DL'],
    certifications: ['First Aid', 'Working at Heights', 'IOSH Working Safely'],
    willingToTravel: ['Middle East', 'Africa', 'Asia'], passportValid: true,
    verifiedMetres: null, verifiedPeriod: null,
    lastConfirmed: '2026-10-06',
    summary: 'Hydraulics and powerpack specialist. Has rebuilt rotation heads and mud pumps across a mixed fleet of fourteen rigs.',
  },
  {
    id: 'c4', initials: 'PS', displayName: 'Priya S.', role: 'Field geologist',
    yearsExperience: 6, basedIn: 'Riyadh', nationality: 'India',
    availableFrom: '2026-12-19', rotationPrefs: ['21/7', '14/14'],
    rigFamilies: ['DE130 / DE740'],
    certifications: ['First Aid', 'Defensive Driving'],
    willingToTravel: ['Asia', 'Africa'], passportValid: true,
    verifiedMetres: 6100, verifiedPeriod: '2025–26',
    lastConfirmed: '2026-10-15',
    summary: 'Core logging and QA/QC on gold and base metal programmes. Experienced with digital logging workflows.',
  },
  {
    id: 'c5', initials: 'DN', displayName: 'Daniel N.', role: 'Offsider',
    yearsExperience: 3, basedIn: 'Kitwe', nationality: 'Zambia',
    availableFrom: '2026-11-02', rotationPrefs: ['28/14', '42/14'],
    rigFamilies: ['LF90 / LF160'],
    certifications: ['First Aid'],
    willingToTravel: ['Africa'], passportValid: true,
    verifiedMetres: 4300, verifiedPeriod: '2025',
    lastConfirmed: '2026-10-09',
    summary: 'Three seasons as offsider on surface core in the Copperbelt. Working towards driller qualification.',
  },
  {
    id: 'c6', initials: 'MW', displayName: 'Mark W.', role: 'Rig manager',
    yearsExperience: 19, basedIn: 'Perth, WA', nationality: 'Australia',
    availableFrom: '2026-11-18', rotationPrefs: ['21/7', '28/14'],
    rigFamilies: ['Schramm T685', 'UDR 1200', 'LF90 / LF160'],
    certifications: ['HLTAID011', 'Working at Heights', 'Confined Space', 'MSHA Part 46'],
    willingToTravel: ['Oceania', 'Asia', 'Africa'], passportValid: true,
    verifiedMetres: null, verifiedPeriod: null,
    lastConfirmed: '2026-10-02',
    summary: 'Managed multi-rig RC and diamond programmes in the Goldfields. Strong on crew training and compliance.',
  },
  {
    id: 'c7', initials: 'KB', displayName: 'Kwame B.', role: 'HSE officer',
    yearsExperience: 9, basedIn: 'Accra', nationality: 'Ghana',
    availableFrom: '2026-11-09', rotationPrefs: ['28/14', 'Residential'],
    rigFamilies: ['Epiroc CM / ROC'],
    certifications: ['IOSH Working Safely', 'First Aid', 'Confined Space'],
    willingToTravel: ['Africa'], passportValid: true,
    verifiedMetres: null, verifiedPeriod: null,
    lastConfirmed: '2026-10-13',
    summary: 'Site HSE across West African gold operations. Incident investigation and contractor audit experience.',
  },
  {
    id: 'c8', initials: 'SG', displayName: 'Suresh G.', role: 'Driller',
    yearsExperience: 16, basedIn: 'Ad Dawadimi, Riyadh Province', nationality: 'India',
    availableFrom: '2026-10-23', rotationPrefs: ['6/1 local', '21/7'],
    rigFamilies: ['Epiroc CM / ROC', 'Sandvik DE / DL'],
    certifications: ['DGMS Gas Testing', 'First Aid'],
    willingToTravel: ['Asia'], passportValid: false,
    verifiedMetres: 22400, verifiedPeriod: '2024–26',
    lastConfirmed: '2026-10-16',
    summary: 'DTH and blast hole specialist. Sixteen years across iron ore and limestone quarries in India and the Gulf.',
  },
  {
    id: 'c9', initials: 'LC', displayName: 'Luis C.', role: 'Drilling engineer',
    yearsExperience: 12, basedIn: 'Santiago', nationality: 'Chile',
    availableFrom: '2027-01-18', rotationPrefs: ['14/14', 'Residential'],
    rigFamilies: ['Sandvik DE / DL', 'Schramm T685'],
    certifications: ['First Aid', 'Defensive Driving'],
    willingToTravel: ['South America', 'North America'], passportValid: true,
    verifiedMetres: null, verifiedPeriod: null,
    lastConfirmed: '2026-09-28',
    summary: 'Programme planning and cost control for deep copper exploration. Fluent Spanish and English.',
  },
  {
    id: 'c10', initials: 'AR', displayName: 'Anil R.', role: 'Core technician',
    yearsExperience: 5, basedIn: 'Mahd adh Dhahab, Al Madinah', nationality: 'India',
    availableFrom: '2026-10-30', rotationPrefs: ['6/1 local', '21/7'],
    rigFamilies: ['DE130 / DE740', 'LF90 / LF160'],
    certifications: ['First Aid'],
    willingToTravel: ['Asia'], passportValid: true,
    verifiedMetres: 8700, verifiedPeriod: '2025–26',
    lastConfirmed: '2026-10-12',
    summary: 'Core cutting, sampling and core farm management. Careful with sample integrity and chain of custody.',
  },
]

/* ---------------- Job postings ---------------- */

export type JobStatus = 'Live' | 'Draft' | 'Closed'

export interface JobPosting {
  id: string
  title: string
  role: CrewRole
  location: string
  country: string
  siteBased: boolean
  rotation: string
  experienceYears: number
  rigFamilies: string[]
  certifications: string[]
  salaryRange: string
  startDate: string
  positions: number
  description: string
  status: JobStatus
  postedDaysAgo: number
  applicants: number
  newApplicants: number
  views: number
  /** How many people in the availability pool match the hard constraints. */
  poolMatches: number
}

export const JOBS: JobPosting[] = [
  {
    id: 'j1', title: 'Senior driller — surface diamond core', role: 'Driller',
    location: 'Mahd adh Dhahab, Al Madinah', country: 'Saudi Arabia', siteBased: true,
    rotation: '28/14', experienceYears: 8,
    rigFamilies: ['LF90 / LF160', 'DE130 / DE740'],
    certifications: ['DGMS Gas Testing', 'First Aid'],
    salaryRange: 'SAR 9,000 – 12,000 / month', startDate: '2026-11-18',
    positions: 2,
    description: 'Running NQ and HQ wireline core to 900 m on an iron ore exploration programme. Responsible for crew of two, daily production reporting through XPLORIX, and pre-start rig checks.',
    status: 'Live', postedDaysAgo: 6, applicants: 14, newApplicants: 3, views: 268, poolMatches: 3,
  },
  {
    id: 'j2', title: 'Drill fitter — mixed fleet', role: 'Drill fitter',
    location: 'Ad Duwayhi, Makkah Province', country: 'Saudi Arabia', siteBased: true,
    rotation: '21/7', experienceYears: 5,
    rigFamilies: ['Epiroc CM / ROC', 'Sandvik DE / DL'],
    certifications: ['First Aid', 'Working at Heights'],
    salaryRange: 'SAR 6,500 – 8,500 / month', startDate: '2026-11-07',
    positions: 1,
    description: 'Preventive maintenance and breakdown response across six rigs. Hydraulics, powerpack and compressor experience essential. Workshop and field split.',
    status: 'Live', postedDaysAgo: 12, applicants: 9, newApplicants: 1, views: 141, poolMatches: 1,
  },
  {
    id: 'j3', title: 'Field geologist — core logging', role: 'Field geologist',
    location: 'Lubumbashi', country: 'DRC', siteBased: true,
    rotation: '42/14', experienceYears: 4,
    rigFamilies: ['LF90 / LF160'],
    certifications: ['First Aid', 'Confined Space'],
    salaryRange: 'USD 4,200 – 5,500 / month', startDate: '2027-01-02',
    positions: 1,
    description: 'Core logging, sampling and QA/QC on a copper-cobalt programme. French an advantage. Camp accommodation and flights provided.',
    status: 'Live', postedDaysAgo: 3, applicants: 6, newApplicants: 4, views: 97, poolMatches: 2,
  },
  {
    id: 'j4', title: 'HSE officer — exploration sites', role: 'HSE officer',
    location: 'Mahd adh Dhahab, Al Madinah', country: 'Saudi Arabia', siteBased: true,
    rotation: '6/1 local', experienceYears: 6,
    rigFamilies: [],
    certifications: ['IOSH Working Safely', 'First Aid'],
    salaryRange: 'SAR 7,500 – 9,500 / month', startDate: '2026-12-02',
    positions: 1,
    description: 'Site safety across four active drill sites. Toolbox talks, incident investigation, contractor induction and monthly reporting to management.',
    status: 'Draft', postedDaysAgo: 1, applicants: 0, newApplicants: 0, views: 0, poolMatches: 1,
  },
  {
    id: 'j5', title: 'Offsider — surface core (2 positions)', role: 'Offsider',
    location: 'Mahd adh Dhahab, Al Madinah', country: 'Saudi Arabia', siteBased: true,
    rotation: '28/14', experienceYears: 1,
    rigFamilies: ['LF90 / LF160'],
    certifications: ['First Aid'],
    salaryRange: 'SAR 3,500 – 4,500 / month', startDate: '2026-10-19',
    positions: 2,
    description: 'Assisting the driller with rod handling, core recovery and site housekeeping. Training provided towards driller qualification.',
    status: 'Closed', postedDaysAgo: 54, applicants: 31, newApplicants: 0, views: 412, poolMatches: 4,
  },
]

/* ---------------- helpers ---------------- */

export function daysUntil(iso: string): number {
  const d = new Date(iso).getTime() - new Date('2026-10-17').getTime()
  return Math.round(d / 86_400_000)
}

export function availabilityLabel(iso: string): { text: string; tone: 'now' | 'soon' | 'later' } {
  const d = daysUntil(iso)
  if (d <= 0) return { text: 'Available now', tone: 'now' }
  if (d <= 30) return { text: `Available in ${d} days`, tone: 'soon' }
  return {
    text: `From ${new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
    tone: 'later',
  }
}

export function freshness(iso: string): string {
  const d = Math.abs(daysUntil(iso))
  if (d <= 1) return 'Confirmed today'
  if (d <= 7) return `Confirmed ${d} days ago`
  return `Confirmed ${Math.round(d / 7)} weeks ago`
}

export const CREW_STATS = {
  available: CREW.length,
  verified: CREW.filter((c) => c.verifiedMetres !== null).length,
  liveJobs: JOBS.filter((j) => j.status === 'Live').length,
  newApplicants: JOBS.reduce((s, j) => s + j.newApplicants, 0),
}
