'use client'

import {
  ANY_FORMATION, ROCK_CATEGORIES, HOLE_SIZES, money, uid,
  type ClientRate, type RateRow, type RateStructure,
} from '../../lib/costing-store'
import { rateLines, rateChanges, type RateChange } from '../../lib/projects'
import { T, tint, Seg, Btn, Field, inputStyle, Table, th, thR, td, tdR, rowLine } from './kit'

/* ==========================================================================
 * CONTRACT RATES — shown and edited the same way on both sides
 *
 *   RateSchedule   the rates as a contract schedule prints them. Given the
 *                  set it replaces, it shows old and new side by side and
 *                  marks the lines that moved.
 *   RateEditor     the contractor's form for a new set of rates.
 * ========================================================================== */

export function RateSchedule({ rate, before }: { rate: ClientRate; before?: ClientRate }) {
  const lines = rateLines(rate)
  const changes: RateChange[] | null = before ? rateChanges(before, rate) : null
  if (changes) {
    return (
      <Table>
        <thead><tr>
          <th style={th}>Line</th><th style={thR}>Agreed now</th><th style={thR}>Proposed</th><th style={thR}>Change</th>
        </tr></thead>
        <tbody>
          {changes.map(c => {
            const moved = c.from !== c.to
            const pct = c.from && c.to != null ? ((c.to - c.from) / c.from) * 100 : null
            return (
              <tr key={c.key} style={{ borderBottom: rowLine, background: moved ? tint(T.amber, 7) : undefined }}>
                <td style={{ ...td, color: T.text, fontWeight: moved ? 600 : 400 }}>
                  {c.label} <span style={{ color: T.faint, fontWeight: 400 }}>· {c.unit}</span>
                </td>
                <td style={tdR}>{c.from == null ? '—' : money(c.from)}</td>
                <td style={{ ...tdR, color: T.text, fontWeight: moved ? 700 : 400 }}>{c.to == null ? 'removed' : money(c.to)}</td>
                <td style={{ ...tdR, color: moved ? T.text : T.faint }}>
                  {!moved ? 'no change' : c.from == null ? 'new line' : c.to == null ? 'removed'
                    : <><span aria-hidden>{c.to > c.from ? '▲ ' : '▼ '}</span>{money(Math.abs(c.to - c.from))}{pct != null ? ` (${Math.abs(pct).toFixed(1)}%)` : ''}</>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </Table>
    )
  }
  return (
    <Table>
      <thead><tr><th style={th}>Line</th><th style={th}>Charged</th><th style={thR}>Rate</th></tr></thead>
      <tbody>
        {lines.map(l => (
          <tr key={l.key} style={{ borderBottom: rowLine }}>
            <td style={{ ...td, color: T.text }}>
              {l.label}
              {l.note && <div style={{ fontSize: 11.5, color: T.faint, marginTop: 2 }}>{l.note}</div>}
            </td>
            <td style={td}>{l.unit}</td>
            <td style={{ ...tdR, color: T.text, fontWeight: 600 }}>{money(l.rate)}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  )
}

const num: React.CSSProperties = { ...inputStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
const parse = (v: string) => (v === '' ? 0 : Math.max(0, parseFloat(v) || 0))

/* `paying` turns the wording round for a work order, where we are the ones
 * who pay the rate. The form and the arithmetic are the same either way. */
export function RateEditor({ value, onChange, paying }: { value: ClientRate; onChange: (c: ClientRate) => void; paying?: boolean }) {
  const f = value
  const u = (p: Partial<ClientRate>) => onChange({ ...f, ...p })
  const row = (i: number, p: Partial<RateRow>) => u({ rateRows: f.rateRows.map((r, j) => j === i ? { ...r, ...p } : r) })
  const flat = f.structure !== 'slab'
  const add = () => {
    const last = f.rateRows[f.rateRows.length - 1]
    u({
      rateRows: [...f.rateRows, flat
        ? { id: uid('r'), holeSize: last?.holeSize ?? 'HQ', formation: ROCK_CATEGORIES.find(c => !f.rateRows.some(r => r.formation === c)) ?? 'Hard rock', rate: 0, adjustments: [] }
        : { id: uid('r'), holeSize: last?.holeSize ?? 'HQ', formation: ANY_FORMATION, fromDepth: last?.toDepth ?? 0, rate: 0, adjustments: [] }],
    })
  }
  /* Switching shape keeps the sizes and rates and resets only what the other
   * shape does not have, so nothing typed is thrown away. */
  const reshape = (s: RateStructure) => {
    if (s === f.structure) return
    u({
      structure: s,
      rateRows: f.rateRows.map((r, i) => s === 'flat'
        ? { ...r, formation: r.formation === ANY_FORMATION ? (ROCK_CATEGORIES[i] ?? 'Hard rock') : r.formation }
        : { ...r, formation: ANY_FORMATION, fromDepth: r.fromDepth ?? i * 100, toDepth: r.toDepth ?? (i === f.rateRows.length - 1 ? undefined : (i + 1) * 100) }),
    })
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: T.muted, marginBottom: 7 }}>{paying ? 'How the work order prices a metre' : 'How the contract prices a metre'}</div>
        <Seg<RateStructure> options={[{ value: 'flat', label: 'By ground' }, { value: 'slab', label: 'By depth' }]} value={f.structure} onChange={reshape} />
        <div style={{ fontSize: 12, color: T.faint, marginTop: 7, lineHeight: 1.5 }}>
          {flat
            ? 'Soft, hard and very hard ground each have a rate, whatever the depth. The driller logs the ground, so each stretch of hole is priced at the right line.'
            : 'The rate rises as the hole gets deeper, whatever ground it passes through. Leave the last band open-ended.'}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {f.rateRows.map((r, i) => (
          <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', padding: '11px 12px', borderRadius: 10, border: `1px solid ${T.border}`, background: T.raised }}>
            <div style={{ width: 84 }}>
              <Field label="Size">
                <select value={r.holeSize} onChange={e => row(i, { holeSize: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
                  {HOLE_SIZES.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </Field>
            </div>
            {flat ? (
              <div style={{ flex: '1 1 170px' }}>
                <Field label="Ground">
                  <select value={r.formation} onChange={e => row(i, { formation: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
                    {ROCK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    {r.formation && r.formation !== ANY_FORMATION && !ROCK_CATEGORIES.includes(r.formation) && <option value={r.formation}>{r.formation}</option>}
                  </select>
                </Field>
              </div>
            ) : (
              <>
                <div style={{ width: 104 }}>
                  <Field label="From, m">
                    <input type="number" value={r.fromDepth ?? ''} placeholder="0" onChange={e => row(i, { fromDepth: e.target.value === '' ? undefined : parse(e.target.value) })} style={num} />
                  </Field>
                </div>
                <div style={{ width: 104 }}>
                  <Field label="To, m">
                    <input type="number" value={r.toDepth ?? ''} placeholder="no limit" onChange={e => row(i, { toDepth: e.target.value === '' ? undefined : parse(e.target.value) })} style={num} />
                  </Field>
                </div>
              </>
            )}
            <div style={{ width: 140 }}>
              <Field label="SAR a metre">
                <input type="number" value={r.rate || ''} placeholder="0" onChange={e => row(i, { rate: parse(e.target.value) })} style={{ ...num, fontWeight: 600 }} />
              </Field>
            </div>
            {f.rateRows.length > 1 && (
              <button type="button" onClick={() => u({ rateRows: f.rateRows.filter((_, j) => j !== i) })} aria-label={`Remove line ${i + 1}`}
                style={{ padding: '9px 10px', background: 'none', border: 'none', color: T.faint, cursor: 'pointer', fontSize: 12.5, fontFamily: 'inherit' }}>Remove</button>
            )}
          </div>
        ))}
        <div><Btn size="sm" onClick={add}>{flat ? 'Add a ground type' : 'Add a depth band'}</Btn></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <Field label="Standby, SAR a day" hint={paying ? 'Paid for a day lost for a reason that is not the contractor’s.' : 'Billed when the client stops work.'}>
          <input type="number" value={f.standbyPerDay || ''} placeholder="0" onChange={e => u({ standbyPerDay: parse(e.target.value) })} style={num} />
        </Field>
        <Field label="Mobilisation, SAR">
          <input type="number" value={f.mobilisation || ''} placeholder="0" onChange={e => u({ mobilisation: parse(e.target.value) })} style={num} />
        </Field>
        <Field label="Demobilisation, SAR">
          <input type="number" value={f.demobilisation || ''} placeholder="0" onChange={e => u({ demobilisation: parse(e.target.value) })} style={num} />
        </Field>
      </div>
    </div>
  )
}

/* True when a set of rates can price a metre: at least one line with a rate. */
export function ratesUsable(c: ClientRate) { return c.rateRows.some(r => r.rate > 0) }
