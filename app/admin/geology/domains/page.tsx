'use client'

import { useMemo, useState } from 'react'
import { useCore, className } from '../../../../lib/core/store'
import { useGeo, lithHex } from '../../../../lib/core/geo-data'
import { DOMAIN_HEX, MINERALS, MINERAL_HEX, mean, type FeatureSet, type Metre } from '../../../../lib/core/downhole'
import { download } from '../../../../lib/core/export'
import { Page, PageHead, Grid, Tile, Card, Btn, Seg, Table, Empty, Note, th, thR, td, tdR, tdStrong, rowLine, T, tint } from '../../../components/kit'
import { classHex, pct, DemoPhotos } from '../../../components/core-ui'
import { DepthTracks, HoleTabs, KeyRow, Scatter, SampleBadge, type Track } from '../../../components/geo-ui'

/* DOMAINS — logging from all the data at once.
 *
 * Every metre is described by what its photo shows, its chemistry and its
 * geophysics. Metres that are alike are grouped (k-means on the scaled
 * measures) into domains, and laid on a flat map (the first two principal
 * components) where alike metres sit together. Side by side with the
 * geologist's log, the domains show where the log and the data agree, and
 * where the data sees a change the eye did not. */

type ColourBy = 'domain' | 'log' | 'class' | 'mineral'
const SETS: { value: FeatureSet; label: string }[] = [{ value: 'all', label: 'Photo + chemistry + geophysics' }, { value: 'photo', label: 'Photo only' }, { value: 'chem', label: 'Chemistry + geophysics only' }]

/* How well a grouping matches the logged rock: the share of metres whose
 * logged rock is the most common one in their group. */
function purity(labels: number[], ms: Metre[], lithOf: (m: Metre) => string | undefined) {
  const t: Record<number, Record<string, number>> = {}
  let n = 0
  ms.forEach((m, i) => { const l = lithOf(m); if (!l) return; n++; t[labels[i]] = t[labels[i]] ?? {}; t[labels[i]][l] = (t[labels[i]][l] ?? 0) + 1 })
  return n ? Object.values(t).reduce((s, g) => s + Math.max(...Object.values(g)), 0) / n : 0
}

export default function Domains() {
  const { data } = useGeo()
  const { review, index } = useCore()
  const [set, setSet] = useState<FeatureSet>('all')
  const [by, setBy] = useState<ColourBy>('domain')
  const [hole, setHole] = useState('')

  const view = useMemo(() => {
    if (!data.ready) return null
    const d = data.domains(set)
    const lithOf = (m: Metre) => data.logs[m.hole]?.find(x => (m.from + m.to) / 2 >= x.from && (m.from + m.to) / 2 < x.to)?.lith
    const sets = (['photo', 'chem', 'all'] as FeatureSet[]).map(s => ({ s, p: purity(data.domains(s).labels, data.metres, lithOf) }))
    const rows = d.names.map((name, k) => {
      const ms = data.metres.filter((_, i) => d.labels[i] === k)
      const ucs = data.pred ? mean(data.metres.map((_, i) => i).filter(i => d.labels[i] === k).map(i => data.pred!.ucs[i])) : 0
      const logs: Record<string, number> = {}
      ms.forEach(m => { const l = lithOf(m); if (l) logs[l] = (logs[l] ?? 0) + 1 })
      const top = Object.entries(logs).sort((a, b) => b[1] - a[1])[0]
      return { k, name, n: ms.length, au: mean(ms.map(m => m.assay.Au)), rqd: mean(ms.map(m => m.photo.rqd)), dens: mean(ms.map(m => m.geophys.density)), ucs, holes: new Set(ms.map(m => m.hole)).size, log: top ? { lith: top[0], share: top[1] / ms.length } : null, profile: d.profile[k].slice(0, 4) }
    })
    return { d, lithOf, sets, rows }
  }, [data, set])

  if (!data.ready || !view) return <Page><Card><Empty>Grouping every metre by every dataset…</Empty></Card></Page>
  const { d, lithOf, sets, rows } = view
  const sel = hole || data.holes[0].data.hole
  const h = data.holes.find(x => x.data.hole === sel)!
  const idx = data.metres.map((m, i) => ({ m, i })).filter(x => x.m.hole === sel)
  const best = sets.slice().sort((a, b) => b.p - a.p)[0]
  const photoOnly = sets.find(s => s.s === 'photo')!.p

  const colour = (m: Metre, i: number) => by === 'domain' ? DOMAIN_HEX[d.labels[i]] : by === 'log' ? lithHex(lithOf(m) ?? '') : by === 'class' ? classHex(m.cls, index?.classes) : MINERAL_HEX[data.pred?.mineral[i] ?? 0]
  const step = Math.max(1, Math.floor(data.metres.length / 1600))
  const pts = data.metres.map((m, i) => ({ m, i })).filter(x => x.i % step === 0).map(({ m, i }) => ({ x: d.xy[i][0], y: d.xy[i][1], hex: colour(m, i), title: `${m.hole} ${m.from}–${m.to} m · ${d.names[d.labels[i]]}` }))
  const key = by === 'domain' ? d.names.map((n, k) => ({ hex: DOMAIN_HEX[k], label: `${k + 1}. ${n}` }))
    : by === 'log' ? Array.from(new Set(Object.values(data.logs).flat().map(x => x.lith))).map(l => ({ hex: lithHex(l), label: l }))
    : by === 'class' ? (index?.classes ?? []).map(c => ({ hex: c.hex, label: className(review, c.id) }))
    : MINERALS.map((m, i) => ({ hex: MINERAL_HEX[i], label: m }))

  const labelsOf = (s: FeatureSet) => data.domains(s).labels
  const value: Track[] = [
    { kind: 'band', label: 'Core photo clusters', w: 64, items: idx.map(({ m, i }) => ({ from: m.from, to: m.to, hex: DOMAIN_HEX[labelsOf('photo')[i]], title: data.domains('photo').names[labelsOf('photo')[i]] })) },
    { kind: 'band', label: 'Geochem clusters', w: 64, items: idx.map(({ m, i }) => ({ from: m.from, to: m.to, hex: DOMAIN_HEX[labelsOf('chem')[i]], title: data.domains('chem').names[labelsOf('chem')[i]] })) },
    { kind: 'band', label: 'All data domains', w: 64, items: idx.map(({ m, i }) => ({ from: m.from, to: m.to, hex: DOMAIN_HEX[labelsOf('all')[i]], title: data.domains('all').names[labelsOf('all')[i]] })) },
    { kind: 'band', label: 'Dominant colour', w: 52, items: h.rows.map(r => ({ from: r.from, to: r.to, hex: r.hex })) },
    { kind: 'band', label: 'Manual logging', w: 64, items: (data.logs[sel] ?? []).map(x => ({ from: x.from, to: x.to, hex: lithHex(x.lith), title: x.lith })) },
    { kind: 'curve', label: 'Au g/t (log)', w: 90, min: 0.005, max: 10, log: true, color: '#C99A00', items: idx.map(({ m }) => ({ from: m.from, to: m.to, v: m.assay.Au })) },
  ]

  const exportCsv = () => download(`xplorix_domains_${set}.csv`, ['HOLE_ID,FROM,TO,DOMAIN,DOMAIN_NAME,PC1,PC2', ...data.metres.map((m, i) => [m.hole, m.from, m.to, d.labels[i] + 1, `"${d.names[d.labels[i]]}"`, d.xy[i][0].toFixed(3), d.xy[i][1].toFixed(3)].join(','))].join('\n'))

  return (
    <Page>
      <PageHead question="Where does the rock change, using every dataset?"
        answer={<>Every metre grouped by what its photo, chemistry and geophysics say: {d.k} domains across {data.holes.length} holes. Against the geologist&apos;s log, domains from {SETS.find(x => x.value === best.s)!.label.toLowerCase()} match best, on <b>{pct(best.p * 100)}</b> of metres; the photos alone match {pct(photoOnly * 100)}. Where a domain splits a logged unit, the data sees a change the eye did not.</>}
        right={<><DemoPhotos /><SampleBadge>Sample chemistry</SampleBadge><Btn onClick={exportCsv}>Download domains (CSV)</Btn></>} />

      <Grid min={190}>
        {sets.map(s => <Tile key={s.s} label={`Match to the logged rock · ${SETS.find(x => x.value === s.s)!.label.toLowerCase()}`} value={pct(s.p * 100)} note={s.s === best.s ? 'Best of the three' : undefined} tone={s.s === best.s ? 'good' : undefined} />)}
        <Tile label="Spread the map shows" value={pct((d.explained[0] + d.explained[1]) * 100)} note="Of all variation, in two axes" />
      </Grid>

      <Card title="The map of every metre" subtitle="Each dot is a metre. Metres that are alike in every measure sit close together; the axes are the two strongest directions of change in the data."
        right={<Seg<FeatureSet> value={set} onChange={setSet} options={SETS} />}>
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: T.faint }}>Colour by</span>
            <Seg<ColourBy> value={by} onChange={setBy} options={[{ value: 'domain', label: 'Domain' }, { value: 'log', label: "Geologist's log" }, { value: 'class', label: 'Photo class' }, { value: 'mineral', label: 'Mineral' }]} />
          </div>
          <KeyRow items={key} />
          <div style={{ maxWidth: 820 }}><Scatter points={pts} xLabel={`First axis · ${pct(d.explained[0] * 100)} of the variation`} yLabel={`Second axis · ${pct(d.explained[1] * 100)}`} height={380} /></div>
        </div>
      </Card>

      <Card title="The domains" subtitle="Named from the measures that set each one apart. The geologist's log column says what rock it mostly is." pad={false}>
        <Table>
          <thead><tr><th style={th}>Domain</th><th style={thR}>Metres</th><th style={th}>Sets it apart</th><th style={th}>Mostly logged as</th><th style={thR}>Au g/t</th><th style={thR}>RQD</th><th style={thR}>Density</th><th style={thR}>UCS (pred.)</th></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.k} style={{ borderBottom: rowLine }}>
              <td style={tdStrong}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: DOMAIN_HEX[r.k], marginRight: 6 }} />{r.k + 1}. {r.name}</td>
              <td style={tdR}>{r.n} <span style={{ color: T.faint }}>· {r.holes} holes</span></td>
              <td style={td}><span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{r.profile.map(p => <span key={p.key} style={{ padding: '1px 7px', borderRadius: 99, fontSize: 11.5, background: tint(p.z > 0 ? T.green : T.blue, 14), color: T.text }}>{p.label} {p.z > 0 ? '▲' : '▼'}</span>)}</span></td>
              <td style={td}>{r.log ? <>{r.log.lith} <span style={{ color: T.faint }}>({pct(r.log.share * 100)})</span></> : '—'}</td>
              <td style={tdR}>{r.au.toFixed(2)}</td><td style={tdR}>{pct(r.rqd)}</td><td style={tdR}>{r.dens.toFixed(2)}</td><td style={tdR}>{Math.round(r.ucs)} MPa</td>
            </tr>
          ))}</tbody>
        </Table>
      </Card>

      <Card title={`${sel}: photo clusters, chemistry clusters and the log, side by side`} subtitle="The same hole cut four ways. Where all of them change together, the boundary is sure; where only one does, look again.">
        <div style={{ display: 'grid', gap: 12 }}>
          <HoleTabs holes={data.holes.map(x => x.data.hole)} value={sel} onChange={setHole} />
          <DepthTracks top={Math.floor(h.rows[0]?.from ?? 0)} bottom={Math.ceil(h.rows[h.rows.length - 1]?.to ?? 10)} pxPerM={3} tracks={value}
            read={dd => { const x = idx.find(({ m }) => dd >= m.from && dd < m.to); if (!x) return null; const { m, i } = x; return <><b style={{ color: T.text }}>{sel} · {m.from}–{m.to} m</b><br />Photo: {data.domains('photo').names[labelsOf('photo')[i]]}<br />Chemistry: {data.domains('chem').names[labelsOf('chem')[i]]}<br />All data: {data.domains('all').names[labelsOf('all')[i]]}<br />Logged: {lithOf(m) ?? '—'}</> }} />
        </div>
      </Card>
      <Note>Domains are grouped by k-means on scaled measures and drawn on the first two principal components, all in your browser from this company&apos;s own record. They are a starting point for geology, geotechnical, geometallurgical and processing domains; the geologist sets the final boundaries.</Note>
    </Page>
  )
}
