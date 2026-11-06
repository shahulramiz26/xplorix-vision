'use client'

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Check, UserRound, Clock, X, ArrowRight, RotateCcw, ShieldCheck, CalendarCheck } from 'lucide-react'
import { useCosting, ADMIN_NAME, nowStamp, moneyL, type FindingStatus } from '../../lib/costing-store'
import { useInventory, TODAY, addDays } from '../../lib/inventory-store'
import { buildInbox, type InboxResult, type InboxUnit } from '../../lib/inbox'
import { deptLabel, SEVERITY_LABEL, type Dept, type Severity } from '../../lib/findings'
import { T, tint, inputStyle, display } from './kit'
import { TaskAi } from './ai'

/* ==========================================================================
 * THE INBOX ON SCREEN
 *
 * One list, one design, everywhere. The Dashboard shows all of it; each
 * department's screen shows its share with <DeptInbox>. Every row has the
 * same four answers (Done, Hand to, Remind me, Not relevant) and they are
 * kept against the story, so it is answered once for every screen.
 * ========================================================================== */

const InboxCtx = createContext<InboxResult | null>(null)

/* Worked out once for the whole admin console (app/admin/layout.tsx). */
export function InboxProvider({ children }: { children: ReactNode }) {
  const { state } = useCosting()
  const { state: inv } = useInventory()
  const inbox = useMemo(() => buildInbox(state, inv), [state, inv])
  return <InboxCtx.Provider value={inbox}>{children}</InboxCtx.Provider>
}

export function useInbox(): InboxResult {
  const ctx = useContext(InboxCtx)
  const { state } = useCosting()
  const { state: inv } = useInventory()
  // Only outside the admin console, where no provider is mounted.
  const own = useMemo(() => ctx ? null : buildInbox(state, inv), [ctx, state, inv])
  return (ctx ?? own) as InboxResult
}

export function useMark() {
  const { setFindingStatus } = useCosting()
  return (u: InboxUnit, st: Omit<FindingStatus, 'by' | 'at' | 'ids'> | null) =>
    setFindingStatus(u.id, st ? {
      ...st, by: ADMIN_NAME, at: nowStamp(), ids: u.items.map(f => f.id),
      found: {
        title: u.title, dept: u.dept, money: u.money, on: u.since ?? TODAY,
        items: u.items.map(f => ({ id: f.id, title: f.title, kind: f.kind, ref: f.ref, money: f.money })),
      },
    } : null)
}

const SEV_STYLE: Record<Severity, { bg: string; fg: string }> = {
  act: { bg: T.red, fg: '#fff' },
  plan: { bg: tint(T.amber, 22), fg: 'var(--x-text)' },
  watch: { bg: 'rgba(var(--x-ov),0.07)', fg: 'var(--x-muted)' },
}
export function SevTag({ s }: { s: Severity }) {
  return <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', padding: '3px 7px', borderRadius: 6, background: SEV_STYLE[s].bg, color: SEV_STYLE[s].fg, whiteSpace: 'nowrap', textTransform: 'uppercase' }}>{SEVERITY_LABEL[s]}</span>
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const dayWord = (d: string) => d === TODAY ? 'today' : d === addDays(TODAY, 1) ? 'tomorrow' : `${Number(d.slice(8))} ${MON[Number(d.slice(5, 7)) - 1]}`

const actBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, padding: '0 11px', borderRadius: 8,
  border: `1px solid ${T.border}`, background: T.card, color: T.text, fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', textDecoration: 'none',
}

/* The four answers, and Open. Kept against the story, so answering it
 * here answers it on every screen. */
export function UnitActions({ u, moveWord = 'Remind me…' }: { u: InboxUnit; moveWord?: string }) {
  const mark = useMark()
  const [mode, setMode] = useState<'none' | 'hand' | 'remind' | 'dismiss'>('none')
  const [text, setText] = useState('')
  const [date, setDate] = useState(addDays(TODAY, 1))
  const closed = u.state === 'done' || u.state === 'dismissed'
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {closed || u.state === 'reminder' ? (
          <button type="button" style={actBtn} onClick={() => mark(u, null)}><RotateCcw size={13} aria-hidden />{u.state === 'reminder' ? 'Bring back now' : 'Reopen'}</button>
        ) : mode === 'none' ? <>
          <button type="button" style={actBtn} onClick={() => mark(u, { status: 'done' })}><Check size={14} aria-hidden style={{ color: T.green }} />Done</button>
          <button type="button" style={actBtn} onClick={() => setMode('remind')}><Clock size={13} aria-hidden />{moveWord}</button>
          <button type="button" style={{ ...actBtn, color: T.muted }} onClick={() => { setMode('dismiss'); setText('') }}><X size={13} aria-hidden />Not relevant</button>
          {u.href && <Link href={u.href} style={{ ...actBtn, background: tint(T.orange, 10), borderColor: tint(T.orange, 30), color: 'var(--x-text)' }}>Open<ArrowRight size={13} aria-hidden /></Link>}
        </> : mode === 'remind' ? <>
          {[{ l: 'Tomorrow', d: addDays(TODAY, 1) }, { l: 'In 3 days', d: addDays(TODAY, 3) }, { l: 'Next week', d: addDays(TODAY, 7) }].map(o => (
            <button key={o.l} type="button" style={actBtn} onClick={() => { mark(u, { status: 'snoozed', until: o.d }); setMode('none') }}>{o.l}</button>
          ))}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: T.muted }}>
            On <input type="date" min={addDays(TODAY, 1)} value={date} onChange={e => setDate(e.target.value)} style={{ ...inputStyle, width: 150, padding: '6px 8px', fontSize: 12.5 }} />
          </label>
          <button type="button" style={actBtn} onClick={() => { mark(u, { status: 'snoozed', until: date }); setMode('none') }}>Set</button>
          <button type="button" style={{ ...actBtn, color: T.muted }} onClick={() => setMode('none')}>Cancel</button>
        </> : <>
          <label style={{ display: 'flex', flex: '1 1 260px', maxWidth: 380 }}>
            <span className="sr-only">{mode === 'hand' ? 'Who should do it' : 'Why it does not apply'}</span>
            <input autoFocus value={text} onChange={e => setText(e.target.value)} placeholder={mode === 'hand' ? 'Who should do it? A name or a role' : 'Why it does not apply (kept with it)'}
              onKeyDown={e => { if (e.key === 'Enter' && text.trim()) { mark(u, mode === 'hand' ? { status: 'assigned', to: text.trim() } : { status: 'dismissed', note: text.trim() }); setMode('none') } }}
              style={{ ...inputStyle, fontSize: 13, width: '100%' }} />
          </label>
          <button type="button" disabled={!text.trim()} style={{ ...actBtn, opacity: text.trim() ? 1 : 0.45 }}
            onClick={() => { mark(u, mode === 'hand' ? { status: 'assigned', to: text.trim() } : { status: 'dismissed', note: text.trim() }); setMode('none') }}>Save</button>
          <button type="button" style={{ ...actBtn, color: T.muted }} onClick={() => setMode('none')}>Cancel</button>
        </>}
    </div>
  )
}

/* One story or one finding, with its answers. */
export function UnitCard({ u, compact, first }: { u: InboxUnit; compact?: boolean; first?: boolean }) {
  const story = u.items.length > 1
  const closed = u.state === 'done' || u.state === 'dismissed'
  const due = u.due ? (u.due <= TODAY ? 'Due today' : `Due ${dayWord(u.due)}`) : undefined

  return (
    <article style={{ padding: compact ? '12px 16px' : '14px 18px', borderTop: first ? 'none' : `1px solid ${T.line}`, background: u.state === 'reminder' || closed ? 'rgba(var(--x-ov),0.015)' : undefined }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: 6, width: 92, flexShrink: 0, paddingTop: 1 }}>
          <SevTag s={u.severity} />
          <span style={{ fontSize: 11.5, color: T.faint, lineHeight: 1.3 }}>{deptLabel(u.dept)}</span>
        </div>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: compact ? 13.5 : 14.5, fontWeight: 600, color: T.text, lineHeight: 1.4 }}>{u.title}</h3>
            {u.isNew && !closed && <span style={{ fontSize: 10.5, fontWeight: 700, color: T.blue, background: tint(T.blue, 12), borderRadius: 6, padding: '2px 6px' }}>NEW</span>}
          </div>
          {story
            ? <div style={{ fontSize: 12.5, color: T.muted, marginTop: 3 }}>{u.items.length} findings about {u.about}, one story:</div>
            : !compact && <div style={{ fontSize: 12.5, color: T.muted, marginTop: 3, lineHeight: 1.5 }}>{u.detail}</div>}
          {story && (
            <ol style={{ margin: '6px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
              {u.items.map((f, i) => (
                <li key={f.id} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: T.text, lineHeight: 1.45 }}>
                  <span style={{ color: T.faint, fontWeight: 700, minWidth: 14 }}>{i + 1}</span>
                  <span style={{ minWidth: 0 }}>{f.title}{f.money ? <span style={{ color: T.faint }}> · {moneyL(f.money)}</span> : null}</span>
                </li>
              ))}
            </ol>
          )}
          {!compact && u.action && <div style={{ fontSize: 12.5, color: T.text, marginTop: 6, lineHeight: 1.5 }}><span style={{ color: T.faint }}>What to do: </span>{u.action}</div>}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginTop: 8, fontSize: 12 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: T.muted }}>
              <UserRound size={13} aria-hidden />{u.state === 'handed' ? `Handed to ${u.status?.to}` : u.owner}
            </span>
            {due && !closed && <span style={{ color: due === 'Due today' ? T.red : T.muted, fontWeight: due === 'Due today' ? 600 : 400 }}>{due}</span>}
            {u.state === 'reminder' && u.status?.until && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: T.blue, fontWeight: 600 }}><Clock size={13} aria-hidden />Back on {dayWord(u.status.until)}</span>}
            {closed && <span style={{ color: T.muted }}>{u.state === 'done' ? 'Done' : `Set aside: ${u.status?.note}`} · {u.status?.by}</span>}
          </div>
        </div>
        {u.money ? (
          <div style={{ textAlign: 'right', minWidth: 96 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text, fontFamily: display }}>{moneyL(u.money)}</div>
            {u.moneyNote && <div style={{ fontSize: 11.5, color: T.faint }}>{u.moneyNote}</div>}
          </div>
        ) : null}
      </div>

      <div style={{ marginTop: 10, paddingLeft: 104 }} className="xpl-actions"><UnitActions u={u} /></div>
    </article>
  )
}

const SEV_DOT: Record<Severity, string> = { act: T.red, plan: T.amber, watch: 'var(--x-faint)' }

/* One line a notification, like a mail inbox: what it is, where, how much,
 * and when. Tap it to read the rest and answer it. Nothing is hidden behind
 * the line: the detail, the steps of a story and every answer open in place. */
export function InboxRow({ u, open, onToggle, first, showDept = true }: { u: InboxUnit; open: boolean; onToggle: () => void; first?: boolean; showDept?: boolean }) {
  const closed = u.state === 'done' || u.state === 'dismissed'
  const story = u.items.length > 1
  const dueToday = !!u.due && u.due <= TODAY && !closed
  const badge = u.state === 'reminder' && u.status?.until ? { t: `Back ${dayWord(u.status.until)}`, c: T.blue }
    : u.state === 'handed' ? { t: `With ${u.status?.to}`, c: T.blue }
    : closed ? { t: u.state === 'done' ? `Done · ${u.status?.by ?? ''}` : 'Set aside', c: T.muted }
    : dueToday ? { t: 'Due today', c: T.red }
    : u.due ? { t: `Due ${dayWord(u.due)}`, c: T.muted } : null
  const sub = [showDept ? deptLabel(u.dept) : null, story ? `${u.items.length} linked: ${u.items.slice(1).map(f => f.title).join('; ')}` : u.detail].filter(Boolean).join(' · ')
  return (
    <article id={`u-${encodeURIComponent(u.id)}`} style={{ borderTop: first ? 'none' : `1px solid ${T.line}`, background: open ? 'rgba(var(--x-ov),0.025)' : undefined }}>
      <button type="button" aria-expanded={open} onClick={onToggle} className="xpl-row"
        style={{ width: '100%', display: 'grid', gridTemplateColumns: '12px minmax(0, 1fr) auto 16px', gap: 12, alignItems: 'center', padding: '11px 16px', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: T.text, minHeight: 56 }}>
        <span aria-label={SEVERITY_LABEL[u.severity]} style={{ width: 10, height: 10, borderRadius: 99, background: closed ? 'transparent' : SEV_DOT[u.severity], border: closed ? `2px solid ${T.faint}` : 'none' }} />
        <span style={{ minWidth: 0, display: 'grid', gap: 2 }}>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
            <span className="xpl-clamp" style={{ fontSize: 14, fontWeight: closed ? 500 : 600, color: closed ? T.muted : T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{u.title}</span>
            {u.isNew && !closed && <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: T.blue, background: tint(T.blue, 12), borderRadius: 6, padding: '1px 6px' }}>NEW</span>}
          </span>
          <span style={{ fontSize: 12.5, color: T.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</span>
        </span>
        <span style={{ display: 'grid', justifyItems: 'end', gap: 2 }}>
          {u.money ? <span style={{ fontSize: 13.5, fontWeight: 700, color: T.text, whiteSpace: 'nowrap' }}>{moneyL(u.money)}</span> : null}
          {badge && <span style={{ fontSize: 11.5, fontWeight: 600, color: badge.c, whiteSpace: 'nowrap' }}>{badge.t}</span>}
        </span>
        <ArrowRight size={14} aria-hidden style={{ color: T.faint, transform: open ? 'rotate(90deg)' : undefined, transition: 'transform 0.15s' }} />
      </button>
      {open && (
        <div style={{ padding: '0 16px 14px 40px', display: 'grid', gap: 8 }}>
          {story ? (
            <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
              {u.items.map((f, i) => (
                <li key={f.id} style={{ display: 'flex', gap: 8, fontSize: 13, color: T.text, lineHeight: 1.45 }}>
                  <span style={{ color: T.faint, fontWeight: 700, minWidth: 14 }}>{i + 1}</span>
                  <span style={{ minWidth: 0 }}>{f.title}{f.money ? <span style={{ color: T.faint }}> · {moneyL(f.money)}</span> : null}</span>
                </li>
              ))}
            </ol>
          ) : <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.55 }}>{u.detail}</div>}
          <div style={{ fontSize: 12, color: T.muted, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><UserRound size={13} aria-hidden />{u.state === 'handed' ? `Handed to ${u.status?.to}` : u.owner}</span>
            {u.moneyNote && u.money ? <span>{moneyL(u.money)} {u.moneyNote}</span> : null}
            {closed && u.status?.note ? <span>{u.state === 'done' ? 'Done: ' : 'Reason: '}{u.status.note}</span> : null}
          </div>
          <TaskAi u={u} />
          <UnitActions u={u} />
        </div>
      )}
    </article>
  )
}

/* Rows with one open at a time. */
export function InboxRows({ units, showDept = true, startOpen }: { units: InboxUnit[]; showDept?: boolean; startOpen?: string }) {
  const [open, setOpen] = useState<string | null>(startOpen ?? null)
  return <>{units.map((u, i) => <InboxRow key={u.id} u={u} first={i === 0} showDept={showDept} open={open === u.id} onToggle={() => setOpen(o => o === u.id ? null : u.id)} />)}</>
}

/* A department screen's own tasks, as one line: how many, how many today,
 * and a way into Tasks already narrowed to this department. The tasks
 * themselves live in one place, Tasks, so a screen opens on its own work. */
export function DeptInbox({ depts, name }: { depts: Dept[]; name: string; show?: number }) {
  const inbox = useInbox()
  const mine = inbox.open.filter(u => u.depts.some(d => depts.includes(d)))
  const today = mine.filter(u => u.severity === 'act' || (u.due && u.due <= TODAY)).length
  const reminders = inbox.reminders.filter(u => u.depts.some(d => depts.includes(d))).length
  return (
    <Link href={`/admin/tasks?dept=${depts.join(',')}`} aria-label={`${mine.length} tasks for ${name}, ${today} due today. Open in Tasks`} className="xpl-row"
      style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 14px', borderRadius: 10, border: `1px solid ${T.border}`, background: T.card, textDecoration: 'none', boxShadow: 'var(--x-card-shadow)' }}>
      {mine.length ? <CalendarCheck size={17} aria-hidden style={{ color: T.orange }} /> : <ShieldCheck size={17} aria-hidden style={{ color: T.green }} />}
      <span style={{ fontSize: 13.5, color: T.text }}>
        {mine.length ? <><b>{mine.length} {mine.length === 1 ? 'task' : 'tasks'} for {name}</b>{today ? <> · <b style={{ color: 'var(--x-bad-text)' }}>{today} due today</b></> : null}{reminders ? <span style={{ color: T.faint }}> · {reminders} on a reminder</span> : null}</> : <>Nothing waiting for {name}</>}
      </span>
      <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600, color: T.orange }}>Open in Tasks<ArrowRight size={14} aria-hidden /></span>
    </Link>
  )
}
