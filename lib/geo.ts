/* ==========================================================================
 * WHERE A HOLE IS, AND WHERE IT WENT
 *
 * Plain maths, no React and no store, so the server could run it too.
 *
 *   Collar      where the hole starts on the ground. A project keeps its
 *               collars either as latitude/longitude or as UTM metres
 *               (easting, northing and a zone such as 43N). The map always
 *               needs latitude/longitude, so UTM is converted here.
 *
 *   Direction   azimuth is the compass bearing, 0–360°, clockwise from north.
 *               dip is the angle from flat, negative going down: −90° is
 *               straight down, −60° is a common angled hole. This is how
 *               XPLORIX stores it. A file that gives inclination from vertical
 *               (0° = straight down) is turned into this on import.
 *
 *   Path        from survey readings by the minimum curvature method, the
 *               one the drilling industry uses: each pair of readings is
 *               joined by the smoothest arc that fits both directions.
 * ========================================================================== */

const D2R = Math.PI / 180
const R2D = 180 / Math.PI

export type CoordSystem = 'latlon' | 'utm'

export interface Collar {
  lat?: number; lon?: number            // degrees, WGS84
  easting?: number; northing?: number   // metres, UTM
  rl?: number                           // height of the collar, metres
}

// ── UTM ↔ latitude/longitude (WGS84) ──────────────────────────────────────

const A = 6378137
const F = 1 / 298.257223563
const K0 = 0.9996
const E2 = F * (2 - F)
const EP2 = E2 / (1 - E2)

/* "43N", "43 N", "38S" → zone number and hemisphere. */
export function parseZone(zone?: string): { zone: number; north: boolean } | null {
  const m = (zone ?? '').trim().toUpperCase().match(/^(\d{1,2})\s*([A-Z])?$/)
  if (!m) return null
  const n = Number(m[1])
  if (n < 1 || n > 60) return null
  // A hemisphere letter N/S, or a latitude band letter (N and above is north).
  const letter = m[2] ?? 'N'
  const north = letter === 'N' || (letter !== 'S' && letter >= 'N')
  return { zone: n, north }
}

export function utmToLatLon(easting: number, northing: number, zoneText: string): { lat: number; lon: number } | null {
  const z = parseZone(zoneText)
  if (!z || !isFinite(easting) || !isFinite(northing)) return null
  const x = easting - 500000
  const y = z.north ? northing : northing - 10000000
  const lon0 = ((z.zone - 1) * 6 - 180 + 3) * D2R
  const M = y / K0
  const mu = M / (A * (1 - E2 / 4 - 3 * E2 * E2 / 64 - 5 * E2 ** 3 / 256))
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2))
  const phi1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu)
    + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu)
  const s = Math.sin(phi1), c = Math.cos(phi1), t = Math.tan(phi1)
  const N1 = A / Math.sqrt(1 - E2 * s * s)
  const T1 = t * t
  const C1 = EP2 * c * c
  const R1 = A * (1 - E2) / Math.pow(1 - E2 * s * s, 1.5)
  const Dd = x / (N1 * K0)
  const lat = phi1 - (N1 * t / R1) * (Dd * Dd / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * Dd ** 4 / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2 - 3 * C1 * C1) * Dd ** 6 / 720)
  const lon = lon0 + (Dd - (1 + 2 * T1 + C1) * Dd ** 3 / 6
    + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1) * Dd ** 5 / 120) / c
  return { lat: lat * R2D, lon: lon * R2D }
}

export function latLonToUtm(lat: number, lon: number, zone?: number): { easting: number; northing: number; zone: string } {
  const zn = zone ?? Math.floor((lon + 180) / 6) + 1
  const lon0 = ((zn - 1) * 6 - 180 + 3) * D2R
  const phi = lat * D2R, lam = lon * D2R
  const s = Math.sin(phi), c = Math.cos(phi), t = Math.tan(phi)
  const N = A / Math.sqrt(1 - E2 * s * s)
  const T = t * t
  const C = EP2 * c * c
  const Aa = c * (lam - lon0)
  const M = A * ((1 - E2 / 4 - 3 * E2 * E2 / 64 - 5 * E2 ** 3 / 256) * phi
    - (3 * E2 / 8 + 3 * E2 * E2 / 32 + 45 * E2 ** 3 / 1024) * Math.sin(2 * phi)
    + (15 * E2 * E2 / 256 + 45 * E2 ** 3 / 1024) * Math.sin(4 * phi)
    - (35 * E2 ** 3 / 3072) * Math.sin(6 * phi))
  const easting = K0 * N * (Aa + (1 - T + C) * Aa ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * EP2) * Aa ** 5 / 120) + 500000
  let northing = K0 * (M + N * t * (Aa * Aa / 2 + (5 - T + 9 * C + 4 * C * C) * Aa ** 4 / 24
    + (61 - 58 * T + T * T + 600 * C - 330 * EP2) * Aa ** 6 / 720))
  if (lat < 0) northing += 10000000
  return { easting, northing, zone: `${zn}${lat >= 0 ? 'N' : 'S'}` }
}

/* The collar as latitude/longitude, whichever way the project keeps it. */
export function collarLatLon(c: Collar | undefined, system: CoordSystem | undefined, zone?: string): { lat: number; lon: number } | null {
  if (!c) return null
  if ((system ?? 'latlon') === 'latlon') {
    if (c.lat == null || c.lon == null || !isFinite(c.lat) || !isFinite(c.lon)) return null
    if (Math.abs(c.lat) > 90 || Math.abs(c.lon) > 180) return null
    return { lat: c.lat, lon: c.lon }
  }
  if (c.easting == null || c.northing == null) return null
  return utmToLatLon(c.easting, c.northing, zone ?? '')
}
export function hasCollar(c: Collar | undefined, system: CoordSystem | undefined, zone?: string) {
  return !!collarLatLon(c, system, zone)
}

// ── directions ────────────────────────────────────────────────────────────

/* Dip (−90 down … 0 flat) → inclination from vertical (0 down … 90 flat). */
export const dipToInc = (dip: number) => 90 + dip
export const incToDip = (inc: number) => inc - 90
export const normAz = (az: number) => ((az % 360) + 360) % 360

/* The smallest angle between two bearings, 0–180°. */
export function azDiff(a: number, b: number) {
  const d = Math.abs(normAz(a) - normAz(b))
  return d > 180 ? 360 - d : d
}

/* A direction as a unit vector: east, north, down. */
function vec(azimuth: number, dip: number) {
  const inc = dipToInc(dip) * D2R, az = azimuth * D2R
  return { e: Math.sin(inc) * Math.sin(az), n: Math.sin(inc) * Math.cos(az), d: Math.cos(inc) }
}
/* The angle between two directions, degrees. */
export function angleBetween(a: { azimuth: number; dip: number }, b: { azimuth: number; dip: number }) {
  const u = vec(a.azimuth, a.dip), v = vec(b.azimuth, b.dip)
  const dot = Math.max(-1, Math.min(1, u.e * v.e + u.n * v.n + u.d * v.d))
  return Math.acos(dot) * R2D
}

// ── the path ──────────────────────────────────────────────────────────────

export interface Station { depth: number; azimuth: number; dip: number }

/* A point on the hole. e, n are metres east and north of the collar; tvd is
 * metres straight down from the collar. `dls` is the dogleg severity arriving
 * at this point, in degrees every 30 m. */
export interface PathPoint extends Station {
  e: number; n: number; tvd: number
  dls: number
  projected?: boolean        // beyond the last reading: carried on in the last measured direction
}

/* Readings → the path, by minimum curvature. The readings are sorted by depth
 * and a reading at the same depth as another is ignored. A station at 0 m is
 * added in the direction of `start` (the planned direction, when there is one)
 * or of the first reading. With `to` the path is carried on past the last
 * reading in its direction, so a hole drilled past its last survey still
 * shows its full length. */
export function minimumCurvature(readings: Station[], opts: { start?: { azimuth: number; dip: number }; to?: number } = {}): PathPoint[] {
  const sorted = readings
    .filter(r => isFinite(r.depth) && isFinite(r.azimuth) && isFinite(r.dip) && r.depth >= 0)
    .sort((a, b) => a.depth - b.depth)
    .filter((r, i, all) => i === 0 || r.depth > all[i - 1].depth)
  if (!sorted.length && !opts.start) return []
  const first = sorted[0] ?? { depth: 0, ...opts.start! }
  const stations: (Station & { projected?: boolean })[] = sorted[0]?.depth === 0
    ? [...sorted]
    : [{ depth: 0, azimuth: opts.start?.azimuth ?? first.azimuth, dip: opts.start?.dip ?? first.dip }, ...sorted]
  const last = stations[stations.length - 1]
  if (opts.to != null && opts.to > last.depth + 0.01) stations.push({ depth: opts.to, azimuth: last.azimuth, dip: last.dip, projected: true })

  const out: PathPoint[] = []
  let e = 0, n = 0, tvd = 0
  stations.forEach((s, i) => {
    if (i === 0) { out.push({ ...s, e: 0, n: 0, tvd: 0, dls: 0 }); return }
    const p = stations[i - 1]
    const I1 = dipToInc(p.dip) * D2R, I2 = dipToInc(s.dip) * D2R
    const A1 = p.azimuth * D2R, A2 = s.azimuth * D2R
    const dmd = s.depth - p.depth
    const cosDL = Math.cos(I2 - I1) - Math.sin(I1) * Math.sin(I2) * (1 - Math.cos(A2 - A1))
    const DL = Math.acos(Math.max(-1, Math.min(1, cosDL)))
    const RF = DL > 1e-9 ? (2 / DL) * Math.tan(DL / 2) : 1
    n += (dmd / 2) * (Math.sin(I1) * Math.cos(A1) + Math.sin(I2) * Math.cos(A2)) * RF
    e += (dmd / 2) * (Math.sin(I1) * Math.sin(A1) + Math.sin(I2) * Math.sin(A2)) * RF
    tvd += (dmd / 2) * (Math.cos(I1) + Math.cos(I2)) * RF
    out.push({ ...s, e, n, tvd, dls: dmd > 0 ? (DL * R2D / dmd) * 30 : 0 })
  })
  return out
}

/* The planned hole: a straight line from the collar. */
export function plannedPoint(plan: { azimuth: number; dip: number }, depth: number) {
  const v = vec(plan.azimuth, plan.dip)
  return { e: v.e * depth, n: v.n * depth, tvd: v.d * depth }
}

/* A point on the path at any depth, by straight interpolation between the
 * stations around it (close enough at survey spacing for a deviation figure). */
export function pointAt(path: PathPoint[], depth: number) {
  if (!path.length) return null
  if (depth <= path[0].depth) return path[0]
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i]
    if (depth <= b.depth) {
      const t = (depth - a.depth) / (b.depth - a.depth || 1)
      return { depth, e: a.e + (b.e - a.e) * t, n: a.n + (b.n - a.n) * t, tvd: a.tvd + (b.tvd - a.tvd) * t }
    }
  }
  return path[path.length - 1]
}

export interface Deviation {
  depth: number               // where it is measured: the deepest point of the path
  metres: number              // straight-line distance from the planned line at that depth
  angle: number               // degrees between the planned direction and the hole's latest direction
  azimuthDrift: number        // degrees, signed: + is clockwise of plan
  dipDrift: number            // degrees, signed: + is flatter than plan
  horizontal: number          // metres off plan seen from above
  vertical: number            // metres above (+) or below (−) the planned line
}
export function deviation(path: PathPoint[], plan: { azimuth: number; dip: number }): Deviation | null {
  if (path.length < 2) return null
  const end = path[path.length - 1]
  const p = plannedPoint(plan, end.depth)
  const de = end.e - p.e, dn = end.n - p.n, dz = end.tvd - p.tvd
  let az = normAz(end.azimuth) - normAz(plan.azimuth)
  if (az > 180) az -= 360
  if (az < -180) az += 360
  return {
    depth: end.depth,
    metres: Math.sqrt(de * de + dn * dn + dz * dz),
    angle: angleBetween(end, plan),
    azimuthDrift: az,
    dipDrift: end.dip - plan.dip,
    horizontal: Math.sqrt(de * de + dn * dn),
    vertical: -dz,
  }
}

/* How far along the planned bearing a point sits, for the cross-section. */
export function alongBearing(pt: { e: number; n: number }, azimuth: number) {
  const a = azimuth * D2R
  return pt.e * Math.sin(a) + pt.n * Math.cos(a)
}
export function acrossBearing(pt: { e: number; n: number }, azimuth: number) {
  const a = azimuth * D2R
  return pt.e * Math.cos(a) - pt.n * Math.sin(a)
}

/* A point a few metres east and north of another, as latitude/longitude.
 * Flat-earth arithmetic: exact enough over the length of a drill hole. */
export function offsetLatLon(at: { lat: number; lon: number }, east: number, north: number) {
  return { lat: at.lat + north / 111320, lon: at.lon + east / (111320 * Math.cos(at.lat * D2R)) }
}
