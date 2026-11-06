'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { money, moneyL, perUnit, COMPANY_NAME, type LineReview } from '../../../lib/costing-store'
import { useClient } from '../../../lib/client-view'
import { holeVerdict } from '../../../lib/log-checks'
import { CheckedMark } from '../../components/checked-mark'
import {
  spendSummary, invoiceState, INVOICE_STATE_LABEL, isInvoiceOverdue, payable, disputedValue, disputedLineValue,
  num, downloadCsv, type PortalInvoice, type InvoiceState,
} from '../../../lib/client-record'
import { day } from '../../../lib/projects'
import {
  Page, PageHead, Card, Tile, Grid, Btn, Table, Status, Modal, Seg, Note, Empty, inputStyle,
  th, thR, td, tdR, tdStrong, rowLine, T, tint, type Tone,
} from '../../components/kit'

/* ==========================================================================
 * INVOICES — what am I being asked to pay, and is it right
 *
 * An invoice is checked line by line. Every line that came from metres or
 * standby carries the figure from the shift record beside the figure claimed,
 * so approving is reading two numbers, not rebuilding a measurement book.
 * Disputing a line holds back only the part the record does not support.
 * Each answer reaches the company's Finance screen as it is given.
 * ========================================================================== */

const stateTone: Record<InvoiceState, Tone> = { 'to-verify': 'warn', disputed: 'bad', approved: 'good', paid: 'neutral' }
type View = 'all' | InvoiceState

function InvoicesScreen() {
  const c = useClient()
  const params = useSearchParams()
  const [openId, setOpenId] = useState<string | null>(null)
  const [view, setView] = useState<View>('all')
  const [project, setProject] = useState('all')
  useEffect(() => { const o = params.get('open'); if (o) setOpenId(o) }, [params])

  const all = c.invoices.filter(i => project === 'all' || i.project === project).sort((a, b) => b.date.localeCompare(a.date))
  const rows = all.filter(i => view === 'all' || invoiceState(i) === view)
  const s = spendSummary(all)
  const open = c.invoices.find(i => i.id === openId) ?? null
  const overdue = all.filter(isInvoiceOverdue)
  const toVerify = all.filter(i => invoiceState(i) === 'to-verify')
  const count = (v: View) => v === 'all' ? all.length : all.filter(i => invoiceState(i) === v).length

  // What is drilled and will be invoiced later, so the next bill is no surprise.
  const coming = c.holes.filter(h => (project === 'all' || h.project === project) && h.status !== 'invoiced' && h.value > 0)
  const byProject = c.projects.filter(p => project === 'all' || p.name === project).map(p => {
    const sum = spendSummary(c.invoices.filter(i => i.project === p.name))
    const next = c.holes.filter(h => h.project === p.name && h.status !== 'invoiced')
    return { p, ...sum, count: c.invoices.filter(i => i.project === p.name).length, coming: next.reduce((a, h) => a + h.value, 0), comingHoles: next.filter(h => h.value > 0).length }
  })

  const exportCsv = () => downloadCsv('xplorix-invoices', [
    ['Invoice', 'Project', 'Date', 'Due', 'Holes', 'Before tax', 'Tax %', 'Total incl. tax', 'Disputed before tax', 'Payable incl. tax', 'Status', 'Paid on'],
    ...rows.map(i => [i.number, i.project, i.date, i.due, i.holes.join(' '), Math.round(i.subtotal), i.taxPercent, Math.round(i.total), Math.round(disputedValue(i)), Math.round(payable(i)), INVOICE_STATE_LABEL[invoiceState(i)], i.paidDate]),
  ])

  if (c.projects.length === 0) {
    return <Page><PageHead question="What am I being asked to pay?" answer={<>{COMPANY_NAME} has not shown you a project yet.</>} /></Page>
  }

  return (
    <Page>
      <PageHead question="What am I being asked to pay, and is it right?"
        tone={toVerify.length ? 'warn' : overdue.length ? 'warn' : 'good'}
        answer={<>
          {toVerify.length
            ? <b style={{ color: T.text }}>{toVerify.length} {toVerify.length === 1 ? 'invoice is' : 'invoices are'} waiting for you to check. </b>
            : <>No invoice is waiting to be checked. </>}
          {COMPANY_NAME} has invoiced {moneyL(s.raised)} before tax; you have approved {moneyL(s.approved)}, disputed {moneyL(s.disputed)} and paid {moneyL(s.paid)}.
          {overdue.length > 0 && <> {overdue.length} approved {overdue.length === 1 ? 'invoice is' : 'invoices are'} past the due date.</>}
        </>}
        right={<Btn size="sm" onClick={exportCsv} disabled={!rows.length}>Export</Btn>} />

      <Grid min={170}>
        <Tile label="Invoiced" value={moneyL(s.raised)} note={`${all.length} ${all.length === 1 ? 'invoice' : 'invoices'}, before tax`} />
        <Tile label="Waiting for your check" value={moneyL(s.waiting)} tone={s.waiting ? 'warn' : undefined} note={`${toVerify.length} ${toVerify.length === 1 ? 'invoice' : 'invoices'}`} />
        <Tile label="Approved" value={moneyL(s.approved)} note="Lines you accepted" />
        <Tile label="Disputed" value={moneyL(s.disputed)} tone={s.disputed ? 'bad' : undefined} note={s.disputed ? 'Held back until settled' : 'Nothing disputed'} />
        <Tile label="Paid" value={moneyL(s.paid)} note={s.metresPaid ? `${num(s.metresPaid)} m · ${perUnit(s.paid / s.metresPaid)} all-in` : undefined} />
        <Tile label="Approved, not paid" value={moneyL(s.approved - s.paid)} tone={s.overdue ? 'warn' : undefined} note={s.overdue ? `${moneyL(s.overdue)} past the due date` : 'Nothing overdue'} />
      </Grid>

      <Card title="Invoices" subtitle="Newest first. Open one to check it line by line against the shift record." pad={false}
        right={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {c.projects.length > 1 && (
            <select value={project} onChange={e => setProject(e.target.value)} aria-label="Project" style={{ ...inputStyle, width: 'auto', padding: '6px 10px', fontSize: 12.5 }}>
              <option value="all">All projects</option>
              {c.projects.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
            </select>
          )}
          <Seg<View> value={view} onChange={setView} options={([['all', 'All'], ['to-verify', 'To check'], ['disputed', 'Part disputed'], ['approved', 'Approved'], ['paid', 'Paid']] as [View, string][])
            .filter(([v]) => v === 'all' || count(v) > 0).map(([v, l]) => ({ value: v, label: `${l} · ${count(v)}` }))} />
        </div>}>
        {rows.length === 0 ? <Empty>{all.length === 0 ? `${COMPANY_NAME} has not sent you an invoice yet.` : 'No invoices match this filter.'}</Empty> : (
          <Table>
            <thead><tr><th style={th}>Invoice</th><th style={th}>Project</th><th style={th}>Date</th><th style={th}>Due</th><th style={th}>Holes</th>
              <th style={thR}>Before tax</th><th style={thR}>Total incl. tax</th><th style={thR}>Disputed</th><th style={thR}>Payable</th><th style={th}>Status</th><th style={th} /></tr></thead>
            <tbody>
              {rows.map(i => {
                const st = invoiceState(i)
                const late = isInvoiceOverdue(i)
                const checked = i.reviews.filter(Boolean).length
                return (
                  <tr key={i.id} className="xpl-row" style={{ borderBottom: rowLine, cursor: 'pointer' }} onClick={() => setOpenId(i.id)}>
                    <td style={tdStrong}>{i.number}</td>
                    <td style={td}>{i.project}</td>
                    <td style={td}>{day(i.date)}</td>
                    <td style={td}>{day(i.due)}{late && <span style={{ color: T.amber, marginLeft: 7, fontWeight: 600 }}>! overdue</span>}</td>
                    <td style={{ ...td, whiteSpace: 'normal', maxWidth: 190 }}>{i.holes.join(', ') || '—'}
                      {i.holes.length > 0 && i.holes.every(h => holeVerdict(c.state, h).ok) && <div style={{ marginTop: 3 }}><CheckedMark compact v={{ shifts: 1, checked: 1, open: 0, stops: 0, ok: true }} title="Every shift on every hole on this invoice passed the XPLORIX drill log checks as it was logged" /></div>}
                    </td>
                    <td style={tdR}>{money(i.subtotal)}</td>
                    <td style={tdR}>{money(i.total)}</td>
                    <td style={{ ...tdR, color: disputedValue(i) ? T.text : T.muted }}>{disputedValue(i) ? money(disputedValue(i)) : '—'}</td>
                    <td style={{ ...tdR, color: T.text, fontWeight: 600 }}>{st === 'to-verify' ? '—' : money(payable(i))}</td>
                    <td style={td}><Status tone={stateTone[st]}>{st === 'to-verify' ? `To check · ${checked} of ${i.lines.length}` : st === 'paid' ? `Paid ${day(i.paidDate)}` : INVOICE_STATE_LABEL[st]}</Status></td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <Btn size="sm" kind={st === 'to-verify' ? 'primary' : 'ghost'} onClick={() => setOpenId(i.id)}>{st === 'to-verify' ? 'Check' : 'Open'}</Btn>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Card title="By project" subtitle="Everything before tax. Still to come is work already drilled that has not been invoiced yet, at your contract rates." pad={false}>
        <Table>
          <thead><tr><th style={th}>Project</th><th style={thR}>Invoices</th><th style={thR}>Invoiced</th><th style={thR}>Approved</th><th style={thR}>Disputed</th><th style={thR}>Paid</th><th style={thR}>Still to come</th><th style={th} /></tr></thead>
          <tbody>
            {byProject.map(b => (
              <tr key={b.p.id} style={{ borderBottom: rowLine }}>
                <td style={{ ...tdStrong, whiteSpace: 'normal' }}>{b.p.name}<div style={{ fontSize: 12, color: T.faint, fontWeight: 400 }}>{b.p.code}</div></td>
                <td style={tdR}>{b.count}</td>
                <td style={tdR}>{moneyL(b.raised)}</td>
                <td style={{ ...tdR, color: T.text }}>{moneyL(b.approved)}</td>
                <td style={tdR}>{b.disputed ? moneyL(b.disputed) : '—'}</td>
                <td style={tdR}>{moneyL(b.paid)}</td>
                <td style={tdR}>{b.coming ? <>{moneyL(b.coming)}<span style={{ color: T.faint }}> · {b.comingHoles} {b.comingHoles === 1 ? 'hole' : 'holes'}</span></> : '—'}</td>
                <td style={{ ...td, textAlign: 'right' }}><Link href={`/client/projects/${b.p.id}?tab=rates`} style={{ color: T.orange, fontWeight: 600, textDecoration: 'none', fontSize: 12.5 }}>Contract rates</Link></td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {coming.length > 0 && (
        <Card title="Drilled, not invoiced yet" subtitle="What the next invoices will carry. Metres from the shift record at your contract rates." pad={false}>
          <Table>
            <thead><tr><th style={th}>Hole</th><th style={th}>Project</th><th style={thR}>Metres</th><th style={thR}>Standby days</th><th style={thR}>Value before tax</th><th style={th}>Where it stands</th></tr></thead>
            <tbody>
              {coming.map(h => (
                <tr key={h.id} style={{ borderBottom: rowLine }}>
                  <td style={tdStrong}><Link href={`/client/holes/${encodeURIComponent(h.id)}`} style={{ color: T.text, textDecoration: 'none' }}>{h.id}</Link></td>
                  <td style={td}>{h.project}</td>
                  <td style={tdR}>{num(h.drilled, h.drilled % 1 ? 1 : 0)} m</td>
                  <td style={tdR}>{h.standbyDays || '—'}</td>
                  <td style={{ ...tdR, color: T.text }}>{money(h.value)}</td>
                  <td style={td}>{h.status === 'drilling' ? 'Still drilling' : h.status === 'closed' ? 'Finished, not sent to you yet' : h.status === 'submitted' ? 'Waiting for your approval' : 'Approved, ready to invoice'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {open && <Review inv={open} onClose={() => setOpenId(null)} onReview={r => c.ownerReviewInvoice(open.id, r)} onPaid={() => c.ownerMarkPaid(open.id)} />}
    </Page>
  )
}

/* Line-by-line check. Each click is saved straight away, so the company sees
 * it in Finance without a refresh. */
function Review({ inv, onClose, onReview, onPaid }: {
  inv: PortalInvoice; onClose: () => void; onReview: (r: (LineReview | null)[]) => void; onPaid: () => void
}) {
  const [disputing, setDisputing] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const st = invoiceState(inv)
  const locked = inv.paid
  const set = (k: number, r: LineReview | null) => onReview(inv.reviews.map((x, j) => j === k ? r : x))
  const mismatch = (k: number) => { const c = inv.lines[k].check; return !!c && c.claimed !== c.verified }
  const approveMatching = () => onReview(inv.lines.map((_, k) => inv.reviews[k] ?? (mismatch(k) ? null : { status: 'approved' })))
  const untouched = inv.reviews.filter(r => !r).length
  const matchingLeft = inv.lines.filter((_, k) => !inv.reviews[k] && !mismatch(k)).length
  const tax = (inv.subtotal - disputedValue(inv)) * inv.taxPercent / 100

  return (
    <Modal title={`Invoice ${inv.number}`} width={1060} onClose={onClose}
      subtitle={<span style={{ display: 'inline-flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>From {COMPANY_NAME} · {inv.project} · dated {day(inv.date)} · due {day(inv.due)}</span>
        <Status tone={stateTone[st]}>{INVOICE_STATE_LABEL[st]}</Status>
      </span>}
      footer={<>
        <span style={{ marginRight: 'auto', fontSize: 12.5, color: T.faint, alignSelf: 'center' }}>
          {locked ? `Paid ${day(inv.paidDate)}` : untouched ? `${untouched} ${untouched === 1 ? 'line' : 'lines'} still to check` : 'Every line has been checked'}
        </span>
        {!locked && matchingLeft > 0 && <Btn kind="good" onClick={approveMatching}>Approve the {matchingLeft} matching {matchingLeft === 1 ? 'line' : 'lines'}</Btn>}
        {!locked && untouched === 0 && <Btn kind="primary" onClick={onPaid}>Mark as paid · {money(payable(inv))}</Btn>}
        <Btn onClick={onClose}>Close</Btn>
      </>}>
      <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden', background: T.bg }}>
        <Table>
          <thead><tr><th style={th}>Line</th><th style={thR}>Claimed</th><th style={thR}>Shift record</th><th style={thR}>Rate</th><th style={thR}>Amount</th><th style={th}>Your decision</th></tr></thead>
          <tbody>
            {inv.lines.map((l, k) => {
              const r = inv.reviews[k]
              const bad = mismatch(k)
              return (
                <tr key={k} style={{ borderBottom: rowLine, verticalAlign: 'top', background: r?.status === 'disputed' ? tint(T.amber, 5) : undefined }}>
                  <td style={{ ...td, whiteSpace: 'normal', minWidth: 230 }}>
                    <div style={{ color: T.text, fontWeight: 600 }}>{l.label}</div>
                    {l.check && (
                      <div style={{ fontSize: 12, marginTop: 4, color: bad ? T.text : T.faint }}>
                        <span aria-hidden style={{ marginRight: 5, fontWeight: 800, color: bad ? T.amber : T.green }}>{bad ? '!' : '✓'}</span>{l.check.note}
                      </div>
                    )}
                    {!l.check && <div style={{ fontSize: 12, marginTop: 4, color: T.faint }}>A contract lump sum. Nothing on the rig to compare it with.</div>}
                    {l.hole && <Link href={`/client/holes/${encodeURIComponent(l.hole)}`} style={{ fontSize: 12, color: T.orange, fontWeight: 600, marginTop: 4, display: 'inline-block', textDecoration: 'none' }}>Open the shifts behind this line</Link>}
                    {r?.status === 'disputed' && r.reason && <div style={{ fontSize: 12, marginTop: 6, color: T.muted }}>Your reason: {r.reason} · {money(disputedLineValue(l))} held back</div>}
                  </td>
                  <td style={tdR}>{l.qty}</td>
                  <td style={{ ...tdR, color: bad ? T.text : T.muted, fontWeight: bad ? 700 : 400 }}>{l.check ? `${num(l.check.verified, l.check.verified % 1 ? 1 : 0)} ${l.check.unit}` : '—'}</td>
                  <td style={tdR}>{l.rate}</td>
                  <td style={{ ...tdR, color: T.text, fontWeight: 600 }}>{money(l.amount)}</td>
                  <td style={{ ...td, whiteSpace: 'normal', minWidth: 230 }}>
                    {disputing === k ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                        <input autoFocus value={reason} onChange={e => setReason(e.target.value)} placeholder="Why is this line wrong?" aria-label="Reason for dispute"
                          style={{ ...inputStyle, padding: '7px 10px', fontSize: 12.5 }} />
                        <div style={{ display: 'flex', gap: 6 }}>
                          <Btn size="sm" onClick={() => setDisputing(null)}>Cancel</Btn>
                          <Btn size="sm" kind="danger" disabled={!reason.trim()} onClick={() => { set(k, { status: 'disputed', reason: reason.trim() }); setDisputing(null) }}>Dispute line</Btn>
                        </div>
                      </div>
                    ) : r ? (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Status tone={r.status === 'approved' ? 'good' : 'warn'}>{r.status === 'approved' ? 'Approved' : 'Disputed'}</Status>
                        {!locked && <Btn size="sm" onClick={() => set(k, null)}>Undo</Btn>}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Btn size="sm" kind="danger" onClick={() => { setDisputing(k); setReason(bad ? l.check!.note : '') }}>Dispute</Btn>
                        <Btn size="sm" kind="good" onClick={() => set(k, { status: 'approved' })}>Approve</Btn>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginTop: 16 }}>
        <Tile label="Claimed, before tax" value={money(inv.subtotal)} note={`${inv.lines.length} lines · ${inv.holes.length} ${inv.holes.length === 1 ? 'hole' : 'holes'}`} />
        <Tile label="In dispute" value={money(disputedValue(inv))} tone={disputedValue(inv) ? 'warn' : undefined} note={disputedValue(inv) ? 'Held back until settled' : 'Nothing disputed'} />
        <Tile label={`VAT at ${inv.taxPercent}%`} value={money(tax)} note="On the part you accept" />
        <Tile label="Payable" value={money(payable(inv))} note={untouched ? 'If the unchecked lines are approved' : locked ? `Paid ${day(inv.paidDate)}` : `Due ${day(inv.due)}`} />
      </div>

      <div style={{ marginTop: 14 }}>
        <Note>
          This invoice was built from the same shift logs you can read under Operations and Holes, so each line already agrees with the record unless the record changed afterwards.
          Your decisions reach {COMPANY_NAME} as you make them. Their costs and margin are never part of an invoice.
        </Note>
      </div>
    </Modal>
  )
}

export default function ClientInvoices() {
  return <Suspense fallback={null}><InvoicesScreen /></Suspense>
}
