import type { Bin, Break, Span, TrayRow } from './engine'

/* ==========================================================================
 * XPLORIX CORE — the record
 *
 *   Project → Hole → Shift log (XPLORIX Drill) → Tray photo → Rows →
 *   Spans (core, no core, depth blocks) → Breaks and 5 cm bins
 *
 * The shift log already exists: the driller wrote it at the rig. A tray photo
 * is tied to the shifts that drilled its depths before anyone looks at it, so
 * every number measured on the photo sits beside how that core was drilled.
 * ========================================================================== */

export interface CoreBin extends Bin { cls: number }       // rock class found from colour and texture
export interface CoreTray {
  id: string                 // e.g. DH-961-T05
  hole: string
  no: number
  file: string               // under /core/photos/<hole>/ — 400 px wide, what the photo step measured
  hd?: string                // the same tray, full size, for the tray screens
  from: number
  to: number
  usedTo: number
  w: number
  h: number
  rows: TrayRow[]
  spans: Span[]
  breaks: Break[]
  bins: CoreBin[]
  rowConfidence: 'high' | 'medium' | 'low'
  notes: string[]
  shiftIds: string[]         // the shift logs that drilled these depths
  takenAt: string            // when the photo was taken (demo: the shift that drilled the tray's end)
  takenBy: string
  source?: 'archive' | 'upload'
}

export interface CoreHole {
  hole: string
  project: string
  rig: string
  holeSize: string
  drilled: number
  photographedTo: number
  source: { name: string; hole: string; licence: string; shift: number }
  trays: CoreTray[]
}

export interface RockClassCentre { id: number; L: number; a: number; b: number; tex: number; vein: number; ox: number; hex: string; share: number }

export interface CoreIndex {
  generatedAt: string
  holes: { hole: string; project: string; rig: string; drilled: number; photographedTo: number; trays: number; source: string }[]
  classes: RockClassCentre[]
  scale: { L: [number, number]; a: [number, number]; b: [number, number]; tex: [number, number]; vein: [number, number]; ox: [number, number] }
}

/* What the geologist decides. Every change is kept with who and when; in the
 * real build it is what the model learns from. */
export type BreakVerdict = 'natural' | 'handling' | 'none'
export type GapVerdict = 'lost' | 'sampled' | 'core'
export interface Change { at: string; by: string; what: string }
export interface AddedBreak { id: string; tray: string; row: number; x: number; at: number; alpha: number; kind: 'natural' | 'handling' }
