'use client'

import { useMemo, useState } from 'react'
import { useAllHoles, useCore, className } from '../../../../lib/core/store'
import { intervals } from '../../../../lib/core/geotech'
import { EXPORT_COLUMNS, toCsv, download, type ExportRow } from '../../../../lib/core/export'
import { Page, PageHead, Card, Btn, Seg, Empty, Note, Table, th, td, rowLine, T } from '../../../components/kit'
import { DemoPhotos } from '../../../components/core-ui'
import { useGeo } from '../../../../lib/core/geo-data'
import { MINERALS, mean } from '../../../../lib/core/downhole'

/* EXPORT — interval tables for geology software (Leapfrog, Micromine,
 * Datamine, acQuire): HOLE_ID, FROM, TO, then the measures. */

type Step = '0.5' | '1' | '2' | '3'

export default function ExportCore() {
  const all = useAllHoles()
  const { review } = useCore()
  const [pick, setPick] = useState<Record<string, boolean>>({})
  const [step, setStep] = useState<Step>('1')
  const [cols, setCols] = useState<string[]>(EXPORT_COLUMNS.map(c => c.key))
  const [onlyChecked, setOnlyChecked] = useState(false)
  const { data: geo } = useGeo()
  const joined = useMemo(() => {
    if (!geo.ready) return null
    const d = geo.domains('all')
    const idx: Record<string, { i: number; from: number; to: number }[]> = {}
    geo.metres.forEach((m, i) => { (idx[m.hole] = idx[m.hole] ?? []).push({ i, from: m.from, to: m.to }) })
    return (hole: string, a: number, b: number) => {
      const xs = (idx[hole] ?? []).filter(x => x.to > a + 1e-6 && x.from < b - 1e-6)
      if (!xs.length) return {}
      const modeOf = (v: string[]) => { const c: Record<string, number> = {}; v.forEach(x => { c[x] = (c[x] ?? 0) + 1 }); return Object.entries(c).sort((p, q) => q[1] - p[1])[0]?.[0] }
      const mid = (a + b) / 2
      return {
        lith: geo.logs[hole]?.find(x => mid >= x.from && mid < x.to)?.lith,
        domain: modeOf(xs.map(x => `${d.labels[x.i] + 1}. ${d.names[d.labels[x.i]]}`)),
        au: mean(xs.map(x => geo.metres[x.i].assay.Au)),
        ucs: geo.pred ? mean(xs.map(x => geo.pred!.ucs[x.i])) : undefined,
        mineral: geo.pred ? modeOf(xs.map(x => MINERALS[geo.pred!.mineral[x.i]])) : undefined,
        veins: geo.veins.filter(v => v.hole === hole && v.from >= a && v.from < b).length,
      }
    }
  }, [geo])

  const chosen = all.list.filter(h => pick[h.data.hole] ?? true)
  const rows: ExportRow[] = useMemo(() => chosen.flatMap(h => {
    const rs = step === '1' ? h.rows : intervals(h.flat, +step)
    return rs.map(r => ({
      ...r, hole: h.data.hole, className: className(review, r.cls), ...(joined?.(h.data.hole, r.from, r.to) ?? {}),
      checked: h.trays.filter(t => t.from < r.to && t.usedTo > r.from).every(t => !!review.checked[t.id]),
    }))
  }).filter(r => !onlyChecked || r.checked), [chosen, step, review, onlyChecked, joined])

  if (!all.ready) return <Page><Card><Empty>Loading the core photos…</Empty></Card></Page>
  const checkedRows = rows.filter(r => r.checked).length
  const fixed = ['HOLE_ID', 'FROM', 'TO']

  return (
    <Page>
      <PageHead question="Export the core logs"
        answer={<>{rows.length.toLocaleString('en-US')} intervals from {chosen.length} holes, {checkedRows.toLocaleString('en-US')} of them fully checked by a geologist. CSV with HOLE_ID, FROM, TO first, so Leapfrog, Micromine, Datamine and acQuire read it as an interval table.</>}
        right={<><DemoPhotos /><Btn kind="primary" disabled={!rows.length} onClick={() => download(`xplorix_core_${step}m.csv`, toCsv(rows, cols))}>Download CSV</Btn></>} />

      <Card title="Holes">
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {all.list.map(h => (
            <label key={h.data.hole} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: T.text, cursor: 'pointer' }}>
              <input type="checkbox" checked={pick[h.data.hole] ?? true} onChange={e => setPick({ ...pick, [h.data.hole]: e.target.checked })} />{h.data.hole}
            </label>
          ))}
        </div>
      </Card>

      <Card title="Interval and rows">
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
          <Seg<Step> value={step} onChange={setStep} options={[{ value: '0.5', label: '0.5 m' }, { value: '1', label: '1 m' }, { value: '2', label: '2 m' }, { value: '3', label: '3 m' }]} />
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: T.text, cursor: 'pointer' }}>
            <input type="checkbox" checked={onlyChecked} onChange={e => setOnlyChecked(e.target.checked)} />Only intervals a geologist has checked
          </label>
        </div>
      </Card>

      <Card title="Columns" pad={false}>
        <Table>
          <thead><tr><th style={th}>Include</th><th style={th}>Column</th><th style={th}>What it is</th><th style={th}>First row</th></tr></thead>
          <tbody>
            {EXPORT_COLUMNS.map(c => (
              <tr key={c.key} style={{ borderBottom: rowLine }}>
                <td style={td}><input type="checkbox" aria-label={c.key} disabled={fixed.includes(c.key)} checked={cols.includes(c.key)} onChange={e => setCols(e.target.checked ? EXPORT_COLUMNS.map(x => x.key).filter(k => k === c.key || cols.includes(k)) : cols.filter(k => k !== c.key))} /></td>
                <td style={{ ...td, fontFamily: 'ui-monospace, monospace', color: T.text }}>{c.key}</td>
                <td style={td}>{c.label}</td>
                <td style={td}>{rows[0] ? String(c.get(rows[0])) : ''}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Note>GSI and JRC are proxies from the photo: aperture and infill cannot be seen, so they are taken as typical. STATUS says SUGGESTED until every tray in the interval is checked. LITH_LOGGED, DOMAIN, AU_GPT, UCS_PRED_MPA and MINERAL come from the downhole data (sample data in the demo).</Note>
    </Page>
  )
}
