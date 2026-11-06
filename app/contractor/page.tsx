'use client'

import Link from 'next/link'
import { monthOf, shiftMonth, monthLabel, isOwnStop } from '../../lib/costing-store'
import { TODAY, addDays } from '../../lib/inventory-store'
import { workOrderProgress, unbilled } from '../../lib/contracting'
import { day } from '../../lib/projects'
import { T, tint, Page, Head, Card, Tile, Grid, Btn, Note, Status, Empty, DepthBar, Table, th, thR, td, tdR, rowLine, type Tone } from '../components/kit'
import { n0, rs, shortDay } from '../admin/contractors/shared'
import { useMe, myShifts, NoLogin, CLIENT_NAME, type ShiftState } from './me'

/* ==========================================================================
 * DASHBOARD — how the contractor's rigs are doing, in one small screen
 *
 * Built only from his own shifts on his own work orders: metres, how many a
 * rig makes in a day, core recovery, and the hours lost and to whom. It is
 * the same record the client checks, so the figures here are the ones he
 * will be paid on and judged by.
 * ========================================================================== */

const STATE_TONE: Record<ShiftState | 'none', Tone> = { none: 'neutral', waiting: 'warn', returned: 'bad', checked: 'good' }
const STATE_WORD: Record<ShiftState | 'none', string> = { none: 'Not sent', waiting: 'Waiting to be checked', returned: 'Sent back', checked: 'Checked' }

export default function ContractorDashboard() {
  const { state, me, side } = useMe()
  if (!me) return <NoLogin />

  const shifts = myShifts(side)
  const active = side.orders.filter(w => w.status === 'active')
  const month = monthOf(TODAY), last = shiftMonth(month, -1)
  const inMonth = (m: string) => side.accepted.filter(l => monthOf(l.date) === m)
  const sum = (m: string) => {
    const logs = inMonth(m)
    const metres = logs.reduce((s, l) => s + l.metresDrilled, 0)
    const rigDays = new Set(logs.map(l => `${l.rig}|${l.date}`)).size
    return {
      metres, rigDays, perRigDay: rigDays ? metres / rigDays : 0,
      recovery: metres ? (logs.reduce((s, l) => s + l.coreRecovery, 0) / metres) * 100 : 0,
      own: logs.filter(l => isOwnStop(l)).reduce((s, l) => s + l.downtimeHours, 0),
      standby: logs.filter(l => l.downtimeHours > 0 && !isOwnStop(l)).reduce((s, l) => s + l.downtimeHours, 0),
    }
  }
  const now = sum(month), before = sum(last)
  const owed = active.map(w => ({ w, u: unbilled(state, w, TODAY) })).filter(x => x.u)
  const billsBack = side.bills.filter(b => b.status === 'returned')

  // The last 14 days: checked metres, and metres still waiting on top.
  const days = Array.from({ length: 14 }, (_, i) => addDays(TODAY, i - 13))
  const bars = days.map(d => ({
    d,
    checked: side.accepted.filter(l => l.date === d).reduce((s, l) => s + l.metresDrilled, 0),
    waiting: side.waiting.filter(r => r.date === d).reduce((s, r) => s + r.metres, 0),
  }))
  const top = Math.max(1, ...bars.map(b => b.checked + b.waiting))

  // One line a rig, this month.
  const rigs = active.flatMap(w => w.rigs.map(rig => {
    const logs = inMonth(month).filter(l => l.rig === rig)
    const metres = logs.reduce((s, l) => s + l.metresDrilled, 0)
    const rigDays = new Set(logs.map(l => l.date)).size
    const hole = [...shifts].find(s => s.rig === rig && s.hole)?.hole ?? '—'
    return {
      rig, w, hole, metres, rigDays, perDay: rigDays ? metres / rigDays : 0,
      recovery: metres ? (logs.reduce((s, l) => s + l.coreRecovery, 0) / metres) * 100 : 0,
      own: logs.filter(l => isOwnStop(l)).reduce((s, l) => s + l.downtimeHours, 0),
      standby: logs.filter(l => l.downtimeHours > 0 && !isOwnStop(l)).reduce((s, l) => s + l.downtimeHours, 0),
      back: side.returned.filter(r => r.rig === rig).length,
      changed: logs.filter(l => l.check?.claimedMetres != null).length,
    }
  }))

  // Every rig, today and yesterday: sent or not.
  const lastTwo = [TODAY, addDays(TODAY, -1)]
  const find = (rig: string, date: string, shift: 'Day' | 'Night') => shifts.find(s => s.rig === rig && s.date === date && s.shift === shift)
  const worked = (rig: string): ('Day' | 'Night')[] => {
    const seen = new Set(shifts.filter(s => s.rig === rig).map(s => s.shift))
    return seen.size ? (['Day', 'Night'] as const).filter(sh => seen.has(sh)) : ['Day', 'Night']
  }
  const slots = active.flatMap(w => w.rigs.map(rig => ({ w, rig, days: lastTwo.filter(d => d >= w.startDate) })))
  const missing = slots.reduce((n, s) => n + s.days.reduce((k, d) => k + worked(s.rig).filter(sh => !find(s.rig, d, sh)).length, 0), 0)
  const delta = (a: number, b: number) => b > 0 ? `${a >= b ? '+' : ''}${(((a - b) / b) * 100).toFixed(0)}% on ${monthLabel(last).split(' ')[0]}` : 'No earlier month to compare'

  return (
    <Page>
      <Head title="Dashboard"
        sub={<>Your rigs on {CLIENT_NAME}&apos;s work, from the shifts you have sent. Checked shifts are what you are paid on.</>}
        right={<Btn kind="primary" href="/contractor/drill-log">Add a drill log</Btn>} />

      {(side.returned.length > 0 || billsBack.length > 0) && (
        <Note tone="bad">
          <b style={{ color: T.text }}>Sent back to you: </b>
          {side.returned.length > 0 && <><Link href="/contractor/logs" style={{ color: T.orange, fontWeight: 600, textDecoration: 'none' }}>{side.returned.length} {side.returned.length === 1 ? 'shift' : 'shifts'}</Link>{billsBack.length ? ' and ' : '. '}</>}
          {billsBack.length > 0 && <><Link href="/contractor/bills" style={{ color: T.orange, fontWeight: 600, textDecoration: 'none' }}>{billsBack.length} {billsBack.length === 1 ? 'bill' : 'bills'}</Link>. </>}
          They are not in the record until you correct them and send them again.
        </Note>
      )}

      <Grid min={205}>
        <Tile label={`Checked metres, ${monthLabel(month).split(' ')[0]}`} value={`${n0(now.metres)} m`} note={delta(now.metres, before.metres)} />
        <Tile label="Metres a rig-day" value={now.perRigDay.toFixed(1)} note={before.perRigDay ? `${before.perRigDay.toFixed(1)} last month` : `${now.rigDays} rig-days this month`} />
        <Tile label="Core recovery" value={now.metres ? `${now.recovery.toFixed(1)}%` : '—'} note={before.metres ? `${before.recovery.toFixed(1)}% last month` : undefined} />
        <Tile label="Hours lost this month" value={`${now.own + now.standby} h`} note={`${now.own} h your own, not paid · ${now.standby} h standby`} tone={now.own > now.standby ? 'warn' : undefined} />
      </Grid>

      <Card title="Metres a day, last 14 days" subtitle="Checked metres, with metres still waiting to be checked shown lighter on top.">
        <div role="img" aria-label={`Metres a day for the last 14 days. Highest day ${n0(top)} metres.`} style={{ display: 'grid', gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))`, gap: 6, alignItems: 'end', height: 150 }}>
          {bars.map(b => (
            <div key={b.d} title={`${shortDay(b.d)}: ${+b.checked.toFixed(1)} m checked${b.waiting ? `, ${+b.waiting.toFixed(1)} m waiting` : ''}`} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%', gap: 2 }}>
              <div style={{ fontSize: 11, color: T.faint, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{+(b.checked + b.waiting).toFixed(1) || ''}</div>
              {b.waiting > 0 && <div style={{ height: `${(b.waiting / top) * 100}%`, background: tint(T.blue, 35), borderRadius: '4px 4px 0 0', minHeight: 3 }} />}
              <div style={{ height: `${(b.checked / top) * 100}%`, background: T.bar, borderRadius: b.waiting ? 0 : '4px 4px 0 0', minHeight: b.checked ? 3 : 0 }} />
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))`, gap: 6, marginTop: 6 }}>
          {bars.map(b => <div key={b.d} style={{ fontSize: 10.5, color: T.faint, textAlign: 'center' }}>{Number(b.d.slice(8))}</div>)}
        </div>
      </Card>

      <Card title={`Your rigs, ${monthLabel(month)}`} pad={false} subtitle="From checked shifts. A stop that is your own is not paid; a stop that is not yours is standby.">
        {rigs.length === 0 ? <Empty>No rig of yours is on a running work order.</Empty> : (
          <Table>
            <thead><tr><th style={th}>Rig</th><th style={th}>Hole now</th><th style={thR}>Metres</th><th style={thR}>Days worked</th><th style={thR}>Metres a day</th><th style={thR}>Core recovery</th><th style={thR}>Own stops</th><th style={thR}>Standby</th><th style={thR}>Changed by client</th><th style={thR}>Sent back</th></tr></thead>
            <tbody>
              {rigs.map(r => (
                <tr key={r.rig} className="xpl-row" style={{ borderBottom: rowLine }}>
                  <td style={{ ...td, color: T.text, fontWeight: 700 }}>{r.rig}<div style={{ fontSize: 12, color: T.faint, fontWeight: 400 }}>{r.w.number}</div></td>
                  <td style={td}>{r.hole}</td>
                  <td style={{ ...tdR, color: T.text, fontWeight: 600 }}>{n0(r.metres)}</td>
                  <td style={tdR}>{r.rigDays}</td><td style={tdR}>{r.perDay.toFixed(1)}</td>
                  <td style={tdR}>{r.metres ? `${r.recovery.toFixed(1)}%` : '—'}</td>
                  <td style={tdR}>{r.own ? `${r.own} h` : '—'}</td><td style={tdR}>{r.standby ? `${r.standby} h` : '—'}</td>
                  <td style={tdR}>{r.changed || '—'}</td><td style={tdR}>{r.back || '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card title="Today and yesterday" pad={false} subtitle={missing ? `${missing} ${missing === 1 ? 'shift has' : 'shifts have'} not been sent yet.` : 'Every shift for today and yesterday is in.'}>
        {slots.length === 0 && <Empty>Nothing to send.</Empty>}
        {slots.map(({ w, rig, days: ds }, i) => (
          <div key={rig} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 0.7fr) minmax(0, 3fr)', gap: 16, padding: '13px 18px', borderTop: i ? rowLine : undefined, alignItems: 'center' }} className="xpl-prow">
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{rig}</div>
              <div style={{ fontSize: 12, color: T.faint, marginTop: 2 }}>{w.number}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 8 }}>
              {ds.flatMap(d => worked(rig).map(sh => {
                const s = find(rig, d, sh)
                const st = s?.state ?? 'none'
                return (
                  <div key={d + sh} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 10px', borderRadius: 9, border: `1px solid ${T.border}`, background: T.raised }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, color: T.text, fontWeight: 600 }}>{d === TODAY ? 'Today' : shortDay(d)} · {sh.toLowerCase()}</div>
                      <div style={{ fontSize: 12, color: T.faint, marginTop: 2 }}>{s ? (s.metres > 0 ? `${+s.metres.toFixed(1)} m on ${s.hole}` : 'No metres') : 'Nothing sent'}</div>
                    </div>
                    {s ? <Status tone={STATE_TONE[st]}>{STATE_WORD[st]}</Status>
                      : <Btn size="sm" href={`/contractor/drill-log?rig=${encodeURIComponent(rig)}&date=${d}&shift=${sh}`}>Add</Btn>}
                  </div>
                )
              }))}
            </div>
          </div>
        ))}
      </Card>

      <Card title="Your work orders" pad={false} right={<Btn size="sm" href="/contractor/work-order">Rates and terms</Btn>}>
        {side.orders.length === 0 && <Empty>{CLIENT_NAME} has not put you on a work order yet.</Empty>}
        {side.orders.map((w, i) => {
          const p = workOrderProgress(state, w, TODAY)
          const u = owed.find(x => x.w.id === w.id)?.u
          return (
            <div key={w.id} className="xpl-prow" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr) minmax(0,1fr)', gap: 18, padding: '14px 18px', borderTop: i ? rowLine : undefined, alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{w.number} <span style={{ fontWeight: 400, color: T.faint }}>· {w.project}</span></div>
                <div style={{ fontSize: 12.5, color: T.muted, marginTop: 3 }}>{w.rigs.join(', ')} · {day(w.startDate)} to {day(w.endDate)}</div>
              </div>
              <DepthBar drilled={p.metres} planned={w.plannedMetres} width="100%" />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', alignItems: 'center' }}>
                {u && <span style={{ fontSize: 12.5, color: T.muted }}>{rs(u.net)} not billed yet</span>}
                {w.status === 'closed' ? <Status tone="neutral">Closed</Status> : p.late ? <Status tone="bad">{p.daysLate} days past the finish date</Status> : <Status tone="good">Running</Status>}
              </div>
            </div>
          )
        })}
      </Card>
    </Page>
  )
}
