'use client'

import { useState, useMemo, useCallback, Fragment, ReactNode, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Page, useEscape, num } from '../../components/kit'
import { StoresOverview } from './overview'
import { RigCountCard, ValuationSetting } from './rig-count'
import {
  useInventory, TODAY, FORMATIONS, CATEGORIES, costPerMetre, toolingPerMetre,
  normFormation, poValue, poStatus, poReceivedValue, poStoreValue, poOpenReorderValue,
  qtyReceived, qtyInStore, qtyNeverDelivered, qtyFaulty, qtyToReorder,
  poHasSomethingToReorder, poHasSomethingToReceive, rateOfLine,
  openReorders, REORDER_STATUS_LABEL, REORDER_OPEN_STATUSES, DELAY_REASONS,
  stockInStore, buildAlerts, countLosses, supplierPerformance, supplierInsight,
  rigHoldings, toolingRatesFor, toolingFor, terrainRows, groundMix, TERRAIN_MIN_SAMPLE,
  formationUse, FORMATION_USES, FORMATION_USE_LABEL,
  daysBetween, addDays, projectCode, isLiveProject, money, moneyL, perMetre,
  dayLabel, fullDate, uid,
  COMPLETED_PROJECTS, RIGS, PROJECTS,
  type Part, type PurchaseOrder, type Alert, type AlertLevel, type AlertKind,
  type PartCategory, type Reorder, type ReorderStatus, type ReorderReceipt,
  type DelayReason, type Supplier, type ReceiptLine, type StockLine,
  type Formation, type FormationUse,
  type ShiftFact, type TerrainRow, type ToolingRates,
} from '../../../lib/inventory-store'
import { useCosting, monthOf } from '../../../lib/costing-store'
import { ownLogs } from '../../../lib/contracting'
import { hexA } from '../../../lib/theme'
import { buyCheck, type BuyCheckLine } from '../../../lib/stock-checks'

/* Parts are ours only on our own rigs. A contractor's rig wears the
 * contractor's bits and rods, so its shifts are left out of everything this
 * screen works out: what each rig is carrying, how fast it burns through
 * ground, and when the store runs dry. */
function useOwnLogs() {
  const { state } = useCosting()
  return useMemo(() => ({ shiftLogs: ownLogs(state.shiftLogs) }), [state.shiftLogs])
}

const C = {
  bg: 'var(--x-bg)', card: 'var(--x-card)', border: 'var(--x-border)',
  orange: 'var(--x-orange)', orangeD: 'var(--x-orange-d)',
  green: 'var(--x-green)', red: 'var(--x-red)', amber: 'var(--x-amber)',
  blue: 'var(--x-blue)', purple: 'var(--x-purple)', teal: 'var(--x-teal)',
  text: 'var(--x-text)', muted: 'var(--x-muted)', faint: 'var(--x-faint)', dim: 'var(--x-dim)',
}

const iStyle: React.CSSProperties = {
  padding: '6px 10px', background: C.bg, border: `1px solid ${C.border}`,
  borderRadius: 7, color: C.text, fontSize: 12.5, fontFamily: 'inherit', width: '100%',
}
const numStyle: React.CSSProperties = { ...iStyle, textAlign: 'right', fontFamily: 'ui-monospace, monospace', fontWeight: 700 }
const th: React.CSSProperties = {
  padding: '7px 12px', textAlign: 'left', fontSize: 10, color: C.faint, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap',
  borderBottom: `1px solid ${C.border}`, background: 'rgba(var(--x-ov),0.02)',
}
const thR: React.CSSProperties = { ...th, textAlign: 'right' }
const td: React.CSSProperties = { padding: '7px 12px', fontSize: 12, color: C.muted, whiteSpace: 'nowrap' }
const tdN: React.CSSProperties = { ...td, textAlign: 'right', fontFamily: 'ui-monospace, monospace' }
const tdMono: React.CSSProperties = { ...td, fontFamily: 'ui-monospace, monospace' }
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' }
const rowBorder = '1px solid color-mix(in srgb, var(--x-border) 50%, transparent)'

/* ── primitives ─────────────────────────────────────────────────────────── */

function Card({ title, subtitle, right, children, pad = true, accent }: {
  title?: string; subtitle?: string; right?: ReactNode; children: ReactNode; pad?: boolean; accent?: string
}) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', borderLeft: accent ? `3px solid ${accent}` : undefined }}>
      {title && (
        <div style={{ padding: '11px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{title}</div>
            {subtitle && <div style={{ fontSize: 11, color: C.faint, marginTop: 3 }}>{subtitle}</div>}
          </div>
          {right}
        </div>
      )}
      <div style={pad ? { padding: 16 } : undefined}>{children}</div>
    </div>
  )
}

function Stat({ label, value, note, color = C.text, big }: { label: string; value: string; note?: string; color?: string; big?: boolean }) {
  return (
    <div style={{ padding: '12px 14px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: big ? 21 : 17, fontWeight: 900, color, fontFamily: 'ui-monospace, monospace', lineHeight: 1.15 }}>{value}</div>
      {note && <div style={{ fontSize: 10, color: C.faint, marginTop: 5 }}>{note}</div>}
    </div>
  )
}

function Tag({ children, tone = C.faint }: { children: ReactNode; tone?: string }) {
  return (
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 5, color: tone, background: `${hexA(tone, 0x1A)}`, border: `1px solid ${hexA(tone, 0x33)}`, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

function Btn({ children, onClick, tone = 'ghost', disabled, size = 'md' }: { children: ReactNode; onClick?: () => void; tone?: 'primary' | 'ghost' | 'danger'; disabled?: boolean; size?: 'sm' | 'md' }) {
  const tones: Record<string, React.CSSProperties> = {
    primary: { background: `linear-gradient(135deg, ${C.orange}, ${C.orangeD})`, color: '#fff', border: 'none' },
    ghost: { background: 'rgba(var(--x-ov),0.04)', border: `1px solid ${C.border}`, color: C.muted },
    danger: { background: 'color-mix(in srgb, var(--x-red) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--x-red) 22%, transparent)', color: C.red },
  }
  return (
    <button onClick={onClick} disabled={disabled} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: disabled ? 'not-allowed' : 'pointer', borderRadius: 8, fontWeight: 700, fontFamily: 'inherit', opacity: disabled ? 0.45 : 1, padding: size === 'sm' ? '5px 11px' : '8px 15px', fontSize: size === 'sm' ? 11.5 : 12.5, whiteSpace: 'nowrap', ...tones[tone] }}>
      {children}
    </button>
  )
}

function Note({ tone = C.blue, children }: { tone?: string; children: ReactNode }) {
  return <div style={{ padding: '9px 13px', borderRadius: 9, background: `${hexA(tone, 0x0F)}`, border: `1px solid ${hexA(tone, 0x33)}`, fontSize: 11.5, color: tone, lineHeight: 1.55 }}>{children}</div>
}

function Empty({ children }: { children: ReactNode }) {
  return <div style={{ padding: '34px 20px', textAlign: 'center', color: C.faint, fontSize: 12.5, lineHeight: 1.7 }}>{children}</div>
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, height: 15 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 10, color: C.dim, marginTop: 4, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  )
}

const PART_SIZES = ['HQ', 'NQ', 'PQ', 'BQ', 'AQ']
/* Where a part wears: its ground, and its core size when it has one. */
const useLabel = (p: Part) => `${FORMATION_USE_LABEL[formationUse(p)]}${p.holeSize ? ` · ${p.holeSize} only` : ''}`

function Modal({ title, subtitle, width = 760, onClose, children, footer }: { title: string; subtitle?: string; width?: number; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEscape(onClose)
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(var(--x-shadow),0.82)', backdropFilter: 'blur(10px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, width, maxWidth: '100%', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px 13px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12, color: C.faint, marginTop: 4 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} aria-label="Close" style={{ padding: 7, borderRadius: 8, background: 'rgba(var(--x-ov),0.04)', border: `1px solid ${C.border}`, color: C.faint, cursor: 'pointer', lineHeight: 0, fontFamily: 'inherit' }}>✕</button>
        </div>
        <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>{children}</div>
        {footer && <div style={{ padding: '13px 20px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>{footer}</div>}
      </div>
    </div>
  )
}

const Grid = ({ cols, children }: { cols: number; children: ReactNode }) =>
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gap: 12 }}>{children}</div>

function SubHead({ children, tone }: { children: ReactNode; tone: string }) {
  return <div style={{ fontSize: 10, fontWeight: 700, color: tone, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{children}</div>
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
    <button onClick={onClick} style={{ padding: '5px 12px', borderRadius: 7, cursor: 'pointer', fontFamily: 'ui-monospace, monospace', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', background: on ? C.orange : 'rgba(var(--x-ov),0.03)', border: `1px solid ${on ? 'transparent' : C.border}`, color: on ? '#fff' : C.muted }}>
      {label}
    </button>
  )
}

/* A bar drawn in the row it belongs to, so length and number sit together. */
function Bar({ value, max, tone, height = 6 }: { value: number; max: number; tone: string; height?: number }) {
  const w = max > 0 ? Math.max(1.5, (value / max) * 100) : 0
  return (
    <div style={{ height, background: 'rgba(var(--x-ov),0.045)', borderRadius: height / 2, overflow: 'hidden', minWidth: 60 }}>
      <div style={{ width: `${w}%`, height: '100%', background: tone, borderRadius: height / 2 }} />
    </div>
  )
}

let _rowSeq = 0
const rowId = () => `r${Date.now()}_${++_rowSeq}`

const FORMATION_TONE: Record<Formation, string> = {
  Soft: C.green, Medium: C.teal, Hard: C.amber, 'Very Hard': C.red,
}

/* ==========================================================================
 * ALERTS
 * ========================================================================== */

const LEVEL_TONE: Record<AlertLevel, string> = { urgent: C.red, warn: C.amber, info: C.blue }
const KIND_LABEL: Record<AlertKind, string> = { runningOut: 'Running out', overdue: 'Late delivery', dueSoon: 'Arriving soon', replacement: 'Replacement owed', idle: 'Idle stock', stranded: 'Stranded', lowStock: 'Low stock' }
const KIND_ORDER: AlertKind[] = ['runningOut', 'overdue', 'dueSoon', 'replacement', 'idle', 'stranded', 'lowStock']
const KIND_TONE: Record<AlertKind, string> = { runningOut: C.red, overdue: C.red, dueSoon: C.teal, replacement: C.amber, idle: C.amber, stranded: C.amber, lowStock: C.blue }

function AlertsPanel({ alerts }: { alerts: Alert[] }) {
  const [kind, setKind] = useState<AlertKind | 'all'>('all')
  if (alerts.length === 0) return <Card><Empty>Nothing needs attention.</Empty></Card>

  const kinds = KIND_ORDER.map(k => {
    const mine = alerts.filter(a => a.kind === k)
    return { kind: k, count: mine.length, value: mine.reduce((s, a) => s + (a.value ?? 0), 0) }
  }).filter(x => x.count > 0)

  const active = kind !== 'all' && !kinds.some(k => k.kind === kind) ? 'all' : kind
  const shown = active === 'all' ? alerts : alerts.filter(a => a.kind === active)
  const urgent = alerts.filter(a => a.level === 'urgent').length
  const shownValue = shown.reduce((s, a) => s + (a.value ?? 0), 0)

  const chip = (label: string, count: number, value: number, on: boolean, tone: string, onClick: () => void) => (
    <button key={label} onClick={onClick} style={{ display: 'flex', alignItems: 'baseline', gap: 7, padding: '5px 11px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', background: on ? `${hexA(tone, 0x22)}` : 'rgba(var(--x-ov),0.03)', border: `1px solid ${on ? `${hexA(tone, 0x66)}` : C.border}`, color: on ? tone : C.faint }}>
      <span style={{ fontSize: 11.5, fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 800, fontFamily: 'ui-monospace, monospace' }}>{count}</span>
      {value > 0 && <span style={{ fontSize: 10, opacity: 0.7, fontFamily: 'ui-monospace, monospace' }}>{moneyL(value)}</span>}
    </button>
  )

  return (
    <Card title="Needs attention" subtitle={`${alerts.length} item${alerts.length === 1 ? '' : 's'}${urgent ? `, ${urgent} urgent` : ''}`} pad={false} accent={urgent ? C.red : C.amber}>
      <div style={{ display: 'flex', gap: 6, padding: '11px 16px', borderBottom: rowBorder, flexWrap: 'wrap' }}>
        {chip('All', alerts.length, alerts.reduce((s, a) => s + (a.value ?? 0), 0), active === 'all', C.orange, () => setKind('all'))}
        <span style={{ width: 1, background: C.border, margin: '2px 4px' }} />
        {kinds.map(k => chip(KIND_LABEL[k.kind], k.count, k.value, active === k.kind, KIND_TONE[k.kind], () => setKind(active === k.kind ? 'all' : k.kind)))}
      </div>
      <div>
        {shown.map(a => (
          <div key={a.id} style={{ display: 'flex', gap: 12, padding: '11px 16px', borderBottom: rowBorder, alignItems: 'flex-start' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: LEVEL_TONE[a.level], marginTop: 5, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>{a.title}</span>
                {active === 'all' && <Tag tone={KIND_TONE[a.kind]}>{KIND_LABEL[a.kind]}</Tag>}
              </div>
              <div style={{ fontSize: 11.5, color: C.faint, marginTop: 3, lineHeight: 1.55 }}>{a.detail}</div>
            </div>
            {a.value != null && <span style={{ fontSize: 12, fontWeight: 700, color: LEVEL_TONE[a.level], fontFamily: 'ui-monospace, monospace' }}>{money(a.value)}</span>}
          </div>
        ))}
      </div>
      {shown.length > 1 && (
        <div style={{ padding: '9px 16px', display: 'flex', justifyContent: 'space-between', gap: 12, background: 'rgba(var(--x-ov),0.02)' }}>
          <span style={{ fontSize: 11, color: C.faint }}>{shown.length} shown{active !== 'all' ? ` of ${alerts.length}` : ''}</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: C.text, fontFamily: 'ui-monospace, monospace' }}>{money(shownValue)}</span>
        </div>
      )}
    </Card>
  )
}

/* ==========================================================================
 * CATALOGUE
 * ========================================================================== */

function CatalogueTab({ onEdit, onImport }: { onEdit: (p: Part) => void; onImport: () => void }) {
  const { state, deletePart } = useInventory()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<PartCategory | 'All'>('All')
  const [sup, setSup] = useState('All')
  const [showRetired, setShowRetired] = useState(false)
  const parts = state.catalogue.filter(p =>
    (showRetired || p.active) &&
    (cat === 'All' || p.category === cat) &&
    (sup === 'All' || p.supplier === sup) &&
    (!q || p.name.toLowerCase().includes(q.toLowerCase()) || p.partNumber.toLowerCase().includes(q.toLowerCase())))

  const blank = (): Part => ({
    id: uid('t'), partNumber: '', name: '', category: 'Bit', formationUse: 'all', rate: 0,
    lifeMetres: 0, supplier: state.suppliers[0]?.name ?? '', leadTimeDays: 14, minStock: 1, active: true,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Note tone={C.dim}>
        Cost per metre is the rate divided by life in metres. Used in decides which ground a part is charged against,
        so a surface casing is not charged to a metre of granite.
      </Note>

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px' }}>
        <div style={{ width: 220 }}><Field label="Search"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Part number or name" style={iStyle} /></Field></div>
        <div style={{ width: 155 }}>
          <Field label="Category">
            <select value={cat} onChange={e => setCat(e.target.value as PartCategory | 'All')} style={{ ...iStyle, cursor: 'pointer' }}>
              <option value="All">All categories</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ width: 185 }}>
          <Field label="Supplier">
            <select value={sup} onChange={e => setSup(e.target.value)} style={{ ...iStyle, cursor: 'pointer' }}>
              <option value="All">All suppliers</option>
              {state.suppliers.map(x => <option key={x.id} value={x.name}>{x.name}</option>)}
            </select>
          </Field>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', paddingBottom: 7 }}>
          <input type="checkbox" checked={showRetired} onChange={e => setShowRetired(e.target.checked)} />
          <span style={{ fontSize: 12, color: C.muted }}>Show retired</span>
        </label>
        <div style={{ flex: 1 }} />
        {(q || cat !== 'All' || sup !== 'All') && <Btn size="sm" onClick={() => { setQ(''); setCat('All'); setSup('All') }}>Clear filters</Btn>}
        <Btn size="sm" onClick={onImport}>Import CSV</Btn>
        <Btn size="sm" tone="primary" onClick={() => onEdit(blank())}>Add part</Btn>
      </div>

      <Card title="Parts catalogue" pad={false} subtitle={`${parts.length} of ${state.catalogue.length} parts`}>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={th}>Part number</th><th style={th}>Item</th><th style={th}>Serial no.</th>
                <th style={th}>Category</th><th style={th}>Used in</th><th style={thR}>Rate</th><th style={thR}>Life</th>
                <th style={thR}>Cost / metre</th><th style={th}>Supplier</th><th style={thR}>Lead</th><th style={thR}>Min stock</th><th style={th} />
              </tr>
            </thead>
            <tbody>
              {parts.length === 0 && (
                <tr><td colSpan={12}><Empty>{state.catalogue.length === 0 ? 'No parts yet. Add one or import a CSV.' : 'Nothing matches those filters.'}</Empty></td></tr>
              )}
              {parts.map(p => (
                <tr key={p.id} style={{ borderBottom: rowBorder, opacity: p.active ? 1 : 0.45 }}>
                  <td style={{ ...tdMono, color: C.text, fontWeight: 700 }}>{p.partNumber || '—'}</td>
                  <td style={{ ...td, color: C.text, fontWeight: 600, whiteSpace: 'normal', maxWidth: 230 }}>
                    {p.name}{!p.active && <span style={{ marginLeft: 7 }}><Tag tone={C.dim}>retired</Tag></span>}
                  </td>
                  <td style={{ ...tdMono, color: p.serialNumber ? C.muted : C.dim }}>{p.serialNumber || '—'}</td>
                  <td style={td}><Tag tone={C.dim}>{p.category}</Tag></td>
                  <td style={{ ...td, color: C.muted }}>{useLabel(p)}</td>
                  <td style={tdN}>{money(p.rate)}</td>
                  <td style={{ ...tdN, color: C.faint }}>{p.lifeMetres.toLocaleString('en-US')} m</td>
                  <td style={{ ...tdN, color: C.orange, fontWeight: 700 }}>{perMetre(costPerMetre(p))}</td>
                  <td style={td}>{p.supplier}</td>
                  <td style={tdN}>{p.leadTimeDays}d</td>
                  <td style={{ ...tdN, color: C.faint }}>{p.minStock}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <Btn size="sm" onClick={() => onEdit(p)}>Edit</Btn>
                      <Btn size="sm" tone="danger" onClick={() => deletePart(p.id)}>Delete</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: `2px solid ${C.border}`, background: 'rgba(var(--x-ov),0.02)' }}>
                <td style={{ ...td, fontWeight: 800, color: C.text }} colSpan={7}>
                  Whole catalogue, every active part
                  <span style={{ fontWeight: 400, color: C.faint, marginLeft: 8 }}>
                    a reference price — a rig is charged on what it is actually carrying
                  </span>
                </td>
                <td style={{ ...tdN, fontWeight: 900, color: C.orange }}>{perMetre(toolingPerMetre(parts))}</td>
                <td style={td} colSpan={4} />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  )
}

function PartModal({ part, onSave, onClose }: { part: Part; onSave: (p: Part) => void; onClose: () => void }) {
  const { state } = useInventory()
  const [f, setF] = useState<Part>({ ...part, formationUse: formationUse(part) })
  const u = (p: Partial<Part>) => setF(x => ({ ...x, ...p }))
  return (
    <Modal title={f.name || 'New part'} subtitle="Life in metres drives cost per metre — the figure worth getting right" width={720} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn tone="primary" disabled={!f.name.trim()} onClick={() => { onSave(f); onClose() }}>Save part</Btn></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Grid cols={3}>
          <Field label="Part number"><input value={f.partNumber} onChange={e => u({ partNumber: e.target.value })} style={{ ...iStyle, fontFamily: 'ui-monospace, monospace' }} placeholder="e.g. HQ-BIT-IMP" /></Field>
          <Field label="Item"><input value={f.name} onChange={e => u({ name: e.target.value })} style={iStyle} /></Field>
          <Field label="Serial number" hint="Optional"><input value={f.serialNumber ?? ''} onChange={e => u({ serialNumber: e.target.value || undefined })} style={{ ...iStyle, fontFamily: 'ui-monospace, monospace' }} /></Field>
        </Grid>
        <Grid cols={3}>
          <Field label="Category">
            <select value={f.category} onChange={e => u({ category: e.target.value as PartCategory })} style={{ ...iStyle, cursor: 'pointer' }}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Rate (SAR)"><input type="number" value={f.rate} onChange={e => u({ rate: parseFloat(e.target.value) || 0 })} style={{ ...numStyle, color: C.orange }} /></Field>
          <Field label="Used in" hint="Which ground this part is consumed in. Only metres of that ground carry its cost.">
            <select value={formationUse(f)} onChange={e => u({ formationUse: e.target.value as FormationUse })} style={{ ...iStyle, cursor: 'pointer' }}>
              {FORMATION_USES.map(k => <option key={k} value={k}>{FORMATION_USE_LABEL[k]}</option>)}
            </select>
          </Field>
        </Grid>
        <Grid cols={3}>
          <Field label="Life in metres" hint="Metres before replacement">
            <input type="number" value={f.lifeMetres} onChange={e => u({ lifeMetres: parseFloat(e.target.value) || 0 })} style={numStyle} />
            {f.lifeMetres > 0 && f.rate > 0 && <div style={{ fontSize: 11, color: C.orange, marginTop: 5, textAlign: 'right', fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>{perMetre(f.rate / f.lifeMetres)}</div>}
          </Field>
          <Field label="Minimum stock" hint="units"><input type="number" value={f.minStock} onChange={e => u({ minStock: parseFloat(e.target.value) || 0 })} style={numStyle} /></Field>
          <Field label="Lead time" hint="days"><input type="number" value={f.leadTimeDays} onChange={e => u({ leadTimeDays: parseFloat(e.target.value) || 0 })} style={numStyle} /></Field>
        </Grid>
        <Grid cols={2}>
          <Field label="Core size" hint="An HQ bit wears only on HQ metres. Leave on Any size for parts every size uses.">
            <select value={f.holeSize ?? ''} onChange={e => u({ holeSize: e.target.value || undefined })} style={{ ...iStyle, cursor: 'pointer' }}>
              <option value="">Any size</option>
              {PART_SIZES.map(z => <option key={z} value={z}>{z} only</option>)}
            </select>
          </Field>
          <Field label="Supplier">
            <select value={f.supplier} onChange={e => u({ supplier: e.target.value })} style={{ ...iStyle, cursor: 'pointer' }}>
              {state.suppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </Field>
        </Grid>
        <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
          <input type="checkbox" checked={f.active} onChange={e => u({ active: e.target.checked })} />
          <span style={{ fontSize: 12.5, color: C.text }}>In use</span>
          <span style={{ fontSize: 11, color: C.faint }}>— retired parts drop out of cost per metre</span>
        </label>
      </div>
    </Modal>
  )
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const { state, importParts } = useInventory()
  const [text, setText] = useState('')
  const TEMPLATE = 'part_number,name,serial_number,category,rate,life_metres,used_in,size,supplier,lead_days,min_stock\nHQ-BIT-IMP,HQ Impregnated Bit,,Bit,1830,100,hard+,HQ,Sandvik Mining,18,3\nHQ-ROD-30,HQ Wire Line Drill Rod 3.0 m,,Rod & Casing,650,5000,all,HQ,Boart Longyear Saudi,21,6\n'

  const parsed = useMemo<Part[]>(() => {
    if (!text.trim()) return []
    const rows = text.trim().split(/\r?\n/)
    const head = rows[0].split(',').map(h => h.trim().toLowerCase())
    const idx = (n: string) => head.indexOf(n)
    const out: Part[] = []
    rows.slice(1).forEach(line => {
      const c = line.split(',').map(x => x.trim())
      const at = (n: string) => { const k = idx(n); return k < 0 ? '' : (c[k] ?? '').trim() }
      const num = (n: string, d = 0) => parseFloat(at(n)) || d
      const name = at('name') || c[0]?.trim()
      if (!name) return
      const rawUse = at('used_in') || at('formation')
      out.push({
        id: uid('t'), partNumber: at('part_number'), name, serialNumber: at('serial_number') || undefined,
        category: (CATEGORIES as string[]).includes(at('category')) ? at('category') as PartCategory : 'Accessory',
        formation: rawUse || 'all',
        rate: num('rate'), lifeMetres: num('life_metres') || num('life'),
        holeSize: PART_SIZES.includes(at('size').toUpperCase()) ? at('size').toUpperCase() : undefined,
        supplier: at('supplier') || (state.suppliers[0]?.name ?? ''),
        leadTimeDays: num('lead_days', 14), minStock: num('min_stock', 1), active: true,
      })
    })
    return out
  }, [text, state.suppliers])

  const existing = (p: Part) => state.catalogue.some(x => x.name.toLowerCase() === p.name.toLowerCase() || (p.partNumber && x.partNumber?.toLowerCase() === p.partNumber.toLowerCase()))

  return (
    <Modal title="Import parts" subtitle="Paste a CSV. used_in takes all, soft, hard+ or veryHard." width={840} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn tone="primary" disabled={parsed.length === 0} onClick={() => { importParts(parsed); onClose() }}>Import {parsed.length} part{parsed.length === 1 ? '' : 's'}</Btn></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Btn size="sm" onClick={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' })); a.download = 'xplorix-parts-template.csv'; a.click() }}>Download template</Btn>
        <Field label="CSV"><textarea value={text} onChange={e => setText(e.target.value)} rows={7} placeholder={TEMPLATE} style={{ ...iStyle, fontFamily: 'ui-monospace, monospace', fontSize: 11.5, lineHeight: 1.6, resize: 'vertical' }} /></Field>
        {parsed.length > 0 && (
          <Card title="Preview" pad={false} subtitle={`${parsed.filter(p => !existing(p)).length} new, ${parsed.filter(existing).length} updates`}>
            <table style={tableStyle}>
              <thead><tr><th style={th}>Part</th><th style={th}>Used in</th><th style={thR}>Rate</th><th style={thR}>Life</th><th style={thR}>Cost/m</th><th style={th} /></tr></thead>
              <tbody>
                {parsed.map((p, k) => (
                  <tr key={k} style={{ borderBottom: rowBorder }}>
                    <td style={{ ...td, color: C.text }}>{p.name}</td>
                    <td style={{ ...td, color: C.muted }}>{useLabel(p)}</td>
                    <td style={tdN}>{money(p.rate)}</td>
                    <td style={{ ...tdN, color: C.faint }}>{p.lifeMetres.toLocaleString('en-US')} m</td>
                    <td style={{ ...tdN, color: C.orange, fontWeight: 700 }}>{p.lifeMetres > 0 ? perMetre(p.rate / p.lifeMetres) : '—'}</td>
                    <td style={td}><Tag tone={existing(p) ? C.amber : C.green}>{existing(p) ? 'update' : 'new'}</Tag></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </Modal>
  )
}

/* ==========================================================================
 * ORDERS
 * ========================================================================== */

const PO_TONE: Record<string, string> = { draft: C.faint, ordered: C.blue, partial: C.amber, received: C.green }
const REORDER_TONE: Record<ReorderStatus, string> = { raised: C.red, sent: C.amber, promised: C.amber, closed: C.green, credited: C.blue }

function OrdersTab({ onReceive, onCreate, onEdit, onRaiseReorder, onReceiveReorder }: {
  onReceive: (po: PurchaseOrder) => void; onCreate: () => void; onEdit: (po: PurchaseOrder) => void
  onRaiseReorder: (po: PurchaseOrder) => void; onReceiveReorder: (po: PurchaseOrder, r: Reorder) => void
}) {
  const { state } = useInventory()
  const [open, setOpen] = useState<string | null>(null)
  const [q, setQ] = useState(''); const [status, setStatus] = useState<'all' | 'draft' | 'ordered' | 'partial' | 'received'>('all')
  const [sup, setSup] = useState('All'); const [proj, setProj] = useState('All')
  const nameOf = (id: string) => state.catalogue.find(p => p.id === id)?.name ?? id

  const pos = state.pos.filter(p =>
    (status === 'all' || poStatus(p) === status) && (sup === 'All' || p.supplier === sup) &&
    (proj === 'All' || p.project === proj) &&
    (!q || p.number.toLowerCase().includes(q.toLowerCase()) || p.supplier.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (b.orderedDate ?? b.createdDate).localeCompare(a.orderedDate ?? a.createdDate))

  const t = state.pos.reduce((a, p) => ({ ordered: a.ordered + (p.status === 'draft' ? 0 : poValue(p)), received: a.received + poReceivedValue(p), store: a.store + poStoreValue(p), owed: a.owed + poOpenReorderValue(p) }), { ordered: 0, received: 0, store: 0, owed: 0 })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Grid cols={4}>
        <Stat label="On order" value={moneyL(t.ordered - t.received)} note="placed, not yet delivered" color={C.blue} />
        <Stat label="Received" value={moneyL(t.received)} note="accepted into the store" />
        <Stat label="On the shelf" value={moneyL(t.store)} note="in the store, not yet on a rig" color={C.amber} />
        <Stat label="Owed on reorders" value={moneyL(t.owed)} note="sent back, replacement pending" color={t.owed > 0 ? C.red : C.dim} />
      </Grid>

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px' }}>
        <div style={{ width: 210 }}><Field label="Search"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Order number or supplier" style={iStyle} /></Field></div>
        <div style={{ width: 150 }}><Field label="Status"><select value={status} onChange={e => setStatus(e.target.value as typeof status)} style={{ ...iStyle, cursor: 'pointer' }}>{(['all', 'draft', 'ordered', 'partial', 'received'] as const).map(k => <option key={k} value={k}>{k}</option>)}</select></Field></div>
        <div style={{ width: 185 }}><Field label="Supplier"><select value={sup} onChange={e => setSup(e.target.value)} style={{ ...iStyle, cursor: 'pointer' }}><option value="All">All suppliers</option>{state.suppliers.map(x => <option key={x.id} value={x.name}>{x.name}</option>)}</select></Field></div>
        <div style={{ width: 175 }}><Field label="Project"><select value={proj} onChange={e => setProj(e.target.value)} style={{ ...iStyle, cursor: 'pointer' }}><option value="All">All projects</option>{PROJECTS.map(x => <option key={x} value={x}>{projectCode(x)}</option>)}</select></Field></div>
        <div style={{ flex: 1 }} />
        {(q || status !== 'all' || sup !== 'All' || proj !== 'All') && <Btn size="sm" onClick={() => { setQ(''); setStatus('all'); setSup('All'); setProj('All') }}>Clear filters</Btn>}
        <Btn size="sm" tone="primary" onClick={onCreate}>New order</Btn>
      </div>

      <Card title="Purchase orders" pad={false} subtitle={`${pos.length} of ${state.pos.length}. Everything accepted lands on the store shelf.`}>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead><tr><th style={th}>Order</th><th style={th}>Supplier</th><th style={th}>Project</th><th style={th}>Status</th><th style={th}>Ordered</th><th style={th}>Promised</th><th style={th}>Delivered</th><th style={thR}>Delay</th><th style={thR}>Value</th><th style={thR}>On shelf</th><th style={th} /></tr></thead>
            <tbody>
              {pos.length === 0 && <tr><td colSpan={11}><Empty>Nothing matches those filters.</Empty></td></tr>}
              {pos.map(po => {
                const st = poStatus(po)
                const isOpen = open === po.id
                const lastReceipt = po.receipts.map(r => r.date).sort().pop()
                const delay = lastReceipt && po.promisedDate ? daysBetween(po.promisedDate, lastReceipt) : null
                const late = st !== 'received' && !!po.promisedDate && po.promisedDate < TODAY
                const owed = openReorders(po)
                return (
                  <Fragment key={po.id}>
                    <tr onClick={() => setOpen(isOpen ? null : po.id)} style={{ borderBottom: rowBorder, cursor: 'pointer', background: isOpen ? 'color-mix(in srgb, var(--x-orange) 5%, transparent)' : late ? 'color-mix(in srgb, var(--x-red) 5%, transparent)' : undefined }}>
                      <td style={{ ...td, color: C.text, fontWeight: 700 }}>{po.number}{owed.length > 0 && <span style={{ marginLeft: 7 }}><Tag tone={C.red}>{owed.length} on reorder</Tag></span>}</td>
                      <td style={td}>{po.supplier}</td><td style={tdMono}>{projectCode(po.project)}</td>
                      <td style={td}><Tag tone={PO_TONE[st]}>{st}</Tag></td>
                      <td style={td}>{po.orderedDate ? dayLabel(po.orderedDate) : '—'}</td>
                      <td style={{ ...td, color: late ? C.red : C.muted }}>{po.promisedDate ? dayLabel(po.promisedDate) : '—'}</td>
                      <td style={td}>{lastReceipt ? dayLabel(lastReceipt) : late ? 'overdue' : '—'}</td>
                      <td style={{ ...tdN, color: delay == null ? C.dim : delay > 0 ? C.red : C.green, fontWeight: 700 }}>{delay == null ? '—' : delay > 0 ? `+${delay}d` : `${delay}d`}</td>
                      <td style={tdN}>{money(poValue(po))}</td>
                      <td style={{ ...tdN, color: poStoreValue(po) > 0 ? C.amber : C.dim }}>{poStoreValue(po) > 0 ? money(poStoreValue(po)) : '—'}</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                          {st === 'draft' && <Btn size="sm" tone="primary" onClick={() => onEdit(po)}>Open draft</Btn>}
                          {poHasSomethingToReceive(po) && <Btn size="sm" tone="primary" onClick={() => onReceive(po)}>Receive</Btn>}
                          {poHasSomethingToReorder(po) && <Btn size="sm" tone="danger" onClick={() => onRaiseReorder(po)}>Reorder</Btn>}
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr style={{ borderBottom: rowBorder, background: 'color-mix(in srgb, var(--x-orange) 3%, transparent)' }}>
                        <td colSpan={11} style={{ padding: '16px 18px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: 24 }}>
                            <div>
                              <SubHead tone={C.orange}>Lines</SubHead>
                              <table style={tableStyle}><thead><tr><th style={th}>Part</th><th style={thR}>Ordered</th><th style={thR}>Accepted</th><th style={thR}>Faulty</th><th style={thR}>On shelf</th><th style={thR}>Value</th></tr></thead>
                                <tbody>{po.lines.map(l => (<tr key={l.itemId} style={{ borderBottom: rowBorder }}><td style={{ ...td, color: C.text, whiteSpace: 'normal' }}>{nameOf(l.itemId)}</td><td style={tdN}>{l.qty}</td><td style={{ ...tdN, color: C.green }}>{qtyReceived(po, l.itemId)}</td><td style={{ ...tdN, color: qtyFaulty(po, l.itemId) > 0 ? C.red : C.dim }}>{qtyFaulty(po, l.itemId) || '—'}</td><td style={{ ...tdN, color: qtyInStore(po, l.itemId) > 0 ? C.amber : C.dim }}>{qtyInStore(po, l.itemId)}</td><td style={tdN}>{money(l.qty * l.rate)}</td></tr>))}</tbody>
                              </table>
                            </div>
                            <div>
                              <SubHead tone={C.blue}>History</SubHead>
                              {po.receipts.length === 0 && po.reorders.length === 0 && po.issues.length === 0 ? <Empty>Placed, nothing delivered yet.</Empty> : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                  {po.receipts.map(r => (<div key={r.id} style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.6 }}><Tag tone={C.blue}>received</Tag>{' '}<span style={{ color: C.text }}>{fullDate(r.date)}</span>{' — '}{r.lines.map(l => `${l.accepted} × ${nameOf(l.itemId)}${l.damaged ? ` (+${l.damaged} damaged)` : ''}`).join(', ')}{r.delayReason && <span style={{ color: C.red }}> · {r.delayReason}</span>}</div>))}
                                  {po.reorders.map(r => (<div key={r.id} style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.6 }}><Tag tone={r.receipt ? C.amber : C.red}>reorder r{r.round}</Tag>{' '}<span style={{ color: C.text }}>{fullDate(r.raisedDate)}</span>{' — '}{r.qty} × {nameOf(r.itemId)} · {r.reason}{r.receipt && <span style={{ color: r.receipt.accepted > 0 ? C.green : C.red }}>{' · '}{fullDate(r.receipt.date)}: {r.receipt.accepted} accepted{r.receipt.damaged + r.receipt.rejected > 0 ? `, ${r.receipt.damaged + r.receipt.rejected} faulty again` : ''}</span>}</div>))}
                                  {po.issues.map(i => (<div key={i.id} style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.6 }}><Tag tone={C.green}>issued to rig</Tag>{' '}<span style={{ color: C.text }}>{fullDate(i.date)}</span>{' → '}<span style={{ fontFamily: 'ui-monospace, monospace' }}>{i.rig}</span>{' · '}{projectCode(i.project ?? po.project)}{' — '}{i.lines.map(l => `${l.qty} × ${nameOf(l.itemId)}`).join(', ')}</div>))}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <ReordersTable onReceiveReorder={onReceiveReorder} />
      <SupplierTable />
    </div>
  )
}

function ReordersTable({ onReceiveReorder }: { onReceiveReorder: (po: PurchaseOrder, r: Reorder) => void }) {
  const { state, updateReorder } = useInventory()
  const [showClosed, setShowClosed] = useState(false)
  const nameOf = (id: string) => state.catalogue.find(p => p.id === id)?.name ?? id
  const rows = state.pos.flatMap(po => po.reorders.map(r => ({ po, r }))).filter(({ r }) => showClosed || (!r.receipt && r.status !== 'credited')).sort((a, b) => b.r.raisedDate.localeCompare(a.r.raisedDate))
  const open = state.pos.flatMap(po => openReorders(po).map(r => ({ po, r })))
  const owed = open.reduce((s, { po, r }) => s + r.qty * rateOfLine(po, r.itemId), 0)
  return (
    <Card title="Reorders" pad={false} subtitle={`${open.length} open, ${money(owed)} owed by suppliers`} accent={open.length ? C.red : undefined} right={<label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}><input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} /><span style={{ fontSize: 11.5, color: C.muted }}>Show settled</span></label>}>
      {rows.length === 0 ? <Empty>No reorders. Nothing has come in faulty.</Empty> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead><tr><th style={th}>Raised</th><th style={th}>Order</th><th style={th}>Part</th><th style={thR}>Qty</th><th style={thR}>Round</th><th style={th}>Reason</th><th style={th}>Due</th><th style={th}>Status</th><th style={th}>Outcome</th><th style={thR}>Value</th><th style={th} /></tr></thead>
            <tbody>
              {rows.map(({ po, r }) => {
                const isOpen = !r.receipt && r.status !== 'credited'
                const overdue = isOpen && !!r.promisedDate && r.promisedDate < TODAY
                const failedAgain = r.receipt && (r.receipt.damaged + r.receipt.rejected) > 0
                return (
                  <tr key={r.id} style={{ borderBottom: rowBorder, background: overdue ? 'color-mix(in srgb, var(--x-red) 6%, transparent)' : failedAgain ? 'color-mix(in srgb, var(--x-amber) 5%, transparent)' : undefined, opacity: isOpen ? 1 : 0.75 }}>
                    <td style={{ ...td, color: C.text }}>{dayLabel(r.raisedDate)}</td>
                    <td style={{ ...td, color: C.text, fontWeight: 700 }}>{po.number}</td>
                    <td style={{ ...td, color: C.text, whiteSpace: 'normal', maxWidth: 200 }}>{nameOf(r.itemId)}</td>
                    <td style={tdN}>{r.qty}</td>
                    <td style={{ ...tdN, color: r.round > 1 ? C.red : C.faint, fontWeight: r.round > 1 ? 800 : 400 }}>{r.round}</td>
                    <td style={{ ...td, whiteSpace: 'normal', maxWidth: 200, color: C.faint }}>{r.reason}</td>
                    <td style={{ ...td, color: overdue ? C.red : C.muted }}>{r.promisedDate ? dayLabel(r.promisedDate) : isOpen ? 'no date' : '—'}</td>
                    <td style={td}>{isOpen ? (<select value={r.status} onChange={e => updateReorder(po.id, { ...r, status: e.target.value as ReorderStatus })} style={{ ...iStyle, width: 168, cursor: 'pointer', fontSize: 11.5 }}>{REORDER_OPEN_STATUSES.map(k => <option key={k} value={k}>{REORDER_STATUS_LABEL[k]}</option>)}<option value="credited">{REORDER_STATUS_LABEL.credited}</option></select>) : <Tag tone={REORDER_TONE[r.status]}>{REORDER_STATUS_LABEL[r.status]}</Tag>}</td>
                    <td style={{ ...td, whiteSpace: 'normal', maxWidth: 200 }}>{r.receipt ? <span style={{ color: failedAgain ? C.red : C.green }}>{fullDate(r.receipt.date)} · {r.receipt.accepted} accepted{failedAgain ? `, ${r.receipt.damaged + r.receipt.rejected} faulty again` : ''}</span> : r.status === 'credited' ? <span style={{ color: C.blue }}>Settled as credit</span> : <span style={{ color: C.dim }}>Waiting</span>}</td>
                    <td style={tdN}>{money(r.qty * rateOfLine(po, r.itemId))}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{isOpen && <Btn size="sm" tone="primary" onClick={() => onReceiveReorder(po, r)}>Receive replacement</Btn>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function Stars({ n }: { n?: number }) {
  if (!n) return <span style={{ color: C.dim, fontSize: 11 }}>not rated</span>
  return <span style={{ letterSpacing: 1 }}>{[1,2,3,4,5].map(i => <span key={i} style={{ color: i <= n ? C.amber : C.dim, fontSize: 12 }}>★</span>)}</span>
}

function SupplierTable() {
  const { state, saveSupplier } = useInventory()
  const [editing, setEditing] = useState<Supplier | null>(null)
  const rows = state.suppliers.map(s => ({ s, p: supplierPerformance(state.pos, state.suppliers, s.name) })).sort((a, b) => (a.p.avgDelay ?? 99) - (b.p.avgDelay ?? 99))
  const blank = (): Supplier => ({ id: uid('s'), name: '', contact: '', phone: '', quotedLeadDays: 14 })
  return (
    <>
      <Card title="Suppliers" pad={false} subtitle="Lead time and faults measured from what actually happened" right={<Btn size="sm" tone="primary" onClick={() => setEditing(blank())}>Add supplier</Btn>}>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead><tr><th style={th}>Supplier</th><th style={th}>Contact</th><th style={thR}>Orders</th><th style={thR}>Value</th><th style={thR}>Quoted</th><th style={thR}>Actual</th><th style={thR}>Delay</th><th style={thR}>On time</th><th style={thR}>Faulty</th><th style={thR}>Open reorders</th><th style={th}>Rating</th><th style={th} /></tr></thead>
            <tbody>
              {rows.map(({ s: sup, p: r }) => (
                <tr key={sup.id} style={{ borderBottom: rowBorder }}>
                  <td style={{ ...td, color: C.text, fontWeight: 700 }}>{sup.name}</td><td style={{ ...td, color: C.faint }}>{sup.contact}</td>
                  <td style={tdN}>{r.orders || '—'}</td><td style={tdN}>{r.value ? money(r.value) : '—'}</td>
                  <td style={{ ...tdN, color: C.faint }}>{r.quotedLead != null ? `${r.quotedLead}d` : '—'}</td>
                  <td style={tdN}>{r.actualLead != null ? `${Math.round(r.actualLead)}d` : '—'}</td>
                  <td style={{ ...tdN, fontWeight: 700, color: r.avgDelay == null ? C.dim : r.avgDelay > 0 ? C.red : C.green }}>{r.avgDelay == null ? '—' : r.avgDelay > 0 ? `+${Math.round(r.avgDelay)}d` : `${Math.round(r.avgDelay)}d`}</td>
                  <td style={{ ...tdN, color: r.onTimePct == null ? C.dim : r.onTimePct >= 80 ? C.green : r.onTimePct >= 50 ? C.amber : C.red }}>{r.onTimePct == null ? '—' : `${Math.round(r.onTimePct)}%`}</td>
                  <td style={{ ...tdN, color: r.faultyPct ? C.red : C.dim }}>{r.faultyPct ? `${r.faultyPct.toFixed(1)}%` : '—'}</td>
                  <td style={{ ...tdN, color: r.openReorders ? C.red : C.dim }}>{r.openReorders || '—'}</td>
                  <td style={td}><Stars n={sup.rating} /></td>
                  <td style={{ ...td, textAlign: 'right' }}><Btn size="sm" onClick={() => setEditing(sup)}>Edit</Btn></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {editing && (
        <Modal title={editing.name || 'New supplier'} width={500} onClose={() => setEditing(null)} footer={<><Btn onClick={() => setEditing(null)}>Cancel</Btn><Btn tone="primary" disabled={!editing.name.trim()} onClick={() => { saveSupplier(editing); setEditing(null) }}>Save supplier</Btn></>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Grid cols={2}>
              <Field label="Name"><input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} style={iStyle} /></Field>
              <Field label="Contact"><input value={editing.contact} onChange={e => setEditing({ ...editing, contact: e.target.value })} style={iStyle} /></Field>
              <Field label="Phone"><input value={editing.phone} onChange={e => setEditing({ ...editing, phone: e.target.value })} style={iStyle} /></Field>
              <Field label="Quoted lead time" hint="days"><input type="number" value={editing.quotedLeadDays} onChange={e => setEditing({ ...editing, quotedLeadDays: parseFloat(e.target.value) || 0 })} style={numStyle} /></Field>
            </Grid>
            <Field label="Your rating"><div style={{ display: 'flex', gap: 6 }}>{[1,2,3,4,5].map(n => (<button key={n} onClick={() => setEditing({ ...editing, rating: n })} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, padding: 0, color: (editing.rating ?? 0) >= n ? C.amber : C.dim }}>★</button>))}{editing.rating != null && <button onClick={() => setEditing({ ...editing, rating: undefined })} style={{ background: 'none', border: 'none', color: C.faint, fontSize: 11, cursor: 'pointer', marginLeft: 6, fontFamily: 'inherit' }}>clear</button>}</div></Field>
            <Field label="Note"><input value={editing.ratingNote ?? ''} onChange={e => setEditing({ ...editing, ratingNote: e.target.value })} placeholder="e.g. cheap but packaging is poor" style={iStyle} /></Field>
          </div>
        </Modal>
      )}
    </>
  )
}

/* ==========================================================================
 * STORE
 *
 * The shelf, then what each rig is carrying. Two ways onto a rig: the
 * starting kit it needs before it can turn, and replacements issued since.
 * Both together decide the rig's tooling cost per metre.
 * ========================================================================== */

function StoreTab() {
  const { state, addIssue, addRigKit, addStoreStock } = useInventory()
  const cost = useOwnLogs()
  const nameOf = (id: string) => state.catalogue.find(p => p.id === id)?.name ?? id

  const [project, setProject]   = useState(PROJECTS.find(isLiveProject) ?? PROJECTS[0])
  const [addingStock, setAddingStock] = useState(false)
  const [addingKit, setAddingKit]     = useState(false)
  const [issuingLine, setIssuingLine] = useState<StockLine | null>(null)

  const poStock = useMemo(() => stockInStore(state.pos, TODAY).filter(l => l.project === project), [state.pos, project])

  const shelfRows = useMemo(() => {
    const rows: { key: string; source: 'existing' | 'po'; itemId: string; qty: number; rate: number; value: number; ref: string; ageDays: number }[] = []
    state.storeStock.forEach(e => e.lines.forEach((l, k) => rows.push({
      key: `ss_${e.id}_${k}`, source: 'existing', itemId: l.itemId,
      qty: l.qty, rate: l.rate, value: l.qty * l.rate, ref: 'Existing stock',
      ageDays: daysBetween(e.date, TODAY),
    })))
    poStock.forEach(l => rows.push({
      key: l.key, source: 'po', itemId: l.itemId, qty: l.qty, rate: l.rate,
      value: l.value, ref: l.poNumber, ageDays: l.ageDays,
    }))
    return rows.sort((a, b) => b.value - a.value)
  }, [state.storeStock, poStock])

  const shelfValue = shelfRows.reduce((s, r) => s + r.value, 0)

  const partsUsedByRig = useMemo(() => {
    const out: Record<string, { itemId: string; qty: number }[]> = {}
    cost.shiftLogs.filter(l => l.project === project).forEach(log => {
      if (!out[log.rig]) out[log.rig] = []
      ;(log.partsUsed ?? []).forEach(u => {
        const e = out[log.rig].find(x => x.itemId === u.itemId)
        if (e) e.qty += u.qty ?? 0
        else out[log.rig].push({ itemId: u.itemId, qty: u.qty ?? 0 })
      })
    })
    // A recount that came up short: lost or used without being logged.
    Object.keys(out).forEach(rig => countLosses(state.rigCounts ?? [], rig, project).forEach(l => out[rig].push(l)))
    return out
  }, [cost.shiftLogs, project, state.rigCounts])

  const rigs = useMemo(() =>
    RIGS.map(rig => {
      const lines   = rigHoldings(state.pos, state.catalogue, rig, project, partsUsedByRig[rig] ?? [], state.rigKit)
      const metres  = cost.shiftLogs.filter(l => l.rig === rig && l.project === project).reduce((s, l) => s + l.metresDrilled, 0)
      const tooling = toolingRatesFor(state.pos, state.rigKit, state.catalogue, rig, project)
      return { rig, lines, tooling, total: lines.reduce((s, l) => s + l.totalValue, 0), metres }
    }).filter(r => r.lines.length > 0),
  [state.pos, state.catalogue, state.rigKit, project, partsUsedByRig, cost.shiftLogs])

  const issueFromShelf = (date: string, rig: string, by: string, picks: { poId: string; itemId: string; qty: number }[]) => {
    const byPO: Record<string, { itemId: string; qty: number }[]> = {}
    picks.forEach(p => { (byPO[p.poId] ??= []).push({ itemId: p.itemId, qty: p.qty }) })
    Object.entries(byPO).forEach(([poId, lines]) => addIssue(poId, { date, project, rig, issuedBy: by, lines }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px' }}>
        <Chain label="Project">
          {PROJECTS.map(p => <Chip key={p} on={project === p} label={projectCode(p)} onClick={() => setProject(p)} />)}
        </Chain>
      </div>

      <RigCountCard />

      {/* ── The shelf ── */}
      <Card title="On the shelf" pad={false}
        subtitle={`${shelfRows.length} lines, ${money(shelfValue)}. Nothing here is costing a hole anything yet.`}
        right={
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn size="sm" onClick={() => setAddingStock(true)}>Add existing stock</Btn>
          </div>
        }>
        {shelfRows.length === 0 ? (
          <div style={{ padding: 36, textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: C.muted, fontWeight: 600, marginBottom: 8 }}>The shelf is empty for {projectCode(project)}.</p>
            <p style={{ fontSize: 12, color: C.faint, lineHeight: 1.7, maxWidth: 460, margin: '0 auto 20px' }}>
              Parts already on a rig are counted with <strong style={{ color: C.orange }}>First count</strong> above.
              Parts already sitting in the store go on with <strong style={{ color: C.text }}>Add existing stock</strong>.
              Anything received against a purchase order appears here on its own.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <Btn onClick={() => setAddingStock(true)}>Add existing stock</Btn>
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead><tr>
                <th style={th}>Part number</th><th style={th}>Item</th>
                <th style={th}>Category</th><th style={th}>Used in</th>
                <th style={th}>Came from</th>
                <th style={thR}>Qty</th><th style={thR}>Rate</th><th style={thR}>Value</th>
                <th style={thR}>Waiting</th><th style={th} />
              </tr></thead>
              <tbody>
                {shelfRows.map(r => {
                  const part = state.catalogue.find(p => p.id === r.itemId)
                  const old  = r.ageDays >= state.alerts.idleDays
                  return (
                    <tr key={r.key} style={{ borderBottom: rowBorder, background: old ? 'color-mix(in srgb, var(--x-amber) 4%, transparent)' : undefined }}>
                      <td style={{ ...tdMono, color: C.text, fontWeight: 700 }}>{part?.partNumber || '—'}</td>
                      <td style={{ ...td, color: C.text, fontWeight: 600, whiteSpace: 'normal', maxWidth: 200 }}>{nameOf(r.itemId)}</td>
                      <td style={td}>{part ? <Tag tone={C.dim}>{part.category}</Tag> : '—'}</td>
                      <td style={{ ...td, color: C.muted }}>{part ? FORMATION_USE_LABEL[formationUse(part)] : '—'}</td>
                      <td style={td}>
                        {r.source === 'existing'
                          ? <Tag tone={C.teal}>Existing stock</Tag>
                          : <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>{r.ref}</span>}
                      </td>
                      <td style={{ ...tdN, color: C.text, fontWeight: 700 }}>{r.qty}</td>
                      <td style={tdN}>{money(r.rate)}</td>
                      <td style={{ ...tdN, color: C.amber, fontWeight: 700 }}>{money(r.value)}</td>
                      <td style={{ ...tdN, color: old ? C.red : C.faint, fontWeight: old ? 700 : 400 }}>{r.ageDays}d</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {r.source === 'po' && isLiveProject(project) && (() => {
                          const sl = poStock.find(l => l.key === r.key)
                          return sl ? <Btn size="sm" tone="primary" onClick={() => setIssuingLine(sl)}>Issue to rig</Btn> : null
                        })()}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: `2px solid ${C.border}`, background: 'rgba(var(--x-ov),0.02)' }}>
                  <td style={{ ...td, fontWeight: 800, color: C.text }} colSpan={7}>Total on the shelf</td>
                  <td style={{ ...tdN, fontWeight: 900, color: C.amber }}>{money(shelfValue)}</td>
                  <td style={td} colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {/* ── On the rigs ── */}
      {rigs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
            On the rigs
            <span style={{ fontSize: 11, color: C.faint, fontWeight: 400, marginLeft: 10 }}>
              {projectCode(project)}: what was counted on the rig, plus everything issued since
            </span>
          </div>
          {rigs.map(({ rig, lines, tooling, total, metres }) => {
            /* Never sum the Cost/m column. A metre of soft ground does not
             * consume an impregnated bit and a metre of granite does not
             * consume surface casing, so adding every part's rate together
             * produces a figure no metre is ever charged. What a rig costs per
             * metre is a range across the ground it is equipped for. */
            // A rig carrying HQ and NQ parts has a rate for each size: never the two added together.
            const sizes = Array.from(new Set(tooling.lines.map(l => l.size).filter(Boolean))) as string[]
            const rateAt = (f: Formation) => sizes.length ? sizes.map(z => ({ z, r: toolingFor(tooling, f, z) })) : [{ z: '', r: tooling.byFormation[f] }]
            const charged = FORMATIONS.flatMap(f => rateAt(f).map(x => x.r)).filter(x => x > 0)
            const lowRate = charged.length ? Math.min(...charged) : 0
            const highRate = charged.length ? Math.max(...charged) : 0
            const rateRange = charged.length === 0 ? '—'
              : Math.round(lowRate) === Math.round(highRate) ? perMetre(highRate)
              : `${perMetre(lowRate)} – ${perMetre(highRate)}`
            const spent = metres > 0 ? total / metres : 0
            return (
              <Card key={rig} pad={false} title={rig}
                subtitle={`${money(total)} of parts on this rig, ${metres.toLocaleString('en-US')} m drilled`}
                accent={C.blue}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${C.border}` }}>
                  <Stat label="Counted on the rig" value={moneyL(lines.reduce((s, l) => s + l.kitValue, 0))} color={C.purple} />
                  <Stat label="Issued since" value={moneyL(lines.reduce((s, l) => s + l.issuedValue, 0))} color={C.amber} />
                  <Stat label="Tooling cost" value={rateRange} color={C.orange} note="per metre, soft ground to hardest" />
                  <Stat label="Spent per metre" value={metres > 0 ? perMetre(spent) : '—'} color={C.muted} note="cash out ÷ metres so far" />
                </div>

                {/* Per-formation rates: the figures finance actually charges. */}
                <div style={{ display: 'flex', gap: 8, padding: '11px 16px', borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Per metre of</span>
                  {FORMATIONS.map(f => (
                    <span key={f} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 7, padding: '4px 10px', borderRadius: 7, background: `${hexA(FORMATION_TONE[f], 0x14)}`, border: `1px solid ${hexA(FORMATION_TONE[f], 0x33)}` }}>
                      <span style={{ fontSize: 11, color: FORMATION_TONE[f], fontWeight: 700 }}>{f}</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: C.text, fontFamily: 'ui-monospace, monospace' }}>{rateAt(f).map(x => `${x.z ? `${x.z} ` : ''}${perMetre(x.r)}`).join(' · ')}</span>
                    </span>
                  ))}
                  {tooling.fellBack.length > 0 && (
                    <span style={{ fontSize: 11, color: C.amber }}>
                      {tooling.fellBack.join(', ')} has no parts tagged for it, so it carries the blended rate. Fix the Used in tag on the catalogue.
                    </span>
                  )}
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={tableStyle}>
                    <thead><tr>
                      <th style={th}>Part number</th><th style={th}>Item</th>
                      <th style={th}>Used in</th>
                      <th style={thR}>Life</th>
                      <th style={thR}>Counted</th>
                      <th style={thR}>Issued</th>
                      <th style={thR}>Total qty</th>
                      <th style={thR}>Scrapped</th>
                      <th style={thR}>Rate paid</th>
                      <th style={thR}>Value</th>
                      <th style={thR}>Cost / m</th>
                    </tr></thead>
                    <tbody>
                      {lines.sort((a, b) => b.costPerMetre - a.costPerMetre).map(l => (
                        <tr key={l.itemId} style={{ borderBottom: rowBorder }}>
                          <td style={{ ...tdMono, color: C.text, fontWeight: 700 }}>{l.partNumber || '—'}</td>
                          <td style={{ ...td, color: C.text, fontWeight: 600, whiteSpace: 'normal', maxWidth: 190 }}>{l.name}</td>
                          <td style={{ ...td, color: C.muted }}>{FORMATION_USE_LABEL[l.use]}{l.size ? ` · ${l.size} only` : ''}</td>
                          <td style={{ ...tdN, color: C.faint }}>{l.lifeMetres.toLocaleString('en-US')} m</td>
                          <td style={{ ...tdN, color: l.kitQty > 0 ? C.purple : C.dim }}>{l.kitQty > 0 ? l.kitQty : '—'}</td>
                          <td style={{ ...tdN, color: l.issuedQty > 0 ? C.amber : C.dim, fontWeight: l.issuedQty > 0 ? 700 : 400 }}>{l.issuedQty > 0 ? l.issuedQty : '—'}</td>
                          <td style={{ ...tdN, color: C.text, fontWeight: 700 }}>{l.totalQty}</td>
                          <td style={{ ...tdN, color: l.totalUsed > 0 ? C.red : C.dim }}>{l.totalUsed > 0 ? l.totalUsed : '—'}</td>
                          <td style={tdN}>{money(l.avgRate)}</td>
                          <td style={{ ...tdN, color: C.amber, fontWeight: 700 }}>{money(l.totalValue)}</td>
                          <td style={{ ...tdN, color: C.orange, fontWeight: 700 }}>{perMetre(l.costPerMetre)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: `2px solid ${C.border}`, background: 'rgba(var(--x-ov),0.02)' }}>
                        <td style={{ ...td, fontWeight: 800, color: C.text }} colSpan={9}>
                          Every part on this rig
                          <span style={{ fontWeight: 400, color: C.faint, marginLeft: 8 }}>
                            rates do not add up — each metre is charged only the parts that work in its ground
                          </span>
                        </td>
                        <td style={{ ...tdN, fontWeight: 900, color: C.amber }}>{money(total)}</td>
                        <td style={{ ...tdN, fontWeight: 900, color: C.orange, fontSize: 11 }}>{rateRange}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {addingStock && (
        <PickPartsModal
          title="Add existing stock"
          subtitle="Parts already in the store before the system started. No project, no rig — they wait on the shelf."
          tone={C.teal}
          note="These land on the shelf tagged as Existing stock. Issue them to a rig whenever one needs them."
          qtyLabel="Qty in store"
          confirm={n => `Add ${n} part${n === 1 ? '' : 's'} to the shelf`}
          onSave={({ date, by, lines }) => { addStoreStock({ date, addedBy: by, lines }); setAddingStock(false) }}
          onClose={() => setAddingStock(false)} />
      )}
      {addingKit && (
        <PickPartsModal
          title="Assign starting kit"
          subtitle={`What a rig needs on it before it can turn — ${projectCode(project)}`}
          tone={C.purple}
          note="Date this on or before the rig's first shift. A day drilled before its kit was assigned carries no tooling cost and reads free."
          qtyLabel="Qty on the rig"
          withRig
          confirm={(n, rig) => `Assign ${n} part${n === 1 ? '' : 's'} to ${rig}`}
          onSave={({ date, by, rig, lines }) => { addRigKit({ date, project, rig: rig!, addedBy: by, lines }); setAddingKit(false) }}
          onClose={() => setAddingKit(false)} />
      )}
      {issuingLine && (
        <IssueModal project={project} prefill={issuingLine}
          onSave={issueFromShelf} onClose={() => setIssuingLine(null)} />
      )}
    </div>
  )
}

/* One picker serves both the starting kit and existing stock — the only
 * differences are the words and whether a rig is named. */
function PickPartsModal({ title, subtitle, tone, note, qtyLabel, withRig, confirm, onSave, onClose }: {
  title: string; subtitle: string; tone: string; note: string; qtyLabel: string
  withRig?: boolean
  confirm: (n: number, rig: string) => string
  onSave: (v: { date: string; by: string; rig?: string; lines: { itemId: string; qty: number; rate: number }[] }) => void
  onClose: () => void
}) {
  const { state } = useInventory()
  const [rig,  setRig]  = useState(RIGS[0])
  const [date, setDate] = useState(TODAY)
  const [by,   setBy]   = useState('Store')
  const [rows, setRows] = useState<{ id: string; itemId: string; qty: string; rate: string }[]>([])

  const updateRow = (id: string, patch: Partial<typeof rows[0]>) =>
    setRows(r => r.map(x => x.id === id ? { ...x, ...patch } : x))
  const pickQty = (itemId: string, val: string) => {
    const part = state.catalogue.find(p => p.id === itemId)
    if (!val || parseFloat(val) === 0) {
      setRows(r => r.filter(x => x.itemId !== itemId))
    } else {
      const existing = rows.find(x => x.itemId === itemId)
      if (existing) updateRow(existing.id, { qty: val })
      else setRows(r => [...r, { id: rowId(), itemId, qty: val, rate: String(part?.rate ?? 0) }])
    }
  }
  const pickRate = (itemId: string, val: string) => {
    const existing = rows.find(x => x.itemId === itemId)
    if (existing) updateRow(existing.id, { rate: val })
  }

  const valid = rows.filter(r => r.itemId && parseFloat(r.qty) > 0)
  const total = valid.reduce((s, r) => s + (parseFloat(r.qty) || 0) * (parseFloat(r.rate) || 0), 0)
  const byCategory = CATEGORIES.map(cat => ({
    cat, parts: state.catalogue.filter(p => p.active && p.category === cat),
  })).filter(g => g.parts.length > 0)

  return (
    <Modal title={title} subtitle={subtitle} width={880} onClose={onClose}
      footer={<>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn tone="primary" disabled={valid.length === 0}
          onClick={() => onSave({
            date, by, rig: withRig ? rig : undefined,
            lines: valid.map(r => ({ itemId: r.itemId, qty: parseFloat(r.qty), rate: parseFloat(r.rate) || 0 })),
          })}>
          {confirm(valid.length, rig)}
        </Btn>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Grid cols={withRig ? 3 : 2}>
          {withRig && (
            <Field label="Rig">
              <select value={rig} onChange={e => setRig(e.target.value)} style={{ ...iStyle, cursor: 'pointer', fontFamily: 'ui-monospace, monospace' }}>
                {RIGS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
          )}
          <Field label="Date recorded" hint={withRig ? 'Tooling costs start from this date' : undefined}>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...iStyle }} />
          </Field>
          <Field label="Recorded by"><input value={by} onChange={e => setBy(e.target.value)} style={iStyle} /></Field>
        </Grid>
        <Note tone={tone}>{note}</Note>
        <div style={{ maxHeight: 400, overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: 10 }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={th}>Part number</th><th style={th}>Item</th>
                <th style={th}>Used in</th>
                <th style={thR}>Life</th>
                <th style={thR}>Catalogue rate</th>
                <th style={thR}>{qtyLabel}</th>
                <th style={thR}>Rate paid (SAR)</th>
                <th style={thR}>Cost / m</th>
              </tr>
            </thead>
            <tbody>
              {byCategory.map(({ cat, parts }) => (
                <Fragment key={cat}>
                  <tr style={{ background: 'rgba(var(--x-ov),0.03)' }}>
                    <td colSpan={8} style={{ ...td, fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '6px 12px' }}>{cat}</td>
                  </tr>
                  {parts.map(p => {
                    const row  = rows.find(r => r.itemId === p.id)
                    const qty  = parseFloat(row?.qty  || '0') || 0
                    const rate = parseFloat(row?.rate || '0') || p.rate
                    const on   = qty > 0
                    return (
                      <tr key={p.id} style={{ borderBottom: rowBorder, background: on ? `${hexA(tone, 0x12)}` : undefined }}>
                        <td style={{ ...tdMono, color: C.text, fontWeight: 700 }}>{p.partNumber}</td>
                        <td style={{ ...td, color: on ? C.text : C.muted, fontWeight: on ? 700 : 400, whiteSpace: 'normal', maxWidth: 190 }}>{p.name}</td>
                        <td style={{ ...td, color: C.muted }}>{useLabel(p)}</td>
                        <td style={{ ...tdN, color: C.faint }}>{p.lifeMetres.toLocaleString('en-US')} m</td>
                        <td style={tdN}>{money(p.rate)}</td>
                        <td style={{ padding: '4px 8px', width: 92 }}>
                          <input type="number" min={0} placeholder="0" value={row?.qty ?? ''}
                            onChange={e => pickQty(p.id, e.target.value)}
                            style={{ ...numStyle, color: on ? tone : C.muted }} />
                        </td>
                        <td style={{ padding: '4px 8px', width: 112 }}>
                          <input type="number" min={0} placeholder={String(p.rate)} value={row?.rate ?? ''} disabled={!on}
                            onChange={e => pickRate(p.id, e.target.value)}
                            style={{ ...numStyle, opacity: on ? 1 : 0.35 }} />
                        </td>
                        <td style={{ ...tdN, color: on ? C.orange : C.dim, fontWeight: on ? 700 : 400 }}>
                          {on && p.lifeMetres > 0 ? perMetre(rate / p.lifeMetres) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {valid.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: 16 }}>
            <span style={{ fontSize: 11, color: C.faint }}>{valid.length} part{valid.length === 1 ? '' : 's'} selected</span>
            <span style={{ fontSize: 15, fontWeight: 900, color: tone, fontFamily: 'ui-monospace, monospace' }}>{money(total)}</span>
          </div>
        )}
      </div>
    </Modal>
  )
}

function IssueModal({ project, prefill, onSave, onClose }: {
  project: string; prefill?: StockLine
  onSave: (date: string, rig: string, by: string, picks: { poId: string; itemId: string; qty: number }[]) => void
  onClose: () => void
}) {
  const { state } = useInventory()
  const nameOf = (id: string) => state.catalogue.find(p => p.id === id)?.name ?? id
  const stock  = stockInStore(state.pos, TODAY).filter(l => l.project === project)
  const [rig,  setRig]  = useState(RIGS[0])
  const [date, setDate] = useState(TODAY)
  const [by,   setBy]   = useState('Store')
  const [qty,  setQty]  = useState<Record<string, number>>(prefill ? { [prefill.key]: prefill.qty } : {})
  const picks = stock.map(l => ({ line: l, qty: Math.min(l.qty, qty[l.key] ?? 0) })).filter(x => x.qty > 0)
  const value = picks.reduce((s, p) => s + p.qty * p.line.rate, 0)
  return (
    <Modal title="Issue parts to a rig" subtitle={`From the shelf — ${projectCode(project)}`} width={760} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn tone="primary" disabled={picks.length === 0}
        onClick={() => { onSave(date, rig, by, picks.map(p => ({ poId: p.line.poId, itemId: p.line.itemId, qty: p.qty }))); onClose() }}>
        Issue {picks.reduce((s, p) => s + p.qty, 0)} parts to {rig}
      </Btn></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Grid cols={3}>
          <Field label="Rig"><select value={rig} onChange={e => setRig(e.target.value)} style={{ ...iStyle, cursor: 'pointer', fontFamily: 'ui-monospace, monospace' }}>{RIGS.map(r => <option key={r} value={r}>{r}</option>)}</select></Field>
          <Field label="Issued on" hint="This date changes the rig's tooling cost from here on"><input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...iStyle }} /></Field>
          <Field label="Issued by"><input value={by} onChange={e => setBy(e.target.value)} style={iStyle} /></Field>
        </Grid>
        {stock.length === 0 ? <Empty>Nothing on the shelf from purchase orders for {projectCode(project)}.</Empty> : (
          <table style={tableStyle}>
            <thead><tr>
              <th style={th}>Part</th><th style={th}>From order</th>
              <th style={thR}>On shelf</th><th style={thR}>Issuing</th><th style={thR}>Value</th>
            </tr></thead>
            <tbody>{stock.map(l => { const n = qty[l.key] ?? 0; return (
              <tr key={l.key} style={{ borderBottom: rowBorder, background: n > 0 ? 'color-mix(in srgb, var(--x-orange) 6%, transparent)' : undefined }}>
                <td style={{ ...td, color: C.text, whiteSpace: 'normal' }}>{nameOf(l.itemId)}</td>
                <td style={td}>{l.poNumber}</td>
                <td style={{ ...tdN, color: C.amber }}>{l.qty}</td>
                <td style={{ padding: '5px 10px', width: 110 }}>
                  <input type="number" min={0} max={l.qty} value={n}
                    onChange={e => setQty(s => ({ ...s, [l.key]: Math.min(l.qty, Math.max(0, parseFloat(e.target.value) || 0)) }))}
                    style={{ ...numStyle, color: n > 0 ? C.orange : C.muted }} />
                </td>
                <td style={{ ...tdN, color: n > 0 ? C.text : C.dim }}>{n > 0 ? money(n * l.rate) : '—'}</td>
              </tr>
            )})}</tbody>
            <tfoot><tr style={{ borderTop: `2px solid ${C.border}`, background: 'rgba(var(--x-ov),0.02)' }}>
              <td style={{ ...td, fontWeight: 800, color: C.text }} colSpan={4}>Total leaving the shelf</td>
              <td style={{ ...tdN, fontWeight: 900, color: C.orange }}>{money(value)}</td>
            </tr></tfoot>
          </table>
        )}
        <Note tone={C.blue}>Once issued, these parts join the rig below and start carrying cost from the issue date.</Note>
      </div>
    </Modal>
  )
}

/* ==========================================================================
 * INSIGHTS
 *
 * Not a display of the data. Each panel exists because somebody has to make
 * a decision and currently has nothing to make it on.
 * ========================================================================== */

function InsightsTab() {
  const { state } = useInventory()
  const cost = useOwnLogs()
  const [project, setProject] = useState(PROJECTS.find(isLiveProject) ?? PROJECTS[0])
  const [rig, setRig] = useState<string | 'All'>('All')

  const facts: ShiftFact[] = useMemo(() =>
    cost.shiftLogs
      .filter(l => l.project === project && (rig === 'All' || l.rig === rig))
      .map(l => ({
        rig: l.rig, project: l.project, date: l.date,
        metres: l.metresDrilled, formation: normFormation(l.formationType), holeSize: l.holeSize,
        used: (l.partsUsed ?? []).map(u => ({ itemId: u.itemId, qty: u.qty ?? 0 })),
      })),
  [cost.shiftLogs, project, rig])

  /* Everything any rig on this project is carrying, so a part that has not
   * worn out yet still appears rather than silently vanishing. */
  const held = useMemo(() => {
    const ids = new Set<string>()
    RIGS.filter(r => rig === 'All' || r === rig).forEach(r =>
      rigHoldings(state.pos, state.catalogue, r, project, [], state.rigKit)
        .forEach(l => ids.add(l.itemId)))
    return Array.from(ids)
  }, [state.pos, state.catalogue, state.rigKit, project, rig])

  const rows = useMemo(() => terrainRows(facts, state.catalogue, held), [facts, state.catalogue, held])

  const tooling = useMemo(() => {
    const r = rig === 'All' ? RIGS[0] : rig
    return toolingRatesFor(state.pos, state.rigKit, state.catalogue, r, project)
  }, [state.pos, state.rigKit, state.catalogue, rig, project])

  const bands = useMemo(() => groundMix(facts, tooling), [facts, tooling])
  const metres = facts.reduce((s, f) => s + f.metres, 0)

  const rigsOnProject = Array.from(new Set(cost.shiftLogs.filter(l => l.project === project).map(l => l.rig))).sort()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px' }}>
        <Chain label="Project">
          {PROJECTS.map(p => <Chip key={p} on={project === p} label={projectCode(p)} onClick={() => { setProject(p); setRig('All') }} />)}
        </Chain>
        <span style={{ width: 1, height: 22, background: C.border }} />
        <Chain label="Rig">
          <Chip on={rig === 'All'} label="All" onClick={() => setRig('All')} />
          {rigsOnProject.map(r => <Chip key={r} on={rig === r} label={r} onClick={() => setRig(r)} />)}
        </Chain>
      </div>

      {metres === 0 ? (
        <Card><Empty>No driller logs for {projectCode(project)} yet.<br />Parts life is measured from the log — once shifts are recorded, the ground starts answering for itself.</Empty></Card>
      ) : (
        <>
          <TerrainPanel rows={rows} metres={metres} />
          <GroundPanel bands={bands} tooling={tooling} rig={rig === 'All' ? RIGS[0] : rig} />
          <SpendPanel rows={rows} />
          <SupplierInsightPanel />
        </>
      )}
    </div>
  )
}

/* The catalogue's life figure is a claim. The log is the evidence. */
function TerrainPanel({ rows, metres }: { rows: TerrainRow[]; metres: number }) {
  const [mode, setMode] = useState<'life' | 'cost'>('life')
  const worn = rows.filter(r => r.totalScrapped > 0)
  const unworn = rows.filter(r => r.totalScrapped === 0)

  if (rows.length === 0) {
    return <Card title="What the ground is doing to your parts">
      <Empty>No parts on a rig for this project yet, so there is nothing to measure life against.</Empty>
    </Card>
  }

  const headline = worn
    .map(r => ({ r, worst: r.worst }))
    .filter(x => x.worst && x.worst.lifeDeltaPct != null)
    .sort((a, b) => (a.worst!.lifeDeltaPct ?? 0) - (b.worst!.lifeDeltaPct ?? 0))[0]

  const deltaTone = (d: number | null) =>
    d == null ? C.dim : d <= -30 ? C.red : d <= -10 ? C.amber : d >= 20 ? C.green : C.muted

  return (
    <Card title="What the ground is doing to your parts"
      subtitle={`${metres.toLocaleString('en-US')} m of log. Catalogue life is what was assumed; observed life is what the ground actually gave.`}
      pad={false} accent={C.amber}
      right={
        <div style={{ display: 'flex', gap: 4, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 9, padding: 4 }}>
          {(['life', 'cost'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', border: 'none', fontFamily: 'inherit', background: mode === m ? C.orange : 'transparent', color: mode === m ? '#fff' : C.faint }}>
              {m === 'life' ? 'Life in metres' : 'Cost per metre'}
            </button>
          ))}
        </div>
      }>
      {headline?.worst && (
        <div style={{ padding: '13px 16px', borderBottom: `1px solid ${C.border}` }}>
          <Note tone={C.red}>
            <strong>{headline.r.name}</strong> is priced at {perMetre(headline.worst.cataloguePerMetre)} on a
            catalogue life of {headline.r.catalogueLife.toLocaleString('en-US')} m. In {headline.worst.formation.toLowerCase()} ground
            it is lasting {Math.round(headline.worst.observedLife!).toLocaleString('en-US')} m, which makes those
            metres {perMetre(headline.worst.observedPerMetre!)} — every one of them was quoted
            {' '}{money(headline.worst.observedPerMetre! - headline.worst.cataloguePerMetre)} too cheap.
          </Note>
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>Part number</th><th style={th}>Item</th>
              <th style={thR}>{mode === 'life' ? 'Catalogue life' : 'Catalogue cost'}</th>
              {FORMATIONS.map(f => <th key={f} style={{ ...thR, color: FORMATION_TONE[f] }}>{f}</th>)}
              <th style={thR}>Scrapped</th>
              <th style={thR}>Spend</th>
            </tr>
          </thead>
          <tbody>
            {worn.map(r => (
              <tr key={r.itemId} style={{ borderBottom: rowBorder }}>
                <td style={{ ...tdMono, color: C.text, fontWeight: 700 }}>{r.partNumber || '—'}</td>
                <td style={{ ...td, color: C.text, fontWeight: 600, whiteSpace: 'normal', maxWidth: 220 }}>
                  {r.name}
                  <span style={{ marginLeft: 7 }}><Tag tone={C.dim}>{FORMATION_USE_LABEL[r.use]}</Tag></span>
                </td>
                <td style={{ ...tdN, color: C.faint }}>
                  {mode === 'life'
                    ? `${r.catalogueLife.toLocaleString('en-US')} m`
                    : perMetre(r.cells.Hard.cataloguePerMetre)}
                </td>
                {FORMATIONS.map(f => {
                  const c = r.cells[f]
                  if (c.scrapped === 0) return <td key={f} style={{ ...tdN, color: C.dim }}>—</td>
                  const tone = deltaTone(c.lifeDeltaPct)
                  return (
                    <td key={f} style={{ ...tdN, color: c.confident ? tone : C.faint, fontWeight: c.confident ? 700 : 400 }}>
                      <div>{mode === 'life'
                        ? `${Math.round(c.observedLife!).toLocaleString('en-US')} m`
                        : perMetre(c.observedPerMetre!)}</div>
                      <div style={{ fontSize: 9.5, color: c.confident ? tone : C.dim, opacity: 0.85 }}>
                        {c.confident
                          ? `${c.lifeDeltaPct! >= 0 ? '+' : ''}${c.lifeDeltaPct!.toFixed(0)}%`
                          : `${c.scrapped} of ${TERRAIN_MIN_SAMPLE}`}
                      </div>
                    </td>
                  )
                })}
                <td style={tdN}>{r.totalScrapped}</td>
                <td style={{ ...tdN, color: C.amber, fontWeight: 700 }}>{money(r.totalSpend)}</td>
              </tr>
            ))}

            {/* On a rig, nothing scrapped yet. Either it is outlasting its
                catalogue life, or the driller is not recording it. */}
            {unworn.length > 0 && (
              <tr style={{ background: 'rgba(var(--x-ov),0.03)' }}>
                <td colSpan={9} style={{ ...td, fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '6px 12px' }}>
                  On a rig, no wear recorded yet
                </td>
              </tr>
            )}
            {unworn.map(r => (
              <tr key={r.itemId} style={{ borderBottom: rowBorder, opacity: 0.6 }}>
                <td style={{ ...tdMono, color: C.text, fontWeight: 700 }}>{r.partNumber || '—'}</td>
                <td style={{ ...td, color: C.text, fontWeight: 600, whiteSpace: 'normal', maxWidth: 220 }}>
                  {r.name}
                  <span style={{ marginLeft: 7 }}><Tag tone={C.dim}>{FORMATION_USE_LABEL[r.use]}</Tag></span>
                </td>
                <td style={{ ...tdN, color: C.faint }}>
                  {mode === 'life'
                    ? `${r.catalogueLife.toLocaleString('en-US')} m`
                    : perMetre(r.cells.Hard.cataloguePerMetre)}
                </td>
                {FORMATIONS.map(f => <td key={f} style={{ ...tdN, color: C.dim }}>—</td>)}
                <td style={{ ...tdN, color: C.dim }}>—</td>
                <td style={{ ...tdN, color: C.dim }}>—</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ padding: '10px 16px', fontSize: 11, color: C.faint, lineHeight: 1.6, background: 'rgba(var(--x-ov),0.02)' }}>
        A formation needs {TERRAIN_MIN_SAMPLE} scrapped units before its figure is worth acting on — below that it is one unlucky part, not a pattern.
        Where the gap is real and holding, change the life on the catalogue and every cost per metre follows.
      </div>
    </Card>
  )
}

/* Where the metres actually are, and what each band costs to cut. */
function GroundPanel({ bands, tooling, rig }: { bands: ReturnType<typeof groundMix>; tooling: ToolingRates; rig: string }) {
  if (bands.length === 0) return null
  const maxM = Math.max(...bands.map(b => b.metres))
  const total = bands.reduce((s, b) => s + b.metres, 0)
  const spend = bands.reduce((s, b) => s + b.toolingSpend, 0)

  return (
    <Card title="Which ground you are actually drilling"
      subtitle={`Tooling rates are ${rig}'s. A band you assumed was thin but is carrying half the hole is where a tender goes wrong.`}
      pad={false} accent={C.teal}>
      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyle}>
          <thead><tr>
            <th style={th}>Formation</th><th style={th}>Share of the hole</th>
            <th style={thR}>Metres</th><th style={thR}>Share</th>
            <th style={thR}>Tooling / m</th><th style={thR}>Tooling spend</th>
          </tr></thead>
          <tbody>
            {bands.map(b => (
              <tr key={b.formation} style={{ borderBottom: rowBorder }}>
                <td style={{ ...td, color: FORMATION_TONE[b.formation], fontWeight: 700 }}>{b.formation}</td>
                <td style={{ ...td, width: '38%' }}><Bar value={b.metres} max={maxM} tone={FORMATION_TONE[b.formation]} /></td>
                <td style={{ ...tdN, color: C.text, fontWeight: 700 }}>{b.metres.toLocaleString('en-US')}</td>
                <td style={{ ...tdN, color: C.faint }}>{b.sharePct.toFixed(1)}%</td>
                <td style={{ ...tdN, color: C.orange, fontWeight: 700 }}>{perMetre(b.toolingPerMetre)}</td>
                <td style={{ ...tdN, color: C.amber }}>{money(b.toolingSpend)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: `2px solid ${C.border}`, background: 'rgba(var(--x-ov),0.02)' }}>
              <td style={{ ...td, fontWeight: 800, color: C.text }} colSpan={2}>Whole project</td>
              <td style={{ ...tdN, fontWeight: 900, color: C.text }}>{total.toLocaleString('en-US')}</td>
              <td style={tdN} />
              <td style={{ ...tdN, fontWeight: 900, color: C.orange }}>{total > 0 ? perMetre(spend / total) : '—'}</td>
              <td style={{ ...tdN, fontWeight: 900, color: C.amber }}>{money(spend)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {tooling.fellBack.length > 0 && (
        <div style={{ padding: '11px 16px' }}>
          <Note tone={C.amber}>
            {tooling.fellBack.join(', ')} has no part on {rig} tagged for it, so those metres carry the blended rate
            across everything. Set Used in correctly on the catalogue and the figure sharpens.
          </Note>
        </div>
      )}
    </Card>
  )
}

/* A part that is cheap per unit can still be the biggest line on the rig. */
function SpendPanel({ rows }: { rows: TerrainRow[] }) {
  const real = rows.filter(r => r.totalSpend > 0).slice(0, 10)
  if (real.length === 0) return null
  const max = Math.max(...real.map(r => r.totalSpend))
  const total = rows.reduce((s, r) => s + r.totalSpend, 0)

  return (
    <Card title="Where the tooling money went"
      subtitle="Scrapped units at catalogue rate. Sorted by spend, not by unit price — the cheap part replaced constantly usually wins."
      pad={false} accent={C.orange}>
      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyle}>
          <thead><tr>
            <th style={th}>Part number</th><th style={th}>Item</th><th style={th}>Share of tooling spend</th>
            <th style={thR}>Unit rate</th><th style={thR}>Scrapped</th><th style={thR}>Spend</th><th style={thR}>Share</th>
          </tr></thead>
          <tbody>
            {real.map(r => (
              <tr key={r.itemId} style={{ borderBottom: rowBorder }}>
                <td style={{ ...tdMono, color: C.text, fontWeight: 700 }}>{r.partNumber || '—'}</td>
                <td style={{ ...td, color: C.text, fontWeight: 600, whiteSpace: 'normal', maxWidth: 230 }}>{r.name}</td>
                <td style={{ ...td, width: '34%' }}><Bar value={r.totalSpend} max={max} tone={C.orange} /></td>
                <td style={{ ...tdN, color: C.faint }}>{money(r.rate)}</td>
                <td style={tdN}>{r.totalScrapped}</td>
                <td style={{ ...tdN, color: C.amber, fontWeight: 700 }}>{money(r.totalSpend)}</td>
                <td style={{ ...tdN, color: C.faint }}>{total > 0 ? `${((r.totalSpend / total) * 100).toFixed(1)}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/* The cheapest supplier is rarely the one with the lowest price. */
function SupplierInsightPanel() {
  const { state } = useInventory()
  const [open, setOpen] = useState<string | null>(null)
  const nameOf = (id: string) => state.catalogue.find(p => p.id === id)?.name ?? id
  const numberOf = (id: string) => state.catalogue.find(p => p.id === id)?.partNumber ?? '—'

  const rows = state.suppliers
    .map(s => supplierInsight(state.pos, state.suppliers, s.name, TODAY))
    .filter(r => r.orders > 0)
    .sort((a, b) => (b.faultyPct ?? 0) - (a.faultyPct ?? 0))

  if (rows.length === 0) return null

  return (
    <Card title="What each supplier actually costs you"
      subtitle="A low price with a high fault rate is not a low price. Click a supplier for where its faults sit."
      pad={false} accent={C.blue}>
      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyle}>
          <thead><tr>
            <th style={th}>Supplier</th><th style={thR}>Spend</th>
            <th style={thR}>Faulty</th><th style={thR}>Price loading</th>
            <th style={th}>Lead time seen</th><th style={thR}>Against quote</th>
            <th style={thR}>Replacements held</th><th style={thR}>Owed now</th><th style={thR}>Worst delay</th>
          </tr></thead>
          <tbody>
            {rows.map(r => {
              const isOpen = open === r.supplier
              const spreadTone = r.leadSpread == null ? C.dim : r.leadSpread > 14 ? C.red : r.leadSpread > 7 ? C.amber : C.green
              return (
                <Fragment key={r.supplier}>
                  <tr onClick={() => setOpen(isOpen ? null : r.supplier)} style={{ borderBottom: rowBorder, cursor: 'pointer', background: isOpen ? 'color-mix(in srgb, var(--x-orange) 5%, transparent)' : undefined }}>
                    <td style={{ ...td, color: C.text, fontWeight: 700 }}>{r.supplier}</td>
                    <td style={tdN}>{money(r.value)}</td>
                    <td style={{ ...tdN, color: r.faultyPct ? C.red : C.dim, fontWeight: 700 }}>
                      {r.faultyPct ? `${r.faultyPct.toFixed(1)}%` : '—'}
                    </td>
                    <td style={{ ...tdN, color: r.effectiveLoadingPct > 0 ? C.amber : C.dim }}>
                      {r.effectiveLoadingPct > 0 ? `+${r.effectiveLoadingPct.toFixed(1)}%` : '—'}
                    </td>
                    <td style={{ ...tdMono, color: spreadTone }}>
                      {r.leadMin == null ? '—' : r.leadMin === r.leadMax ? `${r.leadMin}d` : `${r.leadMin}–${r.leadMax}d`}
                      {r.leadSpread != null && r.leadSpread > 7 && <span style={{ fontSize: 10, marginLeft: 6 }}>unpredictable</span>}
                    </td>
                    <td style={{ ...tdN, color: r.avgDelay == null ? C.dim : r.avgDelay > 0 ? C.red : C.green, fontWeight: 700 }}>
                      {r.avgDelay == null ? '—' : r.avgDelay > 0 ? `+${Math.round(r.avgDelay)}d` : `${Math.round(r.avgDelay)}d`}
                    </td>
                    <td style={{ ...tdN, color: r.survivedPct == null ? C.dim : r.survivedPct >= 90 ? C.green : C.red }}>
                      {r.survivedPct == null ? '—' : `${Math.round(r.survivedPct)}%`}
                    </td>
                    <td style={{ ...tdN, color: r.owedValue > 0 ? C.red : C.dim, fontWeight: r.owedValue > 0 ? 700 : 400 }}>
                      {r.owedValue > 0 ? money(r.owedValue) : '—'}
                    </td>
                    <td style={{ ...tdN, color: r.worstLateDays > 0 ? C.red : C.dim }}>
                      {r.worstLateDays > 0 ? `${r.worstLateDays}d` : '—'}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr style={{ borderBottom: rowBorder, background: 'color-mix(in srgb, var(--x-orange) 3%, transparent)' }}>
                      <td colSpan={9} style={{ padding: '16px 18px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 26 }}>
                          <div>
                            <SubHead tone={C.red}>Where the faults are</SubHead>
                            {r.faultByItem.length === 0
                              ? <div style={{ fontSize: 12, color: C.faint }}>Nothing from this supplier has come in faulty.</div>
                              : (
                                <table style={tableStyle}>
                                  <thead><tr><th style={th}>Part number</th><th style={th}>Item</th><th style={thR}>Delivered</th><th style={thR}>Faulty</th><th style={thR}>Rate</th></tr></thead>
                                  <tbody>{r.faultByItem.map(f => (
                                    <tr key={f.itemId} style={{ borderBottom: rowBorder }}>
                                      <td style={{ ...tdMono, color: C.text, fontWeight: 700 }}>{numberOf(f.itemId)}</td>
                                      <td style={{ ...td, color: C.text, whiteSpace: 'normal' }}>{nameOf(f.itemId)}</td>
                                      <td style={tdN}>{f.delivered}</td>
                                      <td style={{ ...tdN, color: C.red }}>{f.faulty}</td>
                                      <td style={{ ...tdN, color: C.red, fontWeight: 700 }}>{f.pct.toFixed(1)}%</td>
                                    </tr>
                                  ))}</tbody>
                                </table>
                              )}
                            {r.faultByItem.length === 1 && (
                              <div style={{ marginTop: 12 }}>
                                <Note tone={C.blue}>
                                  Every fault is on one part. That is a conversation about {nameOf(r.faultByItem[0].itemId)},
                                  not a reason to drop the supplier.
                                </Note>
                              </div>
                            )}
                          </div>
                          <div>
                            <SubHead tone={C.blue}>Reliability</SubHead>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {([
                                ['Orders placed', `${r.orders}`],
                                ['Delivered in full', `${r.completed}`],
                                ['Quoted lead time', r.quotedLead != null ? `${r.quotedLead} days` : '—'],
                                ['Every delivery took', r.leadTimes.length ? r.leadTimes.map(d => `${d}d`).join(', ') : '—'],
                                ['Replacement rounds', `${r.reorderRounds}`],
                                ['Repeat failures', `${r.repeatFailures}`],
                              ] as [string, string][]).map(([k, v]) => (
                                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 18 }}>
                                  <span style={{ fontSize: 11, color: C.faint }}>{k}</span>
                                  <span style={{ fontSize: 12, color: C.text, fontFamily: 'ui-monospace, monospace', fontWeight: 600, textAlign: 'right' }}>{v}</span>
                                </div>
                              ))}
                            </div>
                            {r.repeatFailures > 0 && (
                              <div style={{ marginTop: 12 }}>
                                <Note tone={C.red}>
                                  {r.repeatFailures} replacement{r.repeatFailures === 1 ? '' : 's'} arrived faulty a second time.
                                  A supplier that cannot fix a fault on the second attempt will not fix it on the third.
                                </Note>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ padding: '10px 16px', fontSize: 11, color: C.faint, lineHeight: 1.6, background: 'rgba(var(--x-ov),0.02)' }}>
        Price loading is the share of units that had to be sent back — the amount by which the quoted price understates what you paid.
        Lead time is shown as every delivery seen rather than an average, because a supplier reliably at 25 days is easier to plan around than one averaging 18 between 8 and 40.
      </div>
    </Card>
  )
}

/* ==========================================================================
 * ORDER MODALS
 * ========================================================================== */

function ReceiveModal({ po, onSave, onClose }: { po: PurchaseOrder; onSave: (date: string, lines: ReceiptLine[], delayReason: DelayReason | undefined, note: string) => void; onClose: () => void }) {
  const { state } = useInventory()
  const nameOf = (id: string) => state.catalogue.find(p => p.id === id)?.name ?? id
  const [date, setDate] = useState(TODAY); const [note, setNote] = useState(''); const [reason, setReason] = useState<DelayReason | ''>('')
  const outstanding = (id: string) => qtyNeverDelivered(po, id)
  const [rows, setRows] = useState<Record<string, { accepted: number; damaged: number; rejected: number }>>(Object.fromEntries(po.lines.map(l => [l.itemId, { accepted: outstanding(l.itemId), damaged: 0, rejected: 0 }])))

  const set = (itemId: string, k: 'accepted' | 'damaged' | 'rejected', v: number) => setRows(r => {
    const out = outstanding(itemId)
    const next = { ...r[itemId], [k]: Math.max(0, Math.min(v, out)) }
    const others = (['accepted', 'rejected', 'damaged'] as const).filter(x => x !== k)
    let over = others.reduce((s, x) => s + next[x], 0) + next[k] - out
    others.forEach(x => { if (over <= 0) return; const take = Math.min(next[x], over); next[x] -= take; over -= take })
    return { ...r, [itemId]: next }
  })

  const lines: ReceiptLine[] = po.lines.map(l => ({ itemId: l.itemId, ...rows[l.itemId] })).filter(l => l.accepted + l.damaged + l.rejected > 0)
  const rate = (id: string) => rateOfLine(po, id)
  const acceptedValue = lines.reduce((s, l) => s + l.accepted * rate(l.itemId), 0)
  const faultyValue = lines.reduce((s, l) => s + (l.damaged + l.rejected) * rate(l.itemId), 0)
  const delay = po.promisedDate ? daysBetween(po.promisedDate, date) : null
  const late = delay != null && delay > 0

  return (
    <Modal title={`Receive against ${po.number}`} subtitle={`${po.supplier} — ${projectCode(po.project)}`} width={760} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn tone="primary" disabled={lines.length === 0 || (late && !reason)} onClick={() => { onSave(date, lines, reason || undefined, note); onClose() }}>Record receipt</Btn></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Note tone={C.dim}>Accepted parts go onto the store shelf. Damaged and wrong stock becomes a reorder.</Note>
        <Grid cols={2}>
          <Field label="Delivered on"><input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...iStyle }} /></Field>
          <Field label="Note"><input value={note} onChange={e => setNote(e.target.value)} placeholder="Optional" style={iStyle} /></Field>
        </Grid>
        {delay != null && <Note tone={late ? C.red : C.green}>{po.promisedDate && `Promised ${fullDate(po.promisedDate)}. `}{late ? `${delay} days late.` : delay === 0 ? 'On time.' : `${Math.abs(delay)} days early.`}</Note>}
        {late && <Field label="Why was it late?" hint="A delay caused by our own late order is not scored against the supplier"><select value={reason} onChange={e => setReason(e.target.value as DelayReason)} style={{ ...iStyle, cursor: 'pointer' }}><option value="">Select a reason</option>{DELAY_REASONS.map(r => <option key={r} value={r}>{r}</option>)}</select></Field>}
        <table style={tableStyle}>
          <thead><tr><th style={th}>Part</th><th style={thR}>Still owed</th><th style={thR}>Accepted</th><th style={thR}>Damaged</th><th style={thR}>Wrong / short</th></tr></thead>
          <tbody>{po.lines.map(l => { const out = outstanding(l.itemId); const r = rows[l.itemId]; return (<tr key={l.itemId} style={{ borderBottom: rowBorder, opacity: out > 0 ? 1 : 0.4 }}><td style={{ ...td, color: C.text, whiteSpace: 'normal' }}>{nameOf(l.itemId)}</td><td style={{ ...tdN, color: out > 0 ? C.amber : C.dim }}>{out}</td>{(['accepted', 'damaged', 'rejected'] as const).map(k => (<td key={k} style={{ padding: '5px 8px', width: 104 }}><input type="number" min={0} max={out} disabled={out === 0} value={r[k]} onChange={e => set(l.itemId, k, parseFloat(e.target.value) || 0)} style={{ ...numStyle, color: k === 'accepted' ? C.green : k === 'damaged' ? C.red : C.amber }} /></td>))}</tr>) })}</tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, alignItems: 'baseline' }}>
          <div><span style={{ fontSize: 11, color: C.faint, marginRight: 8 }}>Onto the shelf</span><span style={{ fontSize: 15, fontWeight: 900, color: C.green, fontFamily: 'ui-monospace, monospace' }}>{money(acceptedValue)}</span></div>
          {faultyValue > 0 && <div><span style={{ fontSize: 11, color: C.faint, marginRight: 8 }}>Not fit to use</span><span style={{ fontSize: 15, fontWeight: 900, color: C.red, fontFamily: 'ui-monospace, monospace' }}>{money(faultyValue)}</span></div>}
        </div>
      </div>
    </Modal>
  )
}

function RaiseReorderModal({ po, onSave, onClose }: { po: PurchaseOrder; onSave: (rs: Omit<Reorder, 'id'>[]) => void; onClose: () => void }) {
  const { state } = useInventory()
  const nameOf = (id: string) => state.catalogue.find(p => p.id === id)?.name ?? id
  const candidates = po.lines.filter(l => qtyToReorder(po, l.itemId) > 0)
  const [rows, setRows] = useState<Record<string, { qty: number; reason: string }>>(Object.fromEntries(candidates.map(l => [l.itemId, { qty: qtyToReorder(po, l.itemId), reason: 'Damaged in transit' }])))
  const [promisedDate, setPromisedDate] = useState('')
  const set = (itemId: string, p: Partial<{ qty: number; reason: string }>) => setRows(r => ({ ...r, [itemId]: { ...r[itemId], ...p } }))
  const picked = candidates.map(l => ({ itemId: l.itemId, ...rows[l.itemId] })).filter(r => r.qty > 0)
  const owed = picked.reduce((s, r) => s + r.qty * rateOfLine(po, r.itemId), 0)
  return (
    <Modal title={`Reorder against ${po.number}`} subtitle={po.supplier} width={780} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn tone="primary" disabled={picked.length === 0} onClick={() => { onSave(picked.map(r => ({ itemId: r.itemId, qty: r.qty, reason: r.reason.trim() || 'Arrived unusable', raisedDate: TODAY, round: 1, status: promisedDate ? 'promised' : 'raised', promisedDate: promisedDate || undefined }))); onClose() }}>Raise {picked.length} reorder{picked.length === 1 ? '' : 's'}</Btn></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Note tone={C.dim}>Each part gets its own line in the Reorders table. Set quantity to zero to skip a part.</Note>
        <Grid cols={2}><Field label="Replacement promised" hint="Optional — applies to all parts on this reorder"><input type="date" value={promisedDate} onChange={e => setPromisedDate(e.target.value)} style={{ ...iStyle }} /></Field></Grid>
        <table style={tableStyle}>
          <thead><tr><th style={th}>Part</th><th style={thR}>Faulty</th><th style={thR}>Reordering</th><th style={th}>What was wrong</th><th style={thR}>Value</th></tr></thead>
          <tbody>{candidates.map(l => { const max = qtyToReorder(po, l.itemId); const r = rows[l.itemId]; const on = r.qty > 0; return (<tr key={l.itemId} style={{ borderBottom: rowBorder, opacity: on ? 1 : 0.5 }}><td style={{ ...td, color: C.text, whiteSpace: 'normal', maxWidth: 220 }}>{nameOf(l.itemId)}</td><td style={{ ...tdN, color: C.red }}>{max}</td><td style={{ padding: '5px 8px', width: 104 }}><input type="number" min={0} max={max} value={r.qty} onChange={e => set(l.itemId, { qty: Math.min(max, Math.max(0, parseFloat(e.target.value) || 0)) })} style={{ ...numStyle, color: on ? C.orange : C.muted }} /></td><td style={{ padding: '5px 8px', minWidth: 220 }}><input value={r.reason} disabled={!on} onChange={e => set(l.itemId, { reason: e.target.value })} placeholder="e.g. cases cracked in transit" style={{ ...iStyle, opacity: on ? 1 : 0.45 }} /></td><td style={{ ...tdN, color: on ? C.text : C.dim, fontWeight: on ? 700 : 400 }}>{on ? money(r.qty * rateOfLine(po, l.itemId)) : '—'}</td></tr>) })}</tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: 10 }}><span style={{ fontSize: 11, color: C.faint }}>Value owed by {po.supplier}</span><span style={{ fontSize: 15, fontWeight: 900, color: C.red, fontFamily: 'ui-monospace, monospace' }}>{money(owed)}</span></div>
      </div>
    </Modal>
  )
}

function ReceiveReorderModal({ po, reorder, onSave, onClose }: { po: PurchaseOrder; reorder: Reorder; onSave: (r: ReorderReceipt) => void; onClose: () => void }) {
  const { state } = useInventory()
  const name = state.catalogue.find(p => p.id === reorder.itemId)?.name ?? reorder.itemId
  const [date, setDate] = useState(TODAY); const [note, setNote] = useState('')
  const [row, setRow] = useState({ accepted: reorder.qty, damaged: 0, rejected: 0 })
  const set = (k: 'accepted' | 'damaged' | 'rejected', v: number) => setRow(r => {
    const next = { ...r, [k]: Math.max(0, Math.min(v, reorder.qty)) }
    const others = (['accepted', 'rejected', 'damaged'] as const).filter(x => x !== k)
    let over = others.reduce((s, x) => s + next[x], 0) + next[k] - reorder.qty
    others.forEach(x => { if (over <= 0) return; const take = Math.min(next[x], over); next[x] -= take; over -= take })
    return next
  })
  const { accepted, damaged, rejected } = row
  const faulty = damaged + rejected
  const rate = rateOfLine(po, reorder.itemId)
  return (
    <Modal title={`Receive replacement — round ${reorder.round}`} subtitle={`${name} · ${po.number} · ${po.supplier}`} width={640} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn tone="primary" disabled={accepted + damaged + rejected === 0} onClick={() => { onSave({ date, accepted, damaged, rejected, note: note || undefined }); onClose() }}>{faulty > 0 ? `Record and reorder ${faulty}` : 'Record replacement'}</Btn></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Grid cols={2}><Field label="Arrived on"><input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...iStyle }} /></Field><Field label="Note"><input value={note} onChange={e => setNote(e.target.value)} placeholder="Optional" style={iStyle} /></Field></Grid>
        <Grid cols={3}>
          <Field label="Accepted" hint="goes onto the shelf"><input type="number" min={0} max={reorder.qty} value={accepted} onChange={e => set('accepted', parseFloat(e.target.value) || 0)} style={{ ...numStyle, color: C.green }} /></Field>
          <Field label="Damaged" hint="faulty again"><input type="number" min={0} max={reorder.qty} value={damaged} onChange={e => set('damaged', parseFloat(e.target.value) || 0)} style={{ ...numStyle, color: C.red }} /></Field>
          <Field label="Wrong / short"><input type="number" min={0} max={reorder.qty} value={rejected} onChange={e => set('rejected', parseFloat(e.target.value) || 0)} style={{ ...numStyle, color: C.amber }} /></Field>
        </Grid>
        {faulty > 0 ? <Note tone={C.red}>{faulty} still unusable ({money(faulty * rate)}). Saving opens round {reorder.round + 1} automatically.</Note> : <Note tone={C.green}>{accepted} unit{accepted === 1 ? '' : 's'} ({money(accepted * rate)}) go onto the shelf. This reorder closes.</Note>}
      </div>
    </Modal>
  )
}

function POModal({ po, onSave, onPlace, onClose }: { po: PurchaseOrder; onSave: (po: PurchaseOrder) => void; onPlace: (id: string, ordered: string, promised: string) => void; onClose: () => void }) {
  const { state, addTransfer } = useInventory()
  const [f, setF] = useState<PurchaseOrder>(po)
  const [placing, setPlacing] = useState(false)
  const [q, setQ] = useState(''); const [cat, setCat] = useState<PartCategory | 'All'>('All'); const [allSuppliers, setAllSuppliers] = useState(false)
  const isNew = !state.pos.some(p => p.id === po.id)
  const quoted = state.suppliers.find(x => x.name === f.supplier)?.quotedLeadDays ?? 14
  const [ordered, setOrdered] = useState(TODAY); const [promised, setPromised] = useState(addDays(TODAY, quoted))
  const nameOf = (id: string) => state.catalogue.find(p => p.id === id)?.name ?? id
  const qtyOf = (id: string) => f.lines.find(l => l.itemId === id)?.qty ?? 0
  const rateOf = (id: string) => f.lines.find(l => l.itemId === id)?.rate ?? state.catalogue.find(p => p.id === id)?.rate ?? 0
  const setQty = (id: string, qty: number) => setF(x => { const part = state.catalogue.find(p => p.id === id); if (qty <= 0) return { ...x, lines: x.lines.filter(l => l.itemId !== id) }; if (x.lines.some(l => l.itemId === id)) return { ...x, lines: x.lines.map(l => l.itemId === id ? { ...l, qty } : l) }; return { ...x, lines: [...x.lines, { itemId: id, qty, rate: part?.rate ?? 0 }] } })
  const setRate = (id: string, rate: number) => setF(x => ({ ...x, lines: x.lines.map(l => l.itemId === id ? { ...l, rate } : l) }))
  const catalogue = state.catalogue.filter(p => p.active && (allSuppliers || p.supplier === f.supplier) && (cat === 'All' || p.category === cat) && (!q || p.name.toLowerCase().includes(q.toLowerCase()) || p.partNumber.toLowerCase().includes(q.toLowerCase())))
  const value = f.lines.reduce((s, l) => s + l.qty * l.rate, 0)
  /* Before buying: the same part free in another store. */
  const check = useMemo(() => buyCheck(state.pos, state.catalogue, f, TODAY, COMPLETED_PROJECTS), [state.pos, state.catalogue, f])
  const [moved, setMoved] = useState<string[]>([])
  const moveInstead = (c: BuyCheckLine) => {
    let need = c.free, got = 0
    c.spares.filter(x => x.movable).forEach(x => {
      if (need <= 0) return
      const take = Math.min(need, x.qty)
      addTransfer(x.poId, { date: TODAY, itemId: c.itemId, qty: take, toProject: f.project, note: `Moved instead of buying on ${f.number}` })
      need -= take; got += take
    })
    if (got > 0) { setQty(c.itemId, c.ordering - got); setMoved(m => [...m, `${got} × ${c.name} moved to ${projectCode(f.project)}`]) }
  }

  if (placing) return (
    <Modal title={`Place ${f.number}`} subtitle={`${f.supplier} — ${money(value)}`} width={520} onClose={() => setPlacing(false)}
      footer={<><Btn onClick={() => setPlacing(false)}>Back</Btn><Btn tone="primary" onClick={() => { onSave(f); onPlace(f.id, ordered, promised); onClose() }}>Place order</Btn></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Grid cols={2}><Field label="Ordered on"><input type="date" value={ordered} onChange={e => { setOrdered(e.target.value); setPromised(addDays(e.target.value, quoted)) }} style={{ ...iStyle }} /></Field><Field label="Promised delivery" hint={`${f.supplier} quotes ${quoted} days`}><input type="date" value={promised} onChange={e => setPromised(e.target.value)} style={{ ...iStyle }} /></Field></Grid>
        <Note tone={C.dim}>Once placed, lines are fixed — receipts are recorded against them.</Note>
      </div>
    </Modal>
  )

  return (
    <Modal title={isNew ? 'New purchase order' : `Edit ${f.number}`} subtitle="Set a quantity against a part to add it to the order" width={980} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn onClick={() => { onSave(f); onClose() }} disabled={f.lines.length === 0}>Save as draft</Btn><Btn tone="primary" disabled={f.lines.length === 0} onClick={() => { setPromised(addDays(ordered, quoted)); setPlacing(true) }}>Place order</Btn></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Grid cols={3}>
          <Field label="Order number"><input value={f.number} onChange={e => setF(x => ({ ...x, number: e.target.value }))} style={{ ...iStyle, fontFamily: 'ui-monospace, monospace' }} /></Field>
          <Field label="Supplier" hint="Changing the supplier clears the lines"><select value={f.supplier} onChange={e => setF(x => ({ ...x, supplier: e.target.value, lines: [] }))} style={{ ...iStyle, cursor: 'pointer' }}>{state.suppliers.map(x => <option key={x.id} value={x.name}>{x.name}</option>)}</select></Field>
          <Field label="Project"><select value={f.project} onChange={e => setF(x => ({ ...x, project: e.target.value }))} style={{ ...iStyle, cursor: 'pointer' }}>{PROJECTS.filter(isLiveProject).map(x => <option key={x} value={x}>{projectCode(x)} — {x}</option>)}</select></Field>
        </Grid>
        <Card title="Parts catalogue" pad={false} subtitle={allSuppliers ? 'All parts' : `Parts supplied by ${f.supplier}`} right={<div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search" style={{ ...iStyle, width: 160 }} /><select value={cat} onChange={e => setCat(e.target.value as PartCategory | 'All')} style={{ ...iStyle, width: 140, cursor: 'pointer' }}><option value="All">All categories</option>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select><label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}><input type="checkbox" checked={allSuppliers} onChange={e => setAllSuppliers(e.target.checked)} /><span style={{ fontSize: 11.5, color: C.muted }}>All suppliers</span></label></div>}>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            <table style={tableStyle}>
              <thead><tr><th style={th}>Part number</th><th style={th}>Item</th><th style={th}>Category</th><th style={thR}>Life</th><th style={thR}>Cost/m</th><th style={thR}>Rate</th><th style={thR}>Quantity</th><th style={thR}>Line value</th></tr></thead>
              <tbody>
                {catalogue.length === 0 && <tr><td colSpan={8}><Empty>No parts match. Tick &quot;All suppliers&quot; to buy from another supplier.</Empty></td></tr>}
                {catalogue.map(p => { const qty = qtyOf(p.id); const on = qty > 0; return (<tr key={p.id} style={{ borderBottom: rowBorder, background: on ? 'color-mix(in srgb, var(--x-orange) 6%, transparent)' : undefined }}><td style={{ ...tdMono, color: C.text, fontWeight: 700 }}>{p.partNumber || '—'}</td><td style={{ ...td, color: C.text, whiteSpace: 'normal', maxWidth: 220 }}>{p.name}</td><td style={td}><Tag tone={C.dim}>{p.category}</Tag></td><td style={{ ...tdN, color: C.faint }}>{p.lifeMetres.toLocaleString('en-US')} m</td><td style={{ ...tdN, color: C.orange }}>{perMetre(costPerMetre(p))}</td><td style={{ padding: '5px 8px', width: 120 }}><input type="number" min={0} value={rateOf(p.id)} disabled={!on} onChange={e => setRate(p.id, parseFloat(e.target.value) || 0)} style={{ ...numStyle, opacity: on ? 1 : 0.45 }} /></td><td style={{ padding: '5px 8px', width: 100 }}><input type="number" min={0} value={qty} onChange={e => setQty(p.id, Math.max(0, parseFloat(e.target.value) || 0))} style={{ ...numStyle, color: on ? C.orange : C.muted }} /></td><td style={{ ...tdN, color: on ? C.text : C.dim, fontWeight: on ? 700 : 400 }}>{on ? money(qty * rateOf(p.id)) : '—'}</td></tr>) })}
              </tbody>
            </table>
          </div>
        </Card>
        {(check.length > 0 || moved.length > 0) && (
          <section aria-label="Before you buy" style={{ border: `1px solid ${hexA(C.amber, 0x55)}`, background: hexA(C.amber, 0x10), borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: C.amber }}>
              {check.length ? `Before you buy: ${money(check.reduce((s, c) => s + c.saves, 0))} of this order is already in another store` : 'Moved instead of bought'}
            </div>
            {check.map(c => {
              const canMove = c.spares.filter(x => x.movable).reduce((s, x) => s + x.qty, 0)
              return (
                <div key={c.itemId} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12.5, color: C.text, flexWrap: 'wrap' }}>
                  <span style={{ flex: '1 1 380px' }}>
                    <b>{c.name}</b>: ordering {c.ordering}; {c.spares.map(x => `${x.qty} on ${projectCode(x.project)} (${x.closed ? 'closed project' : `untouched ${x.ageDays} days`})`).join(', ')}
                  </span>
                  {canMove > 0
                    ? <Btn size="sm" tone="primary" onClick={() => moveInstead(c)}>Move {Math.min(c.free, canMove)} instead · saves {money(Math.min(c.free, canMove) * (c.saves / c.free))}</Btn>
                    : <span style={{ color: C.muted }}>Move it from the Store tab first</span>}
                </div>
              )
            })}
            {moved.map(m => <div key={m} style={{ fontSize: 12.5, color: C.green }}>✓ {m}</div>)}
          </section>
        )}
        <Card title="Order lines" pad={false}>
          {f.lines.length === 0 ? <Empty>Set a quantity against a part above.</Empty> : (
            <table style={tableStyle}>
              <thead><tr><th style={th}>Part</th><th style={thR}>Qty</th><th style={thR}>Rate</th><th style={thR}>Value</th><th style={th} /></tr></thead>
              <tbody>{f.lines.map(l => (<tr key={l.itemId} style={{ borderBottom: rowBorder }}><td style={{ ...td, color: C.text, whiteSpace: 'normal' }}>{nameOf(l.itemId)}</td><td style={tdN}>{l.qty}</td><td style={tdN}>{money(l.rate)}</td><td style={{ ...tdN, color: C.text, fontWeight: 700 }}>{money(l.qty * l.rate)}</td><td style={{ ...td, textAlign: 'right' }}><Btn size="sm" tone="danger" onClick={() => setQty(l.itemId, 0)}>Remove</Btn></td></tr>))}</tbody>
              <tfoot><tr style={{ borderTop: `2px solid ${C.border}` }}><td style={{ ...td, fontWeight: 800, color: C.text }} colSpan={3}>Order value</td><td style={{ ...tdN, fontWeight: 900, color: C.orange }}>{money(value)}</td><td style={td} /></tr></tfoot>
            </table>
          )}
        </Card>
      </div>
    </Modal>
  )
}

/* ==========================================================================
 * SCREEN
 * ========================================================================== */

const TABS = ['Overview', 'Stock by site', 'Orders', 'Part life', 'Catalogue'] as const
type Tab = typeof TABS[number]

export default function InventoryPage() {
  return <Suspense fallback={null}><InventoryScreen /></Suspense>
}

function InventoryScreen() {
  const { state, savePart, savePO, placeOrder, addReceipt, addReorder, receiveReorder } = useInventory()
  const cost = useOwnLogs()
  const params = useSearchParams()
  const [tab, setTab] = useState<Tab>(() => { const t = params.get('tab'); return t && (TABS as readonly string[]).includes(t) ? t as Tab : 'Overview' })
  const [editPart, setEditPart] = useState<Part | null>(null)
  const [importing, setImporting] = useState(false)
  const [editPO, setEditPO] = useState<PurchaseOrder | null>(null)
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null)
  const [raising, setRaising] = useState<PurchaseOrder | null>(null)
  const [replacing, setReplacing] = useState<{ po: PurchaseOrder; reorder: Reorder } | null>(null)

  const blankPO = (): PurchaseOrder => ({
    id: uid('po'), number: `PO-${TODAY.slice(0, 4)}-${String(state.pos.length + 1).padStart(3, '0')}`,
    supplier: state.suppliers[0]?.name ?? '', project: PROJECTS.find(isLiveProject) ?? PROJECTS[0],
    status: 'draft', createdDate: TODAY, lines: [], receipts: [], reorders: [], issues: [], transfers: [],
  })

  const burnMonth = useMemo(() => {
    const months = cost.shiftLogs.filter(l => l.metresDrilled > 0).map(l => monthOf(l.date)).sort()
    return months[months.length - 1] ?? monthOf(TODAY)
  }, [cost.shiftLogs])

  const burn = useMemo(() => RIGS.map(rig => {
    const shifts = cost.shiftLogs.filter(l => l.rig === rig && monthOf(l.date) === burnMonth && l.metresDrilled > 0)
    if (!shifts.length) return null
    const days = new Set(shifts.map(s => s.date)).size
    const metres = shifts.reduce((s, l) => s + l.metresDrilled, 0)
    const counts: Record<string, number> = {}
    shifts.forEach(s => { const f = normFormation(s.formationType); counts[f] = (counts[f] ?? 0) + s.metresDrilled })
    const formation = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Hard') as Formation
    return { rig, metresPerDay: Math.round((metres / days) * 10) / 10, formation }
  }).filter(Boolean) as { rig: string; metresPerDay: number; formation: Formation }[], [cost.shiftLogs, burnMonth])

  const rigsOn = useCallback((project: string) => RIGS.filter(rig => cost.shiftLogs.some(l => l.rig === rig && l.project === project) || state.rigKit.some(k => k.rig === rig && k.project === project)), [cost.shiftLogs, state.rigKit])
  const usedBy = useCallback((rig: string, project: string) => {
    const out: { itemId: string; qty: number }[] = []
    cost.shiftLogs.filter(l => l.rig === rig && l.project === project).forEach(l => (l.partsUsed ?? []).forEach(u => {
      const e = out.find(x => x.itemId === u.itemId); if (e) e.qty += u.qty ?? 0; else out.push({ itemId: u.itemId, qty: u.qty ?? 0 })
    }))
    return [...out, ...countLosses(state.rigCounts ?? [], rig, project)]
  }, [cost.shiftLogs, state.rigCounts])

  const alerts = useMemo(() => buildAlerts(state.pos, state.catalogue, TODAY, COMPLETED_PROJECTS, burn, state.alerts, state.suppliers), [state.pos, state.catalogue, state.alerts, state.suppliers, burn])
  const urgent = alerts.filter(a => a.level === 'urgent').length

  return (
    <Page>
      <nav aria-label="Stores" className="xpl-chips" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: `1px solid ${C.border}` }}>
        {TABS.map(t => (
          <button key={t} type="button" aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)} style={{
            minHeight: 42, padding: '0 14px', marginBottom: -1, border: 'none', borderBottom: `2px solid ${tab === t ? C.orange : 'transparent'}`, background: 'none',
            fontSize: 13.5, fontWeight: tab === t ? 700 : 500, color: tab === t ? C.text : C.muted, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}>{t}{t === 'Catalogue' ? <span style={{ fontWeight: 400, color: C.faint }}> · setup</span> : null}</button>
        ))}
      </nav>

      {tab === 'Overview' && <StoresOverview burn={burn} rigsOn={rigsOn} used={usedBy} go={setTab} />}
      {tab !== 'Overview' && (
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>{TAB_TITLE[tab]}</h1>
          <p style={{ fontSize: 13, color: C.muted, marginTop: 5, maxWidth: 760, lineHeight: 1.55 }}>{TAB_NOTE[tab]}</p>
        </div>
      )}
      {tab === 'Catalogue' && <ValuationSetting />}
      {tab === 'Catalogue' && <CatalogueTab onEdit={setEditPart} onImport={() => setImporting(true)} />}
      {tab === 'Orders' && <OrdersTab onReceive={setReceiving} onCreate={() => setEditPO(blankPO())} onEdit={setEditPO} onRaiseReorder={setRaising} onReceiveReorder={(po, reorder) => setReplacing({ po, reorder })} />}
      {tab === 'Stock by site' && <StoreTab />}
      {tab === 'Part life' && <InsightsTab />}

      {editPart && <PartModal part={editPart} onSave={savePart} onClose={() => setEditPart(null)} />}
      {importing && <ImportModal onClose={() => setImporting(false)} />}
      {editPO && <POModal po={editPO} onSave={savePO} onPlace={placeOrder} onClose={() => setEditPO(null)} />}
      {receiving && <ReceiveModal po={receiving} onClose={() => setReceiving(null)} onSave={(date, lines, delayReason, note) => addReceipt(receiving.id, { date, lines, delayReason, note })} />}
      {raising && <RaiseReorderModal po={raising} onClose={() => setRaising(null)} onSave={rs => rs.forEach(r => addReorder(raising.id, r))} />}
      {replacing && <ReceiveReorderModal po={replacing.po} reorder={replacing.reorder} onClose={() => setReplacing(null)} onSave={receipt => receiveReorder(replacing.po.id, replacing.reorder.id, receipt)} />}
    </Page>
  )
}

const TAB_TITLE: Record<Tab, string> = { Overview: 'Stores', 'Stock by site': 'Stock by site', Orders: 'Orders', 'Part life': 'Part life', Catalogue: 'Catalogue' }
const TAB_NOTE: Record<Tab, string> = {
  Overview: '',
  'Stock by site': 'What is on the shelf at each site and what each rig is carrying. Issue parts to a rig from here; a part is charged to the metres it drills once it is on the rig.',
  Orders: 'Every purchase order from draft to the store: place it, receive it, send back what was faulty, and see how each supplier keeps its dates.',
  'Part life': 'How long each part really lasts in each ground, from the drill logs, against what the catalogue says. A part that wears faster than its catalogue life is costing more a metre than you think.',
  Catalogue: 'Set once: each part, its rate, its life in metres, its supplier and lead time. Every cost per metre and every stock warning is worked out from these.',
}
