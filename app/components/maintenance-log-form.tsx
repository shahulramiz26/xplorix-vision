'use client'

import { ReactNode, useEffect, useRef, useState } from 'react'
import { Plus, Trash2, Paperclip, Upload, ChevronDown } from 'lucide-react'
import {
  uid, nowStamp, MAINTENANCE_TYPES, MAINTENANCE_TYPE_LABEL, MAINTENANCE_ACTIONS,
  type MaintenanceLog, type MaintenanceType, type ShiftName,
} from '../../lib/costing-store'
import { useInventory, TODAY } from '../../lib/inventory-store'
import { components as COMPONENTS } from '../../lib/mock-data'
import { T, tint, Btn, inputStyle } from './kit'
import type { LogScope } from './drill-log-form'

/* ==========================================================================
 * THE MAINTENANCE LOG FORM
 *
 * One form for every repair and service, used by the Company Admin, the
 * supervisor and the contractor. The service cost is the labour or outside
 * repair bill only; parts are listed separately because their cost comes from
 * inventory, and counting them twice would overstate what the rig costs.
 *
 * A contractor's repair is recorded for the hours his rig was down. His cost
 * and his parts are his own, so his form does not ask for them.
 * ========================================================================== */

const num = (v: string) => (v.trim() === '' ? 0 : parseFloat(v) || 0)
const str = (n: number | undefined) => (n == null || Number.isNaN(n) ? '' : String(n))
const sel: React.CSSProperties = { ...inputStyle, cursor: 'pointer' }
const numIn: React.CSSProperties = { ...inputStyle, fontVariantNumeric: 'tabular-nums' }
const grid = (min: number): React.CSSProperties => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 14 })

function Panel({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ border: `1px solid ${T.border}`, borderRadius: 10, background: T.card, padding: '18px 20px' }}>
      {title && <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 14 }}>{title}</div>}
      {children}
    </section>
  )
}
function L({ label, req, hint, children }: { label: string; req?: boolean; hint?: ReactNode; children: ReactNode }) {
  return (
    <label style={{ display: 'block', minWidth: 0 }}>
      <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: T.muted, marginBottom: 6 }}>{label}{req && <span style={{ color: T.orange }}> *</span>}</span>
      {children}
      {hint && <span style={{ display: 'block', fontSize: 11.5, color: T.faint, marginTop: 5, lineHeight: 1.45 }}>{hint}</span>}
    </label>
  )
}

/* More than one component can be worked on in a single job. */
function MultiPick({ value, options, onChange }: { value: string[]; options: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  return (
    <div ref={box} style={{ position: 'relative' }}>
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(o => !o)} style={{ ...inputStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, cursor: 'pointer', textAlign: 'left', color: value.length ? T.text : T.faint }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value.length ? value.join(', ') : 'Select component(s)'}</span>
        <ChevronDown size={15} style={{ flexShrink: 0, color: T.faint }} />
      </button>
      {open && (
        <div role="listbox" aria-multiselectable style={{ position: 'absolute', zIndex: 20, top: 'calc(100% + 4px)', left: 0, right: 0, maxHeight: 250, overflowY: 'auto', background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 6, boxShadow: '0 12px 30px rgba(var(--x-shadow),0.25)' }}>
          {options.map(o => {
            const on = value.includes(o)
            return (
              <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 9px', borderRadius: 7, fontSize: 13.5, color: T.text, cursor: 'pointer', background: on ? tint(T.orange, 10) : 'transparent' }}>
                <input type="checkbox" checked={on} onChange={() => onChange(on ? value.filter(v => v !== o) : [...value, o])} style={{ accentColor: 'var(--x-orange)' }} />
                {o}
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface F {
  project: string; rig: string; date: string; shift: '' | ShiftName; supervisor: string
  type: '' | MaintenanceType; hours: string; components: string[]; action: string; cost: string
  parts: { id: string; itemId: string; qty: string }[]
  engineOil: string; hydraulicOil: string; transmissionOil: string
  files: string[]; notes: string
}
let seq = 0
const rid = () => `mp${Date.now()}_${++seq}`

function fromLog(m: MaintenanceLog | undefined, scopes: LogScope[], supervisor?: string): F {
  const one = scopes.length === 1 ? scopes[0] : undefined
  const project = m?.project ?? one?.project ?? ''
  const sc = scopes.find(s => s.project === project)
  return {
    project, rig: m?.rig ?? (sc && sc.rigs.length === 1 ? sc.rigs[0] : ''), date: m?.date ?? TODAY, shift: m?.shift ?? '',
    supervisor: m?.supervisor ?? supervisor ?? '',
    type: m?.maintenanceType ?? '', hours: m ? str(m.hours) : '',
    components: m?.component ? m.component.split(',').map(x => x.trim()).filter(Boolean) : [],
    action: m?.action ?? '', cost: m ? str(m.cost) : '',
    parts: (m?.partsUsed ?? []).map(p => ({ id: rid(), itemId: p.itemId, qty: str(p.qty) })),
    engineOil: m ? str(m.engineOilL ?? 0) : '', hydraulicOil: m ? str(m.hydraulicOilL ?? 0) : '', transmissionOil: m ? str(m.transmissionOilL ?? 0) : '',
    files: m?.attachments ?? [], notes: m?.notes ?? '',
  }
}

export function MaintenanceLogForm({ variant, scopes, existing, lockSupervisor, by, contractorId, submitLabel, onSubmit, onCancel }: {
  variant: 'own' | 'contractor'
  scopes: LogScope[]
  existing?: MaintenanceLog
  lockSupervisor?: string
  by: string
  contractorId?: string
  submitLabel: string
  onSubmit: (m: MaintenanceLog) => void
  onCancel?: () => void
}) {
  const { state: inv } = useInventory()
  const [f, setF] = useState<F>(() => fromLog(existing, scopes, lockSupervisor))
  const [tried, setTried] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const u = (p: Partial<F>) => setF(x => ({ ...x, ...p }))
  const contractor = variant === 'contractor'

  const loadedFor = useRef(existing?.id)
  useEffect(() => {
    if (existing?.id === loadedFor.current) return
    loadedFor.current = existing?.id
    setF(fromLog(existing, scopes, lockSupervisor))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id])

  const scope = scopes.find(s => s.project === f.project)
  const rigs = scope?.rigs ?? []
  useEffect(() => {
    if (f.project && !scope) u({ project: scopes.length === 1 ? scopes[0].project : '', rig: '' })
    else if (scope && f.rig && !rigs.includes(f.rig)) u({ rig: rigs.length === 1 ? rigs[0] : '' })
    else if (scope && !f.rig && rigs.length === 1) u({ rig: rigs[0] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.project, scope?.project, rigs.join('|')])
  useEffect(() => { if (lockSupervisor && f.supervisor !== lockSupervisor) u({ supervisor: lockSupervisor }) }, [lockSupervisor, f.supervisor])

  const blank = (v: string) => v.trim() === ''
  const catalogue = inv.catalogue.filter(p => p.active)
  const problems: string[] = []
  if (!f.project) problems.push('Choose the project.')
  if (!f.rig) problems.push('Choose the rig.')
  if (!f.date) problems.push('Choose the date.')
  else if (f.date > TODAY) problems.push('The date is in the future.')
  if (!f.shift) problems.push('Choose the shift.')
  if (blank(f.supervisor)) problems.push('Enter the supervisor.')
  if (!f.type) problems.push('Choose the maintenance type.')
  if (!(num(f.hours) > 0)) problems.push('Enter how many hours the work took.')
  if (f.components.length === 0) problems.push('Choose the component that was worked on.')
  if (!f.action) problems.push('Choose the action taken.')
  if (!contractor && blank(f.cost)) problems.push('Enter the service cost (0 if there was none).')
  if (f.parts.some(p => !p.itemId || !(num(p.qty) > 0))) problems.push('Every part needs the item and a quantity.')
  if (!contractor && (blank(f.engineOil) || blank(f.hydraulicOil) || blank(f.transmissionOil))) problems.push('Enter the oils used (0 where none).')

  const submit = () => {
    setTried(true)
    if (problems.length) return
    onSubmit({
      ...(existing ?? {}),
      id: existing?.id ?? uid('mt'), rig: f.rig, project: f.project, date: f.date, shift: f.shift as ShiftName,
      supervisor: f.supervisor.trim(), maintenanceType: f.type as MaintenanceType, hours: num(f.hours),
      component: f.components.join(', '), action: f.action, cost: contractor ? 0 : num(f.cost),
      partsUsed: contractor ? [] : f.parts.map(p => ({ itemId: p.itemId, qty: num(p.qty) })),
      engineOilL: num(f.engineOil), hydraulicOilL: num(f.hydraulicOil), transmissionOilL: num(f.transmissionOil),
      attachments: f.files, notes: f.notes.trim() || undefined,
      contractor: contractor ? contractorId : existing?.contractor, workOrderId: contractor ? scope?.workOrderId : existing?.workOrderId,
      loggedBy: existing?.loggedBy ?? by, loggedAt: existing?.loggedAt ?? nowStamp(),
      ...(existing ? { editedBy: by, editedAt: nowStamp() } : {}),
    })
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Panel title="Basic Details">
        <div style={grid(150)}>
          <L label="Project" req>
            <select value={f.project} onChange={e => u({ project: e.target.value, rig: '' })} style={sel}>
              <option value="">Select project…</option>{scopes.map(s => <option key={s.project} value={s.project}>{s.project}</option>)}
            </select>
          </L>
          <L label="Rig" req>
            <select value={f.rig} disabled={!f.project} onChange={e => u({ rig: e.target.value })} style={{ ...sel, opacity: f.project ? 1 : 0.6 }}>
              <option value="">{f.project ? 'Select rig…' : 'Select a project first'}</option>{rigs.map(r => <option key={r}>{r}</option>)}
            </select>
          </L>
          <L label="Date" req><input type="date" value={f.date} max={TODAY} onChange={e => u({ date: e.target.value })} style={inputStyle} /></L>
          <L label="Shift" req>
            <select value={f.shift} onChange={e => u({ shift: e.target.value as F['shift'] })} style={sel}>
              <option value="">Select shift…</option><option value="Day">Day</option><option value="Night">Night</option>
            </select>
          </L>
          <L label="Supervisor" req>
            {lockSupervisor ? <input value={lockSupervisor} readOnly style={{ ...inputStyle, opacity: 0.6 }} />
              : contractor ? <input value={f.supervisor} onChange={e => u({ supervisor: e.target.value })} placeholder="Your supervisor on site" style={inputStyle} />
              : (
                <select value={f.supervisor} disabled={!f.project} onChange={e => u({ supervisor: e.target.value })} style={{ ...sel, opacity: f.project ? 1 : 0.6 }}>
                  <option value="">{f.project ? 'Select supervisor…' : 'Select a project first'}</option>
                  {Array.from(new Set([...(scope?.supervisors ?? []), ...(f.supervisor ? [f.supervisor] : [])])).map(n => <option key={n}>{n}</option>)}
                </select>
              )}
          </L>
        </div>
      </Panel>

      <Panel title="Service Details">
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={grid(240)}>
            <L label="Maintenance Type" req>
              <select value={f.type} onChange={e => u({ type: e.target.value as F['type'] })} style={sel}>
                <option value="">Select type…</option>{MAINTENANCE_TYPES.map(t => <option key={t} value={t}>{MAINTENANCE_TYPE_LABEL[t]}</option>)}
              </select>
            </L>
            <L label="Duration (hours)" req><input type="number" min={0} value={f.hours} onChange={e => u({ hours: e.target.value })} placeholder="0" style={numIn} /></L>
          </div>
          <div style={grid(240)}>
            <div>
              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: T.muted, marginBottom: 6 }}>Component Affected<span style={{ color: T.orange }}> *</span></span>
              <MultiPick value={f.components} options={Array.from(new Set([...COMPONENTS, ...f.components]))} onChange={v => u({ components: v })} />
            </div>
            <L label="Action Taken" req>
              <select value={f.action} onChange={e => u({ action: e.target.value })} style={sel}>
                <option value="">Select action…</option>
                {Array.from(new Set([...MAINTENANCE_ACTIONS, ...(f.action ? [f.action] : [])])).map(a => <option key={a}>{a}</option>)}
              </select>
            </L>
          </div>
          {!contractor && (
            <>
              <div style={grid(240)}>
                <L label="Service Cost (SAR)" req hint="Enter service/repair cost only. Do not include any parts cost.">
                  <input type="number" min={0} value={f.cost} onChange={e => u({ cost: e.target.value })} placeholder="0" style={numIn} />
                </L>
                <div />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: T.text }}>Parts Used</span>
                  <button type="button" onClick={() => u({ parts: [...f.parts, { id: rid(), itemId: '', qty: '' }] })} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: T.orange, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}><Plus size={14} /> Add</button>
                </div>
                {f.parts.length === 0 && <div style={{ fontSize: 13, color: T.faint }}>No parts added.</div>}
                <div style={{ display: 'grid', gap: 10 }}>
                  {f.parts.map((p, i) => {
                    const set = (x: Partial<F['parts'][number]>) => u({ parts: f.parts.map(y => y.id === p.id ? { ...y, ...x } : y) })
                    return (
                      <div key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span style={{ width: 22, fontSize: 12.5, color: T.faint }}>{i + 1}.</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <select value={p.itemId} aria-label="Part" onChange={e => set({ itemId: e.target.value })} style={sel}>
                            <option value="">Select part</option>
                            {catalogue.map(c => <option key={c.id} value={c.id}>{c.partNumber ? `${c.partNumber} · ` : ''}{c.name}</option>)}
                          </select>
                        </div>
                        <div style={{ width: 90 }}><input type="number" min={0} value={p.qty} aria-label="Quantity" onChange={e => set({ qty: e.target.value })} placeholder="Qty" style={numIn} /></div>
                        <button type="button" aria-label="Remove this part" onClick={() => u({ parts: f.parts.filter(y => y.id !== p.id) })} style={{ background: 'none', border: 'none', color: T.red, cursor: 'pointer', padding: 8, lineHeight: 0 }}><Trash2 size={15} /></button>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </Panel>

      <Panel title="Fluid Consumables">
        <div style={grid(170)}>
          <L label="Engine Oil (L)" req={!contractor}><input type="number" min={0} value={f.engineOil} onChange={e => u({ engineOil: e.target.value })} placeholder="0" style={numIn} /></L>
          <L label="Hydraulic Oil (L)" req={!contractor}><input type="number" min={0} value={f.hydraulicOil} onChange={e => u({ hydraulicOil: e.target.value })} placeholder="0" style={numIn} /></L>
          <L label="Transmission Oil (L)" req={!contractor}><input type="number" min={0} value={f.transmissionOil} onChange={e => u({ transmissionOil: e.target.value })} placeholder="0" style={numIn} /></L>
        </div>
      </Panel>

      <section style={{ border: `1px solid ${T.border}`, borderRadius: 10, background: T.card, padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: T.text }}><Paperclip size={15} style={{ color: T.faint }} /> Maintenance Attachments</span>
          <input ref={fileInput} type="file" multiple style={{ display: 'none' }} onChange={e => { u({ files: [...f.files, ...Array.from(e.target.files ?? []).map(x => x.name)] }); e.target.value = '' }} />
          <button type="button" onClick={() => fileInput.current?.click()} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 8, border: `1px solid ${tint(T.orange, 35)}`, background: tint(T.orange, 10), color: T.orange, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            <Upload size={14} /> Add Files
          </button>
        </div>
        {f.files.length === 0 ? <div style={{ fontSize: 13, color: T.faint }}>No attachments added.</div> : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {f.files.map((name, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderRadius: 7, border: `1px solid ${T.border}`, fontSize: 12.5, color: T.muted }}>
                {name}
                <button type="button" aria-label={`Remove ${name}`} onClick={() => u({ files: f.files.filter((_, j) => j !== i) })} style={{ background: 'none', border: 'none', color: T.faint, cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>
              </span>
            ))}
          </div>
        )}
      </section>

      <Panel>
        <L label="Notes"><textarea value={f.notes} onChange={e => u({ notes: e.target.value })} rows={3} placeholder="Describe maintenance work…" style={{ ...inputStyle, resize: 'vertical' }} /></L>
      </Panel>

      {tried && problems.length > 0 && (
        <div role="alert" style={{ padding: '12px 14px', borderRadius: 10, background: tint(T.amber, 8), border: `1px solid ${tint(T.amber, 36)}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 5 }}>Before this log can be saved</div>
          {problems.map((p, i) => <div key={i} style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.55 }}><span aria-hidden style={{ color: T.amber, fontWeight: 800, marginRight: 6 }}>!</span>{p}</div>)}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: onCancel ? '1fr 1fr' : '1fr', gap: 12 }}>
        {onCancel && <Btn onClick={onCancel}>Cancel</Btn>}
        <Btn kind="primary" onClick={submit}>{submitLabel}</Btn>
      </div>
    </div>
  )
}
