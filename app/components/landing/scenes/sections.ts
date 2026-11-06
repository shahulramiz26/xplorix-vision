// @ts-nocheck
/* eslint-disable */

export function startPage(): () => void {
  let alive = true
  const undo: Array<() => void> = []
  const raf = (f) => requestAnimationFrame(t => { if (alive) f(t) })
  const on = (type, fn, opt) => { window.addEventListener(type, fn, opt); undo.push(() => window.removeEventListener(type, fn, opt)) }
  const later = (fn, ms) => { const id = setTimeout(() => { if (alive) fn() }, ms); undo.push(() => clearTimeout(id)); return id }
  const every = (fn, ms) => { const id = setInterval(() => { if (alive) fn() }, ms); undo.push(() => clearInterval(id)); return id }
  const mkIO = (cb, opt) => { const o = new IntersectionObserver(cb, opt); undo.push(() => o.disconnect()); return o }
  const track = (r) => { undo.push(() => { r.dispose(); r.forceContextLoss?.() }) }

    // scenes follow the reader's own scrolling, so they run with reduced motion too; only drifting and sliding is dropped (CSS)
    const reduce = false
    const narrow = () => innerWidth <= 860
    const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)]
    const clamp = x => Math.min(1, Math.max(0, x))
    const fmt = (v, d) => d ? v.toFixed(d) : Math.round(v).toLocaleString('en-GB')

    /* reveal, counters, and "in" states */
    const countUp = el => {
      const to = +el.dataset.count, d = +(el.dataset.d || 0), u = el.dataset.u || ''
      if (reduce) { el.textContent = fmt(to, d) + u; return }
      const t0 = performance.now(), run = now => { const k = clamp((now - t0) / 1400), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(to * e, d) + u; if (k < 1) raf(run) }
      raf(run)
    }
    const io = mkIO(es => es.forEach(e => {
      if (!e.isIntersecting) return
      e.target.classList.add('in'); io.unobserve(e.target)
      e.target.querySelectorAll?.('[data-count]').forEach(countUp)
      if (e.target.dataset.count) countUp(e.target)
    }), { threshold: .2, rootMargin: '0px 0px -6% 0px' })
    $$('.rv, #gantt, .bx, .close, [data-count]').forEach(el => io.observe(el))

    /* sticky bar + reading progress */
    const bar = $('#bar'), hero = $('.hero'), prog = $('#prog')
    mkIO(([e]) => bar.classList.toggle('on', !e.isIntersecting), { threshold: .05 }).observe(hero)
    const links = $$('#bar .links a[href^="#"]')
    const sio = mkIO(es => es.forEach(e => { if (e.isIntersecting) links.forEach(a => a.classList.toggle('cur', a.getAttribute('href') === '#' + e.target.id)) }), { rootMargin: '-45% 0px -50% 0px' })
    links.forEach(a => { const s = $(a.getAttribute('href')); if (s) sio.observe(s) })

    /* cursor spotlight on cards */
    $$('.spot').forEach(el => el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(); el.style.setProperty('--mx', (e.clientX - r.left) + 'px'); el.style.setProperty('--my', (e.clientY - r.top) + 'px') }))

    /* 0. ticker */
    const T1 = [['', 'CP-01 · DH-121', '+12.4 m · day shift'], ['g', 'DH-118 approved', 'by the client · 150 m'], ['o', 'INV-0042', 'every line checked'], ['a', 'CQ-01', 'waiting for an HQ bit'], ['g', 'RIG-001 · DH-005', 'reached planned depth'], ['b', 'CR-07 (hired)', 'shift sent for checking']]
    const T2 = [['o', 'Parts order raised', '6 HQ rods'], ['', 'CP-02', '0.58 m/h · hard formation'], ['a', 'Client standby', '3 h · note added'], ['g', 'DH-121', 'core recovery 97.6%'], ['b', 'CR-09 (hired)', '10.1 m a day this week'], ['o', 'October forecast', '1,156 m']]
    const fill = (el, items) => { const h = items.map(([c, a, b]) => `<span><i class="${c}"></i><b>${a}</b>${b}</span>`).join(''); el.innerHTML = h + h }
    fill($('#t1'), T1); fill($('#t2'), T2)

    /* 1. one shift */
    const F = [['Rig', 'CP-01'], ['Hole', 'DH-121'], ['From', '136.2 m'], ['To', '148.6 m'], ['Core recovered', '12.1 m'], ['Drilling hours', '9.5 h'], ['Downtime', '1.0 h · rod change', 1]]
    const C = [['Starts where the last shift ended', '136.2 m, where DH-121 stood last night'], ['No more core than metres', '12.1 m of core from 12.4 m drilled'], ['Hours fit inside the shift', '9.5 h drilling within 11.0 engine hours'], ['One driller, one rig, one shift', 'Anil Thakur on CP-01 only'], ['Faster than this rig is in this ground', 'Kept, and flagged for the supervisor', 1]]
    const form = $('#form'), checks = $('#checks')
    form.innerHTML = F.map(([l, , w]) => `<div class="fld${w ? ' wide' : ''}"><label>${l}</label><div></div></div>`).join('')
    checks.innerHTML = C.map(([b, s, w]) => `<li><span class="ic${w ? ' a' : ''}">${w ? '!' : '✓'}</span><div><b>${b}</b><span>${s}</span></div></li>`).join('')
    const flds = [...form.children], cks = [...checks.children], cards = $$('#deck .card'), beats = $$('.beat'), rails = $$('#rail i'), who = $$('#who3 span'), nums = $$('#deck [data-to]')
    const total = F.reduce((s, f) => s + f[1].length, 0)
    function shift(p) {
      const b = p < .36 ? 0 : p < .68 ? 1 : 2
      beats.forEach((x, i) => x.classList.toggle('on', i === b))
      rails.forEach((x, i) => x.style.setProperty('--f', clamp(i === 0 ? p / .36 : i === 1 ? (p - .36) / .32 : (p - .68) / .3)))
      cards.forEach((c, i) => { c.classList.toggle('wait', i > b); c.classList.toggle('back', i === b - 1); c.classList.toggle('back2', i < b - 1) })
      // typing
      let rem = Math.floor(clamp(p / .3) * total), act = -1
      flds.forEach((el, i) => { const v = F[i][1], k = Math.max(0, Math.min(v.length, rem)); rem -= v.length; if (act < 0 && k < v.length) act = i
        el.querySelector('div').innerHTML = v.slice(0, k) + (i === act && !reduce ? '<span class="cur"></span>' : ''); el.classList.toggle('act', i === act) })
      $('#save').classList.toggle('go', p > .3 && p < .38)
      const nk = Math.round(clamp((p - .38) / .26) * C.length)
      cks.forEach((li, i) => li.classList.toggle('on', i < nk)); $('#ckcount').textContent = `${Math.min(nk, 4)} of 4 passed${nk > 4 ? ' · 1 flagged' : ''}`
      const q = clamp((p - .7) / .2), e = 1 - Math.pow(1 - q, 3)
      nums.forEach(el => { const to = +el.dataset.to, from = +(el.dataset.from || 0); el.textContent = fmt(from + (to - from) * e, +el.dataset.d) })
      $('#dhbar').style.setProperty('--w', (54.5 + (59.4 - 54.5) * e) + '%')
      who.forEach((s, i) => s.classList.toggle('on', p > .82 + i * .05))
    }
    const scene = $('#shift')
    let shiftT0 = null
    function shiftTick(now) {
      if (reduce) { shift(1); return }
      if (narrow()) { // on a phone the scene plays by itself while it is on screen
        const r = scene.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) { shiftT0 = null; return }
        if (shiftT0 === null) shiftT0 = now; shift(Math.min(1, ((now - shiftT0) / 14000) % 1.2)); return
      }
      const r = scene.getBoundingClientRect(); shift(clamp(-r.top / (r.height - innerHeight)))
    }

    /* 3. invoice scan */
    const bill = $('#bill'), rows = $$('#bill tbody tr'), scan = $('#scan')
    function invoice(q) {
      const tb = bill.querySelector('tbody'), top = tb.offsetTop, hgt = tb.offsetHeight
      const y = top + q * hgt
      scan.style.setProperty('--y', (y - 46) + 'px'); scan.style.setProperty('--so', q > 0 && q < 1 ? 1 : 0)
      rows.forEach(r => r.classList.toggle('on', r.offsetTop + r.offsetHeight * .6 < q * hgt + 2 || q >= 1))
      $('#res').classList.toggle('on', q >= 1)
    }

    /* 4. intelligence: the forecast chart, tasks that tick, cost per metre */
    {
      const N = 61, TODAY = 23, sv = $('#fcsvg'), X0 = 34, BW = (720 - X0) / N, Y0 = 240, K = 3.5
      let r = 7; const rn = () => (r = (r * 16807) % 2147483647) / 2147483647
      const val = d => d <= TODAY ? 38 + (rn() - .5) * 18 : d < 50 ? 40 + (rn() - .5) * 4 : 32.4 + (rn() - .5) * 3
      const vals = Array.from({ length: N }, (_, d) => val(d))
      let g = `<g font-family="Inter" font-size="11" fill="#7D7065">`
      ;[0, 20, 40].forEach(y => g += `<line x1="${X0}" x2="720" y1="${Y0 - y * K}" y2="${Y0 - y * K}" stroke="rgba(245,238,230,.07)"/><text x="${X0 - 8}" y="${Y0 - y * K + 4}" text-anchor="end">${y}</text>`)
      ;[[0, '1 Sep'], [30, '1 Oct'], [50, '21 Oct'], [60, '31 Oct']].forEach(([d, t]) => g += `<text x="${X0 + d * BW + BW / 2}" y="${Y0 + 20}" text-anchor="middle">${t}</text>`)
      g += `<text x="6" y="14" fill="#7D7065">m a day</text></g>`
      let band = '', top = [], bot = []
      vals.forEach((v, d) => { if (d > TODAY) { const w = 2 + (d - TODAY) * .17, x = X0 + d * BW + BW / 2; top.push(`${x},${Y0 - (v + w) * K}`); bot.unshift(`${x},${Y0 - (v - w) * K}`) } })
      band = `<polygon class="band" points="${top.concat(bot).join(' ')}" fill="rgba(249,115,22,.12)"/>`
      const bars = vals.map((v, d) => `<rect x="${(X0 + d * BW + 1.5).toFixed(1)}" y="${(Y0 - v * K).toFixed(1)}" width="${(BW - 3).toFixed(1)}" height="${(v * K).toFixed(1)}" rx="2" fill="${d <= TODAY ? '#CFC4B8' : d < 50 ? 'rgba(249,115,22,.7)' : 'rgba(245,181,68,.55)'}" style="transition-delay:${(d * 22)}ms"/>`).join('')
      const tx = X0 + (TODAY + 1) * BW, ax = X0 + 50 * BW
      const ann = `<g class="ann" font-family="Inter" font-size="12" font-weight="600"><line x1="${tx}" x2="${tx}" y1="26" y2="${Y0}" stroke="#F97316" stroke-dasharray="4 4"/><text x="${tx + 6}" y="34" fill="#F97316">TODAY</text>
        <line x1="${ax}" x2="${ax}" y1="26" y2="${Y0}" stroke="#F5B544" stroke-dasharray="3 4"/><text x="${ax - 6}" y="34" fill="#F5B544" text-anchor="end">Planned holes run out</text><text x="${ax - 6}" y="50" fill="#B5A79A" font-weight="500" text-anchor="end">metres fall, rigs stand idle</text></g>`
      sv.innerHTML = g + band + `<g class="bars">${bars}</g>` + ann
      const tasks = $$('#tasks li'), cpm = $('#cpm')
      mkIO(([e], o) => { if (!e.isIntersecting) return; o.disconnect(); tasks.forEach((t, i) => later(() => t.classList.add('done'), 600 + i * 650)) }, { threshold: .5 }).observe($('#tasks'))
      mkIO(([e], o) => { if (!e.isIntersecting) return; o.disconnect()
        const t0 = performance.now(), run = now => { const k = clamp((now - t0 - 300) / 1600), e2 = 1 - Math.pow(1 - k, 3); cpm.textContent = '₹' + Math.round(5970 - 710 * e2).toLocaleString('en-GB'); if (k < 1) raf(run) }; raf(run)
      }, { threshold: .4 }).observe($('#wfc'))
    }

    /* 6. quotes */
    const Q = [['The downtime chart alone changed our Monday review meetings. We could see exactly which rigs had the most idle time and why.', 'Vikram Sharma', 'HOD Operations, Kartikay Exploration & Mining Services, India'], ['First week in and already this is showing us things our spreadsheets never could. The dashboard is clean, the data makes sense and the team picked it up fast.', 'Mohammed Ali Reyaz', 'General Manager, KANZ AL-MAADEN Contracting Company, Saudi Arabia'], ['My team was logging live on the platform within two days. I have never seen field supervisors adopt a new system that quickly.', 'Piyush Mrig', 'Director, Kartikay Exploration & Mining Services, India']]
    const qh = Q.map(([q, n, r]) => `<figure><blockquote>“${q}”</blockquote><figcaption><b>${n}</b>${r}</figcaption></figure>`).join('')
    $('#qrow').innerHTML = qh + qh + qh + qh

    /* one loop drives every scroll-linked scene, and only while it is on screen */
    function loop(now) {
      const H2 = document.documentElement.scrollHeight - innerHeight; prog.style.setProperty('--p', H2 > 0 ? scrollY / H2 : 0)
      shiftTick(now)
      const br = bill.getBoundingClientRect(); if (br.top < innerHeight && br.bottom > 0) invoice(reduce ? 1 : clamp((innerHeight * .85 - br.top) / (innerHeight * .55)))
      raf(loop)
    }
    raf(loop)

    /* film in a lightbox */
    const modal = $('#modal'), v = $('#filmv'); let opener = null
    const open = e => { e.preventDefault(); opener = e.currentTarget; modal.classList.add('on'); modal.setAttribute('aria-hidden', 'false'); $('#mclose').focus(); v.play().catch(() => {}) }
    const shut = () => { modal.classList.remove('on'); modal.setAttribute('aria-hidden', 'true'); v.pause(); opener?.focus() }
    $$('a[href="#film"]').forEach(a => a.addEventListener('click', open))
    $('#mclose').addEventListener('click', shut)
    modal.addEventListener('click', e => { if (e.target === modal) shut() })
    on('keydown', e => { if (e.key === 'Escape' && modal.classList.contains('on')) shut() })
  return () => { alive = false; undo.splice(0).reverse().forEach(f => { try { f() } catch (e) {} }) }
}
