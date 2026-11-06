'use client'

import { fullDate } from '../../../lib/costing-store'
import { TODAY } from '../../../lib/inventory-store'
import { workOrderProgress, currentPayRate, ruleWords, DEDUCTION_LABEL } from '../../../lib/contracting'
import { day } from '../../../lib/projects'
import { T, Page, Head, Card, Status, Empty, DepthBar } from '../../components/kit'
import { RateSchedule } from '../../components/rate-card'
import { n0, Rows } from '../../admin/contractors/shared'
import { useMe, NoLogin, CLIENT_NAME } from '../me'

/* ==========================================================================
 * WORK ORDER — the terms the contractor is working under
 *
 * Read-only: the client sets a work order and the contractor reads it. These
 * are the same rates and the same deduction rules the bill check uses, so
 * there is nothing on a bill that the contractor could not have read here
 * before he drilled the metre.
 * ========================================================================== */

export default function WorkOrderPage() {
  const { state, me, side } = useMe()
  if (!me) return <NoLogin />

  return (
    <Page>
      <Head title="Work order" sub={<>What {CLIENT_NAME} has asked you to do, what they pay, and what the contract lets them take off a bill. Set by {CLIENT_NAME}; ask them if a figure is wrong.</>} />

      {side.orders.length === 0 && <Card><Empty>{CLIENT_NAME} has not put you on a work order yet.</Empty></Card>}

      {side.orders.map(wo => {
        const p = workOrderProgress(state, wo, TODAY)
        const rate = currentPayRate(wo, TODAY)
        const rules = wo.rules.filter(r => r.on)
        return (
          <Card key={wo.id} title={`${wo.number} · ${wo.project}`} pad={false}
            subtitle={`For ${CLIENT_NAME} · ${day(wo.startDate)} to ${day(wo.endDate)}`}
            right={wo.status === 'closed' ? <Status tone="neutral">Closed</Status> : p.late ? <Status tone="bad">{p.daysLate} days past the finish date</Status> : <Status tone="good">Running</Status>}>
            <div style={{ padding: 18, display: 'grid', gap: 18 }}>
              <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ flex: '0 0 220px' }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: T.faint, marginBottom: 6 }}>Drilled, checked</div>
                  <DepthBar drilled={p.metres} planned={wo.plannedMetres} width="100%" />
                </div>
                <div style={{ flex: '1 1 380px', minWidth: 0 }}>
                  <Rows items={[
                    ['Your rigs on this job', wo.rigs.join(', ')],
                    ['Metres to drill', `${n0(wo.plannedMetres)} m`],
                    ['Still to drill', `${n0(p.plannedLeft)} m`],
                    ['To finish by', day(wo.endDate)],
                    ['Bills paid within', `${wo.paymentDays} days`],
                    ['Core recovery so far', p.metres ? `${p.recoveryPct.toFixed(1)}%` : '—'],
                  ]} />
                </div>
              </div>

              <div className="xpl-split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 18 }}>
                <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 14px', fontSize: 12.5, fontWeight: 700, color: T.text, borderBottom: `1px solid ${T.line}` }}>
                    What you are paid{rate ? <span style={{ fontWeight: 400, color: T.faint }}> · since {fullDate(rate.effectiveFrom)}</span> : null}
                  </div>
                  {rate ? <RateSchedule rate={rate} /> : <Empty>No rates set yet.</Empty>}
                </div>
                <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 14px', fontSize: 12.5, fontWeight: 700, color: T.text, borderBottom: `1px solid ${T.line}` }}>What can be taken off a bill</div>
                  {rules.length === 0 && <Empty>Nothing. Bills are paid as the checked record supports them.</Empty>}
                  {rules.map((r, i) => (
                    <div key={r.id} style={{ padding: '10px 14px', borderTop: i ? `1px solid ${T.line}` : undefined }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{DEDUCTION_LABEL[r.kind]}{r.clause ? <span style={{ fontWeight: 400, color: T.faint }}> · {r.clause}</span> : null}</div>
                      <div style={{ fontSize: 12.5, color: T.muted, marginTop: 3, lineHeight: 1.5 }}>{ruleWords(r)}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ fontSize: 12.5, color: T.faint, lineHeight: 1.6 }}>
                A day lost to your own rig or crew is not paid. A day stopped for a reason that is not yours is paid at the standby rate, once {CLIENT_NAME} agrees the reason.
              </div>
            </div>
          </Card>
        )
      })}
    </Page>
  )
}
