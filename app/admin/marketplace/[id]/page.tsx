'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  ChevronLeft, BadgeCheck, MapPin, Bookmark, Share2,
  Calendar, Package, Building2, ArrowRight, X,
} from 'lucide-react'
import { getListing, LISTINGS, formatPrice, type Listing } from '../data'

const C = {
  accent: 'var(--x-orange)',
  accentDim: 'color-mix(in srgb, var(--x-orange) 12%, transparent)',
  accentBorder: 'color-mix(in srgb, var(--x-orange) 25%, transparent)',
  panel: 'var(--x-card)',
  border: 'var(--x-border)',
  text: 'var(--x-text)',
  dim: 'var(--x-muted)',
  muted: 'var(--x-faint)',
  faint: 'var(--x-dim)',
  green: 'var(--x-green)',
}
const display = "'Space Grotesk', sans-serif"

export default function ListingDetailPage() {
  const params = useParams()
  const slug = Array.isArray(params.id) ? params.id[0] : params.id
  const listing = getListing(slug ?? '')

  const [saved, setSaved] = useState(false)
  const [showQuote, setShowQuote] = useState(false)

  if (!listing) {
    return (
      <div style={{ padding: '64px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 8, fontFamily: display }}>
          This listing is no longer available
        </div>
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>
          It may have been sold or withdrawn by the supplier.
        </p>
        <Link href="/admin/marketplace"
          style={{ color: C.accent, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
          Back to Exchange
        </Link>
      </div>
    )
  }

  const related = LISTINGS.filter(
    (l) => l.categoryId === listing.categoryId && l.id !== listing.id
  ).slice(0, 3)

  return (
    <div style={{ maxWidth: 1180 }}>

      {/* Back */}
      <Link href="/admin/marketplace"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 20,
          color: C.muted, fontSize: 13, fontWeight: 600, textDecoration: 'none',
        }}>
        <ChevronLeft size={16} /> Exchange
      </Link>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(300px, 1fr)', gap: 26, alignItems: 'start' }}>

        {/* ---------------- Left column ---------------- */}
        <div style={{ minWidth: 0 }}>

          {/* Hero plate */}
          <div style={{
            height: 320, borderRadius: 14, overflow: 'hidden', position: 'relative',
            background: 'linear-gradient(135deg, var(--x-raised) 0%, var(--x-bg) 100%)',
            border: `1px solid ${C.border}`,
            display: 'flex', alignItems: 'flex-end', padding: 26, marginBottom: 22,
          }}>
            <div aria-hidden style={{
              position: 'absolute', inset: 0, opacity: 0.5,
              backgroundImage:
                'repeating-linear-gradient(115deg, color-mix(in srgb, var(--x-muted) 5%, transparent) 0px, color-mix(in srgb, var(--x-muted) 5%, transparent) 1px, transparent 1px, transparent 13px)',
            }} />
            <div aria-hidden style={{
              position: 'absolute', right: -60, top: -60, width: 300, height: 300,
              transform: 'rotate(15deg)', borderRadius: 40,
              background: 'linear-gradient(135deg, color-mix(in srgb, var(--x-orange) 10%, transparent), transparent 65%)',
            }} />
            <div style={{ position: 'relative' }}>
              <div style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.faint, fontWeight: 700 }}>
                {listing.brand}
              </div>
              <div style={{ fontSize: 62, fontWeight: 700, color: 'color-mix(in srgb, var(--x-text) 10%, transparent)', fontFamily: display, letterSpacing: '-0.03em', lineHeight: 1 }}>
                {listing.model}
              </div>
            </div>
            <div style={{
              position: 'absolute', bottom: 20, right: 22, fontSize: 11,
              color: C.faint, fontWeight: 600,
            }}>
              Supplier photos pending
            </div>
          </div>

          {/* Specifications */}
          <Section title="Specifications">
            <div style={{
              border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden',
            }}>
              {listing.specs.map((s, i) => (
                <div key={s.label} style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
                  padding: '12px 16px',
                  background: i % 2 === 0 ? 'rgba(var(--x-ov),0.015)' : 'transparent',
                  borderTop: i === 0 ? 'none' : `1px solid ${C.border}`,
                }}>
                  <div style={{ fontSize: 13, color: C.muted }}>{s.label}</div>
                  <div style={{ fontSize: 13, color: C.text, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    {s.value}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* Description */}
          <Section title="Supplier notes">
            <p style={{ fontSize: 14, color: C.dim, lineHeight: 1.75, margin: 0 }}>
              {listing.description}
            </p>
          </Section>

          {/* Related */}
          {related.length > 0 && (
            <Section title={`More in ${listing.categoryLabel.toLowerCase()}`}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                {related.map((r) => (
                  <Link key={r.id} href={`/admin/marketplace/${r.slug}`}
                    style={{
                      padding: 14, borderRadius: 11, textDecoration: 'none',
                      background: C.panel, border: `1px solid ${C.border}`, display: 'block',
                    }}>
                    <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.faint, fontWeight: 700, marginBottom: 6 }}>
                      {r.brand}
                    </div>
                    <div style={{ fontSize: 13.5, color: C.text, fontWeight: 600, lineHeight: 1.4, marginBottom: 8 }}>
                      {r.title}
                    </div>
                    <div style={{ fontSize: 12.5, color: C.dim, fontWeight: 600 }}>
                      {formatPrice(r)}
                    </div>
                  </Link>
                ))}
              </div>
            </Section>
          )}
        </div>

        {/* ---------------- Right rail ---------------- */}
        <div style={{ position: 'sticky', top: 88, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Action card */}
          <div style={{ padding: 20, borderRadius: 14, background: C.panel, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.faint, fontWeight: 700, marginBottom: 8 }}>
              {listing.categoryLabel}
            </div>
            <h1 style={{ fontSize: 21, fontWeight: 700, color: C.text, fontFamily: display, lineHeight: 1.3, margin: '0 0 14px', letterSpacing: '-0.015em' }}>
              {listing.title}
            </h1>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
              <Tag icon={<Package size={12} />}>{listing.condition}</Tag>
              {listing.year && <Tag icon={<Calendar size={12} />}>{listing.year}</Tag>}
              <Tag icon={<MapPin size={12} />}>{listing.location}</Tag>
            </div>

            <div style={{ padding: '14px 0', borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, marginBottom: 18 }}>
              <div style={{
                fontSize: listing.priceType === 'on_request' ? 17 : 26,
                fontWeight: 700, color: C.text, fontFamily: display,
                letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums',
              }}>
                {formatPrice(listing)}
              </div>
              <div style={{ fontSize: 12.5, color: C.green, marginTop: 6, fontWeight: 600 }}>
                {listing.availability}
              </div>
            </div>

            <button
              onClick={() => setShowQuote(true)}
              style={{
                width: '100%', padding: '13px', borderRadius: 11, cursor: 'pointer',
                background: 'linear-gradient(135deg, var(--x-orange), var(--x-orange-d))', color: '#fff',
                border: 'none', fontWeight: 700, fontSize: 14.5, fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: '0 4px 20px color-mix(in srgb, var(--x-orange) 30%, transparent)', marginBottom: 10,
              }}
            >
              Request quote <ArrowRight size={16} />
            </button>

            <div style={{ display: 'flex', gap: 10 }}>
              <SecondaryButton
                active={saved}
                onClick={() => setSaved((v) => !v)}
                icon={<Bookmark size={15} fill={saved ? C.accent : 'none'} />}
              >
                {saved ? 'Saved' : 'Save'}
              </SecondaryButton>
              <SecondaryButton onClick={() => {}} icon={<Share2 size={15} />}>
                Share
              </SecondaryButton>
            </div>
          </div>

          {/* Supplier card */}
          <div style={{ padding: 20, borderRadius: 14, background: C.panel, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.faint, fontWeight: 700, marginBottom: 14 }}>
              Supplier
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
              <div style={{
                width: 42, height: 42, borderRadius: 11, flexShrink: 0,
                background: 'rgba(var(--x-ov),0.04)', border: `1px solid ${C.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Building2 size={18} style={{ color: C.dim }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text, lineHeight: 1.3 }}>
                  {listing.partner.name}
                </div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                  {listing.partner.country} · {listing.partner.listingCount} listings
                </div>
              </div>
            </div>

            {listing.partner.verified ? (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 9, padding: 12, borderRadius: 10,
                background: 'color-mix(in srgb, var(--x-green) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--x-green) 16%, transparent)',
              }}>
                <BadgeCheck size={16} style={{ color: C.green, flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div style={{ fontSize: 12.5, color: C.green, fontWeight: 700 }}>XPLORIX verified</div>
                  <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3, lineHeight: 1.5 }}>
                    Business registration and trading documents checked by XPLORIX.
                  </div>
                </div>
              </div>
            ) : (
              <div style={{
                padding: 12, borderRadius: 10, fontSize: 11.5, color: C.muted, lineHeight: 1.5,
                background: 'rgba(var(--x-ov),0.02)', border: `1px solid ${C.border}`,
              }}>
                Verification in progress. Confirm terms directly with the supplier before payment.
              </div>
            )}
          </div>
        </div>
      </div>

      {showQuote && <QuoteModal listing={listing} onClose={() => setShowQuote(false)} />}
    </div>
  )
}

/* ---------- small pieces ---------- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 30 }}>
      <h2 style={{
        fontSize: 15, fontWeight: 700, color: C.text, fontFamily: display,
        margin: '0 0 14px', letterSpacing: '-0.01em',
      }}>
        {title}
      </h2>
      {children}
    </div>
  )
}

function Tag({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '5px 10px', borderRadius: 7, fontSize: 11.5, fontWeight: 600,
      background: 'rgba(var(--x-ov),0.03)', border: `1px solid ${C.border}`, color: C.dim,
    }}>
      {icon}{children}
    </span>
  )
}

function SecondaryButton({
  children, icon, onClick, active,
}: {
  children: React.ReactNode
  icon: React.ReactNode
  onClick: () => void
  active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '10px', borderRadius: 10, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
        background: active ? C.accentDim : 'rgba(var(--x-ov),0.03)',
        border: `1px solid ${active ? C.accentBorder : C.border}`,
        color: active ? C.accent : C.dim,
      }}
    >
      {icon}{children}
    </button>
  )
}

/* Duplicated intentionally so the detail page stands alone —
   extract to components/QuoteModal.tsx when you wire the API. */
function QuoteModal({ listing, onClose }: { listing: Listing; onClose: () => void }) {
  const [sent, setSent] = useState(false)

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 100, padding: 20,
      background: 'rgba(var(--x-shadow),0.72)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 500, background: C.panel,
        border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden',
      }}>
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.text, fontFamily: display }}>
            {sent ? 'Request sent' : 'Request a quote'}
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: 22 }}>
          {sent ? (
            <p style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.65, margin: 0 }}>
              {listing.partner.name} has your request and will contact you about pricing and
              availability. Track it under My inquiries.
            </p>
          ) : (
            <>
              <div style={{
                padding: 14, borderRadius: 11, marginBottom: 18,
                background: 'color-mix(in srgb, var(--x-orange) 5%, transparent)', border: '1px solid color-mix(in srgb, var(--x-orange) 14%, transparent)',
              }}>
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
              <textarea
                placeholder="Anything the supplier should know — site conditions, delivery terms, inspection window."
                style={{
                  width: '100%', minHeight: 92, padding: '10px 12px', borderRadius: 9, marginBottom: 18,
                  background: 'rgba(var(--x-ov),0.03)', border: `1px solid ${C.border}`,
                  color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'vertical',
                }}
              />
              <button onClick={() => setSent(true)} style={{
                width: '100%', padding: 12, borderRadius: 10, cursor: 'pointer',
                background: 'linear-gradient(135deg, var(--x-orange), var(--x-orange-d))', color: '#fff',
                border: 'none', fontWeight: 700, fontSize: 14, fontFamily: 'inherit',
              }}>
                Send request
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
