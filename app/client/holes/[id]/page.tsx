'use client'

import { useMemo, useState } from 'react'
import { holeVerdict } from '../../../../lib/log-checks'
import { CheckedMark } from '../../../components/checked-mark'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { money, perUnit, COMPANY_NAME } from '../../../../lib/costing-store'
import { useClient, CLIENT_HOLE } from '../../../../lib/client-view'
import { num, downloadCsv, type HoleShift } from '../../../../lib/client-record'
import { projectHoles, day } from '../../../../lib/projects'
import { PHOTO_SHIFTS } from '../../../../lib/core/photo-summary'
import {
  Page, PageHead, Card, Tile, Grid, Split, Btn, Table, Status, Note, Modal, Field, Empty, inputStyle,
  th, thR, td, tdR, tdStrong, rowLine, T, tint,
  Seg,
} from '../../../components/kit'
import { holeSurvey } from '../../../../lib/survey'
import { depthBands } from '../../../../lib/plan'
import { useInventory } from '../../../../lib/inventory-store'
import { Path3D, PlanView, SectionView, DeviationFigures } from '../../../components/hole-path'
import { SurveyTable, DepthPanel } from '../../../components/survey-panel'

/* ==========================================================================
 * ONE HOLE — from the first metre to the invoice
 *
 * The client reads the same things in the same order for every hole: how
 * deep, how well, what ground, what stopped it, and what it bills. A finished
 * hole that has been sent to him is approved or sent back from this page.
 * What the hole cost to drill is not here and is never sent to this side.
 * ========================================================================== */

const n1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString('en-US')

export default function ClientHole() {
  const { id } = useParams<{ id: string }>()
  const c = useClient()
  const holeId = decodeURIComponent(id)
  const hole = c.holes.find(h => h.id === holeId)
  const [sendBack, setSendBack] = useState(false)
  const [reason, setReason] = useState('')

  if (!hole) {
    // A hole that is still only on the plan has no shifts to show.
    const plan = c.projects.flatMap(p => projectHoles(c.state, p.name).map(h => ({ ...h, project: p.name }))).find(h => h.id === holeId)
    return (
      <Page>
        <Back />
        {plan
          ? <PageHead question={`Hole ${plan.id}`} answer={<>On the plan for {plan.project}{plan.planned ? ` at ${num(plan.planned)} m` : ''}{plan.holeSize ? `, ${plan.holeSize}` : ''}. Drilling has not started.{plan.note ? ` ${plan.note}` : ''}</>} />
          : <Card><Empty>No hole called {holeId} is on your projects.</Empty></Card>}
      </Page>
    )
  }

  const shifts = hole.shifts
  const hours = (k: 'drilling' | 'trips' | 'standby' | 'breakdown') => shifts.reduce((s, x) => s + x[k], 0)
  const drillH = hours('drilling'), otherH = hours('trips'), standbyH = hours('standby'), ownH = hours('breakdown')
  const allH = drillH + otherH + standbyH + ownH
  const rate = drillH > 0 ? hole.drilled / drillH : null
  const stops = shifts.flatMap(s => s.stoppages.map(x => ({ ...x, date: s.date, shift: s.shift, rig: s.rig })))
  const incidents = c.shifts.filter(s => s.hole === hole.id).flatMap(s => s.incidents.map(x => ({ ...x, date: s.date, shift: s.shift, rig: s.rig })))
  const invoice = c.invoices.find(i => i.id === hole.invoiceId) ?? c.invoices.find(i => i.holes.includes(hole.id))
  const st = CLIENT_HOLE[hole.status]
  const rigs = Array.from(new Set(shifts.map(s => s.rig)))
  const billed = hole.billing.reduce((s, b) => s + b.amount, 0)

  // The ground, as the drillers logged it: one row for each run of the same formation.
  const ground: { from: number; to: number; formation: string; lithology: string; metres: number; core: number }[] = []
  shifts.filter(s => s.metres > 0).forEach(s => {
    const last = ground[ground.length - 1]
    const lith = s.lithology ?? ''
    const core = s.metres * (s.recoveryPct ?? 0) / 100
    if (last && last.formation === (s.formation ?? '') && last.lithology === lith) { last.to = s.to; last.metres += s.metres; last.core += core }
    else ground.push({ from: s.from, to: s.to, formation: s.formation ?? '', lithology: lith, metres: s.metres, core })
  })

  const exportCsv = () => downloadCsv(`hole-${hole.id}`, [
    ['Date', 'Shift', 'Rig', 'From (m)', 'To (m)', 'Metres', 'Core recovery %', 'Formation', 'Lithology', 'Drilling hours', 'Other work hours', 'Standby hours', 'Stopped, not charged', 'Reasons', 'Crew', 'Supervisor', 'Driller'],
    ...shifts.map(s => [s.date, s.shift, s.rig, s.from, s.to, s.metres, s.recoveryPct, s.formation, s.lithology, s.drilling, s.trips, s.standby, s.breakdown, s.stoppages.map(x => `${x.reason} ${x.hours}h`).join('; '), s.crew, s.supervisor, s.driller]),
  ])

  return (
    <Page>
      <Back />
      <PageHead question={`Hole ${hole.id}`} tone={st.tone}
        answer={<>
          {n1(hole.drilled)} m drilled{hole.planned ? ` of ${num(hole.planned)} m planned` : ''} in {hole.days} {hole.days === 1 ? 'day' : 'days'}, with core recovery of {hole.recoveryPct.toFixed(1)}%.{' '}
          {standbyH + ownH > 0 ? <>{standbyH + ownH} hours were lost to stops: {standbyH} h standby, {ownH} h {COMPANY_NAME}&rsquo;s own. </> : 'No hours were lost to stops. '}
          It bills {money(hole.value)} at your contract rates, before tax.
        </>}
        right={<div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, color: T.muted }}>
          <CheckedMark v={holeVerdict(c.state, hole.id)} />
          <span>{hole.project} · {rigs.join(', ')}</span><Status tone={st.tone}>{st.label}</Status>
          <Btn size="sm" onClick={exportCsv}>Export shifts</Btn>
        </div>} />

      {hole.status === 'submitted' && (
        <Card>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 380px', minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{COMPANY_NAME} has sent this hole for your approval</div>
              <div style={{ fontSize: 13, color: T.muted, marginTop: 4, lineHeight: 1.55 }}>
                {n1(hole.drilled)} m and {hole.standbyDays} standby {hole.standbyDays === 1 ? 'day' : 'days'}, {money(hole.value)} before tax{hole.submittedAt ? ` · sent ${day(hole.submittedAt)}` : ''}.
                Approving lets them invoice it. Sending it back returns it to them with your reason.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn kind="danger" onClick={() => { setReason(''); setSendBack(true) }}>Send back</Btn>
              <Btn kind="good" onClick={() => c.ownerDecideHole(hole.id, true)}>Approve hole</Btn>
            </div>
          </div>
        </Card>
      )}
      {hole.status === 'closed' && hole.returnReason && (
        <Note tone="warn"><b style={{ color: T.text }}>You sent this hole back{hole.decidedAt ? ` on ${day(hole.decidedAt)}` : ''}.</b> {hole.returnReason} It will come to you again once {COMPANY_NAME} has answered.</Note>
      )}
      {hole.status === 'approved' && <Note tone="good"><b style={{ color: T.text }}>You approved this hole{hole.decidedAt ? ` on ${day(hole.decidedAt)}` : ''}.</b> {COMPANY_NAME} can now invoice it.</Note>}
      {hole.status === 'invoiced' && invoice && (
        <Note tone="info"><b style={{ color: T.text }}>This hole is on invoice {invoice.number}.</b>{' '}
          <Link href={`/client/invoices?open=${encodeURIComponent(invoice.id)}`} style={{ color: T.orange, fontWeight: 600, textDecoration: 'none' }}>Open the invoice</Link></Note>
      )}

      <Grid min={150}>
        <Tile label="Planned depth" value={hole.planned ? `${num(hole.planned)} m` : '—'} />
        <Tile label="Drilled" value={`${n1(hole.drilled)} m`} note={hole.planned ? `${Math.round((hole.drilled / hole.planned) * 100)}% of the plan` : undefined} />
        <Tile label="Days on hole" value={hole.days} note={`${day(hole.start)}${hole.end ? ` to ${day(hole.end)}` : ' · still drilling'}`} />
        <Tile label="Metres an hour" value={rate == null ? '—' : rate.toFixed(2)} note={`${drillH} drilling hours`} />
        <Tile label="Core recovery" value={hole.drilled > 0 ? `${hole.recoveryPct.toFixed(1)}%` : '—'} />
        <Tile label="Standby days" value={hole.standbyDays} tone={hole.standbyDays ? 'warn' : undefined} note={hole.standbyDays ? money(hole.standbyAmount) : 'None charged'} />
        <Tile label="Value" value={money(hole.value)} note="Before tax" />
      </Grid>

      <Split left={3} right={2}>
        <Card title="Depth, shift by shift" subtitle="A flat stretch is a shift that drilled little or nothing.">
          <DepthChart shifts={shifts} planned={hole.planned} />
        </Card>
        <Card title="What this hole bills" subtitle="Metres from the shift record at your contract rates." pad={false}>
          <Table>
            <thead><tr><th style={th}>Rate line</th><th style={thR}>Metres</th><th style={thR}>Rate</th><th style={thR}>Amount</th></tr></thead>
            <tbody>
              {hole.billing.map(b => (
                <tr key={b.label} style={{ borderBottom: rowLine }}>
                  <td style={{ ...td, whiteSpace: 'normal' }}>{b.label}</td>
                  <td style={tdR}>{n1(b.metres)} m</td>
                  <td style={tdR}>{perUnit(b.rate)}</td>
                  <td style={{ ...tdR, color: T.text }}>{money(b.amount)}</td>
                </tr>
              ))}
              {hole.standbyAmount > 0 && (
                <tr style={{ borderBottom: rowLine }}>
                  <td style={td}>Standby</td><td style={tdR}>{hole.standbyDays} {hole.standbyDays === 1 ? 'day' : 'days'}</td><td style={tdR} />
                  <td style={{ ...tdR, color: T.text }}>{money(hole.standbyAmount)}</td>
                </tr>
              )}
              {hole.billing.length === 0 && hole.standbyAmount === 0 && <tr><td style={{ ...td, padding: 20 }} colSpan={4}>Nothing to bill yet.</td></tr>}
              <tr>
                <td style={{ ...td, color: T.text, fontWeight: 700 }} colSpan={3}>Total before tax</td>
                <td style={{ ...tdR, color: T.text, fontWeight: 700 }}>{money(billed + hole.standbyAmount)}</td>
              </tr>
            </tbody>
          </Table>
          <div style={{ fontSize: 12, color: T.faint, padding: '10px 14px 14px', lineHeight: 1.5 }}>
            This is what you pay. What the hole cost {COMPANY_NAME} to drill stays on their side.
          </div>
        </Card>
      </Split>

      <Split left={2} right={3}>
        <Card title="Where the hours went" subtitle={`${allH} hours on this hole across ${shifts.length} shifts.`}>
          {allH === 0 ? <Empty>No hours logged.</Empty> : <>
            <div role="img" aria-label={`Drilling ${drillH} hours, other work ${otherH} hours, standby ${standbyH} hours, own stops ${ownH} hours`} style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', gap: 2 }}>
              {HOURS.map(k => { const v = { drilling: drillH, trips: otherH, standby: standbyH, breakdown: ownH }[k.key]; return v > 0 ? <div key={k.key} style={{ flex: v, background: k.color }} /> : null })}
            </div>
            <div style={{ display: 'grid', gap: 9, marginTop: 16 }}>
              {HOURS.map(k => {
                const v = { drilling: drillH, trips: otherH, standby: standbyH, breakdown: ownH }[k.key]
                return (
                  <div key={k.key} style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 13 }}>
                    <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: k.color, flexShrink: 0, alignSelf: 'center' }} />
                    <span style={{ color: T.text, fontWeight: 600, flex: 1 }}>{k.label}<span style={{ color: T.faint, fontWeight: 400 }}> · {k.note}</span></span>
                    <span style={{ color: T.text, fontVariantNumeric: 'tabular-nums' }}>{v} h</span>
                    <span style={{ color: T.faint, width: 40, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Math.round((v / allH) * 100)}%</span>
                  </div>
                )
              })}
            </div>
          </>}
        </Card>
        <Card title="The ground" subtitle="Formation and lithology as the drillers logged them, by depth." pad={false}>
          {ground.length === 0 ? <Empty>No metres logged yet.</Empty> : (
            <Table>
              <thead><tr><th style={th}>From</th><th style={th}>To</th><th style={th}>Formation</th><th style={th}>Lithology</th><th style={thR}>Metres</th><th style={thR}>Core recovery</th></tr></thead>
              <tbody>
                {ground.map((g, i) => (
                  <tr key={i} style={{ borderBottom: rowLine }}>
                    <td style={td}>{n1(g.from)} m</td><td style={td}>{n1(g.to)} m</td>
                    <td style={{ ...td, color: T.text }}>{g.formation || '—'}</td><td style={td}>{g.lithology || '—'}</td>
                    <td style={tdR}>{n1(g.metres)}</td><td style={tdR}>{g.metres > 0 ? `${((g.core / g.metres) * 100).toFixed(0)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </Split>
      <ClientCore hole={hole.id} />

      <Card title="Stops on this hole" subtitle={`${standbyH} h standby, charged when a full day is lost · ${ownH} h ${COMPANY_NAME}'s own, never charged`} pad={false}>
        {stops.length === 0 ? <Empty>No stops recorded on this hole.</Empty> : (
          <Table>
            <thead><tr><th style={th}>Date</th><th style={th}>Shift</th><th style={th}>Rig</th><th style={th}>Reason</th><th style={thR}>Hours</th><th style={th}>Whose stop</th></tr></thead>
            <tbody>
              {stops.map((s, i) => (
                <tr key={i} style={{ borderBottom: rowLine }}>
                  <td style={td}>{day(s.date)}</td><td style={td}>{s.shift}</td><td style={td}>{s.rig}</td>
                  <td style={{ ...td, color: T.text, whiteSpace: 'normal' }}>{s.reason}</td><td style={tdR}>{s.hours}</td>
                  <td style={td}><Status tone={s.side === 'client' ? 'warn' : 'neutral'}>{s.side === 'client' ? 'Standby' : `${COMPANY_NAME}, not charged`}</Status></td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {incidents.length > 0 && (
        <Card title="Incidents on this hole" pad={false}>
          <Table>
            <thead><tr><th style={th}>Date</th><th style={th}>Shift</th><th style={th}>Rig</th><th style={th}>Type</th><th style={th}>Severity</th><th style={th}>What happened</th></tr></thead>
            <tbody>
              {incidents.map((x, i) => (
                <tr key={i} style={{ borderBottom: rowLine }}>
                  <td style={td}>{day(x.date)}</td><td style={td}>{x.shift}</td><td style={td}>{x.rig}</td>
                  <td style={{ ...td, color: T.text }}>{x.type}</td><td style={td}>{x.severity}</td><td style={{ ...td, whiteSpace: 'normal' }}>{x.note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      <HoleSurveyAndSpeed hole={hole.id} state={c.state} />

      <Card title="Every shift on this hole" subtitle="Newest first. This is the record each billing line is checked against." pad={false}>
        <Table>
          <thead>
            <tr>
              <th style={th}>Date</th><th style={th}>Shift</th><th style={th}>Rig</th><th style={thR}>From</th><th style={thR}>To</th><th style={thR}>Metres</th><th style={thR}>Core</th>
              <th style={th}>Formation</th><th style={thR}>Drilling h</th><th style={thR}>Standby h</th><th style={thR}>Own stop h</th><th style={th}>Driller</th><th style={th}>Supervisor</th>
            </tr>
          </thead>
          <tbody>
            {[...shifts].reverse().map(s => (
              <tr key={s.id} style={{ borderBottom: rowLine }}>
                <td style={tdStrong}>{day(s.date)}</td><td style={td}>{s.shift}</td><td style={td}>{s.rig}</td>
                <td style={tdR}>{n1(s.from)}</td><td style={tdR}>{n1(s.to)}</td>
                <td style={{ ...tdR, color: T.text, fontWeight: 600 }}>{s.metres ? n1(s.metres) : '—'}</td>
                <td style={tdR}>{s.recoveryPct == null ? '—' : `${s.recoveryPct}%`}</td>
                <td style={td}>{[s.formation, s.lithology].filter(Boolean).join(' · ') || '—'}</td>
                <td style={tdR}>{s.drilling}</td>
                <td style={{ ...tdR, color: s.standby ? T.text : T.muted }}>{s.standby || '—'}</td>
                <td style={tdR}>{s.breakdown || '—'}</td>
                <td style={td}>{s.driller ?? '—'}</td><td style={td}>{s.supervisor ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {sendBack && (
        <Modal title={`Send hole ${hole.id} back`} width={560} onClose={() => setSendBack(false)}
          subtitle={`${COMPANY_NAME} will see your reason beside the hole and can send it again.`}
          footer={<>
            <Btn onClick={() => setSendBack(false)}>Cancel</Btn>
            <Btn kind="danger" disabled={!reason.trim()} onClick={() => { c.ownerDecideHole(hole.id, false, reason.trim()); setSendBack(false) }}>Send back</Btn>
          </>}>
          <Field label="What needs to be put right?">
            <textarea autoFocus value={reason} onChange={e => setReason(e.target.value)} rows={4} placeholder="For example: the standby on 27 Oct was their own breakdown" style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
          </Field>
        </Modal>
      )}
    </Page>
  )
}

const HOURS: { key: 'drilling' | 'trips' | 'standby' | 'breakdown'; label: string; note: string; color: string }[] = [
  { key: 'drilling', label: 'Drilling', note: 'bit on bottom', color: T.bar },
  { key: 'trips', label: 'Other work', note: 'rod trips, casing, set-up', color: tint(T.bar, 45) },
  { key: 'standby', label: 'Standby', note: 'charged when a full day is lost', color: T.amber },
  { key: 'breakdown', label: 'Own stops', note: 'never charged to you', color: T.faint },
]

/* Depth after each shift, with the planned depth as a dashed line. */
function DepthChart({ shifts, planned }: { shifts: HoleShift[]; planned?: number }) {
  if (shifts.length === 0) return <Empty>No shifts logged yet.</Empty>
  const W = 640, H = 220, L = 46, R = 12, Tp = 12, B = 26
  const max = Math.max(planned ?? 0, shifts[shifts.length - 1].to, 1) * 1.05
  const x = (i: number) => L + (shifts.length === 1 ? (W - L - R) / 2 : (i / (shifts.length - 1)) * (W - L - R))
  const y = (d: number) => Tp + (d / max) * (H - Tp - B)
  const pts = shifts.map((s, i) => `${x(i).toFixed(1)},${y(s.to).toFixed(1)}`).join(' ')
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round((max / 1.05) * f))
  const labelEvery = Math.max(1, Math.ceil(shifts.length / 7))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Depth after each shift, reaching ${Math.round(shifts[shifts.length - 1].to)} metres`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {ticks.map(t => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} style={{ stroke: T.border }} strokeWidth={1} opacity={0.7} />
          <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize={11} style={{ fill: T.faint }}>{t} m</text>
        </g>
      ))}
      {planned != null && (
        <g>
          <line x1={L} x2={W - R} y1={y(planned)} y2={y(planned)} style={{ stroke: T.muted }} strokeWidth={1.4} strokeDasharray="5 4" />
          <text x={W - R} y={y(planned) - 5} textAnchor="end" fontSize={11} style={{ fill: T.muted }}>Planned {planned} m</text>
        </g>
      )}
      <polyline points={`${x(0).toFixed(1)},${y(shifts[0].from).toFixed(1)} ${pts}`} fill="none" style={{ stroke: T.bar }} strokeWidth={2.2} strokeLinejoin="round" />
      {shifts.map((s, i) => (
        <g key={s.id}>
          <circle cx={x(i)} cy={y(s.to)} r={s.metres > 0 ? 3 : 3.4} style={{ fill: s.metres > 0 ? T.bar : T.amber }}>
            <title>{`${day(s.date)} ${s.shift}: ${s.metres} m, to ${Math.round(s.to * 10) / 10} m`}</title>
          </circle>
          {i % labelEvery === 0 && <text x={x(i)} y={H - 8} textAnchor="middle" fontSize={10.5} style={{ fill: T.faint }}>{day(s.date).replace(/ \d{4}$/, '')}</text>}
        </g>
      ))}
    </svg>
  )
}

function Back() {
  return (
    <Link href="/client/holes" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: T.faint, textDecoration: 'none' }}>
      <ArrowLeft size={13} /> All holes
    </Link>
  )
}

/* Core quality from the tray photos: what the client most wants from a hole
 * besides metres. Per shift, measured on the photos. */
function ClientCore({ hole }: { hole: string }) {
  const rows = Object.entries(PHOTO_SHIFTS).filter(([, p]) => p.hole === hole).map(([id, p]) => ({ id, ...p })).sort((a, b) => a.from - b.from)
  if (!rows.length) return null
  const L = rows.reduce((s, r) => s + r.photographed, 0)
  const rec = rows.reduce((s, r) => s + r.recovery * r.photographed, 0) / L
  const rqd = rows.reduce((s, r) => s + r.rqd * r.photographed, 0) / L
  const low = rows.filter(r => r.recovery < 85)
  return (
    <Card title="Core quality, from the tray photos" subtitle={`${n1(L)} m of core photographed: recovery ${rec.toFixed(0)}%, RQD ${rqd.toFixed(0)}%. Measured on each tray photo; figures can change once ${COMPANY_NAME}'s geologist has checked every tray.`} pad={false}>
      <Table>
        <thead><tr><th style={th}>Depth</th><th style={thR}>Core recovery</th><th style={thR}>RQD</th><th style={thR}>Fractures a metre</th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} style={{ borderBottom: rowLine }}>
              <td style={tdStrong}>{r.from}–{r.to} m</td>
              <td style={{ ...tdR, color: r.recovery < 85 ? T.red : T.muted }}>{r.recovery.toFixed(0)}%</td>
              <td style={tdR}>{r.rqd.toFixed(0)}%</td>
              <td style={tdR}>{r.ff.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
      {low.length > 0 && <div style={{ padding: '10px 18px', fontSize: 12.5, color: T.muted }}>{low.length} stretch{low.length > 1 ? 'es' : ''} under 85% recovery. Ask us for the tray photos.</div>}
    </Card>
  )
}

/* Where the hole went, as approved by the contractor's office, and how fast
 * each band of depth was drilled. What a metre cost the contractor is not
 * shown. Core quality is in its own card above, from XPLORIX Core. */
function HoleSurveyAndSpeed({ hole, state }: { hole: string; state: Parameters<typeof holeSurvey>[0] & Parameters<typeof depthBands>[0] }) {
  const { state: inv } = useInventory()
  const s = useMemo(() => {
    const all = holeSurvey(state, hole)
    return { ...all, readings: all.approved, warnings: all.warnings.filter(w => w.id === 'dev' || w.id === 'gap' || w.id === 'dls') }
  }, [state, hole])
  const { bands, step } = useMemo(() => depthBands(state, inv, hole, undefined, false), [state, inv, hole])
  const [shape, setShape] = useState<'3d' | 'plan' | 'section'>('3d')
  const hasPath = s.path.length > 1
  return (
    <>
      <Card title="Survey" subtitle={s.approved.length ? `${s.approved.length} approved ${s.approved.length === 1 ? 'reading' : 'readings'}, the deepest at ${n1(s.lastSurveyed)} m.` : 'No approved survey readings yet.'}
        right={hasPath ? <Seg<'3d' | 'plan' | 'section'> options={[{ value: '3d', label: '3D' }, { value: 'plan', label: 'Plan' }, { value: 'section', label: 'Section' }]} value={shape} onChange={setShape} /> : undefined}>
        {s.warnings.map(w => <div key={w.id} style={{ marginBottom: 12 }}><Note tone={w.tone === 'bad' ? 'bad' : 'warn'}><b style={{ color: T.text }}>{w.title}.</b> {w.detail}</Note></div>)}
        <DeviationFigures s={s} />
        {hasPath && <div style={{ marginTop: 16, maxWidth: shape === '3d' ? 760 : 560 }}>{shape === '3d' ? <Path3D s={s} /> : shape === 'plan' ? <PlanView s={s} /> : <SectionView s={s} />}</div>}
      </Card>
      {s.readings.length > 0 && <Card title="Survey readings" pad={false}><SurveyTable readings={s.readings} editable={false} /></Card>}
      <Card title="Down the hole" subtitle="How fast each band of depth was drilled.">
        <DepthPanel bands={bands} step={step} cost={false} />
      </Card>
    </>
  )
}
