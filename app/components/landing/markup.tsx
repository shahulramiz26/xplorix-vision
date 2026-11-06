/* eslint-disable react/no-unknown-property */
import Link from 'next/link'

/* The landing page markup. Generated from the design page; the scenes in ./scenes fill and move it. */
export function LandingMarkup() {
  return (
    <>
<section className="hero" id="top" aria-label="XPLORIX">
  <div className="grain" aria-hidden="true" />
  <canvas id="stage" aria-hidden="true" />
  <div className="shade" aria-hidden="true" />
  <div className="tags" id="tags" aria-hidden="true" />

  <nav>
    <a className="brand" href="#top" aria-label="XPLORIX home">
      <svg width="34" height="34" viewBox="0 0 100 100" aria-hidden="true"><polygon points="50,50 5,5 5,95" fill="#F5EEE6" /><polygon points="50,50 5,5 30,5" fill="#CFC4B8" /><polygon points="50,50 5,95 30,95" fill="#CFC4B8" /><polygon points="50,50 95,5 95,95" fill="#F97316" /><polygon points="50,50 95,5 70,5" fill="#EA580C" /><polygon points="50,50 95,95 70,95" fill="#EA580C" /></svg>
      XPLORIX
    </a>
    <div className="links">
      <a href="#shift">One shift</a>
      <a href="#hole">One hole</a>
      <a href="#invoice">The invoice</a>
      <a href="#intel">Intelligence</a>
      <Link href="/core">XPLORIX Core <span className="soon">SOON</span></Link>
    </div>
    <div className="navcta">
      <Link className="btn ghost small" href="/auth/login">Log in</Link>
      <a className="btn primary small" href="#demo">Book a free demo</a>
    </div>
  </nav>

  <div className="copy">
    <div className="eyebrow"><i />Exploration drilling, one record</div>
    <h1 id="h1">Every metre drilled. <em>Every metre understood.</em></h1>
    <p className="lede">XPLORIX turns every shift log into one record of the drilling: the contractor bills from it, the mine owner checks every metre against it, and nobody argues over the invoice.</p>
    <div className="ctas">
      <a className="btn primary" href="#demo">Book a free demo
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg></a>
      <a className="btn ghost" href="#film">
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M10 8.5v7l6-3.5z" fill="currentColor" /></svg>
        Watch the 2-minute film</a>
    </div>
    <div className="who">
      <span><b style={{ background: "#3E7BFA" } as React.CSSProperties} />Drilling contractors</span>
      <span><b style={{ background: "#22A06B" } as React.CSSProperties} />Mine owners</span>
      <span><b style={{ background: "#F97316" } as React.CSSProperties} />Hired contractors</span>
    </div>
  </div>

  <div className="stats" id="stats" aria-label="This core run, demo values">
    <div className="stat"><div>Metres this run</div><b data-v="3.0" data-u=" m">0</b></div>
    <div className="stat"><div>Core recovery</div><b data-v="100" data-u="%">0</b></div>
    <div className="stat"><div>Drill rate</div><b data-v="0.6" data-u=" m/h">0</b></div>
  </div>
  <div className="demo">Concept visual · real core photo, demo values</div>
  <button className="replay" id="replay" type="button"><svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v5h5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg><span id="replayText">Replay</span></button>
  <div className="scroll" aria-hidden="true">Scroll<i /></div>
</section><header className="bar" id="bar" aria-label="Site">
  <a className="brand" href="#top" aria-label="XPLORIX, back to the top">
    <svg width="28" height="28" viewBox="0 0 100 100" aria-hidden="true"><polygon points="50,50 5,5 5,95" fill="#F5EEE6" /><polygon points="50,50 5,5 30,5" fill="#CFC4B8" /><polygon points="50,50 5,95 30,95" fill="#CFC4B8" /><polygon points="50,50 95,5 95,95" fill="#F97316" /><polygon points="50,50 95,5 70,5" fill="#EA580C" /><polygon points="50,50 95,95 70,95" fill="#EA580C" /></svg>
    XPLORIX
  </a>
  <nav className="links" aria-label="Sections">
    <a href="#shift">One shift</a>
    <a href="#hole">One hole</a>
    <a href="#invoice">The invoice</a>
    <a href="#intel">Intelligence</a>
    <Link href="/core">XPLORIX Core <span className="soon">SOON</span></Link>
  </nav>
  <div className="navcta">
    <Link className="btn ghost small" href="/auth/login">Log in</Link>
    <a className="btn primary small" href="#demo">Book a free demo</a>
  </div>
  <i className="prog" id="prog" aria-hidden="true" />
</header><main>
{/* 0. TICKER: the record, moving */}
<div className="ticker" aria-label="Examples of what XPLORIX records, demo data">
  <div className="trow" id="t1" />
  <div className="trow rev" id="t2" />
</div>

{/* 1. ONE SHIFT (sticky, scroll-scrubbed) */}
<section className="chap scene" id="shift" aria-labelledby="s-h">
  <div className="pin">
    <div className="wrap shift">
      <div>
        <div className="kicker"><b>01</b><i />One shift</div>
        <h2 className="h2" id="s-h" style={{ fontSize: "clamp(30px,3.2vw,44px)" } as React.CSSProperties}>Logged once on the rig. <em>Known everywhere.</em></h2>
        <div className="beats" style={{ marginTop: "34px" } as React.CSSProperties}>
          <div className="beat on" data-b="0"><div className="n">The supervisor</div><h3>Types the shift. Once.</h3><p>Hole, depths, core, hours and stops, on a phone at the rig. No paper log, no spreadsheet later.</p></div>
          <div className="beat" data-b="1"><div className="n">XPLORIX</div><h3>Checks it as it is typed.</h3><p>A depth that does not follow the last shift, more core than metres, hours longer than the shift: stopped before it is saved.</p></div>
          <div className="beat" data-b="2"><div className="n">Everyone else</div><h3>Sees it the same minute.</h3><p>Hole depth, recovery, billing and stock move on their own. The client sees the metres; your costs stay yours.</p></div>
        </div>
        <div className="rail" id="rail"><i /><i /><i /></div>
      </div>
      <div className="deck" id="deck" aria-label="An example shift log, demo data">
        <div className="card ui" data-c="0">
          <div className="ui-h"><b>Drill log · day shift</b><span className="demo-tag">Demo data</span></div>
          <div className="form" id="form" />
          <div className="save" id="save"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>Save the shift</div>
        </div>
        <div className="card ui wait" data-c="1">
          <div className="ui-h"><b>Checked as it is typed</b><span className="pill g" id="ckcount">0 of 5</span></div>
          <ul className="checks" id="checks" />
        </div>
        <div className="card ui wait" data-c="2">
          <div className="ui-h"><b>The same minute</b><span className="pill o">Live</span></div>
          <div className="tiles">
            <div className="tile"><small>DH-121 depth</small><b><span data-to="148.6" data-d="1" data-from="136.2">136.2</span><em>of 250 m</em></b><div className="bar2"><i id="dhbar" style={{ "--w": "54%" } as React.CSSProperties} /></div></div>
            <div className="tile"><small>Core recovery</small><b><span data-to="97.6" data-d="1">0</span><em>%</em></b><span>12.1 m from 12.4 m</span></div>
            <div className="tile"><small>Metres this month</small><b><span data-to="929" data-d="0" data-from="916.6">916</span><em>m</em></b><span>Site B, all rigs</span></div>
            <div className="tile"><small>Ready to bill</small><b><span data-to="12.4" data-d="1">0</span><em>m</em></b><span>At the agreed HQ rate</span></div>
          </div>
          <div className="who3" id="who3">
            <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34C38F" strokeWidth="2.4" aria-hidden="true"><circle cx="12" cy="12" r="9" /></svg><b>Client</b> sees +12.4 m on DH-121</span>
            <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5B8CFF" strokeWidth="2.4" aria-hidden="true"><circle cx="12" cy="12" r="9" /></svg><b>Office</b> cost per metre updated</span>
            <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F5B544" strokeWidth="2.4" aria-hidden="true"><circle cx="12" cy="12" r="9" /></svg><b>Stock</b> 1 HQ bit used</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

{/* 2. ONE HOLE, IN 3D (sticky, scroll-scrubbed) */}
<section className="chap hscene" id="hole" aria-labelledby="h-h">
  <div className="hpin">
    <div className="wrap hgrid">
      <div className="hleft">
        <div className="kicker"><b>02</b><i />One hole</div>
        <h2 className="h2" id="h-h">One hole. <em>Every problem on the way down.</em></h2>
        <p className="sub" style={{ fontSize: "16px" } as React.CSSProperties}>Scroll to drill. These are the stops every contractor knows, and what XPLORIX does with each one.</p>
        <ol className="probs" id="probs" />
      </div>
      <div className="hright" aria-label="A 3D cut through the ground with one hole being drilled, demo data">
        <canvas id="holecv" aria-hidden="true" />
        <div className="hread"><div><small>Depth</small><b id="hdep">0.0<em>/ 220 m</em></b></div><div className="lost"><small>Hours lost</small><b id="hlost">0<em>h</em></b></div></div>
        <div className="hlabel" id="hlabel" />
        <div className="hend" id="hend">42 hours lost on one hole.<small>XPLORIX logs every one with its cause, so the next hole is planned for it.</small></div>
        <div className="hlegend"><span><i className="a" />Drilled</span><span><i />Planned path</span><span className="demo-tag">Demo data</span></div>
      </div>
    </div>
  </div>
</section>

{/* 3. THE INVOICE */}
<section className="chap inv" id="invoice" aria-labelledby="i-h">
  <div className="wrap invgrid">
    <div>
      <div className="kicker rv"><b>03</b><i />The invoice</div>
      <h2 className="h2 rv d1" id="i-h">The invoice <em>checks itself.</em></h2>
      <p className="sub rv d2">Every line is set against the shift record both sides already read. A line that does not match is found before payment, not after.</p>
      <ul className="points">
        <li className="rv"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg><span><b>For the drilling contractor:</b> invoices built from approved holes at the agreed rates. Paid without the argument.</span></li>
        <li className="rv d1"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg><span><b>For the mine owner:</b> every metre claimed is a metre in the record. Approve finished holes with the shifts in front of you.</span></li>
      </ul>
    </div>
    <div className="ui bill rv d1" id="bill">
      <div className="ui-h"><b>INV-0042 · Site B · September</b><span className="demo-tag">Demo data</span></div>
      <table>
        <thead><tr><th>Line</th><th>Claimed</th><th>Shift record</th><th /></tr></thead>
        <tbody>
          <tr><td><b>DH-118</b><span>HQ · 0–150 m</span></td><td>150 m</td><td className="rec">150 m</td><td className="st"><span className="pill g">Matches</span></td></tr>
          <tr><td><b>DH-119</b><span>HQ · 0–132 m</span></td><td>132 m</td><td className="rec">132 m</td><td className="st"><span className="pill g">Matches</span></td></tr>
          <tr className="flag"><td><b>DH-120</b><span>HQ · 0–96 m</span></td><td>96 m</td><td className="rec">88 m</td><td className="st"><span className="pill r">8 m not logged</span></td></tr>
          <tr><td><b>Client standby</b><span>3 shifts</span></td><td>6 h</td><td className="rec">6 h</td><td className="st"><span className="pill g">Matches</span></td></tr>
          <tr><td><b>Rig move</b><span>CP-01 to DH-121</span></td><td>1</td><td className="rec">1</td><td className="st"><span className="pill g">Matches</span></td></tr>
        </tbody>
      </table>
      <div className="scan" id="scan" aria-hidden="true" />
      <div className="billsum"><small style={{ color: "var(--faint)" } as React.CSSProperties}>Against 41 shift logs</small><div className="res" id="res"><span className="pill g">4 lines match</span><span className="pill r">1 to query before payment</span></div></div>
    </div>
  </div>
</section>

{/* 4. XPLORIX INTELLIGENCE */}
<section className="chap intel" id="intel" aria-labelledby="x-h">
  <div className="wrap">
    <div className="kicker rv"><b>04</b><i />XPLORIX Intelligence</div>
    <h2 className="h2 rv d1" id="x-h">See it coming. <em>Spend less per metre.</em></h2>
    <p className="sub rv d2">The same shift logs, plans, surveys and stock, read ahead: what next month looks like, what is about to go wrong, who should act, and what it is worth.</p>
    <div className="igrid">
      <div className="ui ic12 rv">
        <div className="ititle"><h3><span className="n">1</span>Forecast</h3><span><span className="pill">Sep actual</span> <span className="pill o">Oct forecast</span> <span className="demo-tag" style={{ marginLeft: "6px" } as React.CSSProperties}>Demo data</span></span></div>
        <div className="fc">
          <svg id="fcsvg" viewBox="0 0 720 270" role="img" aria-label="Metres drilled each day: September actual, October forecast with a range, falling after 21 October when planned holes run out" />
          <div className="fside">
            <div><small>October forecast</small><b data-count="1156" data-u=" m">0</b><span>At each rig&apos;s own pace</span></div>
            <div><small>DH-121 at 250 m</small><b>Thu 2 Oct</b><span>From its rate in this ground</span></div>
            <div><small>Idle rig-days</small><b data-count="85" style={{ color: "var(--amber)" } as React.CSSProperties}>0</b><span>Unless more holes are planned</span></div>
          </div>
        </div>
      </div>
      <div className="ui ic7 rv">
        <div className="ititle"><h3><span className="n">2</span>Predictions</h3><span className="demo-tag">Demo data</span></div>
        <div className="preds">
          <div className="pred"><span className="pi"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" aria-hidden="true"><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" /></svg></span><div><b>Water loss likely near 45 m on DH-121</b><span>DH-118 and DH-119 lost circulation between 42 and 50 m.</span></div><div className="when">2 shifts<small>away</small></div></div>
          <div className="pred"><span className="pi"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></svg></span><div><b>CP-02&apos;s bit wears out in about 14 m</b><span>Rate down from 1.3 to 0.6 m/h over 4 shifts in hard formation.</span></div><div className="when">Next<small>day shift</small></div></div>
          <div className="pred"><span className="pi"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><rect x="4" y="7" width="16" height="13" rx="2" /><path d="M8 7V5h8v2" /></svg></span><div><b>HQ bits run out in 6 days</b><span>3 left; two rigs use one every 2 to 3 days.</span></div><div className="when">30 Sep<small>stock out</small></div></div>
        </div>
      </div>
      <div className="ui ic5 rv d1">
        <div className="ititle"><h3><span className="n">3</span>Tasks, made for you</h3></div>
        <ul className="tasks" id="tasks">
          <li><span className="cb"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#08130E" strokeWidth="4" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span><span className="tt">Carry water to CP-01 before 45 m<small>Supervisor · by Thursday</small></span><span className="gain">saves ~9 h</span></li>
          <li><span className="cb"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#08130E" strokeWidth="4" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span><span className="tt">Order 6 HQ bits<small>Stores · today</small></span><span className="gain">no stop</span></li>
          <li><span className="cb"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#08130E" strokeWidth="4" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span><span className="tt">Change the bit on CP-02<small>Driller · next shift</small></span><span className="gain">+0.7 m/h</span></li>
          <li><span className="cb"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#08130E" strokeWidth="4" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span><span className="tt">Plan the next holes for 3 rigs<small>Planner · by 20 Oct</small></span><span className="gain">85 idle days</span></li>
        </ul>
      </div>
      <div className="ui ic12 rv">
        <div className="ititle"><h3><span className="n">4</span>What it does to your cost per metre</h3><span className="demo-tag">Illustration on demo data · scale starts at ₹5,000</span></div>
        <div className="wf">
          <div className="wfc" id="wfc">
            <div className="col" style={{ "--b": "0", "--h": "97" } as React.CSSProperties}><i className="bk" /><span className="v">₹5,970</span><span className="lb">This month</span></div>
            <div className="col" style={{ "--b": "66", "--h": "31" } as React.CSSProperties}><i className="bk dn" style={{ transitionDelay: ".25s" } as React.CSSProperties} /><span className="v">−₹310</span><span className="lb">Holes planned, no idle days</span></div>
            <div className="col" style={{ "--b": "52", "--h": "14" } as React.CSSProperties}><i className="bk dn" style={{ transitionDelay: ".5s" } as React.CSSProperties} /><span className="v">−₹140</span><span className="lb">Water ready before the zone</span></div>
            <div className="col" style={{ "--b": "40", "--h": "12" } as React.CSSProperties}><i className="bk dn" style={{ transitionDelay: ".75s" } as React.CSSProperties} /><span className="v">−₹120</span><span className="lb">Bits on site in time</span></div>
            <div className="col" style={{ "--b": "26", "--h": "14" } as React.CSSProperties}><i className="bk dn" style={{ transitionDelay: "1s" } as React.CSSProperties} /><span className="v">−₹140</span><span className="lb">Worn bit changed sooner</span></div>
            <div className="col" style={{ "--b": "0", "--h": "26" } as React.CSSProperties}><i className="bk end" style={{ transitionDelay: "1.3s" } as React.CSSProperties} /><span className="v">₹5,260</span><span className="lb">Next month</span></div>
          </div>
          <div className="wfnum"><small>Cost per metre, next month</small><b><span id="cpm">₹5,970</span><em> /m</em></b><div className="from">₹5,970 /m this month</div><p>Each task is priced from your own logs: the hours it saves, the idle days it removes, the stop it avoids. Done in time, they bring the cost of every metre down.</p></div>
        </div>
      </div>
    </div>
    <p className="note" style={{ font: "500 13px/1.5 var(--body)", color: "var(--faint)", marginTop: "22px" } as React.CSSProperties}>Demo data. Forecasts and predictions are worked out by rules from your own shift logs, plans, surveys and stock. Prediction that learns from the ground is in development.</p>
  </div>
</section>

{/* 6. FIELD TRIAL */}
<section className="chap trial" id="trial" aria-labelledby="t-h">
  <div className="wrap">
    <div className="kicker rv"><i />Field trial</div>
    <h2 className="h2 rv d1" id="t-h">Proved on real rigs <em>before launch.</em></h2>
    <p className="sub rv d2">A live trial with two drilling contractors. Supervisors logged real shifts from the first day; managers read the dashboards the same evening.</p>
    <div className="big3">
      <div className="rv"><b data-count="2">0</b><span>countries: India and Saudi Arabia</span></div>
      <div className="rv d1"><b data-count="28">0</b><span>days live, May to June 2026</span></div>
      <div className="rv d2"><b data-count="48" data-u=" h">0</b><span>from new account to the first live log</span></div>
    </div>
  </div>
  <div className="qmask"><div className="qrow" id="qrow" /></div>
</section>

{/* 7. CORE POINTER */}
<section className="teaser" aria-label="XPLORIX Core">
  <div className="wrap">
    <Link className="tz rv" href="/core" style={{ textDecoration: "none" } as React.CSSProperties}>
      <div><span className="pill o">For geologists · coming soon</span><b>XPLORIX Core logs the core from its tray photos, right beside the drilling.</b></div>
      <span className="btn ghost">See XPLORIX Core <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
    </Link>
  </div>
</section>

{/* 8. QUESTIONS */}
<section id="questions" aria-labelledby="q-h">
  <div className="wrap faq">
    <div><div className="kicker rv"><i />Questions</div><h2 className="h2 rv d1" id="q-h">Asked first.</h2></div>
    <div className="rv d1">
      <details><summary>Who is XPLORIX for?</summary><p>Exploration drilling contractors, the mine owners they drill for, and exploration agencies that run their own rigs and also hire contractors.</p></details>
      <details><summary>What does the supervisor have to enter?</summary><p>One drill log per shift: the hole, the metres, the core recovered, the hours, any downtime and the parts used. Everything else is worked out from that log.</p></details>
      <details><summary>We hire contractors too. Does it handle that?</summary><p>Yes. Each contractor writes his own drill log in his own login. Your site staff check each shift before it counts, and his rigs are compared with yours on the same measures.</p></details>
      <details><summary>What can the client see?</summary><p>Only the projects you choose to show him: rates, holes, the shift record, invoices and payments. Never your costs, margin, stock, suppliers or what you pay a contractor.</p></details>
      <details><summary>How does pricing work?</summary><p>Ask us for the current plans when you see the demo.</p></details>
    </div>
  </div>
</section>

{/* 9. CLOSE */}
<section className="close" id="demo" aria-labelledby="d-h">
  <svg className="drill" viewBox="0 0 20 120" aria-hidden="true"><line x1="10" y1="0" x2="10" y2="120" stroke="url(#dg)" strokeWidth="2" /><defs><linearGradient id="dg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F97316" stopOpacity="0" /><stop offset="1" stopColor="#F97316" /></linearGradient></defs></svg>
  <div className="wrap">
    <h2 className="h2 rv" id="d-h">Every metre, <em>one record.</em></h2>
    <p className="sub rv d1">A 30-minute walk-through on demo data: log a shift as the supervisor, then approve the hole and check the invoice as the client.</p>
    <div className="ctas rv d2" style={{ marginTop: "34px" } as React.CSSProperties}>
      <a className="btn primary" href="#demo">Book a free demo <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg></a>
      <a className="btn ghost" href="#film" data-film="">Watch the 2-minute film</a>
    </div>
  </div>
</section>
</main><footer>
  <div className="wrap">
    <div className="ft">
      <a className="brand" href="#top" aria-label="XPLORIX, back to the top"><svg width="28" height="28" viewBox="0 0 100 100" aria-hidden="true"><polygon points="50,50 5,5 5,95" fill="#F5EEE6" /><polygon points="50,50 5,5 30,5" fill="#CFC4B8" /><polygon points="50,50 5,95 30,95" fill="#CFC4B8" /><polygon points="50,50 95,5 95,95" fill="#F97316" /><polygon points="50,50 95,5 70,5" fill="#EA580C" /><polygon points="50,50 95,95 70,95" fill="#EA580C" /></svg>XPLORIX</a>
      <p>The drilling intelligence platform for exploration drilling contractors and the mine owners they drill for.</p>
    </div>
    <div className="fb">
      <span>© 2026 XPLORIX. ANMAK CONSULTANCY SERVICES PRIVATE LIMITED</span>
      <nav aria-label="Legal"><Link href="/privacy-policy">Privacy policy</Link><Link href="/terms-of-service">Terms of service</Link><Link href="/refund-policy">Refund policy</Link><Link href="/cookie-policy">Cookie policy</Link></nav>
    </div>
  </div>
</footer><div className="modal" id="modal" role="dialog" aria-modal="true" aria-label="The XPLORIX film" aria-hidden="true">
  <video id="filmv" src="/landing/xplorix-film.mp4" poster="/landing/film-poster.jpg" controls playsInline preload="none" />
  <button type="button" id="mclose" aria-label="Close the film">✕</button>
</div>
    </>
  )
}
