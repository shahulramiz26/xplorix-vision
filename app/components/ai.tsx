'use client'

import { createContext, Fragment, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Sparkles, Send, X, Copy, Check, Pencil, ArrowRight, Mail, ShoppingCart, FileText, Wrench, ArrowLeftRight, StickyNote } from 'lucide-react'
import { useCosting } from '../../lib/costing-store'
import { useInventory, TODAY } from '../../lib/inventory-store'
import { IS_DEMO } from '../../lib/company'
import type { InboxUnit } from '../../lib/inbox'
import { ctxOf, type AiCtx } from '../../lib/ai/record'
import { explain, type Draft } from '../../lib/ai/explain'
import { dailyBrief, weeklyBrief } from '../../lib/ai/brief'
import { ask, suggestions, type Answer } from '../../lib/ai/ask'
import { useInbox, useMark } from './inbox'
import { useGeo } from '../../lib/core/geo-data'
import { useCore, className as coreClassName } from '../../lib/core/store'
import { VEIN_CLASSES } from '../../lib/core/downhole'
import { askCore, coreSuggestions } from '../../lib/ai/core-ask'
import { T, tint, display, inputStyle, useEscape } from './kit'

/* ==========================================================================
 * XPLORIX AI ON SCREEN
 *
 * One look for everything the AI layer says, wherever it says it:
 *   <AiMark>    the small "XPLORIX AI" label
 *   <TaskAi>    inside a task: why it happened, and the next step drafted
 *   <BriefCard> the morning and weekly brief, top of the Dashboard
 *   <AskPanel>  "Ask XPLORIX", a side panel on every admin screen
 *
 * All of it is worked out in the browser from the record (lib/ai). In the
 * demo the words come from XPLORIX's templates; the panel says so in a
 * footnote, so a demo never claims more than it does.
 * ========================================================================== */

export function useAiCtx(): AiCtx {
  const { state } = useCosting()
  const { state: inv } = useInventory()
  const inbox = useInbox()
  return useMemo(() => ctxOf(state, inv, inbox, TODAY), [state, inv, inbox])
}

export function AiMark({ label = 'XPLORIX AI', size = 12 }: { label?: string; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: size - 1, fontWeight: 700, letterSpacing: '0.06em', color: T.orange, textTransform: 'uppercase' }}>
      <Sparkles size={size} aria-hidden />{label}
    </span>
  )
}

/* **bold** and nothing else: the engine writes plain sentences. */
export function Md({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return <>{parts.map((p, i) => p.startsWith('**') && p.endsWith('**') ? <b key={i} style={{ color: T.text, fontWeight: 650 }}>{p.slice(2, -2)}</b> : <Fragment key={i}>{p}</Fragment>)}</>
}

const DRAFT_ICON: Record<Draft['kind'], React.ElementType> = {
  email: Mail, po: ShoppingCart, invoice: FileText, workorder: Wrench, transfer: ArrowLeftRight, note: StickyNote,
}

const smallBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 34, padding: '0 11px', borderRadius: 8,
  border: `1px solid ${T.border}`, background: T.card, color: T.text, fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
}

/* A drafted next step. Approve marks the task done with what was approved;
 * nothing is sent from the demo. */
export function DraftBox({ d, onApprove, approved }: { d: Draft; onApprove?: (text: string) => void; approved?: boolean }) {
  const [edit, setEdit] = useState(false)
  const [body, setBody] = useState(d.body)
  const [copied, setCopied] = useState(false)
  useEffect(() => { setBody(d.body); setEdit(false) }, [d.body])
  const Icon = DRAFT_ICON[d.kind]
  const copy = () => {
    const t = [d.subject ? `Subject: ${d.subject}` : '', body, d.table ? d.table.rows.map(r => r.join('\t')).join('\n') : ''].filter(Boolean).join('\n\n')
    try { void navigator.clipboard?.writeText(t) } catch { /* no clipboard here */ }
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div style={{ border: `1px solid ${tint(T.orange, 35)}`, borderRadius: 10, background: tint(T.orange, 4), overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderBottom: `1px solid ${tint(T.orange, 20)}`, flexWrap: 'wrap' }}>
        <Icon size={15} aria-hidden style={{ color: T.orange }} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: T.text }}>{d.via}</span>
        <span style={{ fontSize: 12.5, color: T.muted }}>to {d.to}</span>
        <span style={{ marginLeft: 'auto' }}><AiMark label="Drafted" size={11} /></span>
      </div>
      <div style={{ padding: '10px 12px', display: 'grid', gap: 8 }}>
        {d.subject && <div style={{ fontSize: 13, fontWeight: 650, color: T.text }}>{d.subject}</div>}
        {edit
          ? <textarea aria-label="Edit the draft" value={body} onChange={e => setBody(e.target.value)} rows={Math.min(14, body.split('\n').length + 2)} style={{ ...inputStyle, fontSize: 13, lineHeight: 1.55, resize: 'vertical', fontFamily: 'inherit' }} />
          : <div style={{ fontSize: 13, color: T.text, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{body}</div>}
        {d.table && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead><tr>{d.table.cols.map((c, i) => <th key={c} style={{ textAlign: i && i === d.table!.cols.length - 1 ? 'right' : 'left', padding: '5px 6px', color: T.faint, fontWeight: 600, borderBottom: `1px solid ${T.line}`, whiteSpace: 'nowrap' }}>{c}</th>)}</tr></thead>
              <tbody>
                {d.table.rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} style={{ padding: '5px 6px', color: T.text, textAlign: j && j === r.length - 1 ? 'right' : 'left', borderBottom: `1px solid ${T.line}`, whiteSpace: j === 0 ? 'normal' : 'nowrap' }}>{v}</td>)}</tr>)}
                {d.table.total && <tr><td colSpan={d.table.cols.length - 1} style={{ padding: '6px', fontWeight: 700, color: T.text }}>{d.table.total[0]}</td><td style={{ padding: '6px', fontWeight: 700, color: T.text, textAlign: 'right', whiteSpace: 'nowrap' }}>{d.table.total[1]}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {onApprove && !approved && (
            <button type="button" onClick={() => onApprove(body !== d.body ? `${d.done} (edited)` : d.done)} style={{ ...smallBtn, background: T.orange, borderColor: 'transparent', color: 'var(--x-on-accent)' }}>
              <Check size={14} aria-hidden />{d.approve}
            </button>
          )}
          {approved && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--x-good-text)' }}><Check size={14} aria-hidden />Approved</span>}
          <button type="button" onClick={() => setEdit(e => !e)} style={smallBtn}><Pencil size={13} aria-hidden />{edit ? 'Done editing' : 'Edit'}</button>
          <button type="button" onClick={copy} style={smallBtn}>{copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}{copied ? 'Copied' : 'Copy'}</button>
        </div>
      </div>
    </div>
  )
}

/* Why, and the next step, for one task. */
export function TaskAi({ u, showAction = true }: { u: InboxUnit; showAction?: boolean }) {
  const ctx = useAiCtx()
  const mark = useMark()
  const e = useMemo(() => explain(u, ctx), [u, ctx])
  const closed = u.state === 'done' || u.state === 'dismissed'
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <section aria-label="Why" style={{ display: 'grid', gap: 6, padding: '10px 12px', borderRadius: 10, background: 'rgba(var(--x-ov),0.03)', border: `1px solid ${T.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <AiMark label="Why" size={12} />
          <span style={{ fontSize: 11.5, color: T.faint }}>{e.confidence} confidence</span>
        </div>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 5 }}>
          {e.why.map((w, i) => (
            <li key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: T.text, lineHeight: 1.55 }}>
              <span aria-hidden style={{ width: 5, height: 5, borderRadius: 9, background: T.orange, marginTop: 8, flexShrink: 0 }} />
              <span style={{ minWidth: 0 }}>{w.text}{w.href && <> <Link href={w.href} style={{ color: T.orange, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>See it →</Link></>}</span>
            </li>
          ))}
        </ul>
        <div style={{ fontSize: 11.5, color: T.faint }}>{e.basis}</div>
      </section>
      {e.draft
        ? <DraftBox d={e.draft} approved={u.state === 'done' && !!u.status?.note && u.status.note.startsWith(e.draft.done)} onApprove={closed ? undefined : note => mark(u, { status: 'done', note })} />
        : showAction && u.action ? <div style={{ fontSize: 13, color: T.text, lineHeight: 1.55 }}><b style={{ fontWeight: 600 }}>What to do: </b>{u.action}</div> : null}
    </div>
  )
}

/* ── the brief ──────────────────────────────────────────────────────────── */

export function BriefCard() {
  const ctx = useAiCtx()
  const { open } = useAsk()
  const [which, setWhich] = useState<'day' | 'week'>('day')
  const b = useMemo(() => which === 'day' ? dailyBrief(ctx) : weeklyBrief(ctx), [ctx, which])
  return (
    <section aria-label="Brief" style={{ position: 'relative', borderRadius: 10, padding: '16px 18px', background: T.card, border: `1px solid ${tint(T.orange, 30)}`, boxShadow: 'var(--x-card-shadow)', display: 'grid', gap: 10, overflow: 'hidden' }}>
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: `radial-gradient(120% 80% at 100% 0%, ${tint(T.orange, 9)}, transparent 60%)`, pointerEvents: 'none' }} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <AiMark />
        <h2 style={{ margin: 0, fontFamily: display, fontSize: 17, fontWeight: 700, color: T.text }}>{b.title}</h2>
        <div role="tablist" aria-label="Brief" style={{ marginLeft: 'auto', display: 'inline-flex', gap: 3, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 9, padding: 3 }}>
          {(['day', 'week'] as const).map(k => (
            <button key={k} type="button" role="tab" aria-selected={which === k} onClick={() => setWhich(k)} style={{ padding: '5px 11px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: which === k ? tint(T.orange, 16) : 'transparent', color: which === k ? T.text : T.faint }}>{k === 'day' ? 'Today' : 'This week'}</button>
          ))}
        </div>
      </div>
      <ol style={{ position: 'relative', margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 7 }}>
        {b.lines.map((l, i) => (
          <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 14, color: T.muted, lineHeight: 1.55 }}>
            <span aria-hidden style={{ width: 7, height: 7, borderRadius: 9, flexShrink: 0, transform: 'translateY(-1px)', background: l.tone === 'bad' ? T.red : l.tone === 'good' ? T.green : T.faint }} />
            <span style={{ minWidth: 0 }}><Md text={l.text} />{l.href && <> <Link href={l.href} style={{ color: T.orange, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap', fontSize: 13 }}>Open →</Link></>}</span>
          </li>
        ))}
      </ol>
      <div style={{ position: 'relative', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {['Why did cost per metre change this month?', 'What needs me today?', 'How will this month close?'].map(q => (
          <button key={q} type="button" onClick={() => open(q)} style={{ ...smallBtn, minHeight: 30, fontSize: 12, fontWeight: 500, color: T.muted, borderRadius: 99 }}>{q}</button>
        ))}
        <button type="button" onClick={() => open()} style={{ ...smallBtn, minHeight: 30, fontSize: 12, borderRadius: 99, marginLeft: 'auto', color: T.orange, borderColor: tint(T.orange, 40) }}><Sparkles size={13} aria-hidden />Ask XPLORIX</button>
      </div>
    </section>
  )
}

/* ── Ask XPLORIX ────────────────────────────────────────────────────────── */

const AskCtx = createContext<{ open: (q?: string) => void } | null>(null)
export function useAsk() { return useContext(AskCtx) ?? { open: () => {} } }

interface Turn { q: string; a: Answer | null }

export function AskProvider({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const value = useMemo(() => ({ open: (q?: string) => { setShown(true); if (q) setPending(q) } }), [])
  // Ctrl J or ⌘ J opens it from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 'j' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setShown(s => !s) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <AskCtx.Provider value={value}>
      {children}
      {shown && <AskPanel first={pending} onFirst={() => setPending(null)} onClose={() => setShown(false)} />}
    </AskCtx.Provider>
  )
}

export function AskButton() {
  const { open } = useAsk()
  return (
    <button type="button" onClick={() => open()} className="xpl-hit" aria-label="Ask XPLORIX" title="Ask XPLORIX (Ctrl J)"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: T.text, background: tint(T.orange, 10), border: `1px solid ${tint(T.orange, 40)}`, whiteSpace: 'nowrap' }}>
      <Sparkles size={15} aria-hidden style={{ color: T.orange }} /><span className="hidden sm:inline">Ask XPLORIX</span>
    </button>
  )
}

/* What the panel answers from: the drilling record, or on Geology screens
 * the core record. Same panel, same look. */
interface Engine { answer: (q: string) => Answer; start: string[]; subtitle: string; intro: string; placeholder: string }

function useDrillEngine(): Engine {
  const ctx = useAiCtx()
  const path = usePathname()
  return {
    answer: q => ask(q, ctx), start: suggestions(path),
    subtitle: 'Answers from your drill logs, costs, stores, invoices and rig sensors',
    intro: 'Ask in plain words about rigs, holes, drillers, parts, money or the month ahead. Every answer shows what it read, so you can check it.',
    placeholder: 'Ask about your rigs, money, stores…',
  }
}
export function useGeoEngine(): Engine {
  const { data, edits } = useGeo()
  const { review, index } = useCore()
  const { state } = useCosting()
  const path = usePathname()
  const ctx = { data, review, index, logs: state.shiftLogs, className: (id: number) => coreClassName(review, id), veinName: (id: number) => edits.veinNames[id]?.name ?? VEIN_CLASSES[id].name }
  return {
    answer: q => askCore(q, ctx), start: coreSuggestions(path),
    subtitle: 'Answers from the core photos, logs, assays and the drilling record',
    intro: 'Ask in plain words about holes, core recovery, rock quality, gold, veins, the geologist\'s log, domains, rock strength, minerals, joint sets or RC chips. Every answer shows what it read.',
    placeholder: 'Ask about the core, assays, veins…',
  }
}

function AskPanel(p: { first: string | null; onFirst: () => void; onClose: () => void }) {
  const path = usePathname()
  return path.startsWith('/admin/geology') ? <GeoAskPanel {...p} /> : <DrillAskPanel {...p} />
}
function DrillAskPanel(p: { first: string | null; onFirst: () => void; onClose: () => void }) { return <AskView {...p} engine={useDrillEngine()} /> }
function GeoAskPanel(p: { first: string | null; onFirst: () => void; onClose: () => void }) { return <AskView {...p} engine={useGeoEngine()} /> }

export function AskView({ first, onFirst, onClose, engine, inline }: { first: string | null; onFirst: () => void; onClose: () => void; engine: Engine; inline?: boolean }) {
  useEscape(() => { if (!inline) onClose() })
  const [turns, setTurns] = useState<Turn[]>([])
  const [text, setText] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const start = engine.start
  const answerRef = useRef(engine.answer)
  answerRef.current = engine.answer

  const send = (q: string) => {
    const t = q.trim(); if (!t) return
    setText('')
    setTurns(ts => [...ts, { q: t, a: null }])
    // A short pause so the answer reads as worked out, not pasted.
    setTimeout(() => setTurns(ts => ts.map((x, i) => i === ts.length - 1 && !x.a ? { ...x, a: answerRef.current(t) } : x)), 450 + Math.min(500, t.length * 6))
  }
  useEffect(() => { if (first) { send(first); onFirst() } }, [first]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (turns.length) end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [turns])
  useEffect(() => { if (!inline) input.current?.focus() }, [inline])

  const body = (
      <aside role={inline ? undefined : 'dialog'} aria-modal={inline ? undefined : true} aria-label="Ask XPLORIX" onClick={e => e.stopPropagation()}
        style={inline
          ? { fontFamily: display, color: T.text, width: '100%', height: 'min(720px, calc(100vh - 220px))', minHeight: 460, background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr) auto', overflow: 'hidden' }
          : { fontFamily: display, color: T.text, width: 'min(480px, 100%)', height: '100%', background: T.card, borderLeft: `1px solid ${T.border}`, display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr) auto', boxShadow: '-20px 0 60px rgba(var(--x-shadow),0.35)' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: `1px solid ${T.line}` }}>
          <span aria-hidden style={{ width: 32, height: 32, borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: tint(T.orange, 14) }}><Sparkles size={17} style={{ color: T.orange }} /></span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: display, fontSize: 16, fontWeight: 700, color: T.text }}>Ask XPLORIX</div>
            <div style={{ fontSize: 12, color: T.faint }}>{engine.subtitle}</div>
          </div>
          {!inline && <button type="button" aria-label="Close" onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: T.muted, cursor: 'pointer', padding: 4 }}><X size={18} /></button>}
        </header>

        <div style={{ overflowY: 'auto', padding: '14px 16px', display: 'grid', alignContent: 'start', gap: 14 }}>
          {turns.length === 0 && (
            <div style={{ display: 'grid', gap: 10 }}>
              <p style={{ margin: 0, fontSize: 13.5, color: T.muted, lineHeight: 1.6 }}>{engine.intro}</p>
              <div style={{ display: 'grid', gap: 6 }}>
                {start.map(q => <button key={q} type="button" onClick={() => send(q)} className="xpl-row" style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.border}`, background: 'transparent', color: T.text, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}><ArrowRight size={13} aria-hidden style={{ color: T.orange, flexShrink: 0 }} />{q}</button>)}
              </div>
            </div>
          )}
          {turns.map((t, i) => (
            <div key={i} style={{ display: 'grid', gap: 8 }}>
              <div style={{ justifySelf: 'end', maxWidth: '88%', padding: '8px 12px', borderRadius: '12px 12px 4px 12px', background: tint(T.orange, 14), color: T.text, fontSize: 13.5, lineHeight: 1.5 }}>{t.q}</div>
              {!t.a ? <Thinking /> : <AnswerView a={t.a} onAsk={send} />}
            </div>
          ))}
          <div ref={end} />
        </div>

        <footer style={{ borderTop: `1px solid ${T.line}`, padding: '10px 12px 12px', display: 'grid', gap: 6 }}>
          <form onSubmit={e => { e.preventDefault(); send(text) }} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <label style={{ flex: 1 }}>
              <span className="sr-only">Your question</span>
              <textarea ref={input} value={text} onChange={e => setText(e.target.value)} rows={1} placeholder={engine.placeholder}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text) } }}
                style={{ ...inputStyle, resize: 'none', fontSize: 13.5, minHeight: 42, maxHeight: 120, fontFamily: 'inherit' }} />
            </label>
            <button type="submit" aria-label="Ask" disabled={!text.trim()} style={{ width: 42, height: 42, borderRadius: 10, border: 'none', background: T.orange, color: 'var(--x-on-accent)', cursor: text.trim() ? 'pointer' : 'default', opacity: text.trim() ? 1 : 0.5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Send size={16} /></button>
          </form>
          {IS_DEMO && <div style={{ fontSize: 11, color: T.faint, lineHeight: 1.45 }}>Demo: answers are worked out from this company&apos;s record by XPLORIX&apos;s own rules. The live AI model reads the same record and connects with an API key.</div>}
        </footer>
      </aside>
  )
  if (inline) return body
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(var(--x-shadow),0.35)', display: 'flex', justifyContent: 'flex-end' }}>
      {body}
    </div>
  )
}

function Thinking() {
  return (
    <div aria-label="Working it out" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: T.faint }}>
      <Sparkles size={13} style={{ color: T.orange }} aria-hidden />Reading the record
      <span className="xpl-dots" aria-hidden><i>.</i><i>.</i><i>.</i></span>
      <style>{`.xpl-dots i{animation:xpld 1s infinite;font-style:normal}.xpl-dots i:nth-child(2){animation-delay:.15s}.xpl-dots i:nth-child(3){animation-delay:.3s}@keyframes xpld{0%,100%{opacity:.2}50%{opacity:1}}`}</style>
    </div>
  )
}

function AnswerView({ a, onAsk }: { a: Answer; onAsk: (q: string) => void }) {
  return (
    <div style={{ display: 'grid', gap: 9, padding: '10px 12px', borderRadius: '12px 12px 12px 4px', background: 'rgba(var(--x-ov),0.035)', border: `1px solid ${T.line}` }}>
      <AiMark size={11} />
      {a.text.map((p, i) => <p key={i} style={{ margin: 0, fontSize: 13.5, color: T.muted, lineHeight: 1.6 }}><Md text={p} /></p>)}
      {a.table && (
        <div style={{ overflowX: 'auto', border: `1px solid ${T.line}`, borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr>{a.table.cols.map((c, i) => <th key={c} style={{ textAlign: i ? 'right' : 'left', padding: '6px 8px', color: T.faint, fontWeight: 600, borderBottom: `1px solid ${T.line}`, whiteSpace: 'nowrap' }}>{c}</th>)}</tr></thead>
            <tbody>{a.table.rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} style={{ padding: '6px 8px', color: T.text, textAlign: j ? 'right' : 'left', borderTop: i ? `1px solid ${T.line}` : 'none', whiteSpace: j ? 'nowrap' : 'normal', fontVariantNumeric: 'tabular-nums' }}>{v}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
      {a.draft && <DraftBox d={a.draft} />}
      {a.sources.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 11.5, color: T.faint }}>
          Read from
          {a.sources.map(s => <Link key={s.href + s.label} href={s.href} style={{ padding: '2px 8px', borderRadius: 99, border: `1px solid ${T.border}`, color: T.text, textDecoration: 'none', fontWeight: 600 }}>{s.label}</Link>)}
        </div>
      )}
      {a.followups.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {a.followups.map(f => <button key={f} type="button" onClick={() => onAsk(f)} style={{ ...smallBtn, minHeight: 28, fontSize: 12, fontWeight: 500, color: T.muted, borderRadius: 99 }}>{f}</button>)}
        </div>
      )}
    </div>
  )
}
