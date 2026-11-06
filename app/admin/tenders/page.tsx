'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Plus, Handshake } from 'lucide-react'
import { useCosting, moneyL } from '../../../lib/costing-store'
import { useInventory, TODAY } from '../../../lib/inventory-store'
import { buildRateBook } from '../../../lib/own-rates'
import { useTenders } from '../../../lib/tender-store'
import { priceBid, compareQuotes, tenderStats, blankTender, STATUS_LABEL, type Tender } from '../../../lib/tenders'
import { Page, PageHead, Card, Status, Empty, Btn, T, tint, display, rowLine, type Tone, num, eyebrow } from '../../components/kit'
import { CoverageBar, dueWord, day, n0, perM } from './shared'

/* ==========================================================================
 * TENDERS — the list
 *
 * What needs pricing and by when, what is out and waiting, and what was won
 * and lost and at what rate. Two ways in: price a tender for a client, or
 * give work out to a sub-contractor.
 * ========================================================================== */

const statusTone: Record<Tender['status'], Tone> = { pricing: 'warn', sent: 'info', won: 'good', lost: 'bad', dropped: 'neutral' }

export default function TendersPage() {
  const router = useRouter()
  const { state } = useCosting()
  const { state: inv } = useInventory()
  const { tenders, save } = useTenders()
  const book = useMemo(() => buildRateBook(state, inv), [state, inv])
  const recordMargin = book.totals.own.revenue > 0 ? ((book.totals.own.revenue - book.totals.own.cost) / book.totals.own.revenue) * 100 : 30
  const stats = tenderStats(tenders)

  const pricing = tenders.filter(t => t.status === 'pricing').sort((a, b) => a.due.localeCompare(b.due))
  const waiting = tenders.filter(t => t.status === 'sent')
  const decided = tenders.filter(t => t.status === 'won' || t.status === 'lost' || t.status === 'dropped').sort((a, b) => (b.result?.on ?? b.createdAt).localeCompare(a.result?.on ?? a.createdAt))

  const start = (kind: Tender['kind']) => {
    // The next number in the year, after the highest one used.
    const prefix = `${kind === 'bid' ? 'T' : 'A'}-${TODAY.slice(0, 4)}-`
    const n = Math.max(0, ...tenders.filter(t => t.number.startsWith(prefix)).map(t => parseInt(t.number.slice(prefix.length)) || 0)) + 1
    const t = blankTender(kind, n, TODAY, Math.floor(recordMargin / 5) * 5)
    save(t); router.push(`/admin/tenders/${t.id}`)
  }

  const first = pricing[0]
  const decidedBids = stats.won + stats.lost
  return (
    <Page>
      <PageHead question="Which tenders need you?" tone={first && dueWord(first.due, TODAY).tone === 'bad' ? 'bad' : pricing.length ? 'warn' : 'good'}
        answer={<>
          {pricing.length ? <>{pricing.length} to price or give out; the first, <b style={{ color: T.text }}>{first.name}</b>, is {(w => w.charAt(0).toLowerCase() + w.slice(1))(dueWord(first.due, TODAY).text)}. </> : 'Nothing to price right now. '}
          {stats.waiting ? `${stats.waiting} sent and waiting for an answer. ` : ''}
          {decidedBids ? <>Won {stats.won} of {decidedBids} decided{stats.lostOnPrice.n ? `; lost on price by ${perM(stats.lostOnPrice.gap)} on average` : ''}. </> : null}
          <span style={{ display: 'inline-block', fontSize: 11.5, fontWeight: 600, padding: '1px 8px', borderRadius: 99, background: tint(T.blue, 12), color: T.text }}>Demo data</span>
        </>}
        right={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn kind="primary" onClick={() => start('bid')}><Plus size={15} aria-hidden />Price a tender</Btn>
          <Btn onClick={() => start('award')}><Handshake size={15} aria-hidden />Give work out</Btn>
        </div>} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 14 }}>
        <Stat label="To price or give out" value={String(pricing.length)} note={first ? `Next due ${day(first.due)}` : 'None'} />
        <Stat label="Sent, waiting" value={String(stats.waiting)} note={waiting[0] ? `${waiting[0].name}, sent ${day(waiting[0].sentOn)}` : 'None'} />
        <Stat label="Won of decided" value={decidedBids ? `${stats.won} of ${decidedBids}` : '—'} note={decidedBids ? 'Bids to clients' : 'No answers yet'} />
        <Stat label="Your metres behind a price" value={`${n0(book.totals.own.metres)} m`} note={`From ${book.totals.own.rigMonths} rig-months of your own drilling`} />
      </div>

      <Card title="To price or give out" subtitle="Soonest due first. Each shows how much of it your own record can price." pad={false}>
        {pricing.length === 0 ? <Empty>Nothing to price. Start one with Price a tender or Give work out.</Empty>
          : pricing.map((t, i) => <Row key={t.id} t={t} first={i === 0} book={book} state={state} inv={inv} />)}
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(460px, 100%), 1fr))', gap: 16, alignItems: 'start' }}>
        <Card title="Sent, waiting for an answer" pad={false}>
          {waiting.length === 0 ? <Empty>Nothing out.</Empty> : waiting.map((t, i) => <Row key={t.id} t={t} first={i === 0} book={book} state={state} inv={inv} />)}
        </Card>
        <Card title="Decided" subtitle="What you sent, and what came of it." pad={false}>
          {decided.length === 0 ? <Empty>No answers yet.</Empty> : decided.map((t, i) => <Row key={t.id} t={t} first={i === 0} book={book} state={state} inv={inv} />)}
        </Card>
      </div>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13, color: T.muted }}>
        <Link href="/admin/intelligence/pricing" style={{ color: T.orange, fontWeight: 600, textDecoration: 'none' }}>Your rate book, band by band →</Link>
        <span>Every rate here comes from that book: what each ground and depth has cost you.</span>
      </div>
    </Page>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '14px 16px', display: 'grid', gap: 4, boxShadow: 'var(--x-card-shadow)' }}>
      <span style={{ ...eyebrow }}>{label}</span>
      <span style={{ ...num, fontSize: 24, fontWeight: 600, color: T.text }}>{value}</span>
      <span style={{ fontSize: 12, color: T.faint }}>{note}</span>
    </div>
  )
}

function Row({ t, first, book, state, inv }: { t: Tender; first: boolean; book: ReturnType<typeof buildRateBook>; state: Parameters<typeof compareQuotes>[0]; inv: Parameters<typeof compareQuotes>[1] }) {
  const due = dueWord(t.due, TODAY)
  const bid = t.kind === 'bid' ? priceBid(book, t) : null
  const quotes = t.kind === 'award' ? compareQuotes(state, inv, t) : []
  const cheapest = quotes.slice().sort((a, b) => a.perMetre - b.perMetre)[0]
  let line: React.ReactNode
  if (t.status === 'won' || t.status === 'lost') {
    line = <>{t.kind === 'bid' ? `Sent at ${perM(t.sentRate)}` : ''}{t.result?.winningRate ? `; went at ${perM(t.result.winningRate)}` : ''}{t.result?.note ? ` · ${t.result.note}` : ''}{t.result ? ` · ${day(t.result.on)}` : ''}</>
  } else if (t.status === 'sent') {
    line = <>Sent {day(t.sentOn)} at {perM(t.sentRate)}, {moneyL((t.sentRate ?? 0) * t.metres)} in all</>
  } else if (bid) {
    line = <>{bid.avgQuote != null ? <>Quote so far {perM(bid.avgQuote)}, walk away below {perM(bid.avgWalkAway)}</> : 'Nothing priced yet'}{bid.missing > 0 ? <b style={{ color: 'var(--x-bad-text)' }}> · {n0(bid.missing)} m your record cannot price</b> : null}</>
  } else {
    line = <>{quotes.length} {quotes.length === 1 ? 'quote' : 'quotes'}{cheapest ? `; lowest ${perM(cheapest.perMetre)} from ${cheapest.quote.name}` : ''}{t.clientRate ? ` · the client pays ${perM(t.clientRate)}` : ''}</>
  }
  return (
    <Link href={`/admin/tenders/${t.id}`} className="xpl-row" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 14, padding: '14px 18px', borderTop: first ? 'none' : rowLine, textDecoration: 'none', alignItems: 'center' }}>
      <div style={{ minWidth: 0, display: 'grid', gap: 5 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: T.faint, fontWeight: 600 }}>{t.number}</span>
          <span style={{ fontSize: 14.5, fontWeight: 700, color: T.text }}>{t.name || 'New tender'}</span>
          <Status tone={statusTone[t.status]}>{STATUS_LABEL[t.kind][t.status]}</Status>
          {t.kind === 'award' && <Status tone="neutral">Giving out</Status>}
          {t.status === 'pricing' && <Status tone={due.tone}>{due.text}</Status>}
        </div>
        <div style={{ fontSize: 12.5, color: T.muted }}>{[t.client, t.place].filter(Boolean).join(' · ')}{t.client || t.place ? ' · ' : ''}{n0(t.metres)} m {t.holeSize}, holes to {n0(t.avgDepth)} m</div>
        <div style={{ fontSize: 12.5, color: T.muted }}>{line}</div>
        {bid && t.status === 'pricing' && <div style={{ maxWidth: 420 }}><CoverageBar coverage={bid.coverage} total={bid.metres} height={6} /></div>}
      </div>
      <ArrowRight size={16} color={T.faint} aria-hidden />
    </Link>
  )
}
