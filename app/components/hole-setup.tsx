'use client'

import { useState } from 'react'
import { parseTable } from '../../lib/survey'
import { collarLatLon, parseZone, type CoordSystem } from '../../lib/geo'
import type { HolePlan, ProjectRecord } from '../../lib/costing-store'
import type { ProjectHole } from '../../lib/projects'
import { T, Btn, Modal, Note, Table, inputStyle, th, thR, td, rowLine } from './kit'

/* ==========================================================================
 * COLLARS AND PLANNED DIRECTIONS
 *
 * Every hole on the project in one table: where its collar is, how high, and
 * the azimuth and dip it is planned at. Typed in, or pasted from the plan
 * spreadsheet the geologist already has (hole, then the columns in the order
 * shown), so a whole programme goes in at once.
 * ========================================================================== */

interface Row { id: string; a: string; b: string; rl: string; az: string; dip: string }
const s = (v?: number) => v == null ? '' : String(v)
const n = (v: string) => v.trim() === '' ? undefined : Number(v.replace(',', '.'))

export function HoleSetupModal({ project, holes, plans, only, onClose, onSave }: {
  project: ProjectRecord
  holes: ProjectHole[]
  plans: Record<string, HolePlan>
  only?: string                       // open on one hole
  onClose: () => void
  onSave: (changes: { id: string; patch: Partial<HolePlan> }[], coords: { coords: CoordSystem; utmZone?: string } | null) => void
}) {
  const [coords, setCoords] = useState<CoordSystem>(project.coords ?? 'latlon')
  const [zone, setZone] = useState(project.utmZone ?? '')
  const list = only ? holes.filter(h => h.id === only) : holes
  const initial = (h: ProjectHole): Row => {
    const p = plans[h.id]
    const c = p?.collar
    return { id: h.id, a: coords === 'utm' ? s(c?.easting) : s(c?.lat), b: coords === 'utm' ? s(c?.northing) : s(c?.lon), rl: s(c?.rl), az: s(p?.azimuth), dip: s(p?.dip) }
  }
  const [rows, setRows] = useState<Row[]>(() => list.map(initial))
  const [paste, setPaste] = useState('')
  const [pasteNote, setPasteNote] = useState('')
  const set = (i: number, p: Partial<Row>) => setRows(rs => rs.map((r, j) => j === i ? { ...r, ...p } : r))
  const switchTo = (c: CoordSystem) => { setCoords(c); setRows(list.map(h => { const p = plans[h.id]; const col = p?.collar; return { ...initial(h), a: c === 'utm' ? s(col?.easting) : s(col?.lat), b: c === 'utm' ? s(col?.northing) : s(col?.lon) } })) }

  const problem = (r: Row) => {
    const a = n(r.a), b = n(r.b), az = n(r.az), dip = n(r.dip), rl = n(r.rl)
    const any = [a, b].some(v => v != null)
    if (any && (a == null || b == null || !isFinite(a) || !isFinite(b))) return coords === 'utm' ? 'Enter both easting and northing' : 'Enter both latitude and longitude'
    if (coords === 'latlon' && a != null && Math.abs(a) > 90) return 'Latitude is −90 to 90'
    if (coords === 'latlon' && b != null && Math.abs(b) > 180) return 'Longitude is −180 to 180'
    if (coords === 'utm' && a != null && (a < 100000 || a > 900000)) return 'Easting is usually 6 figures (100 000–900 000)'
    if (rl != null && !isFinite(rl)) return 'Height is not a number'
    if (az != null && !(az >= 0 && az <= 360)) return 'Azimuth is 0 to 360'
    if (dip != null && !(dip >= -90 && dip <= 90)) return 'Dip is −90 (straight down) to 90'
    if ((az == null) !== (dip == null)) return 'Enter both azimuth and dip'
    return ''
  }
  const zoneBad = coords === 'utm' && rows.some(r => r.a.trim() !== '') && !parseZone(zone)
  const changed = rows.filter(r => { const o = initial(list.find(h => h.id === r.id)!); return JSON.stringify(o) !== JSON.stringify(r) })
  const coordsChanged = coords !== (project.coords ?? 'latlon') || (coords === 'utm' && zone.trim().toUpperCase() !== (project.utmZone ?? ''))
  const ok = (changed.length > 0 || coordsChanged) && rows.every(r => !problem(r)) && !zoneBad

  const applyPaste = () => {
    const table = parseTable(paste)
    const byId = new Map(rows.map((r, i) => [r.id.toUpperCase(), i]))
    let hit = 0
    const missed: string[] = []
    const next = [...rows]
    table.forEach(cells => {
      const i = byId.get((cells[0] ?? '').trim().toUpperCase())
      if (i == null) { if (cells[0] && !/hole/i.test(cells[0])) missed.push(cells[0]); return }
      next[i] = { ...next[i], a: cells[1] ?? next[i].a, b: cells[2] ?? next[i].b, rl: cells[3] ?? next[i].rl, az: cells[4] ?? next[i].az, dip: cells[5] ?? next[i].dip }
      hit++
    })
    setRows(next)
    setPasteNote(`${hit} ${hit === 1 ? 'hole' : 'holes'} filled.${missed.length ? ` Not on this project: ${missed.slice(0, 6).join(', ')}${missed.length > 6 ? '…' : ''}.` : ''}`)
    setPaste('')
  }

  const save = () => onSave(changed.map(r => {
    const a = n(r.a), b = n(r.b), rl = n(r.rl)
    const collar = a == null || b == null ? undefined : coords === 'utm' ? { easting: a, northing: b, rl } : { lat: a, lon: b, rl }
    return { id: r.id, patch: { collar, azimuth: n(r.az), dip: n(r.dip) } }
  }), coordsChanged ? { coords, utmZone: coords === 'utm' ? zone.trim().toUpperCase() : undefined } : null)

  const where = (r: Row) => {
    const a = n(r.a), b = n(r.b)
    if (a == null || b == null) return null
    const ll = collarLatLon(coords === 'utm' ? { easting: a, northing: b } : { lat: a, lon: b }, coords, zone)
    return ll ? `${ll.lat.toFixed(5)}, ${ll.lon.toFixed(5)}` : null
  }
  const cell: React.CSSProperties = { ...inputStyle, padding: '6px 8px', textAlign: 'right', fontSize: 12.5 }

  return (
    <Modal title={only ? `Collar and direction of ${only}` : 'Collars and planned directions'} width={only ? 760 : 1000} onClose={onClose}
      subtitle="Dip is the angle from flat, negative going down: −90 is straight down, −60 a common angled hole. Azimuth is the compass bearing, 0–360."
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={!ok} onClick={save}>Save{changed.length > 1 ? ` ${changed.length} holes` : ''}</Btn></>}>
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 600, color: T.faint }}>
            Collars on this project are written as
            <select value={coords} onChange={e => switchTo(e.target.value as CoordSystem)} style={{ ...inputStyle, width: 280, cursor: 'pointer' }}>
              <option value="latlon">Latitude / longitude (degrees)</option>
              <option value="utm">UTM easting / northing (metres)</option>
            </select>
          </label>
          {coords === 'utm' && (
            <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 600, color: T.faint }}>
              UTM zone
              <input value={zone} onChange={e => setZone(e.target.value)} placeholder="e.g. 43N" style={{ ...inputStyle, width: 110 }} aria-label="UTM zone" />
            </label>
          )}
          <span style={{ fontSize: 12, color: T.faint, paddingBottom: 9 }}>{coords === 'utm' ? 'Saudi Arabia is zones 36N–40N; India mostly 42N–46N.' : 'As a GPS or Google Maps gives them, e.g. 23.48120, 40.86210.'}</span>
        </div>
        {zoneBad && <Note tone="warn">Enter the UTM zone, for example 43N, so the holes can be put on the map.</Note>}

        <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            <Table>
              <thead><tr>
                <th style={th}>Hole</th>
                <th style={thR}>{coords === 'utm' ? 'Easting, m' : 'Latitude'}</th><th style={thR}>{coords === 'utm' ? 'Northing, m' : 'Longitude'}</th>
                <th style={thR}>Height (RL), m</th><th style={thR}>Azimuth, °</th><th style={thR}>Dip, °</th><th style={th}>On the map at</th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} style={{ borderBottom: rowLine }}>
                    <td style={{ ...td, color: T.text, fontWeight: 600 }}>{r.id}{problem(r) && <div style={{ fontSize: 11.5, fontWeight: 400, color: T.amber, whiteSpace: 'normal', maxWidth: 180 }}>{problem(r)}</div>}</td>
                    <td style={{ ...td, width: 130 }}><input value={r.a} onChange={e => set(i, { a: e.target.value })} style={cell} aria-label={`${r.id} ${coords === 'utm' ? 'easting' : 'latitude'}`} /></td>
                    <td style={{ ...td, width: 130 }}><input value={r.b} onChange={e => set(i, { b: e.target.value })} style={cell} aria-label={`${r.id} ${coords === 'utm' ? 'northing' : 'longitude'}`} /></td>
                    <td style={{ ...td, width: 100 }}><input value={r.rl} onChange={e => set(i, { rl: e.target.value })} style={cell} aria-label={`${r.id} height`} /></td>
                    <td style={{ ...td, width: 90 }}><input value={r.az} onChange={e => set(i, { az: e.target.value })} placeholder="e.g. 60" style={cell} aria-label={`${r.id} azimuth`} /></td>
                    <td style={{ ...td, width: 90 }}><input value={r.dip} onChange={e => set(i, { dip: e.target.value })} placeholder="e.g. −60" style={cell} aria-label={`${r.id} dip`} /></td>
                    <td style={{ ...td, fontSize: 12, color: T.faint }}>{where(r) ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </div>

        {!only && (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 12.5, color: T.muted }}>Or paste from a spreadsheet: one hole a line, in this order: hole, {coords === 'utm' ? 'easting, northing' : 'latitude, longitude'}, height, azimuth, dip.</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <textarea value={paste} onChange={e => setPaste(e.target.value)} rows={3} placeholder={coords === 'utm' ? 'DH-001\t735120.5\t2695410.2\t548\t135\t-70' : 'DH-001\t14.22512\t76.39821\t712\t60\t-60'}
                style={{ ...inputStyle, flex: '1 1 420px', fontFamily: 'ui-monospace, monospace', fontSize: 12 }} aria-label="Paste collars" />
              <Btn disabled={!paste.trim()} onClick={applyPaste}>Fill the table</Btn>
            </div>
            {pasteNote && <div style={{ fontSize: 12.5, color: T.muted }}>{pasteNote}</div>}
          </div>
        )}
      </div>
    </Modal>
  )
}

/* "60° / −60°" or "Not set", for a table cell. */
export function directionWords(p?: HolePlan) {
  if (!p || p.azimuth == null || p.dip == null) return null
  return `${Math.round(p.azimuth * 10) / 10}° · ${p.dip > 0 ? '+' : p.dip < 0 ? '−' : ''}${Math.abs(Math.round(p.dip * 10) / 10)}°`
}
