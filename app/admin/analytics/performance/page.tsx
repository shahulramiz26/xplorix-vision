'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts'
import { holeShifts, type Insight } from '../../../../lib/analytics'
import { projectHoles } from '../../../../lib/projects'
import { useInventory } from '../../../../lib/inventory-store'
import { Page, PageHead, Card, Tile, Grid, Table, Empty, Status, Tip, inputStyle, axisTick, gridStroke, th, thR, td, tdR, tdStrong, rowLine, T } from '../../../components/kit'
import { useAnalytics, BoardTabs, FilterBar, n1 } from '../shared'
import { useCosting, ADMIN_NAME, nowStamp, money } from '../../../../lib/costing-store'
import { holeSurvey, SURVEY_LIMITS, type SurveyReading } from '../../../../lib/survey'
import { depthBands } from '../../../../lib/plan'
import { Path3D, PlanView, SectionView, DeviationFigures } from '../../../components/hole-path'
import { SurveyTable, AddReadingsModal, ImportSurveyModal, DepthPanel } from '../../../components/survey-panel'
import { Seg, Btn, Split, Note } from '../../../components/kit'

/* HOLE BY HOLE — what happened in this hole?
 *
 *   Shift by shift   depth against plan, every shift's metres, stops and
 *                    parts, from the drill logs of whichever rigs worked it
 *   Survey           where the hole went: the path from the approved survey
 *                    readings against the planned line, in 3D, from above and
 *                    from the side, and every reading with its status
 *   Down the hole    drilling speed and cost per metre, band by band
 *                    (drilling only; what the core says is in XPLORIX Core) */

type View = 'shifts' | 'survey' | 'depth'
const VIEWS: { value: View; label: string }[] = [{ value: 'shifts', label: 'Shift by shift' }, { value: 'survey', label: 'Survey' }, { value: 'depth', label: 'Down the hole' }]

export default function HoleByHole() {
  const { state, f } = useAnalytics()
  const { state: inv } = useInventory()
  const projects = (state.projects ?? []).filter(p => f.project === 'all' || p.name === f.project)
  const holes = useMemo(() => projects.flatMap(p => projectHoles(state, p.name).filter(h => h.status !== 'planned').map(h => ({ ...h, project: p.name }))), [state, projects])
  const [pick, setPick] = useState('')
  const [view, setView] = useState<View>('shifts')
  // A link can name the hole and the view: ?hole=DH-013&view=survey
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const h = q.get('hole'), v = q.get('view')
    if (h) setPick(h)
    if (v && VIEWS.some(x => x.value === v)) setView(v as View)
  }, [])
  const hole = holes.find(h => h.id === pick) ?? holes[0]
  const rows = useMemo(() => hole ? holeShifts(state, hole.id) : [], [state, hole])
  const partName = (id: string) => inv.catalogue.find(p => p.id === id)?.name ?? 'Part'

  const metres = rows.reduce((s, r) => s + r.l.metresDrilled, 0)
  const core = rows.reduce((s, r) => s + r.l.coreRecovery, 0)
  const hours = rows.filter(r => !r.l.segmentOf).reduce((s, r) => s + r.l.drillingHours, 0)
  const own = rows.reduce((s, r) => s + r.own, 0), client = rows.reduce((s, r) => s + r.client, 0)
  const days = new Set(rows.map(r => r.l.date)).size
  const switchAt = rows.find((r, i) => i > 0 && r.l.metresDrilled > 0 && r.l.holeSize !== rows[i - 1].l.holeSize)
  const chart = rows.filter(r => !r.l.segmentOf || r.l.metresDrilled > 0).map(r => ({ label: r.label, depth: r.to }))

  const insights: Insight[] = []
  if (rows.length) {
    const drilled = rows.filter(r => r.l.metresDrilled > 0)
    const best = [...drilled].sort((a, b) => b.l.metresDrilled - a.l.metresDrilled)[0]
    if (best) insights.push({ id: 'best', tone: 'good', title: `Best shift: ${n1(best.l.metresDrilled)} m on ${best.label}`, detail: `${best.l.driller ?? 'Driller not named'} on ${best.l.rig}, ${best.l.holeSize} in ${best.l.formationType.toLowerCase()}. The hole averaged ${n1(metres / Math.max(1, drilled.length))} m a drilling shift.` })
    const longest = [...rows].sort((a, b) => (b.own + b.client) - (a.own + a.client))[0]
    if (longest && longest.own + longest.client > 0) insights.push({ id: 'stop', tone: longest.own ? 'warn' : 'info', title: `Longest stop: ${n1(longest.own + longest.client)} h on ${longest.label}`, detail: `${longest.reasons.join(', ')}. ${n1(own)} h of the hole's stops were your own, ${n1(client)} h the client's.` })
    const bits = rows.flatMap(r => (r.l.partsUsed ?? []).filter(u => /bit/i.test(partName(u.itemId))))
    insights.push({ id: 'bits', tone: 'info', title: bits.length ? `${bits.length} bit ${bits.length === 1 ? 'change' : 'changes'} logged` : 'No bit change logged', detail: bits.length ? `${n1(metres / bits.length)} m a bit on this hole.` : 'If a bit was changed, the driller should add it under Accessories, so stock and bit life stay right.' })
    if (hole?.planned && metres < hole.planned && hole.status === 'drilling') insights.push({ id: 'left', tone: 'info', title: `${n1(hole.planned - metres)} m to planned depth`, detail: `At this hole's ${n1(metres / Math.max(1, days))} m a day, about ${Math.ceil((hole.planned - metres) / Math.max(0.1, metres / Math.max(1, days)))} more days.` })
  }

  return (
    <Page>
      <PageHead question="What happened in this hole, shift by shift?"
        answer={hole ? <>{hole.id}: {n1(metres)} m of {hole.planned ? `${hole.planned} m planned` : 'no planned depth'}, in {days} days on {Array.from(new Set(rows.map(r => r.l.rig))).join(' and ')}.</> : <>No hole has been drilled for these filters.</>}
        right={<FilterBar withPeriod={false} />} />
      <BoardTabs />
      {!hole ? <Card><Empty>No hole drilled yet for these filters.</Empty></Card> : <>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <select aria-label="Hole" value={hole.id} onChange={e => setPick(e.target.value)} style={{ ...inputStyle, width: 'auto', padding: '6px 10px', fontSize: 12.5, cursor: 'pointer' }}>
            {holes.map(h => <option key={h.id} value={h.id}>{h.id} · {h.project} · {h.status === 'drilling' ? 'drilling' : 'finished'}</option>)}
          </select>
          <Status tone={hole.status === 'drilling' ? 'info' : 'good'}>{hole.status === 'drilling' ? 'Drilling' : 'Finished'}</Status>
          <div style={{ flex: 1 }} />
          <Seg<View> options={VIEWS} value={view} onChange={setView} />
        </div>
        {view === 'survey' && <SurveyView hole={hole.id} project={hole.project} />}
        {view === 'depth' && <DepthView hole={hole.id} />}
        {view === 'shifts' && <>
        {insights.length > 0 && (
          <Card title="This hole in a few lines" pad={false}>
            {insights.map((i, n) => (
              <div key={i.id} style={{ padding: '11px 18px', borderTop: n ? rowLine : 'none' }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{i.title}</div>
                <div style={{ fontSize: 12.5, color: T.muted, marginTop: 2, lineHeight: 1.5 }}>{i.detail}</div>
              </div>
            ))}
          </Card>
        )}
        <Grid min={160}>
          <Tile label="Depth" value={`${n1(metres)} m`} note={hole.planned ? `of ${hole.planned} m planned` : 'No planned depth'} />
          <Tile label="Days on the hole" value={days} note={`${rows.filter(r => !r.l.segmentOf).length} shifts`} />
          <Tile label="Metres an hour" value={hours ? (metres / hours).toFixed(2) : '—'} note={`${n1(hours)} h on bottom`} />
          <Tile label="Core recovery" value={metres ? `${((core / metres) * 100).toFixed(1)}%` : '—'} />
          <Tile label="Stopped" value={`${n1(own + client)} h`} note={`${n1(own)} h yours · ${n1(client)} h client`} />
        </Grid>
        <Card title="Depth, shift by shift" subtitle={switchAt ? `The size changed to ${switchAt.l.holeSize} at ${n1(switchAt.from)} m, on ${switchAt.label}.` : 'Depth at the end of each shift.'}>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chart} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={gridStroke} vertical={false} />
              <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: T.border }} interval="preserveStartEnd" minTickGap={24} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => `${v} m`} />
              <Tooltip content={<Tip unit=" m" names={{ depth: "Depth" }} />} />
              {hole.planned ? <ReferenceLine y={hole.planned} stroke={T.muted} strokeDasharray="4 3" label={{ value: `${hole.planned} m planned`, fill: T.faint, fontSize: 11, position: 'insideTopLeft' }} /> : null}
              {switchAt && <ReferenceLine y={switchAt.from} stroke={T.orangeD} strokeDasharray="2 3" label={{ value: `${switchAt.l.holeSize} from ${n1(switchAt.from)} m`, fill: T.orangeD, fontSize: 11, position: 'insideBottomRight' }} />}
              <Line dataKey="depth" stroke={T.bar} strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Every shift" pad={false}>
          <Table>
            <thead><tr><th style={th}>Shift</th><th style={th}>Rig</th><th style={th}>Driller</th><th style={th}>Size</th><th style={th}>Ground</th><th style={thR}>From</th><th style={thR}>To</th><th style={thR}>Metres</th><th style={thR}>Core</th><th style={thR}>Drilling h</th><th style={th}>Stops</th><th style={th}>Parts used</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.l.id} style={{ borderBottom: rowLine }}>
                  <td style={tdStrong}>{r.label}</td><td style={td}>{r.l.rig}</td><td style={td}>{r.l.driller ?? '—'}</td><td style={td}>{r.l.holeSize}</td>
                  <td style={td}>{r.l.formationType.replace(' Formation', '')}</td><td style={tdR}>{r.from}</td><td style={tdR}>{r.to}</td>
                  <td style={{ ...tdR, color: T.text }}>{r.l.metresDrilled ? n1(r.l.metresDrilled) : '—'}</td>
                  <td style={tdR}>{r.l.metresDrilled ? `${Math.round((r.l.coreRecovery / r.l.metresDrilled) * 100)}%` : '—'}</td>
                  <td style={tdR}>{r.l.segmentOf ? '—' : r.l.drillingHours}</td>
                  <td style={{ ...td, whiteSpace: 'normal', minWidth: 140 }}>{r.own + r.client ? `${n1(r.own + r.client)} h · ${r.reasons.join(', ')}` : '—'}</td>
                  <td style={{ ...td, whiteSpace: 'normal', minWidth: 120 }}>{(r.l.partsUsed ?? []).map(u => `${u.qty} × ${partName(u.itemId)}`).join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        </>}
      </>}
    </Page>
  )
}

// ── survey ────────────────────────────────────────────────────────────────

function Lines({ items, empty, subtitle }: { items: { id: string; tone: string; title: string; detail: string; href?: string }[]; empty: string; subtitle: string }) {
  return (
    <Card title="XPLORIX insights" subtitle={subtitle} pad={false}>
      {items.length === 0 && <div style={{ padding: '14px 18px', fontSize: 13.5, color: T.muted }}>{empty}</div>}
      {items.map((i, n) => (
        <div key={i.id} style={{ padding: '11px 18px', borderTop: n ? rowLine : 'none' }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: i.tone === 'bad' ? T.red : i.tone === 'warn' ? T.amber : T.text }}>{i.title}</div>
          <div style={{ fontSize: 12.5, color: T.muted, marginTop: 2, lineHeight: 1.5 }}>{i.detail}{i.href && <> <Link href={i.href} style={{ color: T.orange, fontWeight: 600, textDecoration: 'none' }}>Set it now</Link></>}</div>
        </div>
      ))}
    </Card>
  )
}

function SurveyView({ hole, project }: { hole: string; project: string }) {
  const { state, saveSurveys, deleteSurvey, saveSurveyProfile } = useCosting()
  const s = useMemo(() => holeSurvey(state, hole), [state, hole])
  const [shape, setShape] = useState<'plan' | 'section'>('plan')
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)
  const projectId = (state.projects ?? []).find(p => p.name === project)?.id
  const known = useMemo(() => {
    const out: Record<string, { drilled: number; planned?: number; project: string }> = {}
    ;(state.projects ?? []).forEach(p => projectHoles(state, p.name).forEach(h => { out[h.id] = { drilled: h.drilled, planned: h.planned, project: p.name } }))
    return out
  }, [state])
  const existing = useMemo(() => (state.surveys ?? []).filter(r => r.source !== 'log').map(r => ({ hole: r.hole, depth: r.depth })), [state.surveys])

  const decide = (rs: SurveyReading[], status: 'approved' | 'rejected', note?: string) => saveSurveys(rs.map(r => ({
    ...r, status, decidedBy: ADMIN_NAME, decidedAt: nowStamp(), note: status === 'rejected' ? note : undefined,
  })))
  const insights = s.warnings.map(w => ({ id: w.id, tone: w.tone, title: w.title, detail: w.detail,
    href: w.id === 'noplan' && projectId ? `/admin/projects/${encodeURIComponent(projectId)}?tab=holes` : undefined }))
  const hasPath = s.path.length > 1 || s.planned.length > 1

  return (
    <>
      <Lines items={insights} subtitle="From the approved survey readings and the planned direction."
        empty={s.approved.length ? `The hole is on its planned line, surveyed to ${n1(s.lastSurveyed)} m.` : 'No approved readings yet.'} />
      <DeviationFigures s={s} />
      {!s.plan && <Note tone="info">This hole has no planned direction, so its path can be drawn but not compared with a plan. {projectId && <Link href={`/admin/projects/${encodeURIComponent(projectId)}?tab=holes`} style={{ color: T.orange, fontWeight: 600, textDecoration: 'none' }}>Set it on the project&apos;s Holes tab</Link>}</Note>}
      {hasPath ? (
        <Split left={3} right={2}>
          <Card title="Hole path" subtitle={s.collar?.rl != null ? `From the collar at ${s.collar.rl} m above sea level.` : 'From the collar.'}><Path3D s={s} /></Card>
          <Card title={shape === 'plan' ? 'Plan view' : 'Cross-section'} subtitle={shape === 'plan' ? 'From above. North is up.' : `From the side, along the planned bearing${s.plan ? ` of ${Math.round(s.plan.azimuth)}°` : ''}.`}
            right={<Seg<'plan' | 'section'> options={[{ value: 'plan', label: 'Plan' }, { value: 'section', label: 'Section' }]} value={shape} onChange={setShape} />}>
            {shape === 'plan' ? <PlanView s={s} /> : <SectionView s={s} />}
          </Card>
        </Split>
      ) : <Card title="Hole path"><Empty>Approve a survey reading, or set the planned direction, to draw the hole.</Empty></Card>}
      <Card title="Survey readings" pad={false}
        subtitle={`Readings from the shift log and from files arrive as "to check". Only approved readings draw the path. A survey is due every ${SURVEY_LIMITS.gap} m or so.`}
        right={<span style={{ display: 'inline-flex', gap: 8 }}><Btn size="sm" onClick={() => setAdding(true)}>Type in readings</Btn><Btn size="sm" kind="primary" onClick={() => setImporting(true)}>Import a file</Btn></span>}>
        <SurveyTable readings={s.readings} editable onDecide={decide} onDelete={r => deleteSurvey(r.id)} />
      </Card>
      {adding && <AddReadingsModal hole={hole} project={project} by={ADMIN_NAME} drilled={s.drilled} taken={s.readings.filter(r => r.status !== 'rejected').map(r => r.depth)}
        onClose={() => setAdding(false)} onSave={rs => { saveSurveys(rs); setAdding(false) }} />}
      {importing && <ImportSurveyModal holes={known} profiles={state.surveyProfiles ?? []} existing={existing} by={ADMIN_NAME} oneHole={hole}
        onClose={() => setImporting(false)} onSave={(rs, prof) => { saveSurveys(rs); if (prof) saveSurveyProfile(prof); setImporting(false) }} />}
    </>
  )
}

// ── down the hole: drilling only ──────────────────────────────────────────

function DepthView({ hole }: { hole: string }) {
  const { state } = useCosting()
  const { state: inv } = useInventory()
  const { bands, step } = useMemo(() => depthBands(state, inv, hole), [state, inv, hole])
  const slow = bands.filter(b => b.rop != null).sort((a, b) => (a.rop ?? 0) - (b.rop ?? 0))[0]
  const fast = bands.filter(b => b.rop != null).sort((a, b) => (b.rop ?? 0) - (a.rop ?? 0))[0]
  const dear = bands.filter(b => b.cpm != null).sort((a, b) => (b.cpm ?? 0) - (a.cpm ?? 0))[0]
  return (
    <>
      <Grid min={170}>
        <Tile label="Slowest band" value={slow ? `${slow.from}–${slow.to} m` : '—'} note={slow?.rop != null ? `${slow.rop.toFixed(2)} m an hour${slow.ground ? ` · ${slow.ground.toLowerCase()}` : ''}` : undefined} />
        <Tile label="Fastest band" value={fast ? `${fast.from}–${fast.to} m` : '—'} note={fast?.rop != null ? `${fast.rop.toFixed(2)} m an hour${fast.ground ? ` · ${fast.ground.toLowerCase()}` : ''}` : undefined} />
        <Tile label="Costliest band" value={dear ? `${dear.from}–${dear.to} m` : '—'} note={dear?.cpm != null ? `${money(dear.cpm)} a metre` : undefined} />
      </Grid>
      <Card title="Speed and cost, down the hole" subtitle="Each band of depth: how fast the bit cut it, and what a metre of it cost.">
        <DepthPanel bands={bands} step={step} />
      </Card>
    </>
  )
}
