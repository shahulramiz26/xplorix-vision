'use client'

import { useEffect, useMemo } from 'react'
import Link from 'next/link'
import { ArrowRight, RotateCcw } from 'lucide-react'
import { TODAY } from '../../../../lib/company'
import { useKnow } from '../../../../lib/copilot/context'
import { copilot, useCopilot, KIND_LABEL, type AlertKind, type CopilotEvent } from '../../../../lib/copilot/store'
import { Shell, Box, Stat, Stats, Note, Pill, V, vmono } from '../ui'

/* ==========================================================================
 * COPILOT COMMAND CENTRE — every rig's Copilot on one screen
 *
 * What Copilot said, what each crew did, and what happened: advice given,
 * followed and proven, hours saved, breakdowns avoided, metres not drilled.
 * The crew table is the Copilot scorecard: it shows how crews work with
 * Copilot, never money.
 * ========================================================================== */

const r0 = (n: number) => Math.round(n).toLocaleString('en-US')
const pct = (a: number, b: number) => b ? `${Math.round(a / b * 100)}%` : '—'
const when = (iso: string) => { const d = new Date(iso); return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` }

export default function CommandCentre() {
  const k = useKnow()
  const { events } = useCopilot()
  useEffect(() => { if (k.ready && k.drillers.length) copilot.seed(k.fleet, k.drillers, TODAY) }, [k.ready, k.fleet, k.drillers])

  const since = useMemo(() => new Date(new Date(`${TODAY}T23:59:59`).getTime() - 30 * 86400000).toISOString(), [])
  const ev = useMemo(() => events.filter(e => e.at >= since || !e.demo), [events, since])
  const given = ev.length
  const followed = ev.filter(e => e.action !== 'later' && e.action !== 'none')
  const judged = ev.filter(e => e.outcome === 'worked' || e.outcome === 'failed')
  const worked = judged.filter(e => e.outcome === 'worked')
  const hours = ev.reduce((s, e) => s + e.hoursSaved, 0)
  const metres = ev.reduce((s, e) => s + e.metresSaved, 0)
  const avoided = worked.filter(e => e.kind === 'engine-hot' || e.kind === 'blocking' || e.kind === 'stall').length
  const live = events.filter(e => !e.demo)

  const rigs = useMemo(() => {
    const m = new Map<string, CopilotEvent[]>()
    ev.forEach(e => m.set(e.rig, [...(m.get(e.rig) ?? []), e]))
    return Array.from(m.entries()).map(([rig, xs]) => ({
      rig, hole: xs[0].hole, last: xs[0], n: xs.length,
      followed: xs.filter(e => e.action !== 'later' && e.action !== 'none').length,
      worked: xs.filter(e => e.outcome === 'worked').length, judged: xs.filter(e => e.outcome === 'worked' || e.outcome === 'failed').length,
      hours: xs.reduce((s, e) => s + e.hoursSaved, 0), level: xs.slice(0, 10).some(e => e.level >= 2) ? 2 : 1,
    })).sort((a, b) => b.hours - a.hours)
  }, [ev])
  const crews = useMemo(() => {
    const m = new Map<string, CopilotEvent[]>()
    ev.forEach(e => m.set(e.driller, [...(m.get(e.driller) ?? []), e]))
    return Array.from(m.entries()).map(([name, xs]) => {
      const f = xs.filter(e => e.action !== 'later' && e.action !== 'none').length
      const j = xs.filter(e => e.outcome === 'worked' || e.outcome === 'failed'), w = j.filter(e => e.outcome === 'worked').length
      const score = Math.round((f / Math.max(1, xs.length)) * 60 + (w / Math.max(1, j.length)) * 40)
      return { name, n: xs.length, f, w, j: j.length, hours: xs.reduce((s, e) => s + e.hoursSaved, 0), score }
    }).sort((a, b) => b.score - a.score)
  }, [ev])
  const byKind = useMemo(() => (Object.keys(KIND_LABEL) as AlertKind[]).map(kind => {
    const xs = ev.filter(e => e.kind === kind)
    const j = xs.filter(e => e.outcome === 'worked' || e.outcome === 'failed')
    return { kind, n: xs.length, f: xs.filter(e => e.action !== 'later' && e.action !== 'none').length, w: j.filter(e => e.outcome === 'worked').length, j: j.length, hours: xs.reduce((s, e) => s + e.hoursSaved, 0) }
  }).filter(x => x.n), [ev])
  const days = useMemo(() => {
    const out: { d: string; f: number; l: number }[] = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date(new Date(`${TODAY}T12:00:00`).getTime() - i * 86400000).toISOString().slice(0, 10)
      const xs = ev.filter(e => e.at.slice(0, 10) === d)
      out.push({ d, f: xs.filter(e => e.action !== 'later' && e.action !== 'none').length, l: xs.filter(e => e.action === 'later' || e.action === 'none').length })
    }
    return out
  }, [ev])
  const maxDay = Math.max(1, ...days.map(d => d.f + d.l))

  return (
    <Shell stage="launch" title="Copilot command centre"
      lead={<>Every rig&rsquo;s Copilot on one screen: what it advised, what each crew did, and whether it worked. Last 30 days across {rigs.length} rigs. This is the proof that Copilot changes what happens at the rig.</>}
      right={<><Link className="v-btn" href="/admin/vision/copilot">Open a cockpit <ArrowRight size={15} /></Link><button className="v-btn" onClick={() => { if (confirm('Clear the Copilot history and start again?')) copilot.reset() }}><RotateCcw size={15} /> Reset demo</button></>}>
      <Stats>
        <Stat label="Advice given" value={r0(given)} note={`${live.length} from live cockpit sessions`} tone={V.orange} />
        <Stat label="Followed" value={pct(followed.length, given)} note={`${r0(followed.length)} times the crew acted`} tone={V.blue} />
        <Stat label="Proven to work" value={pct(worked.length, judged.length)} note={`${r0(worked.length)} of ${r0(judged.length)} checked against what happened next`} tone={V.green} />
        <Stat label="Drilling hours saved" value={`${r0(hours)} h`} note="Faster through bad ground, fewer stops, no extra trips" tone={V.green} />
        <Stat label="Breakdowns avoided" value={r0(avoided)} note="Engine, blocked bit and stuck bit, caught early" tone={V.violet} />
        <Stat label="Metres not drilled" value={`${r0(metres)} m`} note="Geology GPS stops confirmed by the geologist" tone={V.violet} />
      </Stats>

      <Box title="Advice followed, day by day" sub="Green: crew acted · grey: not now">
        <svg viewBox="0 0 600 120" preserveAspectRatio="none" style={{ width: '100%', height: 150, display: 'block' }} role="img" aria-label="Advice followed and not followed over 30 days">
          {days.map((d, i) => {
            const w = 600 / days.length, x = i * w + 2, H = 100
            const hf = d.f / maxDay * H, hl = d.l / maxDay * H
            return <g key={d.d}><rect x={x} y={H - hf} width={w - 4} height={hf} rx={2} fill={V.green} /><rect x={x} y={H - hf - hl} width={w - 4} height={hl} rx={2} fill="#3A4656" /></g>
          })}
        </svg>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: V.faint, fontFamily: vmono, marginTop: 4 }}><span>{days[0]?.d.slice(5)}</span><span>{days[15]?.d.slice(5)}</span><span>{days[29]?.d.slice(5)}</span></div>
      </Box>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(460px, 100%), 1fr))', gap: 12 }}>
        <Box title="Every rig" pad={false}>
          <div style={{ overflowX: 'auto' }}>
            <table className="v-tab">
              <thead><tr><th>Rig</th><th>Level</th><th>Latest advice</th><th className="n">Followed</th><th className="n">Worked</th><th className="n">Hours saved</th></tr></thead>
              <tbody>{rigs.map(r => (
                <tr key={r.rig}>
                  <td style={{ color: V.text, fontWeight: 700, fontFamily: vmono }}>{r.rig}<div style={{ fontFamily: 'inherit', fontWeight: 400, fontSize: 12, color: V.faint }}>{r.hole}</div></td>
                  <td><Pill color={r.level === 2 ? V.orange : V.blue}>L{r.level} {r.level === 2 ? 'Assist' : 'Advise'}</Pill></td>
                  <td style={{ minWidth: 200 }}>{KIND_LABEL[r.last.kind]}<div style={{ fontSize: 12, color: V.faint }}>{when(r.last.at)}</div></td>
                  <td className="n">{pct(r.followed, r.n)}</td>
                  <td className="n" style={{ color: V.green }}>{pct(r.worked, r.judged)}</td>
                  <td className="n">{r0(r.hours)}</td>
                </tr>))}</tbody>
            </table>
          </div>
        </Box>
        <Box title="Copilot scorecard: crews" sub="How each crew works with Copilot. No money shown." pad={false}>
          <div style={{ overflowX: 'auto' }}>
            <table className="v-tab">
              <thead><tr><th>Driller</th><th className="n">Advice</th><th className="n">Followed</th><th className="n">Worked</th><th className="n">Hours saved</th><th className="n">Score</th></tr></thead>
              <tbody>{crews.slice(0, 8).map(c => (
                <tr key={c.name}>
                  <td style={{ color: V.text, fontWeight: 600 }}>{c.name}</td>
                  <td className="n">{c.n}</td><td className="n">{pct(c.f, c.n)}</td><td className="n">{pct(c.w, c.j)}</td><td className="n">{r0(c.hours)}</td>
                  <td className="n"><b style={{ color: c.score >= 80 ? V.green : c.score >= 65 ? V.amber : V.red }}>{c.score}</b></td>
                </tr>))}</tbody>
            </table>
          </div>
        </Box>
      </div>

      <Box title="Which advice pays" sub="Every kind of advice, and its record: the learning loop" pad={false}>
        <div style={{ overflowX: 'auto' }}>
          <table className="v-tab">
            <thead><tr><th>Advice</th><th className="n">Given</th><th className="n">Followed</th><th className="n">Worked when followed</th><th className="n">Hours saved</th><th>Copilot learns</th></tr></thead>
            <tbody>{byKind.map(x => {
              const rate = x.j ? x.w / x.j : 0
              return (
                <tr key={x.kind}>
                  <td style={{ color: V.text, fontWeight: 600 }}>{KIND_LABEL[x.kind]}</td>
                  <td className="n">{x.n}</td><td className="n">{pct(x.f, x.n)}</td>
                  <td className="n" style={{ color: rate >= 0.85 ? V.green : rate >= 0.7 ? V.amber : V.red }}>{pct(x.w, x.j)}</td>
                  <td className="n">{r0(x.hours)}</td>
                  <td>{rate >= 0.85 ? 'Trusted: said early and firmly' : rate >= 0.7 ? 'Settings being tuned by ground' : 'Under review: said less often'}</td>
                </tr>)
            })}</tbody>
          </table>
        </div>
      </Box>

      <Box title="Latest advice" pad={false}>
        <div style={{ overflowX: 'auto' }}>
          <table className="v-tab">
            <thead><tr><th>When</th><th>Rig</th><th>Driller</th><th>Advice</th><th>Crew</th><th>Result</th><th className="n">Hours</th></tr></thead>
            <tbody>{ev.slice(0, 14).map(e => (
              <tr key={e.id}>
                <td style={{ whiteSpace: 'nowrap', fontFamily: vmono, fontSize: 12 }}>{when(e.at)}{!e.demo && <> <Pill color={V.orange}>live</Pill></>}</td>
                <td style={{ fontFamily: vmono, color: V.text }}>{e.rig}</td>
                <td>{e.driller}</td>
                <td style={{ minWidth: 240, color: V.text }}>{e.title}<div style={{ fontSize: 12, color: V.faint }}>{e.hole} at {e.depth} m · L{e.level}</div></td>
                <td>{e.action === 'done' ? 'Done' : e.action === 'applied' ? 'Applied to rig' : e.action === 'auto' ? 'Copilot adjusted' : e.action === 'later' ? 'Not now' : '—'}</td>
                <td style={{ color: e.outcome === 'worked' ? V.green : e.outcome === 'failed' ? V.red : V.faint }}>{e.outcome === 'worked' ? 'Worked' : e.outcome === 'failed' ? 'Did not work' : e.outcome === 'pending' ? 'Checking…' : '—'}</td>
                <td className="n">{e.hoursSaved ? e.hoursSaved.toFixed(1) : '—'}</td>
              </tr>))}</tbody>
          </table>
        </div>
      </Box>
      <Note>Thirty days of demo history across the fleet, plus everything from live cockpit sessions on this device (marked live). The launch version sends the same records to the server, where every rig&rsquo;s results train the fleet brain.</Note>
    </Shell>
  )
}
