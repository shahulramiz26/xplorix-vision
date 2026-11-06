// @ts-nocheck
/* eslint-disable */
import * as THREE from 'three'

export function startHole(): () => void {
  let alive = true
  const undo: Array<() => void> = []
  const raf = (f) => requestAnimationFrame(t => { if (alive) f(t) })
  const on = (type, fn, opt) => { window.addEventListener(type, fn, opt); undo.push(() => window.removeEventListener(type, fn, opt)) }
  const later = (fn, ms) => { const id = setTimeout(() => { if (alive) fn() }, ms); undo.push(() => clearTimeout(id)); return id }
  const every = (fn, ms) => { const id = setInterval(() => { if (alive) fn() }, ms); undo.push(() => clearInterval(id)); return id }
  const mkIO = (cb, opt) => { const o = new IntersectionObserver(cb, opt); undo.push(() => o.disconnect()); return o }
  const track = (r) => { undo.push(() => { r.dispose(); r.forceContextLoss?.() }) }

  /* ONE HOLE: a cut through the ground with one inclined hole. Scrolling drills it;
     each problem lights up at the depth it happens. Demo data. */
  const P = [
    { m: 12, t: 'Caving in loose ground', i: 'The hole walls fall in. Casing goes down and the rig waits.', h: 6, x: 'A stop with its cause, hours and the casing used.' },
    { m: 46, t: 'Lost water circulation', i: 'Water drains into open fractures. Drilling stops until water is carted in.', h: 9, x: 'Water hours logged, and the zone marked for the next hole.' },
    { m: 78, t: 'Core lost in broken ground', i: 'Recovery falls to 61%. The client pays for metres; the geologist gets gaps.', h: 0, x: 'Recovery under 80% is flagged in the shift it happens.' },
    { m: 104, t: 'Rods stuck', i: 'Hours pulling rods, and the risk of losing the hole.', h: 14, x: 'Stuck-rod hours by ground, rig and driller.' },
    { m: 150, t: 'Bit worn out in hard rock', i: 'The rate drops from 1.3 to 0.4 m/h, and there is no spare bit on site.', h: 8, x: 'A rate far from the rig’s normal is flagged; the bit is ordered in time.' },
    { m: 196, t: 'Hole drifting off plan', i: 'The survey shows the hole 4° flatter than planned.', h: 5, x: 'Every survey set against the planned path.' },
  ]
  const PLAN = 220, S = 0.042, DIP0 = 72

  const list = document.getElementById('probs')
  list.innerHTML = P.map(p => `<li><span class="dot"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#140B04" stroke-width="4" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span><div class="t">${p.t}<small>${p.m} m</small></div><div class="more"><div><p>${p.i}</p><p class="x"><b>XPLORIX</b>${p.x}</p></div></div></li>`).join('')
  const items = [...list.children]
  const sec = document.getElementById('hole'), cv = document.getElementById('holecv'), host = cv.parentElement
  const dep = document.getElementById('hdep'), lost = document.getElementById('hlost'), lab = document.getElementById('hlabel'), end = document.getElementById('hend')
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches

  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); track(renderer)
  renderer.setPixelRatio(Math.min(2, devicePixelRatio))
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(36, 1, .1, 100)
  scene.add(new THREE.HemisphereLight(0xfff1e0, 0x1a120c, 1.5))
  const key = new THREE.DirectionalLight(0xffdcb8, 2.4); key.position.set(6, 9, 10); scene.add(key)
  const rim = new THREE.DirectionalLight(0x9db6ff, .5); rim.position.set(-7, 3, -5); scene.add(rim)
  const world = new THREE.Group(); scene.add(world)

  // rock: a texture per layer, speckled; the broken layer gets cracks
  let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  function rockTex(hex, cracks, bands) {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d')
    g.fillStyle = hex; g.fillRect(0, 0, 256, 256)
    for (let k = 0; k < 2600; k++) { const v = rnd(); g.fillStyle = v > .5 ? `rgba(255,240,220,${(v - .5) * .16})` : `rgba(0,0,0,${(.5 - v) * .3})`; const s = 1 + rnd() * 2.5; g.fillRect(rnd() * 256, rnd() * 256, s, s) }
    if (bands) for (let k = 0; k < 6; k++) { g.fillStyle = `rgba(0,0,0,${.05 + rnd() * .08})`; g.fillRect(0, rnd() * 256, 256, 2 + rnd() * 8) }
    if (cracks) { g.strokeStyle = 'rgba(10,6,4,.55)'; g.lineWidth = 1.4; for (let k = 0; k < 22; k++) { g.beginPath(); let x = rnd() * 256, y = rnd() * 256; g.moveTo(x, y); for (let j = 0; j < 4; j++) { x += (rnd() - .5) * 60; y += (rnd() - .3) * 40; g.lineTo(x, y) } g.stroke() } }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t
  }
  function textTex(str) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 64; const g = c.getContext('2d')
    g.font = '600 30px Inter, system-ui, sans-serif'; g.fillStyle = 'rgba(245,238,230,.55)'; g.textAlign = 'right'; g.textBaseline = 'middle'
    g.fillText(str.toUpperCase().split('').join(' '), 500, 32)
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
  }
  const W = 7, D = 3.2
  const LAYERS = [[0, 1.1, '#6f5643', 'Overburden', 0, 1], [1.1, 2.7, '#86694e', 'Weathered', 0, 1], [2.7, 4.3, '#5a473a', 'Broken ground', 1, 0], [4.3, 6.6, '#58514a', 'Fresh rock', 0, 1], [6.6, 9.8, '#3b3835', 'Hard formation', 0, 1]]
  LAYERS.forEach(([a, b, col, name, cr, bd]) => {
    const h = b - a, tex = rockTex(col, cr, bd); tex.repeat.set(W / 3, h / 3)
    const m = new THREE.Mesh(new THREE.BoxGeometry(W, h, D), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }))
    m.position.set(0, -(a + h / 2), -D / 2); world.add(m)
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(2.4, .3), new THREE.MeshBasicMaterial({ map: textTex(name), transparent: true, depthWrite: false }))
    lbl.position.set(W / 2 - 1.25, -(a + .28), .012); world.add(lbl)
  })
  const block = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W, 9.8, D)), new THREE.LineBasicMaterial({ color: 0x8a7462, transparent: true, opacity: .5 }))
  block.position.set(0, -4.9, -D / 2); world.add(block)
  // grass-dark top skin
  const top = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: 0x3a2e24, roughness: 1 }))
  top.rotation.x = -Math.PI / 2; top.position.set(0, .002, -D / 2); world.add(top)

  // the hole: the drilled path flattens after 170 m (drift); the plan stays straight
  const collar = new THREE.Vector3(-2.3, 0, .02)
  const pts = [], dip = m => (DIP0 - Math.max(0, m - 170) / 50 * 4) * Math.PI / 180
  { const p = collar.clone(); for (let m = 0; m <= PLAN; m++) { pts.push(p.clone()); const a = dip(m); p.x += Math.cos(a) * S; p.y -= Math.sin(a) * S } }
  const at = m => pts[Math.max(0, Math.min(PLAN, Math.round(m)))]
  const curve = new THREE.CatmullRomCurve3(pts.filter((_, i) => i % 5 === 0 || i === PLAN))
  const SEG = 440, RAD = 12
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, SEG, .06, RAD, false), new THREE.MeshStandardMaterial({ color: 0xf97316, emissive: 0x7a2e05, emissiveIntensity: .35, roughness: .5 }))
  world.add(tube)
  const a0 = DIP0 * Math.PI / 180, pend = collar.clone().add(new THREE.Vector3(Math.cos(a0), -Math.sin(a0), 0).multiplyScalar(PLAN * S))
  const plan = new THREE.Line(new THREE.BufferGeometry().setFromPoints([collar, pend]), new THREE.LineDashedMaterial({ color: 0xe8d9c8, dashSize: .12, gapSize: .1, transparent: true, opacity: .55 }))
  plan.computeLineDistances(); plan.position.z = .03; world.add(plan)
  const tgt = new THREE.Mesh(new THREE.TorusGeometry(.14, .02, 8, 28), new THREE.MeshBasicMaterial({ color: 0xe8d9c8, transparent: true, opacity: .6 }))
  tgt.position.copy(pend).setZ(.03); world.add(tgt)

  // the bit, glowing, and a light that warms the rock around it
  const bit = new THREE.Mesh(new THREE.ConeGeometry(.11, .3, 18), new THREE.MeshStandardMaterial({ color: 0xffc08a, emissive: 0xf97316, emissiveIntensity: 1.6, metalness: .3, roughness: .3 }))
  world.add(bit)
  const glow = new THREE.PointLight(0xff8a33, 4, 2.6, 1.6); world.add(glow)

  // the rig: a mast set at the hole's angle, a deck and a small cabin
  const rig = new THREE.Group(), steel = new THREE.MeshStandardMaterial({ color: 0xc9bcae, metalness: .6, roughness: .4 })
  const mast = new THREE.Mesh(new THREE.BoxGeometry(.09, 2.2, .09), steel); mast.position.y = 1.1; rig.add(mast)
  for (let k = 0; k < 6; k++) { const r = new THREE.Mesh(new THREE.BoxGeometry(.28, .03, .03), steel); r.position.y = .3 + k * .33; rig.add(r) }
  rig.rotation.z = -(Math.PI / 2 - a0); rig.position.copy(collar); world.add(rig)
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.3, .14, .9), new THREE.MeshStandardMaterial({ color: 0x3b3029, roughness: .8 })); deck.position.set(collar.x - .3, .07, -.45); world.add(deck)
  const cab = new THREE.Mesh(new THREE.BoxGeometry(.5, .38, .5), new THREE.MeshStandardMaterial({ color: 0xF97316, roughness: .6 })); cab.position.set(collar.x - .7, .33, -.5); world.add(cab)

  // problems: a ring around the hole and a tint on the rock where it happens
  const tang = m => at(m + 1).clone().sub(at(Math.max(0, m - 1))).normalize()
  const rings = P.map(p => {
    const r = new THREE.Mesh(new THREE.TorusGeometry(.2, .026, 10, 36), new THREE.MeshBasicMaterial({ color: 0xF5B544, transparent: true, opacity: 0 }))
    r.position.copy(at(p.m)); r.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tang(p.m)); world.add(r); return r
  })
  const zone = (m0, m1, col) => { const y0 = at(m0).y, y1 = at(m1).y; const z = new THREE.Mesh(new THREE.PlaneGeometry(W, y0 - y1), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, depthWrite: false })); z.position.set(0, (y0 + y1) / 2, .008); world.add(z); return z }
  const zones = [[1, zone(40, 52, 0x4f8cff)], [2, zone(70, 86, 0xF2545B)]]

  function size() { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix() }
  size(); on('resize', size)

  let vis = false
  mkIO(([e]) => { vis = e.isIntersecting; if (vis) size() }).observe(sec)
  const v = new THREE.Vector3(), clamp = x => Math.min(1, Math.max(0, x))
  function frame(now) {
    raf(frame)
    if (!vis) return
    const r = sec.getBoundingClientRect(), p = clamp(-r.top / (r.height - innerHeight)), m = PLAN * clamp((p - .03) / .85)
    // camera follows the bit down; the block turns a little
    const tip = at(m)
    world.rotation.y = -.5 + p * .32
    const mob = innerWidth <= 860
    camera.position.set(mob ? 7.5 : 7.4, 2.2 + tip.y * .5, mob ? 15.5 : 15.5)
    camera.lookAt(mob ? .3 : .9, -2 + tip.y * .6, -1.2)
    tube.geometry.setDrawRange(0, Math.floor(SEG * m / PLAN) * RAD * 6)
    bit.position.copy(tip); bit.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), tang(m)); if (!reduce) bit.rotateY(now / 120)
    bit.visible = m > .5 && m < PLAN - .5; glow.position.copy(tip).setZ(.4); glow.intensity = bit.visible ? 4 : 0
    let ai = -1, hrs = 0
    P.forEach((q, i) => { if (m >= q.m) { ai = i; hrs += q.h } })
    rings.forEach((g, i) => { const on = m >= P[i].m; g.material.opacity = on ? (i === ai ? 1 : .55) : 0; const s = i === ai && !reduce ? 1 + Math.sin(now / 220) * .12 : 1; g.scale.setScalar(s); g.material.color.set(i === ai ? 0xF97316 : 0xF5B544) })
    zones.forEach(([i, z]) => { z.material.opacity = m >= P[i].m ? (ai === i ? .2 : .1) : 0 })
    items.forEach((li, i) => { li.classList.toggle('on', i === ai); li.classList.toggle('past', i < ai); li.classList.toggle('peek', ai < 0 && i === 0) })
    dep.innerHTML = `${m.toFixed(1)}<em>/ ${PLAN} m</em>`; lost.innerHTML = `${hrs}<em>h</em>`
    end.classList.toggle('on', m >= PLAN - .5)
    if (ai >= 0 && m < PLAN - .5) {
      world.updateMatrixWorld(); v.copy(at(P[ai].m)).applyMatrix4(world.matrixWorld).project(camera)
      lab.style.left = ((v.x + 1) / 2 * host.clientWidth) + 'px'; lab.style.top = ((1 - v.y) / 2 * host.clientHeight) + 'px'
      lab.innerHTML = `${P[ai].t}<small>${P[ai].m} m${P[ai].h ? ` · ${P[ai].h} h lost` : ' · recovery 61%'}</small>`; lab.classList.add('on')
    } else lab.classList.remove('on')
    renderer.render(scene, camera)
  }
  raf(frame)
  return () => { alive = false; undo.splice(0).reverse().forEach(f => { try { f() } catch (e) {} }) }
}
