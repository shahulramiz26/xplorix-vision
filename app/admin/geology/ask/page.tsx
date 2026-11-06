'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { AskView, useGeoEngine, Md } from '../../../components/ai'
import { useGeo } from '../../../../lib/core/geo-data'
import { Page, PageHead, Card, Empty, T, tint } from '../../../components/kit'

/* XPLORIX AI — GEOLOGY. Ask anything about the core, in plain words, with
 * the morning brief beside it. The same engine answers from the Ask XPLORIX
 * button on every Geology screen. */

const READS: [string, string][] = [
  ['Tray photos', '/admin/geology/holes'], ["Geologist's logs", '/admin/geology/check-logs'], ['Veins', '/admin/geology/veins'],
  ['Assays and geophysics', '/admin/geology/data'], ['Domains', '/admin/geology/domains'], ['Predictions', '/admin/geology/predict'],
  ['Televiewer', '/admin/geology/structures'], ['RC chips', '/admin/geology/chips'], ['Shift logs that drilled each metre', '/admin/logs/drill'],
]

export default function GeologyAi() {
  const engine = useGeoEngine()
  const { data } = useGeo()
  const brief = useMemo(() => data.ready ? engine.answer('Give me the geology brief') : null, [data.ready]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Page>
      <PageHead question="Ask XPLORIX about the core"
        answer="Questions in plain words, answered from every photo, log, assay and shift on record. Each answer lists what it read, so it can be checked, and can draft the note that follows from it." />
      <div className="xpl-split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        <AskView inline engine={engine} first={null} onFirst={() => {}} onClose={() => {}} />
        <div style={{ display: 'grid', gap: 16 }}>
          <Card title="This morning" right={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: T.orange }}><Sparkles size={12} />XPLORIX AI</span>}>
            {!brief ? <Empty>Reading the core record…</Empty> : (
              <div style={{ display: 'grid', gap: 8 }}>
                {brief.text.slice(1).map((p, i) => <p key={i} style={{ margin: 0, fontSize: 13, color: T.muted, lineHeight: 1.6 }}><Md text={p} /></p>)}
              </div>
            )}
          </Card>
          <Card title="What it reads">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {READS.map(([l, h]) => <Link key={l} href={h} style={{ padding: '4px 10px', borderRadius: 99, border: `1px solid ${T.border}`, fontSize: 12, color: T.text, textDecoration: 'none', background: tint(T.faint, 6) }}>{l}</Link>)}
            </div>
            <p style={{ margin: '12px 0 0', fontSize: 12, color: T.faint, lineHeight: 1.55 }}>Press Ctrl J on any Geology screen to ask from there.</p>
          </Card>
        </div>
      </div>
    </Page>
  )
}
