'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { ArrowRight, BadgeCheck, ChevronLeft, ChevronRight, Pause, Play, Check } from 'lucide-react'
import {
  carouselSlides, pickCampaign, trackCampaign, SLIDE_DURATION,
  type Campaign,
} from './billboards'
import { hexA } from '../../../lib/theme'

const C = {
  panel: 'var(--x-card)', panelHi: 'var(--x-raised)', border: 'var(--x-border)',
  text: 'var(--x-text)', dim: 'var(--x-muted)', muted: 'var(--x-faint)', faint: 'var(--x-dim)',
  green: 'var(--x-green)', accent: 'var(--x-orange)',
}
const display = "'Space Grotesk', sans-serif"

/* ================================================================== *
 * Big auto-sliding billboard
 * ================================================================== */
export default function BillboardCarousel() {
  const slides = useRef<Campaign[]>(carouselSlides()).current
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  const go = useCallback((n: number) => {
    setIndex(((n % slides.length) + slides.length) % slides.length)
  }, [slides.length])

  // auto-advance
  useEffect(() => {
    if (paused || reduced || slides.length < 2) return
    const t = setTimeout(() => go(index + 1), SLIDE_DURATION * 1000)
    return () => clearTimeout(t)
  }, [index, paused, reduced, slides.length, go])

  // one impression per slide view
  useEffect(() => {
    const c = slides[index]
    if (c) trackCampaign(c.id, 'impression', index)
  }, [index, slides])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1) }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1) }
  }

  const autoplaying = !paused && !reduced && slides.length > 1

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Supplier advertising"
      tabIndex={0}
      onKeyDown={onKey}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="xpb-root"
      style={{
        position: 'relative', borderRadius: 18, overflow: 'hidden',
        border: `1px solid ${C.border}`, background: C.panel,
        marginBottom: 20, outline: 'none',
      }}
    >
      {/* track */}
      <div style={{
        display: 'flex',
        transform: `translateX(-${index * 100}%)`,
        transition: reduced ? 'none' : 'transform .62s cubic-bezier(.4,0,.2,1)',
      }}>
        {slides.map((c, i) => (
          <Slide key={c.id} c={c} active={i === index} />
        ))}
      </div>

      {/* arrows */}
      {slides.length > 1 && (
        <>
          <Arrow side="left" onClick={() => go(index - 1)} />
          <Arrow side="right" onClick={() => go(index + 1)} />
        </>
      )}

      {/* controls */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 16, padding: '0 24px 18px', pointerEvents: 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'auto' }}>
          {slides.map((c, i) => {
            const on = i === index
            return (
              <button
                key={c.id}
                onClick={() => go(i)}
                aria-label={`Slide ${i + 1} of ${slides.length} — ${c.partnerName}`}
                aria-current={on}
                style={{
                  height: 4, width: on ? 44 : 16, borderRadius: 2, border: 'none',
                  cursor: 'pointer', padding: 0, overflow: 'hidden',
                  background: on ? 'rgba(var(--x-ov),0.16)' : 'rgba(var(--x-ov),0.16)',
                  transition: 'width .35s ease',
                }}
              >
                {on && (
                  <span
                    key={`${index}-${paused}-${reduced}`}
                    className={autoplaying ? 'xpb-fill' : undefined}
                    style={{
                      display: 'block', height: '100%', borderRadius: 2,
                      background: c.accent,
                      width: autoplaying ? undefined : '100%',
                    }}
                  />
                )}
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, pointerEvents: 'auto' }}>
          <span style={{
            fontSize: 11, color: C.muted, fontVariantNumeric: 'tabular-nums',
            fontWeight: 600, letterSpacing: '0.06em',
          }}>
            {String(index + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
          </span>
          <button
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? 'Resume rotation' : 'Pause rotation'}
            style={{
              width: 28, height: 28, borderRadius: 8, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'color-mix(in srgb, var(--x-bg) 60%, transparent)', border: `1px solid ${C.border}`,
              color: C.muted, backdropFilter: 'blur(6px)',
            }}
          >
            {paused ? <Play size={12} /> : <Pause size={12} />}
          </button>
        </div>
      </div>

      <style>{`
        .xpb-root:focus-visible { border-color: ${C.accent}; }
        @keyframes xpbFill { from { width: 0% } to { width: 100% } }
        .xpb-fill { animation: xpbFill ${SLIDE_DURATION}s linear forwards; }
        @media (max-width: 900px) {
          .xpb-slide { padding: 26px 24px 62px !important; }
          .xpb-mark { display: none !important; }
          .xpb-head { font-size: 24px !important; }
          .xpb-points { display: none !important; }
        }
        @media (max-width: 560px) {
          .xpb-arrow { display: none !important; }
          .xpb-slide { padding: 22px 20px 58px !important; }
          .xpb-head { font-size: 20px !important; }
        }
      `}</style>
    </section>
  )
}

function Slide({ c, active }: { c: Campaign; active: boolean }) {
  const [hover, setHover] = useState(false)
  const house = c.tier === 'House'

  return (
    <div
      aria-hidden={!active}
      className="xpb-slide"
      style={{
        flex: '0 0 100%', minWidth: 0, position: 'relative', overflow: 'hidden',
        minHeight: 352, padding: '38px 44px 66px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 40,
        background: `linear-gradient(125deg, ${C.panelHi} 0%, var(--x-bg) 68%)`,
      }}
    >
      {/* backdrop */}
      {c.imageUrl && (
        <div aria-hidden style={{
          position: 'absolute', inset: 0, backgroundImage: `url(${c.imageUrl})`,
          backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.22,
        }} />
      )}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, opacity: 0.5,
        backgroundImage: 'repeating-linear-gradient(115deg, color-mix(in srgb, var(--x-muted) 5%, transparent) 0 1px, transparent 1px 13px)',
      }} />
      <div aria-hidden style={{
        position: 'absolute', right: -90, top: -110, width: 460, height: 460,
        borderRadius: 70, transform: 'rotate(15deg)',
        background: `linear-gradient(135deg, ${hexA(c.accent, 0x26)}, transparent 62%)`,
      }} />
      <div aria-hidden style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
        background: c.accent, opacity: 0.9,
      }} />

      {/* copy */}
      <div style={{ position: 'relative', maxWidth: 620, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: 5,
            fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase',
            background: 'rgba(var(--x-ov),0.05)', border: `1px solid ${C.border}`, color: C.muted,
          }}>
            {house ? 'From XPLORIX' : 'Sponsored'}
          </span>
          {!house && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: C.dim }}>
              {c.verified && <BadgeCheck size={13} style={{ color: C.green }} />}
              {c.partnerName}
              <span style={{ color: C.faint }}>· {c.partnerCountry}</span>
            </span>
          )}
        </div>

        <div style={{
          fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase',
          color: c.accent, fontWeight: 700, marginBottom: 12,
        }}>{c.eyebrow}</div>

        <h2 className="xpb-head" style={{
          fontSize: 33, fontWeight: 700, color: C.text, fontFamily: display,
          letterSpacing: '-0.03em', lineHeight: 1.13, margin: '0 0 14px',
        }}>{c.headline}</h2>

        <p style={{ fontSize: 14.5, color: C.dim, lineHeight: 1.65, margin: '0 0 20px', maxWidth: 520 }}>
          {c.subline}
        </p>

        {c.points.length > 0 && (
          <div className="xpb-points" style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 24 }}>
            {c.points.map((p) => (
              <span key={p} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: C.dim }}>
                <Check size={13} style={{ color: c.accent, flexShrink: 0 }} />{p}
              </span>
            ))}
          </div>
        )}

        <Link
          href={c.href}
          onClick={() => trackCampaign(c.id, 'click')}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 9, padding: '12px 22px',
            borderRadius: 11, fontSize: 13.5, fontWeight: 700, textDecoration: 'none',
            background: hover ? c.accent : `${hexA(c.accent, 0x1F)}`,
            color: hover ? '#08111A' : c.accent,
            border: `1px solid ${hover ? c.accent : `${hexA(c.accent, 0x55)}`}`,
            transition: 'all .2s',
          }}
        >
          {c.ctaLabel}
          <ArrowRight size={15} style={{ transform: hover ? 'translateX(3px)' : 'none', transition: 'transform .2s' }} />
        </Link>
      </div>

      {/* brand mark */}
      <div className="xpb-mark" style={{ position: 'relative', flexShrink: 0, textAlign: 'right' }}>
        <div style={{
          fontSize: 92, fontWeight: 700, fontFamily: display, letterSpacing: '-0.05em',
          lineHeight: 1, color: `${hexA(c.accent, 0x1A)}`,
        }}>{c.brandMark}</div>
      </div>
    </div>
  )
}

function Arrow({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  const [hover, setHover] = useState(false)
  const Icon = side === 'left' ? ChevronLeft : ChevronRight
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label={side === 'left' ? 'Previous advert' : 'Next advert'}
      className="xpb-arrow"
      style={{
        position: 'absolute', top: '50%', [side]: 16, transform: 'translateY(-50%)',
        width: 38, height: 38, borderRadius: 11, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: hover ? 'color-mix(in srgb, var(--x-orange) 16%, transparent)' : 'color-mix(in srgb, var(--x-bg) 66%, transparent)',
        border: `1px solid ${hover ? 'color-mix(in srgb, var(--x-orange) 40%, transparent)' : C.border}`,
        color: hover ? C.accent : C.dim, backdropFilter: 'blur(8px)',
        transition: 'all .2s', zIndex: 2,
      } as React.CSSProperties}
    >
      <Icon size={18} />
    </button>
  )
}

/* ================================================================== *
 * In-grid placement (unchanged behaviour, marked clearly)
 * ================================================================== */
export function GridPlacement({ rotationKey = 0 }: { rotationKey?: number }) {
  const [c] = useState<Campaign>(() => pickCampaign('grid', rotationKey))
  const [hover, setHover] = useState(false)

  useEffect(() => { trackCampaign(c.id, 'impression') }, [c.id])

  return (
    <Link
      href={c.href}
      onClick={() => trackCampaign(c.id, 'click')}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        padding: 18, borderRadius: 14, textDecoration: 'none',
        background: `linear-gradient(150deg, ${C.panelHi} 0%, var(--x-bg) 100%)`,
        border: `1px dashed ${hover ? `${hexA(c.accent, 0x66)}` : C.border}`, transition: 'border-color .22s',
      }}
    >
      <div aria-hidden style={{
        position: 'absolute', right: -50, top: -50, width: 210, height: 210, borderRadius: 34,
        transform: 'rotate(15deg)', background: `linear-gradient(135deg, ${hexA(c.accent, 0x22)}, transparent 62%)`,
      }} />
      <div aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: c.accent, opacity: 0.85 }} />

      <div style={{ position: 'relative', marginBottom: 16 }}>
        <span style={{
          display: 'inline-flex', padding: '3px 8px', borderRadius: 5, fontSize: 9,
          fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
          background: 'rgba(var(--x-ov),0.05)', border: `1px solid ${C.border}`, color: C.muted,
        }}>
          {c.tier === 'House' ? 'From XPLORIX' : 'Sponsored'}
        </span>
      </div>

      <div style={{ position: 'relative', flex: 1 }}>
        <div style={{ fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.accent, fontWeight: 700, marginBottom: 9 }}>
          {c.eyebrow}
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, color: C.text, fontFamily: display, lineHeight: 1.3, letterSpacing: '-0.02em', marginBottom: 10 }}>
          {c.headline}
        </div>
        <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6, margin: 0 }}>{c.subline}</p>
      </div>

      <div style={{
        position: 'relative', marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      }}>
        {c.tier !== 'House' ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: C.muted, minWidth: 0 }}>
            {c.verified && <BadgeCheck size={12} style={{ color: C.green, flexShrink: 0 }} />}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.partnerName}</span>
          </span>
        ) : <span />}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: c.accent, whiteSpace: 'nowrap' }}>
          {c.ctaLabel}
          <ArrowRight size={13} style={{ transform: hover ? 'translateX(3px)' : 'none', transition: 'transform .2s' }} />
        </span>
      </div>
    </Link>
  )
}
