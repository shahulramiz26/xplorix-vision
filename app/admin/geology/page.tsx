'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useCosting } from '../../../lib/costing-store'
import { useAllHoles, useCore } from '../../../lib/core/store'
import { totals, rqdClass, gsiClass } from '../../../lib/core/geotech'
import { shiftCore, factors, type ShiftCore } from '../../../lib/core/drill-link'
import { NVCL_CREDIT } from '../../../lib/core/sources'
import { Page, PageHead, Grid, Tile, Card, Btn, Table, Status, Empty, th, thR, td, tdR, tdStrong, rowLine, T } from '../../components/kit'
import { Bar, recColour, rqdColour, pct, DemoPhotos } from '../../components/core-ui'
import { CoreFactors } from '../../components/core-factors'
import { useGeo } from '../../../lib/core/geo-data'
import { useGeoEngine, useAsk, Md } from '../../components/ai'
import { RC_HOLES } from '../../../lib/core/chips'
import { Sparkles, Camera, FileCheck2, Gem, Grip, Database, Network, BrainCircuit, Compass, Mountain, Palette, Box } from 'lucide-react'

/* GEOLOGY TODAY — the geologist's first screen.
 *
 * How is the core coming out of the ground, which trays are waiting for a
 * geologist, and which shifts lost core — with what the drill log says about
 * those shifts. */

export default function GeologyToday() {
  const { state } = useCosting()
  const { review } = useCore()
  const all = useAllHoles()
  const { data: geo } = useGeo()
  const engine = useGeoEngine()
  const { open } = useAsk()
  const brief = useMemo(() => geo.ready ? engine.answer('Give me the geology brief') : null, [geo.ready]) // eslint-disable-line react-hooks/exhaustive-deps

  const view = useMemo(() => {
    const rows = all.list.flatMap(h => h.rows)
    const t = totals(rows)
    const sc: ShiftCore[] = all.list.flatMap(h => shiftCore(state.shiftLogs, h.data.hole, h.flat))
    const trays = all.list.reduce((s, h) => s + h.trays.length, 0)
    const checked = all.list.reduce((s, h) => s + h.checked, 0)
    const low = sc.filter(s => s.core.recovery < 85).sort((a, b) => a.core.recovery - b.core.recovery)
    const drillerRec = sc.length ? sc.reduce((s, x) => s + x.drillerRec * x.core.length, 0) / sc.reduce((s, x) => s + x.core.length, 0) : 0
    return { t, sc, trays, checked, low, drillerRec, f: factors(sc) }
  }, [all.list, state.shiftLogs])

  const trayAt = (hole: string | null, at: number | null | undefined) => {
    const h = all.list.find(x => x.data.hole === hole)
    const t = h?.trays.find(x => at != null && x.from <= at + 0.01 && x.usedTo > at) ?? h?.trays.find(x => at != null && x.usedTo > at)
    return t ? `/admin/geology/trays/${t.id}` : `/admin/geology/holes/${hole}`
  }
  if (!all.ready) return <Page><Card><Empty>Loading the core photos…</Empty></Card></Page>
  const { t, trays, checked, low, drillerRec, f } = view
  const waiting = trays - checked

  return (
    <Page>
      <PageHead question="How is the core coming out of the ground?"
        tone={t.recovery < 90 ? 'warn' : 'good'}
        answer={<>{Math.round(t.metres).toLocaleString('en-US')} m of core photographed on {all.list.length} holes: recovery {pct(t.recovery)}, RQD {pct(t.rqd)} ({rqdClass(t.rqd).toLowerCase()}). {waiting > 0 ? <><b>{waiting} trays</b> wait for a geologist's check.</> : 'Every tray is checked.'} {low.length ? <>{low.length} shifts brought up under 85% of their core.</> : null}</>}
        right={<><DemoPhotos /><Btn kind="primary" href="/admin/geology/photos">Add tray photos</Btn></>} />

      <Card title="This morning, from XPLORIX AI" right={<Btn size="sm" kind="primary" onClick={() => open()}><Sparkles size={13} />Ask XPLORIX</Btn>}>
        {!brief ? <Empty>Reading the core record…</Empty> : (
          <div style={{ display: 'grid', gap: 7 }}>
            {brief.text.slice(1).map((p, i) => <p key={i} style={{ margin: 0, fontSize: 13.5, color: T.muted, lineHeight: 1.6 }}><Md text={p} /></p>)}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              {['Best gold intervals?', 'Which shifts lost core, and why?', 'Where is the weak ground?'].map(q => <button key={q} type="button" onClick={() => open(q)} style={{ padding: '5px 11px', borderRadius: 99, border: `1px solid ${T.border}`, background: 'transparent', color: T.muted, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }}>{q}</button>)}
            </div>
          </div>
        )}
      </Card>

      <Grid>
        <Tile label="Core photographed" value={`${Math.round(t.metres).toLocaleString('en-US')} m`} note={`${trays} trays on ${all.list.length} holes`} />
        <Tile label="Core recovery, photo" value={pct(t.recovery)} note={`Driller's own measure: ${pct(drillerRec)}`} tone={t.recovery >= 95 ? 'good' : t.recovery >= 85 ? 'warn' : 'bad'} />
        <Tile label="RQD" value={pct(t.rqd)} note={rqdClass(t.rqd)} tone={t.rqd >= 75 ? 'good' : t.rqd >= 50 ? 'warn' : 'bad'} />
        <Tile label="Natural fractures" value={`${t.ff.toFixed(1)} /m`} note="Breaks made in handling left out" />
        <Tile label="GSI proxy" value={Math.round(t.gsi)} note={gsiClass(t.gsi)} />
        <Tile label="Trays to check" value={waiting} note={waiting ? `${t.unsure} breaks the photo step is unsure of` : 'All checked'} tone={waiting ? 'warn' : 'good'} />
      </Grid>

      <Modules geo={geo} trays={trays} waiting={waiting} />

      <Card title="Holes" subtitle="Every number is worked out from the tray photos, with the geologist's corrections. Click a hole for its log." pad={false}>
        <Table>
          <thead><tr>
            <th style={th}>Hole</th><th style={th}>Project · rig</th><th style={thR}>Photographed</th><th style={th}>Recovery</th><th style={th}>RQD</th>
            <th style={thR}>Fractures /m</th><th style={thR}>GSI</th><th style={th}>Trays</th><th style={th} />
          </tr></thead>
          <tbody>
            {all.list.map(h => (
              <tr key={h.data.hole} style={{ borderBottom: rowLine }}>
                <td style={tdStrong}><Link href={`/admin/geology/holes/${h.data.hole}`} style={{ color: T.text, textDecoration: 'none' }}>{h.data.hole}</Link></td>
                <td style={td}>{h.data.project} · {h.data.rig}</td>
                <td style={tdR}>{Math.round(h.data.photographedTo)} of {Math.round(h.data.drilled)} m</td>
                <td style={td}><Bar value={h.total!.recovery} color={recColour(h.total!.recovery)} /> <span style={{ marginLeft: 6, color: T.text }}>{pct(h.total!.recovery)}</span></td>
                <td style={td}><Bar value={h.total!.rqd} color={rqdColour(h.total!.rqd)} /> <span style={{ marginLeft: 6, color: T.text }}>{pct(h.total!.rqd)}</span></td>
                <td style={tdR}>{h.total!.ff.toFixed(1)}</td>
                <td style={tdR}>{Math.round(h.total!.gsi)}</td>
                <td style={td}>{h.checked === h.trays.length ? <Status tone="good">All {h.trays.length} checked</Status> : <Status tone="warn">{h.trays.length - h.checked} of {h.trays.length} to check</Status>}</td>
                <td style={{ ...td, textAlign: 'right' }}><Link href={`/admin/geology/holes/${h.data.hole}`} style={{ color: T.orange, fontWeight: 600, textDecoration: 'none' }}>Open log →</Link></td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <CoreFactors factors={f} />

      <Card title="Shifts that lost core" subtitle="Under 85% recovery on the photo, worst first, with what the drill log says. Each one is also a task for the site in Drilling." pad={false}
        right={<Btn size="sm" href="/admin/tasks?dept=geology">Core quality tasks</Btn>}>
        {low.length === 0 && <Empty>No shift brought up less than 85% of its core.</Empty>}
        {low.slice(0, 10).map((s, i) => (
          <div key={s.log.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '12px 18px', borderTop: i ? rowLine : undefined, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{s.log.holeNumber} · {s.log.meterStart}–{s.log.meterEnd} m: {pct(s.core.recovery)} core on the photo, RQD {pct(s.core.rqd)}</div>
              <div style={{ fontSize: 12.5, color: T.muted, marginTop: 3 }}>
                {s.log.date} {s.log.shift.toLowerCase()} · {s.log.rig} · {s.log.driller} · driller measured {pct(s.drillerRec)} · {s.rate.toFixed(2)} m/h {s.fast ? `(normal ${s.normal.toFixed(2)}: fast)` : ''}{s.log.downtimeHours ? ` · ${s.log.downtimeHours} h stopped: ${s.log.downtimeReason}` : ''}
              </div>
            </div>
            <Btn size="sm" href={trayAt(s.log.holeNumber, s.log.meterStart)}>See the core</Btn>
          </div>
        ))}
      </Card>

      <div style={{ fontSize: 12, color: T.faint, lineHeight: 1.6 }}>{NVCL_CREDIT} Reviewer: {review.reviewer}.</div>
    </Page>
  )
}

/* Everything XPLORIX Core logs, with a live number each: the map of the
 * geology side for someone seeing it for the first time. */
function Modules({ geo, trays, waiting }: { geo: ReturnType<typeof useGeo>['data']; trays: number; waiting: number }) {
  const n = geo.checks.reduce((s, c) => s + c.metres, 0)
  const agree = n ? geo.checks.reduce((s, c) => s + c.agree * c.metres, 0) / n : 0
  const items: { icon: React.ElementType; title: string; what: string; value: string; href: string }[] = [
    { icon: Camera, title: 'Core photos', what: 'Rows, core, gaps and every break found on each tray photo', value: `${trays} trays · ${waiting} to check`, href: '/admin/geology/review' },
    { icon: Mountain, title: 'Geotech logging', what: 'Recovery, RQD, fractures, joint density, GSI, weathering, discing', value: geo.ready ? `${geo.holes.length} holes logged` : '…', href: '/admin/geology/rock-mass' },
    { icon: Palette, title: 'Geology logging', what: 'Rock classes from colour, grain, veins and staining', value: 'Named by the geologist', href: '/admin/geology/classes' },
    { icon: Gem, title: 'Vein classes', what: 'Every vein found and sorted into kinds; vein volume down the hole', value: geo.ready ? `${geo.veins.length.toLocaleString('en-US')} veins` : '…', href: '/admin/geology/veins' },
    { icon: Grip, title: 'RC chips', what: 'Chip colour, size, shape and groups from chip-tray photos', value: `${RC_HOLES.length} RC holes`, href: '/admin/geology/chips' },
    { icon: FileCheck2, title: 'Check logs', what: "The geologist's log checked against the core, metre by metre", value: geo.ready ? `${Math.round(agree * 100)}% agree` : '…', href: '/admin/geology/check-logs' },
    { icon: Database, title: 'Downhole data', what: 'Assays, geophysics, core scanner, televiewer and lab tests on depth', value: geo.ready ? `${geo.metres.length.toLocaleString('en-US')} metres joined` : '…', href: '/admin/geology/data' },
    { icon: Network, title: 'Domains', what: 'Metres grouped by photo, chemistry and geophysics together', value: geo.ready ? `${geo.domains('all').k} domains` : '…', href: '/admin/geology/domains' },
    { icon: BrainCircuit, title: 'Predictions', what: 'Rock strength, minerals and recovery where nobody measured', value: geo.pred ? `Strength R² ${Math.round(geo.pred.ucsFit.r2 * 100)}%` : '…', href: '/admin/geology/predict' },
    { icon: Compass, title: 'Structures', what: 'True dip and dip direction from the televiewer; joint sets', value: geo.ready ? `${geo.structures.length.toLocaleString('en-US')} planes` : '…', href: '/admin/geology/structures' },
    { icon: Box, title: 'Digital twin', what: 'Every hole in 3D with its whole record: core, surveys, cost and consumables', value: 'By project', href: '/admin/geology/3d' },
    { icon: Sparkles, title: 'XPLORIX AI', what: 'Ask anything about the core; it drafts the note that follows', value: 'Ctrl J on any screen', href: '/admin/geology/ask' },
  ]
  return (
    <Card title="XPLORIX Core" subtitle="Everything logged from the photos and the other downhole data, joined to the drilling record." pad={false}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(250px, 100%), 1fr))' }}>
        {items.map(x => (
          <Link key={x.title} href={x.href} className="xpl-row" style={{ display: 'flex', gap: 12, padding: '14px 18px', textDecoration: 'none', borderTop: `1px solid ${T.line}`, borderRight: `1px solid ${T.line}` }}>
            <span aria-hidden style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--x-orange) 12%, transparent)', color: T.orange }}><x.icon size={17} /></span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: T.text }}>{x.title}</span>
              <span style={{ display: 'block', fontSize: 12, color: T.muted, lineHeight: 1.45, marginTop: 2 }}>{x.what}</span>
              <span style={{ display: 'block', fontSize: 12, color: T.orange, fontWeight: 600, marginTop: 5 }}>{x.value}</span>
            </span>
          </Link>
        ))}
      </div>
    </Card>
  )
}
