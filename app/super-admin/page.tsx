'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

// ── TYPES ─────────────────────────────────────────────────────────────────
interface Company {
  id: string; name: string; adminName: string; email: string; phone: string
  country: string; industry: string; plan: 'Standard'|'Growth'|'Enterprise'|'Trial'
  status: 'Active'|'Trial'|'Suspended'|'Expired'; rigs: number; users: number
  registered: string; trialExpiry: string; lastLogin: string; revenue: number
  repId: string | null
}
interface Payment {
  id: string; companyId: string; amount: number; currency: string
  method: 'NEFT'|'IMPS'|'UPI'|'Cheque'|'Wire'; reference: string
  date: string; status: 'Received'|'Pending'|'Failed'; recordedBy: string; notes: string
}
interface Quote {
  id: string; companyId: string; plan: string; rigs: number; amount: number
  currency: string; validUntil: string; status: 'Draft'|'Sent'|'Accepted'|'Paid'|'Cancelled'
  createdDate: string; notes: string
}
interface Rep {
  id: string; name: string; type: 'External Rep'|'Internal Sales'|'Partner'|'Referral'
  email: string; phone: string; status: 'Active'|'Inactive'
  commissionRate: number; commissionType: 'Percentage'|'Fixed'
  totalDeals: number; totalEarned: number; totalPaid: number; joinedDate: string
}
interface Commission {
  id: string; repId: string; companyId: string; dealValue: number
  rate: number; type: 'Percentage'|'Fixed'; amount: number
  status: 'Pending'|'Approved'|'Paid'; approvedDate: string
  paidDate: string; reference: string; notes: string; createdDate: string
}

// ── MOCK DATA ─────────────────────────────────────────────────────────────
const COMPANIES: Company[] = [
  {id:'C001',name:'Apex Drilling Pty Ltd',adminName:'James Wilson',email:'james@apexdrilling.com.au',phone:'+61 400 123 456',country:'Australia',industry:'Diamond Core',plan:'Growth',status:'Active',rigs:12,users:28,registered:'2026-03-04',trialExpiry:'2026-03-19',lastLogin:'2026-07-06',revenue:48000,repId:'R001'},
  {id:'C002',name:'Pioneer Exploration Ltd',adminName:'Priya Nair',email:'priya@pioneerexp.in',phone:'+91 98765 43210',country:'India',industry:'RC Drilling',plan:'Standard',status:'Active',rigs:6,users:14,registered:'2026-03-23',trialExpiry:'2026-04-07',lastLogin:'2026-07-05',revenue:18000,repId:'R002'},
  {id:'C003',name:'Gulf Mining Corp',adminName:'Ahmed Al Rashid',email:'ahmed@gulfmining.sa',phone:'+966 50 234 5678',country:'Saudi Arabia',industry:'Blast Hole',plan:'Enterprise',status:'Active',rigs:28,users:65,registered:'2026-03-11',trialExpiry:'2026-03-26',lastLogin:'2026-07-06',revenue:120000,repId:null},
  {id:'C004',name:'RedRock Geotech',adminName:'Marcus Adeyemi',email:'marcus@redrockgeo.co.za',phone:'+27 82 345 6789',country:'South Africa',industry:'Geotechnical',plan:'Standard',status:'Trial',rigs:3,users:8,registered:'2026-06-27',trialExpiry:'2026-07-12',lastLogin:'2026-07-04',revenue:0,repId:'R001'},
  {id:'C005',name:'Northern Star Drilling',adminName:'Rob Mackenzie',email:'rob@northernstar.ca',phone:'+1 604 987 6543',country:'Canada',industry:'Diamond Core',plan:'Growth',status:'Active',rigs:9,users:22,registered:'2026-04-18',trialExpiry:'2026-05-03',lastLogin:'2026-07-03',revenue:36000,repId:'R003'},
  {id:'C006',name:'Desert Drill Solutions',adminName:'Tariq Hassan',email:'tariq@desertdrill.ae',phone:'+971 50 111 2222',country:'UAE',industry:'RC Drilling',plan:'Standard',status:'Suspended',rigs:4,users:9,registered:'2026-04-09',trialExpiry:'2026-04-24',lastLogin:'2026-06-17',revenue:6000,repId:'R002'},
  {id:'C007',name:'Kalgoorlie Core Samples',adminName:'Steve Hartley',email:'steve@kalgoorliecore.com.au',phone:'+61 418 555 777',country:'Australia',industry:'Diamond Core',plan:'Trial',status:'Trial',rigs:2,users:5,registered:'2026-07-01',trialExpiry:'2026-07-16',lastLogin:'2026-07-06',revenue:0,repId:null},
  {id:'C008',name:'Andean Minerals SA',adminName:'Carlos Vega',email:'carlos@andeanminerals.cl',phone:'+56 9 8765 4321',country:'Chile',industry:'Exploration',plan:'Enterprise',status:'Active',rigs:18,users:44,registered:'2026-04-03',trialExpiry:'2026-04-18',lastLogin:'2026-07-02',revenue:96000,repId:'R003'},
]

const PAYMENTS: Payment[] = [
  {id:'P001',companyId:'C001',amount:48000,currency:'AUD',method:'NEFT',reference:'NEFT2026011501',date:'2026-03-21',status:'Received',recordedBy:'Shahul',notes:'Annual payment - Growth plan 12 rigs'},
  {id:'P002',companyId:'C002',amount:18000,currency:'INR',method:'UPI',reference:'UPI20260203XPL',date:'2026-04-09',status:'Received',recordedBy:'Shahul',notes:'Standard plan 6 rigs'},
  {id:'P003',companyId:'C003',amount:120000,currency:'USD',method:'Wire',reference:'WIRE20260125GM',date:'2026-03-30',status:'Received',recordedBy:'Shahul',notes:'Enterprise plan 28 rigs annual'},
  {id:'P004',companyId:'C005',amount:36000,currency:'CAD',method:'NEFT',reference:'NEFT20260315NS',date:'2026-05-05',status:'Received',recordedBy:'Rahul',notes:'Growth plan 9 rigs'},
  {id:'P005',companyId:'C006',amount:6000,currency:'USD',method:'Wire',reference:'WIRE20260225DD',date:'2026-04-18',status:'Received',recordedBy:'Shahul',notes:'Standard plan 4 rigs - now suspended for non-renewal'},
  {id:'P006',companyId:'C008',amount:96000,currency:'USD',method:'Wire',reference:'WIRE20260218AM',date:'2026-04-22',status:'Received',recordedBy:'Rahul',notes:'Enterprise plan 18 rigs annual'},
]

const QUOTES: Quote[] = [
  {id:'Q001',companyId:'C004',plan:'Standard',rigs:3,amount:9000,currency:'USD',validUntil:'2026-07-19',status:'Sent',createdDate:'2026-07-02',notes:'3 rigs standard plan annual'},
  {id:'Q002',companyId:'C007',plan:'Growth',rigs:2,amount:8000,currency:'AUD',validUntil:'2026-07-28',status:'Draft',createdDate:'2026-07-05',notes:'Trial converting to growth'},
  {id:'Q003',companyId:'C006',plan:'Growth',rigs:4,amount:16000,currency:'USD',validUntil:'2026-07-17',status:'Sent',createdDate:'2026-06-27',notes:'Reactivation quote - upgrade to growth'},
]

const REPS: Rep[] = [
  {id:'R001',name:'Arjun Mehta',type:'External Rep',email:'arjun.mehta@gmail.com',phone:'+91 99887 76655',status:'Active',commissionRate:10,commissionType:'Percentage',totalDeals:2,totalEarned:5700,totalPaid:4800,joinedDate:'2025-12-19'},
  {id:'R002',name:'Fatima Al Zaabi',type:'Partner',email:'fatima@zaabiconsult.ae',phone:'+971 55 333 4444',status:'Active',commissionRate:8,commissionType:'Percentage',totalDeals:2,totalEarned:4320,totalPaid:3000,joinedDate:'2026-02-01'},
  {id:'R003',name:'Ryan Thompson',type:'Internal Sales',email:'ryan@xplorixtech.com',phone:'+1 778 456 7890',status:'Active',commissionRate:5,commissionType:'Percentage',totalDeals:2,totalEarned:6600,totalPaid:6600,joinedDate:'2026-02-18'},
]

const COMMISSIONS: Commission[] = [
  {id:'CM001',repId:'R001',companyId:'C001',dealValue:48000,rate:10,type:'Percentage',amount:4800,status:'Paid',approvedDate:'2026-03-25',paidDate:'2026-03-30',reference:'PAY-CM001',notes:'Annual growth plan deal',createdDate:'2026-03-22'},
  {id:'CM002',repId:'R001',companyId:'C004',dealValue:9000,rate:10,type:'Percentage',amount:900,status:'Pending',approvedDate:'',paidDate:'',reference:'',notes:'Pending payment from company',createdDate:'2026-07-02'},
  {id:'CM003',repId:'R002',companyId:'C002',dealValue:18000,rate:8,type:'Percentage',amount:1440,status:'Paid',approvedDate:'2026-04-11',paidDate:'2026-04-18',reference:'PAY-CM003',notes:'Standard plan deal India',createdDate:'2026-04-10'},
  {id:'CM004',repId:'R002',companyId:'C006',dealValue:6000,rate:8,type:'Percentage',amount:480,status:'Approved',approvedDate:'2026-04-22',paidDate:'',reference:'',notes:'Pending payout',createdDate:'2026-04-19'},
  {id:'CM005',repId:'R003',companyId:'C005',dealValue:36000,rate:5,type:'Percentage',amount:1800,status:'Paid',approvedDate:'2026-05-07',paidDate:'2026-05-12',reference:'PAY-CM005',notes:'',createdDate:'2026-05-06'},
  {id:'CM006',repId:'R003',companyId:'C008',dealValue:96000,rate:5,type:'Percentage',amount:4800,status:'Paid',approvedDate:'2026-04-25',paidDate:'2026-05-02',reference:'PAY-CM006',notes:'Enterprise deal',createdDate:'2026-04-23'},
]

// ── CREDENTIALS ───────────────────────────────────────────────────────────
const SUPER_ADMIN_USER = 'xplorix_superadmin'
const SUPER_ADMIN_PASS = 'XPLORIX@SuperAdmin2026#'

// ── HELPERS ───────────────────────────────────────────────────────────────
const statusColor: Record<string, string> = {
  Active:'#10B981', Trial:'#F59E0B', Suspended:'#EF4444', Expired:'#64748B',
  Received:'#10B981', Pending:'#F59E0B', Failed:'#EF4444',
  Paid:'#10B981', Approved:'#3B82F6', Cancelled:'#64748B',
  Draft:'#64748B', Sent:'#F59E0B', Accepted:'#3B82F6',
}
const statusBg: Record<string, string> = {
  Active:'rgba(16,185,129,0.1)', Trial:'rgba(245,158,11,0.1)', Suspended:'rgba(239,68,68,0.1)', Expired:'rgba(100,116,139,0.1)',
  Received:'rgba(16,185,129,0.1)', Pending:'rgba(245,158,11,0.1)', Failed:'rgba(239,68,68,0.1)',
  Paid:'rgba(16,185,129,0.1)', Approved:'rgba(59,130,246,0.1)', Cancelled:'rgba(100,116,139,0.1)',
  Draft:'rgba(100,116,139,0.1)', Sent:'rgba(245,158,11,0.1)', Accepted:'rgba(59,130,246,0.1)',
}
const Badge = ({s}:{s:string}) => (
  <span style={{fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:20,background:statusBg[s]||'rgba(100,116,139,0.1)',color:statusColor[s]||'#64748B',border:`1px solid ${statusColor[s]||'#64748B'}30`}}>{s}</span>
)
const fmt = (n:number,c='$') => `${c}${n.toLocaleString()}`

// ── LOGIN PAGE ─────────────────────────────────────────────────────────────
function LoginPage({onLogin}:{onLogin:()=>void}) {
  const [user,setUser]=useState('')
  const [pass,setPass]=useState('')
  const [show,setShow]=useState(false)
  const [err,setErr]=useState('')
  const [loading,setLoading]=useState(false)

  const handleLogin = async (e:React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    await new Promise(r=>setTimeout(r,800))
    if(user===SUPER_ADMIN_USER && pass===SUPER_ADMIN_PASS) {
      onLogin()
    } else {
      setErr('Invalid credentials. Access denied.')
      setLoading(false)
    }
  }

  return (
    <div style={{minHeight:'100vh',background:'#080B10',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Space Grotesk',sans-serif",position:'relative',overflow:'hidden'}}>
      <style dangerouslySetInnerHTML={{ __html: `@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700;800;900&display=swap');*{box-sizing:border-box;margin:0;padding:0;}@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}` }} />
      <div style={{position:'absolute',top:'-20%',left:'50%',transform:'translateX(-50%)',width:600,height:600,background:'radial-gradient(circle,rgba(249,115,22,0.06) 0%,transparent 65%)',borderRadius:'50%'}}/>
      <div style={{position:'absolute',inset:0,backgroundImage:'linear-gradient(rgba(30,41,59,0.1) 1px,transparent 1px),linear-gradient(90deg,rgba(30,41,59,0.1) 1px,transparent 1px)',backgroundSize:'50px 50px'}}/>
      <div style={{width:'100%',maxWidth:400,position:'relative',zIndex:10}}>
        {/* Logo */}
        <div style={{textAlign:'center',marginBottom:32}}>
          <div style={{display:'inline-flex',alignItems:'center',gap:8,padding:'6px 14px',borderRadius:8,background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',marginBottom:16}}>
            <span style={{fontSize:12}}>🔐</span>
            <span style={{fontSize:11,fontWeight:700,color:'#EF4444',letterSpacing:'0.1em'}}>RESTRICTED ACCESS</span>
          </div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10,marginBottom:8}}>
            <svg width="36" height="36" viewBox="0 0 100 100" fill="none">
              <polygon points="50,50 5,5 5,95" fill="#1a1a1a"/>
              <polygon points="50,50 5,5 30,5" fill="#2a2a2a"/>
              <polygon points="50,50 5,95 30,95" fill="#2a2a2a"/>
              <polygon points="50,50 95,5 95,95" fill="#F97316"/>
              <polygon points="50,50 95,5 70,5" fill="#EA580C"/>
              <polygon points="50,50 95,95 70,95" fill="#EA580C"/>
            </svg>
            <div style={{textAlign:'left'}}>
              <div style={{fontSize:18,fontWeight:800,color:'#F8FAFC',letterSpacing:'0.06em'}}>XPLORIX</div>
              <div style={{fontSize:8,color:'#64748B',letterSpacing:'0.18em',textTransform:'uppercase'}}>Super Admin Portal</div>
            </div>
          </div>
          <h1 style={{fontSize:22,fontWeight:800,color:'#F8FAFC',marginBottom:6}}>Super Admin Login</h1>
          <p style={{fontSize:13,color:'#64748B'}}>Internal use only — ANMAK CONSULTANCY SERVICES</p>
        </div>

        <div style={{background:'#0D1117',border:'1px solid #1E293B',borderRadius:18,padding:28,boxShadow:'0 32px 80px rgba(0,0,0,0.5)'}}>
          <form onSubmit={handleLogin}>
            <div style={{marginBottom:14}}>
              <label style={{fontSize:10,fontWeight:700,color:'#64748B',letterSpacing:'0.1em',textTransform:'uppercase',display:'block',marginBottom:6}}>Username</label>
              <input type="text" value={user} onChange={e=>setUser(e.target.value)} required
                placeholder="Enter username"
                style={{width:'100%',padding:'11px 13px',borderRadius:9,border:'1px solid #1E293B',background:'rgba(255,255,255,0.03)',color:'#F8FAFC',fontFamily:'inherit',fontSize:13,outline:'none'}}
                onFocus={e=>{e.target.style.borderColor='rgba(249,115,22,0.5)'}} onBlur={e=>{e.target.style.borderColor='#1E293B'}}/>
            </div>
            <div style={{marginBottom:20}}>
              <label style={{fontSize:10,fontWeight:700,color:'#64748B',letterSpacing:'0.1em',textTransform:'uppercase',display:'block',marginBottom:6}}>Password</label>
              <div style={{position:'relative'}}>
                <input type={show?'text':'password'} value={pass} onChange={e=>setPass(e.target.value)} required
                  placeholder="Enter password"
                  style={{width:'100%',padding:'11px 40px 11px 13px',borderRadius:9,border:'1px solid #1E293B',background:'rgba(255,255,255,0.03)',color:'#F8FAFC',fontFamily:'inherit',fontSize:13,outline:'none'}}
                  onFocus={e=>{e.target.style.borderColor='rgba(249,115,22,0.5)'}} onBlur={e=>{e.target.style.borderColor='#1E293B'}}/>
                <button type="button" aria-label={show ? 'Hide password' : 'Show password'} onClick={()=>setShow(!show)} style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',color:'#64748B',cursor:'pointer',fontSize:14}}>
                  {show ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
                </button>
              </div>
            </div>
            {err && <div style={{padding:'9px 12px',background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:8,fontSize:12,color:'#EF4444',marginBottom:16}}>{err}</div>}
            <button type="submit" disabled={loading}
              style={{width:'100%',padding:'12px',borderRadius:10,border:'none',cursor:loading?'not-allowed':'pointer',fontFamily:'inherit',fontSize:14,fontWeight:700,color:'#fff',background:loading?'#334155':'linear-gradient(135deg,#F97316,#EA580C)',boxShadow:'0 4px 20px rgba(249,115,22,0.3)',transition:'all 0.2s',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
              {loading?<><span style={{width:14,height:14,border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'#fff',borderRadius:'50%',display:'inline-block',animation:'spin 0.7s linear infinite'}}/>Authenticating...</>:'🔐 Access Super Admin'}
            </button>
          </form>
        </div>
        <p style={{textAlign:'center',fontSize:11,color:'#1E293B',marginTop:16}}>ANMAK CONSULTANCY SERVICES PRIVATE LIMITED · Internal Only</p>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}` }} />
    </div>
  )
}

// ── MAIN DASHBOARD ─────────────────────────────────────────────────────────
export default function SuperAdmin() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [companies, setCompanies] = useState<Company[]>(COMPANIES)
  const [payments] = useState<Payment[]>(PAYMENTS)
  const [quotes, setQuotes] = useState<Quote[]>(QUOTES)
  const [reps, setReps] = useState<Rep[]>(REPS)
  const [commissions, setCommissions] = useState<Commission[]>(COMMISSIONS)

  // Filters
  const [companyFilter, setCompanyFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [rigFilter, setRigFilter] = useState('all')

  // Modals
  const [selectedCompany, setSelectedCompany] = useState<Company|null>(null)
  const [showAddRep, setShowAddRep] = useState(false)
  const [showAddQuote, setShowAddQuote] = useState(false)
  const [showAddPayment, setShowAddPayment] = useState(false)
  const [showAddCommission, setShowAddCommission] = useState(false)

  if (!loggedIn) return <LoginPage onLogin={()=>setLoggedIn(true)}/>

  // ── KPIs ──
  const totalRevenue = payments.filter(p=>p.status==='Received').reduce((s,p)=>s+p.amount,0)
  const pendingPayments = quotes.filter(q=>q.status==='Sent').reduce((s,q)=>s+q.amount,0)
  const totalCommEarned = commissions.reduce((s,c)=>s+c.amount,0)
  const totalCommPaid = commissions.filter(c=>c.status==='Paid').reduce((s,c)=>s+c.amount,0)
  const commOutstanding = totalCommEarned - totalCommPaid

  const tabs = [
    {id:'overview',   label:'Overview',    icon:'📊'},
    {id:'companies',  label:'Companies',   icon:'🏢'},
    {id:'rigs',       label:'Rigs',        icon:'🔩'},
    {id:'billing',    label:'Billing',     icon:'💰'},
    {id:'commissions',label:'Commissions', icon:'💸'},
    {id:'trials',     label:'Trials',      icon:'⏱'},
  ]

  const inputStyle:React.CSSProperties = {width:'100%',padding:'9px 11px',borderRadius:8,border:'1px solid #1E293B',background:'rgba(255,255,255,0.03)',color:'#F8FAFC',fontFamily:'inherit',fontSize:12,outline:'none'}
  const labelStyle:React.CSSProperties = {fontSize:10,fontWeight:700,color:'#64748B',letterSpacing:'0.1em',textTransform:'uppercase',display:'block',marginBottom:5}

  const getCompanyName = (id:string) => companies.find(c=>c.id===id)?.name || id
  const getRepName = (id:string) => reps.find(r=>r.id===id)?.name || id

  const filteredCompanies = companies.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    if (rigFilter === '1-5' && !(c.rigs>=1&&c.rigs<=5)) return false
    if (rigFilter === '6-15' && !(c.rigs>=6&&c.rigs<=15)) return false
    if (rigFilter === '16+' && c.rigs<16) return false
    return true
  })

  // ── ACTION HANDLERS ──
  const activateCompany = (id:string) => setCompanies(prev=>prev.map(c=>c.id===id?{...c,status:'Active'}:c))
  const suspendCompany  = (id:string) => setCompanies(prev=>prev.map(c=>c.id===id?{...c,status:'Suspended'}:c))
  const extendTrial     = (id:string) => setCompanies(prev=>prev.map(c=>c.id===id?{...c,trialExpiry:new Date(new Date(c.trialExpiry).getTime()+15*24*60*60*1000).toISOString().split('T')[0]}:c))
  const approveCommission = (id:string) => setCommissions(prev=>prev.map(c=>c.id===id?{...c,status:'Approved',approvedDate:new Date().toISOString().split('T')[0]}:c))
  const payCommission   = (id:string) => setCommissions(prev=>prev.map(c=>c.id===id?{...c,status:'Paid',paidDate:new Date().toISOString().split('T')[0]}:c))

  const P = 'max(16px, calc(50vw - 680px))'

  return (
    <div style={{fontFamily:"'Space Grotesk',sans-serif",background:'#080B10',color:'#F8FAFC',minHeight:'100vh'}}>
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700;800;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:3px;height:3px;}::-webkit-scrollbar-track{background:#080B10;}::-webkit-scrollbar-thumb{background:#1E293B;border-radius:2px;}
        table{border-collapse:collapse;width:100%;}
        th{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);padding:10px 12px;text-align:left;font-size:10px;font-weight:700;color:#64748B;letter-spacing:0.08em;text-transform:uppercase;white-space:nowrap;}
        td{border:1px solid rgba(255,255,255,0.04);padding:10px 12px;font-size:12px;color:#94A3B8;vertical-align:middle;}
        tr:hover td{background:rgba(255,255,255,0.02);}
        select option{background:#0D1117;}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
      ` }} />

      {/* TOP NAV */}
      <nav style={{background:'#0D1117',borderBottom:'1px solid rgba(249,115,22,0.1)',padding:`12px ${P}`,display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <svg width="32" height="32" viewBox="0 0 100 100" fill="none">
            <polygon points="50,50 5,5 5,95" fill="#1a1a1a"/>
            <polygon points="50,50 5,5 30,5" fill="#2a2a2a"/>
            <polygon points="50,50 5,95 30,95" fill="#2a2a2a"/>
            <polygon points="50,50 95,5 95,95" fill="#F97316"/>
            <polygon points="50,50 95,5 70,5" fill="#EA580C"/>
            <polygon points="50,50 95,95 70,95" fill="#EA580C"/>
          </svg>
          <div>
            <div style={{fontSize:14,fontWeight:800,color:'#F8FAFC',letterSpacing:'0.06em'}}>XPLORIX</div>
            <div style={{fontSize:8,color:'#F97316',letterSpacing:'0.15em',textTransform:'uppercase',fontWeight:700}}>Super Admin Portal</div>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          <div style={{display:'flex',alignItems:'center',gap:6,padding:'5px 12px',borderRadius:20,background:'rgba(249,115,22,0.08)',border:'1px solid rgba(249,115,22,0.2)'}}>
            <span style={{width:6,height:6,borderRadius:'50%',background:'#10B981',display:'inline-block',animation:'pulse 1.5s infinite'}}/>
            <span style={{fontSize:11,fontWeight:700,color:'#F97316'}}>ANMAK CONSULTANCY</span>
          </div>
          <div style={{fontSize:12,color:'#64748B'}}>👤 Super Admin</div>
          <button onClick={()=>setLoggedIn(false)} style={{padding:'6px 14px',borderRadius:8,border:'1px solid rgba(239,68,68,0.2)',background:'rgba(239,68,68,0.06)',color:'#EF4444',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>
            Logout
          </button>
        </div>
      </nav>

      {/* TABS */}
      <div style={{background:'#0D1117',borderBottom:'1px solid rgba(255,255,255,0.06)',padding:`0 ${P}`}}>
        <div style={{display:'flex',gap:4,overflowX:'auto'}}>
          {tabs.map(tab=>(
            <button key={tab.id} onClick={()=>setActiveTab(tab.id)}
              style={{display:'flex',alignItems:'center',gap:6,padding:'14px 16px',border:'none',background:'none',cursor:'pointer',fontSize:13,fontWeight:activeTab===tab.id?700:500,color:activeTab===tab.id?'#F97316':'#64748B',borderBottom:activeTab===tab.id?'2px solid #F97316':'2px solid transparent',transition:'all 0.2s',whiteSpace:'nowrap',fontFamily:'inherit'}}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* CONTENT */}
      <div style={{padding:`28px ${P}`}}>

        {/* ── OVERVIEW ── */}
        {activeTab==='overview' && (
          <div>
            <div style={{marginBottom:24}}>
              <h2 style={{fontSize:20,fontWeight:800,marginBottom:4}}>Platform Overview</h2>
              <p style={{fontSize:13,color:'#64748B'}}>Live snapshot of all companies, revenue and commissions</p>
            </div>

            {/* KPI Grid */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:24}}>
              {[
                {label:'Total Companies',     value:companies.length,                                   icon:'🏢', color:'#3B82F6', sub:`${companies.filter(c=>c.status==='Active').length} active`},
                {label:'Total Rigs',          value:companies.reduce((s,c)=>s+c.rigs,0),               icon:'🔩', color:'#10B981', sub:'across all companies'},
                {label:'Total Revenue',       value:`$${(totalRevenue/1000).toFixed(0)}K`,              icon:'💰', color:'#F97316', sub:`${fmt(pendingPayments)} pending`},
                {label:'Trial Companies',     value:companies.filter(c=>c.status==='Trial').length,      icon:'⏱', color:'#F59E0B', sub:'need follow up'},
                {label:'Active Companies',    value:companies.filter(c=>c.status==='Active').length,     icon:'✅', color:'#10B981', sub:'paying customers'},
                {label:'Suspended',           value:companies.filter(c=>c.status==='Suspended').length,  icon:'⛔', color:'#EF4444', sub:'need attention'},
                {label:'Commission Earned',   value:`$${(totalCommEarned/1000).toFixed(1)}K`,           icon:'💸', color:'#8B5CF6', sub:`$${(commOutstanding/1000).toFixed(1)}K outstanding`},
                {label:'Active Reps',         value:reps.filter(r=>r.status==='Active').length,          icon:'👥', color:'#60A5FA', sub:`${reps.length} total reps`},
              ].map((kpi,i)=>(
                <div key={i} style={{background:'rgba(13,17,23,0.8)',border:`1px solid ${kpi.color}20`,borderRadius:12,padding:'16px 18px',position:'relative',overflow:'hidden'}}>
                  <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,${kpi.color},transparent)`}}/>
                  <div style={{fontSize:20,marginBottom:8}}>{kpi.icon}</div>
                  <div style={{fontSize:22,fontWeight:800,color:kpi.color,marginBottom:2}}>{kpi.value}</div>
                  <div style={{fontSize:11,fontWeight:600,color:'#F8FAFC',marginBottom:3}}>{kpi.label}</div>
                  <div style={{fontSize:10,color:'#64748B'}}>{kpi.sub}</div>
                </div>
              ))}
            </div>

            {/* Recent activity */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
              <div style={{background:'rgba(13,17,23,0.8)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:12,padding:20}}>
                <div style={{fontSize:13,fontWeight:700,color:'#F8FAFC',marginBottom:14}}>🏢 Recent Registrations</div>
                {[...companies].sort((a,b)=>b.registered.localeCompare(a.registered)).slice(0,5).map((c,i)=>(
                  <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                    <div>
                      <div style={{fontSize:12,fontWeight:600,color:'#F8FAFC'}}>{c.name}</div>
                      <div style={{fontSize:10,color:'#64748B'}}>{c.country} · {c.registered}</div>
                    </div>
                    <Badge s={c.status}/>
                  </div>
                ))}
              </div>
              <div style={{background:'rgba(13,17,23,0.8)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:12,padding:20}}>
                <div style={{fontSize:13,fontWeight:700,color:'#F8FAFC',marginBottom:14}}>💰 Recent Payments</div>
                {[...payments].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5).map((p,i)=>(
                  <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                    <div>
                      <div style={{fontSize:12,fontWeight:600,color:'#F8FAFC'}}>{getCompanyName(p.companyId)}</div>
                      <div style={{fontSize:10,color:'#64748B'}}>{p.date} · {p.method}</div>
                    </div>
                    <div style={{fontSize:13,fontWeight:700,color:'#10B981'}}>{p.currency} {p.amount.toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── COMPANIES ── */}
        {activeTab==='companies' && (
          <div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20,flexWrap:'wrap',gap:12}}>
              <div>
                <h2 style={{fontSize:20,fontWeight:800,marginBottom:4}}>Companies Management</h2>
                <p style={{fontSize:13,color:'#64748B'}}>{filteredCompanies.length} companies shown</p>
              </div>
              <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
                <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}
                  style={{...inputStyle,width:'auto',padding:'8px 12px'}}>
                  <option value="all">All Status</option>
                  {['Active','Trial','Suspended','Expired'].map(s=><option key={s} value={s}>{s}</option>)}
                </select>
                <select value={rigFilter} onChange={e=>setRigFilter(e.target.value)}
                  style={{...inputStyle,width:'auto',padding:'8px 12px'}}>
                  <option value="all">All Rigs</option>
                  <option value="1-5">1–5 Rigs</option>
                  <option value="6-15">6–15 Rigs</option>
                  <option value="16+">16+ Rigs</option>
                </select>
              </div>
            </div>
            <div style={{overflowX:'auto',borderRadius:12,border:'1px solid rgba(255,255,255,0.06)'}}>
              <table>
                <thead>
                  <tr>
                    <th>Company</th><th>Admin</th><th>Country</th><th>Plan</th>
                    <th>Status</th><th>Rigs</th><th>Users</th>
                    <th>Trial Expiry</th><th>Last Login</th><th>Rep</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCompanies.map(c=>(
                    <tr key={c.id}>
                      <td><div style={{fontWeight:600,color:'#F8FAFC',fontSize:12}}>{c.name}</div><div style={{fontSize:10,color:'#64748B'}}>{c.id}</div></td>
                      <td><div style={{fontSize:12,color:'#F8FAFC'}}>{c.adminName}</div><div style={{fontSize:10,color:'#64748B'}}>{c.email}</div></td>
                      <td>{c.country}</td>
                      <td><span style={{fontSize:11,fontWeight:600,color:'#F97316'}}>{c.plan}</span></td>
                      <td><Badge s={c.status}/></td>
                      <td><span style={{fontWeight:700,color:'#60A5FA'}}>{c.rigs}</span></td>
                      <td>{c.users}</td>
                      <td style={{fontSize:11}}>{c.trialExpiry}</td>
                      <td style={{fontSize:11}}>{c.lastLogin}</td>
                      <td style={{fontSize:11}}>{c.repId?getRepName(c.repId):'—'}</td>
                      <td>
                        <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                          {c.status!=='Active'&&<button onClick={()=>activateCompany(c.id)} style={{padding:'4px 9px',borderRadius:6,border:'1px solid rgba(16,185,129,0.3)',background:'rgba(16,185,129,0.08)',color:'#10B981',fontSize:10,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Activate</button>}
                          {c.status==='Active'&&<button onClick={()=>suspendCompany(c.id)} style={{padding:'4px 9px',borderRadius:6,border:'1px solid rgba(239,68,68,0.3)',background:'rgba(239,68,68,0.08)',color:'#EF4444',fontSize:10,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Suspend</button>}
                          {(c.status==='Trial')&&<button onClick={()=>extendTrial(c.id)} style={{padding:'4px 9px',borderRadius:6,border:'1px solid rgba(245,158,11,0.3)',background:'rgba(245,158,11,0.08)',color:'#F59E0B',fontSize:10,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>+15 days</button>}
                          <button onClick={()=>setSelectedCompany(c)} style={{padding:'4px 9px',borderRadius:6,border:'1px solid rgba(59,130,246,0.3)',background:'rgba(59,130,246,0.08)',color:'#3B82F6',fontSize:10,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>View</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Company detail modal */}
            {selectedCompany && (
              <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:20}} onClick={()=>setSelectedCompany(null)}>
                <div style={{background:'#0D1117',border:'1px solid rgba(249,115,22,0.2)',borderRadius:16,padding:28,maxWidth:560,width:'100%',maxHeight:'80vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20}}>
                    <div>
                      <h3 style={{fontSize:16,fontWeight:800,color:'#F8FAFC',marginBottom:4}}>{selectedCompany.name}</h3>
                      <div style={{fontSize:11,color:'#64748B'}}>{selectedCompany.id} · {selectedCompany.country}</div>
                    </div>
                    <div style={{display:'flex',gap:8,alignItems:'center'}}>
                      <Badge s={selectedCompany.status}/>
                      <button onClick={()=>setSelectedCompany(null)} style={{background:'none',border:'none',color:'#64748B',cursor:'pointer',fontSize:18}}>✕</button>
                    </div>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                    {[
                      ['Admin',selectedCompany.adminName],['Email',selectedCompany.email],
                      ['Phone',selectedCompany.phone],['Industry',selectedCompany.industry],
                      ['Plan',selectedCompany.plan],['Rigs',selectedCompany.rigs],
                      ['Users',selectedCompany.users],['Revenue',`$${selectedCompany.revenue.toLocaleString()}`],
                      ['Registered',selectedCompany.registered],['Last Login',selectedCompany.lastLogin],
                      ['Trial Expiry',selectedCompany.trialExpiry],['Rep',selectedCompany.repId?getRepName(selectedCompany.repId):'None'],
                    ].map(([k,v],i)=>(
                      <div key={i} style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:8,padding:'10px 12px'}}>
                        <div style={{fontSize:10,color:'#64748B',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>{k}</div>
                        <div style={{fontSize:13,fontWeight:600,color:'#F8FAFC'}}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{display:'flex',gap:8,marginTop:16,flexWrap:'wrap'}}>
                    {selectedCompany.status!=='Active'&&<button onClick={()=>{activateCompany(selectedCompany.id);setSelectedCompany(null)}} style={{flex:1,padding:'9px',borderRadius:8,border:'none',background:'linear-gradient(135deg,#10B981,#059669)',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>✅ Activate Account</button>}
                    {selectedCompany.status==='Active'&&<button onClick={()=>{suspendCompany(selectedCompany.id);setSelectedCompany(null)}} style={{flex:1,padding:'9px',borderRadius:8,border:'none',background:'linear-gradient(135deg,#EF4444,#DC2626)',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>⛔ Suspend Account</button>}
                    {selectedCompany.status==='Trial'&&<button onClick={()=>{extendTrial(selectedCompany.id)}} style={{flex:1,padding:'9px',borderRadius:8,border:'1px solid rgba(245,158,11,0.3)',background:'rgba(245,158,11,0.1)',color:'#F59E0B',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>⏱ Extend Trial +15 days</button>}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── RIGS ── */}
        {activeTab==='rigs' && (
          <div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20,flexWrap:'wrap',gap:12}}>
              <div>
                <h2 style={{fontSize:20,fontWeight:800,marginBottom:4}}>Rigs Management</h2>
                <p style={{fontSize:13,color:'#64748B'}}>All rigs across all companies</p>
              </div>
              <select value={companyFilter} onChange={e=>setCompanyFilter(e.target.value)}
                style={{...inputStyle,width:'auto',padding:'8px 12px'}}>
                <option value="all">All Companies</option>
                {companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div style={{overflowX:'auto',borderRadius:12,border:'1px solid rgba(255,255,255,0.06)'}}>
              <table>
                <thead>
                  <tr><th>Company</th><th>Country</th><th>Plan</th><th>Status</th><th>Rigs Count</th><th>Users</th><th>Last Login</th><th>Revenue</th></tr>
                </thead>
                <tbody>
                  {companies.filter(c=>companyFilter==='all'||c.id===companyFilter).map(c=>(
                    <tr key={c.id}>
                      <td><div style={{fontWeight:600,color:'#F8FAFC'}}>{c.name}</div><div style={{fontSize:10,color:'#64748B'}}>{c.email}</div></td>
                      <td>{c.country}</td>
                      <td><span style={{color:'#F97316',fontWeight:600}}>{c.plan}</span></td>
                      <td><Badge s={c.status}/></td>
                      <td>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <div style={{height:6,width:Math.min(c.rigs*4,100),background:'linear-gradient(90deg,#F97316,#F59E0B)',borderRadius:3}}/>
                          <span style={{fontWeight:700,color:'#60A5FA'}}>{c.rigs}</span>
                        </div>
                      </td>
                      <td>{c.users}</td>
                      <td style={{fontSize:11}}>{c.lastLogin}</td>
                      <td style={{fontWeight:700,color:'#10B981'}}>${c.revenue.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Rig summary */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginTop:20}}>
              {[
                {label:'Total Rigs',   value:companies.reduce((s,c)=>s+c.rigs,0),        color:'#F97316'},
                {label:'Active Rigs',  value:companies.filter(c=>c.status==='Active').reduce((s,c)=>s+c.rigs,0),color:'#10B981'},
                {label:'Trial Rigs',   value:companies.filter(c=>c.status==='Trial').reduce((s,c)=>s+c.rigs,0), color:'#F59E0B'},
                {label:'Avg per Company',value:Math.round(companies.reduce((s,c)=>s+c.rigs,0)/companies.length),color:'#3B82F6'},
              ].map((s,i)=>(
                <div key={i} style={{background:'rgba(13,17,23,0.8)',border:`1px solid ${s.color}20`,borderRadius:10,padding:'14px 16px',textAlign:'center'}}>
                  <div style={{fontSize:26,fontWeight:800,color:s.color}}>{s.value}</div>
                  <div style={{fontSize:11,color:'#64748B',marginTop:4}}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── BILLING ── */}
        {activeTab==='billing' && (
          <div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20,flexWrap:'wrap',gap:12}}>
              <div>
                <h2 style={{fontSize:20,fontWeight:800,marginBottom:4}}>Billing & Payments</h2>
                <p style={{fontSize:13,color:'#64748B'}}>Quotes, payments and revenue tracking</p>
              </div>
              <div style={{display:'flex',gap:10}}>
                <button onClick={()=>setShowAddQuote(true)} style={{padding:'9px 18px',borderRadius:9,border:'1px solid rgba(59,130,246,0.3)',background:'rgba(59,130,246,0.08)',color:'#3B82F6',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>+ New Quote</button>
                <button onClick={()=>setShowAddPayment(true)} style={{padding:'9px 18px',borderRadius:9,border:'none',background:'linear-gradient(135deg,#F97316,#EA580C)',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>+ Record Payment</button>
              </div>
            </div>

            {/* Revenue KPIs */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:24}}>
              {[
                {label:'Total Revenue',  value:`$${totalRevenue.toLocaleString()}`,  color:'#10B981'},
                {label:'Pending Quotes', value:`$${pendingPayments.toLocaleString()}`,color:'#F59E0B'},
                {label:'Total Payments', value:payments.length,                       color:'#3B82F6'},
                {label:'Active Quotes',  value:quotes.filter(q=>q.status==='Sent').length,color:'#F97316'},
              ].map((k,i)=>(
                <div key={i} style={{background:'rgba(13,17,23,0.8)',border:`1px solid ${k.color}20`,borderRadius:10,padding:'14px 16px'}}>
                  <div style={{fontSize:22,fontWeight:800,color:k.color,marginBottom:4}}>{k.value}</div>
                  <div style={{fontSize:11,color:'#64748B'}}>{k.label}</div>
                </div>
              ))}
            </div>

            {/* Quotes */}
            <div style={{marginBottom:24}}>
              <div style={{fontSize:14,fontWeight:700,color:'#F8FAFC',marginBottom:12}}>📋 Quotes</div>
              <div style={{overflowX:'auto',borderRadius:10,border:'1px solid rgba(255,255,255,0.06)'}}>
                <table>
                  <thead><tr><th>Company</th><th>Plan</th><th>Rigs</th><th>Amount</th><th>Currency</th><th>Valid Until</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
                  <tbody>
                    {quotes.map(q=>(
                      <tr key={q.id}>
                        <td style={{fontWeight:600,color:'#F8FAFC'}}>{getCompanyName(q.companyId)}</td>
                        <td>{q.plan}</td><td style={{color:'#60A5FA',fontWeight:700}}>{q.rigs}</td>
                        <td style={{fontWeight:700,color:'#F97316'}}>{q.amount.toLocaleString()}</td>
                        <td>{q.currency}</td><td style={{fontSize:11}}>{q.validUntil}</td>
                        <td><Badge s={q.status}/></td><td style={{fontSize:11}}>{q.createdDate}</td>
                        <td>
                          {q.status==='Sent'&&<button onClick={()=>setQuotes(prev=>prev.map(x=>x.id===q.id?{...x,status:'Accepted'}:x))} style={{padding:'4px 9px',borderRadius:6,border:'1px solid rgba(16,185,129,0.3)',background:'rgba(16,185,129,0.08)',color:'#10B981',fontSize:10,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Mark Accepted</button>}
                          {q.status==='Draft'&&<button onClick={()=>setQuotes(prev=>prev.map(x=>x.id===q.id?{...x,status:'Sent'}:x))} style={{padding:'4px 9px',borderRadius:6,border:'1px solid rgba(249,115,22,0.3)',background:'rgba(249,115,22,0.08)',color:'#F97316',fontSize:10,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Send Quote</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Payments */}
            <div>
              <div style={{fontSize:14,fontWeight:700,color:'#F8FAFC',marginBottom:12}}>💳 Payment Records</div>
              <div style={{overflowX:'auto',borderRadius:10,border:'1px solid rgba(255,255,255,0.06)'}}>
                <table>
                  <thead><tr><th>Company</th><th>Amount</th><th>Currency</th><th>Method</th><th>Reference</th><th>Date</th><th>Status</th><th>Recorded By</th><th>Notes</th></tr></thead>
                  <tbody>
                    {payments.map(p=>(
                      <tr key={p.id}>
                        <td style={{fontWeight:600,color:'#F8FAFC'}}>{getCompanyName(p.companyId)}</td>
                        <td style={{fontWeight:700,color:'#10B981'}}>{p.amount.toLocaleString()}</td>
                        <td>{p.currency}</td><td>{p.method}</td>
                        <td style={{fontSize:11,fontFamily:'monospace'}}>{p.reference}</td>
                        <td style={{fontSize:11}}>{p.date}</td>
                        <td><Badge s={p.status}/></td>
                        <td style={{color:'#F97316',fontWeight:600}}>{p.recordedBy}</td>
                        <td style={{fontSize:11,maxWidth:160}}>{p.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── COMMISSIONS ── */}
        {activeTab==='commissions' && (
          <div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20,flexWrap:'wrap',gap:12}}>
              <div>
                <h2 style={{fontSize:20,fontWeight:800,marginBottom:4}}>Commission Management</h2>
                <p style={{fontSize:13,color:'#64748B'}}>Sales reps, partners and commission tracking</p>
              </div>
              <div style={{display:'flex',gap:10}}>
                <button onClick={()=>setShowAddRep(true)} style={{padding:'9px 18px',borderRadius:9,border:'1px solid rgba(139,92,246,0.3)',background:'rgba(139,92,246,0.08)',color:'#8B5CF6',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>+ Add Rep</button>
                <button onClick={()=>setShowAddCommission(true)} style={{padding:'9px 18px',borderRadius:9,border:'none',background:'linear-gradient(135deg,#F97316,#EA580C)',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>+ Record Commission</button>
              </div>
            </div>

            {/* Commission KPIs */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:24}}>
              {[
                {label:'Total Earned',    value:`$${totalCommEarned.toLocaleString()}`, color:'#8B5CF6'},
                {label:'Total Paid',      value:`$${totalCommPaid.toLocaleString()}`,   color:'#10B981'},
                {label:'Outstanding',     value:`$${commOutstanding.toLocaleString()}`, color:'#F59E0B'},
                {label:'Active Reps',     value:reps.filter(r=>r.status==='Active').length,color:'#3B82F6'},
              ].map((k,i)=>(
                <div key={i} style={{background:'rgba(13,17,23,0.8)',border:`1px solid ${k.color}20`,borderRadius:10,padding:'14px 16px'}}>
                  <div style={{fontSize:22,fontWeight:800,color:k.color,marginBottom:4}}>{k.value}</div>
                  <div style={{fontSize:11,color:'#64748B'}}>{k.label}</div>
                </div>
              ))}
            </div>

            {/* Reps table */}
            <div style={{marginBottom:24}}>
              <div style={{fontSize:14,fontWeight:700,color:'#F8FAFC',marginBottom:12}}>👥 Representatives</div>
              <div style={{overflowX:'auto',borderRadius:10,border:'1px solid rgba(255,255,255,0.06)'}}>
                <table>
                  <thead><tr><th>Name</th><th>Type</th><th>Phone</th><th>Status</th><th>Rate</th><th>Deals</th><th>Earned</th><th>Paid</th><th>Outstanding</th><th>Joined</th></tr></thead>
                  <tbody>
                    {reps.map(r=>(
                      <tr key={r.id}>
                        <td><div style={{fontWeight:600,color:'#F8FAFC'}}>{r.name}</div><div style={{fontSize:10,color:'#64748B'}}>{r.email}</div></td>
                        <td><span style={{fontSize:10,fontWeight:600,padding:'3px 8px',borderRadius:20,background:'rgba(139,92,246,0.1)',color:'#8B5CF6',border:'1px solid rgba(139,92,246,0.2)'}}>{r.type}</span></td>
                        <td style={{fontSize:11}}>{r.phone}</td>
                        <td><Badge s={r.status}/></td>
                        <td><span style={{fontWeight:700,color:'#F97316'}}>{r.commissionRate}{r.commissionType==='Percentage'?'%':' fixed'}</span></td>
                        <td style={{fontWeight:700,color:'#60A5FA'}}>{r.totalDeals}</td>
                        <td style={{fontWeight:700,color:'#8B5CF6'}}>${r.totalEarned.toLocaleString()}</td>
                        <td style={{fontWeight:700,color:'#10B981'}}>${r.totalPaid.toLocaleString()}</td>
                        <td style={{fontWeight:700,color:r.totalEarned-r.totalPaid>0?'#F59E0B':'#64748B'}}>${(r.totalEarned-r.totalPaid).toLocaleString()}</td>
                        <td style={{fontSize:11}}>{r.joinedDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Commission records */}
            <div>
              <div style={{fontSize:14,fontWeight:700,color:'#F8FAFC',marginBottom:12}}>💸 Commission Records</div>
              <div style={{overflowX:'auto',borderRadius:10,border:'1px solid rgba(255,255,255,0.06)'}}>
                <table>
                  <thead><tr><th>Rep</th><th>Company</th><th>Deal Value</th><th>Rate</th><th>Commission</th><th>Status</th><th>Approved</th><th>Paid Date</th><th>Reference</th><th>Actions</th></tr></thead>
                  <tbody>
                    {commissions.map(c=>(
                      <tr key={c.id}>
                        <td style={{fontWeight:600,color:'#F8FAFC'}}>{getRepName(c.repId)}</td>
                        <td style={{fontSize:11}}>{getCompanyName(c.companyId)}</td>
                        <td style={{fontWeight:700,color:'#60A5FA'}}>${c.dealValue.toLocaleString()}</td>
                        <td>{c.rate}{c.type==='Percentage'?'%':' fixed'}</td>
                        <td style={{fontWeight:700,color:'#8B5CF6'}}>${c.amount.toLocaleString()}</td>
                        <td><Badge s={c.status}/></td>
                        <td style={{fontSize:11}}>{c.approvedDate||'—'}</td>
                        <td style={{fontSize:11}}>{c.paidDate||'—'}</td>
                        <td style={{fontSize:11,fontFamily:'monospace'}}>{c.reference||'—'}</td>
                        <td>
                          <div style={{display:'flex',gap:5}}>
                            {c.status==='Pending'&&<button onClick={()=>approveCommission(c.id)} style={{padding:'4px 9px',borderRadius:6,border:'1px solid rgba(59,130,246,0.3)',background:'rgba(59,130,246,0.08)',color:'#3B82F6',fontSize:10,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Approve</button>}
                            {c.status==='Approved'&&<button onClick={()=>payCommission(c.id)} style={{padding:'4px 9px',borderRadius:6,border:'1px solid rgba(16,185,129,0.3)',background:'rgba(16,185,129,0.08)',color:'#10B981',fontSize:10,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Mark Paid</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── TRIALS ── */}
        {activeTab==='trials' && (
          <div>
            <div style={{marginBottom:20}}>
              <h2 style={{fontSize:20,fontWeight:800,marginBottom:4}}>Trial Management</h2>
              <p style={{fontSize:13,color:'#64748B'}}>All companies currently on free trial</p>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:24}}>
              {companies.filter(c=>c.status==='Trial').map(c=>{
                const daysLeft = Math.ceil((new Date(c.trialExpiry).getTime()-Date.now())/(1000*60*60*24))
                const urgent = daysLeft<=3
                return (
                  <div key={c.id} style={{background:'rgba(13,17,23,0.8)',border:`1px solid ${urgent?'rgba(239,68,68,0.3)':'rgba(245,158,11,0.2)'}`,borderRadius:12,padding:18,position:'relative',overflow:'hidden'}}>
                    <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:urgent?'linear-gradient(90deg,#EF4444,transparent)':'linear-gradient(90deg,#F59E0B,transparent)'}}/>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
                      <div>
                        <div style={{fontSize:13,fontWeight:700,color:'#F8FAFC',marginBottom:2}}>{c.name}</div>
                        <div style={{fontSize:11,color:'#64748B'}}>{c.country} · {c.industry}</div>
                      </div>
                      <div style={{fontSize:20,fontWeight:900,color:urgent?'#EF4444':'#F59E0B'}}>{daysLeft}d</div>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
                      {[['Admin',c.adminName],['Rigs',c.rigs],['Users',c.users],['Registered',c.registered]].map(([k,v],i)=>(
                        <div key={i}><div style={{fontSize:9,color:'#64748B',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em'}}>{k}</div><div style={{fontSize:12,color:'#F8FAFC',fontWeight:600}}>{v}</div></div>
                      ))}
                    </div>
                    <div style={{display:'flex',gap:8}}>
                      <button onClick={()=>extendTrial(c.id)} style={{flex:1,padding:'7px',borderRadius:7,border:'1px solid rgba(245,158,11,0.3)',background:'rgba(245,158,11,0.08)',color:'#F59E0B',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>+15 Days</button>
                      <button onClick={()=>activateCompany(c.id)} style={{flex:1,padding:'7px',borderRadius:7,border:'none',background:'linear-gradient(135deg,#10B981,#059669)',color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Activate</button>
                    </div>
                  </div>
                )
              })}
            </div>
            {/* All expired */}
            {companies.filter(c=>c.status==='Expired'||c.status==='Suspended').length>0 && (
              <div>
                <div style={{fontSize:14,fontWeight:700,color:'#EF4444',marginBottom:12}}>⛔ Suspended / Expired Accounts</div>
                <div style={{overflowX:'auto',borderRadius:10,border:'1px solid rgba(239,68,68,0.1)'}}>
                  <table>
                    <thead><tr><th>Company</th><th>Country</th><th>Status</th><th>Rigs</th><th>Last Login</th><th>Action</th></tr></thead>
                    <tbody>
                      {companies.filter(c=>c.status==='Expired'||c.status==='Suspended').map(c=>(
                        <tr key={c.id}>
                          <td style={{fontWeight:600,color:'#F8FAFC'}}>{c.name}</td>
                          <td>{c.country}</td><td><Badge s={c.status}/></td>
                          <td style={{color:'#60A5FA',fontWeight:700}}>{c.rigs}</td>
                          <td style={{fontSize:11}}>{c.lastLogin}</td>
                          <td><button onClick={()=>activateCompany(c.id)} style={{padding:'4px 9px',borderRadius:6,border:'1px solid rgba(16,185,129,0.3)',background:'rgba(16,185,129,0.08)',color:'#10B981',fontSize:10,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Reactivate</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── MODALS ── */}

      {/* Add Quote Modal */}
      {showAddQuote && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:20}} onClick={()=>setShowAddQuote(false)}>
          <div style={{background:'#0D1117',border:'1px solid rgba(59,130,246,0.2)',borderRadius:16,padding:28,maxWidth:480,width:'100%'}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
              <h3 style={{fontSize:16,fontWeight:800,color:'#F8FAFC'}}>Create New Quote</h3>
              <button onClick={()=>setShowAddQuote(false)} style={{background:'none',border:'none',color:'#64748B',cursor:'pointer',fontSize:18}}>✕</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              {[
                {label:'Company',type:'select',opts:companies.map(c=>({v:c.id,l:c.name}))},
                {label:'Plan',type:'select',opts:[{v:'Standard',l:'Standard'},{v:'Growth',l:'Growth'},{v:'Enterprise',l:'Enterprise'}]},
                {label:'No. of Rigs',type:'number'},{label:'Amount',type:'number'},
                {label:'Currency',type:'select',opts:[{v:'USD',l:'USD'},{v:'INR',l:'INR'},{v:'AUD',l:'AUD'},{v:'CAD',l:'CAD'}]},
                {label:'Valid Until',type:'date'},
              ].map((f,i)=>(
                <div key={i}>
                  <label style={labelStyle}>{f.label}</label>
                  {f.type==='select'
                    ? <select style={inputStyle}>{f.opts?.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}</select>
                    : <input type={f.type} style={inputStyle} onFocus={e=>{e.target.style.borderColor='rgba(249,115,22,0.5)'}} onBlur={e=>{e.target.style.borderColor='#1E293B'}}/>
                  }
                </div>
              ))}
            </div>
            <div style={{marginTop:12}}>
              <label style={labelStyle}>Notes</label>
              <textarea rows={2} style={{...inputStyle,resize:'vertical' as const}}/>
            </div>
            <div style={{display:'flex',gap:10,marginTop:16}}>
              <button onClick={()=>setShowAddQuote(false)} style={{flex:1,padding:'10px',borderRadius:9,border:'1px solid rgba(255,255,255,0.08)',background:'rgba(255,255,255,0.04)',color:'#94A3B8',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>Cancel</button>
              <button onClick={()=>setShowAddQuote(false)} style={{flex:1,padding:'10px',borderRadius:9,border:'none',background:'linear-gradient(135deg,#3B82F6,#2563EB)',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Create Quote</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Payment Modal */}
      {showAddPayment && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:20}} onClick={()=>setShowAddPayment(false)}>
          <div style={{background:'#0D1117',border:'1px solid rgba(16,185,129,0.2)',borderRadius:16,padding:28,maxWidth:480,width:'100%'}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
              <h3 style={{fontSize:16,fontWeight:800,color:'#F8FAFC'}}>Record Payment</h3>
              <button onClick={()=>setShowAddPayment(false)} style={{background:'none',border:'none',color:'#64748B',cursor:'pointer',fontSize:18}}>✕</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              {[
                {label:'Company',type:'select',opts:companies.map(c=>({v:c.id,l:c.name}))},
                {label:'Amount',type:'number'},
                {label:'Currency',type:'select',opts:[{v:'USD',l:'USD'},{v:'INR',l:'INR'},{v:'AUD',l:'AUD'},{v:'CAD',l:'CAD'}]},
                {label:'Payment Method',type:'select',opts:[{v:'NEFT',l:'NEFT'},{v:'IMPS',l:'IMPS'},{v:'UPI',l:'UPI'},{v:'Cheque',l:'Cheque'},{v:'Wire',l:'Wire Transfer'}]},
                {label:'Reference Number',type:'text'},{label:'Date Received',type:'date'},
                {label:'Recorded By',type:'text'},
              ].map((f,i)=>(
                <div key={i}>
                  <label style={labelStyle}>{f.label}</label>
                  {f.type==='select'
                    ? <select style={inputStyle}>{f.opts?.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}</select>
                    : <input type={f.type} style={inputStyle} onFocus={e=>{e.target.style.borderColor='rgba(249,115,22,0.5)'}} onBlur={e=>{e.target.style.borderColor='#1E293B'}}/>
                  }
                </div>
              ))}
            </div>
            <div style={{marginTop:12}}>
              <label style={labelStyle}>Notes</label>
              <textarea rows={2} style={{...inputStyle,resize:'vertical' as const}}/>
            </div>
            <div style={{marginTop:12,padding:'10px 12px',background:'rgba(16,185,129,0.06)',border:'1px solid rgba(16,185,129,0.15)',borderRadius:8}}>
              <div style={{fontSize:11,color:'#10B981',fontWeight:700}}>✅ Recording payment will automatically activate the company account</div>
            </div>
            <div style={{display:'flex',gap:10,marginTop:16}}>
              <button onClick={()=>setShowAddPayment(false)} style={{flex:1,padding:'10px',borderRadius:9,border:'1px solid rgba(255,255,255,0.08)',background:'rgba(255,255,255,0.04)',color:'#94A3B8',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>Cancel</button>
              <button onClick={()=>setShowAddPayment(false)} style={{flex:1,padding:'10px',borderRadius:9,border:'none',background:'linear-gradient(135deg,#10B981,#059669)',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Record Payment</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Rep Modal */}
      {showAddRep && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:20}} onClick={()=>setShowAddRep(false)}>
          <div style={{background:'#0D1117',border:'1px solid rgba(139,92,246,0.2)',borderRadius:16,padding:28,maxWidth:480,width:'100%'}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
              <h3 style={{fontSize:16,fontWeight:800,color:'#F8FAFC'}}>Add New Representative</h3>
              <button onClick={()=>setShowAddRep(false)} style={{background:'none',border:'none',color:'#64748B',cursor:'pointer',fontSize:18}}>✕</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              {[
                {label:'Full Name',type:'text'},{label:'Type',type:'select',opts:[{v:'External Rep',l:'External Rep'},{v:'Internal Sales',l:'Internal Sales'},{v:'Partner',l:'Partner'},{v:'Referral',l:'Referral'}]},
                {label:'Email',type:'email'},{label:'Phone',type:'tel'},
                {label:'Commission Rate',type:'number'},{label:'Commission Type',type:'select',opts:[{v:'Percentage',l:'Percentage (%)'},{v:'Fixed',l:'Fixed Amount'}]},
              ].map((f,i)=>(
                <div key={i}>
                  <label style={labelStyle}>{f.label}</label>
                  {f.type==='select'
                    ? <select style={inputStyle}>{f.opts?.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}</select>
                    : <input type={f.type} style={inputStyle} onFocus={e=>{e.target.style.borderColor='rgba(249,115,22,0.5)'}} onBlur={e=>{e.target.style.borderColor='#1E293B'}}/>
                  }
                </div>
              ))}
            </div>
            <div style={{display:'flex',gap:10,marginTop:16}}>
              <button onClick={()=>setShowAddRep(false)} style={{flex:1,padding:'10px',borderRadius:9,border:'1px solid rgba(255,255,255,0.08)',background:'rgba(255,255,255,0.04)',color:'#94A3B8',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>Cancel</button>
              <button onClick={()=>setShowAddRep(false)} style={{flex:1,padding:'10px',borderRadius:9,border:'none',background:'linear-gradient(135deg,#8B5CF6,#7C3AED)',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Add Representative</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Commission Modal */}
      {showAddCommission && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:20}} onClick={()=>setShowAddCommission(false)}>
          <div style={{background:'#0D1117',border:'1px solid rgba(249,115,22,0.2)',borderRadius:16,padding:28,maxWidth:480,width:'100%'}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
              <h3 style={{fontSize:16,fontWeight:800,color:'#F8FAFC'}}>Record Commission</h3>
              <button onClick={()=>setShowAddCommission(false)} style={{background:'none',border:'none',color:'#64748B',cursor:'pointer',fontSize:18}}>✕</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              {[
                {label:'Representative',type:'select',opts:reps.map(r=>({v:r.id,l:r.name}))},
                {label:'Company',type:'select',opts:companies.map(c=>({v:c.id,l:c.name}))},
                {label:'Deal Value',type:'number'},{label:'Commission Rate',type:'number'},
                {label:'Commission Type',type:'select',opts:[{v:'Percentage',l:'Percentage (%)'},{v:'Fixed',l:'Fixed Amount'}]},
                {label:'Commission Amount',type:'number'},
              ].map((f,i)=>(
                <div key={i}>
                  <label style={labelStyle}>{f.label}</label>
                  {f.type==='select'
                    ? <select style={inputStyle}>{f.opts?.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}</select>
                    : <input type={f.type} style={inputStyle} onFocus={e=>{e.target.style.borderColor='rgba(249,115,22,0.5)'}} onBlur={e=>{e.target.style.borderColor='#1E293B'}}/>
                  }
                </div>
              ))}
            </div>
            <div style={{marginTop:12}}>
              <label style={labelStyle}>Notes</label>
              <textarea rows={2} style={{...inputStyle,resize:'vertical' as const}}/>
            </div>
            <div style={{display:'flex',gap:10,marginTop:16}}>
              <button onClick={()=>setShowAddCommission(false)} style={{flex:1,padding:'10px',borderRadius:9,border:'1px solid rgba(255,255,255,0.08)',background:'rgba(255,255,255,0.04)',color:'#94A3B8',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>Cancel</button>
              <button onClick={()=>setShowAddCommission(false)} style={{flex:1,padding:'10px',borderRadius:9,border:'none',background:'linear-gradient(135deg,#F97316,#EA580C)',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Record Commission</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

