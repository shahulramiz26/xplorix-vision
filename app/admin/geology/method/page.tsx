'use client'

import { Page, PageHead, Card, Note, Table, th, td, tdStrong, rowLine, T } from '../../../components/kit'
import { NVCL_CREDIT } from '../../../../lib/core/sources'

/* HOW IT WORKS — what the photo step measures, how, and what it cannot do.
 * Plain words for the geologist and for the client who reads the export. */

const STEPS: [string, string][] = [
  ['Find the rows', 'The dark lines of the tray walls are found across the photo. Trays of the same type on a hole share their row layout.'],
  ['Find the core', 'Along each row, bright, grey, smooth stretches are empty tray; short flat orange blocks are depth markers. Empty space at the end of the last row is unused tray, not lost core.'],
  ['Lay depths along the core', 'The tray\'s From and To depths are spread along the core actually in the tray, row by row.'],
  ['Find the breaks', 'Dark lines across the core are traced at each slant. Their slant and the core diameter give the angle to the core axis (alpha).'],
  ['Natural or handling', 'Clean square breaks with fresh faces look like breaks made when the core was handled; rough, angled or stained ones look natural. Each call has a confidence.'],
  ['Measure every 5 cm', 'Colour, grain, veins and iron staining are measured on every 5 cm of core. Those make the rock classes and the weathering grade.'],
  ['Join to the drilling', 'Each tray is tied to the shift logs that drilled its depths, so the core sits beside the driller, the rate, the bit and the stops.'],
]

const MEASURES: [string, string][] = [
  ['Core recovery', 'Core in the tray ÷ length the tray covers. Core taken for samples counts as recovered.'],
  ['RQD', 'Pieces of 10 cm or more between natural breaks, ÷ length. Breaks made in handling do not cut a piece. Sampled core is left out.'],
  ['Fracture frequency', 'Natural fractures per metre of recovered core.'],
  ['Weighted joint density (wJd)', 'Each natural fracture weighted by its angle to the core (Palmström: 1, 1.5, 3.5, 6), per metre. RQD from wJd = 110 − 2.5 × wJd, as a cross-check.'],
  ['JRC proxy', 'How much the break line wanders, from the photo. A guide, not a profile gauge.'],
  ['Weathering grade', 'From iron staining on the core surface: fresh (1) to completely weathered (5).'],
  ['GSI proxy', '1.5 × joint condition + RQD ÷ 2. Joint condition uses the roughness and weathering seen; aperture, infill and persistence are taken as typical.'],
  ['Joint sets', 'Natural fractures grouped by alpha, up to three sets, only when the split is clear.'],
  ['Discing', 'Three or more square breaks closer together than half the core diameter: a sign of high stress.'],
  ['Rock classes', 'Groups of 5 cm bins that look alike across all holes. The geologist names them.'],
  ['RQD from joint density', 'RQD worked out from the angle-weighted fracture count instead of piece lengths (the dashed "predicted" RQD on the strip log). Where it and measured RQD differ, look again.'],
  ['Incoherence', 'How broken the core is, 0 (whole) to 1 (rubble): every break, natural or made in handling, per metre of core, plus the core missing.'],
]

const MORE: [string, string][] = [
  ['Vein classes', 'A vein is a run of 5 cm bins where pale, unstained quartz-like pixels cover a fifth of the core or more. Each is put in a class by fixed rules: thick and mostly vein (A), thin ribbons in dark rock (B), iron-stained (C), thin veinlets (D). The geologist names and describes the classes.'],
  ['RC chips', 'Each compartment of a chip tray is one metre. Chips are found against the tray colour; each is measured for area, perimeter, eccentricity (how long and thin) and shape complexity (perimeter² ÷ 4π·area), and its colour. Metres that look alike are grouped across every RC hole.'],
  ["Checking the geologist's log", 'Each photo class is matched to the rock name the geologists most often gave it. Every logged metre is then checked against that, and logged RQD against photo RQD. A check shows where to look again; it does not say who is right.'],
  ['Downhole data', 'Assays, downhole geophysics, the core scanner (XRF, hyperspectral), the televiewer and lab tests are joined to the photos metre by metre on depth. Any interval CSV (HOLE_ID, FROM, TO) can be imported.'],
  ['Domains', 'Every metre is described by its photo measures, chemistry and geophysics, scaled, and grouped with k-means. A flat map (the first two principal components) puts alike metres together. Domains are a starting point; the geologist sets the boundaries.'],
  ['Predictions', 'Rock strength is fitted on lab UCS tests (ridge regression on log UCS), the main mineral on scanned holes (nearest centre), recovery on chemistry and geophysics. Quality is measured on holes the fit did not see.'],
  ['Structures', 'With a televiewer run, each plane has alpha and beta. With the hole direction from the survey these give true dip and dip direction (the standard core-orientation formula), plotted as poles on a lower-hemisphere equal-area stereonet.'],
  ['XPLORIX AI', 'Questions in plain words answered from the same record every screen uses, with the screens it read listed under each answer. In the demo the words come from XPLORIX templates; a live language model reads the same record.'],
]

export default function Method() {
  return (
    <Page>
      <PageHead question="How does XPLORIX read a tray photo?"
        answer="Measurement, not guesswork: each number is worked out from the photo with fixed rules you can read below, then checked by a geologist. Nothing is sent outside your account." />

      <Card title="The photo step" pad={false}>
        <Table>
          <tbody>{STEPS.map(([a, b], i) => (
            <tr key={a} style={{ borderBottom: rowLine }}><td style={{ ...tdStrong, width: 40 }}>{i + 1}</td><td style={{ ...tdStrong, width: 200 }}>{a}</td><td style={{ ...td, whiteSpace: 'normal' }}>{b}</td></tr>
          ))}</tbody>
        </Table>
      </Card>

      <Card title="What each number means" pad={false}>
        <Table>
          <thead><tr><th style={th}>Measure</th><th style={th}>How</th></tr></thead>
          <tbody>{MEASURES.map(([a, b]) => (
            <tr key={a} style={{ borderBottom: rowLine }}><td style={{ ...tdStrong, width: 220 }}>{a}</td><td style={{ ...td, whiteSpace: 'normal' }}>{b}</td></tr>
          ))}</tbody>
        </Table>
      </Card>

      <Card title="Beyond the photo step" pad={false}>
        <Table>
          <tbody>{MORE.map(([a, b]) => (
            <tr key={a} style={{ borderBottom: rowLine }}><td style={{ ...tdStrong, width: 220 }}>{a}</td><td style={{ ...td, whiteSpace: 'normal' }}>{b}</td></tr>
          ))}</tbody>
        </Table>
      </Card>

      <Card title="What it cannot do yet">
        <ul style={{ margin: 0, paddingLeft: 18, color: T.muted, fontSize: 13, lineHeight: 1.8 }}>
          <li>Hairline cracks thinner than a pixel on the photo are missed. Better photos find more; the geologist adds the rest.</li>
          <li>Rubbly core is hard to split into pieces and is undercounted.</li>
          <li>Very white core can be read as empty tray. Mark it &quot;There is core&quot; on the tray.</li>
          <li>True dip and dip direction need a televiewer run or an orientation line on the core; without either, alpha alone is given.</li>
          <li>It does not name the rock from the photo alone. Classes are by look; names come from the geologist, or from matching the classes to the hand log.</li>
          <li>Minerals are measured only where the core was scanned; elsewhere they are predicted, and the screen says which.</li>
          <li>In this demo the assays, geophysics, scanner, televiewer, lab tests, hand logs and RC holes are sample data. The tray photos and everything measured on them are real.</li>
        </ul>
      </Card>

      <Note>Every result is shown as <b>suggested</b> until a geologist marks the tray checked. Every change is kept with who and when. In the full build these checked trays are what teaches the photo step to do better.</Note>
      <div style={{ fontSize: 12, color: T.faint, lineHeight: 1.6 }}>{NVCL_CREDIT}</div>
    </Page>
  )
}
