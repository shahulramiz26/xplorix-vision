'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Play, Pause, Check, Hand, Bot } from 'lucide-react'
import { useKnow } from '../../../../lib/copilot/context'
import { groundAhead, nextBroken, type AheadMetre } from '../../../../lib/copilot/ground'
import { start, step, NORMAL, BROKEN_SETTINGS, type RigState } from '../../../../lib/copilot/sim'
import { Shell, Box, Stat, Stats, Note, Pill, V, vmono } from '../ui'

/* ==========================================================================
 * AUTOPILOT LEVEL 4 — the rigs drill themselves; one person watches them all
 *
 * Every rig runs on Copilot: settings set by the rock ahead, eased through
 * broken ground, back up in good rock. People are asked only for the calls
 * that matter: a stuck bit, a trip for a new bit, stopping a hole. Each ask
 * comes with what Copilot would do and why. Simulated rigs on the real
 * holes and rock; the vision for year 3 and on, with rig makers.
 * ========================================================================== */

interface Ask { id: string; rig: string; title: string; why: string; kind: 'stall' | 'bit' | 'stop' | 'engine'; at: number }
interface Unit { rig: string; hole: string; ahead: AheadMetre[]; s: RigState; mode: 'auto' | 'held' | 'stopped' | 'trip'; tripLeft: number; fault: boolean; planned: number | null }
const r1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1)

export default function Autonomy() {
  const k = useKnow()
  const [units, setUnits] = useState<Unit[]>([])
  const [asks, setAsks] = useState<Ask[]>([])
  const [handled, setHandled] = useState<{ ask: Ask; answer: 'approved' | 'held' }[]>([])
  const [running, setRunning] = useState(true)
  const [t, setT] = useState(0)
  const raised = useRef<Set<string>>(new Set())

  // Every rig on the record, each put on one of this project's holes
  const pick = useMemo(() => {
    const hs = [...k.holes].sort((a, b) => (a.status === 'drilling' ? 0 : 1) - (b.status === 'drilling' ? 0 : 1))
    if (!hs.length) return []
    return k.fleet.slice(0, 6).map((f, i) => ({ ...hs[i % hs.length], rig: f.rig }))
  }, [k.holes, k.fleet])
  useEffect(() => {
    if (!k.ready || units.length || !pick.length) return
    setUnits(pick.map((h, i) => {
      const ahead = groundAhead({ hole: h.id, x: h.x, z: h.z }, k.cols, 0, Math.ceil(Math.max(h.planned ?? 0, h.drilled) + 60), 4)
      const b = k.bit(h.rig!)
      return { rig: h.rig!, hole: h.id, ahead, s: start(h.drilled, i === 1 ? b.life - 4 : b.used, b.life, 0, k.normal(h.rig!, h.formation) || 0.6), mode: 'auto', tripLeft: 0, fault: i === 3, planned: h.planned }
    }))
  }, [k.ready, pick, k, units.length])

  useEffect(() => {
    if (!running || !units.length) return
    const id = window.setInterval(() => {
      setT(x => x + 1)
      setUnits(us => us.map(u => {
        if (u.mode === 'stopped' || u.mode === 'held') return u
        if (u.mode === 'trip') { const left = u.tripLeft - 0.25 * 600; return left <= 0 ? { ...u, mode: 'auto', tripLeft: 0, s: { ...u.s, bitUsed: 0 } } : { ...u, tripLeft: left } }
        const nb = nextBroken(u.ahead, u.s.depth)
        const easing = u.s.ground === 'broken' || (nb != null && nb.inMetres < 1.5)
        const hot = u.s.engine > 92
        const settings = hot ? { ...NORMAL, rpm: 700, wob: 18 } : easing ? { ...BROKEN_SETTINGS } : { ...NORMAL }
        return { ...u, s: step({ ...u.s, settings }, 0.25 * 600, u.ahead, { engineFault: u.fault }) }
      }))
    }, 250)
    return () => window.clearInterval(id)
  }, [running, units.length])

  // What needs a person
  useEffect(() => {
    units.forEach(u => {
      const add = (kind: Ask['kind'], key: string, title: string, why: string) => {
        const id = `${u.rig}-${key}`
        if (raised.current.has(id)) return
        raised.current.add(id)
        setAsks(a => [...a, { id, rig: u.rig, title, why, kind, at: t }])
      }
      if (u.mode !== 'auto') return
      if (u.s.stalled > 300) add('stall', `stall-${Math.floor(u.s.depth)}`, `${u.rig}: bit grabbing at ${r1(u.s.depth)} m. Pull back 0.5 m and flush?`, 'Torque has stayed over the limit through eased settings. Copilot will not pull back without a person.')
      if (u.s.bitLife - u.s.bitUsed < 2) add('bit', 'bit', `${u.rig}: trip out for a new bit?`, `${Math.round(u.s.bitUsed)} of ${Math.round(u.s.bitLife)} m on the bit. A trip takes about 2 hours; the store has a bit on site.`)
      if (u.s.engine > 96) add('engine', 'engine', `${u.rig}: engine ${Math.round(u.s.engine)} °C on eased load. Stop and check coolant?`, 'Copilot has already eased the rig. Still rising: the cooling is failing, not the load.')
      if (u.planned && u.s.depth >= u.planned) add('stop', 'stop', `${u.rig}: planned depth reached on ${u.hole}. End the hole?`, 'Geologist to confirm the end of hole.')
    })
  }, [t, units])

  const answer = (a: Ask, ans: 'approved' | 'held') => {
    setAsks(x => x.filter(y => y.id !== a.id))
    setHandled(h => [{ ask: a, answer: ans }, ...h].slice(0, 10))
    setUnits(us => us.map(u => {
      if (u.rig !== a.rig) return u
      if (ans === 'held') return { ...u, mode: 'held' }
      if (a.kind === 'stall') return { ...u, s: { ...u.s, stalled: 0, depth: u.s.depth - 0.5 } }
      if (a.kind === 'bit') return { ...u, mode: 'trip', tripLeft: 7200 }
      if (a.kind === 'engine') return { ...u, fault: false, mode: 'auto', s: { ...u.s, engine: 84 } }
      return { ...u, mode: 'stopped' }
    }))
  }

  const metres = units.reduce((s, u) => s + u.s.metresToday, 0)
  const auto = units.filter(u => u.mode === 'auto').length

  return (
    <Shell stage="y3" title="Autopilot level 4: one person, the whole fleet"
      lead={<>Every rig drills on Copilot: it reads the rock ahead, sets rotation, bit load and water, eases through broken ground and comes back up in good rock. People make only the calls that matter, each with Copilot&rsquo;s suggestion and its reason.</>}
      right={<button className="v-btn" onClick={() => setRunning(r => !r)}>{running ? <><Pause size={15} /> Pause</> : <><Play size={15} /> Run</>}</button>}>
      <Note><b style={{ color: V.text }}>Vision demo.</b> Simulated rigs on the real holes and the real rock around them, running 600× faster than life. Level 4 needs control links into the rig, built with rig makers step by step: level 2 (apply to rig) and level 3 (adjust within limits) come first.</Note>
      <Stats>
        <Stat label="Rigs on autopilot" value={`${auto} of ${units.length}`} note="Settings by Copilot, every few seconds" tone={V.blue} />
        <Stat label="People watching" value="1" note={`${units.length} rigs for one operator, instead of a driller at each`} tone={V.violet} />
        <Stat label="Metres this run" value={`${r1(metres)} m`} note="All rigs together" tone={V.orange} />
        <Stat label="Calls made by people" value={handled.length} note={asks.length ? `${asks.length} waiting now` : 'Nothing waiting'} tone={asks.length ? V.amber : V.green} />
      </Stats>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(300px, 1fr)', gap: 12, alignItems: 'start' }} className="v-auto-grid">
        <style>{`@media (max-width: 1000px) { .v-auto-grid { grid-template-columns: 1fr !important } }`}</style>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(230px, 100%), 1fr))', gap: 12 }}>
          {units.map(u => {
            const nb = nextBroken(u.ahead, u.s.depth)
            const tone = u.mode === 'stopped' ? V.faint : u.mode === 'held' ? V.amber : u.mode === 'trip' ? V.blue : asks.some(a => a.rig === u.rig) ? V.amber : u.s.ground === 'broken' ? V.violet : V.green
            return (
              <div key={u.rig} style={{ background: V.panel, border: `1px solid ${V.line}`, borderRadius: 14, padding: 14, borderTop: `3px solid ${tone}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: vmono, fontWeight: 800 }}>{u.rig}</span>
                  <Pill color={tone}>{u.mode === 'auto' ? (asks.some(a => a.rig === u.rig) ? 'Needs you' : 'Autopilot') : u.mode === 'trip' ? 'Changing bit' : u.mode === 'held' ? 'Held' : 'Hole ended'}</Pill>
                </div>
                <div style={{ fontSize: 12, color: V.faint, marginTop: 2 }}>{u.hole} · {u.s.ground === 'broken' ? 'broken ground' : u.s.ground === 'hard' ? 'harder ground' : 'good ground'}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, gap: 8 }}>
                  <div><div style={{ fontSize: 10.5, color: V.faint, letterSpacing: '.08em' }}>DEPTH</div><div style={{ fontFamily: vmono, fontSize: 22, fontWeight: 700 }}>{r1(u.s.depth)}<span style={{ fontSize: 11, color: V.faint }}> m</span></div></div>
                  <div style={{ textAlign: 'right' }}><div style={{ fontSize: 10.5, color: V.faint, letterSpacing: '.08em' }}>SPEED</div><div style={{ fontFamily: vmono, fontSize: 18, fontWeight: 700 }}>{u.mode === 'auto' ? u.s.rop.toFixed(2) : '—'}<span style={{ fontSize: 11, color: V.faint }}> m/h</span></div></div>
                </div>
                <div style={{ fontFamily: vmono, fontSize: 12, color: V.orange, marginTop: 8 }}>{u.s.settings.rpm} rpm · {u.s.settings.wob} kN · {u.s.settings.flow} L/min</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8, fontSize: 12, color: V.muted }}>
                  <span>Torque <b style={{ color: u.s.torque > 1100 ? V.red : V.text }}>{Math.round(u.s.torque)}</b></span>
                  <span>Engine <b style={{ color: u.s.engine > 93 ? V.red : V.text }}>{Math.round(u.s.engine)} °C</b></span>
                  <span>Bit left <b style={{ color: V.text }}>{r1(Math.max(0, u.s.bitLife - u.s.bitUsed))} m</b></span>
                  <span>{nb ? <>Broken in <b style={{ color: V.violet }}>{r1(nb.inMetres)} m</b></> : 'Good rock ahead'}</span>
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <Box title="Needs a person" sub="Copilot asks; a person decides">
            {asks.length === 0 && <div style={{ fontSize: 13.5, color: V.muted, display: 'flex', gap: 8, alignItems: 'center' }}><Bot size={16} color={V.green} /> Every rig is handling itself.</div>}
            <div style={{ display: 'grid', gap: 10 }}>
              {asks.map(a => (
                <div key={a.id} style={{ background: V.raised, borderRadius: 12, padding: 12, border: `1px solid rgba(245,158,11,.4)` }}>
                  <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.35 }}>{a.title}</div>
                  <div style={{ fontSize: 12.5, color: V.muted, marginTop: 5, lineHeight: 1.5 }}>{a.why}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button className="v-btn" style={{ background: V.green, borderColor: V.green, color: '#04130A' }} onClick={() => answer(a, 'approved')}><Check size={15} /> Approve</button>
                    <button className="v-btn" onClick={() => answer(a, 'held')}><Hand size={15} /> Hold the rig</button>
                  </div>
                </div>
              ))}
            </div>
          </Box>
          <Box title="Decided">
            {handled.length === 0 ? <div style={{ fontSize: 13, color: V.faint }}>Nothing yet.</div> : (
              <div style={{ display: 'grid', gap: 6, fontSize: 12.5, color: V.muted }}>
                {handled.map((h, i) => <span key={i}><b style={{ color: h.answer === 'approved' ? V.green : V.amber }}>{h.answer === 'approved' ? 'Approved' : 'Held'}</b> · {h.ask.title}</span>)}
              </div>
            )}
          </Box>
        </div>
      </div>
    </Shell>
  )
}
