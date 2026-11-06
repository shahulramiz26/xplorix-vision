'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { useKnow } from '../../../../lib/copilot/context'
import { gpsFor, targetLevel, type GpsPlan } from '../../../../lib/copilot/ground'
import { Shell, Box, Stat, Stats, Note, Pill, V, vmono } from '../ui'

/* ==========================================================================
 * GEOLOGY GPS — the cheapest metre is the one you never drill
 *
 * Every hole is drilled to a planned depth set before anyone knew the rock.
 * Copilot watches the core as it comes up: once the hole has passed the
 * target (vein-rich rock) and the holes around show nothing more below,
 * it says the hole can stop. Back-tested here on every cored hole of the
 * project, as each was drilled, metre by metre.
 * ========================================================================== */

const r0 = (n: number) => Math.round(n).toLocaleString('en-US')

export default function GeologyGps() {
  const [project, setProject] = useState<string | undefined>(undefined)
  const k = useKnow(project)
  const level = useMemo(() => targetLevel(k.cols), [k.cols])
  const plans = useMemo(() => k.cols.map(c => {
    const h = k.holes.find(x => x.id === c.hole)!
    return { g: gpsFor(c, k.cols, level, h?.planned ?? null), h }
  }), [k.cols, k.holes, level])
  const cpmAll = k.holes.map(h => h.cpm).filter((x): x is number => x != null).sort((a, b) => a - b)
  const cpm = cpmAll.length ? cpmAll[Math.floor(cpmAll.length / 2)] : 450
  const stopped = plans.filter(p => p.g.stopAt != null)
  const saved = plans.reduce((s, p) => s + p.g.saving, 0)
  const sar = plans.reduce((s, p) => s + p.g.saving * (p.h?.cpm ?? cpm), 0)
  const target = plans.reduce((s, p) => s + (p.g.targetTop != null && p.g.targetBase != null ? p.g.targetBase - p.g.targetTop : 0), 0)
  const missed = plans.reduce((s, p) => s + p.g.missed, 0)
  const drilledAll = plans.reduce((s, p) => s + Math.max(p.g.drilled, p.g.planned ?? 0), 0)

  return (
    <Shell stage="y2" title="Geology GPS: stop the hole when the target is passed"
      lead={<>The cheapest metre is the one you never drill. Copilot reads the core as it comes up and the holes around it. Once a hole has passed the target and nothing more is expected below, it says where the hole can stop. Back-tested below on every cored hole of {k.projects[0] ?? 'the project'}, metre by metre as each was drilled.</>}
      right={k.projects.length > 1 ? <select aria-label="Project" value={project ?? k.projects[0]} onChange={e => setProject(e.target.value)} style={{ minHeight: 40, background: V.raised, color: V.text, border: `1px solid ${V.line}`, borderRadius: 10, padding: '0 10px' }}>{k.projects.map(p => <option key={p}>{p}</option>)}</select> : undefined}>
      {!k.ready ? <Note>Reading the core photos…</Note> : <>
        <Stats>
          <Stat label="Metres not drilled" value={`${r0(saved)} m`} note={`${stopped.length} of ${plans.length} holes stopped early · ${drilledAll ? Math.round(saved / drilledAll * 100) : 0}% of the metres`} tone={V.violet} />
          <Stat label="Money not spent" value={`SAR ${r0(sar)}`} note={`At each hole's own cost a metre (project median SAR ${r0(cpm)})`} tone={V.green} />
          <Stat label="Target found" value={`${r0(target)} m`} note="Vein-rich rock, from the tray photos" tone={V.orange} />
          <Stat label="Target missed by stopping" value={`${r0(missed)} m`} note={target ? `${Math.round(missed / Math.max(1, target + missed) * 100)}% of the target. The geologist confirms every stop.` : '—'} tone={missed ? V.amber : V.green} />
        </Stats>

        <Box title="Every hole, top to bottom" sub="Grey: drilled or planned · violet: target · green hatch: metres Geology GPS would not drill">
          <div style={{ display: 'grid', gap: 12 }}>
            {plans.map(({ g }) => <HoleBar key={g.hole} g={g} max={Math.max(...plans.map(p => Math.max(p.g.drilled, p.g.planned ?? 0)))} />)}
          </div>
        </Box>

        <Box title="The call, hole by hole" pad={false}>
          <div style={{ overflowX: 'auto' }}>
            <table className="v-tab">
              <thead><tr><th>Hole</th><th className="n">Planned</th><th className="n">Drilled</th><th>Target</th><th className="n">GPS stop</th><th className="n">Saved</th><th className="n">SAR saved</th><th>Why</th></tr></thead>
              <tbody>
                {plans.map(({ g, h }) => (
                  <tr key={g.hole}>
                    <td style={{ color: V.text, fontWeight: 700, fontFamily: vmono }}>{g.hole}</td>
                    <td className="n">{g.planned ? `${r0(g.planned)} m` : '—'}</td>
                    <td className="n">{r0(g.drilled)} m</td>
                    <td>{g.targetTop != null ? `${r0(g.targetTop)}–${r0(g.targetBase!)} m` : 'none'}</td>
                    <td className="n" style={{ color: g.stopAt ? V.violet : V.faint }}>{g.stopAt ? `${r0(g.stopAt)} m` : 'keep going'}</td>
                    <td className="n" style={{ color: g.saving ? V.green : V.faint }}>{g.saving ? `${r0(g.saving)} m` : '—'}</td>
                    <td className="n">{g.saving ? r0(g.saving * (h?.cpm ?? cpm)) : '—'}</td>
                    <td style={{ minWidth: 280, lineHeight: 1.5 }}>{g.why}{g.missed ? <> <Pill color={V.amber}>{g.missed} m target below the stop</Pill></> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Box>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 12 }}>
          <Box title="How it decides">
            <div style={{ display: 'grid', gap: 6, fontSize: 13.5, color: V.muted, lineHeight: 1.55 }}>
              <span>1. <b style={{ color: V.text }}>Target</b> is the richest quarter of vein rock on the project, measured on the tray photos ({(level * 100).toFixed(1)}% vein surface over 10 m).</span>
              <span>2. As the hole goes down, Copilot keeps the last 10 m of core and the holes around in view.</span>
              <span>3. When the hole has <b style={{ color: V.text }}>passed the target by 8 m</b>, the last 10 m are below target and the nearest holes show <b style={{ color: V.text }}>no target in the next 20 m</b>, it calls the stop.</span>
              <span>4. The geologist confirms. Nothing stops without a person.</span>
            </div>
          </Box>
          <Box title="Where it goes next">
            <div style={{ display: 'grid', gap: 6, fontSize: 13.5, color: V.muted, lineHeight: 1.55 }}>
              <span>• <b style={{ color: V.text }}>Live 3D rock model</b>: every metre drilled, from drilling readings and core, updates the model of the deposit.</span>
              <span>• <b style={{ color: V.text }}>Plan the next hole</b>: where to collar and how deep, to hit the target with the fewest metres.</span>
              <span>• <b style={{ color: V.text }}>Assays and XRF</b> added to the photos, so the target is grade, not only veins.</span>
              <Link href="/admin/geology/3d" style={{ color: V.orange, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6 }}>See the holes in the digital twin <ArrowRight size={14} /></Link>
            </div>
          </Box>
        </div>
        <Note>Back-test on the MVP&rsquo;s real cored holes: each hole is replayed as it was drilled, using only its own core above the bit and the other holes. &ldquo;Target missed&rdquo; counts target-grade metres the hole&rsquo;s own core shows below the stop: the cost of stopping, shown so the geologist can weigh it.</Note>
      </>}
    </Shell>
  )
}

function HoleBar({ g, max }: { g: GpsPlan; max: number }) {
  const end = Math.max(g.drilled, g.planned ?? 0)
  const X = (d: number) => `${(d / max) * 100}%`
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '78px minmax(0, 1fr) 110px', gap: 12, alignItems: 'center' }}>
      <span style={{ fontFamily: vmono, fontWeight: 700, fontSize: 13 }}>{g.hole}</span>
      <div style={{ position: 'relative', height: 22, background: V.raised, borderRadius: 6 }}>
        <div style={{ position: 'absolute', left: 0, width: X(end), top: 0, bottom: 0, background: '#2F3A48', borderRadius: 6 }} />
        {g.targetTop != null && g.targetBase != null && <div style={{ position: 'absolute', left: X(g.targetTop), width: X(g.targetBase - g.targetTop), top: 3, bottom: 3, background: V.violet, opacity: 0.85, borderRadius: 4 }} />}
        {g.stopAt != null && <>
          <div style={{ position: 'absolute', left: X(g.stopAt), width: X(end - g.stopAt), top: 0, bottom: 0, background: `repeating-linear-gradient(45deg, rgba(34,197,94,.35) 0 6px, rgba(34,197,94,.12) 6px 12px)`, borderRadius: '0 6px 6px 0' }} />
          <div style={{ position: 'absolute', left: X(g.stopAt), top: -4, bottom: -4, width: 3, background: V.green, borderRadius: 2 }} />
        </>}
      </div>
      <span style={{ fontSize: 12.5, color: g.saving ? V.green : V.faint, fontFamily: vmono, textAlign: 'right' }}>{g.saving ? `−${r0(g.saving)} m` : `${r0(end)} m`}</span>
    </div>
  )
}
