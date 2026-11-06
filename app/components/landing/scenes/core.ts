// @ts-nocheck
/* eslint-disable */
import * as THREE from 'three'

export function startCore(): () => void {
  let alive = true
  const undo: Array<() => void> = []
  const raf = (f) => requestAnimationFrame(t => { if (alive) f(t) })
  const on = (type, fn, opt) => { window.addEventListener(type, fn, opt); undo.push(() => window.removeEventListener(type, fn, opt)) }
  const later = (fn, ms) => { const id = setTimeout(() => { if (alive) fn() }, ms); undo.push(() => clearTimeout(id)); return id }
  const every = (fn, ms) => { const id = setInterval(() => { if (alive) fn() }, ms); undo.push(() => clearInterval(id)); return id }
  const mkIO = (cb, opt) => { const o = new IntersectionObserver(cb, opt); undo.push(() => o.disconnect()); return o }
  const track = (r) => { undo.push(() => { r.dispose(); r.forceContextLoss?.() }) }

    const io = mkIO(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) } }), { threshold: .15, rootMargin: '0px 0px -8% 0px' })
    document.querySelectorAll('.rv').forEach(el => io.observe(el))
    const v = document.getElementById('filmv'), pb = document.getElementById('filmplay')
    pb.addEventListener('click', () => { v.controls = true; pb.remove(); v.play().catch(() => {}) })

  const clamp = x => Math.min(1, Math.max(0, x))
  /* ---- tray: rows of real core, breaks the photo step suggested ---- */
  {
    let r = 11; const rn = () => (r = (r * 16807) % 2147483647) / 2147483647
    const rows = document.getElementById('trrows'), off = [0, -170, -340, -510, -680, -840]
    rows.innerHTML = off.map((o, i) => {
      let marks = '', x = 4 + rn() * 6
      while (x < 96) { const t = rn() < .58 ? 'n' : 'h', u = rn() < .28, sl = t === 'n' ? (rn() - .5) * 5 : 0
        marks += `<g class="mk ${t}${u ? '' : ' ok'}" style="transition-delay:${(i * .12 + x / 260).toFixed(2)}s"><line class="hit" x1="${x - sl}%" y1="0" x2="${x + sl}%" y2="100%"/><line x1="${x - sl}%" y1="0" x2="${x + sl}%" y2="100%"/><circle cx="${x - sl}%" cy="3" r="4.5"/></g>`
        x += 10 + rn() * 14 }
      return `<div class="row" style="background-position:${o}px 50%"><span class="dp">${(136.2 + i * 1.06).toFixed(1)}</span><svg aria-hidden="true">${marks}</svg></div>`
    }).join('')
    const tray = document.getElementById('tray'), nat = document.getElementById('trnat'), dot = document.getElementById('trdot'), st = document.getElementById('trstate')
    const count = () => { nat.textContent = rows.querySelectorAll('.mk.n').length; dot.textContent = rows.querySelectorAll('.mk:not(.ok)').length }
    count()
    rows.addEventListener('click', e => { const g = e.target.closest('.mk'); if (!g) return; g.classList.toggle('n'); g.classList.toggle('h'); g.classList.add('ok'); count() })
    document.getElementById('trok').addEventListener('click', () => { rows.querySelectorAll('.mk').forEach(g => g.classList.add('ok')); count(); st.textContent = 'Checked by the geologist'; st.className = 'pill g' })
    mkIO(([e], o) => { if (e.isIntersecting) { tray.classList.add('in'); o.disconnect() } }, { threshold: .3 }).observe(tray)
  }
  /* ---- 3D: eight holes along their paths, skinned with core ---- */
  {
    const host = document.getElementById('h3d'), cv = document.getElementById('h3dcv')
    const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); track(renderer)
    renderer.setPixelRatio(Math.min(2, devicePixelRatio))
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(34, 1, 1, 5000)
    scene.add(new THREE.HemisphereLight(0xfff1e0, 0x1a120c, 1.8)); const sun = new THREE.DirectionalLight(0xffe2c4, 1.6); sun.position.set(300, 500, 300); scene.add(sun)
    const world = new THREE.Group(); scene.add(world)
    const grid = new THREE.GridHelper(520, 26, 0x3a2e26, 0x241c17); world.add(grid)
    const photo = new THREE.TextureLoader().load('/landing/core-strip.jpg'); photo.colorSpace = THREE.SRGBColorSpace; photo.wrapS = photo.wrapT = THREE.RepeatWrapping
    const strip = (fn) => { const c = document.createElement('canvas'); c.width = 256; c.height = 4; const g = c.getContext('2d'); for (let x = 0; x < 256; x++) { g.fillStyle = fn(x / 256); g.fillRect(x, 0, 1, 4) } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t }
    let sd = 5; const rn = () => (sd = (sd * 16807) % 2147483647) / 2147483647
    const ramp = (a, b, k) => { const c1 = new THREE.Color(a), c2 = new THREE.Color(b); return '#' + c1.lerp(c2, k).getHexString() }
    const H = [[-160, -90, 309, 62, 30], [-90, -40, 243, 70, 120], [-30, -110, 210, 58, 200], [40, -60, 178, 66, 40], [110, -20, 173, 75, 300], [-120, 40, 166, 60, 160], [10, 70, 155, 68, 260], [150, 80, 96, 72, 210]]
    const ids = ['DH-961', 'DH-952', 'DH-911', 'DH-013', 'DH-011', 'DH-902', 'DH-004', 'DH-001']
    const holes = H.map(([x, z, len, dip, az], i) => {
      const a = dip * Math.PI / 180, b = az * Math.PI / 180
      const pts = []; for (let k = 0; k <= 12; k++) { const m = len * k / 12, dd = a - k * .006; pts.push(new THREE.Vector3(x + Math.cos(dd) * Math.sin(b) * m, -Math.sin(dd) * m, z + Math.cos(dd) * Math.cos(b) * m)) }
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 3.2, 12, false)
      const ph = photo.clone(); ph.repeat.set(len / 60, 1); ph.offset.set(rn(), 0); ph.needsUpdate = true
      const rq = strip(u => { const v = .55 + .4 * Math.sin(u * 9 + i) * Math.sin(u * 23 + i * 2); return v > .8 ? '#34C38F' : v > .55 ? '#F5B544' : '#F2545B' })
      const rt = strip(u => ramp('#5B8CFF', '#F97316', clamp(.5 + .5 * Math.sin(u * 6 + i * 1.7))))
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: ph, roughness: .8 })); world.add(mesh)
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 1.4, 24), new THREE.MeshStandardMaterial({ color: 0x2a211b })); collar.position.copy(pts[0]); world.add(collar)
      const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d'); g.font = '600 30px Inter, system-ui, sans-serif'
      const w = g.measureText(ids[i]).width + 26; g.fillStyle = 'rgba(21,17,14,.9)'; g.beginPath(); g.roundRect((256 - w) / 2, 10, w, 44, 12); g.fill(); g.strokeStyle = 'rgba(245,238,230,.25)'; g.lineWidth = 2; g.stroke()
      g.fillStyle = '#F5EEE6'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ids[i], 128, 33)
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false })); tag.scale.set(56, 14, 1); tag.position.copy(pts[0]).add(new THREE.Vector3(0, 16, 0)); world.add(tag)
      return { mesh, maps: { photo: ph, rqd: rq, rate: rt } }
    })
    world.position.y = 95
    const LEG = { photo: ['', 'Core, from the tray photos'], rqd: ['linear-gradient(90deg,#F2545B,#F5B544,#34C38F)', 'RQD: poor to good'], rate: ['linear-gradient(90deg,#5B8CFF,#F97316)', 'Drill rate: slow to fast'] }
    const leg = document.getElementById('h3leg')
    const mode = m => { holes.forEach(h => { h.mesh.material.map = h.maps[m]; h.mesh.material.needsUpdate = true }); host.querySelectorAll('[data-m]').forEach(b => b.setAttribute('aria-selected', b.dataset.m === m)); leg.innerHTML = LEG[m][0] ? `<i style="background:${LEG[m][0]}"></i>${LEG[m][1]}` : `<span style="width:10px;height:10px;border-radius:2px;background:#8A7A6C;display:inline-block"></span>${LEG[m][1]}` }
    host.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => mode(b.dataset.m))); mode('photo')
    const size = () => { const w = host.clientWidth, h = host.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix() }
    size(); on('resize', size)
    let yaw = .6, pitch = .38, drag = null, vis = false, last = performance.now()
    host.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; drag = { x: e.clientX, y: e.clientY, yaw, pitch }; host.setPointerCapture(e.pointerId) })
    host.addEventListener('pointermove', e => { if (!drag) return; yaw = drag.yaw - (e.clientX - drag.x) * .006; pitch = clamp(drag.pitch + (e.clientY - drag.y) * .004) * .9 + .05 })
    host.addEventListener('pointerup', () => drag = null)
    mkIO(([e]) => { vis = e.isIntersecting }).observe(host)
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const loop = now => { raf(loop); const dt = (now - last) / 1000; last = now; if (!vis) return
      if (!drag && !reduce) yaw += dt * .08
      const R = 640; camera.position.set(Math.sin(yaw) * Math.cos(pitch) * R, Math.sin(pitch) * R, Math.cos(yaw) * Math.cos(pitch) * R); camera.lookAt(0, -10, 0)
      renderer.render(scene, camera) }
    raf(loop)
  }
  return () => { alive = false; undo.splice(0).reverse().forEach(f => { try { f() } catch (e) {} }) }
}
