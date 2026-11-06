'use client'

import { Suspense, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useCosting } from '../../../../lib/costing-store'
import { useCore, useHole, stamp } from '../../../../lib/core/store'
import { processTray, lumOf, layoutFor, type Pixels, type TrayResult } from '../../../../lib/core/engine'
import { nearestClass } from '../../../../lib/core/geotech'
import { CORE_DIAMETER_MM } from '../../../../lib/core/sources'
import type { CoreTray } from '../../../../lib/core/model'
import { Page, PageHead, Card, Btn, Field, Note, Status, Empty, inputStyle, T } from '../../../components/kit'
import { TrayPhoto, dep, pct } from '../../../components/core-ui'

/* ADD PHOTOS — a tray photo goes in, the breaks and gaps come out.
 *
 * Everything runs in the browser: the photo is scaled to the size the photo
 * step is tuned for, read on a canvas and measured with the same code that
 * measured the library photos. Depths are filled in from the shift logs. */

const WORK_W = 400          // the photo step is tuned on 400 px wide tray photos

interface Pending {
  key: string
  name: string
  photo: string               // scaled JPEG data URL
  px: Pixels
  from: number
  to: number
  checks: { label: string; ok: boolean; note: string }[]
  res?: TrayResult
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = src })
}
async function readPhoto(file: File | string): Promise<{ photo: string; px: Pixels; srcW: number; srcH: number }> {
  const url = typeof file === 'string' ? file : URL.createObjectURL(file)
  const img = await loadImage(url)
  const w = WORK_W, h = Math.max(40, Math.round(img.naturalHeight * (WORK_W / img.naturalWidth)))
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const g = c.getContext('2d')!
  g.drawImage(img, 0, 0, w, h)
  const d = g.getImageData(0, 0, w, h)
  if (typeof file !== 'string') URL.revokeObjectURL(url)
  return { photo: c.toDataURL('image/jpeg', 0.85), px: { width: w, height: h, data: d.data }, srcW: img.naturalWidth, srcH: img.naturalHeight }
}

/* Photo checks a core-shed photo commonly fails: dark, washed out, blurred,
 * tilted framing (wrong shape), too small. */
function quality(px: Pixels, srcW: number, srcH: number) {
  const L = lumOf(px)
  const mean = L.reduce((a, b) => a + b, 0) / L.length
  let lap = 0, n = 0
  for (let y = 1; y < px.height - 1; y += 2) for (let x = 1; x < px.width - 1; x += 2) {
    const i = y * px.width + x
    lap += Math.abs(4 * L[i] - L[i - 1] - L[i + 1] - L[i - px.width] - L[i + px.width]); n++
  }
  const sharp = lap / Math.max(1, n)
  const ratio = srcW / srcH
  return [
    { label: 'Light', ok: mean > 60 && mean < 215, note: mean <= 60 ? 'Too dark: more light, or a flash' : mean >= 215 ? 'Washed out: less light or no flash glare' : 'Good' },
    { label: 'Sharp', ok: sharp > 6, note: sharp > 6 ? 'Good' : 'Looks blurred: hold the camera still, focus on the core' },
    { label: 'Framing', ok: ratio > 1.4 && ratio < 6, note: ratio > 1.4 && ratio < 6 ? 'Good' : 'The whole tray should fill the photo, taken from straight above' },
    { label: 'Size', ok: srcW >= 400, note: srcW >= 400 ? `${srcW} × ${srcH} px` : `Only ${srcW} px wide: use the full camera size` },
  ]
}

export default function AddPhotosPage() {
  return <Suspense fallback={null}><AddPhotos /></Suspense>
}

function AddPhotos() {
  const params = useSearchParams()
  const core = useCore()
  const { index, review } = core
  const { state } = useCosting()
  const [hole, setHole] = useState(params.get('hole') ?? index?.holes[0]?.hole ?? 'DH-952')
  const h = useHole(hole)
  const [perTray, setPerTray] = useState<number | null>(null)
  const [items, setItems] = useState<Pending[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const folder = useRef<HTMLInputElement>(null)
  const [batch, setBatch] = useState<{ done: number; total: number; saved: number; unsure: number; stopped?: string } | null>(null)

  const holes = index?.holes.map(x => x.hole) ?? []
  const lastTray = h.trays[h.trays.length - 1]
  const typical = useMemo(() => {
    const ls = h.trays.filter(t => t.source !== 'upload').map(t => t.to - t.from).sort((a, b) => a - b)
    return ls.length ? +ls[Math.floor(ls.length / 2)].toFixed(2) : 5
  }, [h.trays])
  const metres = perTray ?? typical
  const startAt = lastTray ? +lastTray.to.toFixed(2) : 0
  const drilled = useMemo(() => Math.max(0, ...state.shiftLogs.filter(l => l.holeNumber === hole).map(l => l.meterEnd ?? 0)), [state.shiftLogs, hole])
  const myUploads = review.uploads.filter(u => u.hole === hole)

  const layouts = useMemo(() => {
    // reuse the hole's tray layouts when a new photo has the same shape
    const byH = new Map<number, number[]>()
    h.trays.forEach(t => { if (!byH.has(t.h) && t.rowConfidence !== 'low') byH.set(t.h, t.rows.slice(1).map((r, i) => (t.rows[i].bottom + r.top) / 2 / t.h)) })
    return Array.from(byH.entries()).map(([height, layout]) => ({ height, layout }))
  }, [h.trays])

  const addFiles = async (files: (File | string)[], names: string[]) => {
    setBusy(true); setMsg(null)
    try {
      let from = items.length ? items[items.length - 1].to : startAt
      const next: Pending[] = []
      for (let i = 0; i < files.length; i++) {
        const r = await readPhoto(files[i])
        const to = +(from + metres).toFixed(2)
        next.push({ key: `${Date.now()}-${i}`, name: names[i], photo: r.photo, px: r.px, from, to, checks: quality(r.px, r.srcW, r.srcH) })
        from = to
      }
      setItems(s => [...s, ...next])
    } catch {
      setMsg({ tone: 'bad', text: 'That file could not be read as a photo. Use JPEG or PNG.' })
    }
    setBusy(false)
  }

  const run = (p: Pending) => {
    const size = h.data?.holeSize ?? 'HQ'
    const res = processTray(p.px, { from: p.from, to: p.to, coreDiameterMm: CORE_DIAMETER_MM[size] ?? 63.5, layout: layoutFor(layouts, p.px.height), idPrefix: `${hole}-U${p.key}` })
    setItems(s => s.map(x => x.key === p.key ? { ...x, res } : x))
  }

  const save = (p: Pending) => {
    if (!p.res || !index) return
    const res = p.res
    const id = `${hole}-U${p.key.replace(/[^0-9]/g, '').slice(-9)}`
    const shiftsHere = state.shiftLogs.filter(l => l.holeNumber === hole && (l.meterEnd ?? 0) > p.from && (l.meterStart ?? 0) < p.to)
    const tray: CoreTray & { photo: string } = {
      id, hole, no: (lastTray?.no ?? 0) + 1, file: '', from: p.from, to: p.to, usedTo: res.usedTo, w: res.width, h: res.height,
      rows: res.rows, spans: res.spans,
      breaks: res.breaks.map(b => ({ ...b, id: b.id.replace(`${hole}-U${p.key}`, id) })),
      bins: res.bins.map(b => ({ ...b, cls: b.core > 0.5 ? nearestClass(b, index.classes, index.scale) : -1 })),
      rowConfidence: res.rowConfidence, notes: res.notes, shiftIds: shiftsHere.map(l => l.id),
      takenAt: stamp(), takenBy: review.reviewer, source: 'upload', photo: p.photo,
    }
    if (core.addUpload(tray)) {
      setItems(s => s.filter(x => x.key !== p.key))
      setMsg({ tone: 'good', text: `Tray ${tray.no} saved to ${hole}, ${dep(tray.from, tray.usedTo)}.` })
    } else {
      setMsg({ tone: 'bad', text: 'The demo keeps photos in this browser, and it is full. Remove an added photo first. In the real system photos go to the server.' })
    }
  }

  /* A whole folder of old tray photos, read and saved in one go: the way a
   * photo archive from past drilling is logged without anyone at the core. */
  const runFolder = async (files: File[]) => {
    if (!index) return
    const fs = files.filter(f => /\.(jpe?g|png)$/i.test(f.name)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    if (!fs.length) { setMsg({ tone: 'bad', text: 'No JPEG or PNG photos in that folder.' }); return }
    setMsg(null)
    let from = startAt, saved = 0, unsure = 0, no = lastTray?.no ?? 0
    setBatch({ done: 0, total: fs.length, saved: 0, unsure: 0 })
    for (let i = 0; i < fs.length; i++) {
      const r = await readPhoto(fs[i])
      const to = +(from + metres).toFixed(2)
      const key = `${Date.now()}${i}`
      const size = h.data?.holeSize ?? 'HQ'
      const res = processTray(r.px, { from, to, coreDiameterMm: CORE_DIAMETER_MM[size] ?? 63.5, layout: layoutFor(layouts, r.px.height), idPrefix: `${hole}-U${key}` })
      const id = `${hole}-U${key.slice(-9)}`
      const tray: CoreTray & { photo: string } = {
        id, hole, no: ++no, file: '', from, to, usedTo: res.usedTo, w: res.width, h: res.height, rows: res.rows, spans: res.spans,
        breaks: res.breaks.map(b => ({ ...b, id: b.id.replace(`${hole}-U${key}`, id) })),
        bins: res.bins.map(b => ({ ...b, cls: b.core > 0.5 ? nearestClass(b, index.classes, index.scale) : -1 })),
        rowConfidence: res.rowConfidence, notes: res.notes, shiftIds: state.shiftLogs.filter(l => l.holeNumber === hole && (l.meterEnd ?? 0) > from && (l.meterStart ?? 0) < to).map(l => l.id),
        takenAt: stamp(), takenBy: `Archive: ${fs[i].name}`, source: 'upload', photo: r.photo,
      }
      unsure += res.breaks.filter(b => b.confidence === 'low').length
      if (!core.addUpload(tray)) { setBatch({ done: i, total: fs.length, saved, unsure, stopped: `The demo keeps photos in this browser and it is full after ${saved}. In the real system the whole archive goes to the server.` }); return }
      saved++; from = to
      setBatch({ done: i + 1, total: fs.length, saved, unsure })
      await new Promise(res2 => setTimeout(res2, 0))
    }
  }

  const sample = async () => {
    const pick = h.trays.filter(t => t.source !== 'upload').slice(-2)
    await addFiles(pick.map(t => `/core/photos/${t.hole}/${t.file}`), pick.map(t => `Sample: ${t.hole} tray ${t.no} photo`))
  }

  return (
    <Page>
      <PageHead question="Add tray photos"
        answer={<>Take a photo of each tray from straight above, add them here, and XPLORIX finds the rows, the core, the gaps and the breaks. Depths are filled in from the shift logs; change them if the tray says otherwise.</>}
        right={<Btn href="/admin/geology/review">Review trays</Btn>} />

      <Card title="1. Which hole, and how much core per tray">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 14 }}>
          <Field label="Hole">
            <select value={hole} onChange={e => { setHole(e.target.value); setItems([]); setPerTray(null) }} style={inputStyle}>
              {holes.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </Field>
          <Field label="Metres per tray" hint={`Usual on this hole: ${typical} m`}>
            <input type="number" step="0.1" min="0.5" value={metres} onChange={e => setPerTray(+e.target.value || typical)} style={inputStyle} />
          </Field>
          <Field label="Next tray starts at" hint={`Drilled to ${drilled.toFixed(1)} m (shift logs)`}>
            <div style={{ ...inputStyle, display: 'flex', alignItems: 'center' }}>{(items.length ? items[items.length - 1].to : startAt).toFixed(2)} m</div>
          </Field>
        </div>
      </Card>

      <Card title="2. Add the photos" subtitle="Several at once is fine: they are put in depth order, one tray after another.">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input ref={input} type="file" accept="image/jpeg,image/png" multiple style={{ display: 'none' }}
            onChange={e => { const fs = Array.from(e.target.files ?? []).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })); if (fs.length) void addFiles(fs, fs.map(f => f.name)); e.target.value = '' }} />
          <Btn kind="primary" onClick={() => input.current?.click()} disabled={busy}>{busy ? 'Reading…' : 'Choose photos'}</Btn>
          <Btn onClick={() => void sample()} disabled={busy || !h.trays.length}>Try with two sample photos</Btn>
          <span style={{ fontSize: 12, color: T.faint }}>JPEG or PNG. In this demo, photos stay in your browser.</span>
        </div>
        {msg && <div style={{ marginTop: 12 }}><Note tone={msg.tone === 'good' ? 'good' : 'bad'}>{msg.text}</Note></div>}
      </Card>

      <Card title="Photo archive: log old holes without the core" subtitle="Tray photos from past drilling, read in one go. The core may be long gone; the photos still give recovery, RQD, fractures, rock classes and veins.">
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: 10 }}>
            {[
              ['Archive already read', `${index?.holes.reduce((s2, x) => s2 + x.trays, 0) ?? 0} tray photos`],
              ['Holes logged from it', `${index?.holes.length ?? 0}`],
              ['Metres', `${Math.round(index?.holes.reduce((s2, x) => s2 + x.photographedTo, 0) ?? 0).toLocaleString('en-US')} m`],
              ['Source', 'National Virtual Core Library'],
              ['Last run', (index?.generatedAt ?? '').replace('T', ' ')],
            ].map(([a, b]) => <div key={a} style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.border}` }}><div style={{ fontSize: 11.5, color: T.faint }}>{a}</div><div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginTop: 3 }}>{b}</div></div>)}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* @ts-expect-error webkitdirectory is not in React's input types */}
            <input ref={folder} type="file" webkitdirectory="" directory="" multiple style={{ display: 'none' }} onChange={e => { const fs = Array.from(e.target.files ?? []); if (fs.length) void runFolder(fs); e.target.value = '' }} />
            <Btn kind="primary" onClick={() => folder.current?.click()} disabled={!!batch && batch.done < batch.total && !batch.stopped}>Read a folder of photos into {hole}</Btn>
            <span style={{ fontSize: 12, color: T.faint }}>Photos are put in name order and laid one tray after another from {startAt.toFixed(1)} m, {metres} m a tray.</span>
          </div>
          {batch && (
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ height: 8, borderRadius: 4, background: 'color-mix(in srgb, var(--x-faint) 20%, transparent)' }}><div style={{ width: `${(batch.done / batch.total) * 100}%`, height: '100%', background: T.orange, borderRadius: 4 }} /></div>
              <div style={{ fontSize: 12.5, color: T.muted }}>{batch.done} of {batch.total} photos read · {batch.saved} saved to {hole} · {batch.unsure} breaks to check{batch.done === batch.total ? <> · <Link href="/admin/geology/review" style={{ color: T.orange, fontWeight: 600 }}>Review them →</Link></> : null}</div>
              {batch.stopped && <Note tone="warn">{batch.stopped}</Note>}
            </div>
          )}
        </div>
      </Card>

      {items.map((p, k) => {
        const bad = p.checks.filter(c => !c.ok)
        const unsure = p.res?.breaks.filter(b => b.confidence === 'low').length ?? 0
        const lost = p.res?.spans.filter(s => s.kind === 'empty').reduce((s, x) => s + x.to - x.from, 0) ?? 0
        return (
          <Card key={p.key} title={`Photo ${k + 1}: ${p.name}`} subtitle={dep(p.from, p.to)}
            right={<Btn size="sm" onClick={() => setItems(s => s.filter(x => x.key !== p.key))}>Remove</Btn>}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 16 }}>
              <div>
                {p.res
                  ? <TrayPhoto tray={{ id: `pending-${p.key}`, hole, no: 0, file: '', from: p.from, to: p.to, usedTo: p.res.usedTo, w: p.res.width, h: p.res.height, rows: p.res.rows, spans: p.res.spans, breaks: p.res.breaks, bins: [], rowConfidence: p.res.rowConfidence, notes: p.res.notes, shiftIds: [], takenAt: '', takenBy: '', photo: p.photo }} />
                  // eslint-disable-next-line @next/next/no-img-element
                  : <img src={p.photo} alt={p.name} style={{ width: '100%', borderRadius: 10, display: 'block' }} />}
              </div>
              <div style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="From (m)"><input type="number" step="0.01" value={p.from} onChange={e => setItems(s => s.map(x => x.key === p.key ? { ...x, from: +e.target.value, res: undefined } : x))} style={inputStyle} /></Field>
                  <Field label="To (m)"><input type="number" step="0.01" value={p.to} onChange={e => setItems(s => s.map(x => x.key === p.key ? { ...x, to: +e.target.value, res: undefined } : x))} style={inputStyle} /></Field>
                </div>
                {p.to <= p.from && <Note tone="bad">To must be deeper than From.</Note>}
                {p.to > drilled + 0.5 && <Note tone="warn">The shift logs show the hole drilled only to {drilled.toFixed(1)} m. Check the depth on the tray.</Note>}
                <div style={{ display: 'grid', gap: 4 }}>
                  {p.checks.map(c => (
                    <div key={c.label} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: T.muted, alignItems: 'center' }}>
                      <Status tone={c.ok ? 'good' : 'warn'}>{c.label}</Status><span>{c.note}</span>
                    </div>
                  ))}
                </div>
                {!p.res && <Btn kind="primary" onClick={() => run(p)} disabled={p.to <= p.from}>{bad.length ? 'Read it anyway' : 'Find breaks and gaps'}</Btn>}
                {p.res && (
                  <>
                    <div style={{ fontSize: 13, color: T.text, lineHeight: 1.6 }}>
                      {p.res.rows.length} rows · {p.res.breaks.length} breaks ({unsure} unsure) · {lost > 0.01 ? `${(lost * 100).toFixed(0)} cm with no core` : 'no missing core'} · recovery about {pct(Math.max(0, 100 - (lost / Math.max(0.01, p.res.usedTo - p.from)) * 100))}
                      {p.res.notes.map(n => <div key={n} style={{ color: T.amber }}>{n}</div>)}
                      {p.res.rowConfidence === 'low' && <div style={{ color: T.amber }}>The rows were hard to read: check them on the tray screen.</div>}
                    </div>
                    <Btn kind="primary" onClick={() => save(p)}>Save to {hole}</Btn>
                  </>
                )}
              </div>
            </div>
          </Card>
        )
      })}

      <Card title={`Photos added in this browser · ${hole}`} pad={false}>
        {myUploads.length === 0 && <Empty>None yet.</Empty>}
        {myUploads.map((u, k) => (
          <div key={u.id} style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', borderTop: k ? `1px solid ${T.line}` : undefined, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: T.text }}>Tray {u.no} · {dep(u.from, u.usedTo)} · {u.breaks.length} breaks · {u.takenAt.replace('T', ' ')}</span>
            <span style={{ display: 'flex', gap: 8 }}>
              <Link href={`/admin/geology/trays/${u.id}`} style={{ color: T.orange, fontWeight: 600, fontSize: 13, textDecoration: 'none', alignSelf: 'center' }}>Check →</Link>
              <Btn size="sm" onClick={() => core.removeUpload(u.id)}>Remove</Btn>
            </span>
          </div>
        ))}
      </Card>
    </Page>
  )
}
