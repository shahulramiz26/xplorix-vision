'use client'

import { useMemo, useState } from 'react'
import { useGeo } from '../../../../lib/core/geo-data'
import { MINERALS, MINERAL_HEX, ISRM, STRENGTH_HEX, strengthGrade, hasData, mean } from '../../../../lib/core/downhole'
import { download } from '../../../../lib/core/export'
import { Page, PageHead, Grid, Tile, Card, Btn, Table, Empty, Note, th, thR, td, tdR, tdStrong, rowLine, T } from '../../../components/kit'
import { pct, DemoPhotos, Bar } from '../../../components/core-ui'
import { DepthTracks, HoleTabs, KeyRow, Scatter, SampleBadge, type Track } from '../../../components/geo-ui'

/* PREDICTIONS — rock properties where they were not measured.
 *
 *   Strength   lab UCS tests on four holes → every metre of every hole
 *   Mineralogy the core scanner on four holes → every metre of the others
 *   RQD        what chemistry and geophysics say about broken ground, for
 *              holes logged by a probe before the core is boxed
 *
 * Each is fitted on this company's own measured metres. How good it is is
 * measured on holes the fit did not see (leave one hole out), so the number
 * on screen is the one to expect on a new hole. */

export default function Predict() {
  const { data } = useGeo()
  const [hole, setHole] = useState('')

  const view = useMemo(() => {
    if (!data.ready || !data.pred) return null
    const p = data.pred
    const idx = (hl: string) => data.metres.map((m, i) => ({ m, i })).filter(x => x.m.hole === hl)
    const holes = data.holes.map(hv => {
      const xs = idx(hv.data.hole)
      const u = xs.map(x => p.ucs[x.i])
      const weak: { from: number; to: number }[] = []
      xs.forEach(({ m, i }) => { if (p.ucs[i] < 25) { const l = weak[weak.length - 1]; if (l && Math.abs(l.to - m.from) < 0.01) l.to = m.to; else weak.push({ from: m.from, to: m.to }) } })
      const minMix = MINERALS.map((_, k) => xs.filter(x => p.mineral[x.i] === k).length / Math.max(1, xs.length))
      const lowRec = xs.filter(x => p.rqd[x.i] < 75).length
      return { hole: hv.data.hole, ucs: mean(u), weak: weak.filter(w => w.to - w.from >= 3), minMix, lab: xs.filter(x => x.m.ucs != null).length, scanned: hasData('scanner', hv.data.hole), lowRec }
    })
    return { p, idx, holes }
  }, [data])

  if (!data.ready || !view) return <Page><Card><Empty>Fitting on the measured metres…</Empty></Card></Page>
  const { p, idx, holes } = view
  const sel = hole || data.holes.find(h => !hasData('lab', h.data.hole))?.data.hole || data.holes[0].data.hole
  const h = data.holes.find(x => x.data.hole === sel)!
  const xs = idx(sel)
  const unscanned = holes.filter(x => !x.scanned).length

  const tracks: Track[] = [
    { kind: 'band', label: 'Core colour', w: 34, items: h.rows.map(r => ({ from: r.from, to: r.to, hex: r.hex })) },
    { kind: 'curve', label: 'UCS MPa (pred.)', w: 110, max: 250, color: '#2563EB', items: xs.map(({ m, i }) => ({ from: m.from, to: m.to, v: p.ucs[i] })) },
    { kind: 'ticks', label: 'Lab UCS', w: 50, items: xs.filter(x => x.m.ucs != null).map(({ m }) => ({ at: (m.from + m.to) / 2, hex: T.orange, len: Math.min(1, m.ucs! / 250), title: `Lab ${m.ucs} MPa` })) },
    { kind: 'band', label: 'Strength grade', w: 46, items: xs.map(({ m, i }) => ({ from: m.from, to: m.to, hex: STRENGTH_HEX[ISRM.indexOf(strengthGrade(p.ucs[i]))], title: `${strengthGrade(p.ucs[i]).grade} ${strengthGrade(p.ucs[i]).name}` })) },
    { kind: 'band', label: hasData('scanner', sel) ? 'Mineral (scanned)' : 'Mineral (pred.)', w: 54, items: xs.map(({ m, i }) => ({ from: m.from, to: m.to, hex: MINERAL_HEX[p.mineral[i]], title: MINERALS[p.mineral[i]] })) },
    { kind: 'curve', label: 'RQD pred. · photo', w: 110, max: 100, color: '#7C3AED', items: xs.map(({ m, i }) => ({ from: m.from, to: m.to, v: p.rqd[i] })), second: { color: T.muted, items: xs.map(({ m }) => ({ from: m.from, to: m.to, v: m.photo.rqd })) } },
  ]

  const exportCsv = () => download('xplorix_predictions.csv', ['HOLE_ID,FROM,TO,UCS_PRED_MPA,STRENGTH_GRADE,MINERAL,MINERAL_SOURCE,RQD_PRED_NO_PHOTO_PCT', ...data.metres.map((m, i) => [m.hole, m.from, m.to, p.ucs[i], strengthGrade(p.ucs[i]).grade, MINERALS[p.mineral[i]], p.mineralMeasured[i] ? 'SCANNED' : 'PREDICTED', p.rqd[i]].join(','))].join('\n'))

  return (
    <Page>
      <PageHead question="How strong is the rock, and what is it made of, where nobody measured?"
        tone={p.ucsFit.r2 > 0.5 ? 'good' : 'warn'}
        answer={<>{p.ucsFit.n} lab strength tests on 4 holes give rock strength on every metre of all {data.holes.length}: on holes the fit did not see it explains <b>{pct(p.ucsFit.r2 * 100)}</b> of the variation (log UCS). The core scanner on 4 holes gives the main mineral on the other {unscanned}, right <b>{pct(p.mineralFit.accuracy * 100)}</b> of the time on unseen holes.</>}
        right={<><DemoPhotos /><SampleBadge>Sample lab and scanner data</SampleBadge><Btn onClick={exportCsv}>Download predictions (CSV)</Btn></>} />

      <Grid min={180}>
        <Tile label="Strength fit, unseen holes" value={pct(p.ucsFit.r2 * 100)} note={`R² on log UCS · ${p.ucsFit.n} lab tests`} tone={p.ucsFit.r2 > 0.5 ? 'good' : 'warn'} />
        <Tile label="Mineral right, unseen holes" value={pct(p.mineralFit.accuracy * 100)} note={`${p.mineralFit.n.toLocaleString('en-US')} scanned metres`} tone={p.mineralFit.accuracy > 0.6 ? 'good' : 'warn'} />
        <Tile label="RQD from a probe, no photo" value={pct(p.rqdFit.r2 * 100)} note="R² from chemistry and geophysics alone" tone={p.rqdFit.r2 > 0.4 ? 'good' : undefined} />
        <Tile label="Metres with strength" value={`${data.metres.length.toLocaleString('en-US')}`} note={`Was ${p.ucsFit.n} lab tests`} tone="good" />
      </Grid>

      <Grid min={380}>
        <Card title="Strength: lab test against prediction" subtitle="Each dot is a lab test, predicted by a fit that did not see its hole. On the line is perfect.">
          <Scatter points={p.ucsFit.pairs.map(x => ({ x: x.measured, y: x.predicted, hex: '#2563EB', title: `${x.hole} ${x.at} m: lab ${x.measured}, predicted ${x.predicted} MPa` }))} xLabel="Lab UCS, MPa (log)" yLabel="Predicted UCS, MPa (log)" logX logY diagonal height={300} />
        </Card>
        <Card title="Mineral: right on each unseen hole" subtitle="Fitted on the other scanned holes, checked against this one's scan." pad={false}>
          <Table>
            <thead><tr><th style={th}>Hole left out</th><th style={th}>Right</th></tr></thead>
            <tbody>{p.mineralFit.byHole.map(x => <tr key={x.hole} style={{ borderBottom: rowLine }}><td style={tdStrong}>{x.hole}</td><td style={td}><Bar value={x.accuracy * 100} w={100} color={x.accuracy > 0.6 ? T.green : T.amber} /> <span style={{ marginLeft: 6, color: T.text }}>{pct(x.accuracy * 100)}</span></td></tr>)}</tbody>
          </Table>
        </Card>
      </Grid>

      <Card title={`${sel}: predicted beside measured`} subtitle="Blue is predicted strength, orange ticks are lab tests. Purple is RQD predicted from chemistry and geophysics alone; grey is what the photos measured.">
        <div style={{ display: 'grid', gap: 12 }}>
          <HoleTabs holes={data.holes.map(x => x.data.hole)} value={sel} onChange={setHole} />
          <KeyRow items={[...ISRM.map((g, i) => ({ hex: STRENGTH_HEX[i], label: `${g.grade} ${g.name}` })), ...MINERALS.map((m, i) => ({ hex: MINERAL_HEX[i], label: m }))]} />
          <DepthTracks top={Math.floor(h.rows[0]?.from ?? 0)} bottom={Math.ceil(h.rows[h.rows.length - 1]?.to ?? 10)} pxPerM={3} tracks={tracks}
            read={d => { const x = xs.find(({ m }) => d >= m.from && d < m.to); if (!x) return null; const { m, i } = x; const g = strengthGrade(p.ucs[i]); return <><b style={{ color: T.text }}>{sel} · {m.from}–{m.to} m</b><br />UCS {p.ucs[i]} MPa predicted ({g.grade}, {g.name.toLowerCase()}){m.ucs ? <><br />Lab: {m.ucs} MPa</> : null}<br />{MINERALS[p.mineral[i]]} {p.mineralMeasured[i] ? '(scanned)' : '(predicted)'}<br />RQD {p.rqd[i]}% from the probe · {pct(m.photo.rqd)} on photo</> }} />
        </div>
      </Card>

      <Card title="Hole by hole" subtitle="Weak ground is 3 m or more predicted under 25 MPa (R2 or weaker): plan support and slower drilling there. Fair or worse is RQD under 75 predicted from chemistry and geophysics alone, before anyone sees the core." pad={false}>
        <Table>
          <thead><tr><th style={th}>Hole</th><th style={thR}>Lab tests</th><th style={thR}>Mean UCS (pred.)</th><th style={th}>Weak ground</th><th style={th}>Mineral mix</th><th style={thR}>Metres fair or worse (probe)</th></tr></thead>
          <tbody>{holes.map(x => (
            <tr key={x.hole} style={{ borderBottom: rowLine }}>
              <td style={tdStrong}>{x.hole}</td>
              <td style={tdR}>{x.lab || '—'}</td>
              <td style={tdR}>{Math.round(x.ucs)} MPa</td>
              <td style={{ ...td, whiteSpace: 'normal' }}>{x.weak.length ? x.weak.map(w => `${w.from}–${w.to} m`).join(', ') : 'None'}</td>
              <td style={td}><span style={{ display: 'inline-flex', width: 140, height: 10, borderRadius: 3, overflow: 'hidden', border: `1px solid ${T.border}` }}>{x.minMix.map((s, k) => <span key={k} title={`${MINERALS[k]} ${pct(s * 100)}`} style={{ width: `${s * 100}%`, background: MINERAL_HEX[k] }} />)}</span> <span style={{ color: T.faint, marginLeft: 6 }}>{x.scanned ? 'scanned' : 'predicted'}</span></td>
              <td style={tdR}>{x.lowRec}</td>
            </tr>
          ))}</tbody>
        </Table>
      </Card>
      <Note>Fitted in your browser with ridge regression and nearest-centre classes on this company&apos;s own measured metres; quality is reported on holes left out of the fit. More lab tests and scans make every prediction better. In the demo the lab tests and scans are sample data generated from the real photos.</Note>
    </Page>
  )
}
