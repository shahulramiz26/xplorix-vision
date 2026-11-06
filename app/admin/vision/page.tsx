'use client'

import Link from 'next/link'
import { ArrowRight, Clapperboard, Box as Cube, Radio, Sparkles, Gauge, Mic, FileText, Compass, BrainCircuit, Hand, Bot, Building2, Users } from 'lucide-react'
import { Shell, V, STAGE, type Stage } from './ui'

/* ==========================================================================
 * XPLORIX VISION — from the first metre to the final report
 *
 * The roadmap as working screens: what the MVP does today, what Copilot
 * adds at launch, what comes in year two and the autonomy beyond. Every
 * card opens the real screen.
 * ========================================================================== */

const COLS: { stage: Stage; what: string; items: { href: string; icon: React.ElementType; title: string; line: string }[] }[] = [
  { stage: 'today', what: 'Data, Intelligence, digital twin, Pulse', items: [
    { href: '/admin/geology/3d', icon: Cube, title: 'Digital twin', line: 'Every hole in 3D with core, surveys, cost and consumables' },
    { href: '/admin/pulse', icon: Radio, title: 'Pulse', line: 'Live rig readings, alarms and ESG from the rig' },
    { href: '/admin/xplorix-intelligence', icon: Sparkles, title: 'XPLORIX Intelligence', line: 'Briefing, recommendations, risks, Outlook and chat' },
    { href: '/admin/value', icon: Gauge, title: 'AI Scorecard', line: 'Every rig and crew scored, no money shown' },
  ] },
  { stage: 'launch', what: 'Copilot level 1: voice advice, ground ahead, auto shift log', items: [
    { href: '/admin/vision/copilot', icon: Mic, title: 'Driller cockpit', line: 'Ground-ahead radar, best settings, countdowns, voice in English and Arabic' },
    { href: '/admin/vision/copilot', icon: FileText, title: 'Shift log that writes itself', line: 'From the sensors and what the driller says; spoken handover' },
    { href: '/admin/vision/command', icon: Building2, title: 'Command centre', line: 'Advice given, followed and proven; hours saved; crew scorecard' },
  ] },
  { stage: 'y2', what: 'Geology GPS, fleet brain, level 2 autopilot with a rig maker', items: [
    { href: '/admin/vision/gps', icon: Compass, title: 'Geology GPS', line: 'Stop the hole when the target is passed: metres and money not spent' },
    { href: '/admin/vision/brain', icon: BrainCircuit, title: 'Fleet brain', line: 'Best way to drill each ground; what advice works; radar checked against core' },
    { href: '/admin/vision/copilot', icon: Hand, title: 'Level 2: apply to rig', line: 'One tap sends Copilot\'s settings to the rig (switch to L2 in the cockpit)' },
  ] },
  { stage: 'y3', what: 'Levels 3 to 4, a self-running back office, full autonomy', items: [
    { href: '/admin/vision/copilot', icon: Gauge, title: 'Level 3: auto-adjust', line: 'Copilot sets the rig within safe limits and says so (L3 in the cockpit)' },
    { href: '/admin/vision/autonomy', icon: Bot, title: 'Level 4: one person, the fleet', line: 'Rigs drill themselves; people make only the calls that matter' },
    { href: '/admin/vision/backoffice', icon: FileText, title: 'Self-running back office', line: 'Shift to invoice, part to order, month to ESG report' },
  ] },
]

export default function Vision() {
  return (
    <Shell stage="today" title="XPLORIX Vision"
      lead={<><b style={{ color: V.text, fontSize: 17 }}>From the first metre to the final report: every rig drills smarter, safer and cheaper, and every metre teaches every other rig.</b><br />Every stage of the roadmap below opens a working screen, built on the MVP&rsquo;s own record.</>}
      right={<Link className="v-btn" style={{ background: V.orange, borderColor: V.orange, minHeight: 48, fontSize: 15 }} href="/admin/vision/copilot?story=1"><Clapperboard size={17} /> Play the 3-minute story</Link>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: 12 }}>
        {COLS.map(c => {
          const st = STAGE[c.stage]
          return (
            <div key={c.stage} style={{ background: V.panel, border: `1px solid ${V.line}`, borderRadius: 16, padding: 16, borderTop: `4px solid ${st.color}`, display: 'grid', gap: 10, alignContent: 'start' }}>
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.12em', color: st.color }}>{st.label}</div>
                <div style={{ fontSize: 15, fontWeight: 700, marginTop: 6, lineHeight: 1.35 }}>{c.what}</div>
              </div>
              {c.items.map(it => (
                <Link key={it.title} href={it.href} style={{ display: 'grid', gridTemplateColumns: '34px minmax(0,1fr) 16px', gap: 10, alignItems: 'center', padding: '10px 10px', borderRadius: 12, background: V.raised, border: `1px solid ${V.line}`, color: V.text, textDecoration: 'none' }}>
                  <span style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', background: `color-mix(in srgb, ${st.color} 18%, transparent)`, color: st.color }}><it.icon size={17} /></span>
                  <span><span style={{ fontWeight: 700, fontSize: 13.5 }}>{it.title}</span><span style={{ display: 'block', fontSize: 12.5, color: V.muted, lineHeight: 1.4, marginTop: 2 }}>{it.line}</span></span>
                  <ArrowRight size={15} color={V.faint} />
                </Link>
              ))}
            </div>
          )
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 12 }}>
        {[
          ['Five copilots, one brain', 'Driller, supervisor, geologist, manager and mine owner, each with their own Copilot on the same record.', Users, V.orange],
          ['Ground truth', 'Drilling and core on the same holes. Competitors hold one side only.', Cube, V.violet],
          ['Network effect', 'Every new rig makes Copilot smarter for all of them. A late starter cannot catch up.', BrainCircuit, V.green],
          ['Into the rig', 'Levels 2 to 4 connect to the rig\'s controls with rig makers: hard to replace once in.', Hand, V.blue],
        ].map(([t, d, I, c]) => {
          const Icon = I as React.ElementType
          return (
            <div key={t as string} style={{ background: V.panel, border: `1px solid ${V.line}`, borderRadius: 14, padding: 14 }}>
              <Icon size={18} color={c as string} />
              <div style={{ fontWeight: 800, fontSize: 14, marginTop: 8 }}>{t as string}</div>
              <div style={{ fontSize: 13, color: V.muted, marginTop: 5, lineHeight: 1.5 }}>{d as string}</div>
            </div>
          )
        })}
      </div>
      <div role="note" style={{ fontSize: 12.5, color: V.faint, lineHeight: 1.55 }}>Rig readings on the vision screens are simulated; the rock, the holes, speeds, crews, costs and parts come from the MVP&rsquo;s real record. Copilot runs on rules today; the launch version adds trained models.</div>
    </Shell>
  )
}
