'use client'

import { useMemo, useState } from 'react'
import { useCosting, uid, nowStamp } from '../../../lib/costing-store'
import { TODAY } from '../../../lib/inventory-store'
import { downloadCsv } from '../../../lib/client-record'
import {
  checkBill, snapshotOf, billFigures, billDue, draftLines, unbilled, contractorName, workOrderById,
  BILL_STATUS_LABEL, type ContractorBill, type BillLine, type WorkOrder, type BillStatus,
} from '../../../lib/contracting'
import { day, when } from '../../../lib/projects'
import { T, tint, Card, Tile, Grid, Btn, Note, Modal, Field, Status, Empty, Table, inputStyle, th, thR, td, tdR, rowLine, type Tone, num } from '../../components/kit'
import { me, n0, rs, period, linkBtn, numInput, SourceTag, Sum } from './shared'

/* BILLS — what each contractor has asked for, against what the checked record
 * supports.
 *
 * A bill is never retyped into a second system and compared by eye. Each line
 * is set beside the checked shifts it claims, the contract's deductions are
 * worked out with their arithmetic showing, and what is left is the amount to
 * pay. Approving freezes those figures on the bill.
 *
 * Tax is deliberately not here. VAT and withholding tax belong on the tax invoice in the
 * accounts system; this is the statement that says what the work is worth. */

const TONE: Record<BillStatus, Tone> = { received: 'warn', approved: 'info', returned: 'bad', paid: 'good' }

// ── one bill, checked ─────────────────────────────────────────────────────

function BillModal({ bill, onClose }: { bill: ContractorBill; onClose: () => void }) {
  const { state, saveBill, approveBill, returnBill, reopenBill, markBillPaid } = useCosting()
  const c = useMemo(() => checkBill(state, bill), [state, bill])
  const [sendBack, setSendBack] = useState(false)
  const [reason, setReason] = useState('')
  const [extra, setExtra] = useState({ label: '', amount: '' })
  const frozen = bill.approved
  const open = bill.status === 'received'
  const wo = c.wo
  const name = contractorName(state, bill.contractorId)
  const problems = c.lines.filter(l => l.problems.length)

  const addManual = () => {
    const amount = parseFloat(extra.amount)
    if (!extra.label.trim() || !(amount > 0)) return
    saveBill({ ...bill, manual: [...bill.manual, { id: uid('md'), label: extra.label.trim(), amount }] })
    setExtra({ label: '', amount: '' })
  }
  const exportIt = () => downloadCsv(`payment-statement-${bill.number.replace(/[^\w-]+/g, '-')}`, [
    ['Payment statement', bill.number, name, wo?.number ?? ''],
    ['Period', bill.periodFrom, bill.periodTo],
    [],
    ['Line', 'Claimed qty', 'Rate', 'Claimed', 'Record shows', 'Payable', 'Note'],
    ...c.lines.map(l => [l.line.label, l.line.qty, Math.round(l.line.rate), l.line.amount, l.record ? l.record.qty : '', l.payable, l.problems.join(' ')]),
    [],
    ['Claimed', '', '', c.claimed],
    ['Supported by the record', '', '', c.supported],
    ...c.deductions.map(d => [`Less: ${d.label}`, '', '', -d.amount, d.working, '', d.clause ?? '']),
    ...c.manual.map(m => [`Less: ${m.label}`, '', '', -m.amount]),
    ...(c.retention ? [[`Held: ${c.retention.label}`, '', '', -c.retention.amount]] : []),
    ['Net payable', '', '', frozen?.net ?? c.net],
  ])

  return (
    <Modal title={`Bill ${bill.number}`} width={980} onClose={onClose}
      subtitle={<>{name} · {wo?.number} · work from {day(bill.periodFrom)} to {day(bill.periodTo)} · received {when(bill.receivedAt)}</>}
      footer={<>
        <Btn onClick={exportIt}>Export statement</Btn>
        <span style={{ flex: 1 }} />
        {open && <Btn kind="danger" onClick={() => { setSendBack(true); setReason(problems.flatMap(p => p.problems.map(x => `${p.line.label}: ${x}`)).join('\n')) }}>Send back</Btn>}
        {open && <Btn kind="primary" onClick={() => { approveBill(bill.id, snapshotOf(c, me(), nowStamp())); onClose() }}>Approve {rs(c.net)} for payment</Btn>}
        {bill.status === 'approved' && <><Btn onClick={() => reopenBill(bill.id)}>Reopen</Btn><Btn kind="good" onClick={() => { markBillPaid(bill.id); onClose() }}>Mark as paid</Btn></>}
        {(bill.status === 'returned' || bill.status === 'paid') && <Btn onClick={() => reopenBill(bill.id)}>Reopen</Btn>}
      </>}>
      <div style={{ display: 'grid', gap: 18 }}>
        {bill.status === 'returned' && <Note tone="bad"><b style={{ color: T.text }}>Sent back to {name}.</b> <span style={{ whiteSpace: 'pre-line' }}>{bill.returnReason}</span></Note>}
        {frozen && (
          <Note tone={bill.status === 'paid' ? 'good' : 'info'}>
            <b style={{ color: T.text }}>{bill.status === 'paid' ? `Paid${bill.paidAt ? ` ${when(bill.paidAt)}` : ''}.` : `Approved for ${rs(frozen.net)}.`}</b>{' '}
            Approved by {frozen.by}, {when(frozen.at)}. The figures were fixed on that day and do not move if the record is corrected later.
          </Note>
        )}
        {open && (problems.length
          ? <Note tone="warn"><b style={{ color: T.text }}>{problems.length} {problems.length === 1 ? 'line claims' : 'lines claim'} more than the checked record shows.</b> {rs(c.over)} of the bill is not supported. You can pay what the record supports, or send the bill back.</Note>
          : <Note tone="good"><b style={{ color: T.text }}>Every line matches the checked record.</b></Note>)}

        <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
          <Table>
            <thead><tr>
              <th style={th}>Line on the bill</th><th style={thR}>Claimed</th><th style={thR}>Rate</th><th style={thR}>Amount</th>
              <th style={thR}>Record shows</th><th style={thR}>Payable</th>
            </tr></thead>
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
        {c.notClaimed.length > 0 && (
          <div style={{ fontSize: 12.5, color: T.faint, lineHeight: 1.6 }}>
            In the record for this period but not on the bill: {c.notClaimed.map(x => `${x.label} (${x.qty} ${x.unit === 'm' ? 'm' : 'days'})`).join('; ')}. It can come on their next bill.
          </div>
        )}

        <div className="xpl-split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,1fr)', gap: 22 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 8 }}>Deductions under the work order</div>
            {c.deductions.length === 0 && c.manual.length === 0 && !c.retention && <div style={{ fontSize: 13, color: T.faint }}>None apply to this bill.</div>}
            {c.deductions.map((d, i) => (
              <Sum key={i} label={d.label} note={<>{d.working}{d.clause ? ` · ${d.clause}` : ''}</>} value={`− ${rs(d.amount)}`} />
            ))}
            {c.manual.map(m => (
              <Sum key={m.id} label={m.label} note={open ? <button type="button" style={{ ...linkBtn, color: T.faint, fontWeight: 400 }} onClick={() => saveBill({ ...bill, manual: bill.manual.filter(x => x.id !== m.id) })}>Remove</button> : 'Added by hand'} value={`− ${rs(m.amount)}`} />
            ))}
            {c.retention && <Sum label={c.retention.label} note={<>{c.retention.working}{c.retention.clause ? ` · ${c.retention.clause}` : ''}</>} value={`− ${rs(c.retention.amount)}`} />}
            {open && (
              <form onSubmit={e => { e.preventDefault(); addManual() }} style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: '1 1 200px' }}>
                  <Field label="Another deduction"><input value={extra.label} onChange={e => setExtra({ ...extra, label: e.target.value })} placeholder="e.g. damaged core boxes, clause 11" style={inputStyle} /></Field>
                </div>
                <div style={{ width: 130 }}>
                  <Field label="SAR"><input type="number" value={extra.amount} onChange={e => setExtra({ ...extra, amount: e.target.value })} style={{ ...inputStyle, ...numInput }} /></Field>
                </div>
                <Btn onClick={addManual} disabled={!extra.label.trim() || !(parseFloat(extra.amount) > 0)}>Add</Btn>
              </form>
            )}
          </div>
          <div style={{ padding: '12px 16px', borderRadius: 10, background: T.raised, border: `1px solid ${T.border}`, alignSelf: 'start' }}>
            <Sum label="Claimed on the bill" value={rs(frozen?.claimed ?? c.claimed)} />
            <Sum label="Not supported by the record" value={c.over ? `− ${rs(c.over)}` : rs(0)} />
            <Sum label="Deductions" value={(frozen?.deductions ?? c.deducted) ? `− ${rs(frozen?.deductions ?? c.deducted)}` : rs(0)} />
            <Sum label="Retention held" value={(frozen?.held ?? c.held) ? `− ${rs(frozen?.held ?? c.held)}` : rs(0)} />
            <Sum strong label="To pay" value={rs(frozen?.net ?? c.net)} note={`Due ${day(billDue(state, bill))}, before tax`} />
          </div>
        </div>
      </div>

      {sendBack && (
        <Modal title={`Send bill ${bill.number} back`} width={560} onClose={() => setSendBack(false)}
          footer={<><Btn onClick={() => setSendBack(false)}>Cancel</Btn><Btn kind="danger" disabled={!reason.trim()} onClick={() => { returnBill(bill.id, reason); setSendBack(false); onClose() }}>Send back</Btn></>}>
          <Field label="What needs correcting" hint={`${name} reads this.`}>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={5} autoFocus style={{ ...inputStyle, resize: 'vertical' }} />
          </Field>
        </Modal>
      )}
    </Modal>
  )
}

// ── type in a bill that came on paper ─────────────────────────────────────

export function EnterModal({ orders, start, onClose, onSave }: { orders: WorkOrder[]; start?: { wo: WorkOrder; from: string; to: string }; onClose: () => void; onSave: (b: ContractorBill) => void }) {
  const { state } = useCosting()
  const [woId, setWoId] = useState(start?.wo.id ?? orders[0]?.id ?? '')
  const wo = orders.find(w => w.id === woId)
  const guess = (w?: WorkOrder) => { const u = w ? unbilled(state, w, TODAY) : null; return { from: u?.from ?? w?.startDate ?? TODAY, to: u?.to ?? TODAY } }
  const [from, setFrom] = useState(start?.from ?? guess(wo).from)
  const [to, setTo] = useState(start?.to ?? guess(wo).to)
  const [number, setNumber] = useState('')
  const [edits, setEdits] = useState<Record<string, { qty?: string; rate?: string }>>({})
  const [others, setOthers] = useState<BillLine[]>([])

  const base = useMemo(() => (wo && from <= to ? draftLines(state, wo, from, to) : []), [state, wo, from, to])
  const lines: BillLine[] = [...base.map(l => {
    const e = edits[l.key] ?? {}
    const qty = e.qty != null ? (parseFloat(e.qty) || 0) : l.qty
    const rate = e.rate != null ? (parseFloat(e.rate) || 0) : l.rate
    return { ...l, qty, rate, amount: Math.round(qty * rate) }
  }).filter(l => l.qty > 0), ...others.filter(o => o.amount > 0)]
  const total = lines.reduce((s, l) => s + l.amount, 0)
  const ok = !!wo && number.trim().length > 0 && from <= to && lines.length > 0

  return (
    <Modal title="Enter a bill that came on paper" width={900} onClose={onClose}
      subtitle="A contractor normally sends his bill from his own login or his own XPLORIX. This is for one that arrived on paper. The lines are filled from the checked record; change only the figures where the bill says something different."
      footer={<><Btn onClick={onClose}>Cancel</Btn>
        <Btn kind="primary" disabled={!ok} onClick={() => wo && onSave({
          id: uid('cb'), number: number.trim(), workOrderId: wo.id, project: wo.project, contractorId: wo.contractorId,
          periodFrom: from, periodTo: to, receivedAt: nowStamp(), source: 'entry', lines, manual: [], status: 'received',
        })}>Save and check it</Btn></>}>
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14 }}>
          <Field label="Work order">
            <select value={woId} onChange={e => { const w = orders.find(x => x.id === e.target.value); setWoId(e.target.value); const g = guess(w); setFrom(g.from); setTo(g.to); setEdits({}) }} style={{ ...inputStyle, cursor: 'pointer' }}>
              {orders.map(w => <option key={w.id} value={w.id}>{w.number} · {contractorName(state, w.contractorId)}</option>)}
            </select>
          </Field>
          <Field label="Their bill number"><input value={number} onChange={e => setNumber(e.target.value)} autoFocus style={inputStyle} /></Field>
          <Field label="Work from"><input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inputStyle} /></Field>
          <Field label="Work to"><input type="date" value={to} max={TODAY} onChange={e => setTo(e.target.value)} style={inputStyle} /></Field>
        </div>
        {base.length === 0
          ? <Note tone="warn">There are no checked shifts on this work order between these dates. Check their daily reports first, or change the dates.</Note>
          : (
            <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
              <Table>
                <thead><tr><th style={th}>Line</th><th style={thR}>Record shows</th><th style={thR}>The bill claims</th><th style={thR}>At rate, SAR</th><th style={thR}>Amount</th></tr></thead>
                <tbody>
                  {base.map(l => {
                    const e = edits[l.key] ?? {}
                    const qty = e.qty != null ? (parseFloat(e.qty) || 0) : l.qty
                    const rate = e.rate != null ? (parseFloat(e.rate) || 0) : l.rate
                    const diff = qty !== l.qty || Math.round(rate) !== Math.round(l.rate)
                    return (
                      <tr key={l.key} style={{ borderBottom: rowLine, background: diff ? tint(T.amber, 7) : undefined }}>
                        <td style={{ ...td, color: T.text }}>{l.label}</td>
                        <td style={tdR}>{l.unit === 'once' ? rs(l.amount) : `${l.qty} ${l.unit === 'm' ? 'm' : 'days'}`}</td>
                        <td style={{ ...tdR, width: 130 }}>
                          {l.unit === 'once' ? 'once' : <input type="number" aria-label={`Claimed for ${l.label}`} value={e.qty ?? String(l.qty)} onChange={ev => setEdits({ ...edits, [l.key]: { ...e, qty: ev.target.value } })} style={{ ...inputStyle, ...numInput, padding: '6px 9px' }} />}
                        </td>
                        <td style={{ ...tdR, width: 140 }}>
                          <input type="number" aria-label={`Rate for ${l.label}`} value={e.rate ?? String(Math.round(l.rate))} onChange={ev => setEdits({ ...edits, [l.key]: { ...e, rate: ev.target.value } })} style={{ ...inputStyle, ...numInput, padding: '6px 9px' }} />
                        </td>
                        <td style={{ ...tdR, color: T.text, fontWeight: 600 }}>{rs(Math.round(qty * rate))}</td>
                      </tr>
                    )
                  })}
                  {others.map((o, i) => (
                    <tr key={o.id} style={{ borderBottom: rowLine }}>
                      <td style={td} colSpan={3}><input value={o.label} placeholder="Anything else on the bill" aria-label="Other line" onChange={e => setOthers(others.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} style={{ ...inputStyle, padding: '6px 9px' }} /></td>
                      <td style={tdR}><button type="button" style={{ ...linkBtn, color: T.faint }} onClick={() => setOthers(others.filter((_, j) => j !== i))}>Remove</button></td>
                      <td style={{ ...tdR, width: 150 }}><input type="number" aria-label="Amount" value={o.amount || ''} onChange={e => { const a = parseFloat(e.target.value) || 0; setOthers(others.map((x, j) => j === i ? { ...x, amount: a, rate: a } : x)) }} style={{ ...inputStyle, ...numInput, padding: '6px 9px' }} /></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr>
                  <td style={td} colSpan={4}><button type="button" style={linkBtn} onClick={() => setOthers([...others, { id: uid('ol'), kind: 'other', key: uid('other'), label: '', qty: 1, unit: 'once', rate: 0, amount: 0 }])}>Add a line that is not in the record</button></td>
                  <td style={{ ...tdR, color: T.text, fontWeight: 700 }}>{rs(total)}</td>
                </tr></tfoot>
              </Table>
            </div>
          )}
      </div>
    </Modal>
  )
}

// ── the tab ───────────────────────────────────────────────────────────────

export function BillsTab({ project, orders }: { project: string; orders: WorkOrder[] }) {
  const { state, saveBill } = useCosting()
  const [openId, setOpenId] = useState<string | null>(null)
  const [entering, setEntering] = useState<{ wo: WorkOrder; from: string; to: string } | true | null>(null)

  const bills = useMemo(() => state.contractorBills.filter(b => b.project === project).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)), [state.contractorBills, project])
  const rows = useMemo(() => bills.map(b => ({ b, f: billFigures(state, b), due: billDue(state, b) })), [bills, state])
  const toCheck = rows.filter(r => r.b.status === 'received')
  const toPay = rows.filter(r => r.b.status === 'approved')
  const owed = useMemo(() => orders.map(wo => ({ wo, u: unbilled(state, wo, TODAY) })).filter(x => x.u), [orders, state])
  const held = rows.filter(r => r.b.status === 'approved' || r.b.status === 'paid').reduce((s, r) => s + r.f.held, 0)
  const open = bills.find(b => b.id === openId)

  return (
    <>
      <Grid min={210}>
        <Tile label="Bills to check" value={toCheck.length} tone={toCheck.length ? 'warn' : 'good'}
          note={toCheck.length ? `${rs(toCheck.reduce((s, r) => s + r.f.claimed, 0))} claimed` : 'Nothing waiting'} />
        <Tile label="Approved, not paid" value={rs(toPay.reduce((s, r) => s + r.f.net, 0))}
          note={toPay.length ? `${toPay.length} ${toPay.length === 1 ? 'bill' : 'bills'} · next due ${day(toPay.map(r => r.due).sort()[0])}` : 'Nothing outstanding'} />
        <Tile label="Checked work not billed yet" value={rs(owed.reduce((s, x) => s + x.u!.net, 0))} note="What you will owe on the next bills" />
        <Tile label="Held as retention" value={rs(held)} note="Released when each work order closes" />
      </Grid>

      <Card title="Bills from contractors" pad={false}
        subtitle="Contractors send their bills from their login or their own XPLORIX. Each line is set against the checked shifts it claims. Open a bill to see the check."
        right={<Btn size="sm" disabled={!orders.length} onClick={() => setEntering(true)}>Enter a paper bill</Btn>}>
        {rows.length === 0 ? <Empty>No bills yet.</Empty> : (
          <Table>
            <thead><tr>
              <th style={th}>Bill</th><th style={th}>Contractor</th><th style={th}>Work</th><th style={thR}>Claimed</th>
              <th style={thR}>Record supports</th><th style={thR}>Deductions</th><th style={thR}>To pay</th><th style={th}>Status</th><th style={th}></th>
            </tr></thead>
            <tbody>
              {rows.map(({ b, f, due }) => {
                const over = f.claimed - f.supported
                return (
                  <tr key={b.id} className="xpl-row" onClick={() => setOpenId(b.id)} style={{ borderBottom: rowLine, cursor: 'pointer' }}>
                    <td style={{ ...td, color: T.text, fontWeight: 600 }}>{b.number}<div style={{ marginTop: 4 }}><SourceTag source={b.source} /></div></td>
                    <td style={td}>{contractorName(state, b.contractorId)}<div style={{ fontSize: 12, color: T.faint }}>{workOrderById(state, b.workOrderId)?.number}</div></td>
                    <td style={td}>{period(b.periodFrom, b.periodTo)}</td>
                    <td style={tdR}>{rs(f.claimed)}</td>
                    <td style={{ ...tdR, color: over > 0 ? T.text : T.muted, fontWeight: over > 0 ? 700 : 400 }}>
                      {rs(f.supported)}{over > 0 && <div style={{ fontSize: 12, fontWeight: 400, color: T.muted }}><span aria-hidden style={{ color: T.amber, fontWeight: 800 }}>! </span>{rs(over)} over</div>}
                    </td>
                    <td style={tdR}>{f.deductions + f.held ? `− ${rs(f.deductions + f.held)}` : '—'}</td>
                    <td style={{ ...tdR, color: T.text, fontWeight: 700 }}>{rs(f.net)}</td>
                    <td style={td}><Status tone={TONE[b.status]}>{BILL_STATUS_LABEL[b.status]}</Status>{b.status === 'approved' && <div style={{ fontSize: 12, color: due < TODAY ? T.muted : T.faint, marginTop: 4 }}>{due < TODAY ? 'Was due' : 'Due'} {day(due)}</div>}</td>
                    <td style={{ ...td, textAlign: 'right' }}><span style={{ color: T.orange, fontWeight: 600, fontSize: 12.5 }}>{b.status === 'received' ? 'Check' : 'Open'}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Card title="Checked work not on a bill yet" pad={false}
        subtitle="Shifts already in the record that no bill has covered. When the contractor's bill arrives, this is what it should say.">
        {owed.length === 0 ? <Empty>Every checked shift has been billed.</Empty> : owed.map(({ wo, u }, i) => (
          <div key={wo.id} style={{ display: 'flex', gap: 18, padding: '14px 18px', borderTop: i ? rowLine : undefined, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 380px', minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{contractorName(state, wo.contractorId)} · {wo.number}</div>
              <div style={{ fontSize: 13, color: T.muted, marginTop: 4, lineHeight: 1.55 }}>
                {period(u!.from, u!.to)} · {n0(u!.rec.metres)} m{u!.rec.standbyDays ? ` and ${u!.rec.standbyDays} standby ${u!.rec.standbyDays === 1 ? 'day' : 'days'}` : ''} worth {rs(u!.rec.total)}
              </div>
              {u!.deductions.map((d, k) => <div key={k} style={{ fontSize: 12.5, color: T.muted, marginTop: 3 }}><span aria-hidden style={{ color: T.amber, fontWeight: 800 }}>! </span>{d.label}: {d.working} = − {rs(d.amount)}</div>)}
              {u!.retention && <div style={{ fontSize: 12.5, color: T.faint, marginTop: 3 }}>{u!.retention.label}: − {rs(u!.retention.amount)}</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums' }}>{rs(u!.net)}</div>
              <div style={{ fontSize: 12, color: T.faint, marginBottom: 8 }}>to pay, as it stands</div>
              <Btn size="sm" onClick={() => setEntering({ wo, from: u!.from, to: u!.to })}>Enter a paper bill</Btn>
            </div>
          </div>
        ))}
      </Card>

      {open && <BillModal bill={open} onClose={() => setOpenId(null)} />}
      {entering && <EnterModal orders={orders} start={entering === true ? undefined : entering} onClose={() => setEntering(null)}
        onSave={b => { saveBill(b); setEntering(null); setOpenId(b.id) }} />}
    </>
  )
}
