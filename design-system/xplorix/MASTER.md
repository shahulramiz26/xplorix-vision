# XPLORIX design system: Field Slate

Chosen in October 2026 for the Company Admin and Geology portals, from the ui-ux-pro-max
skill's "Data-Dense Dashboard" style for operational dashboards. Screens build on
`app/components/kit.tsx`; every colour is a CSS variable in `app/globals.css`.

## What stays the brand's
- **Background**: warm paper `#F6EDE5` with the soft peach glow (light), `#080B10` (dark).
- **Logo**: unchanged. On the slate sidebar it sits on its own paper tile.

## Colour (light / dark)
| Token | Light | Dark | Use |
|---|---|---|---|
| `--x-side` | `#1E293B` | `#111A25` | Sidebar, both themes |
| `--x-card` | `#FFFFFF` | `#0F151D` | Cards, panels |
| `--x-border` | `#E2E8F0` | `#1F2A37` | Card and table lines |
| `--x-text` | `#0F172A` | `#E8EDF3` | Text |
| `--x-muted` | `#475569` | `#A6B2C0` | Secondary text |
| `--x-faint` | `#5F6B7C` | `#7E8A9A` | Labels, captions (≥ 4.5:1) |
| `--x-orange` | `#C2410C` | `#F97316` | Main action, active screen, alerts only |
| `--x-on-accent` | `#FFFFFF` | `#1A0D04` | Text on orange |
| `--x-green` / `--x-red` / `--x-amber` | `#047857` / `#DC2626` / `#B45309` | lighter set | Status, never colour alone |
| `--x-blue` | `#2F64C4` | `#5B8DEF` | Data series |

## Type
- **IBM Plex Sans** (400–700) for everything you read; page titles 22px / 600.
- **JetBrains Mono** for figures: KPI values, right-aligned table numbers, chart axes.
- Labels over figures and table headers: 11px, 600, uppercase, 0.06em tracking.
- Both fonts are served with the app (`@fontsource`), no font host needed.

## Shape and spacing
- Cards and tiles: 10px corners, 1px border, no heavy shadow; 16px padding.
- Status on a tile: a 3px stripe on its left edge plus a mark and words.
- Buttons 36px high (30px small), 7px corners; segmented controls on a raised track.
- Dense layout: 16px between blocks, 12px inside grids.

## Rules from the skill's checklist
- Text contrast 4.5:1 in both themes; focus ring always visible (no `outline: none`).
- Touch targets 44px on touch screens (nav, header buttons).
- No emoji as icons (Lucide only); `prefers-reduced-motion` turns transitions off.
- Layout works from 375px to 1440px+; the page body never scrolls sideways.
