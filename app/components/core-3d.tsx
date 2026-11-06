'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

/* ==========================================================================
 * XPLORIX CORE — 3D VIEW
 *
 * Every hole drawn along its surveyed path, to scale, in the ground. The
 * tube is coloured by whatever the page asks for: the core photos laid down
 * the hole, rock class, RQD, recovery, fractures, or the drilling (rate,
 * driller). Moving over a hole reports the hole and the depth under the
 * pointer; clicking pins it. Everything here is drawing: the page decides
 * what each metre looks like and passes it in as a strip of colours or an
 * image along the depth.
 * ========================================================================== */

export interface Hole3D {
  id: string
  /* collar position in metres from the project origin: east, north, height */
  x: number; y: number; z: number
  path: { depth: number; e: number; n: number; tvd: number }[]
  planned?: { e: number; n: number; tvd: number }[]
  drilled: number
  /* what the tube shows: a canvas whose width runs along the depth, 0 → drilled */
  skin: HTMLCanvasElement
}

export interface Pick3D { hole: string; depth: number; sx: number; sy: number }

const RADIUS = 2.4     // metres: drawn far wider than real core so it reads at site scale

function pointAt(path: Hole3D['path'], d: number) {
  if (d <= path[0].depth) return path[0]
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i]
    if (d <= b.depth) { const t = (d - a.depth) / (b.depth - a.depth || 1); return { e: a.e + (b.e - a.e) * t, n: a.n + (b.n - a.n) * t, tvd: a.tvd + (b.tvd - a.tvd) * t } }
  }
  return path[path.length - 1]
}

class HoleCurve extends THREE.Curve<THREE.Vector3> {
  constructor(private h: Hole3D) { super() }
  getPoint(u: number, out = new THREE.Vector3()) {
    const p = pointAt(this.h.path, u * this.h.drilled)
    return out.set(this.h.x + p.e, this.h.y - p.tvd, -(this.h.z + p.n))
  }
}

function label(text: string) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64
  const g = c.getContext('2d')!
  g.font = '600 34px Inter, system-ui, sans-serif'
  const w = g.measureText(text).width + 28
  g.fillStyle = 'rgba(255,255,255,.92)'; g.beginPath(); g.roundRect((256 - w) / 2, 8, w, 48, 12); g.fill()
  g.fillStyle = '#17120E'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 33)
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }))
  s.scale.set(40, 10, 1); s.renderOrder = 10
  return s
}

export function Core3D({ holes, showPlan, focus, pinned, onHover, onPick, height = 620 }: {
  holes: Hole3D[]; showPlan: boolean; focus?: string | null; pinned?: Pick3D | null
  onHover: (p: Pick3D | null) => void; onPick: (p: Pick3D | null) => void; height?: number
}) {
  const host = useRef<HTMLDivElement>(null)
  const api = useRef<{ set: (h: Hole3D[], plan: boolean) => void; focus: (id: string | null) => void; mark: (p: Pick3D | null) => void } | null>(null)
  const cb = useRef({ onHover, onPick }); cb.current = { onHover, onPick }

  useEffect(() => {
    const el = host.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.setSize(el.clientWidth, height)
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(40, el.clientWidth / height, 1, 6000)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true; controls.dampingFactor = 0.09
    scene.add(new THREE.HemisphereLight(0xffffff, 0xd9c7b8, 2.2))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(300, 600, 200); scene.add(sun)
    const world = new THREE.Group(); scene.add(world)
    const marker = new THREE.Mesh(new THREE.TorusGeometry(RADIUS * 2.4, 0.45, 10, 40), new THREE.MeshBasicMaterial({ color: 0xf97316, depthTest: false }))
    marker.renderOrder = 20; marker.visible = false; scene.add(marker)
    let tubes: { mesh: THREE.Mesh; h: Hole3D; curve: HoleCurve }[] = []
    let centre = new THREE.Vector3()

    const set = (hs: Hole3D[], plan: boolean) => {
      world.children.slice().forEach(c => { world.remove(c); (c as THREE.Mesh).geometry?.dispose?.() })
      tubes = []
      if (!hs.length) return
      const box = new THREE.Box3()
      hs.forEach(h => {
        if (h.path.length < 2) return
        const curve = new HoleCurve(h)
        const geo = new THREE.TubeGeometry(curve, Math.max(40, Math.ceil(h.drilled * 1.5)), RADIUS, 12, false)
        const tex = new THREE.CanvasTexture(h.skin); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8
        const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, metalness: 0 }))
        world.add(mesh); tubes.push({ mesh, h, curve })
        geo.computeBoundingBox(); box.union(geo.boundingBox!)
        // collar disc and name
        const top = curve.getPoint(0)
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(RADIUS * 2.2, RADIUS * 2.2, 0.6, 24), new THREE.MeshStandardMaterial({ color: 0x17120e }))
        disc.position.copy(top); world.add(disc)
        const tag = label(h.id); tag.position.copy(top).add(new THREE.Vector3(0, 12, 0)); world.add(tag)
        if (plan && h.planned && h.planned.length > 1) {
          const pts = h.planned.map(p => new THREE.Vector3(h.x + p.e, h.y - p.tvd, -(h.z + p.n)))
          const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0x8a7a6c, dashSize: 4, gapSize: 3 }))
          line.computeLineDistances(); world.add(line)
        }
      })
      // ground: a grid at the highest collar
      const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3())
      const span = Math.max(size.x, size.z, 120) * 1.4
      const grid = new THREE.GridHelper(span, Math.round(span / 20), 0xd8c5b4, 0xebe0d6)
      grid.position.set(c.x, box.max.y + 0.2, c.z); world.add(grid)
      centre = c
      const r = Math.max(size.x, size.y, size.z)
      camera.position.set(c.x + r * 0.95, c.y + r * 0.5, c.z + r * 1.0)
      controls.target.copy(c); controls.update()
    }
    const focusOn = (id: string | null) => {
      const t = tubes.find(x => x.h.id === id)
      if (!t) return
      const mid = t.curve.getPoint(0.5)
      const dir = camera.position.clone().sub(controls.target).normalize()
      controls.target.copy(mid); camera.position.copy(mid.clone().add(dir.multiplyScalar(Math.max(60, t.h.drilled * 0.75)))); controls.update()
    }
    const mark = (p: Pick3D | null) => {
      const t = p && tubes.find(x => x.h.id === p.hole)
      if (!t || !p) { marker.visible = false; return }
      const u = Math.min(1, Math.max(0, p.depth / t.h.drilled))
      marker.position.copy(t.curve.getPoint(u))
      const tan = t.curve.getTangent(u); marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan)
      marker.visible = true
    }
    api.current = { set, focus: focusOn, mark }

    const ray = new THREE.Raycaster(), mouse = new THREE.Vector2()
    const pickAt = (ev: PointerEvent): Pick3D | null => {
      const r = renderer.domElement.getBoundingClientRect()
      mouse.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(mouse, camera)
      const hit = ray.intersectObjects(tubes.map(t => t.mesh))[0]
      if (!hit || !hit.uv) return null
      const t = tubes.find(x => x.mesh === hit.object)!
      return { hole: t.h.id, depth: Math.max(0, Math.min(t.h.drilled, hit.uv.x * t.h.drilled)), sx: ev.clientX - r.left, sy: ev.clientY - r.top }
    }
    let down = { x: 0, y: 0 }
    const move = (ev: PointerEvent) => { if (ev.buttons) return; cb.current.onHover(pickAt(ev)) }
    const pd = (ev: PointerEvent) => { down = { x: ev.clientX, y: ev.clientY } }
    const up = (ev: PointerEvent) => { if (Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < 4) cb.current.onPick(pickAt(ev)) }
    const leave = () => cb.current.onHover(null)
    renderer.domElement.addEventListener('pointermove', move)
    renderer.domElement.addEventListener('pointerdown', pd)
    renderer.domElement.addEventListener('pointerup', up)
    renderer.domElement.addEventListener('pointerleave', leave)
    const resize = () => { renderer.setSize(el.clientWidth, height); camera.aspect = el.clientWidth / height; camera.updateProjectionMatrix() }
    window.addEventListener('resize', resize)
    let raf = 0
    const loop = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop) }
    loop()
    ;(window as unknown as { __core3d?: unknown }).__core3d = { camera, controls, centre: () => centre }
    return () => {
      cancelAnimationFrame(raf); window.removeEventListener('resize', resize)
      renderer.domElement.removeEventListener('pointermove', move); renderer.domElement.removeEventListener('pointerdown', pd)
      renderer.domElement.removeEventListener('pointerup', up); renderer.domElement.removeEventListener('pointerleave', leave)
      controls.dispose(); renderer.dispose(); el.removeChild(renderer.domElement)
    }
  }, [height])

  useEffect(() => { api.current?.set(holes, showPlan) }, [holes, showPlan])
  useEffect(() => { if (focus) api.current?.focus(focus) }, [focus])
  useEffect(() => { api.current?.mark(pinned ?? null) }, [pinned, holes])

  return <div ref={host} style={{ width: '100%', height, cursor: 'grab', touchAction: 'none' }} />
}
