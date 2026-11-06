'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Users, FolderOpen, Settings, Truck, CreditCard, BarChart3, LogOut, Menu, Search,
  DollarSign, X, Boxes, FileText, Store, HardHat, Target, Bell, CornerDownLeft, Handshake,
  Activity, Wrench, GitCompare, ListChecks, ClipboardCheck, Banknote, Calculator, Flag, CalendarRange, ShieldAlert, Building2, Gauge, CalendarDays,
  Layers, Camera, Mountain, Box, Palette as PaletteIcon, Download, BookOpen, ScanSearch, Drill, PanelLeftClose, PanelLeftOpen, Radio,
  FileCheck2, Gem, Grip, Database, Network, Sparkles, Compass, BrainCircuit,
} from 'lucide-react'
import { CoreProvider, useCore } from '../../lib/core/store'
import { GeoDataProvider } from '../../lib/core/geo-data'
import { CurrencyProvider } from '../components/currency-context'
import { CostingProvider, monthOf, projectCode, moneyL } from '../../lib/costing-store'
import { deptLabel, type Dept } from '../../lib/findings'
import { InboxProvider, useInbox } from '../components/inbox'
import { AskProvider, AskButton } from '../components/ai'
import { DeptTabs } from '../components/dept-tabs'
import { useAdminOverview, financeLink, type Tone } from '../../lib/admin-overview'
import { T, display, mono, toneColor } from '../components/kit'
import { ThemeScope, ThemeToggle } from '../components/theme'
import { Guard, SavedState } from '../components/guard'
import { useSession, signOut } from '../../lib/backend'
import { IS_DEMO, COMPANY_NAME } from '../../lib/company'

/* ==========================================================================
 * COMPANY ADMIN — the shell around every screen
 *
 * The menu is grouped by the job in hand rather than listed flat: run the
 * rigs, read the logs, win and bill the work, keep the stock, look ahead,
 * then the account itself.
 *
 * Three things here used to be decoration and now do something:
 *   - search opens a jump list of every page, rig, project and hole (Ctrl K);
 *   - the bell lists what actually needs the admin, from the live stores;
 *   - the badges on Finance and Inventory are real counts.
 *
 * The costing store is mounted here once, so every admin screen reads the same
 * copy and the badges stay true as work is done.
 * ========================================================================== */

/* The menu is one entry per job, grouped by department. Where a job has more
 * than one screen, the others are tabs on it (app/components/dept-tabs.tsx),
 * so XPLORIX Intelligence sits inside the department it is about.
 *
 * `badge` is the department's "act now" count from the one inbox, so the
 * numbers in the menu are the numbers on the Dashboard. `also` lists the tab
 * screens that keep the entry lit. `sample` marks a screen still on sample
 * data: kept out of the menu, and blocked in a real company. `owner` is for
 * the account that set XPLORIX up. */
type NavItem = { href: string; label: string; icon: React.ElementType; badge?: 'all' | Dept[]; also?: string[]; sample?: true; owner?: true }
const NAV: { title: string | null; items: NavItem[] }[] = [
  { title: null, items: [{ href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard }, { href: '/admin/tasks', label: 'Tasks', icon: CalendarDays, badge: 'all', also: ['/admin/inbox'] }] },
  {
    title: 'Operations',
    items: [
      { href: '/admin/projects', label: 'Projects & holes', icon: FolderOpen, badge: ['operations', 'geology'], also: ['/admin/intelligence/holes'] },
      { href: '/admin/rigs', label: 'Rigs', icon: Truck },
      { href: '/admin/people', label: 'Drillers & crew', icon: HardHat },
      { href: '/admin/logs/drill', label: 'Drill logs', icon: Activity, badge: ['data', 'crew', 'safety'], also: ['/admin/intelligence/drill-logs'] },
      { href: '/admin/logs/maintenance', label: 'Maintenance', icon: Wrench, badge: ['maintenance'] },
      { href: '/admin/pulse', label: 'Pulse · live sensors', icon: Radio },
    ],
  },
  { title: 'Contractors', items: [{ href: '/admin/contractors', label: 'Contractors', icon: Handshake, badge: ['contractors'], also: ['/admin/intelligence/contractors'] }] },
  { title: 'Stores', items: [{ href: '/admin/inventory', label: 'Parts & inventory', icon: Boxes, badge: ['stock'] }] },
  { title: 'Finance & billing', items: [{ href: '/admin/finance', label: 'Finance & billing', icon: DollarSign, badge: ['finance', 'billing'], also: ['/admin/intelligence/money'] }] },
  { title: 'Tenders', items: [{ href: '/admin/tenders', label: 'Tenders', icon: Target, also: ['/admin/intelligence/pricing', '/admin/bid-intelligence'] }] },
  {
    title: 'Management',
    items: [
      { href: '/admin/value', label: 'AI Scorecard', icon: Gauge },
      { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
      { href: '/admin/intelligence/months', label: 'Outlook', icon: CalendarRange, also: ['/admin/intelligence/risks'] },
    ],
  },
  {
    title: 'Setup',
    items: [
      { href: '/admin/users', label: 'Users', icon: Users },
      { href: '/admin/companies', label: 'Companies', icon: Building2, owner: true },
      { href: '/admin/settings', label: 'Settings', icon: Settings },
    ],
  },
]
/* The geologist's half of XPLORIX. Same company, same projects and holes,
 * same shift logs; a menu of its own. */
const GEO_NAV: { title: string | null; items: NavItem[] }[] = [
  { title: null, items: [{ href: '/admin/geology', label: 'Geology today', icon: Layers }, { href: '/admin/geology/ask', label: 'XPLORIX AI', icon: Sparkles }] },
  {
    title: 'Core',
    items: [
      { href: '/admin/geology/holes', label: 'Hole logs', icon: Drill, also: ['/admin/geology/trays'] },
      { href: '/admin/geology/review', label: 'Review trays', icon: ScanSearch },
      { href: '/admin/geology/photos', label: 'Add photos & archive', icon: Camera },
    ],
  },
  {
    title: 'Automated logging',
    items: [
      { href: '/admin/geology/rock-mass', label: 'Geotech: rock mass', icon: Mountain },
      { href: '/admin/geology/classes', label: 'Geology: rock classes', icon: PaletteIcon },
      { href: '/admin/geology/veins', label: 'Geology: vein classes', icon: Gem },
      { href: '/admin/geology/chips', label: 'Chips (RC)', icon: Grip },
      { href: '/admin/geology/check-logs', label: 'Check logs', icon: FileCheck2 },
    ],
  },
  {
    title: 'Data-driven',
    items: [
      { href: '/admin/geology/data', label: 'Downhole data', icon: Database },
      { href: '/admin/geology/domains', label: 'Domains', icon: Network },
      { href: '/admin/geology/predict', label: 'Predictions', icon: BrainCircuit },
      { href: '/admin/geology/structures', label: 'Structures', icon: Compass },
    ],
  },
  {
    title: 'Interpretation',
    items: [
      { href: '/admin/geology/3d', label: 'Digital twin', icon: Box },
      { href: '/admin/geology/export', label: 'Export', icon: Download },
    ],
  },
  {
    title: 'Shared with drilling',
    items: [
      { href: '/admin/projects', label: 'Projects & holes', icon: FolderOpen },
      { href: '/admin/tasks?dept=geology', label: 'Core quality tasks', icon: CalendarDays, badge: ['geology'] },
    ],
  },
  { title: 'Help', items: [{ href: '/admin/geology/method', label: 'How it works', icon: BookOpen }] },
]

/* Screens with no menu entry: still guarded, still found by search. */
const HIDDEN: NavItem[] = [
  { href: '/admin/reports', label: 'Performance reports', icon: FileText, sample: true },
  { href: '/admin/marketplace', label: 'Marketplace', icon: Store, sample: true },
  { href: '/admin/crew', label: 'Crew & jobs', icon: HardHat, sample: true },
  { href: '/admin/billing', label: 'Plans and billing', icon: CreditCard, sample: true },
]
const ALL = [...NAV.flatMap(g => g.items), ...GEO_NAV.flatMap(g => g.items).filter(i => i.href.startsWith('/admin/geology')), ...HIDDEN]
/* The menu for this company and this person. */
function menuFor(demo: boolean, owner: boolean) {
  return NAV.map(g => ({ ...g, items: g.items.filter(i => (demo || !i.sample) && (owner || !i.owner)) })).filter(g => g.items.length > 0)
}

const SHELL_CSS = `
  /* The menu on a wide screen: a 64px rail of icons that opens when it is
   * touched, hovered or tabbed into, and stays open once pinned. */
  @media (min-width: 1024px) {
    .xpl-side { transition: width .18s ease-out, box-shadow .18s; }
    .xpl-side.is-float { position: fixed !important; top: 0; bottom: 0; height: 100vh; }
    .xpl-side.is-float.is-peek { box-shadow: 12px 0 40px rgba(var(--x-shadow),0.45); }
    .xpl-side.is-rail { width: 64px !important; }
    .xpl-side.is-rail .xpl-label, .xpl-side.is-rail .xpl-railhide { display: none !important; }
    .xpl-side.is-rail .xpl-navlink { justify-content: center; padding: 0 !important; }
    .xpl-side.is-rail .xpl-gtitle { font-size: 0 !important; height: 1px; padding: 0 !important; margin: 0 8px 8px; background: var(--x-side-line); }
    .xpl-side.is-rail .xpl-badge { position: absolute; top: 6px; right: 8px; min-width: 8px !important; width: 8px; height: 8px !important; padding: 0 !important; font-size: 0 !important; border-radius: 4px !important; box-shadow: 0 0 0 2px var(--x-side); }
    .xpl-side.is-rail .xpl-sidehead { justify-content: center !important; padding-left: 0 !important; padding-right: 0 !important; }
    .xpl-side.is-rail .xpl-userrow { justify-content: center; padding: 0 !important; }
  }
  @media (prefers-reduced-motion: reduce) { .xpl-side { transition: none !important; } }
  @media (max-width: 640px) { .xpl-main { padding: 16px !important; } .xpl-head { padding: 0 12px !important; } .xpl-search { width: 40px !important; min-width: 40px; justify-content: center; padding: 9px !important; } .xpl-search span, .xpl-search kbd { display: none !important; } }
  @media (pointer: coarse) { .xpl-navlink { min-height: 44px !important; } .xpl-head button, .xpl-head a { min-width: 44px; min-height: 44px; justify-content: center; } }
  .xpl-side-nav:hover { background: var(--x-side-hover); color: var(--x-side-text) !important; }
  .xpl-side-hit:hover { background: var(--x-side-hover); }
  .xpl-side a:focus-visible, .xpl-side button:focus-visible { outline: 2px solid var(--x-orange-b); outline-offset: 1px; }
  @media (max-width: 900px) { .xpl-split { grid-template-columns: minmax(0,1fr) !important; } .xpl-prow { grid-template-columns: minmax(0,1fr) !important; gap: 10px !important; } }
  .xpl-row:hover { background: rgba(var(--x-ov),0.025); }
  .xpl-nav:hover { background: rgba(var(--x-ov),0.04); color: var(--x-text) !important; }
  .xpl-hit:hover { background: rgba(var(--x-ov),0.05); }
  .xpl-narrow { display: none; }
  @media (max-width: 760px) { .xpl-week { grid-template-columns: minmax(0, 1fr) !important; } .xpl-week > section { min-height: 0 !important; } }
  @media (max-width: 760px) { .xpl-runway { grid-template-columns: minmax(0, 1fr) auto !important; } .xpl-runway > :nth-child(2) { grid-column: 1 / -1; grid-row: 2; } }
  @media (max-width: 640px) { .xpl-clamp { white-space: normal !important; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; } }
  @media (max-width: 640px) { .xpl-wide { display: none !important; } .xpl-narrow { display: block; } }
  @media print { aside, main > header, .xpl-noprint, .xpl-depttabs { display: none !important; } main { display: block !important; } body { background: #fff !important; } }
  @media (max-width: 640px) { .xpl-actions { padding-left: 0 !important; } .xpl-chips { flex-wrap: nowrap !important; overflow-x: auto; padding-bottom: 4px; } .xpl-chips > * { flex-shrink: 0; } }
`

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
function longDate(d: string) {
  const [y, m, dd] = d.split('-').map(Number)
  return `${DAY[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()]} ${dd} ${MON[m - 1]} ${y}`
}

function Shell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  /* Wide screens: the menu is pinned open, or rests as a rail of icons and
   * opens over the page when touched, hovered or tabbed into ("peek"). */
  const [pinned, setPinned] = useState(false)
  const [peek, setPeek] = useState(false)
  const railAtTap = useRef(false)
  useEffect(() => { try { setPinned(localStorage.getItem('xplorix_side') === 'pinned') } catch {} }, [])
  const pin = (v: boolean) => { setPinned(v); setPeek(false); try { v ? localStorage.setItem('xplorix_side', 'pinned') : localStorage.removeItem('xplorix_side') } catch {} }
  const rail = !pinned && !peek
  const [palette, setPalette] = useState(false)
  const [bell, setBell] = useState(false)
  const pathname = usePathname()
  const o = useAdminOverview()
  const session = useSession()

  const inbox = useInbox()
  /* The screen the path is on: its own entry if it has one, otherwise the
   * entry it is a tab of. */
  const within = (h: string) => pathname === h || pathname.startsWith(h + '/')
  const current = [...ALL].sort((a, b) => b.href.length - a.href.length).find(n => within(n.href))
  const lit = ALL.filter(n => within(n.href) || (n.also ?? []).some(within))
    .sort((a, b) => Math.max(...[b.href, ...(b.also ?? [])].filter(within).map(h => h.length)) - Math.max(...[a.href, ...(a.also ?? [])].filter(within).map(h => h.length)))[0]
  const demo = IS_DEMO
  const owner = session.status === 'in' && !!session.user.owner
  /* Two workspaces: Drilling (the contractor) and Geology (the geologist).
   * A geologist's login sees only Geology and what it shares with drilling. */
  const [geoOnly, setGeoOnly] = useState(false)
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get('view')
    try {
      if (v === 'geologist') localStorage.setItem('xplorix_view', 'geologist')
      if (v === 'admin') localStorage.removeItem('xplorix_view')
      setGeoOnly(localStorage.getItem('xplorix_view') === 'geologist')
    } catch { setGeoOnly(v === 'geologist') }
  }, [pathname])
  const geology = geoOnly || pathname.startsWith('/admin/geology')
  const core = useCore()
  const waitingTrays = core.index ? core.index.holes.reduce((s, h) => s + h.trays, 0) + core.review.uploads.length - Object.keys(core.review.checked).length : 0
  const menu = geology ? GEO_NAV : menuFor(demo, owner)
  // A screen on sample data, opened by its address in a real company: say so instead of showing someone else's numbers.
  const blocked = !!current && ((current.sample && !demo) || (current.owner && !owner))

  const actNow = inbox.open.filter(u => u.severity === 'act')
  const badge = (b: NavItem['badge'], href?: string) => href === '/admin/geology/review' ? Math.max(0, waitingTrays)
    : !b ? 0 : b === 'all' ? actNow.length : actNow.filter(u => u.depts.some(d => b.includes(d))).length

  // Ctrl K or ⌘ K opens search from anywhere; so does "/" when not typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? '')
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) { e.preventDefault(); setPalette(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => { setOpen(false); setBell(false); setPeek(false) }, [pathname])

  return (
    <div className="min-h-screen flex xpl-app" style={{ background: T.bg, color: T.text }}>
      <style dangerouslySetInnerHTML={{ __html: SHELL_CSS }} />

      {/* Holds the rail's width in the row while the menu floats over the page. */}
      {!pinned && <div aria-hidden className="hidden lg:block" style={{ width: 64, flexShrink: 0 }} />}
      {!pinned && peek && <div className="hidden lg:block fixed inset-0 z-40" onClick={() => setPeek(false)} />}
      {open && <div className="lg:hidden fixed inset-0 z-40" style={{ background: 'rgba(var(--x-shadow),0.7)' }} onClick={() => setOpen(false)} />}

      {/* SIDEBAR */}
      <aside
        className={`xpl-side ${pinned ? 'is-pinned' : 'is-float'} ${rail ? 'is-rail' : 'is-peek'} fixed lg:sticky lg:top-0 inset-y-0 left-0 z-50 flex flex-col w-60 lg:h-screen transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
        onPointerEnter={e => { if (e.pointerType === 'mouse' && !pinned) setPeek(true) }}
        onPointerLeave={e => { if (e.pointerType === 'mouse' && !pinned) setPeek(false) }}
        onPointerDown={e => { railAtTap.current = e.pointerType !== 'mouse' && rail && window.innerWidth >= 1024 }}
        onClickCapture={e => {
          // A tap on the closed rail opens it; the next tap picks the page.
          if (railAtTap.current) { railAtTap.current = false; e.preventDefault(); e.stopPropagation(); setPeek(true) }
        }}
        onFocus={() => { if (!pinned) setPeek(true) }}
        onBlur={e => { if (!pinned && !e.currentTarget.contains(e.relatedTarget as Node)) setPeek(false) }}
        style={{ background: 'var(--x-side)', borderRight: '1px solid var(--x-side-line)' }}
      >
        <div className="flex items-center justify-between xpl-sidehead" style={{ padding: '14px 14px 13px', borderBottom: '1px solid var(--x-side-line)' }}>
          <Link href="/admin/dashboard" className="flex items-center gap-3" style={{ textDecoration: 'none', minWidth: 0 }}>
            {/* The logo as it always was, on its own paper tile so the dark half reads on the slate. */}
            <span style={{ width: 36, height: 36, borderRadius: 8, background: '#F6EDE5', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="26" height="26" viewBox="0 0 100 100" fill="none" style={{ flexShrink: 0 }}>
              <polygon points="50,50 5,5 5,95" fill="#1a1a1a" /><polygon points="50,50 5,5 30,5" fill="#2a2a2a" />
              <polygon points="50,50 5,95 30,95" fill="#2a2a2a" /><polygon points="50,50 95,5 95,95" fill="#F97316" />
              <polygon points="50,50 95,5 70,5" fill="#EA580C" /><polygon points="50,50 95,95 70,95" fill="#EA580C" />
            </svg>
            </span>
            <div className="xpl-label" style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--x-side-text)', letterSpacing: '0.08em', fontFamily: display }}>XPLORIX</div>
              <div style={{ fontSize: 12, color: 'var(--x-side-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{COMPANY_NAME}</div>
            </div>
          </Link>
          <button type="button" className="hidden lg:flex xpl-side-hit xpl-railhide" onClick={() => pin(!pinned)}
            aria-label={pinned ? 'Collapse the menu to icons' : 'Keep the menu open'} title={pinned ? 'Collapse the menu to icons' : 'Keep the menu open'}
            style={{ color: 'var(--x-side-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 7, borderRadius: 7, flexShrink: 0 }}>
            {pinned ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
          </button>
          <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"
            style={{ color: 'var(--x-side-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 8 }}><X size={18} /></button>
        </div>

        {!geoOnly && (
          <div role="tablist" aria-label="Workspace" className="xpl-railhide" style={{ margin: '12px 12px 4px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, padding: 3, borderRadius: 8, background: 'rgba(0,0,0,0.22)', border: '1px solid var(--x-side-line)' }}>
            {([['Drilling', '/admin/dashboard', !geology], ['Geology', '/admin/geology', geology]] as const).map(([label, href, on]) => (
              <Link key={label} href={href} role="tab" aria-selected={on} style={{
                textAlign: 'center', padding: '6px 0', borderRadius: 6, fontSize: 12.5, fontWeight: 600, textDecoration: 'none',
                background: on ? 'rgba(255,255,255,0.12)' : 'transparent', color: on ? 'var(--x-side-text)' : 'var(--x-side-muted)',
                boxShadow: on ? 'inset 0 -2px 0 var(--x-orange)' : 'none',
              }}>{label}</Link>
            ))}
          </div>
        )}
        <nav className="flex-1 overflow-y-auto" style={{ padding: '8px 10px 14px', scrollbarWidth: 'none' }}>
          {menu.map((g, gi) => (
            <div key={g.title ?? 'top'} style={{ marginTop: gi === 0 ? 4 : 14 }}>
              {g.title && <div className="xpl-gtitle" style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--x-side-faint)', padding: '0 10px 6px', letterSpacing: '0.09em', textTransform: 'uppercase' }}>{g.title}</div>}
              {g.items.map(item => {
                const active = lit?.href === item.href || (item.href.includes('?') && pathname === item.href.split('?')[0] && geology)
                const n = badge(item.badge, item.href)
                return (
                  <Link key={item.href} href={item.href} className={active ? 'xpl-navlink' : 'xpl-navlink xpl-side-nav'} aria-current={active ? 'page' : undefined}
                    aria-label={n > 0 ? `${item.label}, ${n} to act on now` : item.label} title={rail ? item.label : undefined} style={{
                    position: 'relative', display: 'flex', alignItems: 'center', gap: 10, minHeight: 36, padding: '0 10px', borderRadius: 7, marginBottom: 1,
                    textDecoration: 'none', fontSize: 13.5, fontWeight: active ? 600 : 500, transition: 'background-color .15s, color .15s',
                    background: active ? 'var(--x-side-active)' : 'transparent', color: active ? '#FFFFFF' : 'var(--x-side-muted)',
                  }}>
                    {active && <span aria-hidden style={{ position: 'absolute', left: -10, top: 8, bottom: 8, width: 3, borderRadius: '0 3px 3px 0', background: 'var(--x-orange-b)' }} />}
                    <item.icon size={16} style={{ color: active ? 'var(--x-orange-b)' : 'var(--x-side-faint)', flexShrink: 0 }} />
                    <span className="xpl-label" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                    {n > 0 && (
                      <span aria-hidden className="xpl-badge" style={{
                        minWidth: 20, height: 18, padding: '0 6px', borderRadius: 5, fontSize: 11, fontWeight: 600, fontFamily: mono,
                        background: '#DC2626', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>{n}</span>
                    )}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        <div style={{ padding: 12, borderTop: '1px solid var(--x-side-line)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {demo && (
          <Link href="/admin/billing" className="xpl-side-hit xpl-railhide" style={{
            display: 'block', padding: '9px 11px', borderRadius: 8, textDecoration: 'none',
            border: '1px solid rgba(249,115,22,0.35)', background: 'rgba(249,115,22,0.10)',
          }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--x-side-text)' }}>Free trial: 12 days left</div>
            <div style={{ fontSize: 12, color: 'var(--x-side-muted)', marginTop: 2 }}>See plans and upgrade</div>
          </Link>
          )}
          <div className="xpl-userrow" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 2px 2px 4px' }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: 'rgba(255,255,255,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 12.5, color: 'var(--x-side-text)' }}>{geoOnly ? 'P' : 'A'}</div>
            <div className="xpl-label" style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--x-side-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.status === 'in' ? session.user.name : geoOnly ? core.review.reviewer.replace(/ \(geologist\)$/, '') : 'Admin User'}</div>
              <div style={{ fontSize: 12, color: 'var(--x-side-muted)' }}>{geoOnly ? 'Geologist' : 'Company admin'}</div>
            </div>
            {session.status === 'in'
              ? <button type="button" onClick={() => void signOut()} aria-label="Sign out" title="Sign out" className="xpl-side-hit xpl-railhide" style={{ padding: 9, color: 'var(--x-side-muted)', borderRadius: 8, display: 'flex', background: 'none', border: 'none', cursor: 'pointer' }}><LogOut size={15} /></button>
              : <Link href="/auth/login" aria-label="Sign out" title="Sign out" className="xpl-side-hit xpl-railhide" style={{ padding: 9, color: 'var(--x-side-muted)', borderRadius: 8, display: 'flex' }}><LogOut size={15} /></Link>}
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="xpl-head" style={{ position: 'sticky', top: 0, zIndex: 30, background: 'color-mix(in srgb, var(--x-card) 82%, transparent)', backdropFilter: 'blur(12px)', borderBottom: `1px solid ${T.border}`, padding: '0 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56, gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
              {/* No inline display here: it would beat the class that hides this on a wide screen. */}
              <button onClick={() => setOpen(true)} className="lg:hidden flex" aria-label="Open menu"
                style={{ padding: 6, color: T.faint, background: 'none', border: 'none', cursor: 'pointer' }}><Menu size={20} /></button>
              <button onClick={() => setPalette(true)} className="xpl-hit xpl-search" aria-label="Search pages, rigs, projects, holes" style={{
                display: 'flex', alignItems: 'center', gap: 9, padding: '7px 11px', borderRadius: 9, cursor: 'pointer',
                background: 'rgba(var(--x-ov),0.03)', border: `1px solid ${T.border}`, color: T.faint, fontSize: 13,
                fontFamily: 'inherit', width: '100%', maxWidth: 380, textAlign: 'left',
              }}>
                <Search size={14} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Search pages, rigs, projects, holes</span>
                <kbd className="hidden sm:inline" style={{ fontSize: 11, padding: '1px 6px', borderRadius: 5, border: `1px solid ${T.border}`, color: T.faint, fontFamily: 'inherit' }}>Ctrl K</kbd>
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="hidden md:inline" style={{ fontSize: 12.5, color: T.faint, whiteSpace: 'nowrap' }}>{longDate(o.today)}</span>
              <AskButton />
              <SavedState />
              <ThemeToggle />
              <div style={{ position: 'relative' }}>
                <button onClick={() => setBell(b => !b)} aria-label={`${actNow.length} to act on now`} aria-expanded={bell} className="xpl-hit"
                  style={{ position: 'relative', padding: 8, borderRadius: 9, background: 'none', border: `1px solid ${T.border}`, color: T.muted, cursor: 'pointer', display: 'flex' }}>
                  <Bell size={16} />
                  {actNow.length > 0 && (
                    <span style={{ position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: T.red, color: '#fff', fontSize: 10.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{actNow.length}</span>
                  )}
                </button>
                {bell && (
                  <>
                    <div className="fixed inset-0" style={{ zIndex: 40 }} onClick={() => setBell(false)} />
                    <div role="dialog" aria-label="To act on now" style={{
                      position: 'absolute', right: 0, top: 44, zIndex: 50, width: 'min(400px, calc(100vw - 32px))',
                      background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden', boxShadow: '0 20px 50px rgba(var(--x-shadow),0.55)',
                    }}>
                      <div style={{ padding: '12px 14px', borderBottom: `1px solid ${T.line}`, fontSize: 13, fontWeight: 700, color: T.text }}>
                        To act on now{actNow.length ? ` · ${actNow.length}` : ''}
                      </div>
                      {actNow.length === 0
                        ? <div style={{ padding: 16, fontSize: 13, color: T.faint }}>Nothing needs action now.</div>
                        : actNow.slice(0, 7).map((u, i) => (
                          <Link key={u.id} href={u.href ?? '/admin/dashboard'} className="xpl-row" style={{ display: 'flex', gap: 11, padding: '11px 14px', textDecoration: 'none', borderTop: i ? `1px solid ${T.line}` : 'none' }}>
                            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: T.red, flexShrink: 0, marginTop: 5 }} />
                            <span style={{ minWidth: 0 }}>
                              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: T.text, lineHeight: 1.4 }}>{u.title}</span>
                              <span style={{ display: 'block', fontSize: 12, color: T.faint, marginTop: 2, lineHeight: 1.4 }}>{deptLabel(u.dept)} · {u.owner}{u.money ? ` · ${moneyL(u.money)}` : ''}</span>
                            </span>
                          </Link>
                        ))}
                      <Link href="/admin/tasks?dept=all" style={{ display: 'block', padding: '11px 14px', borderTop: `1px solid ${T.line}`, fontSize: 13, fontWeight: 600, color: T.orange, textDecoration: 'none' }}>
                        {actNow.length > 7 ? `All ${actNow.length}, in Tasks →` : 'Open Tasks →'}
                      </Link>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 xpl-main" style={{ padding: '24px 28px' }}>
          {blocked ? (
            <div style={{ maxWidth: 620, margin: '40px auto', padding: 24, background: T.card, border: `1px solid ${T.border}`, borderRadius: 10 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: T.text, fontFamily: display }}>{current?.owner ? 'Not for this login' : `${current?.label} is in development`}</div>
              <p style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.6, margin: '8px 0 16px' }}>
                {current?.owner
                  ? 'Only the account that set XPLORIX up can open this screen.'
                  : 'This screen still runs on sample data, so it is shown in the demo company only. It will open here when it reads your own logs.'}
              </p>
              <Link href="/admin/dashboard" style={{ fontSize: 13.5, fontWeight: 600, color: T.orange, textDecoration: 'none' }}>Back to the Dashboard</Link>
            </div>
          ) : <><DeptTabs />{children}</>}
        </div>
      </main>

      {palette && <Palette onClose={() => setPalette(false)} />}
    </div>
  )
}

/* Jump list. Type a few letters of a page, rig, project or hole and press
 * Enter. Holes and projects open Finance already on the right rig and month. */
function Palette({ onClose }: { onClose: () => void }) {
  const o = useAdminOverview()
  const core = useCore()
  const router = useRouter()
  const [q, setQ] = useState('')
  const [at, setAt] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus() }, [])

  const items = useMemo(() => {
    const pages = ALL.filter(n => (IS_DEMO || !n.sample) && !n.owner).map(n => ({ kind: 'Page', label: n.label, sub: '', href: n.href }))
    const rigs = o.rigs.map(r => ({ kind: 'Rig', label: r.rig, sub: [r.project, r.hole ? `on ${r.hole}` : ''].filter(Boolean).join(' · '), href: '/admin/rigs' }))
    const projects = o.projects.map(p => ({ kind: 'Project', label: p.name, sub: `${p.code} · ${p.client}`, href: `/admin/projects/${p.id}` }))
    const holes = o.holes.map(h => ({
      kind: 'Hole', label: h.id, sub: `${h.project} · ${h.rig} · ${Math.round(h.drilled)} m`,
      href: financeLink({ project: h.project, rig: h.rig, month: monthOf(h.end ?? h.start), tab: h.status === 'drilling' ? 'Performance' : 'Drillholes' }),
    }))
    const cores = (core.index?.holes ?? []).map(h => ({ kind: 'Core', label: h.hole, sub: `hole log · ${h.trays} tray photos`, href: `/admin/geology/holes/${h.hole}` }))
    return [...pages, ...rigs, ...projects, ...holes, ...cores]
  }, [o.rigs, o.holes, o.projects, core.index])

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return items.filter(i => i.kind === 'Page').slice(0, 9)
    // A match in the name itself comes before a match in the small print, so
    // typing a hole number finds the hole before the rig that is drilling it.
    const rank = (i: typeof items[number]) => {
      const label = i.label.toLowerCase()
      return label.startsWith(s) ? 0 : label.includes(s) ? 1 : 2
    }
    return items
      .filter(i => `${i.label} ${i.sub} ${i.kind}`.toLowerCase().includes(s))
      .sort((a, b) => rank(a) - rank(b))
      .slice(0, 9)
  }, [q, items])
  useEffect(() => { setAt(0) }, [q])

  const go = (href: string) => { onClose(); router.push(href) }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown') { e.preventDefault(); setAt(a => Math.min(hits.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAt(a => Math.max(0, a - 1)) }
    else if (e.key === 'Enter' && hits[at]) go(hits[at].href)
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(var(--x-shadow),0.7)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '12vh 16px 0' }}>
      <div role="dialog" aria-label="Search" onClick={e => e.stopPropagation()} onKeyDown={onKey}
        style={{ width: '100%', maxWidth: 560, background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden', boxShadow: '0 30px 80px rgba(var(--x-shadow),0.6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: `1px solid ${T.line}` }}>
          <Search size={16} style={{ color: T.faint }} />
          <input ref={input} value={q} onChange={e => setQ(e.target.value)} placeholder="Type a page, rig, project or hole number"
            aria-label="Search" style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: T.text, fontSize: 15, fontFamily: 'inherit' }} />
          <kbd style={{ fontSize: 11, padding: '1px 6px', borderRadius: 5, border: `1px solid ${T.border}`, color: T.faint, fontFamily: 'inherit' }}>Esc</kbd>
        </div>
        <div style={{ maxHeight: '52vh', overflowY: 'auto', padding: 6 }}>
          {hits.length === 0 && <div style={{ padding: '18px 12px', fontSize: 13.5, color: T.faint }}>Nothing matches &ldquo;{q}&rdquo;. Try a rig number or a hole number.</div>}
          {hits.map((h, i) => (
            <button key={`${h.kind}_${h.label}`} onClick={() => go(h.href)} onMouseEnter={() => setAt(i)} style={{
              display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '9px 11px', borderRadius: 9, cursor: 'pointer',
              border: 'none', textAlign: 'left', fontFamily: 'inherit', background: i === at ? 'color-mix(in srgb, var(--x-orange) 12%, transparent)' : 'transparent',
            }}>
              <span style={{ width: 58, fontSize: 11.5, color: T.faint, flexShrink: 0 }}>{h.kind}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 14, color: T.text, fontWeight: 600 }}>{h.label}</span>
                {h.sub && <span style={{ fontSize: 12.5, color: T.faint, marginLeft: 9 }}>{h.sub}</span>}
              </span>
              {i === at && <CornerDownLeft size={14} style={{ color: T.faint }} />}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <CurrencyProvider>
      <CostingProvider>
        <ThemeScope />
        <Guard role="admin"><CoreProvider><GeoDataProvider><InboxProvider><AskProvider><Shell>{children}</Shell></AskProvider></InboxProvider></GeoDataProvider></CoreProvider></Guard>
      </CostingProvider>
    </CurrencyProvider>
  )
}
