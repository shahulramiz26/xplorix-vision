'use client'

import { useMemo, useState } from 'react'
import { useCosting, loginOfContractor } from '../../../lib/costing-store'
import { TODAY } from '../../../lib/inventory-store'
import {
  reportFlags, hasProblem, contractorName, contractorOf, workOrderById, reportToDraft,
  SOURCE_LABEL, type ContractorReport, type WorkOrder, type Flag,
} from '../../../lib/contracting'
import { when } from '../../../lib/projects'
import { checkShift } from '../../../lib/log-checks'
import { T, tint, Card, Btn, Note, Modal, Field, Switch, Status, Empty, Table, inputStyle, th, thR, td, tdR, rowLine, toneColor } from '../../components/kit'
import { me, n1, shortDay, linkBtn, numInput, SourceTag } from './shared'

/* DAILY REPORTS — a contractor's shifts, before and after they are checked.
 *
 * The contractor writes his own drill log in his contractor login. Nobody here retypes it
 * and no sheet is uploaded. What arrives waits in this list, and nothing in
 * it counts toward progress, payment or the client's invoice until someone on
 * our side accepts it. */

function Flags({ flags }: { flags: Flag[] }) {
  if (!flags.length) return null
  return (
    <div style={{ display: 'grid', gap: 3, marginTop: 6 }}>
      {flags.map((f, i) => (
        <div key={i} style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.45, whiteSpace: 'normal' }}>
          <span aria-hidden style={{ color: toneColor[f.tone], fontWeight: 800, marginRight: 6 }}>{f.tone === 'info' ? '•' : f.tone === 'bad' ? '✕' : '!'}</span>{f.text}
        </div>
      ))}
    </div>
  )
}

/* The same drill log checks as every shift in the record, run on the
 * contractor's report before it is accepted. What the report check above
 * already says (depth, closed hole, plan, best shift) is not said twice. A
 * warning the contractor gave a reason for shows his reason. */
const SAID_ALREADY = new Set(['hole-continuity', 'hole-closed', 'hole-past-plan', 'speed-record'])
function xplorixFlags(state: Parameters<typeof checkShift>[0] & Parameters<typeof workOrderById>[0], r: ContractorReport, waiting: ContractorReport[]): Flag[] {
  const wo = workOrderById(state, r.workOrderId)
  const log = { ...reportToDraft(r), contractor: wo?.contractorId, workOrderId: r.workOrderId }
  const ord = (x: { date: string; shift: string }) => `${x.date}${x.shift === 'Day' ? 0 : 1}`
  const pendingOnHole = waiting.filter(x => x.id !== r.id && x.holeNumber && x.holeNumber === r.holeNumber && ord(x) < ord(r)).reduce((a, x) => a + x.metres, 0)
  const reasons = new Map((r.extra?.trust?.warnings ?? []).map(w => [w.id, w.reason]))
  return checkShift(state, log, { contractor: true, isNew: true, pendingOnHole })
    .filter(c => !SAID_ALREADY.has(c.id))
    .map(c => c.level === 'stop' ? { tone: 'bad' as const, text: `XPLORIX: ${c.title}` }
      : reasons.has(c.id) ? { tone: 'info' as const, text: `XPLORIX: ${c.title} Contractor's reason: “${reasons.get(c.id)}”` }
      : { tone: 'warn' as const, text: `XPLORIX: ${c.title}` })
}

function hoursWords(r: ContractorReport) {
  const parts = [`${r.drillingHours} h drilling`]
  if (r.standbyHours) parts.push(`${r.standbyHours} h standby`)
  if (r.breakdownHours) parts.push(`${r.breakdownHours} h breakdown`)
  return parts.join(' · ')
}

// ── accept with a change ──────────────────────────────────────────────────

function AcceptModal({ r, flags, onClose, onAccept }: {
  r: ContractorReport; flags: Flag[]; onClose: () => void
  onAccept: (a: { metres?: number; coreRecovery?: number; standbyPayable?: boolean; note?: string }) => void
}) {
  const [metres, setMetres] = useState(String(r.metres))
  const [core, setCore] = useState(String(r.coreRecovery))
  const [payable, setPayable] = useState(true)
  const [note, setNote] = useState('')
  const m = parseFloat(metres) || 0, c = parseFloat(core) || 0
  const changed = m !== r.metres || c !== r.coreRecovery
  const ok = m >= 0 && c >= 0 && c <= m + 0.001 && (!changed || note.trim().length > 0)
  return (
    <Modal title={`Check ${r.rig}, ${shortDay(r.date)} ${r.shift.toLowerCase()} shift`} width={560} onClose={onClose}
      subtitle="What you accept here is what goes into the record. The contractor's own figure is kept beside it."
      footer={<><Btn onClick={onClose}>Cancel</Btn>
        <Btn kind="primary" disabled={!ok} onClick={() => onAccept({ metres: m, coreRecovery: c, standbyPayable: r.standbyHours > 0 ? payable : undefined, note })}>Accept into the record</Btn></>}>
      <div style={{ display: 'grid', gap: 14 }}>
        {flags.length > 0 && <Note tone={hasProblem(flags) ? 'warn' : 'info'}><Flags flags={flags} /></Note>}
        {r.metres > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Metres accepted" hint={`Reported: ${r.metres} m`}>
              <input type="number" value={metres} onChange={e => setMetres(e.target.value)} style={{ ...inputStyle, ...numInput }} />
            </Field>
            <Field label="Core accepted, m" hint={`Reported: ${r.coreRecovery} m${c > m ? ' · cannot be more than the metres' : ''}`}>
              <input type="number" value={core} onChange={e => setCore(e.target.value)} style={{ ...inputStyle, ...numInput }} />
            </Field>
          </div>
        )}
        {r.standbyHours > 0 && (
          <Switch on={payable} onChange={setPayable} label={`Standby is payable (${r.standbyHours} h, ${r.reason || 'no reason given'})`}
            hint={payable
              ? 'The stoppage was not the contractor’s doing. A full day of it is paid at the standby rate, and billed to your client at the client’s rate.'
              : 'Recorded as the contractor’s own delay. It is not paid, and it is not billed on to your client.'} />
        )}
        <Field label={changed ? 'Why the figure is different' : 'Note (optional)'} hint={changed ? 'Shown to the contractor and kept with the shift.' : undefined}>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder={changed ? 'e.g. rods on the rack give 4 m' : ''} style={inputStyle} />
        </Field>
      </div>
    </Modal>
  )
}

// ── the tab ───────────────────────────────────────────────────────────────

export function ReportsTab({ project, orders }: { project: string; orders: WorkOrder[] }) {
  const { state, acceptReport, returnReport, reopenReport, deleteReport } = useCosting()
  const [checking, setChecking] = useState<ContractorReport | null>(null)
  const [returning, setReturning] = useState<ContractorReport | null>(null)
  const [reason, setReason] = useState('')
  const [showAll, setShowAll] = useState(false)

  const key = (r: { date: string; shift: string; rig: string }) => `${r.date}${r.shift === 'Day' ? '0' : '1'}${r.rig}`
  const mine = useMemo(() => state.contractorReports.filter(r => r.project === project), [state.contractorReports, project])
  const waiting = useMemo(() => mine.filter(r => r.status === 'waiting').sort((a, b) => key(a).localeCompare(key(b))), [mine])
  const returned = mine.filter(r => r.status === 'returned')
  const flagsOf = useMemo(() => {
    const m: Record<string, Flag[]> = {}
    waiting.forEach(r => { m[r.id] = [...reportFlags(state, r, TODAY), ...xplorixFlags(state, r, waiting)] })
    return m
  }, [waiting, state])
  const clean = waiting.filter(r => !hasProblem(flagsOf[r.id] ?? []) && r.standbyHours === 0)
  const checked = useMemo(
    () => state.shiftLogs.filter(l => l.project === project && l.contractor).sort((a, b) => key(b).localeCompare(key(a))),
    [state.shiftLogs, project])
  const changedCount = checked.filter(l => l.check?.claimedMetres != null || l.check?.claimedRecovery != null).length
  const shown = showAll ? checked : checked.slice(0, 12)
  const active = orders.filter(w => w.status === 'active')
  const people = Array.from(new Set(active.map(w => w.contractorId))).map(id => contractorOf(state, id)).filter((c): c is NonNullable<typeof c> => !!c)
  const withLogin = people.filter(c => loginOfContractor(state.users, c.id)?.active)
  const noLogin = people.filter(c => !loginOfContractor(state.users, c.id)?.active)

  return (
    <>
      {active.length > 0 && (
        <Note tone="info">
          <b style={{ color: T.text }}>The contractor writes the drill log, you check it.</b>{' '}
          Each contractor enters shifts in their contractor login and sends them.           Nothing is typed in here.{' '}
          {noLogin.length > 0 && <>{noLogin.map(c => c.name).join(', ')} {noLogin.length === 1 ? 'has' : 'have'} no working login. Create one under Users. </>}
          {withLogin.length > 0 && <a href={`/contractor?as=${withLogin[0].id}`} target="_blank" rel="noreferrer" style={{ color: T.orange, fontWeight: 600, textDecoration: 'none' }}>See what {withLogin[0].name} sees</a>}
        </Note>
      )}

      <Card title={`Waiting to be checked · ${waiting.length}`} pad={false}
        subtitle="Reported by the contractor, not yet in the record. Nothing here is paid or billed on until you accept it."
        right={clean.length > 1 ? <Btn kind="good" size="sm" onClick={() => clean.forEach(r => acceptReport(r.id, me()))}>Accept the {clean.length} with nothing flagged</Btn> : undefined}>
        {waiting.length === 0 && <Empty>Nothing is waiting. Every shift the contractors have sent is in the record.</Empty>}
        {waiting.map((r, i) => {
          const flags = flagsOf[r.id] ?? []
          const wo = workOrderById(state, r.workOrderId)
          const pct = r.metres > 0 ? (r.coreRecovery / r.metres) * 100 : null
          return (
            <div key={r.id} style={{ display: 'flex', gap: 16, padding: '14px 18px', borderTop: i ? rowLine : undefined, flexWrap: 'wrap', background: hasProblem(flags) ? tint(T.amber, 5) : undefined }}>
              <div style={{ flex: '1 1 420px', minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{r.rig} · {shortDay(r.date)} {r.shift.toLowerCase()}</span>
                  <span style={{ fontSize: 13, color: T.muted }}>{wo ? contractorName(state, wo.contractorId) : ''}</span>
                  <SourceTag source={r.source} />
                </div>
                <div style={{ fontSize: 13.5, color: T.muted, marginTop: 6, lineHeight: 1.5 }}>
                  {r.metres > 0
                    ? <><b style={{ color: T.text }}>{r.metres} m</b> on {r.holeNumber}{r.fromDepth != null ? `, ${n1(r.fromDepth)} to ${n1(r.fromDepth + r.metres)} m` : ''} · core {r.coreRecovery} m{pct != null ? ` (${pct.toFixed(0)}%)` : ''} · {hoursWords(r)}</>
                    : <><b style={{ color: T.text }}>No metres.</b> {hoursWords(r)}{r.reason ? ` · ${r.reason}` : ''}</>}
                </div>
                {r.remarks && <div style={{ fontSize: 12.5, color: T.faint, marginTop: 4 }}>“{r.remarks}”</div>}
                <Flags flags={flags} />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <Btn size="sm" kind="danger" onClick={() => { setReturning(r); setReason('') }}>Send back</Btn>
                <Btn size="sm" onClick={() => setChecking(r)}>{r.standbyHours > 0 ? 'Decide standby' : 'Change and accept'}</Btn>
                {r.standbyHours === 0 && <Btn size="sm" kind="good" onClick={() => acceptReport(r.id, me())}>Accept</Btn>}
              </div>
            </div>
          )
        })}
      </Card>

      {returned.length > 0 && (
        <Card title={`Sent back to the contractor · ${returned.length}`} subtitle="Not in the record. The hole's depth has a gap until a corrected shift comes in." pad={false}>
          {returned.map((r, i) => (
            <div key={r.id} style={{ display: 'flex', gap: 16, padding: '13px 18px', borderTop: i ? rowLine : undefined, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ flex: '1 1 400px', minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{r.rig} · {shortDay(r.date)} {r.shift.toLowerCase()} · {r.metres} m on {r.holeNumber ?? 'no hole'}</div>
                <div style={{ fontSize: 13, color: T.muted, marginTop: 4, lineHeight: 1.5 }}>{r.returnReason}</div>
                <div style={{ fontSize: 12, color: T.faint, marginTop: 3 }}>{r.returnedBy}{r.returnedAt ? ` · ${when(r.returnedAt)}` : ''}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn size="sm" onClick={() => deleteReport(r.id)}>Remove</Btn>
                <Btn size="sm" onClick={() => reopenReport(r.id)}>Check it again</Btn>
              </div>
            </div>
          ))}
        </Card>
      )}

      <Card title="In the record" pad={false}
        subtitle={`${checked.length} checked shifts from contractors on this project${changedCount ? ` · ${changedCount} accepted at a different figure from the one reported` : ''}.`}>
        {checked.length === 0 ? <Empty>No contractor shifts in the record yet.</Empty> : (
          <Table>
            <thead><tr>
              <th style={th}>Shift</th><th style={th}>Rig</th><th style={th}>Hole</th><th style={thR}>Metres</th><th style={thR}>Core</th>
              <th style={th}>Stopped</th><th style={th}>Came by</th><th style={th}>Checked</th>
            </tr></thead>
            <tbody>
              {shown.map(l => {
                const cut = l.check?.claimedMetres
                return (
                  <tr key={l.id} className="xpl-row" style={{ borderBottom: rowLine }}>
                    <td style={{ ...td, color: T.text }}>{shortDay(l.date)} {l.shift.toLowerCase()}</td>
                    <td style={td}>{l.rig}</td>
                    <td style={td}>{l.holeNumber ?? '—'}</td>
                    <td style={{ ...tdR, color: T.text, fontWeight: 600 }}>
                      {l.metresDrilled || '—'}{cut != null && <span style={{ color: T.faint, fontWeight: 400 }}> (reported {cut})</span>}
                    </td>
                    <td style={tdR}>{l.metresDrilled > 0 ? `${((l.coreRecovery / l.metresDrilled) * 100).toFixed(0)}%` : '—'}</td>
                    <td style={td}>{l.downtimeHours > 0 ? `${l.downtimeHours} h · ${l.downtimeReason}` : '—'}</td>
                    <td style={td}>{l.check ? SOURCE_LABEL[l.check.source] : '—'}</td>
                    <td style={td}>{l.check ? `${l.check.by} · ${when(l.check.at)}` : '—'}{l.check?.note && <div style={{ fontSize: 12, color: T.faint, whiteSpace: 'normal', maxWidth: 260 }}>{l.check.note}</div>}</td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
        {checked.length > 12 && (
          <div style={{ padding: '11px 18px', borderTop: rowLine }}>
            <button type="button" style={linkBtn} onClick={() => setShowAll(s => !s)}>{showAll ? 'Show the latest 12' : `Show all ${checked.length}`}</button>
          </div>
        )}
      </Card>

      {checking && <AcceptModal r={checking} flags={flagsOf[checking.id] ?? []} onClose={() => setChecking(null)}
        onAccept={a => { acceptReport(checking.id, me(), a); setChecking(null) }} />}

      {returning && (
        <Modal title={`Send back ${returning.rig}, ${shortDay(returning.date)} ${returning.shift.toLowerCase()}`} width={520} onClose={() => setReturning(null)}
          subtitle="It stays out of the record. The contractor sees your note in his drill log, corrects the shift and sends it again."
          footer={<><Btn onClick={() => setReturning(null)}>Cancel</Btn>
            <Btn kind="danger" disabled={!reason.trim()} onClick={() => { returnReport(returning.id, me(), reason); setReturning(null) }}>Send back</Btn></>}>
          <Field label="What needs correcting" hint="The contractor reads this.">
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} autoFocus style={{ ...inputStyle, resize: 'vertical' }} />
          </Field>
        </Modal>
      )}

    </>
  )
}
