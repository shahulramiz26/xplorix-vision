'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CoreTray } from '../../lib/core/model'
import type { IntervalResult } from '../../lib/core/geotech'
import { WEATHERING, rqdClass, gsiClass } from '../../lib/core/geotech'
import { useCore, className } from '../../lib/core/store'
import { T, tint, mono } from './kit'
import { photoSrc, classHex, pct, type StripDrill } from './core-ui'

/* ==========================================================================
 * STRIP LOG — the hole on one depth scale, read like a well log.
 *
 * Left group, from the tray photos: the core itself (photo slices laid down
 * the hole), rock class, recovery and RQD, fractures, GSI, weathering.
 * Right group, from the shift logs: drilling rate against normal, who
 * drilled, stops. One crosshair reads every track at the same depth; click
 * opens the tray at that depth.
 * ========================================================================== */

const WEATH_HEX = ['', '#CFE3D3', '#E7D9A2', '#D8A25A', '#B4652E', '#77391B']
const DRILLER_HEX = ['#5B8DEF', '#E46A9B', '#3FB68B', '#E9A23B', '#9B6BD3', '#3BB0B8']

interface Track { key: string; label: string; scale?: [string, string, string?]; w: number; group: 'core' | 'drill' | 'other' }

/* Logs from the other data, laid beside the core when there is any. */
export interface StripExtra { manual?: { from: number; to: number; hex: string; lith: string }[]; au?: { from: number; to: number; v: number }[]; domain?: { from: number; to: number; hex: string; name: string }[] }

const SCALES = [{ px: 6, label: 'Whole hole' }, { px: 20, label: '10 m view' }, { px: 60, label: 'Close up' }]

export function StripLog({ rows, drill, trays, hole, extra }: { rows: IntervalResult[]; drill: StripDrill[]; trays: CoreTray[]; hole: string; extra?: StripExtra }) {
  const [pxPerM, setPx] = useState(6)
  const photo = pxPerM >= 15      // below this a 1 m row is a few pixels: show its colour instead
  const { review, index } = useCore()
  const router = useRouter()
  const box = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<{ d: number; y: number; x: number } | null>(null)

  const top = Math.floor(Math.min(rows[0]?.from ?? 0, ...drill.map(d => d.from)))
  const bottom = Math.ceil(Math.max(rows[rows.length - 1]?.to ?? 0, ...drill.map(d => d.to)))
  const HEAD = 70
  const H = (bottom - top) * pxPerM
  const y = (d: number) => HEAD + (d - top) * pxPerM
  const maxRate = Math.max(0.5, ...drill.map(d => Math.max(d.rate, d.normal))) * 1.15

  const tracks: Track[] = [
    { key: 'core', label: 'Core', w: 46, group: 'core' },
    { key: 'cls', label: 'Class', w: 34, group: 'core' },
    { key: 'qual', label: 'Recovery · RQD', scale: ['0', '50', '100%'], w: 130, group: 'core' },
    { key: 'inc', label: 'Incoherence', scale: ['0', '0.5', '1'], w: 70, group: 'core' },
    { key: 'ff', label: 'Fractures /m', scale: ['0', '10', '20'], w: 96, group: 'core' },
    { key: 'gsi', label: 'GSI proxy', scale: ['0', '50', '100'], w: 96, group: 'core' },
    { key: 'wth', label: 'Weath.', w: 26, group: 'core' },
    { key: 'rate', label: 'Drill rate m/h', scale: ['0', (maxRate / 2).toFixed(1), maxRate.toFixed(1)], w: 120, group: 'drill' },
    { key: 'drl', label: 'Driller', w: 34, group: 'drill' },
    { key: 'stop', label: 'Stops', w: 36, group: 'drill' },
    { key: 'tray', label: 'Trays', w: 46, group: 'drill' },
    ...(extra?.manual ? [{ key: 'man', label: 'Hand log', w: 34, group: 'other' as const }] : []),
    ...(extra?.domain ? [{ key: 'dom', label: 'Domain', w: 34, group: 'other' as const }] : []),
    ...(extra?.au ? [{ key: 'au', label: 'Au g/t', scale: ['0.01', '0.1', '10'] as [string, string, string], w: 90, group: 'other' as const }] : []),
  ]
  const GAP = 8, GROUP_GAP = 26, LEFT = 46
  const xs: Record<string, number> = {}
  let cx = LEFT
  tracks.forEach((t, i) => {
    if (i > 0 && tracks[i - 1].group !== t.group) cx += GROUP_GAP - GAP
    xs[t.key] = cx
    cx += t.w + GAP
  })
  const W = cx + 4
  const tr = (k: string) => tracks.find(t => t.key === k)!

  const drillers = useMemo(() => Array.from(new Set(drill.map(d => d.driller))), [drill])
  const dHex = (n: string) => DRILLER_HEX[drillers.indexOf(n) % DRILLER_HEX.length]

  /* Step curves: one value per interval, drawn as a staircase down the hole. */
  const step = (items: { from: number; to: number; v: number }[], x0: number, w: number, max: number) => {
    let line = '', area = ''
    let prevTo: number | null = null
    let seg: { from: number; to: number; v: number }[] = []
    const flush = () => {
      if (!seg.length) return
      const X = (v: number) => x0 + Math.max(0, Math.min(1, v / max)) * w
      let p = `M${X(seg[0].v)},${y(seg[0].from)}`
      seg.forEach((s, i) => { if (i) p += `H${X(s.v)}`; p += `V${y(s.to)}` })
      line += p
      area += `M${x0},${y(seg[0].from)}H${X(seg[0].v)}` + p.slice(p.indexOf('V')) + `H${x0}Z`
      seg = []
    }
    items.forEach(s => {
      if (prevTo != null && s.from - prevTo > 0.05) flush()
      seg.push(s); prevTo = s.to
    })
    flush()
    return { line, area }
  }

  const rec = step(rows.map(r => ({ from: r.from, to: r.to, v: r.recovery })), xs.qual, tr('qual').w, 100)
  const rqd = step(rows.map(r => ({ from: r.from, to: r.to, v: r.rqd })), xs.qual, tr('qual').w, 100)
  const rqdW = step(rows.map(r => ({ from: r.from, to: r.to, v: r.rqdWjd })), xs.qual, tr('qual').w, 100)
  // Incoherence: how broken the core is, 0 whole to 1 rubble — every break and every gap, not only natural ones
  const inc = step(rows.map(r => ({ from: r.from, to: r.to, v: Math.min(1, (r.natural + r.handling) / Math.max(0.2, r.recovered) / 25 + (1 - r.recovery / 100)) })), xs.inc, tr('inc').w, 1)
  const auLog = (v: number) => Math.max(0, Math.min(3, Math.log10(Math.max(0.01, v)) + 2))
  const au = extra?.au ? step(extra.au.map(a => ({ from: a.from, to: a.to, v: auLog(a.v) })), xs.au, tr('au').w, 3) : null
  const ff = step(rows.map(r => ({ from: r.from, to: r.to, v: r.ff })), xs.ff, tr('ff').w, 20)
  const gsi = step(rows.map(r => ({ from: r.from, to: r.to, v: r.gsi })), xs.gsi, tr('gsi').w, 100)
  const rate = step(drill.map(d => ({ from: d.from, to: d.to, v: d.rate })), xs.rate, tr('rate').w, maxRate)
  const norm = step(drill.map(d => ({ from: d.from, to: d.to, v: d.normal })), xs.rate, tr('rate').w, maxRate)

  // drillers merged into runs
  const runs = useMemo(() => {
    const out: { from: number; to: number; driller: string; n: number }[] = []
    drill.forEach(d => {
      const last = out[out.length - 1]
      if (last && last.driller === d.driller && d.from - last.to < 0.5) { last.to = d.to; last.n++ }
      else out.push({ from: d.from, to: d.to, driller: d.driller, n: 1 })
    })
    return out
  }, [drill])

  const ticks: number[] = []
  for (let d = Math.ceil(top / 10) * 10; d <= bottom; d += 10) ticks.push(d)
  const minor: number[] = []
  for (let d = Math.ceil(top / 5) * 5; d <= bottom; d += 5) if (d % 10) minor.push(d)

  // what the crosshair reads
  const read = at ? {
    r: rows.find(r => at.d >= r.from && at.d < r.to),
    s: drill.find(s => at.d >= s.from && at.d < s.to),
    t: trays.find(t => at.d >= t.from && at.d < t.usedTo),
  } : null

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
    const py = e.clientY - r.top, px = e.clientX - r.left
    const d = top + (py - HEAD) / pxPerM
    if (d < top || d > bottom) { setAt(null); return }
    setAt({ d, y: py, x: px })
  }

  const frame = (k: string, fill = tint(T.faint, 6)) => <rect x={xs[k]} y={HEAD} width={tr(k).w} height={H} fill={fill} stroke={T.line} strokeWidth={1} />

  return (
    <div ref={box} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: T.faint }}>Scale</span>
        <div role="tablist" style={{ display: 'inline-flex', gap: 3, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 9, padding: 3 }}>
          {SCALES.map(s => (
            <button key={s.px} role="tab" aria-selected={pxPerM === s.px} onClick={() => setPx(s.px)} style={{
              padding: '5px 11px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', fontFamily: 'inherit',
              background: pxPerM === s.px ? tint(T.orange, 16) : 'transparent', color: pxPerM === s.px ? T.text : T.faint,
            }}>{s.label}</button>
          ))}
        </div>
        <span style={{ fontSize: 12, color: T.faint }}>{photo ? 'The core column shows the tray photos, laid down the hole.' : 'Zoom in to see the tray photos in the core column.'}</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <svg width={W} height={HEAD + H + 8} style={{ display: 'block', cursor: 'crosshair', fontFamily: 'inherit' }} role="img"
          aria-label={`Strip log of ${hole}: core from the tray photos beside the drilling record`}
          onMouseMove={onMove} onMouseLeave={() => setAt(null)}
          onClick={() => { if (read?.t) router.push(`/admin/geology/trays/${read.t.id}`) }}>
          <defs>
            {photo && trays.flatMap(t => t.spans.filter(s => s.kind === 'core').map(s => {
              const r = t.rows[s.row]
              return <clipPath key={`c-${t.id}-${s.row}-${s.x0}`} id={`c-${t.id}-${s.row}-${s.x0}`} clipPathUnits="userSpaceOnUse"><rect x={s.x0} y={r.band[0]} width={s.x1 - s.x0} height={r.band[1] - r.band[0]} /></clipPath>
            }))}
          </defs>

          {/* group headings */}
          <text x={xs.core} y={14} fontSize={10.5} fontWeight={700} letterSpacing="0.08em" fill={T.orange}>FROM THE TRAY PHOTOS</text>
          <line x1={xs.core} x2={xs.wth + tr('wth').w} y1={20} y2={20} stroke={tint(T.orange, 50)} />
          <text x={xs.rate} y={14} fontSize={10.5} fontWeight={700} letterSpacing="0.08em" fill={T.muted}>FROM THE SHIFT LOGS</text>
          <line x1={xs.rate} x2={xs.tray + tr('tray').w} y1={20} y2={20} stroke={T.line} />
          {tracks.some(t => t.group === 'other') && (() => { const o = tracks.filter(t => t.group === 'other'); return <>
            <text x={xs[o[0].key]} y={14} fontSize={10.5} fontWeight={700} letterSpacing="0.08em" fill={T.muted}>OTHER DATA</text>
            <line x1={xs[o[0].key]} x2={xs[o[o.length - 1].key] + o[o.length - 1].w} y1={20} y2={20} stroke={T.line} />
          </> })()}

          {/* track labels and scales */}
          {tracks.map(t => (
            <g key={t.key}>
              <text x={xs[t.key]} y={38} fontSize={11.5} fontWeight={700} fill={T.text}>{t.label}</text>
              {t.scale && <>
                <text x={xs[t.key]} y={HEAD - 8} fontSize={9.5} fill={T.faint} style={{ fontFamily: mono }}>{t.scale[0]}</text>
                <text x={xs[t.key] + t.w / 2} y={HEAD - 8} fontSize={9.5} fill={T.faint} textAnchor="middle" style={{ fontFamily: mono }}>{t.scale[1]}</text>
                <text x={xs[t.key] + t.w} y={HEAD - 8} fontSize={9.5} fill={T.faint} textAnchor="end" style={{ fontFamily: mono }}>{t.scale[2]}</text>
              </>}
            </g>
          ))}
          <text x={xs.qual} y={52} fontSize={9.5} fill={T.faint}><tspan fill="#1F9D6B">■</tspan> RQD <tspan fill="#0B6E4F">┄</tspan> pred. <tspan fill={T.text}>━</tspan> rec.</text>
          <text x={xs.rate} y={52} fontSize={9.5} fill={T.faint}><tspan fill="#3E7BFA">━</tspan> rate  <tspan fill={T.muted}>┄</tspan> normal  <tspan fill={T.orange}>■</tspan> fast</text>

          {/* depth grid */}
          {minor.map(d => <line key={`m${d}`} x1={LEFT} x2={W - 4} y1={y(d)} y2={y(d)} stroke={tint(T.faint, 10)} />)}
          {ticks.map(d => (
            <g key={d}>
              <line x1={LEFT - 6} x2={W - 4} y1={y(d)} y2={y(d)} stroke={tint(T.faint, 22)} />
              <text x={LEFT - 10} y={y(d) + 3.5} fontSize={10.5} textAnchor="end" fill={T.muted} style={{ fontFamily: mono }}>{d}</text>
            </g>
          ))}
          <text x={LEFT - 10} y={HEAD - 8} fontSize={9.5} textAnchor="end" fill={T.faint}>m</text>

          {/* core photo slices, laid down the hole */}
          {frame('core', '#1b1b1b')}
          {!photo && rows.map(r => <rect key={`cc${r.from}`} x={xs.core} y={y(r.from)} width={tr('core').w} height={Math.max(1, y(r.to) - y(r.from))} fill={r.hex} />)}
          {photo && trays.flatMap(t => t.spans.filter(s => s.kind === 'core').map(s => {
            const r = t.rows[s.row]
            const bh = r.band[1] - r.band[0]
            const k = (y(s.to) - y(s.from)) / Math.max(1, s.x1 - s.x0)
            const c = tr('core').w / bh
            const e = xs.core - r.band[0] * c, f = y(s.from) - s.x0 * k
            return (
              <g key={`p-${t.id}-${s.row}-${s.x0}`} transform={`matrix(0,${k},${c},0,${e},${f})`}>
                <image href={photoSrc(t)} x={0} y={0} width={t.w} height={t.h} preserveAspectRatio="none" clipPath={`url(#c-${t.id}-${s.row}-${s.x0})`} />
              </g>
            )
          }))}

          {/* rock class */}
          {frame('cls')}
          {rows.map(r => <rect key={`k${r.from}`} x={xs.cls} y={y(r.from)} width={tr('cls').w} height={Math.max(1, y(r.to) - y(r.from))} fill={classHex(r.cls, index?.classes)} />)}

          {/* recovery and RQD */}
          {frame('qual')}
          <line x1={xs.qual + tr('qual').w / 2} x2={xs.qual + tr('qual').w / 2} y1={HEAD} y2={HEAD + H} stroke={tint(T.faint, 18)} strokeDasharray="2 3" />
          {rows.filter(r => r.recovery < 90).map(r => <rect key={`lr${r.from}`} x={xs.qual} y={y(r.from)} width={tr('qual').w} height={Math.max(1, y(r.to) - y(r.from))} fill={tint(T.red, 16)} />)}
          <path d={rqd.area} fill={tint('#1F9D6B', 24)} />
          <path d={rqd.line} fill="none" stroke="#1F9D6B" strokeWidth={1} />
          <path d={rqdW.line} fill="none" stroke="#0B6E4F" strokeWidth={1} strokeDasharray="3 2" />
          <path d={rec.line} fill="none" stroke={T.text} strokeWidth={1.4} />

          {/* incoherence */}
          {frame('inc')}
          <path d={inc.area} fill={tint('#E5484D', 18)} />
          <path d={inc.line} fill="none" stroke="#E5484D" strokeWidth={1.1} />

          {/* fractures */}
          {frame('ff')}
          <line x1={xs.ff + tr('ff').w / 2} x2={xs.ff + tr('ff').w / 2} y1={HEAD} y2={HEAD + H} stroke={tint(T.faint, 18)} strokeDasharray="2 3" />
          <path d={ff.area} fill={tint('#8E4EC6', 20)} />
          <path d={ff.line} fill="none" stroke="#8E4EC6" strokeWidth={1.2} />

          {/* GSI, over the class bands */}
          {frame('gsi')}
          {[[0, 35, 'Poor'], [35, 55, 'Fair'], [55, 75, 'Good'], [75, 100, 'V. good']].map(([a, b], i) => (
            <rect key={`gb${i}`} x={xs.gsi + (Number(a) / 100) * tr('gsi').w} y={HEAD} width={((Number(b) - Number(a)) / 100) * tr('gsi').w} height={H} fill={i % 2 ? tint(T.faint, 7) : 'transparent'} />
          ))}
          <path d={gsi.area} fill={tint('#12A594', 14)} />
          <path d={gsi.line} fill="none" stroke="#12A594" strokeWidth={1.3} />

          {/* weathering */}
          {frame('wth')}
          {rows.map(r => <rect key={`w${r.from}`} x={xs.wth} y={y(r.from)} width={tr('wth').w} height={Math.max(1, y(r.to) - y(r.from))} fill={WEATH_HEX[r.weathering] ?? 'transparent'} />)}

          {/* drilling rate against normal; fast stretches filled */}
          {frame('rate')}
          {drill.filter(d => d.rate > d.normal * 1.2).map(d => {
            const X = (v: number) => xs.rate + Math.min(1, v / maxRate) * tr('rate').w
            return <rect key={`f${d.from}`} x={X(d.normal)} y={y(d.from)} width={X(d.rate) - X(d.normal)} height={Math.max(1, y(d.to) - y(d.from))} fill={tint(T.orange, 45)} />
          })}
          <path d={norm.line} fill="none" stroke={T.muted} strokeWidth={1} strokeDasharray="3 3" />
          <path d={rate.line} fill="none" stroke="#3E7BFA" strokeWidth={1.5} />

          {/* drillers */}
          {frame('drl')}
          {runs.map((r, i) => (
            <g key={`d${i}`}>
              <rect x={xs.drl + 3} y={y(r.from) + 0.5} width={tr('drl').w - 6} height={Math.max(1, y(r.to) - y(r.from) - 1)} rx={3} fill={tint(dHex(r.driller), 70)} />
              {y(r.to) - y(r.from) > 18 && <text x={xs.drl + tr('drl').w / 2} y={(y(r.from) + y(r.to)) / 2 + 3.5} fontSize={9.5} fontWeight={700} textAnchor="middle" fill="#fff">{r.driller.split(' ').map(p => p[0]).join('')}</text>}
            </g>
          ))}

          {/* stops */}
          {frame('stop')}
          {drill.filter(d => d.downtime > 0).map(d => {
            const cy = (y(d.from) + y(d.to)) / 2
            return (
              <g key={`s${d.from}`}>
                <circle cx={xs.stop + 11} cy={cy} r={Math.min(9, 3 + d.downtime / 2)} fill={tint(T.amber, 75)} stroke={T.amber} />
                <text x={xs.stop + 22} y={cy + 3.5} fontSize={9} fill={T.muted}>{d.downtime}h</text>
              </g>
            )
          })}

          {/* trays */}
          {trays.map(t => {
            const ok = !!review.checked[t.id]
            const h = y(t.usedTo) - y(t.from)
            return (
              <g key={t.id}>
                <rect x={xs.tray} y={y(t.from) + 0.5} width={tr('tray').w} height={Math.max(2, h - 1)} rx={3}
                  fill={ok ? tint(T.green, 22) : tint(T.amber, 16)} stroke={ok ? T.green : tint(T.amber, 70)} strokeWidth={0.8} />
                {h > 12 && <text x={xs.tray + tr('tray').w / 2} y={y(t.from) + h / 2 + 3.5} fontSize={9.5} textAnchor="middle" fill={T.text}>T{t.no}{ok ? ' ✓' : ''}</text>}
              </g>
            )
          })}

          {/* other data */}
          {extra?.manual && <>{frame('man')}{extra.manual.map(m => <rect key={`mn${m.from}`} x={xs.man} y={y(m.from)} width={tr('man').w} height={Math.max(1, y(m.to) - y(m.from))} fill={m.hex}><title>{m.from}–{m.to} m · {m.lith}</title></rect>)}</>}
          {extra?.domain && <>{frame('dom')}{extra.domain.map(m => <rect key={`dm${m.from}`} x={xs.dom} y={y(m.from)} width={tr('dom').w} height={Math.max(1, y(m.to) - y(m.from))} fill={m.hex}><title>{m.name}</title></rect>)}</>}
          {au && <>{frame('au')}<path d={au.area} fill={tint('#C99A00', 22)} /><path d={au.line} fill="none" stroke="#C99A00" strokeWidth={1.2} /></>}

          {/* crosshair */}
          {at && <>
            <line x1={LEFT} x2={W - 4} y1={at.y} y2={at.y} stroke={T.orange} strokeWidth={1} />
            <rect x={0} y={at.y - 9} width={LEFT - 4} height={18} rx={4} fill={T.orange} />
            <text x={LEFT - 8} y={at.y + 4} fontSize={10.5} fontWeight={700} textAnchor="end" fill="#fff" style={{ fontFamily: mono }}>{at.d.toFixed(1)}</text>
          </>}
        </svg>
      </div>

      {at && read && (read.r || read.s) && (
        <div style={{
          position: 'absolute', pointerEvents: 'none', left: Math.min(at.x + 16, (box.current?.clientWidth ?? 600) - 260), top: Math.max(0, at.y - 10),
          width: 244, background: 'var(--x-panel, #fff)', border: `1px solid ${T.border}`, borderRadius: 10, padding: '10px 12px',
          boxShadow: '0 10px 30px rgba(0,0,0,.12)', fontSize: 12, color: T.muted, lineHeight: 1.6, zIndex: 2,
        }}>
          <div style={{ fontWeight: 700, color: T.text, marginBottom: 2 }}>{hole} · {at.d.toFixed(2)} m</div>
          {read.r && <>
            <div>{className(review, read.r.cls)} · {WEATHERING[read.r.weathering]?.toLowerCase()}</div>
            <div>Recovery <b style={{ color: T.text }}>{pct(read.r.recovery)}</b> · RQD <b style={{ color: T.text }}>{pct(read.r.rqd)}</b> ({rqdClass(read.r.rqd).toLowerCase()})</div>
            <div>{read.r.ff.toFixed(1)} fractures /m · GSI {read.r.gsi} ({gsiClass(read.r.gsi).toLowerCase()})</div>
            <div>RQD from joint density {pct(read.r.rqdWjd)}</div>
            {(() => { const m = extra?.manual?.find(x => at.d >= x.from && at.d < x.to), a = extra?.au?.find(x => at.d >= x.from && at.d < x.to); return m || a ? <div>{m ? `Logged ${m.lith}` : ''}{m && a ? ' · ' : ''}{a ? `Au ${a.v.toFixed(2)} g/t` : ''}</div> : null })()}
          </>}
          {read.s && <div style={{ borderTop: `1px solid ${T.line}`, marginTop: 6, paddingTop: 6 }}>
            {read.s.date} {read.s.shift.toLowerCase()} · {read.s.driller}<br />
            {read.s.rate.toFixed(2)} m/h <span style={{ color: read.s.rate > read.s.normal * 1.2 ? T.orange : T.faint }}>(normal {read.s.normal.toFixed(2)})</span>
            {read.s.downtime > 0 && <><br /><span style={{ color: T.amber }}>{read.s.downtime} h stopped: {read.s.reason}</span></>}
          </div>}
          {read.t && <div style={{ marginTop: 6, color: T.orange, fontWeight: 600 }}>Click to open tray {read.t.no}</div>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 11.5, color: T.faint, marginTop: 10, alignItems: 'center' }}>
        <span>Drillers: {drillers.map(d => <span key={d} style={{ marginRight: 10, whiteSpace: 'nowrap' }}><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: dHex(d), marginRight: 4 }} />{d}</span>)}</span>
        <span>Weathering: {[1, 2, 3, 4, 5].map(g => <span key={g} style={{ marginRight: 8, whiteSpace: 'nowrap' }}><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: WEATH_HEX[g], marginRight: 4 }} />{g}</span>)}</span>
        <span><span style={{ display: 'inline-block', width: 9, height: 9, background: tint(T.red, 30), marginRight: 4 }} />under 90% recovery</span>
      </div>
    </div>
  )
}
