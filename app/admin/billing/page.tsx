'use client'

import { downloadCsv } from '../../../lib/client-record'
import { useAdminOverview } from '../../../lib/admin-overview'
import { Page, Head, Card, Tile, Grid, Btn, Table, Status, Note, th, thR, td, tdR, tdStrong, rowLine, T } from '../../components/kit'

/* BILLING — what XPLORIX charges this company.
 *
 * Kept apart from Finance on purpose. Finance is the contractor's own money:
 * what a hole cost and what the client pays. This screen is the subscription:
 * rigs switched on, days used, and the invoices XPLORIX sent. */

const DAILY_RATE = 10
const PLANS = [
  { name: 'Standard', billing: 'Billed monthly', current: true, adds: 'Digital shift logs, dashboards, XPLORIX insights, unlimited supervisor logins, email support.' },
  { name: 'Growth', billing: 'Billed half-yearly, 8% less', current: false, adds: 'Everything in Standard, plus 24/7 priority support, on-site training, forecasting and downloadable reports.' },
  { name: 'Enterprise', billing: 'Billed yearly, 16% less', current: false, adds: 'Everything in Growth, plus an account manager, custom features, API links and your own branding.' },
]
const INVOICES = [
  { id: 'XPL-2026-010', period: 'October 2026', days: 84, amount: 840, status: 'Pending', due: '2026-11-02' },
  { id: 'XPL-2026-009', period: 'September 2026', days: 59, amount: 590, status: 'Paid', due: '2026-10-02' },
  { id: 'XPL-2026-008', period: 'August 2026', days: 53, amount: 530, status: 'Paid', due: '2026-09-01' },
]

export default function BillingPage() {
  const o = useAdminOverview()
  const rigDays = o.rigs.filter(r => r.project).length * o.dayOfMonth
  const download = (inv: typeof INVOICES[number]) => downloadCsv(inv.id, [
    ['Invoice', 'Period', 'Active rig-days', 'Rate per rig-day (USD)', 'Amount (USD)', 'Status', 'Due'],
    [inv.id, inv.period, inv.days, DAILY_RATE, inv.amount, inv.status, inv.due],
  ])

  return (
    <Page>
      <Head title="Billing" sub="Your XPLORIX subscription. You pay per rig, per day, only while a rig is switched on."
        right={<Btn kind="primary" href="/#contact">Talk to us about plans</Btn>} />

      <Note tone="warn">
        Free trial: 12 days left. Every feature is unlocked until the trial ends. Add a payment method to keep your rigs logging after that.
      </Note>

      <Grid>
        <Tile label="Plan" value="Standard" note="1 admin and 5 operational logins" />
        <Tile label="Rate" value={`$${DAILY_RATE} a day`} note="Per rig that is switched on" />
        <Tile label="This month so far" value={`$${rigDays * DAILY_RATE}`} note={`${rigDays} rig-days up to today`} />
        <Tile label="Payment method" value="Visa ···· 4242" note="Billed monthly" />
      </Grid>

      <Card title="Plans" subtitle="Pricing depends on fleet size. Longer billing periods cost less.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
          {PLANS.map(p => (
            <div key={p.name} style={{ padding: '14px 16px', borderRadius: 10, border: `1px solid ${p.current ? 'color-mix(in srgb, var(--x-orange) 45%, transparent)' : T.border}`, background: p.current ? 'color-mix(in srgb, var(--x-orange) 5%, transparent)' : 'transparent' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14.5, fontWeight: 700, color: T.text }}>{p.name}</span>
                {p.current && <Status tone="info">Your plan</Status>}
              </div>
              <div style={{ fontSize: 12.5, color: T.faint, margin: '5px 0 9px' }}>{p.billing}</div>
              <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.55 }}>{p.adds}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Invoices from XPLORIX" pad={false}>
        <Table>
          <thead><tr><th style={th}>Invoice</th><th style={th}>Period</th><th style={thR}>Active rig-days</th><th style={thR}>Amount</th><th style={th}>Status</th><th style={th}>Due</th><th style={th} /></tr></thead>
          <tbody>
            {INVOICES.map(inv => (
              <tr key={inv.id} style={{ borderBottom: rowLine }}>
                <td style={tdStrong}>{inv.id}</td>
                <td style={td}>{inv.period}</td>
                <td style={tdR}>{inv.days}</td>
                <td style={{ ...tdR, color: T.text, fontWeight: 600 }}>${inv.amount.toFixed(2)}</td>
                <td style={td}><Status tone={inv.status === 'Paid' ? 'good' : 'warn'}>{inv.status}</Status></td>
                <td style={td}>{inv.due}</td>
                <td style={{ ...td, textAlign: 'right' }}><Btn size="sm" onClick={() => download(inv)}>Download</Btn></td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </Page>
  )
}
