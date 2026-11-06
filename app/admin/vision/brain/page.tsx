'use client'

import { useEffect, useMemo } from 'react'
import { TODAY } from '../../../../lib/company'
import { useKnow } from '../../../../lib/copilot/context'
import { backtest } from '../../../../lib/copilot/ground'
import { settingsFor } from '../../../../lib/copilot/sim'
import { copilot, useCopilot, type AlertKind } from '../../../../lib/copilot/store'
import { Shell, Box, Stat, Stats, Note, V, vmono } from '../ui'

/* ==========================================================================
 * FLEET BRAIN — every metre teaches every rig
 *
 * What Copilot has learned so far, from the MVP's own record: the best way
 * to drill each ground and the crew that does it best, how often each kind
 * of advice worked, and an honest check of the ground radar against the
 * real core. Each company's records stay its own; the brain learns the
 * patterns.
 * ========================================================================== */

const r0 = (n: number) => Math.round(n).toLocaleString('en-US')

export default function FleetBrain() {
  const k = useKnow()
  const { events } = useCopilot()
  useEffect(() => { if (k.ready && k.drillers.length) copilot.seed(k.fleet, k.drillers, TODAY) }, [k.ready, k.fleet, k.drillers])

  const tests = useMemo(() => k.cols.length > 2 ? [1, 2, 3, 4].map(n => backtest(k.cols, n)) : [], [k.cols])
  const metres = k.logs.reduce((s, l) => s + l.metresDrilled, 0)
  const rigs = new Set(k.logs.map(l => l.rig)).size
  const cored = k.cols.reduce((s, c) => s + c.rows.length, 0)
  const judged = events.filter(e => e.outcome === 'worked' || e.outcome === 'failed')
  const best = tests.reduce<typeof tests[number] | null>((b, t) => !b || t.right / Math.max(1, t.metres) > b.right / Math.max(1, b.metres) ? t : b, null)
  const kinds: AlertKind[] = ['broken-ahead', 'engine-hot', 'bit-life', 'blocking', 'slow', 'idle', 'survey-due', 'gps-stop']

  return (
    <Shell stage="y2" title="Fleet brain: every metre teaches every rig"
      lead={<>Copilot learns from every shift on every rig: the best way to drill each ground, which crew does it best, and which advice really works. A new rig on XPLORIX starts with everything the fleet already knows. That is the network effect a competitor starting later cannot catch.</>}>
      {!k.ready ? <Note>Reading the record…</Note> : <>
        <Stats>
          <Stat label="Metres learned from" value={`${r0(metres)} m`} note={`${r0(k.logs.length)} shift logs`} tone={V.orange} />
          <Stat label="Rigs and crews" value={`${rigs} · ${k.drillers.length}`} note="Every rig and driller on the record" tone={V.blue} />
          <Stat label="Core read" value={`${r0(cored)} m`} note={`${k.cols.length} holes of tray photos, metre by metre`} tone={V.violet} />
          <Stat label="Advice outcomes" value={r0(judged.length)} note={`${judged.length ? Math.round(judged.filter(e => e.outcome === 'worked').length / judged.length * 100) : 0}% worked: the loop Copilot learns on`} tone={V.green} />
        </Stats>

        <Box title="The best way to drill each ground" sub="From the shift logs: the fleet's normal speed, the best crew and the settings Copilot starts from" pad={false}>
          <div style={{ overflowX: 'auto' }}>
            <table className="v-tab">
              <thead><tr><th>Ground</th><th className="n">Metres</th><th className="n">Rigs</th><th className="n">Fleet normal</th><th>Best crew</th><th className="n">Best crew</th><th className="n">Gap</th><th>Copilot starts at</th></tr></thead>
              <tbody>{k.byGround.map(g => {
                const set = settingsFor(/very hard/i.test(g.ground) ? 'hard' : 'good')
                const gap = g.best && g.fleet ? g.best.rop / g.fleet - 1 : null
                return (
                  <tr key={g.ground}>
                    <td style={{ color: V.text, fontWeight: 600 }}>{g.ground.replace(' Formation', '')}</td>
                    <td className="n">{r0(g.metres)}</td><td className="n">{g.rigs}</td>
                    <td className="n">{g.fleet.toFixed(2)} m/h</td>
                    <td>{g.best?.name ?? '—'}</td>
                    <td className="n" style={{ color: V.green }}>{g.best ? `${g.best.rop.toFixed(2)} m/h` : '—'}</td>
                    <td className="n">{gap != null ? `+${Math.round(gap * 100)}%` : '—'}</td>
                    <td style={{ fontFamily: vmono, fontSize: 12.5, color: V.orange }}>{set.rpm} rpm · {set.wob} kN · {set.flow} L/min</td>
                  </tr>)
              })}</tbody>
            </table>
          </div>
          <div style={{ padding: '10px 14px', fontSize: 12.5, color: V.faint, borderTop: `1px solid ${V.line}` }}>The gap is what Copilot coaches toward: every crew drilling each ground the way the best crew does. Settings are the starting point; with live sensors the brain tunes them by rig and ground.</div>
        </Box>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(440px, 100%), 1fr))', gap: 12 }}>
          <Box title="Ground radar, checked against the core" sub="Each cored hole left out in turn and predicted from the others" pad={false}>
            <div style={{ overflowX: 'auto' }}>
              <table className="v-tab">
                <thead><tr><th>Nearby holes used</th><th className="n">Metres checked</th><th className="n">Right</th><th className="n">Broken ground caught</th></tr></thead>
                <tbody>{tests.map(t => (
                  <tr key={t.k} style={best === t ? { background: 'rgba(34,197,94,.06)' } : undefined}>
                    <td style={{ color: V.text }}>{t.k}</td>
                    <td className="n">{r0(t.metres)}</td>
                    <td className="n">{t.metres ? `${Math.round(t.right / t.metres * 100)}%` : '—'}</td>
                    <td className="n">{t.brokenAll ? `${t.brokenFound} of ${t.brokenAll} m (${Math.round(t.brokenFound / t.brokenAll * 100)}%)` : '—'}</td>
                  </tr>))}</tbody>
              </table>
            </div>
            <div style={{ padding: '10px 14px', fontSize: 12.5, color: V.faint, borderTop: `1px solid ${V.line}`, lineHeight: 1.5 }}>Honest today: with {k.cols.length} cored holes the radar is right on most metres but catches only part of the broken ground ahead, because broken zones are local. It gets better with every hole drilled near it, and with live drilling readings (torque and penetration feel broken rock before the core shows it).</div>
          </Box>
          <Box title="Advice that works, by kind">
            <div style={{ display: 'grid', gap: 9 }}>
              {kinds.map(kind => {
                const xs = events.filter(e => e.kind === kind && (e.outcome === 'worked' || e.outcome === 'failed'))
                const w = xs.filter(e => e.outcome === 'worked').length
                const p = xs.length ? w / xs.length : 0
                return (
                  <div key={kind} style={{ display: 'grid', gridTemplateColumns: '160px minmax(0,1fr) 92px', gap: 10, alignItems: 'center', fontSize: 13 }}>
                    <span style={{ color: V.text }}>{kind.replace('-', ' ').replace(/^./, c => c.toUpperCase())}</span>
                    <div style={{ height: 10, background: V.raised, borderRadius: 5, overflow: 'hidden' }}><div style={{ width: `${p * 100}%`, height: '100%', background: p >= 0.85 ? V.green : p >= 0.7 ? V.amber : V.red }} /></div>
                    <span style={{ fontFamily: vmono, color: V.muted, textAlign: 'right' }}>{w} of {xs.length}</span>
                  </div>)
              })}
            </div>
          </Box>
        </div>

        <Box title="How the brain grows">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 12 }}>
            {[
              ['1 · Every shift', 'Speed, ground, bit, stops and crew from the shift log; core from the tray photos.', V.orange],
              ['2 · Every piece of advice', 'What Copilot said, what the crew did, what happened next. Advice that works is said earlier; advice that does not is said less.', V.green],
              ['3 · Every rig', 'Patterns shared across the fleet, so a new rig starts with what all the others learned.', V.violet],
              ['4 · Private by design', 'Each company\'s records stay its own. The brain shares patterns and settings, never another company\'s data.', V.blue],
            ].map(([t, d, c]) => (
              <div key={t as string} style={{ background: V.raised, borderRadius: 12, padding: 14, borderTop: `3px solid ${c}` }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{t}</div>
                <div style={{ fontSize: 13, color: V.muted, marginTop: 6, lineHeight: 1.5 }}>{d}</div>
              </div>
            ))}
          </div>
        </Box>
        <Note>Speeds, crews and the radar check come from the MVP&rsquo;s real record. Advice outcomes are demo history plus live cockpit sessions. Copilot runs on rules today; the launch version trains models on the same record.</Note>
      </>}
    </Shell>
  )
}
