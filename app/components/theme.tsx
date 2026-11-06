'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { Moon, Sun } from 'lucide-react'
import { THEME_KEY, type ThemeName } from '../../lib/theme'

/* ==========================================================================
 * THEME SWITCH
 *
 * Light is the default, the look of the website and the film. The choice is kept in this browser, so the screen opens
 * the way it was left, and a second tab follows the first.
 *
 * The theme lives on <html data-theme>. Only the app shells (Company Admin,
 * Client Portal, Supervisor) mount ThemeScope, so the landing page and the
 * sign-in page, which carry their own light design, are left alone.
 * ========================================================================== */

const listeners = new Set<() => void>()
const read = (): ThemeName => {
  try { return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light' } catch { return 'light' }
}
const apply = (t: ThemeName) => {
  if (t === 'light') document.documentElement.dataset.theme = 'light'
  else delete document.documentElement.dataset.theme
}
function subscribe(fn: () => void) {
  listeners.add(fn)
  const onStorage = (e: StorageEvent) => { if (e.key === THEME_KEY) { apply(read()); fn() } }
  window.addEventListener('storage', onStorage)
  return () => { listeners.delete(fn); window.removeEventListener('storage', onStorage) }
}

export function setTheme(t: ThemeName) {
  try { localStorage.setItem(THEME_KEY, t) } catch { /* private mode: the choice lasts for this visit */ }
  apply(t)
  listeners.forEach(fn => fn())
}

export function useTheme(): ThemeName {
  return useSyncExternalStore(subscribe, read, () => 'light')
}

/* Mounted once by each app shell. */
export function ThemeScope() {
  useEffect(() => {
    apply(read())
    return () => { delete document.documentElement.dataset.theme }
  }, [])
  return null
}

export function ThemeToggle({ size = 34 }: { size?: number }) {
  const theme = useTheme()
  const next: ThemeName = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button" onClick={() => setTheme(next)} className="xpl-hit"
      aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`}
      style={{
        width: size, height: size, borderRadius: 9, flexShrink: 0, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'none', border: '1px solid var(--x-border)', color: 'var(--x-muted)',
      }}
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}

/* Two-way choice for the Settings screen. */
export function ThemeChoice() {
  const theme = useTheme()
  const opt = (t: ThemeName, label: string, Icon: typeof Sun) => {
    const on = theme === t
    return (
      <button key={t} type="button" role="radio" aria-checked={on} onClick={() => setTheme(t)} style={{
        flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 10, cursor: 'pointer',
        fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, textAlign: 'left',
        background: on ? 'color-mix(in srgb, var(--x-orange) 10%, transparent)' : 'transparent',
        border: `1px solid ${on ? 'var(--x-orange)' : 'var(--x-border)'}`,
        color: on ? 'var(--x-text)' : 'var(--x-muted)',
      }}>
        <Icon size={16} style={{ color: on ? 'var(--x-orange)' : 'var(--x-faint)' }} />
        {label}
      </button>
    )
  }
  return <div role="radiogroup" aria-label="Theme" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{opt('dark', 'Dark', Moon)}{opt('light', 'Light', Sun)}</div>
}
