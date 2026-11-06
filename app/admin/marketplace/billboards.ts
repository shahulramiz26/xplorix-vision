/* ------------------------------------------------------------------ *
 * XPLORIX Exchange — supplier advertising
 *
 * Planned tables:
 *   campaigns         id, partner_id, placement, tier, eyebrow, headline,
 *                     subline, points[], cta_label, href, accent, brand_mark,
 *                     image_url, starts_on, ends_on, weight, status
 *   campaign_events   id, campaign_id, type (impression|click),
 *                     actor_company_id, slide_index, created_at
 *
 * Rules held here rather than left to the UI:
 *   - every paid slide carries a visible "Sponsored" label
 *   - unsold inventory falls back to a house slide, never a blank frame
 *   - suppliers buy a slot; results ranking is never for sale
 * ------------------------------------------------------------------ */

export type Placement = 'carousel' | 'grid'
export type Tier = 'Spotlight' | 'Premium' | 'Standard' | 'House'

export interface Campaign {
  id: string
  partnerId: string | null        // null = house slide
  partnerName: string
  partnerCountry: string
  verified: boolean
  placement: Placement
  tier: Tier
  eyebrow: string
  headline: string
  subline: string
  points: string[]                // up to 3 short proof points
  ctaLabel: string
  href: string
  accent: string                  // supplier brand colour
  brandMark: string               // large typographic mark on the right
  imageUrl?: string               // optional product photo behind the panel
  startsOn: string
  endsOn: string
  weight: number                  // rotation share
  impressions: number
  clicks: number
}

/* ---------------- Rate card ----------------
   One source of truth for the Partner Console and invoicing. USD/month. */

export const SLOT_SPECS: Record<Placement, {
  label: string
  description: string
  size: string
  monthlyRate: number
  maxConcurrent: number
}> = {
  carousel: {
    label: 'Exchange billboard',
    description: 'Full width at the top of the Exchange, auto-rotating. Every buyer sees it on entry.',
    size: '1180 × 360',
    monthlyRate: 2400,
    maxConcurrent: 6,
  },
  grid: {
    label: 'In-grid placement',
    description: 'One marked card inside the results grid. Never affects ranking.',
    size: '258 × 400',
    monthlyRate: 650,
    maxConcurrent: 6,
  },
}

/* ---------------- Live campaigns ---------------- */

export const CAMPAIGNS: Campaign[] = [
  {
    id: 'cp1', partnerId: 'p6', partnerName: 'Perth Core Systems', partnerCountry: 'Australia',
    verified: true, placement: 'carousel', tier: 'Spotlight',
    eyebrow: 'New season stock',
    headline: 'Impregnated core bits, series 4 through 10',
    subline: 'BQ to PQ crowns held in Perth and Kalgoorlie, matched to your ground conditions.',
    points: ['24 hour dispatch across APAC', '120 units in stock', 'Volume pricing from 10'],
    ctaLabel: 'View the range', href: '/admin/marketplace?category=bits',
    accent: 'var(--x-blue-b)', brandMark: 'PCS',
    startsOn: '2026-09-18', endsOn: '2026-12-18', weight: 3,
    impressions: 18420, clicks: 604,
  },
  {
    id: 'cp2', partnerId: 'p1', partnerName: 'Meridian Drilling Supplies', partnerCountry: 'India',
    verified: true, placement: 'carousel', tier: 'Premium',
    eyebrow: 'Monsoon clearance',
    headline: 'NQ and HQ wireline rods at 12% off',
    subline: 'Heat treated alloy steel, threads gauge checked before every dispatch.',
    points: ['220 rods ready to ship', 'Ex-Bengaluru, 3 day delivery', 'Bulk rates above 50'],
    ctaLabel: 'See rod stock', href: '/admin/marketplace?category=rods',
    accent: 'var(--x-orange)', brandMark: 'MDS',
    startsOn: '2026-10-02', endsOn: '2026-11-17', weight: 3,
    impressions: 9310, clicks: 388,
  },
  {
    id: 'cp3', partnerId: 'p4', partnerName: 'Kivu Mining Supply SARL', partnerCountry: 'DRC',
    verified: true, placement: 'carousel', tier: 'Standard',
    eyebrow: 'Katanga and Lualaba',
    headline: 'Rig transport and customs across the copper belt',
    subline: 'Lowbed relocation to 30 tonnes with permits and border crossings handled end to end.',
    points: ['30 tonne capacity', 'Zambia border cleared', 'Escort included'],
    ctaLabel: 'Request a route quote', href: '/admin/marketplace/rig-transport-mobilisation-drc',
    accent: 'var(--x-green-b)', brandMark: 'KMS',
    startsOn: '2026-08-18', endsOn: '2027-02-17', weight: 2,
    impressions: 12040, clicks: 271,
  },
  {
    id: 'cp4', partnerId: 'p2', partnerName: 'Kalyan Exploration Equipment', partnerCountry: 'India',
    verified: true, placement: 'carousel', tier: 'Premium',
    eyebrow: 'Operated hire',
    headline: 'Two core rigs available in Al Madinah from December',
    subline: 'Driller and two assistants included, NQ and HQ capable to 900 metres.',
    points: ['Crew included', 'Production into your dashboard', '30 day minimum'],
    ctaLabel: 'Check availability', href: '/admin/marketplace/core-drilling-rig-rental-karnataka',
    accent: 'var(--x-yellow)', brandMark: 'KEE',
    startsOn: '2026-09-27', endsOn: '2027-01-17', weight: 2,
    impressions: 5120, clicks: 196,
  },
  {
    id: 'cp5', partnerId: 'p5', partnerName: 'Copperbelt Drilling Traders', partnerCountry: 'Zambia',
    verified: true, placement: 'carousel', tier: 'Standard',
    eyebrow: 'Held in Kitwe',
    headline: 'Casing and rod stock for the Copperbelt',
    subline: 'HWT and PWT casing plus BQ to HQ rods, delivered across Zambia and southern DRC.',
    points: ['Delivery within a week', '90 lengths in stock', 'Flush joint'],
    ctaLabel: 'Browse stock', href: '/admin/marketplace?category=rods',
    accent: 'var(--x-purple-b)', brandMark: 'CDT',
    startsOn: '2026-09-22', endsOn: '2027-01-02', weight: 2,
    impressions: 7440, clicks: 158,
  },
  {
    id: 'cp6', partnerId: 'p3', partnerName: 'Sahara Rig Services FZE', partnerCountry: 'UAE',
    verified: false, placement: 'carousel', tier: 'Standard',
    eyebrow: 'Recovery in bad ground',
    headline: 'HQ3 and NQ3 triple tube barrel assemblies',
    subline: 'Complete assemblies with split tube, for fractured and broken formations.',
    points: ['Three week lead time', 'Export from Sharjah', 'Split tube included'],
    ctaLabel: 'Enquire now', href: '/admin/marketplace/hq3-core-barrel-assembly',
    accent: 'var(--x-pink)', brandMark: 'SRS',
    startsOn: '2026-10-07', endsOn: '2026-12-07', weight: 1,
    impressions: 3110, clicks: 64,
  },

  /* in-grid */
  {
    id: 'cp7', partnerId: 'p2', partnerName: 'Kalyan Exploration Equipment', partnerCountry: 'India',
    verified: true, placement: 'grid', tier: 'Standard',
    eyebrow: 'Operated hire',
    headline: 'Two core rigs available in Al Madinah',
    subline: 'Crew included, production reported straight into your XPLORIX dashboard.',
    points: [],
    ctaLabel: 'Check availability', href: '/admin/marketplace/core-drilling-rig-rental-karnataka',
    accent: 'var(--x-yellow)', brandMark: 'KEE',
    startsOn: '2026-09-27', endsOn: '2027-01-17', weight: 2,
    impressions: 5120, clicks: 196,
  },
]

/* ---------------- House slides (unsold inventory) ---------------- */

export const HOUSE_CAMPAIGNS: Campaign[] = [
  {
    id: 'hs1', partnerId: null, partnerName: 'XPLORIX', partnerCountry: '',
    verified: false, placement: 'carousel', tier: 'House',
    eyebrow: 'Supply the industry',
    headline: 'Advertise here — reach every drilling contractor on XPLORIX',
    subline: 'Put your equipment in front of buyers who arrive with rig counts and budgets already attached.',
    points: ['Verified buyers only', 'Monthly slot, not per click', 'Full impression reporting'],
    ctaLabel: 'Become a partner', href: '/partner/register',
    accent: 'var(--x-orange)', brandMark: 'XPX',
    startsOn: '2026-02-18', endsOn: '2099-01-01', weight: 1,
    impressions: 0, clicks: 0,
  },
  {
    id: 'hs2', partnerId: null, partnerName: 'XPLORIX', partnerCountry: '',
    verified: false, placement: 'grid', tier: 'House',
    eyebrow: 'Crew shortage',
    headline: 'Find a driller who can run your rig from day one',
    subline: 'Matched on rig experience and availability date, with production verified by XPLORIX.',
    points: [],
    ctaLabel: 'Browse available crew', href: '/admin/crew',
    accent: 'var(--x-orange)', brandMark: 'XPX',
    startsOn: '2026-02-18', endsOn: '2099-01-01', weight: 1,
    impressions: 0, clicks: 0,
  },
]

/* ---------------- Selection ---------------- */

const TODAY = '2026-10-17'

const isActive = (c: Campaign) => c.startsOn <= TODAY && c.endsOn >= TODAY

/**
 * All active slides for the billboard, ordered by tier then weight so
 * Spotlight campaigns lead the rotation. Falls back to house slides.
 */
export function carouselSlides(): Campaign[] {
  const live = CAMPAIGNS.filter((c) => c.placement === 'carousel' && isActive(c))
  if (live.length === 0) return HOUSE_CAMPAIGNS.filter((c) => c.placement === 'carousel')
  const order: Tier[] = ['Spotlight', 'Premium', 'Standard', 'House']
  return [...live].sort(
    (a, b) => order.indexOf(a.tier) - order.indexOf(b.tier) || b.weight - a.weight
  )
}

export function pickCampaign(placement: Placement, rotationKey = 0): Campaign {
  const pool = CAMPAIGNS.filter((c) => c.placement === placement && isActive(c))
  if (pool.length === 0) {
    const house = HOUSE_CAMPAIGNS.filter((h) => h.placement === placement)
    return house[rotationKey % house.length]
  }
  const expanded = pool.flatMap((c) => Array<Campaign>(c.weight).fill(c))
  return expanded[rotationKey % expanded.length]
}

/** Stub — replace with a POST to /api/campaign-events. */
export function trackCampaign(id: string, type: 'impression' | 'click', slideIndex?: number) {
  if (typeof window === 'undefined') return
  // eslint-disable-next-line no-console
  console.debug('[campaign]', type, id, slideIndex ?? '')
}

export function ctr(c: Campaign): string {
  if (!c.impressions) return '—'
  return `${((c.clicks / c.impressions) * 100).toFixed(2)}%`
}

/** Seconds each slide is held before advancing. */
export const SLIDE_DURATION = 6
