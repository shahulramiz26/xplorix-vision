'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useCosting, moneyL, money, projectCode, HOLE_STATUS_LABEL } from '../../../../lib/costing-store'
import { useInventory, TODAY, addDays } from '../../../../lib/inventory-store'
import { standbyLedger, fuelCheck, checkHole, STANDBY_STATE_LABEL, type StandbyState } from '../../../../lib/money-checks'
import { computeRigMonth } from '../../../../lib/costing-view'
import {
  T, Page, PageHead, Card, Tile, Grid, Seg, Status, Table, Empty,
  th, thR, td, tdR, tdStrong, rowLine, type Tone,
} from '../../../components/kit'
import { IntelTabs } from '../shared'

/* ==========================================================================
 * MONEY CHECKS — is money leaking between the rig and the invoice?
 *
 * Three questions, each answered from the shift record and the same costing
 * Finance uses:
 *   · Standby: every day the client stopped the rig, and whether it reached
 *     an invoice. A day on no hole is on no hole's bill, so it is shown and
 *     offered on the next invoice.
 *   · Holes to bill: closed or approved holes, each read against its own
 *     shift logs, so an invoice is not built on a log that cannot be right.
 *   · Fuel: litres an engine hour, each rig against its own normal, and what
 *     the litres above it cost.
 * ========================================================================== */

type Period = '30' | '90' | 'all'
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const day = (d: string) => { const [, m, dd] = d.split('-').map(Number); return `${dd} ${MON[m - 1]}` }
const stateTone: Record<StandbyState, Tone> = { invoiced: 'good', 'to-invoice': 'info' as Tone, 'not-on-hole': 'bad', 'no-rate': 'warn' }

export default function MoneyChecks() {
  const { state } = useCosting()
  const { state: inv } = useInventory()
  const [period, setPeriod] = useState<Period>('90')
  const since = period === 'all' ? undefined : addDays(TODAY, -Number(period))

  const { days, partial } = useMemo(() => standbyLedger(state, inv, since), [state, inv, since])
  const fuel = useMemo(() => fuelCheck(state, since ?? '0000-00-00'), [state, since])

  /* Holes that are closed and not yet invoiced, with their logs checked. */
  const holes = useMemo(() => {
    const seen = new Set<string>()
    const out: { hole: string; project: string; rig: string; status: string; metres: number; revenue: number; check: ReturnType<typeof checkHole> }[] = []
    const keys = new Set(state.shiftLogs.filter(l => !l.segmentOf).map(l => `${l.project}|${l.rig}|${l.date.slice(0, 7)}`))
    keys.forEach(k => {
      const [project, rig, month] = k.split('|')
      computeRigMonth(state, inv, project, rig, month).holes.forEach(h => {
        const n = h.hole.holeNumber
        if (seen.has(n) || h.hole.status === 'drilling' || h.hole.status === 'invoiced') return
        seen.add(n)
        out.push({ hole: n, project, rig: h.hole.rig, status: h.hole.status, metres: 0, revenue: 0, check: checkHole(state, n) })
      })
    })
    // A hole crosses months: add up its metres and revenue from every month.
    keys.forEach(k => {
      const [project, rig, month] = k.split('|')
      computeRigMonth(state, inv, project, rig, month).holes.forEach(h => {
        const row = out.find(o => o.hole === h.hole.holeNumber)
        if (row) { row.metres += h.roll.units; row.revenue += h.roll.revenue }
      })
    })
    return out.sort((a, b) => (b.check.stops.length - a.check.stops.length) || (b.check.open.length - a.check.open.length) || b.revenue - a.revenue)
  }, [state, inv])

  const leak = days.filter(d => d.state === 'not-on-hole')
  const leakMoney = leak.reduce((s, d) => s + d.earned, 0)
  const waiting = days.filter(d => d.state === 'to-invoice').reduce((s, d) => s + d.earned, 0)
  const noRate = days.filter(d => d.state === 'no-rate').length
  const noNote = days.filter(d => !d.noted && d.state !== 'invoiced').length
  const partHours = partial.reduce((s, p) => s + p.hours, 0)
  const fuelMoney = fuel.reduce((s, r) => s + r.extraMoney, 0)
  const holesBlocked = holes.filter(h => h.check.stops.length > 0)
  const holesExplain = holes.filter(h => !h.check.stops.length && h.check.open.length > 0)
  const blockedMoney = holesBlocked.reduce((s, h) => s + h.revenue, 0)

  const tone: Tone = leakMoney > 0 || holesBlocked.length ? 'bad' : noNote || fuelMoney > 0 ? 'warn' : 'good'
  const [show, setShow] = useState<'open' | 'all'>('open')
  const standbyRows = days.filter(d => show === 'all' || d.state !== 'invoiced')

  return (
    <Page>
      <IntelTabs />
      <PageHead question="Is money leaking between the rig and the invoice?" tone={tone}
        answer={<>
          {leakMoney > 0
            ? <><b style={{ color: T.text }}>{moneyL(leakMoney)} of client standby is on no invoice</b> ({leak.length} {leak.length === 1 ? 'day' : 'days'} on no hole). </>
            : <>Every standby day the contract pays for is on a hole or an invoice. </>}
          {holesBlocked.length > 0 && <>{holesBlocked.length} {holesBlocked.length === 1 ? 'hole' : 'holes'} worth {moneyL(blockedMoney)} cannot be billed until the logs behind {holesBlocked.length === 1 ? 'it are' : 'them are'} put right. </>}
          {fuelMoney > 0 && <>Fuel above each rig&apos;s own normal cost {moneyL(fuelMoney)}.</>}
        </>}
        right={<Seg value={period} onChange={setPeriod} options={[{ value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: 'all', label: 'Since the start' }]} />} />

      <Grid min={170}>
        <Tile label="Standby on no invoice" value={moneyL(leakMoney)} tone={leakMoney ? 'bad' : 'good'} note={leak.length ? `${leak.length} days on no hole: add them on the next invoice` : 'None'} />
        <Tile label="Standby waiting to bill" value={moneyL(waiting)} note="On a hole that is not invoiced yet" />
        <Tile label="Standby with no note" value={noNote} tone={noNote ? 'warn' : 'good'} note="The client can dispute these" />
        <Tile label="Client stops on drilling days" value={`${partHours} h`} tone={partHours ? 'warn' : 'good'} note="2 h or more, not billed as standby" />
        <Tile label="Holes blocked by their logs" value={holesBlocked.length} tone={holesBlocked.length ? 'bad' : 'good'} note={holesBlocked.length ? moneyL(blockedMoney) : 'None'} />
        <Tile label="Fuel above each rig's normal" value={moneyL(fuelMoney)} tone={fuelMoney ? 'warn' : 'good'} note={`${Math.round(fuel.reduce((s, r) => s + r.extraLitres, 0)).toLocaleString('en-US')} L`} />
      </Grid>

      <Card title="Client standby, day by day" pad={false}
        subtitle={`Each day the client stopped the rig${noRate ? `. ${noRate} ${noRate === 1 ? 'day has' : 'days have'} no standby rate in the contract` : ''}. Days on no hole are offered on the next invoice in Finance.`}
        right={<Seg value={show} onChange={setShow} options={[{ value: 'open', label: 'Not invoiced' }, { value: 'all', label: 'All' }]} />}>
        {standbyRows.length === 0 ? <Empty>No standby days {show === 'open' ? 'waiting to be billed ' : ''}in this period.</Empty> : (
          <Table>
            <thead><tr>
              <th style={th}>Date</th><th style={th}>Project</th><th style={th}>Rig</th><th style={thR}>Hours</th><th style={th}>Why</th>
              <th style={th}>Note</th><th style={th}>Where it stands</th><th style={thR}>Earns</th>
            </tr></thead>
            <tbody>
              {standbyRows.slice(0, 60).map(d => (
                <tr key={d.key} style={{ borderTop: rowLine }}>
                  <td style={tdStrong}>{day(d.date)}</td>
                  <td style={{ ...td, color: T.blue }}>{projectCode(d.project)}</td>
                  <td style={td}>{d.rig}</td>
                  <td style={tdR}>{d.hours} h</td>
                  <td style={{ ...td, whiteSpace: 'normal', minWidth: 140 }}>{d.reasons || '—'}</td>
                  <td style={td}>{d.noted ? <Status tone="good">Yes</Status> : <Status tone="warn">None</Status>}</td>
                  <td style={td}><Status tone={stateTone[d.state]}>{STANDBY_STATE_LABEL[d.state]}{d.invoiceNumber ? ` · ${d.invoiceNumber}` : d.hole ? ` · ${d.hole}` : ''}</Status></td>
                  <td style={{ ...tdR, color: T.text, fontWeight: 600 }}>{d.earned ? money(d.earned) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {standbyRows.length > 60 && <div style={{ padding: '10px 18px', fontSize: 12.5, color: T.faint }}>Showing the latest 60 of {standbyRows.length}.</div>}
      </Card>

      <Card title="Holes to bill, checked against their logs" pad={false}
        subtitle={`Closed, sent or approved, and not invoiced yet. ${holesExplain.length ? `${holesExplain.length} can go with a look first; ` : ''}red ones cannot go until the log is put right.`}
        right={<Link href="/admin/finance" style={{ fontSize: 12.5, color: T.orange, fontWeight: 600, textDecoration: 'none' }}>Open Finance →</Link>}>
        {holes.length === 0 ? <Empty>No closed hole is waiting to be billed.</Empty> : (
          <Table>
            <thead><tr><th style={th}>Hole</th><th style={th}>Project</th><th style={th}>Rig</th><th style={th}>Status</th><th style={thR}>Metres</th><th style={thR}>Bills</th><th style={th}>Logs behind it</th></tr></thead>
            <tbody>
              {holes.map(h => (
                <tr key={h.hole} style={{ borderTop: rowLine, verticalAlign: 'top' }}>
                  <td style={tdStrong}>{h.hole}</td>
                  <td style={{ ...td, color: T.blue }}>{projectCode(h.project)}</td>
                  <td style={td}>{h.rig}</td>
                  <td style={td}>{HOLE_STATUS_LABEL[h.status as keyof typeof HOLE_STATUS_LABEL] ?? h.status}</td>
                  <td style={tdR}>{Math.round(h.metres * 10) / 10} m</td>
                  <td style={{ ...tdR, color: T.text, fontWeight: 600 }}>{money(h.revenue)}</td>
                  <td style={{ ...td, whiteSpace: 'normal', minWidth: 240 }}>
                    {h.check.stops.length > 0 ? <Status tone="bad">{h.check.stops.length} cannot be right</Status>
                      : h.check.open.length > 0 ? <Status tone="warn">{h.check.open.length} to explain</Status>
                      : <Status tone="good">All {h.check.shifts} shifts pass</Status>}
                    {[...h.check.stops, ...h.check.open].slice(0, 2).map((x, i) => (
                      <div key={i} style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>{x.log.rig} · {day(x.log.date)} {x.log.shift.toLowerCase()}: {x.check.title}</div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card title="Fuel against the engine" pad={false}
        subtitle="Litres an engine hour, each rig against its own median over the whole record. A shift 30% above it counts; the litres above normal are priced at the rig's own fuel rate.">
        {fuel.length === 0 ? <Empty>No shifts with both fuel and engine hours in this period.</Empty> : (
          <Table>
            <thead><tr>
              <th style={th}>Rig</th><th style={thR}>Shifts</th><th style={thR}>Litres</th><th style={thR}>Engine h</th><th style={thR}>L / engine h</th>
              <th style={thR}>Its normal</th><th style={thR}>Shifts over</th><th style={thR}>Litres above normal</th><th style={thR}>Cost</th><th style={th}>Worst shift</th>
            </tr></thead>
            <tbody>
              {fuel.map(r => (
                <tr key={r.rig} style={{ borderTop: rowLine }}>
                  <td style={tdStrong}>{r.rig}</td>
                  <td style={tdR}>{r.shifts}</td>
                  <td style={tdR}>{Math.round(r.litres).toLocaleString('en-US')}</td>
                  <td style={tdR}>{Math.round(r.engineHours)}</td>
                  <td style={{ ...tdR, color: r.perHour > r.normal * 1.15 ? T.amber : T.text, fontWeight: 600 }}>{r.perHour.toFixed(1)}</td>
                  <td style={tdR}>{r.normal.toFixed(1)}</td>
                  <td style={{ ...tdR, color: r.overShifts.length ? T.amber : T.faint }}>{r.overShifts.length}</td>
                  <td style={tdR}>{Math.round(r.extraLitres).toLocaleString('en-US')}</td>
                  <td style={{ ...tdR, color: r.extraMoney ? T.text : T.faint, fontWeight: 600 }}>{r.extraMoney ? money(r.extraMoney) : '—'}</td>
                  <td style={td}>{r.overShifts[0] ? `${day(r.overShifts[0].log.date)} ${r.overShifts[0].log.shift.toLowerCase()} · ${r.overShifts[0].perHour.toFixed(1)} L/h` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {partial.length > 0 && (
        <Card title="Client stops on drilling days" pad={false}
          subtitle="The rig drilled that day, so the contract's day rate for standby does not apply, but the client still held it for two hours or more. Worth raising with the client if it keeps happening, or asking for an hourly standby rate at the next contract.">
          <Table>
            <thead><tr><th style={th}>Date</th><th style={th}>Project</th><th style={th}>Rig</th><th style={thR}>Hours</th><th style={th}>Why</th></tr></thead>
            <tbody>
              {partial.slice(0, 25).map(p => (
                <tr key={`${p.rig}${p.date}`} style={{ borderTop: rowLine }}>
                  <td style={tdStrong}>{day(p.date)}</td><td style={{ ...td, color: T.blue }}>{projectCode(p.project)}</td><td style={td}>{p.rig}</td>
                  <td style={tdR}>{p.hours} h</td><td style={{ ...td, whiteSpace: 'normal' }}>{p.reasons || '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </Page>
  )
}
