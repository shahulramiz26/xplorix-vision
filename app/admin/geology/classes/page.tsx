'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useAllHoles, useCore, className, classLetter } from '../../../../lib/core/store'
import { colourName } from '../../../../lib/core/engine'
import { Page, PageHead, Card, Btn, Empty, Note, inputStyle, T } from '../../../components/kit'
import { photoSrc, xAtDepth, pct, DemoPhotos, Swatch } from '../../../components/core-ui'
import type { CoreTray } from '../../../../lib/core/model'

/* ROCK CLASSES — groups of core that look alike (colour, grain, veins,
 * staining), found across every hole. The photo step does not know the rock
 * names; the geologist looks at the samples and names each class once. */

const K = 3   // display scale for the crops

function Crop({ tray, at }: { tray: CoreTray; at: number }) {
  const p = xAtDepth(tray, at)
  if (!p) return null
  const r = tray.rows[p.row]
  const win = 46, hgt = (r.band[1] - r.band[0]) * K
  return (
    <Link href={`/admin/geology/trays/${tray.id}`} title={`${tray.hole} ${at.toFixed(2)} m`}
      style={{ display: 'block', width: win * 2, height: hgt, borderRadius: 6, border: `1px solid ${T.border}`, flex: '0 0 auto',
        backgroundImage: `url(${photoSrc(tray, true)})`, backgroundSize: `${tray.w * K}px ${tray.h * K}px`,
        backgroundPosition: `${-(p.x * K - win)}px ${-(r.band[0] * K)}px`, backgroundRepeat: 'no-repeat' }} />
  )
}

export default function RockClasses() {
  const all = useAllHoles()
  const { index, review, nameClass } = useCore()
  const [draft, setDraft] = useState<Record<number, string>>({})

  const view = useMemo(() => {
    if (!index) return []
    return index.classes.map(c => {
      const bins = all.list.flatMap(h => h.trays.flatMap(t => t.bins.filter(b => b.cls === c.id && b.core > 0.9).map(b => ({ t, b, hole: h.data.hole }))))
      const metres = bins.reduce((s, x) => s + (x.b.to - x.b.from) * x.b.core, 0)
      const holes = Array.from(new Set(bins.map(x => x.hole)))
      // samples spread across holes and depths
      const step = Math.max(1, Math.floor(bins.length / 8))
      const samples = bins.filter((_, i) => i % step === Math.floor(step / 2)).slice(0, 8)
      return { c, metres, holes, samples }
    })
  }, [index, all.list])

  if (!all.ready || !index) return <Page><Card><Empty>Loading the core photos…</Empty></Card></Page>
  const named = index.classes.filter(c => review.classNames[c.id]).length

  return (
    <Page>
      <PageHead question="Which rock is which?"
        answer={<>The photos split the core into {index.classes.length} classes that look alike, darkest first. {named < index.classes.length ? `Name the ${index.classes.length - named} unnamed classes once; every log and export uses your names.` : 'All classes are named.'}</>}
        right={<DemoPhotos />} />
      <Note>Classes come from what a photo shows: colour, grain, veins and staining. Two rocks that look the same will share a class, and one rock can split across two. The name is the geologist&apos;s call.</Note>

      {view.map(({ c, metres, holes, samples }) => (
        <Card key={c.id} title={`${className(review, c.id)}`} subtitle={`${review.classNames[c.id] ? `Class ${classLetter(c.id)} · ` : ''}${colourName(c.L, c.a, c.b)} · ${pct(c.share * 100)} of the core · ${Math.round(metres)} m in ${holes.length} holes`}
          right={<Swatch hex={c.hex} size={22} />}>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6 }}>
            {samples.map(s => <Crop key={`${s.t.id}-${s.b.from}`} tray={s.t} at={(s.b.from + s.b.to) / 2} />)}
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10, fontSize: 12, color: T.muted }}>
            <span>Brightness {Math.round(c.L)}</span><span>Grain {c.tex.toFixed(1)}</span><span>Veins {(c.vein * 100).toFixed(1)}%</span><span>Iron staining {(c.ox * 100).toFixed(1)}%</span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <input aria-label={`Name for class ${classLetter(c.id)}`} placeholder="e.g. Dolerite, Black shale, Quartz-veined sandstone"
              value={draft[c.id] ?? review.classNames[c.id] ?? ''} onChange={e => setDraft({ ...draft, [c.id]: e.target.value })}
              style={{ ...inputStyle, flex: '1 1 240px' }} />
            <Btn kind="primary" disabled={!(draft[c.id] ?? '').trim() || draft[c.id]?.trim() === review.classNames[c.id]}
              onClick={() => { nameClass(c.id, draft[c.id].trim()); setDraft(d => { const n = { ...d }; delete n[c.id]; return n }) }}>Save name</Btn>
          </div>
        </Card>
      ))}
    </Page>
  )
}
