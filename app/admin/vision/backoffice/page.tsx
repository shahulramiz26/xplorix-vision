'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Check, ArrowRight, FileText, Wrench, Leaf } from 'lucide-react'
import { TODAY } from '../../../../lib/company'
import { monthOf, useCosting } from '../../../../lib/costing-store'
import { useInventory } from '../../../../lib/inventory-store'
import { useKnow } from '../../../../lib/copilot/context'
import { copilot, useCopilot } from '../../../../lib/copilot/store'
import { CO2_KG_PER_LITRE } from '../../../../lib/pulse'
import { Shell, Box, Stat, Stats, Note, Pill, V } from '../ui'

/* ==========================================================================
 * THE SELF-RUNNING BACK OFFICE
 *
 * The office work that follows the drilling, done by Copilot from the
 * record, with a person approving at one point in each chain:
 *   shift → log → invoice line, the same day;
 *   a part wearing out → service booked → purchase order;
 *   the month's fuel, water, safety and approvals → the client's ESG report.
 * ========================================================================== */

const r0 = (n: number) => Math.round(n).toLocaleString('en-US')
type StepState = 'done' | 'wait' | 'next'

export default function BackOffice() {
  const k = useKnow()
  const { drafts } = useCopilot()
  const { state } = useCosting()
  const { state: inv } = useInventory()
  const [approved, setApproved] = useState<Record<string, boolean>>({})

  // 1 · Shift → invoice: the cockpit's drafts, or the latest real shift as the example
  const rate = useMemo(() => {
    const p = k.holes[0]?.project
    const cr = state.clientRates.filter(c => c.project === p).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]
    const rows = cr?.rateRows ?? []
    return rows.length ? rows.reduce((s, r) => s + r.rate, 0) / rows.length : 800
  }, [k.holes, state.clientRates])
  const example = useMemo(() => {
    const l = [...k.logs].filter(x => x.metresDrilled > 0 && x.holeNumber).sort((a, b) => `${b.date}${b.shift}`.localeCompare(`${a.date}${a.shift}`))[0]
    return l ? { id: `ex_${l.id}`, rig: l.rig, hole: l.holeNumber!, date: l.date, shift: l.shift as 'Day' | 'Night', driller: l.driller ?? '—', startDepth: l.meterStart ?? 0, endDepth: (l.meterStart ?? 0) + l.metresDrilled, drillHours: l.drillingHours, coreLoss: 0, entries: [], status: 'sent' as const } : null
  }, [k.logs])
  const shifts = drafts.length ? drafts.slice(0, 3) : example ? [example] : []

  // 2 · Parts: every rig's bit, predicted
  const parts = useMemo(() => {
    const seen = new Set<string>()
    return k.holes.filter(h => h.rig && !seen.has(h.rig) && (seen.add(h.rig), true)).map(h => {
      const b = k.bit(h.rig!)
      const perShift = (k.normal(h.rig!, h.formation) || 0.6) * 10
      const shiftsLeft = Math.max(0, (b.life - b.used) / perShift)
      const part = inv.catalogue.find(p => p.name === b.name)
      const sup = inv.suppliers.find(s => s.name === part?.supplier)
      return { rig: h.rig!, hole: h.id, left: b.life - b.used, shiftsLeft, part, lead: part?.leadTimeDays ?? sup?.quotedLeadDays ?? 7 }
    }).sort((a, b) => a.shiftsLeft - b.shiftsLeft).slice(0, 4)
  }, [k, inv])

  // 3 · ESG: this month from the shift logs
  const esg = useMemo(() => {
    const m = monthOf(TODAY)
    const xs = state.shiftLogs.filter(l => l.date.startsWith(m) && !l.segmentOf)
    const fuel = xs.reduce((s, l) => s + l.fuelLitres, 0), water = xs.reduce((s, l) => s + l.waterLitres, 0), metres = xs.reduce((s, l) => s + l.metresDrilled, 0)
    const incidents = xs.reduce((s, l) => s + ((l as unknown as { incidents?: unknown[] }).incidents?.length ?? 0), 0)
    const status = state.holeStatus ?? {}
    const holes = Array.from(new Set(xs.map(l => l.holeNumber).filter(Boolean))) as string[]
    const signed = holes.filter(h => /approved|invoiced/.test(String((status as Record<string, { status?: string }>)[h]?.status ?? ''))).length
    return { m, shifts: xs.length, fuel, water, metres, co2: fuel * CO2_KG_PER_LITRE / 1000, incidents, holes: holes.length, signed }
  }, [state])

  const auto = shifts.length + parts.length + 1
  return (
    <Shell stage="y3" title="The self-running back office"
      lead={<>The office work after the drilling, done by Copilot from the record. A person approves once in each chain; everything before and after runs by itself. Shift logs become invoices the same day, worn parts become purchase orders before the rig stops, and the client&rsquo;s ESG report writes itself.</>}>
      <Stats>
        <Stat label="Chains running" value={auto} note="Shift to invoice, part to order, month to ESG report" tone={V.blue} />
        <Stat label="Typing saved" value="≈ 3 h a rig a week" note="Estimate: shift logs, invoices, orders and the ESG report no longer typed by hand" tone={V.green} />
        <Stat label="Invoice speed" value="Same day" note="Approved shift to a checked invoice line" tone={V.orange} />
        <Stat label="People in the loop" value="1 click" note="Each chain waits for one approval" tone={V.violet} />
      </Stats>

      <Box title="Shift → log → invoice" sub={drafts.length ? 'From shift logs Copilot wrote in the cockpit' : 'Example from the latest real shift. Logs written in the cockpit appear here.'}>
        <div style={{ display: 'grid', gap: 12 }}>
          {shifts.map(d => {
            const metres = Math.max(0, d.endDepth - d.startDepth)
            const ok = approved[d.id] || d.status === 'approved'
            return (
              <Chain key={d.id} icon={<FileText size={18} />} title={`${d.rig} · ${d.hole} · ${d.date} ${d.shift.toLowerCase()} shift`} steps={[
                { label: 'Log written by Copilot', detail: `${metres.toFixed(1)} m (${d.startDepth.toFixed(1)} → ${d.endDepth.toFixed(1)} m), ${d.drillHours.toFixed(1)} h drilling${d.entries.length ? `, ${d.entries.length} voice entries` : ''}`, state: 'done' },
                { label: 'Supervisor approves', detail: ok ? 'Approved' : 'Waiting: one click', state: ok ? 'done' : 'wait', action: ok ? undefined : () => { setApproved(a => ({ ...a, [d.id]: true })); if (!d.id.startsWith('ex_')) copilot.updateDraft(d.id, { status: 'approved' }) } },
                { label: 'Invoice line drafted', detail: `${metres.toFixed(1)} m × SAR ${r0(rate)} = SAR ${r0(metres * rate)}, checked against the log`, state: ok ? 'done' : 'next' },
                { label: 'Sent to the client', detail: ok ? 'In today\'s invoice, with the log attached' : 'After approval', state: ok ? 'done' : 'next' },
              ]} />
            )
          })}
          {!shifts.length && <div style={{ fontSize: 13, color: V.faint }}>No shift logs yet.</div>}
          <Link href="/admin/vision/copilot" style={{ color: V.orange, fontWeight: 700, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>Write one in the cockpit <ArrowRight size={14} /></Link>
        </div>
      </Box>

      <Box title="Part wearing out → service → purchase order" sub="From each rig's bit metres and its normal speed">
        <div style={{ display: 'grid', gap: 12 }}>
          {parts.map(p => {
            const key = `po_${p.rig}`, ok = approved[key]
            const urgent = p.shiftsLeft * 0.5 < p.lead
            return (
              <Chain key={key} icon={<Wrench size={18} />} title={`${p.rig} · ${p.part?.name ?? 'Bit'}`} steps={[
                { label: 'Wear predicted', detail: `${p.left.toFixed(0)} m of life left: about ${p.shiftsLeft.toFixed(1)} shifts at this rig's speed`, state: 'done' },
                { label: 'Change booked', detail: `At the next trip, in about ${Math.max(1, Math.round(p.shiftsLeft))} shifts`, state: 'done' },
                { label: 'Purchase order drafted', detail: `1 × ${p.part?.name ?? 'bit'} · ${p.part?.supplier ?? 'supplier'} · SAR ${r0(p.part?.rate ?? 0)} · ${p.lead} days lead${urgent ? ' · order now to arrive in time' : ''}`, state: ok ? 'done' : 'wait', action: ok ? undefined : () => setApproved(a => ({ ...a, [key]: true })) },
                { label: 'Sent to supplier', detail: ok ? 'Ordered' : 'After approval', state: ok ? 'done' : 'next' },
              ]} badge={urgent ? <Pill color={V.amber}>order now</Pill> : <Pill color={V.green}>in time</Pill>} />
            )
          })}
        </div>
      </Box>

      <Box title="Month → client ESG report" sub={`${esg.m}, from ${esg.shifts} shift logs`}>
        <Chain icon={<Leaf size={18} />} title={`ESG report · ${esg.m}`} steps={[
          { label: 'Figures gathered', detail: `${r0(esg.fuel)} L diesel · ${esg.co2.toFixed(1)} t CO₂ · ${r0(esg.water / 1000)} m³ water · ${r0(esg.metres)} m drilled`, state: 'done' },
          { label: 'Per metre and checked', detail: esg.metres ? `${(esg.fuel / esg.metres).toFixed(1)} L and ${(esg.co2 * 1000 / esg.metres).toFixed(1)} kg CO₂ a metre · ${esg.incidents} incidents · ${esg.signed} of ${esg.holes} holes signed off` : 'No metres this month', state: 'done' },
          { label: 'Report drafted', detail: 'One page for the client, every number linked to its shift log', state: approved.esg ? 'done' : 'wait', action: approved.esg ? undefined : () => setApproved(a => ({ ...a, esg: true })) },
          { label: 'Sent to the client', detail: approved.esg ? 'Sent' : 'After approval', state: approved.esg ? 'done' : 'next' },
        ]} />
      </Box>
      <Note>Built from the MVP&rsquo;s real shift logs, parts catalogue, client rates and Pulse&rsquo;s CO₂ factor ({CO2_KG_PER_LITRE} kg a litre of diesel). Approvals here are a demo and do not change the record; the launch version writes the approved log, invoice and order into the same screens the MVP uses today.</Note>
    </Shell>
  )
}

function Chain({ icon, title, steps, badge }: { icon: React.ReactNode; title: string; badge?: React.ReactNode; steps: { label: string; detail: string; state: StepState; action?: () => void }[] }) {
  return (
    <div style={{ background: V.raised, borderRadius: 12, padding: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
        <span style={{ color: V.orange }}>{icon}</span><span style={{ fontWeight: 700, fontSize: 14 }}>{title}</span>{badge}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 10 }}>
        {steps.map((s, i) => (
          <div key={i} style={{ position: 'relative', background: V.panel, borderRadius: 10, padding: '10px 12px', border: `1px solid ${s.state === 'wait' ? 'rgba(245,158,11,.5)' : V.line}`, opacity: s.state === 'next' ? 0.55 : 1 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ width: 20, height: 20, borderRadius: 10, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800, background: s.state === 'done' ? V.green : s.state === 'wait' ? V.amber : V.line, color: '#0B0F14' }}>{s.state === 'done' ? <Check size={12} /> : i + 1}</span>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{s.label}</span>
            </div>
            <div style={{ fontSize: 12.5, color: V.muted, marginTop: 6, lineHeight: 1.5 }}>{s.detail}</div>
            {s.action && <button className="v-btn" style={{ marginTop: 8, minHeight: 34, background: V.amber, borderColor: V.amber, color: '#1A1203' }} onClick={s.action}><Check size={14} /> Approve</button>}
          </div>
        ))}
      </div>
    </div>
  )
}
