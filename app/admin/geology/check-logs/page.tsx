'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useCore, className } from '../../../../lib/core/store'
import { useGeo, lithHex } from '../../../../lib/core/geo-data'
import { hasData } from '../../../../lib/core/downhole'
import { download } from '../../../../lib/core/export'
import { Page, PageHead, Grid, Tile, Card, Btn, Table, Status, Empty, Note, th, thR, td, tdR, tdStrong, rowLine, T } from '../../../components/kit'
import { Bar, pct, classHex, Swatch, DemoPhotos } from '../../../components/core-ui'
import { DepthTracks, HoleTabs, KeyRow, SampleBadge, type Track } from '../../../components/geo-ui'

/* CHECK LOGS — the geologist's log against what the photos measured.
 *
 * Lithology: every photo class is matched to the rock name the geologists
 * most often gave it, then each logged metre is checked against that.
 * Geotech: logged RQD against photo RQD, interval by interval. A check finds
 * where to look again; it does not say who is right. */

export default function CheckLogs() {
  const geo = useGeo()
  const { data, edits, importManual, clearImport } = geo
  const { review, index, nameClass } = useCore()
  const [hole, setHole] = useState<string>('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const file = useRef<HTMLInputElement>(null)

  const sum = useMemo(() => {
    if (!data.ready) return null
    const n = data.checks.reduce((s, c) => s + c.metres, 0)
    const agree = n ? data.checks.reduce((s, c) => s + c.agree * c.metres, 0) / n : 0
    const dis = data.checks.flatMap(c => c.disagreements.map(d => ({ ...d, hole: c.hole })))
    const bounds = data.checks.flatMap(c => c.boundaries.map(b => ({ ...b, hole: c.hole })))
    const rq = data.checks.flatMap(c => c.rqd.map(r => ({ ...r, hole: c.hole })))
    return {
      n, agree, dis: dis.sort((a, b) => (b.to - b.from) - (a.to - a.from)), boundsOff: bounds.filter(b => b.off > 1), bounds,
      rq, bias: rq.length ? rq.reduce((s, r) => s + r.diff, 0) / rq.length : 0, geoHoles: data.holes.filter(h => hasData('manualRqd', h.data.hole) || data.logs[h.data.hole]?.some(x => x.rqd != null)).length,
    }
  }, [data])

  if (!data.ready || !sum) return <Page><Card><Empty>Reading the photos and the logs…</Empty></Card></Page>
  const sel = hole || data.checks.slice().sort((a, b) => a.agree - b.agree)[0]?.hole || ''
  const chk = data.checks.find(c => c.hole === sel)!
  const h = data.holes.find(x => x.data.hole === sel)!
  const log = data.logs[sel] ?? []
  const imported = Object.keys(edits.manual)
  const trayAt = (hl: string, at: number) => {
    const hv = data.holes.find(x => x.data.hole === hl)
    const t = hv?.trays.find(x => x.from <= at + 0.01 && x.usedTo > at) ?? hv?.trays.find(x => x.usedTo > at)
    return t ? `/admin/geology/trays/${t.id}` : `/admin/geology/holes/${hl}`
  }

  const map = data.map
  const tracks: Track[] = [
    { kind: 'band', label: "Geologist's log", w: 64, items: log.map(x => ({ from: x.from, to: x.to, hex: lithHex(x.lith), title: `${x.from}–${x.to} m · ${x.lith}` })) },
    { kind: 'band', label: 'Photo says', w: 64, items: h.rows.filter(r => r.cls >= 0).map(r => ({ from: r.from, to: r.to, hex: lithHex(map[r.cls]?.lith ?? ''), title: `${className(review, r.cls)} → ${map[r.cls]?.lith}` })) },
    { kind: 'band', label: 'Agree?', w: 40, items: h.rows.map(r => { const l = log.find(x => (r.from + r.to) / 2 >= x.from && (r.from + r.to) / 2 < x.to)?.lith; return { from: r.from, to: r.to, hex: !l || r.cls < 0 ? 'transparent' : map[r.cls]?.lith === l ? 'rgba(31,157,107,.55)' : 'rgba(229,72,77,.75)' } }) },
    { kind: 'band', label: 'Core colour', w: 40, items: h.rows.map(r => ({ from: r.from, to: r.to, hex: r.hex })) },
    { kind: 'curve', label: 'RQD photo · logged', w: 120, max: 100, color: '#1F9D6B', items: h.rows.map(r => ({ from: r.from, to: r.to, v: r.rqd })), second: log.some(x => x.rqd != null) ? { items: log.filter(x => x.rqd != null).map(x => ({ from: x.from, to: x.to, v: x.rqd! })), color: T.orange } : undefined },
  ]
  const liths = Array.from(new Set([...Object.values(map).map(m => m.lith), ...log.map(x => x.lith)]))

  const onFile = async (f: File) => { setMsg(importManual(await f.text(), f.name)) }
  const template = () => download('xplorix_manual_log_template.csv', 'HOLE_ID,FROM,TO,LITH,RQD\nDH-961,3.0,9.4,Siltstone,78\nDH-961,9.4,15.2,Basalt,92\n')

  return (
    <Page>
      <PageHead question="Does the geologist's log agree with the core?"
        tone={sum.agree >= 0.8 ? 'good' : 'warn'}
        answer={<>Across {data.holes.length} holes the hand log and the photos agree on <b>{pct(sum.agree * 100)}</b> of {sum.n.toLocaleString('en-US')} logged metres. {sum.dis.length} stretches of 2 m or more disagree, and {sum.boundsOff.length} of {sum.bounds.length} unit boundaries sit more than 1 m from where the core changes. {sum.rq.length ? <>On the {sum.geoHoles} holes with a hand geotech log, logged RQD reads <b>{sum.bias >= 0 ? '+' : ''}{sum.bias.toFixed(0)} points</b> against the photos on average.</> : null}</>}
        right={<><DemoPhotos /><SampleBadge>Sample hand logs</SampleBadge></>} />

      <Grid min={170}>
        <Tile label="Metres that agree" value={pct(sum.agree * 100)} note="Logged rock against photo class" tone={sum.agree >= 0.8 ? 'good' : 'warn'} />
        <Tile label="Stretches to look at again" value={sum.dis.length} note="2 m or longer where they differ" tone={sum.dis.length ? 'warn' : 'good'} />
        <Tile label="Boundaries off by > 1 m" value={`${sum.boundsOff.length} of ${sum.bounds.length}`} note="From where the photo class changes" />
        <Tile label="Logged RQD against photo" value={`${sum.bias >= 0 ? '+' : ''}${sum.bias.toFixed(0)} pts`} note={`${sum.rq.filter(r => Math.abs(r.diff) > 15).length} intervals more than 15 points apart`} tone={Math.abs(sum.bias) > 8 ? 'warn' : 'good'} />
        <Tile label="Geotech coverage" value={`${data.holes.length} of ${data.holes.length} holes`} note={`Hand geotech log on ${sum.geoHoles}; photos give RQD on every hole`} tone="good" />
      </Grid>

      <Card title="Which photo class is which logged rock" subtitle="Worked out from every logged metre on every hole: the name the geologists most often gave each class. Use it to name the classes once." pad={false}>
        <Table>
          <thead><tr><th style={th}>Photo class</th><th style={th}>Logged as</th><th style={th}>How often</th><th style={th} /></tr></thead>
          <tbody>
            {Object.entries(map).sort((a, b) => +a[0] - +b[0]).map(([c, m]) => {
              const id = +c, named = review.classNames[id]
              return (
                <tr key={c} style={{ borderBottom: rowLine }}>
                  <td style={tdStrong}><Swatch hex={classHex(id, index?.classes)} /> <span style={{ marginLeft: 6 }}>{className(review, id)}</span></td>
                  <td style={td}><Swatch hex={lithHex(m.lith)} /> <span style={{ marginLeft: 6, color: T.text }}>{m.lith}</span></td>
                  <td style={td}><Bar value={m.share * 100} w={80} color={m.share >= 0.75 ? T.green : T.amber} /> <span style={{ marginLeft: 6 }}>{pct(m.share * 100)} of its metres</span></td>
                  <td style={{ ...td, textAlign: 'right' }}>{named === m.lith ? <Status tone="good">Named</Status> : <Btn size="sm" onClick={() => nameClass(id, m.lith)}>Name it {m.lith}</Btn>}</td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      </Card>

      <Card title="Hole by hole" subtitle="Worst agreement first. Pick a hole to see its log beside the photos." pad={false}>
        <Table>
          <thead><tr><th style={th}>Hole</th><th style={th}>Logged by</th><th style={th}>Agreement</th><th style={thR}>Stretches</th><th style={thR}>Boundaries off</th><th style={thR}>RQD logged − photo</th><th style={th} /></tr></thead>
          <tbody>
            {data.checks.slice().sort((a, b) => a.agree - b.agree).map(c => {
              const l = data.logs[c.hole] ?? []
              return (
                <tr key={c.hole} style={{ borderBottom: rowLine, background: c.hole === sel ? 'rgba(var(--x-ov),0.04)' : undefined }}>
                  <td style={tdStrong}>{c.hole}</td>
                  <td style={td}>{l[0]?.by ?? '—'}{edits.manual[c.hole] ? ' · imported' : ''}</td>
                  <td style={td}><Bar value={c.agree * 100} w={80} color={c.agree >= 0.8 ? T.green : c.agree >= 0.65 ? T.amber : T.red} /> <span style={{ marginLeft: 6, color: T.text }}>{pct(c.agree * 100)}</span></td>
                  <td style={tdR}>{c.disagreements.length}</td>
                  <td style={tdR}>{c.boundaries.filter(b => b.off > 1).length} of {c.boundaries.length}</td>
                  <td style={tdR}>{c.rqd.length ? `${c.rqdBias >= 0 ? '+' : ''}${c.rqdBias.toFixed(0)} pts` : 'no hand log'}</td>
                  <td style={{ ...td, textAlign: 'right' }}><Btn size="sm" onClick={() => setHole(c.hole)}>{c.hole === sel ? 'Shown below' : 'Show'}</Btn></td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      </Card>

      <Card title={`${sel}: the log beside the photos`} subtitle={`Logged by ${log[0]?.by ?? '—'}. Red in "Agree?" is where the logged rock is not what the photo class usually is. Orange RQD is the hand log, green is the photos.`}>
        <div style={{ display: 'grid', gap: 12 }}>
          <HoleTabs holes={data.checks.map(c => c.hole)} value={sel} onChange={setHole} />
          <KeyRow items={liths.map(l => ({ hex: lithHex(l), label: l }))} />
          <DepthTracks top={Math.floor(h.rows[0]?.from ?? 0)} bottom={Math.ceil(h.rows[h.rows.length - 1]?.to ?? 10)} pxPerM={3.2} tracks={tracks}
            read={d => {
              const r = h.rows.find(x => d >= x.from && d < x.to), l = log.find(x => d >= x.from && d < x.to)
              return <><b style={{ color: T.text }}>{sel} · {d.toFixed(1)} m</b><br />Log: {l?.lith ?? '—'}{l?.rqd != null ? ` · RQD ${l.rqd}%` : ''}<br />Photo: {r ? `${className(review, r.cls)} (${map[r.cls]?.lith}) · RQD ${pct(r.rqd)}` : '—'}</>
            }} />
        </div>
      </Card>

      <Card title="Stretches to look at again" subtitle="Where the logged rock and the photo disagree for 2 m or more, longest first. Open the tray and decide." pad={false}>
        {chk.disagreements.length === 0 ? <Empty>The log and the photos agree all the way down {sel}.</Empty> : (
          <Table>
            <thead><tr><th style={th}>Depth</th><th style={th}>Logged as</th><th style={th}>Photo says</th><th style={thR}>Length</th><th style={th} /></tr></thead>
            <tbody>{chk.disagreements.slice().sort((a, b) => (b.to - b.from) - (a.to - a.from)).map(d => (
              <tr key={d.from} style={{ borderBottom: rowLine }}>
                <td style={tdStrong}>{d.from.toFixed(0)}–{d.to.toFixed(0)} m</td>
                <td style={td}><Swatch hex={lithHex(d.logged)} /> <span style={{ marginLeft: 6 }}>{d.logged}</span></td>
                <td style={td}><Swatch hex={lithHex(d.photo)} /> <span style={{ marginLeft: 6 }}>{d.photo} <span style={{ color: T.faint }}>({className(review, d.photoCls)})</span></span></td>
                <td style={tdR}>{(d.to - d.from).toFixed(0)} m</td>
                <td style={{ ...td, textAlign: 'right' }}><Link href={trayAt(sel, d.from)} style={{ color: T.orange, fontWeight: 600, textDecoration: 'none' }}>See the core →</Link></td>
              </tr>
            ))}</tbody>
          </Table>
        )}
      </Card>

      {chk.rqd.length > 0 && (
        <Card title={`${sel}: logged RQD against the photos`} subtitle="Interval by interval. More than 15 points apart is flagged; broken ground logged high is the usual miss." pad={false}>
          <Table>
            <thead><tr><th style={th}>Interval</th><th style={thR}>Logged</th><th style={thR}>Photos</th><th style={thR}>Difference</th><th style={th} /></tr></thead>
            <tbody>{chk.rqd.map(r => (
              <tr key={r.from} style={{ borderBottom: rowLine }}>
                <td style={tdStrong}>{r.from.toFixed(1)}–{r.to.toFixed(1)} m</td>
                <td style={tdR}>{r.logged}%</td><td style={tdR}>{r.photo}%</td>
                <td style={{ ...tdR, color: Math.abs(r.diff) > 15 ? T.red : T.muted }}>{r.diff >= 0 ? '+' : ''}{r.diff}</td>
                <td style={td}>{Math.abs(r.diff) > 15 ? <Status tone="warn">Check</Status> : <Status tone="good">Close</Status>}</td>
              </tr>
            ))}</tbody>
          </Table>
        </Card>
      )}

      <Card title="Import your own log" subtitle="CSV or tab-separated, from acQuire, Excel or any logging app: HOLE_ID, FROM, TO, LITH, and RQD if you have it. It replaces the sample log for those holes.">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input ref={file} type="file" accept=".csv,.txt,.tsv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = '' }} />
          <Btn kind="primary" onClick={() => file.current?.click()}>Choose a log file</Btn>
          <Btn onClick={template}>Download a template</Btn>
          {imported.map(hl => <Btn key={hl} size="sm" onClick={() => clearImport('manual', hl)}>Remove import · {hl}</Btn>)}
        </div>
        {msg && <div style={{ marginTop: 12 }}><Note tone={msg.ok ? 'good' : 'bad'}>{msg.text}</Note></div>}
      </Card>
      <Note>Demo: the hand logs are samples written from the real photos with the misses a busy core shed makes (a unit called the wrong thing, a boundary a metre off, RQD guessed high in broken ground). Import a real log and the same check runs on it.</Note>
    </Page>
  )
}
