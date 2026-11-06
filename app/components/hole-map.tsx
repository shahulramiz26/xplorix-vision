'use client'

import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'
import { T } from './kit'

/* ==========================================================================
 * THE HOLES ON A MAP
 *
 * Each collar as a dot on OpenStreetMap, coloured by where the hole stands.
 * A planned hole is an open ring, a hole drilling is filled orange, a
 * finished hole is filled green. Clicking a hole opens it. The map is free:
 * no key and no account, as long as the OpenStreetMap credit stays on it.
 * ========================================================================== */

export interface MapHole {
  id: string
  lat: number; lon: number
  status: 'planned' | 'drilling' | 'done'
  label: string                 // shown when the pointer is on the hole
  href?: string
  trace?: { lat: number; lon: number }[]   // the hole's path seen from above, when surveyed
}

export const MAP_COLOURS = { planned: '#64748B', drilling: '#F97316', done: '#16A34A' }

export function HoleMap({ holes, height = 440, onOpen }: { holes: MapHole[]; height?: number; onOpen?: (h: MapHole) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<import('leaflet').Map | null>(null)
  const layer = useRef<import('leaflet').LayerGroup | null>(null)
  const open = useRef(onOpen)
  open.current = onOpen

  useEffect(() => {
    let gone = false
    void import('leaflet').then(L => {
      if (gone || !box.current || map.current) return
      const m = L.map(box.current, { zoomControl: true, scrollWheelZoom: false, attributionControl: true })
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(m)
      map.current = m
      layer.current = L.layerGroup().addTo(m)
      draw(L)
    })
    return () => { gone = true; map.current?.remove(); map.current = null; layer.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { void import('leaflet').then(L => draw(L)) }, [holes]) // eslint-disable-line react-hooks/exhaustive-deps

  function draw(L: typeof import('leaflet')) {
    const m = map.current, g = layer.current
    if (!m || !g) return
    g.clearLayers()
    holes.forEach(h => {
      const c = MAP_COLOURS[h.status]
      if (h.trace && h.trace.length > 1) L.polyline(h.trace.map(p => [p.lat, p.lon] as [number, number]), { color: c, weight: 3, opacity: 0.85 }).addTo(g)
      const dot = L.circleMarker([h.lat, h.lon], {
        radius: 8, color: c, weight: 2.5, fillColor: h.status === 'planned' ? '#ffffff' : c, fillOpacity: h.status === 'planned' ? 0.9 : 0.9,
      }).addTo(g)
      dot.bindTooltip(`<b>${h.id}</b><br/>${h.label}`, { direction: 'top', offset: [0, -6] })
      L.marker([h.lat, h.lon], { icon: L.divIcon({ className: '', html: `<span style="font:600 11px Inter,sans-serif;color:#1f2937;background:rgba(255,255,255,.85);padding:1px 4px;border-radius:4px;white-space:nowrap">${h.id}</span>`, iconAnchor: [-10, 6] }), interactive: false }).addTo(g)
      dot.on('click', () => { if (open.current) open.current(h); else if (h.href) window.location.href = h.href })
    })
    if (holes.length) {
      const b = L.latLngBounds(holes.flatMap(h => [[h.lat, h.lon] as [number, number], ...(h.trace ?? []).map(p => [p.lat, p.lon] as [number, number])]))
      m.fitBounds(b.pad(0.25), { maxZoom: 17 })
    } else m.setView([20, 78], 4)
  }

  return <div ref={box} style={{ height, width: '100%', borderRadius: 10, overflow: 'hidden', border: `1px solid ${T.border}`, background: '#e5e7eb', zIndex: 0, position: 'relative' }} />
}

export function MapLegend() {
  const dot = (c: string, filled: boolean, label: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 12, height: 12, borderRadius: '50%', border: `2.5px solid ${c}`, background: filled ? c : '#fff' }} />{label}
    </span>
  )
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: T.muted }}>
      {dot(MAP_COLOURS.planned, false, 'Planned')}{dot(MAP_COLOURS.drilling, true, 'Drilling')}{dot(MAP_COLOURS.done, true, 'Finished')}
      <span>The line from a hole is its path seen from above, from the survey.</span>
    </div>
  )
}
