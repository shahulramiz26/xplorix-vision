'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check } from 'lucide-react'
import {
  useCosting, blankClientRate, loginOfClient, rigPool, peoplePool, HOLE_SIZES, crewLine, money,
  type ClientRate, type ProjectRecord,
} from '../../../../lib/costing-store'
import { TODAY } from '../../../../lib/inventory-store'
import { nextProjectCode, holeSeriesStart, rateLines, structureWords, day } from '../../../../lib/projects'
import { Page, Head, Card, Btn, Field, Note, Switch, inputStyle, T, tint } from '../../../components/kit'
import { RateEditor, ratesUsable } from '../../../components/rate-card'
import { HoleRowsEditor, holeRowProblems, rowsToHoles, Fact, type HoleRow } from '../../../components/project-ui'

/* NEW PROJECT — the contract, entered once, in the order it is agreed.
 *
 *   1  the project     who it is for and where
 *   2  contract rates  what a metre, a standby day and the moves are paid at
 *   3  rigs and crew   what is going to site
 *   4  holes           what is planned to be drilled
 *   5  share           whether the client reads all of this in his portal
 *
 * Only step 1 is required. The rest can be filled later on the project's own
 * page; the last step says what is still missing and what that will stop. */

const STEPS = ['Project', 'Contract rates', 'Rigs and crew', 'Holes', 'Review and share'] as const

function Stepper({ step, done, go }: { step: number; done: (i: number) => boolean; go: (i: number) => void }) {
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {STEPS.map((label, i) => {
        const on = i === step
        const ok = i < step && done(i)
        return (
          <li key={label}>
            <button type="button" onClick={() => go(i)} aria-current={on ? 'step' : undefined} style={{
              display: 'flex', alignItems: 'center', gap: 9, padding: '8px 13px 8px 9px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 13, fontWeight: on ? 700 : 500, color: on ? T.text : T.muted,
              background: on ? tint(T.orange, 12) : 'transparent', border: `1px solid ${on ? tint(T.orange, 45) : T.border}`,
            }}>
              <span aria-hidden style={{
                width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 700,
                background: ok ? T.green : on ? T.orange : tint(T.faint, 20), color: ok || on ? '#fff' : T.muted,
              }}>{ok ? <Check size={13} /> : i + 1}</span>
              {label}
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function Pick({ on, label, sub, disabled, onClick }: { on: boolean; label: string; sub?: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} disabled={disabled} onClick={onClick} style={{
      textAlign: 'left', padding: '9px 13px', borderRadius: 10, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit', minWidth: 130,
      background: on ? tint(T.orange, 10) : 'transparent', border: `1px solid ${on ? T.orange : T.border}`, opacity: disabled ? 0.5 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span aria-hidden style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${on ? T.orange : T.dim}`, background: on ? T.orange : 'transparent', color: '#fff' }}>{on && <Check size={11} />}</span>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{label}</span>
      </div>
      {sub && <div style={{ fontSize: 11.5, color: T.faint, marginTop: 3, marginLeft: 24 }}>{sub}</div>}
    </button>
  )
}

/* Type a rig or a person that is not on record yet. */
function AddName({ hint, empty, taken, onAdd }: { hint: string; empty?: string; taken: string[]; onAdd: (v: string) => void }) {
  const [v, setV] = useState('')
  const name = v.trim()
  const clash = !!name && taken.some(t => t.toLowerCase() === name.toLowerCase())
  const add = () => { if (name && !clash) { onAdd(name); setV('') } }
  return (
    <div style={{ marginTop: 12 }}>
      {empty && <div style={{ fontSize: 13, color: T.faint, marginBottom: 8 }}>{empty}</div>}
      <form onSubmit={e => { e.preventDefault(); add() }} style={{ display: 'flex', gap: 8, maxWidth: 440 }}>
        <input value={v} onChange={e => setV(e.target.value)} placeholder={hint} aria-label={hint} style={inputStyle} />
        <Btn size="sm" disabled={!name || clash} onClick={add}>Add</Btn>
      </form>
      {clash && <div style={{ fontSize: 12, color: T.faint, marginTop: 5 }}>{name} is already on the list.</div>}
    </div>
  )
}

export default function NewProjectPage() {
  const router = useRouter()
  const { state, createProject } = useCosting()
  const projects = state.projects ?? []

  const [step, setStep] = useState(0)
  const [f, setF] = useState({
    name: '', code: nextProjectCode(projects), location: '', client: '', startDate: TODAY, plannedMetres: '', holeSize: 'HQ', dailyTarget: '',
    plannedEnd: '', budgetTotal: '', budgetPerMetre: '',
  })
  const [useRates, setUseRates] = useState(true)
  const [rate, setRate] = useState<ClientRate>(() => blankClientRate('', TODAY))
  const [rigs, setRigs] = useState<string[]>([])
  const [supervisors, setSupervisors] = useState<string[]>([])
  const [drillers, setDrillers] = useState<string[]>([])
  const [holes, setHoles] = useState<HoleRow[]>([])
  const [shared, setShared] = useState(true)
  const [tried, setTried] = useState(false)
  // Rigs and people typed in on this screen, on top of the ones already on record.
  const [extraRigs, setExtraRigs] = useState<string[]>([])
  const [extraSup, setExtraSup] = useState<string[]>([])
  const [extraDrill, setExtraDrill] = useState<string[]>([])
  const pool = useMemo(() => peoplePool(state), [state])
  const rigChoices = useMemo(() => [...rigPool(state), ...extraRigs.map(rig => ({ rig, type: 'Core' }))], [state, extraRigs])
  const supervisorChoices = [...pool.supervisors, ...extraSup.filter(n => !pool.supervisors.includes(n))]
  const drillerChoices = [...pool.drillers, ...extraDrill.filter(n => !pool.drillers.includes(n))]

  // Rigs and people already on another running project cannot be in two places.
  const busy = useMemo(() => {
    const rig: Record<string, string> = {}, person: Record<string, string> = {}
    projects.filter(p => p.status === 'active').forEach(p => {
      p.rigs.forEach(r => { rig[r] = p.code })
      ;[...p.supervisors, ...p.drillers].forEach(n => { person[n] = p.code })
    })
    return { rig, person }
  }, [projects])
  const takenHoles = useMemo(
    () => Array.from(new Set([...Object.keys(state.holePlans ?? {}), ...state.shiftLogs.map(l => l.holeNumber).filter(Boolean) as string[]])),
    [state.holePlans, state.shiftLogs])

  const nameClash = projects.some(p => p.name.trim().toLowerCase() === f.name.trim().toLowerCase())
  const codeClash = projects.some(p => p.code.trim().toLowerCase() === f.code.trim().toLowerCase())
  const step1 = !!f.name.trim() && !!f.code.trim() && !!f.location.trim() && !!f.client.trim() && !nameClash && !codeClash
  const holesOk = holeRowProblems(holes, takenHoles).every(p => !p)
  const done = (i: number) => i === 0 ? step1 : i === 1 ? useRates && ratesUsable(rate) : i === 2 ? rigs.length > 0 : i === 3 ? holes.length > 0 && holesOk : true
  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter(x => x !== v) : [...list, v])
  /* A project is shown to its client through the client's login, which is
   * created under Users. With no login there is nobody to show it to. */
  const login = loginOfClient(state.users, f.client)
  const knownClients = Array.from(new Set([...state.users.filter(u => u.role === 'client').map(u => u.client ?? u.name), ...projects.map(p => p.client)])).filter(Boolean)
  const clientHint = !f.client.trim() ? 'Who pays for the metres. Pick a client you already have, or type a new name.'
    : login ? `${f.client.trim()} has a client login (${login.username}). You can show this project in it.`
    : 'No client login yet. The project stays private until you create one under Users.'
  const willShare = shared && !!login
  const go = (i: number) => { if (i > 0 && !step1) { setTried(true); setStep(0); return } setStep(i) }

  const missing = [
    !(useRates && ratesUsable(rate)) && 'No contract rates: Finance cannot price a metre or raise an invoice until they are set.',
    rigs.length === 0 && 'No rig assigned: the supervisor cannot log a shift against this project.',
    holes.length === 0 && 'No holes planned: the forecast has nothing to drill into.',
  ].filter(Boolean) as string[]

  const create = () => {
    if (!step1 || !holesOk) return
    const name = f.name.trim()
    const project: ProjectRecord = {
      id: f.code.trim().toUpperCase(), code: f.code.trim().toUpperCase(), name, location: f.location.trim(), client: f.client.trim(),
      status: 'active', startDate: f.startDate, plannedMetres: parseFloat(f.plannedMetres) || undefined, holeSize: f.holeSize,
      dailyTarget: parseFloat(f.dailyTarget) || undefined,
      plannedEnd: f.plannedEnd && f.plannedEnd > f.startDate ? f.plannedEnd : undefined,
      budgetTotal: parseFloat(f.budgetTotal) || undefined, budgetPerMetre: parseFloat(f.budgetPerMetre) || undefined,
      shared: willShare, rigs, supervisors, drillers, createdAt: TODAY,
    }
    createProject(project, {
      rate: useRates && ratesUsable(rate) ? { ...rate, project: name, effectiveFrom: f.startDate, note: 'Contract as awarded' } : undefined,
      holes: rowsToHoles(holes),
    })
    router.push(`/admin/projects/${project.id}`)
  }

  const err: React.CSSProperties = { fontSize: 12, color: T.amber, marginTop: 5 }

  return (
    <Page>
      <Head title="New project" sub="Enter the contract once. Finance, the drill log, Inventory and the client's portal all read it from here."
        right={<Btn href="/admin/projects">Cancel</Btn>} />

      <Stepper step={step} done={done} go={go} />

      {step === 0 && (
        <Card title="The project" subtitle="Who it is for and where. The name is what every shift, rate and invoice will be filed under.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            <Field label="Project name">
              <input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="e.g. Site D - West Lode" style={inputStyle} autoFocus />
              {tried && !f.name.trim() && <div style={err}>Give the project a name</div>}
              {nameClash && <div style={err}>A project with this name already exists</div>}
            </Field>
            <Field label="Project code" hint="Short code used on invoices and in lists.">
              <input value={f.code} onChange={e => setF({ ...f, code: e.target.value })} style={inputStyle} />
              {codeClash && <div style={err}>This code is already used</div>}
            </Field>
            <Field label="Client" hint={clientHint}>
              <input value={f.client} onChange={e => setF({ ...f, client: e.target.value })} placeholder="Who pays for the metres" style={inputStyle} list="known-clients" />
              <datalist id="known-clients">{knownClients.map(n => <option key={n} value={n} />)}</datalist>
              {tried && !f.client.trim() && <div style={err}>Enter the client</div>}
            </Field>
            <Field label="Location">
              <input value={f.location} onChange={e => setF({ ...f, location: e.target.value })} placeholder="Block, district, state" style={inputStyle} />
              {tried && !f.location.trim() && <div style={err}>Enter the location</div>}
            </Field>
            <Field label="Start date" hint="Contract rates apply from this day.">
              <input type="date" value={f.startDate} onChange={e => setF({ ...f, startDate: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Metres in the contract" hint="Leave empty if the contract is not for a fixed quantity.">
              <input type="number" min={0} value={f.plannedMetres} onChange={e => setF({ ...f, plannedMetres: e.target.value })} placeholder="e.g. 3000" style={{ ...inputStyle, textAlign: 'right' }} />
            </Field>
            <Field label="Main core size">
              <select value={f.holeSize} onChange={e => setF({ ...f, holeSize: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
                {HOLE_SIZES.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </Field>
            <Field label="Daily target, metres per rig" hint="Your KPI. The Dashboard flags a rig that falls under it. The client never sees it.">
              <input type="number" min={0} value={f.dailyTarget} onChange={e => setF({ ...f, dailyTarget: e.target.value })} placeholder="e.g. 18" style={{ ...inputStyle, textAlign: 'right' }} />
            </Field>
            <Field label="Planned end of drilling" hint="Draws the planned line on the project's plan-against-actual chart. Optional.">
              <input type="date" value={f.plannedEnd} min={f.startDate} onChange={e => setF({ ...f, plannedEnd: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Total budget, SAR" hint="Your own figure. The client never sees it. Optional.">
              <input type="number" min={0} value={f.budgetTotal} onChange={e => setF({ ...f, budgetTotal: e.target.value })} placeholder="e.g. 12000000" style={{ ...inputStyle, textAlign: 'right' }} />
            </Field>
            <Field label="Budget per metre, SAR" hint="What a metre should cost. Optional.">
              <input type="number" min={0} value={f.budgetPerMetre} onChange={e => setF({ ...f, budgetPerMetre: e.target.value })} placeholder="e.g. 5000" style={{ ...inputStyle, textAlign: 'right' }} />
            </Field>
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card title="Contract rates" subtitle="What the client pays. Finance prices every metre from these, and nothing else."
          right={<Switch on={useRates} onChange={setUseRates} label={useRates ? 'Setting rates now' : 'Set rates later'} />}>
          {useRates
            ? <RateEditor value={rate} onChange={setRate} />
            : <Note tone="warn">Without contract rates the project can be drilled and logged, but Finance cannot price a metre or raise an invoice. You can set them later on the project page.</Note>}
        </Card>
      )}

      {step === 2 && (
        <>
          <Card title="Rigs" subtitle="A rig can be on one running project at a time.">
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {rigChoices.map(r => <Pick key={r.rig} on={rigs.includes(r.rig)} label={r.rig} disabled={!!busy.rig[r.rig]}
                sub={busy.rig[r.rig] ? `On ${busy.rig[r.rig]}` : `${r.type} rig · free`} onClick={() => toggle(rigs, setRigs, r.rig)} />)}
            </div>
            <AddName hint="Add a rig by its name or number, e.g. RIG-01" empty={rigChoices.length === 0 ? 'No rigs on record yet. Type the first one.' : undefined}
              taken={rigChoices.map(r => r.rig)} onAdd={v => { setExtraRigs(x => [...x, v]); setRigs(x => [...x, v]) }} />
          </Card>
          <Card title="Supervisors">
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {supervisorChoices.map(n => <Pick key={n} on={supervisors.includes(n)} label={n} disabled={!!busy.person[n]}
                sub={busy.person[n] ? `On ${busy.person[n]}` : 'Free'} onClick={() => toggle(supervisors, setSupervisors, n)} />)}
            </div>
            <AddName hint="Add a supervisor by name" empty={supervisorChoices.length === 0 ? 'No supervisors on record yet. Type the first one.' : undefined}
              taken={supervisorChoices} onAdd={v => { setExtraSup(x => [...x, v]); setSupervisors(x => [...x, v]) }} />
          </Card>
          <Card title="Drillers">
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {drillerChoices.map(n => <Pick key={n} on={drillers.includes(n)} label={n} disabled={!!busy.person[n]}
                sub={busy.person[n] ? `On ${busy.person[n]}` : 'Free'} onClick={() => toggle(drillers, setDrillers, n)} />)}
            </div>
            <AddName hint="Add a driller by name" empty={drillerChoices.length === 0 ? 'No drillers on record yet. Type the first one.' : undefined}
              taken={drillerChoices} onAdd={v => { setExtraDrill(x => [...x, v]); setDrillers(x => [...x, v]) }} />
          </Card>
        </>
      )}

      {step === 3 && (
        <Card title="Planned holes" subtitle="Each hole with its planned depth. More can be added at any time, by you or by the client.">
          <HoleRowsEditor rows={holes} setRows={setHoles} taken={takenHoles} defaultSize={f.holeSize} allowEmpty series={{ mine: [], start: holeSeriesStart(f.code) }} />
        </Card>
      )}

      {step === 4 && (
        <>
          <Card title={f.name.trim() || 'New project'} subtitle={`${f.code} · ${f.client || 'client not entered'} · ${f.location || 'location not entered'}`}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 18 }}>
              <Fact label="Starts">{day(f.startDate)}{f.plannedMetres ? <> · {Number(f.plannedMetres).toLocaleString('en-US')} m in the contract</> : null}</Fact>
              <Fact label="Contract rates">
                {useRates && ratesUsable(rate)
                  ? <>{structureWords(rate)}<div style={{ fontSize: 12.5, color: T.muted, marginTop: 3 }}>{rateLines(rate).filter(l => l.rate > 0).slice(0, 4).map(l => `${l.label} ${money(l.rate)}`).join(' · ')}</div></>
                  : <span style={{ color: T.muted }}>Not set</span>}
              </Fact>
              <Fact label="Rigs and crew">{rigs.length ? rigs.join(', ') : <span style={{ color: T.muted }}>No rig</span>}<div style={{ fontSize: 12.5, color: T.muted, marginTop: 3 }}>{crewLine({ supervisors, drillers })}</div></Fact>
              <Fact label="Holes">{holes.length ? `${holes.length} planned, ${holes.reduce((s, h) => s + (parseFloat(h.depth) || 0), 0).toLocaleString('en-US')} m` : <span style={{ color: T.muted }}>None planned</span>}</Fact>
            </div>
            {missing.length > 0 && (
              <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
                {missing.map(m => <Note key={m} tone="warn">{m}</Note>)}
              </div>
            )}
          </Card>

          <Card title="Share with the client">
            {login
              ? <Switch on={shared} onChange={setShared} label={`Show this project in ${f.client.trim()}'s client login`}
                  hint="The project appears in the client's login the moment you create it, and every later change reaches him as a notification." />
              : <Note tone="warn">
                  {f.client.trim() || 'This client'} has no client login yet, so the project is created private.
                  Create the login under <Link href="/admin/users?new=client" style={{ color: T.orange }}>Users</Link>, then switch sharing on from the project.
                </Note>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginTop: 12 }}>
              <div style={{ padding: '13px 15px', borderRadius: 10, border: `1px solid ${T.border}`, opacity: willShare ? 1 : 0.55 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text, marginBottom: 7 }}>The client sees</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: T.muted, lineHeight: 1.75 }}>
                  <li>The contract rates, and any change you propose</li>
                  <li>Planned holes and their progress</li>
                  <li>The rigs and crew on his site</li>
                  <li>Closed holes to approve and invoices to check</li>
                </ul>
              </div>
              <div style={{ padding: '13px 15px', borderRadius: 10, border: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text, marginBottom: 7 }}>The client never sees</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: T.muted, lineHeight: 1.75 }}>
                  <li>Your rig, fuel, crew and repair costs</li>
                  <li>Your margin on the project</li>
                  <li>Your stock, suppliers and purchase orders</li>
                  <li>Your bids and other projects</li>
                </ul>
              </div>
            </div>
            {willShare && (
              <div style={{ marginTop: 12 }}>
                <Note tone="info">After the project is shared, a change to the contract rates is sent to the client as a proposal and starts only when he accepts it. Changes to rigs, crew and holes take effect at once and he is notified.</Note>
              </div>
            )}
          </Card>
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>{step > 0 && <Btn onClick={() => setStep(step - 1)}>Back</Btn>}</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {step > 0 && step < 4 && <button type="button" onClick={() => setStep(4)} style={{ background: 'none', border: 'none', color: T.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Skip to review</button>}
          {step < 4
            ? <Btn kind="primary" onClick={() => go(step + 1)} disabled={step === 3 && !holesOk}>Next: {STEPS[step + 1].toLowerCase()}</Btn>
            : <Btn kind="primary" onClick={create} disabled={!step1 || !holesOk}>{willShare ? 'Create and share with the client' : 'Create project'}</Btn>}
        </div>
      </div>

      {step === 4 && !step1 && <Note tone="warn">The project needs a name, a client and a location. <Link href="#" onClick={e => { e.preventDefault(); setTried(true); setStep(0) }} style={{ color: T.orange, fontWeight: 600 }}>Go to step 1</Link></Note>}
    </Page>
  )
}
