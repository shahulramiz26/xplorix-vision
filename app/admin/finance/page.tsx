'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Settings2, History, FileText } from 'lucide-react'
import { useCosting, moneyL, money, monthOf, outstanding, isOverdue, type Invoice } from '../../../lib/costing-store'
import { useInventory, TODAY } from '../../../lib/inventory-store'
import { computeOverview, financeLink } from '../../../lib/admin-overview'
import { holesFromLogs } from '../../../lib/client-record'
import { profitByRig, byProject, cashStages, type Stage } from '../../../lib/finance-overview'
import { useInbox, DeptInbox } from '../../components/inbox'
import { Page, PageHead, Card, Seg, Table, Empty, Status, Btn, T, tint, display, th, thR, td, tdR, tdStrong, rowLine, type Tone, num, eyebrow } from '../../components/kit'

/* ==========================================================================
 * FINANCE AND BILLING — the overview
 *
 * Opens on the two questions an owner asks of money: where every rupee of
 * drilled work stands on its way to the bank, and which rig and project made
 * money this month. The rig-by-rig costing (and its deep links) lives at
 * /admin/finance/rigs; an old link with a project or tab in it is sent there.
 * ========================================================================== */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthWord = (m: string) => `${MON[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`
const day = (d?: string) => d ? `${Number(d.slice(8, 10))} ${MON[Number(d.slice(5, 7)) - 1]}` : '—'
const ageDays = (d?: string) => d ? Math.max(0, Math.round((new Date(TODAY).getTime() - new Date(d).getTime()) / 86400000)) : 0
const n0 = (n: number) => Math.round(n).toLocaleString('en-US')

export default function FinanceRoute() {
  return <Suspense fallback={null}><Finance /></Suspense>
}

function Finance() {
  const router = useRouter()
  const params = useSearchParams()
  const deep = !!(params.get('project') || params.get('tab') || params.get('rig'))
  useEffect(() => { if (deep) router.replace(`/admin/finance/rigs?${params.toString()}`) }, [deep, params, router])

  const { state } = useCosting()
  const { state: inv } = useInventory()
  const inbox = useInbox()
  const o = useMemo(() => computeOverview(state, inv), [state, inv])
  const months = useMemo(() => {
    const ms = Array.from(new Set(state.shiftLogs.map(l => monthOf(l.date)))).sort()
    return ms.length ? ms.slice(-3).reverse() : [monthOf(TODAY)]
  }, [state.shiftLogs])
  const [month, setMonth] = useState(monthOf(TODAY))
  const rows = useMemo(() => profitByRig(state, inv, month), [state, inv, month])
  const projects = useMemo(() => byProject(rows), [rows])

  const holes = useMemo(() => holesFromLogs(state), [state])
  const holeById = useMemo(() => new Map(holes.map(h => [h.id, h])), [holes])
  const holeLink = (h: { project: string; rig: string; end?: string; start?: string }) =>
    financeLink({ project: h.project, rig: h.rig, month: monthOf(h.end ?? h.start ?? TODAY), tab: 'Drillholes' })
  const invoiceLink = (i: Invoice) => {
    const h = holeById.get(i.holeNumbers[0])
    return h ? financeLink({ project: h.project, rig: h.rig, month: monthOf(h.end ?? h.start), tab: 'Tracker' }) : '#invoices'
  }
  const stages = cashStages({
    today: TODAY, stuck: inbox.forecast?.cash.stuckOpen ?? [],
    toSend: o.money.toSend, returned: o.money.returned, waitingOwner: o.money.waitingOwner, readyToInvoice: o.money.readyToInvoice,
    invoices: state.invoices, holeLink, invoiceLink,
  })
  const notInvoiced = stages.filter(s => ['drilled', 'closed', 'client', 'approved'].includes(s.key)).reduce((t, s) => t + s.value, 0)
  const now = o.now, prev = o.prev
  const marginDelta = now.marginPct - prev.marginPct
  const firstRow = rows[0], lastRow = rows[rows.length - 1]
  const invoices = [...state.invoices].filter(i => i.status !== 'cancelled').sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number))

  if (deep) return null
  return (
    <Page>
      <PageHead question="Where does the money stand?" tone={o.money.overdueValue > 0 ? 'bad' : notInvoiced > 0 ? 'warn' : 'good'}
        answer={<>
          {monthWord(o.month)} so far: <b style={{ color: T.text }}>{moneyL(now.revenue)}</b> of work at a {now.marginPct.toFixed(0)}% margin.
          {' '}<b style={{ color: T.text }}>{moneyL(o.money.outstanding)}</b> is owed to you{o.money.overdueValue > 0 ? <>, <b style={{ color: 'var(--x-bad-text)' }}>{moneyL(o.money.overdueValue)} of it overdue</b></> : ''}, and {moneyL(notInvoiced)} of drilled work is not on an invoice yet.
        </>}
        right={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn href="/admin/finance/rigs"><FileText size={14} aria-hidden />Rig by rig</Btn>
          <Btn href="/admin/finance/rigs?setup=costs"><Settings2 size={14} aria-hidden />Adjust costs</Btn>
        </div>} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(210px, 100%), 1fr))', gap: 14 }}>
        <Stat label={`Margin, ${monthWord(o.month)} so far`} value={`${now.marginPct.toFixed(1)}%`} tone={now.margin >= 0 ? undefined : 'bad'}
          note={prev.revenue ? <>{moneyL(now.margin)} · <span style={{ color: marginDelta >= 0 ? 'var(--x-good-text)' : 'var(--x-bad-text)', fontWeight: 600 }}>{marginDelta >= 0 ? '▲' : '▼'} {Math.abs(marginDelta).toFixed(1)} pts</span> on the same days of {monthWord(prev.month)}</> : moneyL(now.margin)} />
        <Stat label="Owed to you" value={moneyL(o.money.outstanding)} note={`${o.money.unpaid.length} ${o.money.unpaid.length === 1 ? 'invoice' : 'invoices'} not paid`} />
        <Stat label="Overdue" value={moneyL(o.money.overdueValue)} tone={o.money.overdueValue > 0 ? 'bad' : undefined} note={o.money.overdue.length ? `${o.money.overdue.length} past the due date` : 'Nothing past due'} />
        <Stat label="Drilled, not invoiced" value={moneyL(notInvoiced)} tone={notInvoiced > 0 ? 'warn' : undefined} note="Holes not yet on an invoice, at the client rate" />
      </div>

      <DeptInbox depts={['finance', 'billing']} name="Finance and billing" />

      <Card title="From drilled to paid" subtitle="Every hole and invoice, where it stands. The red ones are stuck or late; each opens where you move it on.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(165px, 100%), 1fr))', gap: 10 }}>
          {stages.map((s, i) => <StageCol key={s.key} s={s} last={i === stages.length - 1} />)}
        </div>
      </Card>

      <Card title="Who made money" subtitle="Every rig, ranked by what it made after its own costs. Contractor rigs at what their work order pays."
        right={<Seg value={month} onChange={setMonth} options={months.map(m => ({ value: m, label: m === monthOf(TODAY) ? `${MON[Number(m.slice(5, 7)) - 1]}, so far` : MON[Number(m.slice(5, 7)) - 1] }))} />} pad={false}>
        {rows.length === 0 ? <Empty>No shifts costed in {monthWord(month)}.</Empty> : (
          <>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '14px 18px 4px' }}>
              {projects.map(p => (
                <div key={p.project} style={{ padding: '9px 13px', borderRadius: 10, background: 'rgba(var(--x-ov),0.04)', fontSize: 12.5, color: T.muted }}>
                  <b style={{ color: T.text }}>{p.project}</b> · {moneyL(p.margin)} on {moneyL(p.revenue)} · {p.marginPct.toFixed(0)}%
                </div>
              ))}
            </div>
            {firstRow && lastRow && rows.length > 1 && (
              <div style={{ padding: '6px 18px 10px', fontSize: 13, color: T.muted, lineHeight: 1.55 }}>
                {firstRow.rig} made the most, {moneyL(firstRow.margin)}. {lastRow.rig} made the least, {moneyL(lastRow.margin)}
                {lastRow.breakdownDays ? `, with ${lastRow.breakdownDays} ${lastRow.breakdownDays === 1 ? 'day' : 'days'} lost to its own breakdowns` : lastRow.standbyDays ? `, with ${lastRow.standbyDays} standby ${lastRow.standbyDays === 1 ? 'day' : 'days'}` : ''}.
              </div>
            )}
            <Table>
              <thead><tr><th style={th}>Rig</th><th style={th}>Project</th><th style={thR}>Metres</th><th style={thR}>Billed</th><th style={thR}>Cost</th><th style={thR}>Made</th><th style={th}>Margin</th><th style={thR}>Cost / m</th><th style={thR}>Rate / m</th><th style={th} /></tr></thead>
              <tbody>
                {rows.map(r => {
                  const max = Math.max(...rows.map(x => Math.abs(x.margin)), 1)
                  return (
                    <tr key={r.key} style={{ borderTop: rowLine }}>
                      <td style={tdStrong}>{r.rig}{r.contractor && <div style={{ fontSize: 11.5, color: T.faint, fontWeight: 400 }}>{r.contractor}</div>}</td>
                      <td style={td}>{r.project}</td>
                      <td style={tdR}>{n0(r.metres)}</td>
                      <td style={tdR}>{moneyL(r.revenue)}</td>
                      <td style={tdR}>{moneyL(r.cost)}</td>
                      <td style={{ ...tdR, fontWeight: 700, color: r.margin >= 0 ? 'var(--x-good-text)' : 'var(--x-bad-text)' }}>{moneyL(r.margin)}</td>
                      <td style={{ ...td, minWidth: 140 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div aria-hidden style={{ flex: 1, height: 7, borderRadius: 99, background: 'rgba(var(--x-ov),0.06)', overflow: 'hidden' }}>
                            <div style={{ width: `${(Math.abs(r.margin) / max) * 100}%`, height: '100%', background: r.margin >= 0 ? T.green : T.red }} />
                          </div>
                          <span style={{ fontSize: 12, color: T.text, minWidth: 34, textAlign: 'right' }}>{r.marginPct.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td style={tdR}>{money(r.costPerMetre)}</td>
                      <td style={tdR}>{money(r.ratePerMetre)}</td>
                      <td style={td}><Link href={financeLink({ project: r.project, rig: r.rig, month, tab: 'Performance' })} style={{ color: T.orange, fontWeight: 600, textDecoration: 'none', fontSize: 12.5 }}>Open</Link></td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          </>
        )}
      </Card>

      <div id="invoices" style={{ scrollMarginTop: 80 }}>
        <Card title="Invoices" subtitle="Newest first. Overdue and disputed ones are marked." pad={false}>
          {invoices.length === 0 ? <Empty>No invoices yet. Raise one from an approved hole.</Empty> : (
            <Table>
              <thead><tr><th style={th}>Invoice</th><th style={th}>Project</th><th style={th}>Raised</th><th style={th}>Due</th><th style={thR}>Total</th><th style={thR}>Still owed</th><th style={th}>Where it stands</th><th style={th} /></tr></thead>
              <tbody>
                {invoices.map(i => {
                  const [tone, word] = invoiceState(i)
                  return (
                    <tr key={i.id} style={{ borderTop: rowLine }}>
                      <td style={tdStrong}>{i.number}</td>
                      <td style={td}>{i.project}</td>
                      <td style={td}>{day(i.date)}</td>
                      <td style={td}>{day(i.dueDate)}</td>
                      <td style={tdR}>{money(i.total)}</td>
                      <td style={{ ...tdR, color: T.text, fontWeight: 600 }}>{i.status === 'paid' ? '—' : money(outstanding(i))}</td>
                      <td style={td}><Status tone={tone}>{word}</Status></td>
                      <td style={td}><Link href={invoiceLink(i)} style={{ color: T.orange, fontWeight: 600, textDecoration: 'none', fontSize: 12.5 }}>Open</Link></td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <Card title="Setup" subtitle="Set once, changed when a contract or a cost changes. Each change starts on its date and leaves earlier days alone.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: 12 }}>
          <SetupLink href="/admin/finance/rigs?setup=costs" icon={<Settings2 size={16} />} title="What each rig costs" sub="Fuel, crew, the rig itself, repairs" />
          <SetupLink href="/admin/projects" icon={<FileText size={16} />} title="What each client pays" sub="Contract rates, on each project" />
          <SetupLink href="/admin/finance/rigs?setup=history" icon={<History size={16} />} title="Rates history" sub="Every rate and cost change, by date" />
        </div>
      </Card>
    </Page>
  )
}

function invoiceState(i: Invoice): [Tone, string] {
  if (i.status === 'paid') return ['good', `Paid ${day(i.paidDate)}`]
  if (i.ownerStatus === 'disputed') return ['bad', 'Disputed']
  if (isOverdue(i, TODAY)) return ['bad', `Overdue ${ageDays(i.dueDate)} days`]
  if (i.status === 'draft') return ['neutral', 'Draft']
  if (i.ownerStatus === 'awaiting') return ['info', 'With the client']
  if (i.ownerStatus === 'approved') return ['info', 'Approved, not paid']
  return ['info', 'Not paid yet']
}

function Stat({ label, value, note, tone }: { label: string; value: string; note?: React.ReactNode; tone?: 'bad' | 'warn' }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '13px 16px', display: 'grid', gap: 6, boxShadow: tone === 'bad' ? 'inset 3px 0 0 var(--x-red)' : tone === 'warn' ? 'inset 3px 0 0 var(--x-amber)' : 'var(--x-card-shadow)' }}>
      <span style={{ ...eyebrow, color: tone === 'bad' ? 'var(--x-bad-text)' : 'var(--x-faint)' }}>{label}</span>
      <span style={{ ...num, fontSize: 24, fontWeight: 600, color: tone === 'bad' ? 'var(--x-bad-text)' : T.text }}>{value}</span>
      {note && <span style={{ fontSize: 12, color: T.faint, lineHeight: 1.45 }}>{note}</span>}
    </div>
  )
}

function StageCol({ s, last }: { s: Stage; last: boolean }) {
  const [all, setAll] = useState(false)
  const show = all ? s.items : s.items.slice(0, 4)
  const stuck = s.key === 'drilled' && s.items.length > 0
  return (
    <section aria-label={s.label} style={{ display: 'grid', gap: 8, alignContent: 'start', padding: 12, borderRadius: 10, background: stuck ? tint(T.red, 5) : last ? tint(T.green, 6) : 'rgba(var(--x-ov),0.035)', border: `1px solid ${stuck ? tint(T.red, 25) : 'transparent'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: T.text }}>{s.label}</span>
        <span style={{ fontSize: 12, color: T.faint }}>{s.items.length}</span>
      </div>
      <span style={{ ...num, fontSize: 21, fontWeight: 600, color: stuck ? 'var(--x-bad-text)' : last ? 'var(--x-good-text)' : T.text }}>{moneyL(s.value)}</span>
      <span style={{ fontSize: 11.5, color: T.faint, lineHeight: 1.4, minHeight: 32 }}>{s.oldest ? `Oldest waiting ${ageDays(s.oldest)} ${ageDays(s.oldest) === 1 ? 'day' : 'days'}. ` : ''}{s.help}</span>
      {show.map(x => (
        <Link key={x.id} href={x.href} className="xpl-row" style={{ display: 'grid', gap: 2, padding: '8px 10px', borderRadius: 8, background: T.card, border: `1px solid ${x.flag ? tint(T.red, 35) : T.border}`, textDecoration: 'none' }}>
          <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}>
            <b style={{ color: T.text }}>{x.label}</b><span style={{ color: T.text, whiteSpace: 'nowrap' }}>{moneyL(x.value)}</span>
          </span>
          <span style={{ fontSize: 11.5, color: T.faint }}>{x.sub}</span>
          {x.flag && <span style={{ fontSize: 11.5, color: 'var(--x-bad-text)', fontWeight: 600 }}>{x.flag}</span>}
        </Link>
      ))}
      {s.items.length > 4 && <button type="button" onClick={() => setAll(a => !a)} style={{ background: 'none', border: 'none', color: T.orange, fontWeight: 600, fontSize: 12.5, cursor: 'pointer', textAlign: 'left', padding: '2px 0', fontFamily: 'inherit' }}>{all ? 'Show fewer' : `Show all ${s.items.length}`}</button>}
      {s.items.length === 0 && <span style={{ fontSize: 12, color: T.faint }}>Nothing here.</span>}
    </section>
  )
}

function SetupLink({ href, icon, title, sub }: { href: string; icon: React.ReactNode; title: string; sub: string }) {
  return (
    <Link href={href} className="xpl-row" style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 14px', borderRadius: 10, border: `1px solid ${T.border}`, textDecoration: 'none' }}>
      <span aria-hidden style={{ width: 34, height: 34, borderRadius: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: tint(T.orange, 12), color: T.orange }}>{icon}</span>
      <span style={{ display: 'grid', gap: 2 }}><b style={{ fontSize: 13.5, color: T.text }}>{title}</b><span style={{ fontSize: 12, color: T.faint }}>{sub}</span></span>
    </Link>
  )
}
