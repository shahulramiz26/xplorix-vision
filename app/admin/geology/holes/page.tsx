'use client'

import Link from 'next/link'
import { useAllHoles, useCore, className } from '../../../../lib/core/store'
import { rqdClass } from '../../../../lib/core/geotech'
import { Page, PageHead, Card, Empty, Status, T } from '../../../components/kit'
import { Bar, recColour, rqdColour, pct, DemoPhotos, Swatch, classHex } from '../../../components/core-ui'

/* HOLE LOGS — one card per hole with a mini strip of rock class and RQD. */

export default function HoleLogs() {
  const all = useAllHoles()
  const { review, index } = useCore()
  if (!all.ready) return <Page><Card><Empty>Loading the core photos…</Empty></Card></Page>

  return (
    <Page>
      <PageHead question="Which hole do you want to log?"
        answer={`${all.list.length} holes have tray photos. Each log is built from the photos and the shift logs, with your corrections.`}
        right={<DemoPhotos />} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))', gap: 14 }}>
        {all.list.map(h => {
          const t = h.total!
          const max = Math.max(1, h.data.drilled)
          const top = h.rows.reduce<Record<number, number>>((m, r) => { m[r.cls] = (m[r.cls] ?? 0) + r.length; return m }, {})
          const main = Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 2)
          return (
            <Link key={h.data.hole} href={`/admin/geology/holes/${h.data.hole}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{h.data.hole}</span>
                  {h.checked === h.trays.length ? <Status tone="good">Checked</Status> : <Status tone="warn">{h.trays.length - h.checked} trays to check</Status>}
                </div>
                <div style={{ fontSize: 12.5, color: T.muted }}>{h.data.project} · {h.data.rig} · {h.data.holeSize}</div>
                {/* mini strip: rock class over RQD, full drilled depth */}
                <div title="Rock class (top) and RQD (bottom) down the hole" style={{ display: 'grid', gap: 2 }}>
                  {[0, 1].map(k => (
                    <div key={k} style={{ position: 'relative', height: 12, background: T.line, borderRadius: 3, overflow: 'hidden' }}>
                      {h.rows.map(r => (
                        <div key={r.from} style={{ position: 'absolute', top: 0, bottom: 0, left: `${(r.from / max) * 100}%`, width: `${(r.length / max) * 100 + 0.15}%`, background: k === 0 ? classHex(r.cls, index?.classes) : rqdColour(r.rqd) }} />
                      ))}
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: T.faint }}><span>0 m</span><span>{Math.round(h.data.drilled)} m</span></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '6px 10px', alignItems: 'center', fontSize: 12.5, color: T.muted }}>
                  <span>Recovery</span><Bar value={t.recovery} color={recColour(t.recovery)} w={120} /><b style={{ color: T.text }}>{pct(t.recovery)}</b>
                  <span>RQD</span><Bar value={t.rqd} color={rqdColour(t.rqd)} w={120} /><b style={{ color: T.text }}>{pct(t.rqd)}</b>
                </div>
                <div style={{ fontSize: 12, color: T.faint, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <span>{rqdClass(t.rqd)} rock · {t.ff.toFixed(1)} fractures /m</span>
                  {main.map(([c]) => <span key={c}><Swatch hex={classHex(+c, index?.classes)} size={10} /> {className(review, +c)}</span>)}
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </Page>
  )
}
