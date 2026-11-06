'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { countries, industryTypes } from '@/lib/mock-data'

function XLogo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <polygon points="50,50 5,5 5,95"    fill="#0F141C"/>
      <polygon points="50,50 5,5 30,5"    fill="#232B38"/>
      <polygon points="50,50 5,95 30,95"  fill="#232B38"/>
      <polygon points="50,50 95,5 95,95"  fill="#F97316"/>
      <polygon points="50,50 95,5 70,5"   fill="#EA580C"/>
      <polygon points="50,50 95,95 70,95" fill="#EA580C"/>
    </svg>
  )
}

const inputBase: React.CSSProperties = {
  width:'100%', padding:'11px 13px',
  background:'rgba(11,15,23,0.03)',
  border:'1px solid #E3D9CF', borderRadius:9,
  color:'#0B0F17', fontSize:12, outline:'none',
  fontFamily:'inherit', transition:'all 0.2s',
}
const labelBase: React.CSSProperties = {
  display:'block', fontSize:10, fontWeight:700,
  color:'#6B7280', letterSpacing:'0.12em',
  textTransform:'uppercase', marginBottom:6,
}
const onFocus = (e: React.FocusEvent<HTMLInputElement|HTMLSelectElement>) => {
  e.target.style.borderColor = 'rgba(249,115,22,0.5)'
  e.target.style.boxShadow  = '0 0 0 3px rgba(249,115,22,0.08)'
}
const onBlur = (e: React.FocusEvent<HTMLInputElement|HTMLSelectElement>) => {
  e.target.style.borderColor = '#E3D9CF'
  e.target.style.boxShadow   = ''
}

export default function RegisterPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [companyId] = useState('CT-' + String(1000 + Math.floor(Math.random() * 9000)))
  const [formData, setFormData] = useState({
    name:'', companyName:'', industryType:'', country:'',
    email:'', phone:'', rigCount:'', password:'', confirmPassword:''
  })

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement|HTMLSelectElement>) =>
    setFormData(prev => ({ ...prev, [field]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    await new Promise(r => setTimeout(r, 1500))
    setLoading(false)
    setSuccess(true)
  }

  // ── SUCCESS ──────────────────────────────────────────────────────────────
  if (success) {
    return (
      <div style={{ minHeight:'100vh', background:'#F6EDE5', display:'flex', alignItems:'center', justifyContent:'center', padding:20, fontFamily:"'Inter',sans-serif" }}>
        <style dangerouslySetInnerHTML={{ __html: `@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700;800;900&family=Inter:wght@400;500;600;700&display=swap');` }} />
        <motion.div initial={{ opacity:0, scale:0.96 }} animate={{ opacity:1, scale:1 }} transition={{ duration:0.4 }}
          style={{ width:'100%', maxWidth:460, background:'#FFFFFF', border:'1px solid #E3D9CF', borderRadius:20, padding:36, textAlign:'center', boxShadow:'0 32px 80px rgba(122,60,8,0.16)' }}>

          {/* Success icon */}
          <div style={{ width:60, height:60, borderRadius:'50%', background:'rgba(16,185,129,0.1)', border:'2px solid rgba(16,185,129,0.25)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 18px' }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>

          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, marginBottom:14 }}>
            <XLogo size={28}/>
            <span style={{ fontSize:16, fontWeight:900, color:'#0B0F17', fontFamily:"'Space Grotesk',sans-serif", letterSpacing:'0.06em' }}>XPLORIX</span>
          </div>

          <h2 style={{ fontSize:22, fontWeight:800, color:'#0B0F17', fontFamily:"'Space Grotesk',sans-serif", marginBottom:8 }}>
            Registration Successful! 🎉
          </h2>
          <p style={{ fontSize:13, color:'#56606E', lineHeight:1.6, marginBottom:22 }}>
            Welcome to XPLORIX! <strong style={{ color:'#0B0F17' }}>{formData.companyName}</strong> is now registered and ready to go.
          </p>

          {/* Details card */}
          <div style={{ background:'rgba(249,115,22,0.04)', border:'1px solid rgba(249,115,22,0.15)', borderRadius:12, padding:'16px 20px', marginBottom:22, textAlign:'left' }}>
            {[
              { label:'XPLORIX ID', value:companyId,        mono:true  },
              { label:'Role',       value:'Company Admin',   mono:false },
              { label:'Trial',      value:'15 days · All features', mono:false },
              { label:'Email',      value:formData.email,   mono:false },
            ].map((item,i)=>(
              <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:i<3?10:0, paddingBottom:i<3?10:0, borderBottom:i<3?'1px solid #E3D9CF':'none' }}>
                <span style={{ fontSize:11, color:'#6B7280', fontWeight:600 }}>{item.label}</span>
                <span style={{ fontSize:12, fontWeight:700, color:item.mono?'#F97316':'#0B0F17', fontFamily:item.mono?'monospace':'inherit' }}>{item.value}</span>
              </div>
            ))}
          </div>

          {/* Trial badges */}
          <div style={{ display:'flex', gap:8, justifyContent:'center', marginBottom:22, flexWrap:'wrap' }}>
            {['⚡ Live in 5 minutes','✓ No credit card','🛡 All features unlocked'].map((b,i)=>(
              <span key={i} style={{ padding:'4px 10px', background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.2)', borderRadius:20, fontSize:10, fontWeight:600, color:'#10B981' }}>{b}</span>
            ))}
          </div>

          <Link href="/auth/login"
            style={{ display:'block', width:'100%', padding:'13px', borderRadius:11, background:'linear-gradient(135deg,#F97316,#EA580C)', color:'#fff', fontWeight:700, fontSize:14, textDecoration:'none', boxShadow:'0 4px 24px rgba(249,115,22,0.3)', textAlign:'center' }}>
            Continue to Login →
          </Link>
        </motion.div>
      </div>
    )
  }

  // ── FORM ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:'100vh', background:'#F6EDE5', padding:'36px 20px 48px', fontFamily:"'Inter',sans-serif", position:'relative', overflow:'hidden' }}>

      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap');
        @keyframes xplPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.4;transform:scale(1.5)}}
        @keyframes xplSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        input::placeholder{color:#8A93A0!important;}
        *{box-sizing:border-box;}
      ` }} />

      {/* BG */}
      <div style={{ position:'fixed', inset:0, pointerEvents:'none', zIndex:0 }}>
        <div style={{ position:'absolute', top:'-10%', left:'50%', transform:'translateX(-50%)', width:800, height:600, background:'radial-gradient(circle,rgba(249,115,22,0.06) 0%,transparent 65%)', borderRadius:'50%' }}/>
        <div style={{ position:'absolute', inset:0, backgroundImage:'linear-gradient(rgba(122,60,8,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(122,60,8,0.05) 1px,transparent 1px)', backgroundSize:'60px 60px', WebkitMaskImage:'radial-gradient(ellipse 80% 80% at 50% 30%,black 0%,transparent 100%)' }}/>
      </div>

      <motion.div initial={{ opacity:0, y:24 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.45 }}
        style={{ width:'100%', maxWidth:660, margin:'0 auto', position:'relative', zIndex:10 }}>

        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ display:'inline-flex', alignItems:'center', gap:12, marginBottom:14, padding:'9px 18px', background:'rgba(11,15,23,0.02)', border:'1px solid #E3D9CF', borderRadius:12 }}>
            <XLogo size={34}/>
            <div style={{ textAlign:'left' }}>
              <div style={{ fontSize:16, fontWeight:900, color:'#0B0F17', letterSpacing:'0.06em', fontFamily:"'Space Grotesk',sans-serif" }}>XPLORIX</div>
              <div style={{ fontSize:8, color:'#6B7280', letterSpacing:'0.18em', textTransform:'uppercase' }}>Drilling Intelligence</div>
            </div>
          </div>
          <h1 style={{ fontSize:24, fontWeight:800, color:'#0B0F17', fontFamily:"'Space Grotesk',sans-serif", marginBottom:5 }}>Create Your Account</h1>
          <p style={{ fontSize:13, color:'#6B7280' }}>Start your 15-day free trial — no credit card required</p>
        </div>

        {/* Badges */}
        <div style={{ display:'flex', gap:8, justifyContent:'center', marginBottom:22, flexWrap:'wrap' }}>
          {[
            {icon:'⏱', text:'5 min setup',    color:'#F97316'},
            {icon:'✓',  text:'15-day trial',   color:'#10B981'},
            {icon:'🔒', text:'No credit card', color:'#3B82F6'},
            {icon:'⚡', text:'All features',   color:'#8B5CF6'},
          ].map((b,i)=>(
            <div key={i} style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 11px', background:`rgba(${i===0?'249,115,22':i===1?'16,185,129':i===2?'59,130,246':'139,92,246'},0.07)`, border:`1px solid rgba(${i===0?'249,115,22':i===1?'16,185,129':i===2?'59,130,246':'139,92,246'},0.2)`, borderRadius:20, fontSize:11, fontWeight:600, color:b.color }}>
              {b.icon} {b.text}
            </div>
          ))}
        </div>

        {/* Form card */}
        <div style={{ background:'#FFFFFF', border:'1px solid #E3D9CF', borderRadius:20, padding:28, boxShadow:'0 32px 80px rgba(0,0,0,0.4)' }}>

          <form onSubmit={handleSubmit}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>

              <div>
                <label style={labelBase}>Full Name *</label>
                <input type="text" required placeholder="John Smith"
                  value={formData.name} onChange={set('name')}
                  style={inputBase} onFocus={onFocus} onBlur={onBlur}/>
              </div>

              <div>
                <label style={labelBase}>Company Name *</label>
                <input type="text" required placeholder="Acme Drilling Co."
                  value={formData.companyName} onChange={set('companyName')}
                  style={inputBase} onFocus={onFocus} onBlur={onBlur}/>
              </div>

              <div>
                <label style={labelBase}>Industry Type *</label>
                <select required value={formData.industryType} onChange={set('industryType')}
                  style={{ ...inputBase, cursor:'pointer', appearance:'none' as const, color:formData.industryType?'#0B0F17':'#6B7280' }}
                  onFocus={onFocus} onBlur={onBlur}>
                  <option value="" style={{ background:'#FFFFFF' }}>Select Industry</option>
                  {industryTypes.map((type: {value:string;label:string}) => (
                    <option key={type.value} value={type.value} style={{ background:'#FFFFFF' }}>{type.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelBase}>Country *</label>
                <select required value={formData.country} onChange={set('country')}
                  style={{ ...inputBase, cursor:'pointer', appearance:'none' as const, color:formData.country?'#0B0F17':'#6B7280' }}
                  onFocus={onFocus} onBlur={onBlur}>
                  <option value="" style={{ background:'#FFFFFF' }}>Select Country</option>
                  {countries.map((country: string) => (
                    <option key={country} value={country} style={{ background:'#FFFFFF' }}>{country}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelBase}>Company Email *</label>
                <input type="email" required placeholder="admin@acme.com"
                  value={formData.email} onChange={set('email')}
                  style={inputBase} onFocus={onFocus} onBlur={onBlur}/>
              </div>

              <div>
                <label style={labelBase}>Phone Number *</label>
                <input type="tel" required placeholder="+1 555 000 1234"
                  value={formData.phone} onChange={set('phone')}
                  style={inputBase} onFocus={onFocus} onBlur={onBlur}/>
              </div>

              <div>
                <label style={labelBase}>Number of Rigs *</label>
                <input type="number" min="1" required placeholder="e.g. 5"
                  value={formData.rigCount} onChange={set('rigCount')}
                  style={inputBase} onFocus={onFocus} onBlur={onBlur}/>
              </div>

              <div>
                <label style={labelBase}>Password *</label>
                <input type="password" required minLength={8}
                  placeholder="Min 8 chars, 1 uppercase, 1 number"
                  value={formData.password} onChange={set('password')}
                  style={inputBase} onFocus={onFocus} onBlur={onBlur}/>
              </div>

              <div style={{ gridColumn:'1/-1' }}>
                <label style={labelBase}>Confirm Password *</label>
                <input type="password" required placeholder="Re-enter your password"
                  value={formData.confirmPassword} onChange={set('confirmPassword')}
                  style={inputBase} onFocus={onFocus} onBlur={onBlur}/>
              </div>
            </div>

            {/* Divider */}
            <div style={{ height:1, background:'linear-gradient(90deg,transparent,#E3D9CF,transparent)', margin:'20px 0' }}/>

            {/* Terms */}
            <label style={{ display:'flex', alignItems:'flex-start', gap:10, cursor:'pointer', marginBottom:18 }}>
              <input type="checkbox" required style={{ width:14, height:14, marginTop:2, accentColor:'#F97316', flexShrink:0 }}/>
              <span style={{ fontSize:12, color:'#56606E', lineHeight:1.6 }}>
                I agree to the{' '}
                <span style={{ color:'#F97316', cursor:'pointer', fontWeight:600 }}>Terms of Service</span>
                {' '}and{' '}
                <span style={{ color:'#F97316', cursor:'pointer', fontWeight:600 }}>Privacy Policy</span>
              </span>
            </label>

            {/* Submit */}
            <button type="submit" disabled={loading}
              style={{ width:'100%', padding:'13px', borderRadius:11, border:'none', cursor:loading?'not-allowed':'pointer', fontFamily:'inherit', fontSize:14, fontWeight:700, color:'#fff', background:loading?'#8A93A0':'linear-gradient(135deg,#F97316,#EA580C)', boxShadow:loading?'none':'0 4px 24px rgba(249,115,22,0.35)', transition:'all 0.2s', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
              {loading
                ? <><span style={{ width:14, height:14, border:'2px solid rgba(11,15,23,0.3)', borderTopColor:'#fff', borderRadius:'50%', display:'inline-block', animation:'xplSpin 0.7s linear infinite' }}/> Creating your account...</>
                : 'Create Account & Start Free Trial →'
              }
            </button>
          </form>

          <div style={{ height:1, background:'linear-gradient(90deg,transparent,#E3D9CF,transparent)', margin:'20px 0' }}/>

          <p style={{ textAlign:'center', fontSize:13, color:'#6B7280' }}>
            Already have an account?{' '}
            <Link href="/auth/login" style={{ color:'#F97316', fontWeight:700, textDecoration:'none' }}>
              Sign in here
            </Link>
          </p>
        </div>

        <p style={{ textAlign:'center', fontSize:11, color:'#E3D9CF', marginTop:20 }}>
          © 2026 XPLORIX · Built by drillers, for drillers.
        </p>
      </motion.div>
    </div>
  )
}

