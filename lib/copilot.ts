/* ==========================================================================
 * XPLORIX COPILOT — THE AGENT
 *
 * Once added to Pulse, Copilot reads every reading of every rig every
 * second, together with what the record knows about that rig: the rock
 * around it, its normal speed, the best crew in the ground, its bit, the
 * contract it is paid on and what it costs. For each thing worth acting on
 * it says WHAT is happening, HOW to fix it step by step, WHY (the readings
 * behind it), and its RECORD (how often that fix worked). After the crew
 * acts, it watches the readings and says whether it worked.
 *
 * Rules on the record today; trained models replace them behind the same
 * calls at launch, learning from the outcomes kept in memory.ts.
 * ========================================================================== */

import { DATA, holeOf, projectOf, normalRop, ratePerMetre } from './data'
import { nextBroken, stopCall, targetLevel } from './ground'
import { EASED, NORMAL, liveCost, type Live, type Settings } from './rig'

export type Kind = 'broken' | 'core' | 'blocking' | 'engine' | 'pump' | 'standby' | 'idle' | 'cost' | 'bit' | 'stop' | 'survey'
export type Lang = 'en' | 'ar' | 'hi' | 'ur'
export type Level = 'act' | 'watch' | 'info'
export type Fix =
  | { type: 'settings'; settings: Settings }
  | { type: 'flush' }
  | { type: 'engine-off' }
  | { type: 'log-standby' }
  | { type: 'none' }

export interface Advice {
  key: string; rig: string; hole: string; kind: Kind; level: Level
  what: string                      // one line: what is happening
  how: string[]                     // the steps, in order
  why: string[]                     // the readings and record behind it
  say: Record<Lang, string>         // what Copilot speaks
  fix: Fix                          // what "Apply" (or level 3) does
  gain?: string                     // what it is worth, in plain words
  money?: number                    // SAR at stake, where there is money
}

const r0 = (n: number) => Math.round(n).toLocaleString('en-US')
const r1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1)
const mins = (s: number) => Math.round(s / 60)
const clock = (t: number) => { const s = Math.floor(14 * 3600 + 20 * 60 + t) % 86400; const p = (n: number) => String(n).padStart(2, '0'); return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}` }

/* The slope of a reading over the last `n` minutes, per hour. */
function slope(s: Live, k: 'pressure' | 'flow' | 'engine' | 'rop', n = 15) {
  const h = s.history.slice(-n)
  if (h.length < 4) return 0
  return (h[h.length - 1][k] - h[0][k]) / ((h[h.length - 1].t - h[0].t) / 3600 || 1)
}

const levelByProject = new Map(DATA.projects.map(p => [p.name, targetLevel(p.holes)]))

export function think(s: Live): Advice[] {
  const out: Advice[] = []
  const { rig, now } = s
  const hole = holeOf(rig)
  const base = { rig: rig.rig, hole: rig.hole }
  const eased = s.settings.rpm <= 800 && s.settings.wob <= 18
  const best = DATA.best[rig.formation]
  const normal = normalRop(rig, rig.formation)

  if (s.mode === 'drilling') {
    // ① The rock ahead, from the cored holes around
    const nb = nextBroken(s.ahead, s.depth)
    if (nb && nb.inMetres > 0 && nb.inMetres <= 4 && !eased) out.push({
      ...base, key: `${rig.rig}:broken:${Math.round(nb.top)}`, kind: 'broken', level: 'act',
      what: `Broken ground in ${r1(nb.inMetres)} m, from ${r0(nb.top)} to ${r0(nb.base)} m`,
      how: [`Ease rotation to ${EASED.rpm} rpm`, `Bring bit load down to ${EASED.wob} kN`, `Raise water to ${EASED.flow} L/min to keep the face clean`, 'Shorten runs to 1.5 m through the zone', 'Back to normal settings once torque is steady again'],
      why: [`${nb.holes.join(', ')} ${nb.holes.length === 1 ? 'shows' : 'show'} broken rock at this depth: about ${r1(nb.ff)} fractures a metre`, `${r0(nb.sure * 100)}% sure, from how far the holes are and how much they agree`, 'At full settings broken rock grabs the bit and the core falls out of the tube'],
      say: {
        en: `${rig.rig}. Broken ground in ${r1(nb.inMetres)} metres. Ease to ${EASED.rpm} rpm and ${EASED.wob} kilonewtons, and shorten the runs.`,
        ar: `${rig.rig}. أرض متكسرة بعد ${r1(nb.inMetres)} متر. خفّف الدوران إلى ${EASED.rpm} والحمل إلى ${EASED.wob} كيلو نيوتن وقصّر الشوط.`,
        hi: `${rig.rig}. ${r1(nb.inMetres)} मीटर में टूटी चट्टान है। रोटेशन ${EASED.rpm} और बिट लोड ${EASED.wob} किलोन्यूटन करें, और रन छोटे रखें।`,
        ur: `${rig.rig}. ${r1(nb.inMetres)} میٹر میں ٹوٹی چٹان ہے۔ روٹیشن ${EASED.rpm} اور بٹ لوڈ ${EASED.wob} کلو نیوٹن کریں، اور رن چھوٹے رکھیں۔`,
      },
      fix: { type: 'settings', settings: { ...EASED } }, gain: 'Steady torque, core kept in the tube, no stuck rods',
    })
    // ③ Core quality: in broken ground at full settings
    if (s.ahead.find(m => s.depth >= m.from && s.depth < m.to && m.sure >= 0.45)?.broken && !eased) {
      const m = s.ahead.find(x => s.depth >= x.from && s.depth < x.to)!
      const rec = Math.max(55, Math.round((m.recovery || 92) - 18))
      out.push({
        ...base, key: `${rig.rig}:core:${Math.floor(s.depth)}`, kind: 'core', level: 'act',
        what: `Core being lost: recovery heading for about ${rec}% in this broken zone`,
        how: [`Ease now: ${EASED.rpm} rpm and ${EASED.wob} kN`, 'Stop this run at 1.5 m and pull the tube', 'Check the core lifter before the next run'],
        why: [`Torque ${r0(now.torque)} N·m and jumping; speed down to ${now.rop.toFixed(2)} m/h`, `The holes around recovered ${r0(m.recovery || 0)}% here at careful settings`, `About ${r1(s.coreLoss)} m of core at risk so far`],
        say: { en: `${rig.rig}. Core is being lost. Ease off now and pull at one and a half metres.`, ar: `${rig.rig}. اللب يضيع. خفّف الآن واسحب عند متر ونصف.`, hi: `${rig.rig}. कोर गिर रहा है। अभी धीमा करें और डेढ़ मीटर पर खींचें।`, ur: `${rig.rig}. کور ضائع ہو رہا ہے۔ ابھی آہستہ کریں اور ڈیڑھ میٹر پر کھینچیں۔` },
        fix: { type: 'settings', settings: { ...EASED } }, gain: 'Core recovery back above 90%',
      })
    }
    // Bit blocking: pressure up, flow down
    const dp = slope(s, 'pressure', 12), df = slope(s, 'flow', 12)
    if (s.blockage > 0.25 || (dp > 8 && df < -8)) out.push({
      ...base, key: `${rig.rig}:blocking`, kind: 'blocking', level: 'act',
      what: `Bit blocking at ${r1(s.depth)} m: water pressure up, return flow down`,
      how: ['Stop the feed', 'Pull back 0.5 m off the bottom', 'Flush 2 minutes at full water', `Restart at ${EASED.rpm} rpm with light bit load, then build up`],
      why: [`Pressure ${r1(now.pressure)} bar, up ${r1(Math.max(0, dp) * 0.25)} bar in 15 minutes`, `Flow ${r0(now.flow)} L/min, down from ${r0(NORMAL.flow)}`, `Speed down to ${now.rop.toFixed(2)} m/h; core jammed in the tube or cuttings packing the bit`],
      say: { en: `${rig.rig}. The bit is blocking. Stop the feed, pull back half a metre and flush for two minutes.`, ar: `${rig.rig}. الرأس ينسد. أوقف التغذية، ارفع نصف متر واغسل دقيقتين.`, hi: `${rig.rig}. बिट जाम हो रहा है। फीड रोकें, आधा मीटर ऊपर करें और दो मिनट फ्लश करें।`, ur: `${rig.rig}. بٹ بند ہو رہا ہے۔ فیڈ روکیں، آدھا میٹر اوپر کریں اور دو منٹ فلش کریں۔` },
      fix: { type: 'flush' }, gain: 'About 1.5 h of stuck rods avoided',
    })
    // ⑤ Geology GPS: nothing left to find below
    if (hole) {
      const call = stopCall(hole, projectOf(rig).holes, s.depth, rig.holePlanned, levelByProject.get(rig.project) ?? 0.08)
      if (call && s.depth >= call.stopAt - 0.5) {
        const cpm = liveCost(s).base
        out.push({
          ...base, key: `${rig.rig}:stop`, kind: 'stop', level: 'act',
          what: `No target left below: this hole can stop at ${r0(s.depth)} m and save ${r0(call.saving)} m`,
          how: ['Ask the geologist to confirm the stop', 'Take the end-of-hole survey reading', 'Plan the move to the next hole'],
          why: [`${call.holes.join(', ')} show no target-grade veins between here and the planned ${r0(rig.holePlanned ?? 0)} m`, call.lastTarget ? `Last target-grade rock around this hole at ${r0(call.lastTarget)} m` : 'No target-grade rock seen around this hole at this level', `At SAR ${r0(cpm)} a metre that is about SAR ${r0(call.saving * cpm)} not spent`],
          say: { en: `${rig.rig}. Geology GPS: no target left below. This hole can stop here and save ${r0(call.saving)} metres. Ask the geologist to confirm.`, ar: `${rig.rig}. لا يوجد هدف في الأسفل. يمكن إيقاف الحفرة هنا وتوفير ${r0(call.saving)} متر. اطلب تأكيد الجيولوجي.`, hi: `${rig.rig}. नीचे कोई लक्ष्य नहीं बचा। यह होल यहीं रुक सकता है और ${r0(call.saving)} मीटर बचेंगे। भूवैज्ञानिक से पुष्टि करें।`, ur: `${rig.rig}. نیچے کوئی ہدف باقی نہیں۔ یہ ہول یہیں رک سکتا ہے اور ${r0(call.saving)} میٹر بچیں گے۔ جیولوجسٹ سے تصدیق کریں۔` },
          fix: { type: 'none' }, gain: `${r0(call.saving)} m and about SAR ${r0(call.saving * cpm)} not spent`, money: call.saving * cpm,
        })
      }
    }
    // ② Money: costing more a metre than the contract pays
    const cost = liveCost(s), rate = ratePerMetre(rig)
    if (cost.perMetre && cost.perMetre > rate * 1.05 && s.ahead.find(m => s.depth >= m.from && s.depth < m.to)?.broken !== true && s.blockage < 0.2) {
      const target: Settings = { rpm: 940, wob: 25, flow: 48 }
      out.push({
        ...base, key: `${rig.rig}:cost`, kind: 'cost', level: 'watch',
        what: `Costing SAR ${r0(cost.perMetre)} a metre; the contract pays SAR ${r0(rate)}`,
        how: best ? [`Raise rotation to ${target.rpm} rpm`, `Bit load up to ${target.wob} kN`, `Aim for ${best.rop.toFixed(2)} m/h: what ${best.name} drills in this ground`, `Check the bit: ${r0(s.bitUsed)} of ${r0(s.bitLife)} m on it`] : [`Raise rotation to ${target.rpm} rpm`, `Bit load up to ${target.wob} kN`],
        why: [`${now.rop.toFixed(2)} m/h now; this rig's normal here is ${normal.toFixed(2)} m/h`, `This rig costs about SAR ${r0(cost.perHour)} an hour, so every slow hour costs more a metre`, ...(best ? [`Best crew in ${rig.formation.replace(' Formation', '').toLowerCase()} ground: ${best.name} at ${best.rop.toFixed(2)} m/h`] : [])],
        say: { en: `${rig.rig} is costing ${r0(cost.perMetre)} riyals a metre, more than the ${r0(rate)} the contract pays. Raise to ${target.rpm} rpm and ${target.wob} kilonewtons.`, ar: `${rig.rig} يكلف ${r0(cost.perMetre)} ريال للمتر، أكثر من ${r0(rate)} في العقد. ارفع إلى ${target.rpm} دورة و${target.wob} كيلو نيوتن.`, hi: `${rig.rig} का खर्च ${r0(cost.perMetre)} रियाल प्रति मीटर है, जो कॉन्ट्रैक्ट के ${r0(rate)} से ज़्यादा है। ${target.rpm} आरपीएम और ${target.wob} किलोन्यूटन करें।`, ur: `${rig.rig} کا خرچ ${r0(cost.perMetre)} ریال فی میٹر ہے، جو کنٹریکٹ کے ${r0(rate)} سے زیادہ ہے۔ ${target.rpm} آر پی ایم اور ${target.wob} کلو نیوٹن کریں۔` },
        fix: { type: 'settings', settings: target }, gain: `Back under the SAR ${r0(rate)} rate`, money: (cost.perMetre - rate) * Math.max(1, now.rop) * 12,
      })
    }
  }

  // ④ Engine losing its cooling
  if (s.now.engine > 92 && s.engineOn) {
    const rate = Math.max(0.5, slope(s, 'engine', 10))
    const left = (105 - s.now.engine) / rate * 60
    out.push({
      ...base, key: `${rig.rig}:engine`, kind: 'engine', level: s.now.engine > 97 ? 'act' : 'watch',
      what: `Engine ${r0(s.now.engine)} °C and rising: about ${r0(Math.max(1, left))} minutes to cut-out`,
      how: ['Ease to 700 rpm and 18 kN to take load off', 'At the next rod change check the coolant level', 'Blow out the radiator screen', 'If it passes 100 °C, stop before the cut-out, not after'],
      why: [`Up ${r1(rate)} °C an hour with the same load, so cooling is falling behind`, 'Cut-out at 105 °C; a seized engine is a 2 to 3 day breakdown'],
      say: { en: `${rig.rig}. Engine at ${r0(s.now.engine)} degrees and rising. About ${r0(Math.max(1, left))} minutes to cut-out. Ease off and check the coolant.`, ar: `${rig.rig}. حرارة المحرك ${r0(s.now.engine)} وترتفع. حوالي ${r0(Math.max(1, left))} دقيقة حتى التوقف. خفّف وافحص التبريد.`, hi: `${rig.rig}. इंजन ${r0(s.now.engine)} डिग्री पर है और बढ़ रहा है। कटआउट में लगभग ${r0(Math.max(1, left))} मिनट। लोड कम करें और कूलेंट जांचें।`, ur: `${rig.rig}. انجن ${r0(s.now.engine)} ڈگری پر ہے اور بڑھ رہا ہے۔ کٹ آؤٹ میں تقریباً ${r0(Math.max(1, left))} منٹ۔ لوڈ کم کریں اور کولنٹ چیک کریں۔` },
      fix: { type: 'settings', settings: { rpm: 700, wob: 18, flow: s.settings.flow } }, gain: 'A 2 to 3 day engine breakdown avoided',
    })
  }

  // ④ Water pump wearing out
  if (s.pump < 0.93 && s.script.pumpWear) {
    const perDay = s.script.pumpWear * 24
    const days = Math.max(0.5, (s.pump - 0.75) / perDay)
    out.push({
      ...base, key: `${rig.rig}:pump`, kind: 'pump', level: 'watch',
      what: `Water pump wearing: output ${r0((1 - s.pump) * 100)}% below new, about ${r1(days)} days to the service limit`,
      how: ['Check the pump valves and seals at the next trip out', 'Have the pump service kit sent to site', 'Book the change before it drops below 75%: blocked bits and burnt core follow'],
      why: [`Same settings, but flow ${r0(now.flow)} L/min against ${r0(s.settings.flow)} set`, `Pressure at the same settings has fallen to ${r1(now.pressure)} bar`, `Falling about ${r1(perDay * 100)}% a day`],
      say: { en: `${rig.rig}. The water pump is wearing. About ${r1(days)} days left before it needs a service. Book it at the next trip.`, ar: `${rig.rig}. مضخة الماء تتآكل. بقي حوالي ${r1(days)} يوم قبل الصيانة. احجزها في الرحلة القادمة.`, hi: `${rig.rig}. पानी का पंप घिस रहा है। सर्विस से पहले लगभग ${r1(days)} दिन बचे हैं। अगले ट्रिप पर बुक करें।`, ur: `${rig.rig}. پانی کا پمپ گھس رہا ہے۔ سروس سے پہلے تقریباً ${r1(days)} دن باقی ہیں۔ اگلے ٹرپ پر بک کریں۔` },
      fix: { type: 'none' }, gain: 'Pump changed on your time, not in the middle of a hole',
    })
  }

  // Bit at the end of its life
  const left = s.bitLife - s.bitUsed
  if (left < 10 && s.mode === 'drilling') out.push({
    ...base, key: `${rig.rig}:bit`, kind: 'bit', level: left < 4 ? 'act' : 'watch',
    what: `${r1(Math.max(0, left))} m of bit life left`,
    how: [`Send a new ${DATA.bit.name} to the rig now`, 'Change it at the next trip out, not on a special trip', `If the store has none, order today: ${DATA.bit.supplier}, ${DATA.bit.lead} days`],
    why: [`${r0(s.bitUsed)} m on this bit, rated for ${r0(s.bitLife)} m`, `Speed falls as the bit wears: ${now.rop.toFixed(2)} m/h now`],
    say: { en: `${rig.rig}. About ${r0(Math.max(0, left))} metres of bit life left. Send a new bit for the next trip.`, ar: `${rig.rig}. بقي حوالي ${r0(Math.max(0, left))} متر من عمر الرأس. أرسل رأساً جديداً للرحلة القادمة.`, hi: `${rig.rig}. बिट की लगभग ${r0(Math.max(0, left))} मीटर लाइफ बची है। अगले ट्रिप के लिए नया बिट भेजें।`, ur: `${rig.rig}. بٹ کی تقریباً ${r0(Math.max(0, left))} میٹر لائف باقی ہے۔ اگلے ٹرپ کے لیے نیا بٹ بھیجیں۔` },
    fix: { type: 'none' }, gain: 'One trip out of the hole saved', money: DATA.bit.rate,
  })

  // ② Money: client standby is billable
  if (s.mode === 'standby' && s.standbyReason && /geolog|client|instruction|access|permit/i.test(s.standbyReason)) {
    const perDay = projectOf(rig).standbyPerDay
    const hrs = (s.t - (s.standbyFrom ?? 0)) / 3600
    const due = perDay * hrs / 24
    out.push({
      ...base, key: `${rig.rig}:standby`, kind: 'standby', level: 'act',
      what: `Client standby since ${clock(s.standbyFrom ?? 0)}: SAR ${r0(due)} billable so far`,
      how: ['Log the standby now, with the start time', `Reason: ${s.standbyReason.toLowerCase()}`, "Get the client's site representative to sign it", 'Copilot puts it on today\'s shift log and the invoice'],
      why: [`No rotation for ${r0(hrs * 60)} minutes with the rig ready`, `Contract standby rate SAR ${r0(perDay)} a day`, 'Unlogged standby is the most common money lost on drilling contracts'],
      say: { en: `${rig.rig}. Client standby for ${r0(hrs * 60)} minutes. That is billable: about ${r0(due)} riyals so far. Log it now.`, ar: `${rig.rig}. توقف بسبب العميل منذ ${r0(hrs * 60)} دقيقة. هذا قابل للفوترة، حوالي ${r0(due)} ريال حتى الآن. سجّله الآن.`, hi: `${rig.rig}. क्लाइंट की वजह से ${r0(hrs * 60)} मिनट से स्टैंडबाय है। यह बिल होगा, अब तक लगभग ${r0(due)} रियाल। अभी लॉग करें।`, ur: `${rig.rig}. کلائنٹ کی وجہ سے ${r0(hrs * 60)} منٹ سے اسٹینڈ بائی ہے۔ یہ بل ہوگا، اب تک تقریباً ${r0(due)} ریال۔ ابھی لاگ کریں۔` },
      fix: { type: 'log-standby' }, gain: `SAR ${r0(due)} on the invoice instead of lost`, money: due,
    })
  }
  // Engine idling with nothing to do
  if (s.mode === 'standby' && s.engineOn && s.idleSecs > 15 * 60) {
    const hrs = s.idleSecs / 3600, litres = hrs * 9
    out.push({
      ...base, key: `${rig.rig}:idle`, kind: 'idle', level: 'watch',
      what: `Engine idling on standby: ${r0(litres)} L of diesel burned for no metres`,
      how: ['Switch the engine off while you wait', 'Keep the lights on the auxiliary', 'Restart 5 minutes before drilling'],
      why: [`Engine on for ${mins(s.idleSecs)} minutes with no rotation`, `About 9 L an hour idling, SAR ${DATA.dieselSarPerLitre} a litre`, `${r1(litres * 2.68)} kg of CO₂ for nothing`],
      say: { en: `${rig.rig}. The engine has idled for ${mins(s.idleSecs)} minutes on standby. Switch it off while you wait.`, ar: `${rig.rig}. المحرك يعمل منذ ${mins(s.idleSecs)} دقيقة بدون حفر. أطفئه أثناء الانتظار.`, hi: `${rig.rig}. स्टैंडबाय पर इंजन ${mins(s.idleSecs)} मिनट से चल रहा है। इंतज़ार में बंद कर दें।`, ur: `${rig.rig}. اسٹینڈ بائی پر انجن ${mins(s.idleSecs)} منٹ سے چل رہا ہے۔ انتظار میں بند کر دیں۔` },
      fix: { type: 'engine-off' }, gain: 'About 9 L of diesel an hour saved', money: litres * DATA.dieselSarPerLitre,
    })
  }

  // Survey due
  if (hole?.lastSurvey && s.depth - hole.lastSurvey >= 45 && s.mode === 'drilling') out.push({
    ...base, key: `${rig.rig}:survey:${Math.round(hole.lastSurvey)}`, kind: 'survey', level: 'info',
    what: `Survey due: last reading at ${r0(hole.lastSurvey)} m, now ${r0(s.depth)} m`,
    how: ['Take a survey reading at the next rod change', 'Upload it: Copilot checks the drift against the plan'],
    why: ['Survey every 50 m or so, so drift is caught while it can still be corrected'],
    say: { en: `${rig.rig}. Survey due. Take a reading at the next rod change.`, ar: `${rig.rig}. حان وقت المسح. خذ قراءة عند تغيير القضيب القادم.`, hi: `${rig.rig}. सर्वे का समय है। अगले रॉड चेंज पर रीडिंग लें।`, ur: `${rig.rig}. سروے کا وقت ہے۔ اگلی راڈ تبدیلی پر ریڈنگ لیں۔` },
    fix: { type: 'none' },
  })
  const rank: Record<Level, number> = { act: 0, watch: 1, info: 2 }
  return out.sort((a, b) => rank[a.level] - rank[b.level])
}

/* After the crew acts: did it work? Returns a verdict once the readings can
 * tell, or null while it is still too early. */
export function verdict(a: Advice, before: Live, now: Live): { worked: boolean; text: string; hours: number; sar: number } | null {
  const dt = now.t - before.t
  switch (a.kind) {
    case 'broken': case 'core': {
      const zoneEnd = nextBroken(before.ahead, before.depth)?.base ?? before.depth + 1
      if (now.depth < zoneEnd && dt < 6 * 3600) return null
      const loss = now.coreLoss - before.coreLoss, L = Math.max(0.5, zoneEnd - before.depth)
      const ok = loss < L * 0.2
      return { worked: ok, hours: ok ? Math.round((0.33 * L) * 10) / 10 : 0, sar: 0, text: ok ? `Through ${r1(L)} m of broken ground with steady torque; ${r1(Math.max(0, L * 0.27 - loss))} m of core kept` : `${r1(loss)} m of core lost in the zone` }
    }
    case 'blocking':
      if (now.mode === 'flushing' || dt < 330) return null
      return { worked: now.blockage < 0.15 && now.now.pressure < 24, hours: now.blockage < 0.15 ? 1.5 : 0, sar: 0, text: now.blockage < 0.15 ? `Pressure back to ${r1(now.now.pressure)} bar, flow ${r0(now.now.flow)} L/min: drilling again` : 'Still blocked: pull the tube' }
    case 'engine':
      if (now.now.engine > 91 && dt < 3 * 3600) return null
      return { worked: now.now.engine <= 91, hours: now.now.engine <= 91 ? 3 : 0, sar: 0, text: now.now.engine <= 91 ? `Engine down to ${r0(now.now.engine)} °C; no cut-out` : `Engine still ${r0(now.now.engine)} °C` }
    case 'cost': {
      if (dt < 20 * 60 || now.mode !== 'drilling') return null
      const c = liveCost(now), rate = ratePerMetre(now.rig)
      return { worked: (c.perMetre ?? 9e9) <= rate * 1.05, hours: 0, sar: 0, text: c.perMetre ? `Now SAR ${r0(c.perMetre)} a metre at ${now.now.rop.toFixed(2)} m/h` : 'No metres yet' }
    }
    case 'idle': return { worked: !now.engineOn, hours: 0, sar: 0, text: 'Engine off: about 9 L of diesel an hour saved' }
    case 'standby': return { worked: true, hours: 0, sar: a.money ?? 0, text: `Standby logged: SAR ${r0(a.money ?? 0)} on today's shift log for the invoice` }
    case 'stop': return { worked: true, hours: 0, sar: a.money ?? 0, text: `Hole stopped at ${r0(before.depth)} m: ${a.gain ?? ''}` }
    case 'bit': return { worked: true, hours: 2, sar: 0, text: 'New bit at the rig: changed at the next trip, no extra trip out' }
    case 'pump': return { worked: true, hours: 0, sar: 0, text: 'Pump service booked before it reaches the limit' }
    case 'survey': return { worked: true, hours: 0, sar: 0, text: 'Survey reading taken' }
    default: return { worked: true, hours: 0, sar: 0, text: 'Done' }
  }
}
