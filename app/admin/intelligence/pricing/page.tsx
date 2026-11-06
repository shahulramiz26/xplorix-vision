'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useCosting, money, moneyL, perUnit } from '../../../../lib/costing-store'
import { useInventory, FORMATIONS, type Formation } from '../../../../lib/inventory-store'
import { buildRateBook, priceTender, DEPTH_BANDS, type RigKind, type Confidence } from '../../../../lib/own-rates'
import {
  T, Page, PageHead, Card, Tile, Grid, Seg, Status, Table, Empty, inputStyle,
  th, thR, td, tdR, tdStrong, rowLine, type Tone,
} from '../../../components/kit'
import { IntelTabs } from '../shared'

/* ==========================================================================
 * PRICE A TENDER — from what your own metres cost
 *
 * A tender gives the size, the depth, the metres and the ground. This
 * screen answers with the rate per metre to quote for each ground and depth
 * band, from the company's own record: what those metres cost it last time
 * (all-in), what clients paid for them, and how fast the rigs drilled them.
 * Where the record has no metres in a band it says so, rather than inventing
 * a figure.
 * ========================================================================== */

const confTone: Record<Confidence, Tone> = { high: 'good', medium: 'info', low: 'warn', near: 'warn', none: 'bad' }
const confLabel: Record<Confidence, string> = { high: 'Strong record', medium: 'Some record', low: 'Thin record', near: 'Nearby depth', none: 'No record' }
const bandLabel = (k: string) => DEPTH_BANDS.find(b => b.key === k)?.label ?? k
const n0 = (n: number) => Math.round(n).toLocaleString('en-US')

export default function PriceTender() {
  const { state } = useCosting()
  const { state: inv } = useInventory()
  const book = useMemo(() => buildRateBook(state, inv), [state, inv])

  const sizes = book.sizes.length ? book.sizes : ['HQ']
  const [kind, setKind] = useState<RigKind>('own')
  const [holeSize, setHoleSize] = useState(sizes.includes('HQ') ? 'HQ' : sizes[0])
  const [totalMetres, setTotal] = useState('3000')
  const [avgDepth, setDepth] = useState('250')
  const [rigs, setRigs] = useState('2')
  const [mix, setMix] = useState<Record<Formation, string>>({ Soft: '20', Medium: '30', Hard: '40', 'Very Hard': '10' })
  const recordMargin = (() => { const t = book.totals[kind]; return t.revenue > 0 ? ((t.revenue - t.cost) / t.revenue) * 100 : 25 })()
  /* The margin is the estimator's call. It starts at 30%; the record's own
   * margin is shown beside it, not used for him. */
  const [margin, setMargin] = useState<string>('30')
  const marginPct = Math.min(80, Math.max(0, parseFloat(margin) || 0))

  const mixNum = Object.fromEntries(FORMATIONS.map(f => [f, Math.max(0, parseFloat(mix[f]) || 0)])) as Record<Formation, number>
  const mixSum = FORMATIONS.reduce((s, f) => s + mixNum[f], 0)
  const res = useMemo(() => priceTender(book, {
    holeSize, totalMetres: Math.max(0, parseFloat(totalMetres) || 0), avgDepth: Math.max(0, parseFloat(avgDepth) || 0),
    mix: mixNum, marginPct, rigs: Math.max(1, parseInt(rigs) || 1), kind,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [book, holeSize, totalMetres, avgDepth, JSON.stringify(mixNum), marginPct, rigs, kind])

  const t = book.totals[kind]
  const metresTotal = Math.max(0, parseFloat(totalMetres) || 0)
  const pricedMetres = metresTotal - res.missing
  const avgQuote = pricedMetres > 0 ? res.price / pricedMetres : null
  const sizeCells = book.cells.filter(c => c.kind === kind && c.holeSize === holeSize)

  if (book.totals.own.metres + book.totals.contractor.metres === 0) {
    return <Page><IntelTabs /><PageHead question="What should we quote for this tender?" answer="Your record has no costed metres yet. Once shifts are logged and costs set in Finance, each ground and depth band gets its own figure here." /></Page>
  }

  const field = (label: string, el: React.ReactNode, hint?: string) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: T.faint }}>{label}</span>
      {el}
      {hint && <span style={{ fontSize: 11.5, color: T.faint }}>{hint}</span>}
    </label>
  )

  return (
    <Page>
      <IntelTabs />
      <PageHead question="What has each ground and depth cost you?" tone={res.missing > 0 ? 'warn' : 'good'}
        answer={<>
          {avgQuote != null ? <>At {marginPct}% margin, quote about <b style={{ color: T.text }}>{perUnit(avgQuote)}</b> on average, {moneyL(res.price)} for {n0(pricedMetres)} m. </> : null}
          {res.missing > 0 ? <b style={{ color: T.text }}>{n0(res.missing)} m fall in ground your record has never drilled in {holeSize}; price those separately. </b> : null}
          Worked out from {n0(t.metres)} m of {kind === 'own' ? 'your own rigs' : 'contractors'}&apos; drilling over {t.rigMonths} rig-months. It is your record, not a model.
        </>}
        right={<Seg value={kind} onChange={setKind} options={[{ value: 'own', label: 'Our rigs' }, { value: 'contractor', label: 'Sub-contracted' }]} />} />

      <Card title="Try a job" subtitle="A quick what-if. To price a real tender and keep it, use Tenders.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
          {field('Core size', <select value={holeSize} onChange={e => setHoleSize(e.target.value)} style={inputStyle} aria-label="Core size">{Array.from(new Set([...sizes, 'NQ', 'HQ', 'PQ'])).map(s => <option key={s} value={s}>{s}{sizes.includes(s) ? '' : ' (not in your record)'}</option>)}</select>)}
          {field('Total metres', <input type="number" min={0} value={totalMetres} onChange={e => setTotal(e.target.value)} style={inputStyle} aria-label="Total metres" />)}
          {field('Average hole depth, m', <input type="number" min={0} value={avgDepth} onChange={e => setDepth(e.target.value)} style={inputStyle} aria-label="Average hole depth" />)}
          {field('Rigs on the job', <input type="number" min={1} value={rigs} onChange={e => setRigs(e.target.value)} style={inputStyle} aria-label="Rigs" />)}
          {field('Margin to aim for, %', <input type="number" min={0} max={80} value={margin} onChange={e => setMargin(e.target.value)} style={inputStyle} aria-label="Margin" />,
            `Your choice. Your record made ${recordMargin.toFixed(1)}% on metres`)}
        </div>
        <div style={{ marginTop: 16, fontSize: 11.5, fontWeight: 600, color: T.faint }}>Ground, % of metres{mixSum !== 100 && <span style={{ color: T.amber, marginLeft: 8 }}>adds up to {mixSum}%: shares are scaled to 100</span>}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 14, marginTop: 6 }}>
          {FORMATIONS.map(f => (
            <label key={f} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: T.text, minWidth: 74 }}>{f}</span>
              <input type="number" min={0} max={100} value={mix[f]} onChange={e => setMix(m => ({ ...m, [f]: e.target.value }))} style={{ ...inputStyle, width: 80 }} aria-label={`${f} ground per cent`} />
            </label>
          ))}
        </div>
      </Card>

      <Grid min={175}>
        <Tile label="Quote, all metres priced" value={moneyL(res.price)} note={avgQuote != null ? `${perUnit(avgQuote)} on average` : 'Nothing in the record to price from'} />
        <Tile label="Cost, from your record" value={moneyL(res.cost)} note={pricedMetres > 0 ? `${perUnit(res.cost / pricedMetres)} all-in` : undefined} />
        <Tile label="Profit at this quote" value={moneyL(res.profit)} tone={res.profit > 0 ? 'good' : 'bad'} note={`${marginPct}% of the quote`} />
        <Tile label="Time at your speed" value={res.calendarDays != null ? `${Math.ceil(res.calendarDays)} days` : '—'}
          note={res.rigDays != null ? `${Math.ceil(res.rigDays)} rig-days at ${book.drillHoursPerRigDay[kind].toFixed(1)} drilling h a day${res.timedMetres < metresTotal - 0.5 ? `, for the ${n0(res.timedMetres)} m with a speed in the record` : ''}` : 'No speed in the record for this ground'} />
        <Tile label="Metres not in your record" value={`${n0(res.missing)} m`} tone={res.missing ? 'warn' : 'good'} note={res.missing ? 'Price these separately' : 'Every band has a figure'} />
      </Grid>

      <Card title="Rates to quote, band by band" pad={false}
        subtitle="Cost per metre is all-in: fuel, crew, tooling for that ground, repairs, the rig, and days it could not drill. Standby is left out; quote it at a day rate as usual.">
        <Table>
          <thead><tr>
            <th style={th}>Ground</th><th style={th}>Depth</th><th style={thR}>Metres</th><th style={thR}>Your cost / m</th><th style={thR}>Quote / m</th>
            <th style={thR}>Clients paid / m</th><th style={thR}>Metres an hour</th><th style={th}>How sure</th><th style={th}>Where the figure comes from</th>
          </tr></thead>
          <tbody>
            {res.lines.map(l => (
              <tr key={`${l.formation}${l.depth}`} style={{ borderTop: rowLine }}>
                <td style={tdStrong}>{l.formation}</td>
                <td style={td}>{bandLabel(l.depth)}</td>
                <td style={tdR}>{n0(l.metres)}</td>
                <td style={tdR}>{l.costPerMetre != null ? money(Math.round(l.costPerMetre)) : '—'}</td>
                <td style={{ ...tdR, color: T.text, fontWeight: 700 }}>{l.quotePerMetre != null ? money(Math.round(l.quotePerMetre)) : '—'}</td>
                <td style={tdR}>{l.paidBefore != null ? money(Math.round(l.paidBefore)) : '—'}</td>
                <td style={tdR}>{l.metresPerHour != null ? l.metresPerHour.toFixed(2) : '—'}</td>
                <td style={td}><Status tone={confTone[l.confidence]}>{confLabel[l.confidence]}{l.sample && l.confidence !== 'near' ? ` · ${n0(l.sample)} m` : ''}</Status></td>
                <td style={{ ...td, whiteSpace: 'normal', minWidth: 220, color: l.costPerMetre == null ? T.amber : T.muted }}>{l.basis}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card title={`Your record in ${holeSize}`} pad={false}
        subtitle={`Every ground and depth band you have drilled in ${holeSize} with ${kind === 'own' ? 'your own rigs' : 'contractors'}. A band with under 60 m behind it is a thin record: one hole, one bit, one bad week.`}
        right={<Link href="/admin/tenders" style={{ fontSize: 12.5, color: T.orange, fontWeight: 600, textDecoration: 'none' }}>Price a tender →</Link>}>
        {sizeCells.length === 0 ? <Empty>No {holeSize} metres in the record{kind === 'contractor' ? ' from contractors' : ''} yet.</Empty> : (
          <Table>
            <thead><tr><th style={th}>Ground</th>{DEPTH_BANDS.map(b => <th key={b.key} style={thR}>{b.label}</th>)}</tr></thead>
            <tbody>
              {FORMATIONS.map(f => (
                <tr key={f} style={{ borderTop: rowLine }}>
                  <td style={tdStrong}>{f}</td>
                  {DEPTH_BANDS.map(b => {
                    const c = sizeCells.find(x => x.formation === f && x.depth === b.key)
                    return (
                      <td key={b.key} style={{ ...tdR, verticalAlign: 'top' }}>
                        {c ? <>
                          <div style={{ color: T.text, fontWeight: 600 }}>{money(Math.round(c.costPerMetre))}/m</div>
                          <div style={{ fontSize: 11.5, color: T.faint }}>{n0(c.metres)} m{c.ratePerMetre ? ` · paid ${money(Math.round(c.ratePerMetre))}` : ''}</div>
                        </> : <span style={{ color: T.faint }}>—</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </Page>
  )
}
