'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Mic, MicOff, Volume2, VolumeX, Play, Pause, Send, Radio, Sparkles, ArrowRight, Undo2, Clapperboard, Gauge, Maximize2 } from 'lucide-react'
import { TODAY } from '../../../../lib/company'
import { useKnow } from '../../../../lib/copilot/context'
import { groundAhead, nextBroken, gpsFor, targetLevel, type AheadMetre } from '../../../../lib/copilot/ground'
import { start, step, clampSettings, brokenSaving, NORMAL, type RigState, type Settings } from '../../../../lib/copilot/sim'
import { think, hear, type Alert, type Lang, type Ctx } from '../../../../lib/copilot/brain'
import { copilot, useCopilot, record, type VoiceEntry, type Action } from '../../../../lib/copilot/store'

/* ==========================================================================
 * XPLORIX COPILOT — THE DRILLER'S COCKPIT
 *
 * A tablet beside the controls. The live hole with the rock ahead of the
 * bit, the readings against this rig's normal and the best crew, Copilot's
 * advice with its reasons and its record, the countdowns that matter, a
 * voice to ask and to log by, and the shift log writing itself.
 *
 * Autopilot ladder: 1 advises; 2 adds "Apply to rig"; 3 adjusts within
 * safe limits by itself and says so; 4 is the fleet run by one person
 * (its own screen). The rig is simulated; the rock, the history and the
 * advice come from the MVP's own record.
 * ========================================================================== */

const C = {
  bg: '#0E1116', panel: '#161B22', raised: '#1C232D', line: '#2A3340', text: '#E8EDF3', muted: '#9AA6B5', faint: '#677486',
  orange: '#F97316', red: '#EF4444', amber: '#F59E0B', green: '#22C55E', blue: '#3B82F6', violet: '#8B5CF6',
}
const mono = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
const r0 = (n: number) => Math.round(n).toLocaleString('en-US')
const r1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1)
const OPEN = 14 * 3600 + 20 * 60
const clock = (s: number) => { const t = Math.floor(OPEN + s) % 86400; const p = (n: number) => String(n).padStart(2, '0'); return `${p(Math.floor(t / 3600))}:${p(Math.floor(t / 60) % 60)}` }

type Level = 1 | 2 | 3
interface Said { who: 'you' | 'copilot'; text: string }
interface Open { alert: Alert; at: number; eventId: string; depth: number; coreLoss: number; stalls: number; base?: number }

export default function CopilotCockpit() {
  const k = useKnow()
  const store = useCopilot()
  const candidates = useMemo(() => k.holes.filter(h => h.status === 'drilling' || h.hasCore).sort((a, b) => (a.status === 'drilling' ? 0 : 1) - (b.status === 'drilling' ? 0 : 1)), [k.holes])
  const [holeId, setHoleId] = useState<string>('')
  const hole = k.holes.find(h => h.id === holeId) ?? k.holes.find(h => h.id === 'DH-013') ?? candidates[0]
  const rig = hole?.rig ?? 'RIG-002'

  // The rock down the whole hole, from the holes around it
  const ahead = useMemo<AheadMetre[]>(() => hole ? groundAhead({ hole: hole.id, x: hole.x, z: hole.z }, k.cols, 0, Math.ceil(Math.max(hole.planned ?? 0, hole.drilled) + 40), 4) : [], [hole, k.cols])
  const level = useMemo(() => targetLevel(k.cols), [k.cols])
  const gps = useMemo(() => {
    if (!hole || !k.ready) return null
    const col = k.cols.find(c => c.hole === hole.id)
    return col ? gpsFor(col, k.cols, level, hole.planned) : null
  }, [hole, k.cols, k.ready, level])

  const [lang, setLang] = useState<Lang>('en')
  const [voice, setVoice] = useState(true)
  const [lvl, setLvl] = useState<Level>(1)
  const [speed, setSpeed] = useState(120)
  const [running, setRunning] = useState(true)
  const [s, setS] = useState<RigState | null>(null)
  const [open, setOpen] = useState<Open | null>(null)
  const [watch, setWatch] = useState<{ eventId: string; depth: number; coreLoss: number; base: number } | null>(null)
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({})
  const [said, setSaid] = useState<Said[]>([])
  const [entries, setEntries] = useState<VoiceEntry[]>([])
  const [autoLog, setAutoLog] = useState<{ t: number; text: string }[]>([])
  const [result, setResult] = useState<{ text: string; good: boolean } | null>(null)
  const [engineFault, setEngineFault] = useState(false)
  const [story, setStory] = useState<number>(0)
  const [typed, setTyped] = useState('')
  const [listening, setListening] = useState(false)
  const [wake, setWake] = useState(false)
  const spoken = useRef<Set<string>>(new Set())
  const pending = useRef<{ at: number; set: Settings } | null>(null)
  const startDepth = useRef(0)
  const timers = useRef<Record<string, number>>({})
  const ids = useRef<Record<string, string>>({})

  useEffect(() => { if (k.ready && k.drillers.length) copilot.seed(k.fleet, k.drillers, TODAY) }, [k.ready, k.fleet, k.drillers])

  // Start (or restart) the rig on the chosen hole
  const reset = useCallback((storyMode = false) => {
    if (!hole) return
    const b = k.bit(rig)
    let d = hole.drilled
    if (storyMode) {
      const n = nextBroken(ahead, Math.min(hole.drilled, 40), 0.5) && (() => {
        // Just above the next broken zone below the bit; if none ahead, the last one above
        const at = (x: number) => { const z = nextBroken(ahead, x, 0.55); return z && z.inMetres > 2.5 && z.inMetres < 3.5 }
        for (let x = Math.floor(hole.drilled); x < hole.drilled + 80; x++) if (at(x)) return x
        for (let x = Math.floor(hole.drilled); x > 10; x--) if (at(x)) return x
        return null
      })()
      if (n) d = n
    }
    startDepth.current = d
    if (storyMode) { Object.values(timers.current).forEach(id => window.clearTimeout(id)); timers.current = {} }
    setS(start(d, storyMode ? Math.max(0, b.life - 30) : b.used, b.life, 3.2, k.normal(rig, hole.formation) || 0.6))
    setOpen(null); setWatch(null); setDismissed({}); setResult(null); setAutoLog([]); setEntries([]); setEngineFault(false)
    spoken.current = new Set(); pending.current = null
    setSaid([{ who: 'copilot', text: lang === 'ar' ? `مرحباً. أنا كوبايلت. ${rig} على ${hole.id} عند ${r1(d)} متر.` : `Copilot is on. ${rig} on ${hole.id} at ${r1(d)} m. Ask me anything, or say "log a bit change".` }])
  }, [hole, rig, ahead, k, lang])
  useEffect(() => { if (k.ready && hole && !s) reset() }, [k.ready, hole, s, reset])
  const playStory = useCallback(() => { reset(true); setLvl(1); setStory(1); setRunning(true); setSpeed(900) }, [reset])
  const autoStory = useRef(false)
  useEffect(() => {
    if (autoStory.current || !s || !hole) return
    autoStory.current = true
    if (new URLSearchParams(window.location.search).get('story') === '1') playStory()
  }, [s, hole, playStory])

  const ground = hole?.formation ?? 'Medium Formation'
  const ctx: Ctx | null = useMemo(() => s && hole ? {
    s, ahead, normalRop: k.normal(rig, ground) || 0.55, bestCrew: k.bestCrew(ground),
    lastSurvey: hole.lastSurvey, planned: hole.planned, gpsStop: gps?.stopAt ?? null, gpsSaving: gps?.saving ?? 0,
    costPerMetre: hole.cpm, targetCpm: (() => { const v = k.holes.map(h => h.cpm).filter((x): x is number => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null })(),
    hole: hole.id, rig,
  } : null, [s, hole, ahead, k, rig, ground, gps])

  const simCtx = ctx
  const alerts = useMemo(() => simCtx ? think(simCtx).filter(a => !dismissed[a.key]) : [], [simCtx, dismissed])
  const top = alerts[0] ?? null

  const say = useCallback((t: Record<Lang, string> | string) => {
    const text = typeof t === 'string' ? t : t[lang]
    setSaid(x => [...x.slice(-14), { who: 'copilot', text }])
    if (!voice || typeof window === 'undefined' || !('speechSynthesis' in window)) return
    try {
      const u = new SpeechSynthesisUtterance(text)
      u.lang = lang === 'ar' ? 'ar-SA' : 'en-GB'; u.rate = 1.02
      const v = window.speechSynthesis.getVoices().find(v => v.lang.startsWith(lang === 'ar' ? 'ar' : 'en'))
      if (v) u.voice = v
      window.speechSynthesis.cancel(); window.speechSynthesis.speak(u)
    } catch { /* no voice on this device */ }
  }, [lang, voice])

  // The clock: one tick every 250 ms
  useEffect(() => {
    if (!running || !s) return
    const id = window.setInterval(() => {
      setS(prev => {
        if (!prev) return prev
        return step(prev, 0.25 * speed, ahead, { engineFault })
      })
    }, 250)
    return () => window.clearInterval(id)
  }, [running, s, speed, ahead, engineFault])

  // The driller's hands on the dials: advice taken with "Done" lands a moment later
  useEffect(() => {
    const p = pending.current
    if (!p || !s || s.t < p.at) return
    pending.current = null
    setS(x => x ? { ...x, settings: p.set } : x)
  }, [s?.t])

  // New alerts: each is recorded once; the most urgent is spoken; at level 3
  // Copilot acts on every one it has settings for.
  const alertKeys = alerts.map(a => a.key).join('|')
  useEffect(() => {
    if (!s || !hole) return
    const fresh = alerts.filter(a => !spoken.current.has(a.key))
    if (!fresh.length) return
    fresh.forEach((a, i) => {
      spoken.current.add(a.key)
      if (i === 0) say(a.say)
      const ev = copilot.add({ at: new Date().toISOString(), rig, hole: hole.id, depth: Math.round(s.depth * 10) / 10, driller: 'You (live demo)', kind: a.kind, title: a.title, action: 'none', outcome: null, hoursSaved: 0, metresSaved: 0, level: lvl })
      ids.current[a.key] = ev
      if (a.key === top?.key) setOpen({ alert: a, at: s.t, eventId: ev, depth: s.depth, coreLoss: s.coreLoss, stalls: 0 })
      if (lvl === 3 && a.advice?.settings) act('auto', a, ev)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertKeys])
  // The card on screen follows the most urgent alert
  useEffect(() => {
    if (!top || !s) return
    if (open?.alert.key === top.key) return
    const ev = ids.current[top.key]
    if (ev) setOpen({ alert: top, at: s.t, eventId: ev, depth: s.depth, coreLoss: s.coreLoss, stalls: 0 })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top?.key])

  const act = useCallback((a: Action, al?: Alert, evId?: string) => {
    const alert = al ?? open?.alert; const id = evId ?? open?.eventId
    if (!alert || !id || !s) return
    const set = alert.advice?.settings ? clampSettings(alert.advice.settings) : null
    if (a === 'done' && set) pending.current = { at: s.t + 3 * speed / 10, set }   // the driller turns the dials
    if ((a === 'applied' || a === 'auto') && set) {
      setS(x => x ? { ...x, settings: set } : x)
      setAutoLog(l => [{ t: s.t, text: `${a === 'auto' ? 'Copilot set' : 'Applied'} ${set.rpm} rpm · ${set.wob} kN · ${set.flow} L/min (${alert.title.toLowerCase()})` }, ...l].slice(0, 8))
      if (a === 'auto') say({ en: `Copilot has eased the rig to ${set.rpm} rpm and ${set.wob} kilonewtons. Say undo to go back.`, ar: `خفّف كوبايلت الحفارة إلى ${set.rpm} دورة و${set.wob} كيلو نيوتن.` })
    }
    copilot.update(id, { action: a, outcome: a === 'later' ? null : alert.kind === 'broken-ahead' ? 'pending' : 'worked', hoursSaved: a !== 'later' && alert.kind === 'engine-hot' ? 3 : a !== 'later' && alert.kind === 'bit-life' ? 0.8 : 0 })
    setDismissed(d => ({ ...d, [alert.key]: true }))
    if (alert.kind === 'broken-ahead' && a !== 'later' && !watch) {
      // Watch the zone: from the bit to the bottom of the broken stretch it is in or heading for
      let base = nextBroken(ahead, s.depth)?.base ?? s.depth + 1
      if (s.ground === 'broken') { let d = Math.floor(s.depth); while (ahead.find(m => m.from === d)?.broken) d++; base = d }
      setWatch({ eventId: id, depth: s.depth, coreLoss: s.coreLoss, base })
    } else if (alert.kind === 'broken-ahead' && a !== 'later') copilot.update(id, { outcome: null })
    setOpen(null)
  }, [open, s, speed, say, watch, ahead])

  // Check broken-ground advice once the bit is through the zone: did it work?
  useEffect(() => {
    if (!watch || !s || s.depth < watch.base) return
    const L = Math.max(0.5, watch.base - watch.depth)
    const loss = s.coreLoss - watch.coreLoss
    const eased = s.settings.rpm <= 800
    const worked = loss < L * 0.2
    const sv = brokenSaving(s.baseRop, L, s.settings)
    const hours = Math.round(sv.hours * 10) / 10
    const kept = Math.max(0, sv.core - loss)
    copilot.update(watch.eventId, { outcome: worked ? 'worked' : 'failed', hoursSaved: worked ? hours : 0 })
    setResult({ good: worked, text: worked
      ? `It worked: through ${r1(L)} m of broken ground with steady torque. About ${r1(hours)} h saved and ${r1(kept)} m of core kept, against drilling it at normal settings.`
      : `Core lost in broken ground: ${r1(loss)} m. ${eased ? 'Settings were eased late.' : 'Settings were not eased.'} Copilot will warn earlier next time.` })
    say(worked ? { en: `Through the broken ground. The settings worked: about ${r1(hours)} hours saved. Back to normal settings.`, ar: `تجاوزنا الأرض المتكسرة. نجحت الإعدادات ووفّرنا حوالي ${r1(hours)} ساعة.` } : { en: 'Core was lost in that broken zone. I will warn earlier next time.', ar: 'فقدنا بعض اللب في هذه المنطقة. سأنبه أبكر في المرة القادمة.' })
    setS(x => x ? { ...x, settings: { ...NORMAL } } : x)
    if (lvl === 3) setAutoLog(l => [{ t: s.t, text: 'Copilot set 880 rpm · 22 kN · 46 L/min (out of broken ground)' }, ...l].slice(0, 8))
    setWatch(null)
  }, [s?.depth, watch, lvl, say, s])

  // Voice and typed questions
  const ask = useCallback((text: string) => {
    if (!text.trim() || !simCtx) return
    setSaid(x => [...x.slice(-14), { who: 'you', text }])
    const h = hear(text, simCtx)
    if (h.log) setEntries(e => [...e, { at: clock(simCtx.s.t), depth: Math.round(simCtx.s.depth * 10) / 10, ...h.log! }])
    if (/^\s*undo\b|تراجع/i.test(text)) { setS(x => x ? { ...x, settings: { ...NORMAL } } : x); say({ en: 'Back to your settings.', ar: 'عدنا إلى إعداداتك.' }); return }
    say(h.answer)
  }, [simCtx, say])

  const recog = useRef<any>(null)
  const listen = useCallback((on: boolean, continuous = false) => {
    const SR = typeof window !== 'undefined' ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null
    if (!SR) { setSaid(x => [...x, { who: 'copilot', text: 'Voice questions need Chrome or Edge. Type below instead.' }]); return }
    if (!on) { recog.current?.stop(); setListening(false); return }
    const r = new SR(); r.lang = lang === 'ar' ? 'ar-SA' : 'en-US'; r.interimResults = false; r.continuous = continuous
    r.onresult = (e: any) => {
      const t = Array.from(e.results).slice(e.resultIndex).map((x: any) => x[0].transcript).join(' ')
      if (continuous) { const m = t.toLowerCase().match(/(?:hey|hi|ok)?\s*(?:xplorix|explorix|explorex|explore x)\s*(.*)/); if (m && m[1]) ask(m[1]) } else ask(t)
    }
    r.onend = () => { if (continuous && wakeRef.current) { try { r.start() } catch { /* restarting */ } } else setListening(false) }
    recog.current = r; setListening(true)
    try { r.start() } catch { /* already listening */ }
  }, [lang, ask])
  const wakeRef = useRef(false)
  useEffect(() => { wakeRef.current = wake; if (wake) listen(true, true); else recog.current?.stop() }, [wake, listen])

  // The story: six steps, each moved on by what happens. Timers are kept in a
  // ref so the clock's ticks do not cancel them.
  const once = useCallback((key: string, ms: number, fn: () => void) => {
    if (timers.current[key]) return
    timers.current[key] = window.setTimeout(fn, ms)
  }, [])
  useEffect(() => () => { Object.values(timers.current).forEach(id => window.clearTimeout(id)) }, [])
  useEffect(() => {
    if (!story || !s) return
    if (story === 1 && s.t > 900) setStory(2)
    if (story === 2 && open?.alert.kind === 'broken-ahead') setStory(3)
    if (story === 3 && !watch && open?.alert.kind === 'broken-ahead' && !dismissed[open.alert.key]) { const a = open.alert, id = open.eventId; once(`act-${a.key}`, 4500, () => act(lvl === 2 ? 'applied' : 'done', a, id)) }
    if (story === 3 && result) once('to4', 5000, () => { setStory(4); ask('log a bit change') })
    if (story === 4) once('to5', 6500, () => { setStory(5); setLvl(3); setS(x => x ? { ...x, settings: { ...NORMAL } } : x); setEngineFault(true) })
    if (story === 5) { if (autoLog.some(x => /engine|coolant/i.test(x.text))) once('to6', 6000, () => { setEngineFault(false); setStory(6) }); once('to6b', 20000, () => { setEngineFault(false); setStory(6) }) }
  }, [story, s, open, dismissed, result, autoLog, act, ask, lvl, once, watch])

  if (!k.ready || !hole || !s || !simCtx) return <div style={{ padding: 40, color: C.muted, background: C.bg, minHeight: '60vh', borderRadius: 14 }}>Copilot is reading the record…</div>

  const nb = nextBroken(ahead, s.depth)
  const rec = top ? record(store.events, top.kind) : null
  const left = s.bitLife - s.bitUsed
  const finishH = hole.planned ? Math.max(0, hole.planned - s.depth) / (simCtx.normalRop || s.baseRop) : null
  const best = simCtx.bestCrew
  const vsNormal = s.rop / ((simCtx.normalRop || s.baseRop) * (s.ground === 'good' ? 1 : s.ground === 'hard' ? 0.7 : 0.57)) - 1
  const draftMetres = s.depth - startDepth.current
  const downMin = entries.filter(e => e.kind === 'downtime').reduce((a, e) => a + (e.minutes ?? 0), 0)

  return (
    <div style={{ background: C.bg, color: C.text, borderRadius: 16, padding: 'clamp(12px, 2vw, 22px)', display: 'grid', gap: 14, fontFamily: 'inherit' }} id="copilot-cockpit">
      <style>{`
        .cp-btn { font-family: inherit; cursor: pointer; border-radius: 10px; border: 1px solid ${C.line}; background: ${C.raised}; color: ${C.text}; padding: 0 14px; min-height: 44px; font-size: 14px; font-weight: 600; display: inline-flex; align-items: center; gap: 8px; }
        .cp-btn:hover { border-color: #3A4656; }
        .cp-btn:focus-visible { outline: 2px solid ${C.orange}; outline-offset: 2px; }
        .cp-seg button { font-family: inherit; cursor: pointer; border: none; background: transparent; color: ${C.muted}; padding: 0 12px; min-height: 36px; border-radius: 8px; font-size: 13px; font-weight: 600; }
        .cp-seg button[aria-pressed="true"] { background: ${C.orange}; color: #fff; }
        @keyframes cpPulse { 0% { box-shadow: 0 0 0 0 rgba(249,115,22,.55) } 70% { box-shadow: 0 0 0 14px rgba(249,115,22,0) } 100% { box-shadow: 0 0 0 0 rgba(249,115,22,0) } }
        .cp-live { animation: cpPulse 1.8s infinite; }
        @media (prefers-reduced-motion: reduce) { .cp-live { animation: none; } }
        @media (max-width: 1100px) { .cp-main { grid-template-columns: 1fr !important; } }
      `}</style>

      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="cp-live" style={{ width: 38, height: 38, borderRadius: 12, background: C.orange, display: 'grid', placeItems: 'center' }}><Sparkles size={20} color="#fff" /></span>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '.02em' }}>XPLORIX COPILOT</div>
            <div style={{ fontSize: 12.5, color: C.muted }}>{rig} · {hole.id} · {ground.replace(' Formation', '').toLowerCase()} ground · {clock(s.t)}</div>
          </div>
        </div>
        <select aria-label="Hole" value={hole.id} onChange={e => { setHoleId(e.target.value); setS(null) }} style={{ marginLeft: 8, minHeight: 40, background: C.raised, color: C.text, border: `1px solid ${C.line}`, borderRadius: 10, padding: '0 10px', fontSize: 13.5 }}>
          {candidates.map(h => <option key={h.id} value={h.id}>{h.id} · {h.rig ?? '—'} · {h.status}</option>)}
        </select>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="cp-seg" role="group" aria-label="Autopilot level" style={{ display: 'inline-flex', gap: 2, background: C.raised, border: `1px solid ${C.line}`, borderRadius: 10, padding: 3 }}>
            {([1, 2, 3] as Level[]).map(n => <button key={n} aria-pressed={lvl === n} onClick={() => setLvl(n)} title={['', 'Advise', 'Assist: apply to rig', 'Auto-adjust within limits'][n]}>L{n} {['', 'Advise', 'Assist', 'Auto'][n]}</button>)}
            <Link href="/admin/vision/autonomy" style={{ color: C.muted, fontSize: 13, fontWeight: 600, textDecoration: 'none', padding: '0 12px', display: 'inline-flex', alignItems: 'center' }}>L4 Fleet →</Link>
          </div>
          <div className="cp-seg" role="group" aria-label="Language" style={{ display: 'inline-flex', gap: 2, background: C.raised, border: `1px solid ${C.line}`, borderRadius: 10, padding: 3 }}>
            <button aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button>
            <button aria-pressed={lang === 'ar'} onClick={() => setLang('ar')}>عربي</button>
          </div>
          <button className="cp-btn" onClick={() => setVoice(v => !v)} aria-label={voice ? 'Mute Copilot' : 'Unmute Copilot'}>{voice ? <Volume2 size={17} /> : <VolumeX size={17} />}</button>
          <button className="cp-btn" onClick={() => setRunning(r => !r)}>{running ? <><Pause size={16} /> Pause</> : <><Play size={16} /> Run</>}</button>
          <select aria-label="Speed" value={speed} onChange={e => setSpeed(Number(e.target.value))} style={{ minHeight: 44, background: C.raised, color: C.text, border: `1px solid ${C.line}`, borderRadius: 10, padding: '0 8px', fontSize: 13 }}>
            {[1, 30, 120, 300, 900].map(v => <option key={v} value={v}>×{v}</option>)}
          </select>
          <button className="cp-btn" style={{ background: C.orange, borderColor: C.orange }} onClick={playStory}><Clapperboard size={16} /> Play story</button>
          <button className="cp-btn" aria-label="Full screen" onClick={() => document.getElementById('copilot-cockpit')?.requestFullscreen?.()}><Maximize2 size={16} /></button>
        </div>
      </div>

      <div role="note" style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 12px', borderRadius: 10, border: `1px dashed ${C.line}`, fontSize: 12.5, color: C.muted }}>
        <Radio size={14} color={C.blue} /> <span><b style={{ color: C.text }}>Simulated rig feed.</b> The rock ahead comes from the real cored holes around {hole.id}; speeds and crews from the real shift logs. Copilot runs on rules today; the launch version adds trained models.</span>
      </div>

      {story > 0 && <StoryBar step={story} onClose={() => setStory(0)} />}

      <div className="cp-main" style={{ display: 'grid', gridTemplateColumns: '230px minmax(0, 1fr) 340px', gap: 14, alignItems: 'start' }}>
        {/* LIVE HOLE + RADAR */}
        <Panel title="Live hole" sub="Below the bit: predicted, brighter = surer">
          <HoleStrip s={s} ahead={ahead} planned={hole.planned} gpsStop={gps?.stopAt ?? null} lastSurvey={hole.lastSurvey} />
        </Panel>

        <div style={{ display: 'grid', gap: 14, minWidth: 0 }}>
          {/* NOW */}
          <Panel title="Now" sub={s.ground === 'broken' ? 'In broken ground' : s.ground === 'hard' ? 'Harder ground' : 'Good ground'}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))', gap: 10 }}>
              <Big label="Penetration" v={s.rop.toFixed(2)} u="m/h" tone={vsNormal < -0.15 ? C.amber : C.green} note={`${vsNormal >= 0 ? '+' : '−'}${r0(Math.abs(vsNormal) * 100)}% vs normal`} />
              <Big label="Rotation" v={r0(s.rpm)} u="rpm" note={`set ${s.settings.rpm}`} />
              <Big label="Bit load" v={r1(s.wob)} u="kN" note={`set ${s.settings.wob}`} />
              <Big label="Torque" v={r0(s.torque)} u="N·m" tone={s.torque > 1100 ? C.red : s.torque > 900 ? C.amber : C.green} note={s.torque > 1100 ? 'grabbing' : 'steady'} />
              <Big label="Water" v={r0(s.flow)} u="L/min" note={`${r1(s.pressure)} bar`} />
              <Big label="Engine" v={r0(s.engine)} u="°C" tone={s.engine > 93 ? C.red : s.engine > 90 ? C.amber : C.green} note={s.engine > 93 ? 'hot' : 'normal'} />
            </div>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 12, fontSize: 13, color: C.muted }}>
              <span>Bit at <b style={{ color: C.text, fontFamily: mono, fontSize: 15 }}>{r1(s.depth)} m</b></span>
              {best && <span>Best crew in this ground: <b style={{ color: C.text }}>{best.name}</b></span>}
              <span>Core at risk: <b style={{ color: s.coreLoss > 0.3 ? C.red : C.text }}>{r1(s.coreLoss)} m</b></span>
            </div>
          </Panel>

          {/* ADVICE */}
          {top ? (
            <div style={{ borderRadius: 14, border: `1px solid ${top.level === 'act' ? C.red : top.level === 'watch' ? C.amber : C.line}`, background: `linear-gradient(180deg, ${top.level === 'act' ? 'rgba(239,68,68,.12)' : 'rgba(245,158,11,.08)'}, ${C.panel})`, padding: 18, display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.1em', color: top.level === 'act' ? C.red : C.amber }}>{top.level === 'act' ? 'ACT NOW' : top.level === 'watch' ? 'WATCH' : 'INFO'}</span>
                {rec && rec.of > 0 && <span style={{ fontSize: 12, color: C.muted, border: `1px solid ${C.line}`, borderRadius: 999, padding: '2px 10px' }}>This advice worked {rec.worked} of {rec.of} times</span>}
                {lvl === 3 && top.advice?.settings && <span style={{ fontSize: 12, color: C.violet, border: `1px solid ${C.violet}`, borderRadius: 999, padding: '2px 10px' }}>Applied by Copilot (L3)</span>}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.25 }}>{top.title}</div>
              <div style={{ fontSize: 15, color: C.text, lineHeight: 1.5, direction: lang === 'ar' ? 'rtl' : 'ltr' }}>“{top.say[lang]}”</div>
              {top.advice && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: mono, fontSize: 14, color: C.orange, background: 'rgba(249,115,22,.1)', border: `1px solid rgba(249,115,22,.35)`, borderRadius: 10, padding: '8px 12px', width: 'fit-content' }}><Gauge size={16} /> {top.advice.text}</div>}
              <div style={{ display: 'grid', gap: 4, fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em', color: C.faint }}>WHY</span>
                {top.why.map((w, i) => <span key={i}>• {w}</span>)}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {lvl === 2 && top.advice?.settings && <button className="cp-btn" style={{ background: C.orange, borderColor: C.orange, minHeight: 52, fontSize: 16 }} onClick={() => act('applied')}>Apply to rig</button>}
                {lvl === 3 && top.advice?.settings
                  ? <button className="cp-btn" style={{ minHeight: 52 }} onClick={() => { setS(x => x ? { ...x, settings: { ...NORMAL } } : x); say({ en: 'Back to your settings.', ar: 'عدنا إلى إعداداتك.' }) }}><Undo2 size={16} /> Undo</button>
                  : <button className="cp-btn" style={{ background: lvl === 2 ? C.raised : C.green, borderColor: lvl === 2 ? C.line : C.green, color: lvl === 2 ? C.text : '#04130A', minHeight: 52, fontSize: 16, padding: '0 22px' }} onClick={() => act('done')}>Done</button>}
                <button className="cp-btn" style={{ minHeight: 52 }} onClick={() => act('later')}>Not now</button>
              </div>
            </div>
          ) : (
            <div style={{ borderRadius: 14, border: `1px solid ${C.line}`, background: C.panel, padding: 18, display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.1em', color: watch ? C.violet : C.green }}>{watch ? 'WATCHING' : 'ALL GOOD'}</span>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{watch ? `Through broken ground to ${r0(watch.base)} m on eased settings. Watching torque and core: ${r1(s.coreLoss - watch.coreLoss)} m at risk so far.` : nb && nb.inMetres > 0.2 ? `Next: broken ground in ${r1(nb.inMetres)} m. I'll tell you when to ease off.` : 'Good rock ahead. Keep these settings.'}</div>
              {result && <div style={{ fontSize: 14, color: result.good ? C.green : C.red, marginTop: 6 }}>{result.good ? '✓ ' : '✗ '}{result.text}</div>}
            </div>
          )}

          {/* COUNTDOWNS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <Count label="Bit life" v={`${r1(Math.max(0, left))} m`} tone={left < 5 ? C.red : left < 15 ? C.amber : C.green} pct={Math.max(0, left) / s.bitLife} />
            <Count label="Engine cut-out" v={s.engine > 93 ? `${r0((105 - s.engine) / 3.6)} min` : 'Not near'} tone={s.engine > 93 ? C.red : C.green} />
            <Count label="Next survey" v={hole.lastSurvey != null ? `at ${r0(hole.lastSurvey + 50)} m` : 'Take one'} tone={hole.lastSurvey != null && s.depth - hole.lastSurvey > 45 ? C.amber : C.green} />
            <Count label="To planned depth" v={hole.planned ? `${r1(Math.max(0, hole.planned - s.depth))} m` : 'Not set'} note={finishH != null ? `≈ ${r1(finishH)} drilling h` : undefined} />
            <Count label="Geology GPS" v={gps?.stopAt ? `stop at ${r0(gps.stopAt)} m` : 'Keep drilling'} tone={gps?.stopAt ? C.violet : C.green} note={gps?.stopAt ? `saves ${r0(gps.saving)} m` : undefined} />
          </div>

          {autoLog.length > 0 && (
            <Panel title="Autopilot" sub="What Copilot changed on the rig">
              <div style={{ display: 'grid', gap: 4, fontSize: 13, color: C.muted, fontFamily: mono }}>
                {autoLog.map((l, i) => <span key={i}>{clock(l.t)} · {l.text}</span>)}
              </div>
            </Panel>
          )}
        </div>

        {/* VOICE + SHIFT LOG */}
        <div style={{ display: 'grid', gap: 14 }}>
          <Panel title="Ask Copilot" sub={lang === 'ar' ? 'بالعربي أو بالإنجليزي' : 'Hold the button and speak'}>
            <div ref={el => { if (el) el.scrollTop = el.scrollHeight }} style={{ display: 'grid', gap: 8, maxHeight: 260, overflowY: 'auto', paddingRight: 4 }} aria-live="polite">
              {said.slice(-8).map((m, i) => (
                <div key={i} style={{ justifySelf: m.who === 'you' ? 'end' : 'start', maxWidth: '92%', background: m.who === 'you' ? '#243041' : 'rgba(249,115,22,.1)', border: `1px solid ${m.who === 'you' ? C.line : 'rgba(249,115,22,.3)'}`, borderRadius: 12, padding: '8px 11px', fontSize: 13.5, lineHeight: 1.45, direction: /[؀-ۿ]/.test(m.text) ? 'rtl' : 'ltr' }}>{m.text}</div>
              ))}
            </div>
            <button className="cp-btn" aria-pressed={listening}
              onPointerDown={() => listen(true)} onPointerUp={() => listen(false)} onPointerLeave={() => listening && !wake && listen(false)}
              style={{ width: '100%', justifyContent: 'center', minHeight: 60, marginTop: 10, fontSize: 16, background: listening ? C.red : C.raised, borderColor: listening ? C.red : C.line }}>
              {listening ? <><MicOff size={20} /> Listening…</> : <><Mic size={20} /> Hold to ask</>}
            </button>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: C.muted, marginTop: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={wake} onChange={e => setWake(e.target.checked)} /> Listen for “Hey XPLORIX” (hands-free)
            </label>
            <form onSubmit={e => { e.preventDefault(); ask(typed); setTyped('') }} style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input value={typed} onChange={e => setTyped(e.target.value)} placeholder={lang === 'ar' ? 'اكتب سؤالك' : 'Or type: "what is the ground ahead?"'} aria-label="Ask Copilot"
                style={{ flex: 1, minHeight: 42, background: C.raised, color: C.text, border: `1px solid ${C.line}`, borderRadius: 10, padding: '0 10px', fontSize: 13.5, direction: lang === 'ar' ? 'rtl' : 'ltr' }} />
              <button className="cp-btn" type="submit" aria-label="Send"><Send size={16} /></button>
            </form>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {(lang === 'ar' ? ['ما هي الأرض القادمة؟', 'كم بقي من الرأس؟', 'متى ننتهي؟', 'سجّل تغيير الرأس'] : ['Ground ahead?', 'Best settings?', 'Bit life?', 'When do we finish?', 'Log a bit change', 'We stopped 40 minutes for water']).map(q => (
                <button key={q} className="cp-btn" style={{ minHeight: 34, fontSize: 12, padding: '0 10px', fontWeight: 500 }} onClick={() => ask(q)}>{q}</button>
              ))}
            </div>
          </Panel>

          <Panel title="Shift log, writing itself" sub="From the sensors and what you said">
            <div style={{ display: 'grid', gap: 5, fontSize: 13, color: C.muted }}>
              <Row k="Metres" v={`${r1(draftMetres)} m (${r1(startDepth.current)} → ${r1(s.depth)} m)`} />
              <Row k="Drilling" v={`${r1(s.drillingSecs / 3600)} h`} />
              <Row k="Stopped" v={downMin ? `${downMin} min` : '—'} />
              <Row k="Core at risk" v={`${r1(s.coreLoss)} m`} />
              <Row k="Bit" v={`${r0(s.bitUsed)} of ${r0(s.bitLife)} m`} />
              {entries.length > 0 && <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 6, marginTop: 4, display: 'grid', gap: 3 }}>
                {entries.map((e, i) => <span key={i} style={{ color: C.text }}><span style={{ fontFamily: mono, color: C.faint }}>{e.at}</span> · {e.text}</span>)}
              </div>}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <button className="cp-btn" onClick={() => {
                copilot.saveDraft({ id: `draft_${hole.id}_${Date.now().toString(36)}`, rig, hole: hole.id, date: TODAY, shift: 'Day', driller: 'Copilot draft', startDepth: startDepth.current, endDepth: s.depth, drillHours: s.drillingSecs / 3600, coreLoss: s.coreLoss, entries, status: 'sent' })
                say({ en: 'Shift log sent to the supervisor to approve.', ar: 'تم إرسال سجل الوردية إلى المشرف للموافقة.' })
              }}><Send size={15} /> Send to supervisor</button>
              <button className="cp-btn" onClick={() => say({
                en: `Handover. ${hole.id} at ${r0(s.depth)} metres. ${nb ? `Broken ground from ${r0(nb.top)} metres. ` : ''}Bit has ${r0(Math.max(0, left))} metres left. ${entries.length ? `${entries.length} items logged this shift.` : ''}`,
                ar: `التسليم. ${hole.id} عند ${r0(s.depth)} متر. بقي ${r0(Math.max(0, left))} متر من عمر الرأس.`,
              })}><Volume2 size={15} /> Spoken handover</button>
            </div>
          </Panel>

          <Link href="/admin/vision/command" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '12px 14px', borderRadius: 12, border: `1px solid ${C.line}`, background: C.panel, color: C.text, textDecoration: 'none', fontSize: 13.5, fontWeight: 600 }}>
            Manager command centre <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </div>
  )
}

/* ── Pieces ─────────────────────────────────────────────────────────────── */

function Panel({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.1em', color: C.muted }}>{title.toUpperCase()}</span>
        {sub && <span style={{ fontSize: 12, color: C.faint }}>{sub}</span>}
      </div>
      {children}
    </section>
  )
}
function Big({ label, v, u, note, tone }: { label: string; v: string; u: string; note?: string; tone?: string }) {
  return (
    <div style={{ background: C.raised, borderRadius: 12, padding: '10px 12px', borderLeft: `3px solid ${tone ?? C.line}` }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: C.faint }}>{label.toUpperCase()}</div>
      <div style={{ fontFamily: mono, fontSize: 26, fontWeight: 700, marginTop: 2 }}>{v}<span style={{ fontSize: 12, color: C.faint, marginLeft: 4 }}>{u}</span></div>
      {note && <div style={{ fontSize: 12, color: C.muted }}>{note}</div>}
    </div>
  )
}
function Count({ label, v, note, tone, pct }: { label: string; v: string; note?: string; tone?: string; pct?: number }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: '10px 12px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: C.faint }}>⏱ {label.toUpperCase()}</div>
      <div style={{ fontSize: 17, fontWeight: 700, marginTop: 3, color: tone ?? C.text }}>{v}</div>
      {note && <div style={{ fontSize: 12, color: C.muted }}>{note}</div>}
      {pct != null && <div style={{ height: 5, background: C.raised, borderRadius: 3, marginTop: 6, overflow: 'hidden' }}><div style={{ width: `${Math.max(0, Math.min(1, pct)) * 100}%`, height: '100%', background: tone ?? C.green }} /></div>}
    </div>
  )
}
function Row({ k, v }: { k: string; v: string }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><span>{k}</span><b style={{ color: C.text, fontWeight: 600, fontFamily: mono, fontSize: 12.5 }}>{v}</b></div>
}

/* The hole around the bit: 8 m drilled above, 14 m predicted below. */
function HoleStrip({ s, ahead, planned, gpsStop, lastSurvey }: { s: RigState; ahead: AheadMetre[]; planned: number | null; gpsStop: number | null; lastSurvey: number | null }) {
  const above = 8, below = 14
  const top = Math.max(0, s.depth - above), bot = s.depth + below
  const H = 520, W = 200, X0 = 70, BW = 46
  const Y = (d: number) => ((d - top) / (bot - top)) * H
  const ms = ahead.filter(m => m.to > top && m.from < bot)
  const nb = nextBroken(ahead, s.depth)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label={`Hole from ${r0(top)} to ${r0(bot)} m, bit at ${r1(s.depth)} m`}>
      <defs>
        <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="rgba(239,68,68,.25)" /><line x1="0" y1="0" x2="0" y2="8" stroke="#EF4444" strokeWidth="3" /></pattern>
      </defs>
      {ms.map(m => {
        const y0 = Y(Math.max(top, m.from)), y1 = Y(Math.min(bot, m.to))
        const drilled = m.to <= s.depth
        const fill = !m.from_.length ? '#2A3340' : m.broken ? 'url(#hatch)' : m.ff > 5 ? '#6B5A3A' : '#3D5A4A'
        return <rect key={m.from} x={X0} y={y0} width={BW} height={Math.max(0.5, y1 - y0)} fill={fill} opacity={drilled ? 0.55 : 0.35 + 0.65 * m.sure} />
      })}
      <rect x={X0} y={Y(s.depth)} width={BW} height={H - Y(s.depth)} fill="none" stroke="#3A4656" strokeDasharray="4 4" />
      <rect x={X0} y={0} width={BW} height={Y(s.depth)} fill="none" stroke="#56657A" />
      {Array.from({ length: Math.floor(bot) - Math.ceil(top) + 1 }, (_, i) => Math.ceil(top) + i).filter(d => d % 2 === 0).map(d => (
        <g key={d}><line x1={X0 - 6} x2={X0} y1={Y(d)} y2={Y(d)} stroke="#3A4656" /><text x={X0 - 9} y={Y(d) + 4} textAnchor="end" style={{ fontFamily: mono, fontSize: 11, fill: C.faint }}>{d}</text></g>
      ))}
      {nb && nb.top < bot && <g><line x1={X0 + BW + 4} x2={X0 + BW + 4} y1={Y(nb.top)} y2={Y(Math.min(bot, nb.base))} stroke={C.red} strokeWidth={3} /><text x={X0 + BW + 10} y={Y(nb.top) + 12} style={{ fontSize: 11, fill: C.red, fontWeight: 700 }}>broken</text><text x={X0 + BW + 10} y={Y(nb.top) + 25} style={{ fontSize: 10.5, fill: C.muted }}>{r0(nb.sure * 100)}% sure</text></g>}
      {gpsStop != null && gpsStop > top && gpsStop < bot && <g><line x1={X0 - 8} x2={X0 + BW + 8} y1={Y(gpsStop)} y2={Y(gpsStop)} stroke={C.violet} strokeWidth={2} /><text x={X0 + BW + 10} y={Y(gpsStop) + 4} style={{ fontSize: 10.5, fill: C.violet, fontWeight: 700 }}>GPS stop</text></g>}
      {planned != null && planned > top && planned < bot && <g><line x1={X0 - 8} x2={X0 + BW + 8} y1={Y(planned)} y2={Y(planned)} stroke={C.muted} strokeDasharray="5 3" /><text x={X0 + BW + 10} y={Y(planned) + 4} style={{ fontSize: 10.5, fill: C.muted }}>planned</text></g>}
      {lastSurvey != null && lastSurvey + 50 > top && lastSurvey + 50 < bot && <g><line x1={X0 - 8} x2={X0} y1={Y(lastSurvey + 50)} y2={Y(lastSurvey + 50)} stroke={C.blue} strokeWidth={2} /><text x={4} y={Y(lastSurvey + 50) - 4} style={{ fontSize: 10, fill: C.blue }}>survey</text></g>}
      {/* the bit */}
      <g transform={`translate(${X0 + BW / 2}, ${Y(s.depth)})`}>
        <circle r={13} fill="rgba(249,115,22,.25)" className="cp-live" />
        <path d="M-12,-6 L12,-6 L0,10 Z" fill={C.orange} />
      </g>
      <text x={X0 + BW + 10} y={Y(s.depth) + 4} style={{ fontFamily: mono, fontSize: 12.5, fill: C.text, fontWeight: 700 }}>{r1(s.depth)} m</text>

    </svg>
  )
}

const STEPS = [
  '',
  'Drilling normally. Copilot compares speed with this rig\'s own normal and the best crew in the same ground.',
  'Ground-ahead radar: the holes around show broken rock 3 m below the bit. Copilot says what to set before the bit gets there.',
  'The crew eases off. Copilot watches the torque and the core through the broken zone, then checks whether its advice worked.',
  'Voice: the driller says "log a bit change". Copilot writes it into the shift log; nobody types.',
  'Autopilot level 3: the engine starts running hot. Copilot eases the rig by itself, within safe limits, and says so.',
  'Every piece of advice, what the crew did and what happened is now in the manager\'s command centre and teaches the fleet brain.',
]
function StoryBar({ step, onClose }: { step: number; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 14px', borderRadius: 12, background: 'linear-gradient(90deg, rgba(249,115,22,.18), rgba(139,92,246,.14))', border: `1px solid rgba(249,115,22,.45)` }}>
      <span style={{ fontFamily: mono, fontWeight: 800, color: C.orange, fontSize: 13, whiteSpace: 'nowrap' }}>STORY {step}/6</span>
      <span style={{ fontSize: 14, lineHeight: 1.45, flex: 1 }}>{STEPS[step]}</span>
      {step === 6 && <><Link href="/admin/vision/command" style={{ color: C.orange, fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>Command centre →</Link><Link href="/admin/vision/gps" style={{ color: C.violet, fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>Geology GPS →</Link></>}
      <button className="cp-btn" style={{ minHeight: 34 }} onClick={onClose}>Close</button>
    </div>
  )
}
