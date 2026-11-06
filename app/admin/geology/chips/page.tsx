'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useGeo } from '../../../../lib/core/geo-data'
import { RC_HOLES, CHIP_LITHS, COMP, lithAt, paintCompartment, measureChips, outline, chipClusters, CHIP_CLUSTER_HEX, type ChipMetre, type ChipSample } from '../../../../lib/core/chips'
import { mean } from '../../../../lib/core/downhole'
import { Page, PageHead, Grid, Tile, Card, Btn, Seg, Table, Empty, Note, inputStyle, th, thR, td, tdR, tdStrong, rowLine, T, tint } from '../../../components/kit'
import { DepthTracks, HoleTabs, KeyRow, Scatter, Histogram, SampleBadge, type Track } from '../../../components/geo-ui'

/* CHIPS (RC) — logging from photos of RC chip trays.
 *
 * One compartment a metre. Every chip is found against the tray and
 * measured: area, perimeter, eccentricity, shape complexity, colour. Metres
 * that look alike are grouped across every RC hole; the geologist names the
 * groups. The same grain step reads a photo you add. */

let CACHE: ChipMetre[] | null = null

function useChips() {
  const [ms, setMs] = useState<ChipMetre[] | null>(CACHE)
  const [done, setDone] = useState(CACHE ? 1 : 0)
  useEffect(() => {
    if (CACHE) return
    let stop = false
    const run = async () => {
      const c = document.createElement('canvas'); c.width = COMP; c.height = COMP
      const g = c.getContext('2d', { willReadFrequently: true })!
      const total = RC_HOLES.reduce((s, h) => s + h.depth, 0)
      const out: ChipMetre[] = []
      for (const h of RC_HOLES) {
        for (let d = 0; d < h.depth; d++) {
          if (stop) return
          const li = lithAt(h, d + 0.5)
          const nxt = lithAt(h, d + 1.5), prv = lithAt(h, d - 0.5)
          const mix = nxt !== li ? { li: nxt, share: 0.35 } : prv !== li && d > 0 ? { li: prv, share: 0.25 } : undefined
          paintCompartment(g, `${h.hole}:${d}`, li, mix)
          const img = g.getImageData(0, 0, COMP, COMP)
          const s = measureChips(img.data, COMP, COMP)
          const src = c.toDataURL('image/jpeg', 0.82)
          g.putImageData(new ImageData(outline(img.data, s.mask, COMP, COMP), COMP, COMP), 0, 0)
          const outlined = c.toDataURL('image/jpeg', 0.82)
          out.push({
            hole: h.hole, from: d, to: d + 1, li, img: src, outlined, colours: s.colours, area: s.area, perimeter: s.perimeter, ecc: s.ecc, complexity: s.complexity,
            grains: s.grains.length, cover: s.cover, sizes: s.grains.map(x => x.area),
            shapes: s.grains.filter((_, i) => i % 3 === 0).map(x => ({ area: x.area, complexity: x.complexity, hex: '#' + x.rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('') })), cluster: 0,
          })
          if (out.length % 24 === 0) { setDone(out.length / total); await new Promise(r => setTimeout(r, 0)) }
        }
      }
      const cl = chipClusters(out)
      out.forEach((m, i) => { m.cluster = cl[i] })
      CACHE = out
      if (!stop) { setMs(out); setDone(1) }
    }
    void run()
    return () => { stop = true }
  }, [])
  return { ms, done }
}

export default function Chips() {
  const { ms, done } = useChips()
  const { edits, nameChip } = useGeo()
  const [hole, setHole] = useState<string>(RC_HOLES[0].hole)
  const [tray, setTray] = useState(0)
  const [view, setView] = useState<'photo' | 'grains'>('photo')
  const [pick, setPick] = useState<number | null>(null)
  const [draft, setDraft] = useState<Record<number, string>>({})

  const stats = useMemo(() => {
    if (!ms) return null
    const K = Math.max(...ms.map(m => m.cluster)) + 1
    const clusters = Array.from({ length: K }, (_, k) => {
      const xs = ms.filter(m => m.cluster === k)
      const lith: Record<number, number> = {}
      xs.forEach(m => { lith[m.li] = (lith[m.li] ?? 0) + 1 })
      const best = Object.entries(lith).sort((a, b) => b[1] - a[1])[0]
      return { k, xs, area: mean(xs.map(m => m.area)), ecc: mean(xs.map(m => m.ecc)), cx: mean(xs.map(m => m.complexity)), colour: xs[0]?.colours[0]?.hex ?? '#888', lith: best ? CHIP_LITHS[+best[0]].name : '—', lithShare: best ? best[1] / xs.length : 0, sample: xs.filter((_, i) => i % Math.max(1, Math.floor(xs.length / 5)) === 0).slice(0, 5) }
    })
    return { clusters, grains: ms.reduce((s, m) => s + m.grains, 0) }
  }, [ms])

  if (!ms || !stats) return (
    <Page>
      <PageHead question="What do the RC chips say?" answer="Reading every compartment of the chip trays: finding each chip and measuring it." right={<SampleBadge>Sample RC holes</SampleBadge>} />
      <Card><div style={{ display: 'grid', gap: 10 }}><div style={{ fontSize: 13, color: T.muted }}>Measuring chips… {Math.round(done * 100)}%</div><div style={{ height: 8, borderRadius: 4, background: tint(T.faint, 20) }}><div style={{ width: `${done * 100}%`, height: '100%', background: T.orange, borderRadius: 4 }} /></div></div></Card>
    </Page>
  )

  const H = RC_HOLES.find(x => x.hole === hole)!
  const hm = ms.filter(m => m.hole === hole)
  const cname = (k: number) => edits.chipNames[k] ?? `Chip group ${k + 1}`
  const trays = Math.ceil(H.depth / 20)
  const tm = hm.slice(tray * 20, tray * 20 + 20)
  const sel = pick != null ? hm.find(m => m.from === pick) : null

  const tracks: Track[] = [
    { kind: 'stack', label: 'Dominant colours', w: 64, items: hm.map(m => ({ from: m.from, to: m.to, parts: m.colours })) },
    { kind: 'curve', label: 'Grain area mm²', w: 84, max: 12, color: '#7aa2d8', items: hm.map(m => ({ from: m.from, to: m.to, v: m.area })) },
    { kind: 'curve', label: 'Grain perimeter mm', w: 84, max: 16, color: '#7aa2d8', items: hm.map(m => ({ from: m.from, to: m.to, v: m.perimeter })) },
    { kind: 'curve', label: 'Grain eccentricity', w: 84, min: 0.3, max: 1, color: '#7aa2d8', items: hm.map(m => ({ from: m.from, to: m.to, v: m.ecc })) },
    { kind: 'band', label: 'Clusters', w: 46, items: hm.map(m => ({ from: m.from, to: m.to, hex: CHIP_CLUSTER_HEX[m.cluster], title: cname(m.cluster) })) },
    { kind: 'image', label: 'Cluster image', w: 46, items: hm.map(m => ({ from: m.from, to: m.to, src: m.img })) },
    { kind: 'band', label: "Geologist's log", w: 46, items: hm.map(m => ({ from: m.from, to: m.to, hex: CHIP_LITHS[m.li].palette[0][0], title: CHIP_LITHS[m.li].name })) },
  ]
  const shapes = hm.flatMap(m => m.shapes).filter((_, i) => i % 2 === 0)

  return (
    <Page>
      <PageHead question="What do the RC chips say?"
        answer={<>{ms.length} metres of RC chips on {RC_HOLES.length} holes, {stats.grains.toLocaleString('en-US')} chips measured: colour, size, shape and how ragged each one is. They fall into {stats.clusters.length} groups that look alike; name them once and every RC log uses your names.</>}
        right={<SampleBadge>Sample RC holes</SampleBadge>} />

      <Grid min={170}>
        <Tile label="RC metres read" value={ms.length} note={`${RC_HOLES.length} holes · ${Math.ceil(ms.length / 20)} chip trays`} />
        <Tile label="Chips measured" value={stats.grains.toLocaleString('en-US')} note="Area, perimeter, eccentricity, colour" />
        <Tile label="Chip groups" value={stats.clusters.length} note={`${Object.keys(edits.chipNames).length} named by a geologist`} />
        <Tile label="Groups that match the log" value={`${stats.clusters.filter(c => c.lithShare >= 0.75).length} of ${stats.clusters.length}`} note="75% or more of a group is one logged rock" />
      </Grid>

      <Card title={`${hole}: chip log`} subtitle="Read from the chip photos, one compartment a metre, beside the geologist's log. Hover to read a metre.">
        <div style={{ display: 'grid', gap: 12 }}>
          <HoleTabs holes={RC_HOLES.map(x => x.hole)} value={hole} onChange={h => { setHole(h); setTray(0); setPick(null) }} />
          <KeyRow items={stats.clusters.map(c => ({ hex: CHIP_CLUSTER_HEX[c.k], label: cname(c.k) }))} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))', gap: 16, alignItems: 'start' }}>
            <DepthTracks top={0} bottom={H.depth} pxPerM={5} tracks={tracks}
              read={d => { const m = hm.find(x => d >= x.from && d < x.to); return m ? <><b style={{ color: T.text }}>{hole} · {m.from}–{m.to} m</b><br />{cname(m.cluster)} · logged {CHIP_LITHS[m.li].name}<br />{m.grains} chips · median {m.area.toFixed(1)} mm²<br />eccentricity {m.ecc.toFixed(2)} · complexity {m.complexity.toFixed(2)}</> : null }} />
            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text, marginBottom: 6 }}>Shape against size, every third chip</div>
                <Scatter points={shapes.map(s => ({ x: s.area, y: s.complexity, hex: s.hex, r: 2.2 }))} xLabel="Chip area, mm² (log)" yLabel="Shape complexity" logX height={260} />
              </div>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text, marginBottom: 6 }}>Chip size distribution</div>
                <Histogram values={hm.flatMap(m => m.sizes)} log label="Chip area, mm² (log)" color="#5B7DB8" />
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card title={`${hole}: chip trays`} subtitle="Twenty compartments a tray, one a metre. Click a compartment for its numbers."
        right={<Seg<'photo' | 'grains'> value={view} onChange={setView} options={[{ value: 'photo', label: 'Photo' }, { value: 'grains', label: 'Chips found' }]} />}>
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {Array.from({ length: trays }, (_, i) => <Btn key={i} size="sm" kind={i === tray ? 'primary' : 'ghost'} onClick={() => { setTray(i); setPick(null) }}>Tray {i + 1} · {i * 20}–{Math.min(H.depth, i * 20 + 20)} m</Btn>)}
          </div>
          <div style={{ background: '#1d1d1f', borderRadius: 10, padding: 10, display: 'grid', gridTemplateColumns: 'repeat(10, minmax(0, 1fr))', gap: 6 }}>
            {tm.map(m => (
              <button key={m.from} type="button" onClick={() => setPick(m.from)} title={`${m.from}–${m.to} m`}
                style={{ padding: 0, border: pick === m.from ? `2px solid ${T.orange}` : '2px solid transparent', borderRadius: 6, background: 'none', cursor: 'pointer', position: 'relative' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={view === 'photo' ? m.img : m.outlined} alt={`Chips ${m.from}–${m.to} m`} style={{ width: '100%', display: 'block', borderRadius: 4 }} />
                <span style={{ position: 'absolute', left: 3, top: 2, fontSize: 9.5, color: '#fff', fontWeight: 700, textShadow: '0 1px 2px #000' }}>{m.from}</span>
              </button>
            ))}
          </div>
          {sel && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: 14, alignItems: 'start' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sel.outlined} alt="Chips found" style={{ width: '100%', maxWidth: 260, borderRadius: 8, imageRendering: 'pixelated' }} />
              <div style={{ display: 'grid', gap: 6, fontSize: 13, color: T.muted }}>
                <b style={{ color: T.text }}>{hole} · {sel.from}–{sel.to} m</b>
                <span>{cname(sel.cluster)} · logged {CHIP_LITHS[sel.li].name}</span>
                <span>{sel.grains} chips · {Math.round(sel.cover * 100)}% of the compartment covered</span>
                <span>Median area {sel.area.toFixed(2)} mm² · perimeter {sel.perimeter.toFixed(1)} mm</span>
                <span>Eccentricity {sel.ecc.toFixed(2)} · shape complexity {sel.complexity.toFixed(2)}</span>
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>Colours {sel.colours.map(c => <span key={c.hex} title={`${Math.round(c.share * 100)}%`} style={{ width: 22, height: 14, borderRadius: 3, background: c.hex, border: `1px solid ${T.border}` }} />)}</span>
              </div>
              <Histogram values={sel.sizes} log label="Chip area in this metre, mm²" height={110} />
            </div>
          )}
        </div>
      </Card>

      <Card title="Chip groups across every RC hole" subtitle="Metres whose chips look alike in colour, size and shape. Name each group once." pad={false}>
        <Table>
          <thead><tr><th style={th}>Group</th><th style={th}>Looks like</th><th style={thR}>Metres</th><th style={thR}>Area mm²</th><th style={thR}>Eccentricity</th><th style={th}>Mostly logged as</th><th style={th}>Name</th></tr></thead>
          <tbody>{stats.clusters.map(c => (
            <tr key={c.k} style={{ borderBottom: rowLine }}>
              <td style={tdStrong}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: CHIP_CLUSTER_HEX[c.k], marginRight: 6 }} />{cname(c.k)}</td>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <td style={td}><span style={{ display: 'flex', gap: 3 }}>{c.sample.map(m => <img key={`${m.hole}${m.from}`} src={m.img} alt="" style={{ width: 34, height: 34, borderRadius: 4 }} />)}</span></td>
              <td style={tdR}>{c.xs.length}</td><td style={tdR}>{c.area.toFixed(1)}</td><td style={tdR}>{c.ecc.toFixed(2)}</td>
              <td style={td}>{c.lith} <span style={{ color: T.faint }}>({Math.round(c.lithShare * 100)}%)</span></td>
              <td style={td}>
                <span style={{ display: 'flex', gap: 6 }}>
                  <input aria-label={`Name for chip group ${c.k + 1}`} placeholder={c.lith} value={draft[c.k] ?? edits.chipNames[c.k] ?? ''} onChange={e => setDraft({ ...draft, [c.k]: e.target.value })} style={{ ...inputStyle, width: 150, padding: '5px 8px' }} />
                  <Btn size="sm" disabled={!draft[c.k]?.trim()} onClick={() => { nameChip(c.k, draft[c.k].trim()); setDraft(s => { const n = { ...s }; delete n[c.k]; return n }) }}>Save</Btn>
                </span>
              </td>
            </tr>
          ))}</tbody>
        </Table>
      </Card>

      <OwnPhoto />
      <Note>Demo: the company has no RC holes, so three sample RC holes are drawn from a fixed rock sequence. The measuring is real: the same grain step that reads the drawn compartments reads a photo you add above.</Note>
    </Page>
  )
}

/* Measure a chip photo you add: one compartment, or a close-up of chips on
 * a dark tray. */
function OwnPhoto() {
  const input = useRef<HTMLInputElement>(null)
  const [res, setRes] = useState<{ src: string; out: string; s: ChipSample } | null>(null)
  const [err, setErr] = useState('')
  const read = (f: File) => {
    setErr('')
    const url = URL.createObjectURL(f)
    const img = new Image()
    img.onload = () => {
      const W = 240, Hh = Math.max(40, Math.round(img.naturalHeight * (W / img.naturalWidth)))
      const c = document.createElement('canvas'); c.width = W; c.height = Hh
      const g = c.getContext('2d', { willReadFrequently: true })!
      g.drawImage(img, 0, 0, W, Hh)
      const d = g.getImageData(0, 0, W, Hh)
      const s = measureChips(d.data, W, Hh)
      const src = c.toDataURL('image/jpeg', 0.85)
      g.putImageData(new ImageData(outline(d.data, s.mask, W, Hh), W, Hh), 0, 0)
      setRes({ src, out: c.toDataURL('image/jpeg', 0.85), s })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => setErr('That file could not be read as a photo.')
    img.src = url
  }
  return (
    <Card title="Measure your own chip photo" subtitle="A photo of one compartment, or chips on a dark tray, taken from above. It stays in your browser.">
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input ref={input} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) read(f); e.target.value = '' }} />
        <Btn kind="primary" onClick={() => input.current?.click()}>Choose a chip photo</Btn>
        {err && <span style={{ color: T.red, fontSize: 13 }}>{err}</span>}
      </div>
      {res && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 14, marginTop: 14, alignItems: 'start' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={res.out} alt="Chips found on your photo" style={{ width: '100%', borderRadius: 8 }} />
          <div style={{ display: 'grid', gap: 6, fontSize: 13, color: T.muted }}>
            <b style={{ color: T.text }}>{res.s.grains.length} chips found</b>
            <span>Median area {res.s.area.toFixed(2)} mm² (at 0.25 mm a pixel)</span>
            <span>Eccentricity {res.s.ecc.toFixed(2)} · complexity {res.s.complexity.toFixed(2)}</span>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>Colours {res.s.colours.map(c => <span key={c.hex} style={{ width: 22, height: 14, borderRadius: 3, background: c.hex, border: `1px solid ${T.border}` }} />)}</span>
          </div>
          {res.s.grains.length > 3 && <Histogram values={res.s.grains.map(g => g.area)} log label="Chip area, mm²" height={110} />}
        </div>
      )}
    </Card>
  )
}
