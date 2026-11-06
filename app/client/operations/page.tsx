'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { monthOf, monthLabel, monthShort, COMPANY_NAME } from '../../../lib/costing-store'
import { TODAY } from '../../../lib/inventory-store'
import { useClient } from '../../../lib/client-view'
import { downloadCsv } from '../../../lib/client-record'
import { T, tint, Page, PageHead, Card, Tile, Grid, Split, Seg, Btn, Status, Empty, Table, Meter, inputStyle, th, thR, td, tdR, rowLine } from '../../components/kit'

/* ==========================================================================
 * OPERATIONS — what the rigs did, shift by shift
 *
 * The three things that decide whether metres arrive on time and whether the
 * bill is fair: how much was drilled, how good the core is, and where the
 * hours went. Every hour a rig was stopped is shown with its reason and with
 * whose stop it was, because that is what decides whether it is charged.
 * ========================================================================== */

const n1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString('en-US')
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const short = (d: string) => `${Number(d.slice(8))} ${MON[Number(d.slice(5, 7)) - 1]}`

export default function ClientOperations() {
  const c = useClient()
  const [project, setProject] = useState('all')
  const [rig, setRig] = useState('all')
  const months = useMemo(() => Array.from(new Set(c.shifts.map(s => monthOf(s.date)))).sort(), [c.shifts])
  const [month, setMonth] = useState(monthOf(TODAY))
  const [shown, setShown] = useState(30)

  const inScope = c.shifts.filter(s => (project === 'all' || s.project === project) && (rig === 'all' || s.rig === rig))
  const rows = inScope.filter(s => month === 'all' || monthOf(s.date) === month)
  const rigs = Array.from(new Set(c.shifts.filter(s => project === 'all' || s.project === project).map(s => s.rig))).sort()

  const metres = rows.reduce((s, x) => s + x.metres, 0)
  const core = rows.reduce((s, x) => s + (x.recoveryPct != null ? (x.recoveryPct / 100) * x.metres : 0), 0)
  const rigDays = new Set(rows.map(s => `${s.rig}|${s.date}`)).size
  const drillH = rows.reduce((s, x) => s + x.drillingHours, 0)
  const standbyH = rows.reduce((s, x) => s + x.standbyHours, 0)
  const breakH = rows.reduce((s, x) => s + x.breakdownHours, 0)
  const incidents = rows.flatMap(s => s.incidents.map(i => ({ ...i, s })))

  // Metres a day, oldest first.
  const days = Array.from(new Set(rows.map(s => s.date))).sort().slice(-31)
  const perDay = days.map(d => ({ d, m: rows.filter(s => s.date === d).reduce((a, x) => a + x.metres, 0), stopped: rows.filter(s => s.date === d).every(x => x.metres === 0) }))
  const top = Math.max(1, ...perDay.map(x => x.m))

  // One line a rig.
  const byRig = Array.from(new Set(rows.map(s => s.rig))).sort().map(r => {
    const list = rows.filter(s => s.rig === r)
    const m = list.reduce((a, x) => a + x.metres, 0)
    const dset = new Set(list.map(s => s.date))
    return {
      rig: r, project: list[0]?.project ?? '', metres: m, days: dset.size, perDay: dset.size ? m / dset.size : 0,
      recovery: m ? (list.reduce((a, x) => a + (x.recoveryPct != null ? (x.recoveryPct / 100) * x.metres : 0), 0) / m) * 100 : 0,
      drilling: list.reduce((a, x) => a + x.drillingHours, 0), standby: list.reduce((a, x) => a + x.standbyHours, 0), breakdown: list.reduce((a, x) => a + x.breakdownHours, 0),
      hole: list.find(s => s.hole)?.hole ?? '—',
    }
  })
  const bestRig = Math.max(1, ...byRig.map(r => r.perDay))

  // Where the stopped hours went.
  const reasons: Record<string, { reason: string; mine: boolean; hours: number; shifts: number }> = {}
  rows.forEach(s => s.stops.forEach(x => { const k = `${x.mine}|${x.reason}`; const e = (reasons[k] ||= { reason: x.reason, mine: x.mine, hours: 0, shifts: 0 }); e.hours += x.hours; e.shifts += 1 }))
  const reasonRows = Object.values(reasons).sort((a, b) => b.hours - a.hours)
  const topReason = Math.max(1, ...reasonRows.map(r => r.hours))

  const exportIt = () => downloadCsv('shift-record', [
    ['Date', 'Shift', 'Project', 'Rig', 'Hole', 'From (m)', 'To (m)', 'Metres', 'Core recovery %', 'Formation', 'Lithology', 'Drilling hours', 'Standby hours', 'Their own stop hours', 'Reasons', 'Crew', 'Supervisor', 'Driller'],
    ...rows.map(s => [s.date, s.shift, s.project, s.rig, s.hole ?? '', s.from ?? '', s.to ?? '', s.metres, s.recoveryPct != null ? s.recoveryPct.toFixed(1) : '', s.formation, s.lithology ?? '',
      s.drillingHours, s.standbyHours, s.breakdownHours, s.stops.map(x => `${x.reason} ${x.hours}h`).join('; '), s.crew, s.supervisor ?? '', s.driller ?? '']),
  ])
  const period = month === 'all' ? 'since the start' : `in ${monthLabel(month)}`

  return (
    <Page>
      <PageHead question="What have the rigs done?"
        tone={breakH > standbyH && breakH > 0 ? 'warn' : 'info'}
        answer={<>
          {n1(metres)} m drilled {period} over {rigDays} rig-days, with core recovery of {metres ? ((core / metres) * 100).toFixed(1) : '0'}%.{' '}
          {standbyH + breakH > 0 ? <>{standbyH + breakH} hours were lost: {standbyH} h is standby you may be charged for, {breakH} h was {COMPANY_NAME}&rsquo;s own.</> : 'No hours were lost.'}
        </>}
        right={<Btn size="sm" onClick={exportIt} disabled={!rows.length}>Export shift record</Btn>} />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={project} aria-label="Project" onChange={e => { setProject(e.target.value); setRig('all') }} style={{ ...inputStyle, width: 'auto', cursor: 'pointer', fontWeight: 600 }}>
          <option value="all">All projects</option>{c.projects.map(p => <option key={p.id} value={p.name}>{p.code} · {p.name}</option>)}
        </select>
        <select value={rig} aria-label="Rig" onChange={e => setRig(e.target.value)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer', fontWeight: 600 }}>
          <option value="all">All rigs</option>{rigs.map(r => <option key={r}>{r}</option>)}
        </select>
        <Seg<string> value={month} onChange={setMonth} options={[...months.slice(-4).map(m => ({ value: m, label: monthShort(m) })), { value: 'all', label: 'All' }]} />
      </div>

      <Grid min={170}>
        <Tile label="Metres drilled" value={`${n1(metres)} m`} note={`${rigDays} rig-days`} />
        <Tile label="Metres a rig-day" value={rigDays ? (metres / rigDays).toFixed(1) : '—'} note="Stopped days included" />
        <Tile label="Core recovery" value={metres ? `${((core / metres) * 100).toFixed(1)}%` : '—'} />
        <Tile label="Drilling hours" value={`${drillH} h`} note={drillH ? `${(metres / drillH).toFixed(2)} m an hour` : undefined} />
        <Tile label="Standby hours" value={`${standbyH} h`} tone={standbyH ? 'warn' : undefined} note="Charged when a full day is lost" />
        <Tile label="Their own stops" value={`${breakH} h`} note="Never charged to you" />
      </Grid>

      <Card title="Metres a day" subtitle={`${days.length ? `${short(days[0])} to ${short(days[days.length - 1])}` : 'No shifts in this period'}. A day with no bar had shifts but no metres.`}>
        {perDay.length === 0 ? <Empty>No shifts in this period.</Empty> : (
          <>
            <div role="img" aria-label={`Metres drilled each day. Highest day ${n1(top)} metres.`} style={{ display: 'grid', gridTemplateColumns: `repeat(${perDay.length}, minmax(0, 1fr))`, gap: 4, alignItems: 'end', height: 150 }}>
              {perDay.map(x => (
                <div key={x.d} title={`${short(x.d)}: ${n1(x.m)} m`} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                  {perDay.length <= 16 && <div style={{ fontSize: 10.5, color: T.faint, textAlign: 'center', marginBottom: 2 }}>{x.m ? n1(x.m) : ''}</div>}
                  <div style={{ height: `${(x.m / top) * 100}%`, minHeight: x.m ? 3 : 2, background: x.m ? T.bar : tint(T.amber, 60), borderRadius: '3px 3px 0 0' }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${perDay.length}, minmax(0, 1fr))`, gap: 4, marginTop: 5 }}>
              {perDay.map(x => <div key={x.d} style={{ fontSize: 10, color: T.faint, textAlign: 'center' }}>{Number(x.d.slice(8))}</div>)}
            </div>
          </>
        )}
      </Card>

      <Split left={3} right={2}>
        <Card title="By rig" pad={false} subtitle="The same measures for every rig on your projects.">
          {byRig.length === 0 ? <Empty>No shifts in this period.</Empty> : (
            <Table>
              <thead><tr><th style={th}>Rig</th><th style={th}>Hole now</th><th style={thR}>Metres</th><th style={th}>Metres a day</th><th style={thR}>Core</th><th style={thR}>Standby</th><th style={thR}>Own stops</th></tr></thead>
              <tbody>
                {byRig.map(r => (
                  <tr key={r.rig} className="xpl-row" style={{ borderBottom: rowLine }}>
                    <td style={{ ...td, color: T.text, fontWeight: 700 }}>{r.rig}</td>
                    <td style={td}>{r.hole !== '—' ? <Link href={`/client/holes/${encodeURIComponent(r.hole)}`} style={{ color: T.muted }}>{r.hole}</Link> : '—'}</td>
                    <td style={{ ...tdR, color: T.text, fontWeight: 600 }}>{n1(r.metres)}</td>
                    <td style={{ ...td, minWidth: 130 }}><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span style={{ width: 32, textAlign: 'right', color: T.text, fontVariantNumeric: 'tabular-nums' }}>{r.perDay.toFixed(1)}</span><div style={{ flex: 1 }}><Meter value={r.perDay} max={bestRig} /></div></div></td>
                    <td style={tdR}>{r.metres ? `${r.recovery.toFixed(1)}%` : '—'}</td>
                    <td style={tdR}>{r.standby ? `${r.standby} h` : '—'}</td><td style={tdR}>{r.breakdown ? `${r.breakdown} h` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card title="Where the stopped hours went" pad={false} subtitle={`Standby is a stop for a reason that is not ${COMPANY_NAME}'s. Their own stops are not charged.`}>
          {reasonRows.length === 0 ? <Empty>No stopped hours in this period.</Empty> : reasonRows.map((r, i) => (
            <div key={i} style={{ padding: '10px 16px', borderTop: i ? rowLine : undefined }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>{r.reason}</span>
                <span style={{ fontSize: 13, color: T.text, fontVariantNumeric: 'tabular-nums' }}>{r.hours} h</span>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>
                <div style={{ flex: 1 }}><Meter value={r.hours} max={topReason} color={r.mine ? T.amber : T.faint} /></div>
                <Status tone={r.mine ? 'warn' : 'neutral'}>{r.mine ? 'Standby' : 'Their own, not charged'}</Status>
              </div>
            </div>
          ))}
        </Card>
      </Split>

      {incidents.length > 0 && (
        <Card title={`Incidents · ${incidents.length}`} pad={false}>
          {incidents.map((x, i) => (
            <div key={i} style={{ display: 'flex', gap: 14, padding: '11px 18px', borderTop: i ? rowLine : undefined, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <Status tone={x.severity === 'Critical' ? 'bad' : x.severity === 'Major' ? 'warn' : 'neutral'}>{x.severity}</Status>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontSize: 13.5, color: T.text, fontWeight: 600 }}>{x.type} on {x.s.rig}</div>
                <div style={{ fontSize: 12.5, color: T.muted, marginTop: 2 }}>{short(x.s.date)} {x.s.shift.toLowerCase()} shift{x.note ? ` · ${x.note}` : ''}</div>
              </div>
            </div>
          ))}
        </Card>
      )}

      <Card title={`Shift record · ${rows.length}`} pad={false} subtitle={`Every shift ${COMPANY_NAME} logged on your projects ${period}, newest first.`}>
        {rows.length === 0 ? <Empty>No shifts in this period.</Empty> : (
          <Table>
            <thead><tr><th style={th}>Date</th><th style={th}>Shift</th><th style={th}>Rig</th><th style={th}>Hole</th><th style={thR}>From</th><th style={thR}>To</th><th style={thR}>Metres</th><th style={thR}>Core</th><th style={th}>Ground</th><th style={thR}>Drilling</th><th style={th}>Stopped</th><th style={thR}>Crew</th><th style={th}>Driller</th></tr></thead>
            <tbody>
              {rows.slice(0, shown).map(s => (
                <tr key={s.id} className="xpl-row" style={{ borderBottom: rowLine, verticalAlign: 'top' }}>
                  <td style={{ ...td, color: T.text, fontWeight: 600 }}>{short(s.date)}</td>
                  <td style={td}>{s.shift}</td><td style={td}>{s.rig}</td>
                  <td style={td}>{s.hole ? <Link href={`/client/holes/${encodeURIComponent(s.hole)}`} style={{ color: T.muted }}>{s.hole}</Link> : '—'}{s.holeClosed && <div style={{ fontSize: 11.5, color: T.faint }}>finished</div>}</td>
                  <td style={tdR}>{s.from != null && s.metres > 0 ? n1(s.from) : '—'}</td><td style={tdR}>{s.to != null && s.metres > 0 ? n1(s.to) : '—'}</td>
                  <td style={{ ...tdR, color: T.text, fontWeight: 600 }}>{s.metres ? n1(s.metres) : '—'}</td>
                  <td style={tdR}>{s.recoveryPct != null ? `${s.recoveryPct.toFixed(0)}%` : '—'}</td>
                  <td style={{ ...td, whiteSpace: 'normal', minWidth: 110 }}>{s.metres > 0 ? (s.lithology || s.formation.replace(' Formation', '')) : '—'}</td>
                  <td style={tdR}>{s.drillingHours} h</td>
                  <td style={{ ...td, whiteSpace: 'normal', minWidth: 190 }}>
                    {s.stops.length === 0 ? '—' : s.stops.map((x, k) => <div key={k}><span aria-hidden style={{ color: x.mine ? T.amber : T.faint, fontWeight: 800, marginRight: 5 }}>{x.mine ? '!' : '•'}</span>{x.hours} h {x.mine ? 'standby' : 'own'}: {x.reason}</div>)}
                  </td>
                  <td style={tdR}>{s.crew || '—'}</td><td style={td}>{s.driller ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {rows.length > shown && (
          <div style={{ padding: '11px 18px', borderTop: rowLine }}>
            <button type="button" onClick={() => setShown(n => n + 60)} style={{ background: 'none', border: 'none', color: T.orange, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5 }}>Show 60 more of {rows.length}</button>
          </div>
        )}
      </Card>
    </Page>
  )
}
