'use client'

import { useState, useMemo } from 'react'
import {
  Search, BadgeCheck, MapPin, X, Plus, Users, Briefcase, Clock,
  CalendarDays, ShieldCheck, Send, Eye, ChevronRight, ChevronDown,
  Plane, RotateCw, SlidersHorizontal,
} from 'lucide-react'
import {
  CREW, JOBS, CREW_ROLES, ROTATIONS, RIG_FAMILIES, CERTIFICATIONS,
  CREW_STATS, availabilityLabel, freshness,
  type CrewProfile, type JobPosting,
} from './data'

const C = {
  accent: 'var(--x-orange)', accentSoft: 'color-mix(in srgb, var(--x-orange) 10%, transparent)',
  accentDim: 'color-mix(in srgb, var(--x-orange) 14%, transparent)', accentBorder: 'color-mix(in srgb, var(--x-orange) 28%, transparent)',
  panel: 'var(--x-card)', panelHi: 'var(--x-raised)', bg: 'var(--x-bg)',
  border: 'var(--x-border)', text: 'var(--x-text)', dim: 'var(--x-muted)',
  muted: 'var(--x-faint)', faint: 'var(--x-dim)', green: 'var(--x-green)', amber: 'var(--x-yellow)',
}
import { display, num } from '../../components/kit'

const WINDOWS: [string, number][] = [['2 weeks', 14], ['30 days', 30], ['90 days', 90], ['Any', 9999]]

/* ================================================================== *
 * Rail primitives
 * ================================================================== */
function RailSection({ title, children, defaultOpen = true, count }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean; count?: number
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ borderBottom: `1px solid ${C.border}`, padding: '14px 0' }}>
      <button onClick={() => setOpen(!open)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        marginBottom: open ? 11 : 0, fontFamily: 'inherit',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.dim, fontWeight: 700 }}>
            {title}
          </span>
          {!!count && (
            <span style={{
              minWidth: 16, height: 16, padding: '0 5px', borderRadius: 8,
              background: C.accentDim, border: `1px solid ${C.accentBorder}`, color: C.accent,
              fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{count}</span>
          )}
        </span>
        <ChevronDown size={14} style={{ color: C.faint, transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform .2s' }} />
      </button>
      {open && children}
    </div>
  )
}

function Check({ label, count, on, onClick, sub }: {
  label: string; count?: number; on: boolean; onClick: () => void; sub?: string
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
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 12.5, color: on ? C.text : C.dim, fontWeight: on ? 600 : 400, display: 'block' }}>
          {label}
        </span>
        {sub && <span style={{ fontSize: 10.5, color: C.faint }}>{sub}</span>}
      </span>
      {count !== undefined && (
        <span style={{ fontSize: 11, color: count === 0 ? C.faint : C.muted, fontVariantNumeric: 'tabular-nums' }}>
          {count}
        </span>
      )}
    </button>
  )
}

/** Long option lists collapse to five with a show-all toggle. */
function CollapsibleChecks({ options, selected, onToggle, counts, initial = 5 }: {
  options: string[]
  selected: string[]
  onToggle: (v: string) => void
  counts: (v: string) => number
  initial?: number
}) {
  const [all, setAll] = useState(false)
  const shown = all ? options : options.slice(0, initial)
  const hiddenSelected = options.slice(initial).filter((o) => selected.includes(o)).length

  return (
    <>
      {shown.map((o) => (
        <Check key={o} label={o} count={counts(o)} on={selected.includes(o)} onClick={() => onToggle(o)} />
      ))}
      {options.length > initial && (
        <button onClick={() => setAll(!all)} style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: '6px 8px',
          color: C.accent, fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit',
        }}>
          {all ? 'Show less' : `Show ${options.length - initial} more`}
          {!all && hiddenSelected > 0 && (
            <span style={{ color: C.muted, fontWeight: 400 }}> · {hiddenSelected} selected</span>
          )}
        </button>
      )}
    </>
  )
}

/* ================================================================== *
 * Cards
 * ================================================================== */
function Pill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'accent' | 'green' | 'amber' }) {
  const map = {
    neutral: ['rgba(var(--x-ov),0.04)', C.dim, C.border],
    accent: [C.accentSoft, C.accent, C.accentBorder],
    green: ['color-mix(in srgb, var(--x-green) 10%, transparent)', 'var(--x-green-b)', 'color-mix(in srgb, var(--x-green) 22%, transparent)'],
    amber: ['color-mix(in srgb, var(--x-amber) 10%, transparent)', C.amber, 'color-mix(in srgb, var(--x-amber) 22%, transparent)'],
  } as const
  const [bg, fg, bd] = map[tone]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px',
      borderRadius: 6, fontSize: 11, fontWeight: 600, background: bg, color: fg,
      border: `1px solid ${bd}`, whiteSpace: 'nowrap',
    }}>{children}</span>
  )
}

function CrewCard({ c, onRequest }: { c: CrewProfile; onRequest: (c: CrewProfile) => void }) {
  const [hover, setHover] = useState(false)
  const avail = availabilityLabel(c.availableFrom)

  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        background: C.panel, borderRadius: 10, padding: 18,
        border: `1px solid ${hover ? C.accentBorder : C.border}`,
        transition: 'border-color .2s', display: 'flex', flexDirection: 'column',
      }}>

      <div style={{ display: 'flex', gap: 13, marginBottom: 14 }}>
        <div style={{
          width: 46, height: 46, borderRadius: 10, flexShrink: 0,
          background: 'linear-gradient(135deg, color-mix(in srgb, var(--x-orange) 18%, transparent), color-mix(in srgb, var(--x-amber) 10%, transparent))',
          border: `1px solid ${C.accentBorder}`, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontFamily: display, fontWeight: 700, fontSize: 15, color: C.accent,
        }}>{c.initials}</div>

        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text, fontFamily: display, lineHeight: 1.3 }}>
            {c.displayName}
          </div>
          <div style={{ fontSize: 12.5, color: C.accent, fontWeight: 600, marginTop: 2 }}>
            {c.role} · {c.yearsExperience} yrs
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: C.muted, marginTop: 4 }}>
            <MapPin size={11} style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.basedIn}</span>
          </div>
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        padding: '10px 12px', borderRadius: 10, marginBottom: 13,
        background: avail.tone === 'now' ? 'color-mix(in srgb, var(--x-green) 7%, transparent)' : 'rgba(var(--x-ov),0.025)',
        border: `1px solid ${avail.tone === 'now' ? 'color-mix(in srgb, var(--x-green) 18%, transparent)' : C.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <CalendarDays size={13} style={{ color: avail.tone === 'now' ? C.green : C.dim, flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: avail.tone === 'now' ? C.green : C.text }}>
            {avail.text}
          </span>
        </div>
        <span style={{ fontSize: 10.5, color: C.faint }}>{freshness(c.lastConfirmed)}</span>
      </div>

      {c.verifiedMetres !== null ? (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 9, padding: '11px 12px',
          borderRadius: 10, marginBottom: 13,
          background: 'color-mix(in srgb, var(--x-orange) 5%, transparent)', border: '1px solid color-mix(in srgb, var(--x-orange) 16%, transparent)',
        }}>
          <ShieldCheck size={15} style={{ color: C.accent, flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 12.5, color: C.accent, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {c.verifiedMetres.toLocaleString()} m verified
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2, lineHeight: 1.45 }}>
              Logged on XPLORIX rigs, {c.verifiedPeriod}
            </div>
          </div>
        </div>
      ) : (
        <div style={{
          padding: '11px 12px', borderRadius: 10, marginBottom: 13, fontSize: 11.5,
          color: C.muted, background: 'rgba(var(--x-ov),0.02)', border: `1px solid ${C.border}`, lineHeight: 1.45,
        }}>
          Experience self-reported — no XPLORIX-logged production on record.
        </div>
      )}

      <div style={{ marginBottom: 11 }}>
        <div style={{ fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.faint, fontWeight: 700, marginBottom: 7 }}>
          Rig experience
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {c.rigFamilies.map((r) => <Pill key={r}>{r}</Pill>)}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 13 }}>
        <Pill><RotateCw size={10} />{c.rotationPrefs.join(', ')}</Pill>
        {c.passportValid && <Pill tone="green"><Plane size={10} />Passport valid</Pill>}
      </div>

      <p style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.6, margin: '0 0 15px' }}>{c.summary}</p>

      <button onClick={() => onRequest(c)} style={{
        marginTop: 'auto', width: '100%', padding: '10px', borderRadius: 10, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
        background: hover ? 'linear-gradient(135deg,var(--x-orange),var(--x-orange-d))' : C.accentSoft,
        color: hover ? '#fff' : C.accent,
        border: `1px solid ${hover ? 'transparent' : C.accentBorder}`, transition: 'all .2s',
      }}>
        <Send size={13} /> Request contact
      </button>
    </div>
  )
}

function JobRow({ j }: { j: JobPosting }) {
  const [hover, setHover] = useState(false)
  const tone = j.status === 'Live' ? 'green' : j.status === 'Draft' ? 'amber' : 'neutral'

  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        background: C.panel, borderRadius: 10, padding: 18,
        border: `1px solid ${hover ? C.accentBorder : C.border}`,
        transition: 'border-color .2s', display: 'grid',
        gridTemplateColumns: 'minmax(0,1fr) auto', gap: 20, alignItems: 'center',
      }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8, flexWrap: 'wrap' }}>
          <Pill tone={tone as 'green' | 'amber' | 'neutral'}>{j.status}</Pill>
          <span style={{ fontSize: 11.5, color: C.faint }}>
            {j.status === 'Draft' ? 'Not published' : `Posted ${j.postedDaysAgo}d ago`}
          </span>
          {j.positions > 1 && <span style={{ fontSize: 11.5, color: C.muted }}>· {j.positions} positions</span>}
        </div>

        <div style={{ fontSize: 16, fontWeight: 600, color: C.text, fontFamily: display, marginBottom: 9 }}>
          {j.title}
        </div>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: C.muted, marginBottom: 11 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><MapPin size={12} />{j.location}, {j.country}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><RotateCw size={12} />{j.rotation}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Clock size={12} />{j.experienceYears}+ yrs</span>
          <span style={{ color: C.dim, fontWeight: 600 }}>{j.salaryRange}</span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {j.rigFamilies.map((r) => <Pill key={r}>{r}</Pill>)}
          {j.certifications.slice(0, 2).map((c) => <Pill key={c}>{c}</Pill>)}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: C.text, ...num, fontVariantNumeric: 'tabular-nums' }}>
            {j.applicants}
          </div>
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>
            Applicants
          </div>
          {j.newApplicants > 0 && (
            <div style={{ fontSize: 10.5, color: C.accent, fontWeight: 700, marginTop: 3 }}>
              {j.newApplicants} new
            </div>
          )}
        </div>

        <div style={{ textAlign: 'right', paddingLeft: 22, borderLeft: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: C.accent, ...num, fontVariantNumeric: 'tabular-nums' }}>
            {j.poolMatches}
          </div>
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>
            Pool matches
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, fontSize: 11.5, color: C.faint, alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Eye size={12} />{j.views}</span>
          <ChevronRight size={16} style={{ color: C.muted }} />
        </div>
      </div>
    </div>
  )
}

/* ================================================================== *
 * Page
 * ================================================================== */
export default function CrewPage() {
  const [tab, setTab] = useState<'pool' | 'jobs'>('pool')
  const [query, setQuery] = useState('')
  const [roles, setRoles] = useState<string[]>([])
  const [rotations, setRotations] = useState<string[]>([])
  const [rigs, setRigs] = useState<string[]>([])
  const [certs, setCerts] = useState<string[]>([])
  const [windowDays, setWindowDays] = useState(9999)
  const [verifiedOnly, setVerifiedOnly] = useState(false)
  const [passportOnly, setPassportOnly] = useState(false)
  const [sort, setSort] = useState('available')
  const [railOpen, setRailOpen] = useState(false)
  const [contactFor, setContactFor] = useState<CrewProfile | null>(null)
  const [showPost, setShowPost] = useState(false)

  const toggle = (arr: string[], v: string, set: (a: string[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

  const daysOut = (iso: string) =>
    (new Date(iso).getTime() - new Date('2026-10-17').getTime()) / 86_400_000

  const crew = useMemo(() => {
    const q = query.trim().toLowerCase()
    const out = CREW.filter((c) => {
      if (roles.length && !roles.includes(c.role)) return false
      if (rotations.length && !c.rotationPrefs.some((r) => rotations.includes(r))) return false
      if (rigs.length && !c.rigFamilies.some((r) => rigs.includes(r))) return false
      if (certs.length && !certs.every((r) => c.certifications.includes(r))) return false
      if (verifiedOnly && c.verifiedMetres === null) return false
      if (passportOnly && !c.passportValid) return false
      if (daysOut(c.availableFrom) > windowDays) return false
      if (q) {
        const hay = `${c.displayName} ${c.role} ${c.basedIn} ${c.nationality} ${c.rigFamilies.join(' ')} ${c.summary}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    if (sort === 'available') out.sort((a, b) => +new Date(a.availableFrom) - +new Date(b.availableFrom))
    if (sort === 'experience') out.sort((a, b) => b.yearsExperience - a.yearsExperience)
    if (sort === 'verified') out.sort((a, b) => (b.verifiedMetres ?? -1) - (a.verifiedMetres ?? -1))
    return out
  }, [query, roles, rotations, rigs, certs, windowDays, verifiedOnly, passportOnly, sort])

  /* counts reflect the other active filters, so a zero tells you it is
     genuinely empty rather than just unselected */
  const countBy = (pred: (c: CrewProfile) => boolean) =>
    CREW.filter((c) => daysOut(c.availableFrom) <= windowDays && pred(c)).length

  const chips: { label: string; clear: () => void }[] = [
    ...(windowDays !== 9999 ? [{
      label: `Within ${WINDOWS.find(([, d]) => d === windowDays)?.[0]}`,
      clear: () => setWindowDays(9999),
    }] : []),
    ...roles.map((r) => ({ label: r, clear: () => toggle(roles, r, setRoles) })),
    ...rotations.map((r) => ({ label: r, clear: () => toggle(rotations, r, setRotations) })),
    ...rigs.map((r) => ({ label: r, clear: () => toggle(rigs, r, setRigs) })),
    ...certs.map((r) => ({ label: r, clear: () => toggle(certs, r, setCerts) })),
    ...(verifiedOnly ? [{ label: 'XPLORIX verified', clear: () => setVerifiedOnly(false) }] : []),
    ...(passportOnly ? [{ label: 'Passport valid', clear: () => setPassportOnly(false) }] : []),
  ]

  const clearAll = () => {
    setRoles([]); setRotations([]); setRigs([]); setCerts([])
    setWindowDays(9999); setVerifiedOnly(false); setPassportOnly(false); setQuery('')
  }

  return (
    <div style={{ maxWidth: 2000 }}>

      {/* ---------- header ---------- */}
      <div style={{
        position: 'relative', overflow: 'hidden', borderRadius: 10, padding: '26px 30px',
        background: `linear-gradient(135deg, ${C.panelHi} 0%, ${C.bg} 70%)`,
        border: `1px solid ${C.border}`, marginBottom: 20,
      }}>
        <div aria-hidden style={{
          position: 'absolute', inset: 0, opacity: 0.5,
          backgroundImage: 'repeating-linear-gradient(115deg, color-mix(in srgb, var(--x-muted) 4.5%, transparent) 0 1px, transparent 1px 14px)',
        }} />
        <div aria-hidden style={{
          position: 'absolute', right: -80, top: -90, width: 320, height: 320, borderRadius: 50,
          transform: 'rotate(15deg)', background: 'linear-gradient(135deg, color-mix(in srgb, var(--x-orange) 12%, transparent), transparent 60%)',
        }} />

        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 10.5, letterSpacing: '0.24em', textTransform: 'uppercase', color: C.accent, fontWeight: 700, marginBottom: 9 }}>
              XPLORIX Crew
            </div>
            <h1 style={{ fontSize: 27, fontWeight: 700, color: C.text, fontFamily: display, letterSpacing: '-0.03em', margin: '0 0 8px', lineHeight: 1.15, maxWidth: 520 }}>
              Crew who can run your rig from day one
            </h1>
            <p style={{ fontSize: 13.5, color: C.muted, margin: 0, maxWidth: 470, lineHeight: 1.6 }}>
              Matched on rig experience, rotation and availability date. Production verified
              against rigs logged on XPLORIX.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 26, flexWrap: 'wrap' }}>
            {[
              [CREW_STATS.available, 'In pool', C.text],
              [CREW_STATS.verified, 'Verified', C.accent],
              [CREW_STATS.liveJobs, 'Live jobs', C.text],
              [CREW_STATS.newApplicants, 'New applicants', C.green],
            ].map(([v, k, col]) => (
              <div key={String(k)}>
                <div style={{ fontSize: 21, fontWeight: 600, color: col as string, ...num, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                  {v}
                </div>
                <div style={{ fontSize: 10, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600, marginTop: 2 }}>
                  {k}
                </div>
              </div>
            ))}
            <button onClick={() => setShowPost(true)} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '11px 20px', borderRadius: 11,
              background: 'linear-gradient(135deg,var(--x-orange),var(--x-orange-d))', color: '#fff', border: 'none',
              fontWeight: 700, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: '0 4px 20px color-mix(in srgb, var(--x-orange) 30%, transparent)', whiteSpace: 'nowrap',
            }}>
              <Plus size={16} /> Post a job
            </button>
          </div>
        </div>
      </div>

      {/* ---------- tabs ---------- */}
      <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 10, background: 'rgba(var(--x-ov),0.03)', border: `1px solid ${C.border}`, width: 'fit-content', marginBottom: 20 }}>
        {([['pool', 'Availability pool', Users], ['jobs', 'My job postings', Briefcase]] as const).map(([id, label, Icon]) => {
          const on = tab === id
          return (
            <button key={id} onClick={() => setTab(id)} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 9,
              cursor: 'pointer', border: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
              background: on ? C.accentDim : 'transparent', color: on ? C.accent : C.muted,
            }}><Icon size={15} />{label}</button>
          )
        })}
      </div>

      {/* ============ POOL ============ */}
      {tab === 'pool' && (
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>

          {/* ---- rail ---- */}
          <aside className={railOpen ? 'xpc-rail xpc-rail-open' : 'xpc-rail'}
            style={{
              width: 252, flexShrink: 0, position: 'sticky', top: 88,
              maxHeight: 'calc(100vh - 110px)', overflowY: 'auto',
              background: C.panel, border: `1px solid ${C.border}`,
              borderRadius: 10, padding: '4px 14px 14px', scrollbarWidth: 'thin',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0 0' }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text, fontFamily: display }}>Filters</span>
              {chips.length > 0 && (
                <button onClick={clearAll} style={{
                  background: 'none', border: 'none', color: C.accent, fontSize: 11.5,
                  fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}>Reset</button>
              )}
            </div>

            {/* availability is the hard constraint, so it leads and never collapses */}
            <div style={{ borderBottom: `1px solid ${C.border}`, padding: '14px 0' }}>
              <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.dim, fontWeight: 700, marginBottom: 10 }}>
                Available within
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 5 }}>
                {WINDOWS.map(([label, d]) => {
                  const on = windowDays === d
                  return (
                    <button key={label} onClick={() => setWindowDays(d)} style={{
                      padding: '7px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
                      fontWeight: 600, fontFamily: 'inherit',
                      background: on ? C.accentDim : 'rgba(var(--x-ov),0.03)',
                      border: `1px solid ${on ? C.accentBorder : C.border}`,
                      color: on ? C.accent : C.dim,
                    }}>{label}</button>
                  )
                })}
              </div>
            </div>

            <RailSection title="Role" count={roles.length}>
              <CollapsibleChecks
                options={CREW_ROLES as unknown as string[]}
                selected={roles}
                onToggle={(v) => toggle(roles, v, setRoles)}
                counts={(v) => countBy((c) => c.role === v)}
              />
            </RailSection>

            <RailSection title="Rig experience" count={rigs.length}>
              <CollapsibleChecks
                options={RIG_FAMILIES}
                selected={rigs}
                onToggle={(v) => toggle(rigs, v, setRigs)}
                counts={(v) => countBy((c) => c.rigFamilies.includes(v))}
              />
            </RailSection>

            <RailSection title="Rotation" count={rotations.length} defaultOpen={false}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, padding: '0 8px' }}>
                {ROTATIONS.map((r) => {
                  const on = rotations.includes(r)
                  return (
                    <button key={r} onClick={() => toggle(rotations, r, setRotations)} style={{
                      padding: '5px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 11.5,
                      fontWeight: 600, fontFamily: 'inherit',
                      background: on ? C.accentDim : 'rgba(var(--x-ov),0.03)',
                      border: `1px solid ${on ? C.accentBorder : C.border}`, color: on ? C.accent : C.dim,
                    }}>{r}</button>
                  )
                })}
              </div>
            </RailSection>

            <RailSection title="Certifications" count={certs.length} defaultOpen={false}>
              <CollapsibleChecks
                options={CERTIFICATIONS}
                selected={certs}
                onToggle={(v) => toggle(certs, v, setCerts)}
                counts={(v) => countBy((c) => c.certifications.includes(v))}
                initial={4}
              />
              <div style={{ fontSize: 10.5, color: C.faint, padding: '6px 8px 0', lineHeight: 1.5 }}>
                All selected certifications must be held.
              </div>
            </RailSection>

            <RailSection title="Record">
              <Check label="XPLORIX-verified production" on={verifiedOnly}
                sub="Metreage logged on platform rigs"
                count={countBy((c) => c.verifiedMetres !== null)}
                onClick={() => setVerifiedOnly(!verifiedOnly)} />
              <Check label="Valid passport" on={passportOnly}
                sub="Can mobilise internationally"
                count={countBy((c) => c.passportValid)}
                onClick={() => setPassportOnly(!passportOnly)} />
            </RailSection>
          </aside>

          {/* ---- results ---- */}
          <div style={{ flex: 1, minWidth: 0 }}>

            {/* search */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '12px 15px',
              borderRadius: 10, marginBottom: 14,
              background: 'rgba(var(--x-ov),0.03)', border: `1px solid ${C.border}`,
            }}>
              <Search size={16} style={{ color: C.muted, flexShrink: 0 }} />
              <input value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, location or experience — LF90, Copperbelt, DTH"
                style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: C.text, fontSize: 13.5, fontFamily: 'inherit', minWidth: 0 }} />
              {query && (
                <button onClick={() => setQuery('')} aria-label="Clear search"
                  style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', display: 'flex' }}>
                  <X size={15} />
                </button>
              )}
            </div>

            {/* toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={() => setRailOpen(!railOpen)} className="xpc-rail-toggle"
                  style={{
                    display: 'none', alignItems: 'center', gap: 7, padding: '9px 14px', borderRadius: 10,
                    background: chips.length ? C.accentDim : 'rgba(var(--x-ov),0.03)',
                    border: `1px solid ${chips.length ? C.accentBorder : C.border}`,
                    color: chips.length ? C.accent : C.dim, fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                  <SlidersHorizontal size={15} /> Filters{chips.length ? ` (${chips.length})` : ''}
                </button>
                <div style={{ fontSize: 13, color: C.muted }}>
                  <strong style={{ color: C.text, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{crew.length}</strong>
                  {' '}{crew.length === 1 ? 'person' : 'people'} available
                </div>
              </div>

              <select value={sort} onChange={(e) => setSort(e.target.value)}
                style={{
                  padding: '9px 12px', borderRadius: 10, background: 'rgba(var(--x-ov),0.03)',
                  border: `1px solid ${C.border}`, color: C.dim, fontSize: 12.5,
                  fontFamily: 'inherit', cursor: 'pointer', outline: 'none', fontWeight: 600,
                }}>
                <option value="available">Earliest available</option>
                <option value="experience">Most experience</option>
                <option value="verified">Most verified metres</option>
              </select>
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

            {crew.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                {crew.map((c) => <CrewCard key={c.id} c={c} onRequest={setContactFor} />)}
              </div>
            ) : (
              <div style={{ padding: '56px 24px', textAlign: 'center', borderRadius: 10, background: C.panel, border: `1px dashed ${C.border}` }}>
                <div style={{
                  width: 46, height: 46, borderRadius: 10, margin: '0 auto 16px',
                  background: 'rgba(var(--x-ov),0.04)', border: `1px solid ${C.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}><Users size={20} style={{ color: C.muted }} /></div>
                <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 6, fontFamily: display }}>
                  Nobody matches those constraints
                </div>
                <p style={{ fontSize: 13, color: C.muted, maxWidth: 360, margin: '0 auto 18px', lineHeight: 1.6 }}>
                  Widen the availability window or drop a rig family. You can also post the job —
                  matched crew are notified automatically.
                </p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button onClick={clearAll} style={{
                    padding: '9px 18px', borderRadius: 10, cursor: 'pointer', background: 'rgba(var(--x-ov),0.03)',
                    border: `1px solid ${C.border}`, color: C.dim, fontWeight: 600, fontSize: 13, fontFamily: 'inherit',
                  }}>Reset filters</button>
                  <button onClick={() => setShowPost(true)} style={{
                    padding: '9px 18px', borderRadius: 10, cursor: 'pointer', background: C.accentSoft,
                    border: `1px solid ${C.accentBorder}`, color: C.accent, fontWeight: 600, fontSize: 13, fontFamily: 'inherit',
                  }}>Post a job</button>
                </div>
              </div>
            )}

            <div style={{
              marginTop: 22, padding: 15, borderRadius: 10, fontSize: 12, color: C.muted,
              background: 'rgba(var(--x-ov),0.02)', border: `1px solid ${C.border}`, lineHeight: 1.65,
            }}>
              Everyone here has opted in to being visible and confirmed their availability within
              the last 30 days. Contact details are released only after the person accepts your request.
            </div>
          </div>
        </div>
      )}

      {/* ============ JOBS ============ */}
      {tab === 'jobs' && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {JOBS.map((j) => <JobRow key={j.id} j={j} />)}
          </div>
          <button onClick={() => setShowPost(true)} style={{
            width: '100%', marginTop: 14, padding: '16px', borderRadius: 10, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
            background: 'transparent', border: `1px dashed ${C.border}`, color: C.muted,
            fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit',
          }}>
            <Plus size={16} /> Post another job
          </button>
        </>
      )}

      {contactFor && <ContactModal c={contactFor} onClose={() => setContactFor(null)} />}
      {showPost && <PostJobModal onClose={() => setShowPost(false)} />}

      <style>{`
        @media (max-width: 1024px) {
          .xpc-rail { display: none; }
          .xpc-rail-open {
            display: block !important; position: fixed !important; inset: 64px 0 0 auto !important;
            width: 300px !important; z-index: 60; border-radius: 0 !important;
            max-height: none !important; height: calc(100vh - 64px) !important;
          }
          .xpc-rail-toggle { display: flex !important; }
        }
      `}</style>
    </div>
  )
}

/* ================================================================== *
 * Modals
 * ================================================================== */
const shell: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 100, padding: 20,
  background: 'rgba(var(--x-shadow),0.74)', backdropFilter: 'blur(6px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
const field: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 9,
  background: 'rgba(var(--x-ov),0.03)', border: `1px solid ${C.border}`,
  color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none',
}
const flabel: React.CSSProperties = {
  fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
  color: C.muted, fontWeight: 700, marginBottom: 6, display: 'block',
}

function ContactModal({ c, onClose }: { c: CrewProfile; onClose: () => void }) {
  const [sent, setSent] = useState(false)
  return (
    <div onClick={onClose} style={shell}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 480, background: C.panel,
        border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden',
      }}>
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.text, fontFamily: display }}>
              {sent ? 'Request sent' : 'Request contact'}
            </div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>{c.displayName} · {c.role}</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', display: 'flex', height: 'fit-content' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 22 }}>
          {sent ? (
            <p style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.7, margin: 0 }}>
              {c.displayName} has been notified. If they accept, their phone number and full name
              are released to you and the conversation moves off XPLORIX. You will get a
              notification either way, usually within 48 hours.
            </p>
          ) : (
            <>
              <div style={{ padding: 14, borderRadius: 11, marginBottom: 18, background: 'color-mix(in srgb, var(--x-orange) 5%, transparent)', border: '1px solid color-mix(in srgb, var(--x-orange) 14%, transparent)' }}>
                <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.accent, fontWeight: 700, marginBottom: 10 }}>
                  They will see
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
                  {[['Company', 'Apex Drilling Solutions'], ['Active rigs', '14'], ['Country', 'Saudi Arabia'], ['Contact', 'Admin User']].map(([k, v]) => (
                    <div key={k}>
                      <div style={{ fontSize: 10, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>{k}</div>
                      <div style={{ fontSize: 13, color: C.text, fontWeight: 600, marginTop: 2 }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={flabel}>Which role is this for</label>
                <select style={{ ...field, cursor: 'pointer' }}>
                  {JOBS.filter((j) => j.status === 'Live').map((j) => <option key={j.id}>{j.title}</option>)}
                  <option>Not linked to a posting</option>
                </select>
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={flabel}>Message</label>
                <textarea style={{ ...field, minHeight: 88, resize: 'vertical' }}
                  placeholder="Site, start date and what the rotation looks like." />
              </div>

              <button onClick={() => setSent(true)} style={{
                width: '100%', padding: 12, borderRadius: 10, cursor: 'pointer',
                background: 'linear-gradient(135deg,var(--x-orange),var(--x-orange-d))', color: '#fff',
                border: 'none', fontWeight: 700, fontSize: 14, fontFamily: 'inherit',
              }}>Send request</button>

              <p style={{ fontSize: 11.5, color: C.faint, textAlign: 'center', margin: '12px 0 0', lineHeight: 1.5 }}>
                Contact details are released only if they accept.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function PostJobModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(1)
  const [rigs, setRigs] = useState<string[]>([])
  const [certs, setCerts] = useState<string[]>([])
  const toggle = (arr: string[], v: string, set: (a: string[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

  return (
    <div onClick={onClose} style={shell}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 580, maxHeight: '88vh', overflowY: 'auto',
        background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10,
      }}>
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', gap: 12, position: 'sticky', top: 0, background: C.panel, zIndex: 1 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.text, fontFamily: display }}>
              {step === 3 ? 'Job posted' : 'Post a job'}
            </div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>
              {step === 3 ? 'Live on XPLORIX Crew' : `Step ${step} of 2`}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', display: 'flex', height: 'fit-content' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 22 }}>
          {step === 1 && (
            <>
              <div style={{ marginBottom: 14 }}>
                <label style={flabel}>Job title</label>
                <input style={field} placeholder="Senior driller — surface diamond core" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={flabel}>Role</label>
                  <select style={{ ...field, cursor: 'pointer' }}>
                    {CREW_ROLES.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label style={flabel}>Positions</label>
                  <input style={field} defaultValue="1" inputMode="numeric" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={flabel}>Site location</label>
                  <input style={field} placeholder="Mahd adh Dhahab, Al Madinah" />
                </div>
                <div>
                  <label style={flabel}>Rotation</label>
                  <select style={{ ...field, cursor: 'pointer' }}>
                    {ROTATIONS.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                <div>
                  <label style={flabel}>Start date</label>
                  <input style={field} type="date" />
                </div>
                <div>
                  <label style={flabel}>Minimum experience</label>
                  <input style={field} placeholder="8 years" />
                </div>
              </div>
              <button onClick={() => setStep(2)} style={{
                width: '100%', padding: 12, borderRadius: 10, cursor: 'pointer',
                background: 'linear-gradient(135deg,var(--x-orange),var(--x-orange-d))', color: '#fff',
                border: 'none', fontWeight: 700, fontSize: 14, fontFamily: 'inherit',
              }}>Continue</button>
            </>
          )}

          {step === 2 && (
            <>
              <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6, margin: '0 0 18px' }}>
                Rig experience is what the matching runs on. Pick every family the person could
                step onto — being too narrow here is the main reason a posting gets no matches.
              </p>

              <div style={{ marginBottom: 18 }}>
                <label style={flabel}>Rig experience required</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {RIG_FAMILIES.map((r) => {
                    const on = rigs.includes(r)
                    return (
                      <button key={r} onClick={() => toggle(rigs, r, setRigs)} style={{
                        padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
                        fontWeight: 600, fontFamily: 'inherit',
                        background: on ? C.accentDim : 'rgba(var(--x-ov),0.03)',
                        border: `1px solid ${on ? C.accentBorder : C.border}`, color: on ? C.accent : C.dim,
                      }}>{r}</button>
                    )
                  })}
                </div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={flabel}>Certifications required</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {CERTIFICATIONS.map((c) => {
                    const on = certs.includes(c)
                    return (
                      <button key={c} onClick={() => toggle(certs, c, setCerts)} style={{
                        padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
                        fontWeight: 600, fontFamily: 'inherit',
                        background: on ? C.accentDim : 'rgba(var(--x-ov),0.03)',
                        border: `1px solid ${on ? C.accentBorder : C.border}`, color: on ? C.accent : C.dim,
                      }}>{c}</button>
                    )
                  })}
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={flabel}>Salary range</label>
                <input style={field} placeholder="SAR 9,000 – 12,000 / month" />
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={flabel}>Description</label>
                <textarea style={{ ...field, minHeight: 100, resize: 'vertical' }}
                  placeholder="What the programme is, depth and hole sizes, crew size, camp arrangements." />
              </div>

              {rigs.length > 0 && (
                <div style={{
                  padding: 13, borderRadius: 11, marginBottom: 18, display: 'flex', gap: 10,
                  background: 'color-mix(in srgb, var(--x-orange) 5%, transparent)', border: '1px solid color-mix(in srgb, var(--x-orange) 14%, transparent)',
                }}>
                  <Users size={16} style={{ color: C.accent, flexShrink: 0, marginTop: 1 }} />
                  <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.55 }}>
                    <strong style={{ color: C.accent, fontWeight: 700 }}>
                      {CREW.filter((c) => c.rigFamilies.some((r) => rigs.includes(r))).length} people
                    </strong>{' '}
                    in the availability pool match this rig experience. They are notified when you publish.
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setStep(1)} style={{
                  padding: '12px 20px', borderRadius: 10, cursor: 'pointer',
                  background: 'rgba(var(--x-ov),0.03)', border: `1px solid ${C.border}`,
                  color: C.dim, fontWeight: 600, fontSize: 13.5, fontFamily: 'inherit',
                }}>Back</button>
                <button onClick={() => setStep(3)} style={{
                  flex: 1, padding: 12, borderRadius: 10, cursor: 'pointer',
                  background: 'linear-gradient(135deg,var(--x-orange),var(--x-orange-d))', color: '#fff',
                  border: 'none', fontWeight: 700, fontSize: 14, fontFamily: 'inherit',
                }}>Publish job</button>
              </div>
            </>
          )}

          {step === 3 && (
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <div style={{
                width: 48, height: 48, borderRadius: 10, margin: '0 auto 16px',
                background: 'color-mix(in srgb, var(--x-green) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--x-green) 25%, transparent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}><BadgeCheck size={23} style={{ color: C.green }} /></div>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 8, fontFamily: display }}>
                Your job is live
              </div>
              <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.65, maxWidth: 380, margin: '0 auto 20px' }}>
                It is published at xplorixtech.com/jobs and matched crew have been notified.
                Applications appear under My job postings.
              </p>
              <button onClick={onClose} style={{
                padding: '10px 22px', borderRadius: 10, cursor: 'pointer',
                background: 'linear-gradient(135deg,var(--x-orange),var(--x-orange-d))', color: '#fff',
                border: 'none', fontWeight: 700, fontSize: 13.5, fontFamily: 'inherit',
              }}>Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
