'use client'

import { DeptInbox } from '../../components/inbox'
import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCosting, monthLabel, monthShort, projectCode } from '../../../lib/costing-store'
import { IS_DEMO } from '../../../lib/company'
import { useInventory, TODAY } from '../../../lib/inventory-store'
import { financeLink } from '../../../lib/admin-overview'
import { words, workOrderProgress, unbilled, contractorOf, type Wording } from '../../../lib/contracting'
import { compareParties, monthsOnProject, type PartyRow } from '../../../lib/contracting-view'
import { day } from '../../../lib/projects'
import { T, tint, Page, Head, Card, Tile, Grid, Btn, Note, Seg, Status, Empty, Table, Meter, DepthBar, th, thR, td, tdR, rowLine, inputStyle } from '../../components/kit'
import { ReportsTab } from './reports'
import { OrdersTab } from './orders'
import { BillsTab } from './bills'
import { n0, rs, pc, RunTag, LoginState } from './shared'

/* ==========================================================================
 * CONTRACTORS — rigs that drill for you, next to your own
 *
 * Any company on XPLORIX can run its own rigs and hire contractors on the same
 * project. This screen is the paying side of that:
 *
 *   Compare         own rigs and contractors' rigs on the same measures
 *   Daily reports   their shifts, checked before they count
 *   Work orders     who is here, on what rates, with what deductions
 *   Bills           what they ask for against what the record supports
 *
 * The contractor's own costs are never asked for and never shown: what his
 * rig costs him is his business. What it costs you is his rate.
 * ========================================================================== */

type Tab = 'compare' | 'reports' | 'orders' | 'bills'

function ContractorsScreen() {
  const { state, setWording } = useCosting()
  const { state: inv } = useInventory()
  const router = useRouter()
  const params = useSearchParams()
  const w = words(state.wording)

  const projects = useMemo(() => state.projects.filter(p => p.status !== 'completed' || state.workOrders.some(o => o.project === p.name)).map(p => p.name), [state.projects, state.workOrders])
  const withOrders = projects.filter(p => state.workOrders.some(o => o.project === p))
  const [project, setProject] = useState(withOrders[0] ?? projects[0] ?? '')
  const [tab, setTab] = useState<Tab>('compare')
  const [month, setMonth] = useState<string>('all')
  const [newOrder, setNewOrder] = useState(false)

  useEffect(() => {
    const t = params.get('tab'), p = params.get('project')
    if (t && ['compare', 'reports', 'orders', 'bills'].includes(t)) setTab(t as Tab)
    if (p && projects.includes(p)) setProject(p)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])
  const go = (t: Tab) => { setTab(t); router.replace(`/admin/contractors?tab=${t}&project=${encodeURIComponent(project)}`, { scroll: false }) }

  const orders = useMemo(() => state.workOrders.filter(o => o.project === project), [state.workOrders, project])
  const months = useMemo(() => monthsOnProject(state, project), [state, project])
  useEffect(() => { if (month !== 'all' && !months.includes(month)) setMonth('all') }, [months, month])
  const cmp = useMemo(() => compareParties(state, inv, project, month === 'all' ? [] : [month]), [state, inv, project, month])
  const waiting = state.contractorReports.filter(r => r.project === project && r.status === 'waiting').length
  const billsToCheck = state.contractorBills.filter(b => b.project === project && b.status === 'received').length
  const owed = orders.reduce((s, o) => s + (unbilled(state, o, TODAY)?.net ?? 0), 0)

  if (!project) return <Page><Card><Empty>No projects yet. Create one under Projects first.</Empty></Card></Page>

  const share = cmp.total.metres ? (cmp.out.metres / cmp.total.metres) * 100 : 0
  const best = Math.max(...cmp.rigs.map(r => r.perRigDay), 1)
  const periodWords = month === 'all' ? 'since the project started' : `in ${monthLabel(month)}`

  const row = (r: PartyRow, group?: boolean) => (
    <tr key={`${group ? 'g' : 'r'}_${r.key}`} className={group ? undefined : 'xpl-row'} style={{ borderBottom: rowLine, background: group ? 'rgba(var(--x-ov),0.03)' : undefined }}>
      <td style={{ ...td, color: T.text, fontWeight: group ? 700 : 500, paddingLeft: group ? 12 : 28, whiteSpace: 'normal', minWidth: 190 }}>
        {group
          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{r.name}{r.kind === 'contractor' && <RunTag own={false} label={w.out} />}</span>
          : <Link href={financeLink({ project, rig: r.rig!, month: month === 'all' ? months[months.length - 1] ?? TODAY.slice(0, 7) : month })} style={{ color: T.text, textDecoration: 'none' }}>{r.name}</Link>}
      </td>
      <td style={tdR}>{group ? r.rigs : ''}</td>
      <td style={tdR}>{r.days}</td>
      <td style={{ ...tdR, color: T.text, fontWeight: 600 }}>{n0(r.metres)}</td>
      <td style={{ ...td, minWidth: 150 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ width: 34, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.text }}>{r.perRigDay.toFixed(1)}</span>
          <div style={{ flex: 1 }}><Meter value={r.perRigDay} max={best} color={r.kind === 'own' ? T.blue : T.orange} /></div>
        </div>
      </td>
      <td style={tdR}>{r.metres ? pc(r.recoveryPct) : '—'}</td>
      <td style={tdR}>{r.breakdownDays || '—'}</td>
      <td style={tdR}>{r.standbyDays || '—'}</td>
      <td style={tdR}>{r.metres ? rs(r.costPerMetre) : '—'}</td>
      <td style={tdR}>{r.metres ? rs(r.ratePerMetre) : '—'}</td>
      <td style={{ ...tdR, color: T.text, fontWeight: 600 }}>{r.metres ? rs(r.marginPerMetre) : '—'}</td>
    </tr>
  )

  return (
    <Page>
      <Head title="Contractors"
        sub="Rigs that drill for you under a work order, beside your own. Their shifts are checked here before a metre is paid for or billed to your client."
        right={<>
          <select value={project} onChange={e => setProject(e.target.value)} aria-label="Project" style={{ ...inputStyle, width: 'auto', cursor: 'pointer', fontWeight: 600 }}>
            {projects.map(p => <option key={p} value={p}>{projectCode(p)} · {p}</option>)}
          </select>
          <Btn kind="primary" onClick={() => { setTab('orders'); setNewOrder(true) }}>New work order</Btn>
        </>} />

      <DeptInbox depts={['contractors']} name="Contractors" />

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Seg<Tab> value={tab} onChange={go} options={[
          { value: 'compare', label: 'Own and contractors' },
          { value: 'reports', label: `Daily reports${waiting ? ` · ${waiting}` : ''}` },
          { value: 'orders', label: `Work orders${orders.length ? ` · ${orders.length}` : ''}` },
          { value: 'bills', label: `Bills${billsToCheck ? ` · ${billsToCheck}` : ''}` },
        ]} />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: T.faint }}>
          Words used
          <select value={state.wording ?? 'standard'} onChange={e => setWording(e.target.value as Wording)} style={{ ...inputStyle, width: 'auto', padding: '6px 10px', fontSize: 12.5, cursor: 'pointer' }}>
            <option value="standard">Own / Contractor</option>
            <option value="psu">Departmental / Outsourced</option>
          </select>
        </label>
      </div>

      {tab === 'compare' && (
        <>
          {orders.length === 0 ? (
            <Card><Empty>
              Every rig on {project} is your own, so there is nothing to compare yet.<br />
              Create a work order to bring a contractor&apos;s rigs onto the project.
            </Empty></Card>
          ) : (
            <>
              {(waiting > 0 || billsToCheck > 0) && (
                <Note tone="warn">
                  <b style={{ color: T.text }}>Waiting for you: </b>
                  {waiting > 0 && <><button type="button" onClick={() => go('reports')} style={{ background: 'none', border: 'none', padding: 0, color: T.orange, fontWeight: 600, cursor: 'pointer', font: 'inherit' }}>{waiting} {waiting === 1 ? 'shift' : 'shifts'} to check</button>{billsToCheck > 0 ? ' and ' : '.'}</>}
                  {billsToCheck > 0 && <><button type="button" onClick={() => go('bills')} style={{ background: 'none', border: 'none', padding: 0, color: T.orange, fontWeight: 600, cursor: 'pointer', font: 'inherit' }}>{billsToCheck} {billsToCheck === 1 ? 'bill' : 'bills'} to check</button>.</>}
                  {' '}Unchecked shifts are not in any figure below.
                </Note>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <Seg<string> value={month} onChange={setMonth} options={[{ value: 'all', label: 'Whole project' }, ...months.slice(-5).map(m => ({ value: m, label: monthShort(m) }))]} />
              </div>

              <Grid min={215}>
                <Tile label={`Metres ${periodWords}`} value={`${n0(cmp.total.metres)} m`}
                  note={`${w.ownRigs} ${n0(cmp.own.metres)} m · ${w.outRigs.toLowerCase()} ${n0(cmp.out.metres)} m (${share.toFixed(0)}%)`} />
                <Tile label="What a metre costs you" value={cmp.own.metres ? rs(cmp.own.costPerMetre) : '—'}
                  note={`on your ${w.ownLower} rigs · ${cmp.out.metres ? rs(cmp.out.costPerMetre) : '—'} on ${w.outLower} rigs`} />
                <Tile label="What a metre leaves you" value={cmp.own.metres ? rs(cmp.own.marginPerMetre) : '—'}
                  note={`on your ${w.ownLower} rigs · ${cmp.out.metres ? rs(cmp.out.marginPerMetre) : '—'} on ${w.outLower} rigs`} />
                <Tile label="Owed to contractors, not billed yet" value={rs(owed)} note="Checked work since their last bills" />
              </Grid>

              <Card title={`${w.ownRigs} against ${w.outRigs.toLowerCase()}`} pad={false}
                subtitle="Every rig on the same measures, from the same checked record. Click a rig to open it in Finance.">
                <Table>
                  <thead><tr>
                    <th style={th}>Who drilled</th><th style={thR}>Rigs</th><th style={thR}>Days worked</th><th style={thR}>Metres</th><th style={th}>Metres a rig-day</th>
                    <th style={thR}>Core recovery</th><th style={thR}>Days lost, own</th><th style={thR}>Days stood by</th>
                    <th style={thR}>Costs you / m</th><th style={thR}>Client pays / m</th><th style={thR}>Leaves you / m</th>
                  </tr></thead>
                  <tbody>
                    {cmp.own.days > 0 && row({ ...cmp.own, name: w.ownRigs }, true)}
                    {cmp.rigs.filter(r => r.kind === 'own').map(r => row(r))}
                    {cmp.contractors.map(c => [row(c, true), ...cmp.rigs.filter(r => r.workOrder?.contractorId === c.key).map(r => row(r))])}
                    <tr style={{ borderTop: `2px solid ${T.border}` }}>
                      <td style={{ ...td, color: T.text, fontWeight: 700 }}>Whole project</td>
                      <td style={tdR}>{cmp.total.rigs}</td><td style={tdR}>{cmp.total.days}</td>
                      <td style={{ ...tdR, color: T.text, fontWeight: 700 }}>{n0(cmp.total.metres)}</td>
                      <td style={td}><span style={{ display: 'inline-block', width: 34, textAlign: 'right', color: T.text }}>{cmp.total.perRigDay.toFixed(1)}</span></td>
                      <td style={tdR}>{cmp.total.metres ? pc(cmp.total.recoveryPct) : '—'}</td>
                      <td style={tdR}>{cmp.total.breakdownDays || '—'}</td><td style={tdR}>{cmp.total.standbyDays || '—'}</td>
                      <td style={tdR}>{rs(cmp.total.costPerMetre)}</td><td style={tdR}>{rs(cmp.total.ratePerMetre)}</td>
                      <td style={{ ...tdR, color: T.text, fontWeight: 700 }}>{rs(cmp.total.marginPerMetre)}</td>
                    </tr>
                  </tbody>
                </Table>
                <div style={{ padding: '12px 18px', borderTop: rowLine, fontSize: 12.5, color: T.faint, lineHeight: 1.6 }}>
                  What a metre costs you: on your own rig it is fuel, crew, repairs, parts and the rig itself; on a contractor&apos;s rig it is the rate in the work order,
                  before any deduction on the bill. A day lost to a contractor&apos;s own breakdown costs you nothing but the metres. The contractor&apos;s own costs stay with the contractor and are not shown here.
                </div>
              </Card>

              {cmp.hasBoth && (
                <Note tone="info">
                  <b style={{ color: T.text }}>Reading it.</b>{' '}
                  {cmp.own.marginPerMetre >= cmp.out.marginPerMetre
                    ? <>A metre from your own rigs leaves you {rs(cmp.own.marginPerMetre)}; a metre from a contractor leaves {rs(cmp.out.marginPerMetre)}. </>
                    : <>A contractor&apos;s metre leaves you {rs(cmp.out.marginPerMetre)}, more than the {rs(cmp.own.marginPerMetre)} from your own rigs. </>}
                  The contractors drilled {share.toFixed(0)}% of the metres and brought in {cmp.total.margin > 0 ? ((cmp.out.margin / cmp.total.margin) * 100).toFixed(0) : 0}% of the margin{' '}
                  ({rs(cmp.out.margin)} of {rs(cmp.total.margin)}) {periodWords}.
                </Note>
              )}

              <Card title="Contractors on this project" pad={false} right={<Btn size="sm" onClick={() => go('orders')}>Open work orders</Btn>}>
                {orders.map((wo, i) => {
                  const p = workOrderProgress(state, wo, TODAY)
                  const c = contractorOf(state, wo.contractorId)
                  const wait = state.contractorReports.filter(r => r.workOrderId === wo.id && r.status === 'waiting').length
                  return (
                    <div key={wo.id} className="xpl-prow" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr) minmax(0,1.1fr)', gap: 18, padding: '14px 18px', borderTop: i ? rowLine : undefined, alignItems: 'center' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{c?.name} <span style={{ fontWeight: 400, color: T.faint }}>· {wo.number}</span></div>
                        <div style={{ fontSize: 12.5, color: T.muted, marginTop: 3 }}>{wo.rigs.join(', ')} · to finish by {day(wo.endDate)}</div>
                        <div style={{ marginTop: 4 }}><LoginState c={c} /></div>
                      </div>
                      <DepthBar drilled={p.metres} planned={wo.plannedMetres} width="100%" />
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {wo.status === 'closed' ? <Status tone="neutral">Closed</Status> : p.late ? <Status tone="bad">{p.daysLate} days late</Status> : <Status tone="good">Running</Status>}
                        {wait > 0 && <Status tone="warn">{wait} to check</Status>}
                      </div>
                    </div>
                  )
                })}
              </Card>
            </>
          )}
        </>
      )}

      {tab === 'reports' && <ReportsTab project={project} orders={orders} />}
      {tab === 'orders' && <OrdersTab project={project} projects={projects} orders={orders} openNew={newOrder} onOpened={() => setNewOrder(false)} onBills={() => go('bills')} />}
      {tab === 'bills' && <BillsTab project={project} orders={orders} />}

      {IS_DEMO && (
        <div style={{ fontSize: 12.5, color: T.faint, lineHeight: 1.6, maxWidth: 860 }}>
          <span style={{ color: tint(T.amber, 100), fontWeight: 700 }}>Demo data.</span> Contractor P and Contractor Q are sample companies. The deduction figures on their work orders are examples; set them to what your own contracts say.
        </div>
      )}
    </Page>
  )
}

export default function ContractorsRoute() {
  return (
    <Suspense fallback={null}>
      <ContractorsScreen />
    </Suspense>
  )
}
