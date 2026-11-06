'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { OctagonX, ArrowRight } from 'lucide-react'
import { useCosting } from '../../../../lib/costing-store'
import { TODAY, addDays } from '../../../../lib/inventory-store'
import { auditRecord, missingShifts, supervisorScores } from '../../../../lib/log-checks'
import {
  T, tint, Page, PageHead, Card, Tile, Grid, Seg, Status, Table, Empty, Meter,
  th, thR, td, tdR, tdStrong, rowLine,
} from '../../../components/kit'
import { IntelTabs } from '../shared'

/* ==========================================================================
 * DRILL LOG CHECK — can the record be trusted?
 *
 * The shift log is where every figure in XPLORIX starts. This screen runs
 * the same checks the form runs as a shift is typed, over every shift in the
 * period: what cannot be right, what is unusual and was never explained,
 * which shifts are missing, and how each supervisor's logs stand.
 * ========================================================================== */

type Period = '14' | '30' | 'all'
const shortDate = (d: string) => {
  const [, m, dd] = d.split('-').map(Number)
  return `${dd} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]}`
}

const RULES: { level: 'stop' | 'warn'; text: string }[] = [
  { level: 'stop', text: 'Meter start must be where the hole stood after the last shift on it' },
  { level: 'stop', text: 'A closed hole, or a hole another rig is on in the same shift, cannot be logged' },
  { level: 'stop', text: 'Engine hours cannot exceed the shift; drilling hours cannot exceed engine hours' },
  { level: 'stop', text: 'The hour meter only goes up' },
  { level: 'stop', text: 'A driller cannot be on two rigs in one shift' },
  { level: 'stop', text: 'Metres need drilling hours; bit runs must sit inside the shift’s metres' },
  { level: 'warn', text: 'Speed far from the rig’s own normal in the same ground and size; more than its best shift ever' },
  { level: 'warn', text: 'Every figure identical to a recent shift (a copied log)' },
  { level: 'warn', text: 'Hour meter movement and engine hours disagree; fuel far above the rig’s litres an engine hour' },
  { level: 'warn', text: 'Core under 80%, or 100% shift after shift; ground unlike every hole nearby at that depth' },
  { level: 'warn', text: 'Client standby with no note; a breakdown with no maintenance log' },
  { level: 'warn', text: 'Drilled past the planned depth; the next shift does not start where this one ended' },
  { level: 'warn', text: 'The same driller on day and night; crew far from the usual; logged days late; changed after the client approved' },
]

export default function DrillLogCheck() {
  const { state } = useCosting()
  const [period, setPeriod] = useState<Period>('14')
  const since = period === 'all' ? undefined : addDays(TODAY, -(Number(period) - 1))
  const audits = useMemo(() => auditRecord(state, { since }), [state, since])
  const missing = useMemo(() => missingShifts(state, since ?? '0000-01-01', TODAY).filter(m => !(m.date === TODAY && m.shift === 'Night')), [state, since])
  const scores = useMemo(() => supervisorScores(audits), [audits])

  const stops = audits.filter(a => a.checks.some(c => c.level === 'stop'))
  const open = audits.filter(a => a.checks.length > 0)
  const clean = audits.filter(a => a.checks.length === 0)
  const explained = audits.filter(a => a.explained > 0)
  const edited = audits.filter(a => a.log.editedAt || (a.log.history?.length ?? 0) > 0)
  const pct = audits.length ? Math.round((clean.length / audits.length) * 100) : 100

  const kinds: Record<string, { title: string; level: 'stop' | 'warn'; n: number }> = {}
  open.forEach(a => a.checks.forEach(c => {
    const k = c.id.replace(/^bit-\d+-/, 'bit-')
    const e = (kinds[k] ||= { title: c.title, level: c.level, n: 0 }); e.n += 1
  }))
  const byKind = Object.entries(kinds).sort((a, b) => (a[1].level === b[1].level ? b[1].n - a[1].n : a[1].level === 'stop' ? -1 : 1))
  const maxKind = Math.max(1, ...byKind.map(k => k[1].n))
  const list = [...open].sort((a, b) => {
    const sa = a.checks.some(c => c.level === 'stop') ? 0 : 1, sb = b.checks.some(c => c.level === 'stop') ? 0 : 1
    return sa - sb || b.log.date.localeCompare(a.log.date)
  })

  return (
    <Page>
      <IntelTabs />
      <PageHead question="Can you trust your drill logs?" tone={stops.length ? 'bad' : open.length ? 'warn' : 'good'}
        right={<Seg<Period> value={period} onChange={setPeriod} options={[{ value: '14', label: '14 days' }, { value: '30', label: '30 days' }, { value: 'all', label: 'Since the start' }]} />}
        answer={<>
          {pct}% of {audits.length} shifts pass every check.{' '}
          {stops.length ? <b style={{ color: T.text }}>{stops.length} have figures that cannot be right. </b> : null}
          {open.length - stops.length ? `${open.length - stops.length} are unusual and were never explained. ` : ''}
          {missing.length ? `${missing.length} shifts are missing.` : 'No shift is missing.'}
        </>} />

      <Grid min={170}>
        <Tile label="Pass every check" value={`${pct}%`} tone={pct >= 90 ? 'good' : pct >= 70 ? 'warn' : 'bad'} note={`${clean.length} of ${audits.length} shifts`} />
        <Tile label="Cannot be right" value={stops.length} tone={stops.length ? 'bad' : 'good'} note="Wrong in the record until corrected" />
        <Tile label="Unusual, not explained" value={open.length - stops.length} tone={open.length - stops.length ? 'warn' : 'good'} note="Saved before the checks, or without a reason" />
        <Tile label="Explained when saved" value={explained.length} note="Unusual, with the supervisor’s reason" />
        <Tile label="Missing shifts" value={missing.length} tone={missing.length ? 'warn' : 'good'} note="A rig logging around them, not in them" />
        <Tile label="Changed after saving" value={edited.length} note="Each change kept with who and when" />
      </Grid>

      <Card title={`Shifts to look at · ${open.length}`} pad={false}
        subtitle="Figures that cannot be right first, then unusual ones nobody explained. Every check reads the shift against the rest of the record.">
        {list.length === 0 ? <Empty>Every shift in this period passes every check.</Empty> : (
          <Table>
            <thead><tr><th style={th}>Shift</th><th style={th}>Supervisor</th><th style={th}>Hole</th><th style={th}>What XPLORIX found</th></tr></thead>
            <tbody>
              {list.slice(0, 60).map(a => (
                <tr key={a.log.id} style={{ borderTop: rowLine, verticalAlign: 'top' }}>
                  <td style={tdStrong}>{a.log.rig}<div style={{ fontWeight: 400, color: T.faint, fontSize: 12 }}>{shortDate(a.log.date)} · {a.log.shift.toLowerCase()}</div></td>
                  <td style={td}>{a.log.supervisor || '—'}</td>
                  <td style={td}>{a.log.holeNumber ?? (a.log.standbyMode ? 'Standby' : '—')}</td>
                  <td style={{ ...td, whiteSpace: 'normal', minWidth: 380 }}>
                    {a.checks.map(c => (
                      <div key={c.id} style={{ display: 'flex', gap: 7, marginBottom: 4, lineHeight: 1.45 }}>
                        {c.level === 'stop' ? <OctagonX size={13} style={{ color: T.red, flexShrink: 0, marginTop: 2 }} /> : <span aria-hidden style={{ color: T.amber, fontWeight: 800, width: 13, textAlign: 'center', flexShrink: 0 }}>!</span>}
                        <span style={{ color: c.level === 'stop' ? T.text : T.muted }}>{c.title}</span>
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {list.length > 60 && <div style={{ padding: '10px 18px', fontSize: 12.5, color: T.faint, borderTop: rowLine }}>Showing the first 60 of {list.length}.</div>}
        <div style={{ padding: '12px 18px', borderTop: rowLine }}>
          <Link href="/admin/logs/drill" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: T.orange, textDecoration: 'none' }}>Open the drill logs to correct them <ArrowRight size={14} /></Link>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))', gap: 16 }}>
        <Card title="What the checks find most" pad={false} subtitle="Each kind of check, and how many shifts it caught in the period.">
          {byKind.length === 0 ? <Empty>Nothing found.</Empty> : byKind.map(([k, v]) => (
            <div key={k} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(60px,120px) 34px', gap: 12, alignItems: 'center', padding: '10px 18px', borderTop: rowLine }}>
              <div style={{ fontSize: 12.5, color: T.text, lineHeight: 1.4 }}>
                <Status tone={v.level === 'stop' ? 'bad' : 'warn'}>{v.level === 'stop' ? 'Cannot be right' : 'Unusual'}</Status>{' '}
                <span style={{ color: T.muted }}>{v.title}</span>
              </div>
              <Meter value={v.n} max={maxKind} color={v.level === 'stop' ? T.red : T.amber} />
              <div style={{ ...tdR, padding: 0 }}>{v.n}</div>
            </div>
          ))}
        </Card>

        <Card title="Supervisors" pad={false} subtitle="How each supervisor’s logs stand in the period.">
          <Table>
            <thead><tr><th style={th}>Supervisor</th><th style={thR}>Shifts</th><th style={thR}>Clean</th><th style={thR}>To look at</th><th style={thR}>Explained</th><th style={thR}>Logged late</th></tr></thead>
            <tbody>
              {scores.map(s => (
                <tr key={s.name} style={{ borderTop: rowLine }}>
                  <td style={tdStrong}>{s.name}</td>
                  <td style={tdR}>{s.shifts}</td>
                  <td style={{ ...tdR, color: T.text }}>{s.shifts ? Math.round((s.clean / s.shifts) * 100) : 0}%</td>
                  <td style={{ ...tdR, color: s.open ? T.amber : T.faint }}>{s.open || '—'}</td>
                  <td style={tdR}>{s.explained || '—'}</td>
                  <td style={{ ...tdR, color: s.late ? T.amber : T.faint }}>{s.late || '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>

      {missing.length > 0 && (
        <Card title={`Missing shifts · ${missing.length}`} pad={false} subtitle="A rig that logged before and after, but not in these shifts. A missing shift is missing metres, cost and billing.">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '14px 18px' }}>
            {missing.slice(0, 80).map(m => (
              <span key={`${m.rig}${m.date}${m.shift}`} style={{ fontSize: 12, padding: '4px 9px', borderRadius: 7, background: tint(T.amber, 10), border: `1px solid ${tint(T.amber, 30)}`, color: T.text }}>
                {m.rig} · {shortDate(m.date)} {m.shift.toLowerCase()}
              </span>
            ))}
          </div>
        </Card>
      )}

      <Card title="The checks" subtitle="The same checks run in the drill log form as a shift is typed. Cannot be right: the log cannot be saved. Unusual: saved only with a reason, which stays on the log.">
        <div style={{ display: 'grid', gap: 8 }}>
          {RULES.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: T.muted, lineHeight: 1.5 }}>
              <span style={{ flexShrink: 0, width: 108 }}><Status tone={r.level === 'stop' ? 'bad' : 'warn'}>{r.level === 'stop' ? 'Cannot be right' : 'Unusual'}</Status></span>
              {r.text}
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12.5, color: T.faint, marginTop: 14, marginBottom: 0, lineHeight: 1.55 }}>
          Each rig is compared with its own record, not a fixed rule: its own speed in the same ground, its own best shift, its own fuel use. Not a trained model.
        </p>
      </Card>
    </Page>
  )
}
