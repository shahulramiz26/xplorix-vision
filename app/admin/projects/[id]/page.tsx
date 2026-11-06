'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, X } from 'lucide-react'
import {
  useCosting, blankClientRate, uid, fullDate, monthOf, listOf, rigPool, peoplePool, HOLE_SIZES, PROJECT_STATUS_LABEL,
  type ClientRate, type ProjectRecord, type ProjectStatus, loginOfClient,
} from '../../../../lib/costing-store'
import { TODAY, addDays } from '../../../../lib/inventory-store'
import { PHOTO_SOURCES } from '../../../../lib/core/sources'
import { projectById, projectStats, projectHoles, holeSeriesStart, contractOf, eventsFor, structureWords, day, whenIn, type ProjectHole } from '../../../../lib/projects'
import { financeLink } from '../../../../lib/admin-overview'
import { words, contractorOf, workOrderProgress, whoDrills, WHO_DRILLS_LABEL } from '../../../../lib/contracting'
import {
  Page, Card, Tile, Grid, Split, Seg, Btn, Note, Modal, Field, Switch, Status, Empty, inputStyle, T, display,
} from '../../../components/kit'
import { RateSchedule, RateEditor, ratesUsable } from '../../../components/rate-card'
import { OperatingCostModal, operatingLine } from '../../../components/cost-panels'
import { ProjectStatusTag, SharedTag, ChangeList, HolesTable, AddHolesModal, Fact } from '../../../components/project-ui'
import { useInventory } from '../../../../lib/inventory-store'
import { projectBudget, projectSchedule } from '../../../../lib/plan'
import { holeSurvey } from '../../../../lib/survey'
import { collarLatLon, offsetLatLon, type CoordSystem } from '../../../../lib/geo'
import { ScheduleCard, BudgetCard } from '../../../components/plan-cards'
import { HoleSetupModal, directionWords } from '../../../components/hole-setup'
import { HoleMap, MapLegend, type MapHole } from '../../../components/hole-map'

/* ONE PROJECT — the contract and everything agreed under it.
 *
 *   Overview         where it stands and what needs the contractor
 *   Holes            the plan: add, change the depth, take one off; each
 *                    hole's collar and planned direction
 *   Map              the collars on a map, with each surveyed hole's path
 *   Contract rates   what is agreed, what is waiting with the client, history
 *   Rigs and crew    what is on site
 *   Changes          every change, who made it, and whether the client saw it
 *
 * On a shared project a rate change is a proposal the client must accept;
 * everything else takes effect at once and the client is notified. */

const PHOTO_HOLES = new Set(PHOTO_SOURCES.map(x => x.hole))

type Tab = 'overview' | 'holes' | 'map' | 'rates' | 'team' | 'changes'
const TABS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Overview' }, { value: 'holes', label: 'Holes' }, { value: 'map', label: 'Map' }, { value: 'rates', label: 'Contract rates' },
  { value: 'team', label: 'Rigs and crew' }, { value: 'changes', label: 'Changes' },
]
const n0 = (v: number) => Math.round(v).toLocaleString('en-US')
const link: React.CSSProperties = { background: 'none', border: 'none', padding: 0, color: T.orange, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }

// ── change the rates ──────────────────────────────────────────────────────

function RatesModal({ project, current, minDate, onClose, onSave }: {
  project: ProjectRecord; current?: ClientRate; minDate: string; onClose: () => void; onSave: (c: ClientRate) => void
}) {
  const [rate, setRate] = useState<ClientRate>(() => current ? { ...current, id: uid('cr'), rateRows: current.rateRows.map(r => ({ ...r })) } : blankClientRate(project.name, minDate))
  const [from, setFrom] = useState(minDate)
  const [why, setWhy] = useState('')
  const early = from < minDate
  const ok = ratesUsable(rate) && !early && (!current || why.trim().length > 0)
  return (
    <Modal title={current ? 'Change the contract rates' : 'Set the contract rates'} width={860} onClose={onClose}
      subtitle={project.shared
        ? `${project.client} will see the old and new rates side by side. The new rates start only when he accepts them.`
        : 'Work already done keeps the rate it was done under. The new rates apply from the start date.'}
      footer={<><Btn onClick={onClose}>Cancel</Btn>
        <Btn kind="primary" disabled={!ok} onClick={() => onSave({ ...rate, project: project.name, effectiveFrom: from, note: why.trim() || 'Contract as awarded' })}>
          {project.shared ? `Send to ${project.client}` : 'Save rates'}
        </Btn></>}>
      <div style={{ display: 'grid', gap: 18 }}>
        <RateEditor value={rate} onChange={setRate} />
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(170px, 220px) minmax(0, 1fr)', gap: 14 }}>
          <Field label="New rates start">
            <input type="date" value={from} min={minDate} onChange={e => setFrom(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Reason for the change" hint="Shown to the client and kept in the history.">
            <input value={why} onChange={e => setWhy(e.target.value)} placeholder="e.g. diesel escalation clause, change of core size" style={inputStyle} />
          </Field>
        </div>
        {early && <Note tone="warn">Rates can start on {day(minDate)} or later. Earlier work keeps the rate it was done under.</Note>}
      </div>
    </Modal>
  )
}

// ── pick rigs or people ───────────────────────────────────────────────────

function Roster({ title, subtitle, items, pool, busy, addLabel, allowNew, newHint = 'Or type a new name', detail, onChange }: {
  title: string; subtitle?: string; items: string[]; pool: string[]; busy: Record<string, string>
  detail?: (x: string) => ReactNode
  addLabel: string; allowNew?: boolean; newHint?: string; onChange: (next: string[], what: { added?: string; removed?: string }) => void
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const free = pool.filter(x => !items.includes(x))
  return (
    <Card title={title} subtitle={subtitle} pad={false}
      right={<Btn size="sm" onClick={() => setAdding(a => !a)}>{adding ? 'Done' : addLabel}</Btn>}>
      {items.length === 0 && !adding && <Empty>None yet.</Empty>}
      {items.map((x, i) => (
        <div key={x} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '11px 18px', borderTop: i ? `1px solid ${T.line}` : undefined }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: T.text, minWidth: 90 }}>{x}</span>
          {detail && <div style={{ flex: 1, minWidth: 0 }}>{detail(x)}</div>}
          <button type="button" onClick={() => onChange(items.filter(y => y !== x), { removed: x })} aria-label={`Take ${x} off the project`}
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: T.faint, cursor: 'pointer', fontSize: 12.5, fontFamily: 'inherit' }}>
            <X size={13} /> Take off
          </button>
        </div>
      ))}
      {adding && (
        <div style={{ padding: '14px 18px', borderTop: `1px solid ${T.line}`, background: T.raised }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {free.length === 0 && <span style={{ fontSize: 13, color: T.faint }}>{pool.length === 0 ? 'None on record yet. Type the first one below.' : 'Everything on the list is already here.'}</span>}
            {free.map(x => (
              <button key={x} type="button" disabled={!!busy[x]} onClick={() => onChange([...items, x], { added: x })} style={{
                padding: '7px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: busy[x] ? 'not-allowed' : 'pointer',
                background: 'transparent', border: `1px solid ${T.border}`, color: T.text, opacity: busy[x] ? 0.5 : 1,
              }}>
                + {x}{busy[x] && <span style={{ fontWeight: 400, color: T.faint }}> · on {busy[x]}</span>}
              </button>
            ))}
          </div>
          {allowNew && (
            <form onSubmit={e => { e.preventDefault(); const v = name.trim(); if (v && !items.includes(v)) { onChange([...items, v], { added: v }); setName('') } }}
              style={{ display: 'flex', gap: 8, marginTop: 12, maxWidth: 420 }}>
              <input value={name} onChange={e => setName(e.target.value)} placeholder={newHint} style={inputStyle} />
              <Btn size="sm" disabled={!name.trim()} onClick={() => { const v = name.trim(); if (v && !items.includes(v)) { onChange([...items, v], { added: v }); setName('') } }}>Add</Btn>
            </form>
          )}
        </div>
      )}
    </Card>
  )
}

// ── the page ──────────────────────────────────────────────────────────────

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>()
  const { state, updateProject, planHoles, proposeRates, withdrawProposal, markProjectSeen, setHoleSetup } = useCosting()
  const { state: inv } = useInventory()
  const p = projectById(state, decodeURIComponent(id))
  const [setup, setSetup] = useState<string | null>(null)   // 'all', or one hole
  const budget = useMemo(() => p ? projectBudget(state, inv, p) : null, [state, inv, p])
  const schedule = useMemo(() => p ? projectSchedule(state, p) : null, [state, p])
  const [tab, setTab] = useState<Tab>('overview')
  const [fresh, setFresh] = useState<Set<string>>(new Set())
  const [addHoles, setAddHoles] = useState(false)
  const [depthOf, setDepthOf] = useState<ProjectHole | null>(null)
  const [opCost, setOpCost] = useState<string | null>(null)
  const [depth, setDepth] = useState('')
  const [rates, setRates] = useState(false)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    if (t && TABS.some(x => x.value === t)) setTab(t as Tab)
  }, [])

  const events = useMemo(() => p ? eventsFor(state, p.name) : [], [state, p])
  /* Anything the client did that the contractor has not seen is marked new
   * while this screen is open, and counted as seen from now on. */
  useEffect(() => {
    if (!p) return
    const unseen = events.filter(e => !e.seenByContractor)
    if (!unseen.length) return
    setFresh(f => new Set([...Array.from(f), ...unseen.map(e => e.id)]))
    markProjectSeen(p.name, 'contractor')
  }, [events, p, markProjectSeen])

  const busy = useMemo(() => {
    const rig: Record<string, string> = {}, person: Record<string, string> = {}
    ;(state.projects ?? []).filter(x => x.status === 'active' && x.id !== p?.id).forEach(x => {
      x.rigs.forEach(r => { rig[r] = x.code })
      ;[...x.supervisors, ...x.drillers].forEach(n => { person[n] = x.code })
    })
    return { rig, person }
  }, [state.projects, p?.id])
  const takenHoles = useMemo(
    () => Array.from(new Set([...Object.keys(state.holePlans ?? {}), ...state.shiftLogs.map(l => l.holeNumber).filter(Boolean) as string[]])),
    [state.holePlans, state.shiftLogs])

  const mapHoles: MapHole[] = useMemo(() => {
    if (!p) return []
    return projectHoles(state, p.name).flatMap(h => {
      const at = collarLatLon(state.holePlans[h.id]?.collar, p.coords, p.utmZone)
      if (!at) return []
      const sv = h.status === 'planned' ? null : holeSurvey(state, h.id)
      const trace = sv?.path.length ? sv.path.map(q => offsetLatLon(at, q.e, q.n)) : undefined
      const status: MapHole['status'] = h.status === 'planned' ? 'planned' : h.status === 'drilling' ? 'drilling' : 'done'
      return [{ id: h.id, ...at, status, trace,
        label: `${h.status === 'planned' ? `${h.planned ?? '—'} m planned` : `${Math.round(h.drilled)} m${h.planned ? ` of ${h.planned} m` : ''}`}${directionWords(state.holePlans[h.id]) ? ` · ${directionWords(state.holePlans[h.id])}` : ''}`,
        href: h.status === 'planned' ? undefined : `/admin/analytics/performance?hole=${encodeURIComponent(h.id)}&view=survey` }]
    })
  }, [state, p])

  if (!p) {
    return <Page><Card><Empty>This project does not exist. <Link href="/admin/projects" style={{ color: T.orange, fontWeight: 600 }}>Back to projects</Link></Empty></Card></Page>
  }

  const stats = projectStats(state, p)
  const c = contractOf(state, p.name)
  // Contractors' rigs on this project, beside our own.
  const orders = state.workOrders.filter(o => o.project === p.name && o.status === 'active')
  const theirRigs = orders.flatMap(o => o.rigs)
  const who = whoDrills(state, p.name)
  const w = words(state.wording)
  const contractorsLink = `/admin/contractors?tab=orders&project=${encodeURIComponent(p.name)}`
  const latest = c.versions[0]
  const minDate = latest && addDays(latest.effectiveFrom, 1) > TODAY ? addDays(latest.effectiveFrom, 1) : TODAY
  const client = p.client
  const fromClient = events.filter(e => fresh.has(e.id))

  const roster = (key: 'rigs' | 'supervisors' | 'drillers', kind: 'rig' | 'crew', word: string) =>
    (next: string[], what: { added?: string; removed?: string }) =>
      updateProject(p.id, { [key]: next } as Partial<ProjectRecord>, {
        kind, title: what.added ? `${what.added} ${kind === 'rig' ? 'assigned' : `added as ${word}`}` : `${what.removed} taken off the project`,
      })

  const setStatus = (s: ProjectStatus) => s !== p.status && updateProject(p.id, { status: s }, {
    kind: 'status', title: s === 'completed' ? 'Project completed' : s === 'on-hold' ? 'Project put on hold' : 'Project active again',
  })
  const setShared = (v: boolean) => updateProject(p.id, { shared: v }, v
    ? { kind: 'shared', title: `Shared with ${client}`, detail: 'Contract rates, planned holes, rigs and crew are now visible in the client login.' }
    : { kind: 'shared', title: `Stopped sharing with ${client}`, detail: 'The project is no longer visible in the client login.' })

  const holeAction = (h: ProjectHole) => (
    <span style={{ display: 'inline-flex', gap: 14 }}>
      <button style={link} onClick={() => setSetup(h.id)}>Collar and direction</button>
      {holeAction0(h)}
    </span>
  )
  const holeAction0 = (h: ProjectHole) => {
    const core = PHOTO_HOLES.has(h.id) && <Link href={`/admin/geology/holes/${h.id}`} style={{ ...link, textDecoration: 'none' }}>Core log</Link>
    if (h.status === 'planned') return (
      <span style={{ display: 'inline-flex', gap: 14 }}>
        <button style={link} onClick={() => { setDepthOf(h); setDepth(String(h.planned ?? '')) }}>Change depth</button>
        <button style={{ ...link, color: T.faint }} onClick={() => planHoles(p.name, [{ id: h.id, plan: null }], 'contractor', { kind: 'hole', title: `${h.id} taken off the plan`, detail: `${h.planned} m had been planned` })}>Remove</button>
      </span>
    )
    if (h.status === 'drilling') return <span style={{ display: 'inline-flex', gap: 14 }}>{core}<button style={link} onClick={() => { setDepthOf(h); setDepth(String(h.planned ?? '')) }}>Change depth</button></span>
    return <span style={{ display: 'inline-flex', gap: 14 }}>{core}<Link href={financeLink({ project: p.name, rig: h.rig ?? '', month: monthOf(h.end ?? h.start ?? TODAY), tab: 'Drillholes' })} style={{ ...link, textDecoration: 'none' }}>Open in Finance</Link></span>
  }

  const holeDetail = (h: ProjectHole) => {
    const pl = state.holePlans[h.id]
    const dir = directionWords(pl)
    const collar = !!collarLatLon(pl?.collar, p.coords, p.utmZone)
    return <span style={{ color: dir && collar ? T.faint : T.amber }}>{dir ? `Planned ${dir}` : 'No planned direction'} · {collar ? 'collar set' : 'no collar'}</span>
  }
  const withCollar = mapHoles.length
  const totalHoles = stats.holes.length

  return (
    <Page>
      <div>
        <Link href="/admin/projects" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: T.faint, textDecoration: 'none', marginBottom: 10 }}>
          <ArrowLeft size={14} /> Projects
        </Link>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 22, fontWeight: 600, color: T.text, margin: 0, fontFamily: display, letterSpacing: '-0.01em' }}>{p.name}</h1>
              <ProjectStatusTag status={p.status} />
              <SharedTag shared={p.shared} client={client} />
            </div>
            <div style={{ fontSize: 14, color: T.muted, marginTop: 7 }}>{p.code} · {client} · {p.location}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn onClick={() => setEditing(true)}>Edit details</Btn>
            <Btn kind="primary" onClick={() => { setTab('holes'); setAddHoles(true) }}>Add holes</Btn>
          </div>
        </div>
      </div>

      <div><Seg<Tab> options={TABS} value={tab} onChange={setTab} /></div>

      {tab === 'overview' && (
        <>
          {c.returned && (
            <Note tone="bad">
              <span style={{ fontWeight: 700, color: T.text }}>{client} sent the new rates back.</span> {c.returned.ownerNote ?? 'No reason given.'}{' '}
              <button style={link} onClick={() => setTab('rates')}>Open contract rates</button>
            </Note>
          )}
          {fromClient.length > 0 && (
            <Card title={`New from ${client}`} pad={false}>
              <ChangeList events={fromClient} viewer="contractor" otherSide={client} fresh={fresh} />
            </Card>
          )}
          <Grid min={200}>
            <Tile label="Metres drilled" value={`${n0(stats.drilled)} m`} note={stats.target ? `of ${n0(stats.target)} m · ${n0(stats.toGo)} m on open holes` : 'No quantity set'} />
            <Tile label="Holes" value={stats.holes.length} note={`${stats.counts.drilling} drilling · ${stats.counts.planned} planned · ${stats.counts.done} finished`} />
            <Tile label={`On site · ${WHO_DRILLS_LABEL[who.kind].toLowerCase()}`} value={p.rigs.length ? p.rigs.join(', ') : theirRigs.length ? `${theirRigs.length} ${w.outLower} rigs` : 'No rig'}
              note={theirRigs.length && p.rigs.length
                ? `plus ${who.contractors.map(c => `${c.name}: ${c.rigs.join(', ')}`).join('; ')}${who.ownMetres + who.contractorMetres > 0 ? ` · ${Math.round(who.contractorShare * 100)}% of metres by contractors` : ''}`
                : `${p.supervisors.length} supervisors, ${p.drillers.length} drillers`}
              tone={p.rigs.length || theirRigs.length || p.status !== 'active' ? undefined : 'warn'} />
            <Tile label="Contract rates" value={c.current ? structureWords(c.current) : 'Not set'} tone={c.current ? (c.waiting ? 'warn' : undefined) : 'bad'}
              note={c.waiting ? `A change is waiting for ${client}` : c.current ? `In force since ${fullDate(c.current.effectiveFrom)}` : 'Finance cannot bill this project yet'} />
          </Grid>

          <Split left={3} right={2}>
            {schedule && <ScheduleCard s={schedule} onSetPlan={() => setEditing(true)} />}
            {budget && <BudgetCard b={budget} onSet={() => setEditing(true)} />}
          </Split>

          <Split left={2} right={3}>
            <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
              <Card title="The contract">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
                  <Fact label="Client">{client}</Fact>
                  <Fact label="Location">{p.location}</Fact>
                  <Fact label="Started">{day(p.startDate)}</Fact>
                  <Fact label="Metres in the contract">{p.plannedMetres ? `${n0(p.plannedMetres)} m` : 'Not fixed'}</Fact>
                  <Fact label="Main core size">{p.holeSize}</Fact>
                  <Fact label="Daily target per rig">{p.dailyTarget ? `${n0(p.dailyTarget)} m` : 'Not set'}</Fact>
                  <Fact label="Status">
                    <select value={p.status} onChange={e => setStatus(e.target.value as ProjectStatus)} aria-label="Project status"
                      style={{ ...inputStyle, padding: '5px 8px', width: 'auto', cursor: 'pointer' }}>
                      {(Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[]).map(s => <option key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</option>)}
                    </select>
                  </Fact>
                </div>
              </Card>
              <Card title="Client login">
                {loginOfClient(state.users, client)?.active ? (
                  <Switch on={p.shared} onChange={setShared} label={`Show this project to ${client}`}
                    hint={p.shared
                      ? 'He sees the contract rates, the planned holes, the shift record and his invoices. He never sees your costs, margin or stock.'
                      : 'Turn this on to show the project in his login. Closed holes then go to him for approval and invoices for checking.'} />
                ) : (
                  <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.55 }}>
                    {client} has no client login{loginOfClient(state.users, client) ? ' that is switched on' : ' yet'}, so nobody outside your company sees this project.{' '}
                    <Link href={`/admin/users?new=client&for=${encodeURIComponent(client)}`} style={{ color: T.orange, fontWeight: 600, textDecoration: 'none' }}>Create it under Users</Link>
                  </div>
                )}
              </Card>
            </div>
            <Card title="Latest changes" pad={false} right={<button style={link} onClick={() => setTab('changes')}>See all</button>}>
              <ChangeList events={events} viewer="contractor" otherSide={client} fresh={fresh} limit={6} showSeen={p.shared} />
            </Card>
          </Split>
        </>
      )}

      {tab === 'holes' && (
        <Card title="Holes" pad={false}
          subtitle={`${stats.holes.length} on the plan · ${n0(stats.drilled)} m drilled · ${n0(stats.toGo)} m still to drill.${p.shared ? ` ${client} sees this list and can release holes himself.` : ''}`}
          right={stats.holes.length ? <Btn size="sm" onClick={() => setSetup('all')}>Collars and directions</Btn> : undefined}>
          <HolesTable holes={stats.holes} client={client} contractor="You" action={holeAction} detail={holeDetail} />
        </Card>
      )}

      {tab === 'map' && (
        <Card title="Where the holes are" right={<Btn size="sm" onClick={() => setSetup('all')}>Collars and directions</Btn>}
          subtitle={withCollar === totalHoles
            ? `${totalHoles} ${totalHoles === 1 ? 'hole' : 'holes'}. Click a drilled hole to open its survey.`
            : `${withCollar} of ${totalHoles} holes have a collar. Add the rest under Collars and directions.`}>
          {withCollar ? <><HoleMap holes={mapHoles} /><div style={{ marginTop: 10 }}><MapLegend /></div></>
            : <Empty>No hole on this project has a collar yet. Add them under Collars and directions: type them in, or paste them from the plan spreadsheet.</Empty>}
        </Card>
      )}

      {tab === 'rates' && (
        <>
          {c.waiting && (
            <Card title={`Waiting for ${client} to accept`} pad={false}
              subtitle={`Sent ${whenIn(c.waiting.proposedAt)} · would start ${fullDate(c.waiting.rate.effectiveFrom)} · ${c.waiting.rate.note ?? ''}`}
              right={<Btn size="sm" onClick={() => withdrawProposal(c.waiting!.id)}>Withdraw</Btn>}>
              <RateSchedule rate={c.waiting.rate} before={c.current} />
              <div style={{ padding: '11px 18px', fontSize: 12.5, color: T.faint, borderTop: `1px solid ${T.line}` }}>
                Until he accepts, every metre is priced at the rates in force below.
              </div>
            </Card>
          )}
          {c.returned && (
            <Note tone="bad">
              <span style={{ fontWeight: 700, color: T.text }}>{client} sent the new rates back{c.returned.answeredAt ? `, ${whenIn(c.returned.answeredAt)}` : ''}.</span>{' '}
              {c.returned.ownerNote ?? 'No reason given.'} The agreed rates stay in force. Change the proposal and send it again.
            </Note>
          )}

          <Card title={c.current ? 'In force' : 'Contract rates'} pad={false}
            subtitle={c.current ? `${structureWords(c.current)} · since ${fullDate(c.current.effectiveFrom)}${c.current.note ? ` · ${c.current.note}` : ''}` : undefined}
            right={<Btn kind={c.current ? 'ghost' : 'primary'} size="sm" onClick={() => setRates(true)}>{c.current ? 'Change rates' : 'Set contract rates'}</Btn>}>
            {c.current ? <RateSchedule rate={c.current} /> : <Empty>No rates yet. Until they are set, Finance cannot price a metre or raise an invoice on this project.</Empty>}
          </Card>

          {c.upcoming.map(u => (
            <Card key={u.id} title={`Agreed, starts ${fullDate(u.effectiveFrom)}`} subtitle={u.note} pad={false}>
              <RateSchedule rate={u} before={c.current} />
            </Card>
          ))}

          {c.versions.length > 1 && (
            <Card title="History" subtitle="Every set of rates this project has had. Work is always priced at the rates in force on the day it was done." pad={false}>
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

          <div style={{ fontSize: 12.5, color: T.faint, lineHeight: 1.6, maxWidth: 820 }}>
            These are the rates the client pays. Your own costs are never shown to the client: the rig cost is set on each rig under Rigs, and each rig's operating cost (fuel, crew, lodging, transport) under Rigs and crew on this project.
          </div>
        </>
      )}

      {tab === 'team' && (
        <>
          <Roster title={orders.length ? w.ownRigs : 'Rigs'} subtitle="A rig can be on one running project at a time." items={p.rigs} pool={rigPool(state).map(r => r.rig)} busy={busy.rig}
            addLabel="Assign a rig" allowNew newHint="Or type a new rig's name or number"
            detail={rig => {
              const line = operatingLine(state, rig, p.name)
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12.5 }}>
                  {line ? <span style={{ color: T.muted }}>Operating cost: {line}</span> : <Status tone="warn">Operating cost not set</Status>}
                  <button type="button" onClick={() => setOpCost(rig)} style={link}>{line ? 'Change' : 'Set it'}</button>
                </div>
              )
            }}
            onChange={(next, what) => {
              roster('rigs', 'rig', 'rig')(next, what)
              // A rig's running cost depends on the site, so it is asked the moment the rig joins.
              if (what.added && !operatingLine(state, what.added, p.name)) setOpCost(what.added)
            }} />
          <Card title={w.outRigs} pad={false}
            subtitle="Rigs a contractor brings under a work order. Their checked shifts count in the same record as your own."
            right={<Btn size="sm" href={contractorsLink}>{orders.length ? 'Open work orders' : 'Bring in a contractor'}</Btn>}>
            {orders.length === 0 && <Empty>None. Every rig on this project is your own.</Empty>}
            {orders.map((o, i) => {
              const pr = workOrderProgress(state, o, TODAY)
              return (
                <div key={o.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '12px 18px', borderTop: i ? `1px solid ${T.line}` : undefined, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{o.rigs.join(', ')}</div>
                    <div style={{ fontSize: 12.5, color: T.muted, marginTop: 3 }}>{contractorOf(state, o.contractorId)?.name} · {o.number} · {n0(pr.metres)} m of {n0(o.plannedMetres)} m · to finish by {day(o.endDate)}</div>
                  </div>
                  {pr.late ? <Status tone="bad">{pr.daysLate} days late</Status> : <Status tone="good">Running</Status>}
                </div>
              )
            })}
          </Card>
          <Split>
            <Roster title="Supervisors" items={p.supervisors} pool={peoplePool(state).supervisors} busy={busy.person} addLabel="Add a supervisor" allowNew onChange={roster('supervisors', 'crew', 'supervisor')} />
            <Roster title="Drillers" items={p.drillers} pool={peoplePool(state).drillers} busy={busy.person} addLabel="Add a driller" allowNew onChange={roster('drillers', 'crew', 'driller')} />
          </Split>
          <div style={{ fontSize: 12.5, color: T.faint, lineHeight: 1.6, maxWidth: 820 }}>
            Bits, rods and other parts are not listed on the project. They are issued to each rig in <Link href="/admin/inventory" style={{ color: T.orange, fontWeight: 600, textDecoration: 'none' }}>Parts &amp; inventory</Link>.
            {p.shared && <> {client} is told when a rig or a person joins or leaves his site.</>}
          </div>
        </>
      )}

      {tab === 'changes' && (
        <Card title="Changes" subtitle={p.shared ? `Every change on this project. ${client} reads the same list.` : 'Every change on this project.'} pad={false}>
          <ChangeList events={events} viewer="contractor" otherSide={client} fresh={fresh} showSeen={p.shared} />
        </Card>
      )}

      {addHoles && (
        <AddHolesModal title="Add holes" taken={takenHoles} defaultSize={p.holeSize} series={{ mine: stats.holes.map(h => h.id), start: holeSeriesStart(p.code) }} confirm="Add to the plan"
          subtitle={p.shared ? `${client} will see them in his portal at once.` : 'They appear in the forecast and in the drill log.'}
          onClose={() => setAddHoles(false)}
          onAdd={holes => {
            planHoles(p.name, holes, 'contractor', {
              kind: 'hole', title: `${holes.length} ${holes.length === 1 ? 'hole' : 'holes'} added to the plan`,
              detail: holes.map(h => `${h.id} (${h.plan.plannedDepth} m)`).join(', '),
            })
            setAddHoles(false)
          }} />
      )}

      {depthOf && (
        <Modal title={`Planned depth of ${depthOf.id}`} width={440} onClose={() => setDepthOf(null)}
          subtitle={depthOf.drilled > 0 ? `${n0(depthOf.drilled)} m drilled so far.` : undefined}
          footer={<><Btn onClick={() => setDepthOf(null)}>Cancel</Btn>
            <Btn kind="primary" disabled={!(parseFloat(depth) > 0) || parseFloat(depth) < depthOf.drilled || parseFloat(depth) === depthOf.planned}
              onClick={() => {
                planHoles(p.name, [{ id: depthOf.id, plan: { plannedDepth: parseFloat(depth) } }], 'contractor', {
                  kind: 'hole', title: `${depthOf.id} planned depth changed`, detail: `${depthOf.planned ?? '—'} m → ${parseFloat(depth)} m`,
                })
                setDepthOf(null)
              }}>Save</Btn></>}>
          <Field label="Planned depth, m" hint={parseFloat(depth) < depthOf.drilled ? 'Cannot be less than what is already drilled.' : undefined}>
            <input type="number" value={depth} onChange={e => setDepth(e.target.value)} autoFocus style={{ ...inputStyle, textAlign: 'right' }} />
          </Field>
        </Modal>
      )}

      {opCost && <OperatingCostModal rig={opCost} project={p.name} onClose={() => setOpCost(null)} />}

      {setup && (
        <HoleSetupModal project={p} holes={stats.holes} plans={state.holePlans} only={setup === 'all' ? undefined : setup}
          onClose={() => setSetup(null)}
          onSave={(changes, coords) => {
            if (coords) updateProject(p.id, coords as { coords: CoordSystem; utmZone?: string })
            if (changes.length) setHoleSetup(p.name, changes, {
              kind: 'hole', title: changes.length === 1 ? `${changes[0].id}: collar and planned direction set` : `Collars and planned directions set for ${changes.length} holes`,
              detail: changes.map(ch => ch.id).join(', '),
            })
            setSetup(null)
          }} />
      )}

      {rates && <RatesModal project={p} current={c.versions[0]} minDate={minDate} onClose={() => setRates(false)}
        onSave={r => { proposeRates(p.name, r); setRates(false) }} />}

      {editing && <DetailsModal p={p} onClose={() => setEditing(false)} onSave={(patch, detail) => {
        updateProject(p.id, patch, detail ? { kind: 'details', title: 'Project details changed', detail } : undefined)
        setEditing(false)
      }} />}
    </Page>
  )
}

function DetailsModal({ p, onClose, onSave }: { p: ProjectRecord; onClose: () => void; onSave: (patch: Partial<ProjectRecord>, detail: string) => void }) {
  const str = (v?: number) => v ? String(v) : ''
  const [f, setF] = useState({
    location: p.location, client: p.client, plannedMetres: str(p.plannedMetres), holeSize: p.holeSize, dailyTarget: str(p.dailyTarget),
    plannedEnd: p.plannedEnd ?? '', budgetTotal: str(p.budgetTotal), budgetPerMetre: str(p.budgetPerMetre),
  })
  const num = (v: string) => parseFloat(v) || undefined
  const metres = num(f.plannedMetres), target = num(f.dailyTarget), total = num(f.budgetTotal), perM = num(f.budgetPerMetre)
  const end = f.plannedEnd || undefined
  const rupees = (v?: number) => v ? `SAR ${Math.round(v).toLocaleString('en-US')}` : 'none'
  /* What the client may read in the change list, and what stays yours: the
   * daily target and the budget are never in a line the client sees. */
  const shared = [
    f.client.trim() !== p.client && `client ${p.client} → ${f.client.trim()}`,
    f.location.trim() !== p.location && `location ${p.location} → ${f.location.trim()}`,
    metres !== p.plannedMetres && `metres in the contract ${p.plannedMetres ?? 'not fixed'} → ${metres ?? 'not fixed'}`,
    f.holeSize !== p.holeSize && `main core size ${p.holeSize} → ${f.holeSize}`,
    end !== p.plannedEnd && `planned end ${p.plannedEnd ? fullDate(p.plannedEnd) : 'none'} → ${end ? fullDate(end) : 'none'}`,
  ].filter(Boolean) as string[]
  const own = [
    target !== p.dailyTarget && 'daily target',
    total !== p.budgetTotal && 'total budget',
    perM !== p.budgetPerMetre && 'budget per metre',
  ].filter(Boolean) as string[]
  const endBad = !!end && end <= p.startDate
  return (
    <Modal title="Project details" width={620} onClose={onClose}
      subtitle="The project name cannot be changed: shifts, rates and invoices are filed under it."
      footer={<><Btn onClick={onClose}>Cancel</Btn>
        <Btn kind="primary" disabled={!(shared.length + own.length) || !f.client.trim() || !f.location.trim() || endBad}
          onClick={() => onSave({ client: f.client.trim(), location: f.location.trim(), plannedMetres: metres, holeSize: f.holeSize, dailyTarget: target, plannedEnd: end, budgetTotal: total, budgetPerMetre: perM }, listOf(shared))}>Save</Btn></>}>
      <div style={{ display: 'grid', gap: 14 }}>
        <Field label="Client"><input value={f.client} onChange={e => setF({ ...f, client: e.target.value })} style={inputStyle} /></Field>
        <Field label="Location"><input value={f.location} onChange={e => setF({ ...f, location: e.target.value })} style={inputStyle} /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Metres in the contract"><input type="number" value={f.plannedMetres} onChange={e => setF({ ...f, plannedMetres: e.target.value })} style={{ ...inputStyle, textAlign: 'right' }} /></Field>
          <Field label="Main core size">
            <select value={f.holeSize} onChange={e => setF({ ...f, holeSize: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
              {HOLE_SIZES.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Planned end of drilling" hint={endBad ? 'Must be after the start date.' : `Draws the planned line from ${fullDate(p.startDate)}.`}>
            <input type="date" value={f.plannedEnd} min={p.startDate} onChange={e => setF({ ...f, plannedEnd: e.target.value })} style={inputStyle} />
          </Field>
          <Field label="Daily target, metres per rig" hint="Your KPI. The client never sees it.">
            <input type="number" min={0} value={f.dailyTarget} onChange={e => setF({ ...f, dailyTarget: e.target.value })} placeholder="e.g. 18" style={{ ...inputStyle, textAlign: 'right' }} />
          </Field>
        </div>
        <div style={{ padding: 14, borderRadius: 10, border: `1px solid ${T.border}`, display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Budget <span style={{ fontWeight: 400, color: T.faint }}>· your own figures, never shown to the client, a contractor or a supervisor</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Total budget, SAR" hint={total ? rupees(total) : 'What the whole project may cost.'}>
              <input type="number" min={0} value={f.budgetTotal} onChange={e => setF({ ...f, budgetTotal: e.target.value })} placeholder="e.g. 12000000" style={{ ...inputStyle, textAlign: 'right' }} />
            </Field>
            <Field label="Budget per metre, SAR" hint={metres && total ? `${rupees(total / metres)} if the total is spread over ${metres.toLocaleString('en-US')} m.` : 'What a metre should cost.'}>
              <input type="number" min={0} value={f.budgetPerMetre} onChange={e => setF({ ...f, budgetPerMetre: e.target.value })} placeholder="e.g. 5000" style={{ ...inputStyle, textAlign: 'right' }} />
            </Field>
          </div>
        </div>
      </div>
    </Modal>
  )
}
