'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useCosting } from '../../../../../lib/costing-store'
import { useCore, useHole, overridesOf, holeOfTray } from '../../../../../lib/core/store'
import { flatten, intervals, totals, gapId } from '../../../../../lib/core/geotech'
import { rateOf } from '../../../../../lib/core/drill-link'
import { Page, PageHead, Card, Btn, Grid, Tile, Status, Empty, Note, Split, T, tint } from '../../../../components/kit'
import { TrayPhoto, CoreLegend, pct, dep, depthAtX, type Sel, DemoPhotos } from '../../../../components/core-ui'

/* TRAY CHECK — the geologist's main working screen.
 *
 * The photo with every break and gap the photo step found. Click one to say
 * what it really is; click "Add a break" and then the photo to add one it
 * missed. Every change is kept with who and when, and the numbers update. */

export default function TrayCheck() {
  const { id } = useParams<{ id: string }>()
  const trayId = decodeURIComponent(id)
  const hole = holeOfTray(trayId)
  const router = useRouter()
  const { state } = useCosting()
  const core = useCore()
  const { review } = core
  const h = useHole(hole)
  const [sel, setSel] = useState<Sel>(null)
  const [adding, setAdding] = useState<'natural' | 'handling' | null>(null)
  const [show, setShow] = useState({ rows: true, breaks: true, gaps: true })

  const i = h.trays.findIndex(t => t.id === trayId)
  const tray = i >= 0 ? h.trays[i] : undefined
  const prev = i > 0 ? h.trays[i - 1] : undefined
  const next = i >= 0 && i < h.trays.length - 1 ? h.trays[i + 1] : undefined
  const nextToCheck = h.trays.slice(i + 1).find(t => !review.checked[t.id]) ?? h.trays.find(t => !review.checked[t.id] && t.id !== trayId)

  // keyboard: N natural, H handling, X not a break, arrows move tray
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'ArrowRight' && next) router.push(`/admin/geology/trays/${next.id}`)
      if (e.key === 'ArrowLeft' && prev) router.push(`/admin/geology/trays/${prev.id}`)
      if (e.key === 'Escape') { setSel(null); setAdding(null) }
      if (!tray || sel?.kind !== 'break') return
      const b = tray.breaks.find(x => x.id === sel.id)
      if (!b) return
      const k = e.key.toLowerCase()
      const v = k === 'n' ? 'natural' : k === 'h' ? 'handling' : k === 'x' ? 'none' : null
      if (v) core.setBreak(b.id, tray.id, v === b.kind ? null : v, `Break at ${b.at.toFixed(2)} m: ${v === 'none' ? 'not a break' : v}`)
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [next, prev, router, sel, tray, core])

  const stats = useMemo(() => {
    if (!tray) return null
    const f = flatten([tray], overridesOf(review))
    const t = totals(intervals(f, Math.max(0.5, tray.usedTo - tray.from)))
    return { t, f }
  }, [tray, review])

  const shifts = useMemo(() => {
    if (!tray) return []
    return state.shiftLogs.filter(l => l.holeNumber === hole && l.meterEnd != null && l.meterStart != null && l.meterEnd > tray.from && l.meterStart < tray.usedTo)
      .sort((a, b) => (a.meterStart ?? 0) - (b.meterStart ?? 0))
  }, [state.shiftLogs, hole, tray])

  if (!h.data) return <Page><Card><Empty>Loading tray {trayId}…</Empty></Card></Page>
  if (!tray || !stats) return <Page><Card><Empty>No tray {trayId}. <Link href={`/admin/geology/holes/${hole}`}>Back to {hole}</Link></Empty></Card></Page>

  const checked = review.checked[tray.id]
  const unsure = tray.breaks.filter(b => b.confidence === 'low' && !review.breaks[b.id]).length
  const changes = review.changes.filter(c => c.tray === tray.id)

  // what is selected
  const b = sel?.kind === 'break' ? tray.breaks.find(x => x.id === sel.id) : undefined
  const g = sel?.kind === 'gap' ? tray.spans.find(s => s.kind !== 'core' && gapId(tray.id, s.row, s.x0) === sel.id) : undefined
  const a = sel?.kind === 'added' ? review.added.find(x => x.id === sel.id) : undefined
  const bv = b ? (review.breaks[b.id] ?? b.kind) : undefined
  const gv = g ? (review.gaps[gapId(tray.id, g.row, g.x0)] ?? 'lost') : undefined

  const add = (row: number, x: number) => {
    if (!adding) return
    const at = depthAtX(tray, row, x)
    if (at == null) return
    core.addBreak({ id: `${tray.id}-a${Date.now()}`, tray: tray.id, row, x: Math.round(x), at: +at.toFixed(3), alpha: 90, kind: adding })
    setAdding(null)
  }

  const choice = (label: string, on: boolean, onClick: () => void, key?: string) => (
    <button onClick={onClick} style={{
      padding: '9px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
      border: `1px solid ${on ? T.orange : T.border}`, background: on ? tint(T.orange, 14) : T.card, color: T.text,
      display: 'flex', justifyContent: 'space-between', gap: 10,
    }}>{label}{key && <span style={{ color: T.faint, fontWeight: 500, fontSize: 11.5 }}>{key}</span>}</button>
  )

  return (
    <Page>
      <div style={{ fontSize: 12.5, color: T.faint }}>
        <Link href="/admin/geology/review" style={{ color: T.faint, textDecoration: 'none' }}>Review trays</Link> / <Link href={`/admin/geology/holes/${hole}`} style={{ color: T.faint, textDecoration: 'none' }}>{hole}</Link> / Tray {tray.no}
      </div>
      <PageHead question={`${hole} tray ${tray.no}: ${dep(tray.from, tray.usedTo)}`}
        tone={checked ? 'good' : 'warn'}
        answer={checked
          ? <>Checked by {checked.by} on {checked.at.replace('T', ' ')}. Recovery {pct(stats.t.recovery)}, RQD {pct(stats.t.rqd)}.</>
          : <>Suggested by the photo step, not yet checked. {unsure ? <b>{unsure} {unsure === 1 ? 'break it is unsure of is' : 'breaks it is unsure of are'} marked with a dot.</b> : 'No unsure breaks.'} Click a line or a shaded gap to correct it.</>}
        right={<>
          <DemoPhotos />
          <Btn href={prev ? `/admin/geology/trays/${prev.id}` : undefined} disabled={!prev}>← Tray {prev?.no ?? ''}</Btn>
          <Btn href={next ? `/admin/geology/trays/${next.id}` : undefined} disabled={!next}>Tray {next?.no ?? ''} →</Btn>
        </>} />

      <Split left={2.2} right={1}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <Card title="Tray photo" subtitle={adding ? `Click on the core where the ${adding === 'natural' ? 'natural fracture' : 'handling break'} is. Esc to stop.` : 'Click a break or gap to correct it. Keys: N natural · H handling · X not a break · ← → trays.'}
            right={<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Btn size="sm" kind={adding === 'natural' ? 'primary' : 'ghost'} onClick={() => { setAdding(adding === 'natural' ? null : 'natural'); setSel(null) }}>+ Natural break</Btn>
              <Btn size="sm" kind={adding === 'handling' ? 'primary' : 'ghost'} onClick={() => { setAdding(adding === 'handling' ? null : 'handling'); setSel(null) }}>+ Handling break</Btn>
            </div>}>
            <TrayPhoto tray={tray} sel={sel} onSelect={setSel} onAdd={add} adding={!!adding} show={show} />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
              <CoreLegend />
              <div style={{ display: 'flex', gap: 12, fontSize: 12, color: T.muted }}>
                {(['rows', 'breaks', 'gaps'] as const).map(k => (
                  <label key={k} style={{ display: 'flex', gap: 5, alignItems: 'center', cursor: 'pointer' }}>
                    <input type="checkbox" checked={show[k]} onChange={e => setShow({ ...show, [k]: e.target.checked })} />{k === 'rows' ? 'Row depths' : k === 'breaks' ? 'Breaks' : 'Gaps'}
                  </label>
                ))}
              </div>
            </div>
          </Card>

          <Grid min={140}>
            <Tile label="Recovery" value={pct(stats.t.recovery)} tone={stats.t.recovery >= 95 ? 'good' : stats.t.recovery >= 85 ? 'warn' : 'bad'} />
            <Tile label="RQD" value={pct(stats.t.rqd)} tone={stats.t.rqd >= 75 ? 'good' : stats.t.rqd >= 50 ? 'warn' : 'bad'} />
            <Tile label="Natural breaks" value={stats.t.natural} note={`${stats.t.handling} in handling`} />
            <Tile label="Fractures /m" value={stats.t.ff.toFixed(1)} />
          </Grid>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <Card title={b ? `Break at ${b.at.toFixed(2)} m` : g ? `Gap ${dep(g.from, g.to)}` : a ? `Added break at ${a.at.toFixed(2)} m` : 'Nothing selected'}>
            {!sel && <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.6 }}>Click a coloured line (a break) or a shaded box (a gap) on the photo.<br />Orange dots: breaks the photo step is unsure of. Yellow dots: changed by a geologist.</div>}
            {b && (
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.6 }}>
                  Photo step said <b style={{ color: T.text }}>{b.kind === 'natural' ? 'natural fracture' : 'handling break'}</b> ({b.confidence} confidence). Angle to core axis {b.alpha}°, roughness (JRC proxy) {b.jrc}{b.stain ? `, iron staining ${Math.round(b.stain * 100)}%` : ''}.
                </div>
                {choice('Natural fracture', bv === 'natural', () => core.setBreak(b.id, tray.id, b.kind === 'natural' ? null : 'natural', `Break at ${b.at.toFixed(2)} m: natural`), 'N')}
                {choice('Broken in handling', bv === 'handling', () => core.setBreak(b.id, tray.id, b.kind === 'handling' ? null : 'handling', `Break at ${b.at.toFixed(2)} m: handling`), 'H')}
                {choice('Not a break', bv === 'none', () => core.setBreak(b.id, tray.id, 'none', `Break at ${b.at.toFixed(2)} m: not a break`), 'X')}
                {review.breaks[b.id] && <Btn size="sm" onClick={() => core.setBreak(b.id, tray.id, null, `Break at ${b.at.toFixed(2)} m: back to the photo step's call`)}>Undo my change</Btn>}
              </div>
            )}
            {g && (
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 12.5, color: T.muted }}>{((g.to - g.from) * 100).toFixed(0)} cm of tray with no core seen.</div>
                {(['lost', 'sampled', 'core'] as const).map(v => choice(
                  v === 'lost' ? 'Core lost in drilling' : v === 'sampled' ? 'Taken for samples' : 'There is core (photo misread)', gv === v,
                  () => core.setGap(gapId(tray.id, g.row, g.x0), tray.id, v === 'lost' ? null : v, `Gap ${dep(g.from, g.to)}: ${v === 'lost' ? 'lost' : v === 'sampled' ? 'sampled' : 'core present'}`)))}
                <div style={{ fontSize: 11.5, color: T.faint }}>Sampled core counts as recovered and is left out of RQD.</div>
              </div>
            )}
            {a && (
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 12.5, color: T.muted }}>Added by the geologist as a {a.kind === 'natural' ? 'natural fracture' : 'handling break'}.</div>
                <Btn onClick={() => { core.removeAdded(a.id); setSel(null) }}>Remove this break</Btn>
              </div>
            )}
          </Card>

          <Card title="Sign off">
            {checked ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <Status tone="good">Checked · {checked.by}</Status>
                <Btn size="sm" onClick={() => core.uncheck(tray.id)}>Open it again</Btn>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                <Btn kind="primary" onClick={() => { core.check(tray.id); if (nextToCheck) router.push(`/admin/geology/trays/${nextToCheck.id}`) }}>Mark checked{nextToCheck ? ', next tray' : ''}</Btn>
                <div style={{ fontSize: 11.5, color: T.faint }}>A checked tray shows as CHECKED in the logs and exports. Until then every number is shown as suggested.</div>
              </div>
            )}
          </Card>

          <Card title="From the drilling record" subtitle="Shift logs that drilled this tray's depths." pad={false}>
            {shifts.length === 0 && <Empty>No shift log covers these depths.</Empty>}
            {shifts.map((l, k) => (
              <div key={l.id} style={{ padding: '10px 18px', borderTop: k ? `1px solid ${T.line}` : undefined, fontSize: 12.5, color: T.muted, lineHeight: 1.55 }}>
                <div style={{ color: T.text, fontWeight: 600 }}>{l.meterStart}–{l.meterEnd} m · {l.date} {l.shift.toLowerCase()}</div>
                {l.driller} · {l.rig} · {rateOf(l).toFixed(2)} m/h · driller recovery {l.metresDrilled ? pct(Math.min(100, (l.coreRecovery / l.metresDrilled) * 100)) : '—'}
                {l.downtimeHours ? <> · <span style={{ color: T.amber }}>{l.downtimeHours} h stopped: {l.downtimeReason}</span></> : null}
                <div>{l.formationType}</div>
              </div>
            ))}
          </Card>

          <Card title="Changes to this tray" pad={false}>
            {changes.length === 0 && <Empty>No changes yet.</Empty>}
            {changes.slice(0, 12).map((c, k) => (
              <div key={k} style={{ padding: '8px 18px', borderTop: k ? `1px solid ${T.line}` : undefined, fontSize: 12, color: T.muted }}>
                <span style={{ color: T.text }}>{c.what}</span><br />{c.by} · {c.at.replace('T', ' ')}
              </div>
            ))}
          </Card>
        </div>
      </Split>

      <Note>Photo {tray.takenAt.replace('T', ' ')} by {tray.takenBy}{tray.source === 'upload' ? ' · added in the browser' : ''}. The photo step measures the photo; it does not see the rock. Thin cracks smaller than a pixel on the photo can be missed: add them here.</Note>
    </Page>
  )
}
