'use client'

import { useState } from 'react'
import { Download, Search, User, ChevronDown, Shield, Award, TrendingUp, CheckCircle, Clock, Star } from 'lucide-react'

// ── MOCK PEOPLE ────────────────────────────────────────────────────────────
const allPersonnel = [
  // Drillers
  { id:'DRL-001', name:'Mike Johnson',    role:'Senior Driller',      type:'Driller',    project:'Gold Mine A',    rig:'RIG-001', experience:'8 Years',  totalMeters:34986, totalShifts:452, totalHours:5418, avgROP:9.8,  efficiency:94, coreRecovery:97.4, downtime:186, safeShifts:452, ppeCompliance:100, grade:'A+', percentile:15, avatar:'MJ', avatarColor:'linear-gradient(135deg,#F97316,#F59E0B)' },
  { id:'DRL-002', name:'David Chen',      role:'Driller',             type:'Driller',    project:'Copper Site',    rig:'RIG-002', experience:'5 Years',  totalMeters:24580, totalShifts:318, totalHours:3816, avgROP:8.9,  efficiency:88, coreRecovery:94.2, downtime:240, safeShifts:316, ppeCompliance:98,  grade:'A',  percentile:28, avatar:'DC', avatarColor:'linear-gradient(135deg,#3B82F6,#60A5FA)' },
  { id:'DRL-003', name:'Robert Williams', role:'Junior Driller',      type:'Driller',    project:'Gold Mine A',    rig:'RIG-003', experience:'2 Years',  totalMeters:12450, totalShifts:164, totalHours:1968, avgROP:7.6,  efficiency:78, coreRecovery:91.0, downtime:320, safeShifts:160, ppeCompliance:96,  grade:'B+', percentile:45, avatar:'RW', avatarColor:'linear-gradient(135deg,#10B981,#34D399)' },
  { id:'DRL-004', name:'James Brown',     role:'Driller',             type:'Driller',    project:'Diamond Drill',  rig:'RIG-004', experience:'6 Years',  totalMeters:28740, totalShifts:386, totalHours:4632, avgROP:9.2,  efficiency:91, coreRecovery:96.1, downtime:198, safeShifts:384, ppeCompliance:99,  grade:'A',  percentile:22, avatar:'JB', avatarColor:'linear-gradient(135deg,#8B5CF6,#A78BFA)' },
  { id:'DRL-005', name:'Chris Martinez',  role:'Senior Driller',      type:'Driller',    project:'Copper Site',    rig:'RIG-005', experience:'10 Years', totalMeters:48200, totalShifts:580, totalHours:6960, avgROP:10.4, efficiency:96, coreRecovery:98.2, downtime:142, safeShifts:580, ppeCompliance:100, grade:'A+', percentile:8,  avatar:'CM', avatarColor:'linear-gradient(135deg,#F97316,#EA580C)' },
  // Supervisors
  { id:'SUP-001', name:'John Smith',      role:'Senior Supervisor',   type:'Supervisor', project:'Gold Mine A',    rig:'N/A',     experience:'12 Years', totalMeters:0,     totalShifts:520, totalHours:6240, avgROP:0,    efficiency:96, coreRecovery:0,    downtime:0,   safeShifts:520, ppeCompliance:100, grade:'A+', percentile:10, avatar:'JS', avatarColor:'linear-gradient(135deg,#0F172A,#334155)' },
  { id:'SUP-002', name:'Sarah Davis',     role:'Supervisor',          type:'Supervisor', project:'Copper Site',    rig:'N/A',     experience:'7 Years',  totalMeters:0,     totalShifts:360, totalHours:4320, avgROP:0,    efficiency:92, coreRecovery:0,    downtime:0,   safeShifts:358, ppeCompliance:99,  grade:'A',  percentile:20, avatar:'SD', avatarColor:'linear-gradient(135deg,#EC4899,#F472B6)' },
]

// ── STAR RATING ────────────────────────────────────────────────────────────
function Stars({ rating }: { rating: number }) {
  return (
    <span style={{ display:'inline-flex', gap:1 }}>
      {[1,2,3,4,5].map(i => (
        <svg key={i} width={12} height={12} viewBox="0 0 24 24" fill={i<=rating?'#F97316':'#E5E7EB'}>
          <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
        </svg>
      ))}
    </span>
  )
}

// ── XPLORIX LOGO SVG ───────────────────────────────────────────────────────
function XLogo({ size=40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <polygon points="50,50 5,5 5,95"   fill="#1a1a1a" />
      <polygon points="50,50 5,5 30,5"   fill="#333"    />
      <polygon points="50,50 5,95 30,95" fill="#333"    />
      <polygon points="50,50 95,5 95,95" fill="#F97316" />
      <polygon points="50,50 95,5 70,5"  fill="#EA580C" />
      <polygon points="50,50 95,95 70,95"fill="#EA580C" />
      <line x1="20" y1="20" x2="80" y2="80" stroke="white" strokeWidth="3" opacity="0.25"/>
      <line x1="80" y1="20" x2="20" y2="80" stroke="white" strokeWidth="3" opacity="0.25"/>
    </svg>
  )
}

// ── PROGRESS BAR ───────────────────────────────────────────────────────────
function Bar({ score, color='#F97316' }: { score: number; color?: string }) {
  return (
    <div style={{ background:'#F3F4F6', borderRadius:4, height:7, flex:1, overflow:'hidden' }}>
      <div style={{ width:`${score}%`, height:'100%', background:color, borderRadius:4 }} />
    </div>
  )
}

// ── GRADE BADGE ────────────────────────────────────────────────────────────
function Grade({ g }: { g: string }) {
  const c: Record<string,[string,string]> = { 'A+':['#FFF7ED','#EA580C'], 'A':['#FEF3C7','#D97706'], 'B+':['#F0FDF4','#16A34A'], 'B':['#EFF6FF','#2563EB'] }
  const [bg,text] = c[g]||c['A']
  return (
    <div style={{ width:72,height:72,borderRadius:10,background:bg,border:`2px solid ${text}`,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
      <div style={{ fontSize:26,fontWeight:900,color:text,lineHeight:1,fontFamily:"'Space Grotesk',sans-serif" }}>{g}</div>
      <div style={{ fontSize:8,color:text,fontWeight:700,marginTop:1 }}>GRADE</div>
    </div>
  )
}

type Person = typeof allPersonnel[0]

// ── REPORT COMPONENT ───────────────────────────────────────────────────────
function Report({ person, period }: { person: Person; period: string }) {
  const certId = `XPL-2026-${person.id}`
  const today = new Date().toLocaleDateString('en-AU',{day:'2-digit',month:'long',year:'numeric'})
  const isDriller = person.type === 'Driller'

  const ratings = [
    { label:'Efficiency',      score: person.efficiency,                              level: person.efficiency>=95?'Excellent':person.efficiency>=85?'Good':'Average' },
    { label:'Safety Record',   score: person.ppeCompliance,                           level: person.ppeCompliance>=99?'Perfect':'Excellent' },
    { label:'Attendance',      score: Math.round((person.safeShifts/Math.max(person.totalShifts,1))*100), level:'Excellent' },
    ...(isDriller ? [
      { label:'ROP Performance', score: Math.min(100,Math.round((person.avgROP/12)*100)),   level: person.avgROP>=9.5?'Excellent':person.avgROP>=8?'Good':'Average' },
      { label:'Core Recovery',   score: Math.round(person.coreRecovery),                     level: person.coreRecovery>=96?'Excellent':'Good' },
      { label:'Downtime Control',score: Math.max(0,100-Math.round((person.downtime/500)*100)),level:'Good' },
    ] : [
      { label:'Team Leadership', score:94, level:'Excellent' },
      { label:'Log Approval Rate',score:98,level:'Excellent' },
    ]),
  ]

  const projects = [
    { name:'Gold Mine Project A',  period:'Jan–Apr 2026', meters: isDriller?12450:0, avgROP: isDriller?10.2:0, shifts:142, rating:5 },
    { name:'Copper Exploration',   period:'Oct–Dec 2025', meters: isDriller?9820:0,  avgROP: isDriller?9.4:0,  shifts:124, rating:4 },
    { name:'Diamond Drill Site C', period:'Jul–Sep 2025', meters: isDriller?8716:0,  avgROP: isDriller?9.8:0,  shifts:98,  rating:5 },
  ]

  const skills = isDriller
    ? ['Diamond Core Drilling (NQ/HQ/PQ/BQ)','RC Drilling Operations','Blast Hole Drilling','Formation Identification & Logging','Core Sample Handling','Bit Selection & Optimization','Rig Maintenance & Troubleshooting','Safety Management Systems']
    : ['Site Safety Management','Drill Log Review & Approval','Crew Performance Monitoring','Equipment Inspection','Incident Reporting','Operational Planning','Team Leadership','Compliance Management']

  const endorsements = [
    { text: isDriller
        ? `${person.name} consistently delivers outstanding drilling performance. Their formation knowledge and ROP results are among the best on site.`
        : `${person.name} is an exceptional supervisor whose leadership directly contributed to our best safety record this year.`,
      author:'Admin, Apex Drilling Solutions', role:'Company Admin', date:'May 2026' }
  ]

  return (
    <div id="report-content" style={{ fontFamily:"'Inter',sans-serif", background:'#F8FAFC' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap');
        @media print {
          .no-print { display:none!important; }
          #report-content { background:white!important; }
          .rpage { box-shadow:none!important; margin:0!important; page-break-after:always; border-radius:0!important; }
          .rpage:last-child { page-break-after:auto; }
        }
        @page { margin:0; size:A4; }
      `}</style>

      <div style={{ maxWidth:794, margin:'0 auto', paddingBottom:20 }}>

        {/* ── PAGE 1: COVER ── */}
        <div className="rpage" style={{ background:'#fff', borderRadius:12, boxShadow:'0 8px 40px rgba(0,0,0,0.1)', marginBottom:20, overflow:'hidden' }}>
          <div style={{ height:8, background:'linear-gradient(90deg,#F97316,#EA580C,#F59E0B)' }} />

          {/* Header */}
          <div style={{ padding:'28px 36px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'2px solid #F3F4F6' }}>
            <div style={{ display:'flex', alignItems:'center', gap:14 }}>
              <XLogo size={52} />
              <div>
                <div style={{ fontSize:22, fontWeight:900, color:'#0F172A', letterSpacing:'0.08em', fontFamily:"'Space Grotesk',sans-serif" }}>XPLORIX</div>
                <div style={{ fontSize:10, color:'#94A3B8', letterSpacing:'0.15em', textTransform:'uppercase', marginTop:1 }}>Drilling Intelligence Platform</div>
              </div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ display:'inline-flex', alignItems:'center', gap:7, padding:'7px 14px', background:'#FFF7ED', border:'2px solid #F97316', borderRadius:50 }}>
                <Shield size={14} style={{ color:'#F97316' }} />
                <span style={{ fontSize:11, fontWeight:700, color:'#EA580C', letterSpacing:'0.05em' }}>VERIFIED REPORT</span>
              </div>
              <div style={{ fontSize:10, color:'#94A3B8', marginTop:5 }}>Certificate ID: {certId}</div>
            </div>
          </div>

          {/* Title bar */}
          <div style={{ padding:'24px 36px 20px', background:'linear-gradient(135deg,#FFF7ED,#fff)', borderBottom:'2px solid #FED7AA' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#F97316', letterSpacing:'0.2em', textTransform:'uppercase', marginBottom:6 }}>
              Official {person.type} Performance Certificate
            </div>
            <div style={{ fontSize:30, fontWeight:900, color:'#0F172A', fontFamily:"'Space Grotesk',sans-serif", lineHeight:1.1 }}>{person.name}</div>
            <div style={{ fontSize:14, color:'#64748B', marginTop:6 }}>{person.role} · {person.project}</div>
          </div>

          {/* Profile grid */}
          <div style={{ padding:'24px 36px', display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:20 }}>
            {[
              { label:'Personnel ID',  value:person.id          },
              { label:'Experience',    value:person.experience  },
              { label:'Type',          value:person.type        },
              { label:'Company',       value:'Apex Drilling Solutions' },
              { label:'Report Period', value:period             },
              { label:'Generated',     value:today              },
            ].map((item,i)=>(
              <div key={i}>
                <div style={{ fontSize:9, fontWeight:700, color:'#94A3B8', letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:3 }}>{item.label}</div>
                <div style={{ fontSize:13, fontWeight:600, color:'#0F172A' }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* Grade + rank banner */}
          <div style={{ margin:'0 36px 28px', padding:'18px 24px', background:'#FFF7ED', borderRadius:12, border:'1px solid #FED7AA', display:'flex', alignItems:'center', gap:20 }}>
            <Grade g={person.grade} />
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#0F172A', marginBottom:3 }}>Overall Performance Grade</div>
              <div style={{ fontSize:12, color:'#64748B', lineHeight:1.6 }}>
                {person.totalShifts} shifts logged · {person.totalHours.toLocaleString()} hours worked{isDriller?` · ${person.totalMeters.toLocaleString()}m drilled`:''}
              </div>
              <div style={{ display:'flex', gap:10, marginTop:8, flexWrap:'wrap' }}>
                <span style={{ fontSize:10, background:'#FEE2E2', color:'#DC2626', padding:'2px 8px', borderRadius:4, fontWeight:700 }}>Top {person.percentile}% on platform</span>
                <span style={{ fontSize:10, background:'#DCFCE7', color:'#16A34A', padding:'2px 8px', borderRadius:4, fontWeight:700 }}>⭐ Recommended {person.type}</span>
                {person.ppeCompliance===100 && <span style={{ fontSize:10, background:'#EFF6FF', color:'#2563EB', padding:'2px 8px', borderRadius:4, fontWeight:700 }}>🛡 100% Safety Compliance</span>}
              </div>
            </div>
            {/* QR placeholder */}
            <div style={{ width:64,height:64,border:'2px solid #E5E7EB',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,background:'#F9FAFB' }}>
              <div style={{ fontSize:7,color:'#94A3B8',textAlign:'center',lineHeight:1.5 }}>SCAN<br/>TO<br/>VERIFY</div>
            </div>
          </div>
        </div>

        {/* ── PAGE 2: STATS ── */}
        <div className="rpage" style={{ background:'#fff', borderRadius:12, boxShadow:'0 8px 40px rgba(0,0,0,0.1)', marginBottom:20, overflow:'hidden' }}>
          <div style={{ height:4, background:'linear-gradient(90deg,#F97316,#EA580C,#F59E0B)' }} />
          <div style={{ padding:'28px 36px' }}>

            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:22, paddingBottom:14, borderBottom:'2px solid #F3F4F6' }}>
              <div style={{ width:34,height:34,borderRadius:9,background:'#FFF7ED',border:'1px solid #FED7AA',display:'flex',alignItems:'center',justifyContent:'center' }}>
                <TrendingUp size={16} style={{ color:'#F97316' }} />
              </div>
              <div>
                <div style={{ fontSize:17,fontWeight:800,color:'#0F172A',fontFamily:"'Space Grotesk',sans-serif" }}>Performance Statistics</div>
                <div style={{ fontSize:11,color:'#64748B' }}>Lifetime performance — {period}</div>
              </div>
            </div>

            {/* Big stats */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:28 }}>
              {[
                { label:'Total Shifts',    value:person.totalShifts.toString(),         unit:'shifts', color:'#3B82F6', bg:'#EFF6FF'  },
                { label:'Total Hours',     value:person.totalHours.toLocaleString(),    unit:'hrs',    color:'#10B981', bg:'#F0FDF4'  },
                { label:'Efficiency Rate', value:`${person.efficiency}`,               unit:'%',      color:'#F97316', bg:'#FFF7ED'  },
                ...(isDriller ? [
                  { label:'Total Meters',  value:person.totalMeters.toLocaleString(),  unit:'m',      color:'#F97316', bg:'#FFF7ED'  },
                  { label:'Average ROP',   value:person.avgROP.toString(),             unit:'m/hr',   color:'#8B5CF6', bg:'#F5F3FF'  },
                  { label:'Core Recovery', value:`${person.coreRecovery}`,             unit:'%',      color:'#06B6D4', bg:'#ECFEFF'  },
                ] : [
                  { label:'Logs Approved', value:'1,248',                              unit:'logs',   color:'#8B5CF6', bg:'#F5F3FF'  },
                  { label:'Incidents Managed',value:'12',                              unit:'total',  color:'#EF4444', bg:'#FFF1F2'  },
                  { label:'PPE Compliance',value:`${person.ppeCompliance}`,            unit:'%',      color:'#06B6D4', bg:'#ECFEFF'  },
                ]),
              ].map((s,i)=>(
                <div key={i} style={{ padding:16,borderRadius:11,background:s.bg,border:`1px solid ${s.color}20` }}>
                  <div style={{ fontSize:9,fontWeight:700,color:'#94A3B8',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:6 }}>{s.label}</div>
                  <div style={{ fontSize:26,fontWeight:900,color:s.color,fontFamily:"'Space Grotesk',sans-serif",lineHeight:1 }}>
                    {s.value}<span style={{ fontSize:12,fontWeight:600,marginLeft:3 }}>{s.unit}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Performance ratings */}
            <div style={{ marginBottom:24 }}>
              <div style={{ fontSize:11,fontWeight:700,color:'#0F172A',marginBottom:13,textTransform:'uppercase',letterSpacing:'0.08em' }}>Performance Ratings</div>
              <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
                {ratings.map((r,i)=>(
                  <div key={i} style={{ display:'flex',alignItems:'center',gap:14 }}>
                    <div style={{ width:150,fontSize:12,fontWeight:500,color:'#374151',flexShrink:0 }}>{r.label}</div>
                    <Bar score={r.score} color={r.score>=95?'#10B981':r.score>=85?'#F97316':'#F59E0B'} />
                    <div style={{ width:34,fontSize:12,fontWeight:700,color:'#0F172A',textAlign:'right',flexShrink:0 }}>{r.score}</div>
                    <div style={{ width:76,fontSize:10,fontWeight:700,flexShrink:0,color:r.level==='Excellent'||r.level==='Perfect'?'#10B981':r.level==='Good'?'#F59E0B':'#EF4444' }}>{r.level}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Industry comparison — driller only */}
            {isDriller && (
              <div style={{ padding:18,background:'#F8FAFC',borderRadius:11,border:'1px solid #E2E8F0' }}>
                <div style={{ fontSize:11,fontWeight:700,color:'#374151',marginBottom:12,textTransform:'uppercase',letterSpacing:'0.08em' }}>vs Industry Average</div>
                <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:14 }}>
                  {[
                    { label:'Average ROP',   yours:person.avgROP,      avg:7.2, unit:'m/hr' },
                    { label:'Efficiency',    yours:person.efficiency,   avg:82,  unit:'%'    },
                  ].map((c,i)=>(
                    <div key={i} style={{ padding:14,background:'#fff',borderRadius:9,border:'1px solid #E2E8F0' }}>
                      <div style={{ fontSize:10,color:'#94A3B8',fontWeight:600,marginBottom:8 }}>{c.label}</div>
                      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4 }}>
                        <span style={{ fontSize:18,fontWeight:900,color:'#F97316',fontFamily:"'Space Grotesk',sans-serif" }}>{c.yours}{c.unit}</span>
                        <span style={{ fontSize:12,color:'#94A3B8',fontWeight:600 }}>avg {c.avg}{c.unit}</span>
                      </div>
                      <div style={{ fontSize:11,fontWeight:700,color:'#10B981' }}>▲ {(((c.yours-c.avg)/c.avg)*100).toFixed(0)}% above average</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── PAGE 3: PROJECTS + SKILLS ── */}
        <div className="rpage" style={{ background:'#fff',borderRadius:12,boxShadow:'0 8px 40px rgba(0,0,0,0.1)',marginBottom:20,overflow:'hidden' }}>
          <div style={{ height:4,background:'linear-gradient(90deg,#F97316,#EA580C,#F59E0B)' }} />
          <div style={{ padding:'28px 36px' }}>

            <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:22,paddingBottom:14,borderBottom:'2px solid #F3F4F6' }}>
              <div style={{ width:34,height:34,borderRadius:9,background:'#FFF7ED',border:'1px solid #FED7AA',display:'flex',alignItems:'center',justifyContent:'center' }}>
                <Award size={16} style={{ color:'#F97316' }} />
              </div>
              <div>
                <div style={{ fontSize:17,fontWeight:800,color:'#0F172A',fontFamily:"'Space Grotesk',sans-serif" }}>Project History</div>
                <div style={{ fontSize:11,color:'#64748B' }}>All projects via XPLORIX platform</div>
              </div>
            </div>

            <table style={{ width:'100%',borderCollapse:'collapse',marginBottom:28 }}>
              <thead>
                <tr style={{ background:'#F8FAFC',borderBottom:'2px solid #E2E8F0' }}>
                  {['Project','Period',isDriller?'Meters':'Logs','Shifts','Rating'].map(h=>(
                    <th key={h} style={{ padding:'9px 12px',textAlign:'left',fontSize:9,fontWeight:700,color:'#94A3B8',letterSpacing:'0.1em',textTransform:'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projects.map((p,i)=>(
                  <tr key={i} style={{ borderBottom:'1px solid #F3F4F6',background:i%2===0?'#fff':'#FAFAFA' }}>
                    <td style={{ padding:'11px 12px',fontSize:12,fontWeight:600,color:'#0F172A' }}>{p.name}</td>
                    <td style={{ padding:'11px 12px',fontSize:11,color:'#64748B' }}>{p.period}</td>
                    <td style={{ padding:'11px 12px',fontSize:12,fontWeight:700,color:'#F97316' }}>{isDriller?`${p.meters.toLocaleString()}m`:`${Math.floor(p.shifts*2.4)} logs`}</td>
                    <td style={{ padding:'11px 12px',fontSize:12,color:'#374151' }}>{p.shifts}</td>
                    <td style={{ padding:'11px 12px' }}><Stars rating={p.rating} /></td>
                  </tr>
                ))}
                <tr style={{ borderTop:'2px solid #E2E8F0',background:'#FFF7ED' }}>
                  <td style={{ padding:'11px 12px',fontSize:12,fontWeight:800,color:'#0F172A' }}>TOTAL</td>
                  <td style={{ padding:'11px 12px',fontSize:11,color:'#64748B' }}>All Time</td>
                  <td style={{ padding:'11px 12px',fontSize:13,fontWeight:800,color:'#F97316' }}>{isDriller?`${person.totalMeters.toLocaleString()}m`:'-'}</td>
                  <td style={{ padding:'11px 12px',fontSize:12,fontWeight:700,color:'#0F172A' }}>{person.totalShifts}</td>
                  <td />
                </tr>
              </tbody>
            </table>

            {/* Skills */}
            <div style={{ marginBottom:0 }}>
              <div style={{ fontSize:11,fontWeight:700,color:'#0F172A',marginBottom:12,textTransform:'uppercase',letterSpacing:'0.08em' }}>Skills & Capabilities</div>
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:7 }}>
                {skills.map((skill,i)=>(
                  <div key={i} style={{ display:'flex',alignItems:'center',gap:8,padding:'7px 11px',background:'#F8FAFC',borderRadius:7,border:'1px solid #E2E8F0' }}>
                    <CheckCircle size={13} style={{ color:'#10B981',flexShrink:0 }} />
                    <span style={{ fontSize:11,color:'#374151',fontWeight:500 }}>{skill}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── PAGE 4: SAFETY + CERTIFICATE ── */}
        <div className="rpage" style={{ background:'#fff',borderRadius:12,boxShadow:'0 8px 40px rgba(0,0,0,0.1)',overflow:'hidden' }}>
          <div style={{ height:4,background:'linear-gradient(90deg,#F97316,#EA580C,#F59E0B)' }} />
          <div style={{ padding:'28px 36px' }}>

            <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:22,paddingBottom:14,borderBottom:'2px solid #F3F4F6' }}>
              <div style={{ width:34,height:34,borderRadius:9,background:'#F0FDF4',border:'1px solid #BBF7D0',display:'flex',alignItems:'center',justifyContent:'center' }}>
                <Shield size={16} style={{ color:'#10B981' }} />
              </div>
              <div>
                <div style={{ fontSize:17,fontWeight:800,color:'#0F172A',fontFamily:"'Space Grotesk',sans-serif" }}>Safety Record</div>
                <div style={{ fontSize:11,color:'#64748B' }}>Health, Safety & Compliance performance</div>
              </div>
            </div>

            <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:28 }}>
              {[
                { label:'Safe Shifts',    value:`${person.safeShifts}/${person.totalShifts}`, color:'#10B981', bg:'#F0FDF4' },
                { label:'PPE Compliance', value:`${person.ppeCompliance}%`,                   color:'#3B82F6', bg:'#EFF6FF' },
                { label:'Incident Free',  value:'3 Projects',                                 color:'#F97316', bg:'#FFF7ED' },
                { label:'Safety Score',   value:'100%',                                       color:'#8B5CF6', bg:'#F5F3FF' },
              ].map((s,i)=>(
                <div key={i} style={{ padding:14,borderRadius:10,background:s.bg,textAlign:'center' }}>
                  <div style={{ fontSize:17,fontWeight:800,color:s.color,fontFamily:"'Space Grotesk',sans-serif" }}>{s.value}</div>
                  <div style={{ fontSize:10,color:'#64748B',marginTop:3,fontWeight:600 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Endorsements */}
            <div style={{ marginBottom:28 }}>
              <div style={{ fontSize:11,fontWeight:700,color:'#0F172A',marginBottom:12,textTransform:'uppercase',letterSpacing:'0.08em' }}>Endorsements</div>
              {endorsements.map((e,i)=>(
                <div key={i} style={{ padding:18,background:'#FFFBEB',borderRadius:11,border:'1px solid #FDE68A',borderLeft:'4px solid #F97316' }}>
                  <div style={{ fontSize:12,color:'#374151',lineHeight:1.7,marginBottom:10,fontStyle:'italic' }}>"{e.text}"</div>
                  <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                    <div style={{ width:26,height:26,borderRadius:'50%',background:'linear-gradient(135deg,#F97316,#F59E0B)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'#fff' }}>A</div>
                    <div>
                      <div style={{ fontSize:11,fontWeight:700,color:'#0F172A' }}>{e.author}</div>
                      <div style={{ fontSize:9,color:'#64748B' }}>{e.role} · {e.date}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Certificate footer */}
            <div style={{ padding:'22px 26px',background:'linear-gradient(135deg,#0F172A,#1E293B)',borderRadius:13,color:'#fff' }}>
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between' }}>
                <div style={{ display:'flex',alignItems:'center',gap:12 }}>
                  <XLogo size={42} />
                  <div>
                    <div style={{ fontSize:15,fontWeight:900,letterSpacing:'0.08em',fontFamily:"'Space Grotesk',sans-serif" }}>XPLORIX</div>
                    <div style={{ fontSize:9,color:'#94A3B8',letterSpacing:'0.12em',marginTop:1 }}>DRILLING INTELLIGENCE PLATFORM</div>
                  </div>
                </div>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:10,color:'#94A3B8',marginBottom:3 }}>Verified Certificate</div>
                  <div style={{ fontSize:13,fontWeight:700,color:'#F97316',fontFamily:'monospace' }}>{certId}</div>
                  <div style={{ fontSize:9,color:'#64748B',marginTop:3 }}>xplorix.com/verify/{certId}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:10,color:'#94A3B8',marginBottom:3 }}>Generated by Admin</div>
                  <div style={{ fontSize:12,fontWeight:600,color:'#F8FAFC' }}>{today}</div>
                  <div style={{ fontSize:9,color:'#64748B',marginTop:3 }}>Period: {period}</div>
                  <div style={{ marginTop:8,display:'inline-flex',alignItems:'center',gap:5,padding:'4px 10px',background:'rgba(249,115,22,0.15)',border:'1px solid #F97316',borderRadius:20 }}>
                    <Shield size={9} style={{ color:'#F97316' }} />
                    <span style={{ fontSize:9,fontWeight:700,color:'#F97316' }}>VERIFIED BY XPLORIX</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}

// ── MAIN PAGE ──────────────────────────────────────────────────────────────
export default function AdminReportPage() {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Person | null>(null)
  const [period, setPeriod] = useState('All Time')
  const [filterType, setFilterType] = useState<'All'|'Driller'|'Supervisor'>('All')

  const filtered = allPersonnel.filter(p =>
    (filterType === 'All' || p.type === filterType) &&
    (search === '' || p.name.toLowerCase().includes(search.toLowerCase()) || p.id.toLowerCase().includes(search.toLowerCase()))
  )

  const handlePrint = () => window.print()

  return (
    <div style={{ fontFamily:"'Inter',sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap');`}</style>

      {/* ── SELECTOR UI (not printed) ── */}
      <div className="no-print" style={{ display:'flex', flexDirection:'column', gap:24 }}>

        {/* Page header */}
        <div>
          <h1 style={{ fontSize:24, fontWeight:800, color:'var(--x-text)', fontFamily:"'Space Grotesk',sans-serif" }}>Performance Reports</h1>
          <p style={{ fontSize:13, color:'var(--x-faint)', marginTop:4 }}>Select a driller or supervisor to generate and download their official performance certificate</p>
        </div>

        {/* Search + filter bar */}
        <div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap', padding:'14px 20px', background:'var(--x-card)', border:'1px solid var(--x-border)', borderRadius:14 }}>
          <div style={{ position:'relative', flex:1, minWidth:220 }}>
            <Search size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--x-faint)' }} />
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name or ID..."
              style={{ width:'100%', padding:'8px 12px 8px 30px', background:'rgba(var(--x-ov),0.04)', border:'1px solid var(--x-border)', borderRadius:8, color:'var(--x-text)', fontSize:13, outline:'none' }} />
          </div>
          {/* Type filter */}
          <div style={{ display:'flex', gap:6 }}>
            {(['All','Driller','Supervisor'] as const).map(t=>(
              <button key={t} onClick={()=>setFilterType(t)}
                style={{ padding:'7px 14px', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer', transition:'all 0.2s',
                  background: filterType===t ? 'linear-gradient(135deg,var(--x-orange),var(--x-orange-d))' : 'rgba(var(--x-ov),0.04)',
                  color: filterType===t ? '#fff' : 'var(--x-muted)',
                  border: filterType===t ? 'none' : '1px solid var(--x-border)',
                }}>{t}</button>
            ))}
          </div>
          {/* Period selector */}
          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 12px', background:'rgba(var(--x-ov),0.04)', border:'1px solid var(--x-border)', borderRadius:8 }}>
            <Clock size={12} style={{ color:'var(--x-faint)' }} />
            <select value={period} onChange={e=>setPeriod(e.target.value)}
              style={{ background:'transparent', color:'var(--x-text)', fontSize:12, border:'none', outline:'none', cursor:'pointer' }}>
              <option style={{ background:'var(--x-card)' }}>All Time</option>
              <option style={{ background:'var(--x-card)' }}>Last 12 Months</option>
              <option style={{ background:'var(--x-card)' }}>Last 90 Days</option>
              <option style={{ background:'var(--x-card)' }}>Last 30 Days</option>
            </select>
          </div>
        </div>

        {/* Personnel cards */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:14 }}>
          {filtered.map(p=>(
            <div key={p.id} onClick={()=>setSelected(p)}
              style={{ padding:18, borderRadius:14, background:'var(--x-card)', cursor:'pointer', transition:'all 0.2s',
                border: selected?.id===p.id ? '2px solid var(--x-orange)' : '1px solid var(--x-border)',
                boxShadow: selected?.id===p.id ? '0 0 20px color-mix(in srgb, var(--x-orange) 15%, transparent)' : 'none',
              }}
              onMouseEnter={e=>{ if(selected?.id!==p.id)(e.currentTarget as HTMLElement).style.borderColor='color-mix(in srgb, var(--x-orange) 40%, transparent)' }}
              onMouseLeave={e=>{ if(selected?.id!==p.id)(e.currentTarget as HTMLElement).style.borderColor='var(--x-border)' }}
            >
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
                <div style={{ width:44,height:44,borderRadius:12,background:p.avatarColor,display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,fontWeight:700,color:'#fff',flexShrink:0 }}>{p.avatar}</div>
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ fontSize:14,fontWeight:700,color:'var(--x-text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{p.name}</div>
                  <div style={{ fontSize:11,color:'var(--x-faint)',marginTop:1 }}>{p.role} · {p.id}</div>
                </div>
                <div style={{ padding:'3px 8px',borderRadius:20,fontSize:10,fontWeight:700,
                  background: p.type==='Driller' ? 'color-mix(in srgb, var(--x-orange) 10%, transparent)' : 'color-mix(in srgb, var(--x-blue) 10%, transparent)',
                  color: p.type==='Driller' ? 'var(--x-orange)' : 'var(--x-blue-b)',
                  border: `1px solid ${p.type==='Driller'?'color-mix(in srgb, var(--x-orange) 20%, transparent)':'color-mix(in srgb, var(--x-blue) 20%, transparent)'}`,
                }}>{p.type}</div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                {(p.type==='Driller'
                  ? [{ l:'Meters', v:`${(p.totalMeters/1000).toFixed(0)}k m` },{ l:'ROP', v:`${p.avgROP} m/hr` },{ l:'Grade', v:p.grade }]
                  : [{ l:'Shifts', v:p.totalShifts.toString() },{ l:'Efficiency', v:`${p.efficiency}%` },{ l:'Grade', v:p.grade }]
                ).map((s,i)=>(
                  <div key={i} style={{ padding:'8px 10px',background:'rgba(var(--x-ov),0.03)',borderRadius:8,border:'1px solid var(--x-border)' }}>
                    <div style={{ fontSize:9,color:'var(--x-faint)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:2 }}>{s.l}</div>
                    <div style={{ fontSize:13,fontWeight:800,color:i===2?'var(--x-orange)':'var(--x-text)',fontFamily:"'Space Grotesk',sans-serif" }}>{s.v}</div>
                  </div>
                ))}
              </div>
              {selected?.id===p.id && (
                <div style={{ marginTop:10,display:'flex',alignItems:'center',gap:6,fontSize:11,fontWeight:600,color:'var(--x-orange)' }}>
                  <CheckCircle size={12} style={{ color:'var(--x-orange)' }} />
                  Selected — see report below
                </div>
              )}
            </div>
          ))}
          {filtered.length===0 && (
            <div style={{ gridColumn:'1/-1',textAlign:'center',padding:'40px',color:'var(--x-faint)',fontSize:13 }}>No results found.</div>
          )}
        </div>

        {/* Download button */}
        {selected && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', background:'color-mix(in srgb, var(--x-orange) 5%, transparent)', border:'1px solid color-mix(in srgb, var(--x-orange) 20%, transparent)', borderRadius:12 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:36,height:36,borderRadius:10,background:selected.avatarColor,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:700,color:'#fff' }}>{selected.avatar}</div>
              <div>
                <div style={{ fontSize:14,fontWeight:700,color:'var(--x-text)' }}>Ready: {selected.name}</div>
                <div style={{ fontSize:11,color:'var(--x-faint)' }}>{selected.role} · {period} · Certificate ID: XPL-2026-{selected.id}</div>
              </div>
            </div>
            <button onClick={handlePrint}
              style={{ display:'flex',alignItems:'center',gap:8,padding:'10px 24px',background:'linear-gradient(135deg,var(--x-orange),var(--x-orange-d))',color:'#fff',fontWeight:700,fontSize:13,borderRadius:10,border:'none',cursor:'pointer',boxShadow:'0 4px 20px color-mix(in srgb, var(--x-orange) 30%, transparent)' }}>
              <Download size={15} />
              Download PDF Certificate
            </button>
          </div>
        )}

        {/* Divider */}
        {selected && <div style={{ height:1,background:'linear-gradient(90deg,transparent,var(--x-border),transparent)' }} />}
        {selected && <div style={{ fontSize:12,color:'var(--x-faint)',textAlign:'center',marginTop:-16,marginBottom:-8 }}>↓ Report Preview ↓</div>}
      </div>

      {/* ── REPORT PREVIEW ── */}
      {selected && <Report person={selected} period={period} />}
    </div>
  )
}

