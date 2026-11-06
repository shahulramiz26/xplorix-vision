'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Radio, Sparkles, Power, Mic, MicOff, Send, Volume2, VolumeX, Check, Clock, ShieldAlert, Play, Pause, Bot, Wrench, FileText, BadgeCheck, Sun, Moon, ChevronRight, AlertTriangle, Eye, Info, Languages, MessageSquare, ListChecks, Gauge } from 'lucide-react'
import { RIGS, openRig, tick, clampSettings, NORMAL, liveCost, type Live } from '../../lib/rig'
import { think, verdict, type Advice, type Lang } from '../../lib/copilot'
import { answer, type LogLine } from '../../lib/ask'
import { memory, useMemory } from '../../lib/memory'
import { ratePerMetre } from '../../lib/data'
import { nextBroken } from '../../lib/ground'
import { Readings, Streams, HoleStrip, Spark, KIND_LABEL } from '../../components/rigview'
import { normalRop } from '../../lib/data'
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
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const [tab, setTab] = useState<'ask' | 'checked' | 'logs'>('ask')
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [reads, setReads] = useState(0)
  const [sent, setSent] = useState<Record<string, boolean>>({})
  const later = useRef<Later[]>([])
  const livesRef = useRef<Live[]>(lives)
  const spoken = useRef<Set<string>>(new Set())
  const mem = useMemory()

  useEffect(() => { setOn(readStored('xplorix-copilot-on', false)); setLevel(readStored('xplorix-copilot-level', 'advise')); setLang(readStored('xplorix-copilot-lang', 'en')); setVoiceMode(readStored('xplorix-copilot-voice', 'urgent')) }, [])
  useEffect(() => { writeStored('xplorix-copilot-voice', voiceMode) }, [voiceMode])
  const themeLoaded = useRef(false)
  useEffect(() => { const t = readStored<'dark' | 'light'>('xplorix-theme', 'dark'); themeLoaded.current = true; setTheme(t); document.documentElement.dataset.theme = t }, [])
  const pickTheme = (t: 'dark' | 'light') => { setTheme(t); document.documentElement.dataset.theme = t; writeStored('xplorix-theme', t) }
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

  const todo = advice.filter(a => a.level !== 'info')
  const noted = advice.filter(a => a.level === 'info')
  const focus = todo.find(a => a.key === focusKey) ?? todo.find(a => a.rig === sel && a.level === 'act') ?? todo[0]
  const rest = todo.filter(a => a !== focus)
  const cost = liveCost(live), rate = ratePerMetre(live.rig), normal = normalRop(live.rig, live.rig.formation)
  const vsNormal = live.mode === 'drilling' && normal ? live.now.rop / normal - 1 : null
  const agentState = !on ? 'off' : !ready ? 'starting' : listening ? 'listening' : voice.now ? 'speaking' : todo.length ? 'advising' : 'watching'

  return (
    <div className="app">
      {/* SIDEBAR: dark slate, the logo on its paper tile */}
      <aside className="sidebar" style={{ background: 'var(--side)', borderRight: '1px solid var(--side-line)', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '16px 14px', borderBottom: '1px solid var(--side-line)' }}>
          <span style={{ width: 36, height: 36, borderRadius: 8, background: '#F6EDE5', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} aria-hidden>
            <svg width="26" height="26" viewBox="0 0 100 100" fill="none"><polygon points="50,50 5,5 5,95" fill="#1a1a1a" /><polygon points="50,50 5,5 30,5" fill="#2a2a2a" /><polygon points="50,50 5,95 30,95" fill="#2a2a2a" /><polygon points="50,50 95,5 95,95" fill="#F97316" /><polygon points="50,50 95,5 70,5" fill="#EA580C" /><polygon points="50,50 95,95 70,95" fill="#EA580C" /></svg>
          </span>
          <div><div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '.08em', color: 'var(--side-text)' }}>XPLORIX</div><div style={{ fontSize: 12, color: 'var(--side-muted)' }}>Drilling intelligence</div></div>
        </div>
        <nav aria-label="Main" style={{ padding: 10, display: 'grid', gap: 2 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', color: 'var(--side-faint)', padding: '10px 12px 6px', textTransform: 'uppercase' }}>Operations</div>
          <a className="side-link" href="#pulse" aria-current="page"><Radio size={17} /> Pulse · live rigs</a>
          <a className="side-link" href="#copilot"><Sparkles size={17} /> Copilot {on && todo.length > 0 && <span className="mono" style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 700, background: 'var(--orange)', color: 'var(--on-orange)', borderRadius: 999, padding: '1px 7px' }}>{todo.length}</span>}</a>
        </nav>
        <div style={{ marginTop: 'auto', padding: 12, borderTop: '1px solid var(--side-line)', display: 'grid', gap: 8 }}>
          <button className="side-link" style={{ background: 'transparent', border: 'none', cursor: 'pointer', width: '100%' }} onClick={() => pickTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />} {theme === 'dark' ? 'Light theme' : 'Dark theme'}</button>
          <div style={{ fontSize: 11.5, color: 'var(--side-faint)', padding: '0 12px', lineHeight: 1.5 }}>Sensor feed simulated · record from the XPLORIX MVP</div>
        </div>
      </aside>

      <div id="pulse" style={{ padding: 'clamp(12px, 1.8vw, 24px)', display: 'grid', gap: 16, alignContent: 'start', minWidth: 0 }}>
        {/* TOP BAR */}
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-.01em' }}>Pulse</h1>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{RIGS.length} rigs on Site A North Field and Site B South Ridge</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span role="status" className="chip" style={{ minHeight: 40, padding: '0 12px', borderColor: running ? 'var(--line3)' : 'var(--amber)', color: running ? 'var(--muted)' : 'var(--amber)' }}>
              <span className={running ? 'pingG' : ''} style={{ width: 8, height: 8, borderRadius: 4, background: running ? 'var(--green)' : 'var(--amber)' }} />
              {running ? 'Live' : 'Paused · last reading'} <span className="mono" style={{ color: 'var(--text)' }}>{clock(lives[0].t)}</span>
            </span>
            <button className="btn only-narrow" onClick={() => pickTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Light theme' : 'Dark theme'}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
            <button className="btn" onClick={() => setRunning(r => !r)} aria-label={running ? 'Pause the feed' : 'Resume the feed'}>{running ? <Pause size={16} /> : <Play size={16} />}</button>
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12.5, color: 'var(--muted)' }}>Demo speed
              <select value={speed} onChange={e => setSpeed(Number(e.target.value))} aria-label="Demo speed" style={{ minHeight: 40, background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--line3)', borderRadius: 8, padding: '0 8px', fontSize: 13.5 }}>
                {[1, 30, 120, 300, 600].map(v => <option key={v} value={v}>{v === 1 ? 'Real time' : `×${v}`}</option>)}
              </select>
            </label>
            {on
              ? <button className="btn" onClick={() => { setOn(false); setBooting(0); voice.clear() }} aria-pressed="true" style={{ borderColor: 'var(--orange)' }}><Sparkles size={16} color="var(--orange)" /> Copilot on <Power size={14} color="var(--faint)" /></button>
              : <button className="btn btn-primary" onClick={() => { setOn(true); setBooting(0) }}><Sparkles size={16} /> Add XPLORIX Copilot</button>}
          </div>
        </header>

        {/* FLEET */}
        <section aria-label="Rigs" className="fleet">
          {lives.map(s => {
            const mine = byRig(s.rig.rig)
            const worst = mine.find(a => a.level === 'act') ? 'act' : mine.find(a => a.level === 'watch') ? 'watch' : null
            const fixedNow = proven.find(p => p.rig === s.rig.rig && p.worked && Date.now() - p.at < 90000)
            const stripe = !ready ? 'var(--line3)' : worst === 'act' ? 'var(--red)' : worst === 'watch' ? 'var(--amber)' : 'var(--green)'
            const isSel = sel === s.rig.rig
            return (
              <button key={s.rig.rig} onClick={() => setSel(s.rig.rig)} aria-pressed={isSel} className="card"
                style={{ textAlign: 'left', cursor: 'pointer', color: 'var(--text)', padding: '12px 13px 11px', position: 'relative', overflow: 'hidden', borderColor: isSel ? 'var(--orange)' : 'var(--line)', boxShadow: isSel ? '0 0 0 1px var(--orange)' : 'var(--shadow)', minHeight: 44 }}>
                <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: stripe }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                  <span className="mono" style={{ fontWeight: 700, fontSize: 14.5 }}>{s.rig.rig}</span>
                  <span style={{ fontSize: 11.5, color: s.mode === 'drilling' ? 'var(--muted)' : 'var(--amber)', fontWeight: 600 }}>{MODE_WORD[s.mode]}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--faint)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.rig.hole} · {s.rig.project.split(' - ')[1] ?? s.rig.project}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 }}>
                  <span className="mono" style={{ fontSize: 19, fontWeight: 700 }}>{s.depth.toFixed(1)}<span style={{ fontSize: 11, color: 'var(--faint)', fontWeight: 500 }}> m</span></span>
                  <span className="mono" style={{ fontSize: 12.5, color: 'var(--muted)' }}>{s.now.rop.toFixed(2)} m/h</span>
                </div>
                <div style={{ marginTop: 4 }}><Spark s={s} /></div>
                {on && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12, fontWeight: 600, color: fixedNow ? 'var(--green-t)' : worst === 'act' ? 'var(--red-t)' : worst === 'watch' ? 'var(--amber)' : 'var(--muted)' }}>
                    {!ready ? <><Clock size={13} /> Starting</> : fixedNow ? <><BadgeCheck size={13} /> Fixed</> : mine.length ? <>{worst === 'act' ? <AlertTriangle size={13} /> : <Eye size={13} />} {mine.length} to do</> : <><span className="pingG" style={{ width: 7, height: 7, borderRadius: 4, background: 'var(--green)' }} /> All good</>}
                  </div>
                )}
              </button>
            )
          })}
        </section>

        <div className={`work ${on ? '' : 'off'}`}>
          {/* THE CHOSEN RIG */}
          <main style={{ display: 'grid', gap: 16, minWidth: 0 }}>
            <section className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}><span className="mono">{live.rig.rig}</span></h2>
                <span style={{ fontSize: 13.5, color: 'var(--muted)' }}>{live.rig.hole} · {live.rig.formation.replace(' Formation', '').toLowerCase()} ground · {live.rig.size} · driller {live.rig.driller ?? '—'}</span>
                <span className="chip" style={{ marginLeft: 'auto', color: live.mode === 'drilling' ? 'var(--green-t)' : 'var(--amber)', borderColor: live.mode === 'drilling' ? 'rgba(34,160,107,.5)' : 'var(--amber)' }}><Gauge size={13} /> {MODE_WORD[live.mode]}{live.mode === 'standby' && live.standbyReason ? `: ${live.standbyReason.toLowerCase()}` : ''}</span>
              </div>
              <div className="kpis" style={{ marginBottom: 14 }}>
                <Kpi label="Depth" value={`${live.depth.toFixed(1)} m`} note={live.rig.holePlanned ? `of ${r0(live.rig.holePlanned)} m planned` : 'No plan set'} />
                <Kpi label="Speed vs normal" value={vsNormal == null ? '—' : (Math.round(vsNormal * 100) === 0 ? 'On normal' : `${vsNormal > 0 ? '+' : '−'}${r0(Math.abs(vsNormal) * 100)}%`)} note={`Normal here ${normal.toFixed(2)} m/h`} tone={vsNormal != null && vsNormal < -0.15 ? 'var(--amber)' : 'var(--green)'} />
                <Kpi label="Cost a metre" value={cost.perMetre ? `SAR ${r0(cost.perMetre)}` : '—'} note={`Contract pays SAR ${r0(rate)}`} tone={cost.perMetre && cost.perMetre > rate ? 'var(--red)' : 'var(--green)'} />
                <Kpi label="Bit life" value={`${r0(Math.max(0, live.bitLife - live.bitUsed))} m`} note={`${r0(live.bitUsed)} of ${r0(live.bitLife)} m used`} tone={live.bitLife - live.bitUsed < 10 ? 'var(--amber)' : 'var(--green)'} />
                <Kpi label="This shift" value={`${r1(live.depth - live.startDepth)} m`} note={`${r1(live.drillSecs / 3600)} h drilling · ${r0(live.litres)} L diesel`} />
              </div>
              <Readings s={live} />
            </section>
            <div className="rigbody">
              <section className="card" style={{ padding: 16, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}><h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Last hour</h3><span style={{ fontSize: 12, color: 'var(--faint)' }}>Shaded band = normal range · triangle = out of range</span></div>
                <Streams s={live} />
              </section>
              <section className="card" style={{ padding: 16 }}>
                <h3 style={{ margin: '0 0 2px', fontSize: 15, fontWeight: 600 }}>Rock ahead</h3>
                <div style={{ fontSize: 12, color: 'var(--faint)', marginBottom: 10 }}>From the cored holes around {live.rig.hole}</div>
                <HoleStrip s={live} />
              </section>
            </div>
          </main>

          {/* COPILOT */}
          <aside id="copilot" className="rail" aria-label="XPLORIX Copilot">
            {!on ? <AddCopilot onAdd={() => { setOn(true); setBooting(0) }} /> : !ready ? <Booting step={booting} /> : <>
              <section className="card" style={{ padding: 14, display: 'grid', gap: 12, borderColor: 'rgba(249,115,22,.45)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <span className={agentState === 'speaking' || agentState === 'listening' ? 'ping' : ''} style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--orange)', color: 'var(--on-orange)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    {agentState === 'speaking' ? <span className="talk" aria-hidden><span /><span /><span /><span /></span> : agentState === 'listening' ? <Mic size={19} /> : <Bot size={19} />}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15.5 }}>XPLORIX Copilot</div>
                    <div role="status" aria-atomic="true" style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                      {agentState === 'speaking' ? 'Speaking' : agentState === 'listening' ? 'Listening' : agentState === 'advising' ? `${todo.length} thing${todo.length === 1 ? '' : 's'} to do` : 'Watching, all good'} · {RIGS.length * 8} readings a second
                    </div>
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <div className="seg" role="group" aria-label="How much Copilot does" style={{ width: '100%' }}>
                    {(['advise', 'assist', 'auto'] as CLevel[]).map(l => <button key={l} aria-pressed={level === l} onClick={() => setLevel(l)} style={{ flex: 1, justifyContent: 'center' }}>{{ advise: 'Advise', assist: 'Assist', auto: 'Auto' }[l]}</button>)}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--faint)' }}>{{ advise: 'Copilot says what to do; the crew does it.', assist: 'One tap sends Copilot\'s settings to the rig.', auto: 'Copilot adjusts the rig within safe limits and says so.' }[level]}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div className="seg" role="group" aria-label="Voice">
                    {(['off', 'urgent', 'all'] as VoiceMode[]).map(m => <button key={m} aria-pressed={voiceMode === m} onClick={() => setVoiceMode(m)} title={{ off: 'Copilot does not speak', urgent: 'Speaks only act-now advice and answers', all: 'Speaks everything, one at a time' }[m]}>{m === 'off' ? <VolumeX size={13} /> : <Volume2 size={13} />}{{ off: 'Off', urgent: 'Urgent', all: 'All' }[m]}</button>)}
                  </div>
                  <div className="seg" role="group" aria-label="Language">
                    <Languages size={13} color="var(--faint)" style={{ margin: '0 2px 0 5px', alignSelf: 'center' }} aria-hidden />
                    {LANGS.map(l => <button key={l.v} aria-pressed={lang === l.v} onClick={() => setLang(l.v)}>{l.label}</button>)}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  <Stat label="To do" value={String(todo.length)} tone={todo.some(a => a.level === 'act') ? 'var(--red)' : todo.length ? 'var(--amber)' : 'var(--green)'} />
                  <Stat label="At stake" value={`SAR ${r0(atStake)}`} tone="var(--orange)" />
                  <Stat label="Proven" value={`${totals.fixed} · ${r1(totals.hours)} h`} tone="var(--green)" />
                </div>
              </section>

              {voice.now && (
                <section className="card rise" aria-live="polite" style={{ padding: '11px 13px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, alignItems: 'center', borderColor: 'var(--blue)' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 600, letterSpacing: '.06em', color: 'var(--blue)', textTransform: 'uppercase' }}><span className="talk" aria-hidden style={{ color: 'var(--blue)' }}><span /><span /><span /></span> Copilot is saying{voice.now.rig ? ` · ${voice.now.rig}` : ''}</div>
                    <div style={{ fontSize: 14, lineHeight: 1.45, marginTop: 4, direction: /[؀-ۿ]/.test(voice.now.text) ? 'rtl' : 'ltr' }}>{voice.now.text}</div>
                    {voice.waiting > 0 && <div style={{ fontSize: 12, color: 'var(--faint)', marginTop: 3 }}>{voice.waiting} more waiting, one at a time</div>}
                  </div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    <button className="btn btn-sm" onClick={voice.skip}>Skip</button>
                    {voice.waiting > 0 && <button className="btn btn-sm" onClick={voice.clear}>Stop all</button>}
                  </div>
                </section>
              )}

              {focus ? (
                <Focus a={focus} lang={lang} level={level} record={mem.record[focus.kind]} escalated={escalated(focus)} speaking={voice.now?.key === focus.key}
                  onPick={() => setSel(focus.rig)} onDone={() => act(focus, 'done')} onApply={() => act(focus, 'applied')} onLater={() => act(focus, 'later')} />
              ) : (
                <section className="card" style={{ padding: 16, display: 'flex', gap: 10, alignItems: 'center' }}><BadgeCheck size={20} color="var(--green)" /><div><div style={{ fontWeight: 600 }}>Every rig is running well</div><div style={{ fontSize: 13, color: 'var(--muted)' }}>Copilot is watching every reading.</div></div></section>
              )}

              {rest.length > 0 && (
                <section className="card" style={{ overflow: 'hidden' }}>
                  <div style={{ padding: '11px 14px 8px' }} className="label">Next ({rest.length})</div>
                  {rest.map(a => (
                    <button key={a.key} onClick={() => { setFocusKey(a.key); setSel(a.rig) }} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 'none', borderTop: '1px solid var(--line)', color: 'var(--text)', padding: '10px 14px', minHeight: 48, display: 'grid', gridTemplateColumns: '84px minmax(0, 1fr) 16px', gap: 10, alignItems: 'center' }}>
                      <LevelTag level={a.level} />
                      <span style={{ minWidth: 0 }}><span className="mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>{a.rig}</span> <span style={{ fontSize: 13.5 }}>{a.what}</span></span>
                      <ChevronRight size={15} color="var(--faint)" />
                    </button>
                  ))}
                </section>
              )}
              {noted.length > 0 && (
                <details className="card" style={{ padding: '10px 14px' }}>
                  <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--muted)', minHeight: 28, display: 'flex', alignItems: 'center', gap: 7 }}><Info size={14} /> Also noted ({noted.length})</summary>
                  <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                    {noted.map(a => <div key={a.key} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}><b className="mono" style={{ fontSize: 12 }}>{a.rig}</b><span style={{ color: 'var(--muted)', flex: 1 }}>{a.what}</span><button className="btn btn-sm" onClick={() => act(a, 'done')}><Check size={13} /> Done</button></div>)}
                  </div>
                </details>
              )}

              <section className="card" style={{ overflow: 'hidden' }}>
                <div className="tabs" role="tablist" style={{ padding: '0 8px' }}>
                  <button role="tab" aria-selected={tab === 'ask'} onClick={() => setTab('ask')}><MessageSquare size={14} /> Ask</button>
                  <button role="tab" aria-selected={tab === 'checked'} onClick={() => setTab('checked')}><BadgeCheck size={14} /> Checked {proven.length > 0 && <span className="mono" style={{ fontSize: 11 }}>{proven.length}</span>}</button>
                  <button role="tab" aria-selected={tab === 'logs'} onClick={() => setTab('logs')}><ListChecks size={14} /> Shift logs</button>
                </div>
                <div style={{ padding: 14 }} role="tabpanel">
                  {tab === 'ask' && <>
                    <div style={{ fontSize: 12.5, color: 'var(--faint)', marginBottom: 8 }}>About <b className="mono" style={{ color: 'var(--muted)' }}>{sel}</b>. Ask, or tell Copilot what happened and it goes in the shift log.</div>
                    <div style={{ display: 'grid', gap: 7, maxHeight: 220, overflowY: 'auto' }} ref={el => { if (el) el.scrollTop = el.scrollHeight }}>
                      {chat.map((m, i) => <div key={i} style={{ justifySelf: m.who === 'you' ? 'end' : 'start', maxWidth: '90%', background: m.who === 'you' ? 'var(--raised2)' : 'rgba(249,115,22,.1)', border: `1px solid ${m.who === 'you' ? 'var(--line)' : 'rgba(249,115,22,.3)'}`, borderRadius: 10, padding: '8px 11px', fontSize: 13.5, lineHeight: 1.45, direction: /[؀-ۿ]/.test(m.text) ? 'rtl' : 'ltr' }}>{m.text}</div>)}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: chat.length ? 10 : 0 }}>
                      <button className="btn" aria-pressed={listening} onPointerDown={() => listen(true)} onPointerUp={() => listen(false)} style={{ minWidth: 48, minHeight: 48, background: listening ? 'var(--red)' : 'var(--card)', color: listening ? '#fff' : 'var(--text)' }} aria-label="Hold to speak">{listening ? <MicOff size={18} /> : <Mic size={18} />}</button>
                      <form onSubmit={e => { e.preventDefault(); ask(typed); setTyped('') }} style={{ flex: 1, display: 'flex', gap: 6 }}>
                        <label htmlFor="ask" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Ask Copilot</label>
                        <input id="ask" value={typed} onChange={e => setTyped(e.target.value)} placeholder="What should I do now?" aria-label="Ask Copilot" style={{ flex: 1, minWidth: 0, minHeight: 48, background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--line3)', borderRadius: 8, padding: '0 12px', fontSize: 15 }} />
                        <button className="btn btn-primary" type="submit" aria-label="Send" style={{ minWidth: 48, minHeight: 48 }}><Send size={17} /></button>
                      </form>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                      {['What should I do now?', 'Rock ahead?', 'Bit life?', 'Cost a metre?', 'We stopped 40 minutes for water', 'Log a bit change'].map(q => <button key={q} className="btn btn-sm" style={{ fontWeight: 500 }} onClick={() => ask(q)}>{q}</button>)}
                    </div>
                  </>}
                  {tab === 'checked' && (proven.length === 0 ? <div style={{ fontSize: 13, color: 'var(--faint)' }}>When the crew acts on advice, Copilot watches the readings and records here whether it worked.</div> : (
                    <div style={{ display: 'grid', gap: 10 }}>
                      {proven.map((p, i) => (
                        <div key={i} className="rise" style={{ display: 'grid', gridTemplateColumns: '20px 1fr', gap: 9, fontSize: 13, lineHeight: 1.45 }}>
                          {p.worked ? <BadgeCheck size={18} color="var(--green)" /> : <ShieldAlert size={18} color="var(--red)" />}
                          <span><b className="mono">{p.rig}</b> <b style={{ color: p.worked ? 'var(--green-t)' : 'var(--red-t)' }}>{p.worked ? 'Worked' : 'Not fixed'}</b> · {KIND_LABEL[p.kind]}<span style={{ display: 'block', color: 'var(--muted)' }}>{p.text}{p.hours ? ` · ${r1(p.hours)} h saved` : ''}{p.sar ? ` · SAR ${r0(p.sar)}` : ''}</span></span>
                        </div>
                      ))}
                    </div>
                  ))}
                  {tab === 'logs' && (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {lives.map(s => {
                        const mine = logs.filter(l => l.rig === s.rig.rig)
                        const down = mine.filter(l => l.kind === 'downtime').reduce((x, l) => x + (l.minutes ?? 0), 0) + Math.round(s.standbySecs / 60)
                        return (
                          <div key={s.rig.rig} className="raised" style={{ padding: '10px 12px', fontSize: 13 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <FileText size={15} color="var(--muted)" aria-hidden /><b className="mono">{s.rig.rig}</b>
                              <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>{r1(s.depth - s.startDepth)} m · {r1(s.drillSecs / 3600)} h{down ? ` · ${down} min stopped` : ''}</span>
                              <button className="btn btn-sm" style={{ marginLeft: 'auto' }} disabled={sent[s.rig.rig]} onClick={() => { setSent(x => ({ ...x, [s.rig.rig]: true })); say({ en: `${s.rig.rig} shift log sent to the supervisor.`, ar: `أُرسل سجل ${s.rig.rig} إلى المشرف.`, hi: `${s.rig.rig} की शिफ्ट लॉग सुपरवाइज़र को भेजी गई।`, ur: `${s.rig.rig} کی شفٹ لاگ سپروائزر کو بھیج دی گئی۔` }, 3) }}>{sent[s.rig.rig] ? <><Check size={13} /> Sent</> : 'Send'}</button>
                            </div>
                            {mine.length === 0 ? <div style={{ color: 'var(--faint)', marginTop: 5, fontSize: 12.5 }}>Metres and hours from the sensors so far.</div> : mine.slice(-4).map((l, i) => <div key={i} style={{ color: 'var(--muted)', marginTop: 5, fontSize: 12.5 }}><span className="mono" style={{ color: 'var(--faint)' }}>{clock(l.at, false)}</span> · {l.text}</div>)}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </section>
              <button className="btn" style={{ justifySelf: 'start', color: 'var(--muted)' }} onClick={() => { setOn(false); setBooting(0); voice.clear() }}><Power size={15} /> Remove Copilot</button>
            </>}
          </aside>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--faint)', lineHeight: 1.55 }}>Sensor readings are simulated: no rig is fitted yet. The rigs, holes, rock (from real core photos), speeds, best crews, bits, contract rates and costs are XPLORIX&rsquo;s real record. Copilot runs on rules today; the launch version adds trained models behind the same agent.</p>
      </div>
    </div>
  )
}

function Kpi({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: string }) {
  return (
    <div className="raised" style={{ padding: '10px 12px', borderLeft: `3px solid ${tone ?? 'var(--line3)'}` }}>
      <div className="label">{label}</div>
      <div className="mono" style={{ fontSize: 19, fontWeight: 700, marginTop: 4 }}>{value}</div>
      {note && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>{note}</div>}
    </div>
  )
}
function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="raised" style={{ padding: '8px 10px', borderTop: `2px solid ${tone}` }}>
      <div className="label" style={{ fontSize: 10.5 }}>{label}</div>
      <div className="mono" style={{ fontSize: 14.5, fontWeight: 700, marginTop: 3 }}>{value}</div>
    </div>
  )
}
function LevelTag({ level }: { level: Advice['level'] }) {
  const m = { act: { c: 'var(--red-t)', b: 'var(--red)', w: 'Act now', I: AlertTriangle }, watch: { c: 'var(--amber)', b: 'var(--amber)', w: 'Watch', I: Eye }, info: { c: 'var(--blue)', b: 'var(--blue)', w: 'Info', I: Info } }[level]
  return <span className="chip" style={{ color: m.c, borderColor: m.b, fontSize: 11.5, justifySelf: 'start' }}><m.I size={12} aria-hidden /> {m.w}</span>
}

/* The one thing to do now, big enough to read and tap at the rig. */
function Focus({ a, lang, level, record, escalated, speaking, onPick, onDone, onApply, onLater }: {
  a: Advice; lang: Lang; level: CLevel; record?: { worked: number; of: number }; escalated: boolean; speaking: boolean
  onPick: () => void; onDone: () => void; onApply: () => void; onLater: () => void
}) {
  const canApply = a.fix.type !== 'none'
  const primaryApply = level !== 'advise' && canApply
  return (
    <section className="card rise" aria-label="Do this now" style={{ padding: 16, display: 'grid', gap: 14, borderColor: speaking ? 'var(--blue)' : a.level === 'act' ? 'var(--red)' : 'var(--amber)', boxShadow: speaking ? '0 0 0 2px rgba(91,141,239,.35)' : 'var(--shadow)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <LevelTag level={a.level} />
        <button onClick={onPick} className="mono" style={{ background: 'none', border: 'none', color: 'var(--text)', fontWeight: 700, fontSize: 13, cursor: 'pointer', padding: '6px 2px', textDecoration: 'underline', textDecorationColor: 'var(--line3)', textUnderlineOffset: 3 }}>{a.rig}</button>
        <span style={{ fontSize: 12.5, color: 'var(--faint)' }}>{KIND_LABEL[a.kind]}</span>
        {speaking && <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: 'var(--blue)', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Volume2 size={13} /> Speaking</span>}
      </div>
      {escalated && <div role="alert" style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, fontWeight: 600, color: 'var(--red-t)', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.4)', borderRadius: 8, padding: '8px 10px' }}><ShieldAlert size={15} /> No answer for a minute: sent to the supervisor</div>}
      <div>
        <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.3 }}>{a.what}</div>
        {lang !== 'en' && <div style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.55, marginTop: 6, direction: lang === 'hi' ? 'ltr' : 'rtl' }}>{a.say[lang]}</div>}
      </div>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
        {a.how.map((h, i) => (
          <li key={i} style={{ display: 'grid', gridTemplateColumns: '26px 1fr', gap: 10, alignItems: 'start', fontSize: 15, lineHeight: 1.45 }}>
            <span className="mono" style={{ width: 26, height: 26, borderRadius: 13, background: 'var(--raised2)', border: '1px solid var(--line3)', display: 'grid', placeItems: 'center', fontSize: 12.5, fontWeight: 700 }}>{i + 1}</span>
            <span>{h}</span>
          </li>
        ))}
      </ol>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {primaryApply && <button className="btn btn-primary btn-lg" onClick={onApply}><Wrench size={17} /> {a.fix.type === 'log-standby' ? 'Log it' : a.fix.type === 'flush' ? 'Run the flush' : a.fix.type === 'engine-off' ? 'Switch engine off' : 'Apply to rig'}</button>}
        <button className={`btn btn-lg ${primaryApply ? '' : 'btn-good'}`} onClick={onDone}><Check size={17} /> Done</button>
        <button className="btn btn-lg" onClick={onLater} style={{ color: 'var(--muted)' }}>Not now</button>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {record && record.of > 0 && <span className="chip">Worked {record.worked} of {record.of} times</span>}
        {a.gain && <span className="chip" style={{ color: 'var(--green-t)', borderColor: 'rgba(34,160,107,.5)' }}>{a.gain}</span>}
      </div>
      <details>
        <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--muted)', minHeight: 32, display: 'flex', alignItems: 'center' }}>Why Copilot says this</summary>
        <ul style={{ margin: '6px 0 0', paddingLeft: 18, display: 'grid', gap: 4, fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>{a.why.map((w, i) => <li key={i}>{w}</li>)}</ul>
      </details>
    </section>
  )
}

function AddCopilot({ onAdd }: { onAdd: () => void }) {
  const items: [React.ElementType, string, string][] = [
    [Gauge, 'Reads every rig, every second', 'All eight readings on all six rigs'],
    [AlertTriangle, 'Warns before it happens', 'Broken rock ahead, a blocking bit, an engine losing its cooling'],
    [ListChecks, 'Says what to do and how', 'Step by step, with the readings behind it'],
    [Sparkles, 'Guards the money', 'Billable standby, cost a metre against the contract, diesel'],
    [BadgeCheck, 'Checks its own advice', 'Watches the readings after you act'],
  ]
  return (
    <section className="card" style={{ padding: 18, display: 'grid', gap: 14, borderColor: 'rgba(249,115,22,.5)' }}>
      <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
        <span style={{ width: 42, height: 42, borderRadius: 10, background: 'var(--orange)', color: 'var(--on-orange)', display: 'grid', placeItems: 'center' }}><Sparkles size={20} /></span>
        <div><div style={{ fontWeight: 700, fontSize: 17 }}>XPLORIX Copilot</div><div style={{ fontSize: 13, color: 'var(--muted)' }}>An AI agent for your rigs</div></div>
      </div>
      <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55 }}>Add Copilot to Pulse. It reads every rig, every second, and tells your crew what to do and exactly how.</p>
      <div style={{ display: 'grid', gap: 10 }}>
        {items.map(([I, t, d]) => (
          <div key={t} style={{ display: 'grid', gridTemplateColumns: '30px 1fr', gap: 10, alignItems: 'start' }}>
            <span style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--raised2)', display: 'grid', placeItems: 'center' }}><I size={15} color="var(--orange)" aria-hidden /></span>
            <span style={{ fontSize: 13.5, lineHeight: 1.4 }}><b style={{ fontWeight: 600 }}>{t}</b><span style={{ display: 'block', color: 'var(--muted)', fontSize: 12.5 }}>{d}</span></span>
          </div>
        ))}
      </div>
      <button className="btn btn-primary btn-lg" onClick={onAdd}><Sparkles size={18} /> Add XPLORIX Copilot</button>
      <div style={{ fontSize: 12, color: 'var(--faint)', lineHeight: 1.5 }}>Works on any rig. Speaks English, Arabic, Hindi and Urdu. Changes the rig only at Assist or Auto.</div>
    </section>
  )
}

function Booting({ step }: { step: number }) {
  const lines = ['Connecting to the rig sensors', 'Reading the cored holes around each rig', 'Loading each rig\'s speed, bit and contract', 'Watching']
  return (
    <section className="card" role="status" style={{ padding: 18, display: 'grid', gap: 10, borderColor: 'rgba(249,115,22,.45)' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 700 }}><Sparkles size={18} color="var(--orange)" /> Adding XPLORIX Copilot</div>
      {lines.map((l, i) => <div key={l} style={{ display: 'flex', gap: 9, alignItems: 'center', fontSize: 13.5, color: i < step ? 'var(--text)' : 'var(--faint)' }}>{i < step ? <Check size={15} color="var(--green)" /> : <Clock size={15} />} {l}</div>)}
    </section>
  )
}
