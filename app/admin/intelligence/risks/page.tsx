'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { moneyL, monthLabel } from '../../../../lib/costing-store'
import { RISK_AREA_LABEL, type RiskArea, type Likelihood } from '../../../../lib/forecast'
import { buildRiskRegister, type ScoredRisk } from '../../../../lib/intelligence'
import { downloadCsv } from '../../../../lib/client-record'
import {
  T, tint, Page, PageHead, Card, Tile, Grid, Seg, Btn, Status, Table, Empty,
  th, thR, td, tdR, tdStrong, rowLine, type Tone,
} from '../../../components/kit'
import { Basis } from '../../../components/outlook'
import { useIntel, IntelTabs, n0 } from '../shared'
import { useInbox } from '../../../components/inbox'

/* ==========================================================================
 * RISK ANALYSIS — what can go wrong, how likely, how big, and what to do
 *
 * Every risk is found in the record, not typed in: a rig that runs out of
 * planned holes, a part that runs out before an order can arrive, a
 * contractor who will finish late, shifts nobody has checked, a bill above
 * the record, money drilled that cannot be billed.
 *
 * Each has a chance and a size. Size is judged against a month of billing,
 * so the same bands work for one rig or thirty. Chance times size puts them
 * in order, and each carries one thing to do.
 * ========================================================================== */

const chanceTone: Record<Likelihood, Tone> = { High: 'bad', Medium: 'warn', Low: 'neutral' }
const CHANCES: Likelihood[] = ['High', 'Medium', 'Low']
const SIZES: ScoredRisk['size'][] = ['Small', 'Medium', 'Large']
const band = (score: number): { tone: Tone; word: string } => score >= 6 ? { tone: 'bad', word: 'Act now' } : score >= 3 ? { tone: 'warn', word: 'Plan for it' } : { tone: 'neutral', word: 'Watch' }
const cellColour = (score: number) => score >= 6 ? tint(T.red, 13) : score >= 3 ? tint(T.amber, 13) : 'rgba(var(--x-ov),0.03)'

const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/* "Now", or a date like "22 Sep", placed on the four lanes. */
function laneOf(when: string, thisMonth: string, nextMonth: string): 'Now' | 'This month' | 'Next month' | 'Later' {
  const m = /^(\d{1,2}) (\w{3})/.exec(when)
  if (!m) return 'Now'
  const mi = MON3.indexOf(m[2]) + 1
  if (mi === Number(thisMonth.slice(5, 7))) return 'This month'
  if (mi === Number(nextMonth.slice(5, 7))) return 'Next month'
  return 'Later'
}

export default function RiskAnalysis() {
  const { state, f } = useIntel()
  const inbox = useInbox()
  const [area, setArea] = useState<'all' | RiskArea>('all')
  const all = useMemo(() => buildRiskRegister(f, state), [f, state])
  const numbered = all.map((r, i) => ({ ...r, n: i + 1 }))
  const shown = numbered.filter(r => area === 'all' || r.area === area)
  const now = all.filter(r => r.score >= 6)
  const atStake = all.reduce((s, r) => s + (r.impact ?? 0), 0)
  const areas = (Object.keys(RISK_AREA_LABEL) as RiskArea[]).map(a => {
    const mine = all.filter(r => r.area === a)
    return { area: a, count: mine.length, now: mine.filter(r => r.score >= 6).length, money: mine.reduce((s, r) => s + (r.impact ?? 0), 0), top: mine[0] }
  })
  const nextName = monthLabel(f.nextMonth).split(' ')[0]
  const top = all[0]

  const exportCsv = () => downloadCsv('risk-register', [
    ['No.', 'Risk', 'Area', 'What is happening', 'When', 'At stake', 'What that is', 'Chance', 'Size', 'Score (1 to 9)', 'Priority', 'What to do'],
    ...numbered.map(r => [r.n, r.title, RISK_AREA_LABEL[r.area], r.detail, r.when, r.impact == null ? '' : Math.round(r.impact), r.impactNote, r.likelihood, r.size, r.score, band(r.score).word, r.action]),
  ])

  return (
    <Page>
      <IntelTabs />
      <PageHead question="What can go wrong, and what should I do first?" tone={now.length ? 'bad' : all.length ? 'warn' : 'good'}
        answer={all.length === 0 ? 'Nothing found in the record that can go wrong over the next two months.' : <>
          {all.length} {all.length === 1 ? 'risk' : 'risks'} found in the record, with {moneyL(atStake)} at stake. <b style={{ color: T.text }}>{now.length} need action now.</b>{' '}
          {top ? <>First: {top.title.replace(/\.$/, '')}.</> : null}
        </>}
        right={<Btn size="sm" onClick={exportCsv} disabled={!all.length}>Export register</Btn>} />

      <Grid min={180}>
        <Tile label="Risks found" value={all.length} note={`${areas.filter(a => a.count).length} of 6 areas`} />
        <Tile label="Act now" value={now.length} tone={now.length ? 'bad' : 'good'} note="High chance, or large and likely" />
        <Tile label="Plan for it" value={all.filter(r => r.score >= 3 && r.score < 6).length} tone={all.some(r => r.score >= 3 && r.score < 6) ? 'warn' : undefined} note={`Before the end of ${nextName}`} />
        <Tile label="Watch" value={all.filter(r => r.score < 3).length} note="Small or unlikely" />
        <Tile label="Money at stake" value={moneyL(atStake)} note="Risks that can be put in money" />
      </Grid>

      {all.length === 0 ? <Card><Empty>No risks found for the period.</Empty></Card> : <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 430px), 1fr))', gap: 16 }}>
          <Card title="Chance against size" subtitle="Each number is a risk in the register below. Top right is where to start.">
            <div style={{ display: 'grid', gridTemplateColumns: '74px repeat(3, minmax(0, 1fr))', gap: 5 }}>
              <div />
              {SIZES.map(s => <div key={s} style={{ fontSize: 11.5, fontWeight: 600, color: T.faint, textAlign: 'center', paddingBottom: 3 }}>{s}</div>)}
              {CHANCES.map((c, ci) => [
                <div key={c} style={{ fontSize: 11.5, fontWeight: 600, color: T.faint, display: 'flex', alignItems: 'center' }}>{c} chance</div>,
                ...SIZES.map((s, si) => {
                  const inCell = numbered.filter(r => r.likelihood === c && (r.size === s || (r.size === 'Not in money' && s === 'Medium')))
                  const score = (3 - ci) * (si + 1)
                  return (
                    <div key={c + s} style={{ minHeight: 62, borderRadius: 8, padding: 7, background: cellColour(score), border: `1px solid ${T.line}`, display: 'flex', flexWrap: 'wrap', gap: 5, alignContent: 'flex-start' }}>
                      {inCell.map(r => (
                        <a key={r.key} href={`#risk-${r.n}`} title={r.title} onClick={() => setArea('all')} style={{
                          minWidth: 24, height: 24, padding: '0 6px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 700, color: T.text, background: T.card, border: `1px solid ${T.border}`, textDecoration: 'none',
                        }}>{r.n}</a>
                      ))}
                    </div>
                  )
                }),
              ])}
            </div>
            <div style={{ fontSize: 12, color: T.faint, marginTop: 12, lineHeight: 1.55 }}>
              Size is the money at stake against a month of billing: large is a tenth or more, medium is 3% or more. A risk that cannot be put in money sits in the middle column.
            </div>
          </Card>

          <Card title="Money at stake, by area" subtitle="Each bar is the money the risks in that area put at stake. Red is the part that needs action now.">
            <div style={{ display: 'grid', gap: 12 }}>
              {(() => {
                const top = Math.max(1, ...areas.map(a => a.money))
                return areas.filter(a => a.count).sort((x, y) => y.money - x.money).map(a => {
                  const nowMoney = all.filter(r => r.area === a.area && r.score >= 6).reduce((t, r) => t + (r.impact ?? 0), 0)
                  return (
                    <button key={a.area} type="button" onClick={() => setArea(a.area)} style={{ display: 'grid', gap: 5, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}>
                      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, color: T.text }}>
                        <b>{RISK_AREA_LABEL[a.area]}</b>
                        <span>{a.money ? moneyL(a.money) : 'Not in money'} · {a.count} {a.count === 1 ? 'risk' : 'risks'}{a.now ? <b style={{ color: 'var(--x-bad-text)' }}> · {a.now} now</b> : null}</span>
                      </span>
                      <span aria-hidden style={{ position: 'relative', height: 12, borderRadius: 99, background: 'rgba(var(--x-ov),0.06)', overflow: 'hidden' }}>
                        <span style={{ position: 'absolute', inset: 0, width: `${(a.money / top) * 100}%`, background: tint(T.amber, 70), borderRadius: 99 }} />
                        <span style={{ position: 'absolute', inset: 0, width: `${(nowMoney / top) * 100}%`, background: T.red, borderRadius: 99 }} />
                      </span>
                    </button>
                  )
                })
              })()}
            </div>
            <div style={{ marginTop: 18, paddingTop: 14, borderTop: rowLine }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 10 }}>When they land</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
                {(['Now', 'This month', 'Next month', 'Later'] as const).map(lane => {
                  const inLane = numbered.filter(r => laneOf(r.when, f.thisMonth, f.nextMonth) === lane)
                  return (
                    <div key={lane} style={{ background: 'rgba(var(--x-ov),0.035)', borderRadius: 10, padding: 8, minHeight: 70, display: 'flex', flexWrap: 'wrap', gap: 5, alignContent: 'flex-start' }}>
                      <span style={{ width: '100%', fontSize: 11.5, fontWeight: 700, color: T.muted }}>{lane} · {inLane.length}</span>
                      {inLane.map(r => <a key={r.key} href={`#risk-${r.n}`} title={r.title} style={{ minWidth: 24, height: 24, padding: '0 6px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', background: r.score >= 6 ? T.red : r.score >= 3 ? T.amber : 'var(--x-muted)', textDecoration: 'none' }}>{r.n}</a>)}
                    </div>
                  )
                })}
              </div>
            </div>
          </Card>
        </div>

        <Card title="Risk register" pad={false}
          subtitle="Most pressing first. Each risk is also a task: open it for the cause and a drafted next step."
          right={<Seg<'all' | RiskArea> value={area} onChange={setArea} options={[{ value: 'all', label: `All · ${all.length}` }, ...areas.filter(a => a.count).map(a => ({ value: a.area, label: `${RISK_AREA_LABEL[a.area]} · ${a.count}` }))]} />}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
              <thead><tr>
                <th style={{ ...th, width: 34 }}>No.</th><th style={{ ...th, width: '30%' }}>Risk</th><th style={th}>When</th><th style={{ ...thR, minWidth: 150 }}>At stake</th>
                <th style={th}>Chance</th><th style={th}>Size</th><th style={th}>Priority</th><th style={{ ...th, width: '30%' }}>What to do</th>
              </tr></thead>
              <tbody>
                {shown.map(r => {
                  const b = band(r.score)
                  const cell: React.CSSProperties = { padding: '13px 12px', fontSize: 13, color: T.muted, verticalAlign: 'top', lineHeight: 1.5 }
                  return (
                    <tr key={r.key} id={`risk-${r.n}`} style={{ borderBottom: rowLine, scrollMarginTop: 90 }}>
                      <td style={{ ...cell, color: T.text, fontWeight: 700 }}>{r.n}</td>
                      <td style={cell}>
                        <div style={{ fontWeight: 600, color: T.text }}>{r.title}</div>
                        <div style={{ fontSize: 12.5, marginTop: 3 }}>{r.detail}</div>
                        <div style={{ fontSize: 11.5, color: T.faint, marginTop: 5 }}>{RISK_AREA_LABEL[r.area]}</div>
                      </td>
                      <td style={{ ...cell, whiteSpace: 'nowrap', color: T.text }}>{r.when}</td>
                      <td style={{ ...cell, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums' }}>{r.impact == null ? '—' : moneyL(r.impact)}</div>
                        <div style={{ fontSize: 11.5, color: T.faint, marginTop: 2, whiteSpace: 'normal', maxWidth: 150, marginLeft: 'auto' }}>{r.impactNote}</div>
                      </td>
                      <td style={cell}><Status tone={chanceTone[r.likelihood]}>{r.likelihood}</Status></td>
                      <td style={{ ...cell, whiteSpace: 'nowrap' }}>{r.size}</td>
                      <td style={cell}><Status tone={b.tone}>{b.word}</Status><div style={{ fontSize: 11.5, color: T.faint, marginTop: 4 }}>{r.score} of 9</div></td>
                      <td style={cell}>
                        <div style={{ color: T.text }}>{r.action}</div>
                        {(() => {
                          const task = inbox.units.find(u => u.items.some(i => i.id === `risk:${r.key}`))
                          return task
                            ? <Link href={`/admin/tasks?dept=all&open=${encodeURIComponent(task.id)}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 12.5, fontWeight: 600, color: T.orange, textDecoration: 'none' }}>Why, and the drafted next step <ArrowRight size={13} /></Link>
                            : <Link href={r.href} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 12.5, fontWeight: 600, color: T.orange, textDecoration: 'none' }}>{r.linkLabel} <ArrowRight size={13} /></Link>
                        })()}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </>}

      {f.rigs.length > 0 && (
        <Card title="Rig watch" pad={false} subtitle="The last 30 days of each rig. A rig that stops often, or has nothing planned, is where a forecast breaks.">
          <Table>
            <thead><tr>
              <th style={th}>Rig</th><th style={thR}>Days logged</th><th style={thR}>Days with no metres</th><th style={thR}>Own stop hours</th><th style={thR}>Standby hours</th>
              <th style={thR}>Makes a day</th><th style={thR}>Slowest month</th><th style={thR}>Idle days in {nextName}</th><th style={th}>Reading</th>
            </tr></thead>
            <tbody>
              {f.rigs.map(r => {
                const share = r.loggedDays ? r.zeroDays / r.loggedDays : 0
                const read: { tone: Tone; word: string } = r.next.idleDays > 0 ? { tone: 'warn', word: 'Runs out of holes' }
                  : share >= 0.15 ? { tone: 'warn', word: 'Stops often' } : r.ownHours >= 24 ? { tone: 'warn', word: 'Losing hours to its own stops' } : { tone: 'good', word: 'Steady' }
                return (
                  <tr key={r.rig} style={{ borderBottom: rowLine }}>
                    <td style={{ ...tdStrong, whiteSpace: 'normal' }}>{r.rig}<div style={{ fontSize: 11.5, color: T.faint, fontWeight: 400 }}>{r.project.split(' - ')[0]}{r.contractor ? ' · contractor' : ''}</div></td>
                    <td style={tdR}>{r.loggedDays}</td>
                    <td style={{ ...tdR, color: r.zeroDays ? T.text : T.muted }}>{r.zeroDays || '—'}</td>
                    <td style={{ ...tdR, color: r.ownHours ? T.text : T.muted }}>{r.ownHours ? `${n0(r.ownHours)} h` : '—'}</td>
                    <td style={tdR}>{r.clientHours ? `${n0(r.clientHours)} h` : '—'}</td>
                    <td style={tdR}>{r.perDay.toFixed(1)} m</td>
                    <td style={tdR}>{r.slow.toFixed(1)} m</td>
                    <td style={{ ...tdR, color: r.next.idleDays ? T.text : T.muted, fontWeight: r.next.idleDays ? 700 : 400 }}>{r.next.idleDays || '—'}</td>
                    <td style={td}><Status tone={read.tone}>{read.word}</Status></td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        </Card>
      )}


      <Basis lines={[
        'Holes and plan: the forecast walks each rig forward hole by hole. A rig with no planned hole left is idle, and an idle rig still costs its crew and ownership.',
        'Parts and stock: metres to be drilled divided by each part’s life, against the store and open orders, with the supplier’s delivery time.',
        'Money: holes drilled and not closed, closed and not approved, and invoices overdue or disputed.',
        'Contractors: metres left on each work order against what his rigs make a day; shifts waiting to be checked; bills above the checked record.',
        'Rigs: days with no log, and days with shifts and no metres, over the last 30 days.',
        'Safety: incidents written on the drill logs in the last 30 days.',
        'Chance is high, medium or low from how certain the record makes it. Size is the money at stake against a month of billing. Priority is chance times size, from 1 to 9.',
      ]} note="Every risk here is found in your own records and can be traced to the screen it links to. It is not a trained model. Prediction that learns from past projects, ground and core is in development." />
    </Page>
  )
}
