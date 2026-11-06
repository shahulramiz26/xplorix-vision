'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

function XLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <polygon points="50,50 5,5 5,95" fill="#0F141C"/>
      <polygon points="50,50 5,5 30,5" fill="#232B38"/>
      <polygon points="50,50 5,95 30,95" fill="#232B38"/>
      <polygon points="50,50 95,5 95,95" fill="#F97316"/>
      <polygon points="50,50 95,5 70,5" fill="#EA580C"/>
      <polygon points="50,50 95,95 70,95" fill="#EA580C"/>
    </svg>
  )
}

const legalLinks = [
  { label: 'Privacy Policy',   href: '/privacy-policy'   },
  { label: 'Terms of Service', href: '/terms-of-service' },
  { label: 'Cookie Policy',    href: '/cookie-policy'    },
  { label: 'Refund Policy',    href: '/refund-policy'    },
]

export default function LegalLayout({ children, title, lastUpdated }: {
  children: React.ReactNode
  title: string
  lastUpdated: string
}) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', h)
    return () => window.removeEventListener('scroll', h)
  }, [])

  const P = 'max(20px, calc(50vw - 580px))'

  return (
    <div style={{ fontFamily:"'Space Grotesk',sans-serif", background:'#F6EDE5', color:'#0B0F17', minHeight:'100vh' }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700;800;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        html{scroll-behavior:smooth;}
        ::-webkit-scrollbar{width:3px;}
        ::-webkit-scrollbar-track{background:#F6EDE5;}
        ::-webkit-scrollbar-thumb{background:linear-gradient(#F97316,#3B82F6);border-radius:2px;}
        @keyframes xplPulse{0%,100%{opacity:1}50%{opacity:0.4}}
      ` }} />

      {/* NAV */}
      <nav style={{ position:'fixed', top:0, left:0, right:0, zIndex:900, padding:`14px ${P}`, display:'flex', alignItems:'center', justifyContent:'space-between', background:scrolled?'rgba(255,255,255,0.97)':'rgba(255,255,255,0.8)', backdropFilter:'blur(20px)', borderBottom:'1px solid rgba(11,15,23,0.05)', transition:'all 0.3s' }}>
        <Link href="/" style={{ display:'flex', alignItems:'center', gap:10, textDecoration:'none' }}>
          <XLogo size={32}/>
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:'#0B0F17', letterSpacing:'0.06em' }}>XPLORIX</div>
            <div style={{ fontSize:7, color:'#6B7280', letterSpacing:'0.18em', textTransform:'uppercase' }}>Drilling Intelligence</div>
          </div>
        </Link>
        <Link href="/" style={{ fontSize:13, color:'#56606E', textDecoration:'none', padding:'7px 16px', borderRadius:8, border:'1px solid rgba(11,15,23,0.08)', background:'rgba(11,15,23,0.04)' }}>
          ← Back to Home
        </Link>
      </nav>

      {/* HERO */}
      <div style={{ padding:`120px ${P} 40px`, background:'radial-gradient(ellipse 60% 50% at 50% -10%,rgba(249,115,22,0.07) 0%,transparent 60%),#F6EDE5', borderBottom:'1px solid rgba(11,15,23,0.06)' }}>
        <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'4px 12px', borderRadius:100, border:'1px solid rgba(249,115,22,0.25)', background:'rgba(249,115,22,0.05)', fontSize:10, fontWeight:700, color:'#F97316', letterSpacing:'0.15em', textTransform:'uppercase', marginBottom:14 }}>
          <span style={{ width:5, height:5, borderRadius:'50%', background:'#F97316', display:'inline-block', animation:'xplPulse 1.5s infinite' }}/>Legal Document
        </div>
        <h1 style={{ color:'#0B0F17', fontSize:'clamp(26px,4vw,44px)', fontWeight:900, marginBottom:10, letterSpacing:'-0.02em' }}>{title}</h1>
        <p style={{ fontSize:13, color:'#6B7280' }}>ANMAK CONSULTANCY SERVICES PRIVATE LIMITED · Last updated: {lastUpdated}</p>
        {/* Legal nav pills */}
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:20 }}>
          {legalLinks.map(l=>(
            <Link key={l.href} href={l.href} style={{ padding:'5px 14px', borderRadius:20, border:'1px solid rgba(11,15,23,0.08)', background:'rgba(11,15,23,0.04)', color:'#56606E', fontSize:12, fontWeight:500, textDecoration:'none' }}>
              {l.label}
            </Link>
          ))}
        </div>
      </div>

      {/* CONTENT */}
      <div style={{ padding:`48px ${P} 80px` }}>
        <div style={{ maxWidth:820, margin:'0 auto' }}>
          {children}
        </div>
      </div>

      {/* FOOTER */}
      <div style={{ borderTop:'1px solid rgba(11,15,23,0.06)', padding:`20px ${P}`, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10, background:'#FFFFFF' }}>
        <p style={{ fontSize:12, color:'#6B7280' }}>© 2026 ANMAK CONSULTANCY SERVICES PRIVATE LIMITED. All rights reserved.</p>
        <div style={{ display:'flex', gap:16 }}>
          {legalLinks.map(l=>(
            <Link key={l.href} href={l.href} style={{ fontSize:11, color:'#6B7280', textDecoration:'none' }}>{l.label}</Link>
          ))}
        </div>
      </div>
    </div>
  )
}

