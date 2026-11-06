/* ==========================================================================
 * WHICH COMPANY THIS IS, AND WHAT DAY IT IS
 *
 * The demo company lives on one fixed day, 31 Oct 2026, so its sample data
 * always reads the same. A real company lives on the real day.
 *
 * These are set once, when the app learns who signed in, before any screen
 * is drawn. Everything else reads them through its imports, which always
 * give the current value. Imports nothing, so anything may import it.
 * ========================================================================== */

export const DEMO_TODAY = '2026-10-31'
export const DEMO_COMPANY = 'Apex Drilling Solutions'
export const DEMO_CODE = 'APX'

export let TODAY = DEMO_TODAY
export let COMPANY_NAME = DEMO_COMPANY
export let COMPANY_CODE = DEMO_CODE
/* True for the demo company and for the browser demo. Screens that still run
 * on sample data are shown only then. */
export let IS_DEMO = true

/* The date on this device, as YYYY-MM-DD. */
export function deviceToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function applyCompany(c: { name: string; code?: string | null; demo: boolean } | null) {
  if (!c || c.demo) {
    TODAY = DEMO_TODAY; IS_DEMO = true
    COMPANY_NAME = c?.name || DEMO_COMPANY
    COMPANY_CODE = c?.code || DEMO_CODE
    return
  }
  TODAY = deviceToday(); IS_DEMO = false
  COMPANY_NAME = c.name
  COMPANY_CODE = c.code || codeFrom(c.name)
}

/* A short code from a company's name, for its usernames: "Kartik Drilling" → "KAR". */
export function codeFrom(name: string) {
  const letters = name.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return (letters.slice(0, 3) || 'CO').padEnd(2, 'X')
}
