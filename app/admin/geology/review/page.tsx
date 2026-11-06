'use client'

import { Suspense, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useAllHoles, useCore } from '../../../../lib/core/store'
import { Page, PageHead, Card, Seg, Btn, Empty, Status, Table, th, thR, td, tdR, tdStrong, rowLine, T } from '../../../components/kit'
import { TrayPhoto, dep, DemoPhotos } from '../../../components/core-ui'

/* REVIEW TRAYS — the queue. Trays with the most doubt first, so a
 * geologist's time goes where the photo step is least sure. */

type Show = 'waiting' | 'checked' | 'all'

export default function ReviewPage() {
  return <Suspense fallback={null}><ReviewQueue /></Suspense>
}

function ReviewQueue() {
  const all = useAllHoles()
  const { review } = useCore()
  const params = useSearchParams()
  const [hole, setHole] = useState<string>(params.get('hole') ?? 'all')
  const [show, setShow] = useState<Show>('waiting')

  const rows = useMemo(() => all.list.flatMap(h => h.trays.map(t => {
    const unsure = t.breaks.filter(b => b.confidence === 'low' && !review.breaks[b.id]).length
    const gaps = t.spans.filter(s => s.kind === 'empty').reduce((s, x) => s + (x.to - x.from), 0)
    const doubt = unsure + gaps * 10 + (t.rowConfidence === 'low' ? 5 : 0) + t.notes.length * 2
    return { t, hole: h.data.hole, unsure, gaps, doubt, checked: review.checked[t.id] }
  })), [all.list, review])

  const list = rows
    .filter(r => hole === 'all' || r.hole === hole)
    .filter(r => show === 'all' || (show === 'checked' ? !!r.checked : !r.checked))
    .sort((a, b) => show === 'waiting' ? b.doubt - a.doubt : a.hole.localeCompare(b.hole) || a.t.from - b.t.from)
  const waiting = rows.filter(r => !r.checked).length

  if (!all.ready) return <Page><Card><Empty>Loading the core photos…</Empty></Card></Page>
  const first = list[0]

  return (
    <Page>
      <PageHead question="Which trays need a geologist?"
        tone={waiting ? 'warn' : 'good'}
        answer={waiting ? <>{waiting} of {rows.length} trays are not yet checked. They are sorted with the most doubt first: unsure breaks, missing core, hard-to-read rows.</> : 'Every tray is checked.'}
        right={<><DemoPhotos />{first && !first.checked && <Btn kind="primary" href={`/admin/geology/trays/${first.t.id}`}>Start with the first</Btn>}</>} />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <Seg<Show> value={show} onChange={setShow} options={[{ value: 'waiting', label: `To check · ${waiting}` }, { value: 'checked', label: `Checked · ${rows.length - waiting}` }, { value: 'all', label: 'All' }]} />
        <select value={hole} onChange={e => setHole(e.target.value)} aria-label="Hole"
          style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, color: T.text, fontSize: 13 }}>
          <option value="all">All holes</option>
          {all.list.map(h => <option key={h.data.hole} value={h.data.hole}>{h.data.hole}</option>)}
        </select>
      </div>

      <Card pad={false}>
        {list.length === 0 && <Empty>Nothing here.</Empty>}
        {list.length > 0 && (
          <Table>
            <thead><tr><th style={th}>Photo</th><th style={th}>Hole · tray</th><th style={th}>Depth</th><th style={thR}>Unsure breaks</th><th style={thR}>No core</th><th style={th}>Rows read</th><th style={th}>Status</th><th style={th} /></tr></thead>
            <tbody>
              {list.slice(0, 80).map(r => (
                <tr key={r.t.id} style={{ borderBottom: rowLine }}>
                  <td style={{ ...td, width: 150 }}><Link href={`/admin/geology/trays/${r.t.id}`}><div style={{ width: 140 }}><TrayPhoto tray={r.t} compact show={{ rows: false, breaks: false, gaps: true }} /></div></Link></td>
                  <td style={tdStrong}>{r.hole} · tray {r.t.no}</td>
                  <td style={td}>{dep(r.t.from, r.t.usedTo)}</td>
                  <td style={{ ...tdR, color: r.unsure ? T.amber : T.muted }}>{r.unsure || '—'}</td>
                  <td style={{ ...tdR, color: r.gaps > 0.2 ? T.red : T.muted }}>{r.gaps > 0.005 ? `${(r.gaps * 100).toFixed(0)} cm` : '—'}</td>
                  <td style={td}>{r.t.rowConfidence === 'low' ? <Status tone="warn">Check the rows</Status> : 'Clear'}</td>
                  <td style={td}>{r.checked ? <Status tone="good">Checked</Status> : <Status tone="neutral">Suggested</Status>}</td>
                  <td style={{ ...td, textAlign: 'right' }}><Link href={`/admin/geology/trays/${r.t.id}`} style={{ color: T.orange, fontWeight: 600, textDecoration: 'none' }}>{r.checked ? 'Open' : 'Check'} →</Link></td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {list.length > 80 && <div style={{ padding: '10px 18px', fontSize: 12, color: T.faint }}>Showing the first 80 of {list.length}. Pick a hole to narrow it.</div>}
      </Card>
    </Page>
  )
}
