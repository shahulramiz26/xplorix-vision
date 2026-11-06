/* ==========================================================================
 * XPLORIX COPILOT — THE BRAIN
 *
 * Reads the rig and the rock every second and decides what is worth saying:
 * a warning before the problem, the settings that worked here before, and
 * the reason behind each. Then answers the driller's questions, and turns
 * what the driller says ("log a bit change", "we stopped forty minutes for
 * water") into lines of the shift log.
 *
 * Rules on the record today; the launch version puts trained models behind
 * the same calls, learning from the outcomes in store.ts.
 * ========================================================================== */

import type { AheadMetre } from './ground'
import { nextBroken } from './ground'
import { BROKEN_SETTINGS, type RigState, type Settings } from './sim'
import type { AlertKind, EntryKind } from './store'

export type Lang = 'en' | 'ar'
export interface Ctx {
  s: RigState; ahead: AheadMetre[]
  normalRop: number                      // this rig's normal m/h in this ground, from its shift logs
  bestCrew: { name: string; rop: number } | null
  lastSurvey: number | null; planned: number | null
  gpsStop: number | null; gpsSaving: number
  costPerMetre: number | null; targetCpm: number | null
  hole: string; rig: string
}
export interface Alert {
  key: string; kind: AlertKind; level: 'act' | 'watch' | 'info'
  title: string; say: Record<Lang, string>; why: string[]
  advice?: { settings?: Settings; text: string }
}

const r0 = (n: number) => Math.round(n)
const r1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1)

export function think(c: Ctx): Alert[] {
  const { s } = c
  const out: Alert[] = []
  const next = nextBroken(c.ahead, s.depth)
  const eased = s.settings.rpm <= 800 && s.settings.wob <= 18

  if (next && next.inMetres > 0 && next.inMetres <= 5) out.push({
    key: `broken-${Math.round(next.top)}`, kind: 'broken-ahead', level: 'act',
    title: `Broken ground in ${r1(next.inMetres)} m, from ${r0(next.top)} to ${r0(next.base)} m`,
    say: {
      en: `Broken ground in ${r1(next.inMetres)} metres. Ease rotation to ${BROKEN_SETTINGS.rpm} and bit load to ${BROKEN_SETTINGS.wob} kilonewtons, and shorten runs to one and a half metres.`,
      ar: `أرض متكسرة بعد ${r1(next.inMetres)} متر. خفّف الدوران إلى ${BROKEN_SETTINGS.rpm} والحمل على الرأس إلى ${BROKEN_SETTINGS.wob} كيلو نيوتن، وقصّر الشوط إلى متر ونصف.`,
    },
    why: [
      `${next.holes.join(', ')} ${next.holes.length === 1 ? 'shows' : 'show'} broken rock at this depth: about ${r1(next.ff)} fractures a metre.`,
      `${r0(next.sure * 100)}% sure, from how much the nearby holes agree and how close they are.`,
      `Eased settings keep the torque steady and the core in the tube through broken rock.`,
    ],
    advice: { settings: { ...BROKEN_SETTINGS }, text: `${BROKEN_SETTINGS.rpm} rpm · ${BROKEN_SETTINGS.wob} kN · ${BROKEN_SETTINGS.flow} L/min · runs of 1.5 m` },
  })

  if (s.ground === 'broken' && !eased) out.push({
    key: `torque-${Math.floor(s.depth)}`, kind: 'broken-ahead', level: 'act',
    title: `In broken ground now: torque swinging to ${r0(s.torque)} N·m`,
    say: { en: `You are in broken ground. Ease off now: ${BROKEN_SETTINGS.rpm} rpm and ${BROKEN_SETTINGS.wob} kilonewtons.`, ar: `أنت في أرض متكسرة. خفّف الآن: ${BROKEN_SETTINGS.rpm} دورة و${BROKEN_SETTINGS.wob} كيلو نيوتن.` },
    why: [`Torque is ${r0(s.torque)} N·m and jumping; penetration is down to ${r1(s.rop)} m/h.`, `At these settings core is falling out of the tube: about ${r1(s.coreLoss)} m lost so far.`],
    advice: { settings: { ...BROKEN_SETTINGS }, text: `${BROKEN_SETTINGS.rpm} rpm · ${BROKEN_SETTINGS.wob} kN` },
  })

  if (s.stalled > 4) out.push({
    key: `stall-${Math.floor(s.depth)}`, kind: 'stall', level: 'act',
    title: 'Bit grabbing: pull back and flush',
    say: { en: 'The bit is grabbing. Pull back half a metre and flush before you go on.', ar: 'الرأس يعلق. ارفع نصف متر واغسل قبل أن تكمل.' },
    why: [`Torque has been over 1,250 N·m for ${r0(s.stalled)} seconds.`],
  })

  if (c.normalRop > 0 && s.ground === 'good' && s.settings.rpm > 800 && s.rop < c.normalRop * 0.8 && s.t > 60) {
    const worn = s.bitUsed / s.bitLife > 0.8
    out.push({
      key: `slow-${Math.floor(s.depth / 5)}`, kind: 'slow', level: 'watch',
      title: `${r0((1 - s.rop / c.normalRop) * 100)}% slower than this rig's normal in this ground`,
      say: { en: `You are ${r0((1 - s.rop / c.normalRop) * 100)} percent slower than normal here. ${worn ? 'The bit is nearly worn: plan the change.' : 'Try sixty more rpm.'}`, ar: `أنت أبطأ من المعتاد بنسبة ${r0((1 - s.rop / c.normalRop) * 100)} بالمئة. ${worn ? 'الرأس شبه مستهلك: جهّز التبديل.' : 'جرّب زيادة ستين دورة.'}` },
      why: [`${s.rop.toFixed(2)} m/h now against ${c.normalRop.toFixed(2)} m/h, this rig's median in the same ground.`, ...(c.bestCrew ? [`Best crew here: ${c.bestCrew.name} at ${c.bestCrew.rop.toFixed(2)} m/h.`] : []), worn ? `The bit has ${r0(s.bitUsed)} of ${r0(s.bitLife)} m on it.` : 'The bit is not worn, so it is the settings.'],
      advice: worn ? { text: 'Plan a bit change at the next trip' } : { settings: { ...s.settings, rpm: Math.min(1050, s.settings.rpm + 60) }, text: `+60 rpm → ${Math.min(1050, s.settings.rpm + 60)} rpm` },
    })
  }

  const left = s.bitLife - s.bitUsed
  if (left < 15) out.push({
    key: `bit-${left < 5 ? 5 : 15}`, kind: 'bit-life', level: left < 5 ? 'act' : 'watch',
    title: `${r1(Math.max(0, left))} m of bit life left`,
    say: { en: `About ${r0(Math.max(0, left))} metres of bit life left. Have a new bit ready for the next trip.`, ar: `بقي حوالي ${r0(Math.max(0, left))} متر من عمر الرأس. جهّز رأساً جديداً للرحلة القادمة.` },
    why: [`${r0(s.bitUsed)} m on this bit, rated for ${r0(s.bitLife)} m in this ground.`, 'Changing at the next trip avoids an extra trip out of the hole.'],
    advice: { text: 'New bit to the rig before the next trip' },
  })

  if (s.engine > 93) {
    const rate = 0.06 * 60
    const mins = r0((105 - s.engine) / Math.max(0.2, rate))
    out.push({
      key: 'engine', kind: 'engine-hot', level: 'act',
      title: `Engine ${r0(s.engine)} °C and rising`,
      say: { en: `Engine at ${r0(s.engine)} degrees and rising. About ${mins} minutes to cut-out. Check coolant at the next rod change.`, ar: `حرارة المحرك ${r0(s.engine)} وترتفع. حوالي ${mins} دقيقة حتى التوقف. افحص سائل التبريد عند تغيير القضيب القادم.` },
      why: [`Up with the same load, so cooling is falling behind.`, `Cut-out at 105 °C in about ${mins} minutes at this rate.`],
      advice: { settings: { ...s.settings, rpm: 700, wob: 18 }, text: 'Ease to 700 rpm and 18 kN until the coolant is checked' },
    })
  }

  if (c.lastSurvey != null && s.depth - c.lastSurvey >= 45) out.push({
    key: `survey-${Math.round(c.lastSurvey)}`, kind: 'survey-due', level: 'info',
    title: `Survey due: last reading at ${r0(c.lastSurvey)} m`,
    say: { en: `Survey due. The last reading was at ${r0(c.lastSurvey)} metres. Take one at the next rod change.`, ar: `حان وقت المسح. آخر قراءة كانت عند ${r0(c.lastSurvey)} متر. خذ قراءة عند تغيير القضيب القادم.` },
    why: ['Survey every 50 m or so, so drift is caught while it can still be corrected.'],
  })

  if (c.gpsStop != null && s.depth >= c.gpsStop) out.push({
    key: 'gps', kind: 'gps-stop', level: 'act',
    title: `Geology GPS: target passed, stop at ${r0(c.gpsStop)} m`,
    say: { en: `The target has been passed. Geology GPS says this hole can stop here and save ${r0(c.gpsSaving)} metres. Ask the geologist to confirm.`, ar: `تم تجاوز الهدف. نظام جيولوجي جي بي إس يقول يمكن إيقاف الحفرة هنا وتوفير ${r0(c.gpsSaving)} متر. اطلب تأكيد الجيولوجي.` },
    why: ['The last 10 m of core are below target grade.', 'The holes around show no more target in the next 20 m.', `Planned depth ${c.planned ? r0(c.planned) + ' m' : 'not set'}: stopping now saves ${r0(c.gpsSaving)} m.`],
    advice: { text: 'Geologist to confirm the stop' },
  })
  const rank = { act: 0, watch: 1, info: 2 }
  return out.sort((a, b) => rank[a.level] - rank[b.level])
}

/* ── Answers ────────────────────────────────────────────────────────────── */

export interface Heard { answer: Record<Lang, string>; log?: { kind: EntryKind; minutes?: number; reason?: string; text: string } }

const has = (q: string, ...w: string[]) => w.some(x => q.includes(x))
function words2num(q: string) {
  const m = q.match(/(\d+(?:\.\d+)?)/); if (m) return Number(m[1])
  const W: Record<string, number> = { five: 5, ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, ninety: 90, 'an hour': 60, 'half an hour': 30, 'one hour': 60, 'two hours': 120 }
  const k = Object.keys(W).sort((a, b) => b.length - a.length).find(x => q.includes(x))
  return k ? W[k] : null
}

export function hear(raw: string, c: Ctx): Heard {
  const q = raw.toLowerCase().replace(/[?.!,]/g, ' ')
  const { s } = c
  const d = r1(s.depth)
  // Logging first: "log", "we stopped", "changed the bit"
  if (has(q, 'bit change', 'changed the bit', 'change bit', 'new bit', 'تغيير الرأس', 'غيرنا الرأس')) return { log: { kind: 'bit-change', text: `Bit changed at ${d} m` }, answer: { en: `Logged: bit change at ${d} metres.`, ar: `تم التسجيل: تغيير الرأس عند ${d} متر.` } }
  if (has(q, 'rod change', 'changed rod', 'add rod', 'added a rod', 'تغيير القضيب')) return { log: { kind: 'rod-change', text: `Rod added at ${d} m` }, answer: { en: `Logged: rod change at ${d} metres.`, ar: `تم التسجيل: تغيير القضيب عند ${d} متر.` } }
  if (has(q, 'stopped', 'waiting', 'standby', 'down for', 'توقفنا', 'انتظار')) {
    const min = words2num(q) ?? 30
    const reason = has(q, 'water') ? 'Water Shortage' : has(q, 'geolog') ? 'Geologist Standby' : has(q, 'fuel') ? 'Fuel Shortage' : has(q, 'breakdown', 'broke', 'repair') ? 'Mechanical Breakdown' : has(q, 'hydraulic') ? 'Hydraulic Issue' : has(q, 'instruction') ? 'Waiting for Instruction' : 'Other internal'
    return { log: { kind: 'downtime', minutes: min, reason, text: `Stopped ${min} min: ${reason.toLowerCase()}` }, answer: { en: `Logged: ${min} minutes stopped, ${reason.toLowerCase()}.`, ar: `تم التسجيل: توقف ${min} دقيقة.` } }
  }
  if (has(q, 'incident', 'near miss', 'injury', 'hurt', 'حادث')) return { log: { kind: 'incident', text: `Incident reported at ${d} m: "${raw.trim()}"` }, answer: { en: 'Logged as an incident. The supervisor has been told.', ar: 'تم التسجيل كحادث وتم إبلاغ المشرف.' } }
  if (has(q, 'survey taken', 'took a survey', 'survey reading', 'قراءة المسح')) return { log: { kind: 'survey', text: `Survey reading taken at ${d} m` }, answer: { en: `Logged: survey reading at ${d} metres.`, ar: `تم التسجيل: قراءة مسح عند ${d} متر.` } }
  if (has(q, 'note', 'log ', 'record', 'سجل')) return { log: { kind: 'note', text: raw.trim() }, answer: { en: 'Noted in the shift log.', ar: 'تمت إضافة الملاحظة إلى سجل الوردية.' } }

  // Questions
  if (has(q, 'ahead', 'ground', 'rock', 'next', 'الأرض', 'الصخر')) {
    const n = nextBroken(c.ahead, s.depth)
    return n ? { answer: { en: `Broken ground expected from ${r0(n.top)} to ${r0(n.base)} metres, ${r1(n.inMetres)} metres from the bit, from ${n.holes.join(' and ')}. ${r0(n.sure * 100)} percent sure.`, ar: `متوقع أرض متكسرة من ${r0(n.top)} إلى ${r0(n.base)} متر، على بعد ${r1(n.inMetres)} متر من الرأس.` } }
      : { answer: { en: 'The next twelve metres look like good rock in the holes around.', ar: 'الأمتار الاثني عشر القادمة تبدو صخراً جيداً حسب الحفر المجاورة.' } }
  }
  if (has(q, 'setting', 'rpm', 'best', 'how should', 'الإعدادات')) {
    const set = s.ground === 'broken' ? BROKEN_SETTINGS : s.settings
    return { answer: { en: `For this ground: ${set.rpm} rpm, ${set.wob} kilonewtons, ${set.flow} litres a minute.${c.bestCrew ? ` ${c.bestCrew.name} drills it fastest, at ${c.bestCrew.rop.toFixed(2)} metres an hour.` : ''}`, ar: `لهذه الأرض: ${set.rpm} دورة، ${set.wob} كيلو نيوتن، ${set.flow} لتر في الدقيقة.` } }
  }
  if (has(q, 'bit', 'الرأس')) return { answer: { en: `${r0(s.bitUsed)} metres on this bit, about ${r0(Math.max(0, s.bitLife - s.bitUsed))} metres of life left.`, ar: `على هذا الرأس ${r0(s.bitUsed)} متر، وبقي حوالي ${r0(Math.max(0, s.bitLife - s.bitUsed))} متر.` } }
  if (has(q, 'finish', 'when', 'done', 'end', 'متى')) {
    if (c.planned && c.planned > s.depth && s.rop > 0) {
      const h = (c.planned - s.depth) / s.rop
      return { answer: { en: `${r1(c.planned - s.depth)} metres to the planned ${r0(c.planned)}. About ${r1(h)} drilling hours at this speed.${c.gpsStop ? ` Geology GPS may stop it at ${r0(c.gpsStop)} metres.` : ''}`, ar: `بقي ${r1(c.planned - s.depth)} متر حتى العمق المخطط ${r0(c.planned)}، حوالي ${r1(h)} ساعة حفر بهذه السرعة.` } }
    }
    return { answer: { en: 'No planned depth is set for this hole.', ar: 'لا يوجد عمق مخطط لهذه الحفرة.' } }
  }
  if (has(q, 'speed', 'fast', 'slow', 'rate', 'السرعة')) return { answer: { en: `${s.rop.toFixed(2)} metres an hour. This rig's normal in this ground is ${c.normalRop.toFixed(2)}.`, ar: `${r1(s.rop)} متر في الساعة. المعتاد لهذه الحفارة في هذه الأرض ${r1(c.normalRop)}.` } }
  if (has(q, 'cost', 'money', 'التكلفة')) return { answer: c.costPerMetre ? { en: `This hole is at ${r0(c.costPerMetre)} riyals a metre${c.targetCpm ? `, target ${r0(c.targetCpm)}` : ''}.`, ar: `هذه الحفرة بتكلفة ${r0(c.costPerMetre)} ريال للمتر.` } : { en: 'No cost yet for this hole.', ar: 'لا توجد تكلفة بعد.' } }
  if (has(q, 'engine', 'temperature', 'المحرك')) return { answer: { en: `Engine at ${r0(s.engine)} degrees.${s.engine > 93 ? ' That is high: check coolant at the next rod change.' : ' Normal.'}`, ar: `حرارة المحرك ${r0(s.engine)} درجة.` } }
  if (has(q, 'survey', 'المسح')) return { answer: { en: c.lastSurvey != null ? `Last survey at ${r0(c.lastSurvey)} metres. Next due at ${r0(c.lastSurvey + 50)}.` : 'No survey reading on this hole yet.', ar: c.lastSurvey != null ? `آخر مسح عند ${r0(c.lastSurvey)} متر.` : 'لا توجد قراءة مسح بعد.' } }
  if (has(q, 'today', 'metres', 'meters', 'اليوم')) return { answer: { en: `${r1(s.metresToday)} metres today.`, ar: `${r1(s.metresToday)} متر اليوم.` } }
  if (has(q, 'target', 'stop', 'gps', 'الهدف')) return { answer: c.gpsStop ? { en: `Geology GPS says this hole can stop at ${r0(c.gpsStop)} metres, saving ${r0(c.gpsSaving)} metres.`, ar: `نظام جيولوجي جي بي إس يقول يمكن الإيقاف عند ${r0(c.gpsStop)} متر.` } : { en: 'The target is still ahead or not reached yet: keep drilling.', ar: 'الهدف ما زال أمامنا: استمر في الحفر.' } }
  return { answer: { en: 'Ask me about the ground ahead, settings, the bit, speed, finish time, cost or the survey. Or say "log a bit change".', ar: 'اسألني عن الأرض القادمة أو الإعدادات أو الرأس أو السرعة أو وقت الانتهاء، أو قل سجّل تغيير الرأس.' } }
}
