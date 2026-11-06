import type { IntervalResult } from './geotech'
import { rqdClass, WEATHERING } from './geotech'

/* ==========================================================================
 * XPLORIX CORE — exports
 *
 * One row per interval, in the layout geology software reads (Leapfrog,
 * acQuire, Micromine, Datamine): HOLE_ID, FROM, TO, then one column per
 * measure. Every value is from the photos with the geologist's corrections,
 * and a STATUS column says whether every tray in the interval was checked.
 * ========================================================================== */

export interface ExportRow extends IntervalResult {
  hole: string; className: string; checked: boolean
  // from the other data, where it has been joined (Geology → Export)
  lith?: string; domain?: string; au?: number; ucs?: number; mineral?: string; veins?: number
}

export const EXPORT_COLUMNS: { key: string; label: string; get: (r: ExportRow) => string | number }[] = [
  { key: 'HOLE_ID', label: 'Hole', get: r => r.hole },
  { key: 'FROM', label: 'From (m)', get: r => r.from.toFixed(2) },
  { key: 'TO', label: 'To (m)', get: r => r.to.toFixed(2) },
  { key: 'REC_PCT', label: 'Core recovery %', get: r => r.recovery.toFixed(1) },
  { key: 'RQD_PCT', label: 'RQD %', get: r => r.rqd.toFixed(1) },
  { key: 'RQD_CLASS', label: 'RQD class', get: r => rqdClass(r.rqd) },
  { key: 'FF_PER_M', label: 'Natural fractures per m', get: r => r.ff.toFixed(2) },
  { key: 'NAT_FRAC', label: 'Natural fractures', get: r => r.natural },
  { key: 'HANDLING_BRK', label: 'Breaks made in handling', get: r => r.handling },
  { key: 'WJD', label: 'Weighted joint density', get: r => r.wjd.toFixed(2) },
  { key: 'RQD_FROM_WJD', label: 'RQD from joint density %', get: r => r.rqdWjd.toFixed(1) },
  { key: 'JRC_PROXY', label: 'Joint roughness (JRC proxy)', get: r => r.jrc.toFixed(1) },
  { key: 'WEATH_GRADE', label: 'Weathering grade', get: r => r.weathering },
  { key: 'WEATH_DESC', label: 'Weathering', get: r => WEATHERING[r.weathering] },
  { key: 'GSI_PROXY', label: 'GSI proxy', get: r => r.gsi },
  { key: 'ALPHA_MEAN', label: 'Mean fracture angle to core axis (°)', get: r => r.alphas.length ? Math.round(r.alphas.reduce((a, b) => a + b, 0) / r.alphas.length) : '' },
  { key: 'VEIN_PCT', label: 'Veins % of core surface', get: r => (r.vein * 100).toFixed(1) },
  { key: 'ROCK_CLASS', label: 'Rock class', get: r => r.className },
  { key: 'COLOUR_HEX', label: 'Colour', get: r => r.hex },
  { key: 'VEIN_COUNT', label: 'Veins found on the photos', get: r => r.veins ?? '' },
  { key: 'LITH_LOGGED', label: "Geologist's logged rock", get: r => r.lith ?? '' },
  { key: 'DOMAIN', label: 'Domain (photo + chemistry + geophysics)', get: r => r.domain ?? '' },
  { key: 'AU_GPT', label: 'Au g/t (assay)', get: r => r.au != null ? r.au.toFixed(3) : '' },
  { key: 'UCS_PRED_MPA', label: 'Rock strength, predicted (MPa)', get: r => r.ucs != null ? Math.round(r.ucs) : '' },
  { key: 'MINERAL', label: 'Main mineral (scanned or predicted)', get: r => r.mineral ?? '' },
  { key: 'STATUS', label: 'Checked by a geologist', get: r => r.checked ? 'CHECKED' : 'SUGGESTED' },
]

export function toCsv(rows: ExportRow[], keys = EXPORT_COLUMNS.map(c => c.key)) {
  const cols = EXPORT_COLUMNS.filter(c => keys.includes(c.key))
  const esc = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  return [cols.map(c => c.key).join(','), ...rows.map(r => cols.map(c => esc(c.get(r))).join(','))].join('\n')
}

export function download(name: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 500)
}
