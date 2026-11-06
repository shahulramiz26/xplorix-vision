/* ==========================================================================
 * COPILOT'S VOICE
 *
 * One thing at a time. Copilot never talks over itself: each message waits
 * for the one before to finish, with a short pause between. The most
 * urgent goes first; an answer to the crew's own question goes straight
 * away; old messages that are no longer worth saying are dropped. What it
 * is saying is shown on screen, so nobody has to catch every word.
 *
 * If this computer has no voice for the chosen language (common for
 * Arabic, Hindi and Urdu on Windows), Copilot speaks the English line and
 * says so on screen, instead of going silent.
 *
 * Voice modes: off, urgent only (act-now advice and answers), or all.
 * ========================================================================== */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Lang } from './copilot'

export type VoiceMode = 'off' | 'urgent' | 'all'
export type Prio = 0 | 1 | 2 | 3            // 0 answer to a question · 1 act now · 2 result · 3 everything else
export interface Line { id: string; text: string; rig?: string; key?: string; prio: Prio; at: number }
export type VoiceStatus = 'ok' | 'no-sound' | 'blocked' | 'unknown'

const SPEECH: Record<Lang, string> = { en: 'en-GB', ar: 'ar-SA', hi: 'hi-IN', ur: 'ur-PK' }

/* Codes and units read in the language being spoken. English letters inside
   an Arabic, Hindi or Urdu sentence make the voice stop and switch, which
   sounds like a break, so they are turned into that language's words. */
const WORDS: Record<Lang, { rig: string; hole: string; letters: (a: string) => string; m: string; kN: string; rpm: string; lmin: string; deg: string; bar: string; sar: string; h: string; pct: string }> = {
  en: { rig: 'Rig', hole: 'hole', letters: a => a.split('').join(' '), m: 'metres', kN: 'kilonewtons', rpm: 'R P M', lmin: 'litres a minute', deg: 'degrees', bar: 'bar', sar: 'riyals', h: 'hours', pct: 'percent' },
  ar: { rig: 'الحفارة', hole: 'البئر', letters: a => a.split('').map(c => ({ C: 'سي', P: 'بي', Q: 'كيو', R: 'آر', D: 'دي', H: 'إتش' } as Record<string, string>)[c] ?? c).join(' '), m: 'متر', kN: 'كيلو نيوتن', rpm: 'دورة في الدقيقة', lmin: 'لتر في الدقيقة', deg: 'درجة', bar: 'بار', sar: 'ريال', h: 'ساعة', pct: 'بالمئة' },
  hi: { rig: 'रिग', hole: 'होल', letters: a => a.split('').map(c => ({ C: 'सी', P: 'पी', Q: 'क्यू', R: 'आर', D: 'डी', H: 'एच' } as Record<string, string>)[c] ?? c).join(' '), m: 'मीटर', kN: 'किलो न्यूटन', rpm: 'आर पी एम', lmin: 'लीटर प्रति मिनट', deg: 'डिग्री', bar: 'बार', sar: 'रियाल', h: 'घंटे', pct: 'प्रतिशत' },
  ur: { rig: 'رگ', hole: 'ہول', letters: a => a.split('').map(c => ({ C: 'سی', P: 'پی', Q: 'کیو', R: 'آر', D: 'ڈی', H: 'ایچ' } as Record<string, string>)[c] ?? c).join(' '), m: 'میٹر', kN: 'کلو نیوٹن', rpm: 'آر پی ایم', lmin: 'لیٹر فی منٹ', deg: 'ڈگری', bar: 'بار', sar: 'ریال', h: 'گھنٹے', pct: 'فیصد' },
}
export function speakable(text: string, lang: Lang = 'en') {
  const w = WORDS[lang]
  return text
    .replace(/\bRIG-0*(\d+)\.?/g, `${w.rig} $1،`.replace('،', lang === 'en' || lang === 'hi' ? ',' : '،'))
    .replace(/\bDH-0*(\d+)/g, `${w.hole} $1`)
    .replace(/\b([A-Z]{2})-0*(\d+)\.?/g, (_, a: string, n: string) => `${w.letters(a)} ${n}${lang === 'ar' || lang === 'ur' ? '،' : ','}`)
    .replace(/SAR\s?([\d,.]+)/g, `$1 ${w.sar}`)
    .replace(/(\d)\s?m\b/g, `$1 ${w.m}`)
    .replace(/(\d)\s?h\b/g, `$1 ${w.h}`)
    .replace(/\bkN\b/g, w.kN).replace(/\brpm\b/g, w.rpm).replace(/L\/min/g, w.lmin).replace(/\s?°C/g, ` ${w.deg}`).replace(/\bbar\b/g, w.bar).replace(/(\d)\s?%/g, `$1 ${w.pct}`)
    .replace(/\s·\s/g, lang === 'ar' || lang === 'ur' ? '، ' : ', ')
    .replace(/[,،]\s*([:.])/g, '$1').replace(/\s{2,}/g, ' ').trim()
}

function voiceFor(lang: string) {
  try {
    const vs = window.speechSynthesis.getVoices()
    return vs.find(v => v.lang.replace('_', '-').toLowerCase() === lang.toLowerCase())
      ?? vs.find(v => v.lang.replace('_', '-').toLowerCase().startsWith(lang.slice(0, 2)))
  } catch { return undefined }
}

export function useVoice(lang: Lang, mode: VoiceMode) {
  const [now, setNow] = useState<Line | null>(null)
  const [queue, setQueue] = useState<Line[]>([])
  const [voicesReady, setVoicesReady] = useState(0)
  const [status, setStatus] = useState<VoiceStatus>('unknown')
  const busy = useRef(false)
  const q = useRef<Line[]>([])
  const timer = useRef<number | null>(null)
  const keep = useRef<number | null>(null)
  const ok = typeof window !== 'undefined' && 'speechSynthesis' in window

  // Chrome loads its voice list late: listen for it
  useEffect(() => {
    if (!ok) { setStatus('no-sound'); return }
    const load = () => setVoicesReady(window.speechSynthesis.getVoices().length)
    load()
    window.speechSynthesis.addEventListener?.('voiceschanged', load)
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', load)
  }, [ok])

  /** Has this computer got a voice for the chosen language? */
  const hasVoice = useCallback((l: Lang) => ok && (voicesReady === 0 || !!voiceFor(SPEECH[l])), [ok, voicesReady])
  const speakIn: Lang = hasVoice(lang) ? lang : 'en'

  const next = useCallback(() => {
    if (busy.current) return
    q.current = q.current.filter(l => l.prio === 0 || Date.now() - l.at < 40000)
    const l = q.current.sort((a, b) => a.prio - b.prio || a.at - b.at).shift()
    setQueue([...q.current])
    if (!l) { setNow(null); return }
    busy.current = true
    setNow(l)
    const done = () => {
      if (keep.current) { window.clearInterval(keep.current); keep.current = null }
      if (!busy.current) return
      busy.current = false
      timer.current = window.setTimeout(next, 900)
    }
    if (!ok) { timer.current = window.setTimeout(done, Math.min(6000, 1500 + l.text.length * 45)); return }
    try {
      const synth = window.speechSynthesis
      synth.cancel()                                    // clears Chrome's stuck queue
      const u = new SpeechSynthesisUtterance(speakable(l.text, speakIn))
      u.lang = SPEECH[speakIn]; u.rate = speakIn === 'en' ? 1.0 : 0.95
      const v = voiceFor(SPEECH[speakIn]); if (v) u.voice = v
      u.onstart = () => setStatus('ok')
      u.onend = done
      u.onerror = (e: SpeechSynthesisErrorEvent) => { if (e.error === 'not-allowed') setStatus('blocked'); done() }
      synth.speak(u)
      // No pause/resume nudging: on most voices it is heard as a break in the middle of a sentence
      timer.current = window.setTimeout(() => { if (busy.current) { synth.cancel(); done() } }, Math.min(25000, 3000 + l.text.length * 100))
    } catch { done() }
  }, [ok, speakIn])

  const say = useCallback((text: string, prio: Prio, extra: { rig?: string; key?: string; force?: boolean } = {}) => {
    if (mode === 'off' && !extra.force) return
    if (mode === 'urgent' && prio > 1 && !extra.force) return
    if (q.current.some(l => l.text === text) || now?.text === text) return
    const { force: _f, ...rest } = extra
    const line: Line = { id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, text, prio, at: Date.now(), ...rest }
    if (prio === 0) {
      q.current = [line, ...q.current.filter(l => l.prio !== 0)]
      if (busy.current) {
        if (ok) window.speechSynthesis.cancel()
        busy.current = false
        if (timer.current) window.clearTimeout(timer.current)
        if (keep.current) { window.clearInterval(keep.current); keep.current = null }
      }
    } else {
      q.current = [...q.current, line].sort((a, b) => a.prio - b.prio || a.at - b.at).slice(0, 4)
    }
    setQueue([...q.current])
    next()
  }, [mode, next, now, ok])

  const skip = useCallback(() => {
    if (ok) window.speechSynthesis.cancel()
    busy.current = false
    if (timer.current) window.clearTimeout(timer.current)
    if (keep.current) { window.clearInterval(keep.current); keep.current = null }
    next()
  }, [next, ok])
  const clear = useCallback(() => { q.current = []; setQueue([]); skip() }, [skip])

  useEffect(() => { if (mode === 'off') clear() }, [mode, clear])
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); if (keep.current) window.clearInterval(keep.current); if (ok) window.speechSynthesis.cancel() }, [ok])
  return { say, now, waiting: queue.length, skip, clear, hasVoice, speakIn, status, supported: ok }
}
