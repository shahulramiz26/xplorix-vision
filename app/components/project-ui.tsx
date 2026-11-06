'use client'

import { ReactNode, useState } from 'react'
import { FileText, Share2, PencilLine, Truck, Users, Target, Banknote, CircleDot } from 'lucide-react'
import { HOLE_SIZES, type ProjectEvent, type ProjectEventKind, type ProjectStatus, type HolePlan, PROJECT_STATUS_LABEL } from '../../lib/costing-store'
import { when, nextHoleId, PLAN_STATUS_LABEL, type ProjectHole, type PlanStatus } from '../../lib/projects'
import { T, tint, Status, Modal, Btn, Field, DepthBar, Table, Empty, inputStyle, th, thR, td, tdR, tdStrong, rowLine, type Tone } from './kit'

/* ==========================================================================
 * PROJECT PIECES — shared by the contractor's and the client's Projects
 * screens, so a hole, a change or a status looks the same on both sides.
 * ========================================================================== */

const STATUS_TONE: Record<ProjectStatus, Tone> = { active: 'good', 'on-hold': 'warn', completed: 'neutral' }
export function ProjectStatusTag({ status }: { status: ProjectStatus }) {
  return <Status tone={STATUS_TONE[status]}>{PROJECT_STATUS_LABEL[status]}</Status>
}

export function SharedTag({ shared, client }: { shared: boolean; client?: string }) {
  return shared
    ? <Status tone="info">Shared with {client ?? 'the client'}</Status>
    : <Status tone="neutral">Not shared</Status>
}

const HOLE_TONE: Record<PlanStatus, Tone> = {
  planned: 'neutral', drilling: 'info', closed: 'warn', submitted: 'warn', approved: 'good', invoiced: 'good',
}

// ── CHANGES ───────────────────────────────────────────────────────────────

const KIND_ICON: Record<ProjectEventKind, React.ElementType> = {
  created: FileText, shared: Share2, details: PencilLine, status: CircleDot, rig: Truck, crew: Users, hole: Target, rates: Banknote,
}

/* The project's change list. `viewer` decides the wording of who did it and
 * which lines count as new; `fresh` are the ids that were unseen when the
 * screen opened, so they stay marked while it is being read. */
export function ChangeList({ events, viewer, otherSide, fresh, limit, showSeen }: {
  events: ProjectEvent[]; viewer: 'contractor' | 'owner'; otherSide: string
  fresh?: Set<string>; limit?: number; showSeen?: boolean
}) {
  const list = limit ? events.slice(0, limit) : events
  if (!list.length) return <Empty>Nothing has changed yet.</Empty>
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {list.map((e, i) => {
        const Icon = KIND_ICON[e.kind]
        const mine = e.by === viewer
        const isNew = fresh?.has(e.id)
        return (
          <li key={e.id} style={{ display: 'flex', gap: 13, padding: '13px 18px', borderTop: i ? `1px solid ${T.line}` : undefined, background: isNew ? tint(T.orange, 6) : undefined }}>
            <span aria-hidden style={{
              width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: tint(mine ? T.faint : T.blue, 14), color: mine ? T.muted : T.blue,
            }}><Icon size={15} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{e.title}</span>
                {isNew && <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', color: T.orange }}>NEW</span>}
              </div>
              {e.detail && <div style={{ fontSize: 12.5, color: T.muted, marginTop: 2, lineHeight: 1.5 }}>{e.detail}</div>}
              <div style={{ fontSize: 11.5, color: T.faint, marginTop: 4 }}>
                {when(e.at)} · {mine ? 'You' : otherSide}
                {showSeen && mine && <> · {(viewer === 'contractor' ? e.seenByOwner : e.seenByContractor) ? `seen by ${otherSide}` : `not yet seen by ${otherSide}`}</>}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// ── HOLES ─────────────────────────────────────────────────────────────────

export function HolesTable({ holes, client, contractor = 'Contractor', action, href, detail }: {
  holes: ProjectHole[]; client: string; contractor?: string
  action?: (h: ProjectHole) => ReactNode
  href?: (h: ProjectHole) => string | undefined
  detail?: (h: ProjectHole) => ReactNode          // a second line under the hole number
}) {
  if (!holes.length) return <Empty>No holes on the plan yet.</Empty>
  return (
    <Table>
      <thead><tr>
        <th style={th}>Hole</th><th style={th}>Status</th><th style={th}>Depth</th><th style={th}>Rig</th><th style={th}>Put on the plan by</th>
        {action && <th style={thR} />}
      </tr></thead>
      <tbody>
        {holes.map(h => {
          const link = href?.(h)
          return (
            <tr key={h.id} style={{ borderBottom: rowLine }}>
              <td style={tdStrong}>
                {link ? <a href={link} style={{ color: T.text, textDecoration: 'none' }}>{h.id}</a> : h.id}
                {(h.holeSize || h.note) && <div style={{ fontSize: 11.5, fontWeight: 400, color: T.faint, marginTop: 2, whiteSpace: 'normal', maxWidth: 260 }}>{[h.holeSize, h.note].filter(Boolean).join(' · ')}</div>}
                {detail && <div style={{ fontSize: 11.5, fontWeight: 400, marginTop: 2, whiteSpace: 'normal', maxWidth: 300 }}>{detail(h)}</div>}
              </td>
              <td style={td}><Status tone={HOLE_TONE[h.status]}>{PLAN_STATUS_LABEL[h.status]}</Status></td>
              <td style={td}>
                {h.status === 'planned'
                  ? <span style={{ color: T.muted }}><span style={{ color: T.text, fontWeight: 600 }}>{h.planned} m</span> planned</span>
                  : <DepthBar drilled={h.drilled} planned={h.planned} width={170} />}
              </td>
              <td style={td}>{h.rig ?? '—'}</td>
              <td style={td}>{h.by === 'owner' ? client : contractor}</td>
              {action && <td style={tdR}>{action(h)}</td>}
            </tr>
          )
        })}
      </tbody>
    </Table>
  )
}

/* Add one hole or several in one go. Used by the contractor ("Add holes"), by
 * the client ("Release holes") and inside the new-project steps; the numbering
 * carries on from the last hole on the project. */
export interface NewHole { id: string; plan: HolePlan }
export interface HoleRow { id: string; depth: string; size: string; note: string }

export interface HoleSeries { mine: string[]; start: string }
export function blankHoleRow(taken: string[], rows: HoleRow[], size: string, series?: HoleSeries): HoleRow {
  const last = rows[rows.length - 1]
  return { id: nextHoleId(taken, rows.map(r => r.id.trim().toUpperCase()), series?.mine, series?.start), depth: last?.depth ?? '', size: last?.size ?? size, note: '' }
}
export function holeRowProblems(rows: HoleRow[], taken: string[]): string[] {
  const ids = rows.map(r => r.id.trim().toUpperCase())
  const used = taken.map(t => t.toUpperCase())
  return rows.map((r, i) => {
    const id = ids[i]
    if (!id) return 'Give the hole a number'
    if (used.includes(id)) return `${id} is already used on this or another project`
    if (ids.indexOf(id) !== i) return `${id} is entered twice`
    if (!(parseFloat(r.depth) > 0)) return 'Enter the planned depth'
    return ''
  })
}
export function rowsToHoles(rows: HoleRow[]): NewHole[] {
  return rows.map(r => ({
    id: r.id.trim().toUpperCase(),
    plan: { plannedDepth: parseFloat(r.depth), holeSize: r.size, note: r.note.trim() || undefined },
  }))
}

export function HoleRowsEditor({ rows, setRows, taken, defaultSize, allowEmpty, series }: {
  rows: HoleRow[]; setRows: (r: HoleRow[]) => void; taken: string[]; defaultSize: string; allowEmpty?: boolean; series?: HoleSeries
}) {
  const set = (i: number, p: Partial<HoleRow>) => setRows(rows.map((r, j) => j === i ? { ...r, ...p } : r))
  const problems = holeRowProblems(rows, taken)
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {rows.map((r, i) => (
        <div key={i}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ width: 130 }}>
              <Field label="Hole number"><input value={r.id} onChange={e => set(i, { id: e.target.value })} style={inputStyle} /></Field>
            </div>
            <div style={{ width: 150 }}>
              <Field label="Planned depth, m">
                <input type="number" min={1} value={r.depth} placeholder="e.g. 200" onChange={e => set(i, { depth: e.target.value })} style={{ ...inputStyle, textAlign: 'right' }} />
              </Field>
            </div>
            <div style={{ width: 90 }}>
              <Field label="Size">
                <select value={r.size} onChange={e => set(i, { size: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
                  {HOLE_SIZES.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </Field>
            </div>
            <div style={{ flex: '1 1 180px' }}>
              <Field label="Note, if any"><input value={r.note} placeholder="e.g. infill, northern lode" onChange={e => set(i, { note: e.target.value })} style={inputStyle} /></Field>
            </div>
            {(rows.length > 1 || allowEmpty) && (
              <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))}
                style={{ padding: '9px 6px', background: 'none', border: 'none', color: T.faint, cursor: 'pointer', fontSize: 12.5, fontFamily: 'inherit' }}>Remove</button>
            )}
          </div>
          {problems[i] && (r.depth !== '' || i < rows.length - 1 || !problems[i].startsWith('Enter')) && (
            <div style={{ fontSize: 12, color: T.amber, marginTop: 5 }}>{problems[i]}</div>
          )}
        </div>
      ))}
      <div><Btn size="sm" onClick={() => setRows([...rows, blankHoleRow(taken, rows, defaultSize, series)])}>{rows.length ? 'Add another hole' : 'Add a hole'}</Btn></div>
    </div>
  )
}

export function AddHolesModal({ title, subtitle, taken, defaultSize, confirm, series, onClose, onAdd }: {
  title: string; subtitle: string; taken: string[]; defaultSize: string; confirm: string; series?: HoleSeries
  onClose: () => void; onAdd: (holes: NewHole[]) => void
}) {
  const [rows, setRows] = useState<HoleRow[]>(() => [blankHoleRow(taken, [], defaultSize, series)])
  const ok = rows.length > 0 && holeRowProblems(rows, taken).every(p => !p)
  return (
    <Modal title={title} subtitle={subtitle} width={780} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn>
        <Btn kind="primary" disabled={!ok} onClick={() => onAdd(rowsToHoles(rows))}>{confirm}{rows.length > 1 ? ` (${rows.length})` : ''}</Btn></>}>
      <HoleRowsEditor rows={rows} setRows={setRows} taken={taken} defaultSize={defaultSize} series={series} />
    </Modal>
  )
}

/* A label and its value, for the "who, where, since when" facts of a project. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: T.faint, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13.5, color: T.text, lineHeight: 1.45 }}>{children}</div>
    </div>
  )
}
