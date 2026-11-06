'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { money, moneyL, monthLabel, monthShort } from '../../../../lib/costing-store'
import { TODAY } from '../../../../lib/inventory-store'
import { buildScorecard, workOrderOutlook, MEASURES, type ScoreRow, type OrderOutlook } from '../../../../lib/intelligence'
import { downloadCsv, shortDate } from '../../../../lib/client-record'
import {
  T, tint, Page, PageHead, Card, Tile, Grid, Seg, Btn, Status, Table, Note, Empty, DepthBar, inputStyle,
  th, thR, td, tdR, tdStrong, rowLine, type Tone,
} from '../../../components/kit'
import { Basis } from '../../../components/outlook'
import { useIntel, IntelTabs, Dot, partyColour, n0, n1 } from '../shared'

/* ==========================================================================
 * CONTRACTOR COMPARISON — own rigs and each contractor on the same measures
 *
 * A company that drills with its own rigs and with hired contractors needs
 * one answer: who is doing the work best, and what does each metre leave.
 * Every party is judged on the same days of the same checked record.
 *
 * A contractor's own costs are never asked for and never shown. What he costs
 * this company is what the work order pays him.
 * ========================================================================== */

const pc = (v: number) => `${v.toFixed(1)}%`
const outlookTone: Record<OrderOutlook['state'], Tone> = { done: 'good', 'on-time': 'good', tight: 'warn', late: 'bad', stopped: 'bad' }
const outlookWord: Record<OrderOutlook['state'], string> = { done: 'Metres done', 'on-time': 'On time', tight: 'Tight', late: 'Will be late', stopped: 'No metres in 30 days' }

export default function ContractorComparison() {
  const { state, inv } = useIntel()
  const [project, setProject] = useState('all')
  const [month, setMonth] = useState('all')
  const sc = useMemo(() => buildScorecard(state, inv, project, month), [state, inv, project, month])
  const outlook = useMemo(() => workOrderOutlook(state).filter(o => project === 'all' || o.wo.project === project), [state, project])
  const projects = state.projects.filter(p => state.shiftLogs.some(l => l.project === p.name))
  const colour = (key: string) => partyColour(sc.rows.findIndex(r => r.key === key))
  const outs = sc.rows.filter(r => r.kind === 'contractor')
  const own = sc.rows.find(r => r.kind === 'own')
  const total = sc.rows.reduce((a, r) => ({ metres: a.metres + r.metres, margin: a.margin + r.margin }), { metres: 0, margin: 0 })
  const outMetres = outs.reduce((s, r) => s + r.metres, 0)
  const period = month === 'all' ? 'since the start' : `in ${monthLabel(month)}`

  const exportCsv = () => downloadCsv('contractor-comparison', [
    ['Who', 'Rigs', 'Rig-days', 'Metres', 'Metres a rig-day', 'Metres a drilling hour', 'Core recovery %', 'Rig availability %', 'Own stop hours', 'Standby hours',
      'Cost of a metre', 'Client pays a metre', 'Left on a metre', 'Margin', 'Incidents', 'Shifts checked', 'Corrected at check', 'Metres over-claimed', 'Billed', 'Supported by the record', 'Deductions'],
    ...sc.rows.map(r => [r.name, r.rigs, r.days, Math.round(r.metres), r.perRigDay.toFixed(2), r.perHour.toFixed(2), r.recoveryPct.toFixed(1), r.availabilityPct.toFixed(1), r.ownStopHours, r.standbyHours,
      Math.round(r.costPerMetre), Math.round(r.ratePerMetre), Math.round(r.marginPerMetre), Math.round(r.margin), r.incidents,
      r.reporting?.shifts, r.reporting?.changed, r.reporting?.overMetres.toFixed(1), r.billing ? Math.round(r.billing.claimed) : '', r.billing ? Math.round(r.billing.supported) : '', r.billing ? Math.round(r.billing.deductions) : '']),
  ])

  /* One row of the side-by-side table: the same figure for every party, the leader marked. */
  const line = (label: string, get: (r: ScoreRow) => string, opts: { best?: string; strong?: boolean; note?: string } = {}) => (
    <tr key={label} style={{ borderBottom: rowLine }}>
      <td style={{ ...td, whiteSpace: 'normal', minWidth: 190 }}>
        <span style={{ color: T.text, fontWeight: opts.strong ? 700 : 500 }}>{label}</span>
        {opts.note && <div style={{ fontSize: 11.5, color: T.faint, marginTop: 2 }}>{opts.note}</div>}
      </td>
      {sc.rows.map(r => {
        const lead = opts.best === r.key
        return (
          <td key={r.key} style={{ ...tdR, color: lead || opts.strong ? T.text : T.muted, fontWeight: lead || opts.strong ? 700 : 400, background: lead ? tint(T.green, 8) : undefined }}>
            {r.metres > 0 || r.days > 0 ? get(r) : '—'}{lead && <span style={{ color: T.green, fontWeight: 800, marginLeft: 6 }} title="Best on this measure">✓</span>}
          </td>
        )
      })}
    </tr>
  )

  return (
    <Page>
      <IntelTabs />
      <PageHead question="Who is drilling best: your own rigs or your contractors?"
        tone={sc.findings.some(x => x.tone === 'warn' || x.tone === 'bad') ? 'warn' : 'info'}
        answer={sc.rows.length === 0 ? 'No shifts in this period.'
          : !sc.hasContractors ? <>No contractor drilled {period}{project === 'all' ? '' : ` on ${project}`}. Only your own rigs are shown.</>
          : <>{outs.length} {outs.length === 1 ? 'contractor' : 'contractors'} drilled {total.metres ? Math.round((outMetres / total.metres) * 100) : 0}% of the {n0(total.metres)} m {period}. {sc.findings[0]?.text}</>}
        right={<Btn size="sm" onClick={exportCsv} disabled={!sc.rows.length}>Export</Btn>} />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={project} aria-label="Project" onChange={e => { setProject(e.target.value); setMonth('all') }} style={{ ...inputStyle, width: 'auto', cursor: 'pointer', fontWeight: 600 }}>
          <option value="all">All projects</option>{projects.map(p => <option key={p.id} value={p.name}>{p.code} · {p.name}</option>)}
        </select>
        <Seg<string> value={month} onChange={setMonth} options={[...sc.months.slice(-4).map(m => ({ value: m, label: monthShort(m) })), { value: 'all', label: 'All' }]} />
      </div>

      {sc.rows.length === 0 ? <Card><Empty>No shifts in this period.</Empty></Card> : <>
        <Grid min={190}>
          {sc.rows.map(r => (
            <Tile key={r.key} label={r.name} value={<><Dot colour={colour(r.key)} />{n0(r.metres)} m</>}
              note={`${r.rigs} ${r.rigs === 1 ? 'rig' : 'rigs'} · ${r.perRigDay.toFixed(1)} m a rig-day · core ${pc(r.recoveryPct)}`} />
          ))}
          {own && outs.length > 0 && (
            <Tile label="Margin from contractors" value={moneyL(outs.reduce((s, r) => s + r.margin, 0))}
              note={`${total.margin > 0 ? Math.round((outs.reduce((s, r) => s + r.margin, 0) / total.margin) * 100) : 0}% of ${moneyL(total.margin)} in all`} />
          )}
        </Grid>

        <Card title="Side by side" pad={false}
          subtitle="The same measures for everyone, from the same checked shifts. A tick marks the best on each line.">
          <Table>
            <thead><tr>
              <th style={th}>Measure</th>
              {sc.rows.map(r => <th key={r.key} style={thR}><span style={{ display: 'inline-flex', alignItems: 'center' }}><Dot colour={colour(r.key)} />{r.name}</span></th>)}
            </tr></thead>
            <tbody>
              {line('Rigs', r => `${r.rigs} · ${r.rigNames.join(', ')}`)}
              {line('Rig-days worked', r => String(r.days), { note: 'Days with a shift in the record' })}
              {line('Metres drilled', r => `${n0(r.metres)} m`, { strong: true })}
              {line('Metres a rig-day', r => r.perRigDay.toFixed(1), { best: sc.best.perRigDay, note: 'Stopped days included' })}
              {line('Metres a drilling hour', r => r.perHour.toFixed(2), { best: sc.best.perHour, note: 'Speed while the bit is on bottom' })}
              {line('Core recovery', r => pc(r.recoveryPct), { best: sc.best.recoveryPct })}
              {line('Rig availability', r => pc(r.availabilityPct), { best: sc.best.availabilityPct, note: 'Shift hours not lost to their own stops' })}
              {line('Hours lost to their own stops', r => `${n0(r.ownStopHours)} h`, { note: 'Breakdowns, bit and rod changes, crew' })}
              {line('Standby hours', r => `${n0(r.standbyHours)} h`, { note: 'Stopped for a reason that is not theirs' })}
              {line('Days with no metres', r => `${r.breakdownDays + r.standbyDays} · ${r.breakdownDays} own, ${r.standbyDays} standby`)}
              {line('Incidents logged', r => String(r.incidents))}
              {line('What a metre costs you', r => money(r.costPerMetre), { best: sc.best.costPerMetre, note: 'Own: fuel, crew, repairs, parts, the rig. Contractor: the work order rate' })}
              {line('What the client pays for it', r => money(r.ratePerMetre))}
              {line('What a metre leaves you', r => money(r.marginPerMetre), { best: sc.best.marginPerMetre, strong: true })}
              {line('Margin', r => `${moneyL(r.margin)} · ${r.marginPct.toFixed(0)}%`, { strong: true })}
            </tbody>
          </Table>
        </Card>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 330px), 1fr))', gap: 12 }}>
          {MEASURES.map(m => {
            const top = Math.max(...sc.rows.map(r => Math.abs(r[m.key])), 1)
            return (
              <Card key={m.key} title={m.label} subtitle={m.what}>
                <div style={{ display: 'grid', gap: 11 }}>
                  {sc.rows.map(r => {
                    const v = r[m.key]
                    return (
                      <div key={r.key}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                          <span style={{ color: T.text, fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}><Dot colour={colour(r.key)} />{r.name}{sc.best[m.key] === r.key && <span style={{ color: T.green, fontWeight: 800, marginLeft: 6 }}>✓</span>}</span>
                          <span style={{ color: T.text, fontVariantNumeric: 'tabular-nums' }}>{r.metres > 0 ? (m.money ? money(v) : `${v.toFixed(m.digits)}${m.unit === '%' ? '%' : ` ${m.unit}`}`) : '—'}</span>
                        </div>
                        <div style={{ height: 8, background: 'rgba(var(--x-ov),0.06)', borderRadius: 4 }}>
                          <div style={{ width: `${Math.max(0, (v / top) * 100)}%`, height: '100%', background: colour(r.key), borderRadius: 4 }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Card>
            )
          })}
        </div>

        {sc.findings.length > 0 && (
          <Card title="What this says" subtitle="Read from the figures above. Nothing here is an opinion." pad={false}>
            {sc.findings.map((x, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '11px 18px', borderTop: i ? rowLine : undefined, fontSize: 13.5, color: T.muted, lineHeight: 1.55 }}>
                <span aria-hidden style={{ color: x.tone === 'good' ? T.green : x.tone === 'warn' ? T.amber : x.tone === 'bad' ? T.red : T.blue, fontWeight: 800 }}>{x.tone === 'good' ? '✓' : x.tone === 'info' ? '•' : '!'}</span>
                <span style={{ color: T.text }}>{x.text}</span>
              </div>
            ))}
          </Card>
        )}

        {sc.trend.length > 1 && (
          <Card title="Month by month" subtitle="Metres a rig-day and core recovery, so a good or bad month is seen and not averaged away." pad={false}>
            <Table>
              <thead>
                <tr><th style={th}>Month</th>{sc.rows.map(r => <th key={r.key} style={{ ...thR }} colSpan={3}><span style={{ display: 'inline-flex', alignItems: 'center' }}><Dot colour={colour(r.key)} />{r.name}</span></th>)}</tr>
                <tr><th style={th} />{sc.rows.map(r => [<th key={r.key + 'a'} style={thR}>Metres</th>, <th key={r.key + 'b'} style={thR}>m a rig-day</th>, <th key={r.key + 'c'} style={thR}>Core</th>])}</tr>
              </thead>
              <tbody>
                {sc.trend.map(t => (
                  <tr key={t.month} style={{ borderBottom: rowLine }}>
                    <td style={tdStrong}>{monthLabel(t.month)}</td>
                    {sc.rows.map(r => {
                      const v = t.byParty[r.key]
                      return [
                        <td key={r.key + 'a'} style={tdR}>{v ? n0(v.metres) : '—'}</td>,
                        <td key={r.key + 'b'} style={{ ...tdR, color: T.text }}>{v ? v.perRigDay.toFixed(1) : '—'}</td>,
                        <td key={r.key + 'c'} style={tdR}>{v && v.metres ? `${v.recoveryPct.toFixed(0)}%` : '—'}</td>,
                      ]
                    })}
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}

        {outs.length > 0 && (
          <Card title="Can you trust what each contractor sends?" pad={false}
            subtitle="Shifts are checked by your site staff before they count. This is how often the check had to change them, and how each bill stood up against the checked record.">
            <Table>
              <thead><tr>
                <th style={th}>Contractor</th><th style={thR}>Shifts checked</th><th style={thR}>Accepted as sent</th><th style={thR}>Corrected</th><th style={thR}>Metres over-claimed</th>
                <th style={thR}>Sent back</th><th style={thR}>Waiting</th><th style={thR}>Bills</th><th style={thR}>Billed</th><th style={thR}>Above the record</th><th style={thR}>Deductions</th><th style={thR}>Owed, not billed</th>
              </tr></thead>
              <tbody>
                {outs.map(r => {
                  const rep = r.reporting!, b = r.billing!
                  return (
                    <tr key={r.key} style={{ borderBottom: rowLine }}>
                      <td style={tdStrong}><span style={{ display: 'inline-flex', alignItems: 'center' }}><Dot colour={colour(r.key)} />{r.name}</span></td>
                      <td style={tdR}>{rep.shifts}</td>
                      <td style={{ ...tdR, color: T.text }}>{rep.shifts ? `${rep.asSent} · ${rep.accuracyPct.toFixed(0)}%` : '—'}</td>
                      <td style={{ ...tdR, color: rep.changed ? T.text : T.muted, fontWeight: rep.changed ? 700 : 400 }}>{rep.changed || '—'}</td>
                      <td style={tdR}>{rep.overMetres > 0 ? `${n1(rep.overMetres)} m` : '—'}</td>
                      <td style={tdR}>{rep.returned || '—'}</td>
                      <td style={tdR}>{rep.waiting || '—'}</td>
                      <td style={tdR}>{b.count}{b.toCheck ? <span style={{ color: T.faint }}> · {b.toCheck} to check</span> : null}</td>
                      <td style={tdR}>{b.count ? moneyL(b.claimed) : '—'}</td>
                      <td style={{ ...tdR, color: b.over ? T.text : T.muted, fontWeight: b.over ? 700 : 400 }}>{b.over ? `${moneyL(b.over)} · ${b.overPct.toFixed(1)}%` : '—'}</td>
                      <td style={tdR}>{b.deductions ? moneyL(b.deductions) : '—'}</td>
                      <td style={tdR}>{b.owedNotBilled ? moneyL(b.owedNotBilled) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
            <div style={{ padding: '11px 18px', borderTop: rowLine, fontSize: 12.5, color: T.faint, lineHeight: 1.6 }}>
              Above the record is what a bill claimed beyond the checked shifts at the work order rates. It is not paid. Open a bill under{' '}
              <Link href="/admin/contractors" style={{ color: T.orange, fontWeight: 600, textDecoration: 'none' }}>Contractors</Link> to see it line by line.
            </div>
          </Card>
        )}

        {outlook.length > 0 && (
          <Card title="Will each contractor finish on time?" pad={false}
            subtitle={`From today, ${shortDate(TODAY)}: metres left on each work order against what all his rigs together have made a day over the last 30 days.`}>
            <Table>
              <thead><tr>
                <th style={th}>Work order</th><th style={th}>Progress</th><th style={thR}>Left</th><th style={thR}>Makes a day</th><th style={thR}>Needs a day</th>
                <th style={th}>Finish date</th><th style={th}>Done by</th><th style={th}>Outlook</th><th style={thR}>Core recovery</th>
              </tr></thead>
              <tbody>
                {outlook.map(o => (
                  <tr key={o.wo.id} style={{ borderBottom: rowLine }}>
                    <td style={{ ...tdStrong, whiteSpace: 'normal' }}>{o.wo.number}<div style={{ fontSize: 12, color: T.faint, fontWeight: 400 }}>{o.contractor} · {o.wo.rigs.join(', ')}</div></td>
                    <td style={td}><DepthBar drilled={o.metres} planned={o.planned} width={150} /></td>
                    <td style={tdR}>{n0(o.left)} m</td>
                    <td style={{ ...tdR, color: T.text }}>{o.perDayNow.toFixed(1)} m</td>
                    <td style={tdR}>{o.left <= 0 ? '—' : o.daysLeft <= 0 ? 'Date passed' : `${o.perDayNeeded.toFixed(1)} m`}</td>
                    <td style={td}>{shortDate(o.wo.endDate)}<div style={{ fontSize: 12, color: T.faint }}>{o.daysLeft >= 0 ? `${o.daysLeft} days left` : `${-o.daysLeft} days ago`}</div></td>
                    <td style={{ ...td, color: T.text }}>{o.left <= 0 ? 'Done' : o.predicted ? shortDate(o.predicted) : 'Cannot say'}</td>
                    <td style={td}><Status tone={outlookTone[o.state]}>{o.state === 'late' ? `${o.daysLate} days late` : outlookWord[o.state]}</Status>
                      {o.atStake > 0 && <div style={{ fontSize: 11.5, color: T.faint, marginTop: 4 }}>late deduction about {moneyL(o.atStake)}</div>}</td>
                    <td style={{ ...tdR, color: o.recoveryFloor != null && o.recoveryPct < o.recoveryFloor ? T.text : T.muted, fontWeight: o.recoveryFloor != null && o.recoveryPct < o.recoveryFloor ? 700 : 400 }}>
                      {o.metres ? pc(o.recoveryPct) : '—'}{o.recoveryFloor != null && <div style={{ fontSize: 11.5, color: T.faint, fontWeight: 400 }}>contract band {o.recoveryFloor}%</div>}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}

        <Card title="Rig by rig" subtitle="Every rig in the period, fastest first." pad={false}>
          <Table>
            <thead><tr>
              <th style={th}>Rig</th><th style={th}>Whose</th><th style={thR}>Rig-days</th><th style={thR}>Metres</th><th style={th}>Metres a rig-day</th><th style={thR}>m a drilling hour</th>
              <th style={thR}>Core</th><th style={thR}>Availability</th><th style={thR}>Own stops</th><th style={thR}>Days on target</th><th style={thR}>Costs you / m</th><th style={thR}>Leaves you / m</th>
            </tr></thead>
            <tbody>
              {sc.rigs.map(r => {
                const key = r.kind === 'own' ? 'own' : r.contractorId!
                const top = Math.max(...sc.rigs.map(x => x.perRigDay), 1)
                return (
                  <tr key={r.key} style={{ borderBottom: rowLine }}>
                    <td style={tdStrong}>{r.name}</td>
                    <td style={td}><span style={{ display: 'inline-flex', alignItems: 'center' }}><Dot colour={colour(key)} />{r.party}</span></td>
                    <td style={tdR}>{r.days}</td>
                    <td style={tdR}>{n0(r.metres)}</td>
                    <td style={td}>
                      <div style={{ display: 'grid', gridTemplateColumns: '38px 110px', gap: 8, alignItems: 'center' }}>
                        <span style={{ color: T.text, fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.perRigDay.toFixed(1)}</span>
                        <div style={{ height: 7, background: 'rgba(var(--x-ov),0.06)', borderRadius: 4 }}><div style={{ width: `${(r.perRigDay / top) * 100}%`, height: '100%', background: colour(key), borderRadius: 4 }} /></div>
                      </div>
                    </td>
                    <td style={tdR}>{r.perHour.toFixed(2)}</td>
                    <td style={tdR}>{r.metres ? pc(r.recoveryPct) : '—'}</td>
                    <td style={tdR}>{pc(r.availabilityPct)}</td>
                    <td style={tdR}>{r.ownStopHours ? `${n0(r.ownStopHours)} h` : '—'}</td>
                    <td style={{ ...tdR, color: r.targetDays && r.onTargetDays < r.targetDays / 2 ? T.amber : undefined }}>{r.targetDays ? `${r.onTargetDays} of ${r.targetDays}` : '—'}</td>
                    <td style={tdR}>{r.metres ? money(r.costPerMetre) : '—'}</td>
                    <td style={{ ...tdR, color: T.text, fontWeight: 600 }}>{r.metres ? money(r.marginPerMetre) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        </Card>

        {!sc.hasContractors && <Note>When a contractor&rsquo;s shifts are checked into the record, he appears here beside your own rigs on the same measures.</Note>}

        <Basis lines={[
          'Metres, days and core come from the drill logs. A contractor’s shift counts only after your site staff have checked it.',
          'Cost on your own rig is fuel, crew, repairs, parts and the rig itself, from Finance. Cost on a contractor’s rig is the rate in his work order, before any deduction on a bill.',
          'What the client pays is your contract rate for each metre at the depth and in the ground it was drilled.',
          'Rig availability is shift hours less the hours lost to the driller’s own stops. Standby is not counted against anyone.',
          'Corrected shifts are those where the checked metres or core differ from what the contractor sent. Above the record is what a bill claimed beyond the checked shifts.',
          'Done by takes the metres left on the work order and divides by what his rigs have made a day over the last 30 days, every day counted.',
        ]} note="The contractor’s own costs and margin are his. XPLORIX never asks for them and they are not part of any figure here." />
      </>}
    </Page>
  )
}
