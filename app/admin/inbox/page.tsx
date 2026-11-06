'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, Clock, UserRound, X } from 'lucide-react'
import { moneyL } from '../../../lib/costing-store'
import { TODAY, addDays } from '../../../lib/inventory-store'
import { deptLabel, type Dept } from '../../../lib/findings'
import { useInbox, useMark, SevTag, dayWord } from '../../components/inbox'
import { Page, T, tint, display, inputStyle, num } from '../../components/kit'
import { TaskAi } from '../../components/ai'

/* ==========================================================================
 * ONE BY ONE — every open story in turn
 *
 * For the morning when the list is long. Each story is shown on its own with
 * the figures behind it and the four answers. "Skip" puts it at the back of
 * the round, it does not drop it: the round only ends when every story has
 * been answered (done, handed on, a reminder date, or set aside with a
 * reason). Keys: D done, R remind, N not relevant, → skip.
 * ========================================================================== */

const btn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 9, minHeight: 48, padding: '0 16px', borderRadius: 11,
  border: `1px solid ${T.border}`, background: T.card, color: T.text, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer', textDecoration: 'none',
}
const key: React.CSSProperties = { fontSize: 11.5, color: T.muted, border: `1px solid ${T.border}`, borderRadius: 4, padding: '0 5px', fontWeight: 600 }

function Review() {
  const inbox = useInbox()
  const mark = useMark()
  const params = useSearchParams()
  const depts = (params.get('dept') ?? '').split(',').filter(Boolean) as Dept[]
  const pool = useMemo(() => inbox.open.filter(u => u.state === 'open' && (!depts.length || u.depts.some(d => depts.includes(d)))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inbox.open, params])

  /* The round is fixed when it starts; answered stories leave it, skipped
   * ones go to the back. */
  const [queue, setQueue] = useState<string[] | null>(null)
  const [answered, setAnswered] = useState<string[]>([])
  const [mode, setMode] = useState<'none' | 'hand' | 'remind' | 'dismiss'>('none')
  const [text, setText] = useState('')
  const startTotal = useRef(0)
  useEffect(() => {
    if (queue === null && pool.length) { setQueue(pool.map(u => u.id)); startTotal.current = pool.length }
  }, [pool, queue])
  const live = (queue ?? []).filter(id => pool.some(u => u.id === id))
  const current = pool.find(u => u.id === live[0])
  const total = startTotal.current || pool.length
  const done = answered.length

  const answer = (st: Parameters<typeof mark>[1]) => {
    if (!current) return
    mark(current, st)
    setAnswered(a => [...a, current.id])
    setQueue(q => (q ?? []).filter(id => id !== current.id))
    setMode('none'); setText('')
  }
  const skip = () => { if (current) { setQueue(q => [...(q ?? []).filter(id => id !== current.id), current.id]); setMode('none') } }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (mode !== 'none' || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? '')) return
      if (e.key === 'd' || e.key === 'D') answer({ status: 'done' })
      else if (e.key === 'r' || e.key === 'R') setMode('remind')
      else if (e.key === 'n' || e.key === 'N') setMode('dismiss')
      else if (e.key === 'ArrowRight') skip()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const scope = depts.length ? depts.map(deptLabel).join(' and ') : 'every department'

  return (
    <Page>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/admin/tasks?dept=all" style={{ display: 'inline-flex', gap: 8, alignItems: 'center', minHeight: 44, color: T.text, fontWeight: 600, textDecoration: 'none' }}><ArrowLeft size={16} aria-hidden />Back to Tasks</Link>
        <div style={{ flex: '1 1 320px', maxWidth: 560, display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, gap: 10 }}>
            <span style={{ fontWeight: 600, color: T.text }}>{Math.min(done + (current ? 1 : 0), total)} of {total} · {scope}</span>
            <span style={{ color: T.muted }}>{live.length} left in this round</span>
          </div>
          <div aria-hidden style={{ height: 8, borderRadius: 999, background: 'rgba(var(--x-ov),0.07)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${total ? (done / total) * 100 : 0}%`, background: T.orange }} /></div>
        </div>
      </div>

      {!current ? (
        <section style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '30px 28px', display: 'grid', gap: 10, maxWidth: 760 }}>
          <h1 style={{ margin: 0, fontFamily: display, fontSize: 24, color: T.text }}>{total ? 'Every story in this round is answered' : `Nothing open for ${scope}`}</h1>
          <p style={{ margin: 0, color: T.muted, lineHeight: 1.6 }}>{total ? `${done} answered. Reminders come back on their date; anything new appears in the list the moment the record shows it.` : 'New findings appear in the list the moment the record shows them.'}</p>
          <Link href="/admin/tasks?dept=all" style={{ ...btn, justifySelf: 'start', background: T.orange, color: 'var(--x-on-accent)', border: 'none' }}>Back to Tasks</Link>
        </section>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 22, alignItems: 'flex-start' }}>
          <nav aria-label="This round" style={{ flex: '1 1 260px', maxWidth: 340, background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '11px 16px', borderBottom: `1px solid ${T.line}`, fontSize: 13, fontWeight: 700, color: T.text }}>Still in this round</div>
            {live.slice(0, 12).map((id, i) => {
              const u = pool.find(x => x.id === id)!
              return (
                <div key={id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 16px', borderTop: i ? `1px solid ${T.line}` : 'none', background: i === 0 ? tint(T.orange, 12) : undefined, fontSize: 12.5 }}>
                  <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, flexShrink: 0, background: u.severity === 'act' ? T.red : u.severity === 'plan' ? T.amber : 'var(--x-faint)' }} />
                  <span style={{ flex: 1, minWidth: 0, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.title}</span>
                </div>
              )
            })}
            {live.length > 12 && <div style={{ padding: '9px 16px', borderTop: `1px solid ${T.line}`, fontSize: 12, color: T.muted }}>and {live.length - 12} more</div>}
          </nav>

          <section aria-label="Current story" style={{ flex: '999 1 560px', minWidth: 0, display: 'grid', gap: 14 }}>
            <article style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '24px 26px', display: 'grid', gap: 14 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <SevTag s={current.severity} />
                <span style={{ fontSize: 12, fontWeight: 600, border: `1px solid ${T.border}`, borderRadius: 6, padding: '3px 8px', color: T.text }}>{deptLabel(current.dept)}</span>
                {current.tags.map(t => <span key={t} style={{ fontSize: 12, color: T.muted }}>{t}</span>)}
              </div>
              <h1 style={{ margin: 0, fontFamily: display, fontSize: 26, lineHeight: 1.2, color: T.text }}>{current.title}</h1>
              {current.items.length > 1
                ? <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8, color: T.text, lineHeight: 1.5 }}>
                  {current.items.map(f => <li key={f.id}><b style={{ fontWeight: 600 }}>{f.title}</b><div style={{ fontSize: 13, color: T.muted }}>{f.detail}</div></li>)}
                </ol>
                : <p style={{ margin: 0, fontSize: 15, color: T.text, lineHeight: 1.6 }}>{current.detail}</p>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(170px, 100%), 1fr))', gap: 10 }}>
                <div style={{ background: 'rgba(var(--x-ov),0.035)', borderRadius: 10, padding: '12px 14px' }}><div style={{ fontSize: 12, color: T.muted }}>At stake</div><div style={{ ...num, fontSize: 20, fontWeight: 600, color: T.text }}>{current.money ? moneyL(current.money) : '—'}</div><div style={{ fontSize: 12, color: T.muted }}>{current.moneyNote ?? 'not put in money'}</div></div>
                <div style={{ background: 'rgba(var(--x-ov),0.035)', borderRadius: 10, padding: '12px 14px' }}><div style={{ fontSize: 12, color: T.muted }}>Who</div><div style={{ ...num, fontSize: 20, fontWeight: 600, color: T.text }}>{current.owner}</div><div style={{ fontSize: 12, color: T.muted }}>{current.due ? (current.due <= TODAY ? 'by today' : `by ${dayWord(current.due)}`) : 'as soon as it can be done'}</div></div>
              </div>
              <TaskAi u={current} />
              {current.items.some(f => f.evidence?.length) && (
                <details>
                  <summary style={{ cursor: 'pointer', fontWeight: 600, minHeight: 30, color: T.text }}>The shifts, orders and holes behind it</summary>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: T.muted, lineHeight: 1.7, fontSize: 13 }}>
                    {current.items.flatMap(f => f.evidence ?? []).slice(0, 12).map(e => <li key={e}>{e}</li>)}
                  </ul>
                </details>
              )}
            </article>

            {mode === 'none' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {current.href && <Link href={current.href} style={{ ...btn, background: T.orange, color: 'var(--x-on-accent)', border: 'none' }}>Open it<ArrowRight size={15} aria-hidden /></Link>}
                <button type="button" style={btn} onClick={() => answer({ status: 'done' })}><Check size={16} aria-hidden style={{ color: T.green }} />Done <span style={key}>D</span></button>
                <button type="button" style={btn} onClick={() => setMode('remind')}><Clock size={15} aria-hidden />Remind me… <span style={key}>R</span></button>
                <button type="button" style={btn} onClick={() => setMode('dismiss')}><X size={15} aria-hidden />Not relevant <span style={key}>N</span></button>
                <button type="button" style={{ ...btn, border: 'none', background: 'transparent', color: T.muted, marginLeft: 'auto' }} onClick={skip}>Skip for now, it stays in the round <span style={key}>→</span></button>
              </div>
            )}
            {mode === 'remind' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 13.5, color: T.text, fontWeight: 600 }}>Bring it back</span>
                {[{ l: 'Tomorrow', d: addDays(TODAY, 1) }, { l: 'In 3 days', d: addDays(TODAY, 3) }, { l: 'Next week', d: addDays(TODAY, 7) }].map(o => (
                  <button key={o.l} type="button" style={btn} onClick={() => answer({ status: 'snoozed', until: o.d })}>{o.l}</button>
                ))}
                <button type="button" style={{ ...btn, border: 'none', background: 'transparent', color: T.muted }} onClick={() => setMode('none')}>Cancel</button>
              </div>
            )}
            {(mode === 'hand' || mode === 'dismiss') && (
              <form onSubmit={e => { e.preventDefault(); if (text.trim()) answer(mode === 'hand' ? { status: 'assigned', to: text.trim() } : { status: 'dismissed', note: text.trim() }) }}
                style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <label style={{ flex: '1 1 300px', display: 'grid', gap: 4, fontSize: 13, color: T.text, fontWeight: 600 }}>
                  {mode === 'hand' ? 'Who should do it?' : 'Why it does not apply (kept with it)'}
                  <input autoFocus value={text} onChange={e => setText(e.target.value)} style={{ ...inputStyle, fontSize: 14 }} />
                </label>
                <button type="submit" disabled={!text.trim()} style={{ ...btn, alignSelf: 'flex-end', opacity: text.trim() ? 1 : 0.45 }}>Save</button>
                <button type="button" style={{ ...btn, alignSelf: 'flex-end', border: 'none', background: 'transparent', color: T.muted }} onClick={() => { setMode('none'); setText('') }}>Cancel</button>
              </form>
            )}
            <p style={{ margin: 0, fontSize: 12.5, color: T.muted }}>A skipped story goes to the back of the round. The round ends only when each one is answered.</p>
          </section>
        </div>
      )}
    </Page>
  )
}

export default function InboxReview() {
  return <Suspense fallback={null}><Review /></Suspense>
}
