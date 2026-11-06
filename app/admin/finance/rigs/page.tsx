'use client'

import { useEscape } from '../../../components/kit'

import { useState, useMemo, useEffect, useCallback, Fragment, ReactNode, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useInventory, toolingRatesFor } from '../../../../lib/inventory-store'
import {
  CostingProvider, useCosting,
  C, LAYER, iStyle, derivedStyle, money, perUnit, pct,
  cpuColor, marginColor, holeStatusColor,
  monthLabel, monthShort, dayLabel, fullDate, monthOf, daysInMonth, shiftMonth,
  projectCode, rigCode, holesFromDays,
  rigsFor, monthsFor, versionOn, newestFirst, uid,
  ownershipBreakdown, dayCost, rollup, withCumulative, holeResult,
  isFinished, ANY_FORMATION, structureLabel,
  INVOICE_STATUSES, INVOICE_STATUS_LABEL, isOverdue, outstanding,
  blankOwnership, blankOperating, blankClientRate,
  PROJECT_CLIENTS, ROCK_CATEGORIES, HOLE_SIZES, DAY_STATUS_LABEL,
  isShared, clientOf, HOLE_STATUS_LABEL, OWNER_INVOICE_LABEL, disputedAmount,
  type DayCost, type DayCostMTD, type Rollup, type OwnershipBreakdown,
  type RigOwnership, type OperatingRate, type ClientRate, type HoleStatus,
  type HoleResult, type Invoice, type InvoiceLine, type RateRow, type RateAdjustment,
  type InvoiceStatus, type RateStructure,
} from '../../../../lib/costing-store'
import { computeRigMonth, type RigMonthView } from '../../../../lib/costing-view'
import { checkHole, looseStandby } from '../../../../lib/money-checks'
import { workOrderFor, contractorName, words, currentPayRate } from '../../../../lib/contracting'
import { TODAY } from '../../../../lib/inventory-store'
import Link from 'next/link'
import { Card, Stat, Field, NumField, TextField, DateField, Derived, Tag, Switch, Toggle, Btn, Note, Empty, Modal, Grid, Section, th, thR, td, tdN, tableStyle, rowBorder, fm } from '../../../components/cost-ui'
import { nextAllowedDate, SaveRow, RigCostPanel, InForce, Result, SaveDialog, OperatingPanel } from '../../../components/cost-panels'
import { hexA } from '../../../../lib/theme'

/* ==========================================================================
 * XPLORIX COSTING — one screen.
 *
 * Project -> rig -> month, then three views of the same costed data. Two
 * buttons top right: Adjust costs (two tabs) and Rates history.
 *
 * Sections below, in order:
 *   1  UI primitives
 *   2  The costing view (turns logs + dated rates into days)
 *   3  Adjust costs   — Rig cost / Operating cost (entered on Rigs and on the project). What the client pays is
 *                       the project's contract rates, set on the Projects screen.
 *   4  Rates history
 *   5  Performance / Drillholes / Tracker
 *   6  The screen
 * ========================================================================== */

/* ==========================================================================
 * 1  UI primitives
 * ========================================================================== */


/* ==========================================================================
 * 2  The costing view
 *
 * One place turns logs plus dated rates into days, so the Performance table,
 * the Drillholes table and the invoice can never disagree. If a number appears
 * in two tabs it came from the same call.
 * ========================================================================== */

/* computeRigMonth and its result type live in lib/costing-view.ts, so the
 * Dashboard can show this month's cost, revenue and margin from the very same
 * calculation instead of a second one that could drift from it. */
function useRigMonthView(project: string, rig: string, month: string): RigMonthView {
  const { state } = useCosting()
  const { state: inv } = useInventory()
  return useMemo(() => computeRigMonth(state, inv, project, rig, month), [state, inv, project, rig, month])
}

/* Every month this rig has logs for, costed, so the strip above the table can
 * show where this month sits against the ones before it. */
interface MonthPoint { month: string; cpu: number; rate: number; units: number }

function useMonthTrend(project: string, rig: string): MonthPoint[] {
  const { state } = useCosting()
  const { state: inv } = useInventory()
  return useMemo(() => {
    if (!rig || !project) return []
    return monthsFor(state.shiftLogs, rig, project)
      .map(m => {
        const v = computeRigMonth(state, inv, project, rig, m)
        return { month: m, cpu: v.roll.cpu, rate: v.roll.revenuePerUnit, units: v.roll.units }
      })
      .filter(x => x.units > 0)
  }, [state, inv, project, rig])
}

/* ==========================================================================
 * 3  Set rates
 * ========================================================================== */

type CostSection = 'rig' | 'operating'


function SetRatesModal({ projects, initialProject, initialRig, rigsForProject, month, onClose }: {
  projects: string[]
  initialProject: string
  initialRig: string
  rigsForProject: (p: string) => string[]
  month: string
  onClose: () => void
}) {
  const { state, saveOwnership, saveOperating } = useCosting()
  const [project, setProject] = useState(initialProject)
  const [rig, setRig] = useState(initialRig)
  const [confirmed, setConfirmed] = useState(false)
  // The first day this rig worked on this project: where a first set of costs starts.
  const firstDay = useMemo(() => {
    const logged = state.shiftLogs.filter(l => l.rig === rig && l.project === project).map(l => l.date).sort()[0]
    const start = (state.projects ?? []).find(p => p.name === project)?.startDate
    return [logged, start].filter(Boolean).sort()[0] ?? TODAY
  }, [state.shiftLogs, state.projects, rig, project])
  const [section, setSection] = useState<CostSection>('operating')

  const rigs = rigsForProject(project)
  useEffect(() => { if (!rigs.includes(rig)) setRig(rigs[0] ?? '') }, [rigs, rig])

  // Which rig and project a rate belongs to is recorded on every version, so
  // the history can say exactly what was changed and where.
  if (!confirmed) {
    return (
      <Modal title="Adjust costs" subtitle="Which rig and project?" width={620} onClose={onClose}
        footer={<><Btn onClick={onClose}>Cancel</Btn>
          <Btn tone="primary" disabled={!project || !rig} onClick={() => setConfirmed(true)}>Continue</Btn></>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <Field label="Project">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {projects.map(p => <Pick key={p} on={project === p} onClick={() => setProject(p)} title={projectCode(p)} sub={PROJECT_CLIENTS[p] || '—'} />)}
            </div>
          </Field>
          <Field label="Rig">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {rigs.length === 0
                ? <span style={{ fontSize: 12, color: C.faint }}>No rigs on this project yet.</span>
                : rigs.map(r => <Pick key={r} on={rig === r} onClick={() => setRig(r)} title={rigCode(r)}
                    sub={state.ownership.some(o => o.rig === r) ? 'rig cost set' : 'no rig cost'} />)}
            </div>
          </Field>
          <Note tone={C.dim}>
            Costs are entered where they belong: the rig cost on the rig, under Rigs, and the operating cost when the rig is put on a project.
            Here you can check and adjust both. Rig cost applies to this rig on every project; operating cost to this rig on this project.
            What the client pays is not set here: contract rates belong to the project, where the client can see and accept them.
            Tooling is not set here either — it comes from what the rig is carrying, in Parts &amp; inventory.
          </Note>
        </div>
      </Modal>
    )
  }

  const ownVersions = newestFirst(state.ownership.filter(o => o.rig === rig))
  const opVersions = newestFirst(state.operating.filter(o => o.rig === rig && o.project === project))
  const contract = versionOn(state.clientRates.filter(c => c.project === project), TODAY)
  const projectId = (state.projects ?? []).find(p => p.name === project)?.id

  const scope = section === 'rig' ? `${rig} · every project` : `${rig} · ${project}`

  return (
    <Modal title="Adjust costs" subtitle={scope} width={980} onClose={onClose}>
      <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start' }}>

        {/* Sidebar */}
        <div style={{ width: 210, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <SideItem on={section === 'rig'} onClick={() => setSection('rig')} label="Rig cost" />
          <SideItem on={section === 'operating'} onClick={() => setSection('operating')} label="Operating cost" />

          <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.dim, lineHeight: 1.6 }}>
              {project}<br />{rig}
            </div>
            <button onClick={() => setConfirmed(false)}
              style={{ marginTop: 8, background: 'none', border: 'none', color: C.faint, fontSize: 11, cursor: 'pointer', padding: 0, textDecoration: 'underline', fontFamily: 'inherit' }}>
              Change
            </button>
          </div>

          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: C.muted }}>Contract rates</div>
            <div style={{ fontSize: 11.5, color: C.faint, lineHeight: 1.55, marginTop: 4 }}>
              {contract ? `${structureLabel(contract)}, since ${fullDate(contract.effectiveFrom)}.` : 'Not set for this project yet.'} What the client pays is set on the project.
            </div>
            {projectId && (
              <a href={`/admin/projects/${projectId}?tab=rates`} style={{ display: 'inline-block', marginTop: 6, fontSize: 12, fontWeight: 600, color: C.orange, textDecoration: 'none' }}>Open the project</a>
            )}
          </div>
        </div>

        {/* Panel */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {section === 'rig' && <RigCostPanel rig={rig} month={month} versions={ownVersions} firstDay={firstDay}
            onSave={(o, from, why) => saveOwnership({ ...o, effectiveFrom: from, note: why })} />}
          {section === 'operating' && <OperatingPanel rig={rig} project={project} versions={opVersions} firstDay={firstDay}
            onSave={(o, from, why) => saveOperating({ ...o, effectiveFrom: from, note: why })} />}
        </div>
      </div>
    </Modal>
  )
}

function SideItem({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} style={{
      textAlign: 'left', padding: '8px 12px', borderRadius: 8,
      fontSize: 13, fontWeight: on ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit',
      background: on ? 'color-mix(in srgb, var(--x-orange) 12%, transparent)' : 'transparent',
      border: 'none', borderLeft: `2px solid ${on ? C.orange : 'transparent'}`,
      color: on ? C.orange : C.muted, width: '100%',
    }}>{label}</button>
  )
}


/* One row per tender line: a size, a formation, a rate. Adjustments hang off
 * their own row because that is how the tender writes them. */
/* ==========================================================================
 * 4  Rates history
 * ========================================================================== */

/* RATES HISTORY — a list of changes, not of states.
 *
 * Each row is diffed against the previous entry of the same kind, so it reads
 * "SAR 12,650 → SAR 14,100" rather than making you compare two rows by eye. There is
 * no delete: forward-only dates exist so nothing already costed can be
 * rewritten, and a delete button would walk straight through that. */
function RatesHistoryModal({ project, rig, onClose }: { project: string; rig: string; onClose: () => void }) {
  const { state } = useCosting()

  interface Row { id: string; from: string; rigs: string; what: string; tone: string; changed: string[]; why: string }
  const rows: Row[] = []

  const own = newestFirst(state.ownership.filter(o => o.rig === rig))
  own.forEach((o, i) => {
    const prev = own[i + 1]
    const b = ownershipBreakdown(o, monthOf(o.effectiveFrom))
    const changed: string[] = []
    if (!prev) changed.push(`First set — ${money(b.perDay)}/day`)
    else {
      const pb = ownershipBreakdown(prev, monthOf(o.effectiveFrom))
      if (Math.round(pb.depPerMonth) !== Math.round(b.depPerMonth)) changed.push(`Depreciation ${money(pb.depPerMonth)} → ${money(b.depPerMonth)}`)
      if (Math.round(pb.emi) !== Math.round(b.emi)) changed.push(`EMI ${money(pb.emi)} → ${money(b.emi)}`)
      if (Math.round(pb.perDay) !== Math.round(b.perDay)) changed.push(`Per day ${money(pb.perDay)} → ${money(b.perDay)}${delta(pb.perDay, b.perDay)}`)
      if (!changed.length) changed.push('No change to the daily figure')
    }
    rows.push({ id: o.id, from: o.effectiveFrom, rigs: rigCode(o.rig), what: 'Rig cost', tone: LAYER.ownership, changed, why: o.note || '—' })
  })

  const ops = newestFirst(state.operating.filter(o => o.rig === rig && o.project === project))
  ops.forEach((o, i) => {
    const prev = ops[i + 1]
    const changed: string[] = []
    if (!prev) changed.push(`First set — fuel SAR ${o.fuelPricePerLitre}/L, labour ${money(o.labourRate)}`)
    else {
      if (prev.fuelPricePerLitre !== o.fuelPricePerLitre) changed.push(`Fuel SAR ${prev.fuelPricePerLitre} → SAR ${o.fuelPricePerLitre}/L${delta(prev.fuelPricePerLitre, o.fuelPricePerLitre)}`)
      if (prev.labourRate !== o.labourRate) changed.push(`Labour ${money(prev.labourRate)} → ${money(o.labourRate)}${delta(prev.labourRate, o.labourRate)}`)
      if (prev.lodgingRate !== o.lodgingRate) changed.push(`Lodging ${money(prev.lodgingRate)} → ${money(o.lodgingRate)}`)
      if (prev.transportRate !== o.transportRate) changed.push(`Transport ${money(prev.transportRate)} → ${money(o.transportRate)}`)
      if (prev.waterPricePerLitre !== o.waterPricePerLitre) changed.push(`Water SAR ${prev.waterPricePerLitre} → SAR ${o.waterPricePerLitre}/L`)
      if (prev.additivePricePerKg !== o.additivePricePerKg) changed.push(`Additives SAR ${prev.additivePricePerKg} → SAR ${o.additivePricePerKg}/kg`)
      if (prev.chargePerMetre !== o.chargePerMetre) changed.push(o.chargePerMetre ? 'Switched to charging per metre' : 'Switched to charging per day')
      if (!changed.length) changed.push('No change')
    }
    rows.push({ id: o.id, from: o.effectiveFrom, rigs: rigCode(o.rig), what: 'Operating cost', tone: LAYER.operating, changed, why: o.note || '—' })
  })

  // Client cost belongs to the project, so it applies to every rig drilling it.
  const projectRigs = rigsFor(state.shiftLogs, project).map(rigCode)
  const crs = newestFirst(state.clientRates.filter(c => c.project === project))
  crs.forEach((c, i) => {
    const prev = crs[i + 1]
    const changed: string[] = []
    if (!prev) changed.push(`First set — ${c.rateRows.length} rate lines`)
    else {
      c.rateRows.forEach(r => {
        const pr = prev.rateRows.find(x => x.holeSize === r.holeSize && x.formation === r.formation && x.fromDepth === r.fromDepth)
        const band = r.fromDepth != null || r.toDepth != null ? ` ${r.fromDepth ?? 0}–${r.toDepth ?? '∞'} m` : ''
        if (!pr) changed.push(`Added ${r.holeSize} ${r.formation}${band} ${perUnit(r.rate)}`)
        else if (pr.rate !== r.rate) changed.push(`${r.holeSize} ${r.formation}${band} ${perUnit(pr.rate)} → ${perUnit(r.rate)}${delta(pr.rate, r.rate)}`)
      })
      prev.rateRows.forEach(pr => {
        if (!c.rateRows.some(r => r.holeSize === pr.holeSize && r.formation === pr.formation && r.fromDepth === pr.fromDepth)) changed.push(`Removed ${pr.holeSize} ${pr.formation}`)
      })
      if (prev.standbyPerDay !== c.standbyPerDay) changed.push(`Standby ${money(prev.standbyPerDay)} → ${money(c.standbyPerDay)}/day`)
      if (!changed.length) changed.push('No change')
    }
    rows.push({
      id: c.id, from: c.effectiveFrom,
      rigs: projectRigs.length ? projectRigs.slice(0, 3).join(', ') + (projectRigs.length > 3 ? ` +${projectRigs.length - 3}` : '') : '—',
      what: 'Contract rates', tone: LAYER.revenue, changed, why: c.note || '—',
    })
  })

  rows.sort((a, b) => b.from.localeCompare(a.from))

  return (
    <Modal title="Rates history" subtitle={`${rigCode(rig)} · ${projectCode(project)} — what changed, when, and why`} width={960} onClose={onClose}>
      {rows.length === 0 ? <Empty>No rates set yet.</Empty> : (
        <>
          <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
            <table style={tableStyle}>
              <thead>
                <tr><th style={th}>Date</th><th style={th}>Rig</th><th style={th}>What</th><th style={th}>What changed</th><th style={th}>Why</th></tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} style={{ borderBottom: rowBorder, verticalAlign: 'top' }}>
                    <td style={{ ...td, color: C.text, fontWeight: 700 }}>{fullDate(r.from)}</td>
                    <td style={{ ...td, fontFamily: 'ui-monospace, monospace' }}>{r.rigs}</td>
                    <td style={td}><Tag tone={r.tone}>{r.what}</Tag></td>
                    <td style={{ ...td, whiteSpace: 'normal', maxWidth: 300, color: C.muted, lineHeight: 1.7 }}>
                      {r.changed.map((c, k) => <div key={k}>{c}</div>)}
                    </td>
                    <td style={{ ...td, whiteSpace: 'normal', maxWidth: 220, color: C.text, lineHeight: 1.6 }}>{r.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 14 }}>
            <Note tone={C.dim}>
              Tooling is not listed here. It changes every time the store issues a part, and its history lives with the
              issue that caused it — in Parts &amp; inventory, under the rig.
            </Note>
          </div>
        </>
      )}
    </Modal>
  )
}

function delta(from: number, to: number) {
  if (!from) return ''
  const p = ((to - from) / from) * 100
  return ` (${p >= 0 ? '+' : ''}${p.toFixed(1)}%)`
}

/* ==========================================================================
 * 5  Tabs
 * ========================================================================== */

/* PERFORMANCE — how the month is going, day by day.
 *
 * The table shows the most recent fifteen logged days, because that is the
 * stretch anyone actually reads; the whole month is one click away and the
 * footer always totals the month regardless. Above it, where this month sits
 * against the ones before, and where it stands right now.
 *
 * A zero-metre day shows its cost with CPM as "—", never zero, because the rig
 * still cost money that day.
 *
 * Every figure left of Service comes from a log. Everything right of it is that
 * quantity priced by the rate version in force on that day. */

const WINDOW = 15

const FORMATION_TONE: Record<string, string> = {
  Soft: C.green, Medium: C.teal, Hard: C.amber, 'Very Hard': C.red,
}

/* The ground a day spent most of its metres in. A day that crossed a boundary
 * still has one dominant band, and that is what colours its point. */
function dominantGround(d: DayCostMTD): string | null {
  if (!d.toolingByFormation.length) return null
  return d.toolingByFormation.reduce((a, b) => (a.metres >= b.metres ? a : b)).formation
}

function PerformanceTab({ v, rig, project, month }: {
  v: RigMonthView; rig: string; project: string; month: string
}) {
  const [open, setOpen] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const trend = useMonthTrend(project, rig)

  if (!v.hasLogs) {
    return <Card><Empty>No driller logs for {rigCode(rig)} in {monthLabel(month)}.<br />Costing reads metres, hours, crew and fuel from the log — once shifts are recorded they cost out here.</Empty></Card>
  }

  const rate = v.roll.revenuePerUnit
  const r = v.roll

  /* The latest fifteen days that actually have a log. Counting back fifteen
   * calendar days from month end would show empty rows for a rig that stopped
   * early. A missing log inside the run still shows — that is information. */
  const lastLogged = v.days.reduce((acc, d, i) => (d.submitted ? i : acc), 0)
  /* The most recent day that actually put metres in the ground. A standby day
   * has no cost per metre, so it cannot be the live rate. */
  const live = [...v.days].reverse().find(d => d.cpu != null) ?? null
  const from = showAll ? 0 : Math.max(0, lastLogged - WINDOW + 1)
  const days = showAll ? v.days : v.days.slice(from, lastLogged + 1)
  const hidden = v.days.length - days.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Where this month sits, and where it stands right now. */}
      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
        padding: '14px 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 20, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.1em', marginRight: 4 }}>
            Cost per metre by month
          </span>
          {trend.length === 0 && <span style={{ fontSize: 12, color: C.faint }}>No costed months yet.</span>}
          {trend.map((t, i) => {
            const prev = trend[i - 1]
            const move = prev && prev.cpu > 0 ? ((t.cpu - prev.cpu) / prev.cpu) * 100 : null
            const on = t.month === month
            return (
              <div key={t.month} style={{
                padding: '7px 12px', borderRadius: 9, minWidth: 104,
                background: on ? 'color-mix(in srgb, var(--x-orange) 12%, transparent)' : 'rgba(var(--x-ov),0.03)',
                border: `1px solid ${on ? `${hexA(C.orange, 0x66)}` : C.border}`,
              }}>
                <div style={{ fontSize: 10, color: on ? C.orange : C.faint, fontWeight: 700 }}>
                  {monthShort(t.month)}
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: t.rate ? cpuColor(t.cpu, t.rate) : C.text, fontFamily: 'ui-monospace, monospace', marginTop: 2 }}>
                  {perUnit(t.cpu)}
                </div>
                {move != null && (
                  <div style={{ fontSize: 10, color: move > 0 ? C.red : C.green, marginTop: 2, fontFamily: 'ui-monospace, monospace' }}>
                    {move > 0 ? '▲' : '▼'} {Math.abs(move).toFixed(1)}%
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* The rate as it stands right now — the most recent day that actually
            drilled. The month-to-date figure lives in the strip on the left,
            where it can be read against the months before it. */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            {live ? `Today's rate · ${fullDate(live.date)}` : 'No metres drilled yet'}
          </div>
          <div style={{ fontSize: 27, fontWeight: 900, fontFamily: 'ui-monospace, monospace', lineHeight: 1.15, color: live && live.rate ? cpuColor(live.cpu!, live.rate) : C.text }}>
            {live ? perUnit(live.cpu) : '—'}
          </div>
          <div style={{ fontSize: 11, color: C.faint, marginTop: 3 }}>
            {live && live.rate > 0
              ? `${dominantGround(live) ?? 'ground'} billed at ${perUnit(live.rate)}: ${live.rate - live.cpu! >= 0 ? `${perUnit(live.rate - live.cpu!)} left on a metre` : `a loss of ${perUnit(live.cpu! - live.rate)} on a metre`}`
              : live
              ? 'no client rate matched this ground'
              : 'the last logged day drilled nothing'}
          </div>
          <div style={{ fontSize: 10.5, color: C.dim, marginTop: 4 }}>
            {monthLabel(month)} to date {perUnit(r.cpu)}
          </div>
        </div>
      </div>

      <Card title="Performance"
        subtitle={showAll
          ? `${rigCode(rig)} · ${monthLabel(month)} · every day · click a day for the full breakdown`
          : `${rigCode(rig)} · the last ${days.length} logged days · click a day for the full breakdown`}
        pad={false}
        right={hidden > 0 || showAll
          ? <Btn size="sm" onClick={() => setShowAll(!showAll)}>{showAll ? `Show last ${WINDOW} days` : 'Show whole month'}</Btn>
          : undefined}>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={th}>Date</th><th style={th}>Hole</th>
                <th style={th}>Size</th><th style={th}>Ground</th><th style={thR}>Crew</th><th style={thR}>Drill hrs</th><th style={thR}>Downtime</th><th style={thR}>Metres</th>
                <th style={thR}>Maint hrs</th><th style={thR}>Service</th><th style={thR}>Tooling</th><th style={thR}>Tooling/m</th>
                <th style={thR}>Fuel</th><th style={thR}>Labour</th>
                <th style={thR}>Operating</th><th style={thR}>Ownership</th><th style={thR}>Total</th>
                <th style={thR}>CPM</th><th style={thR}>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {days.map(d => {
                const isOpen = open === d.date
                return (
                  <Fragment key={d.date}>
                    <tr onClick={() => setOpen(isOpen ? null : d.date)} style={{
                      borderBottom: rowBorder, cursor: 'pointer',
                      background: isOpen ? 'color-mix(in srgb, var(--x-orange) 5%, transparent)'
                        : !d.submitted ? 'color-mix(in srgb, var(--x-red) 6%, transparent)'
                        : d.status === 'breakdown' ? 'color-mix(in srgb, var(--x-red) 5%, transparent)'
                        : d.status === 'standby' ? 'color-mix(in srgb, var(--x-amber) 4.5%, transparent)'
                        : undefined,
                      borderLeft: d.status === 'breakdown' ? `2px solid ${C.red}`
                        : d.status === 'standby' ? `2px solid ${C.amber}` : '2px solid transparent',
                    }}>
                      <td style={{ ...td, color: C.text, fontWeight: 600 }}>
                        {dayLabel(d.date)}
                        {!d.submitted && <span style={{ marginLeft: 6 }}><Tag tone={C.red}>no log</Tag></span>}
                      </td>
                      <td style={{ ...td, color: d.holeNumber ? C.muted : C.dim }}>{d.holeNumber || '—'}</td>
                      <td style={{ ...td, fontFamily: 'ui-monospace, monospace' }}>{d.shifts[0]?.holeSize ?? '—'}</td>
                      <td style={{ ...td, color: d.units ? C.muted : C.dim }}>
                        {d.toolingByFormation.length ? d.toolingByFormation.map(x => x.formation).join(' → ') : '—'}
                      </td>
                      <td style={tdN}>{d.labour.heads || '—'}</td>
                      <td style={tdN}>{d.drillingHours || '—'}</td>
                      <td style={{ ...tdN, color: d.downtimeHours ? C.red : C.dim }}>{d.downtimeHours || '—'}</td>
                      <td style={{ ...tdN, color: d.units ? C.text : C.dim, fontWeight: 700 }}>{d.units ? fm(d.units) : '—'}</td>
                      <td style={tdN}>{d.maintenanceHours || '—'}</td>
                      <td style={{ ...tdN, color: d.repairs ? C.purple : C.dim }}>{d.repairs ? money(d.repairs) : '—'}</td>
                      <td style={{ ...tdN, color: d.parts ? C.muted : C.dim }}>{d.parts ? money(d.parts) : '—'}</td>
                      <td style={{ ...tdN, color: d.units ? C.orange : C.dim }}>{d.units ? perUnit(d.toolingRate) : '—'}</td>
                      <td style={tdN}>{money(d.fuel)}</td>
                      <td style={tdN}>{money(d.labour.total)}</td>
                      <td style={{ ...tdN, color: LAYER.operating }}>{money(d.operating)}</td>
                      <td style={{ ...tdN, color: LAYER.ownership }}>{d.ownership > 0 ? money(d.ownership) : '—'}</td>
                      <td style={{ ...tdN, color: C.text, fontWeight: 800 }}>{money(d.total)}</td>
                      <td style={{ ...tdN, fontWeight: 800, color: d.cpu == null ? C.dim : rate ? cpuColor(d.cpu, rate) : C.text }}>
                        {d.cpu == null ? '—' : perUnit(d.cpu)}
                      </td>
                      <td style={{ ...tdN, color: d.revenue > 0 ? LAYER.revenue : C.dim }}>{d.revenue > 0 ? money(d.revenue) : '—'}</td>
                    </tr>
                    {isOpen && (
                      <tr style={{ borderBottom: rowBorder, background: 'color-mix(in srgb, var(--x-orange) 3%, transparent)' }}>
                        <td colSpan={19} style={{ padding: '16px 18px' }}>
                          <div style={{ display: 'flex', gap: 44, flexWrap: 'wrap' }}>
                            <Detail title="From the log" tone={C.blue} rows={[
                              ['Status', DAY_STATUS_LABEL[d.status]],
                              ['Shifts', `${d.shifts.length}`],
                              ['Day crew', `${d.labour.dayCrew}`],
                              ['Night crew', `${d.labour.nightCrew}`],
                              ['Core recovery', d.units > 0 ? pct((d.coreRecovery / d.units) * 100) : '—'],
                            ]} />
                            <Detail title="Operating" tone={LAYER.operating} rows={[
                              ['Fuel', `${money(d.fuel)} · ${d.fuelLitres} L`],
                              ['Water', `${money(d.water)} · ${d.waterLitres} L`],
                              ['Additives', `${money(d.additives)} · ${d.additivesKg} kg`],
                              ['Service', money(d.repairs)],
                              ['Tooling', money(d.parts)],
                            ]} />
                            <Detail title="Crew" tone={C.teal} rows={d.labour.perMetre
                              ? [['Charged', 'per metre'], ['Labour', money(d.labour.labour)], ['Lodging', money(d.labour.lodging)], ['Transport', money(d.labour.transport)], ['Crew cost', money(d.labour.total)]]
                              : [['Labour', money(d.labour.labour)], ['Lodging', money(d.labour.lodging)], ['Transport', money(d.labour.transport)], ['Crew cost', money(d.labour.total)]]} />
                            <Detail title="Day" tone={LAYER.full} rows={[
                              ['Operating', money(d.operating)],
                              ['Ownership', money(d.ownership)],
                              ['Full cost', money(d.total)],
                              ['Cost per metre', d.cpu == null ? 'nothing drilled' : perUnit(d.cpu)],
                              ['Client rate', d.rate > 0 ? perUnit(d.rate) : 'no matching rate line'],
                              ['Revenue', money(d.revenue)],
                            ]} />
                          </div>

                          {/* Tooling is the one cost that changes with the ground,
                              so the day shows which ground it charged and at what. */}
                          {d.toolingByFormation.length > 0 && (
                            <div style={{ marginTop: 14 }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: C.orange, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                                What the parts cost this day
                              </div>
                              <table style={tableStyle}>
                                <thead><tr><th style={th}>Ground</th><th style={thR}>Metres</th><th style={thR}>Tooling rate</th><th style={thR}>Amount</th></tr></thead>
                                <tbody>
                                  {d.toolingByFormation.map((x, k) => (
                                    <tr key={k} style={{ borderBottom: rowBorder }}>
                                      <td style={{ ...td, color: C.text }}>{x.formation}</td>
                                      <td style={tdN}>{x.metres}</td>
                                      <td style={{ ...tdN, color: C.orange }}>{perUnit(x.rate)}</td>
                                      <td style={{ ...tdN, color: C.text, fontWeight: 700 }}>{money(x.amount)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              <div style={{ fontSize: 10.5, color: C.dim, marginTop: 7, lineHeight: 1.6 }}>
                                Rates are what {rigCode(rig)} was carrying on {fullDate(d.date)} — its starting kit plus
                                everything issued up to that date. Parts issued later do not change this day.
                              </div>
                            </div>
                          )}

                          {d.charges.length > 0 && (
                            <div style={{ marginTop: 14 }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: LAYER.revenue, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                                How this day billed
                              </div>
                              <table style={tableStyle}>
                                <thead><tr><th style={th}>Shift</th><th style={th}>Size</th><th style={th}>Formation</th><th style={th}>Depth</th><th style={thR}>Metres</th><th style={thR}>Rate</th><th style={thR}>Amount</th></tr></thead>
                                <tbody>
                                  {d.charges.map((c, k) => (
                                    <tr key={k} style={{ borderBottom: rowBorder }}>
                                      <td style={td}>{c.shift}</td>
                                      <td style={{ ...td, fontFamily: 'ui-monospace, monospace' }}>{c.holeSize}</td>
                                      <td style={{ ...td, color: C.text }}>{c.formation}</td>
                                      <td style={{ ...td, fontFamily: 'ui-monospace, monospace' }}>{c.fromDepth}–{c.toDepth} m</td>
                                      <td style={tdN}>{c.metres}</td>
                                      <td style={{ ...tdN, color: c.matched ? C.orange : C.red }}>{c.matched ? perUnit(c.rate) : 'no rate'}</td>
                                      <td style={{ ...tdN, color: LAYER.revenue, fontWeight: 700 }}>{money(c.amount)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          {d.adjustmentPct !== 0 && (
                            <div style={{ marginTop: 12 }}><Note tone={C.amber}>A size adjustment of {d.adjustmentPct}% applied to this day&apos;s rate.</Note></div>
                          )}
                          {d.unmatched && (
                            <div style={{ marginTop: 12 }}><Note tone={C.red}>
                              No rate line for {d.shifts[0]?.holeSize} + {d.shifts[0]?.formationType}, so these metres bill at zero. Add it to the project's contract rates.
                            </Note></div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: `2px solid ${C.border}`, background: 'rgba(var(--x-ov),0.02)' }}>
                <td style={{ ...td, color: C.text, fontWeight: 800 }} colSpan={4}>
                  {monthLabel(month)}, all {r.days} days
                  {hidden > 0 && <span style={{ fontWeight: 400, color: C.faint, marginLeft: 8 }}>{hidden} not shown above</span>}
                </td>
                <td style={tdN} />
                <td style={{ ...tdN, fontWeight: 800, color: C.text }}>{r.drillingHours}</td>
                <td style={{ ...tdN, fontWeight: 800, color: C.red }}>{r.downtimeHours}</td>
                <td style={{ ...tdN, fontWeight: 800, color: C.text }}>{fm(r.units)}</td>
                <td style={{ ...tdN, fontWeight: 800 }}>{r.maintenanceHours || '—'}</td>
                <td style={{ ...tdN, fontWeight: 800, color: C.purple }}>{money(r.repairs)}</td>
                <td style={{ ...tdN, fontWeight: 800 }}>{money(r.parts)}</td>
                <td style={{ ...tdN, fontWeight: 800, color: C.orange }}>{perUnit(r.toolingPerUnit)}</td>
                <td style={{ ...tdN, fontWeight: 800 }}>{money(r.fuel)}</td>
                <td style={{ ...tdN, fontWeight: 800 }}>{money(r.labour)}</td>
                <td style={{ ...tdN, fontWeight: 800, color: LAYER.operating }}>{money(r.operating)}</td>
                <td style={{ ...tdN, fontWeight: 800, color: LAYER.ownership }}>{money(r.ownership)}</td>
                <td style={{ ...tdN, fontWeight: 900, color: C.text }}>{money(r.total)}</td>
                <td style={{ ...tdN, fontWeight: 900, color: LAYER.full }}>{perUnit(r.cpu)}</td>
                <td style={{ ...tdN, fontWeight: 900, color: LAYER.revenue }}>{money(r.revenue)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* The chart keeps the whole month. A cost trend with two thirds of its
          points cut off is worse than no trend. */}
      <CPUChart days={v.days} rate={rate} clientRate={v.clientRate} month={month} />
    </div>
  )
}

/* Each panel is capped so the label and its number stay together. Left to its
 * own devices in a grid column spanning a 19-column table, space-between threw
 * them to opposite ends of the screen. */
function Detail({ title, tone, rows }: { title: string; tone: string; rows: string[][] }) {
  return (
    <div style={{ minWidth: 210, maxWidth: 270 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: tone, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
            <span style={{ fontSize: 11, color: C.faint }}>{r[0]}</span>
            <span style={{ fontSize: 12, color: C.text, fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}>{r[1]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* COST AGAINST WHAT THE GROUND PAYS
 *
 * The old version drew one dashed line at the blended average of every rate
 * line on the contract — a figure that matches no metre anyone ever drills.
 * Site A bills soft at SAR 6,200 and very hard at SAR 14,100; averaging them to
 * SAR 9,954 hides the fact that a cheap-looking soft day can be the thinnest
 * margin of the month.
 *
 * So: one ceiling per formation, in the formation's own colour, and each day's
 * point painted with the ground it actually cut. A day sitting just under the
 * green line is in trouble even though it looks cheap.
 *
 * A depth-priced contract has no formation ceilings to draw — its bands are
 * depth, not rock — so it keeps a single line at the rate actually achieved.
 */
function CPUChart({ days, rate, clientRate, month }: {
  days: DayCostMTD[]; rate: number; clientRate?: ClientRate; month: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const pts = days.filter(d => d.cpu != null)
  if (pts.length < 2) return null

  /* One ceiling per rock category the contract prices, at the size most of the
   * month was drilled in — mixing NQ and PQ lines on one chart would draw
   * ceilings that never applied to the days beneath them. */
  const sizeCount: Record<string, number> = {}
  days.forEach(d => d.shifts.forEach(sh => {
    if (sh.metresDrilled > 0) sizeCount[sh.holeSize] = (sizeCount[sh.holeSize] ?? 0) + sh.metresDrilled
  }))
  const mainSize = Object.entries(sizeCount).sort((a, b) => b[1] - a[1])[0]?.[0]

  const isFlat = clientRate?.structure !== 'slab'
  const ceilings = isFlat && clientRate
    ? clientRate.rateRows
        .filter(r => r.holeSize === mainSize && r.rate > 0)
        .map(r => ({
          label: r.formation.replace(/ rock$/i, ''),
          rate: r.rate,
          tone: FORMATION_TONE[
            Object.keys(FORMATION_TONE).find(k => k.toLowerCase() === r.formation.replace(/ rock$/i, '').toLowerCase()) ?? 'Hard'
          ] ?? C.blue,
        }))
        .sort((a, b) => a.rate - b.rate)
    : rate > 0
      ? [{ label: 'Rate achieved', rate, tone: C.blue }]
      : []

  /* Each day is one bar: what a metre cost (bottom, in the colour of the
   * ground it cut) and the margin left on it (green, on top). The whole bar
   * is what the client paid for that metre, so a thin green cap is a day that
   * barely paid, and red above the bar is a day that lost money. */
  /* Cost bars in shades of one blue, deeper for harder ground, so green can
   * only mean margin and red can only mean a loss. */
  const SHADE: Record<string, string> = { Soft: '#93c5fd', Medium: '#60a5fa', Hard: '#3b82f6', 'Very Hard': '#1e40af' }
  const earned = (d: DayCostMTD) => d.units > 0 ? d.revenue / d.units : 0
  const W = 1000, H = 280, PL = 56, PR = 16, PT = 26, PB = 34
  const maxV = Math.max(...days.map(d => Math.max(d.cpu ?? 0, earned(d))), ...ceilings.map(c => c.rate)) * 1.1 || 1
  const slot = (W - PL - PR) / Math.max(1, days.length)
  const bw = Math.min(30, slot * 0.62)
  const cx = (i: number) => PL + slot * (i + 0.5)
  const y = (val: number) => PT + (1 - val / maxV) * (H - PT - PB)
  const hd = hover != null ? days[hover] : null

  // By ground: the month's cost a metre against what that ground paid.
  const byGround = Object.keys(SHADE).map(f => {
    const ds = days.filter(d => d.cpu != null && dominantGround(d) === f)
    const units = ds.reduce((t, d) => t + d.units, 0)
    return { f, tone: SHADE[f], units, cost: units ? ds.reduce((t, d) => t + d.total, 0) / units : 0, paid: units ? ds.reduce((t, d) => t + d.revenue, 0) / units : 0 }
  }).filter(g => g.units > 0)
  const gMax = Math.max(1, ...byGround.map(g => Math.max(g.cost, g.paid)))
  const lost = days.filter(d => d.cpu != null && d.cpu > earned(d) && earned(d) > 0).length
  const idle = days.filter(d => d.cpu == null).length

  return (
    <Card title="What a metre cost, and what was left on it"
      subtitle={`${monthLabel(month)} · each bar is one day: the cost of a metre, with the margin on top. The full bar is what the client paid for it.`}
      pad={false}>
      {byGround.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, padding: '16px 20px 4px' }}>
          {byGround.map(g => {
            const m = g.paid - g.cost
            return (
              <div key={g.f} style={{ display: 'grid', gap: 6, padding: '10px 12px', borderRadius: 10, background: `${hexA(g.tone, 0x10)}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}>
                  <b style={{ color: C.text, display: "inline-flex", alignItems: "center", gap: 6 }}><span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: g.tone }} />{g.f}</b>
                  <span style={{ color: C.muted }}>{Math.round(g.units)} m</span>
                </div>
                <div aria-hidden style={{ position: 'relative', height: 14, borderRadius: 4, background: 'rgba(var(--x-ov),0.06)', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', inset: 0, width: `${(g.paid / gMax) * 100}%`, background: hexA(C.green, 0x55) }} />
                  <div style={{ position: 'absolute', inset: 0, width: `${(Math.min(g.cost, g.paid || g.cost) / gMax) * 100}%`, background: g.tone }} />
                </div>
                <div style={{ fontSize: 12, color: C.text }}>
                  Cost <b>SAR {Math.round(g.cost).toLocaleString('en-US')}</b> · paid <b>SAR {Math.round(g.paid).toLocaleString('en-US')}</b> ·{' '}
                  <b style={{ color: m >= 0 ? 'var(--x-good-text)' : 'var(--x-bad-text)' }}>{m >= 0 ? 'kept' : 'lost'} SAR {Math.abs(Math.round(m)).toLocaleString('en-US')}</b> a metre
                </div>
              </div>
            )
          })}
        </div>
      )}
      <div style={{ padding: '12px 20px 8px', overflowX: 'auto', position: 'relative' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 640, height: 'auto', display: 'block' }} onMouseLeave={() => setHover(null)}>
          {[0, 0.25, 0.5, 0.75, 1].map(fr => {
            const val = maxV * (1 - fr)
            return (
              <g key={fr}>
                <line x1={PL} x2={W - PR} y1={y(val)} y2={y(val)} stroke={C.border} strokeWidth={1} opacity={0.4} />
                <text x={PL - 8} y={y(val) + 4} textAnchor="end" fill={C.dim} fontSize={10.5}>{val >= 1000 ? `SAR ${Math.round(val / 1000)}k` : '0'}</text>
              </g>
            )
          })}
          {days.map((d, i) => {
            const on = hover === i
            const base = H - PB
            if (d.cpu == null) {
              return (
                <g key={i} opacity={on ? 1 : 0.85}>
                  <rect x={cx(i) - bw / 2} y={base - 4} width={bw} height={4} rx={2} fill={C.red} />
                  <text x={cx(i)} y={base - 9} textAnchor="middle" fill={C.red} fontSize={10} fontWeight={700}>0 m</text>
                </g>
              )
            }
            const g = dominantGround(d)
            const tone = g ? (SHADE[g] ?? C.muted) : C.muted
            const e = earned(d)
            const top = Math.max(d.cpu, e)
            return (
              <g key={i} opacity={hover == null || on ? 1 : 0.55}>
                <rect x={cx(i) - bw / 2} y={y(d.cpu)} width={bw} height={base - y(d.cpu)} rx={3} fill={tone} />
                {e > d.cpu && <rect x={cx(i) - bw / 2} y={y(e)} width={bw} height={y(d.cpu) - y(e)} rx={3} fill={C.green} opacity={0.75} />}
                {e > 0 && e < d.cpu && <rect x={cx(i) - bw / 2} y={y(d.cpu)} width={bw} height={y(e) - y(d.cpu)} fill={C.red} opacity={0.9} />}
                {on && <text x={cx(i)} y={y(top) - 7} textAnchor="middle" fill={C.text} fontSize={10.5} fontWeight={700}>{e ? `${Math.round(((e - d.cpu) / e) * 100)}%` : ''}</text>}
              </g>
            )
          })}
          {days.map((d, i) => (i % Math.ceil(days.length / 16) === 0
            ? <text key={`t${i}`} x={cx(i)} y={H - 12} textAnchor="middle" fill={C.dim} fontSize={10}>{Number(d.date.slice(8))}</text> : null))}
          {days.map((_, i) => (
            <rect key={`h${i}`} x={cx(i) - slot / 2} y={PT} width={slot} height={H - PT - PB} fill="transparent" onMouseEnter={() => setHover(i)} style={{ cursor: 'pointer' }} />
          ))}
        </svg>
        {hd && <ChartTip d={hd} rate={rate} left={((cx(hover!) - PL) / (W - PL - PR)) * 100} />}
      </div>
      <div style={{ display: 'flex', gap: 18, padding: '4px 20px 16px', flexWrap: 'wrap', alignItems: 'center' }}>
        {Object.entries(SHADE).filter(([f]) => days.some(d => dominantGround(d) === f)).map(([f, tone]) => <Legend key={f} color={tone} label={`Cost, ${f.toLowerCase()} ground`} />)}
        <Legend color={C.green} label="Margin left" />
        <Legend color={C.red} label="Lost, or nothing drilled" />
        <span style={{ fontSize: 11.5, color: C.muted, marginLeft: 'auto' }}>
          {lost ? `${lost} ${lost === 1 ? 'day' : 'days'} cost more than they paid. ` : 'Every drilling day paid for itself. '}{idle ? `${idle} ${idle === 1 ? 'day' : 'days'} drilled nothing.` : ''}
        </span>
      </div>
    </Card>
  )
}

/* A day with no metres has no cost per metre, so the tooltip explains why the
 * day produced nothing instead of showing a dash — that is the day the chart
 * most needs to account for. */
function ChartTip({ d, rate, left }: { d: DayCostMTD; rate: number; left: number }) {
  const flip = left > 62
  const rows: [string, string, string?][] = d.cpu == null
    ? [
        ['Status', DAY_STATUS_LABEL[d.status]],
        ['Downtime', `${d.downtimeHours} hrs`],
        ['Full cost', money(d.total)],
        ['Billed', d.revenue > 0 ? money(d.revenue) : 'nothing'],
      ]
    : [
        ['Cost per metre', perUnit(d.cpu), rate ? cpuColor(d.cpu, rate) : C.text],
        ['Metres', `${fm(d.units)} m`],
        ['Tooling', perUnit(d.toolingRate)],
        ['Full cost', money(d.total)],
        ['Client rate', d.rate > 0 ? perUnit(d.rate) : '—'],
        ['Margin', d.rate > 0 ? perUnit(d.rate - d.cpu) : '—', d.rate - d.cpu >= 0 ? C.green : C.red],
        ['Month to date', d.mtdCPU != null ? perUnit(d.mtdCPU) : '—'],
      ]

  return (
    <div style={{
      position: 'absolute', top: 34, pointerEvents: 'none', zIndex: 5,
      left: flip ? undefined : `${9.5 + left * 0.88}%`,
      right: flip ? `${9.5 + (100 - left) * 0.88}%` : undefined,
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
      padding: '11px 14px', minWidth: 196, boxShadow: '0 10px 30px rgba(var(--x-shadow),0.6)',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 9, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{dayLabel(d.date)}</span>
        <span style={{ fontSize: 11, color: C.faint }}>{d.holeNumber ?? 'no hole'}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {rows.map(([k, v, tone], i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 18 }}>
            <span style={{ fontSize: 11, color: C.faint }}>{k}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: tone ?? C.text, fontFamily: 'ui-monospace, monospace' }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Legend({ color, label, line }: { color: string; label: string; line?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={{ width: line ? 16 : 9, height: line ? 2 : 9, borderRadius: line ? 1 : '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 11, color: C.faint }}>{label}</span>
    </div>
  )
}

/* ── HOLES ────────────────────────────────────────────────────────────── */

/* DRILLHOLES — every hole the driller's log mentions, costed and priced.
 *
 * The list is derived from the log, so there is nothing to add here: a hole
 * appears the moment a shift is logged against its number, and the only thing
 * stored is the decision to close, approve or invoice it. */
function DrillholesTab({ v, linked, client, onStatus, onSubmit, onWithdraw, onInvoice }: {
  v: RigMonthView
  // True when this project is shown to its client: the client approves the
  // hole, not the company that drilled it.
  linked: boolean
  client: string
  onStatus: (holeNumber: string, s: HoleStatus) => void
  onSubmit: (holeNumber: string) => void
  onWithdraw: (holeNumber: string) => void
  onInvoice: (h: HoleResult) => void
}) {
  const [open, setOpen] = useState<string | null>(null)
  const unit = 'm'

  // Only holes the driller has closed. A hole still being drilled has nothing
  // to approve or bill and lives on Performance until the log says it's done.
  const isFlat = v.clientRate?.structure !== 'slab'
  const finished = v.holes.filter(h => isFinished(h.hole))
  const stillDrilling = v.holes.length - finished.length
  /* Every closed hole is read against its own shift logs before it can go to
   * the client or be approved: the same checks as the drill log form. */
  const { state: logState } = useCosting()
  const holeChecks = useMemo(() => {
    const m: Record<string, ReturnType<typeof checkHole>> = {}
    finished.forEach(h => { m[h.hole.holeNumber] = checkHole(logState, h.hole.holeNumber) })
    return m
  }, [finished, logState])

  if (finished.length === 0) {
    return (
      <Card><Empty>
        No closed holes for this rig this month.
        {stillDrilling > 0 && <><br />{stillDrilling} {stillDrilling === 1 ? 'hole is' : 'holes are'} still being drilled — they appear here once the driller ticks &quot;Hole Closed This Shift&quot; in the log.</>}
      </Empty></Card>
    )
  }

  const t = finished.reduce((a, h) => ({
    units: a.units + h.roll.units, cost: a.cost + h.roll.total, revenue: a.revenue + h.roll.revenue,
  }), { units: 0, cost: 0, revenue: 0 })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {finished.some(h => h.unmatchedDays > 0) && (
        <Note tone={C.red}>
          A hole has metres with no matching rate line, so those metres bill at zero. Add the missing size and ground to the project's contract rates.
        </Note>
      )}

      <Card title="Drillholes" subtitle="Closed in the driller's log. Metres and cost from the log, revenue at the rate in force each day" pad={false}>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={th}>Hole</th><th style={th}>Dates</th><th style={th}>Status</th>
                <th style={thR}>Days</th><th style={thR}>Metres</th><th style={thR}>Recovery</th>
                <th style={thR}>Cost</th><th style={thR}>Cost/{unit}</th><th style={th}>Structure</th>
                <th style={thR}>Revenue</th><th style={thR}>Profit</th><th style={thR}>Margin</th>
              </tr>
            </thead>
            <tbody>
              {finished.map(h => {
                const hole = h.hole
                const isOpen = open === hole.holeNumber
                return (
                  <Fragment key={hole.holeNumber}>
                    <tr onClick={() => setOpen(isOpen ? null : hole.holeNumber)} style={{ borderBottom: rowBorder, cursor: 'pointer', background: isOpen ? 'color-mix(in srgb, var(--x-orange) 5%, transparent)' : undefined }}>
                      <td style={{ ...td, color: C.text, fontWeight: 700 }}>
                        {hole.holeNumber}
                        {h.unmatchedDays > 0 && <span style={{ color: C.red, marginLeft: 7 }}>●</span>}
                        {h.rates.length > 1 && <span style={{ color: C.blue, marginLeft: 5 }}>●</span>}
                      </td>
                      <td style={td}>{dayLabel(hole.startDate)} → {hole.endDate ? dayLabel(hole.endDate) : 'open'}</td>
                      <td style={td}>
                        <Tag tone={holeStatusColor(hole.status)}>{HOLE_STATUS_LABEL[hole.status]}</Tag>
                        <HoleLogMark c={holeChecks[hole.holeNumber]} />
                        {hole.status === 'closed' && hole.returnReason && <span style={{ color: C.red, marginLeft: 7, fontSize: 11 }}>returned</span>}
                      </td>
                      <td style={tdN}>{h.roll.days}</td>
                      <td style={{ ...tdN, color: C.text, fontWeight: 700 }}>{fm(h.roll.units)}</td>
                      <td style={{ ...tdN, color: C.faint }}>{pct(h.coreRecoveryPct)}</td>
                      <td style={{ ...tdN, color: LAYER.full }}>{money(h.roll.total)}</td>
                      <td style={{ ...tdN, color: LAYER.full, fontWeight: 700 }}>{perUnit(h.roll.cpu)}</td>
                      <td style={{ ...td, color: C.faint }}>{structureLabel(v.clientRate)}</td>
                      <td style={{ ...tdN, color: LAYER.revenue }}>{money(h.roll.revenue)}</td>
                      <td style={{ ...tdN, color: marginColor(h.roll.margin), fontWeight: 800 }}>{money(h.roll.margin)}</td>
                      <td style={{ ...tdN, color: marginColor(h.roll.margin), fontWeight: 800 }}>{h.roll.revenue > 0 ? pct(h.roll.marginPct) : '—'}</td>
                    </tr>
                    {isOpen && (
                      <tr style={{ borderBottom: rowBorder, background: 'color-mix(in srgb, var(--x-orange) 3%, transparent)' }}>
                        <td colSpan={12} style={{ padding: '20px 22px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 26 }}>
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: LAYER.full, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                                What {hole.holeNumber} cost
                              </div>
                              <table style={tableStyle}>
                                <tbody>
                                  {/* A contractor drilled this hole. What it cost is
                                      what his work order pays; fuel, crew, parts
                                      and the rig are his and are not ours to show. */}
                                  {v.workOrder ? (
                                    <>
                                      <tr><td style={td}>Metres at the work order rates</td><td style={tdN}>{money(h.days.reduce((a, d) => a + d.payCharges.reduce((b, c) => b + c.amount, 0), 0))}</td></tr>
                                      <tr><td style={td}>Standby days paid</td><td style={tdN}>{money(h.days.filter(d => d.status === 'standby').reduce((a, d) => a + d.subcontract, 0))}</td></tr>
                                      <tr style={{ borderTop: rowBorder }}>
                                        <td style={{ ...td, color: LAYER.operating, fontWeight: 700 }}>Paid to the contractor · {v.workOrder.number}</td>
                                        <td style={{ ...tdN, color: LAYER.operating, fontWeight: 700 }}>{money(h.roll.subcontract)}</td>
                                      </tr>
                                    </>
                                  ) : (
                                    <>
                                  {[
                                    ['Fuel', money(h.roll.fuel)],
                                    ['Water & additives', money(h.roll.water + h.roll.additives)],
                                    ['Crew', money(h.roll.labour)],
                                    ['Repairs', money(h.roll.repairs)],
                                    ['Tooling', money(h.roll.parts)],
                                  ].map(([k, val]) => <tr key={k}><td style={td}>{k}</td><td style={tdN}>{val}</td></tr>)}
                                  <tr style={{ borderTop: rowBorder }}>
                                    <td style={{ ...td, color: LAYER.operating, fontWeight: 700 }}>Operating</td>
                                    <td style={{ ...tdN, color: LAYER.operating, fontWeight: 700 }}>{money(h.roll.operating)}</td>
                                  </tr>
                                  <tr>
                                    <td style={{ ...td, color: LAYER.ownership, fontWeight: 700 }}>Ownership</td>
                                    <td style={{ ...tdN, color: LAYER.ownership, fontWeight: 700 }}>{money(h.roll.ownership)}</td>
                                  </tr>
                                    </>
                                  )}
                                  <tr style={{ borderTop: `2px solid ${C.border}` }}>
                                    <td style={{ ...td, color: LAYER.full, fontWeight: 900, fontSize: 13 }}>Full cost</td>
                                    <td style={{ ...tdN, color: LAYER.full, fontWeight: 900, fontSize: 13 }}>{money(h.roll.total)}</td>
                                  </tr>
                                </tbody>
                              </table>
                              <div style={{ marginTop: 16, display: 'flex', gap: 22, flexWrap: 'wrap' }}>
                                <Mini k="Drilling days" v={`${h.roll.drillingDays}`} />
                                <Mini k="Standby" v={`${h.roll.standbyDays}`} />
                                <Mini k="Breakdown" v={`${h.roll.breakdownDays}`} />
                                <Mini k="Downtime" v={`${h.roll.downtimeHours} hrs`} />
                                {!v.workOrder && <Mini k="Tooling / m" v={perUnit(h.roll.toolingPerUnit)} />}
                              </div>
                            </div>

                            <div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: LAYER.revenue, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                                What {hole.holeNumber} bills
                              </div>
                              {/* The measurement book: one line per size, formation
                                  and rate, in depth order. This is exactly what
                                  prints on the invoice. A slab project bills by
                                  depth, so the rock it passed through is not part
                                  of the bill and is left out. */}
                              <table style={tableStyle}>
                                <thead><tr>
                                  <th style={th}>Size</th>
                                  {isFlat && <th style={th}>Formation</th>}
                                  <th style={th}>Depth</th><th style={thR}>Metres</th><th style={thR}>Rate</th><th style={thR}>Amount</th>
                                </tr></thead>
                                <tbody>
                                  {h.billing.map((l, k) => (
                                    <tr key={k} style={{ borderBottom: rowBorder }}>
                                      <td style={{ ...td, fontFamily: 'ui-monospace, monospace' }}>{l.holeSize}</td>
                                      {isFlat && <td style={{ ...td, color: C.text }}>{l.formation}</td>}
                                      <td style={{ ...td, fontFamily: 'ui-monospace, monospace' }}>{l.fromDepth}–{l.toDepth} m</td>
                                      <td style={tdN}>{l.metres}</td>
                                      <td style={{ ...tdN, color: l.matched ? C.orange : C.red }}>{l.matched ? perUnit(l.rate) : 'no rate'}</td>
                                      <td style={{ ...tdN, color: LAYER.revenue, fontWeight: 700 }}>{money(l.amount)}</td>
                                    </tr>
                                  ))}
                                  {h.roll.standbyDays > 0 && (
                                    <tr style={{ borderBottom: rowBorder }}>
                                      <td style={td} colSpan={isFlat ? 2 : 1}>Standby</td>
                                      <td style={td} />
                                      <td style={tdN}>{h.roll.standbyDays} d</td>
                                      <td style={tdN} />
                                      <td style={{ ...tdN, color: LAYER.revenue, fontWeight: 700 }}>
                                        {money(h.days.filter(d => d.status === 'standby').reduce((a, d) => a + d.revenue, 0))}
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                                <tfoot>
                                  <tr style={{ borderTop: `2px solid ${C.border}` }}>
                                    <td style={{ ...td, fontWeight: 800, color: C.text }} colSpan={isFlat ? 3 : 2}>Revenue</td>
                                    <td style={{ ...tdN, fontWeight: 800 }}>{fm(h.roll.units)}</td>
                                    <td style={tdN} />
                                    <td style={{ ...tdN, fontWeight: 900, color: LAYER.revenue, fontSize: 13 }}>{money(h.roll.revenue)}</td>
                                  </tr>
                                </tfoot>
                              </table>

                              <div style={{ marginTop: 18, padding: '16px 18px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10 }}>
                                <Grid cols={3}>
                                  <Res k="Revenue" v={money(h.roll.revenue)} tone={LAYER.revenue} />
                                  <Res k="Cost" v={money(h.roll.total)} tone={LAYER.full} />
                                  <Res k="Profit" v={money(h.roll.margin)} tone={marginColor(h.roll.margin)} big />
                                </Grid>
                                <div style={{ marginTop: 12, fontSize: 11, color: C.faint, lineHeight: 1.7 }}>
                                  {fm(h.roll.units)} {unit} at {perUnit(h.roll.revenuePerUnit)} against {perUnit(h.roll.cpu)} —
                                  a margin of {perUnit(h.roll.revenuePerUnit - h.roll.cpu)}, or {pct(h.roll.marginPct)}.
                                </div>
                              </div>
                            </div>
                          </div>

                          {h.unmatchedDays > 0 && (
                            <div style={{ marginTop: 16 }}>
                              <Note tone={C.red}>
                                {h.unmatchedDays} {h.unmatchedDays === 1 ? 'day has' : 'days have'} metres with no matching rate line, billing at zero.
                              </Note>
                            </div>
                          )}

                          {linked && hole.status === 'closed' && hole.returnReason && (
                            <div style={{ marginTop: 16 }}>
                              <Note tone={C.red}>
                                {client} returned this hole{hole.decidedAt ? ` on ${fullDate(hole.decidedAt)}` : ''}: {hole.returnReason}
                              </Note>
                            </div>
                          )}

                          {/* On a project shown to its client the company cannot
                              approve its own hole: it is sent across and the
                              client decides. Elsewhere nothing has
                              changed. */}
                          {(holeChecks[hole.holeNumber]?.stops.length ?? 0) > 0 && hole.status === 'closed' && (
                            <div style={{ marginTop: 16 }}>
                              <Note tone={C.red}>
                                {holeChecks[hole.holeNumber].stops.length} {holeChecks[hole.holeNumber].stops.length === 1 ? 'figure' : 'figures'} in the shifts behind {hole.holeNumber} cannot be right
                                ({Array.from(new Set(holeChecks[hole.holeNumber].stops.map(x => x.check.title.replace(/\.$/, '')))).slice(0, 2).join('; ')}).
                                Put {holeChecks[hole.holeNumber].stops.length === 1 ? 'it' : 'them'} right in the <Link href="/admin/logs/drill" style={{ color: C.red, fontWeight: 700 }}>drill log</Link> before this hole is {linked ? 'sent for approval' : 'approved'}.
                              </Note>
                            </div>
                          )}
                          <div style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                            {!linked && hole.status === 'closed' &&
                              <Btn size="sm" tone="primary" disabled={(holeChecks[hole.holeNumber]?.stops.length ?? 0) > 0} onClick={() => onStatus(hole.holeNumber, 'approved')}>Approve for billing</Btn>}
                            {!linked && hole.status === 'approved' && <>
                              <Btn size="sm" onClick={() => onStatus(hole.holeNumber, 'closed')}>Withdraw approval</Btn>
                              <Btn size="sm" tone="primary" onClick={() => onInvoice(h)}>Create invoice</Btn>
                            </>}

                            {linked && hole.status === 'closed' &&
                              <Btn size="sm" tone="primary" disabled={(holeChecks[hole.holeNumber]?.stops.length ?? 0) > 0} onClick={() => onSubmit(hole.holeNumber)}>
                                {hole.returnReason ? 'Send again for approval' : 'Send hole for approval'}
                              </Btn>}
                            {linked && hole.status === 'submitted' && <>
                              <span style={{ fontSize: 12, color: C.teal }}>
                                Waiting for {client} to approve{hole.submittedAt ? ` · sent ${fullDate(hole.submittedAt)}` : ''}
                              </span>
                              <Btn size="sm" onClick={() => onWithdraw(hole.holeNumber)}>Withdraw</Btn>
                            </>}
                            {linked && hole.status === 'approved' && <>
                              <span style={{ fontSize: 12, color: C.green }}>
                                Approved by {client}{hole.decidedAt ? ` on ${fullDate(hole.decidedAt)}` : ''}
                              </span>
                              <Btn size="sm" tone="primary" onClick={() => onInvoice(h)}>Create invoice</Btn>
                            </>}

                            {hole.status === 'invoiced' && <span style={{ fontSize: 12, color: C.purple }}>Invoiced</span>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: `2px solid ${C.border}`, background: 'rgba(var(--x-ov),0.02)' }}>
                <td style={{ ...td, fontWeight: 800, color: C.text }} colSpan={4}>{finished.length} holes</td>
                <td style={{ ...tdN, fontWeight: 800, color: C.text }}>{fm(t.units)}</td>
                <td style={tdN} />
                <td style={{ ...tdN, fontWeight: 800, color: LAYER.full }}>{money(t.cost)}</td>
                <td style={{ ...tdN, fontWeight: 800, color: LAYER.full }}>{t.units > 0 ? perUnit(t.cost / t.units) : '—'}</td>
                <td style={tdN} />
                <td style={{ ...tdN, fontWeight: 800, color: LAYER.revenue }}>{money(t.revenue)}</td>
                <td style={{ ...tdN, fontWeight: 900, color: marginColor(t.revenue - t.cost) }}>{money(t.revenue - t.cost)}</td>
                <td style={{ ...tdN, fontWeight: 900, color: marginColor(t.revenue - t.cost) }}>{t.revenue > 0 ? pct(((t.revenue - t.cost) / t.revenue) * 100) : '—'}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  )
}

/* The logs behind a hole, in one mark: wrong, to explain, or checked. */
function HoleLogMark({ c }: { c?: ReturnType<typeof checkHole> }) {
  if (!c || c.shifts === 0) return null
  const [tone, text, tip] = c.stops.length ? [C.red, `✕ ${c.stops.length} in logs`, 'Figures in the logs behind this hole cannot be right']
    : c.open.length ? [C.amber, `! ${c.open.length} to explain`, 'Unusual figures in the logs with no reason given']
    : [C.green, '✓ Logs checked', `All ${c.shifts} shifts behind this hole pass the XPLORIX checks`]
  return <span title={tip} style={{ marginLeft: 7, fontSize: 10.5, fontWeight: 700, color: tone, whiteSpace: 'nowrap' }}>{text}</span>
}

function Mini({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: C.dim, marginBottom: 3 }}>{k}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, fontFamily: 'ui-monospace, monospace' }}>{v}</div>
    </div>
  )
}
function Res({ k, v, tone, big }: { k: string; v: string; tone: string; big?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: C.faint, marginBottom: 5 }}>{k}</div>
      <div style={{ fontSize: big ? 19 : 15, fontWeight: 900, color: tone, fontFamily: 'ui-monospace, monospace' }}>{v}</div>
    </div>
  )
}

/* ── BILLING ──────────────────────────────────────────────────────────── */

/* TRACKER — invoices only. Nothing is created here; invoices are raised from
 * Drillholes, where the hole and its numbers are in front of you. This tab
 * answers what is out, what is overdue and what has been paid. */
function TrackerTab({ invoices, onUpdate }: {
  invoices: Invoice[]; onUpdate: (i: Invoice) => void
}) {
  const [viewing, setViewing] = useState<Invoice | null>(null)
  const today = TODAY

  if (invoices.length === 0) {
    return <Card><Empty>No invoices yet.<br />Approve a hole in Drillholes and raise one from there.</Empty></Card>
  }

  const live = invoices.filter(i => i.status !== 'cancelled')
  const totals = live.reduce((a, i) => ({
    billed: a.billed + i.total,
    paid: a.paid + (i.paidAmount ?? 0),
    overdue: a.overdue + (isOverdue(i, today) ? outstanding(i) : 0),
  }), { billed: 0, paid: 0, overdue: 0 })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12 }}>
        <Stat label="Invoiced" value={money(totals.billed)} color={LAYER.revenue} note={`${live.length} live`} />
        <Stat label="Received" value={money(totals.paid)} color={C.green} />
        <Stat label="Outstanding" value={money(totals.billed - totals.paid)} color={C.amber} />
        <Stat label="Overdue" value={money(totals.overdue)} color={totals.overdue > 0 ? C.red : C.dim} />
      </div>

      <Card title="Invoices" pad={false} subtitle="Cancelling an invoice releases its holes back to approved">
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr><th style={th}>Number</th><th style={th}>Date</th><th style={th}>Due</th><th style={th}>Holes</th>
                <th style={thR}>Total</th><th style={thR}>Received</th><th style={thR}>Outstanding</th>
                <th style={th}>Client</th><th style={th}>Status</th><th style={th} /></tr>
            </thead>
            <tbody>
              {invoices.map(inv => {
                const over = isOverdue(inv, today)
                const out = outstanding(inv)
                const cancelled = inv.status === 'cancelled'
                return (
                  <tr key={inv.id} style={{
                    borderBottom: rowBorder,
                    background: over ? 'color-mix(in srgb, var(--x-red) 5%, transparent)' : undefined,
                    opacity: cancelled ? 0.5 : 1,
                  }}>
                    <td style={{ ...td, color: C.text, fontWeight: 700, textDecoration: cancelled ? 'line-through' : undefined }}>{inv.number}</td>
                    <td style={td}>{dayLabel(inv.date)}</td>
                    <td style={{ ...td, color: over ? C.red : C.muted }}>{inv.dueDate ? dayLabel(inv.dueDate) : '—'}</td>
                    <td style={{ ...td, whiteSpace: 'normal', maxWidth: 170 }}>{inv.holeNumbers.join(', ')}</td>
                    <td style={{ ...tdN, color: LAYER.revenue, fontWeight: 800 }}>{money(inv.total)}</td>
                    <td style={{ ...tdN, color: inv.paidAmount ? C.green : C.dim }}>{inv.paidAmount ? money(inv.paidAmount) : '—'}</td>
                    <td style={{ ...tdN, color: out > 0 ? C.amber : C.dim }}>{out > 0 ? money(out) : '—'}</td>
                    <td style={td}><OwnerAnswer inv={inv} /></td>
                    <td style={td}>
                      <StatusPill inv={inv} overdue={over} onChange={st => onUpdate({
                        ...inv, status: st,
                        paidDate: st === 'paid' ? today : undefined,
                        paidAmount: st === 'paid' ? inv.total : undefined,
                      })} />
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <Btn size="sm" onClick={() => setViewing(inv)}>View</Btn>
                        <Btn size="sm" onClick={() => downloadInvoice(inv)}>Download</Btn>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {viewing && <InvoiceView inv={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}

/* What the client has said about this invoice. Blank on a project whose
 * owner is not on XPLORIX — there is nobody on the other side to answer. */
function OwnerAnswer({ inv }: { inv: Invoice }) {
  if (!inv.ownerStatus) return <span style={{ color: C.dim }}>—</span>
  const n = (inv.lineReviews ?? []).filter(r => r?.status === 'disputed').length
  const tone = inv.ownerStatus === 'approved' ? C.green : inv.ownerStatus === 'disputed' ? C.red : C.teal
  const text = inv.ownerStatus === 'disputed'
    ? `${n} ${n === 1 ? 'line' : 'lines'} disputed · ${money(disputedAmount(inv))}`
    : inv.ownerStatus === 'approved' ? 'Approved' : 'Waiting'
  return <Tag tone={tone}>{text}</Tag>
}

/* A status you can read at a glance and change in one click. A dropdown here
 * looked like a field waiting to be filled in; this reads as a state.
 * Overdue is derived from the due date and can't be chosen. */
function StatusPill({ inv, overdue, onChange }: {
  inv: Invoice; overdue: boolean; onChange: (s: InvoiceStatus) => void
}) {
  // The menu is positioned against the viewport rather than the button, because
  // the row sits inside a scrolling table inside a card with hidden overflow —
  // an absolutely positioned menu gets clipped by both. It also flips upward
  // when the row is near the bottom of the screen.
  const [anchor, setAnchor] = useState<{ left: number; top: number; up: boolean } | null>(null)
  const openMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (anchor) { setAnchor(null); return }
    const r = e.currentTarget.getBoundingClientRect()
    const menuHeight = INVOICE_STATUSES.length * 32 + 12
    const up = r.bottom + menuHeight > window.innerHeight - 12
    setAnchor({ left: r.left, top: up ? r.top - menuHeight - 5 : r.bottom + 5, up })
  }
  const tone = overdue ? C.red
    : inv.status === 'paid' ? C.green
    : inv.status === 'pending' ? C.blue
    : inv.status === 'cancelled' ? C.dim : C.faint

  return (
    <div style={{ display: 'inline-block' }}>
      <button onClick={openMenu} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontFamily: 'inherit',
        padding: '4px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.06em',
        color: tone, background: `${hexA(tone, 0x1A)}`, border: `1px solid ${hexA(tone, 0x44)}`,
      }}>
        {overdue ? 'Overdue' : INVOICE_STATUS_LABEL[inv.status]}
        <span style={{ fontSize: 8, opacity: 0.7 }}>▾</span>
      </button>

      {anchor && (
        <>
          <div onClick={() => setAnchor(null)} style={{ position: 'fixed', inset: 0, zIndex: 1200 }} />
          <div style={{
            position: 'fixed', left: anchor.left, top: anchor.top, zIndex: 1201,
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 9,
            padding: 4, minWidth: 140, boxShadow: '0 8px 24px rgba(var(--x-shadow),0.6)',
          }}>
            {INVOICE_STATUSES.map(st => (
              <button key={st} onClick={() => { onChange(st); setAnchor(null) }} style={{
                display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                padding: '7px 10px', borderRadius: 6, border: 'none', fontSize: 12, height: 32,
                fontWeight: inv.status === st ? 700 : 500,
                background: inv.status === st ? 'rgba(var(--x-ov),0.05)' : 'transparent',
                color: st === 'paid' ? C.green : st === 'pending' ? C.blue : st === 'cancelled' ? C.faint : C.muted,
              }}>{INVOICE_STATUS_LABEL[st]}</button>
            ))}
            {overdue && (
              <div style={{ padding: '7px 10px', fontSize: 10, color: C.dim, borderTop: `1px solid ${C.border}`, marginTop: 4, lineHeight: 1.5 }}>
                Overdue follows the due date — it isn&apos;t set by hand.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function InvoiceView({ inv, onClose }: { inv: Invoice; onClose: () => void }) {
  return (
    <Modal title={inv.number} subtitle={`${inv.project} · ${fullDate(inv.date)}${inv.dueDate ? ` · due ${fullDate(inv.dueDate)}` : ''}`}
      width={820} onClose={onClose}
      footer={<><Btn onClick={onClose}>Close</Btn><Btn tone="primary" onClick={() => downloadInvoice(inv)}>Download</Btn></>}>
      {inv.ownerStatus && (
        <div style={{ marginBottom: 14 }}>
          <Note tone={inv.ownerStatus === 'approved' ? C.green : inv.ownerStatus === 'disputed' ? C.red : C.teal}>
            {OWNER_INVOICE_LABEL[inv.ownerStatus]}
            {inv.sentAt ? ` · sent ${fullDate(inv.sentAt)}` : ''}
            {inv.reviewedAt ? ` · last reviewed ${fullDate(inv.reviewedAt)}` : ''}
            {inv.ownerStatus === 'disputed' ? ` · ${money(disputedAmount(inv))} in dispute before tax` : ''}
          </Note>
        </div>
      )}
      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
        <table style={tableStyle}>
          <thead><tr><th style={th}>Description</th><th style={th}>Depth</th><th style={thR}>Quantity</th><th style={thR}>Rate</th><th style={thR}>Amount</th>
            {inv.ownerStatus && <th style={th}>Client</th>}</tr></thead>
          <tbody>
            {inv.lines.map((l, i) => {
              const r = inv.lineReviews?.[i]
              return (
                <tr key={i} style={{ borderBottom: rowBorder, background: r?.status === 'disputed' ? 'color-mix(in srgb, var(--x-red) 5%, transparent)' : undefined }}>
                  <td style={{ ...td, color: C.text, whiteSpace: 'normal' }}>{l.label}</td>
                  <td style={{ ...td, fontFamily: 'ui-monospace, monospace', color: C.faint }}>{l.depth ?? '—'}</td>
                  <td style={tdN}>{l.qty}</td><td style={tdN}>{l.rate}</td>
                  <td style={{ ...tdN, color: C.text, fontWeight: 700 }}>{money(l.amount)}</td>
                  {inv.ownerStatus && (
                    <td style={{ ...td, whiteSpace: 'normal', maxWidth: 220 }}>
                      {!r ? <span style={{ color: C.dim }}>Not reviewed yet</span>
                        : r.status === 'approved' ? <span style={{ color: C.green }}>Approved</span>
                        : <span style={{ color: C.red }}>Disputed{r.reason ? `: ${r.reason}` : ''}</span>}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: `2px solid ${C.border}` }}>
              <td style={{ ...td, fontWeight: 800, color: C.text }} colSpan={4}>Subtotal</td>
              <td style={{ ...tdN, fontWeight: 800, color: C.text }}>{money(inv.subtotal)}</td>
              {inv.ownerStatus && <td />}
            </tr>
            <tr><td style={td} colSpan={4}>VAT at {inv.taxPercent}%</td><td style={tdN}>{money(inv.subtotal * inv.taxPercent / 100)}</td>{inv.ownerStatus && <td />}</tr>
            <tr style={{ background: 'color-mix(in srgb, var(--x-blue) 6%, transparent)' }}>
              <td style={{ ...td, fontWeight: 900, color: LAYER.revenue, fontSize: 13 }} colSpan={4}>Total</td>
              <td style={{ ...tdN, fontWeight: 900, color: LAYER.revenue, fontSize: 13 }}>{money(inv.total)}</td>
              {inv.ownerStatus && <td />}
            </tr>
          </tfoot>
        </table>
      </div>
    </Modal>
  )
}

function ReviewModal({ project, linked, clientRate, holes, nextNumber, onClose, onCreate }: {
  project: string; linked: boolean; clientRate?: ClientRate; holes: HoleResult[]
  nextNumber: string; onClose: () => void; onCreate: (i: Invoice) => void
}) {
  const [number, setNumber] = useState(nextNumber)
  const [date, setDate] = useState(TODAY)
  const [taxPercent, setTax] = useState(15)
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date(TODAY + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 30); return d.toISOString().slice(0, 10)
  })
  // Anything billable that isn't metres — mobilisation, demobilisation, a
  // one-off the contract allows — is added here rather than tracked as a cost.
  const [extras, setExtras] = useState<{ id: string; label: string; amount: number }[]>([])
  const { state } = useCosting()
  const { state: inv } = useInventory()

  /* XPLORIX checks every shift behind these holes before the invoice goes
   * out. A figure that cannot be right stops it; an unusual one with no
   * reason has to be looked at first, because it is the line the client
   * will send back. */
  const checks = useMemo(() => holes.map(h => checkHole(state, h.hole.holeNumber)), [state, holes])
  const stopCount = checks.reduce((s, c) => s + c.stops.length, 0)
  const openCount = checks.reduce((s, c) => s + c.open.length, 0)
  const noNote = checks.reduce((s, c) => s + c.standbyNoNote, 0)
  const shiftCount = checks.reduce((s, c) => s + c.shifts, 0)
  const [ack, setAck] = useState(false)

  /* Standby the client caused on a day the rig was on no hole: it is in the
   * record and on no hole's bill, so it is offered here, once. */
  const loose = useMemo(() => looseStandby(state, inv, project), [state, inv, project])
  const [standbyOn, setStandbyOn] = useState<string[]>(() => loose.map(d => d.key))

  // Lines are the measurement book — one per size, formation and rate, in
  // depth order, exactly as shown on the hole. A slab contract bills by depth,
  // so the rock is not part of the line. A flat contract bills by formation,
  // so it is. The label follows the contract, and both come out of the same
  // structure, so the invoice can never disagree with the screen.
  const isFlat = clientRate?.structure !== 'slab'
  const lines: InvoiceLine[] = []
  holes.forEach(h => {
    h.billing.forEach(l => lines.push({
      label: isFlat
        ? `${h.hole.holeNumber} · ${l.holeSize} · ${l.formation}`
        : `${h.hole.holeNumber} · ${l.holeSize} · ${fm(l.fromDepth)}–${fm(l.toDepth)} m`,
      qty: `${fm(l.metres)} m`,
      rate: perUnit(l.rate),
      amount: l.amount,
      depth: `${fm(l.fromDepth)}–${fm(l.toDepth)} m`,
    }))
    const sb = h.days.filter(d => d.status === 'standby' && d.revenue > 0)
    if (sb.length) lines.push({
      label: `${h.hole.holeNumber} · standby`, qty: `${sb.length} days`,
      rate: money(clientRate?.standbyPerDay ?? 0), amount: sb.reduce((s, d) => s + d.revenue, 0),
    })
  })
  const looseOn = loose.filter(d => standbyOn.includes(d.key))
  Array.from(new Set(looseOn.map(d => d.rig))).forEach(rig => {
    const ds = looseOn.filter(d => d.rig === rig)
    lines.push({
      label: `${rig} · client standby, no hole · ${ds.map(d => d.date.slice(8) + '/' + d.date.slice(5, 7)).join(', ')}`,
      qty: `${ds.length} ${ds.length === 1 ? 'day' : 'days'}`,
      rate: money(clientRate?.standbyPerDay ?? ds[0].earned), amount: ds.reduce((s, d) => s + d.earned, 0),
    })
  })
  extras.filter(e => e.label.trim() && e.amount).forEach(e =>
    lines.push({ label: e.label.trim(), qty: '1', rate: money(e.amount), amount: e.amount }))

  const subtotal = lines.reduce((s, l) => s + l.amount, 0)
  const total = subtotal * (1 + taxPercent / 100)
  const cost = holes.reduce((s, h) => s + h.roll.total, 0)

  return (
    <Modal title="Review invoice" subtitle={project} width={840} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn>
        <Btn tone="primary" disabled={stopCount > 0 || (openCount > 0 && !ack) || lines.length === 0} onClick={() => onCreate({
          id: uid('inv'), number, project, client: PROJECT_CLIENTS[project] ?? '', date,
          holeNumbers: holes.map(h => h.hole.holeNumber), lines, subtotal, taxPercent, total,
          status: 'pending', dueDate,
          ...(looseOn.length ? { standbyDays: looseOn.map(d => d.key) } : {}),
          // On a shared project the invoice goes to the client, who checks
          // it line by line in the Client Portal. Only the lines travel — cost
          // and margin are worked out on this screen and never stored on it.
          ...(linked ? { ownerStatus: 'awaiting' as const, lineReviews: lines.map(() => null), sentAt: date } : {}),
        })}>{linked ? 'Send to the client' : 'Create invoice'}</Btn></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <InvoiceCheck checks={checks} shiftCount={shiftCount} stopCount={stopCount} openCount={openCount} noNote={noNote} ack={ack} onAck={setAck} />
        <Grid cols={4}>
          <TextField label="Invoice number" value={number} onChange={setNumber} />
          <DateField label="Date" value={date} onChange={setDate} />
          <DateField label="Payment due" value={dueDate} onChange={setDueDate} />
          <NumField label="Tax" value={taxPercent} onChange={setTax} suffix="%" />
        </Grid>

        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
          <table style={tableStyle}>
            <thead><tr><th style={th}>Description</th><th style={th}>Depth</th><th style={thR}>Quantity</th><th style={thR}>Rate</th><th style={thR}>Amount</th></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} style={{ borderBottom: rowBorder }}>
                  <td style={{ ...td, color: C.text, whiteSpace: 'normal' }}>{l.label}</td>
                  <td style={{ ...td, fontFamily: 'ui-monospace, monospace', color: C.faint }}>{l.depth ?? '—'}</td>
                  <td style={tdN}>{l.qty}</td><td style={tdN}>{l.rate}</td>
                  <td style={{ ...tdN, color: C.text, fontWeight: 700 }}>{money(l.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: `2px solid ${C.border}` }}>
                <td style={{ ...td, fontWeight: 800, color: C.text }} colSpan={4}>Subtotal</td>
                <td style={{ ...tdN, fontWeight: 800, color: C.text }}>{money(subtotal)}</td>
              </tr>
              <tr><td style={td} colSpan={4}>VAT at {taxPercent}%</td><td style={tdN}>{money(subtotal * taxPercent / 100)}</td></tr>
              <tr style={{ background: 'color-mix(in srgb, var(--x-blue) 6%, transparent)' }}>
                <td style={{ ...td, fontWeight: 900, color: LAYER.revenue, fontSize: 13 }} colSpan={4}>Total</td>
                <td style={{ ...tdN, fontWeight: 900, color: LAYER.revenue, fontSize: 13 }}>{money(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {loose.length > 0 && (
          <Section title="Client standby on no hole" note="The rig was stopped by the client on a day it was on no hole, so no hole's bill carries it. Tick the days to bill on this invoice; each day can only be billed once.">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {loose.map(d => (
                <label key={d.key} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12.5, color: C.text, cursor: 'pointer' }}>
                  <input type="checkbox" checked={standbyOn.includes(d.key)} aria-label={`Bill standby ${d.rig} ${d.date}`}
                    onChange={e => setStandbyOn(x => e.target.checked ? [...x, d.key] : x.filter(k => k !== d.key))} />
                  <span style={{ fontFamily: 'ui-monospace, monospace', minWidth: 92 }}>{d.date}</span>
                  <span style={{ minWidth: 70 }}>{d.rig}</span>
                  <span style={{ flex: 1, color: C.muted }}>{d.hours} h · {d.reasons || 'no reason logged'}</span>
                  {!d.noted && <Tag tone={C.amber}>No note: client may dispute</Tag>}
                  <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: LAYER.revenue }}>{money(d.earned)}</span>
                </label>
              ))}
            </div>
          </Section>
        )}

        <Section title="Other lines" note="Mobilisation, demobilisation, or anything else the contract lets you bill that isn't metres.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {extras.map((e, i) => (
              <div key={e.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input value={e.label} placeholder="Description"
                  onChange={ev => setExtras(x => x.map((y, j) => j === i ? { ...y, label: ev.target.value } : y))}
                  style={{ ...iStyle, flex: 2 }} />
                <input type="number" value={e.amount}
                  onChange={ev => setExtras(x => x.map((y, j) => j === i ? { ...y, amount: parseFloat(ev.target.value) || 0 } : y))}
                  style={{ ...iStyle, flex: 1, fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: LAYER.revenue }} />
                <Btn size="sm" tone="danger" onClick={() => setExtras(x => x.filter((_, j) => j !== i))}>Remove</Btn>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn size="sm" onClick={() => setExtras(x => [...x, { id: uid('x'), label: '', amount: 0 }])}>Add line</Btn>
              {clientRate && clientRate.mobilisation > 0 && (
                <Btn size="sm" onClick={() => setExtras(x => [...x, { id: uid('x'), label: 'Mobilisation', amount: clientRate.mobilisation }])}>Mobilisation</Btn>
              )}
              {clientRate && clientRate.demobilisation > 0 && (
                <Btn size="sm" onClick={() => setExtras(x => [...x, { id: uid('x'), label: 'Demobilisation', amount: clientRate.demobilisation }])}>Demobilisation</Btn>
              )}
            </div>
          </div>
        </Section>

        <Grid cols={4}>
          <Stat label="Revenue" value={money(subtotal)} color={LAYER.revenue} />
          <Stat label="Cost" value={money(cost)} color={LAYER.full} />
          <Stat label="Profit" value={money(subtotal - cost)} color={marginColor(subtotal - cost)} />
          <Stat label="Margin" value={subtotal > 0 ? pct(((subtotal - cost) / subtotal) * 100) : '—'} color={marginColor(subtotal - cost)} />
        </Grid>

        <Note tone={C.amber}>
          Cost and margin are for your own records and never appear on the client&apos;s copy. Once created, these holes are
          stamped as invoiced and cannot be billed again.
          {linked && <> {clientOf(project)} will see this invoice in their login straight away and can approve or dispute each line.</>}
        </Note>
      </div>
    </Modal>
  )
}

/* What XPLORIX found in the shifts behind the invoice, shown before it can
 * be sent. Each problem names the shift, so it can be put right in the log. */
function InvoiceCheck({ checks, shiftCount, stopCount, openCount, noNote, ack, onAck }: {
  checks: ReturnType<typeof checkHole>[]; shiftCount: number; stopCount: number; openCount: number; noNote: number
  ack: boolean; onAck: (v: boolean) => void
}) {
  const tone = stopCount ? C.red : openCount ? C.amber : C.green
  const items = checks.flatMap(c => [...c.stops.map(x => ({ ...x, hole: c.hole, stop: true })), ...c.open.map(x => ({ ...x, hole: c.hole, stop: false }))])
  return (
    <section aria-label="Invoice check" style={{ border: `1px solid ${hexA(tone, 0x5a)}`, background: hexA(tone, 0x10), borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: tone }}>
        {stopCount ? `Cannot be sent: ${stopCount} ${stopCount === 1 ? 'figure' : 'figures'} in the logs behind it cannot be right`
          : openCount ? `Look before you send: ${openCount} unusual ${openCount === 1 ? 'figure has' : 'figures have'} no reason in the log`
          : `Checked by XPLORIX: all ${shiftCount} shifts behind ${checks.length === 1 ? 'this hole' : `these ${checks.length} holes`} agree with the record`}
      </div>
      {items.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
          {items.slice(0, 20).map((x, i) => (
            <div key={i} style={{ fontSize: 12.5, color: C.text, display: 'flex', gap: 8 }}>
              <span style={{ color: x.stop ? C.red : C.amber, fontWeight: 700, minWidth: 54 }}>{x.stop ? 'Wrong' : 'Explain'}</span>
              <span style={{ color: C.muted, minWidth: 150 }}>{x.hole} · {x.log.rig} · {x.log.date} {x.log.shift.toLowerCase()}</span>
              <span>{x.check.title}</span>
            </div>
          ))}
        </div>
      )}
      {noNote > 0 && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 8 }}>{noNote} {noNote === 1 ? 'shift' : 'shifts'} of client standby on these holes {noNote === 1 ? 'has' : 'have'} no note saying why. Add one in the log so the client can see it.</div>}
      {stopCount > 0 && <div style={{ fontSize: 12.5, marginTop: 8 }}><Link href="/admin/logs/drill" style={{ color: C.orange, fontWeight: 700 }}>Open the drill logs to put them right →</Link></div>}
      {!stopCount && openCount > 0 && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: C.text, marginTop: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={ack} onChange={e => onAck(e.target.checked)} />
          I have looked at these and the invoice is right
        </label>
      )}
    </section>
  )
}

function downloadInvoice(inv: Invoice) {
  const rows = inv.lines.map(l =>
    `<tr><td>${l.label}</td><td>${l.depth ?? ''}</td><td class="r">${l.qty}</td><td class="r">${l.rate}</td><td class="r">${money(l.amount)}</td></tr>`).join('')
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${inv.number}</title><style>
body{font-family:system-ui,Arial,sans-serif;padding:44px;color:#111;max-width:840px;margin:0 auto}
.head{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:22px;border-bottom:3px solid var(--x-orange);margin-bottom:26px}
.t{font-size:26px;font-weight:800;color:var(--x-orange)}.s{font-size:12px;color:#666;margin-top:6px;line-height:1.6}
table{width:100%;border-collapse:collapse;margin:18px 0}
th{background:#111;color:#fff;padding:10px 12px;text-align:left;font-size:11px}
td{padding:10px 12px;border-bottom:1px solid #eee;font-size:13px}
.r{text-align:right;font-variant-numeric:tabular-nums}th.r{text-align:right}
.tot td{font-weight:800;font-size:15px;border-top:2px solid #111;background:#fafafa}
.f{margin-top:34px;padding-top:14px;border-top:1px solid #eee;font-size:11px;color:#999}
</style></head><body>
<div class="head"><div><div class="t">INVOICE</div><div class="s">${inv.number}<br>${inv.date}</div></div>
<div class="s" style="text-align:right">${inv.client ? `Bill to<br><strong style="font-size:14px;color:#111">${inv.client}</strong><br>` : 'Project<br>'}<strong style="font-size:14px;color:#111">${projectCode(inv.project)}</strong><br>${inv.project}${inv.dueDate ? `<br>Payment due ${inv.dueDate}` : ''}</div></div>
<table><thead><tr><th>Description</th><th>Depth</th><th class="r">Quantity</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead>
<tbody>${rows}</tbody><tfoot>
<tr><td colspan="4" class="r">Subtotal</td><td class="r">${money(inv.subtotal)}</td></tr>
<tr><td colspan="4" class="r">VAT at ${inv.taxPercent}%</td><td class="r">${money(inv.subtotal * inv.taxPercent / 100)}</td></tr>
<tr class="tot"><td colspan="4" class="r">Total</td><td class="r">${money(inv.total)}</td></tr>
</tfoot></table>
<div class="f">Generated from XPLORIX Costing</div></body></html>`
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  const a = document.createElement('a')
  a.href = url; a.download = `${inv.number}_${inv.project.replace(/\s+/g, '-')}.html`; a.click()
  URL.revokeObjectURL(url)
}

/* A CONTRACTOR'S RIG — the same month, costed the only way it can be.
 *
 * Our own rig's month is fuel, crew, repairs, parts and ownership, day by
 * day. A contractor's rig has none of those on our books: each checked day
 * costs what his work order pays for it, and earns what our client pays for
 * the same metres. The difference is what the rig leaves us. */
function ContractorRigTab({ v, rig, project, month }: { v: RigMonthView; rig: string; project: string; month: string }) {
  const { state } = useCosting()
  const wo = v.workOrder ?? workOrderFor(state, project, rig)
  const w = words(state.wording)
  const name = contractorName(state, wo?.contractorId)
  const link = `/admin/contractors?tab=orders&project=${encodeURIComponent(project)}`
  if (!v.hasLogs) {
    return <Card><Empty>No checked shifts from {rigCode(rig)} in {monthLabel(month)}.<br />A contractor&apos;s shift counts here once it has been accepted under <Link href={`/admin/contractors?tab=reports&project=${encodeURIComponent(project)}`} style={{ color: C.orange, fontWeight: 700 }}>Contractors</Link>.</Empty></Card>
  }
  const r = v.roll
  const days = v.days.filter(d => d.submitted)
  const rate = wo ? currentPayRate(wo, TODAY) : undefined
  const noRate = days.some(d => d.payUnmatched)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Note tone={C.orange}>
        <b style={{ color: C.text }}>{rigCode(rig)} is {name}&apos;s rig</b>, working under {wo?.number ?? 'a work order'}. It has no fuel, crew, parts or ownership cost on your books:
        each checked day costs what the work order pays. <Link href={link} style={{ color: C.orange, fontWeight: 700 }}>Open the work order</Link>
      </Note>
      {noRate && <Note tone={C.red}>Some metres have no matching line in the work order&apos;s rates, so they are costed at nil. Add the size or depth band to the work order.</Note>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <Stat label="Metres, checked" value={`${fm(r.units)} m`} note={`${r.drillingDays} drilling days · core ${pct(r.coreRecoveryPct)}`} />
        <Stat label="You pay the contractor" value={money(r.subcontract)} note={`${perUnit(r.cpu)} · ${r.standbyDays} standby ${r.standbyDays === 1 ? 'day' : 'days'} paid`} color={LAYER.operating} />
        <Stat label="Your client pays" value={money(r.revenue)} note={perUnit(r.revenuePerUnit)} color={LAYER.revenue} />
        <Stat label="Leaves you" value={money(r.margin)} note={`${r.revenue > 0 ? pct(r.marginPct) : '—'} · ${r.units ? perUnit(r.margin / r.units) : '—'}`} color={marginColor(r.margin)} />
      </div>
      <Card title={`${w.out} rig · day by day`} subtitle={`${rigCode(rig)} · ${monthLabel(month)} · only shifts your site has checked`} pad={false}>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead><tr>
              <th style={th}>Date</th><th style={th}>Hole</th><th style={th}>Day</th><th style={thR}>Drill hrs</th><th style={thR}>Stopped</th>
              <th style={thR}>Metres</th><th style={thR}>Core</th><th style={thR}>You pay / m</th><th style={thR}>You pay</th>
              <th style={thR}>Client pays</th><th style={thR}>Leaves you</th>
            </tr></thead>
            <tbody>
              {days.map(d => (
                <tr key={d.date} style={{
                  borderBottom: rowBorder,
                  background: d.status === 'breakdown' ? 'color-mix(in srgb, var(--x-red) 5%, transparent)' : d.status === 'standby' ? 'color-mix(in srgb, var(--x-amber) 4.5%, transparent)' : undefined,
                }}>
                  <td style={{ ...td, color: C.text, fontWeight: 600 }}>{dayLabel(d.date)}</td>
                  <td style={td}>{d.holeNumber || '—'}</td>
                  <td style={td}>{DAY_STATUS_LABEL[d.status]}{d.status !== 'drilling' && d.shifts[0]?.downtimeReason ? ` · ${d.shifts[0].downtimeReason}` : ''}</td>
                  <td style={tdN}>{d.drillingHours || '—'}</td>
                  <td style={{ ...tdN, color: d.downtimeHours ? C.red : C.dim }}>{d.downtimeHours ? `${d.downtimeHours} h` : '—'}</td>
                  <td style={{ ...tdN, color: d.units ? C.text : C.dim, fontWeight: 700 }}>{d.units ? fm(d.units) : '—'}</td>
                  <td style={tdN}>{d.units ? pct((d.coreRecovery / d.units) * 100) : '—'}</td>
                  <td style={tdN}>{d.units ? perUnit(d.payRate) : '—'}</td>
                  <td style={{ ...tdN, color: LAYER.operating }}>{d.subcontract ? money(d.subcontract) : '—'}</td>
                  <td style={{ ...tdN, color: d.revenue > 0 ? LAYER.revenue : C.dim }}>{d.revenue > 0 ? money(d.revenue) : '—'}</td>
                  <td style={{ ...tdN, fontWeight: 700, color: marginColor(d.revenue - d.total) }}>{d.revenue || d.total ? money(d.revenue - d.total) : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: `2px solid ${C.border}` }}>
                <td style={{ ...td, color: C.text, fontWeight: 800 }} colSpan={5}>{monthLabel(month)}</td>
                <td style={{ ...tdN, color: C.text, fontWeight: 800 }}>{fm(r.units)}</td>
                <td style={tdN}>{pct(r.coreRecoveryPct)}</td>
                <td style={tdN}>{perUnit(r.cpu)}</td>
                <td style={{ ...tdN, color: LAYER.operating, fontWeight: 800 }}>{money(r.subcontract)}</td>
                <td style={{ ...tdN, color: LAYER.revenue, fontWeight: 800 }}>{money(r.revenue)}</td>
                <td style={{ ...tdN, fontWeight: 800, color: marginColor(r.margin) }}>{money(r.margin)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div style={{ padding: '11px 16px', borderTop: rowBorder, fontSize: 11.5, color: C.faint, lineHeight: 1.6 }}>
          {rate ? `Work order rates since ${fullDate(rate.effectiveFrom)}. ` : ''}What the contractor is finally paid can be lower: deductions for core recovery, lateness or shortfall are worked out on the bill, under Contractors.
        </div>
      </Card>
    </div>
  )
}

/* ==========================================================================
 * 6  The screen
 * ========================================================================== */

const TABS = ['Performance', 'Drillholes', 'Tracker'] as const
type Tab = typeof TABS[number]

function CostingScreen() {
  const { state, setHoleStatus, addInvoice, updateInvoice, submitHole, withdrawHole } = useCosting()

  const projects: string[] = useMemo(() => (state.projects ?? []).map(p => p.name), [state.projects])
  const [project, setProject] = useState(projects[0] ?? '')

  /* Rigs on the project as well as rigs that have logged, so costs can be set
   * before the first shift, and a contractor's rig shows from its work order. */
  const rigsOf = useCallback((p: string) => Array.from(new Set([
    ...rigsFor(state.shiftLogs, p),
    ...((state.projects ?? []).find(x => x.name === p)?.rigs ?? []),
    ...(state.workOrders ?? []).filter(w => w.project === p).flatMap(w => w.rigs),
  ])).sort(), [state.shiftLogs, state.projects, state.workOrders])
  const rigs = useMemo(() => rigsOf(project), [rigsOf, project])

  const [rig, setRig] = useState(rigs[0] ?? '')
  // With nothing logged yet, the screen opens on this month rather than on no month at all.
  const months = useMemo(() => {
    const m = monthsFor(state.shiftLogs, rig, project)
    return m.length ? m : [monthOf(TODAY)]
  }, [state.shiftLogs, rig, project])
  const [month, setMonth] = useState(months[months.length - 1] ?? '')
  const [tab, setTab] = useState<Tab>('Performance')

  useEffect(() => { if (!rigs.includes(rig)) setRig(rigs[0] ?? '') }, [rigs, rig])
  useEffect(() => { if (!months.includes(month)) setMonth(months[months.length - 1] ?? '') }, [months, month])

  const [showRates, setShowRates] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [quickInvoice, setQuickInvoice] = useState<HoleResult | null>(null)

  /* A link from the Dashboard or from search can name where to open: project,
   * rig, month and tab. All four are set together so the two effects above
   * find the rig and month already valid and leave them. Re-read whenever the
   * address changes, so jumping from one hole to another while already on
   * this screen works too. */
  const params = useSearchParams()
  useEffect(() => {
    const p = params.get('project'), r = params.get('rig'), m = params.get('month'), t = params.get('tab')
    if (p && projects.includes(p)) setProject(p)
    if (r) setRig(r)
    if (m && /^\d{4}-\d{2}$/.test(m)) setMonth(m)
    if (t && (TABS as readonly string[]).includes(t)) setTab(t as Tab)
    if (params.get('setup') === 'costs') setShowRates(true)
    if (params.get('setup') === 'history') setShowHistory(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  const v = useRigMonthView(project, rig, month)
  // Newest first, whatever order they were saved in.
  const invoices = state.invoices.filter(i => i.project === project).sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number))
  /* A rig named on a work order for this project is a contractor's. It is
   * costed at what the work order pays, and has no costs of its own to set. */
  const bought = (r: string) => !!workOrderFor(state, project, r)
  const ownRigs = (p: string) => rigsOf(p).filter(r => !workOrderFor(state, p, r))

  if (!project) {
    return <div style={{ padding: 24 }}><Card><Empty>No projects yet. Create one in Projects to start costing.</Empty></Card></div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: 20, paddingBottom: 56 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: C.text, margin: 0 }}>Rig by rig</h1>
          <p style={{ fontSize: 13, color: C.faint, marginTop: 5, maxWidth: 660, lineHeight: 1.6 }}>
            What each hole cost, what it can be billed for, and what it made. Metres, hours, crew and fuel come from the
            driller&apos;s log, repairs from the maintenance log, tooling from what each rig is carrying. The rig cost is entered
            on each rig and the operating cost on each project; check or adjust them here.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn size="sm" onClick={() => setShowRates(true)}>⚙ Adjust costs</Btn>
          <Btn size="sm" onClick={() => setShowHistory(true)}>↺ Rates history</Btn>
        </div>
      </div>

      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
        padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
      }}>
        <Chain label="Project">
          {projects.map(p => <Chip key={p} on={project === p} onClick={() => setProject(p)} label={projectCode(p)} />)}
        </Chain>
        <span style={{ width: 1, height: 22, background: C.border }} />
        <Chain label="Rig">
          {rigs.map(r => <Chip key={r} on={rig === r} onClick={() => setRig(r)} label={bought(r) ? `${rigCode(r)} · contractor` : rigCode(r)} />)}
        </Chain>
        <div style={{ flex: 1 }} />
        {/* Any month is reachable, not just ones with logs — a month with none
            simply shows an empty table rather than being hidden. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Arrow dir="◀" onClick={() => setMonth(shiftMonth(month, -1))} />
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text, minWidth: 128, textAlign: 'center', fontFamily: 'inherit' }}>
            {monthLabel(month)}
          </span>
          <Arrow dir="▶" onClick={() => setMonth(shiftMonth(month, 1))} />
        </div>
      </div>

      {rig && !bought(rig) && (() => {
        /* An own rig with a cost missing is costed without it: say so, and say
         * where it is entered, rather than show a cost a metre that looks whole. */
        const noRig = !state.ownership.some(o => o.rig === rig)
        const noOp = !state.operating.some(o => o.rig === rig && o.project === project)
        if (!noRig && !noOp) return null
        const pid = (state.projects ?? []).find(p => p.name === project)?.id
        const missing = noRig && noOp ? 'its rig cost and its operating cost' : noRig ? 'its rig cost (price or hire, EMI, insurance)' : 'its operating cost on this project (fuel, crew, lodging, transport)'
        return (
          <Note tone={C.amber}>
            <b>Costs not set for {rigCode(rig)}: cost a metre is not complete.</b> It leaves out {missing}.{' '}
            {noRig && <Link href="/admin/rigs" style={{ color: C.orange, fontWeight: 700, textDecoration: 'none' }}>Set the rig cost in Rigs</Link>}
            {noRig && noOp && ' · '}
            {noOp && pid && <Link href={`/admin/projects/${pid}?tab=team`} style={{ color: C.orange, fontWeight: 700, textDecoration: 'none' }}>Set the operating cost on the project</Link>}
          </Note>
        )
      })()}

      <div style={{ display: 'flex', gap: 4, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 4, alignSelf: 'flex-start' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '7px 18px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
            border: 'none', fontFamily: 'inherit',
            background: tab === t ? C.orange : 'transparent', color: tab === t ? '#fff' : C.muted,
          }}>{t}</button>
        ))}
      </div>

      {tab === 'Performance' && (bought(rig)
        ? <ContractorRigTab v={v} rig={rig} project={project} month={month} />
        : <PerformanceTab v={v} rig={rig} project={project} month={month} />)}
      {tab === 'Drillholes' && <DrillholesTab v={v} linked={isShared(project)} client={clientOf(project)} onStatus={setHoleStatus}
        onSubmit={submitHole} onWithdraw={withdrawHole} onInvoice={h => setQuickInvoice(h)} />}
      {tab === 'Tracker' && <TrackerTab invoices={invoices} onUpdate={updateInvoice} />}

      {showRates && (
        <SetRatesModal projects={projects} initialProject={project} initialRig={bought(rig) ? (ownRigs(project)[0] ?? rig) : rig} month={month}
          rigsForProject={ownRigs}
          onClose={() => setShowRates(false)} />
      )}
      {quickInvoice && (
        <ReviewModal project={project} linked={isShared(project)} clientRate={v.clientRate} holes={[quickInvoice]}
          nextNumber={`INV-${String(invoices.length + 1).padStart(4, '0')}`}
          onClose={() => setQuickInvoice(null)}
          onCreate={inv => { addInvoice(inv); setQuickInvoice(null); setTab('Tracker') }} />
      )}
      {showHistory && <RatesHistoryModal project={project} rig={rig} onClose={() => setShowHistory(false)} />}
    </div>
  )
}

function Pick({ on, onClick, title, sub }: { on: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button onClick={onClick} style={{
      padding: '7px 14px', borderRadius: 9, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
      background: on ? `linear-gradient(135deg, ${C.orange}, ${C.orangeD})` : 'rgba(var(--x-ov),0.03)',
      border: `1px solid ${on ? 'transparent' : C.border}`, color: on ? '#fff' : C.muted,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>{title}</div>
      <div style={{ fontSize: 10, opacity: 0.75, marginTop: 2 }}>{sub}</div>
    </button>
  )
}

function Chain({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</span>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{children}</div>
    </div>
  )
}

function Chip({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 12px', borderRadius: 7, cursor: 'pointer', fontFamily: 'ui-monospace, monospace',
      fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
      background: on ? C.orange : 'rgba(var(--x-ov),0.03)',
      border: `1px solid ${on ? 'transparent' : C.border}`, color: on ? '#fff' : C.muted,
    }}>{label}</button>
  )
}

function Arrow({ dir, onClick }: { dir: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 9px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11,
      background: 'rgba(var(--x-ov),0.03)', border: `1px solid ${C.border}`, color: C.muted,
    }}>{dir}</button>
  )
}

/* Provider is mounted here, so this one screen is self-contained. */
export default function CostingRoute() {
  return (
    <CostingProvider>
      {/* Reading the address needs a Suspense boundary above it. */}
      <Suspense fallback={null}>
        <CostingScreen />
      </Suspense>
    </CostingProvider>
  )
}
