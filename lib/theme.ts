/* ==========================================================================
 * THEME
 *
 * Every colour the app screens use is a CSS variable (see app/globals.css):
 * one set of values for the dark theme, one for the light. Components keep
 * writing `C.card` or `T.text`; those tokens now hold `var(--x-card)` and
 * `var(--x-text)`, so a screen follows the theme without knowing it exists.
 *
 * The one thing a variable cannot do is take a two-digit alpha suffix the way
 * a hex colour can (`#F9731618`). hexA does that job for any colour.
 * ========================================================================== */

/* A colour at part strength. `a` is 0–255, the same number the old hex suffix
 * carried, so `${color}18` becomes hexA(color, 0x18) and looks identical. */
export const hexA = (color: string, a: number) =>
  `color-mix(in srgb, ${color} ${+((a / 255) * 100).toFixed(1)}%, transparent)`

export type ThemeName = 'dark' | 'light'
export const THEME_KEY = 'xplorix_theme'
