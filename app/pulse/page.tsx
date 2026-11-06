'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Radio, Sparkles, Power, Mic, MicOff, Send, Volume2, VolumeX, Check, Clock, ShieldAlert, Play, Pause, ChevronDown, ChevronUp, Bot, Wrench, FileText, BadgeCheck } from 'lucide-react'
import { RIGS, openRig, tick, clampSettings, NORMAL, liveCost, type Live } from '../../lib/rig'
import { think, verdict, type Advice, type Lang } from '../../lib/copilot'
import { answer, type LogLine } from '../../lib/ask'
import { memory, useMemory } from '../../lib/memory'
import { ratePerMetre } from '../../lib/data'
import { nextBroken } from '../../lib/ground'
import { Gauges, Trends, HoleStrip, KIND_LABEL } from '../../components/rigview'
import { useVoice, type VoiceMode } from '../../lib/voice'

/* ==========================================================================
 * XPLORIX PULSE, WITH XPLORIX COPILOT
 *
 * Pulse shows every rig's sensors live. Add XPLORIX Copilot and an AI agent
 * starts reading every one of those readings, on every rig, every second,
 * with what the record knows about each rig: the rock around it, its normal
 * speed, the best crew in the ground, its bit, its contract and its cost.
 * It tells the crew what to do and exactly how, shows why, and then checks
 * whether it worked.
 *
 * Levels: Advise (Copilot says, the crew does), Assist (one tap applies it
 * to the rig), Auto (Copilot applies it within safe limits and says so).
 * ========================================================================== */

type CLevel = 'advise' | 'assist' | 'auto'
interface Taken { a: Advice; action: 'done' | 'applied' | 'auto' | 'later'; before: Live; at: number; real: number }
interface Proven { at: number; rig: string; kind: Advice['kind']; what: string; worked: boolean; text: string; hours: number; sar: number }
interface Later { rig: string; at: number; run: (s: Live) => Live }

const LANGS: { v: Lang; label: string; speech: string }[] = [
  { v: 'en', label: 'EN', speech: 'en-GB' }, { v: 'ar', label: 'عربي', speech: 'ar-SA' }, { v: 'hi', label: 'हिंदी', speech: 'hi-IN' }, { v: 'ur', label: 'اردو', speech: 'ur-PK' },
]
const OPEN = 14 * 3600 + 20 * 60
const clock = (t: number, sec = true) => { const s = Math.floor(OPEN + t) % 86400; const p = (n: number) => String(n).padStart(2, '0'); return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}${sec ? ':' + p(s % 60) : ''}` }
const r0 = (n: number) => Math.round(n).toLocaleString('en-US')
const r1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1)
const LEVEL_C = { act: 'var(--red)', watch: 'var(--amber)', info: 'var(--blue)' }
const MODE_WORD: Record<Live['mode'], string> = { drilling: 'Drilling', standby: 'Standby', flushing: 'Flushing', tripping: 'Changing bit', stopped: 'Stopped' }

function readStored<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : d } catch { return d } }
function writeStored(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* ignore */ } }

export default function PulsePage() {
  const [lives, setLives] = useState<Live[]>(() => RIGS.map(openRig))
  const [sel, setSel] = useState(RIGS[0].rig)
  const [running, setRunning] = useState(true)
  const [speed, setSpeed] = useState(30)
  const [on, setOn] = useState(false)
  const [booting, setBooting] = useState(0)
  const [level, setLevel] = useState<CLevel>('advise')
  const [lang, setLang] = useState<Lang>('en')
  const [voiceMode, setVoiceMode] = useState<VoiceMode>('urgent')
  const [taken, setTaken] = useState<Record<string, Taken>>({})
  const [proven, setProven] = useState<Proven[]>([])
  const [seenAt, setSeenAt] = useState<Record<string, number>>({})
  const [logs, setLogs] = useState<LogLine[]>([])
  const [chat, setChat] = useState<{ who: 'you' | 'copilot'; text: string }[]>([])
  const [typed, setTyped] = useState('')
  const [listening, setListening] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const [reads, setReads] = useState(0)
  const [sent, setSent] = useState<Record<string, boolean>>({})
  const later = useRef<Later[]>([])
  const livesRef = useRef<Live[]>(lives)
  const spoken = useRef<Set<string>>(new Set())
  const mem = useMemory()

  useEffect(() => { setOn(readStored('xplorix-copilot-on', false)); setLevel(readStored('xplorix-copilot-level', 'advise')); setLang(readStored('xplorix-copilot-lang', 'en')); setVoiceMode(readStored('xplorix-copilot-voice', 'urgent')) }, [])
  useEffect(() => { writeStored('xplorix-copilot-voice', voiceMode) }, [voiceMode])
  useEffect(() => { writeStored('xplorix-copilot-on', on) }, [on])
  useEffect(() => { writeStored('xplorix-copilot-level', level) }, [level])
  useEffect(() => { writeStored('xplorix-copilot-lang', lang) }, [lang])

  // The feed: every second, each rig moves on `speed` seconds
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => {
      // Computed outside the state updater, so scheduled actions run exactly once
      const steps = Math.max(1, Math.round(speed / 10))
      const next = livesRef.current.map(s => {
        let x = s
        for (let i = 0; i < steps; i++) {
          x = tick(x, speed / steps)
          const due = later.current.filter(l => l.rig === x.rig.rig && l.at <= x.t)
          if (due.length) { due.forEach(l => { x = l.run(x) }); later.current = later.current.filter(l => !due.includes(l)) }
        }
        return x
      })
      livesRef.current = next
      setLives(next)
      if (on) setReads(n => n + RIGS.length * 8)
    }, 1000)
    return () => window.clearInterval(id)
  }, [running, speed, on])

  // "Adding" Copilot: a short boot while it reads the record
  useEffect(() => {
    if (!on || booting >= 4) return
    const id = window.setTimeout(() => setBooting(b => b + 1), 650)
    return () => window.clearTimeout(id)
  }, [on, booting])
  const ready = on && booting >= 4

  const voice = useVoice(lang, voiceMode)
  const say = useCallback((t: Record<Lang, string> | string, prio: 0 | 1 | 2 | 3 = 2, extra: { rig?: string; key?: string } = {}) => {
    voice.say(typeof t === 'string' ? t : t[lang], prio, extra)
  }, [voice, lang])

  // What Copilot sees right now, every rig
  const advice = useMemo(() => ready ? lives.flatMap(s => think(s)).filter(a => !taken[a.key]) : [], [lives, ready, taken])
  const live = lives.find(s => s.rig.rig === sel)!
  livesRef.current = lives

  // New advice: note when it was first seen, speak the urgent ones once, act on it at Auto
  useEffect(() => {
    if (!ready) return
    const fresh = advice.filter(a => seenAt[a.key] == null)
    if (!fresh.length) return
    setSeenAt(m => ({ ...m, ...Object.fromEntries(fresh.map(a => [a.key, Date.now()])) }))
    fresh.filter(a => a.level !== 'info').forEach(a => { if (!spoken.current.has(a.key)) { spoken.current.add(a.key); say(a.say, a.level === 'act' ? 1 : 3, { rig: a.rig, key: a.key }) } })
    if (level === 'auto') fresh.filter(a => a.fix.type !== 'none').forEach(a => act(a, 'auto'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advice.map(a => a.key).join('|'), ready, level])

  const addLog = (rig: string, depth: number, text: string, kind: LogLine['kind'] = 'copilot', minutes?: number) =>
    setLogs(l => [...l, { at: lives.find(x => x.rig.rig === rig)?.t ?? 0, rig, depth: Math.round(depth * 10) / 10, text, kind, minutes }])

  const act = useCallback((a: Advice, action: Taken['action']) => {
    const s = livesRef.current.find(x => x.rig.rig === a.rig)
    if (!s) return
    setTaken(t => ({ ...t, [a.key]: { a, action, before: s, at: s.t, real: Date.now() } }))
    if (action === 'later') { memory.learn({ at: Date.now(), rig: a.rig, kind: a.kind, what: a.what, action, worked: null, text: 'Not now', hours: 0, sar: 0 }); return }
    const now = action !== 'done'
    const delay = now ? 0 : 90                                     // the crew turns the dials a moment later
    const at = s.t + delay
    const by = action === 'auto' ? 'Copilot' : action === 'applied' ? 'Applied by Copilot' : 'Crew'
    const f = a.fix
    if (f.type === 'settings') later.current.push({ rig: a.rig, at, run: x => ({ ...x, settings: clampSettings(f.settings) }) })
    if (f.type === 'flush') later.current.push({ rig: a.rig, at, run: x => ({ ...x, mode: 'flushing', modeLeft: 150, script: { ...x.script, blockAt: undefined } }) })
    if (a.kind === 'stop') later.current.push({ rig: a.rig, at: s.t + 60, run: x => ({ ...x, mode: 'stopped', engineOn: false }) })
    if (f.type === 'engine-off') later.current.push({ rig: a.rig, at, run: x => ({ ...x, engineOn: false }) })
    if (a.kind === 'engine') later.current.push({ rig: a.rig, at: s.t + 20 * 60, run: x => ({ ...x, cooling: 1 }) })   // coolant topped up at the rod change
    if (a.kind === 'bit') later.current.push({ rig: a.rig, at: s.t + 15 * 60, run: x => ({ ...x, mode: 'tripping', modeLeft: 2 * 3600 }) })
    const what = f.type === 'settings' ? `${f.settings.rpm} rpm · ${f.settings.wob} kN · ${f.settings.flow} L/min` : f.type === 'flush' ? 'pulled back and flushed' : f.type === 'engine-off' ? 'engine off on standby' : f.type === 'log-standby' ? `client standby logged, SAR ${r0(a.money ?? 0)}` : a.how[0].toLowerCase()
    addLog(a.rig, s.depth, `${by}: ${what} (${KIND_LABEL[a.kind].toLowerCase()})`, f.type === 'log-standby' ? 'downtime' : 'copilot')
    if (action === 'auto') say({ en: `${a.rig}: Copilot has done it. ${what}.`, ar: `${a.rig}: نفّذ كوبايلت ذلك.`, hi: `${a.rig}: कोपायलट ने कर दिया।`, ur: `${a.rig}: کوپائلٹ نے کر دیا۔` }, 2, { rig: a.rig })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lives, say])

  // The loop closes: once the readings can tell, did it work?
  useEffect(() => {
    const open = Object.values(taken).filter(t => t.action !== 'later' && !proven.some(p => p.at === t.real))
    open.forEach(t => {
      const now = lives.find(x => x.rig.rig === t.a.rig)
      if (!now) return
      const v = verdict(t.a, t.before, now)
      if (!v) return
      const p: Proven = { at: t.real, rig: t.a.rig, kind: t.a.kind, what: t.a.what, worked: v.worked, text: v.text, hours: v.hours, sar: v.sar }
      setProven(ps => [p, ...ps].slice(0, 40))
      memory.learn({ at: Date.now(), rig: t.a.rig, kind: t.a.kind, what: t.a.what, action: t.action, worked: v.worked, text: v.text, hours: v.hours, sar: v.sar })
      if (t.a.kind === 'broken' || t.a.kind === 'core') later.current.push({ rig: t.a.rig, at: now.t + 1, run: x => { const nb = nextBroken(x.ahead, x.depth); return nb && nb.inMetres < 3 ? x : { ...x, settings: { ...NORMAL } } } })
      say({ en: `${t.a.rig}: ${v.worked ? 'fixed' : 'not fixed yet'}.`, ar: `${t.a.rig}: ${v.worked ? 'تم الإصلاح' : 'لم يُحل بعد'}.`, hi: `${t.a.rig}: ${v.worked ? 'ठीक हो गया' : 'अभी ठीक नहीं'}।`, ur: `${t.a.rig}: ${v.worked ? 'ٹھیک ہو گیا' : 'ابھی ٹھیک نہیں'}۔` }, v.worked ? 2 : 1, { rig: t.a.rig })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lives])

  // Safety net: urgent advice nobody answered in a minute goes to the supervisor
  const [nowMs, setNowMs] = useState(Date.now())
  useEffect(() => { const id = window.setInterval(() => setNowMs(Date.now()), 1000); return () => window.clearInterval(id) }, [])
  const escalated = (a: Advice) => a.level === 'act' && seenAt[a.key] != null && nowMs - seenAt[a.key] > 60000

  // Ask Copilot
  const ask = useCallback((text: string) => {
    if (!text.trim()) return
    const top = advice.find(a => a.rig === sel)
    const ans = answer(text, live, top)
    setChat(c => [...c.slice(-10), { who: 'you', text }, { who: 'copilot', text: ans.text[lang] }])
    if (ans.log) addLog(sel, live.depth, ans.log.text, ans.log.kind, ans.log.minutes)
    say(ans.text, 0, { rig: sel })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advice, sel, live, lang, say])
  const recog = useRef<{ stop: () => void } | null>(null)
  const listen = (go: boolean) => {
    const W = window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any }
    const SR = W.SpeechRecognition ?? W.webkitSpeechRecognition
    if (!SR) { setChat(c => [...c, { who: 'copilot', text: 'Voice questions need Chrome or Edge here. Type instead.' }]); return }
    if (!go) { recog.current?.stop(); setListening(false); return }
    const r = new SR(); r.lang = LANGS.find(l => l.v === lang)!.speech; r.interimResults = false
    r.onresult = (e: any) => ask(Array.from(e.results).map((x: any) => x[0].transcript).join(' '))
    r.onend = () => setListening(false)
    recog.current = r; setListening(true)
    try { r.start() } catch { /* already listening */ }
  }

  const totals = useMemo(() => ({
    hours: proven.reduce((s, p) => s + (p.worked ? p.hours : 0), 0),
    sar: proven.reduce((s, p) => s + (p.worked ? p.sar : 0), 0) + Object.values(taken).filter(t => t.a.kind === 'stop' && t.action !== 'later').reduce((s, t) => s + (t.a.money ?? 0), 0),
    fixed: proven.filter(p => p.worked).length,
  }), [proven, taken])
  const atStake = advice.reduce((s, a) => s + (a.money ?? 0), 0)
  const byRig = (rig: string) => advice.filter(a => a.rig === rig)

  return (
    <div style={{ minHeight: '100vh', padding: 'clamp(10px, 1.6vw, 20px)', display: 'grid', gap: 14, alignContent: 'start' }}>
      {/* TOP BAR */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--raised)', border: '1px solid var(--line)', display: 'grid', placeItems: 'center' }}><Radio size={19} color="var(--blue)" /></span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: '.02em' }}>XPLORIX PULSE</div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{RIGS.length} rigs · live sensors · <span className="mono">{clock(lives[0].t)}</span></div>
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => setRunning(r => !r)}>{running ? <><Pause size={15} /> Pause feed</> : <><Play size={15} /> Resume</>}</button>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, color: 'var(--muted)' }}>Speed
            <select value={speed} onChange={e => setSpeed(Number(e.target.value))} aria-label="Feed speed" style={{ minHeight: 40, background: 'var(--raised)', color: 'var(--text)', border: '1px solid var(--line)', borderRadius: 10, padding: '0 8px' }}>
              {[1, 30, 120, 300, 600].map(v => <option key={v} value={v}>{v === 1 ? 'Real time' : `×${v}`}</option>)}
            </select>
          </label>
          <button className="btn" onClick={() => { setOn(o => !o); setBooting(0) }} aria-pressed={on}
            style={{ minHeight: 44, paddingInline: 16, background: on ? 'rgba(249,115,22,.14)' : 'var(--orange)', borderColor: 'var(--orange)', color: on ? 'var(--text)' : '#fff' }}>
            <Sparkles size={17} /> {on ? 'XPLORIX Copilot · ON' : 'Add XPLORIX Copilot'} {on && <Power size={15} />}
          </button>
        </div>
      </header>
      <div role="note" style={{ padding: '8px 12px', borderRadius: 10, border: '1px dashed var(--line)', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>
        <b style={{ color: 'var(--text)' }}>Simulated sensor feed.</b> No rig is fitted with sensors yet, so the readings are a model. The rigs, holes, rock (from real core photos), speeds, best crews, bits, contract rates and costs are XPLORIX&rsquo;s real record. Copilot runs on rules today; the launch version adds trained models behind the same agent.
      </div>

      <div className="grid-main" style={{ display: 'grid', gridTemplateColumns: on ? '250px minmax(0, 1fr) minmax(360px, 430px)' : '250px minmax(0, 1fr) 360px', gap: 14, alignItems: 'start' }}>

        {/* FLEET */}
        <nav aria-label="Rigs" style={{ display: 'grid', gap: 10 }}>
          {lives.map(s => {
            const mine = byRig(s.rig.rig)
            const worst = mine.find(a => a.level === 'act') ? 'act' : mine.find(a => a.level === 'watch') ? 'watch' : null
            const fixedNow = proven.find(p => p.rig === s.rig.rig && p.worked && Date.now() - p.at < 90000)
            const c = !ready ? 'var(--line2)' : worst ? LEVEL_C[worst] : 'var(--green)'
            return (
              <button key={s.rig.rig} className="rigcard" onClick={() => setSel(s.rig.rig)} aria-pressed={sel === s.rig.rig}
                style={{ textAlign: 'left', cursor: 'pointer', background: 'var(--panel)', color: 'var(--text)', border: `1px solid ${sel === s.rig.rig ? 'var(--orange)' : 'var(--line)'}`, boxShadow: sel === s.rig.rig ? '0 0 0 1px var(--orange)' : 'none', borderRadius: 14, padding: '11px 12px', position: 'relative', overflow: 'hidden' }}>
                <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: c }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="mono" style={{ fontWeight: 700, fontSize: 14 }}>{s.rig.rig}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{MODE_WORD[s.mode]}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--faint)', marginTop: 1 }}>{s.rig.hole} · {s.rig.project.replace(' - ', ' · ')}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                  <span className="mono" style={{ fontSize: 17, fontWeight: 700 }}>{s.depth.toFixed(1)}<span style={{ fontSize: 11, color: 'var(--faint)' }}> m</span></span>
                  <span className="mono" style={{ fontSize: 13, color: 'var(--muted)' }}>{s.now.rop.toFixed(2)} m/h</span>
                </div>
                {on && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7, fontSize: 12, fontWeight: 600, color: fixedNow ? 'var(--green)' : worst ? LEVEL_C[worst] : 'var(--muted)' }}>
                    {!ready ? <><Clock size={12} /> Copilot starting…</> : fixedNow ? <><BadgeCheck size={13} /> Fixed: {KIND_LABEL[fixedNow.kind].toLowerCase()}</> : mine.length ? <><Sparkles size={12} /> {mine.length} {mine.length === 1 ? 'thing' : 'things'} to do</> : <><span className="pingG" style={{ width: 7, height: 7, borderRadius: 4, background: 'var(--green)' }} /> Copilot watching</>}
                  </div>
                )}
              </button>
            )
          })}
        </nav>

        {/* THE CHOSEN RIG */}
        <main style={{ display: 'grid', gap: 14, minWidth: 0 }}>
          <section style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 14, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}><span className="mono">{live.rig.rig}</span> live</h1>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>{live.rig.hole} · {live.rig.formation.replace(' Formation', '').toLowerCase()} ground · {live.rig.size} · driller {live.rig.driller ?? '—'}</span>
              <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--muted)' }}>{MODE_WORD[live.mode]}{live.mode === 'standby' && live.standbyReason ? `: ${live.standbyReason.toLowerCase()}` : ''}</span>
            </div>
            <Gauges s={live} />
          </section>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 230px', gap: 14 }} className="grid-rig">
            <section style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 14, padding: 14, minWidth: 0 }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Last hour</div>
              <Trends s={live} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 12 }}>
                {(() => { const c = liveCost(live), rate = ratePerMetre(live.rig); return <>
                  <Mini label="Cost a metre now" v={c.perMetre ? `SAR ${r0(c.perMetre)}` : '—'} tone={c.perMetre && c.perMetre > rate ? 'var(--red)' : 'var(--green)'} note={`Contract pays SAR ${r0(rate)}`} />
                  <Mini label="Bit" v={`${r0(Math.max(0, live.bitLife - live.bitUsed))} m left`} tone={live.bitLife - live.bitUsed < 10 ? 'var(--amber)' : 'var(--green)'} note={`${r0(live.bitUsed)} of ${r0(live.bitLife)} m used`} />
                  <Mini label="This shift" v={`${r1(live.depth - live.startDepth)} m`} note={`${r1(live.drillSecs / 3600)} h drilling · ${r0(live.litres)} L diesel`} />
                </> })()}
              </div>
            </section>
            <section style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 14, padding: 14 }}>
              <div className="eyebrow">Hole and rock ahead</div>
              <div style={{ fontSize: 11.5, color: 'var(--faint)', margin: '4px 0 8px' }}>Below the bit: predicted from the cored holes around</div>
              <HoleStrip s={live} />
            </section>
          </div>
        </main>

        {/* COPILOT */}
        <aside style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          {!on ? <AddCopilot onAdd={() => { setOn(true); setBooting(0) }} /> : !ready ? <Booting step={booting} /> : <>
            <section style={{ background: 'linear-gradient(160deg, rgba(249,115,22,.16), rgba(139,92,246,.08) 60%, var(--panel))', border: '1px solid rgba(249,115,22,.45)', borderRadius: 16, padding: 14, display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="ping" style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--orange)', display: 'grid', placeItems: 'center' }}><Bot size={18} color="#fff" /></span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>XPLORIX Copilot</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Reading <b className="mono" style={{ color: 'var(--text)' }}>{RIGS.length * 8}</b> values a second on {RIGS.length} rigs · <span className="mono">{r0(reads)}</span> read so far</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <div className="seg" role="group" aria-label="Copilot level">
                  {(['advise', 'assist', 'auto'] as CLevel[]).map(l => <button key={l} aria-pressed={level === l} onClick={() => setLevel(l)} title={{ advise: 'Copilot says, the crew does', assist: 'One tap applies it to the rig', auto: 'Copilot applies it within safe limits' }[l]}>{{ advise: 'Advise', assist: 'Assist', auto: 'Auto' }[l]}</button>)}
                </div>
                <div className="seg" role="group" aria-label="Voice">
                  {(['off', 'urgent', 'all'] as VoiceMode[]).map(m => <button key={m} aria-pressed={voiceMode === m} onClick={() => setVoiceMode(m)} title={{ off: 'Copilot does not speak', urgent: 'Speaks only act-now advice and answers', all: 'Speaks everything, one at a time' }[m]}>{m === 'off' ? <VolumeX size={13} /> : <Volume2 size={13} />} {{ off: 'Off', urgent: 'Urgent', all: 'All' }[m]}</button>)}
                </div>
                <div className="seg" role="group" aria-label="Language">
                  {LANGS.map(l => <button key={l.v} aria-pressed={lang === l.v} onClick={() => setLang(l.v)}>{l.label}</button>)}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                <Kpi label="To do now" v={String(advice.filter(a => a.level !== 'info').length)} c={advice.some(a => a.level === 'act') ? 'var(--red)' : 'var(--amber)'} />
                <Kpi label="At stake" v={`SAR ${r0(atStake)}`} c="var(--orange)" />
                <Kpi label="Proven today" v={`${totals.fixed} · ${r1(totals.hours)} h`} c="var(--green)" />
              </div>
            </section>

            {voice.now && (
              <section className="slideIn" aria-live="polite" style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: 10, alignItems: 'center', background: 'rgba(59,130,246,.12)', border: '1px solid rgba(59,130,246,.5)', borderRadius: 14, padding: '10px 12px' }}>
                <span className="ping" style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--blue)', display: 'grid', placeItems: 'center' }}><Volume2 size={15} color="#fff" /></span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: 'var(--blue)' }}>COPILOT IS SAYING{voice.now.rig ? ` · ${voice.now.rig}` : ''}</div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.45, marginTop: 2, direction: /[\u0600-\u06FF]/.test(voice.now.text) ? 'rtl' : 'ltr' }}>{voice.now.text}</div>
                  {voice.waiting > 0 && <div style={{ fontSize: 11.5, color: 'var(--faint)', marginTop: 3 }}>{voice.waiting} more waiting, one at a time</div>}
                </div>
                <div style={{ display: 'grid', gap: 5 }}>
                  <button className="btn" style={{ minHeight: 28, fontSize: 11.5, padding: '0 9px' }} onClick={voice.skip}>Skip</button>
                  {voice.waiting > 0 && <button className="btn" style={{ minHeight: 28, fontSize: 11.5, padding: '0 9px' }} onClick={voice.clear}>Stop all</button>}
                </div>
              </section>
            )}
            {advice.filter(a => a.level !== 'info').length === 0 && <section style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 14, padding: 14, fontSize: 13.5, color: 'var(--muted)', display: 'flex', gap: 8, alignItems: 'center' }}><BadgeCheck size={16} color="var(--green)" /> Every rig is running well. Copilot is watching.</section>}
            {advice.filter(a => a.level !== 'info').map(a => (
              <AdviceCard key={a.key} a={a} lang={lang} level={level} open={open === a.key || (a === advice.find(x => x.level !== 'info') && !closed[a.key])}
                onToggle={() => { const isOpen = open === a.key || (a === advice.find(x => x.level !== 'info') && !closed[a.key]); if (isOpen) { setClosed(c => ({ ...c, [a.key]: true })); if (open === a.key) setOpen(null) } else { setOpen(a.key); setClosed(c => ({ ...c, [a.key]: false })) } }}
                record={mem.record[a.kind]} escalated={escalated(a)} selected={a.rig === sel} speaking={voice.now?.key === a.key} onPick={() => setSel(a.rig)}
                onDone={() => act(a, 'done')} onApply={() => act(a, 'applied')} onLater={() => act(a, 'later')} />
            ))}

            {advice.some(a => a.level === 'info') && (
              <details style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 14, padding: '10px 14px', fontSize: 13 }}>
                <summary style={{ cursor: 'pointer', color: 'var(--muted)', fontWeight: 600 }}>Also noted ({advice.filter(a => a.level === 'info').length})</summary>
                <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                  {advice.filter(a => a.level === 'info').map(a => <div key={a.key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><b className="mono">{a.rig}</b><span style={{ color: 'var(--muted)', flex: 1 }}>{a.what}</span><button className="btn" style={{ minHeight: 28, fontSize: 11.5, padding: '0 9px' }} onClick={() => act(a, 'done')}><Check size={12} /> Done</button></div>)}
                </div>
              </details>
            )}

            <section style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 14, padding: 14 }}>
              <div className="eyebrow">Ask Copilot about {sel}</div>
              <div style={{ display: 'grid', gap: 7, maxHeight: 200, overflowY: 'auto', marginTop: 8 }} ref={el => { if (el) el.scrollTop = el.scrollHeight }} aria-live="polite">
                {chat.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--faint)' }}>Ask by voice or type. Or tell Copilot what happened and it goes in the shift log.</div>}
                {chat.map((m, i) => <div key={i} style={{ justifySelf: m.who === 'you' ? 'end' : 'start', maxWidth: '92%', background: m.who === 'you' ? 'var(--raised2)' : 'rgba(249,115,22,.1)', border: `1px solid ${m.who === 'you' ? 'var(--line)' : 'rgba(249,115,22,.3)'}`, borderRadius: 11, padding: '7px 10px', fontSize: 13, lineHeight: 1.45, direction: /[؀-ۿ]/.test(m.text) ? 'rtl' : 'ltr' }}>{m.text}</div>)}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
                <button className="btn" aria-pressed={listening} onPointerDown={() => listen(true)} onPointerUp={() => listen(false)} style={{ background: listening ? 'var(--red)' : 'var(--raised)', minWidth: 44 }} aria-label="Hold to speak">{listening ? <MicOff size={16} /> : <Mic size={16} />}</button>
                <form onSubmit={e => { e.preventDefault(); ask(typed); setTyped('') }} style={{ flex: 1, display: 'flex', gap: 6 }}>
                  <input value={typed} onChange={e => setTyped(e.target.value)} placeholder='e.g. "what should I do now?"' aria-label="Ask Copilot" style={{ flex: 1, minWidth: 0, minHeight: 40, background: 'var(--raised)', color: 'var(--text)', border: '1px solid var(--line)', borderRadius: 10, padding: '0 10px', fontSize: 13 }} />
                  <button className="btn" type="submit" aria-label="Send"><Send size={15} /></button>
                </form>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {['What should I do now?', 'Rock ahead?', 'Bit life?', 'Cost a metre?', 'We stopped 40 minutes for water', 'Log a bit change'].map(q => <button key={q} className="btn" style={{ minHeight: 30, fontSize: 11.5, padding: '0 9px', fontWeight: 500 }} onClick={() => ask(q)}>{q}</button>)}
              </div>
            </section>

            {proven.length > 0 && (
              <section style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 14, padding: 14 }}>
                <div className="eyebrow">Checked by Copilot</div>
                <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                  {proven.slice(0, 6).map((p, i) => (
                    <div key={i} className="slideIn" style={{ display: 'grid', gridTemplateColumns: '18px 1fr', gap: 8, fontSize: 12.5, lineHeight: 1.45 }}>
                      {p.worked ? <BadgeCheck size={16} color="var(--green)" /> : <ShieldAlert size={16} color="var(--red)" />}
                      <span><b className="mono" style={{ color: 'var(--text)' }}>{p.rig}</b> <span style={{ color: p.worked ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{p.worked ? 'worked' : 'not fixed'}</span>: <span style={{ color: 'var(--muted)' }}>{p.text}{p.hours ? ` · ${r1(p.hours)} h saved` : ''}{p.sar ? ` · SAR ${r0(p.sar)}` : ''}</span></span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 14, padding: 14 }}>
              <div className="eyebrow">Shift logs, writing themselves</div>
              <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                {lives.map(s => {
                  const mine = logs.filter(l => l.rig === s.rig.rig)
                  const down = mine.filter(l => l.kind === 'downtime').reduce((x, l) => x + (l.minutes ?? 0), 0) + Math.round(s.standbySecs / 60)
                  return (
                    <div key={s.rig.rig} style={{ background: 'var(--raised)', borderRadius: 11, padding: '9px 11px', fontSize: 12.5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FileText size={14} color="var(--muted)" /><b className="mono">{s.rig.rig}</b>
                        <span style={{ color: 'var(--muted)' }}>{r1(s.depth - s.startDepth)} m · {r1(s.drillSecs / 3600)} h drilling{down ? ` · ${down} min stopped` : ''}</span>
                        <button className="btn" style={{ marginLeft: 'auto', minHeight: 28, fontSize: 11.5, padding: '0 9px' }} disabled={sent[s.rig.rig]} onClick={() => { setSent(x => ({ ...x, [s.rig.rig]: true })); say({ en: `${s.rig.rig} shift log sent to the supervisor.`, ar: `أُرسل سجل ${s.rig.rig} إلى المشرف.`, hi: `${s.rig.rig} की शिफ्ट लॉग सुपरवाइज़र को भेजी गई।`, ur: `${s.rig.rig} کی شفٹ لاگ سپروائزر کو بھیج دی گئی۔` }, 3) }}>{sent[s.rig.rig] ? <><Check size={13} /> Sent</> : 'Send'}</button>
                      </div>
                      {mine.slice(-3).map((l, i) => <div key={i} style={{ color: 'var(--muted)', marginTop: 4 }}><span className="mono" style={{ color: 'var(--faint)' }}>{clock(l.at, false)}</span> · {l.text}</div>)}
                    </div>
                  )
                })}
              </div>
            </section>
            <button className="btn" style={{ justifySelf: 'start', color: 'var(--faint)' }} onClick={() => { setOn(false); setBooting(0) }}><Power size={14} /> Remove Copilot</button>
          </>}
        </aside>
      </div>
    </div>
  )
}

function Mini({ label, v, note, tone }: { label: string; v: string; note?: string; tone?: string }) {
  return (
    <div style={{ background: 'var(--raised)', borderRadius: 12, padding: '9px 11px', borderLeft: `3px solid ${tone ?? 'var(--line2)'}` }}>
      <div className="eyebrow">{label}</div>
      <div className="mono" style={{ fontSize: 17, fontWeight: 700, marginTop: 3 }}>{v}</div>
      {note && <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{note}</div>}
    </div>
  )
}
function Kpi({ label, v, c }: { label: string; v: string; c: string }) {
  return (
    <div style={{ background: 'rgba(11,14,19,.55)', borderRadius: 10, padding: '7px 9px', borderTop: `2px solid ${c}` }}>
      <div style={{ fontSize: 10.5, color: 'var(--faint)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>{label}</div>
      <div className="mono" style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{v}</div>
    </div>
  )
}

function AdviceCard({ a, lang, level, open, onToggle, record, escalated, selected, speaking, onPick, onDone, onApply, onLater }: {
  a: Advice; lang: Lang; level: CLevel; open: boolean; onToggle: () => void; record?: { worked: number; of: number }; escalated: boolean; selected: boolean; speaking: boolean
  onPick: () => void; onDone: () => void; onApply: () => void; onLater: () => void
}) {
  const c = LEVEL_C[a.level]
  const canApply = a.fix.type !== 'none'
  return (
    <section className="slideIn" style={{ background: 'var(--panel)', border: `1px solid ${speaking ? 'var(--blue)' : a.level === 'act' ? 'rgba(239,68,68,.55)' : a.level === 'watch' ? 'rgba(245,158,11,.45)' : 'var(--line)'}`, borderRadius: 14, overflow: 'hidden', boxShadow: [selected ? `inset 3px 0 0 ${c}` : '', speaking ? '0 0 0 2px rgba(59,130,246,.35)' : ''].filter(Boolean).join(', ') || undefined }}>
      <button onClick={onToggle} aria-expanded={open} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--text)', cursor: 'pointer', padding: '11px 13px', display: 'grid', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', color: c }}>{a.level === 'act' ? 'ACT NOW' : a.level === 'watch' ? 'WATCH' : 'INFO'}</span>
          <span onClick={e => { e.stopPropagation(); onPick() }} className="mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textDecoration: 'underline', textDecorationColor: 'var(--line2)', textUnderlineOffset: 3 }}>{a.rig}</span>
          <span style={{ fontSize: 11.5, color: 'var(--faint)' }}>{KIND_LABEL[a.kind]}</span>
          {speaking && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Volume2 size={12} /> speaking</span>}
          {escalated && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><ShieldAlert size={12} /> sent to supervisor</span>}
          <span style={{ marginLeft: 'auto', color: 'var(--faint)' }}>{open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</span>
        </div>
        <div style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.35 }}>{a.what}</div>
        {lang !== 'en' && <div style={{ fontSize: 13, color: 'var(--muted)', direction: lang === 'hi' ? 'ltr' : 'rtl', lineHeight: 1.5 }}>{a.say[lang]}</div>}
      </button>
      {open && (
        <div style={{ padding: '0 13px 13px', display: 'grid', gap: 10 }}>
          <div>
            <div className="eyebrow" style={{ color: 'var(--orange)' }}>How</div>
            <ol style={{ margin: '5px 0 0', paddingLeft: 20, display: 'grid', gap: 3, fontSize: 13, lineHeight: 1.45 }}>{a.how.map((h, i) => <li key={i}>{h}</li>)}</ol>
          </div>
          <div>
            <div className="eyebrow">Why</div>
            <ul style={{ margin: '5px 0 0', paddingLeft: 18, display: 'grid', gap: 3, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.45 }}>{a.why.map((h, i) => <li key={i}>{h}</li>)}</ul>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
            {record && record.of > 0 && <span style={{ border: '1px solid var(--line2)', borderRadius: 999, padding: '2px 9px', color: 'var(--muted)' }}>Worked {record.worked} of {record.of} times</span>}
            {a.gain && <span style={{ border: '1px solid rgba(34,197,94,.4)', borderRadius: 999, padding: '2px 9px', color: 'var(--green)' }}>{a.gain}</span>}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {level !== 'advise' && canApply && <button className="btn" style={{ background: 'var(--orange)', borderColor: 'var(--orange)', color: '#fff' }} onClick={onApply}><Wrench size={14} /> {a.fix.type === 'log-standby' ? 'Log it' : 'Apply to rig'}</button>}
            <button className="btn" style={{ background: level === 'advise' || !canApply ? 'var(--green)' : 'var(--raised)', borderColor: level === 'advise' || !canApply ? 'var(--green)' : 'var(--line)', color: level === 'advise' || !canApply ? '#06210F' : 'var(--text)' }} onClick={onDone}><Check size={14} /> Done</button>
            <button className="btn" onClick={onLater}>Not now</button>
          </div>
        </div>
      )}
    </section>
  )
}

function AddCopilot({ onAdd }: { onAdd: () => void }) {
  const items = [
    ['Reads every reading, every second', 'Rotation, bit load, torque, water, penetration, engine and fuel, on every rig'],
    ['Sees the rock ahead', 'From the cored holes around each rig, before the bit gets there'],
    ['Says what to do and how', 'Step by step, with the readings behind it and how often it worked'],
    ['Guards the money', 'Billable standby, cost a metre against the contract, diesel burned for nothing'],
    ['Catches failures early', 'A blocking bit, an engine losing cooling, a pump wearing out'],
    ['Tells you when to stop a hole', 'When no target is left below: metres and money not spent'],
    ['Checks its own advice', 'Watches the readings after you act and says whether it worked'],
  ]
  return (
    <section style={{ background: 'linear-gradient(165deg, rgba(249,115,22,.18), rgba(139,92,246,.1) 55%, var(--panel))', border: '1px solid rgba(249,115,22,.5)', borderRadius: 16, padding: 18, display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <span className="ping" style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--orange)', display: 'grid', placeItems: 'center' }}><Sparkles size={20} color="#fff" /></span>
        <div><div style={{ fontWeight: 800, fontSize: 17 }}>XPLORIX Copilot</div><div style={{ fontSize: 12.5, color: 'var(--muted)' }}>An AI agent for your rigs</div></div>
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.55 }}>Add Copilot to Pulse and it reads every rig, every second, and tells your crew what to do and exactly how.</div>
      <div style={{ display: 'grid', gap: 8 }}>
        {items.map(([t, d]) => (
          <div key={t} style={{ display: 'grid', gridTemplateColumns: '16px 1fr', gap: 8, fontSize: 12.5, lineHeight: 1.4 }}>
            <Check size={15} color="var(--orange)" style={{ marginTop: 1 }} /><span><b>{t}</b><span style={{ display: 'block', color: 'var(--muted)' }}>{d}</span></span>
          </div>
        ))}
      </div>
      <button className="btn" onClick={onAdd} style={{ minHeight: 50, fontSize: 15, background: 'var(--orange)', borderColor: 'var(--orange)', color: '#fff' }}><Sparkles size={17} /> Add XPLORIX Copilot</button>
      <div style={{ fontSize: 11.5, color: 'var(--faint)', lineHeight: 1.5 }}>Works on any rig. Speaks English, Arabic, Hindi and Urdu. Copilot only changes the rig when you set it to Assist or Auto.</div>
    </section>
  )
}

function Booting({ step }: { step: number }) {
  const lines = ['Connecting to the rig sensors', 'Reading the cored holes around each rig', 'Loading each rig\'s normal speed, bit and contract', 'Watching']
  return (
    <section style={{ background: 'var(--panel)', border: '1px solid rgba(249,115,22,.45)', borderRadius: 16, padding: 18, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 800 }}><Sparkles size={18} color="var(--orange)" /> Adding XPLORIX Copilot</div>
      {lines.map((l, i) => <div key={l} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: i < step ? 'var(--text)' : 'var(--faint)' }}>{i < step ? <Check size={14} color="var(--green)" /> : <Clock size={14} />} {l}</div>)}
    </section>
  )
}
