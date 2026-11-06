'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { fullDate, COMPANY_NAME } from '../../../../lib/costing-store'
import { useClient } from '../../../../lib/client-view'
import { TODAY } from '../../../../lib/inventory-store'
import { projectById, projectStats, holeSeriesStart, contractOf, eventsFor, structureWords, day, whenIn, type ProjectHole } from '../../../../lib/projects'
import { Page, PageHead, Card, Tile, Grid, Split, Seg, Btn, Note, Modal, Field, Status, Empty, inputStyle, T } from '../../ui'
import { RateSchedule } from '../../../components/rate-card'
import { ProjectStatusTag, ChangeList, HolesTable, AddHolesModal, Fact } from '../../../components/project-ui'

/* ONE PROJECT — the contract as the client reads it.
 *
 *   Contract rates   what is agreed; a change the contractor proposes waits
 *                    here until the client accepts it or sends it back
 *   Holes            the plan and its progress; the client can release holes
 *   Rigs and crew    who is on his site
 *   Changes          everything that changed, newest first
 *
 * Nothing on this screen is a cost of the contractor's. */

type Tab = 'rates' | 'holes' | 'team' | 'changes'
const n0 = (v: number) => Math.round(v).toLocaleString('en-US')

export default function ClientProjectPage() {
  const { id } = useParams<{ id: string }>()
  const { state, names, ownerAnswerRates, planHoles, markProjectSeen } = useClient()
  const found = projectById(state, decodeURIComponent(id))
  const p = found && names.has(found.name) ? found : undefined
  const [tab, setTab] = useState<Tab>('rates')
  const [fresh, setFresh] = useState<Set<string>>(new Set())
  const [release, setRelease] = useState(false)
  const [sendBack, setSendBack] = useState(false)
  const [reason, setReason] = useState('')

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    if (t === 'rates' || t === 'holes' || t === 'team' || t === 'changes') setTab(t)
  }, [])

  const events = useMemo(() => p ? eventsFor(state, p.name) : [], [state, p])
  // Changes not seen before stay marked new while the screen is open, and
  // count as seen from now on.
  useEffect(() => {
    if (!p) return
    const unseen = events.filter(e => !e.seenByOwner)
    if (!unseen.length) return
    setFresh(f => new Set([...Array.from(f), ...unseen.map(e => e.id)]))
    markProjectSeen(p.name, 'owner')
  }, [events, p, markProjectSeen])

  const takenHoles = useMemo(
    () => Array.from(new Set([...Object.keys(state.holePlans ?? {}), ...state.shiftLogs.map(l => l.holeNumber).filter(Boolean) as string[]])),
    [state.holePlans, state.shiftLogs])

  if (!p) {
    return <Page><Card><Empty>This project is not shared with you. <Link href="/client/projects" style={{ color: T.orange, fontWeight: 600 }}>Back to projects</Link></Empty></Card></Page>
  }

  const stats = projectStats(state, p)
  const c = contractOf(state, p.name)
  const contractor = COMPANY_NAME
  const news = events.filter(e => fresh.has(e.id) && e.by === 'contractor')
  const holeLink = (h: ProjectHole) => h.status === 'planned' ? undefined : `/client/holes/${h.id}`

  return (
    <Page>
      <Link href="/client/projects" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: T.faint, textDecoration: 'none', marginBottom: -8 }}>
        <ArrowLeft size={14} /> Projects
      </Link>
      <PageHead
        question={p.name}
        tone={c.waiting ? 'warn' : news.length ? 'info' : 'good'}
        answer={<>
          {contractor} · {p.code} · {p.location}.{' '}
          {c.waiting
            ? <b style={{ color: T.text }}>New rates are waiting for you to accept. </b>
            : news.length ? `${news.length} ${news.length === 1 ? 'change' : 'changes'} since you last looked. ` : 'Nothing has changed since you last looked. '}
          {n0(stats.drilled)} m drilled{stats.target ? ` of ${n0(stats.target)} m` : ''}.
        </>}
        right={<ProjectStatusTag status={p.status} />}
      />

      <Grid min={200}>
        <Tile label="Metres drilled" value={`${n0(stats.drilled)} m`} note={stats.target ? `of ${n0(stats.target)} m · ${n0(stats.toGo)} m on open holes` : undefined} />
        <Tile label="Holes" value={stats.holes.length} note={`${stats.counts.drilling} drilling · ${stats.counts.planned} planned · ${stats.counts.done} finished`} />
        <Tile label="On your site" value={p.rigs.length ? p.rigs.join(', ') : 'No rig'} note={`${p.supervisors.length} supervisors, ${p.drillers.length} drillers`} />
        <Tile label="Contract rates" value={c.current ? structureWords(c.current) : 'Not set'} tone={c.waiting ? 'warn' : undefined}
          note={c.waiting ? 'A change is waiting for you' : c.current ? `In force since ${fullDate(c.current.effectiveFrom)}` : `${contractor} has not entered rates yet`} />
      </Grid>

      <div><Seg<Tab> value={tab} onChange={setTab} options={[
        { value: 'rates', label: 'Contract rates' }, { value: 'holes', label: 'Holes' },
        { value: 'team', label: 'Rigs and crew' }, { value: 'changes', label: news.length ? `Changes · ${news.length} new` : 'Changes' },
      ]} /></div>

      {tab === 'rates' && (
        <>
          {c.waiting && (
            <Card title="New rates proposed: your decision" pad={false}
              subtitle={`${contractor} · sent ${whenIn(c.waiting.proposedAt)} · would start ${fullDate(c.waiting.rate.effectiveFrom)}`}>
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.line}` }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: T.faint, marginBottom: 4 }}>Reason given</div>
                <div style={{ fontSize: 13.5, color: T.text }}>{c.waiting.rate.note ?? 'No reason given'}</div>
              </div>
              <RateSchedule rate={c.waiting.rate} before={c.current} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', padding: '14px 18px', borderTop: `1px solid ${T.line}` }}>
                <div style={{ fontSize: 12.5, color: T.faint, maxWidth: 520, lineHeight: 1.5 }}>
                  Until you accept, every metre is billed at the rates in force. If you accept, the new rates apply from {fullDate(c.waiting.rate.effectiveFrom)} and not before.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn kind="danger" onClick={() => { setReason(''); setSendBack(true) }}>Send back</Btn>
                  <Btn kind="good" onClick={() => ownerAnswerRates(c.waiting!.id, true)}>Accept new rates</Btn>
                </div>
              </div>
            </Card>
          )}

          <Card title={c.current ? 'In force' : 'Contract rates'} pad={false}
            subtitle={c.current ? `${structureWords(c.current)} · since ${fullDate(c.current.effectiveFrom)}${c.current.note ? ` · ${c.current.note}` : ''}` : undefined}>
            {c.current ? <RateSchedule rate={c.current} /> : <Empty>{contractor} has not entered the contract rates yet.</Empty>}
          </Card>

          {c.upcoming.map(u => (
            <Card key={u.id} title={`Agreed, starts ${fullDate(u.effectiveFrom)}`} subtitle={u.note} pad={false}>
              <RateSchedule rate={u} before={c.current} />
            </Card>
          ))}

          {c.versions.length > 1 && (
            <Card title="History" subtitle="Every set of rates this project has had. Work is billed at the rates in force on the day it was done." pad={false}>
              {c.versions.map((v, i) => (
                <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '12px 18px', borderTop: i ? `1px solid ${T.line}` : undefined, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>From {fullDate(v.effectiveFrom)}</div>
                    <div style={{ fontSize: 12.5, color: T.muted, marginTop: 2 }}>{structureWords(v)}{v.note ? ` · ${v.note}` : ''}</div>
                  </div>
                  {v.id === c.current?.id ? <Status tone="good">In force</Status> : v.effectiveFrom > TODAY ? <Status tone="info">Starts later</Status> : <Status tone="neutral">Replaced</Status>}
                </div>
              ))}
            </Card>
          )}
          <div style={{ fontSize: 13, color: T.faint, lineHeight: 1.6, maxWidth: 820 }}>
            {contractor} cannot change these rates alone. A change reaches you as a proposal, with the old and new rates side by side, and starts only if you accept it.
          </div>
        </>
      )}

      {tab === 'holes' && (
        <Card title="Holes" pad={false}
          subtitle={`${stats.holes.length} on the plan · ${n0(stats.drilled)} m drilled · ${n0(stats.toGo)} m still to drill.`}
          right={<Btn kind="primary" size="sm" onClick={() => setRelease(true)}>Release holes</Btn>}>
          <HolesTable holes={stats.holes} client="You" contractor={contractor} href={holeLink} />
          <div style={{ padding: '11px 18px', fontSize: 12.5, color: T.faint, borderTop: `1px solid ${T.line}`, lineHeight: 1.5 }}>
            A hole you release goes on {contractor}&rsquo;s plan at once, with the planned depth you set. They are told the moment you add it.
          </div>
        </Card>
      )}

      {tab === 'team' && (
        <Split>
          <Card title="Rigs on your site">
            {p.rigs.length === 0 ? <Empty>No rig is assigned yet.</Empty> : (
              <div style={{ display: 'grid', gap: 12 }}>
                {p.rigs.map(r => {
                  const on = stats.holes.find(h => h.rig === r && h.status === 'drilling')
                  return <Fact key={r} label={r}>{on ? <>Drilling <Link href={`/client/holes/${on.id}`} style={{ color: T.orange, fontWeight: 600, textDecoration: 'none' }}>{on.id}</Link>, {n0(on.drilled)} m of {on.planned ?? '—'} m</> : 'No open hole'}</Fact>
                })}
              </div>
            )}
          </Card>
          <Card title="Crew on your site">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
              <Fact label={`Supervisors · ${p.supervisors.length}`}>{p.supervisors.length ? p.supervisors.map(n => <div key={n}>{n}</div>) : '—'}</Fact>
              <Fact label={`Drillers · ${p.drillers.length}`}>{p.drillers.length ? p.drillers.map(n => <div key={n}>{n}</div>) : '—'}</Fact>
            </div>
            <div style={{ fontSize: 12.5, color: T.faint, marginTop: 14, lineHeight: 1.5 }}>Started {day(p.startDate)}. You are told when a rig or a person joins or leaves the site.</div>
          </Card>
        </Split>
      )}

      {tab === 'changes' && (
        <Card title="Changes" subtitle={`Everything that changed on this project, newest first. ${contractor} reads the same list.`} pad={false}>
          <ChangeList events={events} viewer="owner" otherSide={contractor} fresh={fresh} />
        </Card>
      )}

      {release && (
        <AddHolesModal title="Release holes for drilling" taken={takenHoles} defaultSize={p.holeSize} series={{ mine: stats.holes.map(h => h.id), start: holeSeriesStart(p.code) }} confirm="Release"
          subtitle={`They go on ${contractor}'s plan at once.`}
          onClose={() => setRelease(false)}
          onAdd={holes => {
            planHoles(p.name, holes, 'owner', {
              kind: 'hole', title: `${holes.length} ${holes.length === 1 ? 'hole' : 'holes'} released for drilling`,
              detail: holes.map(h => `${h.id} (${h.plan.plannedDepth} m)`).join(', '),
            })
            setRelease(false)
          }} />
      )}

      {sendBack && c.waiting && (
        <Modal title="Send the new rates back" width={520} onClose={() => setSendBack(false)}
          subtitle={`The rates in force stay as they are. ${contractor} sees your reason and can send a changed proposal.`}
          footer={<><Btn onClick={() => setSendBack(false)}>Cancel</Btn>
            <Btn kind="danger" disabled={!reason.trim()} onClick={() => { ownerAnswerRates(c.waiting!.id, false, reason); setSendBack(false) }}>Send back</Btn></>}>
          <Field label="Reason">
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} autoFocus placeholder="e.g. the escalation clause allows 3%, not 4%"
              style={{ ...inputStyle, resize: 'vertical' }} />
          </Field>
        </Modal>
      )}
      {!c.waiting && c.versions.length === 0 && tab === 'rates' && <Note tone="info">Rates will appear here as soon as {contractor} enters them.</Note>}
    </Page>
  )
}
