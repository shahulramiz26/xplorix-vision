'use client'

import { useMemo, useState } from 'react'
import { useGeo } from '../../../../lib/core/geo-data'
import { hasData, holeOrient, mean } from '../../../../lib/core/downhole'
import { jointSets } from '../../../../lib/core/geotech'
import { download } from '../../../../lib/core/export'
import { Page, PageHead, Grid, Tile, Card, Btn, Seg, Table, Empty, Note, th, thR, td, tdR, tdStrong, rowLine, T } from '../../../components/kit'
import { AlphaChart, DemoPhotos } from '../../../components/core-ui'
import { DepthTracks, HoleTabs, KeyRow, Stereonet, SampleBadge, type Track } from '../../../components/geo-ui'

/* STRUCTURES — which way the fractures and veins dip.
 *
 * A photo gives alpha, the angle of a fracture to the core axis. A
 * televiewer run (acoustic or optical) also gives beta, which way round the
 * hole it faces. With the hole's direction from the survey, alpha and beta
 * become true dip and dip direction: what a pit wall or a stope is designed
 * from. Holes without a televiewer keep alpha from the photos. */

const SET_HEX = ['#3E7BFA', '#E46A9B', '#22A06B', '#E9A23B']
const TYPE_HEX = { Joint: '#8E4EC6', Vein: '#3E7BFA', Shear: '#E5484D' }
type By = 'set' | 'type'

export default function Structures() {
  const { data } = useGeo()
  const [hole, setHole] = useState('')
  const [by, setBy] = useState<By>('set')

  const view = useMemo(() => {
    if (!data.ready) return null
    const tvHoles = data.holes.filter(h => hasData('televiewer', h.data.hole)).map(h => h.data.hole)
    const sets = tvHoles.map(hl => {
      const st = data.structures.filter(s => s.hole === hl)
      const ids = Array.from(new Set(st.map(s => s.set))).sort()
      return { hole: hl, n: st.length, sets: ids.map(k => { const xs = st.filter(s => s.set === k); return { k, n: xs.length, dip: Math.round(mean(xs.map(s => s.dip))), dipDir: Math.round(circ(xs.map(s => s.dipDir))), alpha: Math.round(mean(xs.map(s => s.alpha))) } }) }
    })
    return { tvHoles, sets }
  }, [data])

  if (!data.ready || !view) return <Page><Card><Empty>Reading the televiewer picks…</Empty></Card></Page>
  const sel = hole || view.tvHoles[0]
  const h = data.holes.find(x => x.data.hole === sel)!
  const st = data.structures.filter(s => s.hole === sel)
  const nat = h.flat.breaks.filter(b => b.kind === 'natural')
  const js = jointSets(nat.map(b => b.alpha))
  const o = holeOrient(sel)
  const hex = (s: typeof st[number]) => by === 'set' ? SET_HEX[s.set % SET_HEX.length] : TYPE_HEX[s.type]
  const tracks: Track[] = [
    { kind: 'band', label: 'Core colour', w: 34, items: h.rows.map(r => ({ from: r.from, to: r.to, hex: r.hex })) },
    { kind: 'curve', label: 'Fractures /m (photo)', w: 90, max: 20, color: '#8E4EC6', items: h.rows.map(r => ({ from: r.from, to: r.to, v: r.ff })) },
    { kind: 'ticks', label: 'Dip (tick length)', w: 90, items: st.map(s => ({ at: s.at, hex: hex(s), len: s.dip / 90, title: `${s.at} m · ${s.type} · ${s.dip}° toward ${s.dipDir}°` })) },
  ]
  const all = data.structures

  return (
    <Page>
      <PageHead question="Which way do the fractures and veins dip?"
        answer={<>{all.length.toLocaleString('en-US')} structures picked on the televiewer in {view.tvHoles.length} holes, each with true dip and dip direction. The tray photos give the angle to the core (alpha) on all {data.holes.length} holes; the televiewer adds which way each plane faces.</>}
        right={<><DemoPhotos /><SampleBadge>Sample televiewer</SampleBadge><Btn onClick={() => download('xplorix_structures.csv', ['HOLE_ID,DEPTH,TYPE,ALPHA,BETA,DIP,DIP_DIRECTION,SET', ...all.map(s => [s.hole, s.at, s.type, s.alpha, s.beta, s.dip, s.dipDir, s.set + 1].join(','))].join('\n'))}>Download structures (CSV)</Btn></>} />

      <Grid min={170}>
        <Tile label="Holes with televiewer" value={`${view.tvHoles.length} of ${data.holes.length}`} note="True dip and dip direction" />
        <Tile label="Structures picked" value={all.length.toLocaleString('en-US')} note={`${all.filter(s => s.type === 'Vein').length} veins · ${all.filter(s => s.type === 'Shear').length} shears`} />
        <Tile label="Fractures on photos" value={data.holes.reduce((s, x) => s + x.flat.breaks.filter(b => b.kind === 'natural').length, 0).toLocaleString('en-US')} note="Alpha on every hole" />
      </Grid>

      <Card title={`${sel}: poles to planes`} subtitle={`Lower hemisphere, equal area. Hole drilled toward ${o.az}° at ${Math.abs(o.dip)}°. Each dot is the pole of one plane; clusters are joint sets.`}
        right={<Seg<By> value={by} onChange={setBy} options={[{ value: 'set', label: 'By set' }, { value: 'type', label: 'By type' }]} />}>
        <div style={{ display: 'grid', gap: 12 }}>
          <HoleTabs holes={view.tvHoles} value={sel} onChange={setHole} />
          <KeyRow items={by === 'set' ? (view.sets.find(x => x.hole === sel)?.sets ?? []).map(s => ({ hex: SET_HEX[s.k % SET_HEX.length], label: `Set ${s.k + 1}` })) : Object.entries(TYPE_HEX).map(([k, v]) => ({ hex: v, label: k }))} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 20, alignItems: 'start' }}>
            <Stereonet points={st.map(s => ({ dip: s.dip, dipDir: s.dipDir, hex: hex(s), title: `${s.at} m · ${s.dip}°/${s.dipDir}°` }))} />
            <DepthTracks top={Math.floor(h.rows[0]?.from ?? 0)} bottom={Math.ceil(h.rows[h.rows.length - 1]?.to ?? 10)} pxPerM={1.6} tracks={tracks}
              read={d => { const xs = st.filter(s => Math.abs(s.at - d) < 1); return <><b style={{ color: T.text }}>{sel} · {d.toFixed(1)} m</b><br />{xs.length ? xs.slice(0, 4).map(s => <span key={s.id}>{s.type} {s.dip}° → {s.dipDir}°<br /></span>) : 'No pick within 1 m'}</> }} />
          </div>
        </div>
      </Card>

      <Grid min={360}>
        <Card title="Joint sets, true orientation" pad={false}>
          <Table>
            <thead><tr><th style={th}>Hole</th><th style={th}>Set</th><th style={thR}>Planes</th><th style={thR}>Dip</th><th style={thR}>Dip direction</th><th style={thR}>Alpha</th></tr></thead>
            <tbody>{view.sets.flatMap(x => x.sets.map(s => (
              <tr key={`${x.hole}${s.k}`} style={{ borderBottom: rowLine }}>
                <td style={tdStrong}>{x.hole}</td><td style={td}><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: SET_HEX[s.k % SET_HEX.length], marginRight: 6 }} />Set {s.k + 1}</td>
                <td style={tdR}>{s.n}</td><td style={tdR}>{s.dip}°</td><td style={tdR}>{String(s.dipDir).padStart(3, '0')}°</td><td style={tdR}>{s.alpha}°</td>
              </tr>
            )))}</tbody>
          </Table>
        </Card>
        <Card title={`${sel}: alpha from the photos`} subtitle="What every hole has without a televiewer: the angle to the core axis.">
          <AlphaChart alphas={nat.map(b => b.alpha)} sets={js.sets} />
        </Card>
      </Grid>
      <Note>Alpha comes from the real tray photos. In the demo, beta (which way round the hole each plane faces) is sample televiewer data; true dip and dip direction are worked out from alpha, beta and the hole&apos;s direction with the standard core-orientation formula, the same as with a real ATV or OTV run.</Note>
    </Page>
  )
}

/* Mean of directions in degrees. */
function circ(xs: number[]) {
  const s = mean(xs.map(x => Math.sin(x * Math.PI / 180))), c = mean(xs.map(x => Math.cos(x * Math.PI / 180)))
  const a = Math.atan2(s, c) * 180 / Math.PI
  return a < 0 ? a + 360 : a
}
