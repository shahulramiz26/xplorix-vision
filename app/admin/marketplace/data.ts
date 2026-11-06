/* ------------------------------------------------------------------ *
 * XPLORIX Exchange — equipment catalogue (mock)
 * Shape mirrors: categories / category_specs / listings / listing_specs / partners
 * Swap for API queries without touching the components.
 * ------------------------------------------------------------------ */

export type PriceType = 'fixed' | 'on_request' | 'rental'
export type Condition = 'New' | 'Used' | 'Refurbished'

export interface SpecRow { label: string; value: string }

export interface Partner {
  id: string
  name: string
  country: string
  verified: boolean
  memberSince: string
  listingCount: number
  responseHours: number
}

export interface Listing {
  id: string
  slug: string
  title: string
  brand: string
  model: string
  categoryId: string
  subCategoryId: string
  categoryLabel: string
  condition: Condition
  year: number | null
  location: string
  country: string
  priceType: PriceType
  price: number | null
  priceUSD: number | null      // normalised, for range filtering only
  currency: string
  availability: string
  featured: boolean
  headlineSpecs: SpecRow[]     // the three shown on the card face
  specs: SpecRow[]
  filterValues: Record<string, string | number>
  description: string
  partner: Partner
  postedDaysAgo: number
  views: number
}

/* ---------------- Category tree ---------------- */

export interface SubCategory { id: string; label: string }
export interface Category {
  id: string
  label: string
  icon: string               // lucide icon name, resolved in the component
  subs: SubCategory[]
}

export const CATEGORIES: Category[] = [
  {
    id: 'rigs', label: 'Drilling rigs', icon: 'Truck',
    subs: [
      { id: 'surface-core', label: 'Surface core' },
      { id: 'underground-core', label: 'Underground core' },
      { id: 'rc', label: 'Reverse circulation' },
      { id: 'dth', label: 'DTH & blast hole' },
      { id: 'water-well', label: 'Water well' },
      { id: 'geotech', label: 'Geotechnical' },
    ],
  },
  {
    id: 'bits', label: 'Drill bits', icon: 'Disc3',
    subs: [
      { id: 'diamond-core', label: 'Diamond core' },
      { id: 'pdc', label: 'PDC' },
      { id: 'dth-bit', label: 'DTH hammer' },
      { id: 'tricone', label: 'Tricone' },
      { id: 'reaming', label: 'Reaming shells' },
    ],
  },
  {
    id: 'rods', label: 'Rods & casing', icon: 'Minus',
    subs: [
      { id: 'core-rod', label: 'Wireline core rods' },
      { id: 'casing', label: 'Casing' },
      { id: 'subs', label: 'Subs & adaptors' },
    ],
  },
  {
    id: 'downhole', label: 'Downhole tools', icon: 'ArrowDownToLine',
    subs: [
      { id: 'core-barrel', label: 'Core barrels' },
      { id: 'overshot', label: 'Overshots & retrieval' },
      { id: 'survey', label: 'Survey tools' },
      { id: 'hammer', label: 'DTH hammers' },
    ],
  },
  {
    id: 'support', label: 'Support equipment', icon: 'Wind',
    subs: [
      { id: 'compressor', label: 'Compressors' },
      { id: 'booster', label: 'Boosters' },
      { id: 'mud-pump', label: 'Mud pumps' },
      { id: 'generator', label: 'Generators' },
      { id: 'water-truck', label: 'Water trucks' },
    ],
  },
  {
    id: 'consumables', label: 'Consumables', icon: 'Package',
    subs: [
      { id: 'fluids', label: 'Drilling fluids' },
      { id: 'core-tray', label: 'Core trays & sampling' },
      { id: 'grease', label: 'Grease & lubricants' },
    ],
  },
  {
    id: 'safety', label: 'Safety & PPE', icon: 'HardHat',
    subs: [
      { id: 'ppe', label: 'Personal protective equipment' },
      { id: 'site-safety', label: 'Site safety equipment' },
    ],
  },
  {
    id: 'services', label: 'Services & rentals', icon: 'Wrench',
    subs: [
      { id: 'rig-rental', label: 'Rig rental' },
      { id: 'transport', label: 'Transport & mobilisation' },
      { id: 'repair', label: 'Repair & overhaul' },
      { id: 'survey-service', label: 'Survey services' },
    ],
  },
]

/* ---------------- Dynamic filters per category ----------------
   This is the category specification engine surfaced in the UI:
   selecting a category swaps in filters that only make sense there. */

export type FilterDef =
  | { key: string; label: string; type: 'select'; options: string[]; unit?: string }
  | { key: string; label: string; type: 'range'; min: number; max: number; step: number; unit: string }

export const CATEGORY_FILTERS: Record<string, FilterDef[]> = {
  rigs: [
    { key: 'maxDepth', label: 'Max depth', type: 'range', min: 0, max: 2000, step: 100, unit: 'm' },
    { key: 'holeSize', label: 'Hole size', type: 'select', options: ['BQ', 'NQ', 'HQ', 'PQ', '105–165 mm', '165–254 mm'] },
    { key: 'mounting', label: 'Mounting', type: 'select', options: ['Tracked', 'Truck', 'Skid', 'Trailer'] },
    { key: 'hours', label: 'Operating hours', type: 'range', min: 0, max: 20000, step: 1000, unit: 'h' },
  ],
  bits: [
    { key: 'diameter', label: 'Diameter', type: 'range', min: 30, max: 320, step: 10, unit: 'mm' },
    { key: 'shank', label: 'Shank / thread', type: 'select', options: ['QL50', 'QL60', 'QL80', 'NQ', 'HQ', 'PQ', 'API reg'] },
    { key: 'formation', label: 'Formation', type: 'select', options: ['Soft', 'Medium', 'Hard', 'Hard abrasive'] },
  ],
  rods: [
    { key: 'rodSize', label: 'Size', type: 'select', options: ['BQ', 'NQ', 'HQ', 'PQ', 'HWT', 'PWT'] },
    { key: 'length', label: 'Length', type: 'select', options: ['1.5 m', '3.0 m', '6.0 m'] },
  ],
  downhole: [
    { key: 'toolSize', label: 'Size', type: 'select', options: ['BQ', 'NQ', 'HQ', 'PQ', '4"', '6"', '8"'] },
    { key: 'tubeType', label: 'Configuration', type: 'select', options: ['Double tube', 'Triple tube', 'Single tube', 'N/A'] },
  ],
  support: [
    { key: 'pressure', label: 'Pressure', type: 'range', min: 0, max: 40, step: 1, unit: 'bar' },
    { key: 'flow', label: 'Flow / free air', type: 'range', min: 0, max: 40, step: 2, unit: 'm³/min' },
  ],
  consumables: [
    { key: 'packSize', label: 'Pack size', type: 'select', options: ['25 kg', '200 kg', 'Per unit', 'Per box'] },
  ],
  safety: [
    { key: 'standard', label: 'Standard', type: 'select', options: ['EN 397', 'ANSI Z89.1', 'IS 2925', 'AS/NZS 1801'] },
  ],
  services: [
    { key: 'rateBasis', label: 'Rate basis', type: 'select', options: ['Per day', 'Per metre', 'Per month', 'Per job'] },
  ],
}

/* ---------------- Countries ---------------- */

export const COUNTRIES = [
  { code: 'IN', name: 'India', region: 'Asia' },
  { code: 'AE', name: 'UAE', region: 'Middle East' },
  { code: 'SA', name: 'Saudi Arabia', region: 'Middle East' },
  { code: 'CD', name: 'DRC', region: 'Africa' },
  { code: 'ZM', name: 'Zambia', region: 'Africa' },
  { code: 'TZ', name: 'Tanzania', region: 'Africa' },
  { code: 'GH', name: 'Ghana', region: 'Africa' },
  { code: 'ZA', name: 'South Africa', region: 'Africa' },
  { code: 'AU', name: 'Australia', region: 'Oceania' },
  { code: 'ID', name: 'Indonesia', region: 'Asia' },
  { code: 'KZ', name: 'Kazakhstan', region: 'Asia' },
  { code: 'MN', name: 'Mongolia', region: 'Asia' },
  { code: 'CL', name: 'Chile', region: 'South America' },
  { code: 'PE', name: 'Peru', region: 'South America' },
  { code: 'CA', name: 'Canada', region: 'North America' },
]

export const REGIONS = ['Asia', 'Africa', 'Middle East', 'Oceania', 'South America', 'North America']

/* ---------------- Partners ---------------- */

const P = {
  meridian: { id: 'p1', name: 'Meridian Drilling Supplies', country: 'India', verified: true, memberSince: 'Jan 2026', listingCount: 24, responseHours: 4 },
  kalyan:   { id: 'p2', name: 'Kalyan Exploration Equipment', country: 'India', verified: true, memberSince: 'Mar 2026', listingCount: 11, responseHours: 9 },
  sahara:   { id: 'p3', name: 'Sahara Rig Services FZE', country: 'UAE', verified: false, memberSince: 'Jul 2026', listingCount: 6, responseHours: 22 },
  kivu:     { id: 'p4', name: 'Kivu Mining Supply SARL', country: 'DRC', verified: true, memberSince: 'Feb 2026', listingCount: 9, responseHours: 12 },
  copperbelt:{ id: 'p5', name: 'Copperbelt Drilling Traders', country: 'Zambia', verified: true, memberSince: 'Apr 2026', listingCount: 15, responseHours: 7 },
  perthco:  { id: 'p6', name: 'Perth Core Systems', country: 'Australia', verified: true, memberSince: 'Dec 2025', listingCount: 31, responseHours: 3 },
  andes:    { id: 'p7', name: 'Andes Perforación SpA', country: 'Chile', verified: true, memberSince: 'May 2026', listingCount: 8, responseHours: 14 },
  accra:    { id: 'p8', name: 'Accra Geotools Ltd', country: 'Ghana', verified: false, memberSince: 'Jun 2026', listingCount: 4, responseHours: 30 },
} satisfies Record<string, Partner>

/* ---------------- Listings ---------------- */

const L = (l: Listing) => l

export const LISTINGS: Listing[] = [
  L({
    id: 'l1', slug: 'sandvik-de740-surface-core-drill',
    title: 'Sandvik DE740 surface core drill', brand: 'Sandvik', model: 'DE740',
    categoryId: 'rigs', subCategoryId: 'surface-core', categoryLabel: 'Surface core drill',
    condition: 'Used', year: 2019, location: 'Hospet, Karnataka', country: 'India',
    priceType: 'on_request', price: null, priceUSD: 210000, currency: 'SAR',
    availability: 'Available now', featured: true,
    headlineSpecs: [{ label: 'Max depth', value: '1,200 m' }, { label: 'Hole size', value: 'NQ / HQ' }, { label: 'Hours', value: '6,400' }],
    specs: [
      { label: 'Maximum drilling depth', value: '1,200 m (NQ)' },
      { label: 'Hole diameter', value: 'NQ, HQ, PQ' },
      { label: 'Rod size', value: '3 m' },
      { label: 'Rotation speed', value: '0–1,250 rpm' },
      { label: 'Feed force', value: '45 kN' },
      { label: 'Pullback force', value: '75 kN' },
      { label: 'Engine', value: 'Caterpillar C7.1' },
      { label: 'Engine power', value: '168 kW / 225 HP' },
      { label: 'Operating hours', value: '6,400' },
      { label: 'Rig weight', value: '9,800 kg' },
    ],
    filterValues: { maxDepth: 1200, holeSize: 'NQ', mounting: 'Tracked', hours: 6400 },
    description: 'Single owner since new, run on iron ore exploration contracts in Karnataka. Full service history available. Rod handler and water pump included. Hydraulic overhaul at 6,100 hours. Inspection at our Hospet yard with two weeks notice.',
    partner: P.meridian, postedDaysAgo: 4, views: 412,
  }),
  L({
    id: 'l2', slug: 'boart-longyear-lf90d',
    title: 'Boart Longyear LF90D track-mounted rig', brand: 'Boart Longyear', model: 'LF90D',
    categoryId: 'rigs', subCategoryId: 'surface-core', categoryLabel: 'Surface core drill',
    condition: 'Refurbished', year: 2016, location: 'Lubumbashi', country: 'DRC',
    priceType: 'fixed', price: 832500, priceUSD: 222000, currency: 'SAR',
    availability: 'Available now', featured: true,
    headlineSpecs: [{ label: 'Max depth', value: '1,500 m' }, { label: 'Hole size', value: 'BQ – PQ' }, { label: 'Hours', value: '11,200' }],
    specs: [
      { label: 'Maximum drilling depth', value: '1,500 m (BQ)' },
      { label: 'Hole diameter', value: 'BQ, NQ, HQ, PQ' },
      { label: 'Rotation speed', value: '0–1,100 rpm' },
      { label: 'Feed force', value: '53 kN' },
      { label: 'Engine', value: 'Deutz TCD 2013' },
      { label: 'Engine power', value: '160 kW / 215 HP' },
      { label: 'Operating hours', value: '11,200' },
      { label: 'Mounting', value: 'Tracked carrier' },
    ],
    filterValues: { maxDepth: 1500, holeSize: 'BQ', mounting: 'Tracked', hours: 11200 },
    description: 'Fully refurbished in 2025 — new mast bearings, rebuilt rotation head, new hydraulic hoses throughout. Suitable for copper-cobalt belt exploration. Price ex-yard Lubumbashi, export documentation supported.',
    partner: P.kivu, postedDaysAgo: 9, views: 288,
  }),
  L({
    id: 'l3', slug: 'epiroc-cm760d-dth-rig',
    title: 'Epiroc CM760D DTH blast hole rig', brand: 'Epiroc', model: 'CM760D',
    categoryId: 'rigs', subCategoryId: 'dth', categoryLabel: 'DTH rig',
    condition: 'Used', year: 2021, location: 'Bellary, Karnataka', country: 'India',
    priceType: 'on_request', price: null, priceUSD: 265000, currency: 'SAR',
    availability: 'Available from Oct 2026', featured: false,
    headlineSpecs: [{ label: 'Hole range', value: '105–165 mm' }, { label: 'Max depth', value: '54 m' }, { label: 'Hours', value: '3,900' }],
    specs: [
      { label: 'Hole diameter range', value: '105–165 mm' },
      { label: 'Maximum hole depth', value: '54 m' },
      { label: 'Rod length', value: '3.5 m' },
      { label: 'Onboard compressor', value: '25.5 bar, 21 m³/min' },
      { label: 'Engine', value: 'Cummins QSL9' },
      { label: 'Engine power', value: '242 kW / 325 HP' },
      { label: 'Operating hours', value: '3,900' },
    ],
    filterValues: { maxDepth: 54, holeSize: '105–165 mm', mounting: 'Tracked', hours: 3900 },
    description: 'Currently on contract until end of November. Well maintained, service records logged in XPLORIX. Dust collector and rod handling system in good condition.',
    partner: P.kalyan, postedDaysAgo: 2, views: 176,
  }),
  L({
    id: 'l4', slug: 'schramm-t685ws-rc-rig',
    title: 'Schramm T685WS reverse circulation rig', brand: 'Schramm', model: 'T685WS',
    categoryId: 'rigs', subCategoryId: 'rc', categoryLabel: 'RC rig',
    condition: 'Used', year: 2018, location: 'Kalgoorlie, WA', country: 'Australia',
    priceType: 'fixed', price: 745000, priceUSD: 745000, currency: 'USD',
    availability: 'Available now', featured: true,
    headlineSpecs: [{ label: 'Max depth', value: '600 m' }, { label: 'Pullback', value: '306 kN' }, { label: 'Hours', value: '9,100' }],
    specs: [
      { label: 'Maximum depth', value: '600 m RC' },
      { label: 'Pullback capacity', value: '306 kN (69,000 lbf)' },
      { label: 'Mounting', value: 'Truck, 6x6' },
      { label: 'Compressor', value: '1,150 cfm / 350 psi' },
      { label: 'Rod handling', value: 'Automated carousel' },
      { label: 'Operating hours', value: '9,100' },
    ],
    filterValues: { maxDepth: 600, holeSize: '105–165 mm', mounting: 'Truck', hours: 9100 },
    description: 'Ex-fleet unit from a Goldfields contractor. Compliant with WA mine site standards. Sold with cyclone, sample splitter and support trailer.',
    partner: P.perthco, postedDaysAgo: 11, views: 534,
  }),
  L({
    id: 'l5', slug: 'boart-longyear-s250-underground',
    title: 'Boart Longyear S250 underground core rig', brand: 'Boart Longyear', model: 'S250',
    categoryId: 'rigs', subCategoryId: 'underground-core', categoryLabel: 'Underground core drill',
    condition: 'Used', year: 2017, location: 'Kitwe', country: 'Zambia',
    priceType: 'on_request', price: null, priceUSD: 158000, currency: 'USD',
    availability: 'Available now', featured: false,
    headlineSpecs: [{ label: 'Max depth', value: '350 m' }, { label: 'Hole size', value: 'BQ / NQ' }, { label: 'Hours', value: '7,800' }],
    specs: [
      { label: 'Maximum drilling depth', value: '350 m (BQ)' },
      { label: 'Hole diameter', value: 'BQ, NQ' },
      { label: 'Power', value: 'Electric, 55 kW' },
      { label: 'Mounting', value: 'Skid' },
      { label: 'Operating hours', value: '7,800' },
    ],
    filterValues: { maxDepth: 350, holeSize: 'BQ', mounting: 'Skid', hours: 7800 },
    description: 'Compact electric underground unit, suitable for narrow drives. Recently fitted with new water swivel and chuck jaws.',
    partner: P.copperbelt, postedDaysAgo: 18, views: 143,
  }),
  L({
    id: 'l6', slug: 'geoprobe-7822dt-geotech',
    title: 'Geoprobe 7822DT geotechnical rig', brand: 'Geoprobe', model: '7822DT',
    categoryId: 'rigs', subCategoryId: 'geotech', categoryLabel: 'Geotechnical rig',
    condition: 'Refurbished', year: 2015, location: 'Sudbury, ON', country: 'Canada',
    priceType: 'fixed', price: 168000, priceUSD: 168000, currency: 'USD',
    availability: 'Lead time 2 weeks', featured: false,
    headlineSpecs: [{ label: 'Max depth', value: '90 m' }, { label: 'Pullback', value: '178 kN' }, { label: 'Hours', value: '5,200' }],
    specs: [
      { label: 'Maximum depth', value: '90 m' },
      { label: 'Pullback', value: '178 kN' },
      { label: 'Mounting', value: 'Tracked' },
      { label: 'Methods', value: 'Direct push, hollow stem auger, SPT' },
      { label: 'Operating hours', value: '5,200' },
    ],
    filterValues: { maxDepth: 90, holeSize: 'NQ', mounting: 'Tracked', hours: 5200 },
    description: 'Overhauled 2025 with new tracks and rebuilt percussion hammer. Ideal for environmental and foundation investigation work.',
    partner: P.perthco, postedDaysAgo: 26, views: 97,
  }),

  L({
    id: 'l7', slug: 'rockmore-dth-bits-152mm',
    title: '6" DTH hammer bits — QL60 shank, 152 mm', brand: 'Rockmore', model: 'QL60',
    categoryId: 'bits', subCategoryId: 'dth-bit', categoryLabel: 'DTH bit',
    condition: 'New', year: null, location: 'Bengaluru, Karnataka', country: 'India',
    priceType: 'fixed', price: 1550, priceUSD: 414, currency: 'SAR',
    availability: '40 in stock', featured: false,
    headlineSpecs: [{ label: 'Diameter', value: '152 mm' }, { label: 'Shank', value: 'QL60' }, { label: 'Face', value: 'Concave' }],
    specs: [
      { label: 'Bit diameter', value: '152 mm (6")' },
      { label: 'Shank type', value: 'QL60' },
      { label: 'Face design', value: 'Concave' },
      { label: 'Button type', value: 'Spherical carbide' },
      { label: 'Button count', value: '8 gauge / 4 face' },
      { label: 'Recommended formation', value: 'Medium to hard abrasive' },
      { label: 'Minimum order', value: '5 units' },
    ],
    filterValues: { diameter: 152, shank: 'QL60', formation: 'Hard abrasive' },
    description: 'Genuine Rockmore bits held in Bengaluru stock. Volume pricing above 20 units. Same-day dispatch across South India.',
    partner: P.meridian, postedDaysAgo: 1, views: 221,
  }),
  L({
    id: 'l8', slug: 'impregnated-diamond-core-bit-nq',
    title: 'NQ impregnated diamond core bit — series 6', brand: 'Fordia', model: 'NQ-S6',
    categoryId: 'bits', subCategoryId: 'diamond-core', categoryLabel: 'Diamond core bit',
    condition: 'New', year: null, location: 'Perth, WA', country: 'Australia',
    priceType: 'fixed', price: 385, priceUSD: 385, currency: 'USD',
    availability: '120 in stock', featured: true,
    headlineSpecs: [{ label: 'Size', value: 'NQ' }, { label: 'Series', value: '6 (medium)' }, { label: 'Matrix', value: 'Impregnated' }],
    specs: [
      { label: 'Bit size', value: 'NQ (75.7 mm OD)' },
      { label: 'Series', value: '6 — medium to medium-hard' },
      { label: 'Matrix', value: 'Impregnated diamond' },
      { label: 'Waterways', value: 'Face discharge' },
      { label: 'Crown height', value: '12 mm' },
      { label: 'Minimum order', value: '10 units' },
    ],
    filterValues: { diameter: 76, shank: 'NQ', formation: 'Medium' },
    description: 'Series 6 crown suited to medium and medium-hard ground. Consistent penetration rates on greenstone and schist. Bulk pricing on request.',
    partner: P.perthco, postedDaysAgo: 3, views: 367,
  }),
  L({
    id: 'l9', slug: 'tricone-bit-8-5-inch',
    title: '8½" tricone bit — IADC 537, sealed bearing', brand: 'Varel', model: 'HP53',
    categoryId: 'bits', subCategoryId: 'tricone', categoryLabel: 'Tricone bit',
    condition: 'New', year: null, location: 'Dammam', country: 'Saudi Arabia',
    priceType: 'on_request', price: null, priceUSD: 2400, currency: 'USD',
    availability: 'Lead time 3 weeks', featured: false,
    headlineSpecs: [{ label: 'Diameter', value: '216 mm' }, { label: 'IADC', value: '537' }, { label: 'Bearing', value: 'Sealed' }],
    specs: [
      { label: 'Bit diameter', value: '216 mm (8½")' },
      { label: 'IADC code', value: '537' },
      { label: 'Bearing', value: 'Sealed roller' },
      { label: 'Connection', value: '4½" API reg pin' },
      { label: 'Cutting structure', value: 'TCI, medium-hard formation' },
    ],
    filterValues: { diameter: 216, shank: 'API reg', formation: 'Hard' },
    description: 'Suited to water well and deep geothermal applications in medium-hard carbonate. Export from Dammam.',
    partner: P.sahara, postedDaysAgo: 22, views: 88,
  }),

  L({
    id: 'l10', slug: 'nq-drill-rods-3m',
    title: 'NQ wireline drill rods — 3 m, heat treated', brand: 'Meridian', model: 'NQ-3000',
    categoryId: 'rods', subCategoryId: 'core-rod', categoryLabel: 'Drill rod',
    condition: 'New', year: null, location: 'Bengaluru, Karnataka', country: 'India',
    priceType: 'fixed', price: 580, priceUSD: 154, currency: 'SAR',
    availability: '220 in stock', featured: false,
    headlineSpecs: [{ label: 'Size', value: 'NQ' }, { label: 'Length', value: '3.0 m' }, { label: 'Wall', value: '4.85 mm' }],
    specs: [
      { label: 'Rod size', value: 'NQ' },
      { label: 'Length', value: '3.0 m' },
      { label: 'Outside diameter', value: '69.9 mm' },
      { label: 'Wall thickness', value: '4.85 mm' },
      { label: 'Thread', value: 'NQ standard wireline' },
      { label: 'Material', value: 'Heat treated alloy steel' },
      { label: 'Weight per rod', value: '23.5 kg' },
    ],
    filterValues: { rodSize: 'NQ', length: '3.0 m' },
    description: 'Priced per rod. Threads gauge-checked before dispatch. Bulk rates above 50 rods, delivered ex-Bengaluru.',
    partner: P.meridian, postedDaysAgo: 6, views: 198,
  }),
  L({
    id: 'l11', slug: 'hwt-casing-3m',
    title: 'HWT casing — 3 m lengths, flush joint', brand: 'Copperbelt', model: 'HWT-3',
    categoryId: 'rods', subCategoryId: 'casing', categoryLabel: 'Casing',
    condition: 'New', year: null, location: 'Kitwe', country: 'Zambia',
    priceType: 'fixed', price: 310, priceUSD: 310, currency: 'USD',
    availability: '90 in stock', featured: false,
    headlineSpecs: [{ label: 'Size', value: 'HWT' }, { label: 'Length', value: '3.0 m' }, { label: 'Joint', value: 'Flush' }],
    specs: [
      { label: 'Casing size', value: 'HWT' },
      { label: 'Outside diameter', value: '114.3 mm' },
      { label: 'Length', value: '3.0 m' },
      { label: 'Joint type', value: 'Flush joint' },
      { label: 'Weight', value: '38 kg per length' },
    ],
    filterValues: { rodSize: 'HWT', length: '3.0 m' },
    description: 'Stocked in Kitwe for Copperbelt operations. Delivery across Zambia and southern DRC within a week.',
    partner: P.copperbelt, postedDaysAgo: 14, views: 76,
  }),

  L({
    id: 'l12', slug: 'hq3-core-barrel-assembly',
    title: 'HQ3 triple tube core barrel assembly', brand: 'Fordia', model: 'HQ3',
    categoryId: 'downhole', subCategoryId: 'core-barrel', categoryLabel: 'Core barrel',
    condition: 'New', year: null, location: 'Sharjah', country: 'UAE',
    priceType: 'on_request', price: null, priceUSD: 4800, currency: 'USD',
    availability: 'Lead time 3 weeks', featured: false,
    headlineSpecs: [{ label: 'Size', value: 'HQ3' }, { label: 'Type', value: 'Triple tube' }, { label: 'Length', value: '3.0 m' }],
    specs: [
      { label: 'Barrel size', value: 'HQ3' },
      { label: 'Configuration', value: 'Triple tube wireline' },
      { label: 'Core diameter', value: '61.1 mm' },
      { label: 'Barrel length', value: '3.0 m' },
      { label: 'Split tube', value: 'Included' },
      { label: 'Application', value: 'Broken and fractured ground' },
    ],
    filterValues: { toolSize: 'HQ', tubeType: 'Triple tube' },
    description: 'Complete assembly including head, outer tube, inner tube and split tube. Markedly better recovery in fractured ground than double tube.',
    partner: P.sahara, postedDaysAgo: 13, views: 134,
  }),
  L({
    id: 'l13', slug: 'nq-overshot-assembly',
    title: 'NQ wireline overshot assembly', brand: 'Boart Longyear', model: 'NQ-OS',
    categoryId: 'downhole', subCategoryId: 'overshot', categoryLabel: 'Overshot',
    condition: 'New', year: null, location: 'Accra', country: 'Ghana',
    priceType: 'fixed', price: 1150, priceUSD: 1150, currency: 'USD',
    availability: '8 in stock', featured: false,
    headlineSpecs: [{ label: 'Size', value: 'NQ' }, { label: 'Type', value: 'Wireline' }, { label: 'Cable', value: '4.8 mm' }],
    specs: [
      { label: 'Size', value: 'NQ' },
      { label: 'Type', value: 'Standard wireline overshot' },
      { label: 'Cable size', value: '4.8 mm' },
      { label: 'Length', value: '1.5 m' },
    ],
    filterValues: { toolSize: 'NQ', tubeType: 'N/A' },
    description: 'Standard NQ overshot with lifting dogs and jar assembly. Held in Accra stock for West African operations.',
    partner: P.accra, postedDaysAgo: 30, views: 41,
  }),
  L({
    id: 'l14', slug: 'reflex-ez-trac-survey-tool',
    title: 'REFLEX EZ-TRAC downhole survey tool', brand: 'REFLEX', model: 'EZ-TRAC',
    categoryId: 'downhole', subCategoryId: 'survey', categoryLabel: 'Survey tool',
    condition: 'Used', year: 2022, location: 'Santiago', country: 'Chile',
    priceType: 'on_request', price: null, priceUSD: 9200, currency: 'USD',
    availability: 'Available now', featured: false,
    headlineSpecs: [{ label: 'Type', value: 'Multishot' }, { label: 'Accuracy', value: '±0.35°' }, { label: 'Temp', value: '70 °C' }],
    specs: [
      { label: 'Survey type', value: 'Continuous multishot' },
      { label: 'Azimuth accuracy', value: '±0.35°' },
      { label: 'Dip accuracy', value: '±0.2°' },
      { label: 'Maximum temperature', value: '70 °C' },
      { label: 'Includes', value: 'Tool, charger, case, software licence' },
    ],
    filterValues: { toolSize: 'NQ', tubeType: 'N/A' },
    description: 'Two units available, both calibrated within the last six months. Certificates supplied.',
    partner: P.andes, postedDaysAgo: 7, views: 162,
  }),
  L({
    id: 'l15', slug: 'ql60-dth-hammer',
    title: 'QL60 DTH hammer — high pressure', brand: 'Numa', model: 'QL60',
    categoryId: 'downhole', subCategoryId: 'hammer', categoryLabel: 'DTH hammer',
    condition: 'New', year: null, location: 'Bellary, Karnataka', country: 'India',
    priceType: 'fixed', price: 12800, priceUSD: 3420, currency: 'SAR',
    availability: '6 in stock', featured: false,
    headlineSpecs: [{ label: 'Size', value: '6"' }, { label: 'Pressure', value: '10–25 bar' }, { label: 'Shank', value: 'QL60' }],
    specs: [
      { label: 'Hammer size', value: '6"' },
      { label: 'Operating pressure', value: '10–25 bar' },
      { label: 'Shank', value: 'QL60' },
      { label: 'Bit range', value: '152–178 mm' },
      { label: 'Top sub', value: '2⅜" API reg' },
    ],
    filterValues: { toolSize: '6"', tubeType: 'N/A' },
    description: 'High pressure hammer suited to blast hole and water well work. Spare wear sleeve included.',
    partner: P.kalyan, postedDaysAgo: 5, views: 119,
  }),

  L({
    id: 'l16', slug: 'atlas-copco-xas-186-compressor',
    title: 'Atlas Copco XAS 186 portable compressor', brand: 'Atlas Copco', model: 'XAS 186',
    categoryId: 'support', subCategoryId: 'compressor', categoryLabel: 'Compressor',
    condition: 'Used', year: 2020, location: 'Hospet, Karnataka', country: 'India',
    priceType: 'fixed', price: 65200, priceUSD: 17400, currency: 'SAR',
    availability: 'Available now', featured: false,
    headlineSpecs: [{ label: 'Free air', value: '10.6 m³/min' }, { label: 'Pressure', value: '7 bar' }, { label: 'Hours', value: '4,100' }],
    specs: [
      { label: 'Free air delivery', value: '10.6 m³/min' },
      { label: 'Working pressure', value: '7 bar' },
      { label: 'Engine', value: 'Kubota V3307' },
      { label: 'Operating hours', value: '4,100' },
      { label: 'Fuel tank', value: '120 L' },
      { label: 'Mounting', value: 'Two-wheel towable' },
    ],
    filterValues: { pressure: 7, flow: 10.6 },
    description: 'Used for air flush support on core drilling contracts. New air filters and oil separator fitted this year.',
    partner: P.kalyan, postedDaysAgo: 20, views: 203,
  }),
  L({
    id: 'l17', slug: 'bean-435-mud-pump',
    title: 'Bean 435 triplex mud pump', brand: 'Bean', model: '435',
    categoryId: 'support', subCategoryId: 'mud-pump', categoryLabel: 'Mud pump',
    condition: 'Refurbished', year: 2018, location: 'Lubumbashi', country: 'DRC',
    priceType: 'on_request', price: null, priceUSD: 14500, currency: 'USD',
    availability: 'Available now', featured: false,
    headlineSpecs: [{ label: 'Flow', value: '132 L/min' }, { label: 'Pressure', value: '69 bar' }, { label: 'Type', value: 'Triplex' }],
    specs: [
      { label: 'Maximum flow', value: '132 L/min' },
      { label: 'Maximum pressure', value: '69 bar (1,000 psi)' },
      { label: 'Pump type', value: 'Triplex piston' },
      { label: 'Drive', value: 'Diesel, Yanmar' },
      { label: 'Condition note', value: 'New fluid end fitted 2025' },
    ],
    filterValues: { pressure: 69, flow: 0.13 },
    description: 'Rebuilt fluid end and new pistons. Direct replacement on LF90 and UDR class rigs.',
    partner: P.kivu, postedDaysAgo: 16, views: 91,
  }),
  L({
    id: 'l18', slug: 'booster-compressor-35bar',
    title: 'Air booster — 35 bar, skid mounted', brand: 'CompAir', model: 'B35',
    categoryId: 'support', subCategoryId: 'booster', categoryLabel: 'Booster',
    condition: 'Used', year: 2019, location: 'Ulaanbaatar', country: 'Mongolia',
    priceType: 'fixed', price: 46000, priceUSD: 46000, currency: 'USD',
    availability: 'Available now', featured: false,
    headlineSpecs: [{ label: 'Pressure', value: '35 bar' }, { label: 'Flow', value: '21 m³/min' }, { label: 'Hours', value: '2,900' }],
    specs: [
      { label: 'Discharge pressure', value: '35 bar' },
      { label: 'Flow', value: '21 m³/min' },
      { label: 'Mounting', value: 'Skid' },
      { label: 'Engine', value: 'Cummins QSB6.7' },
      { label: 'Operating hours', value: '2,900' },
    ],
    filterValues: { pressure: 35, flow: 21 },
    description: 'Boosts primary compressor output for deep DTH work. Low hours, used seasonally only.',
    partner: P.perthco, postedDaysAgo: 24, views: 67,
  }),

  L({
    id: 'l19', slug: 'bentonite-drilling-fluid-25kg',
    title: 'High-yield bentonite — 25 kg bags', brand: 'Meridian', model: 'BEN-HY',
    categoryId: 'consumables', subCategoryId: 'fluids', categoryLabel: 'Drilling fluid',
    condition: 'New', year: null, location: 'Bengaluru, Karnataka', country: 'India',
    priceType: 'fixed', price: 60, priceUSD: 15, currency: 'SAR',
    availability: '1,400 bags in stock', featured: false,
    headlineSpecs: [{ label: 'Pack', value: '25 kg' }, { label: 'Yield', value: '16 m³/t' }, { label: 'Grade', value: 'API' }],
    specs: [
      { label: 'Pack size', value: '25 kg' },
      { label: 'Yield', value: '16 m³ per tonne' },
      { label: 'Grade', value: 'API 13A section 9' },
      { label: 'Minimum order', value: '40 bags (1 tonne)' },
    ],
    filterValues: { packSize: '25 kg' },
    description: 'API grade high-yield bentonite. Pallet pricing available. Delivery across South and West India.',
    partner: P.meridian, postedDaysAgo: 8, views: 154,
  }),
  L({
    id: 'l20', slug: 'core-trays-nq-plastic',
    title: 'NQ core trays — UV stabilised, 5 row', brand: 'Accra Geotools', model: 'CT-NQ5',
    categoryId: 'consumables', subCategoryId: 'core-tray', categoryLabel: 'Core tray',
    condition: 'New', year: null, location: 'Accra', country: 'Ghana',
    priceType: 'fixed', price: 22, priceUSD: 22, currency: 'USD',
    availability: '2,000 in stock', featured: false,
    headlineSpecs: [{ label: 'Size', value: 'NQ' }, { label: 'Rows', value: '5' }, { label: 'Length', value: '1.05 m' }],
    specs: [
      { label: 'Core size', value: 'NQ' },
      { label: 'Rows', value: '5' },
      { label: 'Tray length', value: '1.05 m' },
      { label: 'Material', value: 'UV stabilised polypropylene' },
      { label: 'Stackable', value: 'Yes' },
    ],
    filterValues: { packSize: 'Per unit' },
    description: 'Stackable UV-stabilised trays suited to long-term core farm storage in tropical conditions.',
    partner: P.accra, postedDaysAgo: 12, views: 58,
  }),

  L({
    id: 'l21', slug: 'drilling-ppe-kit',
    title: 'Driller PPE kit — helmet, visor, gloves, hearing', brand: 'Meridian', model: 'PPE-STD',
    categoryId: 'safety', subCategoryId: 'ppe', categoryLabel: 'PPE kit',
    condition: 'New', year: null, location: 'Bengaluru, Karnataka', country: 'India',
    priceType: 'fixed', price: 220, priceUSD: 58, currency: 'SAR',
    availability: '300 kits in stock', featured: false,
    headlineSpecs: [{ label: 'Standard', value: 'IS 2925' }, { label: 'Items', value: '6 piece' }, { label: 'Sizes', value: 'M – XXL' }],
    specs: [
      { label: 'Helmet standard', value: 'IS 2925' },
      { label: 'Contents', value: 'Helmet, face visor, ear defenders, impact gloves, safety glasses, hi-vis vest' },
      { label: 'Sizes', value: 'M to XXL' },
      { label: 'Minimum order', value: '10 kits' },
    ],
    filterValues: { standard: 'IS 2925' },
    description: 'Standard issue kit for core drilling crews. Bulk rates for fleet outfitting.',
    partner: P.meridian, postedDaysAgo: 10, views: 87,
  }),

  L({
    id: 'l22', slug: 'core-drilling-rig-rental-karnataka',
    title: 'Core drilling rig rental — operated, Karnataka', brand: 'Kalyan', model: 'Rental',
    categoryId: 'services', subCategoryId: 'rig-rental', categoryLabel: 'Rig rental',
    condition: 'New', year: null, location: 'Bellary, Karnataka', country: 'India',
    priceType: 'rental', price: 8300, priceUSD: 2220, currency: 'SAR',
    availability: 'Two rigs available', featured: true,
    headlineSpecs: [{ label: 'Rate basis', value: 'Per day' }, { label: 'Crew', value: 'Included' }, { label: 'Minimum', value: '30 days' }],
    specs: [
      { label: 'Rate basis', value: 'Per rig, per day' },
      { label: 'Minimum hire period', value: '30 days' },
      { label: 'Crew', value: 'Driller and two assistants included' },
      { label: 'Consumables', value: 'Client supplied' },
      { label: 'Mobilisation', value: 'Quoted separately' },
      { label: 'Rig type', value: 'Surface core, NQ/HQ capable' },
    ],
    filterValues: { rateBasis: 'Per day' },
    description: 'Operated rig hire across Karnataka and northern Andhra Pradesh. Daily production reported through XPLORIX so you see metreage and downtime on your own dashboard.',
    partner: P.kalyan, postedDaysAgo: 8, views: 341,
  }),
  L({
    id: 'l23', slug: 'rig-transport-mobilisation-drc',
    title: 'Rig transport and mobilisation — Southern DRC', brand: 'Kivu', model: 'Transport',
    categoryId: 'services', subCategoryId: 'transport', categoryLabel: 'Transport',
    condition: 'New', year: null, location: 'Lubumbashi', country: 'DRC',
    priceType: 'on_request', price: null, priceUSD: 6500, currency: 'USD',
    availability: 'Bookings from 2 weeks', featured: false,
    headlineSpecs: [{ label: 'Rate basis', value: 'Per job' }, { label: 'Max load', value: '30 t' }, { label: 'Coverage', value: 'Katanga' }],
    specs: [
      { label: 'Rate basis', value: 'Per job, quoted on route' },
      { label: 'Maximum load', value: '30 tonnes' },
      { label: 'Coverage', value: 'Katanga, Lualaba, northern Zambia' },
      { label: 'Includes', value: 'Lowbed, escort, permits' },
    ],
    filterValues: { rateBasis: 'Per job' },
    description: 'Rig relocation across the copper belt including border crossings into Zambia. Customs documentation handled.',
    partner: P.kivu, postedDaysAgo: 19, views: 72,
  }),
  L({
    id: 'l24', slug: 'rotation-head-overhaul-service',
    title: 'Rotation head and gearbox overhaul', brand: 'Perth Core', model: 'Overhaul',
    categoryId: 'services', subCategoryId: 'repair', categoryLabel: 'Repair service',
    condition: 'New', year: null, location: 'Perth, WA', country: 'Australia',
    priceType: 'on_request', price: null, priceUSD: 11000, currency: 'USD',
    availability: 'Turnaround 10 days', featured: false,
    headlineSpecs: [{ label: 'Rate basis', value: 'Per job' }, { label: 'Turnaround', value: '10 days' }, { label: 'Warranty', value: '12 months' }],
    specs: [
      { label: 'Rate basis', value: 'Per unit, fixed quote after inspection' },
      { label: 'Turnaround', value: '10 working days' },
      { label: 'Warranty', value: '12 months on parts and labour' },
      { label: 'Covers', value: 'LF90, LF160, DE130, DE740, UDR' },
    ],
    filterValues: { rateBasis: 'Per job' },
    description: 'Full strip, inspection and rebuild with OEM bearings and seals. Test certificate issued on completion.',
    partner: P.perthco, postedDaysAgo: 15, views: 128,
  }),
]

/* ---------------- Helpers ---------------- */

export const CONDITIONS: Condition[] = ['New', 'Used', 'Refurbished']

export function formatPrice(l: Listing): string {
  if (l.priceType === 'on_request' || l.price === null) return 'Price on request'
  const symbol = l.currency === 'SAR' ? 'SAR ' : '$'
  const n = l.price.toLocaleString('en-US')
  return l.priceType === 'rental' ? `${symbol}${n} / day` : `${symbol}${n}`
}

export function getListing(slug: string): Listing | undefined {
  return LISTINGS.find((l) => l.slug === slug || l.id === slug)
}

export function categoryCount(categoryId: string): number {
  return categoryId === 'all'
    ? LISTINGS.length
    : LISTINGS.filter((l) => l.categoryId === categoryId).length
}

export function countryCount(country: string): number {
  return LISTINGS.filter((l) => l.country === country).length
}

export const MARKET_STATS = {
  listings: LISTINGS.length,
  partners: new Set(LISTINGS.map((l) => l.partner.id)).size,
  countries: new Set(LISTINGS.map((l) => l.country)).size,
  verifiedShare: Math.round(
    (LISTINGS.filter((l) => l.partner.verified).length / LISTINGS.length) * 100
  ),
}
