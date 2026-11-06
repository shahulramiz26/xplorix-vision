'use client'

import Link from 'next/link'
import { money, COMPANY_NAME } from '../../lib/costing-store'
import { TODAY, addDays } from '../../lib/inventory-store'
import { useClient, CLIENT_HOLE, type ClientShift } from '../../lib/client-view'
import { payable } from '../../lib/client-record'
import { day, when } from '../../lib/projects'
import { T, tint, Page, PageHead, Card, Tile, Grid, Status, Empty, DepthBar, rowLine, toneColor, type Tone } from '../components/kit'

/* ==========================================================================
 * TODAY — what is happening on the client's projects, as it happens
 *
 * A client's first problem is not a lack of charts; it is finding out late.
 * So this screen opens on what needs his decision, then shows every rig on
 * his sites today, then lists each thing that happened as a notification:
 * a shift logged, a hole finished, a stop he is being charged standby for,
 * an incident, an invoice, a change to the project.
 * ========================================================================== */

const n1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString('en-US')
interface Item { at: string; tone: Tone; title: string; detail?: string; href?: string; project: string }

function stopWords(s: ClientShift) {
  return s.stops.map(x => `${x.hours} h ${x.mine ? 'standby' : 'their own stop'}: ${x.reason}`).join(' · ')
}

export default function ClientToday() {
  const c = useClient()
  const { state } = c
  const yesterday = addDays(TODAY, -1)
  const todays = c.shifts.filter(s => s.date === TODAY)
  const yest = c.shifts.filter(s => s.date === yesterday)
  const metresToday = todays.reduce((s, x) => s + x.metres, 0)
  const metresYest = yest.reduce((s, x) => s + x.metres, 0)
  const standbyToday = todays.reduce((s, x) => s + x.standbyHours, 0)

  // Every rig on his sites, and what it did today.
  const rigRows = c.projects.filter(p => p.status === 'active').flatMap(p => {
    const rigs = Array.from(new Set([...p.rigs, ...state.workOrders.filter(w => w.project === p.name && w.status === 'active').flatMap(w => w.rigs)]))
    return rigs.map(rig => {
      const mine = todays.filter(s => s.rig === rig && s.project === p.name)
      const last = c.shifts.find(s => s.rig === rig && s.project === p.name && s.hole)
      const hole = c.holes.find(h => h.id === (mine.find(s => s.hole)?.hole ?? last?.hole))
      const status: { tone: Tone; word: string } = mine.length === 0 ? { tone: 'neutral', word: 'No shift logged yet' }
        : mine.some(s => s.drillingHours > 0) ? { tone: 'good', word: 'Drilling' }
        : mine.some(s => s.breakdownHours > 0) ? { tone: 'bad', word: 'Stopped, their own' } : { tone: 'warn', word: 'On standby' }
      return { p, rig, mine, hole, status }
    })
  })
  const drilling = rigRows.filter(r => r.status.word === 'Drilling').length

  // What needs him.
  const decisions = [
    ...c.holesWaiting.map(h => ({ key: `h${h.id}`, title: `Hole ${h.id} is waiting for your approval`, detail: `${h.project} · ${n1(h.drilled)} m drilled · ${money(h.value)} at your contract rates${h.submittedAt ? ` · sent ${day(h.submittedAt)}` : ''}`, href: `/client/holes/${encodeURIComponent(h.id)}`, action: 'Review hole' })),
    ...c.toVerify.map(i => ({ key: `i${i.id}`, title: `Invoice ${i.number} is waiting for you to check`, detail: `${i.project} · ${money(i.total)} including tax · due ${day(i.due)}`, href: `/client/invoices?open=${encodeURIComponent(i.id)}`, action: 'Check invoice' })),
    ...c.inbox.waiting.map(r => ({ key: `r${r.id}`, title: 'New contract rates are proposed', detail: `${r.project} · would start ${day(r.rate.effectiveFrom)}${r.rate.note ? ` · ${r.rate.note}` : ''}`, href: `/client/projects/${state.projects.find(p => p.name === r.project)?.id}?tab=rates`, action: 'See the change' })),
  ]

  // Everything that happened today and yesterday, newest first.
  const items: Item[] = []
  ;[...todays, ...yest].forEach(s => {
    const at = s.loggedAt ?? `${s.date}T${s.shift === 'Day' ? '18:30' : '23:55'}`
    const href = s.hole ? `/client/holes/${encodeURIComponent(s.hole)}` : '/client/operations'
    if (s.metres > 0) items.push({ at, tone: 'info', project: s.project, href,
      title: `${s.rig} ${s.shift.toLowerCase()} shift: ${n1(s.metres)} m on ${s.hole}`,
      detail: `${n1(s.from ?? 0)} to ${n1(s.to ?? 0)} m · core recovery ${s.recoveryPct?.toFixed(0)}%${s.drillingHours ? ` · ${s.drillingHours} h drilling` : ''}${s.driller ? ` · driller ${s.driller}` : ''}` })
    else items.push({ at, tone: 'neutral', project: s.project, href, title: `${s.rig} ${s.shift.toLowerCase()} shift: no metres`, detail: stopWords(s) || `${s.drillingHours} h worked` })
    if (s.standbyHours > 0) items.push({ at, tone: 'warn', project: s.project, href: '/client/operations',
      title: `${s.rig}: ${s.standbyHours} h of standby claimed`, detail: `${s.stops.filter(x => x.mine).map(x => x.reason).join(', ')} · a full day of standby is charged at the standby rate` })
    if (s.breakdownHours > 0 && s.metres > 0) items.push({ at, tone: 'neutral', project: s.project, href: '/client/operations',
      title: `${s.rig}: ${s.breakdownHours} h lost to ${COMPANY_NAME}’s own stop`, detail: `${s.stops.filter(x => !x.mine).map(x => x.reason).join(', ')} · not charged to you` })
    if (s.holeClosed && s.hole) items.push({ at, tone: 'good', project: s.project, href: `/client/holes/${encodeURIComponent(s.hole)}`, title: `Hole ${s.hole} was finished at ${n1(s.to ?? 0)} m`, detail: 'It will come to you for approval before it is invoiced.' })
    s.incidents.forEach(x => items.push({ at, tone: 'bad', project: s.project, href: '/client/operations', title: `Incident on ${s.rig}: ${x.type}, ${x.severity.toLowerCase()}`, detail: x.note || undefined }))
  })
  c.holes.filter(h => h.submittedAt && h.submittedAt.slice(0, 10) >= yesterday).forEach(h => items.push({ at: h.submittedAt!.length > 10 ? h.submittedAt! : `${h.submittedAt}T12:00`, tone: 'warn', project: h.project, href: `/client/holes/${encodeURIComponent(h.id)}`, title: `Hole ${h.id} sent to you for approval`, detail: `${n1(h.drilled)} m · ${money(h.value)}` }))
  c.invoices.filter(i => i.date >= yesterday).forEach(i => items.push({ at: `${i.date}T12:00`, tone: 'warn', project: i.project, href: `/client/invoices?open=${encodeURIComponent(i.id)}`, title: `Invoice ${i.number} received`, detail: `${money(i.total)} including tax · payable ${money(payable(i))}` }))
  c.events.filter(e => e.by === 'contractor' && e.at.slice(0, 10) >= yesterday).forEach(e => items.push({ at: e.at, tone: 'info', project: e.project, href: `/client/projects/${state.projects.find(p => p.name === e.project)?.id}?tab=changes`, title: e.title, detail: e.detail }))
  items.sort((a, b) => b.at.localeCompare(a.at))
  const groups = [{ label: 'Today', list: items.filter(i => i.at.slice(0, 10) === TODAY) }, { label: 'Yesterday', list: items.filter(i => i.at.slice(0, 10) === yesterday) }]

  if (c.projects.length === 0) {
    return <Page><PageHead question="What is happening today?" answer={<>{COMPANY_NAME} has not shown you a project yet. It appears here the moment they do.</>} /></Page>
  }

  return (
    <Page>
      <PageHead question="What is happening on my projects today?"
        tone={decisions.length ? 'warn' : 'good'}
        answer={<>
          {drilling} of {rigRows.length} {rigRows.length === 1 ? 'rig is' : 'rigs are'} drilling, with {n1(metresToday)} m logged so far today{metresYest ? ` (${n1(metresYest)} m yesterday)` : ''}.{' '}
          {decisions.length ? <b style={{ color: T.text }}>{decisions.length} {decisions.length === 1 ? 'thing is' : 'things are'} waiting for your decision.</b> : 'Nothing is waiting for your decision.'}
        </>} />

      <Grid min={200}>
        <Tile label="Metres logged today" value={`${n1(metresToday)} m`} note={metresYest ? `${n1(metresYest)} m yesterday` : 'No shifts yesterday'} />
        <Tile label="Rigs drilling" value={`${drilling} of ${rigRows.length}`} note={rigRows.filter(r => r.mine.length === 0).length ? `${rigRows.filter(r => r.mine.length === 0).length} with no shift logged yet` : 'Every rig has logged today'} />
        <Tile label="Waiting for you" value={decisions.length} tone={decisions.length ? 'warn' : 'good'} note={decisions.length ? [[c.holesWaiting.length, 'hole'], [c.toVerify.length, 'invoice'], [c.inbox.waiting.length, 'rate change']].filter(([n]) => n).map(([n, w]) => `${n} ${w}${n === 1 ? '' : 's'}`).join(' · ') : 'Nothing to decide'} />
        <Tile label="Standby claimed today" value={`${standbyToday} h`} tone={standbyToday ? 'warn' : undefined} note={standbyToday ? `Stops ${COMPANY_NAME} says are not theirs` : 'No standby claimed'} />
      </Grid>

      {decisions.length > 0 && (
        <Card title={`Needs your decision · ${decisions.length}`} pad={false}>
          {decisions.map((d, i) => (
            <Link key={d.key} href={d.href} className="xpl-row" style={{ display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px', borderTop: i ? rowLine : undefined, textDecoration: 'none', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0, flex: '1 1 360px' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}><span aria-hidden style={{ color: T.amber, fontWeight: 800, marginRight: 8 }}>!</span>{d.title}</div>
                <div style={{ fontSize: 12.5, color: T.muted, marginTop: 3, paddingLeft: 17 }}>{d.detail}</div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.orange, whiteSpace: 'nowrap' }}>{d.action} →</span>
            </Link>
          ))}
        </Card>
      )}

      <Card title="On site today" subtitle="Every rig on your projects, from the shift logs. A rig with no log yet has not finished its shift, or has not reported." pad={false}>
        {rigRows.length === 0 && <Empty>No rig is on your projects at the moment.</Empty>}
        {rigRows.map(({ p, rig, mine, hole, status }, i) => {
          const metres = mine.reduce((s, x) => s + x.metres, 0)
          const stops = mine.flatMap(s => s.stops)
          return (
            <div key={p.id + rig} className="xpl-prow" style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 0.9fr) minmax(170px, 1fr) minmax(0, 2fr)', gap: 18, padding: '14px 18px', borderTop: i ? rowLine : undefined, alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: T.text }}>{rig}</div>
                <div style={{ fontSize: 12, color: T.faint, marginTop: 2 }}>{p.code} · {p.name}</div>
                <div style={{ marginTop: 7 }}><Status tone={status.tone}>{status.word}</Status></div>
              </div>
              <div>
                {hole ? <>
                  <div style={{ fontSize: 12, color: T.faint, marginBottom: 5 }}>Hole <Link href={`/client/holes/${encodeURIComponent(hole.id)}`} style={{ color: T.text, fontWeight: 600, textDecoration: 'none' }}>{hole.id}</Link> · {CLIENT_HOLE[hole.status].label}</div>
                  <DepthBar drilled={hole.drilled} planned={hole.planned} width="100%" />
                </> : <span style={{ fontSize: 13, color: T.faint }}>Not on a hole</span>}
              </div>
              <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.6, minWidth: 0 }}>
                {mine.length === 0 ? <span style={{ color: T.faint }}>Nothing logged for today yet.</span> : <>
                  <div><b style={{ color: T.text }}>{n1(metres)} m today</b>{mine.filter(s => s.metres > 0).map(s => ` · ${s.shift.toLowerCase()} ${n1(s.from ?? 0)}–${n1(s.to ?? 0)} m, core ${s.recoveryPct?.toFixed(0)}%`).join('')}</div>
                  <div>{mine.reduce((s, x) => s + x.drillingHours, 0)} h drilling · crew of {Math.max(...mine.map(s => s.crew), 0)}{mine[0]?.supervisor ? ` · supervisor ${mine[0].supervisor}` : ''}</div>
                  {stops.map((x, k) => (
                    <div key={k}><span aria-hidden style={{ color: x.mine ? T.amber : T.faint, fontWeight: 800, marginRight: 6 }}>{x.mine ? '!' : '•'}</span>{x.hours} h {x.mine ? 'standby claimed' : 'stopped, their own'}: {x.reason}{x.mine ? '' : ' (not charged)'}</div>
                  ))}
                </>}
              </div>
            </div>
          )
        })}
      </Card>

      <Card title="Notifications" subtitle="Everything that happened on your projects today and yesterday, newest first." pad={false}>
        {items.length === 0 && <Empty>Nothing has happened in the last two days.</Empty>}
        {groups.filter(g => g.list.length).map(g => (
          <div key={g.label}>
            <div style={{ padding: '9px 18px', fontSize: 11.5, fontWeight: 700, color: T.faint, letterSpacing: '0.06em', textTransform: 'uppercase', background: 'rgba(var(--x-ov),0.03)', borderTop: rowLine, borderBottom: rowLine }}>{g.label} · {g.list.length}</div>
            {g.list.map((it, i) => {
              const body = (
                <>
                  <span aria-hidden style={{ width: 9, height: 9, borderRadius: '50%', background: toneColor[it.tone], flexShrink: 0, marginTop: 6, boxShadow: `0 0 0 3px ${tint(toneColor[it.tone], 18)}` }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{it.title}</div>
                    {it.detail && <div style={{ fontSize: 12.5, color: T.muted, marginTop: 2, lineHeight: 1.5 }}>{it.detail}</div>}
                  </div>
                  <div style={{ fontSize: 12, color: T.faint, whiteSpace: 'nowrap', textAlign: 'right' }}>{when(it.at).replace(/^Today, /, '')}<div>{state.projects.find(p => p.name === it.project)?.code}</div></div>
                </>
              )
              const style: React.CSSProperties = { display: 'flex', gap: 13, alignItems: 'flex-start', padding: '11px 18px', borderTop: i ? rowLine : undefined, textDecoration: 'none' }
              return it.href ? <Link key={i} href={it.href} className="xpl-row" style={style}>{body}</Link> : <div key={i} style={style}>{body}</div>
            })}
          </div>
        ))}
      </Card>

      <div style={{ fontSize: 12.5, color: T.faint, lineHeight: 1.6, maxWidth: 820 }}>
        Read from {COMPANY_NAME}&rsquo;s own shift record as each log is saved. You see what happened on the rig and what you are charged; their costs and margin are not part of it.
      </div>
    </Page>
  )
}
