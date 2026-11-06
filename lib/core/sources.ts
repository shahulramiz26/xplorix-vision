/* ==========================================================================
 * Where the demo core photos come from
 *
 * The demo company's holes have no photos of their own, so real tray photos
 * from Australia's National Virtual Core Library (Mineral Resources Tasmania
 * and AuScope, CC BY 4.0) are placed on ten of them. Depths are moved so the
 * first tray starts near the collar; trays below the demo hole's depth are
 * left out. The rock in the photos is real; the hole it is shown on is not.
 * ========================================================================== */

export const NVCL_CREDIT = 'Tray photos: National Virtual Core Library — Mineral Resources Tasmania and AuScope, CC BY 4.0. Shown on demo holes; depths moved.'

/* demo hole ← NVCL drill hole (Tasmania) */
export const PHOTO_SOURCES: { hole: string; nvcl: string }[] = [
  { hole: 'DH-961', nvcl: '19365' },
  { hole: 'DH-952', nvcl: '19690' },
  { hole: 'DH-911', nvcl: '20666' },
  { hole: 'DH-011', nvcl: '15005' },
  { hole: 'DH-013', nvcl: '13979' },
  { hole: 'DH-004', nvcl: '16119' },
  { hole: 'DH-001', nvcl: '18781' },
  { hole: 'DH-101', nvcl: '17610' },
  { hole: 'DH-102', nvcl: '6340' },
  { hole: 'DH-131', nvcl: '2285' },
]

export const CORE_DIAMETER_MM: Record<string, number> = { BQ: 36.5, NQ: 47.6, HQ: 63.5, PQ: 85 }
