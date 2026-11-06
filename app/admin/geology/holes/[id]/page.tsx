'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useCosting } from '../../../../../lib/costing-store'
import { useHole, useCore, className } from '../../../../../lib/core/store'
import { rqdClass, gsiClass, jointSets, discing, WEATHERING } from '../../../../../lib/core/geotech'
import { shiftCore, stripDrill, factors } from '../../../../../lib/core/drill-link'
import { toCsv, download } from '../../../../../lib/core/export'
import { Page, PageHead, Grid, Tile, Card, Btn, Seg, Table, Status, Empty, Note, th, thR, td, tdR, tdStrong, rowLine, T } from '../../../../components/kit'
import { TrayPhoto, AlphaChart, Bar, recColour, rqdColour, pct, DemoPhotos, Swatch, classHex } from '../../../../components/core-ui'
import { StripLog } from '../../../../components/strip-log'
import { CoreFactors } from '../../../../components/core-factors'
import { useGeo, lithHex } from '../../../../../lib/core/geo-data'
import { DOMAIN_HEX } from '../../../../../lib/core/downhole'

/* HOLE LOG — what the core says about one hole, and why.
 *
 * The strip log puts the core (from the tray photos) beside the drilling
 * (from the shift logs) on the same depth scale. The other tabs are the same
 * record cut other ways: by shift, by tray, by fracture angle, by metre. */

type Tab = 'log' | 'shifts' | 'trays' | 'structure' | 'metres'

export default function HoleLog() {
  const { id } = useParams<{ id: string }>()
  const hole = decodeURIComponent(id)
  const { state } = useCosting()
  const { review, index } = useCore()
  const h = useHole(hole)
  const [tab, setTab] = useState<Tab>('log')
  const { data: geo } = useGeo()
  const extra = useMemo(() => {
    if (!geo.ready || !geo.byHole[hole]) return undefined
    const d = geo.domains('all')
    const idx = geo.metres.map((m, i) => ({ m, i })).filter(x => x.m.hole === hole)
    return {
      manual: (geo.logs[hole] ?? []).map(x => ({ from: x.from, to: x.to, lith: x.lith, hex: lithHex(x.lith) })),
      au: geo.byHole[hole].map(m => ({ from: m.from, to: m.to, v: m.assay.Au })),
      domain: idx.map(({ m, i }) => ({ from: m.from, to: m.to, hex: DOMAIN_HEX[d.labels[i]], name: d.names[d.labels[i]] })),
    }
  }, [geo, hole])

  const view = useMemo(() => {
    if (!h.flat) return null
    const sc = shiftCore(state.shiftLogs, hole, h.flat)
    const nat = h.flat.breaks.filter(b => b.kind === 'natural')
    return {
      sc, drill: stripDrill(state.shiftLogs, hole), sets: jointSets(nat.map(b => b.alpha)), discs: discing(h.flat), f: factors(sc),
      worst: [...h.rows].sort((a, b) => a.rqd - b.rqd)[0],
      drillerRec: sc.length ? sc.reduce((s, x) => s + x.drillerRec * x.core.length, 0) / sc.reduce((s, x) => s + x.core.length, 0) : 0,
    }
  }, [h.flat, h.rows, state.shiftLogs, hole])

  const known = index?.holes.some(x => x.hole === hole)
  if (index && !known) return (
    <Page>
      <PageHead question={`${hole}: no core photos yet`} answer="Photos of this hole's trays have not been added. Add them and the log is built from the shift logs and the photos." right={<Btn kind="primary" href={`/admin/geology/photos?hole=${hole}`}>Add tray photos</Btn>} />
    </Page>
  )
  if (!h.data || !view || !h.total) return <Page><Card><Empty>Loading the core photos for {hole}…</Empty></Card></Page>
  const t = h.total
  const checked = h.trays.filter(x => review.checked[x.id]).length

  const exportCsv = () => download(`${hole}_core_intervals.csv`, toCsv(h.rows.map(r => ({
    ...r, hole, className: className(review, r.cls),
    checked: h.trays.filter(x => x.from < r.to && x.usedTo > r.from).every(x => review.checked[x.id]),
  }))))

  return (
    <Page>
      <div style={{ fontSize: 12.5, color: T.faint }}><Link href="/admin/geology/holes" style={{ color: T.faint, textDecoration: 'none' }}>Hole logs</Link> / {hole}</div>
      <PageHead question={`${hole}: what does the core say, and why?`}
        tone={t.rqd >= 75 ? 'good' : 'warn'}
        answer={<>Recovery {pct(t.recovery)}, RQD {pct(t.rqd)} ({rqdClass(t.rqd).toLowerCase()}) over {Math.round(t.metres)} m photographed of {Math.round(h.data.drilled)} m drilled. {view.worst ? <>Poorest metre: {view.worst.from}–{view.worst.to} m, RQD {pct(view.worst.rqd)}.</> : null} {checked < h.trays.length ? `${h.trays.length - checked} of ${h.trays.length} trays still to check.` : 'Every tray is checked.'}</>}
        right={<><DemoPhotos /><Btn onClick={exportCsv}>Download intervals (CSV)</Btn><Btn kind="primary" href={`/admin/geology/review?hole=${hole}`}>Check trays</Btn></>} />

      <Grid min={170}>
        <Tile label="Photographed" value={`${Math.round(t.metres)} m`} note={`${h.trays.length} trays · ${h.data.project} · ${h.data.rig}`} />
        <Tile label="Core recovery, photo" value={pct(t.recovery)} note={`Driller measured ${pct(view.drillerRec)}`} tone={t.recovery >= 95 ? 'good' : 'warn'} />
        <Tile label="RQD" value={pct(t.rqd)} note={rqdClass(t.rqd)} tone={t.rqd >= 75 ? 'good' : t.rqd >= 50 ? 'warn' : 'bad'} />
        <Tile label="Natural fractures" value={`${t.ff.toFixed(1)} /m`} note={`${t.natural} natural · ${t.handling} in handling`} />
        <Tile label="GSI proxy" value={Math.round(t.gsi)} note={gsiClass(t.gsi)} />
        <Tile label="Joint sets" value={view.sets.sets.length} note={view.sets.sets.map(s => `${s.mean}°`).join(' · ') || view.sets.note} />
      </Grid>

      <Seg<Tab> value={tab} onChange={setTab} options={[
        { value: 'log', label: 'Strip log' }, { value: 'shifts', label: `By shift · ${view.sc.length}` }, { value: 'trays', label: `Trays · ${h.trays.length}` },
        { value: 'structure', label: 'Fractures & structure' }, { value: 'metres', label: 'Metre by metre' },
      ]} />

      {tab === 'log' && (
        <>
          <Card title="Core beside the drilling record" subtitle="Left: measured on the tray photos (dashed RQD is predicted from joint density; incoherence is how broken the core is). Middle: from the shift logs. Right: the hand log, the all-data domain and gold. Move along the log to read every track at one depth; click to open that tray.">
            <StripLog rows={h.rows} drill={view.drill} trays={h.trays} hole={hole} extra={extra} />
          </Card>
          <CoreFactors factors={view.f} note={`${hole} only. Each shift is compared with shifts in the same ground in this hole. A pattern to check, not proof of a cause.`} />
        </>
      )}

      {tab === 'shifts' && (
        <Card title="Each shift: how it was drilled, and what its core says" subtitle="The driller's recovery is what was written in the drill log at the rig; the photo recovery is measured on the tray. A big gap is worth asking about." pad={false}>
          <Table>
            <thead><tr>
              <th style={th}>Depth</th><th style={th}>Shift</th><th style={th}>Driller</th><th style={th}>Ground (log)</th><th style={thR}>Rate m/h</th>
              <th style={thR}>Driller rec.</th><th style={th}>Photo rec.</th><th style={th}>RQD</th><th style={thR}>Fract. /m</th><th style={th} />
            </tr></thead>
            <tbody>
              {view.sc.map(s => {
                const gap = s.drillerRec - s.core.recovery
                const tray = h.trays.find(x => x.from <= s.log.meterStart! + 0.01 && x.usedTo > s.log.meterStart!) ?? h.trays.find(x => x.usedTo > s.log.meterStart!)
                return (
                  <tr key={s.log.id} style={{ borderBottom: rowLine }}>
                    <td style={tdStrong}>{s.log.meterStart}–{s.log.meterEnd} m</td>
                    <td style={td}>{s.log.date} · {s.log.shift}</td>
                    <td style={td}>{s.log.driller}</td>
                    <td style={td}>{s.log.formationType.replace(' Formation', '')}</td>
                    <td style={{ ...tdR, color: s.fast ? T.red : T.muted }}>{s.rate.toFixed(2)}{s.fast ? ' ▲' : ''}</td>
                    <td style={tdR}>{pct(s.drillerRec)}</td>
                    <td style={td}><Bar value={s.core.recovery} color={recColour(s.core.recovery)} w={60} /> <span style={{ color: T.text, marginLeft: 4 }}>{pct(s.core.recovery)}</span>{gap > 8 && <span style={{ color: T.red, marginLeft: 6, fontSize: 11.5 }}>{Math.round(gap)} pts under the log</span>}</td>
                    <td style={td}><Bar value={s.core.rqd} color={rqdColour(s.core.rqd)} w={60} /> <span style={{ color: T.text, marginLeft: 4 }}>{pct(s.core.rqd)}</span></td>
                    <td style={tdR}>{s.core.ff.toFixed(1)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{tray && <Link href={`/admin/geology/trays/${tray.id}`} style={{ color: T.orange, fontWeight: 600, textDecoration: 'none' }}>Tray {tray.no} →</Link>}</td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        </Card>
      )}

      {tab === 'trays' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))', gap: 14 }}>
          {h.trays.map(x => (
            <Link key={x.id} href={`/admin/geology/trays/${x.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Tray {x.no} · {x.from.toFixed(1)}–{x.usedTo.toFixed(1)} m</span>
                  {review.checked[x.id] ? <Status tone="good">Checked</Status> : <Status tone="warn">To check</Status>}
                </div>
                <TrayPhoto tray={x} compact />
                <div style={{ fontSize: 11.5, color: T.faint }}>{x.breaks.length} breaks found · {x.breaks.filter(b => b.confidence === 'low').length} unsure · photo {x.takenAt.replace('T', ' ')}</div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {tab === 'structure' && (
        <>
          <Grid min={300}>
            <Card title="Fracture angle to the core axis (alpha)" subtitle="Natural fractures only. 90° is square across the core; low angles run along it.">
              <AlphaChart alphas={h.flat!.breaks.filter(b => b.kind === 'natural').map(b => b.alpha)} sets={view.sets.sets} />
            </Card>
            <Card title="Joint sets" subtitle="Groups of fractures at a similar angle, kept only when the split is clear." pad={false}>
              {view.sets.sets.length === 0 ? <Empty>{view.sets.note}</Empty> : (
                <Table>
                  <thead><tr><th style={th}>Set</th><th style={thR}>Mean alpha</th><th style={thR}>Spread</th><th style={thR}>Fractures</th><th style={thR}>Share</th></tr></thead>
                  <tbody>{view.sets.sets.map((s, i) => (
                    <tr key={i} style={{ borderBottom: rowLine }}><td style={tdStrong}>Set {i + 1}</td><td style={tdR}>{s.mean}°</td><td style={tdR}>± {s.sd}°</td><td style={tdR}>{s.n}</td><td style={tdR}>{pct(s.share * 100)}</td></tr>
                  ))}</tbody>
                </Table>
              )}
            </Card>
          </Grid>
          <Grid min={300}>
            <Card title="Stress cracking (discing)" subtitle="Three or more square breaks, each closer than half the core diameter to the next." pad={false}>
              {view.discs.length === 0 ? <Empty>No discing found.</Empty> : view.discs.map((d, i) => (
                <div key={i} style={{ padding: '10px 18px', borderTop: i ? rowLine : undefined, fontSize: 13, color: T.text }}>{d.from.toFixed(2)}–{d.to.toFixed(2)} m · {d.count} discs</div>
              ))}
            </Card>
            <Card title="Joint condition" subtitle="From the photo. Aperture and infill cannot be seen on a photo, so the GSI proxy takes them as typical.">
              <div style={{ display: 'grid', gap: 8, fontSize: 13, color: T.muted }}>
                <div>Weighted joint density: <b style={{ color: T.text }}>{t.wjd.toFixed(1)}</b> per m</div>
                <div>Joint roughness (JRC proxy): <b style={{ color: T.text }}>{t.jrc.toFixed(1)}</b> of 20</div>
                <div>Weathering: <b style={{ color: T.text }}>{WEATHERING[Math.round(t.weathering)] ?? '—'}</b> (grade {t.weathering.toFixed(1)})</div>
                <div>Veins: <b style={{ color: T.text }}>{(t.vein * 100).toFixed(1)}%</b> of the core surface</div>
              </div>
            </Card>
          </Grid>
          <Note>Alpha is the angle between a fracture and the core axis, read from the photo. True dip and dip direction need an orientation line marked on the core (beta); add it in the core shed and XPLORIX will turn alpha and beta into strike and dip.</Note>
        </>
      )}

      {tab === 'metres' && (
        <Card title="Metre by metre" subtitle="The same rows the CSV download gives." pad={false}
          right={<Btn size="sm" onClick={exportCsv}>Download CSV</Btn>}>
          <Table>
            <thead><tr>
              <th style={th}>From–to</th><th style={th}>Rock class</th><th style={thR}>Recovery</th><th style={thR}>RQD</th><th style={thR}>Fract. /m</th><th style={thR}>wJd</th>
              <th style={thR}>JRC</th><th style={thR}>Weathering</th><th style={thR}>GSI</th><th style={thR}>Veins</th><th style={thR}>Unsure</th>
            </tr></thead>
            <tbody>
              {h.rows.map(r => (
                <tr key={r.from} style={{ borderBottom: rowLine }}>
                  <td style={tdStrong}>{r.from.toFixed(0)}–{r.to.toFixed(0)} m</td>
                  <td style={td}><Swatch hex={classHex(r.cls, index?.classes)} /> <span style={{ marginLeft: 6 }}>{className(review, r.cls)}</span></td>
                  <td style={{ ...tdR, color: r.recovery < 85 ? T.red : T.muted }}>{pct(r.recovery)}</td>
                  <td style={{ ...tdR, color: r.rqd < 50 ? T.red : T.muted }}>{pct(r.rqd)}</td>
                  <td style={tdR}>{r.ff.toFixed(1)}</td>
                  <td style={tdR}>{r.wjd.toFixed(1)}</td>
                  <td style={tdR}>{r.jrc.toFixed(0)}</td>
                  <td style={tdR}>{r.weathering}</td>
                  <td style={tdR}>{r.gsi}</td>
                  <td style={tdR}>{(r.vein * 100).toFixed(0)}%</td>
                  <td style={tdR}>{r.unsure || ''}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </Page>
  )
}
