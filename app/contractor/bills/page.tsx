'use client'

import { useMemo, useState } from 'react'
import { uid, nowStamp } from '../../../lib/costing-store'
import { TODAY } from '../../../lib/inventory-store'
import { downloadCsv } from '../../../lib/client-record'
import {
  checkBill, billFigures, billDue, draftLines, unbilled,
  type ContractorBill, type BillLine, type WorkOrder, type BillStatus,
} from '../../../lib/contracting'
import { day, when } from '../../../lib/projects'
import { T, tint, Page, Head, Card, Tile, Grid, Btn, Note, Modal, Field, Status, Empty, Table, inputStyle, th, thR, td, tdR, rowLine, type Tone } from '../../components/kit'
import { n0, rs, period, linkBtn, numInput, Sum } from '../../admin/contractors/shared'
import { useMe, NoLogin, CLIENT_NAME } from '../me'

/* ==========================================================================
 * BILLS — what the contractor asks for, and what the client answered
 *
 * A bill is raised from the checked shifts, so it starts out agreeing with
 * the record the client will check it against. The contractor sees the same
 * check the client sees: each line beside the record, every deduction with
 * its clause and its arithmetic, and the amount to be paid. Nothing about the
 * payment is worked out where he cannot read it.
 *
 * Tax is not here. This is the statement of what the work is worth; the tax
 * invoice is raised in the contractor's own accounts for the approved amount.
 * ========================================================================== */

const WORD: Record<BillStatus, string> = { received: 'Being checked', approved: 'Approved for payment', returned: 'Sent back to you', paid: 'Paid' }
const TONE: Record<BillStatus, Tone> = { received: 'warn', approved: 'info', returned: 'bad', paid: 'good' }

// ── raise a bill, or correct one that came back ───────────────────────────

function RaiseModal({ orders, start, existing, onClose }: {
  orders: WorkOrder[]; start?: { wo: WorkOrder; from: string; to: string }; existing?: ContractorBill; onClose: () => void
}) {
  const { state, saveBill } = useMe()
  const [woId, setWoId] = useState(existing?.workOrderId ?? start?.wo.id ?? orders[0]?.id ?? '')
  const wo = orders.find(w => w.id === woId)
  const guess = (w?: WorkOrder) => { const u = w ? unbilled(state, w, TODAY) : null; return { from: u?.from ?? w?.startDate ?? TODAY, to: u?.to ?? TODAY } }
  const [from, setFrom] = useState(existing?.periodFrom ?? start?.from ?? guess(wo).from)
  const [to, setTo] = useState(existing?.periodTo ?? start?.to ?? guess(wo).to)
  const [number, setNumber] = useState(existing?.number ?? '')
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [others, setOthers] = useState<BillLine[]>(existing?.lines.filter(l => l.kind === 'other') ?? [])

  /* The record between the dates, leaving this bill itself out of "already
   * billed" when it is a correction of one that came back. */
  const view = useMemo(() => ({ ...state, contractorBills: state.contractorBills.filter(b => b.id !== existing?.id) }), [state, existing?.id])
  const base = useMemo(() => (wo && from <= to ? draftLines(view, wo, from, to) : []), [view, wo, from, to])
  const lines: BillLine[] = [...base.map(l => {
    const qty = edits[l.key] != null ? (parseFloat(edits[l.key]) || 0) : l.qty
    return { ...l, qty, amount: Math.round(qty * l.rate) }
  }).filter(l => l.qty > 0), ...others.filter(o => o.amount > 0 && o.label.trim())]
  const draft: ContractorBill | null = wo ? {
    id: existing?.id ?? 'draft', number: number.trim() || 'draft', workOrderId: wo.id, project: wo.project, contractorId: wo.contractorId,
    periodFrom: from, periodTo: to, receivedAt: nowStamp(), source: 'login', lines, manual: [], status: 'received',
  } : null
  const c = useMemo(() => (draft ? checkBill(view, draft) : null), [view, draft?.workOrderId, from, to, JSON.stringify(lines)])  // eslint-disable-line react-hooks/exhaustive-deps
  const clash = state.contractorBills.some(b => b.id !== existing?.id && b.workOrderId === woId && b.number.trim().toLowerCase() === number.trim().toLowerCase())
  const ok = !!wo && number.trim().length > 0 && !clash && from <= to && lines.length > 0

  const send = () => {
    if (!draft || !ok) return
    saveBill({ ...draft, id: existing?.id ?? uid('cb'), number: number.trim(), status: 'received', approved: undefined, returnReason: undefined })
    onClose()
  }

  return (
    <Modal title={existing ? `Correct bill ${existing.number} and send it again` : 'Raise a bill'} width={980} onClose={onClose}
      subtitle={`The lines come from your checked shifts, at the work order's rates. ${CLIENT_NAME} checks the bill against the same record.`}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={!ok} onClick={send}>Send to {CLIENT_NAME}</Btn></>}>
      <div style={{ display: 'grid', gap: 16 }}>
        {existing?.returnReason && <Note tone="bad"><b style={{ color: T.text }}>{CLIENT_NAME} sent it back.</b> <span style={{ whiteSpace: 'pre-line' }}>{existing.returnReason}</span></Note>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14 }}>
          {orders.length > 1 && (
            <Field label="Work order">
              <select value={woId} disabled={!!existing} onChange={e => { const w = orders.find(x => x.id === e.target.value); setWoId(e.target.value); const g = guess(w); setFrom(g.from); setTo(g.to); setEdits({}) }} style={{ ...inputStyle, cursor: 'pointer' }}>
                {orders.map(w => <option key={w.id} value={w.id}>{w.number} · {w.project}</option>)}
              </select>
            </Field>
          )}
          <Field label="Your bill number" hint={clash ? 'You have already sent a bill with this number.' : undefined}>
            <input value={number} onChange={e => setNumber(e.target.value)} autoFocus placeholder="As in your own accounts" style={inputStyle} />
          </Field>
          <Field label="Work from"><input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inputStyle} /></Field>
          <Field label="Work to"><input type="date" value={to} max={TODAY} onChange={e => setTo(e.target.value)} style={inputStyle} /></Field>
        </div>

        {base.length === 0
          ? <Note tone="warn">There are no checked shifts between these dates. A shift can be billed once {CLIENT_NAME} has checked it. Change the dates, or wait for the shifts still waiting.</Note>
          : (
            <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
              <Table>
                <thead><tr><th style={th}>Line</th><th style={thR}>Checked record</th><th style={thR}>You claim</th><th style={thR}>Rate</th><th style={thR}>Amount</th></tr></thead>
                <tbody>
                  {base.map(l => {
                    const qty = edits[l.key] != null ? (parseFloat(edits[l.key]) || 0) : l.qty
                    const more = qty > l.qty + 0.001
                    return (
                      <tr key={l.key} style={{ borderBottom: rowLine, background: more ? tint(T.amber, 7) : undefined, verticalAlign: 'top' }}>
                        <td style={{ ...td, color: T.text, whiteSpace: 'normal' }}>
                          {l.label}
                          {more && <div style={{ fontSize: 12.5, color: T.muted, marginTop: 3 }}><span aria-hidden style={{ color: T.amber, fontWeight: 800, marginRight: 5 }}>!</span>More than the checked record. Only what the record shows will be paid.</div>}
                        </td>
                        <td style={tdR}>{l.unit === 'once' ? rs(l.amount) : `${l.qty} ${l.unit === 'm' ? 'm' : l.qty === 1 ? 'day' : 'days'}`}</td>
                        <td style={{ ...tdR, width: 130 }}>
                          {l.unit === 'once' ? 'once' : <input type="number" aria-label={`Claimed for ${l.label}`} value={edits[l.key] ?? String(l.qty)} onChange={e => setEdits({ ...edits, [l.key]: e.target.value })} style={{ ...inputStyle, ...numInput, padding: '6px 9px' }} />}
                        </td>
                        <td style={tdR}>{rs(l.rate)}</td>
                        <td style={{ ...tdR, color: T.text, fontWeight: 600 }}>{rs(Math.round(qty * l.rate))}</td>
                      </tr>
                    )
                  })}
                  {others.map((o, i) => (
                    <tr key={o.id} style={{ borderBottom: rowLine }}>
                      <td style={td} colSpan={3}><input value={o.label} placeholder="What it is for" aria-label="Other line" onChange={e => setOthers(others.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} style={{ ...inputStyle, padding: '6px 9px' }} /></td>
                      <td style={tdR}><button type="button" style={{ ...linkBtn, color: T.faint }} onClick={() => setOthers(others.filter((_, j) => j !== i))}>Remove</button></td>
                      <td style={{ ...tdR, width: 150 }}><input type="number" aria-label="Amount" value={o.amount || ''} onChange={e => { const a = parseFloat(e.target.value) || 0; setOthers(others.map((x, j) => j === i ? { ...x, amount: a, rate: a } : x)) }} style={{ ...inputStyle, ...numInput, padding: '6px 9px' }} /></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr>
                  <td style={td} colSpan={4}><button type="button" style={linkBtn} onClick={() => setOthers([...others, { id: uid('ol'), kind: 'other', key: uid('other'), label: '', qty: 1, unit: 'once', rate: 0, amount: 0 }])}>Add something that is not in the work order</button></td>
                  <td style={{ ...tdR, color: T.text, fontWeight: 700 }}>{rs(lines.reduce((s, l) => s + l.amount, 0))}</td>
                </tr></tfoot>
              </Table>
            </div>
          )}

        {c && lines.length > 0 && (
          <div className="xpl-split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,1fr)', gap: 22 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 8 }}>What the work order takes off</div>
              {c.deductions.length === 0 && !c.retention && <div style={{ fontSize: 13, color: T.faint }}>Nothing applies to this period.</div>}
              {c.deductions.map((d, i) => <Sum key={i} label={d.label} note={<>{d.working}{d.clause ? ` · ${d.clause}` : ''}</>} value={`− ${rs(d.amount)}`} />)}
              {c.retention && <Sum label={c.retention.label} note={<>{c.retention.working}{c.retention.clause ? ` · ${c.retention.clause}` : ''}</>} value={`− ${rs(c.retention.amount)}`} />}
            </div>
            <div style={{ padding: '12px 16px', borderRadius: 12, background: T.raised, border: `1px solid ${T.border}`, alignSelf: 'start' }}>
              <Sum label="You claim" value={rs(c.claimed)} />
              {c.over > 0 && <Sum label="Not in the checked record" value={`− ${rs(c.over)}`} />}
              <Sum label="Deductions" value={c.deducted ? `− ${rs(c.deducted)}` : rs(0)} />
              <Sum label="Retention held" value={c.held ? `− ${rs(c.held)}` : rs(0)} />
              <Sum strong label="You can expect" value={rs(c.net)} note={`Within ${c.wo?.paymentDays ?? 30} days of the bill, before tax. ${CLIENT_NAME} may add a deduction when they check it.`} />
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ── one bill, with the client's check ─────────────────────────────────────

function BillView({ bill, onClose, onCorrect }: { bill: ContractorBill; onClose: () => void; onCorrect: () => void }) {
  const { state } = useMe()
  const c = useMemo(() => checkBill(state, bill), [state, bill])
  const frozen = bill.approved
  const problems = c.lines.filter(l => l.problems.length)
  const exportIt = () => downloadCsv(`bill-${bill.number.replace(/[^\w-]+/g, '-')}`, [
    ['Bill', bill.number, c.wo?.number ?? '', CLIENT_NAME],
    ['Period', bill.periodFrom, bill.periodTo],
    [],
    ['Line', 'Claimed qty', 'Rate', 'Claimed', 'Record shows', 'Payable', 'Note'],
    ...c.lines.map(l => [l.line.label, l.line.qty, Math.round(l.line.rate), l.line.amount, l.record ? l.record.qty : '', l.payable, l.problems.join(' ')]),
    [],
    ['Claimed', '', '', frozen?.claimed ?? c.claimed],
    ['Supported by the record', '', '', frozen?.supported ?? c.supported],
    ...(frozen ? frozen.lines.map(x => [x.label, '', '', x.amount]) : [
      ...c.deductions.map(d => [`Less: ${d.label}`, '', '', -d.amount, d.working, '', d.clause ?? '']),
      ...c.manual.map(m => [`Less: ${m.label}`, '', '', -m.amount]),
      ...(c.retention ? [[`Held: ${c.retention.label}`, '', '', -c.retention.amount]] : []),
    ]),
    ['To be paid', '', '', frozen?.net ?? c.net],
  ])

  return (
    <Modal title={`Bill ${bill.number}`} width={960} onClose={onClose}
      subtitle={<>{c.wo?.number} · work from {day(bill.periodFrom)} to {day(bill.periodTo)} · sent {when(bill.receivedAt)}</>}
      footer={<><Btn onClick={exportIt}>Export</Btn><span style={{ flex: 1 }} />
        {bill.status === 'returned' && <Btn kind="primary" onClick={onCorrect}>Correct and send again</Btn>}
        <Btn onClick={onClose}>Close</Btn></>}>
      <div style={{ display: 'grid', gap: 18 }}>
        {bill.status === 'returned' && <Note tone="bad"><b style={{ color: T.text }}>{CLIENT_NAME} sent this bill back.</b> <span style={{ whiteSpace: 'pre-line' }}>{bill.returnReason}</span></Note>}
        {bill.status === 'received' && (
          <Note tone={problems.length ? 'warn' : 'info'}>
            <b style={{ color: T.text }}>{CLIENT_NAME} has not answered yet.</b>{' '}
            {problems.length
              ? `As it stands, ${rs(c.over)} of the bill is not in the checked record. They can pay what the record shows, or send the bill back.`
              : 'Every line matches the checked record.'} The figures below are what the check shows today.
          </Note>
        )}
        {frozen && (
          <Note tone={bill.status === 'paid' ? 'good' : 'info'}>
            <b style={{ color: T.text }}>{bill.status === 'paid' ? `Paid${bill.paidAt ? ` ${when(bill.paidAt)}` : ''}.` : `Approved for ${rs(frozen.net)}.`}</b>{' '}
            Approved by {frozen.by}, {when(frozen.at)}.{bill.status === 'approved' ? ` Due ${day(billDue(state, bill))}.` : ''} Raise your tax invoice for this amount.
          </Note>
        )}

        <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
          <Table>
            <thead><tr><th style={th}>Line</th><th style={thR}>You claimed</th><th style={thR}>Rate</th><th style={thR}>Amount</th><th style={thR}>Checked record</th><th style={thR}>Payable</th></tr></thead>
            <tbody>
              {c.lines.map(l => {
                const bad = l.problems.length > 0
                const unit = l.line.unit === 'm' ? ' m' : l.line.unit === 'day' ? (l.line.qty === 1 ? ' day' : ' days') : ''
                return (
                  <tr key={l.line.id} style={{ borderBottom: rowLine, background: bad ? tint(T.amber, 7) : undefined, verticalAlign: 'top' }}>
                    <td style={{ ...td, color: T.text, whiteSpace: 'normal' }}>
                      {l.line.label}
                      {l.problems.map((p, i) => <div key={i} style={{ fontSize: 12.5, color: T.muted, marginTop: 3 }}><span aria-hidden style={{ color: T.amber, fontWeight: 800, marginRight: 5 }}>!</span>{p}</div>)}
                    </td>
                    <td style={tdR}>{l.line.unit === 'once' ? 'once' : `${l.line.qty}${unit}`}</td>
                    <td style={tdR}>{rs(l.line.rate)}</td>
                    <td style={tdR}>{rs(l.line.amount)}</td>
                    <td style={{ ...tdR, color: bad ? T.text : T.muted, fontWeight: bad ? 700 : 400 }}>
                      {l.record ? (l.line.unit === 'once' ? (l.record.qty ? rs(l.record.amount) : 'already billed') : `${l.record.qty}${l.line.unit === 'm' ? ' m' : l.record.qty === 1 ? ' day' : ' days'}`) : 'nothing'}
                    </td>
                    <td style={{ ...tdR, color: T.text, fontWeight: 600 }}>{rs(l.payable)}</td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        </div>

        <div className="xpl-split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,1fr)', gap: 22 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 8 }}>Deductions under the work order</div>
            {frozen
              ? (frozen.lines.length === 0 ? <div style={{ fontSize: 13, color: T.faint }}>None were applied.</div>
                : frozen.lines.map((x, i) => <Sum key={i} label={x.label} value={`− ${rs(-x.amount)}`} />))
              : <>
                {c.deductions.length === 0 && c.manual.length === 0 && !c.retention && <div style={{ fontSize: 13, color: T.faint }}>None apply to this bill.</div>}
                {c.deductions.map((d, i) => <Sum key={i} label={d.label} note={<>{d.working}{d.clause ? ` · ${d.clause}` : ''}</>} value={`− ${rs(d.amount)}`} />)}
                {c.manual.map(m => <Sum key={m.id} label={m.label} note={`Added by ${CLIENT_NAME}`} value={`− ${rs(m.amount)}`} />)}
                {c.retention && <Sum label={c.retention.label} note={<>{c.retention.working}{c.retention.clause ? ` · ${c.retention.clause}` : ''}</>} value={`− ${rs(c.retention.amount)}`} />}
              </>}
          </div>
          <div style={{ padding: '12px 16px', borderRadius: 12, background: T.raised, border: `1px solid ${T.border}`, alignSelf: 'start' }}>
            <Sum label="You claimed" value={rs(frozen?.claimed ?? c.claimed)} />
            <Sum label="Not in the checked record" value={(frozen ? frozen.claimed - frozen.supported : c.over) ? `− ${rs(frozen ? frozen.claimed - frozen.supported : c.over)}` : rs(0)} />
            <Sum label="Deductions" value={(frozen?.deductions ?? c.deducted) ? `− ${rs(frozen?.deductions ?? c.deducted)}` : rs(0)} />
            <Sum label="Retention held" value={(frozen?.held ?? c.held) ? `− ${rs(frozen?.held ?? c.held)}` : rs(0)} />
            <Sum strong label={bill.status === 'paid' ? 'Paid' : 'To be paid'} value={rs(frozen?.net ?? c.net)} note="Before tax" />
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ── the screen ────────────────────────────────────────────────────────────

export default function ContractorBillsPage() {
  const { state, me, side } = useMe()
  const [openId, setOpenId] = useState<string | null>(null)
  const [raising, setRaising] = useState<{ wo: WorkOrder; from: string; to: string } | true | null>(null)
  const [correcting, setCorrecting] = useState<ContractorBill | null>(null)

  const rows = useMemo(() => [...side.bills].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)).map(b => ({ b, f: billFigures(state, b), due: billDue(state, b) })), [side.bills, state])
  const owed = useMemo(() => side.orders.map(wo => ({ wo, u: unbilled(state, wo, TODAY) })).filter(x => x.u), [side.orders, state])

  if (!me) return <NoLogin />

  const checking = rows.filter(r => r.b.status === 'received')
  const toPay = rows.filter(r => r.b.status === 'approved')
  const paid = rows.filter(r => r.b.status === 'paid')
  const held = rows.filter(r => r.b.status === 'approved' || r.b.status === 'paid').reduce((s, r) => s + r.f.held, 0)
  const open = side.bills.find(b => b.id === openId)
  const billable = side.orders.filter(w => w.status === 'active' || unbilled(state, w, TODAY))

  return (
    <Page>
      <Head title="Bills"
        sub={<>Raise a bill from your checked shifts and send it to {CLIENT_NAME}. You see the same check they see: every line against the record, and every deduction with its working.</>}
        right={<Btn kind="primary" disabled={!billable.length} onClick={() => setRaising(true)}>Raise a bill</Btn>} />

      <Grid min={205}>
        <Tile label="Being checked" value={checking.length} note={checking.length ? `${rs(checking.reduce((s, r) => s + r.f.claimed, 0))} claimed` : 'Nothing with the client'} />
        <Tile label="Approved, not paid yet" value={rs(toPay.reduce((s, r) => s + r.f.net, 0))} note={toPay.length ? `Next due ${day(toPay.map(r => r.due).sort()[0])}` : 'Nothing outstanding'} />
        <Tile label="Paid" value={rs(paid.reduce((s, r) => s + r.f.net, 0))} note={`${paid.length} ${paid.length === 1 ? 'bill' : 'bills'}`} />
        <Tile label="Held as retention" value={rs(held)} note="Released when the work order closes" />
      </Grid>

      <Card title="Checked work not on a bill yet" pad={false} subtitle="Shifts the client has checked that you have not billed.">
        {owed.length === 0 ? <Empty>Everything checked is on a bill.</Empty> : owed.map(({ wo, u }, i) => (
          <div key={wo.id} style={{ display: 'flex', gap: 18, padding: '14px 18px', borderTop: i ? rowLine : undefined, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 380px', minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{wo.number} · {wo.project}</div>
              <div style={{ fontSize: 13, color: T.muted, marginTop: 4, lineHeight: 1.55 }}>
                {period(u!.from, u!.to)} · {n0(u!.rec.metres)} m{u!.rec.standbyDays ? ` and ${u!.rec.standbyDays} standby ${u!.rec.standbyDays === 1 ? 'day' : 'days'}` : ''} worth {rs(u!.rec.total)}
              </div>
              {u!.deductions.map((d, k) => <div key={k} style={{ fontSize: 12.5, color: T.muted, marginTop: 3 }}><span aria-hidden style={{ color: T.amber, fontWeight: 800 }}>! </span>{d.label}: {d.working} = − {rs(d.amount)}</div>)}
              {u!.retention && <div style={{ fontSize: 12.5, color: T.faint, marginTop: 3 }}>{u!.retention.label}: − {rs(u!.retention.amount)}</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums' }}>{rs(u!.net)}</div>
              <div style={{ fontSize: 12, color: T.faint, marginBottom: 8 }}>after deductions, as it stands</div>
              <Btn size="sm" kind="primary" onClick={() => setRaising({ wo, from: u!.from, to: u!.to })}>Raise this bill</Btn>
            </div>
          </div>
        ))}
      </Card>

      <Card title="Your bills" pad={false}>
        {rows.length === 0 ? <Empty>You have not sent a bill yet.</Empty> : (
          <Table>
            <thead><tr><th style={th}>Bill</th><th style={th}>Work order</th><th style={th}>Work</th><th style={thR}>Claimed</th><th style={thR}>Record supports</th><th style={thR}>Taken off</th><th style={thR}>To be paid</th><th style={th}>Status</th><th style={th}></th></tr></thead>
            <tbody>
              {rows.map(({ b, f, due }) => {
                const over = f.claimed - f.supported
                return (
                  <tr key={b.id} className="xpl-row" onClick={() => setOpenId(b.id)} style={{ borderBottom: rowLine, cursor: 'pointer' }}>
                    <td style={{ ...td, color: T.text, fontWeight: 600 }}>{b.number}</td>
                    <td style={td}>{side.orders.find(w => w.id === b.workOrderId)?.number}</td>
                    <td style={td}>{period(b.periodFrom, b.periodTo)}</td>
                    <td style={tdR}>{rs(f.claimed)}</td>
                    <td style={{ ...tdR, color: over > 0 ? T.text : T.muted, fontWeight: over > 0 ? 700 : 400 }}>
                      {rs(f.supported)}{over > 0 && <div style={{ fontSize: 12, fontWeight: 400, color: T.muted }}><span aria-hidden style={{ color: T.amber, fontWeight: 800 }}>! </span>{rs(over)} not in the record</div>}
                    </td>
                    <td style={tdR}>{f.deductions + f.held ? `− ${rs(f.deductions + f.held)}` : '—'}</td>
                    <td style={{ ...tdR, color: T.text, fontWeight: 700 }}>{rs(f.net)}</td>
                    <td style={td}><Status tone={TONE[b.status]}>{WORD[b.status]}</Status>{b.status === 'approved' && <div style={{ fontSize: 12, color: T.faint, marginTop: 4 }}>Due {day(due)}</div>}</td>
                    <td style={{ ...td, textAlign: 'right' }}><span style={{ color: T.orange, fontWeight: 600, fontSize: 12.5 }}>{b.status === 'returned' ? 'Correct' : 'Open'}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {open && <BillView bill={open} onClose={() => setOpenId(null)} onCorrect={() => { setCorrecting(open); setOpenId(null) }} />}
      {raising && <RaiseModal orders={billable} start={raising === true ? undefined : raising} onClose={() => setRaising(null)} />}
      {correcting && <RaiseModal orders={side.orders} existing={correcting} onClose={() => setCorrecting(null)} />}
    </Page>
  )
}
