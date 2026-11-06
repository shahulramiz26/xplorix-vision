'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useGeo } from '../../../../lib/core/geo-data'
import { VEIN_CLASSES, mean, type Vein } from '../../../../lib/core/downhole'
import type { CoreTray } from '../../../../lib/core/model'
import { Page, PageHead, Grid, Tile, Card, Btn, Table, Status, Empty, Note, inputStyle, th, thR, td, tdR, tdStrong, rowLine, T, tint } from '../../../components/kit'
import { photoSrc, xAtDepth, DemoPhotos, Swatch, pct } from '../../../components/core-ui'
import { DepthTracks, HoleTabs, KeyRow, type Track } from '../../../components/geo-ui'

/* VEIN CLASSES — every vein the photos show, sorted into kinds.
 *
 * A vein is a run of 5 cm bins where pale, unstained quartz-like pixels
 * cover a fifth of the core or more. Each is put in a class by fixed rules
 * on what the photo shows (thickness, how much of the core is vein, iron
 * staining, how dark the rock around it is). The geologist names and
 * describes each class once. Vein volume down the hole comes from the same
 * bins, so it can be measured on every hole, not only the ones logged by
 * hand. */

/* A crop of the tray photo around a vein, scaled so every crop is the same
 * height whatever the tray. */
function Crop({ tray, at, w = 120, h = 60 }: { tray: CoreTray; at: number; w?: number; h?: number }) {
  const p = xAtDepth(tray, at)
  if (!p) return null
  const r = tray.rows[p.row]
  const k = h / Math.max(1, r.band[1] - r.band[0])
  return (
    <Link href={`/admin/geology/trays/${tray.id}`} title={`${tray.hole} ${at.toFixed(2)} m`}
      style={{ display: 'block', width: w, height: h, borderRadius: 6, border: `1px solid ${T.border}`, flex: '0 0 auto',
        backgroundImage: `url(${photoSrc(tray, true)})`, backgroundSize: `${tray.w * k}px ${tray.h * k}px`,
        backgroundPosition: `${-(p.x * k - w / 2)}px ${-(r.band[0] * k)}px`, backgroundRepeat: 'no-repeat' }} />
  )
}

export default function VeinClasses() {
  const { data, edits, nameVein } = useGeo()
  const [hole, setHole] = useState('')
  const [draft, setDraft] = useState<Record<number, { name: string; description: string }>>({})

  const view = useMemo(() => {
    if (!data.ready) return null
    const auOf = (v: Vein) => data.byHole[v.hole]?.find(m => v.from >= m.from - 0.01 && v.from < m.to)?.assay.Au
    const veinMetres = new Set(data.veins.map(v => `${v.hole}:${Math.floor(v.from)}`))
    const barren = data.metres.filter(m => !veinMetres.has(`${m.hole}:${Math.floor(m.from)}`)).map(m => m.assay.Au)
    const classes = VEIN_CLASSES.map(c => {
      const vs = data.veins.filter(v => v.cls === c.id)
      const au = vs.map(auOf).filter((x): x is number => x != null)
      const step = Math.max(1, Math.floor(vs.length / 6))
      const samples = vs.filter(v => v.confidence !== 'low').sort((a, b) => b.length - a.length).filter((_, i) => i % step === 0).slice(0, 6)
      return { c, vs, metres: vs.reduce((s, v) => s + v.length, 0), holes: new Set(vs.map(v => v.hole)).size, au: au.length ? mean(au) : 0, samples }
    })
    const metresTotal = data.holes.reduce((s, h) => s + h.rows.reduce((t, r) => t + r.length, 0), 0)
    return { classes, barrenAu: mean(barren), metresTotal, veinMetres: data.veins.reduce((s, v) => s + v.length, 0) }
  }, [data])

  if (!data.ready || !view) return <Page><Card><Empty>Finding veins on the photos…</Empty></Card></Page>
  const sel = hole || data.holes.slice().sort((a, b) => data.veins.filter(v => v.hole === b.data.hole).length - data.veins.filter(v => v.hole === a.data.hole).length)[0]?.data.hole
  const h = data.holes.find(x => x.data.hole === sel)!
  const ms = data.byHole[sel] ?? []
  const vs = data.veins.filter(v => v.hole === sel)
  const name = (id: number) => edits.veinNames[id]?.name ?? VEIN_CLASSES[id].name
  const desc = (id: number) => edits.veinNames[id]?.description ?? VEIN_CLASSES[id].description
  const top = view.classes.slice().sort((a, b) => b.au - a.au)[0]
  const trayOf = (v: Vein) => data.holes.find(x => x.data.hole === v.hole)?.trays.find(t => t.id === v.tray)

  const tracks: Track[] = [
    { kind: 'band', label: 'Core colour', w: 40, items: h.rows.map(r => ({ from: r.from, to: r.to, hex: r.hex })) },
    { kind: 'ticks', label: 'Veins by class', w: 70, items: vs.map(v => ({ at: (v.from + v.to) / 2, hex: VEIN_CLASSES[v.cls].hex === '#e8e4d8' ? '#d6c9a0' : VEIN_CLASSES[v.cls].hex, title: `${v.from}–${v.to} m · Class ${VEIN_CLASSES[v.cls].letter}` })) },
    { kind: 'curve', label: 'Vein % of core', w: 100, max: 30, color: '#3E7BFA', items: h.rows.map(r => ({ from: r.from, to: r.to, v: r.vein * 100 })) },
    { kind: 'curve', label: 'Veins per metre', w: 90, max: 6, color: '#8E4EC6', items: h.rows.map(r => ({ from: r.from, to: r.to, v: vs.filter(v => v.from >= r.from && v.from < r.to).length })) },
    { kind: 'curve', label: 'Au g/t (log)', w: 100, min: 0.005, max: 10, log: true, color: '#C99A00', items: ms.map(m => ({ from: m.from, to: m.to, v: m.assay.Au })) },
  ]

  return (
    <Page>
      <PageHead question="What veins are in the core, and what kind are they?"
        answer={<>{data.veins.length.toLocaleString('en-US')} veins found on the photos of {data.holes.length} holes: {view.veinMetres.toFixed(0)} m of vein in {Math.round(view.metresTotal).toLocaleString('en-US')} m of core. {top && top.au > view.barrenAu * 2 ? <>Metres with <b>Class {top.c.letter}</b> veins average <b>{top.au.toFixed(2)} g/t Au</b>, against {view.barrenAu.toFixed(2)} g/t in metres with no vein.</> : null}</>}
        right={<DemoPhotos />} />

      <Grid min={180}>
        {view.classes.map(x => (
          <Tile key={x.c.id} label={`Class ${x.c.letter} · ${name(x.c.id)}`} value={x.vs.length} note={`${x.metres.toFixed(1)} m · ${x.holes} holes · Au ${x.au.toFixed(2)} g/t`} />
        ))}
      </Grid>

      <Grid min={420}>
        {view.classes.map(x => {
          const d = draft[x.c.id]
          return (
            <Card key={x.c.id} title={`Vein Class ${x.c.letter}: ${name(x.c.id)}`} subtitle={desc(x.c.id)} right={<Swatch hex={x.c.hex} size={20} />}>
              {x.samples.length === 0 ? <Empty>No veins of this class yet.</Empty> : (
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6 }}>
                  {x.samples.map(v => { const t = trayOf(v); return t ? <Crop key={v.id} tray={t} at={(v.from + v.to) / 2} /> : null })}
                </div>
              )}
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: T.muted, marginTop: 10 }}>
                <span>{x.vs.length} veins</span><span>Longest {Math.max(0, ...x.vs.map(v => v.length)).toFixed(2)} m along the core</span>
                <span>Vein cover {pct(mean(x.vs.map(v => v.intensity)) * 100)}</span><span>Staining {pct(mean(x.vs.map(v => v.ox)) * 100)}</span>
                <span>{x.vs.filter(v => v.confidence === 'low').length} unsure</span>
              </div>
              <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                <input aria-label={`Name for vein class ${x.c.letter}`} value={d?.name ?? name(x.c.id)} onChange={e => setDraft({ ...draft, [x.c.id]: { name: e.target.value, description: d?.description ?? desc(x.c.id) } })} style={inputStyle} />
                <textarea aria-label={`Description for vein class ${x.c.letter}`} rows={2} value={d?.description ?? desc(x.c.id)} onChange={e => setDraft({ ...draft, [x.c.id]: { name: d?.name ?? name(x.c.id), description: e.target.value } })} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
                <div><Btn size="sm" kind="primary" disabled={!d} onClick={() => { nameVein(x.c.id, d!.name.trim() || name(x.c.id), d!.description.trim()); setDraft(s => { const n = { ...s }; delete n[x.c.id]; return n }) }}>Save</Btn></div>
              </div>
            </Card>
          )
        })}
      </Grid>

      <Card title="Vein volume down the hole" subtitle="Vein cover on every 1 m, each vein ticked by class, beside the assays. Measured on every photographed hole, not only the ones logged by hand.">
        <div style={{ display: 'grid', gap: 12 }}>
          <HoleTabs holes={data.holes.map(x => x.data.hole)} value={sel} onChange={setHole} />
          <KeyRow items={VEIN_CLASSES.map(c => ({ hex: c.hex, label: `Class ${c.letter}: ${name(c.id)}` }))} />
          <DepthTracks top={Math.floor(h.rows[0]?.from ?? 0)} bottom={Math.ceil(h.rows[h.rows.length - 1]?.to ?? 10)} pxPerM={3.2} tracks={tracks}
            read={d => { const r = h.rows.find(x => d >= x.from && d < x.to), m = ms.find(x => d >= x.from && d < x.to); const here = vs.filter(v => v.to > Math.floor(d) && v.from < Math.floor(d) + 1); return <><b style={{ color: T.text }}>{sel} · {d.toFixed(1)} m</b><br />Vein cover {r ? pct(r.vein * 100) : '—'} · {here.length} veins in this metre<br />{here.map(v => `Class ${VEIN_CLASSES[v.cls].letter}`).join(', ') || 'No vein'}<br />Au {m?.assay.Au.toFixed(3) ?? '—'} g/t</> }} />
        </div>
      </Card>

      <Card title="Vein volume by hole" pad={false}>
        <Table>
          <thead><tr><th style={th}>Hole</th><th style={thR}>Veins</th><th style={thR}>Vein metres</th><th style={thR}>Veins /m</th>{VEIN_CLASSES.map(c => <th key={c.id} style={thR}>Class {c.letter}</th>)}<th style={thR}>Unsure</th></tr></thead>
          <tbody>{data.holes.map(hv => {
            const xs = data.veins.filter(v => v.hole === hv.data.hole), L = hv.rows.reduce((s, r) => s + r.length, 0)
            return (
              <tr key={hv.data.hole} style={{ borderBottom: rowLine }}>
                <td style={tdStrong}>{hv.data.hole}</td><td style={tdR}>{xs.length}</td><td style={tdR}>{xs.reduce((s, v) => s + v.length, 0).toFixed(1)}</td>
                <td style={tdR}>{(xs.length / Math.max(1, L)).toFixed(2)}</td>
                {VEIN_CLASSES.map(c => <td key={c.id} style={tdR}>{xs.filter(v => v.cls === c.id).length}</td>)}
                <td style={tdR}>{xs.filter(v => v.confidence === 'low').length || ''}</td>
              </tr>
            )
          })}</tbody>
        </Table>
      </Card>

      <Card title={`Veins to check on ${sel}`} subtitle="Where the rules were least sure of the class. Open the tray to confirm." pad={false}>
        {vs.filter(v => v.confidence === 'low').length === 0 ? <Empty>None unsure on this hole.</Empty> : vs.filter(v => v.confidence === 'low').slice(0, 12).map((v, i) => (
          <div key={v.id} style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', borderTop: i ? rowLine : undefined, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: T.text }}>{v.from.toFixed(2)}–{v.to.toFixed(2)} m · suggested <b>Class {VEIN_CLASSES[v.cls].letter}</b> <span style={{ color: T.faint }}>(cover {pct(v.intensity * 100)}, staining {pct(v.ox * 100)}, host brightness {Math.round(v.hostL)})</span></span>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Status tone="warn">Unsure</Status><Link href={`/admin/geology/trays/${v.tray}`} style={{ color: T.orange, fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>See it →</Link></span>
          </div>
        ))}
      </Card>
      <div style={{ padding: '10px 14px', borderRadius: 10, fontSize: 12.5, color: T.muted, background: tint(T.faint, 8) }}>
        Veins are found on the real tray photos. Classes come from fixed rules on what a photo shows; names and descriptions are the geologist&apos;s. Vein orientation needs the televiewer or an orientation line: see <Link href="/admin/geology/structures" style={{ color: T.orange }}>Structures</Link>. Assays are sample data.
      </div>
    </Page>
  )
}
