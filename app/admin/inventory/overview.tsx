'use client'

import { useMemo, useState } from 'react'
import { useInventory, TODAY, COMPLETED_PROJECTS, PROJECTS, moneyL, type RigBurn } from '../../../lib/inventory-store'
import { runways, orderStages, stockBySite, type RunwayRow } from '../../../lib/stores-overview'
import { DeptInbox } from '../../components/inbox'
import { RigCountCard } from './rig-count'
import { PageHead, Card, Table, Empty, Status, T, tint, display, th, thR, td, tdR, tdStrong, rowLine, type Tone, num, eyebrow } from '../../components/kit'

/* ==========================================================================
 * STORES — the overview
 *
 * Opens on "will any rig stop for a part?": every part set against the next
 * delivery that could save it, drawn as a runway. Then the orders in flight
 * and what is sitting at each site. The inbox strip carries the answers; this
 * page carries the picture, so nothing is said twice.
 * ========================================================================== */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const day = (d?: string) => d ? `${Number(d.slice(8, 10))} ${MON[Number(d.slice(5, 7)) - 1]}` : '—'
const STATE: Record<RunwayRow['state'], { word: string; tone: Tone; color: string }> = {
  stops: { word: 'A rig will stop', tone: 'bad', color: T.red },
  tight: { word: 'Tight', tone: 'warn', color: T.amber },
  covered: { word: 'Covered', tone: 'good', color: T.green },
}

export function StoresOverview({ burn, rigsOn, used, go }: {
  burn: RigBurn[]
  rigsOn: (project: string) => string[]
  used: (rig: string, project: string) => { itemId: string; qty: number }[]
  go: (tab: 'Stock by site' | 'Orders' | 'Part life' | 'Catalogue') => void
}) {
  const { state } = useInventory()
  const rows = useMemo(() => runways(state.pos, state.catalogue, burn, TODAY, state.alerts.coverDays), [state.pos, state.catalogue, burn, state.alerts.coverDays])
  const stages = useMemo(() => orderStages(state.pos, TODAY), [state.pos])
  const sites = useMemo(() => stockBySite(state.pos, state.catalogue, state.rigKit, PROJECTS, COMPLETED_PROJECTS, rigsOn, used, TODAY, state.alerts), [state.pos, state.catalogue, state.rigKit, rigsOn, used, state.alerts])
  const [all, setAll] = useState(false)

  const stops = rows.filter(r => r.state === 'stops')
  const tight = rows.filter(r => r.state === 'tight')
  const late = stages.find(s => s.key === 'late')!
  const stranded = sites.filter(s => s.closed).reduce((t, s) => t + s.store, 0)
  const idle = sites.filter(s => !s.closed).reduce((t, s) => t + s.idle, 0)
  const inStore = sites.reduce((t, s) => t + s.store, 0)
  const onRigs = sites.reduce((t, s) => t + s.onRigs, 0)
  const totalBurn = burn.reduce((a, b) => a + b.metresPerDay, 0)
  /* The scale runs to the latest delivery, so the parts that matter are not squeezed by one that lasts months. */
  const horizon = Math.max(30, ...rows.map(r => r.arrives ? Math.round((new Date(r.arrives).getTime() - new Date(TODAY).getTime()) / 86400000) : 0)) * 1.15
  const shown = all ? rows : rows.filter(r => r.state !== 'covered').concat(rows.filter(r => r.state === 'covered').slice(0, 3))

  return (
    <>
      <PageHead question="Will any rig stop for a part?" tone={stops.length ? 'bad' : tight.length ? 'warn' : 'good'}
        answer={<>
          {stops.length ? <><b style={{ color: 'var(--x-bad-text)' }}>{stops.length} {stops.length === 1 ? 'part runs' : 'parts run'} out before the next delivery can arrive</b>: {stops.slice(0, 3).map(r => r.part.name).join(', ')}{stops.length > 3 ? ' and more' : ''}. </> : 'No part runs out before its next delivery. '}
          {late.pos.length ? `${late.pos.length} ${late.pos.length === 1 ? 'order is' : 'orders are'} late. ` : ''}
          {stranded + idle > 0 ? `${moneyL(stranded + idle)} of stock is sitting idle or on a closed site.` : ''}
          {' '}<span style={{ display: 'inline-block', fontSize: 11.5, fontWeight: 600, padding: '1px 8px', borderRadius: 99, background: tint(T.blue, 12), color: T.text }}>Demo data</span>
        </>} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <Stat label="Run out before delivery" value={String(stops.length)} bad={stops.length > 0} note={tight.length ? `${tight.length} more are tight` : 'Nothing else is tight'} />
        <Stat label="Orders late" value={String(late.pos.length)} bad={late.pos.length > 0} note={late.pos.length ? `${moneyL(late.value)} not yet in` : 'Every order on time'} onClick={() => go('Orders')} />
        <Stat label="Idle or stranded" value={moneyL(stranded + idle)} note={stranded ? `${moneyL(stranded)} on a closed site` : `Not moved in ${state.alerts.idleDays} days or more`} onClick={() => go('Stock by site')} />
        <Stat label="Stock you hold" value={moneyL(inStore + onRigs)} note={`${moneyL(inStore)} in stores, ${moneyL(onRigs)} on rigs`} onClick={() => go('Stock by site')} />
      </div>

      <DeptInbox depts={['stock']} name="Stores" />

      <Card title="Every part, against its next delivery" pad={false}
        subtitle={`How long the store lasts at today's wear (${totalBurn.toFixed(1)} m a day across your own rigs), and when more can arrive. Where the bar ends before the marker, a rig stands.`}>
        {rows.length === 0 ? <Empty>No wear rate yet: it comes from your own rigs' metres in the drill logs.</Empty> : (
          <>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: '10px 16px 4px', fontSize: 12, color: T.muted }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span aria-hidden style={{ width: 18, height: 8, borderRadius: 4, background: T.green }} />Days the store lasts</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span aria-hidden style={{ width: 2, height: 12, background: T.text }} />When more can arrive</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span aria-hidden style={{ width: 18, height: 8, borderRadius: 4, background: tint(T.red, 30) }} />Days a rig would stand</span>
            </div>
            {shown.map((r, i) => <RunwayLine key={r.part.id} r={r} horizon={horizon} first={i === 0} />)}
            {rows.length > shown.length || all ? (
              <button type="button" onClick={() => setAll(a => !a)} style={{ width: '100%', padding: '10px 16px', border: 'none', borderTop: rowLine, background: 'rgba(var(--x-ov),0.015)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: T.orange, cursor: 'pointer', textAlign: 'left' }}>
                {all ? 'Show only the ones that need a look' : `Show all ${rows.length} parts`}
              </button>
            ) : null}
          </>
        )}
      </Card>

      <RigCountCard />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(460px, 100%), 1fr))', gap: 16, alignItems: 'start' }}>
        <Card title="Orders in flight" subtitle="From draft to the store." right={<button type="button" onClick={() => go('Orders')} style={linkBtn}>Open orders →</button>}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
            {stages.map(s => (
              <div key={s.key} style={{ padding: '10px 12px', borderRadius: 10, background: s.key === 'late' && s.pos.length ? tint(T.red, 7) : 'rgba(var(--x-ov),0.035)', border: `1px solid ${s.key === 'late' && s.pos.length ? tint(T.red, 30) : 'transparent'}`, display: 'grid', gap: 3 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: s.key === 'late' && s.pos.length ? 'var(--x-bad-text)' : T.muted }}>{s.label}</span>
                <span style={{ ...num, fontSize: 20, fontWeight: 600, color: T.text }}>{s.pos.length}</span>
                <span style={{ fontSize: 11.5, color: T.faint }}>{s.value ? moneyL(s.value) : '—'}</span>
              </div>
            ))}
          </div>
          {late.pos.length > 0 && (
            <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
              {late.pos.map(po => (
                <div key={po.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
                  <span style={{ color: T.text }}><b>{po.number}</b> · {po.supplier}</span>
                  <span style={{ color: 'var(--x-bad-text)', fontWeight: 600, whiteSpace: 'nowrap' }}>promised {day(po.promisedDate)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Stock by site" subtitle="What is in each store and on its rigs." pad={false} right={<button type="button" onClick={() => go('Stock by site')} style={{ ...linkBtn, marginRight: 4 }}>Open →</button>}>
          <Table>
            <thead><tr><th style={th}>Site</th><th style={thR}>In the store</th><th style={thR}>On rigs</th><th style={thR}>Idle {state.alerts.idleDays}+ days</th></tr></thead>
            <tbody>
              {sites.map(s => (
                <tr key={s.project} style={{ borderTop: rowLine }}>
                  <td style={tdStrong}>{s.project}{s.closed && <div style={{ marginTop: 3 }}><Status tone="warn">Closed: move what is left</Status></div>}</td>
                  <td style={tdR}>{s.store ? moneyL(s.store) : '—'}</td>
                  <td style={tdR}>{s.onRigs ? moneyL(s.onRigs) : '—'}</td>
                  <td style={{ ...tdR, color: s.idle ? 'var(--x-bad-text)' : T.muted, fontWeight: s.idle ? 600 : 400 }}>{s.idle ? moneyL(s.idle) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  )
}

const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: T.orange, fontWeight: 600, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }

function Stat({ label, value, note, bad, onClick }: { label: string; value: string; note: string; bad?: boolean; onClick?: () => void }) {
  const style: React.CSSProperties = { textAlign: 'left', fontFamily: 'inherit', cursor: onClick ? 'pointer' : 'default', background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '13px 16px', display: 'grid', gap: 6, boxShadow: bad ? 'inset 3px 0 0 var(--x-red)' : 'var(--x-card-shadow)' }
  const inner = <>
    <span style={{ ...eyebrow, color: bad ? 'var(--x-bad-text)' : 'var(--x-faint)' }}>{label}</span>
    <span style={{ ...num, fontSize: 24, fontWeight: 600, color: bad ? 'var(--x-bad-text)' : T.text }}>{value}</span>
    <span style={{ fontSize: 12, color: T.faint, lineHeight: 1.45 }}>{note}</span>
  </>
  return onClick ? <button type="button" onClick={onClick} style={style}>{inner}</button> : <div style={style}>{inner}</div>
}

function RunwayLine({ r, horizon, first }: { r: RunwayRow; horizon: number; first: boolean }) {
  const s = STATE[r.state]
  const arriveIn = r.arrives ? Math.max(0, Math.round((new Date(r.arrives).getTime() - new Date(TODAY).getTime()) / 86400000)) : null
  const pct = (d: number) => `${Math.min(100, (d / horizon) * 100)}%`
  const why = r.inStore === 0 ? 'None in the store.' : `${r.inStore} in the store lasts ${r.daysLeft} ${r.daysLeft === 1 ? 'day' : 'days'}, to ${day(r.runsOutOn)}.`
  const next = r.arrivesFrom === 'order'
    ? (r.lateDays ? `${r.onOrder} on order, ${r.lateDays} days late${r.inStore === 0 ? ': a rig that needs it stands until it comes' : ''}.` : `${r.onOrder} on order, promised ${day(r.arrives)}.`)
    : `Nothing on order: ordered today it arrives ${day(r.arrives)} (${r.part.leadTimeDays}-day lead).`
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 260px) minmax(0, 1fr) auto', gap: 14, alignItems: 'center', padding: '11px 16px', borderTop: first ? 'none' : rowLine }} className="xpl-runway">
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.part.name}</div>
        <div style={{ fontSize: 12, color: T.faint }}>{r.part.partNumber} · {r.part.supplier}</div>
      </div>
      <div style={{ display: 'grid', gap: 5, minWidth: 0 }}>
        <div aria-hidden style={{ position: 'relative', height: 12, borderRadius: 99, background: 'rgba(var(--x-ov),0.06)' }}>
          {r.gapDays > 0 && <div style={{ position: 'absolute', left: pct(r.daysLeft), width: `calc(${pct(arriveIn ?? 0)} - ${pct(r.daysLeft)})`, top: 0, bottom: 0, background: tint(T.red, 30), borderRadius: 99 }} />}
          <div style={{ position: 'absolute', left: 0, width: pct(r.daysLeft), minWidth: r.daysLeft > 0 ? 4 : 0, top: 0, bottom: 0, background: s.color, borderRadius: 99 }} />
          {r.daysLeft > horizon && <span style={{ position: 'absolute', right: 6, top: -1, fontSize: 10, color: '#fff', fontWeight: 700 }}>→</span>}
          {arriveIn != null && <div style={{ position: 'absolute', left: pct(arriveIn), top: -3, bottom: -3, width: 2, background: T.text }} />}
        </div>
        <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.45 }}>{why} {next}{r.gapDays > 0 ? <b style={{ color: 'var(--x-bad-text)' }}> A rig stands about {r.gapDays} {r.gapDays === 1 ? 'day' : 'days'}.</b> : null}</div>
      </div>
      <Status tone={s.tone}>{s.word}</Status>
    </div>
  )
}
