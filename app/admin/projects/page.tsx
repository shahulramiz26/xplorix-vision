'use client'

import { useState } from 'react'
import { DeptInbox } from '../../components/inbox'
import Link from 'next/link'
import { ChevronRight, MapPin } from 'lucide-react'
import { useCosting, fullDate } from '../../../lib/costing-store'
import { projectStats, contractOf, contractorInbox, structureWords, eventsFor, whenIn } from '../../../lib/projects'
import { Page, Head, Grid, Tile, Btn, Card, Empty, DepthBar, Status, Seg, T, type Tone } from '../../components/kit'
import { whoDrills, WHO_DRILLS_LABEL, type WhoDrills } from '../../../lib/contracting'
import { ProjectStatusTag, SharedTag } from '../../components/project-ui'

/* PROJECTS — one record per project, and the only one.
 *
 * What is set here is what Finance bills at, what the rig logs against, what
 * Inventory issues to, and — on a project shared with the client — what the
 * client reads in his portal. Bits and other parts are not listed here; they
 * belong to Parts & inventory, which knows what each rig is carrying. */

const n0 = (v: number) => Math.round(v).toLocaleString('en-US')
const WHO_TONE: Record<WhoDrills, Tone> = { own: 'good', mixed: 'info', contractor: 'warn', none: 'neutral' }
type Filter = 'all' | WhoDrills

export default function ProjectsPage() {
  const { state } = useCosting()
  const projects = state.projects ?? []
  const inbox = contractorInbox(state)
  const order = { active: 0, 'on-hold': 1, completed: 2 }
  const rows = [...projects].sort((a, b) => order[a.status] - order[b.status] || a.code.localeCompare(b.code))
    .map(p => ({ p, stats: projectStats(state, p), contract: contractOf(state, p.name), last: eventsFor(state, p.name)[0], who: whoDrills(state, p.name) }))
  const [filter, setFilter] = useState<Filter>('all')
  const count = (k: WhoDrills) => rows.filter(r => r.who.kind === k).length
  const shown = rows.filter(r => filter === 'all' || r.who.kind === filter)
  const live = rows.filter(r => r.p.status === 'active')
  const waiting = rows.filter(r => r.contract.waiting)
  const fromClient = inbox.unseen.length

  return (
    <Page>
      <Head title="Projects"
        sub="One record per project. What you set here is what Finance bills at, what the rig logs against, and what the client sees in his portal."
        right={<Btn kind="primary" href="/admin/projects/new">New project</Btn>} />

      <DeptInbox depts={['operations', 'geology']} name="Operations" />

      <Grid>
        <Tile label="Active projects" value={live.length} note={`${projects.length - live.length} on hold or completed`} />
        <Tile label="Shared with the client" value={projects.filter(p => p.shared).length} note="Client reads the contract, holes and crew live" />
        <Tile label="Metres still to drill" value={`${n0(live.reduce((s, r) => s + r.stats.toGo, 0))} m`} note="On holes planned or being drilled" />
        <Tile label="Waiting on the client" value={waiting.length} tone={waiting.length ? 'warn' : undefined}
          note={waiting.length ? 'Rate changes not yet accepted' : fromClient ? `${fromClient} new from the client` : 'Nothing waiting'} />
      </Grid>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, color: T.faint, fontWeight: 600 }}>Who drills</span>
        <Seg<Filter> value={filter} onChange={setFilter} options={[
          { value: 'all', label: `All · ${rows.length}` },
          { value: 'own', label: `Own rigs only · ${count('own')}` },
          { value: 'mixed', label: `Own and contractors · ${count('mixed')}` },
          { value: 'contractor', label: `Contractors only · ${count('contractor')}` },
        ]} />
      </div>

      <Card pad={false}>
        {rows.length === 0 && <Empty>No projects yet. Create the first one to start logging shifts against it.</Empty>}
        {rows.length > 0 && shown.length === 0 && <Empty>No project like this.</Empty>}
        {shown.map(({ p, stats, contract, last, who }, i) => {
          const news = inbox.unseen.filter(e => e.project === p.name).length
          return (
            <Link key={p.id} href={`/admin/projects/${p.id}`} className="xpl-row xpl-prow" style={{
              display: 'grid', gridTemplateColumns: 'minmax(220px, 1.5fr) minmax(190px, 1fr) minmax(170px, 1fr) minmax(190px, 1.1fr) 20px',
              gap: 18, alignItems: 'center', padding: '16px 18px', textDecoration: 'none', borderTop: i ? `1px solid ${T.line}` : undefined,
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14.5, fontWeight: 700, color: T.text }}>{p.name}</span>
                  <ProjectStatusTag status={p.status} />
                  <Status tone={WHO_TONE[who.kind]}>{WHO_DRILLS_LABEL[who.kind]}</Status>
                </div>
                <div style={{ fontSize: 12.5, color: T.muted, marginTop: 5 }}>{p.code} · {p.client}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: T.faint, marginTop: 3 }}><MapPin size={12} />{p.location}</div>
              </div>

              <div>
                <DepthBar drilled={stats.drilled} planned={stats.target || undefined} width="100%" />
                <div style={{ fontSize: 12, color: T.faint, marginTop: 4 }}>
                  {stats.counts.drilling} drilling · {stats.counts.planned} planned · {stats.counts.done} finished
                </div>
              </div>

              <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.6, minWidth: 0 }}>
                {who.kind === 'none' && <div style={{ color: T.text, fontWeight: 600 }}>No rig</div>}
                {who.own.length > 0 && <div><span style={{ color: T.faint }}>Own: </span><span style={{ color: T.text, fontWeight: 600 }}>{who.own.join(', ')}</span></div>}
                {who.contractors.map(c => (
                  <div key={c.name}><span style={{ color: T.faint }}>{c.name}: </span><span style={{ color: T.text, fontWeight: 600 }}>{c.rigs.join(', ')}</span></div>
                ))}
                <div style={{ color: T.faint }}>
                  {who.kind === 'mixed' && who.ownMetres + who.contractorMetres > 0
                    ? `${Math.round(who.contractorShare * 100)}% of metres by contractors`
                    : `${p.supervisors.length + p.drillers.length} people on site`}
                </div>
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <SharedTag shared={p.shared} client={p.client} />
                  {contract.waiting && <Status tone="warn">Rates with client</Status>}
                  {contract.returned && <Status tone="bad">Rates sent back</Status>}
                  {news > 0 && <Status tone="info">{news} new from client</Status>}
                </div>
                <div style={{ fontSize: 12, color: T.faint, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {contract.current ? `${structureWords(contract.current)} · since ${fullDate(contract.current.effectiveFrom)}` : 'No contract rates yet'}
                </div>
                {last && <div style={{ fontSize: 12, color: T.faint, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Last change: {last.title.toLowerCase()}, {whenIn(last.at)}</div>}
              </div>

              <ChevronRight size={16} style={{ color: T.faint }} />
            </Link>
          )
        })}
      </Card>

      <div style={{ fontSize: 12.5, color: T.faint, lineHeight: 1.6, maxWidth: 820 }}>
        Bits, rods and other parts are not set on the project. They are issued to each rig in Parts &amp; inventory, which is where their cost and life are tracked.
      </div>
    </Page>
  )
}
