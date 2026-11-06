'use client'

import { useMemo, useRef, useState, type ReactNode } from 'react'
import { ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import {
  fileToRows, findHeader, guessColumns, guessAngle, guessUnits, profileFor, readImport, num as readNumber, SURVEY_TOOLS,
  type SurveyReading, type SurveyProfile, type AngleConvention, type ImportRow,
} from '../../lib/survey'
import { uid, nowStamp, money } from '../../lib/costing-store'
import type { DepthBand } from '../../lib/plan'
import { day } from '../../lib/projects'
import {
  T, Btn, Modal, Field, Note, Status, Table, Empty, Legend, Tip, inputStyle, th, thR, td, tdR, tdStrong, rowLine, axisTick, gridStroke, tint,
} from './kit'

/* ==========================================================================
 * SURVEY AND SPEED BY DEPTH, ON THE HOLE'S PAGE
 *
 *   SurveyTable        every reading, with where it came from and its status;
 *                      readings waiting are approved or rejected here
 *   AddReadingsModal   type readings in
 *   ImportSurveyModal  read a file from any survey tool
 *   DepthPanel         speed and cost per metre down the hole (drilling only)
 * ========================================================================== */

const r1 = (v: number) => Math.round(v * 10) / 10
const fmtAz = (v: number) => `${v.toFixed(1)}°`
const fmtDip = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}°`
const SOURCE: Record<SurveyReading['source'], string> = { log: 'Shift log', manual: 'Typed in', import: 'File' }
const link: React.CSSProperties = { background: 'none', border: 'none', padding: 0, color: T.orange, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }

// ── the readings ──────────────────────────────────────────────────────────

export function SurveyTable({ readings, editable, onDecide, onDelete }: {
  readings: SurveyReading[]
  editable: boolean
  onDecide?: (rs: SurveyReading[], status: 'approved' | 'rejected', note?: string) => void
  onDelete?: (r: SurveyReading) => void
}) {
  const [rejecting, setRejecting] = useState<SurveyReading | null>(null)
  const [why, setWhy] = useState('')
  const waiting = readings.filter(r => r.status === 'pending')
  if (!readings.length) return <Empty>No survey readings on this hole yet. Add them from the shift log, type them in, or import the survey tool&apos;s file.</Empty>
  return (
    <>
      {editable && waiting.length > 1 && onDecide && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 16px', background: tint(T.blue, 7), borderBottom: rowLine, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: T.text }}>{waiting.length} readings are waiting to be checked.</span>
          <Btn size="sm" kind="primary" onClick={() => onDecide(waiting, 'approved')}>Approve all {waiting.length}</Btn>
        </div>
      )}
      <Table>
        <thead><tr>
          <th style={thR}>Depth</th><th style={thR}>Azimuth</th><th style={thR}>Dip</th><th style={th}>Tool</th><th style={th}>From</th><th style={th}>Taken</th><th style={th}>Status</th>
          {editable && <th style={thR} />}
        </tr></thead>
        <tbody>
          {readings.map(r => (
            <tr key={r.id} style={{ borderBottom: rowLine, opacity: r.status === 'rejected' ? 0.6 : 1 }}>
              <td style={{ ...tdR, color: T.text, fontWeight: 600 }}>{r1(r.depth)} m</td>
              <td style={tdR}>{fmtAz(r.azimuth)}</td>
              <td style={tdR}>{fmtDip(r.dip)}</td>
              <td style={td}>{r.tool ?? '—'}</td>
              <td style={{ ...td, whiteSpace: 'normal', minWidth: 140 }}>{SOURCE[r.source]}{r.file ? ` · ${r.file}` : ''}<div style={{ fontSize: 11.5, color: T.faint }}>{r.by}</div></td>
              <td style={td}>{r.takenOn ? day(r.takenOn) : day(r.at.slice(0, 10))}</td>
              <td style={{ ...td, whiteSpace: 'normal' }}>
                {r.status === 'approved' ? <Status tone="good">Approved</Status> : r.status === 'rejected' ? <Status tone="bad">Rejected</Status> : <Status tone="info">To check</Status>}
                {r.status === 'rejected' && r.note && <div style={{ fontSize: 11.5, color: T.faint, marginTop: 3 }}>{r.note}</div>}
              </td>
              {editable && (
                <td style={tdR}>
                  <span style={{ display: 'inline-flex', gap: 12 }}>
                    {r.status !== 'approved' && onDecide && <button style={link} onClick={() => onDecide([r], 'approved')}>Approve</button>}
                    {r.status === 'pending' && onDecide && <button style={{ ...link, color: T.muted }} onClick={() => { setRejecting(r); setWhy('') }}>Reject</button>}
                    {r.status === 'approved' && onDecide && <button style={{ ...link, color: T.muted }} onClick={() => { setRejecting(r); setWhy('') }}>Reject</button>}
                    {r.source !== 'log' && onDelete && <button style={{ ...link, color: T.faint }} onClick={() => onDelete(r)}>Delete</button>}
                  </span>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </Table>
      {rejecting && onDecide && (
        <Modal title={`Reject the reading at ${r1(rejecting.depth)} m`} width={460} onClose={() => setRejecting(null)}
          subtitle="It stays in the list, crossed out, and no longer draws the hole path."
          footer={<><Btn onClick={() => setRejecting(null)}>Cancel</Btn><Btn kind="primary" onClick={() => { onDecide([rejecting], 'rejected', why.trim() || undefined); setRejecting(null) }}>Reject</Btn></>}>
          <Field label="Why, if you know" hint="For example: magnetic interference near the casing, or a misread depth.">
            <input value={why} onChange={e => setWhy(e.target.value)} autoFocus style={inputStyle} />
          </Field>
        </Modal>
      )}
    </>
  )
}

// ── typing readings in ────────────────────────────────────────────────────

interface Row { depth: string; az: string; dip: string; tool: string }
const blankRow = (tool = ''): Row => ({ depth: '', az: '', dip: '', tool })

export function AddReadingsModal({ hole, project, by, taken, drilled, onClose, onSave }: {
  hole: string; project: string; by: string; taken: number[]; drilled: number
  onClose: () => void; onSave: (rs: SurveyReading[]) => void
}) {
  const [rows, setRows] = useState<Row[]>([blankRow()])
  const [date, setDate] = useState(nowStamp().slice(0, 10))
  const set = (i: number, p: Partial<Row>) => setRows(rs => rs.map((r, j) => j === i ? { ...r, ...p } : r))
  const problem = (r: Row, i: number) => {
    const d = parseFloat(r.depth), a = parseFloat(r.az), p = parseFloat(r.dip)
    if (r.depth === '' && r.az === '' && r.dip === '') return ''
    if (!(d >= 0)) return 'Enter the depth'
    if (!(a >= 0 && a <= 360)) return 'Azimuth is 0 to 360'
    if (!(p >= -90 && p <= 90)) return 'Dip is −90 (straight down) to 90'
    if (taken.some(t => Math.abs(t - d) < 0.05)) return `A reading at ${r1(d)} m is already on this hole`
    if (rows.some((o, j) => j < i && Math.abs(parseFloat(o.depth) - d) < 0.05)) return 'Same depth twice'
    return ''
  }
  const filled = rows.filter(r => r.depth !== '' || r.az !== '' || r.dip !== '')
  const ok = filled.length > 0 && rows.every((r, i) => !problem(r, i))
  return (
    <Modal title={`Add survey readings to ${hole}`} width={720} onClose={onClose}
      subtitle="Dip is the angle from flat, negative going down: −60 means 60° below flat. Readings you type are approved as you save them."
      footer={<><Btn onClick={onClose}>Cancel</Btn>
        <Btn kind="primary" disabled={!ok} onClick={() => onSave(filled.map(r => ({
          id: uid('sv'), hole, project, depth: r1(parseFloat(r.depth)), azimuth: parseFloat(r.az), dip: parseFloat(r.dip),
          tool: r.tool || undefined, takenOn: date, source: 'manual', by, at: nowStamp(), status: 'approved', decidedBy: by, decidedAt: nowStamp(),
        })))}>Save {filled.length > 1 ? `${filled.length} readings` : 'reading'}</Btn></>}>
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ width: 200 }}><Field label="Taken on"><input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} /></Field></div>
        {rows.map((r, i) => (
          <div key={i}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.6fr auto', gap: 10, alignItems: 'end' }}>
              <Field label="Depth, m"><input type="number" value={r.depth} onChange={e => set(i, { depth: e.target.value })} placeholder={drilled ? `0–${r1(drilled)}` : ''} style={{ ...inputStyle, textAlign: 'right' }} aria-label={`Depth ${i + 1}`} /></Field>
              <Field label="Azimuth, °"><input type="number" value={r.az} onChange={e => set(i, { az: e.target.value })} placeholder="e.g. 45" style={{ ...inputStyle, textAlign: 'right' }} aria-label={`Azimuth ${i + 1}`} /></Field>
              <Field label="Dip, °"><input type="number" value={r.dip} onChange={e => set(i, { dip: e.target.value })} placeholder="e.g. −60" style={{ ...inputStyle, textAlign: 'right' }} aria-label={`Dip ${i + 1}`} /></Field>
              <Field label="Tool">
                <select value={r.tool} onChange={e => set(i, { tool: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="">Not stated</option>
                  {SURVEY_TOOLS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <button type="button" onClick={() => setRows(rs => rs.length > 1 ? rs.filter((_, j) => j !== i) : [blankRow()])} style={{ ...link, color: T.faint, padding: '9px 2px' }}>Remove</button>
            </div>
            {problem(r, i) && <div style={{ fontSize: 12, color: T.amber, marginTop: 5 }}>{problem(r, i)}</div>}
          </div>
        ))}
        <div><Btn size="sm" onClick={() => setRows(rs => [...rs, blankRow(rs[rs.length - 1]?.tool)])}>Add another reading</Btn></div>
      </div>
    </Modal>
  )
}

// ── importing a file ──────────────────────────────────────────────────────

const ANGLES: { value: AngleConvention; label: string; hint: string }[] = [
  { value: 'dip-negative', label: 'Dip, negative down', hint: '−60 = 60° below flat' },
  { value: 'dip-positive', label: 'Dip, positive down', hint: '60 = 60° below flat' },
  { value: 'inclination', label: 'Inclination from vertical', hint: '0 = straight down, 30 = 60° below flat' },
]

export function ImportSurveyModal({ holes, profiles, existing, by, oneHole, onClose, onSave }: {
  holes: Record<string, { drilled: number; planned?: number; project: string }>
  profiles: SurveyProfile[]
  existing: { hole: string; depth: number }[]
  by: string
  oneHole?: string              // opened from a hole's page: rows with no hole column go to this hole
  onClose: () => void
  onSave: (rs: SurveyReading[], profile: SurveyProfile | null) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<string[][]>([])
  const [error, setError] = useState('')
  const [headerAt, setHeaderAt] = useState(0)
  const [cols, setCols] = useState<SurveyProfile['columns']>({ hole: '', depth: '', azimuth: '', dip: '' })
  const [units, setUnits] = useState<'m' | 'ft'>('m')
  const [angle, setAngle] = useState<AngleConvention>('dip-negative')
  const [profileName, setProfileName] = useState('')
  const [matched, setMatched] = useState<SurveyProfile | undefined>()
  const [forHole, setForHole] = useState(oneHole ?? '')
  const [approveNow, setApproveNow] = useState(false)

  const load = async (f: File) => {
    setError(''); setFile(f)
    try {
      const all = await fileToRows(f)
      if (all.length < 2) { setError('The file has no rows to read.'); setRows([]); return }
      const h = findHeader(all)
      const head = all[h]
      const saved = profileFor(profiles, head)
      const g = guessColumns(head)
      const c = saved?.columns ?? { hole: g.hole ?? '', depth: g.depth ?? '', azimuth: g.azimuth ?? '', dip: g.dip ?? '', tool: g.tool, date: g.date }
      setRows(all); setHeaderAt(h); setCols(c); setMatched(saved)
      setUnits(saved?.units ?? guessUnits(c.depth) ?? 'm')
      // The angle convention: what the profile says, or what the header and the numbers suggest.
      let a: AngleConvention = saved?.angle ?? guessAngle(c.dip) ?? 'dip-negative'
      if (!saved && a === 'dip-negative' && c.dip) {
        const i = head.indexOf(c.dip)
        const vals = all.slice(h + 1).map(r => readNumber(r[i])).filter(v => isFinite(v))
        if (vals.length && vals.every(v => v >= 0)) a = vals.every(v => v <= 45) ? 'inclination' : 'dip-positive'
      }
      setAngle(a)
      setProfileName(saved?.name ?? f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 40))
    } catch (e) { setError(e instanceof Error ? e.message : 'The file could not be read.'); setRows([]) }
  }

  const head = rows[headerAt] ?? []
  const ready = !!cols.depth && !!cols.azimuth && !!cols.dip && (!!cols.hole || !!forHole)
  const parsed: ImportRow[] = useMemo(() => !ready ? [] : readImport(rows, headerAt, { columns: cols, units, angle }, {
    holes: Object.fromEntries(Object.entries(holes).map(([k, v]) => [k, { drilled: v.drilled, planned: v.planned }])),
    existing, holeOverride: cols.hole ? undefined : forHole,
  }), [ready, rows, headerAt, cols, units, angle, holes, existing, forHole])
  const good = parsed.filter(r => !r.problem)
  const bad = parsed.filter(r => r.problem)
  const holeCount = new Set(good.map(r => r.hole)).size
  const pick = (k: keyof SurveyProfile['columns'], optional = false) => (
    <select value={cols[k] ?? ''} onChange={e => setCols(c => ({ ...c, [k]: e.target.value || (optional ? undefined : '') }))} style={{ ...inputStyle, cursor: 'pointer' }} aria-label={`Column for ${k}`}>
      <option value="">{optional ? 'Not in the file' : 'Choose a column…'}</option>
      {head.map((h, i) => <option key={`${h}_${i}`} value={h}>{h || `(column ${i + 1})`}</option>)}
    </select>
  )

  const save = () => {
    const at = nowStamp()
    const readings: SurveyReading[] = good.map(r => ({
      id: uid('sv'), hole: r.hole, project: holes[r.hole]?.project ?? '', depth: r.depth, azimuth: r.azimuth, dip: r.dip,
      tool: r.tool, takenOn: r.takenOn, source: 'import', file: file?.name, by, at,
      status: approveNow ? 'approved' : 'pending', ...(approveNow ? { decidedBy: by, decidedAt: at } : {}),
    }))
    const name = profileName.trim()
    const profile: SurveyProfile | null = name ? { id: matched?.id ?? uid('sp'), name, columns: cols, units, angle } : null
    onSave(readings, profile)
  }

  return (
    <Modal title="Import a survey file" width={920} onClose={onClose}
      subtitle="Any survey tool's export: IMDEX, Reflex, Devico, a gyro contractor's sheet or your own spreadsheet. CSV, TXT or Excel (.xlsx)."
      footer={<><Btn onClick={onClose}>Cancel</Btn>
        <Btn kind="primary" disabled={!good.length} onClick={save}>{good.length ? `Add ${good.length} ${good.length === 1 ? 'reading' : 'readings'}${holeCount > 1 ? ` on ${holeCount} holes` : ''}` : 'Add readings'}</Btn></>}>
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input ref={fileRef} type="file" accept=".csv,.txt,.tsv,.xlsx,.xlsm,text/csv" style={{ display: 'none' }} aria-label="Survey file"
            onChange={e => { const f = e.target.files?.[0]; if (f) void load(f); e.target.value = '' }} />
          <Btn kind={file ? 'ghost' : 'primary'} onClick={() => fileRef.current?.click()}>{file ? 'Choose another file' : 'Choose the file'}</Btn>
          {file && <span style={{ fontSize: 13, color: T.text }}>{file.name} · {Math.max(0, rows.length - headerAt - 1)} rows</span>}
          {matched && <Status tone="good">Layout recognised: {matched.name}</Status>}
        </div>
        {error && <Note tone="bad">{error}</Note>}

        {rows.length > 0 && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
              <Field label="Hole number">{pick('hole', true)}</Field>
              <Field label="Depth">{pick('depth')}</Field>
              <Field label="Azimuth">{pick('azimuth')}</Field>
              <Field label="Dip or inclination">{pick('dip')}</Field>
              <Field label="Tool (optional)">{pick('tool', true)}</Field>
              <Field label="Date (optional)">{pick('date', true)}</Field>
            </div>
            {!cols.hole && (
              <div style={{ maxWidth: 320 }}>
                <Field label="The file has no hole column. Every row is for hole" hint="A file for one hole often has no hole number in its rows.">
                  <select value={forHole} onChange={e => setForHole(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="">Choose the hole…</option>
                    {Object.keys(holes).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </Field>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 200px) minmax(220px, 1fr)', gap: 12 }}>
              <Field label="Depths are in">
                <select value={units} onChange={e => setUnits(e.target.value as 'm' | 'ft')} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="m">Metres</option><option value="ft">Feet (turned into metres)</option>
                </select>
              </Field>
              <Field label="The angle column is" hint={ANGLES.find(a => a.value === angle)?.hint}>
                <select value={angle} onChange={e => setAngle(e.target.value as AngleConvention)} style={{ ...inputStyle, cursor: 'pointer' }}>
                  {ANGLES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </Field>
            </div>

            {ready && angle === 'dip-negative' && parsed.length > 1 && parsed.filter(r => isFinite(r.dip)).every(r => r.dip > 0) && (
              <Note tone="warn">Every dip in this file is positive, which reads as the hole going <b>up</b>. Most tools that write dip as a positive number mean downward: choose &ldquo;Dip, positive down&rdquo; above unless these holes really are drilled upward.</Note>
            )}
            {ready && (
              <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', borderBottom: rowLine }}>
                  <span style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>{good.length} ready</span>
                  {bad.length > 0 && <span style={{ fontSize: 13, color: T.amber }}>{bad.length} will be left out</span>}
                  {good.some(r => r.note) && <span style={{ fontSize: 13, color: T.muted }}>{good.filter(r => r.note).length} to look at</span>}
                </div>
                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                  <Table>
                    <thead><tr><th style={th}>Row</th><th style={th}>Hole</th><th style={thR}>Depth</th><th style={thR}>Azimuth</th><th style={thR}>Dip</th><th style={th}>Tool</th><th style={th}>Check</th></tr></thead>
                    <tbody>
                      {parsed.slice(0, 400).map(r => (
                        <tr key={r.line} style={{ borderBottom: rowLine, opacity: r.problem ? 0.7 : 1 }}>
                          <td style={td}>{r.line}</td><td style={tdStrong}>{r.hole || '—'}</td>
                          <td style={tdR}>{isFinite(r.depth) ? `${r.depth} m` : '—'}</td><td style={tdR}>{isFinite(r.azimuth) ? fmtAz(r.azimuth) : '—'}</td><td style={tdR}>{isFinite(r.dip) ? fmtDip(r.dip) : '—'}</td>
                          <td style={td}>{r.tool ?? '—'}</td>
                          <td style={{ ...td, whiteSpace: 'normal', minWidth: 200 }}>
                            {r.problem ? <span style={{ color: T.amber }}>{r.problem}</span> : r.note ? <span style={{ color: T.muted }}>{r.note}</span> : <span style={{ color: T.green }}>✓ Ready</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) minmax(200px, 1fr)', gap: 14, alignItems: 'start' }}>
              <Field label="Save this layout as" hint="The next file with the same columns is read without matching. Leave empty not to save it.">
                <input value={profileName} onChange={e => setProfileName(e.target.value)} placeholder="e.g. IMDEX gyro export" style={inputStyle} />
              </Field>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: T.text, cursor: 'pointer', paddingTop: 22 }}>
                <input type="checkbox" checked={approveNow} onChange={e => setApproveNow(e.target.checked)} style={{ marginTop: 2 }} />
                <span>Approve them now<div style={{ fontSize: 12, color: T.faint, marginTop: 2 }}>For a file the geologist has already checked. Otherwise they arrive as &ldquo;to check&rdquo;.</div></span>
              </label>
            </div>
          </>
        )}
        {!rows.length && !error && (
          <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.6 }}>
            XPLORIX reads the columns by their names (Hole ID, BHID, Depth, MD, Azimuth, Azi, Dip, Inclination and the like) and
            shows every row before anything is saved. A row for a hole it does not know, a depth already surveyed, or an impossible angle is left out and
            the reason shown.
          </div>
        )}
      </div>
    </Modal>
  )
}

// ── down the hole ─────────────────────────────────────────────────────────

/* Speed and cost per metre, band by band. Drilling only: tray photos and
 * what the core says belong to XPLORIX Core. `cost` is false for a login
 * that may not see costs. */
export function DepthPanel({ bands, step, cost = true, right }: {
  bands: DepthBand[]; step: number; cost?: boolean; right?: ReactNode
}) {
  if (!bands.length) return <Empty>Nothing drilled on this hole yet.</Empty>
  const chart = bands.map(b => ({ depth: `${b.from}`, rop: b.rop, cpm: cost ? b.cpm : null }))
  const maxRop = Math.max(...bands.map(b => b.rop ?? 0), 0.01)
  const maxCpm = Math.max(...bands.map(b => b.cpm ?? 0), 1)
  const ropAvg = (() => { const m = bands.reduce((s, b) => s + b.metres, 0), h = bands.reduce((s, b) => s + b.drillHours, 0); return h ? m / h : 0 })()
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={chart} margin={{ top: 10, right: cost ? 4 : 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={gridStroke} vertical={false} />
            <XAxis dataKey="depth" tick={axisTick} tickLine={false} axisLine={{ stroke: T.border }} tickFormatter={(v: string) => `${v} m`} interval="preserveStartEnd" minTickGap={18} />
            <YAxis yAxisId="r" tick={axisTick} tickLine={false} axisLine={false} width={40} />
            {cost && <YAxis yAxisId="c" orientation="right" tick={axisTick} tickLine={false} axisLine={false} width={58} tickFormatter={(v: number) => `SAR ${Math.round(v / 100) / 10}k`} />}
            <Tooltip content={<Tip names={{ rop: 'Metres an hour', cpm: 'Cost per metre SAR' }} />} />
            <Bar yAxisId="r" dataKey="rop" fill={T.bar} maxBarSize={22} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            {cost && <Line yAxisId="c" dataKey="cpm" stroke={T.orangeD} strokeWidth={2} dot={{ r: 2.5 }} connectNulls isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <Legend items={[{ color: T.bar, label: 'Metres an hour on bottom' }, ...(cost ? [{ color: T.orangeD, label: 'Cost per metre', line: true }] : [])]} />
          {right}
        </div>
      </div>

      <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `90px minmax(120px, 1fr) ${cost ? 'minmax(120px, 1fr) ' : ''}minmax(140px, 1fr)`, gap: 0, fontSize: 11.5, fontWeight: 600, color: T.faint, padding: '9px 12px', borderBottom: rowLine, background: tint(T.text, 3) }}>
          <span>Depth</span><span>Metres an hour</span>{cost && <span>Cost per metre</span>}<span>Ground · size</span>
        </div>
        {bands.map(b => {
          const slow = b.rop != null && b.rop < ropAvg * 0.75
          return (
            <div key={b.from} style={{ display: 'grid', gridTemplateColumns: `90px minmax(120px, 1fr) ${cost ? 'minmax(120px, 1fr) ' : ''}minmax(140px, 1fr)`, alignItems: 'center', padding: '7px 12px', borderBottom: rowLine, fontSize: 12.5, color: T.muted, minHeight: 44 }}>
              <span style={{ color: T.text, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{b.from}–{b.to} m</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 12 }}>
                <span style={{ flex: 1, height: 8, background: tint(T.text, 6), borderRadius: 4, overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${((b.rop ?? 0) / maxRop) * 100}%`, background: slow ? T.amber : T.bar, borderRadius: 4 }} /></span>
                <span style={{ width: 38, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: slow ? T.amber : T.text }}>{b.rop != null ? b.rop.toFixed(2) : '—'}</span>
              </span>
              {cost && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 12 }}>
                  <span style={{ flex: 1, height: 8, background: tint(T.text, 6), borderRadius: 4, overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${((b.cpm ?? 0) / maxCpm) * 100}%`, background: T.orangeD, borderRadius: 4 }} /></span>
                  <span style={{ width: 64, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.text }}>{b.cpm != null ? money(b.cpm) : '—'}</span>
                </span>
              )}
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[b.ground, b.size].filter(Boolean).join(' · ') || (b.stopHours ? `${r1(b.stopHours)} h stopped` : '—')}</span>
            </div>
          )
        })}
        <div style={{ padding: '8px 12px', fontSize: 11.5, color: T.faint }}>Every {step} m. A band drilled a quarter or more slower than the hole&apos;s {ropAvg.toFixed(2)} m an hour is marked in amber.{cost ? ' Cost per metre shares each rig-day’s cost over the metres it drilled, as Finance does.' : ''}</div>
      </div>
    </div>
  )
}
