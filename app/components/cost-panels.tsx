'use client'

import { useState, useMemo } from 'react'
import { useCosting, monthOf, newestFirst, C, iStyle, money, perUnit, monthLabel, fullDate, uid, ownershipBreakdown, blankOwnership, blankOperating, type RigOwnership, type OperatingRate } from '../../lib/costing-store'
import { TODAY } from '../../lib/inventory-store'
import { Field, NumField, TextField, DateField, Derived, Tag, Switch, Btn, Note, Modal, Grid, Section } from './cost-ui'

/* Effective dates are forward-only: a new set of rates can start today or
 * later, never before the last one. That is what makes history trustworthy —
 * nothing already costed can be rewritten from behind.
 *
 * The first set is different: nothing was costed before it, so it may start on
 * any day, and it starts by default on the day the rig began work. Costs typed
 * a week into a project then cover that first week too. */
export function nextAllowedDate(latest: string | undefined): string {
  const today = TODAY
  if (!latest) return ''
  // In UTC on purpose: a local midnight is the day before in UTC east of Greenwich.
  const d = new Date(latest + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  const after = d.toISOString().slice(0, 10)
  return after > today ? after : today
}

export function SaveRow({ onSave, label }: { onSave: () => void; label: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
      <Btn tone="primary" onClick={onSave}>{label}</Btn>
    </div>
  )
}

export function RigCostPanel({ rig, month, versions, firstDay, onSave }: {
  rig: string; month: string; versions: RigOwnership[]; firstDay: string; onSave: (o: RigOwnership, from: string, why: string) => void
}) {
  const latest = versions[0]
  const minDate = nextAllowedDate(latest?.effectiveFrom)
  const [f, setF] = useState<RigOwnership>(() => latest ? { ...latest, id: uid('own') } : blankOwnership(rig, minDate || firstDay))
  const [confirm, setConfirm] = useState(false)
  const u = (p: Partial<RigOwnership>) => setF(x => ({ ...x, ...p }))
  const b = ownershipBreakdown(f, month)

  return (
    <div>
      <InForce text={latest ? `${money(ownershipBreakdown(latest, month).perDay)}/day since ${fullDate(latest.effectiveFrom)}` : 'nothing set yet'} />

      {/* Both columns: one-line header, then a 2x2 grid, so the two sides line
          up on both axes. Depreciation's fourth cell is deliberately empty. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 26, marginTop: 18, alignItems: 'start' }}>
        <Section title="Landed cost" note="What the rig cost to put on site.">
          <Grid cols={2}>
            <NumField label="Basic price" value={f.basicPrice} onChange={n => u({ basicPrice: n })} suffix="SAR" />
            <NumField label="VAT" value={f.gstPercent} onChange={n => u({ gstPercent: n })} suffix="%" />
            <NumField label="Transportation" value={f.transportation} onChange={n => u({ transportation: n })} suffix="SAR" />
            <Derived label="Landed price" value={money(b.landedPrice)} color={C.orange}
              overridden={f.landedPriceOverride} onOverride={n => u({ landedPriceOverride: n })}
              onClear={() => u({ landedPriceOverride: undefined })} />
          </Grid>
        </Section>
        <Section title="Depreciation" note="Straight line on the landed price.">
          <Grid cols={2}>
            <NumField label="Rate per year" value={f.depreciationRatePct} onChange={n => u({ depreciationRatePct: n })} suffix="%" />
            <Derived label="Per year" value={money(b.depPerYear)} color={C.muted} />
            <Derived label="Per month" value={money(b.depPerMonth)} color={C.purple}
              overridden={f.depPerMonthOverride} onOverride={n => u({ depPerMonthOverride: n })}
              onClear={() => u({ depPerMonthOverride: undefined })} />
            <div />
          </Grid>
        </Section>
      </div>

      <div style={{ marginTop: 22 }}>
        <Section title="Finance" note="Enter the EMI you actually pay each month.">
          <Grid cols={4}>
            <NumField label="EMI per month" value={f.emiPerMonth} onChange={n => u({ emiPerMonth: n })} suffix="SAR" color={C.blue} />
            <Field label="EMI ends" hint="Optional. Without it a closed loan keeps charging forever.">
              <input type="month" value={f.emiEndsMonth ?? ''} onChange={e => u({ emiEndsMonth: e.target.value || undefined })}
                style={{ ...iStyle }} />
            </Field>
            <NumField label="Insurance per year" value={f.insurancePerYear} onChange={n => u({ insurancePerYear: n })} suffix="SAR" />
            <NumField label="Other fixed / month" value={f.otherFixedPerMonth} onChange={n => u({ otherFixedPerMonth: n })} suffix="SAR" />
          </Grid>
          {f.emiPerMonth > 0 && b.emiMonthsLeft >= 0 && (
            <Note tone={b.emiActive ? C.blue : C.green}>
              {b.emiActive
                ? `${b.emiMonthsLeft} payments left after ${monthLabel(month)}. When the loan closes, ownership falls to ${money((b.perMonth - b.emi) / Math.max(1, f.expectedOperatingDays))} per operating day and every hole gets cheaper.`
                : `The loan closed before ${monthLabel(month)}, so ownership is depreciation and insurance only.`}
            </Note>
          )}
        </Section>
      </div>

      <div style={{ marginTop: 22 }}>
        <Section title="Charging rules">
          <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: '2px 14px' }}>
            <Switch on={f.costBasis === 'cash'} onChange={v => u({ costBasis: v ? 'cash' : 'accounting' })}
              label="Include the EMI"
              hint="On, ownership is depreciation + EMI — how the money actually leaves the business. Off counts depreciation only." />
            <div style={{ height: 1, background: C.border }} />
            <Switch on={f.allocationBasis === 'expectedUnit'} onChange={v => u({ allocationBasis: v ? 'expectedUnit' : 'operatingDay' })}
              label="Charge per metre instead of per day"
              hint="Off, ownership lands on every day the rig is on site, so a standby day still carries it. On, it lands only on metres drilled — which makes a breakdown day look free." />
          </div>
          <Grid cols={4}>
            <NumField label="Expected operating days" value={f.expectedOperatingDays} onChange={n => u({ expectedOperatingDays: n })} suffix="/mth" />
            <NumField label="Expected metres" value={f.expectedUnitsPerMonth} onChange={n => u({ expectedUnitsPerMonth: n })} suffix="m/mth" />
            <div /><div />
          </Grid>
        </Section>
      </div>

      <Result title="What XPLORIX will charge" tag="ownership"
        pairs={[['Depreciation', money(b.depPerMonth), false], ['EMI', b.emi > 0 ? money(b.emi) : '—', b.emi === 0],
                ['Insurance', money(b.insurancePerMonth), false], ['Other fixed', money(b.otherFixedPerMonth), b.otherFixedPerMonth === 0]]}
        total={money(b.perMonth)} basis={b.basisLabel}
        answer={f.allocationBasis === 'expectedUnit' ? perUnit(b.perUnit) : `${money(b.perDay)}/day`} />

      <SaveRow label="Save rig cost" onSave={() => setConfirm(true)} />
      {confirm && <SaveDialog minDate={minDate} defaultFrom={firstDay} replacing={latest ? `${money(ownershipBreakdown(latest, month).perDay)}/day` : 'nothing'}
        onCancel={() => setConfirm(false)} onSave={(from, why) => { onSave(f, from, why); setConfirm(false) }} />}
    </div>
  )
}

export function InForce({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 11, color: C.faint }}>
      Currently in force: <span style={{ color: C.text, fontFamily: 'ui-monospace, monospace' }}>{text}</span>
    </div>
  )
}

export function Result({ title, tag, pairs, total, basis, answer }: {
  title: string; tag: string; pairs: [string, string, boolean][]; total: string; basis: string; answer: string
}) {
  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{title}</span>
        <Tag tone={C.purple}>{tag}</Tag>
      </div>
      <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
        {pairs.map(([k, v, dim]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
            <span style={{ fontSize: 11, color: C.faint }}>{k}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: dim ? C.dim : C.text, fontFamily: 'ui-monospace, monospace' }}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{ height: 1, background: C.border, margin: '13px 0' }} />
      <div style={{ fontSize: 13, color: C.muted, fontFamily: 'ui-monospace, monospace', display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span>{total}</span><span style={{ color: C.dim }}>{basis}</span><span style={{ color: C.dim }}>=</span>
        <span style={{ color: C.purple, fontWeight: 900, fontSize: 18 }}>{answer}</span>
      </div>
    </div>
  )
}

/* Date and reason are asked at the moment of saving, not while you are
 * entering numbers. Forward-only: a new set of rates starts today or later,
 * never before the last one, so nothing already costed can be rewritten. */
export function SaveDialog({ minDate, defaultFrom, replacing, onCancel, onSave }: {
  minDate: string; defaultFrom: string; replacing: string; onCancel: () => void; onSave: (from: string, why: string) => void
}) {
  const [from, setFrom] = useState(minDate || defaultFrom)
  const [why, setWhy] = useState(minDate ? '' : 'First costs for this rig')
  const tooEarly = !from || (!!minDate && from < minDate)
  return (
    <Modal title="When do these rates start?" subtitle={minDate ? `Replacing ${replacing}` : 'The first costs for this rig'} width={520} onClose={onCancel}
      footer={<><Btn onClick={onCancel}>Cancel</Btn>
        <Btn tone="primary" disabled={tooEarly || !why.trim()} onClick={() => onSave(from, why.trim())}>Save rates</Btn></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <DateField label="New rates start" value={from} onChange={setFrom} />
        <TextField label="Why" value={why} onChange={setWhy} placeholder="e.g. committee reclassification, fuel revision"
          hint="Shows in Rates history, so a year from now the change explains itself." />
        {!from
          ? <Note tone={C.red}>Choose the day these rates start.</Note>
          : tooEarly
          ? <Note tone={C.red}>Rates can only start on {fullDate(minDate)} or later — earlier work keeps the rate it was done under.</Note>
          : !minDate
          ? <Note tone={C.dim}>These are the first costs for this rig. Every shift from {fullDate(from)} on is costed at them; anything before carries no cost.</Note>
          : <Note tone={C.dim}>Work before {fullDate(from)} keeps the rate it was done under. Nothing already costed changes.</Note>}
      </div>
    </Modal>
  )
}

export function OperatingPanel({ rig, project, versions, firstDay, seed, onSave }: {
  rig: string; project: string; versions: OperatingRate[]; firstDay: string
  /* No costs yet for this rig on this project: start from its last project's, or
   * the company's latest, so the user checks figures instead of typing them. */
  seed?: OperatingRate
  onSave: (o: OperatingRate, from: string, why: string) => void
}) {
  const latest = versions[0]
  const minDate = nextAllowedDate(latest?.effectiveFrom)
  const [f, setF] = useState<OperatingRate>(() => latest ? { ...latest, id: uid('op') }
    : seed ? { ...seed, id: uid('op'), rig, project, effectiveFrom: firstDay, note: undefined }
    : blankOperating(rig, project, minDate || firstDay))
  const [confirm, setConfirm] = useState(false)
  const u = (p: Partial<OperatingRate>) => setF(x => ({ ...x, ...p }))
  const per = f.chargePerMetre ? 'SAR/m' : ''

  return (
    <div>
      <InForce text={latest ? `fuel SAR ${latest.fuelPricePerLitre}/L, labour ${money(latest.labourRate)} since ${fullDate(latest.effectiveFrom)}` : 'nothing set yet'} />
      {!latest && seed && (
        <div style={{ marginTop: 12 }}>
          <Note tone={C.amber}>
            Filled in from {seed.rig === rig ? `${rig} on ${seed.project}` : `${seed.rig} on ${seed.project}`}. Check each figure for this site, then save.
          </Note>
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <Note tone={C.dim}>
          Fuel, water, additives, metres and crew count come from the driller&apos;s log. Repairs come from the maintenance log.
          Tooling comes from what each rig is carrying — its starting kit plus everything issued since — and is charged
          against the ground the log recorded. Only the rates below are set here.
        </Note>
      </div>

      <div style={{ marginTop: 18 }}>
        <Section title="Unit prices" note="Consumption comes from the log; these turn it into riyals.">
          <Grid cols={3}>
            <NumField label="Fuel" value={f.fuelPricePerLitre} onChange={n => u({ fuelPricePerLitre: n })} suffix="SAR/L" color={C.amber} />
            <NumField label="Water" value={f.waterPricePerLitre} onChange={n => u({ waterPricePerLitre: n })} suffix="SAR/L" />
            <NumField label="Additives" value={f.additivePricePerKg} onChange={n => u({ additivePricePerKg: n })} suffix="SAR/kg" />
          </Grid>
        </Section>
      </div>

      <div style={{ marginTop: 20 }}>
        <Section title="Labour">
          <Grid cols={3}>
            <NumField label="Labour cost" value={f.labourRate} onChange={n => u({ labourRate: n })}
              suffix={per || 'SAR'} color={C.blue} hint={f.chargePerMetre ? 'per metre drilled' : 'per head, per shift'} />
            <NumField label="Lodging cost" value={f.lodgingRate} onChange={n => u({ lodgingRate: n })}
              suffix={per || 'SAR'} hint={f.chargePerMetre ? 'per metre drilled' : 'per head, per night'} />
            <NumField label="Transportation cost" value={f.transportRate} onChange={n => u({ transportRate: n })}
              suffix={per || 'SAR/day'} hint={f.chargePerMetre ? 'per metre drilled' : 'per day on site'} />
          </Grid>
        </Section>
      </div>

      <div style={{ marginTop: 20 }}>
        <Section title="Charging rules">
          <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: '2px 14px' }}>
            <Switch on={f.chargePerMetre} onChange={v => u({ chargePerMetre: v })}
              label="Charge per metre instead of per day"
              hint="Off, labour follows the crew count in the log and a standby day still costs. On, the three rates above are charged against metres drilled and crew count stops affecting cost." />
          </div>
        </Section>
      </div>

      <SaveRow label="Save operating cost" onSave={() => setConfirm(true)} />
      {confirm && <SaveDialog minDate={minDate} defaultFrom={firstDay} replacing={latest ? `fuel SAR ${latest.fuelPricePerLitre}/L` : 'nothing'}
        onCancel={() => setConfirm(false)} onSave={(from, why) => { onSave(f, from, why); setConfirm(false) }} />}
    </div>
  )
}

/* ── Cost forms opened from Rigs and from a project ─────────────────────────
 *
 * Each cost is entered where it belongs:
 *   rig cost        on the rig      (Rigs)      it follows the rig to every project
 *   operating cost  on the project  (Rigs and crew)  it changes from site to site
 * Finance shows both, lets you adjust them and keeps the history. */

type CostState = ReturnType<typeof useCosting>['state']

/* The first day this rig worked on this project, or the project's start, or today. */
export function firstDayOf(state: CostState, rig: string, project?: string): string {
  const logged = state.shiftLogs.filter(l => l.rig === rig && (!project || l.project === project)).map(l => l.date).sort()[0]
  const start = project ? (state.projects ?? []).find(p => p.name === project)?.startDate : undefined
  return [logged, start].filter(Boolean).sort()[0] ?? TODAY
}

export function rigCostLine(state: CostState, rig: string): string | null {
  const v = newestFirst(state.ownership.filter(o => o.rig === rig))[0]
  return v ? `${money(ownershipBreakdown(v, monthOf(TODAY)).perDay)} a day` : null
}

export function operatingLine(state: CostState, rig: string, project: string): string | null {
  const v = newestFirst(state.operating.filter(o => o.rig === rig && o.project === project))[0]
  return v ? `fuel SAR ${v.fuelPricePerLitre}/L · labour ${money(v.labourRate)}${v.chargePerMetre ? '/m' : ' a head a shift'}` : null
}

/* The operating cost a new rig-on-project starts from: this rig's last project,
 * else the company's most recent operating cost on any rig. */
export function operatingSeed(state: CostState, rig: string, project: string): OperatingRate | undefined {
  const others = state.operating.filter(o => o.project !== project || o.rig !== rig)
  return newestFirst(others.filter(o => o.rig === rig))[0] ?? newestFirst(others)[0]
}

export function RigCostModal({ rig, hired, onClose }: { rig: string; hired?: boolean; onClose: () => void }) {
  const { state, saveOwnership } = useCosting()
  const versions = useMemo(() => newestFirst(state.ownership.filter(o => o.rig === rig)), [state.ownership, rig])
  return (
    <Modal title={`Rig cost · ${rig}`} subtitle="What owning this rig costs. It applies to this rig on every project." width={940} onClose={onClose}>
      {hired && <div style={{ marginBottom: 14 }}><Note tone={C.blue}>A hired rig: leave the price at 0 and put the monthly hire under Other fixed / month.</Note></div>}
      <RigCostPanel rig={rig} month={monthOf(TODAY)} versions={versions} firstDay={firstDayOf(state, rig)}
        onSave={(o, from, why) => { saveOwnership({ ...o, effectiveFrom: from, note: why }); onClose() }} />
    </Modal>
  )
}

export function OperatingCostModal({ rig, project, onClose }: { rig: string; project: string; onClose: () => void }) {
  const { state, saveOperating } = useCosting()
  const versions = useMemo(() => newestFirst(state.operating.filter(o => o.rig === rig && o.project === project)), [state.operating, rig, project])
  const seed = useMemo(() => operatingSeed(state, rig, project), [state, rig, project])
  return (
    <Modal title={`Operating cost · ${rig}`} subtitle={`What running this rig costs on ${project}: fuel, water, additives, crew, lodging, transport.`} width={900} onClose={onClose}>
      <OperatingPanel rig={rig} project={project} versions={versions} firstDay={firstDayOf(state, rig, project)} seed={seed}
        onSave={(o, from, why) => { saveOperating({ ...o, effectiveFrom: from, note: why }); onClose() }} />
    </Modal>
  )
}
