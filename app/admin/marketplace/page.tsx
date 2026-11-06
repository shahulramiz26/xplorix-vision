'use client'

import { useState, useMemo, Fragment } from 'react'
import Link from 'next/link'
import {
  Search, BadgeCheck, MapPin, Bookmark, ArrowRight, Package, X,
  LayoutGrid, List as ListIcon, ChevronDown, Clock, Eye, SlidersHorizontal,
  Truck, Disc3, Minus, ArrowDownToLine, Wind, HardHat, Wrench, Flame,
} from 'lucide-react'
import {
  LISTINGS, CATEGORIES, CATEGORY_FILTERS, CONDITIONS, COUNTRIES, REGIONS,
  MARKET_STATS, formatPrice, categoryCount, countryCount,
  type Listing, type FilterDef,
} from './data'
import BillboardCarousel, { GridPlacement } from './BillboardCarousel'

/* ---------------- tokens ---------------- */
const C = {
  accent: 'var(--x-orange)', accentSoft: 'color-mix(in srgb, var(--x-orange) 10%, transparent)',
  accentDim: 'color-mix(in srgb, var(--x-orange) 14%, transparent)', accentBorder: 'color-mix(in srgb, var(--x-orange) 28%, transparent)',
  panel: 'var(--x-card)', panelHi: 'var(--x-raised)', bg: 'var(--x-bg)',
  border: 'var(--x-border)', borderSoft: 'color-mix(in srgb, var(--x-border) 60%, transparent)',
  text: 'var(--x-text)', dim: 'var(--x-muted)', muted: 'var(--x-faint)', faint: 'var(--x-dim)',
  green: 'var(--x-green)',
}
const display = "'Space Grotesk', sans-serif"

const ICONS: Record<string, React.ElementType> = {
  Truck, Disc3, Minus, ArrowDownToLine, Wind, Package, HardHat, Wrench,
}

/* ---------------- equipment plate ---------------- */
function Plate({ listing, height, big = false }: { listing: Listing; height: number; big?: boolean }) {
  return (
    <div style={{
      height, position: 'relative', overflow: 'hidden',
      background: `linear-gradient(140deg, ${C.panelHi} 0%, var(--x-bg) 100%)`,
      display: 'flex', alignItems: 'flex-end', padding: big ? 22 : 15,
    }}>
      <div aria-hidden style={{
        position: 'absolute', inset: 0, opacity: 0.55,
        backgroundImage: 'repeating-linear-gradient(115deg, color-mix(in srgb, var(--x-muted) 5%, transparent) 0 1px, transparent 1px 12px)',
      }} />
      <div aria-hidden style={{
        position: 'absolute', right: -40, top: -40, width: big ? 260 : 160, height: big ? 260 : 160,
        transform: 'rotate(15deg)', borderRadius: 32,
        background: 'linear-gradient(135deg, color-mix(in srgb, var(--x-orange) 11%, transparent), transparent 62%)',
      }} />
      <div style={{ position: 'relative' }}>
        <div style={{ fontSize: 9.5, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.faint, fontWeight: 700 }}>
          {listing.brand}
        </div>
        <div style={{
          fontSize: big ? 40 : 25, fontWeight: 700, fontFamily: display,
          color: 'color-mix(in srgb, var(--x-text) 12%, transparent)', letterSpacing: '-0.03em', lineHeight: 1.05,
        }}>
          {listing.model}
        </div>
      </div>
    </div>
  )
}

function ConditionPill({ condition, size = 'sm' }: { condition: string; size?: 'sm' | 'xs' }) {
  const map: Record<string, [string, string, string]> = {
    New: ['color-mix(in srgb, var(--x-green) 10%, transparent)', 'var(--x-green-b)', 'color-mix(in srgb, var(--x-green) 22%, transparent)'],
    Used: ['color-mix(in srgb, var(--x-muted) 10%, transparent)', 'var(--x-muted)', 'color-mix(in srgb, var(--x-muted) 20%, transparent)'],
    Refurbished: ['color-mix(in srgb, var(--x-amber) 10%, transparent)', 'var(--x-yellow)', 'color-mix(in srgb, var(--x-amber) 22%, transparent)'],
  }
  const [bg, fg, bd] = map[condition] ?? map.Used
  return (
    <span style={{
      fontSize: size === 'xs' ? 9.5 : 10, fontWeight: 700, letterSpacing: '0.08em',
      textTransform: 'uppercase', padding: '3px 8px', borderRadius: 6,
      background: bg, color: fg, border: `1px solid ${bd}`, whiteSpace: 'nowrap',
    }}>{condition}</span>
  )
}

function SpecStrip({ listing, dense = false }: { listing: Listing; dense?: boolean }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1,
      background: C.border, border: `1px solid ${C.border}`, borderRadius: 9, overflow: 'hidden',
    }}>
      {listing.headlineSpecs.map((s) => (
        <div key={s.label} style={{ background: 'var(--x-bg)', padding: dense ? '7px 8px' : '9px 8px' }}>
          <div style={{ fontSize: 9, color: C.faint, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>
            {s.label}
          </div>
          <div style={{ fontSize: 12.5, color: C.text, fontWeight: 600, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
            {s.value}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ---------------- cards ---------------- */
function GridCard({ l, saved, onSave, onQuote }: {
  l: Listing; saved: boolean; onSave: (id: string) => void; onQuote: (l: Listing) => void
}) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        borderRadius: 14, overflow: 'hidden', background: C.panel,
        border: `1px solid ${hover ? C.accentBorder : C.border}`,
        transform: hover ? 'translateY(-3px)' : 'none',
        boxShadow: hover ? '0 16px 36px rgba(var(--x-shadow),0.5)' : 'none',
        transition: 'all .22s ease', display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{ position: 'relative', borderBottom: `1px solid ${C.border}` }}>
        <Link href={`/admin/marketplace/${l.slug}`} style={{ display: 'block' }}>
          <Plate listing={l} height={158} />
        </Link>
        <div style={{ position: 'absolute', top: 11, left: 11, display: 'flex', gap: 6 }}>
          <ConditionPill condition={l.condition} />
          {l.featured && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9.5, fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 6,
              background: C.accentDim, color: C.accent, border: `1px solid ${C.accentBorder}`,
            }}><Flame size={10} /> Featured</span>
          )}
        </div>
        <button onClick={() => onSave(l.id)} aria-label={saved ? 'Remove from saved' : 'Save listing'}
          style={{
            position: 'absolute', top: 10, right: 10, width: 30, height: 30, borderRadius: 8,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: saved ? C.accentDim : 'color-mix(in srgb, var(--x-bg) 72%, transparent)',
            border: `1px solid ${saved ? C.accentBorder : C.border}`,
            color: saved ? C.accent : C.muted, backdropFilter: 'blur(6px)',
          }}>
          <Bookmark size={14} fill={saved ? C.accent : 'none'} />
        </button>
      </div>

      <div style={{ padding: 15, display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7, gap: 8 }}>
          <span style={{ fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.faint, fontWeight: 700 }}>
            {l.categoryLabel}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: C.faint }}>
            <Eye size={11} />{l.views}
          </span>
        </div>

        <Link href={`/admin/marketplace/${l.slug}`}
          style={{ color: C.text, fontSize: 14.5, fontWeight: 600, lineHeight: 1.35, fontFamily: display, marginBottom: 13 }}>
          {l.title}
        </Link>

        <SpecStrip listing={l} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: C.muted, margin: '12px 0' }}>
          <MapPin size={11} style={{ flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.location}</span>
          {l.year && <span style={{ color: C.faint }}>· {l.year}</span>}
        </div>

        <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 11 }}>
            <div style={{
              fontSize: l.priceType === 'on_request' ? 12.5 : 16, fontWeight: 700, fontFamily: display,
              color: l.priceType === 'on_request' ? C.dim : C.text, fontVariantNumeric: 'tabular-nums',
            }}>{formatPrice(l)}</div>
            {l.partner.verified && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: C.green, fontWeight: 600 }}>
                <BadgeCheck size={12} /> Verified
              </span>
            )}
          </div>
          <button onClick={() => onQuote(l)} style={{
            width: '100%', padding: '9px 14px', borderRadius: 10, cursor: 'pointer',
            fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            background: hover ? 'linear-gradient(135deg,var(--x-orange),var(--x-orange-d))' : C.accentSoft,
            color: hover ? '#fff' : C.accent,
            border: `1px solid ${hover ? 'transparent' : C.accentBorder}`, transition: 'all .22s',
          }}>Request quote <ArrowRight size={13} /></button>
        </div>
      </div>
    </div>
  )
}

function RowCard({ l, saved, onSave, onQuote }: {
  l: Listing; saved: boolean; onSave: (id: string) => void; onQuote: (l: Listing) => void
}) {
  const [hover, setHover] = useState(false)
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid', gridTemplateColumns: '180px minmax(0,1fr) 200px',
        background: C.panel, borderRadius: 13, overflow: 'hidden',
        border: `1px solid ${hover ? C.accentBorder : C.border}`, transition: 'border-color .2s',
      }}>
      <Link href={`/admin/marketplace/${l.slug}`} style={{ display: 'block', borderRight: `1px solid ${C.border}` }}>
        <Plate listing={l} height={150} />
      </Link>

      <div style={{ padding: 16, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <ConditionPill condition={l.condition} size="xs" />
          <span style={{ fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.faint, fontWeight: 700 }}>
            {l.categoryLabel}
          </span>
        </div>
        <Link href={`/admin/marketplace/${l.slug}`}
          style={{ color: C.text, fontSize: 15.5, fontWeight: 600, fontFamily: display, display: 'block', marginBottom: 10 }}>
          {l.title}
        </Link>
        <div style={{ maxWidth: 400, marginBottom: 10 }}><SpecStrip listing={l} dense /></div>
        <div style={{ display: 'flex', gap: 14, fontSize: 11.5, color: C.muted, flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={11} />{l.location}, {l.country}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={11} />{l.postedDaysAgo}d ago</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Eye size={11} />{l.views}</span>
        </div>
      </div>

      <div style={{ padding: 16, borderLeft: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10 }}>
        <div>
          <div style={{
            fontSize: l.priceType === 'on_request' ? 13 : 19, fontWeight: 700, fontFamily: display,
            color: C.text, fontVariantNumeric: 'tabular-nums',
          }}>{formatPrice(l)}</div>
          <div style={{ fontSize: 11, color: C.green, marginTop: 3, fontWeight: 600 }}>{l.availability}</div>
        </div>
        <div style={{ fontSize: 11.5, color: C.muted, display: 'flex', alignItems: 'center', gap: 4 }}>
          {l.partner.verified && <BadgeCheck size={12} style={{ color: C.green, flexShrink: 0 }} />}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.partner.name}</span>
        </div>
        <div style={{ display: 'flex', gap: 7 }}>
          <button onClick={() => onQuote(l)} style={{
            flex: 1, padding: '9px', borderRadius: 9, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
            fontFamily: 'inherit', background: 'linear-gradient(135deg,var(--x-orange),var(--x-orange-d))', color: '#fff', border: 'none',
          }}>Request quote</button>
          <button onClick={() => onSave(l.id)} aria-label="Save" style={{
            width: 36, borderRadius: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: saved ? C.accentDim : 'rgba(var(--x-ov),0.03)',
            border: `1px solid ${saved ? C.accentBorder : C.border}`, color: saved ? C.accent : C.muted,
          }}><Bookmark size={14} fill={saved ? C.accent : 'none'} /></button>
        </div>
      </div>
    </div>
  )
}

/* ---------------- filter rail pieces ---------------- */
function RailSection({ title, children, defaultOpen = true }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ borderBottom: `1px solid ${C.border}`, padding: '14px 0' }}>
      <button onClick={() => setOpen(!open)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: open ? 12 : 0,
        fontFamily: 'inherit',
      }}>
        <span style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.dim, fontWeight: 700 }}>
          {title}
        </span>
        <ChevronDown size={14} style={{ color: C.faint, transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform .2s' }} />
      </button>
      {open && children}
    </div>
  )
}

function Check({ label, count, on, onClick }: {
  label: string; count?: number; on: boolean; onClick: () => void
}) {
  return (
    <button onClick={onClick} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '6px 8px',
      borderRadius: 8, cursor: 'pointer', background: on ? C.accentSoft : 'transparent',
      border: 'none', fontFamily: 'inherit', textAlign: 'left',
    }}>
      <span style={{
        width: 15, height: 15, borderRadius: 4, flexShrink: 0,
        border: `1.5px solid ${on ? C.accent : C.faint}`, background: on ? C.accent : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {on && <svg width="9" height="9" viewBox="0 0 10 10"><path d="M1 5l2.5 2.5L9 2" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </span>
      <span style={{ fontSize: 12.5, color: on ? C.text : C.dim, flex: 1, fontWeight: on ? 600 : 400 }}>{label}</span>
      {count !== undefined && <span style={{ fontSize: 11, color: C.faint, fontVariantNumeric: 'tabular-nums' }}>{count}</span>}
    </button>
  )
}

function RangeSlider({ def, value, onChange }: {
  def: Extract<FilterDef, { type: 'range' }>; value: number; onChange: (v: number) => void
}) {
  return (
    <div style={{ padding: '2px 8px 6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
        <span style={{ fontSize: 12, color: C.dim }}>{def.label}</span>
        <span style={{ fontSize: 12, color: value > def.min ? C.accent : C.faint, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {value > def.min ? `≥ ${value.toLocaleString()} ${def.unit}` : 'Any'}
        </span>
      </div>
      <input type="range" min={def.min} max={def.max} step={def.step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: C.accent, cursor: 'pointer' }} />
    </div>
  )
}

/* ---------------- page ---------------- */
export default function MarketplacePage() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [subCategory, setSubCategory] = useState<string | null>(null)
  const [conditions, setConditions] = useState<string[]>([])
  const [countries, setCountries] = useState<string[]>([])
  const [region, setRegion] = useState<string | null>(null)
  const [verifiedOnly, setVerifiedOnly] = useState(false)
  const [priceMax, setPriceMax] = useState(800000)
  const [dynamic, setDynamic] = useState<Record<string, string | number>>({})
  const [sort, setSort] = useState('recent')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [quoteFor, setQuoteFor] = useState<Listing | null>(null)
  const [railOpen, setRailOpen] = useState(false)

  const toggle = <T,>(arr: T[], v: T, set: (a: T[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

  const activeCat = CATEGORIES.find((c) => c.id === category)
  const dynamicDefs = category !== 'all' ? CATEGORY_FILTERS[category] ?? [] : []

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    let out = LISTINGS.filter((l) => {
      if (category !== 'all' && l.categoryId !== category) return false
      if (subCategory && l.subCategoryId !== subCategory) return false
      if (conditions.length && !conditions.includes(l.condition)) return false
      if (countries.length && !countries.includes(l.country)) return false
      if (region && COUNTRIES.find((c) => c.name === l.country)?.region !== region) return false
      if (verifiedOnly && !l.partner.verified) return false
      if (l.priceUSD !== null && l.priceUSD > priceMax) return false
      for (const [k, v] of Object.entries(dynamic)) {
        if (v === '' || v === undefined) continue
        const lv = l.filterValues[k]
        if (lv === undefined) return false
        if (typeof v === 'number') { if (Number(lv) < v) return false }
        else if (String(lv) !== v) return false
      }
      if (q) {
        const hay = `${l.title} ${l.brand} ${l.model} ${l.categoryLabel} ${l.location} ${l.country} ${l.partner.name}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    if (sort === 'recent') out = [...out].sort((a, b) => a.postedDaysAgo - b.postedDaysAgo)
    if (sort === 'price_low') out = [...out].sort((a, b) => (a.priceUSD ?? Infinity) - (b.priceUSD ?? Infinity))
    if (sort === 'price_high') out = [...out].sort((a, b) => (b.priceUSD ?? 0) - (a.priceUSD ?? 0))
    if (sort === 'popular') out = [...out].sort((a, b) => b.views - a.views)
    return out
  }, [query, category, subCategory, conditions, countries, region, verifiedOnly, priceMax, dynamic, sort])

  const featured = LISTINGS.filter((l) => l.featured).slice(0, 4)

  const chips: { label: string; clear: () => void }[] = [
    ...(category !== 'all' ? [{ label: activeCat?.label ?? '', clear: () => { setCategory('all'); setSubCategory(null); setDynamic({}) } }] : []),
    ...(subCategory ? [{ label: activeCat?.subs.find((s) => s.id === subCategory)?.label ?? '', clear: () => setSubCategory(null) }] : []),
    ...conditions.map((c) => ({ label: c, clear: () => toggle(conditions, c, setConditions) })),
    ...countries.map((c) => ({ label: c, clear: () => toggle(countries, c, setCountries) })),
    ...(region ? [{ label: region, clear: () => setRegion(null) }] : []),
    ...(verifiedOnly ? [{ label: 'Verified only', clear: () => setVerifiedOnly(false) }] : []),
    ...Object.entries(dynamic).filter(([, v]) => v !== '' && v !== undefined).map(([k, v]) => ({
      label: `${dynamicDefs.find((d) => d.key === k)?.label ?? k}: ${v}`,
      clear: () => setDynamic((p) => { const n = { ...p }; delete n[k]; return n }),
    })),
  ]

  const clearAll = () => {
    setCategory('all'); setSubCategory(null); setConditions([]); setCountries([])
    setRegion(null); setVerifiedOnly(false); setDynamic({}); setPriceMax(800000); setQuery('')
  }

  return (
    <div style={{ maxWidth: 2000 }}>

      {/* ============ BILLBOARD ============ */}
      <BillboardCarousel />

      {/* ============ SEARCH ============ */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 11, padding: '13px 18px',
        borderRadius: 13, marginBottom: 24,
        background: 'rgba(var(--x-ov),0.03)', border: `1px solid ${C.border}`,
      }}>
        <Search size={17} style={{ color: C.muted, flexShrink: 0 }} />
        <input value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the Exchange — LF90, NQ rods, 6 inch DTH bit, rotation head overhaul"
          style={{
            flex: 1, background: 'none', border: 'none', outline: 'none',
            color: C.text, fontSize: 14, fontFamily: 'inherit', minWidth: 0,
          }} />
        {query && (
          <button onClick={() => setQuery('')} aria-label="Clear search"
            style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', display: 'flex' }}>
            <X size={16} />
          </button>
        )}
      </div>

      {/* ============ FEATURED ============ */}
      {category === 'all' && !query && (
        <div style={{ marginBottom: 26 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 13 }}>
            <Flame size={15} style={{ color: C.accent }} />
            <h2 style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: display, margin: 0 }}>
              Featured this week
            </h2>
            <span style={{ flex: 1, height: 1, background: C.border }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
            {featured.map((l) => (
              <Link key={l.id} href={`/admin/marketplace/${l.slug}`}
                style={{
                  borderRadius: 13, overflow: 'hidden', background: C.panel,
                  border: `1px solid ${C.border}`, display: 'block',
                }}>
                <Plate listing={l} height={92} />
                <div style={{ padding: '12px 14px', borderTop: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 13, color: C.text, fontWeight: 600, lineHeight: 1.35, marginBottom: 6 }}>
                    {l.title}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: C.dim, fontWeight: 600 }}>{formatPrice(l)}</span>
                    <span style={{ fontSize: 11, color: C.faint }}>{l.country}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ============ BODY ============ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 24 }} className="xpl-body">
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>

          {/* ---- filter rail ---- */}
          <aside
            className={railOpen ? 'xpl-rail xpl-rail-open' : 'xpl-rail'}
            style={{
              width: 252, flexShrink: 0, position: 'sticky', top: 88,
              maxHeight: 'calc(100vh - 110px)', overflowY: 'auto',
              background: C.panel, border: `1px solid ${C.border}`,
              borderRadius: 14, padding: '4px 14px 14px', scrollbarWidth: 'thin',
            }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 0 0',
            }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text, fontFamily: display }}>Filters</span>
              {chips.length > 0 && (
                <button onClick={clearAll} style={{
                  background: 'none', border: 'none', color: C.accent, fontSize: 11.5,
                  fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}>Reset</button>
              )}
            </div>

            <RailSection title="Category">
              <button onClick={() => { setCategory('all'); setSubCategory(null); setDynamic({}) }}
                style={{
                  width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '7px 8px', borderRadius: 8, cursor: 'pointer', marginBottom: 2,
                  background: category === 'all' ? C.accentSoft : 'transparent', border: 'none',
                  color: category === 'all' ? C.accent : C.dim, fontSize: 12.5,
                  fontWeight: category === 'all' ? 600 : 400, fontFamily: 'inherit',
                }}>
                All equipment
                <span style={{ fontSize: 11, color: C.faint }}>{LISTINGS.length}</span>
              </button>

              {CATEGORIES.map((cat) => {
                const Icon = ICONS[cat.icon] ?? Package
                const on = category === cat.id
                return (
                  <div key={cat.id}>
                    <button onClick={() => { setCategory(on ? 'all' : cat.id); setSubCategory(null); setDynamic({}) }}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '7px 8px',
                        borderRadius: 8, cursor: 'pointer', marginBottom: 2, border: 'none',
                        background: on ? C.accentSoft : 'transparent', fontFamily: 'inherit', textAlign: 'left',
                      }}>
                      <Icon size={14} style={{ color: on ? C.accent : C.faint, flexShrink: 0 }} />
                      <span style={{ fontSize: 12.5, color: on ? C.accent : C.dim, flex: 1, fontWeight: on ? 600 : 400 }}>
                        {cat.label}
                      </span>
                      <span style={{ fontSize: 11, color: C.faint, fontVariantNumeric: 'tabular-nums' }}>
                        {categoryCount(cat.id)}
                      </span>
                    </button>

                    {on && (
                      <div style={{ marginLeft: 22, borderLeft: `1px solid ${C.border}`, paddingLeft: 8, marginBottom: 6 }}>
                        {cat.subs.map((s) => (
                          <button key={s.id} onClick={() => setSubCategory(subCategory === s.id ? null : s.id)}
                            style={{
                              width: '100%', textAlign: 'left', padding: '5px 7px', borderRadius: 6,
                              cursor: 'pointer', border: 'none', background: subCategory === s.id ? C.accentSoft : 'transparent',
                              color: subCategory === s.id ? C.accent : C.muted, fontSize: 12,
                              fontWeight: subCategory === s.id ? 600 : 400, fontFamily: 'inherit',
                            }}>{s.label}</button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </RailSection>

            {/* dynamic, category-specific filters */}
            {dynamicDefs.length > 0 && (
              <RailSection title={`${activeCat?.label} specs`}>
                {dynamicDefs.map((def) =>
                  def.type === 'range' ? (
                    <RangeSlider key={def.key} def={def}
                      value={Number(dynamic[def.key] ?? def.min)}
                      onChange={(v) => setDynamic((p) => ({ ...p, [def.key]: v }))} />
                  ) : (
                    <div key={def.key} style={{ padding: '2px 8px 10px' }}>
                      <div style={{ fontSize: 12, color: C.dim, marginBottom: 7 }}>{def.label}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {def.options.map((o) => {
                          const on = dynamic[def.key] === o
                          return (
                            <button key={o} onClick={() => setDynamic((p) => {
                              const n = { ...p }; on ? delete n[def.key] : (n[def.key] = o); return n
                            })} style={{
                              padding: '4px 9px', borderRadius: 7, cursor: 'pointer', fontSize: 11.5,
                              fontWeight: 600, fontFamily: 'inherit',
                              background: on ? C.accentDim : 'rgba(var(--x-ov),0.03)',
                              border: `1px solid ${on ? C.accentBorder : C.border}`,
                              color: on ? C.accent : C.dim,
                            }}>{o}</button>
                          )
                        })}
                      </div>
                    </div>
                  )
                )}
              </RailSection>
            )}

            <RailSection title="Condition">
              {CONDITIONS.map((c) => (
                <Check key={c} label={c} on={conditions.includes(c)}
                  count={LISTINGS.filter((l) => l.condition === c).length}
                  onClick={() => toggle(conditions, c, setConditions)} />
              ))}
            </RailSection>

            <RailSection title="Region">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, padding: '0 8px' }}>
                {REGIONS.map((r) => {
                  const on = region === r
                  return (
                    <button key={r} onClick={() => setRegion(on ? null : r)} style={{
                      padding: '4px 9px', borderRadius: 7, cursor: 'pointer', fontSize: 11.5,
                      fontWeight: 600, fontFamily: 'inherit',
                      background: on ? C.accentDim : 'rgba(var(--x-ov),0.03)',
                      border: `1px solid ${on ? C.accentBorder : C.border}`, color: on ? C.accent : C.dim,
                    }}>{r}</button>
                  )
                })}
              </div>
            </RailSection>

            <RailSection title="Country" defaultOpen={false}>
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {COUNTRIES.filter((c) => countryCount(c.name) > 0).map((c) => (
                  <Check key={c.code} label={c.name} count={countryCount(c.name)}
                    on={countries.includes(c.name)}
                    onClick={() => toggle(countries, c.name, setCountries)} />
                ))}
              </div>
            </RailSection>

            <RailSection title="Budget">
              <div style={{ padding: '2px 8px 6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
                  <span style={{ fontSize: 12, color: C.dim }}>Up to</span>
                  <span style={{ fontSize: 12, color: priceMax < 800000 ? C.accent : C.faint, fontWeight: 600 }}>
                    {priceMax >= 800000 ? 'Any' : `$${priceMax.toLocaleString()}`}
                  </span>
                </div>
                <input type="range" min={0} max={800000} step={10000} value={priceMax}
                  onChange={(e) => setPriceMax(Number(e.target.value))}
                  style={{ width: '100%', accentColor: C.accent, cursor: 'pointer' }} />
                <div style={{ fontSize: 10.5, color: C.faint, marginTop: 6, lineHeight: 1.5 }}>
                  Indicative USD. Listings priced on request are always included.
                </div>
              </div>
            </RailSection>

            <RailSection title="Supplier">
              <Check label="Verified partners only" on={verifiedOnly} onClick={() => setVerifiedOnly(!verifiedOnly)} />
            </RailSection>
          </aside>

          {/* ---- results ---- */}
          <div style={{ flex: 1, minWidth: 0 }}>

            {/* toolbar */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 12, marginBottom: 14, flexWrap: 'wrap',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={() => setRailOpen(!railOpen)} className="xpl-rail-toggle"
                  style={{
                    display: 'none', alignItems: 'center', gap: 7, padding: '9px 14px', borderRadius: 10,
                    background: 'rgba(var(--x-ov),0.03)', border: `1px solid ${C.border}`,
                    color: C.dim, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                  <SlidersHorizontal size={15} /> Filters
                </button>
                <div style={{ fontSize: 13, color: C.muted }}>
                  <strong style={{ color: C.text, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{results.length}</strong>
                  {' '}{results.length === 1 ? 'listing' : 'listings'}
                  <span style={{ color: C.faint }}>
                    {' '}from {MARKET_STATS.partners} suppliers across {MARKET_STATS.countries} countries
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <select value={sort} onChange={(e) => setSort(e.target.value)}
                  style={{
                    padding: '9px 12px', borderRadius: 10, background: 'rgba(var(--x-ov),0.03)',
                    border: `1px solid ${C.border}`, color: C.dim, fontSize: 12.5,
                    fontFamily: 'inherit', cursor: 'pointer', outline: 'none', fontWeight: 600,
                  }}>
                  <option value="recent">Recently listed</option>
                  <option value="popular">Most viewed</option>
                  <option value="price_low">Price, low to high</option>
                  <option value="price_high">Price, high to low</option>
                </select>

                <div style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 10, background: 'rgba(var(--x-ov),0.03)', border: `1px solid ${C.border}` }}>
                  {(['grid', 'list'] as const).map((v) => {
                    const Icon = v === 'grid' ? LayoutGrid : ListIcon
                    const on = view === v
                    return (
                      <button key={v} onClick={() => setView(v)} aria-label={`${v} view`} style={{
                        width: 30, height: 28, borderRadius: 7, cursor: 'pointer', border: 'none',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: on ? C.accentDim : 'transparent', color: on ? C.accent : C.muted,
                      }}><Icon size={14} /></button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* active chips */}
            {chips.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 16 }}>
                {chips.map((c, i) => (
                  <button key={i} onClick={c.clear} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px',
                    borderRadius: 999, cursor: 'pointer', fontSize: 11.5, fontWeight: 600,
                    background: C.accentSoft, border: `1px solid ${C.accentBorder}`,
                    color: C.accent, fontFamily: 'inherit',
                  }}>{c.label}<X size={12} /></button>
                ))}
              </div>
            )}

            {/* results */}
            {results.length > 0 ? (
              view === 'grid' ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(258px, 1fr))', gap: 16 }}>
                  {results.map((l, i) => (
                    <Fragment key={l.id}>
                      <GridCard l={l} saved={saved.has(l.id)}
                        onSave={(id) => setSaved((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })}
                        onQuote={setQuoteFor} />
                      {i === 5 && results.length > 7 && (
                        <GridPlacement rotationKey={0} />
                      )}
                    </Fragment>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {results.map((l) => (
                    <RowCard key={l.id} l={l} saved={saved.has(l.id)}
                      onSave={(id) => setSaved((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })}
                      onQuote={setQuoteFor} />
                  ))}
                </div>
              )
            ) : (
              <div style={{ padding: '60px 24px', textAlign: 'center', borderRadius: 14, background: C.panel, border: `1px dashed ${C.border}` }}>
                <div style={{
                  width: 46, height: 46, borderRadius: 12, margin: '0 auto 16px',
                  background: 'rgba(var(--x-ov),0.04)', border: `1px solid ${C.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}><Package size={20} style={{ color: C.muted }} /></div>
                <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 6, fontFamily: display }}>
                  Nothing matches those filters
                </div>
                <p style={{ fontSize: 13, color: C.muted, maxWidth: 340, margin: '0 auto 18px', lineHeight: 1.6 }}>
                  Widen the search, or post a wanted request and we will put it to the supplier network.
                </p>
                <button onClick={clearAll} style={{
                  padding: '9px 18px', borderRadius: 10, cursor: 'pointer', background: C.accentSoft,
                  border: `1px solid ${C.accentBorder}`, color: C.accent, fontWeight: 600, fontSize: 13, fontFamily: 'inherit',
                }}>Reset filters</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {quoteFor && <QuoteModal listing={quoteFor} onClose={() => setQuoteFor(null)} />}

      <style>{`
        @media (max-width: 1024px) {
          .xpl-rail { display: none; }
          .xpl-rail-open {
            display: block !important; position: fixed !important; inset: 64px 0 0 auto !important;
            width: 300px !important; z-index: 60; border-radius: 0 !important;
            max-height: none !important; height: calc(100vh - 64px) !important;
          }
          .xpl-rail-toggle { display: flex !important; }
        }
      `}</style>
    </div>
  )
}

/* ---------------- quote modal ---------------- */
function QuoteModal({ listing, onClose }: { listing: Listing; onClose: () => void }) {
  const [sent, setSent] = useState(false)
  const [qty, setQty] = useState('1')
  const [needBy, setNeedBy] = useState('')

  const field: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 9,
    background: 'rgba(var(--x-ov),0.03)', border: `1px solid ${C.border}`,
    color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none',
  }
  const label: React.CSSProperties = {
    fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
    color: C.muted, fontWeight: 700, marginBottom: 6, display: 'block',
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 100, padding: 20,
      background: 'rgba(var(--x-shadow),0.74)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 520, maxHeight: '88vh', overflowY: 'auto',
        background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16,
      }}>
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.text, fontFamily: display }}>
              {sent ? 'Request sent' : 'Request a quote'}
            </div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>{listing.title}</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', display: 'flex', height: 'fit-content' }}>
            <X size={18} />
          </button>
        </div>

        {sent ? (
          <div style={{ padding: '30px 22px 26px', textAlign: 'center' }}>
            <div style={{
              width: 46, height: 46, borderRadius: 12, margin: '0 auto 14px',
              background: 'color-mix(in srgb, var(--x-green) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--x-green) 25%, transparent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><BadgeCheck size={22} style={{ color: C.green }} /></div>
            <div style={{ fontSize: 14, color: C.text, fontWeight: 600, marginBottom: 6 }}>
              {listing.partner.name} has your request
            </div>
            <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, maxWidth: 350, margin: '0 auto 20px' }}>
              They typically reply within {listing.partner.responseHours} hours. Track the status under My inquiries.
            </p>
            <Link href="/admin/marketplace/inquiries" onClick={onClose} style={{
              display: 'inline-block', padding: '10px 20px', borderRadius: 10,
              background: 'linear-gradient(135deg,var(--x-orange),var(--x-orange-d))', color: '#fff', fontWeight: 700, fontSize: 13,
            }}>View my inquiries</Link>
          </div>
        ) : (
          <div style={{ padding: 22 }}>
            <div style={{ padding: 14, borderRadius: 11, marginBottom: 20, background: 'color-mix(in srgb, var(--x-orange) 5%, transparent)', border: '1px solid color-mix(in srgb, var(--x-orange) 14%, transparent)' }}>
              <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.accent, fontWeight: 700, marginBottom: 10 }}>
                Sent with your request
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
                {[['Company', 'Apex Drilling Solutions'], ['Country', 'Saudi Arabia'], ['Active rigs', '14'], ['Contact', 'Admin User']].map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: 10, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>{k}</div>
                    <div style={{ fontSize: 13, color: C.text, fontWeight: 600, marginTop: 2 }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div><label style={label}>Quantity</label>
                <input style={field} value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" /></div>
              <div><label style={label}>Required by</label>
                <input style={field} type="date" value={needBy} onChange={(e) => setNeedBy(e.target.value)} /></div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={label}>Message</label>
              <textarea style={{ ...field, minHeight: 92, resize: 'vertical' }}
                placeholder="Site conditions, delivery terms, inspection window." />
            </div>

            <button onClick={() => setSent(true)} style={{
              width: '100%', padding: 12, borderRadius: 10, cursor: 'pointer',
              background: 'linear-gradient(135deg,var(--x-orange),var(--x-orange-d))', color: '#fff',
              border: 'none', fontWeight: 700, fontSize: 14, fontFamily: 'inherit',
              boxShadow: '0 4px 20px color-mix(in srgb, var(--x-orange) 30%, transparent)',
            }}>Send request</button>
          </div>
        )}
      </div>
    </div>
  )
}
