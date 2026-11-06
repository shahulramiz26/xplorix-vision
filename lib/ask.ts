/* ==========================================================================
 * ASK COPILOT
 *
 * The driller asks by voice or types: about the rock ahead, settings, the
 * bit, speed, cost, the engine, the survey, what to do next. Or says what
 * happened ("we stopped forty minutes for water", "changed the bit") and
 * Copilot writes it into the shift log.
 * ========================================================================== */

import { DATA, normalRop, ratePerMetre } from './data'
import { nextBroken } from './ground'
import { liveCost, type Live } from './rig'
import type { Advice, Lang } from './copilot'

export interface LogLine { at: number; rig: string; depth: number; text: string; kind: 'bit' | 'rod' | 'downtime' | 'incident' | 'survey' | 'note' | 'copilot'; minutes?: number }
export interface Answer { text: Record<Lang, string>; log?: Omit<LogLine, 'at' | 'rig' | 'depth'> }

const has = (q: string, ...w: string[]) => w.some(x => q.includes(x))
const r0 = (n: number) => Math.round(n).toLocaleString('en-US')
const r1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1)
const all = (s: string): Record<Lang, string> => ({ en: s, ar: s, hi: s, ur: s })

function number(q: string) {
  const m = q.match(/(\d+(?:\.\d+)?)/); if (m) return Number(m[1])
  const W: [string, number][] = [['half an hour', 30], ['an hour', 60], ['one hour', 60], ['two hours', 120], ['ninety', 90], ['sixty', 60], ['fifty', 50], ['forty', 40], ['thirty', 30], ['twenty', 20], ['fifteen', 15], ['ten', 10], ['five', 5]]
  return W.find(([w]) => q.includes(w))?.[1] ?? null
}

export function answer(raw: string, s: Live, top: Advice | undefined): Answer {
  const q = raw.toLowerCase().replace(/[?.!,]/g, ' ')
  const d = r1(s.depth)
  if (has(q, 'bit change', 'changed the bit', 'new bit', 'change bit', 'تغيير الرأس', 'बिट बदला', 'بٹ بدلا')) return { log: { kind: 'bit', text: `Bit changed at ${d} m` }, text: { en: `Logged: bit change at ${d} metres.`, ar: `تم التسجيل: تغيير الرأس عند ${d} متر.`, hi: `लॉग किया: ${d} मीटर पर बिट बदला।`, ur: `لاگ کیا: ${d} میٹر پر بٹ بدلا۔` } }
  if (has(q, 'rod change', 'added a rod', 'add rod', 'تغيير القضيب')) return { log: { kind: 'rod', text: `Rod added at ${d} m` }, text: { en: `Logged: rod added at ${d} metres.`, ar: `تم التسجيل: إضافة قضيب عند ${d} متر.`, hi: `लॉग किया: ${d} मीटर पर रॉड जोड़ी।`, ur: `لاگ کیا: ${d} میٹر پر راڈ لگائی۔` } }
  if (has(q, 'stopped', 'waiting', 'standby', 'down for', 'توقفنا', 'انتظار', 'रुके', 'رکے')) {
    const min = number(q) ?? 30
    const reason = has(q, 'water') ? 'Water Shortage' : has(q, 'geolog') ? 'Geologist Standby' : has(q, 'fuel') ? 'Fuel Shortage' : has(q, 'repair', 'broke', 'breakdown') ? 'Mechanical Breakdown' : has(q, 'hydraulic') ? 'Hydraulic Issue' : 'Other'
    return { log: { kind: 'downtime', minutes: min, text: `Stopped ${min} min: ${reason.toLowerCase()}` }, text: { en: `Logged: ${min} minutes stopped, ${reason.toLowerCase()}.${/Water|Geolog/.test(reason) ? ' That is client time: it goes on the invoice.' : ''}`, ar: `تم التسجيل: توقف ${min} دقيقة.`, hi: `लॉग किया: ${min} मिनट रुके।`, ur: `لاگ کیا: ${min} منٹ رکے۔` } }
  }
  if (has(q, 'incident', 'near miss', 'injur', 'hurt', 'حادث', 'दुर्घटना', 'حادثہ')) return { log: { kind: 'incident', text: `Incident at ${d} m: "${raw.trim()}"` }, text: { en: 'Logged as an incident. The supervisor has been told.', ar: 'تم التسجيل كحادث وتم إبلاغ المشرف.', hi: 'घटना के रूप में लॉग किया। सुपरवाइज़र को बताया गया।', ur: 'واقعہ لاگ کیا گیا۔ سپروائزر کو بتا دیا گیا۔' } }
  if (has(q, 'survey taken', 'took a survey', 'survey reading')) return { log: { kind: 'survey', text: `Survey reading at ${d} m` }, text: all(`Logged: survey reading at ${d} metres.`) }

  if (has(q, 'what next', "what's next", 'what should', 'what do i', 'next step', 'ماذا', 'क्या करें', 'کیا کریں')) return top ? { text: { en: `${top.what}. ${top.how.map((h, i) => `${i + 1}: ${h}`).join('. ')}.`, ar: top.say.ar, hi: top.say.hi, ur: top.say.ur } } : { text: { en: 'Nothing needs you right now. Keep these settings.', ar: 'لا شيء يحتاجك الآن. استمر بهذه الإعدادات.', hi: 'अभी कुछ नहीं करना। यही सेटिंग रखें।', ur: 'ابھی کچھ نہیں کرنا۔ یہی سیٹنگ رکھیں۔' } }
  if (has(q, 'ahead', 'ground', 'rock', 'الأرض', 'चट्टान', 'چٹان')) {
    const n = nextBroken(s.ahead, s.depth)
    return n ? { text: { en: `Broken ground from ${r0(n.top)} to ${r0(n.base)} metres, ${r1(n.inMetres)} metres below the bit, from ${n.holes.join(' and ')}. ${r0(n.sure * 100)} percent sure.`, ar: `أرض متكسرة من ${r0(n.top)} إلى ${r0(n.base)} متر، على بعد ${r1(n.inMetres)} متر.`, hi: `${r0(n.top)} से ${r0(n.base)} मीटर तक टूटी चट्टान, बिट से ${r1(n.inMetres)} मीटर नीचे।`, ur: `${r0(n.top)} سے ${r0(n.base)} میٹر تک ٹوٹی چٹان، بٹ سے ${r1(n.inMetres)} میٹر نیچے۔` } }
      : { text: { en: 'The holes around show good rock for the next twelve metres.', ar: 'الحفر المجاورة تظهر صخراً جيداً للأمتار القادمة.', hi: 'आसपास के होल अगले बारह मीटर अच्छी चट्टान दिखाते हैं।', ur: 'آس پاس کے ہول اگلے بارہ میٹر اچھی چٹان دکھاتے ہیں۔' } }
  }
  if (has(q, 'setting', 'rpm', 'best', 'how fast should', 'الإعدادات', 'सेटिंग', 'سیٹنگ')) {
    const b = DATA.best[s.rig.formation]
    return { text: all(`Now ${s.settings.rpm} rpm, ${s.settings.wob} kilonewtons, ${s.settings.flow} litres a minute.${b ? ` ${b.name} drills this ground fastest, at ${b.rop.toFixed(2)} metres an hour.` : ''}`) }
  }
  if (has(q, 'bit', 'الرأس', 'बिट', 'بٹ')) return { text: { en: `${r0(s.bitUsed)} metres on this bit, about ${r0(Math.max(0, s.bitLife - s.bitUsed))} metres of life left.`, ar: `على الرأس ${r0(s.bitUsed)} متر، بقي حوالي ${r0(Math.max(0, s.bitLife - s.bitUsed))} متر.`, hi: `इस बिट पर ${r0(s.bitUsed)} मीटर, लगभग ${r0(Math.max(0, s.bitLife - s.bitUsed))} मीटर बचे।`, ur: `اس بٹ پر ${r0(s.bitUsed)} میٹر، تقریباً ${r0(Math.max(0, s.bitLife - s.bitUsed))} میٹر باقی۔` } }
  if (has(q, 'cost', 'money', 'التكلفة', 'खर्च', 'خرچ')) { const c = liveCost(s); return { text: all(c.perMetre ? `${r0(c.perMetre)} riyals a metre right now. The contract pays ${r0(ratePerMetre(s.rig))}.` : 'Not drilling right now, so no cost a metre.') } }
  if (has(q, 'speed', 'fast', 'slow', 'rate', 'السرعة', 'स्पीड', 'رفتار')) return { text: all(`${s.now.rop.toFixed(2)} metres an hour. This rig's normal here is ${normalRop(s.rig, s.rig.formation).toFixed(2)}.`) }
  if (has(q, 'engine', 'temperature', 'المحرك', 'इंजन', 'انجن')) return { text: all(`Engine at ${r0(s.now.engine)} degrees.${s.now.engine > 92 ? ' That is high.' : ' Normal.'}`) }
  if (has(q, 'finish', 'when', 'planned', 'متى', 'कब', 'کب')) return { text: all(s.rig.holePlanned ? `${r1(Math.max(0, s.rig.holePlanned - s.depth))} metres to the planned ${r0(s.rig.holePlanned)}, about ${r1(Math.max(0, s.rig.holePlanned - s.depth) / normalRop(s.rig, s.rig.formation))} drilling hours.` : 'No planned depth for this hole.') }
  return { text: { en: 'Ask me what to do next, the rock ahead, settings, the bit, speed, cost or the engine. Or tell me what happened: "we stopped forty minutes for water".', ar: 'اسألني ماذا أفعل الآن، أو عن الأرض القادمة أو الإعدادات أو الرأس.', hi: 'मुझसे पूछें: अब क्या करें, आगे की चट्टान, सेटिंग, बिट या खर्च।', ur: 'مجھ سے پوچھیں: اب کیا کریں، آگے کی چٹان، سیٹنگ، بٹ یا خرچ۔' } }
}
