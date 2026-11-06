'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Eye, EyeOff } from 'lucide-react'
import { useSession, signIn, HOME } from '../../../lib/backend'

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

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({ email:'', password:'', role:'' })
  const [error, setError] = useState('')
  /* With a database connected this is a real sign-in: a username and a
   * password, and the server says which login it is. Without one it is the
   * demo's door, where you pick which login to look at. */
  const session = useSession()
  const real = session.status !== 'demo' && session.status !== 'loading'
  useEffect(() => {
    if (session.status === 'setup') window.location.href = '/setup'
    if (session.status === 'in') window.location.href = HOME[session.user.role]
  }, [session])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    if (real) {
      const r = await signIn(formData.email, formData.password)
      if (r.ok) { window.location.href = HOME[r.role]; return }
      setError(r.error); setLoading(false)
      return
    }
    await new Promise(r => setTimeout(r, 800))
    // One company account, five kinds of login. The Company Admin creates the
    // other three from the Users screen.
    const home: Record<string, string> = {
      admin: '/admin/dashboard?view=admin',
      geologist: '/admin/geology?view=geologist',
      supervisor: '/supervisor/today',
      contractor: '/contractor',
      client: '/client',
    }
    window.location.href = home[formData.role] ?? '/admin/dashboard'
  }

  const inputBase: React.CSSProperties = {
    width:'100%', padding:'12px 14px',
    background:'rgba(11,15,23,0.03)',
    border:'1px solid #E3D9CF', borderRadius:10,
    color:'#0B0F17', fontSize:13, outline:'none',
    fontFamily:'inherit', transition:'all 0.2s',
  }

  const onFocus = (e: React.FocusEvent<HTMLInputElement|HTMLSelectElement>) => {
    e.target.style.borderColor = 'rgba(249,115,22,0.5)'
    e.target.style.boxShadow = '0 0 0 3px rgba(249,115,22,0.08)'
  }
  const onBlur = (e: React.FocusEvent<HTMLInputElement|HTMLSelectElement>) => {
    e.target.style.borderColor = '#E3D9CF'
    e.target.style.boxShadow = ''
  }

  return (
    <div style={{ minHeight:'100vh', background:'#F6EDE5', display:'flex', alignItems:'center', justifyContent:'center', padding:20, fontFamily:"'Inter',sans-serif", position:'relative', overflow:'hidden' }}>

      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap');
        @keyframes xplPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.4;transform:scale(1.5)}}
        @keyframes xplSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        input::placeholder{color:#8A93A0!important;}
      ` }} />

      {/* BG Effects */}
      <div style={{ position:'fixed', inset:0, pointerEvents:'none', zIndex:0 }}>
        <div style={{ position:'absolute', top:'-20%', left:'50%', transform:'translateX(-50%)', width:700, height:700, background:'radial-gradient(circle,rgba(249,115,22,0.07) 0%,transparent 65%)', borderRadius:'50%' }}/>
        <div style={{ position:'absolute', bottom:'-15%', right:'5%', width:400, height:400, background:'radial-gradient(circle,rgba(59,130,246,0.04) 0%,transparent 65%)', borderRadius:'50%' }}/>
        <div style={{ position:'absolute', inset:0, backgroundImage:'linear-gradient(rgba(122,60,8,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(122,60,8,0.05) 1px,transparent 1px)', backgroundSize:'60px 60px', WebkitMaskImage:'radial-gradient(ellipse 80% 80% at 50% 50%,black 0%,transparent 100%)' }}/>
      </div>

      <motion.div initial={{ opacity:0, y:24 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.45 }}
        style={{ width:'100%', maxWidth:420, position:'relative', zIndex:10 }}>

        {/* Logo + Title */}
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{ display:'inline-flex', alignItems:'center', gap:12, marginBottom:16, padding:'10px 20px', background:'rgba(11,15,23,0.02)', border:'1px solid #E3D9CF', borderRadius:14 }}>
            <XLogo size={38}/>
            <div style={{ textAlign:'left' }}>
              <div style={{ fontSize:18, fontWeight:900, color:'#0B0F17', letterSpacing:'0.06em', fontFamily:"'Space Grotesk',sans-serif" }}>XPLORIX</div>
              <div style={{ fontSize:8, color:'#6B7280', letterSpacing:'0.18em', textTransform:'uppercase' }}>Drilling Intelligence</div>
            </div>
          </div>
          <h1 style={{ fontSize:26, fontWeight:800, color:'#0B0F17', fontFamily:"'Space Grotesk',sans-serif", marginBottom:6, lineHeight:1.1 }}>Welcome Back</h1>
          <p style={{ fontSize:13, color:'#6B7280' }}>Sign in to your drilling platform</p>
        </div>

        {/* Card */}
        <div style={{ background:'#FFFFFF', border:'1px solid #E3D9CF', borderRadius:20, padding:28, boxShadow:'0 32px 80px rgba(122,60,8,0.16)' }}>

          {/* Trial badge: the demo's own. A real sign-in is not a trial. */}
          {!real && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:7, padding:'8px 0', background:'rgba(249,115,22,0.05)', border:'1px solid rgba(249,115,22,0.12)', borderRadius:10, marginBottom:22 }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background:'#F97316', display:'inline-block', animation:'xplPulse 1.5s infinite' }}/>
            <span style={{ fontSize:11, fontWeight:600, color:'#F97316' }}>15-day free trial · All features unlocked</span>
          </div>
          )}

          <form onSubmit={handleSubmit}>

            {/* Email */}
            <div style={{ marginBottom:14 }}>
              <label style={{ display:'block', fontSize:10, fontWeight:700, color:'#6B7280', letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:6 }}>{real ? 'Username' : 'Email'}</label>
              <input type={real ? 'text' : 'email'} required placeholder={real ? 'Enter your username' : 'Enter your email'} autoCapitalize="none" autoCorrect="off" autoComplete="username"
                value={formData.email} onChange={e=>setFormData({...formData,email:e.target.value})}
                style={inputBase} onFocus={onFocus} onBlur={onBlur}/>
            </div>

            {/* Password */}
            <div style={{ marginBottom:14 }}>
              <label style={{ display:'block', fontSize:10, fontWeight:700, color:'#6B7280', letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:6 }}>Password</label>
              <div style={{ position:'relative' }}>
                <input type={showPassword?'text':'password'} required placeholder="Enter your password"
                  value={formData.password} onChange={e=>setFormData({...formData,password:e.target.value})}
                  style={{ ...inputBase, paddingRight:42 }} onFocus={onFocus} onBlur={onBlur}/>
                <button type="button" onClick={()=>setShowPassword(!showPassword)}
                  style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#6B7280', display:'flex', alignItems:'center', padding:0 }}>
                  {showPassword ? <EyeOff size={15}/> : <Eye size={15}/>}
                </button>
              </div>
            </div>

            {/* Role: only in the demo. A real login already knows what it is. */}
            {!real && <div style={{ marginBottom:18 }}>
              <label style={{ display:'block', fontSize:10, fontWeight:700, color:'#6B7280', letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:6 }}>Login As</label>
              <select required value={formData.role} onChange={e=>setFormData({...formData,role:e.target.value})}
                style={{ ...inputBase, cursor:'pointer', appearance:'none' as const, color:formData.role?'#0B0F17':'#6B7280' }}
                onFocus={onFocus} onBlur={onBlur}>
                <option value="" style={{ background:'#FFFFFF' }}>Select Role</option>
                <option value="admin" style={{ background:'#FFFFFF' }}>Company Admin</option>
                <option value="geologist" style={{ background:'#FFFFFF' }}>Geologist</option>
                <option value="supervisor" style={{ background:'#FFFFFF' }}>Supervisor</option>
                <option value="contractor" style={{ background:'#FFFFFF' }}>Contractor</option>
                <option value="client" style={{ background:'#FFFFFF' }}>Client</option>
              </select>
            </div>}

            {error && <div role="alert" style={{ marginBottom:14, padding:'10px 12px', borderRadius:10, background:'rgba(220,38,38,0.06)', border:'1px solid rgba(220,38,38,0.25)', color:'#B91C1C', fontSize:13 }}>{error}</div>}

            {/* Remember + Forgot */}
            {real ? (
              <p style={{ fontSize:12, color:'#56606E', marginBottom:20, lineHeight:1.5 }}>Forgot your password? Ask your Company Admin to reset it in Users.</p>
            ) : (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
              <label style={{ display:'flex', alignItems:'center', gap:7, fontSize:12, color:'#56606E', cursor:'pointer' }}>
                <input type="checkbox" style={{ width:13, height:13, accentColor:'#F97316' }}/>
                Remember me
              </label>
              <Link href="/auth/forgot-password"
                style={{ fontSize:12, color:'#F97316', textDecoration:'none', fontWeight:600 }}>
                Forgot password?
              </Link>
            </div>
            )}

            {/* Submit */}
            <button type="submit" disabled={loading}
              style={{ width:'100%', padding:'13px', borderRadius:11, border:'none', cursor:loading?'not-allowed':'pointer', fontFamily:'inherit', fontSize:14, fontWeight:700, color:'#fff', background:loading?'#8A93A0':'linear-gradient(135deg,#F97316,#EA580C)', boxShadow:loading?'none':'0 4px 24px rgba(249,115,22,0.35)', transition:'all 0.2s', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
              {loading
                ? <><span style={{ width:14, height:14, border:'2px solid rgba(11,15,23,0.3)', borderTopColor:'#fff', borderRadius:'50%', display:'inline-block', animation:'xplSpin 0.7s linear infinite' }}/> Signing in...</>
                : 'Sign In →'
              }
            </button>
          </form>

          {!real && <>
          <div style={{ height:1, background:'linear-gradient(90deg,transparent,#E3D9CF,transparent)', margin:'20px 0' }}/>

          <p style={{ textAlign:'center', fontSize:13, color:'#6B7280' }}>
            Don&apos;t have an account?{' '}
            <Link href="/auth/register" style={{ color:'#F97316', fontWeight:700, textDecoration:'none' }}>
              Start free trial
            </Link>
          </p>
          </>}
        </div>

        <p style={{ textAlign:'center', fontSize:11, color:'#E3D9CF', marginTop:20 }}>
          © 2026 XPLORIX · Built by drillers, for drillers.
        </p>
      </motion.div>
    </div>
  )
}

