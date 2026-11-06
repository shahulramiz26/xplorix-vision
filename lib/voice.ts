/* ==========================================================================
 * COPILOT'S VOICE
 *
 * One thing at a time. Copilot never talks over itself: each message waits
 * for the one before to finish, with a short pause between. The most
 * urgent goes first; an answer to the crew's own question goes straight
 * away; old messages that are no longer worth saying are dropped. What it
 * is saying is shown on screen, so nobody has to catch every word.
 *
 * Voice modes: off, urgent only (act-now advice and answers), or all.
 * ========================================================================== */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Lang } from './copilot'

export type VoiceMode = 'off' | 'urgent' | 'all'
export type Prio = 0 | 1 | 2 | 3            // 0 answer to a question · 1 act now · 2 result · 3 everything else
export interface Line { id: string; text: string; rig?: string; key?: string; prio: Prio; at: number }

const SPEECH: Record<Lang, string> = { en: 'en-GB', ar: 'ar-SA', hi: 'hi-IN', ur: 'ur-PK' }

/* Rig codes read the way people say them: "RIG-002" → "Rig 2", "CP-01" → "C P 1". */
export function speakable(text: string) {
  return text
    .replace(/\bRIG-0*(\d+)/g, 'Rig $1')
    .replace(/\bDH-0*(\d+)/g, 'hole $1')
    .replace(/\b([A-Z]{2})-0*(\d+)/g, (_, a: string, n: string) => `${a.split('').join(' ')} ${n}`)
    .replace(/\bkN\b/g, 'kilonewtons').replace(/\brpm\b/g, 'R P M').replace(/L\/min/g, 'litres a minute').replace(/°C/g, ' degrees')
}

export function useVoice(lang: Lang, mode: VoiceMode) {
  const [now, setNow] = useState<Line | null>(null)
  const [queue, setQueue] = useState<Line[]>([])
  const busy = useRef(false)
  const q = useRef<Line[]>([])
  const timer = useRef<number | null>(null)
  const ok = typeof window !== 'undefined' && 'speechSynthesis' in window

  const next = useCallback(() => {
    if (busy.current) return
    // Drop anything older than 40 s that is not an answer: it is stale now
    q.current = q.current.filter(l => l.prio === 0 || Date.now() - l.at < 40000)
    const l = q.current.sort((a, b) => a.prio - b.prio || a.at - b.at).shift()
    setQueue([...q.current])
    if (!l) { setNow(null); return }
    busy.current = true
    setNow(l)
    const done = () => {
      busy.current = false
      timer.current = window.setTimeout(next, 900)          // a breath between messages
    }
    if (!ok) { timer.current = window.setTimeout(done, Math.min(6000, 1500 + l.text.length * 45)); return }
    try {
      const u = new SpeechSynthesisUtterance(speakable(l.text))
      u.lang = SPEECH[lang]; u.rate = 0.98
      const v = window.speechSynthesis.getVoices().find(v => v.lang.replace('_', '-').startsWith(SPEECH[lang].slice(0, 2)))
      if (v) u.voice = v
      u.onend = done; u.onerror = done
      window.speechSynthesis.speak(u)
      // Some browsers never fire onend: move on anyway
      timer.current = window.setTimeout(() => { if (busy.current) { window.speechSynthesis.cancel(); done() } }, Math.min(20000, 3000 + l.text.length * 90))
    } catch { done() }
  }, [lang, ok])

  const say = useCallback((text: string, prio: Prio, extra: { rig?: string; key?: string } = {}) => {
    if (mode === 'off') return
    if (mode === 'urgent' && prio > 1) return
    if (q.current.some(l => l.text === text) || now?.text === text) return
    const line: Line = { id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, text, prio, at: Date.now(), ...extra }
    if (prio === 0) {
      // The crew asked: answer now, ahead of everything
      q.current = [line, ...q.current.filter(l => l.prio !== 0)]
      if (busy.current && ok) { window.speechSynthesis.cancel() }
      if (busy.current) { busy.current = false; if (timer.current) window.clearTimeout(timer.current) }
    } else {
      q.current = [...q.current, line].sort((a, b) => a.prio - b.prio || a.at - b.at).slice(0, 4)   // never more than 4 waiting
    }
    setQueue([...q.current])
    next()
  }, [mode, next, now, ok])

  const skip = useCallback(() => {
    if (ok) window.speechSynthesis.cancel()
    busy.current = false
    if (timer.current) window.clearTimeout(timer.current)
    next()
  }, [next, ok])
  const clear = useCallback(() => { q.current = []; setQueue([]); skip() }, [skip])

  useEffect(() => { if (mode === 'off') clear() }, [mode, clear])
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); if (ok) window.speechSynthesis.cancel() }, [ok])
  return { say, now, waiting: queue.length, skip, clear }
}
