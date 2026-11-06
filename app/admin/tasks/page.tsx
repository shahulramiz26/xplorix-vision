'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, ArrowRight, X } from 'lucide-react'
import { moneyL } from '../../../lib/costing-store'
import { TODAY, addDays } from '../../../lib/inventory-store'
import { DEPTS, deptLabel, type Dept } from '../../../lib/findings'
import { placeTasks, DEPT_COLOR, type TaskItem } from '../../../lib/tasks'
import { useInbox, UnitActions } from '../../components/inbox'
import { Page, T, tint, display, useEscape, num, Seg, Tile } from '../../components/kit'
import { TaskAi } from '../../components/ai'

/* ==========================================================================
 * TASKS — every notification on the day it is due
 *
 * Opens by asking which department, or all of them. All of them: each
 * department has its own colour. One department: its own tasks only, one
 * colour, nothing to tell apart. Week, month or a plain list. A task opens
 * to its detail and three answers: Done, Move to another day, Not relevant.
 * ========================================================================== */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const dnum = (d: string) => Number(d.slice(8, 10))
const dword = (d: string) => `${dnum(d)} ${MON[Number(d.slice(5, 7)) - 1]}`
const weekday = (d: string) => (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7   // Monday 0
const mondayOf = (d: string) => addDays(d, -weekday(d))
type View = 'week' | 'month' | 'list'

export default function TasksRoute() {
  return <Suspense fallback={null}><Tasks /></Suspense>
}

function Tasks() {
  const router = useRouter()
  const params = useSearchParams()
  const inbox = useInbox()
  const deptParam = params.get('dept')
  /* One department, or a department screen's own set ("operations,geology"),
   * which shows in the first one's colour. */
  const group = (deptParam ?? '').split(',').filter(k => DEPTS.some(d => d.key === k)) as Dept[]
  // No chooser: Tasks opens on every department, filtered by the chips below.
  const dept = (!deptParam || deptParam === 'all' ? 'all' : group[0] ?? 'all') as 'all' | Dept
  const inGroup = (ds: Dept[]) => dept === 'all' || ds.some(d => (group.length ? group : [dept as Dept]).includes(d))
  const [view, setView] = useState<View>('week')
  const [anchor, setAnchor] = useState(TODAY)
  const [openId, setOpenId] = useState<string | null>(params.get('open'))

  const all = useMemo(() => placeTasks(inbox.open, inbox.reminders, TODAY), [inbox.open, inbox.reminders])
  const counts = useMemo(() => {
    const m: Record<string, { n: number; today: number }> = {}
    all.forEach(t => t.u.depts.forEach(d => { const e = (m[d] ||= { n: 0, today: 0 }); e.n++; if (t.date <= TODAY) e.today++ }))
    return m
  }, [all])
  const pick = (d: 'all' | Dept) => router.push(`/admin/tasks?dept=${d}`)

  const mine = all.filter(t => inGroup(t.u.depts))
  const colorOf = (t: TaskItem) => dept === 'all' ? DEPT_COLOR[t.u.dept] ?? T.orange : DEPT_COLOR[dept] ?? T.orange
  const open = mine.find(t => t.u.id === openId) ?? null
  // The week runs from the chosen day for seven days, so today is always first and nothing past is in the way.
  const start = view === 'week' ? anchor : mondayOf(`${anchor.slice(0, 7)}-01`)
  const days = Array.from({ length: view === 'week' ? 7 : 42 }, (_, i) => addDays(start, i))
  const on = (d: string) => mine.filter(t => t.date === d)
  const late = mine.filter(t => t.when === 'late').length
  const title = view === 'month' ? `${MON[Number(anchor.slice(5, 7)) - 1]} ${anchor.slice(0, 4)}` : `${dword(days[0])} – ${dword(days[6])}`
  const step = (k: number) => setAnchor(view === 'month' ? (() => { const d = new Date(`${anchor.slice(0, 7)}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + k); return d.toISOString().slice(0, 10) })() : addDays(anchor, 7 * k))

  return (
    <Page>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: display, fontSize: 22, fontWeight: 600, color: T.text }}>Tasks</h1>
          <p style={{ margin: '5px 0 0', fontSize: 13.5, color: T.muted }}>Everything XPLORIX found that needs a person, on the day it is due. A dashed task has no date in the record; XPLORIX suggests one.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Seg<View> value={view} onChange={setView} options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'list', label: 'List' }]} />
          <Link href={`/admin/inbox${dept === 'all' ? '' : `?dept=${group.join(',')}`}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, padding: '0 14px', borderRadius: 7, background: T.orange, color: 'var(--x-on-accent)', fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>Go through them one by one<ArrowRight size={14} aria-hidden /></Link>
        </div>
      </div>

      {/* The work at a glance, for the departments picked. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: 12 }}>
        <Tile label="For today" value={String(mine.filter(t => t.date <= TODAY).length)} tone={late ? 'bad' : undefined} note={late ? `${late} of them late` : 'None of them late'} />
        <Tile label="Rest of this week" value={String(mine.filter(t => t.date > TODAY && t.date <= addDays(TODAY, 6)).length)} note="Due or suggested in the next 6 days" />
        <Tile label="Act now" value={String(mine.filter(t => t.u.severity === 'act').length)} note={`${mine.filter(t => t.u.severity === 'plan').length} to plan for, ${mine.filter(t => t.u.severity === 'watch').length} to watch`} />
        <Tile label="Money at stake" value={moneyL(mine.reduce((sum, t) => sum + (t.u.money ?? 0), 0))} note={`Across ${mine.length} ${mine.length === 1 ? 'task' : 'tasks'}`} />
      </div>

      <nav aria-label="Departments" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[{ key: 'all' as const, label: 'All departments', color: T.orange }, ...DEPTS.filter(d => counts[d.key]?.n).map(d => ({ key: d.key, label: d.label, color: DEPT_COLOR[d.key] }))].map(d => {
          const on = d.key === 'all' ? dept === 'all' : dept !== 'all' && (group.length ? group : [dept]).includes(d.key)
          const n = d.key === 'all' ? all.length : counts[d.key].n
          const today = d.key === 'all' ? all.filter(t => t.date <= TODAY).length : counts[d.key].today
          return (
            <button key={d.key} type="button" aria-pressed={on} onClick={() => pick(d.key)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 34, padding: '0 11px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: on ? 600 : 500,
              background: on ? T.card : 'transparent', color: on ? T.text : T.muted,
              border: `1px solid ${on ? 'var(--x-border3)' : T.border}`, boxShadow: on ? `inset 0 -2px 0 ${d.color}` : 'none',
            }}>
              <span aria-hidden style={{ width: 9, height: 9, borderRadius: 2, background: d.color }} />{d.label}
              <span style={{ ...num, fontSize: 11.5, color: T.faint }}>{n}</span>
              {today > 0 && <span style={{ ...num, fontSize: 11, fontWeight: 600, color: '#fff', background: '#DC2626', borderRadius: 4, padding: '0 5px' }}>{today}</span>}
            </button>
          )
        })}
      </nav>

      {view !== 'list' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" aria-label="Back" onClick={() => step(-1)} style={navBtn}><ChevronLeft size={16} /></button>
          <button type="button" onClick={() => setAnchor(TODAY)} style={{ ...navBtn, width: 'auto', padding: '0 12px', fontSize: 13, fontWeight: 600 }}>Today</button>
          <button type="button" aria-label="Forward" onClick={() => step(1)} style={navBtn}><ChevronRight size={16} /></button>
          <span style={{ fontFamily: display, fontSize: 17, fontWeight: 700, color: T.text, marginLeft: 6 }}>{title}</span>
        </div>
      )}

      {view === 'week' && (
        <div className="xpl-week" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 8 }}>
          {days.map(d => <DayCol key={d} d={d} items={on(d)} colorOf={colorOf} onOpen={setOpenId} />)}
        </div>
      )}

      {view === 'month' && (
        <div className="xpl-month" style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', borderBottom: `1px solid ${T.line}` }}>
            {WD.map(w => <div key={w} style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700, color: T.muted }}>{w}</div>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
            {days.map((d, i) => {
              const items = on(d)
              const other = d.slice(0, 7) !== anchor.slice(0, 7)
              return (
                <div key={d} style={{ minHeight: 108, padding: 6, borderTop: i >= 7 ? `1px solid ${T.line}` : 'none', borderLeft: i % 7 ? `1px solid ${T.line}` : 'none', background: d === TODAY ? tint(T.orange, 6) : other ? 'rgba(var(--x-ov),0.02)' : undefined, display: 'grid', alignContent: 'start', gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: d === TODAY ? 800 : 600, color: d === TODAY ? T.orange : other ? T.faint : T.text }}>{dnum(d)}</span>
                  {items.slice(0, 3).map(t => <Chip key={t.u.id} t={t} color={colorOf(t)} onOpen={setOpenId} small />)}
                  {items.length > 3 && <button type="button" onClick={() => { setAnchor(d); setView('week') }} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', fontSize: 11.5, fontWeight: 600, color: T.orange, cursor: 'pointer', fontFamily: 'inherit' }}>+{items.length - 3} more</button>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {view === 'list' && (
        <div style={{ display: 'grid', gap: 14 }}>
          {Array.from(new Set(mine.map(t => t.date))).sort().map(d => (
            <section key={d} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '9px 14px', fontSize: 13, fontWeight: 700, color: d === TODAY ? T.orange : T.text, borderBottom: `1px solid ${T.line}`, background: 'rgba(var(--x-ov),0.025)' }}>
                {d === TODAY ? 'Today' : `${WD[weekday(d)]} ${dword(d)}`} · {on(d).length}
              </div>
              <div style={{ padding: 8, display: 'grid', gap: 6 }}>{on(d).map(t => <Chip key={t.u.id} t={t} color={colorOf(t)} onOpen={setOpenId} />)}</div>
            </section>
          ))}
        </div>
      )}

      {open && <TaskPanel t={open} color={colorOf(open)} onClose={() => setOpenId(null)} />}
    </Page>
  )
}

const navBtn: React.CSSProperties = { width: 36, height: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9, border: `1px solid ${T.border}`, background: T.card, color: T.text, cursor: 'pointer', fontFamily: 'inherit' }

function DayCol({ d, items, colorOf, onOpen }: { d: string; items: TaskItem[]; colorOf: (t: TaskItem) => string; onOpen: (id: string) => void }) {
  const isToday = d === TODAY
  const [more, setMore] = useState(false)
  const money = items.reduce((s, t) => s + (t.u.money ?? 0), 0)
  return (
    <section aria-label={`${WD[weekday(d)]} ${dword(d)}`} style={{ background: isToday ? T.card : 'color-mix(in srgb, var(--x-card) 60%, transparent)', border: `1px solid ${T.border}`, borderTop: `3px solid ${isToday ? T.orange : 'var(--x-border3)'}`, borderRadius: 10, minHeight: 240, display: 'grid', alignContent: 'start', gap: 6, padding: 8 }}>
      <div style={{ display: 'grid', gap: 1, padding: '2px 4px 6px', borderBottom: `1px solid ${T.line}`, marginBottom: 2 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: isToday ? T.orange : T.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{isToday ? 'Today' : WD[weekday(d)]}</span>
          <span style={{ ...num, fontSize: 17, fontWeight: 600, color: T.text }}>{dnum(d)}</span>
        </div>
        <span style={{ ...num, fontSize: 11, color: T.faint }}>{items.length ? `${items.length} · ${money ? moneyL(money) : 'no money'}` : '—'}</span>
      </div>
      {items.length === 0 ? <span style={{ fontSize: 12, color: T.faint, padding: '0 4px' }}>Nothing due</span> : (more ? items : items.slice(0, CAP)).map(t => <Chip key={t.u.id} t={t} color={colorOf(t)} onOpen={onOpen} />)}
      {items.length > CAP && <button type="button" onClick={() => setMore(m => !m)} style={{ minHeight: 32, border: `1px dashed ${T.border}`, borderRadius: 7, background: 'transparent', color: T.orange, fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>{more ? 'Show fewer' : `Show ${items.length - CAP} more`}</button>}
    </section>
  )
}

const CAP = 7
const SEV_DOT: Record<string, string> = { act: 'var(--x-red)', plan: 'var(--x-amber)', watch: 'var(--x-faint)' }

function Chip({ t, color, onOpen, small }: { t: TaskItem; color: string; onOpen: (id: string) => void; small?: boolean }) {
  const dashed = t.when === 'suggested'
  const tag = t.when === 'late' ? `Late since ${dword(t.lateFrom!)}` : t.when === 'moved' ? 'Moved here' : t.when === 'due' ? 'Due' : 'Suggested'
  return (
    <button type="button" onClick={() => onOpen(t.u.id)} title={t.u.title} className="xpl-row"
      style={{ textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', display: 'grid', gap: 4, padding: small ? '4px 6px 4px 8px' : '7px 8px 7px 10px', borderRadius: 7,
        border: `1px ${dashed ? 'dashed' : 'solid'} ${dashed ? 'var(--x-border3)' : T.border}`, boxShadow: `inset 3px 0 0 ${color}`, background: T.card, minWidth: 0 }}>
      <span style={{ fontSize: small ? 11.5 : 12.5, fontWeight: 600, color: T.text, lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: small ? 'nowrap' : 'normal', display: small ? 'block' : '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{t.u.title}</span>
      {!small && <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: t.when === 'late' ? 'var(--x-bad-text)' : T.faint, fontWeight: t.when === 'late' ? 600 : 400 }}>
        <span aria-label={t.u.severity} style={{ width: 6, height: 6, borderRadius: 9, background: SEV_DOT[t.u.severity], flexShrink: 0 }} />
        {tag}{t.u.money ? <span style={{ ...num, marginLeft: 'auto', color: T.text, fontWeight: 600 }}>{moneyL(t.u.money)}</span> : null}
      </span>}
    </button>
  )
}

function TaskPanel({ t, color, onClose }: { t: TaskItem; color: string; onClose: () => void }) {
  useEscape(onClose)
  // Once it is answered or moved, the panel has done its job.
  const was = useRef(`${t.date}|${t.u.state}`)
  useEffect(() => { if (`${t.date}|${t.u.state}` !== was.current) onClose() }, [t.date, t.u.state, onClose])
  const u = t.u
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(var(--x-shadow),0.45)', display: 'flex', justifyContent: 'flex-end' }}>
      <aside role="dialog" aria-modal aria-label={u.title} onClick={e => e.stopPropagation()} style={{ width: 'min(560px, 100%)', height: '100%', overflowY: 'auto', background: T.card, borderLeft: `5px solid ${color}`, padding: '18px 20px', display: 'grid', alignContent: 'start', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color }}>{deptLabel(u.dept).toUpperCase()}</span>
          <button type="button" aria-label="Close" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.muted, padding: 0 }}><X size={18} /></button>
        </div>
        <h2 style={{ margin: 0, fontFamily: display, fontSize: 19, color: T.text, lineHeight: 1.3 }}>{u.title}</h2>
        <div style={{ fontSize: 12.5, color: t.when === 'late' ? 'var(--x-bad-text)' : T.muted, fontWeight: t.when === 'late' ? 700 : 400 }}>
          {t.when === 'late' ? `Was due ${dword(t.lateFrom!)}, still open` : t.when === 'due' ? `Due ${t.date === TODAY ? 'today' : dword(t.date)}` : t.when === 'moved' ? `Moved to ${dword(t.date)}` : `No date in the record. XPLORIX suggests ${t.date === TODAY ? 'today' : dword(t.date)}.`}
          {u.money ? ` · ${moneyL(u.money)}${u.moneyNote ? ` ${u.moneyNote}` : ''}` : ''}
        </div>
        {u.items.length > 1 ? (
          <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4, fontSize: 13.5, color: T.text, lineHeight: 1.5 }}>{u.items.map(f => <li key={f.id}>{f.title}</li>)}</ol>
        ) : <p style={{ margin: 0, fontSize: 13.5, color: T.muted, lineHeight: 1.6 }}>{u.detail}</p>}
        <TaskAi u={u} />
        <div style={{ paddingTop: 6 }}><UnitActions u={u} moveWord="Move to…" /></div>
      </aside>
    </div>
  )
}
