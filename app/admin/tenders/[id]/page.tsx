'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, AlertTriangle, Printer, Plus, Trash2 } from 'lucide-react'
import { useCosting, moneyL, rigPool } from '../../../../lib/costing-store'
import { useInventory, TODAY, FORMATIONS, type Formation } from '../../../../lib/inventory-store'
import { buildRateBook } from '../../../../lib/own-rates'
import { useTenders } from '../../../../lib/tender-store'
import { useInbox } from '../../../components/inbox'
import {
  priceBid, compareQuotes, rigsFree, bandLabel, rateKey, MIX_TOTAL, STATUS_LABEL,
  type Tender, type BidCalc, type QuoteCalc, type RigFree,
} from '../../../../lib/tenders'
import {
  Page, PageHead, Card, Status, Note, Btn, Field, Switch, Table, Empty, T, tint, display,
  th, thR, td, tdR, tdStrong, rowLine, inputStyle, type Tone, num as figure, eyebrow } from '../../../components/kit'
import { CoverageBar, SourceTag, dueWord, day, n0, perM } from '../shared'

/* ==========================================================================
 * ONE TENDER
 *
 * A bid to a client goes in five steps: the job, what your record knows of
 * it, rates band by band, risks and rigs, and the price with the figure to
 * walk away below. Giving work out goes in four: the work, the quotes, the
 * quotes against your own cost and each contractor's record, and the
 * decision. The running summary stays beside the steps on a wide screen.
 * ========================================================================== */

const LAYOUT_CSS = `
.xpl-tender { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 18px; align-items: start; }
.xpl-tender-side { position: sticky; top: 76px; display: grid; gap: 14px; }
@media (max-width: 1100px) { .xpl-tender { grid-template-columns: minmax(0, 1fr); } .xpl-tender-side { position: static; order: -1; } }
@media print { .xpl-tender { grid-template-columns: minmax(0, 1fr); } .xpl-steps, .xpl-noprint { display: none !important; } }
`

type StepState = 'done' | 'attention' | 'todo'
interface Step { key: string; label: string; state: StepState; why?: string }

const statusTone: Record<Tender['status'], Tone> = { pricing: 'warn', sent: 'info', won: 'good', lost: 'bad', dropped: 'neutral' }
const num = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0 }

export default function TenderPage() {
  const { id } = useParams<{ id: string }>()
  const { tenders, save, remove, loaded } = useTenders()
  const t = tenders.find(x => x.id === id)
  // Wait for the saved tenders, so the step it opens on fits where it stands.
  if (!loaded) return <Page>{null}</Page>
  if (!t) return <Page>{loaded ? <PageHead question="This tender is not here" answer={<>It may have been deleted. <Link href="/admin/tenders" style={{ color: T.orange, fontWeight: 600 }}>Back to all tenders</Link></>} /> : null}</Page>
  return t.kind === 'bid' ? <Bid t={t} save={save} remove={remove} /> : <Award t={t} save={save} remove={remove} />
}

type Props = { t: Tender; save: (t: Tender) => void; remove: (id: string) => void }

// ── shared pieces ──────────────────────────────────────────────────────────

function Stepper({ steps, at, go }: { steps: Step[]; at: number; go: (i: number) => void }) {
  return (
    <nav aria-label="Steps" className="xpl-steps xpl-chips" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', position: 'relative', minWidth: 0 }}>
      {steps.map((s, i) => {
        const on = i === at
        const c = s.state === 'done' ? T.green : s.state === 'attention' ? T.amber : T.faint
        return (
          <button key={s.key} type="button" onClick={() => go(i)} aria-current={on ? 'step' : undefined} title={s.why}
            style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 13px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
              border: `1px solid ${on ? T.orange : T.border}`, background: on ? tint(T.orange, 12) : T.card, color: T.text }}>
            <span aria-hidden style={{ width: 20, height: 20, borderRadius: 99, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800,
              background: s.state === 'todo' ? 'rgba(var(--x-ov),0.08)' : tint(c, 18), color: s.state === 'todo' ? T.muted : c }}>
              {s.state === 'done' ? <Check size={12} /> : s.state === 'attention' ? '!' : i + 1}
            </span>
            {s.label}
            <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{s.state === 'done' ? ', done' : s.state === 'attention' ? ', needs a look' : ''}</span>
          </button>
        )
      })}
    </nav>
  )
}

function StepNav({ at, n, go, nextLabel }: { at: number; n: number; go: (i: number) => void; nextLabel?: string }) {
  return (
    <div className="xpl-noprint" style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 4 }}>
      {at > 0 ? <Btn onClick={() => go(at - 1)}><ArrowLeft size={14} aria-hidden />Back</Btn> : <span />}
      {at < n - 1 && <Btn kind="primary" onClick={() => go(at + 1)}>{nextLabel ?? 'Next'}<ArrowRight size={14} aria-hidden /></Btn>}
    </div>
  )
}

function Header({ t, remove, question, answer, tone }: Props & { question: string; answer: React.ReactNode; tone: Tone }) {
  const router = useRouter()
  const due = dueWord(t.due, TODAY)
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: LAYOUT_CSS }} />
      <div className="xpl-noprint" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13 }}>
        <Link href="/admin/tenders" style={{ color: T.muted, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}><ArrowLeft size={14} aria-hidden />All tenders</Link>
        <span style={{ color: T.faint }}>·</span>
        <span style={{ color: T.faint, fontWeight: 600 }}>{t.number}</span>
        <Status tone={statusTone[t.status]}>{STATUS_LABEL[t.kind][t.status]}</Status>
        {t.status === 'pricing' && <Status tone={due.tone}>{due.text}</Status>}
        <span style={{ display: 'inline-block', fontSize: 11.5, fontWeight: 600, padding: '1px 8px', borderRadius: 99, background: tint(T.blue, 12), color: T.text }}>Demo data</span>
      </div>
      <PageHead question={question} answer={answer} tone={tone}
        right={<div className="xpl-noprint" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn onClick={() => window.print()}><Printer size={14} aria-hidden />Print</Btn>
          <Btn kind="danger" onClick={() => { if (window.confirm(`Delete ${t.number}${t.name ? `, ${t.name}` : ''}? This cannot be undone.`)) { remove(t.id); router.push('/admin/tenders') } }}><Trash2 size={14} aria-hidden />Delete</Btn>
        </div>} />
    </>
  )
}

function JobFields({ t, save, sizes, award }: { t: Tender; save: (t: Tender) => void; sizes: string[]; award?: boolean }) {
  const set = <K extends keyof Tender>(k: K, v: Tender[K]) => save({ ...t, [k]: v })
  const mixSum = MIX_TOTAL(t)
  const grid = (min: number): React.CSSProperties => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))`, gap: 14 })
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={grid(220)}>
        <Field label={award ? 'What the work is' : 'Tender name'}><input style={inputStyle} value={t.name} onChange={e => set('name', e.target.value)} placeholder={award ? 'For example, Site B infill holes' : 'For example, West Plateau infill'} /></Field>
        <Field label={award ? 'Client you drill it for' : 'Client'}><input style={inputStyle} value={t.client} onChange={e => set('client', e.target.value)} /></Field>
        <Field label={award ? 'Project or site' : 'Place'}><input style={inputStyle} value={t.place} onChange={e => set('place', e.target.value)} /></Field>
      </div>
      <div style={grid(150)}>
        <Field label="Core size"><select style={inputStyle} value={t.holeSize} onChange={e => set('holeSize', e.target.value)}>
          {Array.from(new Set([...sizes, 'NQ', 'HQ', 'PQ'])).map(s => <option key={s} value={s}>{s}{sizes.includes(s) ? '' : ' (not in your record)'}</option>)}
        </select></Field>
        <Field label="Total metres"><input style={inputStyle} type="number" min={0} value={t.metres || ''} onChange={e => set('metres', Math.max(0, num(e.target.value)))} /></Field>
        <Field label="Average hole depth, m"><input style={inputStyle} type="number" min={0} value={t.avgDepth || ''} onChange={e => set('avgDepth', Math.max(0, num(e.target.value)))} /></Field>
        <Field label="Rigs on the job"><input style={inputStyle} type="number" min={1} value={t.rigs || ''} onChange={e => set('rigs', Math.max(1, Math.round(num(e.target.value))))} /></Field>
        {award && <Field label="Client pays you, per metre" hint="Leave empty if not agreed yet"><input style={inputStyle} type="number" min={0} value={t.clientRate || ''} onChange={e => set('clientRate', num(e.target.value) || undefined)} /></Field>}
      </div>
      <div style={grid(150)}>
        <Field label="Work starts"><input style={inputStyle} type="date" value={t.start} onChange={e => set('start', e.target.value)} /></Field>
        <Field label="Must finish by"><input style={inputStyle} type="date" value={t.finishBy} onChange={e => set('finishBy', e.target.value)} /></Field>
        <Field label={award ? 'Decide by' : 'Price due'}><input style={inputStyle} type="date" value={t.due} onChange={e => set('due', e.target.value)} /></Field>
      </div>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: T.muted, marginBottom: 8 }}>
          Ground, % of metres{mixSum !== 100 && <span style={{ color: 'var(--x-warn-text, #b45309)', marginLeft: 8 }}>adds up to {mixSum}%; shares are scaled to 100</span>}
        </div>
        <div style={grid(140)}>
          {FORMATIONS.map(f => (
            <label key={f} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: T.text, minWidth: 70 }}>{f}</span>
              <input type="number" min={0} max={100} value={t.mix[f] || ''} placeholder="0" aria-label={`${f} ground, per cent`}
                onChange={e => set('mix', { ...t.mix, [f]: Math.max(0, num(e.target.value)) } as Record<Formation, number>)} style={{ ...inputStyle, width: 90 }} />
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}

function useBook() {
  const { state } = useCosting()
  const { state: inv } = useInventory()
  const book = useMemo(() => buildRateBook(state, inv), [state, inv])
  return { state, inv, book }
}

function useRigs(start: string) {
  const { state } = useCosting()
  const inbox = useInbox()
  return useMemo(() => {
    const contractorRigs = new Set((state.workOrders ?? []).flatMap(w => w.rigs))
    const own = rigPool(state).map(r => r.rig).filter(r => !contractorRigs.has(r))
    const all = rigsFree(own, inbox.forecast?.rigs ?? [], TODAY)
    return { all, byStart: all.filter(r => r.freeFrom != null && r.freeFrom <= start) }
  }, [state, inbox.forecast, start])
}

function RigList({ rigs, start }: { rigs: RigFree[]; start: string }) {
  return (
    <div style={{ display: 'grid', gap: 0 }}>
      {rigs.map((r, i) => {
        const ok = r.freeFrom != null && r.freeFrom <= start
        return (
          <div key={r.rig} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderTop: i ? rowLine : 'none', fontSize: 13 }}>
            <span style={{ color: T.text, fontWeight: 600 }}>{r.rig}<span style={{ color: T.faint, fontWeight: 400 }}>{r.project ? ` · ${r.project}` : ' · on no project'}</span></span>
            <span style={{ color: ok ? 'var(--x-good-text)' : T.muted, whiteSpace: 'nowrap' }}>{r.freeFrom == null ? 'Busy past the forecast' : r.freeFrom <= TODAY ? 'Free now' : `Free ${day(r.freeFrom)}`}</span>
          </div>
        )
      })}
    </div>
  )
}

function Big({ label, value, note, tone }: { label: string; value: string; note?: React.ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <div style={{ display: 'grid', gap: 3 }}>
      <span style={{ ...eyebrow }}>{label}</span>
      <span style={{ ...figure, fontSize: 24, fontWeight: 600, color: tone === 'bad' ? 'var(--x-bad-text)' : tone === 'good' ? 'var(--x-good-text)' : T.text, lineHeight: 1.15 }}>{value}</span>
      {note && <span style={{ fontSize: 12, color: T.faint, lineHeight: 1.45 }}>{note}</span>}
    </div>
  )
}

// ── a bid to a client ─────────────────────────────────────────────────────

function Bid({ t, save, remove }: Props) {
  const { book } = useBook()
  const c = useMemo(() => priceBid(book, t), [book, t])
  const rigs = useRigs(t.start)
  const [at, setAt] = useState(t.status === 'pricing' ? 0 : 4)
  const recordMargin = c.recordMarginPct
  const rigsShort = c.rigsNeeded != null && c.rigsNeeded > rigs.byStart.length
  const rigsSet = c.rigsNeeded != null && c.rigsNeeded > t.rigs

  const steps: Step[] = [
    { key: 'job', label: 'The job', state: t.name && t.metres > 0 && t.avgDepth > 0 && MIX_TOTAL(t) > 0 ? 'done' : 'attention', why: 'Name, metres, depth and ground' },
    { key: 'record', label: 'Your record', state: c.coverage.none > 0 || c.coverage.thin + c.coverage.near > 0 ? 'attention' : 'done' },
    { key: 'rates', label: 'Rates by band', state: c.missing > 0 ? 'attention' : 'done' },
    { key: 'risks', label: 'Risks and rigs', state: rigsShort || rigsSet ? 'attention' : 'done' },
    { key: 'price', label: 'Price and send', state: t.status === 'pricing' ? 'todo' : 'done' },
  ]
  const go = (i: number) => { setAt(i); if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' }) }

  const answer = c.avgQuote == null
    ? <>Nothing priced yet. Tell XPLORIX the ground and depth, and it prices each band from what the same metres cost you.</>
    : <>Quote about <b style={{ color: T.text }}>{perM(c.avgQuote)}</b>, {moneyL(c.price)} for {n0(c.priced)} m. Below <b style={{ color: T.text }}>{perM(c.avgWalkAway)}</b> the job loses money.
      {' '}{Math.round(((c.coverage.record) / Math.max(1, c.metres)) * 100)}% of the metres are priced straight from your own drilling{c.missing > 0 ? <>; <b style={{ color: 'var(--x-bad-text)' }}>{n0(c.missing)} m need your figure</b></> : ''}.</>

  return (
    <Page>
      <Header t={t} save={save} remove={remove} question={`What should we quote for ${t.name || 'this tender'}?`} answer={answer} tone={c.missing > 0 ? 'warn' : c.avgQuote != null ? 'good' : 'neutral'} />
      <Stepper steps={steps} at={at} go={go} />
      <div className="xpl-tender">
        <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
          {at === 0 && <Card title="1. The job" subtitle="What the tender asks for. Everything after this follows from it."><JobFields t={t} save={save} sizes={book.sizes} /></Card>}
          {at === 1 && <RecordStep t={t} c={c} />}
          {at === 2 && <RatesStep t={t} c={c} save={save} recordMargin={recordMargin} />}
          {at === 3 && <RisksStep t={t} c={c} save={save} rigs={rigs} />}
          {at === 4 && <PriceStep t={t} c={c} save={save} rigsShort={rigsShort} />}
          <StepNav at={at} n={steps.length} go={go} nextLabel={['See what your record knows', 'Set the rates', 'Risks and rigs', 'Price and send'][at]} />
        </div>
        <aside className="xpl-tender-side" aria-label="The price so far">
          <Card title="The price so far">
            <div style={{ display: 'grid', gap: 14 }}>
              <Big label="Quote" value={perM(c.avgQuote)} note={c.avgQuote != null ? `${moneyL(c.price)} for ${n0(c.priced)} m` : 'Nothing priced yet'} />
              <Big label="Walk away below" value={perM(c.avgWalkAway)} note="Your cost plus the risks you set. Below it, the job loses money." />
              {c.paidBefore != null && <Big label="Clients paid you before" value={perM(c.paidBefore)} note="For the same ground and depth, from your invoices" />}
              <div style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12.5, color: T.muted, fontWeight: 600 }}>Where the cost comes from</span>
                <CoverageBar coverage={c.coverage} total={c.metres} legend />
              </div>
              <div style={{ fontSize: 12.5, color: rigsShort ? 'var(--x-bad-text)' : T.muted, lineHeight: 1.5 }}>
                {c.rigsNeeded != null ? <><b style={{ color: rigsShort ? 'var(--x-bad-text)' : T.text }}>{c.rigsNeeded} {c.rigsNeeded === 1 ? 'rig' : 'rigs'}</b> needed to finish by {day(t.finishBy)}; {rigs.byStart.length} of yours free by {day(t.start)}.</> : 'Set the dates to see the rigs needed.'}
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </Page>
  )
}

function RecordStep({ t, c }: { t: Tender; c: BidCalc }) {
  const pct = (n: number) => `${Math.round((n / Math.max(1, c.metres)) * 100)}%`
  return (
    <>
      <Card title="2. What your record knows of this job" subtitle="Every band of the tender, against the metres you have drilled in the same ground, size and depth.">
        <div style={{ display: 'grid', gap: 14 }}>
          <CoverageBar coverage={c.coverage} total={c.metres} height={14} legend />
          <div style={{ fontSize: 13.5, color: T.text, lineHeight: 1.6 }}>
            {pct(c.coverage.record)} of the metres are ground you have drilled plenty of at this depth.
            {c.coverage.thin > 0 && <> {pct(c.coverage.thin)} rest on a thin record: under 60 m, so one bad week moves the figure.</>}
            {c.coverage.near > 0 && <> {pct(c.coverage.near)} use the same ground at another depth: deeper holes usually cost more a metre.</>}
            {c.coverage.none > 0 && <> <b style={{ color: 'var(--x-bad-text)' }}>{pct(c.coverage.none)} are ground you have never drilled in {t.holeSize}.</b> XPLORIX will not guess these; the next step asks for your figure.</>}
          </div>
        </div>
      </Card>
      <Card title="Band by band" pad={false}>
        <Table>
          <thead><tr><th style={th}>Ground</th><th style={th}>Depth</th><th style={thR}>Metres in the tender</th><th style={th}>Where the cost comes from</th><th style={thR}>Your metres behind it</th><th style={thR}>Metres an hour</th></tr></thead>
          <tbody>
            {c.lines.map(l => (
              <tr key={rateKey(l.formation, l.depth)} style={{ borderTop: rowLine }}>
                <td style={tdStrong}>{l.formation}</td>
                <td style={td}>{bandLabel(l.depth)}</td>
                <td style={tdR}>{n0(l.metres)}</td>
                <td style={td}><SourceTag s={l.source} /></td>
                <td style={tdR}>{l.sample ? `${n0(l.sample)} m` : '—'}</td>
                <td style={tdR}>{l.metresPerHour ? l.metresPerHour.toFixed(2) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  )
}

function RatesStep({ t, c, save, recordMargin }: { t: Tender; c: BidCalc; save: (t: Tender) => void; recordMargin: number | null }) {
  const setRate = (k: string, v: number) => {
    const next = { ...t.yourRates }
    if (v > 0) next[k] = v; else delete next[k]
    save({ ...t, yourRates: next })
  }
  return (
    <>
      <Card title="3. Rates, band by band" subtitle="Cost is all-in: fuel, crew, tooling for that ground, repairs, the rig, and days it could not drill. Standby is quoted at a day rate as usual.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: 14, alignItems: 'end' }}>
          <Field label="Margin to aim for, %" hint={recordMargin != null ? `Your call. Your own drilling made ${recordMargin.toFixed(1)}% on its metres.` : 'Your call.'}>
            <input style={inputStyle} type="number" min={0} max={90} value={t.margin} onChange={e => save({ ...t, margin: Math.min(90, Math.max(0, num(e.target.value))) })} />
          </Field>
          <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.5 }}>Quote = cost × (1 + risks {c.riskPct}%) ÷ (1 − margin {t.margin}%)</div>
        </div>
      </Card>
      {c.lines.some(l => l.source === 'none') && <Note tone="warn">Your record has no metres in some of this ground. Enter what you expect a metre to cost there, from a similar job or your driller&apos;s view. It is marked as your figure on everything that uses it.</Note>}
      <Card title="Rates" pad={false}>
        <Table>
          <thead><tr><th style={th}>Ground</th><th style={th}>Depth</th><th style={thR}>Metres</th><th style={th}>Source</th><th style={thR}>Cost / m</th><th style={thR}>Walk away / m</th><th style={thR}>Quote / m</th><th style={thR}>Clients paid / m</th></tr></thead>
          <tbody>
            {c.lines.map(l => {
              const k = rateKey(l.formation, l.depth)
              const editable = l.source === 'none' || l.source === 'yours'
              return (
                <tr key={k} style={{ borderTop: rowLine }}>
                  <td style={tdStrong}>{l.formation}</td>
                  <td style={td}>{bandLabel(l.depth)}</td>
                  <td style={tdR}>{n0(l.metres)}</td>
                  <td style={td}><SourceTag s={l.source} /></td>
                  <td style={tdR}>{editable
                    ? <input type="number" min={0} aria-label={`Your cost per metre, ${l.formation} ${bandLabel(l.depth)}`} placeholder="Your figure" value={t.yourRates[k] || ''} onChange={e => setRate(k, num(e.target.value))}
                        style={{ ...inputStyle, width: 120, textAlign: 'right', padding: '6px 9px', borderColor: l.source === 'none' ? 'var(--x-red)' : T.border }} />
                    : perM(l.cost)}</td>
                  <td style={tdR}>{perM(l.walkAway)}</td>
                  <td style={{ ...tdR, color: T.text, fontWeight: 700 }}>{perM(l.quote)}</td>
                  <td style={tdR}>{perM(l.paidBefore)}</td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      </Card>
    </>
  )
}

function RisksStep({ t, c, save, rigs }: { t: Tender; c: BidCalc; save: (t: Tender) => void; rigs: ReturnType<typeof useRigs> }) {
  const setRisk = (id: string, patch: Partial<Tender['risks'][number]>) => save({ ...t, risks: t.risks.map(r => r.id === id ? { ...r, ...patch } : r) })
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(380px, 100%), 1fr))', gap: 16, alignItems: 'start' }}>
      <Card title="4. Risks you see" subtitle={`Each adds to the cost before margin. ${c.riskPct}% in all. The figures are starting points: set your own.`}>
        <div style={{ display: 'grid' }}>
          {t.risks.map((r, i) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: i ? rowLine : 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}><Switch on={r.on} onChange={v => setRisk(r.id, { on: v })} label={r.label} /></div>
              <input type="number" min={0} max={50} value={r.pct} aria-label={`${r.label}, per cent`} disabled={!r.on} onChange={e => setRisk(r.id, { pct: Math.min(50, Math.max(0, num(e.target.value))) })}
                style={{ ...inputStyle, width: 70, textAlign: 'right', padding: '6px 8px', opacity: r.on ? 1 : 0.5 }} />
              <span style={{ fontSize: 12.5, color: T.faint }}>%</span>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Rigs and time" subtitle="At the speed your own rigs drilled the same ground.">
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
            <Big label="Rig-days" value={c.rigDays != null ? n0(c.rigDays) : '—'} note={c.timedShare < 0.999 && c.rigDays != null ? `Speed known for ${Math.round(c.timedShare * 100)}% of the metres; the rest at that average` : 'At your own speed'} />
            <Big label="Days to finish" value={String(c.daysAvailable)} note={`${day(t.start)} to ${day(t.finishBy, true)}`} />
            <Big label="Rigs needed" value={c.rigsNeeded != null ? String(c.rigsNeeded) : '—'} tone={c.rigsNeeded != null && c.rigsNeeded > rigs.byStart.length ? 'bad' : undefined} note={`You put ${t.rigs} on the job`} />
          </div>
          {c.rigsNeeded != null && c.rigsNeeded > t.rigs && <Note tone="warn">{t.rigs} {t.rigs === 1 ? 'rig' : 'rigs'} would take {Math.ceil((c.rigDays ?? 0) / t.rigs)} days; the tender gives {c.daysAvailable}. Put {c.rigsNeeded} on it, or ask for a later finish.</Note>}
          {c.rigsNeeded != null && c.rigsNeeded > rigs.byStart.length && <Note tone="bad">Only {rigs.byStart.length} of your rigs are free by {day(t.start)}. Sub-contract the rest or ask for a later start.</Note>}
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: T.muted, marginBottom: 4 }}>Your rigs, and when each is free</div>
            <RigList rigs={rigs.all} start={t.start} />
          </div>
        </div>
      </Card>
    </div>
  )
}

function PriceStep({ t, c, save, rigsShort }: { t: Tender; c: BidCalc; save: (t: Tender) => void; rigsShort: boolean }) {
  const [lose, setLose] = useState(false)
  const [theirs, setTheirs] = useState('')
  const [note, setNote] = useState('')
  const [drop, setDrop] = useState(false)
  const gapToPaid = c.paidBefore != null && c.avgQuote != null ? c.avgQuote - c.paidBefore : null
  const send = () => save({ ...t, status: 'sent', sentOn: TODAY, sentRate: Math.round(c.avgQuote ?? 0) })
  return (
    <>
      <Card title="5. The price" subtitle="How it is built, line by line.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(170px, 100%), 1fr))', gap: 16 }}>
          <Big label="Quote per metre" value={perM(c.avgQuote)} note={`${n0(c.priced)} m priced of ${n0(c.metres)} m`} />
          <Big label="Tender value" value={moneyL(c.price)} />
          <Big label="Walk away below" value={perM(c.avgWalkAway)} note="Cost plus risks, nothing for you" />
          <Big label="Your margin" value={moneyL(c.margin)} tone="good" note={`${t.margin}% of the quote`} />
        </div>
        <div style={{ marginTop: 18 }}>
          <Table>
            <tbody>
              <tr><td style={td}>Cost, from your record and your figures</td><td style={tdR}>{moneyL(c.cost)}</td><td style={tdR}>{perM(c.priced ? c.cost / c.priced : null)}</td></tr>
              <tr style={{ borderTop: rowLine }}><td style={td}>Risks, {c.riskPct}%</td><td style={tdR}>{moneyL(c.riskAllowance)}</td><td style={tdR}>{perM(c.priced ? c.riskAllowance / c.priced : null)}</td></tr>
              <tr style={{ borderTop: rowLine }}><td style={td}>Margin, {t.margin}%</td><td style={tdR}>{moneyL(c.margin)}</td><td style={tdR}>{perM(c.priced ? c.margin / c.priced : null)}</td></tr>
              <tr style={{ borderTop: `2px solid ${T.border}` }}><td style={tdStrong}>Quote</td><td style={{ ...tdR, color: T.text, fontWeight: 800 }}>{moneyL(c.price)}</td><td style={{ ...tdR, color: T.text, fontWeight: 800 }}>{perM(c.avgQuote)}</td></tr>
            </tbody>
          </Table>
        </div>
        {gapToPaid != null && <div style={{ marginTop: 14, fontSize: 13, color: T.muted, lineHeight: 1.55 }}>
          Clients paid you {perM(c.paidBefore)} for the same ground and depth. This quote is {perM(Math.abs(gapToPaid))} {gapToPaid > 0 ? 'above' : 'below'} that.
        </div>}
      </Card>

      {t.status === 'pricing' && (
        <Card title="Send it">
          <div style={{ display: 'grid', gap: 12 }}>
            {c.missing > 0 && <Note tone="bad">{n0(c.missing)} m have no cost yet. Enter your figure for them under Rates by band before you send.</Note>}
            {rigsShort && <Note tone="warn">You do not have the rigs free for this by the start date. See Risks and rigs.</Note>}
            <div className="xpl-noprint" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Btn kind="primary" disabled={c.missing > 0 || c.avgQuote == null} onClick={send}><Check size={14} aria-hidden />Mark as sent at {perM(c.avgQuote)}</Btn>
              <Btn onClick={() => setDrop(d => !d)}>Not bidding…</Btn>
            </div>
            {drop && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input style={{ ...inputStyle, flex: '1 1 260px' }} value={note} onChange={e => setNote(e.target.value)} placeholder="Why not? For example, no rigs free" aria-label="Why not bidding" />
              <Btn kind="danger" disabled={!note.trim()} onClick={() => save({ ...t, status: 'dropped', result: { on: TODAY, note: note.trim() } })}>Not bidding</Btn>
            </div>}
          </div>
        </Card>
      )}

      {t.status === 'sent' && (
        <Card title="What came of it" subtitle={`Sent ${day(t.sentOn)} at ${perM(t.sentRate)}.`}>
          <div className="xpl-noprint" style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Btn kind="good" onClick={() => save({ ...t, status: 'won', result: { on: TODAY } })}><Check size={14} aria-hidden />Won</Btn>
              <Btn kind="danger" onClick={() => setLose(l => !l)}>Lost…</Btn>
              <Btn onClick={() => save({ ...t, status: 'pricing', sentOn: undefined, sentRate: undefined })}>Back to pricing</Btn>
            </div>
            {lose && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 10, alignItems: 'end' }}>
              <Field label="The rate it went at, per metre" hint="If you know it. It shows how far off you were."><input style={inputStyle} type="number" min={0} value={theirs} onChange={e => setTheirs(e.target.value)} /></Field>
              <Field label="Why, as you heard it"><input style={inputStyle} value={note} onChange={e => setNote(e.target.value)} placeholder="For example, went to a lower price" /></Field>
              <Btn kind="danger" onClick={() => save({ ...t, status: 'lost', result: { on: TODAY, note: note.trim() || undefined, winningRate: num(theirs) || undefined } })}>Mark as lost</Btn>
            </div>}
          </div>
        </Card>
      )}

      {(t.status === 'won' || t.status === 'lost' || t.status === 'dropped') && (
        <Card title={t.status === 'won' ? 'Won' : t.status === 'lost' ? 'Lost' : 'Not bid'}>
          <div style={{ display: 'grid', gap: 10, fontSize: 13.5, color: T.text, lineHeight: 1.6 }}>
            <div>
              {t.sentRate ? <>Sent at {perM(t.sentRate)} on {day(t.sentOn, true)}. </> : null}
              {t.result?.winningRate ? <>It went at {perM(t.result.winningRate)}: {perM(Math.abs((t.sentRate ?? 0) - t.result.winningRate))} {(t.sentRate ?? 0) > t.result.winningRate ? 'below' : 'above'} yours. {t.result.winningRate < (c.avgWalkAway ?? 0) ? `That is under your walk-away of ${perM(c.avgWalkAway)}: at that rate you would have lost money.` : `Your walk-away was ${perM(c.avgWalkAway)}, so there was room.`} </> : null}
              {t.result?.note ? <>“{t.result.note}”. </> : null}
              {t.result ? <>Decided {day(t.result.on, true)}.</> : null}
            </div>
            {t.status === 'won' && <div>Set the project up under <Link href="/admin/projects" style={{ color: T.orange, fontWeight: 600 }}>Projects &amp; holes</Link> with the rates you sent, so its costing is measured against this price.</div>}
            <div className="xpl-noprint"><Btn onClick={() => save({ ...t, status: t.sentOn ? 'sent' : 'pricing', result: undefined })}>Reopen</Btn></div>
          </div>
        </Card>
      )}
    </>
  )
}

// ── giving work out ───────────────────────────────────────────────────────

function Award({ t, save, remove }: Props) {
  const { state, inv, book } = useBook()
  const quotes = useMemo(() => compareQuotes(state, inv, t), [state, inv, t])
  const own = useMemo(() => priceBid(book, { ...t, margin: 0 }), [book, t])
  const rigs = useRigs(t.start)
  const [at, setAt] = useState(t.status === 'pricing' ? (t.quotes.length ? 2 : 0) : 3)
  const go = (i: number) => { setAt(i); if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' }) }

  const withRecord = quotes.filter(q => q.record)
  const cheapest = quotes.slice().sort((a, b) => a.perMetre - b.perMetre)[0]
  const steps: Step[] = [
    { key: 'work', label: 'The work', state: t.name && t.metres > 0 ? 'done' : 'attention' },
    { key: 'quotes', label: 'Quotes', state: t.quotes.length >= 2 ? 'done' : t.quotes.length ? 'attention' : 'todo', why: 'Two or more quotes to compare' },
    { key: 'compare', label: 'Compare', state: t.quotes.length ? 'done' : 'todo' },
    { key: 'decide', label: 'Decide', state: t.status === 'won' ? 'done' : 'todo' },
  ]
  const ownFreeNow = rigs.byStart.length
  const answer = !quotes.length ? <>Add the quotes you have. Each is set against what drilling it yourselves costs and what that contractor&apos;s record shows.</>
    : <>{quotes.length} quotes; the lowest is {cheapest.quote.name} at <b style={{ color: T.text }}>{perM(cheapest.perMetre)}</b> with mobilisation{cheapest.record ? '' : ', with no record in your books'}.
      {own.avgWalkAway != null ? <> Drilling it yourselves costs about <b style={{ color: T.text }}>{perM(own.avgWalkAway)}</b>{ownFreeNow ? `, and ${ownFreeNow} of your rigs are free by ${day(t.start)}` : ', but none of your rigs is free by the start'}.</> : null}</>

  return (
    <Page>
      <Header t={t} save={save} remove={remove} question={`Who should drill ${t.name || 'this work'}?`} answer={answer} tone={quotes.length ? 'neutral' : 'warn'} />
      <Stepper steps={steps} at={at} go={go} />
      <div className="xpl-tender">
        <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
          {at === 0 && <Card title="1. The work" subtitle="What you are giving out, and what the client pays you for it."><JobFields t={t} save={save} sizes={book.sizes} award /></Card>}
          {at === 1 && <QuotesStep t={t} save={save} />}
          {at === 2 && <CompareStep t={t} quotes={quotes} own={own} rigs={rigs} withRecord={withRecord.length} />}
          {at === 3 && <DecideStep t={t} save={save} quotes={quotes} />}
          <StepNav at={at} n={steps.length} go={go} nextLabel={['Add the quotes', 'Compare them', 'Decide'][at]} />
        </div>
        <aside className="xpl-tender-side" aria-label="The quotes so far">
          <Card title="The quotes so far">
            <div style={{ display: 'grid', gap: 12 }}>
              {quotes.length === 0 ? <span style={{ fontSize: 13, color: T.muted }}>None yet.</span> : quotes.slice().sort((a, b) => a.perMetre - b.perMetre).map(q => (
                <div key={q.quote.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
                  <span style={{ color: T.text, fontWeight: 600 }}>{q.quote.name}{t.awardedTo === q.quote.id ? ' ✓' : ''}</span>
                  <span style={{ color: T.muted, whiteSpace: 'nowrap' }}>{perM(q.perMetre)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, borderTop: rowLine, paddingTop: 10 }}>
                <span style={{ color: T.text, fontWeight: 600 }}>Your own rigs</span>
                <span style={{ color: T.muted, whiteSpace: 'nowrap' }}>{perM(own.avgWalkAway)}</span>
              </div>
              {t.clientRate ? <div style={{ fontSize: 12.5, color: T.muted }}>The client pays you {perM(t.clientRate)}.</div> : null}
            </div>
          </Card>
        </aside>
      </div>
    </Page>
  )
}

function QuotesStep({ t, save }: { t: Tender; save: (t: Tender) => void }) {
  const { state } = useCosting()
  const known = state.contractors ?? []
  const setQ = (id: string, patch: Partial<Tender['quotes'][number]>) => save({ ...t, quotes: t.quotes.map(q => q.id === id ? { ...q, ...patch } : q) })
  const add = () => save({ ...t, quotes: [...t.quotes, { id: `q_${Date.now()}`, name: '', rate: 0 }] })
  return (
    <Card title="2. The quotes" subtitle="One line a contractor. Pick him from your contractors and XPLORIX brings in his record; someone new has none yet." right={<Btn size="sm" onClick={add}><Plus size={13} aria-hidden />Add a quote</Btn>}>
      {t.quotes.length === 0 ? <Empty>No quotes yet. Add one for each contractor who priced the work.</Empty> : (
        <div style={{ display: 'grid', gap: 14 }}>
          {t.quotes.map((q, i) => (
            <div key={q.id} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))', gap: 10, alignItems: 'end', paddingTop: i ? 14 : 0, borderTop: i ? rowLine : 'none' }}>
              <Field label="Contractor">
                <select style={inputStyle} value={q.contractorId ?? ''} onChange={e => { const c = known.find(k => k.id === e.target.value); setQ(q.id, { contractorId: c?.id, name: c ? c.name : q.contractorId ? '' : q.name }) }}>
                  <option value="">Someone new</option>
                  {known.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                </select>
              </Field>
              {!q.contractorId && <Field label="Name"><input style={inputStyle} value={q.name} onChange={e => setQ(q.id, { name: e.target.value })} /></Field>}
              <Field label="Rate per metre"><input style={inputStyle} type="number" min={0} value={q.rate || ''} onChange={e => setQ(q.id, { rate: num(e.target.value) })} /></Field>
              <Field label="Standby per day"><input style={inputStyle} type="number" min={0} value={q.standbyPerDay || ''} onChange={e => setQ(q.id, { standbyPerDay: num(e.target.value) || undefined })} /></Field>
              <Field label="Mobilisation"><input style={inputStyle} type="number" min={0} value={q.mobilisation || ''} onChange={e => setQ(q.id, { mobilisation: num(e.target.value) || undefined })} /></Field>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}><Btn kind="danger" size="sm" onClick={() => save({ ...t, quotes: t.quotes.filter(x => x.id !== q.id), awardedTo: t.awardedTo === q.id ? undefined : t.awardedTo })}><Trash2 size={13} aria-hidden />Remove</Btn></div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function CompareStep({ t, quotes, own, rigs, withRecord }: { t: Tender; quotes: QuoteCalc[]; own: BidCalc; rigs: ReturnType<typeof useRigs>; withRecord: number }) {
  if (!quotes.length) return <Card title="3. Compare"><Empty>Add the quotes first.</Empty></Card>
  const sorted = quotes.slice().sort((a, b) => a.perMetre - b.perMetre)
  const low = sorted[0]
  const recorded = sorted.filter(q => q.record)
  const fastest = recorded.slice().sort((a, b) => (b.record!.perRigDay) - (a.record!.perRigDay))[0]
  const lines: string[] = []
  lines.push(`Lowest price: ${low.quote.name} at ${perM(low.perMetre)}${low.record ? '' : ', who has never drilled for you, so nothing in your record backs his pace, core or bills'}.`)
  if (recorded.length >= 2) {
    const [a, b] = recorded
    const pace = b.record!.perRigDay ? ` and drilled ${a.record!.perRigDay > b.record!.perRigDay ? 'faster' : 'slower'} for you (${a.record!.perRigDay.toFixed(1)} against ${b.record!.perRigDay.toFixed(1)} m a rig-day)` : ''
    lines.push(`Of those you know, ${a.quote.name} is ${perM(b.perMetre - a.perMetre)} cheaper than ${b.quote.name}${pace}.`)
  }
  if (fastest && fastest.late === false && recorded.some(q => q.late)) lines.push(`At their own pace, only ${recorded.filter(q => q.late === false).map(q => q.quote.name).join(' and ')} would finish by ${day(t.finishBy)}.`)
  if (own.avgWalkAway != null) lines.push(`Your own rigs would cost about ${perM(own.avgWalkAway)}${rigs.byStart.length ? `; ${rigs.byStart.map(r => r.rig).join(', ')} ${rigs.byStart.length === 1 ? 'is' : 'are'} free by ${day(t.start)}` : '; none is free by the start'}.`)

  const row = (label: string, f: (q: QuoteCalc) => React.ReactNode, ownCell: React.ReactNode) => (
    <tr style={{ borderTop: rowLine }}>
      <td style={{ ...td, color: T.text, fontWeight: 600, whiteSpace: 'normal', minWidth: 140, position: 'sticky', left: 0, background: T.card, zIndex: 1 }}>{label}</td>
      {sorted.map(q => <td key={q.quote.id} style={{ ...td, whiteSpace: 'normal', minWidth: 150 }}>{f(q)}</td>)}
      <td style={{ ...td, whiteSpace: 'normal', minWidth: 150, background: 'rgba(var(--x-ov),0.03)' }}>{ownCell}</td>
    </tr>
  )
  const bad = (s: string) => <span style={{ color: 'var(--x-bad-text)', fontWeight: 600 }}>{s}</span>
  const good = (s: string) => <span style={{ color: 'var(--x-good-text)', fontWeight: 600 }}>{s}</span>
  return (
    <>
      <Card title="3. What the quotes and your record say">
        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, fontSize: 13.5, color: T.text, lineHeight: 1.55 }}>
          {lines.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
        {withRecord < quotes.length && <div style={{ marginTop: 10, fontSize: 12.5, color: T.muted }}>A contractor with no record is not worse; there is just nothing to check him against yet. A first job is where the record starts.</div>}
      </Card>
      <Card title="Side by side" subtitle={`For ${n0(t.metres)} m. Pace, core and bills come from each contractor's own shifts and bills in your record.`} pad={false}>
        <Table>
          <thead><tr><th style={{ ...th, position: 'sticky', left: 0, background: T.card, zIndex: 1 }} />{sorted.map(q => <th key={q.quote.id} style={th}>{q.quote.name}{q === low ? ' · lowest' : ''}</th>)}<th style={th}>Your own rigs</th></tr></thead>
          <tbody>
            {row('Rate per metre', q => perM(q.quote.rate), perM(own.priced ? own.cost / own.priced : null))}
            {row('With mobilisation, per metre', q => <b style={{ color: T.text }}>{perM(q.perMetre)}</b>, <b style={{ color: T.text }}>{perM(own.avgWalkAway)}</b>)}
            {row('Whole job', q => moneyL(q.total), moneyL(own.cost + own.riskAllowance))}
            {t.clientRate ? row('You keep, per metre', q => q.keep != null ? (q.keep > 0 ? good(perM(q.keep)) : bad(perM(q.keep))) : '—', own.avgWalkAway != null ? good(perM(t.clientRate - own.avgWalkAway)) : '—') : null}
            {row('Standby per day', q => q.quote.standbyPerDay ? `SAR ${n0(q.quote.standbyPerDay)}` : '—', 'Your own crew and rig')}
            {row('Pace, from your record', q => q.record ? `${q.record.perRigDay.toFixed(1)} m a rig-day` : 'No record', `${own.rigDays != null ? n0(t.metres / own.rigDays) : '—'} m a rig-day`)}
            {row(`Finishes, with ${t.rigs} ${t.rigs === 1 ? 'rig' : 'rigs'}`, q => q.finishOn ? (q.late ? bad(`${day(q.finishOn, true)}, late`) : good(day(q.finishOn, true))) : 'Not known', own.rigDays != null ? day(addDaysLocal(t.start, Math.ceil(own.rigDays / Math.max(1, t.rigs))), true) : '—')}
            {row('Core recovery', q => q.record ? `${q.record.recoveryPct.toFixed(1)}%` : '—', '—')}
            {row('Days stopped by his own rig', q => q.record ? `${q.record.breakdownShare.toFixed(1)}% of rig-days` : '—', '—')}
            {row('Bills claimed above the record', q => q.record ? (q.record.billsOver ? bad(`${q.record.billsOver} of ${q.record.bills}, SAR ${n0(q.record.overBy)} in all`) : good(`None of ${q.record.bills}`)) : '—', '—')}
            {row('Shift reports sent back', q => q.record ? `${q.record.returned} of ${q.record.reports}` : '—', '—')}
            {row('Has cost you, all-in', q => q.record ? perM(q.record.costPerMetre) : '—', '—')}
          </tbody>
        </Table>
      </Card>
    </>
  )
}

const addDaysLocal = (d: string, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10) }

function DecideStep({ t, save, quotes }: { t: Tender; save: (t: Tender) => void; quotes: QuoteCalc[] }) {
  const [pick, setPick] = useState(t.awardedTo ?? quotes[0]?.quote.id ?? '')
  const chosen = quotes.find(q => q.quote.id === (t.awardedTo ?? pick))
  if (t.status === 'won' && chosen) return (
    <Card title="4. Awarded">
      <div style={{ display: 'grid', gap: 10, fontSize: 13.5, color: T.text, lineHeight: 1.6 }}>
        <div>Given to <b>{chosen.quote.name}</b> at {perM(chosen.quote.rate)}{chosen.quote.mobilisation ? ` plus SAR ${n0(chosen.quote.mobilisation)} mobilisation` : ''}, on {day(t.result?.on, true)}.</div>
        <div>Next: raise the work order under <Link href="/admin/contractors" style={{ color: T.orange, fontWeight: 600 }}>Contractors</Link>, with these rates. Every shift and bill he sends is then checked against it.</div>
        <div className="xpl-noprint"><Btn onClick={() => save({ ...t, status: 'pricing', awardedTo: undefined, result: undefined })}>Reopen</Btn></div>
      </div>
    </Card>
  )
  return (
    <Card title="4. Decide">
      {!quotes.length ? <Empty>Add the quotes first.</Empty> : (
        <div style={{ display: 'grid', gap: 12 }}>
          <Field label="Give the work to">
            <select style={inputStyle} value={pick} onChange={e => setPick(e.target.value)}>
              {quotes.map(q => <option key={q.quote.id} value={q.quote.id}>{q.quote.name || 'Unnamed'}, {perM(q.perMetre)}</option>)}
            </select>
          </Field>
          {chosen && chosen.late && <Note tone="warn">At his own pace from your record he finishes {day(chosen.finishOn ?? undefined, true)}, after {day(t.finishBy, true)}.</Note>}
          {chosen && !chosen.record && <Note tone="info">He has no record with you. Agree how shifts and bills will be sent before he starts.</Note>}
          <div className="xpl-noprint" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn kind="primary" disabled={!pick} onClick={() => save({ ...t, status: 'won', awardedTo: pick, result: { on: TODAY } })}><Check size={14} aria-hidden />Award to {quotes.find(q => q.quote.id === pick)?.quote.name || '…'}</Btn>
            <Btn onClick={() => save({ ...t, status: 'dropped', result: { on: TODAY, note: 'Kept for own rigs or dropped' } })}><AlertTriangle size={14} aria-hidden />Not giving it out</Btn>
          </div>
        </div>
      )}
    </Card>
  )
}

