// @ts-nocheck
/* eslint-disable */
import * as THREE from 'three'

export function startHero(): () => void {
  let alive = true
  const undo: Array<() => void> = []
  const raf = (f) => requestAnimationFrame(t => { if (alive) f(t) })
  const on = (type, fn, opt) => { window.addEventListener(type, fn, opt); undo.push(() => window.removeEventListener(type, fn, opt)) }
  const later = (fn, ms) => { const id = setTimeout(() => { if (alive) fn() }, ms); undo.push(() => clearTimeout(id)); return id }
  const every = (fn, ms) => { const id = setInterval(() => { if (alive) fn() }, ms); undo.push(() => clearInterval(id)); return id }
  const mkIO = (cb, opt) => { const o = new IntersectionObserver(cb, opt); undo.push(() => o.disconnect()); return o }
  const track = (r) => { undo.push(() => { r.dispose(); r.forceContextLoss?.() }) }

  /* headline, word by word */
  const h1 = document.getElementById('h1')
  if (h1.dataset.src) h1.innerHTML = h1.dataset.src; else h1.dataset.src = h1.innerHTML
  const parts = [...h1.childNodes].flatMap(n => n.nodeType === 3 ? n.textContent.split(/(\s+)/).filter(Boolean).map(t => ({ t, em: false })) : n.textContent.split(/(\s+)/).filter(Boolean).map(t => ({ t, em: true })))
  h1.innerHTML = parts.map((p, i) => /^\s+$/.test(p.t) ? ' ' : `<span class="w" style="animation-delay:${0.15 + i * 0.045}s">${p.em ? `<em>${p.t}</em>` : p.t}</span>`).join('')

  let reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  const canvas = document.getElementById('stage')
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); track(renderer)
  renderer.setPixelRatio(Math.min(2, devicePixelRatio))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.25
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100)
  scene.add(new THREE.HemisphereLight(0xfff1e3, 0x1a120c, 1.1))
  const key = new THREE.DirectionalLight(0xffe2c4, 3.2); key.position.set(4, 6, 6); scene.add(key)
  const rim = new THREE.DirectionalLight(0xf97316, 1.4); rim.position.set(-6, -2, -4); scene.add(rim)

  /* the core: one cylinder of real core, cut where the fractures are */
  const L = 5.6, R = 0.40
  const tex = new THREE.TextureLoader().load('/landing/core-strip.jpg'); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8
  const cuts = [ // position along the core (0..1), cut angle (radians from square), kind
    [0.19, 0.55, 'natural', 'α 58° · rough · stained'], [0.36, 0.08, 'handling', 'square, fresh faces'],
    [0.52, 0.72, 'natural', 'α 49° · joint set 2'], [0.70, 0.30, 'natural', 'α 72° · joint set 1'], [0.86, 0.05, 'handling', 'not counted in RQD']]
  const bounds = [[0, 0], ...cuts.map(c => [c[0], c[1]]), [1, 0]]
  const group = new THREE.Group(); scene.add(group)
  const pieces = []
  /* A fracture is a rough surface, not a flat cut: the same rough surface on both
     pieces, so they fit back together. Height = a few sine waves with this
     fracture's own phases, fading to zero at the rim so the side meets it cleanly. */
  const roughOf = cuts.map((c, i) => { const ph = Array.from({ length: 10 }, (_, k) => Math.sin(i * 12.9898 + k * 78.233) * 43758.5453 % 6.283)
    const amp = c[2] === 'natural' ? .075 : .02     // natural breaks are rough; handling breaks are fresh and flat
    return (x, z) => amp * (Math.sin(x * 9 + ph[0]) * Math.cos(z * 7 + ph[1]) * .6 + Math.sin(x * 17 + z * 13 + ph[2]) * .3 + Math.sin(x * 31 - z * 27 + ph[3]) * .18 + Math.sin(z * 41 + ph[4]) * .1 + Math.cos(x * 53 + z * 47 + ph[5]) * .07) })
  const ROUGH = [() => 0, ...roughOf, () => 0]
  const coreAt = (u, v) => [0.18 + u * 0.15, v]           // where on the photo a point of the core is
  function capGeometry(yEnd, tanA, rough, along, up) {
    // a polar grid: rings from the centre out, 72 around
    const RINGS = 14, SEG = 72, pos = [], uv = [], idx = []
    for (let r = 0; r <= RINGS; r++) for (let s2 = 0; s2 <= SEG; s2++) {
      const rr = R * r / RINGS, th = s2 / SEG * Math.PI * 2, x = Math.cos(th) * rr, z = Math.sin(th) * rr
      const fade = 1 - Math.pow(r / RINGS, 6)
      pos.push(x, yEnd + tanA * x + rough(x, z) * fade, z)
      const [u] = coreAt(along + tanA * x / L, 0); uv.push(u + z * .01, .5 + x / R * .45)
    }
    for (let r = 0; r < RINGS; r++) for (let s2 = 0; s2 < SEG; s2++) {
      const a1 = r * (SEG + 1) + s2, b1 = a1 + SEG + 1
      up ? idx.push(a1, b1, a1 + 1, a1 + 1, b1, b1 + 1) : idx.push(a1, a1 + 1, b1, a1 + 1, b1 + 1, b1)
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g
  }
  const sideMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.02, side: THREE.DoubleSide })
  const faceMat = new THREE.MeshStandardMaterial({ map: tex, color: 0xb9ab9c, roughness: 0.95, side: THREE.DoubleSide })   // broken rock: the same rock, matt and a little paler
  for (let i = 0; i < bounds.length - 1; i++) {
    const [a, ta] = bounds[i], [b, tb] = bounds[i + 1]
    const h = (b - a) * L
    const geo = new THREE.CylinderGeometry(R, R, h, 72, 10, true)
    const pos = geo.attributes.position, uv = geo.attributes.uv
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k)
      const t = (y + h / 2) / h
      const shear = (1 - t) * Math.tan(ta) * x + t * Math.tan(tb) * x
      pos.setY(k, y + shear)
      const ang = 1 - Math.abs(Math.atan2(z, x)) / Math.PI           // the photo shows the top half: mirrored round the back
      uv.setXY(k, coreAt(a + t * (b - a) + shear / L)[0], ang)
    }
    geo.computeVertexNormals()
    const piece = new THREE.Group()
    piece.add(new THREE.Mesh(geo, sideMat))
    piece.add(new THREE.Mesh(capGeometry(-h / 2, Math.tan(ta), ROUGH[i], a, false), faceMat))
    piece.add(new THREE.Mesh(capGeometry(h / 2, Math.tan(tb), ROUGH[i + 1], b, true), faceMat))
    const pivot = new THREE.Group(); pivot.add(piece)
    pivot.userData = { home: (a + b) / 2 * L - L / 2, i, seed: (Math.sin(i * 91.7) + 1) / 2 }
    group.add(pivot); pieces.push(pivot)
  }
  group.rotation.z = Math.PI / 2 - 0.42      // lying across, tilted
  group.rotation.y = -0.35

  /* the break: dust bursts, a soft cloud, flying chips and a flash at every fracture,
     one fracture after another, in world space so the dust falls the right way */
  const CRACK0 = 1.55, CRACK_GAP = 0.11, GAP = 0.30
  const crackAt = i => CRACK0 + i * CRACK_GAP
  const fx = new THREE.Group(); scene.add(fx)
  // a grain: a small hard-edged irregular speck; a haze: a soft cloud with noise in it
  const grainTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d')
    g.fillStyle = '#fff'; g.beginPath(); for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2, r = 9 + Math.sin(k * 5.3) * 4; g.lineTo(16 + Math.cos(a) * r, 16 + Math.sin(a) * r) } g.closePath(); g.fill()
    return new THREE.CanvasTexture(c) })()
  const hazeTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')
    for (let k = 0; k < 60; k++) { const x = 64 + (Math.sin(k * 3.1) * 30), y = 64 + (Math.cos(k * 2.3) * 30), r = 18 + (k % 7) * 4
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128) }
    const m = g.createRadialGradient(64, 64, 30, 64, 64, 64); m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(1, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = m; g.fillRect(0, 0, 128, 128)
    return new THREE.CanvasTexture(c) })()
  const soft = hazeTex
  function points(n, color, blending, map = soft) {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
    g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(n), 1))
    g.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(n), 1))
    const shade = new Float32Array(n); for (let k = 0; k < n; k++) shade[k] = .5 + ((Math.sin(k * 12.9898) * 43758.5453) % 1 + 1) % 1 * .5
    g.setAttribute('aShade', new THREE.BufferAttribute(shade, 1))
    const m = new THREE.ShaderMaterial({
      uniforms: { map: { value: map }, color: { value: new THREE.Color(color) }, scale: { value: innerHeight / 2 } },
      vertexShader: `attribute float aSize; attribute float aAlpha; attribute float aShade; varying float vA; varying float vS; uniform float scale;
        void main(){ vA = aAlpha; vS = aShade; vec4 mv = modelViewMatrix * vec4(position,1.); gl_PointSize = max(1., aSize * scale / -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 color; varying float vA; varying float vS;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(color * vS, t.a * vA); if (gl_FragColor.a < .01) discard; }`,
      transparent: true, depthWrite: false, blending,
    })
    const p = new THREE.Points(g, m); p.frustumCulled = false; fx.add(p); return p
  }
  const rnd = (() => { let x = 7; return () => (x = (x * 16807) % 2147483647) / 2147483647 })()
  const NDUST = 700, NPUFF = 60, NCHIP = 16
  const dust = points(cuts.length * NDUST, 0x7d6f62, THREE.NormalBlending, grainTex)
  const puff = points(cuts.length * NPUFF, 0x9a8a7b, THREE.NormalBlending, hazeTex)
  const flash = points(cuts.length, 0xffd2a6, THREE.AdditiveBlending)
  // per particle: direction around the axis, speed, lift, size, life
  const P = cuts.flatMap(() => Array.from({ length: NDUST }, () => ({ th: rnd() * Math.PI * 2, sp: .6 + Math.pow(rnd(), .6) * 3.4, ax: (rnd() - .5) * .7, up: rnd() * 1.4, sz: .006 + Math.pow(rnd(), 5) * .022, life: .5 + rnd() * 1.1, dl: rnd() * .08 })))
  const Q = cuts.flatMap(() => Array.from({ length: NPUFF }, () => ({ th: rnd() * Math.PI * 2, sp: .15 + rnd() * .4, ax: (rnd() - .5) * .4, up: .05 + rnd() * .2, sz: .7 + rnd() * .9, life: 1.4 + rnd() * 1.4 })))
  const chipGeo = new THREE.IcosahedronGeometry(1, 0)
  const chips = new THREE.InstancedMesh(chipGeo, new THREE.MeshStandardMaterial({ color: 0x8a7c70, roughness: 1, flatShading: true }), cuts.length * NCHIP)
  for (let k = 0; k < cuts.length * NCHIP; k++) { const v = .16 + ((k * 0.6180339) % 1) * .28; chips.setColorAt(k, new THREE.Color(v * 1.02, v * .95, v * .86)) }
  chips.frustumCulled = false; fx.add(chips)
  const C = cuts.flatMap(() => Array.from({ length: NCHIP }, () => ({ th: rnd() * Math.PI * 2, sp: 1.2 + rnd() * 2, ax: (rnd() - .5) * .6, up: .4 + rnd() * 1.2, sz: .012 + Math.pow(rnd(), 2) * .04, rx: rnd() * 9, ry: rnd() * 9, life: .9 + rnd() * .7 })))
  const born = cuts.map(() => null)       // where and how each fracture broke, fixed when it breaks
  const M4 = new THREE.Matrix4(), QT = new THREE.Quaternion(), E3 = new THREE.Euler(), V3 = new THREE.Vector3(), S3 = new THREE.Vector3()
  const G = 2.2, DRAG = 2.6
  function gapOpen(i, t) { const x = (t - crackAt(i)) / 1.1; if (x <= 0) return 0; const k = Math.min(1, x); return GAP * (1 - Math.exp(-5.5 * k) * Math.cos(k * 4.2)) / (1 - Math.exp(-5.5) * Math.cos(4.2)) }
  function opened(t) { let tot = 0; const before = cuts.map((_, i) => { const o = tot; tot += gapOpen(i, t); return o }); return { before, tot } }
  function burst(t) {
    const dp = dust.geometry.attributes.position.array, ds = dust.geometry.attributes.aSize.array, da = dust.geometry.attributes.aAlpha.array
    const pp = puff.geometry.attributes.position.array, ps = puff.geometry.attributes.aSize.array, pa = puff.geometry.attributes.aAlpha.array
    const fp = flash.geometry.attributes.position.array, fs = flash.geometry.attributes.aSize.array, fa = flash.geometry.attributes.aAlpha.array
    const { before } = opened(t)
    cuts.forEach((c, i) => {
      const tau0 = t - crackAt(i)
      if (tau0 < 0) { born[i] = null } else if (!born[i]) {
        // the crack's centre and the core's axis, in the world, at the moment it breaks
        const y = c[0] * L - L / 2 + before[i] - 0
        const at = new THREE.Vector3(0, y, 0); group.localToWorld(at)
        const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(group.quaternion).normalize()
        const u = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(0, 0, 1)).normalize()
        const w = new THREE.Vector3().crossVectors(axis, u).normalize()
        born[i] = { at, axis, u, w, R: R * group.scale.x }
      }
      const b = born[i]
      const pos = (q, tau, out) => {   // drag on the outward speed, gravity pulling down
        const dir = V3.copy(b.u).multiplyScalar(Math.cos(q.th)).addScaledVector(b.w, Math.sin(q.th)).addScaledVector(b.axis, q.ax)
        const k = (1 - Math.exp(-DRAG * tau)) / DRAG
        out.copy(b.at).addScaledVector(dir, b.R * 0.9 + q.sp * k)
        out.y += q.up * k - .5 * G * tau * tau * .9
        return out
      }
      for (let j = 0; j < NDUST; j++) {
        const n = i * NDUST + j, q = P[n], tau = tau0 - q.dl
        if (!b || tau < 0 || tau > q.life) { da[n] = 0; continue }
        pos(q, tau, S3); dp[n * 3] = S3.x; dp[n * 3 + 1] = S3.y; dp[n * 3 + 2] = S3.z
        ds[n] = q.sz; da[n] = .75 * Math.min(1, tau / .04) * Math.pow(1 - tau / q.life, 1.6)
      }
      for (let j = 0; j < NPUFF; j++) {
        const n = i * NPUFF + j, q = Q[n]
        if (!b || tau0 < 0 || tau0 > q.life) { pa[n] = 0; continue }
        const tau = tau0
        pos({ ...q, up: q.up }, tau, S3); S3.y += tau * .9 + tau * tau * .5; pp[n * 3] = S3.x; pp[n * 3 + 1] = S3.y; pp[n * 3 + 2] = S3.z
        ps[n] = q.sz * (.5 + Math.sqrt(tau) * 1.3); pa[n] = (.26 + .5 * Math.exp(-tau * 5)) * Math.min(1, tau / .03) * Math.pow(1 - tau / q.life, 2.2)
      }
      if (b && tau0 >= 0 && tau0 < .18) { fp[i * 3] = b.at.x; fp[i * 3 + 1] = b.at.y; fp[i * 3 + 2] = b.at.z; fs[i] = .8 + tau0 * 6; fa[i] = (1 - tau0 / .18) * .6 } else fa[i] = 0
      for (let j = 0; j < NCHIP; j++) {
        const n = i * NCHIP + j, q = C[n]
        if (!b || tau0 < 0 || tau0 > q.life) { M4.makeScale(0, 0, 0); chips.setMatrixAt(n, M4); continue }
        pos({ ...q, up: q.up }, tau0, S3); S3.y -= tau0 * tau0 * 2.4
        E3.set(q.rx + tau0 * q.rx, q.ry + tau0 * q.ry, 0); QT.setFromEuler(E3)
        const sc = q.sz * Math.min(1, (q.life - tau0) / .4)
        M4.compose(S3, QT, V3.set(sc, sc * .45, sc * 1.3)); chips.setMatrixAt(n, M4)
      }
    })
    ;[dust, puff, flash].forEach(p => { p.geometry.attributes.position.needsUpdate = true; p.geometry.attributes.aSize.needsUpdate = true; p.geometry.attributes.aAlpha.needsUpdate = true })
    chips.instanceMatrix.needsUpdate = true
  }

  /* labels on the fractures (HTML, follows the 3D point) */
  const tags = document.getElementById('tags')
  tags.innerHTML = ''
  const labels = cuts.map(c => { const d = document.createElement('div'); d.className = 'tag'
    d.innerHTML = `<i style="background:${c[2] === 'natural' ? '#FF3D8B' : '#16C784'}"></i>${c[2] === 'natural' ? 'Natural fracture' : 'Broken in handling'}<small>${c[3]}</small>`
    tags.appendChild(d); return d })

  function size() {
    // the canvas fills the hero; size its drawing buffer to the hero's own box (not the window, which counts the scrollbar)
    const host = canvas.parentElement, w = host.clientWidth, h = host.clientHeight, mobile = innerWidth < 980
    if (!w || !h) return
    renderer.setSize(w, h, false)
    camera.aspect = w / h; camera.updateProjectionMatrix()
    camera.position.set(mobile ? 0 : -2.4, mobile ? 2.0 : 0.15, mobile ? 13 : 11.5)
    camera.lookAt(mobile ? 0 : -2.4, mobile ? 1.4 : 0, 0); camera.userData.base = camera.position.clone()
    group.position.set(mobile ? 0 : 0.85, mobile ? 3.4 : 0.05, 0); group.scale.setScalar(mobile ? .78 : 1); group.userData.base = mobile ? .78 : 1
  }
  on('resize', size); size()
  // the hero's height changes when the web fonts arrive: keep the drawing in step
  if (window.ResizeObserver) { const ro = new ResizeObserver(() => size()); ro.observe(canvas.parentElement); if (typeof undo !== 'undefined') undo.push(() => ro.disconnect()) }

  const ease = x => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3)
  const easeIO = x => { x = Math.min(1, Math.max(0, x)); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2 }
  let mx = 0, my = 0
  on('pointermove', e => { mx = e.clientX / innerWidth - .5; my = e.clientY / innerHeight - .5 })
  const stats = [...document.querySelectorAll('.stat')]
  let t0 = performance.now()
  const v = new THREE.Vector3()
  let onScreen = true   // stop drawing once the hero has scrolled away
  mkIO(([e]) => { onScreen = e.isIntersecting }).observe(canvas)
  function frame(now) {
    if (!onScreen) { if (!reduce) raf(frame); return }
    const t = (window as any).__freeze ?? (reduce ? 6 : (now - t0) / 1000)
    // 0–1.2 s the core arrives; 1.5–2.6 s it breaks along its fractures; then it floats
    const arrive = ease(t / 1.2), split = easeIO((t - 1.5) / 1.1)
    if (camera.userData.base) camera.position.copy(camera.userData.base)
    group.position.x += 0
    group.rotation.y = -0.35 + (1 - arrive) * -0.6 + Math.sin(t * .25) * .06 + mx * .25
    group.rotation.x = Math.sin(t * .2) * .04 + my * .12
    const op = opened(t)
    pieces.forEach(p => {
      const s = p.userData.seed, i = p.userData.i
      const mine = Math.min(1, (i ? gapOpen(i - 1, t) : 0) / GAP + (i < cuts.length ? gapOpen(i, t) / GAP : 0))   // how loose this piece is
      const off = (i < cuts.length ? op.before[i] : op.tot) - op.tot / 2
      p.position.set(Math.sin(s * 9) * .18 * mine, p.userData.home + off + Math.sin(t * .8 + s * 6) * .03 * mine, Math.cos(s * 7) * .22 * mine)
      p.rotation.set((s - .5) * .35 * mine, 0, (s - .5) * .25 * mine + Math.sin(t * .5 + s * 5) * .02 * mine)
    })
    group.scale.setScalar((group.userData.base || 1) * (.85 + .15 * arrive))
    if (!reduce || t > 5) burst(reduce ? 99 : t)
    // a small kick of the camera as each fracture goes
    let shake = 0; cuts.forEach((_, i) => { const d = t - crackAt(i); if (d > 0 && d < .25) shake += (1 - d / .25) * .025 })
    camera.position.x += (Math.random() - .5) * shake; camera.position.y += (Math.random() - .5) * shake
    renderer.render(scene, camera)
    // labels: project the fracture centre to the screen
    const rect = canvas.getBoundingClientRect()
    cuts.forEach((c, i) => {
      const between = pieces[i + 1]; v.set(0, -((cuts[i][0] - (bounds[i + 1][0] + bounds[i + 2][0]) / 2) * -L) * 0, 0)
      { const o = opened(t); v.set(0, c[0] * L - L / 2 + o.before[i] + gapOpen(i, t) / 2 - o.tot / 2, 0) }; group.localToWorld(v); v.project(camera)
      const x = (v.x + 1) / 2 * rect.width, y = (1 - v.y) / 2 * rect.height
      labels[i].style.left = x + 'px'; labels[i].style.top = (y - 26) + 'px'
      labels[i].style.opacity = (innerWidth < 980 && i % 2) || x > rect.width - 150 || x < rect.width * .48 ? 0 : Math.min(1, Math.max(0, (t - 2.4 - i * .18) / .4))
    })
    stats.forEach((el, i) => {
      const on = t > 3.2 + i * .2; el.classList.toggle('on', on)
      const b = el.querySelector('b'), val = +b.dataset.v, k = ease((t - 3.3 - i * .2) / 1.1)
      b.innerHTML = (b.dataset.v.includes('.') ? (val * k).toFixed(1) : Math.round(val * k)) + `<em>${b.dataset.u}</em>`
    })
    if (!reduce) raf(frame)
  }
  raf(frame)
  if (reduce) { later(() => frame(performance.now()), 300); document.getElementById('replayText').textContent = 'Play the animation' }
  /* Your device asks for less motion, so the page opens still; this button plays it once on request. */
  document.getElementById('replay').addEventListener('click', () => {
    const wasStill = reduce
    reduce = false; t0 = performance.now(); document.getElementById('replayText').textContent = 'Replay'
    if (wasStill) raf(frame)
  })
  window.__t = t => { /* for screenshots */ }
  return () => { alive = false; undo.splice(0).reverse().forEach(f => { try { f() } catch (e) {} }) }
}
