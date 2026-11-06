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

/* Rig codes read the way people say them: "RIG-002" → "Rig 2", "CP-01" → "C P 1". */
export function speakable(text: string) {
  return text
    .replace(/\bRIG-0*(\d+)/g, 'Rig $1')
    .replace(/\bDH-0*(\d+)/g, 'hole $1')
    .replace(/\b([A-Z]{2})-0*(\d+)/g, (_, a: string, n: string) => `${a.split('').join(' ')} ${n}`)
    .replace(/\bkN\b/g, 'kilonewtons').replace(/\brpm\b/g, 'R P M').replace(/L\/min/g, 'litres a minute').replace(/°C/g, ' degrees')
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
      const u = new SpeechSynthesisUtterance(speakable(l.text))
      u.lang = SPEECH[speakIn]; u.rate = 0.95
      const v = voiceFor(SPEECH[speakIn]); if (v) u.voice = v
      u.onstart = () => setStatus('ok')
      u.onend = done
      u.onerror = (e: SpeechSynthesisErrorEvent) => { if (e.error === 'not-allowed') setStatus('blocked'); done() }
      synth.speak(u)
      synth.resume()
      // Chrome stops long speech after ~15 s unless nudged
      keep.current = window.setInterval(() => { try { if (synth.speaking) { synth.pause(); synth.resume() } } catch { /* */ } }, 10000)
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
