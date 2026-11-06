/* eslint-disable react/no-unknown-property */
import Link from 'next/link'

/* The XPLORIX Core page markup. Generated from the design page; ./scenes/core fills and moves it. */
export function CoreMarkup() {
  return (
    <>
<header className="bar on" aria-label="Site">
  <Link className="brand" href="/" aria-label="XPLORIX home"><svg width="30" height="30" viewBox="0 0 100 100" aria-hidden="true"><polygon points="50,50 5,5 5,95" fill="#F5EEE6" /><polygon points="50,50 5,5 30,5" fill="#CFC4B8" /><polygon points="50,50 5,95 30,95" fill="#CFC4B8" /><polygon points="50,50 95,5 95,95" fill="#F97316" /><polygon points="50,50 95,5 70,5" fill="#EA580C" /><polygon points="50,50 95,95 70,95" fill="#EA580C" /></svg>XPLORIX</Link>
  <nav className="links" aria-label="Sections">
    <Link href="/">Drilling</Link>
    <a href="#how" className="cur">XPLORIX Core <span className="soon">SOON</span></a>
    <a href="#screens">Screens</a>
    <a href="#film">The film</a>
  </nav>
  <div className="navcta"><a className="btn primary small" href="#early">Join the early list</a></div>
</header><main>
<section className="chero" aria-labelledby="c-h1">
  <div className="wrap">
    <Link className="back" href="/"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>XPLORIX for drilling</Link>
    <div style={{ marginTop: "18px" } as React.CSSProperties}><span className="chip or">XPLORIX Core · coming soon · for geologists</span></div>
    <h1 id="c-h1" className="rv in">The core, <em>logged from its photos.</em></h1>
    <p className="sub">Photograph the tray. XPLORIX Core finds the rows, the breaks and the gaps, and suggests the log. The geologist checks it and signs it off, with the shift that drilled each metre right beside it.</p>
    <div className="ctas" style={{ marginTop: "32px" } as React.CSSProperties}><a className="btn primary" href="#early">Join the early list <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg></a><a className="btn ghost" href="#film">Watch the 90-second film</a></div>
  </div>
  <div className="bigstrip" role="img" aria-label="Real drill core photographed in its tray" />
</section>

<section className="sec alt" id="how" aria-labelledby="w-h">
  <div className="wrap">
    <div className="head">
      <div className="kicker rv"><i />What it reads</div>
      <h2 className="h2 rv d1" id="w-h">From tray photo <em>to signed-off log.</em></h2>
    </div>
    <div className="feat4">
      <div className="rv"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M3 7h18M3 12h18M3 17h18" /><path d="M9 5l-2 4M15 10l-2 4" /></svg><b>Breaks, sorted</b><span>Natural fractures marked apart from breaks made in handling, which do not count in RQD.</span></div>
      <div className="rv d1"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg><b>Recovery and RQD</b><span>Per metre and per tray, from the photo and the depths on the tray.</span></div>
      <div className="rv d2"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="7" cy="8" r="3" /><circle cx="17" cy="8" r="3" /><circle cx="12" cy="17" r="3" /></svg><b>Rock classes</b><span>Core that looks alike, grouped across holes. The geologist names each class once.</span></div>
      <div className="rv d3"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 2l9 5v10l-9 5-9-5V7z" /><path d="M12 22V12M21 7l-9 5-9-5" /></svg><b>Every hole in 3D</b><span>Along its surveyed path, coloured by core or by drilling.</span></div>
    </div>
  </div>
</section>

<section className="sec" id="screens" aria-labelledby="s-h">
  <div className="wrap">
    <div className="split">
      <div>
        <div className="kicker rv"><i />Tray review</div>
        <h2 className="h2 rv d1" id="s-h">Suggested first. <em>Decided by you.</em></h2>
        <ul>
          <li className="rv"><b>Every break on the photo,</b> natural or handling. Click one to change it.</li>
          <li className="rv d1"><b>Unsure breaks are marked,</b> so you check those first.</li>
          <li className="rv d2"><b>The shift that drilled the tray</b> beside it: driller, rig, rate and the driller&apos;s recovery.</li>
          <li className="rv d3"><b>Nothing counts until you sign off.</b> Until then every number shows as suggested.</li>
        </ul>
      </div>
      <div className="tray rv" id="tray">
          <div className="ui-h"><b>DH-131 · tray 27 · 136.20–142.58 m</b><span className="pill a" id="trstate">Suggested · not yet checked</span></div>
          <div className="trbody">
            <div className="rows" id="trrows" />
            <div className="trside">
              <div><small>Recovery</small><b>97%</b></div>
              <div><small>RQD</small><b>79%</b></div>
              <div><small>Natural breaks</small><b id="trnat">0</b></div>
              <div><small>Unsure, to check</small><b id="trdot" style={{ color: "var(--or)" } as React.CSSProperties}>0</b></div>
              <button type="button" className="btn primary small" id="trok">Mark checked</button>
            </div>
          </div>
          <div className="trleg"><span><i className="n" />Natural fracture</span><span><i className="h" />Break made in handling</span><span><i className="u" />Unsure: please check</span><span className="demo-tag">Real NVCL photo · demo hole · click a break to change it</span></div>
        </div>
    </div>
  </div>
</section>

<section className="sec alt" aria-labelledby="d-h3">
  <div className="wrap">
    <div className="split flip">
      <div>
        <div className="kicker rv"><i />3D view</div>
        <h2 className="h2 rv d1" id="d-h3">Where the rock goes, <em>hole to hole.</em></h2>
        <ul>
          <li className="rv"><b>Every hole in the ground,</b> along its surveyed path and to scale.</li>
          <li className="rv d1"><b>Colour by the core:</b> photos, rock class, RQD, recovery or fractures.</li>
          <li className="rv d2"><b>Or by the drilling:</b> drill rate and driller, from the same record.</li>
          <li className="rv d3"><b>Turn it, and read it;</b> each hole is labelled at its collar.</li>
        </ul>
      </div>
      <div className="h3d rv" id="h3d">
        <canvas id="h3dcv" aria-label="Eight holes in 3D along their surveyed paths, coloured by their core photos, demo data" role="img" />
        <div className="h3tabs" role="tablist" aria-label="Colour the holes by"><button type="button" role="tab" aria-selected="true" data-m="photo">Core photos</button><button type="button" role="tab" aria-selected="false" data-m="rqd">RQD</button><button type="button" role="tab" aria-selected="false" data-m="rate">Drill rate</button></div>
        <div className="h3leg" id="h3leg" />
        <div className="h3hint">Drag to turn · <span className="demo-tag">Demo holes, real NVCL photos</span></div>
      </div>
    </div>
  </div>
</section>

<section className="sec" id="film" aria-labelledby="f-h">
  <div className="wrap">
    <div className="head">
      <div className="kicker rv"><i />The film</div>
      <h2 className="h2 rv d1" id="f-h">XPLORIX Core, <em>in ninety seconds.</em></h2>
    </div>
    <div className="film rv">
      <video id="filmv" src="/landing/core-film.mp4" poster="/landing/core-film-poster.jpg" playsInline preload="none" aria-label="XPLORIX Core Intelligence, a 90-second film with music" />
      <button className="play" id="filmplay" type="button" aria-label="Play the 90-second film"><span><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" fill="currentColor" /></svg>Play the film · 1:29</span></button>
    </div>
    <p className="note">In development. The film shows concept screens; real core photos from the National Virtual Core Library (Mineral Resources Tasmania, AuScope; CC BY 4.0) on demo holes. The photo step suggests; the geologist decides.</p>
  </div>
</section>

<section className="close" id="early" aria-labelledby="e-h">
  <div className="ring" aria-hidden="true" /><div className="ring r2" aria-hidden="true" />
  <div className="wrap">
    <h2 className="h2 rv" id="e-h">Be first to <em>log with Core.</em></h2>
    <p className="sub rv d1">XPLORIX Core is in development. Book a demo to see it on real core photos and join the early list.</p>
    <div className="ctas rv d2" style={{ marginTop: "34px" } as React.CSSProperties}><Link className="btn primary" href="/#demo">Join the early list <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg></Link><Link className="btn ghost" href="/">Back to XPLORIX for drilling</Link></div>
  </div>
</section>
</main><footer>
  <div className="wrap">
    <div className="ft"><Link className="brand" href="/" aria-label="XPLORIX home"><svg width="30" height="30" viewBox="0 0 100 100" aria-hidden="true"><polygon points="50,50 5,5 5,95" fill="#F5EEE6" /><polygon points="50,50 5,5 30,5" fill="#CFC4B8" /><polygon points="50,50 5,95 30,95" fill="#CFC4B8" /><polygon points="50,50 95,5 95,95" fill="#F97316" /><polygon points="50,50 95,5 70,5" fill="#EA580C" /><polygon points="50,50 95,95 70,95" fill="#EA580C" /></svg>XPLORIX</Link><p>XPLORIX Core, for geologists. Part of XPLORIX, the drilling intelligence platform.</p></div>
    <div className="fb"><span>© 2026 XPLORIX. ANMAK CONSULTANCY SERVICES PRIVATE LIMITED</span><nav aria-label="Legal"><Link href="/privacy-policy">Privacy policy</Link><Link href="/terms-of-service">Terms of service</Link><Link href="/refund-policy">Refund policy</Link><Link href="/cookie-policy">Cookie policy</Link></nav></div>
  </div>
</footer>
    </>
  )
}
