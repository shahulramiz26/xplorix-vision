'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Pause, Play, Radio, Wifi, WifiOff, ArrowRight } from 'lucide-react'
import { useAdminOverview } from '../../../lib/admin-overview'
import { useCosting, perUnit, moneyL } from '../../../lib/costing-store'
import { useInventory, TODAY } from '../../../lib/inventory-store'
import { companyToday, type RigToday } from '../../../lib/company-overview'
import { CostBullet } from '../../components/dash-viz'
import {
  METRICS, METRIC_KEYS, MODE_LABEL, OPEN_AT, alarms, buildFleet, clock, depthAt, history, level, reading, sensorMetres,
  esgToday, CO2_KG_PER_LITRE, DIESEL_PER_LITRE, SHIFT_START,
  type Level, type Metric, type MetricKey, type PulseRig,
} from '../../../lib/pulse'
import { Page, PageHead, Card, Tile, Grid, Btn, T, num, eyebrow, mono, radius, tint, th, thR, td, tdR, tdStrong, rowLine, Status } from '../../components/kit'
import { AiMark, Md } from '../../components/ai'

/* ==========================================================================
 * XPLORIX PULSE — what the rigs are doing right now, from their sensors
 *
 * Fleet first (one card a rig), then the chosen rig's live gauges and its
 * last 30 minutes, then the alarms the readings raise with the reason for
 * each, then the check every manager wants: does the sensor agree with the
 * shift log? The feed is simulated (lib/pulse.ts) and the screen says so.
 * ========================================================================== */

const LEVEL_COLOR: Record<Level, string> = { good: T.green, warn: T.amber, bad: T.red, neutral: T.faint }
const LEVEL_WORD: Record<Level, string> = { good: 'Normal', warn: 'Watch', bad: 'Out of range', neutral: 'Not running' }
/* Cost a metre, live. An own rig costs its day rate whether it drills or not,
 * so cost so far starts from today's costed shifts (the same figure as the
 * Dashboard) and grows by the hour, while metres come from the depth sensor:
 * it climbs the moment a rig slows. A contractor's rig is paid by the metre,
 * so its cost a metre holds. */
interface Live { cpm: number | null; rate: number | null; costSoFar: number | null; metres: number; how: 'time' | 'contract' | 'none' }
function liveCost(p: PulseRig, t: number, m?: RigToday): Live {
  const metres = sensorMetres(p, t)
  if (!m || (m.contractor ? m.cpm == null : m.dayCost == null)) return { cpm: null, rate: m?.rate ?? null, costSoFar: null, metres, how: 'none' }
  if (m.contractor) return { cpm: m.cpm, rate: m.rate, costSoFar: (m.cpm as number) * metres, metres, how: 'contract' }
  const day = m.dayCost as number
  // Costed today: start from the logged cost and keep adding the hourly day
  // rate as the clock runs. Not costed today: spread the last day over the hours gone.
  const costSoFar = m.cpmDate ? day * (t % 86400) / 86400 : day + day / 24 * Math.max(0, t - OPEN_AT) / 3600
  return { cpm: metres >= 1 ? costSoFar / metres : null, rate: m.rate, costSoFar, metres, how: 'time' }
}

const fmt = (m: Metric, v: number | null) => v == null ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: m.dp, minimumFractionDigits: m.dp })

export default function PulsePage() {
  const o = useAdminOverview()
  const fleet = useMemo(() => buildFleet(o.rigs), [o.rigs])
  const { state: costing } = useCosting()
  const { state: inv } = useInventory()
  const money = useMemo(() => new Map(companyToday(costing, inv, TODAY).rigs.map(r => [r.rig, r])), [costing, inv])
  const [t, setT] = useState(OPEN_AT)
  const [live, setLive] = useState(true)
  const [pick, setPick] = useState<string | null>(null)

  useEffect(() => {
    if (!live) return
    const id = window.setInterval(() => setT(x => x + 2), 2000)
    return () => window.clearInterval(id)
  }, [live])
  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get('rig')
    if (r) setPick(r)
  }, [])

  const al = useMemo(() => alarms(fleet, t), [fleet, t])
  const sel = fleet.find(p => p.rig === pick) ?? fleet.find(p => al.some(a => a.rig === p.rig && a.level === 'act')) ?? fleet[0]
  const sending = fleet.filter(p => p.mode !== 'offline').length
  const drilling = fleet.filter(p => p.mode === 'drilling').length
  const act = al.filter(a => a.level === 'act').length
  const metresNow = fleet.reduce((s, p) => s + sensorMetres(p, t), 0)
  const lives = new Map(fleet.map(p => [p.rig, liveCost(p, t, money.get(p.rig))]))
  const costed = Array.from(lives.values()).filter(l => l.cpm != null && l.costSoFar != null)
  const fleetCpm = costed.reduce((s, l) => s + l.metres, 0) ? costed.reduce((s, l) => s + (l.costSoFar as number), 0) / costed.reduce((s, l) => s + l.metres, 0) : null
  const fleetRop = fleet.filter(p => p.mode === 'drilling').map(p => reading(p, 'rop', t) ?? 0)

  if (!sel) return <Page><PageHead question="What are the rigs doing right now?" answer="No rigs yet. Add a rig and its sensors will show here." /></Page>

  return (
    <Page>
      <PageHead
        question="What are the rigs doing right now?"
        tone={act ? 'bad' : al.length ? 'warn' : 'good'}
        answer={<>{sending} of {fleet.length} rigs sending, {drilling} drilling. {act ? `${act} ${act === 1 ? 'alarm needs' : 'alarms need'} someone now` : al.length ? `${al.length} to watch` : 'Every reading is in range'}.</>}
        right={<>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '0 11px', minHeight: 36, borderRadius: 7, border: `1px solid ${T.border}`, background: T.card, fontSize: 12.5, color: T.muted }}>
            <span aria-hidden className={live ? 'xpl-pulse-dot' : ''} style={{ width: 8, height: 8, borderRadius: 4, background: live ? T.green : T.faint }} />
            <span style={{ ...num, color: T.text, fontWeight: 600 }}>{clock(t)}</span>
            <span>{live ? 'live' : 'paused'}</span>
          </span>
          <Btn onClick={() => setLive(v => !v)}>{live ? <><Pause size={14} /> Pause feed</> : <><Play size={14} /> Resume feed</>}</Btn>
        </>}
      />
      <style>{`
        @keyframes xplPulse { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--x-green) 55%, transparent) } 70% { box-shadow: 0 0 0 7px transparent } 100% { box-shadow: 0 0 0 0 transparent } }
        .xpl-pulse-dot { animation: xplPulse 2s infinite; }
        @media (prefers-reduced-motion: reduce) { .xpl-pulse-dot { animation: none; } }
        .xpl-rigcard:hover { border-color: var(--x-border3) !important; }
        .xpl-rigcard:focus-visible { outline: 2px solid var(--x-orange); outline-offset: 2px; }
        @media (max-width: 900px) { .xpl-pulse-2 { grid-template-columns: minmax(0,1fr) !important; } }
      `}</style>

      <div role="note" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 14px', borderRadius: radius, border: `1px dashed ${T.border}`, background: tint('var(--x-blue)', 6), fontSize: 12.5, color: T.muted, lineHeight: 1.55 }}>
        <Radio size={15} style={{ color: T.blue, flexShrink: 0, marginTop: 2 }} aria-hidden />
        <span><b style={{ color: T.text }}>Simulated feed.</b> No rig is fitted with sensors yet. This shows how Pulse will look once they are: the readings follow what today&rsquo;s drill logs say each rig is doing, and a few rigs play out patterns real sensors catch.</span>
      </div>

      <Grid min={180}>
        <Tile label="Rigs sending" value={`${sending}/${fleet.length}`} note={fleet.length - sending ? `${fleet.length - sending} with no signal` : 'All on line'} tone={fleet.length - sending ? 'warn' : 'good'} />
        <Tile label="Metres by sensor today" value={`${metresNow.toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} m`} note="Counted by the depth encoders" />
        <Tile label="Fleet penetration now" value={fleetRop.length ? `${(fleetRop.reduce((s, v) => s + v, 0) / fleetRop.length).toFixed(1)} m/h` : '—'} note={`Average of ${fleetRop.length} drilling ${fleetRop.length === 1 ? 'rig' : 'rigs'}`} />
        <Tile label="Cost a metre now" value={fleetCpm != null ? perUnit(fleetCpm) : '—'} note={`Fleet, live: today's cost so far over sensor metres`} />
        <Tile label="Alarms" value={al.length} note={act ? `${act} to act on now` : al.length ? 'To watch, none urgent' : 'None'} tone={act ? 'bad' : al.length ? 'warn' : 'good'} />
      </Grid>

      {/* FLEET */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 45%), 1fr))', gap: 12 }}>
        {fleet.map(p => <RigCard key={p.rig} p={p} t={t} live={lives.get(p.rig)!} on={p.rig === sel.rig} alarm={al.filter(a => a.rig === p.rig)} onPick={() => setPick(p.rig)} />)}
      </div>

      {/* COST A METRE, LIVE */}
      <Card title="Cost a metre, live" subtitle={`Every rig at ${clock(t)}. Your rigs: today's cost so far, growing by the hour, over the metres the sensor has counted. Contractor rigs: their rate a metre.`} pad={false}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Rig</th><th style={thR}>Metres today</th><th style={thR}>Cost so far</th><th style={th}>Cost a metre now</th><th style={thR}>Earned a metre</th></tr></thead>
            <tbody>
              {(() => {
                const max = Math.max(1, ...Array.from(lives.values()).flatMap(l => [l.cpm ?? 0, l.rate ?? 0]))
                return fleet.map(p => {
                  const l = lives.get(p.rig)!
                  const over = l.cpm != null && l.rate != null && l.cpm > l.rate
                  return (
                    <tr key={p.rig} style={{ borderTop: rowLine }}>
                      <td style={td}><div style={{ ...num, color: T.text, fontWeight: 600 }}>{p.rig}</div><div style={{ fontSize: 12, color: T.faint }}>{l.how === 'contract' ? 'Contractor, paid a metre' : MODE_LABEL[p.mode]}</div></td>
                      <td style={tdR}>{l.metres.toFixed(1)} m</td>
                      <td style={tdR}>{l.costSoFar != null ? moneyL(l.costSoFar) : '—'}</td>
                      <td style={{ ...td, minWidth: 200 }}>
                        {l.cpm == null ? <span style={{ color: T.faint }}>{l.how === 'none' ? 'No costed day yet' : 'No metres yet'}</span> : (
                          <div style={{ display: 'grid', gap: 4 }}>
                            <span style={{ ...num, fontSize: 13.5, fontWeight: 600, color: over ? 'var(--x-bad-text)' : T.text }}>{perUnit(l.cpm)}{over && <span style={{ fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600 }}> · costing more than it earns</span>}</span>
                            <CostBullet cost={l.cpm} earned={l.rate} max={max * 1.05} w={160} />
                          </div>
                        )}
                      </td>
                      <td style={tdR}>{l.rate != null ? perUnit(l.rate) : '—'}</td>
                    </tr>
                  )
                })
              })()}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '10px 14px', fontSize: 12, color: T.faint, borderTop: rowLine, lineHeight: 1.5 }}>
          Updates with every reading. It starts from today&rsquo;s costed shifts, the same figure as the Dashboard, so the two agree when the feed opens; it differs only where the sensor counts metres the log does not.
        </div>
      </Card>

      {/* ESG FROM THE RIG */}
      <EsgCard fleet={fleet} t={t} />

      {/* SELECTED RIG */}
      <Card title={`${sel.rig} live`} subtitle={[sel.project, sel.hole ? `hole ${sel.hole}` : null, MODE_LABEL[sel.mode]].filter(Boolean).join(' · ')}
        right={<span style={{ ...num, fontSize: 13, color: T.muted }}>Bit at <b style={{ color: T.text, fontSize: 15 }}>{depthAt(sel, t).toFixed(2)} m</b></span>}>
        {sel.mode === 'offline' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '22px 4px', color: T.muted, fontSize: 13.5 }}>
            <WifiOff size={18} aria-hidden /> No signal from {sel.rig}. The gateway keeps readings while it is out of range and sends them when it is back.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(140px, 45%), 1fr))', gap: 10 }}>
            {METRIC_KEYS.map(k => <Gauge key={k} m={METRICS[k]} v={reading(sel, k, t)} p={sel} />)}
          </div>
        )}
      </Card>

      {sel.mode !== 'offline' && (
        <Card title="Last 30 minutes" subtitle={`${sel.rig} · one reading a minute · shaded band is the normal range`}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(240px, 100%), 1fr))', gap: 12 }}>
            {(['rpm', 'wob', 'torque', 'pressure', 'flow', 'rop', 'engine', 'fuel'] as MetricKey[]).map(k => <Trend key={k} m={METRICS[k]} p={sel} t={t} />)}
          </div>
        </Card>
      )}

      <div className="xpl-pulse-2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.25fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
        {/* ALARMS */}
        <Card title="What the sensors are telling you" subtitle={`${al.length} across the fleet · newest pattern first within each level`}>
          {al.length === 0 && <div style={{ fontSize: 13, color: T.faint }}>Every reading is in its normal range.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {al.map(a => (
              <div key={a.id} style={{ position: 'relative', padding: '12px 14px 12px 16px', borderRadius: 9, border: `1px solid ${T.border}`, background: T.card, boxShadow: `inset 3px 0 0 ${a.level === 'act' ? T.red : T.amber}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Status tone={a.level === 'act' ? 'bad' : 'warn'}>{a.level === 'act' ? 'Act now' : 'Watch'}</Status>
                  <button onClick={() => setPick(a.rig)} style={{ ...num, fontSize: 12.5, fontWeight: 600, color: T.text, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline', textDecorationColor: T.border, textUnderlineOffset: 3 }}>{a.rig}</button>
                  <span style={{ fontSize: 12, color: T.faint }}>since {clock(a.since, false)}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginTop: 7, lineHeight: 1.4 }}>{a.title}</div>
                <div style={{ marginTop: 8 }}><AiMark label="Why" size={11} /></div>
                <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.6, margin: '4px 0 0' }}><Md text={a.why} /></p>
                <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.6, margin: '6px 0 0' }}><b style={{ color: T.text }}>What to do: </b>{a.todo}</p>
                <Link href={a.href} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 9, fontSize: 12.5, fontWeight: 600, color: T.orange, textDecoration: 'none' }}>{a.action} <ArrowRight size={13} /></Link>
              </div>
            ))}
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <LogCheck fleet={fleet} t={t} />
          <Fitted p={sel} t={t} />
        </div>
      </div>
    </Page>
  )
}

/* ── One card a rig ─────────────────────────────────────────────────────── */

function RigCard({ p, t, live, on, alarm, onPick }: { p: PulseRig; t: number; live: Live; on: boolean; alarm: { level: string }[]; onPick: () => void }) {
  const worst = alarm.some(a => a.level === 'act') ? 'bad' : alarm.length ? 'warn' : p.mode === 'drilling' ? 'good' : 'neutral'
  const color = LEVEL_COLOR[worst as Level]
  const rop = history(p, 'rop', t).map(h => h.v ?? 0)
  return (
    <button onClick={onPick} aria-pressed={on} className="xpl-rigcard" style={{
      textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', padding: '12px 14px', borderRadius: radius, minWidth: 0,
      background: T.card, border: `1px solid ${on ? 'var(--x-orange)' : T.border}`, boxShadow: on ? '0 0 0 1px var(--x-orange)' : 'var(--x-card-shadow)',
      position: 'relative', overflow: 'hidden',
    }}>
      <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: color }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ ...num, fontSize: 14, fontWeight: 600, color: T.text }}>{p.rig}</span>
        <Signal bars={p.signal} />
      </div>
      <div style={{ fontSize: 12, color: T.faint, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {p.hole ? `${p.hole} · ` : ''}{MODE_LABEL[p.mode]}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, marginTop: 10 }}>
        <div>
          <div style={eyebrow}>Depth</div>
          <div style={{ ...num, fontSize: 19, fontWeight: 600, color: T.text, marginTop: 3 }}>{depthAt(p, t).toFixed(1)}<span style={{ fontSize: 12, color: T.faint, marginLeft: 3 }}>m</span></div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={eyebrow}>m/h</div>
          <div style={{ ...num, fontSize: 15, fontWeight: 600, color: T.text, marginTop: 3 }}>{p.mode === 'drilling' ? (reading(p, 'rop', t) ?? 0).toFixed(1) : '—'}</div>
        </div>
      </div>
      <MiniLine values={rop} color={p.mode === 'drilling' ? 'var(--x-blue)' : 'var(--x-faint)'} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
        <span style={eyebrow}>Cost a metre</span>
        <span style={{ ...num, fontSize: 13, fontWeight: 600, color: live.cpm != null && live.rate != null && live.cpm > live.rate ? 'var(--x-bad-text)' : T.text }}>{live.cpm != null ? perUnit(live.cpm) : '—'}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12, color: alarm.length ? T.text : T.faint, fontWeight: alarm.length ? 600 : 400 }}>
        <span aria-hidden style={{ width: 7, height: 7, borderRadius: 2, background: color }} />
        {alarm.length ? `${alarm.length} ${alarm.length === 1 ? 'alarm' : 'alarms'}` : p.mode === 'drilling' ? 'All readings normal' : p.mode === 'offline' ? 'Waiting for signal' : 'Not drilling'}
      </div>
    </button>
  )
}

function Signal({ bars }: { bars: number }) {
  return (
    <span role="img" aria-label={bars ? `Signal ${bars} of 4` : 'No signal'} style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: 12 }}>
      {bars === 0 ? <WifiOff size={13} style={{ color: T.faint }} /> : [1, 2, 3, 4].map(i => (
        <span key={i} style={{ width: 3, height: 3 + i * 2.2, borderRadius: 1, background: i <= bars ? T.muted : 'var(--x-border)' }} />
      ))}
    </span>
  )
}

function MiniLine({ values, color }: { values: number[]; color: string }) {
  const w = 200, h = 30, max = Math.max(1, ...values)
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${(i / (values.length - 1)) * w},${h - 2 - (v / max) * (h - 4)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden style={{ display: 'block', width: '100%', height: h, marginTop: 8 }}>
      <path d={`${d} L${w},${h} L0,${h} Z`} fill={tint(color, 12)} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/* ── Live gauge: an arc with its normal band, the value, and a word ─────── */

const A0 = -120, A1 = 120
function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg - 90) * Math.PI / 180
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
}
function arc(cx: number, cy: number, r: number, d0: number, d1: number) {
  const [x0, y0] = polar(cx, cy, r, d0), [x1, y1] = polar(cx, cy, r, d1)
  return `M${x0},${y0} A${r},${r} 0 ${d1 - d0 > 180 ? 1 : 0} 1 ${x1},${y1}`
}
function Gauge({ m, v, p }: { m: Metric; v: number | null; p: PulseRig }) {
  const lv = level(m, v, p.mode)
  const c = LEVEL_COLOR[lv]
  const at = (x: number) => A0 + (Math.max(m.min, Math.min(m.max, x)) - m.min) / (m.max - m.min) * (A1 - A0)
  const cx = 60, cy = 58, r = 46
  return (
    <div style={{ padding: '10px 10px 12px', borderRadius: 9, border: `1px solid ${T.border}`, background: 'var(--x-raised)', textAlign: 'center' }}>
      <div style={{ ...eyebrow, textAlign: 'left' }}>{m.label}</div>
      <svg viewBox="0 0 120 96" style={{ display: 'block', width: '100%', maxWidth: 150, margin: '2px auto 0' }} role="img" aria-label={`${m.label} ${fmt(m, v)} ${m.unit}, ${LEVEL_WORD[lv]}`}>
        <path d={arc(cx, cy, r, A0, A1)} fill="none" stroke="var(--x-border)" strokeWidth={8} strokeLinecap="round" />
        <path d={arc(cx, cy, r, at(m.lo), at(m.hi))} fill="none" stroke={tint('var(--x-green)', 30)} strokeWidth={8} />
        {v != null && at(v) > A0 + 0.5 && <path d={arc(cx, cy, r, A0, at(v))} fill="none" stroke={c} strokeWidth={8} strokeLinecap="round" style={{ transition: 'd .6s' }} />}
        <text x={cx} y={cy + 4} textAnchor="middle" style={{ fontFamily: mono, fontSize: 19, fontWeight: 600, fill: 'var(--x-text)' }}>{fmt(m, v)}</text>
        <text x={cx} y={cy + 19} textAnchor="middle" style={{ fontSize: 10.5, fill: 'var(--x-faint)' }}>{m.unit}</text>
        <text x={polar(cx, cy, r, A0)[0]} y={92} textAnchor="middle" style={{ fontFamily: mono, fontSize: 9, fill: 'var(--x-faint)' }}>{m.min}</text>
        <text x={polar(cx, cy, r, A1)[0]} y={92} textAnchor="middle" style={{ fontFamily: mono, fontSize: 9, fill: 'var(--x-faint)' }}>{m.max}</text>
      </svg>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: lv === 'neutral' ? T.faint : T.text }}>
        <span aria-hidden style={{ width: 7, height: 7, borderRadius: 4, background: c }} />{LEVEL_WORD[lv]}
      </div>
    </div>
  )
}

/* ── One small chart for one reading over 30 minutes ───────────────────── */

function Trend({ m, p, t }: { m: Metric; p: PulseRig; t: number }) {
  const h = history(p, m.key, t)
  const W = 300, H = 92, L = 34, R = 6, Tp = 8, B = 18
  const vals = h.map(x => x.v).filter((x): x is number => x != null)
  const lo = Math.min(m.lo, ...vals), hi = Math.max(m.hi, ...vals)
  const pad = (hi - lo) * 0.12 || 1
  const y0 = Math.max(m.min, lo - pad), y1 = hi + pad
  const X = (i: number) => L + (i / (h.length - 1)) * (W - L - R)
  const Y = (v: number) => Tp + (1 - (v - y0) / (y1 - y0)) * (H - Tp - B)
  const d = h.map((x, i) => x.v == null ? '' : `${i && h[i - 1].v != null ? 'L' : 'M'}${X(i).toFixed(1)},${Y(x.v).toFixed(1)}`).join(' ')
  const now = h[h.length - 1].v
  const lv = level(m, now, p.mode)
  const tick = (v: number) => v >= 100 ? Math.round(v).toString() : v.toFixed(m.dp ? 1 : 0)
  return (
    <div style={{ padding: '10px 12px 6px', borderRadius: 9, border: `1px solid ${T.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: T.text }}>{m.label}</span>
        <span style={{ ...num, fontSize: 13, fontWeight: 600, color: T.text }}>{fmt(m, now)} <span style={{ fontSize: 11, color: T.faint, fontWeight: 400 }}>{m.unit}</span>
          <span aria-hidden style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 4, background: LEVEL_COLOR[lv], marginLeft: 6 }} /></span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', width: '100%', height: 'auto', marginTop: 4 }} role="img" aria-label={`${m.label} over the last 30 minutes, now ${fmt(m, now)} ${m.unit}`}>
        <rect x={L} width={W - L - R} y={Y(Math.min(m.hi, y1))} height={Math.max(0, Y(Math.max(m.lo, y0)) - Y(Math.min(m.hi, y1)))} fill={tint('var(--x-green)', 9)} />
        {[y0, (y0 + y1) / 2, y1].map((v, i) => (
          <g key={i}>
            <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="var(--x-border)" strokeDasharray="2 3" strokeWidth={0.7} />
            <text x={L - 5} y={Y(v) + 3} textAnchor="end" style={{ fontFamily: mono, fontSize: 9, fill: 'var(--x-faint)' }}>{tick(v)}</text>
          </g>
        ))}
        <path d={d} fill="none" stroke={lv === 'bad' ? 'var(--x-red)' : lv === 'warn' ? 'var(--x-amber)' : 'var(--x-blue)'} strokeWidth={1.8} strokeLinejoin="round" />
        {now != null && <circle cx={X(h.length - 1)} cy={Y(now)} r={3} fill={LEVEL_COLOR[lv]} />}
        <text x={L} y={H - 4} style={{ fontFamily: mono, fontSize: 9, fill: 'var(--x-faint)' }}>{clock(h[0].t, false)}</text>
        <text x={W - R} y={H - 4} textAnchor="end" style={{ fontFamily: mono, fontSize: 9, fill: 'var(--x-faint)' }}>now</text>
      </svg>
    </div>
  )
}

/* ── ESG from the rig: diesel, CO₂ and water today ──────────────────────── */

function EsgCard({ fleet, t }: { fleet: PulseRig[]; t: number }) {
  const rows = fleet.map(p => ({ p, e: esgToday(p, t) }))
  const known = rows.filter(r => r.e.diesel != null)
  const sum = (f: (r: typeof rows[number]) => number) => known.reduce((s, r) => s + f(r), 0)
  const diesel = sum(r => r.e.diesel as number), idle = sum(r => r.e.idle as number)
  const co2 = sum(r => r.e.co2 as number), water = sum(r => r.e.water as number)
  const metres = known.reduce((s, r) => s + r.e.metres, 0)
  const perM = metres >= 1 ? co2 / metres : null
  const worst = known.filter(r => r.e.co2PerMetre != null).sort((a, b) => (b.e.co2PerMetre as number) - (a.e.co2PerMetre as number))[0]
  const f0 = (n: number) => Math.round(n).toLocaleString('en-US')
  const f1 = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 })
  return (
    <Card title="ESG from the rig" subtitle={`Diesel, CO₂ and water since ${clock(SHIFT_START, false)}, measured by the sensors. This feeds the client's ESG report, with safety and approvals from the shift logs.`} pad={false}>
      <div style={{ padding: 14 }}>
        <Grid min={160}>
          <Tile label="Diesel today" value={`${f0(diesel)} L`} note={`${known.length} rigs reporting`} />
          <Tile label="CO₂ today" value={`${f1(co2 / 1000)} t`} note={`At ${CO2_KG_PER_LITRE} kg a litre of diesel`} />
          <Tile label="CO₂ a metre" value={perM != null ? `${f1(perM)} kg/m` : '—'} note={worst ? `Highest: ${worst.p.rig}` : 'No metres yet'} />
          <Tile label="Burned idling" value={`${f0(idle)} L`} note={idle ? `${f1(idle * CO2_KG_PER_LITRE)} kg CO₂ · SAR ${f0(idle * DIESEL_PER_LITRE)}, for no metres` : 'No engine idling'} tone={idle ? 'warn' : 'good'} />
          <Tile label="Water used" value={`${f1(water / 1000)} m³`} note={metres >= 1 ? `${f0(water / metres)} L a metre` : 'From the flow meters'} />
        </Grid>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Rig</th><th style={thR}>Metres</th><th style={thR}>Diesel</th><th style={thR}>Idling</th><th style={thR}>CO₂</th><th style={thR}>CO₂ a metre</th><th style={thR}>Water</th></tr></thead>
          <tbody>
            {rows.map(({ p, e }) => (
              <tr key={p.rig} style={{ borderTop: rowLine }}>
                <td style={td}><div style={{ ...num, color: T.text, fontWeight: 600 }}>{p.rig}</div><div style={{ fontSize: 12, color: T.faint }}>{MODE_LABEL[p.mode]}</div></td>
                <td style={tdR}>{f1(e.metres)} m</td>
                <td style={tdR}>{e.diesel != null ? `${f0(e.diesel)} L` : '—'}</td>
                <td style={{ ...tdR, color: e.idle ? 'var(--x-bad-text)' : undefined }}>{e.idle ? `${f0(e.idle)} L` : '—'}</td>
                <td style={tdR}>{e.co2 != null ? `${f0(e.co2)} kg` : '—'}</td>
                <td style={tdR}>{e.co2PerMetre != null ? `${f1(e.co2PerMetre)} kg/m` : '—'}</td>
                <td style={tdR}>{e.water != null && e.water > 0 ? `${f1(e.water / 1000)} m³` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ padding: '10px 14px', fontSize: 12, color: T.faint, borderTop: rowLine, lineHeight: 1.5 }}>
        CO₂ is worked out from diesel burned at {CO2_KG_PER_LITRE} kg a litre. Rigs with no signal are left out until their readings arrive. Cutting idle time is the quickest way to bring CO₂ a metre down.
      </div>
    </Card>
  )
}

/* ── Sensor against shift log ──────────────────────────────────────────── */

function LogCheck({ fleet, t }: { fleet: PulseRig[]; t: number }) {
  const rows = fleet.filter(p => p.logged != null || p.mode === 'drilling')
  return (
    <Card title="Sensor against shift log" subtitle="Metres today: what the crew logged, what the depth sensor counted" pad={false}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Rig</th><th style={thR}>Log</th><th style={thR}>Sensor</th><th style={th}>Check</th></tr></thead>
          <tbody>
            {rows.map(p => {
              const s = sensorMetres(p, t)
              const gap = p.logged == null ? null : s - p.logged
              const tone = p.logged == null ? 'warn' : gap! > Math.max(2, p.logged * 0.06) ? 'warn' : 'good'
              return (
                <tr key={p.rig} style={{ borderTop: rowLine }}>
                  <td style={{ ...tdStrong, fontFamily: mono }}>{p.rig}</td>
                  <td style={tdR}>{p.logged == null ? '—' : `${p.logged.toFixed(1)} m`}</td>
                  <td style={tdR}>{s.toFixed(1)} m</td>
                  <td style={td}><Status tone={tone}>{p.logged == null ? 'Not checked yet' : tone === 'good' ? (Math.abs(gap!) < 0.5 ? 'Agrees' : `Agrees, +${gap!.toFixed(1)} m since`) : `${gap!.toFixed(1)} m not logged`}</Status></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ padding: '10px 14px', fontSize: 12, color: T.faint, borderTop: rowLine, lineHeight: 1.5 }}>
        Small gaps are metres drilled since the log was sent. A gap over 6% is raised as an alarm.
      </div>
    </Card>
  )
}

/* ── What is fitted on the chosen rig ──────────────────────────────────── */

function Fitted({ p, t }: { p: PulseRig; t: number }) {
  const rows = [
    ...METRIC_KEYS.map(k => ({ name: METRICS[k].label, how: METRICS[k].how, every: k === 'fuel' ? '1 min' : '2 s' })),
    { name: 'Depth', how: 'Encoder on the feed frame', every: '2 s' },
    { name: 'Gateway', how: '4G with on-rig storage when signal drops', every: '—' },
  ]
  const off = p.mode === 'offline'
  return (
    <Card title={`Sensors on ${p.rig}`} subtitle={off ? 'No signal: last reading before 07:00' : `All reporting · last reading ${clock(t)}`} pad={false}
      right={off ? <WifiOff size={15} style={{ color: T.faint }} aria-label="No signal" /> : <Wifi size={15} style={{ color: T.green }} aria-label="On line" />}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th style={th}>Sensor</th><th style={th}>How</th><th style={thR}>Every</th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.name} style={{ borderTop: rowLine }}>
              <td style={tdStrong}><span aria-hidden style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 4, marginRight: 8, background: off ? T.faint : T.green }} />{r.name}</td>
              <td style={{ ...td, whiteSpace: 'normal', fontSize: 12.5 }}>{r.how}</td>
              <td style={tdR}>{r.every}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
