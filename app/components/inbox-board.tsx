'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { moneyL } from '../../lib/costing-store'
import { DEPTS, deptLabel, type Dept } from '../../lib/findings'
import type { InboxUnit } from '../../lib/inbox'
import { useInbox, InboxRows } from './inbox'
import { T, tint, display } from './kit'

/* The Dashboard's inbox and its side panel. See InboxBoard below. */

type Tab = 'act' | 'plan' | 'watch' | 'later' | 'done'
const TAB_WORD: Record<Tab, string> = { act: 'Today', plan: 'This week', watch: 'Watch', later: 'Reminders', done: 'Answered' }
const TAB_NOTE: Record<Tab, string> = {
  act: 'Needs you today, before anything else.',
  plan: 'To sort out this week.',
  watch: 'Not urgent. Kept so a trend is not missed.',
  later: 'Put off to a date. Each comes back on its own.',
  done: 'Done, or set aside with a reason. Each keeps who answered it and when.',
}
const card: React.CSSProperties = { background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden', boxShadow: 'var(--x-card-shadow)' }

function groupBy<K extends string>(list: InboxUnit[], key: (u: InboxUnit) => K): [K, InboxUnit[]][] {
  const m = new Map<K, InboxUnit[]>()
  list.forEach(u => { const k = key(u); m.set(k, [...(m.get(k) ?? []), u]) })
  return Array.from(m.entries())
}

/* THE DASHBOARD INBOX
 *
 * Read like a mail inbox: one line a notification, newest-urgent first,
 * grouped by department under thin headings. Five tabs split the list by
 * when it needs you, and every tab shows its count, so nothing is out of
 * sight without being counted. One department picker narrows all of it.
 * A line opens in place to show the detail and the answers. */
export function InboxBoard() {
  const inbox = useInbox()
  const [dept, setDept] = useState<'all' | Dept>('all')
  const inDept = (u: InboxUnit) => dept === 'all' || u.depts.includes(dept)
  const open = inbox.open.filter(inDept)
  const lists: Record<Tab, InboxUnit[]> = {
    act: open.filter(u => u.severity === 'act'),
    plan: open.filter(u => u.severity === 'plan'),
    watch: open.filter(u => u.severity === 'watch'),
    later: inbox.reminders.filter(inDept),
    done: inbox.handled.filter(inDept),
  }
  const [tab, setTab] = useState<Tab>(lists.act.length ? 'act' : lists.plan.length ? 'plan' : 'watch')
  const list = lists[tab]
  const sum = (l: InboxUnit[]) => l.reduce((s, u) => s + (u.money ?? 0), 0)
  const total = inbox.units.filter(inDept).length
  const answered = total - open.filter(u => u.state === 'open').length - lists.later.length
  const deptsWith = DEPTS.filter(d => inbox.byDept[d.key].open > 0)

  return (
    <section aria-label="Inbox" style={card}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${T.line}` }}>
        <div role="tablist" aria-label="When it needs you" className="xpl-chips" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {(Object.keys(TAB_WORD) as Tab[]).map(k => {
            const on = tab === k
            const n = lists[k].length
            return (
              <button key={k} type="button" role="tab" aria-selected={on} onClick={() => setTab(k)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 36, padding: '0 12px', borderRadius: 9, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5,
                background: on ? tint(T.orange, 14) : 'transparent', color: on ? T.text : T.muted, fontWeight: on ? 700 : 500,
              }}>
                {TAB_WORD[k]}
                <span style={{ fontSize: 12, fontWeight: 700, minWidth: 20, padding: '1px 7px', borderRadius: 99, background: k === 'act' && n ? T.red : 'rgba(var(--x-ov),0.08)', color: k === 'act' && n ? '#fff' : T.muted }}>{n}</span>
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: T.muted }}>
            <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Department</span>
            <select value={dept} onChange={e => setDept(e.target.value as 'all' | Dept)} style={{ minHeight: 36, padding: '0 10px', borderRadius: 9, border: `1px solid ${T.border}`, background: T.card, color: T.text, fontFamily: 'inherit', fontSize: 13 }}>
              <option value="all">All departments · {inbox.open.length}</option>
              {deptsWith.map(d => <option key={d.key} value={d.key}>{d.label} · {inbox.byDept[d.key].open}{inbox.byDept[d.key].act ? ` (${inbox.byDept[d.key].act} today)` : ''}</option>)}
            </select>
          </label>
          {open.length > 0 && <Link href={`/admin/inbox${dept === 'all' ? '' : `?dept=${dept}`}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, padding: '0 13px', borderRadius: 9, background: T.orange, color: 'var(--x-on-accent)', fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>One by one<ArrowRight size={14} aria-hidden /></Link>}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '8px 16px', fontSize: 12.5, color: T.muted, background: 'rgba(var(--x-ov),0.02)', borderBottom: `1px solid ${T.line}` }}>
        <span>{TAB_NOTE[tab]}{sum(list) > 0 ? ` ${moneyL(sum(list))} on these.` : ''}</span>
        <span>Answered {answered} of {total}</span>
      </div>

      {list.length === 0 ? (
        <div style={{ padding: '26px 18px', textAlign: 'center', display: 'grid', gap: 6 }}>
          <span style={{ fontFamily: display, fontSize: 17, color: T.text }}>{tab === 'act' ? `Nothing needs you today${dept === 'all' ? '' : ` in ${deptLabel(dept)}`}` : tab === 'done' ? 'Nothing answered yet' : 'Nothing here'}</span>
          <span style={{ fontSize: 13, color: T.muted }}>{tab === 'act' && lists.plan.length ? `${lists.plan.length} to sort out this week.` : 'New findings appear the moment the record shows them.'}</span>
        </div>
      ) : (tab === 'later' || tab === 'done') ? <InboxRows units={list} /> : (
        groupBy(list, u => u.dept).map(([d, units]) => (
          <div key={d}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 16px', fontSize: 12, fontWeight: 700, letterSpacing: '0.03em', color: T.muted, background: 'rgba(var(--x-ov),0.035)', borderTop: `1px solid ${T.line}` }}>
              <span>{deptLabel(d).toUpperCase()} · {units.length}</span>{sum(units) > 0 && <span>{moneyL(sum(units))}</span>}
            </div>
            <InboxRows units={units} showDept={false} />
          </div>
        ))
      )}
    </section>
  )
}

/* The side panel: the morning in three lines, and where the money is. */
export function InboxSummary() {
  const inbox = useInbox()
  const act = inbox.open.filter(u => u.severity === 'act')
  const lines = groupBy(act, u => u.dept)
    .map(([d, units]) => ({ d, units, money: units.reduce((s, u) => s + (u.money ?? 0), 0) }))
    .sort((a, b) => b.money - a.money || b.units.length - a.units.length)
    .slice(0, 3)
  const money = DEPTS.map(d => ({ d, v: inbox.byDept[d.key].money })).filter(x => x.v > 0).sort((a, b) => b.v - a.v)
  const top = Math.max(1, ...money.map(m => m.v))
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <section style={{ background: 'var(--x-text)', color: 'var(--x-bg)', borderRadius: 10, padding: '16px 18px', display: 'grid', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--x-bg)', opacity: 0.75 }}>YOUR MORNING IN THREE LINES</h2>
        {lines.length === 0
          ? <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>Nothing needs action now. Plan and watch items are below.</p>
          : lines.map(l => (
            <p key={l.d} style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>
              <b>{deptLabel(l.d)}:</b> {l.units.length} to act on{l.money ? `, ${moneyL(l.money)}` : ''}. First: {l.units[0].title.replace(/\.$/, '')}.
            </p>
          ))}
      </section>
      {money.length > 0 && (
        <section style={{ ...card, padding: '14px 18px', display: 'grid', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 14, color: T.text }}>Where the money is</h2>
          {money.map(m => (
            <div key={m.d.key} style={{ display: 'grid', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: T.text }}><span>{m.d.label}</span><span style={{ fontWeight: 600 }}>{moneyL(m.v)}</span></div>
              <div aria-hidden style={{ height: 6, borderRadius: 999, background: 'rgba(var(--x-ov),0.07)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${(m.v / top) * 100}%`, background: T.orange }} /></div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
