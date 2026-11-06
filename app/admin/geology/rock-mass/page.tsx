'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useAllHoles } from '../../../../lib/core/store'
import { intervals, totals, rqdClass, gsiClass, jointSets, discing, WEATHERING, type IntervalResult } from '../../../../lib/core/geotech'
import { Page, PageHead, Card, Seg, Empty, Table, th, thR, td, tdR, tdStrong, rowLine, T, num, eyebrow, display } from '../../../components/kit'
import { pct, DemoPhotos } from '../../../components/core-ui'

/* ==========================================================================
 * ROCK MASS — the engineering read of every hole, side by side
 *
 * Each hole is drawn as a strip log on one depth scale, in 5 m steps,
 * coloured by the measure picked: RQD, natural fractures a metre, the GSI
 * proxy or weathering. Colours follow each measure's own published classes
 * (Deere for RQD, Hoek for GSI, ISRM grades for weathering), so a colour
 * means the same thing a geotechnical engineer reads into it. Above each
 * strip, how many metres of that hole fall in each class. Hover a step for
 * its figures; tick "Show values" to print them.
 *
 * The scale runs from poor to good in a red–yellow–blue ramp that stays
 * readable for colour-blind readers, and every colour is named in the key.
 * ========================================================================== */

type Measure = 'rqd' | 'ff' | 'gsi' | 'weathering'
const STEP = 5
const PX = 13                   // height of one 5 m step

/* Poor → good, the same five colours for every measure. */
const RAMP = ['#C8372D', '#EE8A5A', '#E9C46A', '#8DBBD9', '#3F6FB0']
const INK = ['#fff', '#1A1A1A', '#1A1A1A', '#1A1A1A', '#fff']

interface Klass { name: string; range: string; i: number }
interface Scale { label: string; unit: string; help: string; classes: Klass[]; of: (v: number) => number; fmt: (v: number) => string; get: (r: IntervalResult) => number }

const SCALES: Record<Measure, Scale> = {
  rqd: {
    label: 'RQD', unit: '%', help: 'Rock Quality Designation: the share of each run in pieces of 10 cm or longer (Deere).',
    classes: [{ name: 'Very poor', range: '< 25%', i: 0 }, { name: 'Poor', range: '25–50%', i: 1 }, { name: 'Fair', range: '50–75%', i: 2 }, { name: 'Good', range: '75–90%', i: 3 }, { name: 'Excellent', range: '≥ 90%', i: 4 }],
    of: v => v >= 90 ? 4 : v >= 75 ? 3 : v >= 50 ? 2 : v >= 25 ? 1 : 0, fmt: v => String(Math.round(v)), get: r => r.rqd,
  },
  ff: {
    label: 'Natural fractures', unit: '/m', help: 'Natural breaks a metre of core; breaks made in handling are left out.',
    classes: [{ name: 'Crushed', range: '> 20 /m', i: 0 }, { name: 'Very broken', range: '10–20', i: 1 }, { name: 'Broken', range: '5–10', i: 2 }, { name: 'Jointed', range: '2–5', i: 3 }, { name: 'Massive', range: '< 2 /m', i: 4 }],
    of: v => v < 2 ? 4 : v < 5 ? 3 : v < 10 ? 2 : v <= 20 ? 1 : 0, fmt: v => v.toFixed(1), get: r => r.ff,
  },
  gsi: {
    label: 'GSI proxy', unit: '', help: 'Geological Strength Index estimated from RQD, roughness and weathering on the photos (Hoek classes).',
    classes: [{ name: 'Very poor', range: '< 20', i: 0 }, { name: 'Poor', range: '20–35', i: 1 }, { name: 'Fair', range: '35–55', i: 2 }, { name: 'Good', range: '55–75', i: 3 }, { name: 'Very good', range: '≥ 75', i: 4 }],
    of: v => v >= 75 ? 4 : v >= 55 ? 3 : v >= 35 ? 2 : v >= 20 ? 1 : 0, fmt: v => String(Math.round(v)), get: r => r.gsi,
  },
  weathering: {
    label: 'Weathering', unit: '', help: 'ISRM grade from the colour of the core: I fresh to V completely weathered.',
    classes: [{ name: 'V Completely', range: 'grade 5', i: 0 }, { name: 'IV Highly', range: 'grade 4', i: 1 }, { name: 'III Moderately', range: 'grade 3', i: 2 }, { name: 'II Slightly', range: 'grade 2', i: 3 }, { name: 'I Fresh', range: 'grade 1', i: 4 }],
    of: v => { const g = Math.round(v); return g <= 1 ? 4 : g === 2 ? 3 : g === 3 ? 2 : g === 4 ? 1 : 0 }, fmt: v => ['', 'I', 'II', 'III', 'IV', 'V'][Math.round(v)] ?? v.toFixed(1), get: r => r.weathering,
  },
}

/* Domains: 5 m steps grouped by RQD class, then any run shorter than
 * 10 m joins the neighbour it is closest to in RQD. */
function domains(rows: IntervalResult[]) {
  type D = { from: number; to: number; rows: IntervalResult[] }
  let out: D[] = []
  rows.forEach(r => {
    const last = out[out.length - 1]
    if (last && rqdClass(totals(last.rows).rqd) === rqdClass(r.rqd) && r.from - last.to < 1) { last.to = r.to; last.rows.push(r) }
    else out.push({ from: r.from, to: r.to, rows: [r] })
  })
  for (let pass = 0; pass < 20; pass++) {
    const i = out.findIndex(d => d.to - d.from < 10)
    if (i < 0 || out.length < 2) break
    const d = out[i], q = totals(d.rows).rqd
    const prev = out[i - 1], next = out[i + 1]
    const into = !prev ? next : !next ? prev : Math.abs(totals(prev.rows).rqd - q) <= Math.abs(totals(next.rows).rqd - q) ? prev : next
    into.from = Math.min(into.from, d.from); into.to = Math.max(into.to, d.to); into.rows = [...into.rows, ...d.rows].sort((x, y) => x.from - y.from)
    out = out.filter(x => x !== d)
  }
  const merged: D[] = []
  out.forEach(d => {
    const last = merged[merged.length - 1]
    if (last && rqdClass(totals(last.rows).rqd) === rqdClass(totals(d.rows).rqd) && d.from - last.to < 1) { last.to = d.to; last.rows = [...last.rows, ...d.rows] }
    else merged.push({ ...d })
  })
  return merged.map(d => { const t = totals(d.rows); return { ...d, cls: rqdClass(t.rqd), t } })
}

export default function RockMass() {
  const all = useAllHoles()
  const [m, setM] = useState<Measure>('rqd')
  const [values, setValues] = useState(false)
  const [hover, setHover] = useState<{ hole: string; r: IntervalResult; x: number; y: number } | null>(null)

  const view = useMemo(() => {
    const per = all.list.map(h => {
      const coarse = intervals(h.flat, STEP)
      const nat = h.flat.breaks.filter(b => b.kind === 'natural').map(b => b.alpha)
      return { h, coarse, doms: domains(coarse), sets: jointSets(nat).sets, discs: discing(h.flat).length }
    })
    const deepest = Math.max(1, ...all.list.map(h => h.data.drilled))
    return { per, deepest }
  }, [all.list])

  const sc = SCALES[m]
  /* Metres in each class: per hole for the strips, and across every hole for the key. */
  const classMetres = useMemo(() => view.per.map(p => {
    const c = [0, 0, 0, 0, 0]
    p.coarse.forEach(r => { c[sc.of(sc.get(r))] += r.length })
    return c
  }), [view.per, sc])
  const allMetres = classMetres.reduce((a, c) => a.map((x, i) => x + c[i]), [0, 0, 0, 0, 0])
  const totalM = allMetres.reduce((a, b) => a + b, 0)

  if (!all.ready) return <Page><Card><Empty>Loading the core photos…</Empty></Card></Page>
  const bands = Math.ceil(view.deepest / STEP)
  const H = bands * PX
  const worst = view.per.map((p, i) => ({ hole: p.h.data.hole, poor: classMetres[i][0] + classMetres[i][1], tot: classMetres[i].reduce((a, b) => a + b, 0) }))
    .filter(x => x.tot > 0).sort((a, b) => b.poor / b.tot - a.poor / a.tot)[0]

  return (
    <Page>
      <PageHead question="What is the rock mass like, hole by hole?"
        answer={<>{view.per.length} holes on one depth scale, coloured by {sc.label}. {totalM > 0 ? <><b style={{ color: T.text }}>{Math.round(((allMetres[3] + allMetres[4]) / totalM) * 100)}%</b> of the photographed core is in the two best classes{worst && worst.poor > 0 ? <>; the weakest ground is in <b style={{ color: T.text }}>{worst.hole}</b> ({Math.round((worst.poor / worst.tot) * 100)}% poor or worse)</> : ''}.</> : null}</>}
        right={<DemoPhotos />} />

      <Card title="Down every hole" subtitle={sc.help} right={
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: T.muted, cursor: 'pointer' }}>
            <input id="rm-values" type="checkbox" checked={values} onChange={e => setValues(e.target.checked)} /> Show values
          </label>
          <Seg<Measure> value={m} onChange={setM} options={[{ value: 'rqd', label: 'RQD' }, { value: 'ff', label: 'Fractures' }, { value: 'gsi', label: 'GSI' }, { value: 'weathering', label: 'Weathering' }]} />
        </div>}>

        {/* The key: each class, its range, and the metres in it across every hole. */}
        <div role="list" aria-label={`${sc.label} classes`} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))', gap: 8, marginBottom: 16 }}>
          {[...sc.classes].sort((a, b) => b.i - a.i).map(k => (
            <div role="listitem" key={k.name} style={{ display: 'grid', gridTemplateColumns: '14px minmax(0, 1fr)', gap: 8, alignItems: 'start', padding: '8px 10px', borderRadius: 8, border: `1px solid ${T.border}`, background: 'var(--x-raised)' }}>
              <span aria-hidden style={{ width: 14, height: 14, borderRadius: 3, background: RAMP[k.i], marginTop: 1 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text }}>{k.name} <span style={{ fontWeight: 400, color: T.faint }}>{k.range}</span></div>
                <div style={{ ...num, fontSize: 12, color: T.muted }}>{Math.round(allMetres[k.i]).toLocaleString('en-US')} m · {totalM ? Math.round((allMetres[k.i] / totalM) * 100) : 0}%</div>
              </div>
            </div>
          ))}
        </div>

        <div data-rm style={{ overflowX: 'auto', position: 'relative' }} onMouseLeave={() => setHover(null)}>
          <div style={{ display: 'grid', gridTemplateColumns: `48px repeat(${view.per.length}, minmax(${values ? 64 : 52}px, 1fr))`, columnGap: 10, minWidth: 48 + view.per.length * (values ? 74 : 62) }}>
            {/* column heads: hole, mean, and its class mix */}
            <div />
            {view.per.map((p, i) => {
              const cm = classMetres[i], tot = cm.reduce((a, b) => a + b, 0)
              const mean = p.coarse.length ? p.coarse.reduce((s, r) => s + sc.get(r) * r.length, 0) / Math.max(1, p.coarse.reduce((s, r) => s + r.length, 0)) : 0
              return (
                <Link key={p.h.data.hole} href={`/admin/geology/holes/${p.h.data.hole}`} style={{ display: 'grid', gap: 4, textDecoration: 'none', paddingBottom: 8 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: T.text, textAlign: 'center' }}>{p.h.data.hole}</span>
                  <span style={{ ...num, fontSize: 11.5, color: T.muted, textAlign: 'center' }}>{sc.fmt(mean)}{m === 'rqd' ? '%' : m === 'ff' ? ' /m' : ''} avg</span>
                  <span aria-label={sc.classes.map(k => `${k.name} ${Math.round(cm[k.i])} m`).join(', ')} style={{ display: 'flex', height: 6, borderRadius: 2, overflow: 'hidden', background: 'rgba(var(--x-ov),0.06)' }}>
                    {[4, 3, 2, 1, 0].map(i2 => cm[i2] > 0 && <span key={i2} style={{ width: `${(cm[i2] / Math.max(1, tot)) * 100}%`, background: RAMP[i2] }} />)}
                  </span>
                </Link>
              )
            })}

            {/* depth axis */}
            <div style={{ position: 'relative', height: H }}>
              {Array.from({ length: Math.floor(view.deepest / 25) + 1 }, (_, k) => k * 25).map(d => (
                <span key={d} style={{ ...num, position: 'absolute', right: 4, top: (d / STEP) * PX - 7, fontSize: 10.5, color: T.faint }}>{d} m</span>
              ))}
            </div>

            {/* one strip a hole */}
            {view.per.map(p => (
              <div key={p.h.data.hole} style={{ position: 'relative', height: H, borderRadius: 4, background: 'repeating-linear-gradient(45deg, rgba(var(--x-ov),0.04) 0 4px, transparent 4px 8px)', boxShadow: `inset 0 0 0 1px ${T.border}` }}>
                {Array.from({ length: Math.floor(view.deepest / 25) + 1 }, (_, k) => k * 25).map(d => (
                  <span key={d} aria-hidden style={{ position: 'absolute', left: -6, right: -6, top: (d / STEP) * PX, borderTop: `1px dashed ${T.line}` }} />
                ))}
                {p.coarse.map(r => {
                  const v = sc.get(r), k = sc.of(v)
                  return (
                    <div key={r.from}
                      onMouseEnter={e => { const wrap = e.currentTarget.closest('[data-rm]') as HTMLElement; const box = wrap.getBoundingClientRect(); const b = e.currentTarget.getBoundingClientRect(); setHover({ hole: p.h.data.hole, r, x: b.left - box.left + wrap.scrollLeft + b.width / 2, y: b.top - box.top + wrap.scrollTop }) }}
                      style={{
                        position: 'absolute', left: 0, right: 0, top: (r.from / STEP) * PX, height: Math.max(2, ((r.to - r.from) / STEP) * PX - 1),
                        background: RAMP[k], opacity: 0.45 + 0.55 * Math.min(1, r.length / STEP), borderRadius: 2,
                        fontSize: 9.5, lineHeight: `${PX - 1}px`, textAlign: 'center', color: INK[k], fontFamily: num.fontFamily, overflow: 'hidden', cursor: 'default',
                      }}>{values ? sc.fmt(v) : ''}</div>
                  )
                })}
              </div>
            ))}
          </div>

          {hover && (
            <div role="tooltip" style={{ position: 'absolute', left: hover.x, top: hover.y, transform: 'translate(-50%, calc(-100% - 8px))', pointerEvents: 'none', zIndex: 5, background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 10px', boxShadow: '0 10px 28px rgba(var(--x-shadow),0.25)', minWidth: 170 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text }}>{hover.hole} · {hover.r.from}–{hover.r.to} m</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '2px 12px', marginTop: 5, fontSize: 12, color: T.muted }}>
                <span>RQD</span><span style={{ ...num, color: T.text, textAlign: 'right' }}>{Math.round(hover.r.rqd)}% · {rqdClass(hover.r.rqd)}</span>
                <span>Fractures</span><span style={{ ...num, color: T.text, textAlign: 'right' }}>{hover.r.ff.toFixed(1)} /m</span>
                <span>GSI</span><span style={{ ...num, color: T.text, textAlign: 'right' }}>{Math.round(hover.r.gsi)} · {gsiClass(hover.r.gsi)}</span>
                <span>Weathering</span><span style={{ color: T.text, textAlign: 'right' }}>{WEATHERING[Math.round(hover.r.weathering)] ?? '—'}</span>
                <span>Recovery</span><span style={{ ...num, color: T.text, textAlign: 'right' }}>{pct(hover.r.recovery)}</span>
              </div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12, fontSize: 12, color: T.faint }}>
          <span><span aria-hidden style={{ display: 'inline-block', width: 12, height: 10, verticalAlign: 'middle', marginRight: 6, background: 'repeating-linear-gradient(45deg, rgba(var(--x-ov),0.15) 0 3px, transparent 3px 6px)', border: `1px solid ${T.border}` }} />No photo</span>
          <span>Paler step: less than 5 m of core photographed in it</span>
          <span>Click a hole for its full log</span>
        </div>
      </Card>

      <Card title="Ground domains" subtitle="Runs of the same RQD class, at least 10 m long. A starting point for design sections; the geologist confirms the boundaries." pad={false}>
        <div style={{ padding: '14px 16px', display: 'grid', gap: 10, borderBottom: `1px solid ${T.border}` }}>
          {view.per.map(p => {
            const d0 = view.deepest
            return (
              <div key={p.h.data.hole} style={{ display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr)', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: T.text }}>{p.h.data.hole}</span>
                <div style={{ position: 'relative', height: 16, borderRadius: 3, background: 'rgba(var(--x-ov),0.05)' }}>
                  {p.doms.map((d, i) => {
                    const k = SCALES.rqd.of(d.t.rqd)
                    return <span key={i} title={`${d.from.toFixed(0)}–${d.to.toFixed(0)} m · ${d.cls} · RQD ${Math.round(d.t.rqd)}%`} style={{ position: 'absolute', top: 0, bottom: 0, left: `${(d.from / d0) * 100}%`, width: `${((d.to - d.from) / d0) * 100}%`, background: RAMP[k], borderRight: '2px solid var(--x-card)' }} />
                  })}
                </div>
              </div>
            )
          })}
          <div style={{ display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr)', gap: 10 }}>
            <span />
            <div style={{ position: 'relative', height: 14 }}>
              {Array.from({ length: Math.floor(view.deepest / 50) + 1 }, (_, k) => k * 50).map(d => (
                <span key={d} style={{ ...num, position: 'absolute', left: `${(d / view.deepest) * 100}%`, transform: 'translateX(-50%)', fontSize: 10.5, color: T.faint }}>{d} m</span>
              ))}
            </div>
          </div>
        </div>
        <details>
          <summary style={{ cursor: 'pointer', padding: '12px 16px', fontSize: 13, fontWeight: 600, color: T.text }}>Every domain as a table · {view.per.reduce((n, p) => n + p.doms.length, 0)} rows</summary>
        <Table>
          <thead><tr><th style={th}>Hole</th><th style={th}>From–to</th><th style={th}>Rock quality</th><th style={thR}>RQD</th><th style={thR}>Fract. /m</th><th style={thR}>GSI</th><th style={th}>Weathering</th></tr></thead>
          <tbody>
            {view.per.flatMap(p => p.doms.map((d, i) => (
              <tr key={`${p.h.data.hole}-${i}`} style={{ borderBottom: rowLine }}>
                <td style={tdStrong}>{i === 0 ? p.h.data.hole : ''}</td>
                <td style={{ ...td, ...num, fontSize: 12.5 }}>{d.from.toFixed(0)}–{d.to.toFixed(0)} m</td>
                <td style={td}><span aria-hidden style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: RAMP[SCALES.rqd.of(d.t.rqd)], marginRight: 6 }} />{d.cls}</td>
                <td style={tdR}>{pct(d.t.rqd)}</td>
                <td style={tdR}>{d.t.ff.toFixed(1)}</td>
                <td style={tdR}>{Math.round(d.t.gsi)} · {gsiClass(d.t.gsi)}</td>
                <td style={td}>{WEATHERING[Math.round(d.t.weathering)]}</td>
              </tr>
            )))}
          </tbody>
        </Table>
        </details>
      </Card>

      <Card title="Structure by hole" subtitle="Joint sets found from the angle of each natural break to the core axis." pad={false}>
        <Table>
          <thead><tr><th style={th}>Hole</th><th style={th}>Joint sets (angle to core axis)</th><th style={thR}>Discing zones</th><th style={thR}>JRC proxy</th></tr></thead>
          <tbody>
            {view.per.map(p => (
              <tr key={p.h.data.hole} style={{ borderBottom: rowLine }}>
                <td style={tdStrong}>{p.h.data.hole}</td>
                <td style={td}>{p.sets.length ? <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>{p.sets.map((s, i) => <span key={i} style={{ ...num, fontSize: 12, padding: '1px 7px', borderRadius: 5, border: `1px solid ${T.border}`, color: T.text }}>{s.mean}° ± {s.sd}° <span style={{ color: T.faint }}>n={s.n}</span></span>)}</span> : '—'}</td>
                <td style={tdR}>{p.discs || '—'}</td>
                <td style={tdR}>{p.h.total!.jrc.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <p style={{ margin: 0, fontSize: 12, color: T.faint, fontFamily: display }}><span style={{ ...eyebrow }}>Method</span> RQD, fractures and weathering are measured on the tray photos; see How it works for what the photo step can and cannot see.</p>
    </Page>
  )
}
