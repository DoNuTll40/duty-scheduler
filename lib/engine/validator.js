import { dateOf, dayBaseMinutes, parseTime } from './timeSlots.js';
import { summarize } from './calculator.js';

export const HARD = new Set(['critical', 'conflict']);

/** Independent of the scheduler: validates any set of records (generated or hand-edited). */
export function validateSchedule({ records, posts, personnel, shiftTypes, slots, settings, startDate, days }) {
  const types = new Map(shiftTypes.map((t) => [t.id, t]));
  const postById = new Map(posts.map((p) => [p.id, p]));
  const personById = new Map(personnel.map((p) => [p.id, p]));
  const pName = (id) => personById.get(id)?.code ?? personById.get(id)?.name ?? String(id);
  const isDuty = (r) => !!types.get(r.shiftTypeId)?.countsAsDuty;
  const isRest = (r) => !!types.get(r.shiftTypeId)?.countsAsRest;
  const issues = [], shortages = [];
  const add = (severity, code, message, ref = {}) => issues.push({ severity, code, message, ref });

  // Missing references (deleted personnel/post/shift type)
  for (const r of records) {
    if (!personById.has(r.personnelId)) add('conflict', 'MISSING_PERSONNEL', `Unknown personnel ${r.personnelId}`, r);
    if (!postById.has(r.postId) && r.postId != null) add('conflict', 'MISSING_POST', `Unknown post ${r.postId}`, r);
    if (!types.has(r.shiftTypeId)) add('conflict', 'MISSING_SHIFT_TYPE', `Unknown shift type ${r.shiftTypeId}`, r);
  }

  // Coverage: only "on duty" counts. Withdrawal/rest never add coverage.
  const cnt = new Map();
  for (const r of records) if (isDuty(r)) { const k = `${r.dayIndex}|${r.postId}|${r.slotIndex}`; cnt.set(k, (cnt.get(k) ?? 0) + 1); }
  for (let d = 0; d < days; d++)
    for (const p of posts) {
      if (p.active === false || p.is24Hours === false) continue;
      const need = p.requiredPerSlot ?? 1;
      for (const s of slots) {
        const have = cnt.get(`${d}|${p.id}|${s.index}`) ?? 0;
        if (have < need) {
          const sh = { dayIndex: d, date: dateOf(startDate, d), postId: p.id, postName: p.name, slotIndex: s.index, slot: s.label, required: need, assigned: have, shortage: need - have };
          shortages.push(sh);
          add('critical', 'COVERAGE_SHORTAGE', `${p.name} ${s.label} (${sh.date}): SHORTAGE ${need - have}`, sh);
        }
      }
    }

  const work = records.filter((r) => !isRest(r));
  // Duplicate: same person, same instant, more than one record
  const seen = new Map();
  for (const r of work) { const k = `${r.personnelId}|${r.startMin}`; (seen.get(k) ?? seen.set(k, []).get(k)).push(r); }
  for (const rs of seen.values())
    if (rs.length > 1) add('conflict', 'DUPLICATE_ASSIGNMENT', `${pName(rs[0].personnelId)} assigned ${rs.length}× at the same time (${rs[0].date} slot ${rs[0].slotIndex})`, rs[0]);

  const byPerson = new Map();
  for (const r of work) (byPerson.get(r.personnelId) ?? byPerson.set(r.personnelId, []).get(r.personnelId)).push(r);
  for (const rs of byPerson.values()) rs.sort((a, b) => a.startMin - b.startMin);

  // Overlap (different start, intersecting intervals)
  for (const [id, rs] of byPerson)
    for (let i = 1; i < rs.length; i++)
      if (rs[i].startMin < rs[i - 1].endMin && rs[i].startMin !== rs[i - 1].startMin)
        add('conflict', 'OVERLAP', `${pName(id)} has overlapping shifts on ${rs[i].date}`, rs[i]);

  // Transport: start/end must sit on slot boundary
  const dur = slots[0]?.durationMinutes ?? 1, base = dayBaseMinutes(startDate, 0) + (parseTime(settings.startTime) ?? 0);
  const off = (x) => (((x - base) % dur) + dur) % dur;
  for (const r of records)
    if (off(r.startMin) || off(r.endMin) || r.slotIndex < 0 || r.slotIndex >= slots.length)
      add('conflict', 'TRANSPORT_BOUNDARY', `${pName(r.personnelId)}: shift is not aligned to a slot boundary`, r);

  // Duty blocks -> rest gaps, duty limits
  const minRest = (settings.minimumRestHours ?? 0) * 60;
  const dutyByDay = new Map(), dutyTotal = new Map();
  for (const [id, rs0] of byPerson) {
    const duty = rs0.filter(isDuty), blocks = [];
    for (const r of duty) {
      const last = blocks[blocks.length - 1];
      if (last && last.end === r.startMin) last.end = r.endMin; else blocks.push({ start: r.startMin, end: r.endMin, r });
      const k = `${id}|${r.dayIndex}`;
      dutyByDay.set(k, (dutyByDay.get(k) ?? 0) + r.endMin - r.startMin);
      dutyTotal.set(id, (dutyTotal.get(id) ?? 0) + r.endMin - r.startMin);
    }
    for (let i = 1; i < blocks.length; i++) {
      const gap = blocks[i].start - blocks[i - 1].end;
      if (gap < minRest)
        add('conflict', 'INSUFFICIENT_REST', `${pName(id)} rests ${gap / 60}h before ${blocks[i].r.date} (minimum ${minRest / 60}h)`, blocks[i].r);
    }
  }
  const maxDay = settings.maximumDutyHoursPerDay, maxPeriod = settings.maximumDutyHoursPerPeriod;
  if (maxDay != null)
    for (const [k, m] of dutyByDay) if (m > maxDay * 60) { const [id, d] = k.split('|'); add('conflict', 'MAX_DUTY_PER_DAY', `${pName(id)} duty ${m / 60}h on day ${+d + 1} (max ${maxDay}h)`, { personnelId: id, dayIndex: +d }); }
  if (maxPeriod != null)
    for (const [id, m] of dutyTotal) if (m > maxPeriod * 60) add('conflict', 'MAX_DUTY_PER_PERIOD', `${pName(id)} duty ${m / 60}h in period (max ${maxPeriod}h)`, { personnelId: id });

  // Night balance (warning, informational — within same group)
  const stats = summarize(records, { shiftTypes, settings });
  const thr = settings.nightWarningThresholdHours ?? 8, byG = {};
  for (const [id, s] of Object.entries(stats.byPersonnel)) (byG[s.groupId] ??= []).push({ id, n: s.nightHours });
  for (const rs of Object.values(byG)) {
    if (rs.length < 2) continue;
    const hi = rs.reduce((a, b) => (b.n > a.n ? b : a)), lo = rs.reduce((a, b) => (b.n < a.n ? b : a));
    if (hi.n - lo.n > thr) add('warning', 'NIGHT_IMBALANCE', `${pName(hi.id)} has ${hi.n - lo.n}h more night hours than ${pName(lo.id)}`, { personnelId: hi.id });
  }

  // Rotation (info)
  if (settings.rotationEnabled)
    for (const [id, rs] of byPerson) {
      const starts = rs.filter(isDuty).filter((r, i, a) => i === 0 || a[i - 1].endMin !== r.startMin);
      const set = new Set(starts.map((r) => r.slotIndex));
      if (starts.length >= 2 && set.size === 1) add('info', 'NO_ROTATION', `${pName(id)} always starts duty in the same slot (${starts.length} rounds)`, { personnelId: id });
    }

  const counts = { critical: 0, conflict: 0, warning: 0, info: 0 };
  for (const i of issues) counts[i.severity]++;
  return { issues, shortages, counts };
}
